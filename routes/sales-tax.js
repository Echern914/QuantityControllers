const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

// All routes require auth
router.use(authenticate);

// ============================================================
//  STATE PROFILES — All 50 states + DC tax info
// ============================================================

// GET /api/sales-tax/states — List all state tax profiles
router.get('/states', (req, res) => {
  const db = getDb();
  const states = db.prepare(`SELECT * FROM state_tax_profiles ORDER BY state_name`).all();
  res.json(states);
});

// GET /api/sales-tax/states/:code — Single state profile
router.get('/states/:code', (req, res) => {
  const db = getDb();
  const state = db.prepare(`SELECT * FROM state_tax_profiles WHERE state_code = ?`).get(req.params.code.toUpperCase());
  if (!state) return res.status(404).json({ error: 'State not found' });
  res.json(state);
});

// ============================================================
//  TAX CONFIGURATION — Business's active tax setup
// ============================================================

// GET /api/sales-tax/config — Get active tax config
router.get('/config', (req, res) => {
  const db = getDb();
  const config = db.prepare(`SELECT * FROM sales_tax_config WHERE active = 1`).all();
  const rules = db.prepare(`SELECT r.*, c.state_code FROM sales_tax_rules r JOIN sales_tax_config c ON r.config_id = c.id WHERE c.active = 1`).all();
  res.json({ config, rules });
});

// POST /api/sales-tax/config — Set up tax config from state selection
router.post('/config', (req, res) => {
  const { state_code, county_name, county_rate, city_name, city_rate, special_district_rate } = req.body;
  if (!state_code) return res.status(400).json({ error: 'State code required' });

  const db = getDb();
  const state = db.prepare(`SELECT * FROM state_tax_profiles WHERE state_code = ?`).get(state_code.toUpperCase());
  if (!state) return res.status(404).json({ error: 'State not found' });

  // Deactivate existing configs
  db.prepare(`UPDATE sales_tax_config SET active = 0`).run();

  const result = db.prepare(`
    INSERT INTO sales_tax_config (state_code, state_name, state_rate, county_name, county_rate, city_name, city_rate, special_district_rate, food_taxed, food_rate_override, alcohol_rate_override, has_reduced_food_rate, filing_frequency)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    state.state_code, state.state_name, state.base_sales_tax_rate,
    county_name || null, county_rate || 0,
    city_name || null, city_rate || 0,
    special_district_rate || 0,
    state.prepared_food_taxed,
    state.food_reduced_rate,
    state.alcohol_extra_rate > 0 ? state.base_sales_tax_rate + state.alcohol_extra_rate : null,
    state.food_reduced_rate ? 1 : 0,
    JSON.parse(state.filing_frequencies)[0]
  );

  // Auto-create default rules based on state profile
  const configId = result.lastInsertRowid;
  const insertRule = db.prepare(`INSERT INTO sales_tax_rules (config_id, rule_type, description, category, exempt, special_rate, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`);

  if (!state.grocery_taxed) {
    insertRule.run(configId, 'exemption', 'Unprepared grocery items exempt from state tax', 'grocery', 1, null, `${state.state_name} exempts grocery items from sales tax`);
  }
  if (state.food_reduced_rate) {
    insertRule.run(configId, 'reduced_rate', `Grocery/unprepared food at reduced rate of ${(state.food_reduced_rate * 100).toFixed(2)}%`, 'grocery', 0, state.food_reduced_rate, 'Reduced rate applies to unprepared food items');
  }
  if (state.alcohol_extra_rate > 0) {
    insertRule.run(configId, 'surcharge', `Alcohol taxed at additional ${(state.alcohol_extra_rate * 100).toFixed(1)}%`, 'alcohol', 0, state.base_sales_tax_rate + state.alcohol_extra_rate, `Total alcohol rate: ${((state.base_sales_tax_rate + state.alcohol_extra_rate) * 100).toFixed(1)}%`);
  }
  insertRule.run(configId, 'standard', 'Prepared food/meals taxed at combined rate', 'prepared_food', 0, null, 'Standard rate applies to all restaurant meals');

  // Update the settings tax_rate to match
  const combined = state.base_sales_tax_rate + (county_rate || 0) + (city_rate || 0) + (special_district_rate || 0);
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('tax_rate', ?)`).run(String(combined.toFixed(4)));

  const created = db.prepare(`SELECT * FROM sales_tax_config WHERE id = ?`).get(configId);
  const createdRules = db.prepare(`SELECT * FROM sales_tax_rules WHERE config_id = ?`).all(configId);
  res.json({ config: created, rules: createdRules });
});

// PUT /api/sales-tax/config/:id — Update tax config
router.put('/config/:id', (req, res) => {
  const { county_name, county_rate, city_name, city_rate, special_district_rate, filing_frequency } = req.body;
  const db = getDb();

  db.prepare(`
    UPDATE sales_tax_config SET county_name = ?, county_rate = ?, city_name = ?, city_rate = ?, special_district_rate = ?, filing_frequency = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(county_name || null, county_rate || 0, city_name || null, city_rate || 0, special_district_rate || 0, filing_frequency || 'monthly', req.params.id);

  // Update settings tax_rate
  const config = db.prepare(`SELECT * FROM sales_tax_config WHERE id = ?`).get(req.params.id);
  if (config) {
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('tax_rate', ?)`).run(String(config.combined_rate.toFixed(4)));
  }

  res.json(config);
});

// ============================================================
//  TAX COLLECTED — Transaction-level tax tracking
// ============================================================

// GET /api/sales-tax/collected — Tax collected with date filters
router.get('/collected', (req, res) => {
  const db = getDb();
  const { start, end, period } = req.query;
  let startDate, endDate;

  if (start && end) {
    startDate = start;
    endDate = end;
  } else {
    const now = new Date();
    switch (period) {
      case 'week': {
        const d = new Date(now); d.setDate(d.getDate() - 7);
        startDate = d.toISOString().slice(0, 10);
        endDate = now.toISOString().slice(0, 10);
        break;
      }
      case 'month': {
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        endDate = now.toISOString().slice(0, 10);
        break;
      }
      case 'quarter': {
        const qStart = Math.floor(now.getMonth() / 3) * 3;
        startDate = `${now.getFullYear()}-${String(qStart + 1).padStart(2, '0')}-01`;
        endDate = now.toISOString().slice(0, 10);
        break;
      }
      case 'year': {
        startDate = `${now.getFullYear()}-01-01`;
        endDate = now.toISOString().slice(0, 10);
        break;
      }
      default: {
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        endDate = now.toISOString().slice(0, 10);
      }
    }
  }

  const records = db.prepare(`SELECT * FROM sales_tax_collected WHERE sale_date BETWEEN ? AND ? ORDER BY sale_date DESC`).all(startDate, endDate);

  const summary = db.prepare(`
    SELECT
      COUNT(*) as transaction_count,
      COALESCE(SUM(subtotal), 0) as total_sales,
      COALESCE(SUM(food_amount), 0) as total_food,
      COALESCE(SUM(beverage_amount), 0) as total_beverage,
      COALESCE(SUM(alcohol_amount), 0) as total_alcohol,
      COALESCE(SUM(other_amount), 0) as total_other,
      COALESCE(SUM(total_tax), 0) as total_tax_collected,
      COALESCE(SUM(food_tax), 0) as total_food_tax,
      COALESCE(SUM(beverage_tax), 0) as total_beverage_tax,
      COALESCE(SUM(alcohol_tax), 0) as total_alcohol_tax,
      COALESCE(SUM(other_tax), 0) as total_other_tax,
      COALESCE(SUM(state_portion), 0) as total_state_portion,
      COALESCE(SUM(county_portion), 0) as total_county_portion,
      COALESCE(SUM(city_portion), 0) as total_city_portion,
      COALESCE(SUM(special_portion), 0) as total_special_portion
    FROM sales_tax_collected WHERE sale_date BETWEEN ? AND ?
  `).get(startDate, endDate);

  // Daily breakdown
  const daily = db.prepare(`
    SELECT sale_date, COUNT(*) as transactions, SUM(subtotal) as sales, SUM(total_tax) as tax
    FROM sales_tax_collected WHERE sale_date BETWEEN ? AND ?
    GROUP BY sale_date ORDER BY sale_date
  `).all(startDate, endDate);

  res.json({ records, summary, daily, period: { start: startDate, end: endDate } });
});

// GET /api/sales-tax/dashboard — High-level dashboard data
router.get('/dashboard', (req, res) => {
  const db = getDb();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const yearStart = `${now.getFullYear()}-01-01`;
  const qStart = Math.floor(now.getMonth() / 3) * 3;
  const quarterStart = `${now.getFullYear()}-${String(qStart + 1).padStart(2, '0')}-01`;

  const todaySummary = db.prepare(`
    SELECT COALESCE(SUM(subtotal), 0) as sales, COALESCE(SUM(total_tax), 0) as tax, COUNT(*) as transactions
    FROM sales_tax_collected WHERE sale_date = ?
  `).get(today);

  const monthSummary = db.prepare(`
    SELECT COALESCE(SUM(subtotal), 0) as sales, COALESCE(SUM(total_tax), 0) as tax, COUNT(*) as transactions
    FROM sales_tax_collected WHERE sale_date BETWEEN ? AND ?
  `).get(monthStart, today);

  const quarterSummary = db.prepare(`
    SELECT COALESCE(SUM(subtotal), 0) as sales, COALESCE(SUM(total_tax), 0) as tax, COUNT(*) as transactions
    FROM sales_tax_collected WHERE sale_date BETWEEN ? AND ?
  `).get(quarterStart, today);

  const yearSummary = db.prepare(`
    SELECT COALESCE(SUM(subtotal), 0) as sales, COALESCE(SUM(total_tax), 0) as tax, COUNT(*) as transactions
    FROM sales_tax_collected WHERE sale_date BETWEEN ? AND ?
  `).get(yearStart, today);

  // Active config
  const config = db.prepare(`SELECT * FROM sales_tax_config WHERE active = 1`).get();

  // Upcoming deadlines
  const deadlines = config ? db.prepare(`
    SELECT * FROM sales_tax_filing_deadlines
    WHERE state_code = ? AND frequency = ? AND active = 1
    ORDER BY month, day_of_month
  `).all(config.state_code, config.filing_frequency) : [];

  // Recent filings
  const recentFilings = db.prepare(`SELECT * FROM sales_tax_filings ORDER BY period_end DESC LIMIT 6`).all();

  // Monthly trend (last 12 months)
  const trend = db.prepare(`
    SELECT strftime('%Y-%m', sale_date) as month, SUM(subtotal) as sales, SUM(total_tax) as tax
    FROM sales_tax_collected
    WHERE sale_date >= date('now', '-12 months')
    GROUP BY strftime('%Y-%m', sale_date)
    ORDER BY month
  `).all();

  // Category breakdown this month
  const categoryBreakdown = db.prepare(`
    SELECT
      COALESCE(SUM(food_tax), 0) as food_tax,
      COALESCE(SUM(beverage_tax), 0) as beverage_tax,
      COALESCE(SUM(alcohol_tax), 0) as alcohol_tax,
      COALESCE(SUM(other_tax), 0) as other_tax
    FROM sales_tax_collected WHERE sale_date BETWEEN ? AND ?
  `).get(monthStart, today);

  res.json({
    today: todaySummary,
    month: monthSummary,
    quarter: quarterSummary,
    year: yearSummary,
    config,
    deadlines,
    recentFilings,
    trend,
    categoryBreakdown,
  });
});

// ============================================================
//  FILINGS — Tax return management
// ============================================================

// GET /api/sales-tax/filings — List filings
router.get('/filings', (req, res) => {
  const db = getDb();
  const { status, year } = req.query;
  let query = `SELECT * FROM sales_tax_filings WHERE 1=1`;
  const params = [];

  if (status) { query += ` AND status = ?`; params.push(status); }
  if (year) { query += ` AND strftime('%Y', period_start) = ?`; params.push(year); }

  query += ` ORDER BY period_end DESC`;
  res.json(db.prepare(query).all(...params));
});

// POST /api/sales-tax/filings — Create/generate a filing
router.post('/filings', (req, res) => {
  const { period_start, period_end } = req.body;
  const db = getDb();

  const config = db.prepare(`SELECT * FROM sales_tax_config WHERE active = 1`).get();
  if (!config) return res.status(400).json({ error: 'No tax configuration set up. Select your state first.' });

  // Aggregate tax data for the period
  const agg = db.prepare(`
    SELECT
      COALESCE(SUM(subtotal), 0) as gross_sales,
      COALESCE(SUM(CASE WHEN total_tax > 0 THEN subtotal ELSE 0 END), 0) as taxable_sales,
      COALESCE(SUM(CASE WHEN total_tax = 0 THEN subtotal ELSE 0 END), 0) as exempt_sales,
      COALESCE(SUM(total_tax), 0) as tax_collected,
      COALESCE(SUM(state_portion), 0) as state_tax,
      COALESCE(SUM(county_portion), 0) as county_tax,
      COALESCE(SUM(city_portion), 0) as city_tax,
      COALESCE(SUM(special_portion), 0) as special_tax
    FROM sales_tax_collected WHERE sale_date BETWEEN ? AND ?
  `).get(period_start, period_end);

  // Determine due date (20th of month after period end)
  const endDate = new Date(period_end);
  const dueMonth = endDate.getMonth() + 2;
  const dueYear = endDate.getFullYear() + (dueMonth > 12 ? 1 : 0);
  const dueDate = `${dueYear}-${String((dueMonth - 1) % 12 + 1).padStart(2, '0')}-20`;

  const result = db.prepare(`
    INSERT INTO sales_tax_filings (period_start, period_end, filing_frequency, state_code, total_gross_sales, total_taxable_sales, total_exempt_sales, total_tax_collected, state_tax_due, county_tax_due, city_tax_due, special_tax_due, total_tax_due, due_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    period_start, period_end, config.filing_frequency, config.state_code,
    agg.gross_sales, agg.taxable_sales, agg.exempt_sales, agg.tax_collected,
    agg.state_tax, agg.county_tax, agg.city_tax, agg.special_tax,
    agg.tax_collected, dueDate
  );

  const filing = db.prepare(`SELECT * FROM sales_tax_filings WHERE id = ?`).get(result.lastInsertRowid);
  res.json(filing);
});

// PATCH /api/sales-tax/filings/:id — Update filing status
router.patch('/filings/:id', (req, res) => {
  const { status, confirmation_number, filed_date, notes, adjustments, penalties } = req.body;
  const db = getDb();

  const sets = [];
  const params = [];

  if (status) { sets.push('status = ?'); params.push(status); }
  if (confirmation_number) { sets.push('confirmation_number = ?'); params.push(confirmation_number); }
  if (filed_date) { sets.push('filed_date = ?'); params.push(filed_date); }
  if (notes !== undefined) { sets.push('notes = ?'); params.push(notes); }
  if (adjustments !== undefined) { sets.push('adjustments = ?'); params.push(adjustments); }
  if (penalties !== undefined) { sets.push('penalties = ?'); params.push(penalties); }

  sets.push('updated_at = CURRENT_TIMESTAMP');
  params.push(req.params.id);

  db.prepare(`UPDATE sales_tax_filings SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  const filing = db.prepare(`SELECT * FROM sales_tax_filings WHERE id = ?`).get(req.params.id);
  res.json(filing);
});

// ============================================================
//  EXEMPTIONS
// ============================================================

router.get('/exemptions', (req, res) => {
  const db = getDb();
  res.json(db.prepare(`SELECT e.*, c.first_name, c.last_name FROM sales_tax_exemptions e LEFT JOIN customers c ON e.customer_id = c.id WHERE e.active = 1 ORDER BY e.created_at DESC`).all());
});

router.post('/exemptions', (req, res) => {
  const { customer_id, exemption_type, certificate_number, issuing_state, expiration_date, notes } = req.body;
  const db = getDb();
  const config = db.prepare(`SELECT id FROM sales_tax_config WHERE active = 1`).get();

  const result = db.prepare(`
    INSERT INTO sales_tax_exemptions (config_id, customer_id, exemption_type, certificate_number, issuing_state, expiration_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(config?.id || null, customer_id || null, exemption_type, certificate_number, issuing_state, expiration_date, notes);

  res.json(db.prepare(`SELECT * FROM sales_tax_exemptions WHERE id = ?`).get(result.lastInsertRowid));
});

// ============================================================
//  REPORTS — Exportable tax reports
// ============================================================

// GET /api/sales-tax/report — Generate detailed tax report
router.get('/report', (req, res) => {
  const { start, end, format } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'Start and end dates required' });

  const db = getDb();
  const config = db.prepare(`SELECT * FROM sales_tax_config WHERE active = 1`).get();

  // Overall summary
  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_transactions,
      COALESCE(SUM(subtotal), 0) as gross_sales,
      COALESCE(SUM(food_amount), 0) as food_sales,
      COALESCE(SUM(beverage_amount), 0) as beverage_sales,
      COALESCE(SUM(alcohol_amount), 0) as alcohol_sales,
      COALESCE(SUM(other_amount), 0) as other_sales,
      COALESCE(SUM(total_tax), 0) as total_tax,
      COALESCE(SUM(food_tax), 0) as food_tax,
      COALESCE(SUM(beverage_tax), 0) as beverage_tax,
      COALESCE(SUM(alcohol_tax), 0) as alcohol_tax,
      COALESCE(SUM(state_portion), 0) as state_tax,
      COALESCE(SUM(county_portion), 0) as county_tax,
      COALESCE(SUM(city_portion), 0) as city_tax,
      COALESCE(SUM(special_portion), 0) as special_tax
    FROM sales_tax_collected WHERE sale_date BETWEEN ? AND ?
  `).get(start, end);

  // Daily detail
  const daily = db.prepare(`
    SELECT sale_date, COUNT(*) as transactions,
      SUM(subtotal) as sales, SUM(total_tax) as tax,
      SUM(food_tax) as food_tax, SUM(alcohol_tax) as alcohol_tax,
      SUM(state_portion) as state_tax, SUM(county_portion) as county_tax, SUM(city_portion) as city_tax
    FROM sales_tax_collected WHERE sale_date BETWEEN ? AND ?
    GROUP BY sale_date ORDER BY sale_date
  `).all(start, end);

  // Monthly breakdown
  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', sale_date) as month,
      COUNT(*) as transactions, SUM(subtotal) as sales, SUM(total_tax) as tax,
      SUM(state_portion) as state_tax, SUM(county_portion) as county_tax, SUM(city_portion) as city_tax
    FROM sales_tax_collected WHERE sale_date BETWEEN ? AND ?
    GROUP BY strftime('%Y-%m', sale_date) ORDER BY month
  `).all(start, end);

  if (format === 'csv') {
    let csv = 'Date,Transactions,Gross Sales,Total Tax,State Tax,County Tax,City Tax,Food Tax,Alcohol Tax\n';
    for (const d of daily) {
      csv += `${d.sale_date},${d.transactions},${d.sales.toFixed(2)},${d.tax.toFixed(2)},${d.state_tax.toFixed(2)},${d.county_tax.toFixed(2)},${d.city_tax.toFixed(2)},${d.food_tax.toFixed(2)},${d.alcohol_tax.toFixed(2)}\n`;
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=sales-tax-report-${start}-to-${end}.csv`);
    return res.send(csv);
  }

  res.json({ config, summary, daily, monthly, period: { start, end } });
});

module.exports = router;
