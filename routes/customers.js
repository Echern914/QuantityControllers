const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// GET /api/customers
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { search, vip_tier } = req.query;
    let sql = `SELECT * FROM customers`;
    const conditions = [];
    const params = [];

    if (search) {
      conditions.push("(first_name || ' ' || COALESCE(last_name, '') LIKE ? OR email LIKE ? OR phone LIKE ?)");
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (vip_tier) { conditions.push('vip_tier = ?'); params.push(vip_tier); }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY last_visit_at DESC NULLS LAST LIMIT 200';

    res.json(db.prepare(sql).all(...params));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customers/upcoming/birthdays
router.get('/upcoming/birthdays', (req, res) => {
  try {
    const db = getDb();
    const days = parseInt(req.query.days || '7');
    const birthdays = db.prepare(`
      SELECT * FROM customers
      WHERE birthday IS NOT NULL
      AND (
        (CAST(strftime('%m', birthday) AS INTEGER) * 100 + CAST(strftime('%d', birthday) AS INTEGER))
        BETWEEN
        (CAST(strftime('%m', 'now') AS INTEGER) * 100 + CAST(strftime('%d', 'now') AS INTEGER))
        AND
        (CAST(strftime('%m', 'now', '+' || ? || ' days') AS INTEGER) * 100 + CAST(strftime('%d', 'now', '+' || ? || ' days') AS INTEGER))
      )
      ORDER BY birthday
    `).all(days, days);
    res.json(birthdays);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customers/:id
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    customer.recent_orders = db.prepare(`
      SELECT o.id, o.order_number, o.total, o.opened_at, o.status
      FROM orders o WHERE o.customer_id = ?
      ORDER BY o.opened_at DESC LIMIT 20
    `).all(req.params.id);

    customer.favorite_items = JSON.parse(customer.favorite_items || '[]');
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers
router.post('/', (req, res) => {
  try {
    const { first_name, last_name, email, phone, birthday, notes } = req.body;
    const db = getDb();
    const result = db.prepare(`INSERT INTO customers (first_name, last_name, email, phone, birthday, notes) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(first_name, last_name, email, phone, birthday, notes);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/customers/:id
router.put('/:id', (req, res) => {
  try {
    const { first_name, last_name, email, phone, birthday, notes, vip_tier } = req.body;
    const db = getDb();
    db.prepare(`UPDATE customers SET first_name=?, last_name=?, email=?, phone=?, birthday=?, notes=?, vip_tier=? WHERE id=?`)
      .run(first_name, last_name, email, phone, birthday, notes, vip_tier || 'regular', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers/:id/loyalty/add
router.post('/:id/loyalty/add', (req, res) => {
  try {
    const { points } = req.body;
    const db = getDb();
    db.prepare(`UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ?`).run(points, req.params.id);
    const customer = db.prepare(`SELECT loyalty_points, vip_tier FROM customers WHERE id = ?`).get(req.params.id);

    let newTier = 'regular';
    if (customer.loyalty_points >= 5000) newTier = 'platinum';
    else if (customer.loyalty_points >= 2000) newTier = 'gold';
    else if (customer.loyalty_points >= 500) newTier = 'silver';

    if (newTier !== customer.vip_tier) {
      db.prepare(`UPDATE customers SET vip_tier = ? WHERE id = ?`).run(newTier, req.params.id);
    }

    res.json({ loyalty_points: customer.loyalty_points, vip_tier: newTier });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers/:id/loyalty/redeem
router.post('/:id/loyalty/redeem', (req, res) => {
  try {
    const { points } = req.body;
    const db = getDb();
    const customer = db.prepare(`SELECT loyalty_points FROM customers WHERE id = ?`).get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    if (customer.loyalty_points < points) return res.status(400).json({ error: 'Insufficient points' });

    const redemptionRate = parseInt(db.prepare(`SELECT value FROM settings WHERE key = 'loyalty_redemption_rate'`).get()?.value || '100');
    const discount = +(points / redemptionRate).toFixed(2);

    db.prepare(`UPDATE customers SET loyalty_points = loyalty_points - ? WHERE id = ?`).run(points, req.params.id);
    res.json({ redeemed: points, discount_amount: discount, remaining_points: customer.loyalty_points - points });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
