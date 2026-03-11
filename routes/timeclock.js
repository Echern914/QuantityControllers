const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { hashPin } = require('../middleware/auth');

// POST /api/timeclock/clock-in
router.post('/clock-in', (req, res) => {
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
});

// POST /api/timeclock/clock-out
router.post('/clock-out', (req, res) => {
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
});

// POST /api/timeclock/break/start
router.post('/break/start', (req, res) => {
  // Track break start time in notes
  const { employee_id } = req.body;
  const db = getDb();
  const entry = db.prepare(`SELECT id FROM time_entries WHERE employee_id = ? AND clock_out IS NULL`).get(employee_id);
  if (!entry) return res.status(400).json({ error: 'Not clocked in' });
  db.prepare(`UPDATE time_entries SET notes = COALESCE(notes, '') || 'Break started: ' || datetime('now') || '; ' WHERE id = ?`).run(entry.id);
  res.json({ success: true });
});

// POST /api/timeclock/break/end
router.post('/break/end', (req, res) => {
  const { employee_id, break_minutes } = req.body;
  const db = getDb();
  const entry = db.prepare(`SELECT id, break_minutes FROM time_entries WHERE employee_id = ? AND clock_out IS NULL`).get(employee_id);
  if (!entry) return res.status(400).json({ error: 'Not clocked in' });
  db.prepare(`UPDATE time_entries SET break_minutes = ? WHERE id = ?`).run((entry.break_minutes || 0) + (break_minutes || 15), entry.id);
  res.json({ success: true });
});

// GET /api/timeclock/current - who is clocked in
router.get('/current', (req, res) => {
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
});

// GET /api/timeclock/timesheet
router.get('/timesheet', (req, res) => {
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
});

// GET /api/timeclock/tips
router.get('/tips', (req, res) => {
  const db = getDb();
  const { start_date, end_date } = req.query;
  const tips = db.prepare(`
    SELECT e.id, e.first_name, e.last_name,
           SUM(te.tips) as total_tips,
           SUM(te.hours_worked) as total_hours,
           COUNT(te.id) as shift_count
    FROM time_entries te
    JOIN employees e ON te.employee_id = e.id
    WHERE te.clock_out IS NOT NULL
    ${start_date ? "AND date(te.clock_in) >= '" + start_date + "'" : ''}
    ${end_date ? "AND date(te.clock_in) <= '" + end_date + "'" : ''}
    GROUP BY e.id
    ORDER BY total_tips DESC
  `).all();
  res.json(tips);
});

module.exports = router;
