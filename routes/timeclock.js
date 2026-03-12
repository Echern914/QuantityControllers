const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { hashPin, authenticate } = require('../middleware/auth');

// Clock-in/clock-out use PIN auth (no session required)
// POST /api/timeclock/clock-in
router.post('/clock-in', (req, res) => {
  try {
    const { pin } = req.body;
    const db = getDb();
    const pinHash = hashPin(pin);
    const employee = db.prepare(`SELECT id, first_name, last_name, hourly_rate FROM employees WHERE pin_hash = ? AND active = 1`).get(pinHash);
    if (!employee) return res.status(401).json({ error: 'Invalid PIN' });

    // Check if already clocked in
    const active = db.prepare(`SELECT id FROM time_entries WHERE employee_id = ? AND clock_out IS NULL`).get(employee.id);
    if (active) return res.status(400).json({ error: 'Already clocked in' });

    const result = db.prepare(`INSERT INTO time_entries (employee_id, hourly_rate_snapshot) VALUES (?, ?)`).run(employee.id, employee.hourly_rate);
    req.app.locals.broadcast({ type: 'clock_in', employee: `${employee.first_name} ${employee.last_name}` });
    res.json({ id: result.lastInsertRowid, employee: `${employee.first_name} ${employee.last_name}`, clock_in: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/timeclock/clock-out
router.post('/clock-out', (req, res) => {
  try {
    const { pin, tips } = req.body;
    const db = getDb();
    const pinHash = hashPin(pin);
    const employee = db.prepare(`SELECT id, first_name, last_name FROM employees WHERE pin_hash = ? AND active = 1`).get(pinHash);
    if (!employee) return res.status(401).json({ error: 'Invalid PIN' });

    const entry = db.prepare(`SELECT * FROM time_entries WHERE employee_id = ? AND clock_out IS NULL`).get(employee.id);
    if (!entry) return res.status(400).json({ error: 'Not clocked in' });

    const clockIn = new Date(entry.clock_in);
    const clockOut = new Date();
    const hoursWorked = +((clockOut - clockIn) / 3600000 - (entry.break_minutes || 0) / 60).toFixed(2);

    db.prepare(`UPDATE time_entries SET clock_out = datetime('now'), hours_worked = ?, tips = ? WHERE id = ?`)
      .run(hoursWorked, tips || 0, entry.id);

    req.app.locals.broadcast({ type: 'clock_out', employee: `${employee.first_name} ${employee.last_name}` });
    res.json({ hours_worked: hoursWorked, tips: tips || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All remaining routes require session authentication
router.post('/break/start', authenticate, (req, res) => {
  try {
    // Track break start time in notes
    const { employee_id } = req.body;
    const db = getDb();
    const entry = db.prepare(`SELECT id FROM time_entries WHERE employee_id = ? AND clock_out IS NULL`).get(employee_id);
    if (!entry) return res.status(400).json({ error: 'Not clocked in' });
    db.prepare(`UPDATE time_entries SET notes = COALESCE(notes, '') || 'Break started: ' || datetime('now') || '; ' WHERE id = ?`).run(entry.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/break/end', authenticate, (req, res) => {
  try {
    const { employee_id, break_minutes } = req.body;
    const db = getDb();
    const entry = db.prepare(`SELECT id, break_minutes FROM time_entries WHERE employee_id = ? AND clock_out IS NULL`).get(employee_id);
    if (!entry) return res.status(400).json({ error: 'Not clocked in' });
    db.prepare(`UPDATE time_entries SET break_minutes = ? WHERE id = ?`).run((entry.break_minutes || 0) + (break_minutes || 15), entry.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/timeclock/current - who is clocked in
router.get('/current', authenticate, (req, res) => {
  try {
    const db = getDb();
    const current = db.prepare(`
      SELECT te.*, e.first_name, e.last_name, e.role, e.color,
             ROUND((julianday('now') - julianday(te.clock_in)) * 24, 2) as hours_so_far
      FROM time_entries te
      JOIN employees e ON te.employee_id = e.id
      WHERE te.clock_out IS NULL
      ORDER BY te.clock_in
    `).all();
    res.json(current);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/timeclock/timesheet
router.get('/timesheet', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { employee_id, start_date, end_date } = req.query;
    let sql = `SELECT te.*, e.first_name, e.last_name, e.role
               FROM time_entries te
               JOIN employees e ON te.employee_id = e.id WHERE 1=1`;
    const params = [];
    if (employee_id) { sql += ' AND te.employee_id = ?'; params.push(employee_id); }
    if (start_date) { sql += " AND date(te.clock_in) >= ?"; params.push(start_date); }
    if (end_date) { sql += " AND date(te.clock_in) <= ?"; params.push(end_date); }
    sql += ' ORDER BY te.clock_in DESC LIMIT 500';
    res.json(db.prepare(sql).all(...params));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/timeclock/tips
router.get('/tips', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { start_date, end_date } = req.query;
    let sql = `
      SELECT e.id, e.first_name, e.last_name,
             SUM(te.tips) as total_tips,
             SUM(te.hours_worked) as total_hours,
             COUNT(te.id) as shift_count
      FROM time_entries te
      JOIN employees e ON te.employee_id = e.id
      WHERE te.clock_out IS NOT NULL`;
    const params = [];
    if (start_date) { sql += ' AND date(te.clock_in) >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND date(te.clock_in) <= ?'; params.push(end_date); }
    sql += ' GROUP BY e.id ORDER BY total_tips DESC';
    const tips = db.prepare(sql).all(...params);
    res.json(tips);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
