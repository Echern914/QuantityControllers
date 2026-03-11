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
    FROM employees WHERE pin_hash = ? AND active = 1
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
