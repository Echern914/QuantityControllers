const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// GET /api/tables/floor-plan
router.get('/floor-plan', (req, res) => {
  try {
    const db = getDb();
    const tables = db.prepare(`
      SELECT t.*, e.first_name || ' ' || e.last_name as server_name, e.color as server_color,
             o.order_number, o.total as order_total, o.opened_at as order_opened_at,
             o.guest_count
      FROM tables t
      LEFT JOIN employees e ON t.server_id = e.id
      LEFT JOIN orders o ON t.current_order_id = o.id
      ORDER BY t.section, t.name
    `).all();

    // Add time occupied
    for (const table of tables) {
      if (table.order_opened_at) {
        const mins = Math.round((Date.now() - new Date(table.order_opened_at).getTime()) / 60000);
        table.minutes_occupied = mins;
      }
    }

    res.json(tables);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tables
router.get('/', (req, res) => {
  try {
    const db = getDb();
    res.json(db.prepare(`SELECT * FROM tables ORDER BY section, name`).all());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tables
router.post('/', (req, res) => {
  try {
    const { name, section, capacity, shape, pos_x, pos_y, width, height } = req.body;
    const db = getDb();
    const result = db.prepare(`INSERT INTO tables (name, section, capacity, shape, pos_x, pos_y, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(name, section || 'main', capacity || 4, shape || 'rect', pos_x || 0, pos_y || 0, width || 80, height || 80);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tables/:id
router.put('/:id', (req, res) => {
  try {
    const { name, section, capacity, shape, pos_x, pos_y, width, height } = req.body;
    const db = getDb();
    db.prepare(`UPDATE tables SET name=?, section=?, capacity=?, shape=?, pos_x=?, pos_y=?, width=?, height=? WHERE id=?`)
      .run(name, section, capacity, shape, pos_x, pos_y, width, height, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tables/:id/status
router.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const db = getDb();
    db.prepare(`UPDATE tables SET status = ? WHERE id = ?`).run(status, req.params.id);
    if (status === 'open') {
      db.prepare(`UPDATE tables SET current_order_id = NULL, server_id = NULL WHERE id = ?`).run(req.params.id);
    }
    req.app.locals.broadcast({ type: 'table_status', tableId: req.params.id, status });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tables/:id/assign
router.patch('/:id/assign', (req, res) => {
  try {
    const { server_id } = req.body;
    const db = getDb();
    db.prepare(`UPDATE tables SET server_id = ? WHERE id = ?`).run(server_id, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tables/:id/seat
router.post('/:id/seat', (req, res) => {
  try {
    const { guest_count, employee_id, customer_id, reservation_id } = req.body;
    const db = getDb();

    // Create order for the table
    const nextNum = db.prepare(`SELECT value FROM settings WHERE key = 'next_order_number'`).get();
    const prefix = db.prepare(`SELECT value FROM settings WHERE key = 'order_number_prefix'`).get();
    const num = parseInt(nextNum?.value || '1001');
    const orderNumber = `${prefix?.value || 'NX'}${num}`;
    db.prepare(`UPDATE settings SET value = ? WHERE key = 'next_order_number'`).run((num + 1).toString());

    const orderResult = db.prepare(`INSERT INTO orders (order_number, order_type, table_id, employee_id, customer_id, guest_count) VALUES (?, 'dine-in', ?, ?, ?, ?)`)
      .run(orderNumber, req.params.id, employee_id, customer_id, guest_count || 2);

    db.prepare(`UPDATE tables SET status = 'occupied', current_order_id = ?, server_id = ? WHERE id = ?`)
      .run(orderResult.lastInsertRowid, employee_id, req.params.id);

    if (reservation_id) {
      db.prepare(`UPDATE reservations SET status = 'seated' WHERE id = ?`).run(reservation_id);
    }

    req.app.locals.broadcast({ type: 'table_seated', tableId: req.params.id, orderNumber });
    res.json({ order_id: orderResult.lastInsertRowid, order_number: orderNumber });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
