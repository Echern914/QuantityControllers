const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { hashPin, generateToken, authenticate } = require('../middleware/auth');

// POST /api/auth/login - PIN-based login
router.post('/login', (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN required' });

  const db = getDb();
  const pinHash = hashPin(pin);
  const employee = db.prepare(`
    SELECT id, first_name, last_name, role, email, permissions, color
    FROM employees WHERE pin_hash = ? AND active = 1 AND email NOT LIKE 'demo%@venuecore.pos'
  `).get(pinHash);

  if (!employee) return res.status(401).json({ error: 'Invalid PIN' });

  // Clean old sessions for this employee
  db.prepare(`DELETE FROM sessions WHERE employee_id = ? OR expires_at < datetime('now')`).run(employee.id);

  // Create session (24 hour expiry)
  const token = generateToken();
  db.prepare(`INSERT INTO sessions (token, employee_id, expires_at) VALUES (?, ?, datetime('now', '+24 hours'))`).run(token, employee.id);

  res.json({
    token,
    employee: {
      id: employee.id,
      firstName: employee.first_name,
      lastName: employee.last_name,
      role: employee.role,
      color: employee.color,
      permissions: JSON.parse(employee.permissions || '{}'),
    },
  });
});

// POST /api/auth/logout
router.post('/logout', authenticate, (req, res) => {
  const db = getDb();
  const token = req.headers.authorization?.replace('Bearer ', '');
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ employee: req.employee });
});

// GET /api/auth/status - Check if any employees exist (for first-time setup)
router.get('/status', (req, res) => {
  const db = getDb();
  const count = db.prepare(`SELECT COUNT(*) as c FROM employees WHERE email NOT LIKE 'demo%@venuecore.pos'`).get();
  res.json({ hasEmployees: count.c > 0 });
});

// POST /api/auth/setup - Create first admin (only works when no real employees exist)
router.post('/setup', (req, res) => {
  const { first_name, last_name, pin } = req.body;
  if (!first_name || !pin || pin.length !== 4) {
    return res.status(400).json({ error: 'Name and 4-digit PIN required' });
  }

  const db = getDb();
  const realCount = db.prepare(`SELECT COUNT(*) as c FROM employees WHERE email NOT LIKE 'demo%@venuecore.pos'`).get();
  if (realCount.c > 0) {
    return res.status(403).json({ error: 'Setup already completed. Use PIN login.' });
  }

  const pinHash = hashPin(pin);
  const result = db.prepare(`
    INSERT INTO employees (first_name, last_name, pin_hash, role, email, color, hire_date)
    VALUES (?, ?, ?, 'admin', ?, '#6366f1', date('now'))
  `).run(first_name, last_name || '', pinHash, `${first_name.toLowerCase()}@admin`);

  const token = generateToken();
  db.prepare(`INSERT INTO sessions (token, employee_id, expires_at) VALUES (?, ?, datetime('now', '+24 hours'))`)
    .run(token, result.lastInsertRowid);

  res.json({
    token,
    employee: {
      id: result.lastInsertRowid,
      firstName: first_name,
      lastName: last_name || '',
      role: 'admin',
      color: '#6366f1',
      permissions: {},
    },
  });
});

// POST /api/auth/verify-pin (for manager overrides)
router.post('/verify-pin', (req, res) => {
  const { pin, requiredRole } = req.body;
  const db = getDb();
  const pinHash = hashPin(pin);
  const employee = db.prepare(`SELECT id, role FROM employees WHERE pin_hash = ? AND active = 1`).get(pinHash);

  if (!employee) return res.status(401).json({ error: 'Invalid PIN' });
  if (requiredRole && !['admin', 'manager'].includes(employee.role)) {
    return res.status(403).json({ error: 'Manager or admin PIN required' });
  }

  res.json({ valid: true, role: employee.role });
});

module.exports = router;
