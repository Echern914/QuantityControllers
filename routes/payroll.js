const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);
router.use(requireRole('admin', 'manager'));

// ============================================================
// PAYROLL RUNS
// ============================================================

// GET /api/payroll/runs
router.get('/runs', (req, res) => {
  const db = getDb();
  const { status } = req.query;
  let sql = 'SELECT * FROM payroll_runs WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY pay_period_end DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/payroll/runs/:id
router.get('/runs/:id', (req, res) => {
  const db = getDb();
  const run = db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Payroll run not found' });

  run.items = db.prepare(`
    SELECT pi.*, e.first_name, e.last_name, e.role
    FROM payroll_items pi
    JOIN employees e ON pi.employee_id = e.id
    WHERE pi.payroll_run_id = ?
    ORDER BY e.last_name, e.first_name
  `).all(req.params.id);

  res.json(run);
});

// POST /api/payroll/runs - Create & calculate payroll
router.post('/runs', (req, res) => {
  const db = getDb();
  const { pay_period_start, pay_period_end, pay_date } = req.body;
  if (!pay_period_start || !pay_period_end || !pay_date) {
    return res.status(400).json({ error: 'Pay period start, end, and pay date required' });
  }

  // Get settings
  const getSetting = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
  const fedRate = parseFloat(getSetting('federal_tax_rate') || '0.12');
  const stateRate = parseFloat(getSetting('state_tax_rate') || '0.05');
  const ssRate = parseFloat(getSetting('social_security_rate') || '0.062');
  const medRate = parseFloat(getSetting('medicare_rate') || '0.0145');
  const otMultiplier = parseFloat(getSetting('overtime_multiplier') || '1.5');
  const otThreshold = parseFloat(getSetting('overtime_threshold_hours') || '40');

  // Create payroll run
  const result = db.prepare(`
    INSERT INTO payroll_runs (pay_period_start, pay_period_end, pay_date, status) VALUES (?, ?, ?, 'draft')
  `).run(pay_period_start, pay_period_end, pay_date);
  const runId = result.lastInsertRowid;

  // Get all active employees with time entries in this period
  const employees = db.prepare(`
    SELECT e.id, e.first_name, e.last_name, e.role, e.hourly_rate,
           COALESCE(SUM(te.hours_worked), 0) as total_hours,
           COALESCE(SUM(te.tips), 0) as total_tips
    FROM employees e
    LEFT JOIN time_entries te ON e.id = te.employee_id
      AND te.clock_out IS NOT NULL
      AND date(te.clock_in) >= ? AND date(te.clock_in) <= ?
    WHERE e.active = 1
    GROUP BY e.id
    HAVING total_hours > 0
  `).all(pay_period_start, pay_period_end);

  const insertItem = db.prepare(`
    INSERT INTO payroll_items (payroll_run_id, employee_id, regular_hours, overtime_hours, hourly_rate, overtime_rate,
      regular_pay, overtime_pay, gross_pay, tips_cash, tips_credit, total_tips,
      federal_tax, state_tax, social_security, medicare, total_deductions, net_pay)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let totalGross = 0, totalDeductions = 0, totalNet = 0, totalTips = 0;

  for (const emp of employees) {
    const regularHours = Math.min(emp.total_hours, otThreshold);
    const overtimeHours = Math.max(emp.total_hours - otThreshold, 0);
    const otRate = emp.hourly_rate * otMultiplier;

    const regularPay = regularHours * emp.hourly_rate;
    const overtimePay = overtimeHours * otRate;
    const grossPay = regularPay + overtimePay;

    // Tax calculations
    const federalTax = +(grossPay * fedRate).toFixed(2);
    const stateTax = +(grossPay * stateRate).toFixed(2);
    const socialSecurity = +(grossPay * ssRate).toFixed(2);
    const medicare = +(grossPay * medRate).toFixed(2);
    const totalDed = +(federalTax + stateTax + socialSecurity + medicare).toFixed(2);
    const netPay = +(grossPay - totalDed).toFixed(2);

    insertItem.run(runId, emp.id, +regularHours.toFixed(2), +overtimeHours.toFixed(2),
      emp.hourly_rate, +otRate.toFixed(2), +regularPay.toFixed(2), +overtimePay.toFixed(2),
      +grossPay.toFixed(2), 0, 0, +emp.total_tips.toFixed(2),
      federalTax, stateTax, socialSecurity, medicare, totalDed, netPay);

    totalGross += grossPay;
    totalDeductions += totalDed;
    totalNet += netPay;
    totalTips += emp.total_tips;
  }

  // Update run totals
  const employerSS = +(totalGross * ssRate).toFixed(2);
  const employerMed = +(totalGross * medRate).toFixed(2);
  const totalEmployerTaxes = +(employerSS + employerMed).toFixed(2);

  db.prepare(`
    UPDATE payroll_runs SET total_gross = ?, total_deductions = ?, total_employer_taxes = ?,
      total_net = ?, total_tips = ?, employee_count = ? WHERE id = ?
  `).run(+totalGross.toFixed(2), +totalDeductions.toFixed(2), totalEmployerTaxes, +totalNet.toFixed(2), +totalTips.toFixed(2), employees.length, runId);

  res.json({ id: runId, employee_count: employees.length, total_gross: +totalGross.toFixed(2), total_net: +totalNet.toFixed(2), message: 'Payroll calculated' });
});

// POST /api/payroll/runs/:id/approve
router.post('/runs/:id/approve', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE payroll_runs SET status = 'approved', approved_by = ?, approved_at = datetime('now') WHERE id = ?`)
    .run(req.body.approved_by || null, req.params.id);
  res.json({ message: 'Payroll approved' });
});

// POST /api/payroll/runs/:id/process
router.post('/runs/:id/process', (req, res) => {
  const db = getDb();
  const run = db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Not found' });
  if (run.status !== 'approved') return res.status(400).json({ error: 'Must be approved before processing' });

  db.prepare(`UPDATE payroll_runs SET status = 'processed', processed_by = ?, processed_at = datetime('now') WHERE id = ?`)
    .run(req.body.processed_by || null, req.params.id);
  res.json({ message: 'Payroll processed' });
});

// ============================================================
// TIP MANAGEMENT
// ============================================================

// GET /api/payroll/tip-pools
router.get('/tip-pools', (req, res) => {
  const db = getDb();
  const pools = db.prepare('SELECT * FROM tip_pools ORDER BY pool_date DESC LIMIT 50').all();
  res.json(pools);
});

// POST /api/payroll/tip-pools - Create and distribute
router.post('/tip-pools', (req, res) => {
  const db = getDb();
  const { pool_date, shift } = req.body;
  const date = pool_date || new Date().toISOString().slice(0, 10);

  // Get total tips for the date
  const tipData = db.prepare(`
    SELECT COALESCE(SUM(tip), 0) as total_tips
    FROM orders WHERE status = 'closed' AND date(opened_at) = ?
  `).get(date);

  if (tipData.total_tips === 0) return res.json({ message: 'No tips to pool' });

  // Get staff who worked that day with hours
  const workers = db.prepare(`
    SELECT e.id, e.first_name, e.last_name, e.role,
           SUM(te.hours_worked) as hours
    FROM employees e
    JOIN time_entries te ON e.id = te.employee_id
    WHERE te.clock_out IS NOT NULL AND date(te.clock_in) = ?
    GROUP BY e.id
  `).all(date);

  if (workers.length === 0) return res.json({ message: 'No staff worked this day' });

  const totalHours = workers.reduce((s, w) => s + (w.hours || 0), 0);
  const ratePerHour = totalHours > 0 ? tipData.total_tips / totalHours : 0;

  const result = db.prepare(`INSERT INTO tip_pools (pool_date, shift, total_tips, total_hours, rate_per_hour, status, created_by) VALUES (?, ?, ?, ?, ?, 'distributed', ?)`)
    .run(date, shift || 'all', tipData.total_tips, +totalHours.toFixed(2), +ratePerHour.toFixed(2), req.body.created_by || null);

  const insertDist = db.prepare(`INSERT INTO tip_pool_distributions (tip_pool_id, employee_id, hours_worked, share_amount, role) VALUES (?, ?, ?, ?, ?)`);
  const distributions = [];
  for (const w of workers) {
    const share = +((w.hours || 0) * ratePerHour).toFixed(2);
    insertDist.run(result.lastInsertRowid, w.id, +(w.hours || 0).toFixed(2), share, w.role);
    distributions.push({ employee: `${w.first_name} ${w.last_name}`, hours: w.hours, share });
  }

  res.json({ id: result.lastInsertRowid, total_tips: tipData.total_tips, distributions, message: 'Tips pooled and distributed' });
});

// GET /api/payroll/tip-pools/:id
router.get('/tip-pools/:id', (req, res) => {
  const db = getDb();
  const pool = db.prepare('SELECT * FROM tip_pools WHERE id = ?').get(req.params.id);
  if (!pool) return res.status(404).json({ error: 'Not found' });

  pool.distributions = db.prepare(`
    SELECT tpd.*, e.first_name, e.last_name
    FROM tip_pool_distributions tpd
    JOIN employees e ON tpd.employee_id = e.id
    WHERE tpd.tip_pool_id = ?
    ORDER BY tpd.share_amount DESC
  `).all(req.params.id);

  res.json(pool);
});

// ============================================================
// TAX RATES
// ============================================================

// GET /api/payroll/tax-rates
router.get('/tax-rates', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM tax_rates WHERE active = 1 ORDER BY rate_type').all());
});

// PUT /api/payroll/tax-rates/:id
router.put('/tax-rates/:id', (req, res) => {
  const db = getDb();
  const { rate, bracket_min, bracket_max, employer_match } = req.body;
  db.prepare(`UPDATE tax_rates SET rate = COALESCE(?, rate), bracket_min = COALESCE(?, bracket_min), bracket_max = COALESCE(?, bracket_max), employer_match = COALESCE(?, employer_match) WHERE id = ?`)
    .run(rate, bracket_min, bracket_max, employer_match, req.params.id);
  res.json({ message: 'Tax rate updated' });
});

// ============================================================
// PAYROLL SUMMARY & REPORTS
// ============================================================

// GET /api/payroll/summary
router.get('/summary', (req, res) => {
  const db = getDb();
  const { start_date, end_date } = req.query;
  const start = start_date || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const end = end_date || new Date().toISOString().slice(0, 10);

  const summary = db.prepare(`
    SELECT COUNT(*) as total_runs,
           COALESCE(SUM(total_gross), 0) as total_gross,
           COALESCE(SUM(total_net), 0) as total_net,
           COALESCE(SUM(total_deductions), 0) as total_deductions,
           COALESCE(SUM(total_employer_taxes), 0) as total_employer_taxes,
           COALESCE(SUM(total_tips), 0) as total_tips,
           COALESCE(SUM(employee_count), 0) as total_employee_payments
    FROM payroll_runs
    WHERE status IN ('approved', 'processed') AND pay_period_start >= ? AND pay_period_end <= ?
  `).get(start, end);

  const byEmployee = db.prepare(`
    SELECT e.id, e.first_name, e.last_name, e.role,
           SUM(pi.gross_pay) as total_gross, SUM(pi.net_pay) as total_net,
           SUM(pi.regular_hours) as total_regular_hours, SUM(pi.overtime_hours) as total_ot_hours,
           SUM(pi.total_tips) as total_tips
    FROM payroll_items pi
    JOIN employees e ON pi.employee_id = e.id
    JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
    WHERE pr.status IN ('approved', 'processed') AND pr.pay_period_start >= ? AND pr.pay_period_end <= ?
    GROUP BY e.id
    ORDER BY total_gross DESC
  `).all(start, end);

  res.json({ period: { start, end }, summary, by_employee: byEmployee });
});

// GET /api/payroll/employee/:id
router.get('/employee/:id', (req, res) => {
  const db = getDb();
  const history = db.prepare(`
    SELECT pi.*, pr.pay_period_start, pr.pay_period_end, pr.pay_date, pr.status as run_status
    FROM payroll_items pi
    JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
    WHERE pi.employee_id = ?
    ORDER BY pr.pay_period_end DESC
    LIMIT 26
  `).all(req.params.id);
  res.json(history);
});

module.exports = router;
