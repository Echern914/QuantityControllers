const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { paginate } = require('../middleware/response');
const { deductForOrder } = require('../services/deduction');

// All routes require authentication
router.use(authenticate);
function getNextOrderNumber() {
  const db = getDb();
  const setting = db.prepare(`SELECT value FROM settings WHERE key = 'next_order_number'`).get();
  const prefix = db.prepare(`SELECT value FROM settings WHERE key = 'order_number_prefix'`).get();
  const num = parseInt(setting?.value || '1001');
  db.prepare(`UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'next_order_number'`).run((num + 1).toString());
  return `${prefix?.value || 'NX'}${num}`;
}

function recalcOrder(orderId) {
  const db = getDb();
  const taxRate = parseFloat(db.prepare(`SELECT value FROM settings WHERE key = 'tax_rate'`).get()?.value || '0.08');
  const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ? AND voided = 0`).all(orderId);

  let subtotal = 0;
  for (const item of items) {
    const mods = JSON.parse(item.modifiers || '[]');
    const modTotal = mods.reduce((s, m) => s + (m.price_adjustment || 0), 0);
    subtotal += (item.unit_price + modTotal) * item.quantity;
  }

  const order = db.prepare(`SELECT discount FROM orders WHERE id = ?`).get(orderId);
  const discount = order?.discount || 0;
  const taxable = Math.max(0, subtotal - discount);
  const tax = +(taxable * taxRate).toFixed(2);
  const total = +(taxable + tax).toFixed(2);
  subtotal = +subtotal.toFixed(2);

  db.prepare(`UPDATE orders SET subtotal = ?, tax = ?, total = ? WHERE id = ?`).run(subtotal, tax, total, orderId);
  return { subtotal, tax, total, discount };
}

// POST /api/pos/orders - create new order
router.post('/orders', (req, res) => {
  const { order_type, table_id, employee_id, customer_id, guest_count, notes } = req.body;
  const db = getDb();
  const orderNumber = getNextOrderNumber();

  const result = db.prepare(`
    INSERT INTO orders (order_number, order_type, table_id, employee_id, customer_id, guest_count, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(orderNumber, order_type || 'dine-in', table_id, employee_id, customer_id, guest_count || 1, notes);

  if (table_id) {
    db.prepare(`UPDATE tables SET status = 'occupied', current_order_id = ? WHERE id = ?`).run(result.lastInsertRowid, table_id);
  }

  const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(result.lastInsertRowid);
  req.app.locals.broadcast({ type: 'order_created', order });
  res.json(order);
});

// GET /api/pos/orders
router.get('/orders', (req, res) => {
  const db = getDb();
  const { status, table_id, employee_id, date } = req.query;
  let sql = `SELECT o.*, e.first_name || ' ' || e.last_name as server_name, t.name as table_name
             FROM orders o
             LEFT JOIN employees e ON o.employee_id = e.id
             LEFT JOIN tables t ON o.table_id = t.id`;
  const conditions = [];
  const params = [];

  if (status) { conditions.push('o.status = ?'); params.push(status); }
  if (table_id) { conditions.push('o.table_id = ?'); params.push(table_id); }
  if (employee_id) { conditions.push('o.employee_id = ?'); params.push(employee_id); }
  if (date) { conditions.push("date(o.opened_at) = ?"); params.push(date); }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY o.opened_at DESC';

  res.json(paginate(db, sql, params, req.query, { defaultLimit: 200 }));
});

// GET /api/pos/orders/:id
router.get('/orders/:id', (req, res) => {
  const db = getDb();
  const order = db.prepare(`
    SELECT o.*, e.first_name || ' ' || e.last_name as server_name, t.name as table_name,
           c.first_name || ' ' || c.last_name as customer_name
    FROM orders o
    LEFT JOIN employees e ON o.employee_id = e.id
    LEFT JOIN tables t ON o.table_id = t.id
    LEFT JOIN customers c ON o.customer_id = c.id
    WHERE o.id = ?
  `).get(req.params.id);

  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.items = db.prepare(`
    SELECT oi.*, mi.station, mi.course as default_course
    FROM order_items oi
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    WHERE oi.order_id = ?
    ORDER BY oi.created_at
  `).all(req.params.id);

  order.payments = db.prepare(`SELECT * FROM order_payments WHERE order_id = ?`).all(req.params.id);

  res.json(order);
});

// POST /api/pos/orders/:id/items - add items to order
router.post('/orders/:id/items', (req, res) => {
  const { items } = req.body; // Array of { menu_item_id, quantity, modifiers, special_instructions, seat_number, course }
  const db = getDb();

  const order = db.prepare(`SELECT status, payment_status FROM orders WHERE id = ?`).get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'voided') return res.status(400).json({ error: 'Cannot add items to a voided order' });
  if (order.status === 'closed' || order.payment_status === 'paid') {
    return res.status(400).json({ error: 'Cannot add items to a closed/paid order' });
  }

  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, menu_item_id, name, quantity, unit_price, modifiers, special_instructions, seat_number, course)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const addedItems = [];
  for (const item of items) {
    const menuItem = db.prepare(`SELECT * FROM menu_items WHERE id = ?`).get(item.menu_item_id);
    if (!menuItem) continue;
    if (menuItem.is_86d) {
      addedItems.push({ error: `${menuItem.name} is 86'd`, menu_item_id: item.menu_item_id });
      continue;
    }

    const result = insertItem.run(
      req.params.id, item.menu_item_id, menuItem.name, item.quantity || 1,
      menuItem.price, JSON.stringify(item.modifiers || []),
      item.special_instructions, item.seat_number || 1, item.course || menuItem.course
    );
    addedItems.push({ id: result.lastInsertRowid, name: menuItem.name, price: menuItem.price });
  }

  const totals = recalcOrder(parseInt(req.params.id));
  res.json({ items: addedItems, ...totals });
});

// PATCH /api/pos/orders/:id/items/:itemId
router.patch('/orders/:id/items/:itemId', (req, res) => {
  const { quantity, modifiers, special_instructions, voided, void_reason } = req.body;
  const db = getDb();
  const sets = [];
  const params = [];

  if (quantity !== undefined) { sets.push('quantity = ?'); params.push(quantity); }
  if (modifiers !== undefined) { sets.push('modifiers = ?'); params.push(JSON.stringify(modifiers)); }
  if (special_instructions !== undefined) { sets.push('special_instructions = ?'); params.push(special_instructions); }
  if (voided !== undefined) { sets.push('voided = ?'); params.push(voided ? 1 : 0); }
  if (void_reason) { sets.push('void_reason = ?'); params.push(void_reason); }

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

  params.push(req.params.itemId, req.params.id);
  db.prepare(`UPDATE order_items SET ${sets.join(', ')} WHERE id = ? AND order_id = ?`).run(...params);

  const totals = recalcOrder(parseInt(req.params.id));
  res.json({ success: true, ...totals });
});

// POST /api/pos/orders/:id/send - send to kitchen
router.post('/orders/:id/send', (req, res) => {
  const db = getDb();
  const orderId = parseInt(req.params.id);
  const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Get unsent items
  const items = db.prepare(`SELECT oi.*, mi.station, mi.prep_time_minutes FROM order_items oi JOIN menu_items mi ON oi.menu_item_id = mi.id WHERE oi.order_id = ? AND oi.status = 'pending' AND oi.voided = 0`).all(orderId);

  if (items.length === 0) return res.json({ success: true, message: 'No items to send' });

  // Atomic: mark sent + kitchen queue + inventory deduction
  const deductionResults = db.transaction(() => {
    const updateItem = db.prepare(`UPDATE order_items SET status = 'sent', sent_to_kitchen_at = datetime('now') WHERE id = ?`);
    const insertQueue = db.prepare(`INSERT INTO kitchen_queue (order_id, order_item_id, station, estimated_prep_minutes) VALUES (?, ?, ?, ?)`);

    for (const item of items) {
      updateItem.run(item.id);
      insertQueue.run(orderId, item.id, item.station || 'kitchen', item.prep_time_minutes || 5);
    }

    const results = deductForOrder(orderId, items, order.employee_id);
    db.prepare(`UPDATE orders SET status = 'sent' WHERE id = ? AND status = 'open'`).run(orderId);
    return results;
  })();

  // Broadcast to KDS
  req.app.locals.broadcast({ type: 'kitchen_order', orderId, orderNumber: order.order_number, items: items.map(i => ({ name: i.name, qty: i.quantity, station: i.station })) });

  res.json({ sent: items.length, deductions: deductionResults });
});

// POST /api/pos/orders/:id/pay
router.post('/orders/:id/pay', (req, res) => {
  const { payments } = req.body; // Array of { method, amount, tip, card_last_four }
  if (!payments || !Array.isArray(payments) || payments.length === 0) {
    return res.status(400).json({ error: 'payments array required' });
  }
  const db = getDb();
  const orderId = parseInt(req.params.id);
  const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'voided') return res.status(400).json({ error: 'Cannot pay a voided order' });
  if (order.payment_status === 'paid') return res.status(400).json({ error: 'Order already fully paid' });

  // Validate payment amounts
  for (const p of payments) {
    if (!p.method || typeof p.amount !== 'number' || p.amount <= 0) {
      return res.status(400).json({ error: 'Each payment needs a method and positive amount' });
    }
  }

  // Atomic payment processing in a transaction
  const result = db.transaction(() => {
    const insertPayment = db.prepare(`
      INSERT INTO order_payments (order_id, payment_method, amount, tip, card_last_four, employee_id) VALUES (?, ?, ?, ?, ?, ?)
    `);

    let totalTip = 0;
    for (const p of payments) {
      insertPayment.run(orderId, p.method, p.amount, Math.max(0, p.tip || 0), p.card_last_four, order.employee_id);
      totalTip += Math.max(0, p.tip || 0);
    }

    const totalPaidRow = db.prepare(`SELECT COALESCE(SUM(amount), 0) as paid FROM order_payments WHERE order_id = ?`).get(orderId);
    const paymentStatus = totalPaidRow.paid >= order.total ? 'paid' : 'partial';

    db.prepare(`UPDATE orders SET payment_status = ?, tip = tip + ?, status = ?, closed_at = CASE WHEN ? = 'paid' THEN datetime('now') ELSE closed_at END WHERE id = ?`)
      .run(paymentStatus, totalTip, paymentStatus === 'paid' ? 'closed' : order.status, paymentStatus, orderId);

    if (paymentStatus === 'paid' && order.table_id) {
      db.prepare(`UPDATE tables SET status = 'dirty', current_order_id = NULL WHERE id = ?`).run(order.table_id);
    }

    if (order.customer_id && paymentStatus === 'paid') {
      const loyaltyRate = parseInt(db.prepare(`SELECT value FROM settings WHERE key = 'loyalty_points_per_dollar'`).get()?.value || '1');
      const points = Math.floor(order.total * loyaltyRate);
      db.prepare(`UPDATE customers SET total_visits = total_visits + 1, total_spent = total_spent + ?, loyalty_points = loyalty_points + ?, last_visit_at = datetime('now') WHERE id = ?`)
        .run(order.total, points, order.customer_id);
    }

    return { payment_status: paymentStatus, total_paid: totalPaidRow.paid, remaining: Math.max(0, +(order.total - totalPaidRow.paid).toFixed(2)) };
  })();

  req.app.locals.broadcast({ type: 'order_paid', orderId, orderNumber: order.order_number });
  res.json(result);
});

// POST /api/pos/orders/:id/split
router.post('/orders/:id/split', (req, res) => {
  const { split_type, splits } = req.body; // split_type: 'even', 'by_seat', 'by_item', 'custom'
  const db = getDb();
  const orderId = parseInt(req.params.id);
  const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (split_type === 'even') {
    const numWays = splits || 2;
    const splitAmount = +(order.total / numWays).toFixed(2);
    const splitChecks = [];
    for (let i = 0; i < numWays; i++) {
      splitChecks.push({ checkNumber: i + 1, amount: i === numWays - 1 ? +(order.total - splitAmount * (numWays - 1)).toFixed(2) : splitAmount });
    }
    return res.json({ split_type: 'even', checks: splitChecks, orderId });
  }

  if (split_type === 'by_seat') {
    const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ? AND voided = 0`).all(orderId);
    const seats = {};
    for (const item of items) {
      const seat = item.seat_number || 1;
      if (!seats[seat]) seats[seat] = { seat, items: [], subtotal: 0 };
      seats[seat].items.push(item);
      seats[seat].subtotal += item.unit_price * item.quantity;
    }
    const taxRate = parseFloat(db.prepare(`SELECT value FROM settings WHERE key = 'tax_rate'`).get()?.value || '0.08');
    const checks = Object.values(seats).map(s => ({
      seat: s.seat,
      items: s.items,
      subtotal: +s.subtotal.toFixed(2),
      tax: +(s.subtotal * taxRate).toFixed(2),
      total: +(s.subtotal * (1 + taxRate)).toFixed(2),
    }));
    return res.json({ split_type: 'by_seat', checks });
  }

  res.json({ split_type, message: 'Split calculated' });
});

// POST /api/pos/orders/:id/void
router.post('/orders/:id/void', (req, res) => {
  const { reason } = req.body;
  const db = getDb();
  const order = db.prepare(`SELECT id, status, table_id, payment_status FROM orders WHERE id = ?`).get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'voided') return res.json({ success: true, already_voided: true });
  if (order.payment_status === 'paid') return res.status(400).json({ error: 'Cannot void a paid order — use refund instead' });

  db.transaction(() => {
    db.prepare(`UPDATE orders SET status = 'voided', notes = COALESCE(notes, '') || ' [VOIDED: ' || ? || ']' WHERE id = ?`).run(reason || 'No reason', order.id);
    db.prepare(`UPDATE order_items SET voided = 1, void_reason = ? WHERE order_id = ? AND voided = 0`).run(reason, order.id);
    if (order.table_id) {
      db.prepare(`UPDATE tables SET status = 'open', current_order_id = NULL WHERE id = ?`).run(order.table_id);
    }
  })();

  res.json({ success: true });
});

// POST /api/pos/orders/:id/discount
router.post('/orders/:id/discount', (req, res) => {
  const { discount_type, discount_value, reason } = req.body;
  const db = getDb();
  const order = db.prepare(`SELECT subtotal FROM orders WHERE id = ?`).get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (typeof discount_value !== 'number' || discount_value < 0) {
    return res.status(400).json({ error: 'discount_value must be a non-negative number' });
  }
  let discount = 0;
  if (discount_type === 'percent') {
    if (discount_value > 100) return res.status(400).json({ error: 'Percent discount cannot exceed 100' });
    discount = +(order.subtotal * discount_value / 100).toFixed(2);
  } else {
    discount = Math.min(+discount_value.toFixed(2), order.subtotal);
  }

  db.prepare(`UPDATE orders SET discount = ?, discount_reason = ? WHERE id = ?`).run(discount, reason, req.params.id);
  const totals = recalcOrder(parseInt(req.params.id));
  res.json({ ...totals, discount });
});

// TABS
router.get('/tabs', (req, res) => {
  const db = getDb();
  const tabs = db.prepare(`
    SELECT t.*, e.first_name || ' ' || e.last_name as server_name,
           c.first_name || ' ' || c.last_name as customer_name
    FROM tabs t
    LEFT JOIN employees e ON t.employee_id = e.id
    LEFT JOIN customers c ON t.customer_id = c.id
    WHERE t.status = 'open'
    ORDER BY t.opened_at DESC
  `).all();

  for (const tab of tabs) {
    tab.orders = db.prepare(`SELECT id, order_number, subtotal, total, status FROM orders WHERE tab_id = ?`).all(tab.id);
    tab.total = tab.orders.reduce((s, o) => s + (o.total || 0), 0);
  }
  res.json(tabs);
});

router.post('/tabs', (req, res) => {
  const { name, customer_id, employee_id, card_last_four } = req.body;
  const db = getDb();
  const result = db.prepare(`INSERT INTO tabs (name, customer_id, employee_id, card_last_four) VALUES (?, ?, ?, ?)`).run(name, customer_id, employee_id, card_last_four);
  res.json({ success: true, id: result.lastInsertRowid, name, status: 'open' });
});

router.post('/tabs/:id/close', (req, res) => {
  const db = getDb();
  const { payments } = req.body;
  const tab = db.prepare(`SELECT * FROM tabs WHERE id = ?`).get(req.params.id);
  if (!tab) return res.status(404).json({ error: 'Tab not found' });

  // Close all open orders on this tab
  const orders = db.prepare(`SELECT * FROM orders WHERE tab_id = ? AND status != 'closed' AND status != 'voided'`).all(tab.id);
  for (const order of orders) {
    db.prepare(`UPDATE orders SET status = 'closed', payment_status = 'paid', closed_at = datetime('now') WHERE id = ?`).run(order.id);
  }

  db.prepare(`UPDATE tabs SET status = 'closed', closed_at = datetime('now') WHERE id = ?`).run(tab.id);
  res.json({ success: true });
});

module.exports = router;
