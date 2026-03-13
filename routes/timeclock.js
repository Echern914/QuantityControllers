const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { hashPin, authenticate } = require('../middleware/auth');
const { paginate } = require('../middleware/response');

// Clock-in/clock-out use PIN auth (no session required)
// POST /api/timeclock/clock-in
router.post('/clock-in', (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN required' });
    const db = getDb();
    const pinHash = hashPin(pin);
    const employee = db.prepare(`SELECT id, first_name, last_name, hourly_rate FROM employees WHERE pin_hash = ? AND active = 1`).get(pinHash);
    if (!employee) return res.status(401).json({ error: 'Invalid PIN' });

    // Atomic check-and-insert in a transaction to prevent race conditions
    const clockIn = db.transaction(() => {
      const active = db.prepare(`SELECT id FROM time_entries WHERE employee_id = ? AND clock_out IS NULL`).get(employee.id);
      if (active) return null;
      return db.prepare(`INSERT INTO time_entries (employee_id, hourly_rate_snapshot) VALUES (?, ?)`).run(employee.id, employee.hourly_rate);
    })();

    if (!clockIn) return res.status(400).json({ error: 'Already clocked in' });

    req.app.locals.broadcast({ type: 'clock_in', employee: `${employee.first_name} ${employee.last_name}` });
    res.json({ success: true, id: clockIn.lastInsertRowid, employee: `${employee.first_name} ${employee.last_name}`, clock_in: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/timeclock/clock-out
router.post('/clock-out', (req, res) => {
  try {
    const { pin, tips } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN required' });
    const db = getDb();
    const pinHash = hashPin(pin);
    const employee = db.prepare(`SELECT id, first_name, last_name FROM employees WHERE pin_hash = ? AND active = 1`).get(pinHash);
    if (!employee) return res.status(401).json({ error: 'Invalid PIN' });

    const safeTips = Math.max(0, parseFloat(tips) || 0);

    // Atomic clock-out in a transaction
    const result = db.transaction(() => {
      const entry = db.prepare(`SELECT * FROM time_entries WHERE employee_id = ? AND clock_out IS NULL`).get(employee.id);
      if (!entry) return null;

      const clockIn = new Date(entry.clock_in);
      const clockOut = new Date();
      const hoursWorked = Math.max(0, +((clockOut - clockIn) / 3600000 - (entry.break_minutes || 0) / 60).toFixed(2));

      db.prepare(`UPDATE time_entries SET clock_out = datetime('now'), hours_worked = ?, tips = ? WHERE id = ?`)
        .run(hoursWorked, safeTips, entry.id);

      return { hours_worked: hoursWorked, tips: safeTips };
    })();

    if (!result) return res.status(400).json({ error: 'Not clocked in' });

    req.app.locals.broadcast({ type: 'clock_out', employee: `${employee.first_name} ${employee.last_name}` });
    res.json(result);
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
    const mins = Math.max(0, Math.min(480, parseInt(break_minutes) || 15));
    const db = getDb();
    const entry = db.prepare(`SELECT id, break_minutes, clock_in FROM time_entries WHERE employee_id = ? AND clock_out IS NULL`).get(employee_id);
    if (!entry) return res.status(400).json({ error: 'Not clocked in' });
    const totalBreak = (entry.break_minutes || 0) + mins;
    const shiftMinutes = (Date.now() - new Date(entry.clock_in).getTime()) / 60000;
    if (totalBreak > shiftMinutes) return res.status(400).json({ error: 'Break cannot exceed shift duration' });
    db.prepare(`UPDATE time_entries SET break_minutes = ? WHERE id = ?`).run(totalBreak, entry.id);
    res.json({ success: true, total_break_minutes: totalBreak });
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
    sql += ' ORDER BY te.clock_in DESC';
    res.json(paginate(db, sql, params, req.query, { defaultLimit: 500 }));
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
