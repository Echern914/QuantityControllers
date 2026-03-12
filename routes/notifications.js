const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// GET /api/notifications
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { unread_only, limit } = req.query;
    let sql = `SELECT * FROM alerts`;
    if (unread_only === 'true') sql += ' WHERE acknowledged = 0';
    sql += ` ORDER BY created_at DESC LIMIT ${parseInt(limit) || 50}`;
    res.json(db.prepare(sql).all());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', (req, res) => {
  try {
    const db = getDb();
    db.prepare(`UPDATE alerts SET acknowledged = 1, acknowledged_by = ? WHERE id = ?`).run(req.body.employee_id, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/read-all
router.post('/read-all', (req, res) => {
  try {
    const db = getDb();
    db.prepare(`UPDATE alerts SET acknowledged = 1 WHERE acknowledged = 0`).run();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications
router.post('/', (req, res) => {
  try {
    const { type, severity, title, message, data } = req.body;
    const db = getDb();
    const result = db.prepare(`INSERT INTO alerts (type, severity, title, message, data) VALUES (?, ?, ?, ?, ?)`)
      .run(type, severity || 'medium', title, message, JSON.stringify(data || {}));

    const notification = { id: result.lastInsertRowid, type, severity, title, message };
    req.app.locals.broadcast({ type: 'notification', notification });
    res.json(notification);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
