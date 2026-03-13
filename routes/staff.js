const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { hashPin, authenticate, requireRole } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);
router.use(requireRole('admin', 'manager'));

// GET /api/staff
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const employees = db.prepare(`SELECT id, first_name, last_name, role, email, phone, hourly_rate, hire_date, color, active, permissions, created_at FROM employees WHERE active = 1 ORDER BY first_name`).all();
    res.json(employees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/staff/all (include inactive)
router.get('/all', (req, res) => {
  try {
    const db = getDb();
    res.json(db.prepare(`SELECT id, first_name, last_name, role, email, phone, hourly_rate, hire_date, color, active, created_at FROM employees ORDER BY active DESC, first_name`).all());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/staff
router.post('/', (req, res) => {
  const { first_name, last_name, pin, role, email, phone, hourly_rate, hire_date, color } = req.body;
  if (!pin || !first_name) return res.status(400).json({ error: 'Name and PIN required' });

  try {
    const db = getDb();
    const pinHash = hashPin(pin);

    // Check PIN uniqueness
    const existing = db.prepare(`SELECT id FROM employees WHERE pin_hash = ?`).get(pinHash);
    if (existing) return res.status(400).json({ error: 'PIN already in use' });

    const result = db.prepare(`
      INSERT INTO employees (first_name, last_name, pin_hash, role, email, phone, hourly_rate, hire_date, color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(first_name, last_name, pinHash, role || 'server', email, phone, hourly_rate || 0, hire_date, color || '#6366f1');

    res.json({ success: true, id: result.lastInsertRowid, first_name, last_name, role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/staff/:id
router.put('/:id', (req, res) => {
  const { first_name, last_name, pin, role, email, phone, hourly_rate, color, active } = req.body;
  try {
    const db = getDb();

    if (pin) {
      const pinHash = hashPin(pin);
      const existing = db.prepare(`SELECT id FROM employees WHERE pin_hash = ? AND id != ?`).get(pinHash, req.params.id);
      if (existing) return res.status(400).json({ error: 'PIN already in use' });
      db.prepare(`UPDATE employees SET pin_hash = ? WHERE id = ?`).run(pinHash, req.params.id);
    }

    db.prepare(`UPDATE employees SET first_name=?, last_name=?, role=?, email=?, phone=?, hourly_rate=?, color=?, active=?, updated_at=datetime('now') WHERE id=?`)
      .run(first_name, last_name, role, email, phone, hourly_rate, color, active ?? 1, req.params.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/staff/roles
router.get('/roles', (req, res) => {
  res.json([
    { id: 'admin', name: 'Admin', description: 'Full access' },
    { id: 'manager', name: 'Manager', description: 'Manage staff, void orders, run reports' },
    { id: 'server', name: 'Server', description: 'Take orders, process payments' },
    { id: 'bartender', name: 'Bartender', description: 'Bar orders, inventory management' },
    { id: 'cook', name: 'Cook', description: 'Kitchen display, prep tracking' },
    { id: 'host', name: 'Host', description: 'Reservations, seating, floor plan' },
  ]);
});

module.exports = router;
