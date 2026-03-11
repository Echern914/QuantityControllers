const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { triggerCheck } = require('../services/supply-monitor');

// ============================================================
// REORDER REQUESTS - Approval Workflow
// ============================================================

// GET /api/reorder/requests - List all reorder requests
router.get('/requests', (req, res) => {
  const db = getDb();
  const { status, urgency } = req.query;
  let sql = `
    SELECT rr.*, s.name as supplier_name, s.email as supplier_email, s.phone as supplier_phone,
           e_approve.first_name || ' ' || e_approve.last_name as approved_by_name,
           e_reject.first_name || ' ' || e_reject.last_name as rejected_by_name
    FROM reorder_requests rr
    LEFT JOIN suppliers s ON rr.supplier_id = s.id
    LEFT JOIN employees e_approve ON rr.approved_by = e_approve.id
    LEFT JOIN employees e_reject ON rr.rejected_by = e_reject.id
  `;
  const conditions = [];
  const params = [];

  if (status) { conditions.push('rr.status = ?'); params.push(status); }
  if (urgency) { conditions.push('rr.urgency = ?'); params.push(urgency); }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY CASE rr.urgency WHEN \'critical\' THEN 1 WHEN \'high\' THEN 2 WHEN \'medium\' THEN 3 ELSE 4 END, rr.created_at DESC';

  res.json(db.prepare(sql).all(...params));
});

// GET /api/reorder/requests/pending - Pending requests count & list (for dashboard)
router.get('/requests/pending', (req, res) => {
  const db = getDb();
  const requests = db.prepare(`
    SELECT rr.*, s.name as supplier_name
    FROM reorder_requests rr
    LEFT JOIN suppliers s ON rr.supplier_id = s.id
    WHERE rr.status = 'pending'
    ORDER BY CASE rr.urgency WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, rr.created_at DESC
  `).all();
  res.json({ count: requests.length, requests });
});

// GET /api/reorder/requests/:id - Single request detail
router.get('/requests/:id', (req, res) => {
  const db = getDb();
  const request = db.prepare(`
    SELECT rr.*, s.name as supplier_name, s.email as supplier_email, s.phone as supplier_phone, s.contact_name as supplier_contact,
           e_approve.first_name || ' ' || e_approve.last_name as approved_by_name,
           e_reject.first_name || ' ' || e_reject.last_name as rejected_by_name
    FROM reorder_requests rr
    LEFT JOIN suppliers s ON rr.supplier_id = s.id
    LEFT JOIN employees e_approve ON rr.approved_by = e_approve.id
    LEFT JOIN employees e_reject ON rr.rejected_by = e_reject.id
    WHERE rr.id = ?
  `).get(req.params.id);

  if (!request) return res.status(404).json({ error: 'Reorder request not found' });
  res.json(request);
});

// PATCH /api/reorder/requests/:id/approve - Owner approves a reorder
router.patch('/requests/:id/approve', (req, res) => {
  const { approved_by, quantity_override, auto_create_po } = req.body;
  const db = getDb();

  const request = db.prepare(`SELECT * FROM reorder_requests WHERE id = ?`).get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Reorder request not found' });
  if (request.status !== 'pending') return res.status(400).json({ error: `Request is already ${request.status}` });

  const finalQty = quantity_override || request.suggested_qty;
  const finalTotal = +(finalQty * request.unit_cost).toFixed(2);

  const result = db.transaction(() => {
    // Update the request
    db.prepare(`
      UPDATE reorder_requests
      SET status = 'approved', approved_by = ?, approved_at = datetime('now'),
          suggested_qty = ?, est_total = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(approved_by, finalQty, finalTotal, req.params.id);

    let poData = null;

    // Auto-create purchase order if requested and supplier exists
    if (auto_create_po !== false && request.supplier_id) {
      const orderNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
      const poResult = db.prepare(`
        INSERT INTO purchase_orders (supplier_id, order_number, ordered_by, total_cost, notes, ordered_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(request.supplier_id, orderNumber, approved_by, finalTotal, `Auto-generated from reorder request #${req.params.id}`);

      const poId = poResult.lastInsertRowid;
      db.prepare(`
        INSERT INTO purchase_order_items (purchase_order_id, ingredient_id, quantity_ordered, unit_cost, total_cost)
        VALUES (?, ?, ?, ?, ?)
      `).run(poId, request.ingredient_id, finalQty, request.unit_cost, finalTotal);

      // Link PO to reorder request
      db.prepare(`UPDATE reorder_requests SET purchase_order_id = ?, status = 'ordered' WHERE id = ?`).run(poId, req.params.id);

      poData = { id: Number(poId), order_number: orderNumber, total_cost: finalTotal };
    }

    // Create a notification that the order was approved
    db.prepare(`
      INSERT INTO alerts (type, severity, title, message, data)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'reorder_approved',
      'low',
      `Reorder Approved: ${request.ingredient_name}`,
      `${finalQty} ${request.unit} approved for reorder${poData ? '. PO ' + poData.order_number + ' created.' : '.'}`,
      JSON.stringify({ reorder_request_id: Number(req.params.id), ingredient_id: request.ingredient_id, purchase_order_id: poData?.id })
    );

    return poData;
  })();

  // Broadcast the approval
  if (req.app.locals.broadcast) {
    req.app.locals.broadcast({
      type: 'reorder_approved',
      request_id: Number(req.params.id),
      ingredient_name: request.ingredient_name,
      purchase_order: result
    });
  }

  res.json({
    success: true,
    message: `Reorder approved for ${request.ingredient_name}`,
    purchase_order: result
  });
});

// PATCH /api/reorder/requests/:id/reject - Owner rejects a reorder
router.patch('/requests/:id/reject', (req, res) => {
  const { rejected_by, reason } = req.body;
  const db = getDb();

  const request = db.prepare(`SELECT * FROM reorder_requests WHERE id = ?`).get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Reorder request not found' });
  if (request.status !== 'pending') return res.status(400).json({ error: `Request is already ${request.status}` });

  db.prepare(`
    UPDATE reorder_requests
    SET status = 'rejected', rejected_by = ?, rejected_at = datetime('now'),
        rejection_reason = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(rejected_by, reason || 'No reason provided', req.params.id);

  res.json({ success: true, message: `Reorder rejected for ${request.ingredient_name}` });
});

// PATCH /api/reorder/requests/:id/modify - Modify quantity before approving
router.patch('/requests/:id/modify', (req, res) => {
  const { suggested_qty, supplier_id } = req.body;
  const db = getDb();

  const request = db.prepare(`SELECT * FROM reorder_requests WHERE id = ?`).get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Reorder request not found' });
  if (request.status !== 'pending') return res.status(400).json({ error: `Request is already ${request.status}` });

  const sets = [];
  const params = [];
  if (suggested_qty !== undefined) {
    sets.push('suggested_qty = ?', 'est_total = ?');
    params.push(suggested_qty, +(suggested_qty * request.unit_cost).toFixed(2));
  }
  if (supplier_id !== undefined) {
    sets.push('supplier_id = ?');
    params.push(supplier_id);
  }
  sets.push("updated_at = datetime('now')");
  params.push(req.params.id);

  db.prepare(`UPDATE reorder_requests SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

// POST /api/reorder/bulk-approve - Approve multiple requests at once
router.post('/bulk-approve', (req, res) => {
  const { request_ids, approved_by } = req.body;
  const db = getDb();

  if (!request_ids || !request_ids.length) return res.status(400).json({ error: 'No request IDs provided' });

  const results = db.transaction(() => {
    const approved = [];
    const posBySupplier = {};

    for (const id of request_ids) {
      const request = db.prepare(`SELECT * FROM reorder_requests WHERE id = ? AND status = 'pending'`).get(id);
      if (!request) continue;

      db.prepare(`
        UPDATE reorder_requests SET status = 'approved', approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(approved_by, id);

      // Group by supplier for combined POs
      if (request.supplier_id) {
        if (!posBySupplier[request.supplier_id]) posBySupplier[request.supplier_id] = [];
        posBySupplier[request.supplier_id].push(request);
      }

      approved.push(id);
    }

    // Create one PO per supplier for approved items
    const purchaseOrders = [];
    for (const [supplierId, requests] of Object.entries(posBySupplier)) {
      const totalCost = requests.reduce((s, r) => s + r.est_total, 0);
      const orderNumber = `PO-${Date.now().toString(36).toUpperCase()}-${supplierId}`;

      const poResult = db.prepare(`
        INSERT INTO purchase_orders (supplier_id, order_number, ordered_by, total_cost, notes, ordered_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(parseInt(supplierId), orderNumber, approved_by, totalCost, `Bulk reorder - ${requests.length} items`);

      const poId = poResult.lastInsertRowid;
      const insertItem = db.prepare(`
        INSERT INTO purchase_order_items (purchase_order_id, ingredient_id, quantity_ordered, unit_cost, total_cost)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const req of requests) {
        insertItem.run(poId, req.ingredient_id, req.suggested_qty, req.unit_cost, req.est_total);
        db.prepare(`UPDATE reorder_requests SET purchase_order_id = ?, status = 'ordered' WHERE id = ?`).run(poId, req.id);
      }

      purchaseOrders.push({ id: Number(poId), order_number: orderNumber, total_cost: totalCost, item_count: requests.length });
    }

    return { approved, purchaseOrders };
  })();

  if (req.app.locals.broadcast) {
    req.app.locals.broadcast({ type: 'reorder_bulk_approved', count: results.approved.length });
  }

  res.json({
    success: true,
    approved_count: results.approved.length,
    purchase_orders: results.purchaseOrders
  });
});

// POST /api/reorder/check - Manually trigger a supply check
router.post('/check', (req, res) => {
  const result = triggerCheck();
  res.json(result);
});

// ============================================================
// NOTIFICATION PREFERENCES
// ============================================================

// GET /api/reorder/preferences/:employeeId
router.get('/preferences/:employeeId', (req, res) => {
  const db = getDb();
  let prefs = db.prepare(`SELECT * FROM notification_preferences WHERE employee_id = ?`).get(req.params.employeeId);

  if (!prefs) {
    // Return defaults
    prefs = {
      employee_id: parseInt(req.params.employeeId),
      notify_low_stock: 1,
      notify_out_of_stock: 1,
      notify_reorder_ready: 1,
      notify_expiring: 0,
      email: '',
      phone: '',
      email_enabled: 0,
      sms_enabled: 0,
      push_enabled: 1,
      low_stock_threshold: 0.20
    };
  }
  res.json(prefs);
});

// PUT /api/reorder/preferences/:employeeId
router.put('/preferences/:employeeId', (req, res) => {
  const {
    notify_low_stock, notify_out_of_stock, notify_reorder_ready, notify_expiring,
    email, phone, email_enabled, sms_enabled, push_enabled, low_stock_threshold
  } = req.body;
  const db = getDb();
  const employeeId = parseInt(req.params.employeeId);

  const existing = db.prepare(`SELECT id FROM notification_preferences WHERE employee_id = ?`).get(employeeId);

  if (existing) {
    db.prepare(`
      UPDATE notification_preferences SET
        notify_low_stock = ?, notify_out_of_stock = ?, notify_reorder_ready = ?, notify_expiring = ?,
        email = ?, phone = ?, email_enabled = ?, sms_enabled = ?, push_enabled = ?,
        low_stock_threshold = ?, updated_at = datetime('now')
      WHERE employee_id = ?
    `).run(
      notify_low_stock ?? 1, notify_out_of_stock ?? 1, notify_reorder_ready ?? 1, notify_expiring ?? 0,
      email || '', phone || '', email_enabled ?? 0, sms_enabled ?? 0, push_enabled ?? 1,
      low_stock_threshold ?? 0.20, employeeId
    );
  } else {
    db.prepare(`
      INSERT INTO notification_preferences (employee_id, notify_low_stock, notify_out_of_stock, notify_reorder_ready, notify_expiring, email, phone, email_enabled, sms_enabled, push_enabled, low_stock_threshold)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      employeeId,
      notify_low_stock ?? 1, notify_out_of_stock ?? 1, notify_reorder_ready ?? 1, notify_expiring ?? 0,
      email || '', phone || '', email_enabled ?? 0, sms_enabled ?? 0, push_enabled ?? 1,
      low_stock_threshold ?? 0.20
    );
  }

  res.json({ success: true });
});

// GET /api/reorder/dashboard - Supply alerts dashboard summary
router.get('/dashboard', (req, res) => {
  const db = getDb();

  const pending = db.prepare(`SELECT COUNT(*) as count FROM reorder_requests WHERE status = 'pending'`).get();
  const approved = db.prepare(`SELECT COUNT(*) as count FROM reorder_requests WHERE status = 'approved'`).get();
  const ordered = db.prepare(`SELECT COUNT(*) as count FROM reorder_requests WHERE status = 'ordered'`).get();
  const critical = db.prepare(`SELECT COUNT(*) as count FROM reorder_requests WHERE status = 'pending' AND urgency = 'critical'`).get();

  const recentRequests = db.prepare(`
    SELECT rr.*, s.name as supplier_name
    FROM reorder_requests rr
    LEFT JOIN suppliers s ON rr.supplier_id = s.id
    WHERE rr.status = 'pending'
    ORDER BY CASE rr.urgency WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
    LIMIT 10
  `).all();

  const totalEstCost = db.prepare(`
    SELECT COALESCE(SUM(est_total), 0) as total FROM reorder_requests WHERE status = 'pending'
  `).get();

  res.json({
    pending_count: pending.count,
    approved_count: approved.count,
    ordered_count: ordered.count,
    critical_count: critical.count,
    pending_est_cost: totalEstCost.total,
    recent_requests: recentRequests
  });
});

module.exports = router;
