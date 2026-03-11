const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// GET /api/scheduling/shifts
router.get('/shifts', (req, res) => {
  const db = getDb();
  const { start_date, end_date, employee_id } = req.query;
  let sql = `SELECT s.*, e.first_name, e.last_name, e.role, e.color
             FROM shifts s JOIN employees e ON s.employee_id = e.id WHERE 1=1`;
  const params = [];
  if (start_date) { sql += ' AND s.shift_date >= ?'; params.push(start_date); }
  if (end_date) { sql += ' AND s.shift_date <= ?'; params.push(end_date); }
  if (employee_id) { sql += ' AND s.employee_id = ?'; params.push(employee_id); }
  sql += ' ORDER BY s.shift_date, s.start_time';
  res.json(db.prepare(sql).all(...params));
});

// POST /api/scheduling/shifts
router.post('/shifts', (req, res) => {
  const { employee_id, shift_date, start_time, end_time, station, notes } = req.body;
  const db = getDb();
  const result = db.prepare(`INSERT INTO shifts (employee_id, shift_date, start_time, end_time, station, notes) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(employee_id, shift_date, start_time, end_time, station, notes);
  res.json({ id: result.lastInsertRowid });
});

// PUT /api/scheduling/shifts/:id
router.put('/shifts/:id', (req, res) => {
  const { employee_id, shift_date, start_time, end_time, station, notes } = req.body;
  const db = getDb();
  db.prepare(`UPDATE shifts SET employee_id=?, shift_date=?, start_time=?, end_time=?, station=?, notes=? WHERE id=?`)
    .run(employee_id, shift_date, start_time, end_time, station, notes, req.params.id);
  res.json({ success: true });
});

// DELETE /api/scheduling/shifts/:id
router.delete('/shifts/:id', (req, res) => {
  const db = getDb();
  db.prepare(`DELETE FROM shifts WHERE id = ?`).run(req.params.id);
  res.json({ success: true });
});

// POST /api/scheduling/shifts/publish
router.post('/shifts/publish', (req, res) => {
  const { start_date, end_date } = req.body;
  const db = getDb();
  db.prepare(`UPDATE shifts SET published = 1 WHERE shift_date >= ? AND shift_date <= ?`).run(start_date, end_date);
  req.app.locals.broadcast({ type: 'schedule_published', start_date, end_date });
  res.json({ success: true });
});

// GET /api/scheduling/week-view
router.get('/week-view', (req, res) => {
  const db = getDb();
  const { week_start } = req.query;
  const start = week_start || new Date().toISOString().slice(0, 10);

  const employees = db.prepare(`SELECT id, first_name, last_name, role, color FROM employees WHERE active = 1 ORDER BY first_name`).all();
  const shifts = db.prepare(`SELECT * FROM shifts WHERE shift_date >= ? AND shift_date < date(?, '+7 days') ORDER BY shift_date, start_time`).all(start, start);

  const weekView = employees.map(emp => ({
    ...emp,
    shifts: shifts.filter(s => s.employee_id === emp.id),
  }));

  res.json(weekView);
});

module.exports = router;
