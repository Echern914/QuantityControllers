const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// POST /api/reports/x-report (mid-shift snapshot)
router.post('/x-report', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const report = {
    type: 'X-Report',
    generated_at: new Date().toISOString(),
    date: today,
    sales: db.prepare(`
      SELECT COUNT(*) as order_count,
             COALESCE(SUM(subtotal), 0) as gross_sales,
             COALESCE(SUM(discount), 0) as total_discounts,
             COALESCE(SUM(tax), 0) as tax_collected,
             COALESCE(SUM(total), 0) as net_sales,
             COALESCE(SUM(tip), 0) as total_tips,
             COALESCE(SUM(guest_count), 0) as guest_count,
             COALESCE(AVG(total), 0) as avg_check
      FROM orders WHERE status = 'closed' AND date(opened_at) = ?
    `).get(today),
    payments: db.prepare(`
      SELECT payment_method, COUNT(*) as count, SUM(amount) as total, SUM(tip) as tips
      FROM order_payments op
      JOIN orders o ON op.order_id = o.id
      WHERE o.status = 'closed' AND date(o.opened_at) = ?
      GROUP BY payment_method
    `).all(today),
    voids: db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'voided' AND date(opened_at) = ?`).get(today),
    open_orders: db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM orders WHERE status IN ('open', 'sent', 'ready') AND date(opened_at) = ?`).get(today),
    top_items: db.prepare(`
      SELECT oi.name, SUM(oi.quantity) as qty, SUM(oi.unit_price * oi.quantity) as revenue
      FROM order_items oi JOIN orders o ON oi.order_id = o.id
      WHERE o.status = 'closed' AND oi.voided = 0 AND date(o.opened_at) = ?
      GROUP BY oi.menu_item_id ORDER BY revenue DESC LIMIT 10
    `).all(today),
  };

  res.json(report);
});

// POST /api/reports/z-report (end of day)
router.post('/z-report', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const sales = db.prepare(`
    SELECT COUNT(*) as order_count,
           COALESCE(SUM(subtotal), 0) as gross_sales,
           COALESCE(SUM(discount), 0) as total_discounts,
           COALESCE(SUM(tax), 0) as tax_collected,
           COALESCE(SUM(total), 0) as net_sales,
           COALESCE(SUM(tip), 0) as total_tips,
           COALESCE(SUM(guest_count), 0) as guest_count
    FROM orders WHERE status = 'closed' AND date(opened_at) = ?
  `).get(today);

  const payments = db.prepare(`
    SELECT payment_method, SUM(amount) as total
    FROM order_payments op JOIN orders o ON op.order_id = o.id
    WHERE o.status = 'closed' AND date(o.opened_at) = ?
    GROUP BY payment_method
  `).all(today);

  const cashTotal = payments.find(p => p.payment_method === 'cash')?.total || 0;
  const cardTotal = payments.find(p => p.payment_method === 'card')?.total || 0;

  const laborCost = db.prepare(`
    SELECT COALESCE(SUM(hours_worked * hourly_rate_snapshot), 0) as total
    FROM time_entries WHERE date(clock_in) = ? AND clock_out IS NOT NULL
  `).get(today).total;

  // Save to daily_reports
  db.prepare(`
    INSERT OR REPLACE INTO daily_reports (report_date, gross_sales, net_sales, tax_collected, total_discounts, total_tips, cash_total, card_total, order_count, guest_count, labor_cost, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(today, sales.gross_sales, sales.net_sales, sales.tax_collected, sales.total_discounts, sales.total_tips, cashTotal, cardTotal, sales.order_count, sales.guest_count, laborCost);

  const report = {
    type: 'Z-Report',
    date: today,
    generated_at: new Date().toISOString(),
    ...sales,
    payments,
    cash_total: cashTotal,
    card_total: cardTotal,
    labor_cost: laborCost,
    labor_percent: sales.net_sales > 0 ? +(laborCost / sales.net_sales * 100).toFixed(1) : 0,
    voids: db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'voided' AND date(opened_at) = ?`).get(today).count,
    refunds: db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM order_payments WHERE refunded = 1 AND date(created_at) = ?`).get(today),
    waste: db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(cost), 0) as total FROM waste_log WHERE date(created_at) = ?`).get(today),
  };

  res.json(report);
});

// GET /api/reports/daily/:date
router.get('/daily/:date', (req, res) => {
  const db = getDb();
  const report = db.prepare(`SELECT * FROM daily_reports WHERE report_date = ?`).get(req.params.date);
  if (!report) return res.status(404).json({ error: 'No report for this date. Run Z-Report first.' });
  res.json(report);
});

// GET /api/reports/weekly
router.get('/weekly', (req, res) => {
  const db = getDb();
  const weeks = parseInt(req.query.weeks || '4');
  const reports = db.prepare(`
    SELECT strftime('%Y-W%W', report_date) as week,
           SUM(gross_sales) as gross_sales, SUM(net_sales) as net_sales,
           SUM(tax_collected) as tax, SUM(total_tips) as tips,
           SUM(order_count) as orders, SUM(guest_count) as guests,
           SUM(labor_cost) as labor, AVG(net_sales) as avg_daily_sales
    FROM daily_reports
    WHERE report_date >= date('now', '-' || ? || ' days')
    GROUP BY week ORDER BY week
  `).all(weeks * 7);
  res.json(reports);
});

// GET /api/reports/pl - Profit & Loss
router.get('/pl', (req, res) => {
  const db = getDb();
  const { start_date, end_date } = req.query;
  const start = start_date || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const end = end_date || new Date().toISOString().slice(0, 10);

  const revenue = db.prepare(`SELECT COALESCE(SUM(net_sales), 0) as total FROM daily_reports WHERE report_date >= ? AND report_date <= ?`).get(start, end);
  const labor = db.prepare(`SELECT COALESCE(SUM(labor_cost), 0) as total FROM daily_reports WHERE report_date >= ? AND report_date <= ?`).get(start, end);
  const waste = db.prepare(`SELECT COALESCE(SUM(cost), 0) as total FROM waste_log WHERE date(created_at) >= ? AND date(created_at) <= ?`).get(start, end);
  const cogs = db.prepare(`
    SELECT COALESCE(SUM(t.quantity * i.cost_per_unit), 0) as total
    FROM transactions t JOIN ingredients i ON t.ingredient_id = i.id
    WHERE t.type = 'sale' AND date(t.created_at) >= ? AND date(t.created_at) <= ?
  `).get(start, end);

  const pl = {
    period: { start, end },
    revenue: revenue.total,
    cost_of_goods: cogs.total,
    gross_profit: revenue.total - cogs.total,
    gross_margin: revenue.total > 0 ? +((revenue.total - cogs.total) / revenue.total * 100).toFixed(1) : 0,
    labor_cost: labor.total,
    waste_cost: waste.total,
    total_expenses: cogs.total + labor.total + waste.total,
    net_profit: revenue.total - cogs.total - labor.total - waste.total,
    net_margin: revenue.total > 0 ? +((revenue.total - cogs.total - labor.total - waste.total) / revenue.total * 100).toFixed(1) : 0,
  };

  res.json(pl);
});

module.exports = router;
