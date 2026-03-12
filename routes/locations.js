const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// ============================================================
// LOCATIONS
// ============================================================

// GET /api/locations
router.get('/', (req, res) => {
  const db = getDb();
  const locations = db.prepare(`
    SELECT l.*, e.first_name || ' ' || COALESCE(e.last_name, '') as manager_name,
           (SELECT COUNT(*) FROM location_employees le WHERE le.location_id = l.id) as staff_count
    FROM locations l
    LEFT JOIN employees e ON l.manager_id = e.id
    ORDER BY l.is_primary DESC, l.name
  `).all();
  res.json(locations);
});

// GET /api/locations/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const location = db.prepare(`SELECT l.*, e.first_name || ' ' || COALESCE(e.last_name, '') as manager_name FROM locations l LEFT JOIN employees e ON l.manager_id = e.id WHERE l.id = ?`).get(req.params.id);
  if (!location) return res.status(404).json({ error: 'Location not found' });

  location.staff = db.prepare(`
    SELECT le.*, e.first_name, e.last_name, e.role as employee_role, e.active
    FROM location_employees le
    JOIN employees e ON le.employee_id = e.id
    WHERE le.location_id = ?
    ORDER BY e.last_name
  `).all(req.params.id);

  res.json(location);
});

// POST /api/locations
router.post('/', (req, res) => {
  const db = getDb();
  const { name, code, address, city, state, zip, phone, email, timezone, tax_rate, manager_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Location name required' });

  const locationCode = code || name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
  const result = db.prepare(`
    INSERT INTO locations (name, code, address, city, state, zip, phone, email, timezone, tax_rate, manager_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, locationCode, address || null, city || null, state || null, zip || null, phone || null, email || null, timezone || 'America/New_York', tax_rate || 0.08, manager_id || null);

  res.json({ id: result.lastInsertRowid, code: locationCode, message: 'Location created' });
});

// PUT /api/locations/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const { name, address, city, state, zip, phone, email, timezone, tax_rate, manager_id, status } = req.body;
  db.prepare(`UPDATE locations SET name = COALESCE(?, name), address = COALESCE(?, address), city = COALESCE(?, city), state = COALESCE(?, state), zip = COALESCE(?, zip), phone = COALESCE(?, phone), email = COALESCE(?, email), timezone = COALESCE(?, timezone), tax_rate = COALESCE(?, tax_rate), manager_id = COALESCE(?, manager_id), status = COALESCE(?, status) WHERE id = ?`)
    .run(name, address, city, state, zip, phone, email, timezone, tax_rate, manager_id, status, req.params.id);
  res.json({ message: 'Location updated' });
});

// ============================================================
// LOCATION STAFF
// ============================================================

// POST /api/locations/:id/staff
router.post('/:id/staff', (req, res) => {
  const db = getDb();
  const { employee_id, role, is_primary } = req.body;
  if (!employee_id) return res.status(400).json({ error: 'Employee ID required' });

  try {
    db.prepare(`INSERT INTO location_employees (location_id, employee_id, role, is_primary, start_date) VALUES (?, ?, ?, ?, date('now'))`)
      .run(req.params.id, employee_id, role || 'staff', is_primary !== undefined ? (is_primary ? 1 : 0) : 1);
    res.json({ message: 'Staff assigned to location' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Employee already assigned to this location' });
    throw err;
  }
});

// DELETE /api/locations/:id/staff/:employeeId
router.delete('/:id/staff/:employeeId', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM location_employees WHERE location_id = ? AND employee_id = ?').run(req.params.id, req.params.employeeId);
  res.json({ message: 'Staff removed from location' });
});

// ============================================================
// CROSS-LOCATION REPORTING
// ============================================================

// GET /api/locations/compare/sales
router.get('/compare/sales', (req, res) => {
  const db = getDb();
  const { start_date, end_date } = req.query;
  const start = start_date || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const end = end_date || new Date().toISOString().slice(0, 10);

  // For now, single-location - this is the infrastructure for multi
  const locations = db.prepare('SELECT * FROM locations WHERE status = ?').all('active');

  const locationData = locations.map(loc => {
    const sales = db.prepare(`
      SELECT COUNT(*) as orders, COALESCE(SUM(total), 0) as revenue,
             COALESCE(AVG(total), 0) as avg_check, COALESCE(SUM(guest_count), 0) as guests
      FROM orders WHERE status = 'closed' AND date(opened_at) >= ? AND date(opened_at) <= ?
    `).get(start, end);

    const labor = db.prepare(`
      SELECT COALESCE(SUM(hours_worked * hourly_rate_snapshot), 0) as cost
      FROM time_entries WHERE clock_out IS NOT NULL AND date(clock_in) >= ? AND date(clock_in) <= ?
    `).get(start, end);

    return {
      location_id: loc.id,
      location_name: loc.name,
      location_code: loc.code,
      ...sales,
      labor_cost: +labor.cost.toFixed(2),
      labor_percent: sales.revenue > 0 ? +((labor.cost / sales.revenue) * 100).toFixed(1) : 0,
    };
  });

  res.json({ period: { start, end }, locations: locationData });
});

// GET /api/locations/compare/inventory
router.get('/compare/inventory', (req, res) => {
  const db = getDb();
  const locations = db.prepare('SELECT * FROM locations WHERE status = ?').all('active');

  const data = locations.map(loc => {
    const inv = db.prepare(`
      SELECT COUNT(DISTINCT ingredient_id) as items,
             COALESCE(SUM(inv.quantity * i.cost_per_unit), 0) as value
      FROM inventory inv JOIN ingredients i ON inv.ingredient_id = i.id
      WHERE inv.status != 'empty'
    `).get();

    return { location_id: loc.id, location_name: loc.name, ...inv };
  });

  res.json(data);
});

// ============================================================
// INTER-LOCATION TRANSFERS
// ============================================================

// GET /api/locations/transfers
router.get('/transfers', (req, res) => {
  const db = getDb();
  const transfers = db.prepare(`
    SELECT ilt.*, i.name as ingredient_name,
           fl.name as from_location_name, tl.name as to_location_name,
           e.first_name || ' ' || COALESCE(e.last_name, '') as requested_by_name
    FROM inter_location_transfers ilt
    JOIN ingredients i ON ilt.ingredient_id = i.id
    JOIN locations fl ON ilt.from_location_id = fl.id
    JOIN locations tl ON ilt.to_location_id = tl.id
    LEFT JOIN employees e ON ilt.requested_by = e.id
    ORDER BY ilt.created_at DESC
    LIMIT 50
  `).all();
  res.json(transfers);
});

// POST /api/locations/transfers
router.post('/transfers', (req, res) => {
  const db = getDb();
  const { from_location_id, to_location_id, ingredient_id, quantity, unit, requested_by, notes } = req.body;
  if (!from_location_id || !to_location_id || !ingredient_id || !quantity) {
    return res.status(400).json({ error: 'From location, to location, ingredient, and quantity required' });
  }

  const result = db.prepare(`
    INSERT INTO inter_location_transfers (from_location_id, to_location_id, ingredient_id, quantity, unit, requested_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(from_location_id, to_location_id, ingredient_id, quantity, unit || null, requested_by || null, notes || null);

  res.json({ id: result.lastInsertRowid, message: 'Transfer requested' });
});

// PATCH /api/locations/transfers/:id/approve
router.patch('/transfers/:id/approve', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE inter_location_transfers SET status = 'approved', approved_by = ? WHERE id = ?`).run(req.body.approved_by || null, req.params.id);
  res.json({ message: 'Transfer approved' });
});

// PATCH /api/locations/transfers/:id/ship
router.patch('/transfers/:id/ship', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE inter_location_transfers SET status = 'shipped', shipped_at = datetime('now') WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Transfer shipped' });
});

// PATCH /api/locations/transfers/:id/receive
router.patch('/transfers/:id/receive', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE inter_location_transfers SET status = 'received', received_at = datetime('now') WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Transfer received' });
});

module.exports = router;
