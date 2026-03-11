const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// GET /api/notifications
router.get('/', (req, res) => {
  const db = getDb();
  const { unread_only, limit } = req.query;
  let sql = `SELECT * FROM alerts`;
  if (unread_only === 'true') sql += ' WHERE acknowledged = 0';
  sql += ` ORDER BY created_at DESC LIMIT ${parseInt(limit) || 50}`;
  res.json(db.prepare(sql).all());
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE alerts SET acknowledged = 1, acknowledged_by = ? WHERE id = ?`).run(req.body.employee_id, req.params.id);
  res.json({ success: true });
});

// POST /api/notifications/read-all
router.post('/read-all', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE alerts SET acknowledged = 1 WHERE acknowledged = 0`).run();
  res.json({ success: true });
});

// POST /api/notifications
router.post('/', (req, res) => {
  const { type, severity, title, message, data } = req.body;
  const db = getDb();
  const result = db.prepare(`INSERT INTO alerts (type, severity, title, message, data) VALUES (?, ?, ?, ?, ?)`)
    .run(type, severity || 'medium', title, message, JSON.stringify(data || {}));

  const notification = { id: result.lastInsertRowid, type, severity, title, message };
  req.app.locals.broadcast({ type: 'notification', notification });
  res.json(notification);
});

module.exports = router;
