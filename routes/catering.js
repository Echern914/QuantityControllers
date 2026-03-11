const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// ============================================================
// EVENTS
// ============================================================

// GET /api/catering/events
router.get('/events', (req, res) => {
  const db = getDb();
  const { status, start_date, end_date } = req.query;
  let sql = `SELECT ce.*, c.first_name || ' ' || COALESCE(c.last_name, '') as customer_name
    FROM catering_events ce LEFT JOIN customers c ON ce.customer_id = c.id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND ce.status = ?'; params.push(status); }
  if (start_date) { sql += ' AND ce.event_date >= ?'; params.push(start_date); }
  if (end_date) { sql += ' AND ce.event_date <= ?'; params.push(end_date); }
  sql += ' ORDER BY ce.event_date ASC, ce.start_time ASC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/catering/events/:id
router.get('/events/:id', (req, res) => {
  const db = getDb();
  const event = db.prepare(`SELECT ce.*, c.first_name || ' ' || COALESCE(c.last_name, '') as customer_name FROM catering_events ce LEFT JOIN customers c ON ce.customer_id = c.id WHERE ce.id = ?`).get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  event.items = db.prepare(`
    SELECT cei.*, mi.name as menu_item_name, cp.name as package_name
    FROM catering_event_items cei
    LEFT JOIN menu_items mi ON cei.menu_item_id = mi.id
    LEFT JOIN catering_packages cp ON cei.package_id = cp.id
    WHERE cei.event_id = ?
  `).all(req.params.id);

  event.staff = db.prepare(`
    SELECT ces.*, e.first_name, e.last_name
    FROM catering_event_staff ces
    JOIN employees e ON ces.employee_id = e.id
    WHERE ces.event_id = ?
  `).all(req.params.id);

  res.json(event);
});

// POST /api/catering/events
router.post('/events', (req, res) => {
  const db = getDb();
  const { event_name, event_type, customer_id, contact_name, contact_phone, contact_email, event_date, start_time, end_time, guest_count, location, venue_type, deposit_amount, staff_needed, setup_time, cleanup_time, special_requirements, dietary_notes, notes, created_by } = req.body;
  if (!event_name || !contact_name || !event_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'Event name, contact, date, and times required' });
  }

  const result = db.prepare(`
    INSERT INTO catering_events (event_name, event_type, customer_id, contact_name, contact_phone, contact_email, event_date, start_time, end_time, guest_count, location, venue_type, deposit_amount, staff_needed, setup_time, cleanup_time, special_requirements, dietary_notes, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(event_name, event_type || 'private_party', customer_id || null, contact_name, contact_phone || null, contact_email || null, event_date, start_time, end_time, guest_count || 20, location || null, venue_type || 'on_premise', deposit_amount || 0, staff_needed || 0, setup_time || null, cleanup_time || null, special_requirements || null, dietary_notes || null, notes || null, created_by || null);

  res.json({ id: result.lastInsertRowid, message: 'Event created' });
});

// PUT /api/catering/events/:id
router.put('/events/:id', (req, res) => {
  const db = getDb();
  const fields = ['event_name', 'event_type', 'customer_id', 'contact_name', 'contact_phone', 'contact_email', 'event_date', 'start_time', 'end_time', 'guest_count', 'location', 'venue_type', 'status', 'deposit_amount', 'deposit_paid', 'staff_needed', 'setup_time', 'cleanup_time', 'special_requirements', 'dietary_notes', 'notes'];
  const updates = [];
  const values = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); values.push(req.body[f]); }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push("updated_at = datetime('now')");
  values.push(req.params.id);
  db.prepare(`UPDATE catering_events SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ message: 'Event updated' });
});

// POST /api/catering/events/:id/items
router.post('/events/:id/items', (req, res) => {
  const db = getDb();
  const { items } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'Items required' });

  const insert = db.prepare(`INSERT INTO catering_event_items (event_id, menu_item_id, package_id, custom_item_name, quantity, unit_price, total, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  let subtotal = 0;

  for (const item of items) {
    const total = (item.quantity || 1) * (item.unit_price || 0);
    insert.run(req.params.id, item.menu_item_id || null, item.package_id || null, item.custom_item_name || null, item.quantity || 1, item.unit_price || 0, total, item.notes || null);
    subtotal += total;
  }

  // Update event totals
  const event = db.prepare('SELECT tax_rate FROM catering_events ce LEFT JOIN locations l ON 1=1 WHERE ce.id = ?').get(req.params.id);
  const taxRate = 0.08; // default
  const tax = +(subtotal * taxRate).toFixed(2);
  const serviceCharge = +(subtotal * 0.20).toFixed(2); // 20% service charge
  const total = +(subtotal + tax + serviceCharge).toFixed(2);

  db.prepare(`UPDATE catering_events SET subtotal = ?, tax = ?, service_charge = ?, total = ?, balance_due = ? - amount_paid, updated_at = datetime('now') WHERE id = ?`)
    .run(subtotal, tax, serviceCharge, total, total, req.params.id);

  res.json({ subtotal, tax, service_charge: serviceCharge, total, message: 'Items added' });
});

// POST /api/catering/events/:id/staff
router.post('/events/:id/staff', (req, res) => {
  const db = getDb();
  const { assignments } = req.body;
  if (!assignments || !assignments.length) return res.status(400).json({ error: 'Staff assignments required' });

  const insert = db.prepare(`INSERT INTO catering_event_staff (event_id, employee_id, role, start_time, end_time) VALUES (?, ?, ?, ?, ?)`);
  for (const a of assignments) {
    insert.run(req.params.id, a.employee_id, a.role || 'server', a.start_time || null, a.end_time || null);
  }

  res.json({ assigned: assignments.length, message: 'Staff assigned' });
});

// POST /api/catering/events/:id/confirm-staff/:staffId
router.post('/events/:id/confirm-staff/:staffId', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE catering_event_staff SET confirmed = 1 WHERE id = ?').run(req.params.staffId);
  res.json({ message: 'Staff confirmed' });
});

// ============================================================
// PACKAGES
// ============================================================

// GET /api/catering/packages
router.get('/packages', (req, res) => {
  const db = getDb();
  const packages = db.prepare('SELECT * FROM catering_packages WHERE active = 1 ORDER BY category, price_per_person').all();
  for (const pkg of packages) {
    try { pkg.includes = JSON.parse(pkg.includes); } catch { pkg.includes = []; }
  }
  res.json(packages);
});

// POST /api/catering/packages
router.post('/packages', (req, res) => {
  const db = getDb();
  const { name, description, price_per_person, min_guests, max_guests, includes, category } = req.body;
  if (!name) return res.status(400).json({ error: 'Package name required' });

  const result = db.prepare(`INSERT INTO catering_packages (name, description, price_per_person, min_guests, max_guests, includes, category) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(name, description || '', price_per_person || 0, min_guests || 10, max_guests || null, JSON.stringify(includes || []), category || 'standard');
  res.json({ id: result.lastInsertRowid, message: 'Package created' });
});

// ============================================================
// CATERING DASHBOARD
// ============================================================

// GET /api/catering/dashboard
router.get('/dashboard', (req, res) => {
  const db = getDb();

  const upcoming = db.prepare("SELECT COUNT(*) as c FROM catering_events WHERE event_date >= date('now') AND status NOT IN ('cancelled', 'completed')").get().c;
  const thisMonth = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(total), 0) as revenue FROM catering_events WHERE event_date >= date('now', 'start of month') AND event_date <= date('now', 'start of month', '+1 month', '-1 day')").get();
  const pendingDeposits = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(deposit_amount), 0) as amount FROM catering_events WHERE deposit_paid = 0 AND status NOT IN ('cancelled', 'completed')").get();
  const outstanding = db.prepare("SELECT COALESCE(SUM(balance_due), 0) as amount FROM catering_events WHERE balance_due > 0 AND status NOT IN ('cancelled')").get();

  const nextEvents = db.prepare(`
    SELECT ce.id, ce.event_name, ce.event_date, ce.start_time, ce.guest_count, ce.status, ce.contact_name, ce.total
    FROM catering_events ce
    WHERE ce.event_date >= date('now') AND ce.status NOT IN ('cancelled', 'completed')
    ORDER BY ce.event_date ASC, ce.start_time ASC
    LIMIT 5
  `).all();

  const monthlyRevenue = db.prepare(`
    SELECT strftime('%Y-%m', event_date) as month, COUNT(*) as events, COALESCE(SUM(total), 0) as revenue
    FROM catering_events WHERE status NOT IN ('cancelled') AND event_date >= date('now', '-6 months')
    GROUP BY month ORDER BY month
  `).all();

  res.json({
    upcoming_events: upcoming,
    this_month: thisMonth,
    pending_deposits: pendingDeposits,
    outstanding_balance: outstanding.amount,
    next_events: nextEvents,
    monthly_revenue: monthlyRevenue,
  });
});

// GET /api/catering/calendar
router.get('/calendar', (req, res) => {
  const db = getDb();
  const { month, year } = req.query;
  const y = year || new Date().getFullYear();
  const m = month || String(new Date().getMonth() + 1).padStart(2, '0');

  const events = db.prepare(`
    SELECT id, event_name, event_type, event_date, start_time, end_time, guest_count, status, contact_name
    FROM catering_events
    WHERE strftime('%Y', event_date) = ? AND strftime('%m', event_date) = ?
    ORDER BY event_date, start_time
  `).all(String(y), String(m).padStart(2, '0'));

  res.json(events);
});

module.exports = router;
