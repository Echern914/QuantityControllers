const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// GET /api/reservations
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { date, status } = req.query;
    let sql = `SELECT r.*, t.name as table_name, c.first_name || ' ' || COALESCE(c.last_name, '') as customer_name
               FROM reservations r
               LEFT JOIN tables t ON r.table_id = t.id
               LEFT JOIN customers c ON r.customer_id = c.id`;
    const conditions = [];
    const params = [];
    if (date) { conditions.push('r.reservation_date = ?'); params.push(date); }
    if (status) { conditions.push('r.status = ?'); params.push(status); }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY r.reservation_date, r.reservation_time';
    res.json(db.prepare(sql).all(...params));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reservations
router.post('/', (req, res) => {
  try {
    const { customer_id, guest_name, phone, email, party_size, table_id, reservation_date, reservation_time, duration_minutes, notes } = req.body;
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO reservations (customer_id, guest_name, phone, email, party_size, table_id, reservation_date, reservation_time, duration_minutes, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(customer_id, guest_name, phone, email, party_size || 2, table_id, reservation_date, reservation_time, duration_minutes || 90, notes);

    if (table_id) {
      db.prepare(`UPDATE tables SET status = 'reserved' WHERE id = ? AND status = 'open'`).run(table_id);
    }

    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/reservations/:id
router.patch('/:id', (req, res) => {
  try {
    const { status, table_id } = req.body;
    const db = getDb();
    if (status) db.prepare(`UPDATE reservations SET status = ? WHERE id = ?`).run(status, req.params.id);
    if (table_id) db.prepare(`UPDATE reservations SET table_id = ? WHERE id = ?`).run(table_id, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/reservations/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const rez = db.prepare(`SELECT table_id FROM reservations WHERE id = ?`).get(req.params.id);
    db.prepare(`DELETE FROM reservations WHERE id = ?`).run(req.params.id);
    if (rez?.table_id) {
      db.prepare(`UPDATE tables SET status = 'open' WHERE id = ? AND status = 'reserved'`).run(rez.table_id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reservations/availability
router.get('/availability', (req, res) => {
  try {
    const { date, party_size } = req.query;
    const db = getDb();
    const minCapacity = parseInt(party_size || '2');

    const available = db.prepare(`
      SELECT t.* FROM tables t
      WHERE t.capacity >= ?
      AND t.id NOT IN (
        SELECT COALESCE(r.table_id, 0) FROM reservations r
        WHERE r.reservation_date = ? AND r.status IN ('confirmed', 'seated')
      )
      ORDER BY t.capacity, t.name
    `).all(minCapacity, date);

    res.json(available);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
