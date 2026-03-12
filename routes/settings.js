const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);
router.use(requireRole('admin', 'manager'));

// GET /api/settings
router.get('/', (req, res) => {
  const db = getDb();
  const settings = db.prepare(`SELECT * FROM settings`).all();
  const obj = {};
  for (const s of settings) obj[s.key] = s.value;
  res.json(obj);
});

// PUT /api/settings/:key
router.put('/:key', (req, res) => {
  const { value } = req.body;
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`).run(req.params.key, value);
  res.json({ success: true });
});

// GET /api/settings/registers
router.get('/registers', (req, res) => {
  const db = getDb();
  res.json(db.prepare(`
    SELECT rs.*, e.first_name || ' ' || e.last_name as employee_name
    FROM register_sessions rs
    JOIN employees e ON rs.employee_id = e.id
    ORDER BY rs.opened_at DESC LIMIT 50
  `).all());
});

// POST /api/settings/registers/open
router.post('/registers/open', (req, res) => {
  const { register_name, employee_id, opening_cash } = req.body;
  const db = getDb();

  // Check for already open register
  const open = db.prepare(`SELECT id FROM register_sessions WHERE register_name = ? AND status = 'open'`).get(register_name || 'Main');
  if (open) return res.status(400).json({ error: 'Register already open' });

  const result = db.prepare(`INSERT INTO register_sessions (register_name, employee_id, opening_cash) VALUES (?, ?, ?)`)
    .run(register_name || 'Main', employee_id, opening_cash || 0);
  res.json({ id: result.lastInsertRowid });
});

// POST /api/settings/registers/close
router.post('/registers/close', (req, res) => {
  const { register_id, closing_cash, employee_id } = req.body;
  const db = getDb();

  const register = db.prepare(`SELECT * FROM register_sessions WHERE id = ? AND status = 'open'`).get(register_id);
  if (!register) return res.status(404).json({ error: 'Register not found or already closed' });

  // Calculate expected cash
  const cashPayments = db.prepare(`
    SELECT COALESCE(SUM(op.amount), 0) as total
    FROM order_payments op
    JOIN orders o ON op.order_id = o.id
    WHERE op.payment_method = 'cash' AND o.opened_at >= ? AND o.closed_at IS NOT NULL
  `).get(register.opened_at);

  const expectedCash = register.opening_cash + cashPayments.total;
  const difference = closing_cash - expectedCash;

  db.prepare(`UPDATE register_sessions SET status = 'closed', closed_at = datetime('now'), closing_cash = ?, expected_cash = ?, cash_difference = ? WHERE id = ?`)
    .run(closing_cash, expectedCash, difference, register_id);

  res.json({ expected_cash: expectedCash, closing_cash, difference, status: 'closed' });
});

module.exports = router;
