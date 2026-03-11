const { getDb } = require('../db/database');

/**
 * Supply Monitor Service
 * Periodically scans inventory levels and auto-generates reorder requests
 * when items fall below par level or are running critically low.
 * Sends notifications to admins/owners via in-app alerts, email, and SMS.
 */

let broadcastFn = null;
let monitorInterval = null;

function setBroadcast(fn) {
  broadcastFn = fn;
}

function startMonitor(intervalMinutes = 15) {
  // Don't run immediately on startup - only on interval or manual trigger
  // This prevents creating fake alerts against demo data that may be in the DB
  monitorInterval = setInterval(() => runCheck(), intervalMinutes * 60 * 1000);
  console.log(`[Supply Monitor] Started - checking every ${intervalMinutes} minutes`);
}

function stopMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

function runCheck() {
  try {
    const db = getDb();
    checkLowStock(db);
    checkExpiringItems(db);
  } catch (err) {
    console.error('[Supply Monitor] Error during check:', err.message);
  }
}

function checkLowStock(db) {
  // Get all active ingredients with par levels, their current stock, and supplier info
  const items = db.prepare(`
    SELECT i.id, i.name, i.unit, i.cost_per_unit, i.par_level, i.reorder_quantity,
           i.supplier_id, s.name as supplier_name, s.email as supplier_email,
           COALESCE(SUM(CASE WHEN inv.status != 'empty' THEN inv.quantity ELSE 0 END), 0) as current_stock,
           COALESCE(SUM(inv.full_quantity), 0) as total_capacity
    FROM ingredients i
    LEFT JOIN suppliers s ON i.supplier_id = s.id
    LEFT JOIN inventory inv ON i.id = inv.ingredient_id
    WHERE i.active = 1
    GROUP BY i.id
  `).all();

  // Calculate average daily usage for each ingredient (last 30 days)
  const usageData = db.prepare(`
    SELECT ingredient_id, AVG(daily_total) as avg_daily
    FROM (
      SELECT ingredient_id, date(created_at) as day, SUM(quantity) as daily_total
      FROM transactions WHERE type = 'sale' AND created_at >= datetime('now', '-30 days')
      GROUP BY ingredient_id, day
    ) GROUP BY ingredient_id
  `).all();

  const usageMap = {};
  for (const u of usageData) {
    usageMap[u.ingredient_id] = u.avg_daily;
  }

  for (const item of items) {
    const avgDaily = usageMap[item.id] || 0;
    const daysLeft = avgDaily > 0 ? Math.floor(item.current_stock / avgDaily) : 999;
    const stockPercent = item.total_capacity > 0 ? item.current_stock / item.total_capacity : 1;
    const belowPar = item.par_level > 0 && item.current_stock < item.par_level;

    // Determine if we need to create a reorder request
    let urgency = null;
    let reason = null;

    if (item.current_stock <= 0 && item.total_capacity > 0) {
      urgency = 'critical';
      reason = `${item.name} is completely out of stock!`;
    } else if (daysLeft <= 1 && avgDaily > 0) {
      urgency = 'critical';
      reason = `${item.name} has less than 1 day of stock remaining`;
    } else if (daysLeft <= 3 && avgDaily > 0) {
      urgency = 'high';
      reason = `${item.name} has only ${daysLeft} day(s) of stock left`;
    } else if (belowPar) {
      urgency = 'medium';
      reason = `${item.name} is below par level (${item.current_stock.toFixed(1)}/${item.par_level} ${item.unit})`;
    } else if (stockPercent < 0.20 && item.total_capacity > 0) {
      urgency = 'low';
      reason = `${item.name} is at ${(stockPercent * 100).toFixed(0)}% capacity`;
    }

    if (!urgency) continue;

    // Check if there's already a pending reorder request for this ingredient
    const existingRequest = db.prepare(`
      SELECT id FROM reorder_requests
      WHERE ingredient_id = ? AND status IN ('pending', 'approved')
    `).get(item.id);

    if (existingRequest) continue;

    // Calculate suggested order quantity
    const suggestedQty = item.reorder_quantity > 0
      ? item.reorder_quantity
      : avgDaily > 0
        ? Math.ceil(avgDaily * 7) // 1 week supply
        : item.par_level > 0
          ? Math.ceil(item.par_level - item.current_stock)
          : 1;

    const estTotal = +(suggestedQty * item.cost_per_unit).toFixed(2);

    // Create the reorder request
    const result = db.prepare(`
      INSERT INTO reorder_requests (ingredient_id, supplier_id, ingredient_name, current_stock, par_level, suggested_qty, unit, unit_cost, est_total, urgency, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(item.id, item.supplier_id, item.name, item.current_stock, item.par_level, suggestedQty, item.unit, item.cost_per_unit, estTotal, urgency, reason);

    // Create an in-app alert
    const alertTitle = urgency === 'critical'
      ? `RESTOCK URGENT: ${item.name}`
      : `Restock Needed: ${item.name}`;

    const alertMessage = `${reason}. Suggested order: ${suggestedQty} ${item.unit}${item.supplier_name ? ' from ' + item.supplier_name : ''} (~$${estTotal.toFixed(2)}). Awaiting owner approval.`;

    db.prepare(`
      INSERT INTO alerts (type, severity, title, message, data)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'reorder_request',
      urgency === 'critical' ? 'critical' : urgency === 'high' ? 'high' : 'medium',
      alertTitle,
      alertMessage,
      JSON.stringify({
        reorder_request_id: Number(result.lastInsertRowid),
        ingredient_id: item.id,
        ingredient_name: item.name,
        current_stock: item.current_stock,
        suggested_qty: suggestedQty,
        supplier_name: item.supplier_name || null,
        urgency
      })
    );

    // Update the reorder request to mark notification as sent
    db.prepare(`UPDATE reorder_requests SET notification_sent = 1 WHERE id = ?`).run(result.lastInsertRowid);

    // Broadcast via SSE so admins get real-time notification
    if (broadcastFn) {
      broadcastFn({
        type: 'notification',
        notification: {
          id: Number(result.lastInsertRowid),
          type: 'reorder_request',
          severity: urgency === 'critical' ? 'critical' : urgency === 'high' ? 'high' : 'medium',
          title: alertTitle,
          message: alertMessage
        }
      });

      broadcastFn({
        type: 'reorder_request',
        request: {
          id: Number(result.lastInsertRowid),
          ingredient_name: item.name,
          urgency,
          suggested_qty: suggestedQty,
          unit: item.unit,
          supplier_name: item.supplier_name
        }
      });
    }

    // Send email/SMS notifications to admins with preferences
    sendExternalNotifications(db, item, suggestedQty, urgency, reason, estTotal);

    console.log(`[Supply Monitor] Reorder request created: ${item.name} (${urgency})`);
  }
}

function checkExpiringItems(db) {
  // Check for items expiring within 3 days that haven't been alerted yet
  const expiring = db.prepare(`
    SELECT inv.id, inv.quantity, inv.expiration_date, inv.location,
           i.name as ingredient_name, i.unit,
           CAST(julianday(inv.expiration_date) - julianday('now') AS INTEGER) as days_until_expiry
    FROM inventory inv
    JOIN ingredients i ON inv.ingredient_id = i.id
    WHERE inv.expiration_date IS NOT NULL
      AND inv.status != 'empty'
      AND date(inv.expiration_date) <= date('now', '+3 days')
      AND date(inv.expiration_date) >= date('now')
  `).all();

  for (const item of expiring) {
    // Check if we already alerted about this specific inventory item
    const existing = db.prepare(`
      SELECT id FROM alerts
      WHERE type = 'expiring_stock' AND data LIKE ? AND acknowledged = 0
    `).get(`%"inventory_id":${item.id}%`);

    if (existing) continue;

    const title = item.days_until_expiry <= 0
      ? `EXPIRED: ${item.ingredient_name}`
      : `Expiring Soon: ${item.ingredient_name}`;

    const message = item.days_until_expiry <= 0
      ? `${item.quantity} ${item.unit} at ${item.location} has expired!`
      : `${item.quantity} ${item.unit} at ${item.location} expires in ${item.days_until_expiry} day(s)`;

    db.prepare(`
      INSERT INTO alerts (type, severity, title, message, data)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'expiring_stock',
      item.days_until_expiry <= 0 ? 'critical' : 'high',
      title,
      message,
      JSON.stringify({ inventory_id: item.id, ingredient_name: item.ingredient_name, days_until_expiry: item.days_until_expiry })
    );

    if (broadcastFn) {
      broadcastFn({
        type: 'notification',
        notification: {
          type: 'expiring_stock',
          severity: item.days_until_expiry <= 0 ? 'critical' : 'high',
          title,
          message
        }
      });
    }
  }
}

function sendExternalNotifications(db, item, suggestedQty, urgency, reason, estTotal) {
  // Get all admin/manager notification preferences
  const prefs = db.prepare(`
    SELECT np.*, e.first_name, e.last_name, e.role
    FROM notification_preferences np
    JOIN employees e ON np.employee_id = e.id
    WHERE e.role IN ('admin', 'manager') AND e.active = 1
      AND np.notify_low_stock = 1
  `).all();

  for (const pref of prefs) {
    // Email notification
    if (pref.email_enabled && pref.email) {
      sendEmailNotification(pref.email, pref.first_name, item, suggestedQty, urgency, reason, estTotal);
    }

    // SMS notification
    if (pref.sms_enabled && pref.phone) {
      sendSmsNotification(pref.phone, item, suggestedQty, urgency);
    }
  }
}

function sendEmailNotification(email, firstName, item, suggestedQty, urgency, reason, estTotal) {
  // In production, integrate with SendGrid, Mailgun, AWS SES, etc.
  // For now, log the email that would be sent and store it for the UI to show
  const emailBody = {
    to: email,
    subject: `[VenueCore] ${urgency === 'critical' ? 'URGENT ' : ''}Restock Alert: ${item.name}`,
    body: `Hi ${firstName},\n\n${reason}\n\nSuggested reorder: ${suggestedQty} ${item.unit}${item.supplier_name ? ' from ' + item.supplier_name : ''}\nEstimated cost: $${estTotal.toFixed(2)}\n\nPlease log in to VenueCore to approve or modify this reorder request.\n\n- VenueCore Supply Monitor`
  };

  console.log(`[Supply Monitor] Email queued -> ${email}: ${emailBody.subject}`);
  // TODO: Replace with actual email service integration
  // Example with nodemailer:
  // const transporter = nodemailer.createTransport({ ... });
  // transporter.sendMail(emailBody);
}

function sendSmsNotification(phone, item, suggestedQty, urgency) {
  // In production, integrate with Twilio, AWS SNS, etc.
  const smsBody = `[VenueCore] ${urgency === 'critical' ? 'URGENT: ' : ''}${item.name} needs restock. Current: ${item.current_stock.toFixed(1)} ${item.unit}. Order ${suggestedQty} ${item.unit}. Log in to approve.`;

  console.log(`[Supply Monitor] SMS queued -> ${phone}: ${smsBody}`);
  // TODO: Replace with actual SMS service integration
  // Example with Twilio:
  // twilioClient.messages.create({ to: phone, from: TWILIO_NUMBER, body: smsBody });
}

// Manual trigger for on-demand check
function triggerCheck() {
  runCheck();
  return { success: true, message: 'Supply check completed' };
}

module.exports = { startMonitor, stopMonitor, setBroadcast, triggerCheck, runCheck };
