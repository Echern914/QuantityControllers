const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// GET /api/analytics/sales
router.get('/sales', (req, res) => {
  const db = getDb();
  const { start_date, end_date, group_by } = req.query;
  const start = start_date || new Date().toISOString().slice(0, 10);
  const end = end_date || start;

  const groupCol = group_by === 'hour' ? "strftime('%H', opened_at)" : "date(opened_at)";

  const sales = db.prepare(`
    SELECT ${groupCol} as period,
           COUNT(*) as order_count,
           SUM(subtotal) as gross_sales,
           SUM(discount) as total_discounts,
           SUM(tax) as tax_collected,
           SUM(total) as net_sales,
           SUM(tip) as total_tips,
           SUM(guest_count) as total_guests
    FROM orders
    WHERE status = 'closed' AND date(opened_at) >= ? AND date(opened_at) <= ?
    GROUP BY ${groupCol}
    ORDER BY period
  `).all(start, end);

  const summary = db.prepare(`
    SELECT COUNT(*) as order_count, COALESCE(SUM(total), 0) as total_sales,
           COALESCE(SUM(tip), 0) as total_tips, COALESCE(SUM(discount), 0) as total_discounts,
           COALESCE(SUM(tax), 0) as total_tax, COALESCE(AVG(total), 0) as avg_check,
           COALESCE(SUM(guest_count), 0) as total_guests
    FROM orders
    WHERE status = 'closed' AND date(opened_at) >= ? AND date(opened_at) <= ?
  `).get(start, end);

  res.json({ sales, summary });
});

// GET /api/analytics/product-mix
router.get('/product-mix', (req, res) => {
  const db = getDb();
  const days = parseInt(req.query.days || '7');

  const mix = db.prepare(`
    SELECT oi.menu_item_id, oi.name, mi.category_id, mc.name as category_name,
           SUM(oi.quantity) as total_qty,
           SUM(oi.unit_price * oi.quantity) as total_revenue,
           COUNT(DISTINCT oi.order_id) as order_count,
           AVG(oi.unit_price) as avg_price
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    LEFT JOIN menu_categories mc ON mi.category_id = mc.id
    WHERE o.status = 'closed' AND oi.voided = 0 AND o.opened_at >= datetime('now', '-' || ? || ' days')
    GROUP BY oi.menu_item_id
    ORDER BY total_revenue DESC
  `).all(days);

  const totalRevenue = mix.reduce((s, m) => s + m.total_revenue, 0);
  for (const item of mix) {
    item.revenue_percent = totalRevenue > 0 ? +(item.total_revenue / totalRevenue * 100).toFixed(1) : 0;
  }

  res.json(mix);
});

// GET /api/analytics/hourly
router.get('/hourly', (req, res) => {
  const db = getDb();
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  const hourly = db.prepare(`
    SELECT CAST(strftime('%H', opened_at) AS INTEGER) as hour,
           COUNT(*) as orders, SUM(total) as sales, SUM(guest_count) as guests
    FROM orders
    WHERE status = 'closed' AND date(opened_at) = ?
    GROUP BY hour
    ORDER BY hour
  `).all(date);

  // Fill missing hours
  const full = [];
  for (let h = 0; h < 24; h++) {
    const found = hourly.find(x => x.hour === h);
    full.push(found || { hour: h, orders: 0, sales: 0, guests: 0 });
  }

  res.json(full);
});

// GET /api/analytics/labor
router.get('/labor', (req, res) => {
  const db = getDb();
  const days = parseInt(req.query.days || '7');

  const labor = db.prepare(`
    SELECT e.id, e.first_name, e.last_name, e.role, e.hourly_rate,
           SUM(te.hours_worked) as total_hours,
           SUM(te.hours_worked * te.hourly_rate_snapshot) as labor_cost,
           SUM(te.tips) as total_tips,
           COUNT(te.id) as shift_count
    FROM employees e
    LEFT JOIN time_entries te ON e.id = te.employee_id AND te.clock_out IS NOT NULL AND te.clock_in >= datetime('now', '-' || ? || ' days')
    WHERE e.active = 1
    GROUP BY e.id
    ORDER BY labor_cost DESC
  `).all(days);

  const totalSales = db.prepare(`SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status = 'closed' AND opened_at >= datetime('now', '-' || ? || ' days')`).get(days).total;
  const totalLabor = labor.reduce((s, l) => s + (l.labor_cost || 0), 0);

  res.json({
    employees: labor,
    total_labor_cost: totalLabor,
    total_sales: totalSales,
    labor_cost_percent: totalSales > 0 ? +(totalLabor / totalSales * 100).toFixed(1) : 0,
  });
});

// GET /api/analytics/food-cost
router.get('/food-cost', (req, res) => {
  const db = getDb();
  const days = parseInt(req.query.days || '7');

  const items = db.prepare(`
    SELECT mi.id, mi.name, mi.price, mi.cost,
           COALESCE(SUM(oi.quantity), 0) as qty_sold,
           mi.price * COALESCE(SUM(oi.quantity), 0) as revenue,
           mi.cost * COALESCE(SUM(oi.quantity), 0) as total_cost,
           CASE WHEN mi.price > 0 THEN ROUND(mi.cost / mi.price * 100, 1) ELSE 0 END as food_cost_percent
    FROM menu_items mi
    LEFT JOIN order_items oi ON mi.id = oi.menu_item_id AND oi.voided = 0
    LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'closed' AND o.opened_at >= datetime('now', '-' || ? || ' days')
    WHERE mi.active = 1
    GROUP BY mi.id
    HAVING qty_sold > 0
    ORDER BY total_cost DESC
  `).all(days);

  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0);
  const totalCost = items.reduce((s, i) => s + i.total_cost, 0);

  res.json({
    items,
    total_revenue: totalRevenue,
    total_food_cost: totalCost,
    overall_food_cost_percent: totalRevenue > 0 ? +(totalCost / totalRevenue * 100).toFixed(1) : 0,
  });
});

// GET /api/analytics/trends
router.get('/trends', (req, res) => {
  const db = getDb();
  const weeks = parseInt(req.query.weeks || '4');

  const trends = db.prepare(`
    SELECT strftime('%Y-W%W', opened_at) as week,
           COUNT(*) as orders, SUM(total) as sales, AVG(total) as avg_check,
           SUM(guest_count) as guests
    FROM orders
    WHERE status = 'closed' AND opened_at >= datetime('now', '-' || ? || ' days')
    GROUP BY week
    ORDER BY week
  `).all(weeks * 7);

  res.json(trends);
});

// GET /api/analytics/realtime
router.get('/realtime', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const data = {
    open_orders: db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status IN ('open', 'sent', 'in-progress', 'ready')`).get().count,
    tables_occupied: db.prepare(`SELECT COUNT(*) as count FROM tables WHERE status = 'occupied'`).get().count,
    tables_total: db.prepare(`SELECT COUNT(*) as count FROM tables`).get().count,
    staff_clocked_in: db.prepare(`SELECT COUNT(*) as count FROM time_entries WHERE clock_out IS NULL`).get().count,
    today_sales: db.prepare(`SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status = 'closed' AND date(opened_at) = ?`).get(today).total,
    today_orders: db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'closed' AND date(opened_at) = ?`).get(today).count,
    today_tips: db.prepare(`SELECT COALESCE(SUM(tip), 0) as total FROM orders WHERE status = 'closed' AND date(opened_at) = ?`).get(today).total,
    today_guests: db.prepare(`SELECT COALESCE(SUM(guest_count), 0) as total FROM orders WHERE status = 'closed' AND date(opened_at) = ?`).get(today).total,
    kitchen_queue: db.prepare(`SELECT COUNT(*) as count FROM kitchen_queue WHERE status IN ('queued', 'preparing')`).get().count,
    active_alerts: db.prepare(`SELECT COUNT(*) as count FROM alerts WHERE acknowledged = 0`).get().count,
    avg_check: db.prepare(`SELECT COALESCE(AVG(total), 0) as avg FROM orders WHERE status = 'closed' AND date(opened_at) = ?`).get(today).avg,
    pending_reservations: db.prepare(`SELECT COUNT(*) as count FROM reservations WHERE reservation_date = ? AND status = 'confirmed'`).get(today).count,
  };

  res.json(data);
});

// GET /api/analytics/cogs - Cost of goods sold breakdown
router.get('/cogs', (req, res) => {
  const db = getDb();
  const days = parseInt(req.query.days || '7');

  const byCategory = db.prepare(`
    SELECT mc.name as category_name, mc.color,
           COALESCE(SUM(oi.quantity * oi.unit_price), 0) as revenue,
           COALESCE(SUM(oi.quantity * mi.cost), 0) as cogs
    FROM menu_categories mc
    LEFT JOIN menu_items mi ON mc.id = mi.category_id
    LEFT JOIN order_items oi ON mi.id = oi.menu_item_id AND oi.voided = 0
    LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'closed' AND o.opened_at >= datetime('now', '-' || ? || ' days')
    GROUP BY mc.id
    HAVING revenue > 0
    ORDER BY revenue DESC
  `).all(days);

  for (const cat of byCategory) {
    cat.cogs_percent = cat.revenue > 0 ? +((cat.cogs / cat.revenue) * 100).toFixed(1) : 0;
    cat.profit = +(cat.revenue - cat.cogs).toFixed(2);
  }

  const topCostItems = db.prepare(`
    SELECT mi.name, mi.price, mi.cost,
           COALESCE(SUM(oi.quantity), 0) as qty_sold,
           COALESCE(SUM(oi.quantity * oi.unit_price), 0) as revenue,
           COALESCE(SUM(oi.quantity * mi.cost), 0) as total_cogs,
           mc.name as category_name
    FROM menu_items mi
    LEFT JOIN order_items oi ON mi.id = oi.menu_item_id AND oi.voided = 0
    LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'closed' AND o.opened_at >= datetime('now', '-' || ? || ' days')
    LEFT JOIN menu_categories mc ON mi.category_id = mc.id
    WHERE mi.active = 1
    GROUP BY mi.id
    HAVING qty_sold > 0
    ORDER BY total_cogs DESC
    LIMIT 10
  `).all(days);

  for (const item of topCostItems) {
    item.cogs_percent = item.revenue > 0 ? +((item.total_cogs / item.revenue) * 100).toFixed(1) : 0;
    item.profit_per_unit = +(item.price - item.cost).toFixed(2);
  }

  const totalRevenue = byCategory.reduce((s, c) => s + c.revenue, 0);
  const totalCogs = byCategory.reduce((s, c) => s + c.cogs, 0);

  res.json({
    total_revenue: +totalRevenue.toFixed(2),
    total_cogs: +totalCogs.toFixed(2),
    cogs_percent: totalRevenue > 0 ? +((totalCogs / totalRevenue) * 100).toFixed(1) : 0,
    gross_profit: +(totalRevenue - totalCogs).toFixed(2),
    by_category: byCategory,
    top_cost_items: topCostItems
  });
});

// GET /api/analytics/waste-summary
router.get('/waste-summary', (req, res) => {
  const db = getDb();
  const days = parseInt(req.query.days || '7');

  const topWasted = db.prepare(`
    SELECT i.name, i.unit, SUM(w.quantity) as total_qty, SUM(w.cost) as total_cost,
           COUNT(*) as incident_count
    FROM waste_log w
    JOIN ingredients i ON w.ingredient_id = i.id
    WHERE w.created_at >= datetime('now', '-' || ? || ' days')
    GROUP BY w.ingredient_id
    ORDER BY total_cost DESC
    LIMIT 10
  `).all(days);

  const byReason = db.prepare(`
    SELECT w.reason, COUNT(*) as count, SUM(w.cost) as total_cost
    FROM waste_log w
    WHERE w.created_at >= datetime('now', '-' || ? || ' days')
    GROUP BY w.reason
    ORDER BY total_cost DESC
  `).all(days);

  const dailyTrend = db.prepare(`
    SELECT date(w.created_at) as date, SUM(w.cost) as cost, COUNT(*) as incidents
    FROM waste_log w
    WHERE w.created_at >= datetime('now', '-' || ? || ' days')
    GROUP BY date(w.created_at)
    ORDER BY date
  `).all(days);

  const totalWasteCost = topWasted.reduce((s, w) => s + w.total_cost, 0);

  res.json({
    total_waste_cost: +totalWasteCost.toFixed(2),
    top_wasted: topWasted,
    by_reason: byReason,
    daily_trend: dailyTrend
  });
});

// GET /api/analytics/inventory-health
router.get('/inventory-health', (req, res) => {
  const db = getDb();

  const belowPar = db.prepare(`
    SELECT i.id, i.name, i.unit, i.par_level,
           COALESCE(SUM(CASE WHEN inv.status != 'empty' THEN inv.quantity ELSE 0 END), 0) as current_stock
    FROM ingredients i
    LEFT JOIN inventory inv ON i.id = inv.ingredient_id
    WHERE i.active = 1 AND i.par_level > 0
    GROUP BY i.id
    HAVING current_stock < par_level
    ORDER BY (current_stock * 1.0 / par_level) ASC
  `).all();

  const expiringSoon = db.prepare(`
    SELECT COUNT(*) as count FROM inventory
    WHERE expiration_date IS NOT NULL AND status != 'empty'
      AND date(expiration_date) <= date('now', '+3 days')
  `).get().count;

  const totalValue = db.prepare(`
    SELECT COALESCE(SUM(inv.quantity * i.cost_per_unit), 0) as value
    FROM inventory inv
    JOIN ingredients i ON inv.ingredient_id = i.id
    WHERE inv.status != 'empty'
  `).get().value;

  const totalItems = db.prepare(`
    SELECT COUNT(DISTINCT ingredient_id) as count FROM inventory WHERE status != 'empty'
  `).get().count;

  const locationBreakdown = db.prepare(`
    SELECT inv.location, COUNT(DISTINCT inv.ingredient_id) as item_count,
           COALESCE(SUM(inv.quantity * i.cost_per_unit), 0) as value
    FROM inventory inv
    JOIN ingredients i ON inv.ingredient_id = i.id
    WHERE inv.status != 'empty'
    GROUP BY inv.location
    ORDER BY value DESC
  `).all();

  res.json({
    below_par_count: belowPar.length,
    below_par_items: belowPar.slice(0, 8),
    expiring_soon: expiringSoon,
    total_inventory_value: +totalValue.toFixed(2),
    total_items: totalItems,
    location_breakdown: locationBreakdown
  });
});

module.exports = router;
