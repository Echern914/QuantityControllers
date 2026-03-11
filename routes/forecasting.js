const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// ============================================================
// SALES FORECASTING (Historical pattern-based)
// ============================================================

// GET /api/forecasting/sales
router.get('/sales', (req, res) => {
  const db = getDb();
  const { days_ahead } = req.query;
  const ahead = parseInt(days_ahead || '7');

  // Analyze historical patterns by day of week
  const patterns = db.prepare(`
    SELECT CAST(strftime('%w', opened_at) AS INTEGER) as dow,
           COUNT(*) / COUNT(DISTINCT date(opened_at)) as avg_orders,
           AVG(total) as avg_check,
           SUM(total) / COUNT(DISTINCT date(opened_at)) as avg_daily_sales,
           SUM(guest_count) / COUNT(DISTINCT date(opened_at)) as avg_daily_guests
    FROM orders WHERE status = 'closed' AND opened_at >= datetime('now', '-90 days')
    GROUP BY dow
  `).all();

  const patternMap = {};
  for (const p of patterns) { patternMap[p.dow] = p; }

  // Weekly trend (are we trending up or down?)
  const recentWeeks = db.prepare(`
    SELECT strftime('%Y-W%W', opened_at) as week, SUM(total) as sales
    FROM orders WHERE status = 'closed' AND opened_at >= datetime('now', '-28 days')
    GROUP BY week ORDER BY week
  `).all();

  let trendMultiplier = 1;
  if (recentWeeks.length >= 2) {
    const lastWeek = recentWeeks[recentWeeks.length - 1]?.sales || 0;
    const prevWeek = recentWeeks[recentWeeks.length - 2]?.sales || 0;
    if (prevWeek > 0) trendMultiplier = Math.max(0.8, Math.min(1.2, lastWeek / prevWeek));
  }

  // Generate forecasts
  const forecasts = [];
  const today = new Date();
  for (let i = 1; i <= ahead; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dow = date.getDay();
    const dateStr = date.toISOString().slice(0, 10);
    const pattern = patternMap[dow] || { avg_orders: 0, avg_check: 0, avg_daily_sales: 0, avg_daily_guests: 0 };

    const predictedSales = +(pattern.avg_daily_sales * trendMultiplier).toFixed(2);
    const predictedOrders = Math.round(pattern.avg_orders * trendMultiplier);
    const predictedGuests = Math.round(pattern.avg_daily_guests * trendMultiplier);

    // Confidence decreases with distance
    const confidence = Math.max(0.5, 1 - (i * 0.04));

    forecasts.push({
      date: dateStr,
      day_of_week: dow,
      day_name: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow],
      predicted_sales: predictedSales,
      predicted_orders: predictedOrders,
      predicted_guests: predictedGuests,
      avg_check: +pattern.avg_check.toFixed(2),
      confidence: +confidence.toFixed(2),
    });

    // Save to DB
    db.prepare(`INSERT OR REPLACE INTO sales_forecasts (forecast_date, day_of_week, predicted_sales, predicted_orders, predicted_guests, confidence, model_version)
      VALUES (?, ?, ?, ?, ?, ?, 'pattern_v1')`)
      .run(dateStr, dow, predictedSales, predictedOrders, predictedGuests, confidence);
  }

  res.json({ trend_multiplier: +trendMultiplier.toFixed(3), forecasts });
});

// GET /api/forecasting/sales/accuracy
router.get('/sales/accuracy', (req, res) => {
  const db = getDb();
  const results = db.prepare(`
    SELECT sf.forecast_date, sf.predicted_sales, sf.predicted_orders,
           COALESCE(SUM(o.total), 0) as actual_sales,
           COUNT(o.id) as actual_orders,
           ABS(sf.predicted_sales - COALESCE(SUM(o.total), 0)) as sales_error,
           CASE WHEN sf.predicted_sales > 0 THEN ABS(sf.predicted_sales - COALESCE(SUM(o.total), 0)) / sf.predicted_sales * 100 ELSE 0 END as error_percent
    FROM sales_forecasts sf
    LEFT JOIN orders o ON date(o.opened_at) = sf.forecast_date AND o.status = 'closed'
    WHERE sf.forecast_date < date('now') AND sf.forecast_date >= date('now', '-30 days')
    GROUP BY sf.forecast_date
    ORDER BY sf.forecast_date DESC
  `).all();

  const avgError = results.length > 0 ? results.reduce((s, r) => s + r.error_percent, 0) / results.length : 0;

  res.json({ forecasts: results, avg_error_percent: +avgError.toFixed(1), accuracy_percent: +(100 - avgError).toFixed(1) });
});

// ============================================================
// LABOR FORECASTING
// ============================================================

// GET /api/forecasting/labor
router.get('/labor', (req, res) => {
  const db = getDb();
  const { date } = req.query;
  const targetDate = date || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const dow = new Date(targetDate).getDay();

  // Historical staffing patterns by hour for this day of week
  const hourlyPatterns = db.prepare(`
    SELECT CAST(strftime('%H', te.clock_in) AS INTEGER) as hour,
           COUNT(DISTINCT te.employee_id) as avg_staff,
           GROUP_CONCAT(DISTINCT e.role) as roles
    FROM time_entries te
    JOIN employees e ON te.employee_id = e.id
    WHERE CAST(strftime('%w', te.clock_in) AS INTEGER) = ?
      AND te.clock_in >= datetime('now', '-60 days')
    GROUP BY hour
    ORDER BY hour
  `).all(dow);

  // Sales pattern for this day
  const salesPattern = db.prepare(`
    SELECT CAST(strftime('%H', opened_at) AS INTEGER) as hour,
           AVG(total) as avg_hourly_sales,
           AVG(guest_count) as avg_hourly_guests
    FROM orders WHERE status = 'closed'
      AND CAST(strftime('%w', opened_at) AS INTEGER) = ?
      AND opened_at >= datetime('now', '-60 days')
    GROUP BY hour ORDER BY hour
  `).all(dow);

  const salesMap = {};
  for (const s of salesPattern) { salesMap[s.hour] = s; }

  // Staff-to-sales ratio
  const recommendations = [];
  for (let h = 6; h <= 23; h++) {
    const staffData = hourlyPatterns.find(p => p.hour === h);
    const salesData = salesMap[h] || { avg_hourly_sales: 0, avg_hourly_guests: 0 };

    // Target: 1 server per 15-20 covers, 1 BOH per 25 covers
    const covers = Math.round(salesData.avg_hourly_guests || 0);
    const fohNeeded = Math.max(1, Math.ceil(covers / 18));
    const bohNeeded = Math.max(1, Math.ceil(covers / 25));
    const totalNeeded = fohNeeded + bohNeeded;

    recommendations.push({
      hour: h,
      time_label: `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h >= 12 ? 'PM' : 'AM'}`,
      predicted_covers: covers,
      predicted_sales: +(salesData.avg_hourly_sales || 0).toFixed(2),
      historical_staff: staffData?.avg_staff || 0,
      recommended_foh: fohNeeded,
      recommended_boh: bohNeeded,
      recommended_total: totalNeeded,
    });

    // Save to DB
    db.prepare(`INSERT OR REPLACE INTO labor_forecasts (forecast_date, hour, predicted_covers, recommended_staff, recommended_roles)
      VALUES (?, ?, ?, ?, ?)`)
      .run(targetDate, h, covers, totalNeeded, JSON.stringify({ foh: fohNeeded, boh: bohNeeded }));
  }

  const totalStaffNeeded = Math.max(...recommendations.map(r => r.recommended_total));
  const peakHour = recommendations.reduce((max, r) => r.predicted_covers > max.predicted_covers ? r : max, recommendations[0]);

  res.json({
    date: targetDate,
    day_name: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow],
    peak_hour: peakHour,
    max_staff_needed: totalStaffNeeded,
    hourly_recommendations: recommendations,
  });
});

// ============================================================
// ANOMALY DETECTION
// ============================================================

// POST /api/forecasting/detect-anomalies
router.post('/detect-anomalies', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const anomalies = [];

  // 1. Check sales anomaly
  const todaySales = db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status = 'closed' AND date(opened_at) = ?").get(today).total;
  const avgSales = db.prepare("SELECT AVG(daily_sales) as avg FROM (SELECT date(opened_at) as d, SUM(total) as daily_sales FROM orders WHERE status = 'closed' AND date(opened_at) >= date('now', '-30 days') AND date(opened_at) < date('now') GROUP BY d)").get()?.avg || 0;

  if (avgSales > 0) {
    const salesDeviation = ((todaySales - avgSales) / avgSales) * 100;
    if (Math.abs(salesDeviation) > 30) {
      const anomaly = {
        anomaly_type: 'sales',
        severity: Math.abs(salesDeviation) > 50 ? 'high' : 'medium',
        metric: 'daily_sales',
        expected_value: +avgSales.toFixed(2),
        actual_value: +todaySales.toFixed(2),
        deviation_percent: +salesDeviation.toFixed(1),
        description: salesDeviation > 0 ? `Sales ${salesDeviation.toFixed(0)}% above average` : `Sales ${Math.abs(salesDeviation).toFixed(0)}% below average`,
      };
      anomalies.push(anomaly);
      db.prepare(`INSERT INTO anomaly_log (anomaly_type, severity, metric, expected_value, actual_value, deviation_percent, description) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(anomaly.anomaly_type, anomaly.severity, anomaly.metric, anomaly.expected_value, anomaly.actual_value, anomaly.deviation_percent, anomaly.description);
    }
  }

  // 2. Check void rate
  const todayOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE date(opened_at) = ?").get(today).c;
  const todayVoids = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'voided' AND date(opened_at) = ?").get(today).c;
  if (todayOrders > 5) {
    const voidRate = (todayVoids / todayOrders) * 100;
    if (voidRate > 10) {
      anomalies.push({
        anomaly_type: 'operations', severity: 'high', metric: 'void_rate',
        expected_value: 3, actual_value: +voidRate.toFixed(1), deviation_percent: +((voidRate - 3) / 3 * 100).toFixed(1),
        description: `Void rate at ${voidRate.toFixed(1)}% (expected <3%)`,
      });
    }
  }

  // 3. Check labor cost ratio
  const todayLabor = db.prepare("SELECT COALESCE(SUM(hours_worked * hourly_rate_snapshot), 0) as cost FROM time_entries WHERE date(clock_in) = ? AND clock_out IS NOT NULL").get(today).cost;
  if (todaySales > 0) {
    const laborPercent = (todayLabor / todaySales) * 100;
    if (laborPercent > 35) {
      anomalies.push({
        anomaly_type: 'labor', severity: laborPercent > 45 ? 'high' : 'medium', metric: 'labor_cost_percent',
        expected_value: 28, actual_value: +laborPercent.toFixed(1), deviation_percent: +((laborPercent - 28) / 28 * 100).toFixed(1),
        description: `Labor cost at ${laborPercent.toFixed(1)}% of sales (target <30%)`,
      });
    }
  }

  // 4. Check waste
  const todayWaste = db.prepare("SELECT COALESCE(SUM(cost), 0) as total FROM waste_log WHERE date(created_at) = ?").get(today).total;
  const avgWaste = db.prepare("SELECT AVG(daily_waste) as avg FROM (SELECT date(created_at) as d, SUM(cost) as daily_waste FROM waste_log WHERE date(created_at) >= date('now', '-30 days') AND date(created_at) < date('now') GROUP BY d)").get()?.avg || 0;
  if (avgWaste > 0 && todayWaste > avgWaste * 2) {
    anomalies.push({
      anomaly_type: 'waste', severity: 'medium', metric: 'waste_cost',
      expected_value: +avgWaste.toFixed(2), actual_value: +todayWaste.toFixed(2),
      deviation_percent: +(((todayWaste - avgWaste) / avgWaste) * 100).toFixed(1),
      description: `Waste cost $${todayWaste.toFixed(2)} is ${((todayWaste / avgWaste) * 100 - 100).toFixed(0)}% above average`,
    });
  }

  res.json({ date: today, anomalies_detected: anomalies.length, anomalies });
});

// GET /api/forecasting/anomalies
router.get('/anomalies', (req, res) => {
  const db = getDb();
  const { days, acknowledged } = req.query;
  let sql = 'SELECT * FROM anomaly_log WHERE 1=1';
  const params = [];
  if (days) { sql += " AND detected_at >= datetime('now', '-' || ? || ' days')"; params.push(days); }
  if (acknowledged !== undefined) { sql += ' AND acknowledged = ?'; params.push(acknowledged === 'true' ? 1 : 0); }
  sql += ' ORDER BY detected_at DESC LIMIT 50';
  res.json(db.prepare(sql).all(...params));
});

// PATCH /api/forecasting/anomalies/:id/acknowledge
router.patch('/anomalies/:id/acknowledge', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE anomaly_log SET acknowledged = 1, acknowledged_by = ? WHERE id = ?').run(req.body.acknowledged_by || null, req.params.id);
  res.json({ message: 'Anomaly acknowledged' });
});

// GET /api/forecasting/dashboard
router.get('/dashboard', (req, res) => {
  const db = getDb();

  // Next 7 days forecast
  const forecasts = db.prepare("SELECT * FROM sales_forecasts WHERE forecast_date >= date('now') AND forecast_date <= date('now', '+7 days') ORDER BY forecast_date").all();

  // Recent accuracy
  const accuracy = db.prepare(`
    SELECT AVG(CASE WHEN predicted_sales > 0 THEN (1 - ABS(predicted_sales - COALESCE(actual_sales, 0)) / predicted_sales) * 100 ELSE 0 END) as accuracy
    FROM sales_forecasts WHERE actual_sales IS NOT NULL AND forecast_date >= date('now', '-14 days')
  `).get()?.accuracy || 0;

  // Unacknowledged anomalies
  const anomalies = db.prepare("SELECT COUNT(*) as c FROM anomaly_log WHERE acknowledged = 0 AND detected_at >= datetime('now', '-7 days')").get().c;

  // This week predicted totals
  const weekTotal = forecasts.reduce((s, f) => s + f.predicted_sales, 0);

  res.json({
    next_7_days: forecasts,
    forecast_accuracy: +accuracy.toFixed(1),
    predicted_weekly_sales: +weekTotal.toFixed(2),
    active_anomalies: anomalies,
  });
});

module.exports = router;
