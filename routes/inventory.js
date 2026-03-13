const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { paginate } = require('../middleware/response');
const { logWaste } = require('../services/deduction');

// All routes require authentication
router.use(authenticate);
// GET /api/inventory - list all stock
router.get('/', (req, res) => {
  const db = getDb();
  const { category_id, location, status } = req.query;
  let sql = `SELECT inv.*, i.name as ingredient_name, i.unit, i.cost_per_unit, i.par_level,
             c.name as category_name, s.name as supplier_name
             FROM inventory inv
             JOIN ingredients i ON inv.ingredient_id = i.id
             LEFT JOIN categories c ON i.category_id = c.id
             LEFT JOIN suppliers s ON i.supplier_id = s.id`;
  const conditions = [];
  const params = [];

  if (category_id) { conditions.push('i.category_id = ?'); params.push(category_id); }
  if (location) { conditions.push('inv.location = ?'); params.push(location); }
  if (status) { conditions.push('inv.status = ?'); params.push(status); }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY i.name, inv.location';

  res.json(paginate(db, sql, params, req.query));
});

// GET /api/inventory/summary - aggregated by ingredient
router.get('/summary', (req, res) => {
  const db = getDb();
  const summary = db.prepare(`
    SELECT i.id, i.name, i.unit, i.cost_per_unit, i.par_level, c.name as category_name,
           COALESCE(SUM(CASE WHEN inv.status != 'empty' THEN inv.quantity ELSE 0 END), 0) as total_quantity,
           COALESCE(SUM(inv.full_quantity), 0) as total_capacity,
           COUNT(inv.id) as container_count,
           SUM(CASE WHEN inv.status = 'open' THEN 1 ELSE 0 END) as open_count,
           SUM(CASE WHEN inv.status = 'sealed' THEN 1 ELSE 0 END) as sealed_count,
           SUM(CASE WHEN inv.status = 'empty' THEN 1 ELSE 0 END) as empty_count
    FROM ingredients i
    LEFT JOIN inventory inv ON i.id = inv.ingredient_id
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE i.active = 1
    GROUP BY i.id
    ORDER BY i.name
  `).all();

  for (const item of summary) {
    item.stock_percent = item.total_capacity > 0 ? Math.round(item.total_quantity / item.total_capacity * 100) : 0;
    item.below_par = item.par_level > 0 && item.total_quantity < item.par_level;
  }

  res.json(summary);
});

// GET /api/inventory/low-stock
router.get('/low-stock', (req, res) => {
  const db = getDb();
  const threshold = parseInt(process.env.LOW_STOCK_THRESHOLD || '20') / 100;
  const items = db.prepare(`
    SELECT i.id, i.name, i.unit, i.par_level, i.cost_per_unit,
           COALESCE(SUM(CASE WHEN inv.status != 'empty' THEN inv.quantity ELSE 0 END), 0) as total_quantity,
           COALESCE(SUM(inv.full_quantity), 0) as total_capacity
    FROM ingredients i
    LEFT JOIN inventory inv ON i.id = inv.ingredient_id
    WHERE i.active = 1
    GROUP BY i.id
    HAVING total_capacity > 0 AND (total_quantity * 1.0 / total_capacity) < ?
    ORDER BY (total_quantity * 1.0 / total_capacity) ASC
  `).all(threshold);
  res.json(items);
});

// POST /api/inventory - add stock
router.post('/', (req, res) => {
  const { ingredient_id, quantity, full_quantity, location, status, expiration_date, lot_number, purchase_order_id } = req.body;
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO inventory (ingredient_id, quantity, full_quantity, location, status, expiration_date, lot_number, purchase_order_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ingredient_id, quantity, full_quantity || quantity, location || 'storage', status || 'sealed', expiration_date, lot_number, purchase_order_id);
  res.json({ success: true, id: result.lastInsertRowid });
});

// PATCH /api/inventory/:id
router.patch('/:id', (req, res) => {
  const { quantity, location, status } = req.body;
  const db = getDb();
  const sets = [];
  const params = [];
  if (quantity !== undefined) { sets.push('quantity = ?'); params.push(quantity); }
  if (location) { sets.push('location = ?'); params.push(location); }
  if (status) {
    sets.push('status = ?'); params.push(status);
    if (status === 'open') sets.push("opened_at = datetime('now')");
    if (status === 'empty') sets.push("emptied_at = datetime('now')");
  }
  params.push(req.params.id);
  db.prepare(`UPDATE inventory SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

// DELETE /api/inventory/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare(`DELETE FROM inventory WHERE id = ?`).run(req.params.id);
  res.json({ success: true });
});

// GET /api/inventory/ingredients
router.get('/ingredients', (req, res) => {
  const db = getDb();
  res.json(db.prepare(`SELECT i.*, c.name as category_name, s.name as supplier_name FROM ingredients i LEFT JOIN categories c ON i.category_id = c.id LEFT JOIN suppliers s ON i.supplier_id = s.id WHERE i.active = 1 ORDER BY i.name`).all());
});

// POST /api/inventory/ingredients
router.post('/ingredients', (req, res) => {
  const { name, category_id, unit, cost_per_unit, supplier_id, par_level, reorder_quantity, shelf_life_days } = req.body;
  const db = getDb();
  const result = db.prepare(`INSERT INTO ingredients (name, category_id, unit, cost_per_unit, supplier_id, par_level, reorder_quantity, shelf_life_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(name, category_id, unit || 'oz', cost_per_unit || 0, supplier_id, par_level || 0, reorder_quantity || 0, shelf_life_days);
  res.json({ success: true, id: result.lastInsertRowid });
});

// GET /api/inventory/categories
router.get('/categories', (req, res) => {
  const db = getDb();
  res.json(db.prepare(`SELECT * FROM categories ORDER BY display_order, name`).all());
});

// POST /api/inventory/categories
router.post('/categories', (req, res) => {
  const { name, color, icon } = req.body;
  const db = getDb();
  const result = db.prepare(`INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)`).run(name, color, icon);
  res.json({ success: true, id: result.lastInsertRowid });
});

// POST /api/inventory/waste
router.post('/waste', (req, res) => {
  const { ingredient_id, inventory_id, quantity, unit, reason, cost, employee_id, notes } = req.body;
  logWaste(ingredient_id, inventory_id, quantity, unit, reason, cost || 0, employee_id, notes);
  res.json({ success: true });
});

// GET /api/inventory/waste
router.get('/waste', (req, res) => {
  const db = getDb();
  const { start_date, end_date } = req.query;
  let sql = `SELECT w.*, i.name as ingredient_name, e.first_name || ' ' || e.last_name as employee_name
             FROM waste_log w
             JOIN ingredients i ON w.ingredient_id = i.id
             LEFT JOIN employees e ON w.employee_id = e.id`;
  const conditions = [];
  const params = [];
  if (start_date) { conditions.push("date(w.created_at) >= ?"); params.push(start_date); }
  if (end_date) { conditions.push("date(w.created_at) <= ?"); params.push(end_date); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY w.created_at DESC';
  res.json(paginate(db, sql, params, req.query, { defaultLimit: 500 }));
});

// GET /api/inventory/variance - theoretical vs actual usage
router.get('/variance', (req, res) => {
  const db = getDb();
  const days = parseInt(req.query.days || '7');
  const variance = db.prepare(`
    SELECT i.id, i.name, i.unit,
           COALESCE(SUM(CASE WHEN t.type = 'sale' THEN t.quantity ELSE 0 END), 0) as theoretical_usage,
           COALESCE(SUM(CASE WHEN t.type = 'waste' THEN t.quantity ELSE 0 END), 0) as waste,
           COALESCE(SUM(t.quantity), 0) as total_usage
    FROM ingredients i
    LEFT JOIN transactions t ON i.id = t.ingredient_id AND t.created_at >= datetime('now', '-' || ? || ' days')
    WHERE i.active = 1
    GROUP BY i.id
    HAVING total_usage > 0
    ORDER BY total_usage DESC
  `).all(days);
  res.json(variance);
});

// GET /api/inventory/forecast
router.get('/forecast', (req, res) => {
  const db = getDb();
  const days = parseInt(req.query.days || '7');
  const forecast = db.prepare(`
    SELECT i.id, i.name, i.unit, i.par_level,
           COALESCE(AVG(daily_usage), 0) as avg_daily_usage,
           COALESCE(SUM(CASE WHEN inv.status != 'empty' THEN inv.quantity ELSE 0 END), 0) as current_stock
    FROM ingredients i
    LEFT JOIN (
      SELECT ingredient_id, date(created_at) as day, SUM(quantity) as daily_usage
      FROM transactions WHERE type = 'sale' AND created_at >= datetime('now', '-30 days')
      GROUP BY ingredient_id, date(created_at)
    ) du ON i.id = du.ingredient_id
    LEFT JOIN inventory inv ON i.id = inv.ingredient_id
    WHERE i.active = 1
    GROUP BY i.id
    HAVING avg_daily_usage > 0
    ORDER BY avg_daily_usage DESC
  `).all();

  for (const item of forecast) {
    item.days_until_empty = item.avg_daily_usage > 0 ? Math.floor(item.current_stock / item.avg_daily_usage) : 999;
    item.forecast_needed = +(item.avg_daily_usage * days).toFixed(2);
    item.should_reorder = item.days_until_empty <= 3 || (item.par_level > 0 && item.current_stock < item.par_level);
  }

  res.json(forecast);
});

// POST /api/inventory/receive - receive a delivery
router.post('/receive', (req, res) => {
  const { items, supplier_id, purchase_order_id } = req.body; // items: [{ ingredient_id, quantity, unit_cost, location }]
  const db = getDb();

  const insertInv = db.prepare(`INSERT INTO inventory (ingredient_id, quantity, full_quantity, location, status, purchase_order_id, received_date) VALUES (?, ?, ?, ?, 'sealed', ?, datetime('now'))`);

  const received = db.transaction(() => {
    const results = [];
    for (const item of items) {
      const result = insertInv.run(item.ingredient_id, item.quantity, item.quantity, item.location || 'storage', purchase_order_id);
      results.push({ id: result.lastInsertRowid, ...item });

      // Update ingredient last order date
      db.prepare(`UPDATE ingredients SET last_order_date = datetime('now') WHERE id = ?`).run(item.ingredient_id);

      // Log transaction
      db.prepare(`INSERT INTO transactions (type, ingredient_id, inventory_id, quantity, unit, status, notes) VALUES ('receive', ?, ?, ?, ?, 'SUCCESS', 'Delivery received')`)
        .run(item.ingredient_id, result.lastInsertRowid, item.quantity, item.unit || 'each');
    }
    return results;
  })();

  res.json({ received });
});

// ============================================================
// RECIPES
// ============================================================

// GET /api/inventory/recipes - all recipes grouped by menu item
router.get('/recipes', (req, res) => {
  const db = getDb();
  const recipes = db.prepare(`
    SELECT r.*, mi.name as menu_item_name, mi.price, mi.cost, mi.category_id,
           mc.name as category_name, i.name as ingredient_name, i.unit as ingredient_unit,
           i.cost_per_unit
    FROM recipes r
    JOIN menu_items mi ON r.menu_item_id = mi.id
    JOIN ingredients i ON r.ingredient_id = i.id
    LEFT JOIN menu_categories mc ON mi.category_id = mc.id
    WHERE mi.active = 1
    ORDER BY mi.name, i.name
  `).all();

  // Group by menu item
  const grouped = {};
  for (const r of recipes) {
    if (!grouped[r.menu_item_id]) {
      grouped[r.menu_item_id] = {
        menu_item_id: r.menu_item_id,
        menu_item_name: r.menu_item_name,
        price: r.price,
        cost: r.cost,
        category_name: r.category_name,
        ingredients: []
      };
    }
    grouped[r.menu_item_id].ingredients.push({
      id: r.ingredient_id,
      name: r.ingredient_name,
      quantity: r.quantity,
      unit: r.unit,
      cost_per_unit: r.cost_per_unit,
      line_cost: +(r.quantity * r.cost_per_unit).toFixed(2)
    });
  }

  // Calculate total recipe cost
  for (const item of Object.values(grouped)) {
    item.recipe_cost = +item.ingredients.reduce((s, i) => s + i.line_cost, 0).toFixed(2);
    item.food_cost_percent = item.price > 0 ? +((item.recipe_cost / item.price) * 100).toFixed(1) : 0;
  }

  res.json(Object.values(grouped));
});

// GET /api/inventory/recipes/:menuItemId
router.get('/recipes/:menuItemId', (req, res) => {
  const db = getDb();
  const ingredients = db.prepare(`
    SELECT r.*, i.name as ingredient_name, i.unit as ingredient_unit, i.cost_per_unit
    FROM recipes r
    JOIN ingredients i ON r.ingredient_id = i.id
    WHERE r.menu_item_id = ?
    ORDER BY i.name
  `).all(req.params.menuItemId);
  res.json(ingredients);
});

// POST /api/inventory/recipes/:menuItemId - save/replace recipe
router.post('/recipes/:menuItemId', (req, res) => {
  const { ingredients } = req.body; // [{ingredient_id, quantity, unit}]
  const db = getDb();
  const menuItemId = parseInt(req.params.menuItemId);

  db.transaction(() => {
    db.prepare(`DELETE FROM recipes WHERE menu_item_id = ?`).run(menuItemId);
    const insert = db.prepare(`INSERT INTO recipes (menu_item_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)`);
    let totalCost = 0;
    for (const ing of ingredients) {
      insert.run(menuItemId, ing.ingredient_id, ing.quantity, ing.unit);
      const ingData = db.prepare(`SELECT cost_per_unit FROM ingredients WHERE id = ?`).get(ing.ingredient_id);
      if (ingData) totalCost += ing.quantity * ingData.cost_per_unit;
    }
    // Update menu item cost
    db.prepare(`UPDATE menu_items SET cost = ? WHERE id = ?`).run(+totalCost.toFixed(2), menuItemId);
  })();

  res.json({ success: true });
});

// ============================================================
// EXPIRATION TRACKING / FIFO
// ============================================================

// GET /api/inventory/expiring?days=7
router.get('/expiring', (req, res) => {
  const db = getDb();
  const days = parseInt(req.query.days || '7');
  const items = db.prepare(`
    SELECT inv.id, inv.quantity, inv.location, inv.status, inv.expiration_date, inv.lot_number,
           inv.received_date, i.name as ingredient_name, i.unit, i.cost_per_unit,
           CAST(julianday(inv.expiration_date) - julianday('now') AS INTEGER) as days_until_expiry
    FROM inventory inv
    JOIN ingredients i ON inv.ingredient_id = i.id
    WHERE inv.expiration_date IS NOT NULL
      AND inv.status != 'empty'
      AND date(inv.expiration_date) <= date('now', '+' || ? || ' days')
    ORDER BY inv.expiration_date ASC
  `).all(days);
  res.json(items);
});

// GET /api/inventory/fifo - FIFO usage order per ingredient
router.get('/fifo', (req, res) => {
  const db = getDb();
  const items = db.prepare(`
    SELECT inv.id, inv.ingredient_id, inv.quantity, inv.location, inv.status,
           inv.expiration_date, inv.received_date, inv.lot_number,
           i.name as ingredient_name, i.unit,
           CAST(julianday(inv.expiration_date) - julianday('now') AS INTEGER) as days_until_expiry
    FROM inventory inv
    JOIN ingredients i ON inv.ingredient_id = i.id
    WHERE inv.status != 'empty' AND inv.quantity > 0
    ORDER BY i.name, COALESCE(inv.expiration_date, '9999-12-31') ASC, inv.received_date ASC
  `).all();
  res.json(items);
});

// ============================================================
// PHYSICAL COUNT SHEETS
// ============================================================

// GET /api/inventory/counts
router.get('/counts', (req, res) => {
  const db = getDb();
  const counts = db.prepare(`
    SELECT ic.*, e.first_name || ' ' || e.last_name as employee_name,
           (SELECT COUNT(*) FROM inventory_count_items WHERE count_id = ic.id) as item_count,
           (SELECT COALESCE(SUM(ABS(variance_cost)), 0) FROM inventory_count_items WHERE count_id = ic.id) as total_variance_cost
    FROM inventory_counts ic
    LEFT JOIN employees e ON ic.employee_id = e.id
    ORDER BY ic.created_at DESC
    LIMIT 50
  `).all();
  res.json(counts);
});

// GET /api/inventory/counts/:id
router.get('/counts/:id', (req, res) => {
  const db = getDb();
  const count = db.prepare(`
    SELECT ic.*, e.first_name || ' ' || e.last_name as employee_name
    FROM inventory_counts ic
    LEFT JOIN employees e ON ic.employee_id = e.id
    WHERE ic.id = ?
  `).get(req.params.id);
  if (!count) return res.status(404).json({ error: 'Count not found' });

  count.items = db.prepare(`
    SELECT ici.*, i.name as ingredient_name, i.unit
    FROM inventory_count_items ici
    JOIN ingredients i ON ici.ingredient_id = i.id
    WHERE ici.count_id = ?
    ORDER BY i.name
  `).all(req.params.id);

  res.json(count);
});

// POST /api/inventory/count - create/submit a physical count
router.post('/count', (req, res) => {
  const { items, notes, employee_id } = req.body; // items: [{ingredient_id, actual_qty}]
  const db = getDb();

  const result = db.transaction(() => {
    const countResult = db.prepare(`
      INSERT INTO inventory_counts (employee_id, notes, status, completed_at)
      VALUES (?, ?, 'completed', datetime('now'))
    `).run(employee_id, notes);

    const countId = countResult.lastInsertRowid;
    const insertItem = db.prepare(`
      INSERT INTO inventory_count_items (count_id, ingredient_id, expected_qty, actual_qty, variance, variance_cost)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      // Get expected (current system) quantity
      const stock = db.prepare(`
        SELECT COALESCE(SUM(CASE WHEN status != 'empty' THEN quantity ELSE 0 END), 0) as total,
               i.cost_per_unit
        FROM ingredients i
        LEFT JOIN inventory inv ON i.id = inv.ingredient_id
        WHERE i.id = ?
        GROUP BY i.id
      `).get(item.ingredient_id);

      const expected = stock ? stock.total : 0;
      const variance = item.actual_qty - expected;
      const varianceCost = stock ? +(variance * stock.cost_per_unit).toFixed(2) : 0;

      insertItem.run(countId, item.ingredient_id, expected, item.actual_qty, variance, varianceCost);
    }

    return countId;
  })();

  res.json({ success: true, id: result });
});

// ============================================================
// STOCK TRANSFERS
// ============================================================

// GET /api/inventory/transfers
router.get('/transfers', (req, res) => {
  const db = getDb();
  const transfers = db.prepare(`
    SELECT st.*, i.name as ingredient_name, i.unit,
           e1.first_name || ' ' || e1.last_name as requested_by_name,
           e2.first_name || ' ' || e2.last_name as approved_by_name
    FROM stock_transfers st
    JOIN ingredients i ON st.ingredient_id = i.id
    LEFT JOIN employees e1 ON st.requested_by = e1.id
    LEFT JOIN employees e2 ON st.approved_by = e2.id
    ORDER BY st.created_at DESC
    LIMIT 100
  `).all();
  res.json(transfers);
});

// POST /api/inventory/transfer
router.post('/transfer', (req, res) => {
  const { ingredient_id, from_location, to_location, quantity, requested_by, notes } = req.body;
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO stock_transfers (ingredient_id, from_location, to_location, quantity, requested_by, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(ingredient_id, from_location, to_location, quantity, requested_by, notes);
  res.json({ success: true, id: result.lastInsertRowid });
});

// PATCH /api/inventory/transfers/:id/approve
router.patch('/transfers/:id/approve', (req, res) => {
  const { approved_by } = req.body;
  const db = getDb();
  const transfer = db.prepare(`SELECT * FROM stock_transfers WHERE id = ?`).get(req.params.id);
  if (!transfer) return res.status(404).json({ error: 'Transfer not found' });

  db.transaction(() => {
    // Deduct from source location
    const sourceItems = db.prepare(`
      SELECT id, quantity FROM inventory
      WHERE ingredient_id = ? AND location = ? AND status != 'empty' AND quantity > 0
      ORDER BY COALESCE(expiration_date, '9999-12-31') ASC, received_date ASC
    `).all(transfer.ingredient_id, transfer.from_location);

    let remaining = transfer.quantity;
    for (const item of sourceItems) {
      if (remaining <= 0) break;
      const deduct = Math.min(item.quantity, remaining);
      db.prepare(`UPDATE inventory SET quantity = quantity - ? WHERE id = ?`).run(deduct, item.id);
      if (item.quantity - deduct <= 0) {
        db.prepare(`UPDATE inventory SET status = 'empty', emptied_at = datetime('now') WHERE id = ?`).run(item.id);
      }
      remaining -= deduct;
    }

    // Add to destination
    db.prepare(`
      INSERT INTO inventory (ingredient_id, quantity, full_quantity, location, status)
      VALUES (?, ?, ?, ?, 'sealed')
    `).run(transfer.ingredient_id, transfer.quantity, transfer.quantity, transfer.to_location);

    // Update transfer status
    db.prepare(`
      UPDATE stock_transfers SET status = 'completed', approved_by = ?, completed_at = datetime('now')
      WHERE id = ?
    `).run(approved_by, req.params.id);
  })();

  res.json({ success: true });
});

// PATCH /api/inventory/transfers/:id/reject
router.patch('/transfers/:id/reject', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE stock_transfers SET status = 'rejected' WHERE id = ?`).run(req.params.id);
  res.json({ success: true });
});

// ============================================================
// AI-POWERED REORDER SUGGESTIONS
// ============================================================

// GET /api/inventory/reorder-suggestions
router.get('/reorder-suggestions', (req, res) => {
  const db = getDb();

  const suggestions = db.prepare(`
    SELECT i.id, i.name, i.unit, i.cost_per_unit, i.par_level, i.reorder_quantity,
           s.id as supplier_id, s.name as supplier_name, s.email as supplier_email, s.phone as supplier_phone,
           COALESCE(SUM(CASE WHEN inv.status != 'empty' THEN inv.quantity ELSE 0 END), 0) as current_stock,
           COALESCE(usage.avg_daily, 0) as avg_daily_usage,
           COALESCE(dow_usage.dow_avg, 0) as dow_avg_usage
    FROM ingredients i
    LEFT JOIN suppliers s ON i.supplier_id = s.id
    LEFT JOIN inventory inv ON i.id = inv.ingredient_id
    LEFT JOIN (
      SELECT ingredient_id, AVG(daily_total) as avg_daily
      FROM (
        SELECT ingredient_id, date(created_at) as day, SUM(quantity) as daily_total
        FROM transactions WHERE type = 'sale' AND created_at >= datetime('now', '-30 days')
        GROUP BY ingredient_id, day
      ) GROUP BY ingredient_id
    ) usage ON i.id = usage.ingredient_id
    LEFT JOIN (
      SELECT ingredient_id, AVG(daily_total) as dow_avg
      FROM (
        SELECT ingredient_id, date(created_at) as day, SUM(quantity) as daily_total
        FROM transactions
        WHERE type = 'sale'
          AND created_at >= datetime('now', '-60 days')
          AND CAST(strftime('%w', created_at) AS INTEGER) = CAST(strftime('%w', 'now') AS INTEGER)
        GROUP BY ingredient_id, day
      ) GROUP BY ingredient_id
    ) dow_usage ON i.id = dow_usage.ingredient_id
    WHERE i.active = 1
    GROUP BY i.id
    HAVING current_stock > 0 OR avg_daily_usage > 0
    ORDER BY CASE WHEN avg_daily_usage > 0 THEN current_stock / avg_daily_usage ELSE 999 END ASC
  `).all();

  const result = [];
  for (const item of suggestions) {
    const effectiveUsage = Math.max(item.avg_daily_usage, item.dow_avg_usage);
    const daysLeft = effectiveUsage > 0 ? Math.floor(item.current_stock / effectiveUsage) : 999;
    const needsReorder = daysLeft <= 5 || (item.par_level > 0 && item.current_stock < item.par_level);

    if (needsReorder) {
      const suggestedQty = item.reorder_quantity > 0
        ? item.reorder_quantity
        : Math.ceil(effectiveUsage * 7); // 1 week supply

      result.push({
        ...item,
        days_left: daysLeft,
        suggested_order_qty: suggestedQty,
        est_cost: +(suggestedQty * item.cost_per_unit).toFixed(2),
        urgency: daysLeft <= 1 ? 'critical' : daysLeft <= 3 ? 'high' : 'medium',
        reason: daysLeft <= 3 ? `Only ${daysLeft} day(s) of stock left` :
                item.current_stock < item.par_level ? `Below par level (${item.par_level} ${item.unit})` :
                `Low velocity stock (${daysLeft} days left)`
      });
    }
  }

  res.json(result);
});

// ============================================================
// PROFITABILITY ANALYZER
// ============================================================

// GET /api/inventory/profitability - detailed cost breakdown per menu item
router.get('/profitability', (req, res) => {
  const db = getDb();
  const days = parseInt(req.query.days || '30');

  // Get all menu items with recipes
  const items = db.prepare(`
    SELECT mi.id, mi.name, mi.price, mi.cost as listed_cost, mi.category_id,
           mc.name as category_name, mc.color as category_color,
           mi.station, mi.active
    FROM menu_items mi
    LEFT JOIN menu_categories mc ON mi.category_id = mc.id
    WHERE mi.active = 1
    ORDER BY mc.display_order, mi.display_order
  `).all();

  const getRecipe = db.prepare(`
    SELECT r.ingredient_id, r.quantity, r.unit,
           i.name as ingredient_name, i.cost_per_unit, i.unit as ingredient_unit
    FROM recipes r
    JOIN ingredients i ON r.ingredient_id = i.id
    WHERE r.menu_item_id = ?
  `);

  const getSalesData = db.prepare(`
    SELECT COALESCE(SUM(oi.quantity), 0) as qty_sold,
           COALESCE(SUM(oi.quantity * oi.unit_price), 0) as revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.menu_item_id = ? AND o.status = 'closed' AND oi.voided = 0
      AND o.opened_at >= datetime('now', '-' || ? || ' days')
  `);

  const result = [];

  for (const item of items) {
    const recipe = getRecipe.all(item.id);
    const sales = getSalesData.get(item.id, days);

    // Calculate true ingredient cost from recipe
    let ingredientCost = 0;
    const ingredients = recipe.map(r => {
      const lineCost = +(r.quantity * r.cost_per_unit).toFixed(4);
      ingredientCost += lineCost;
      return {
        name: r.ingredient_name,
        quantity: r.quantity,
        unit: r.unit,
        cost_per_unit: r.cost_per_unit,
        line_cost: +lineCost.toFixed(2),
      };
    });

    ingredientCost = +ingredientCost.toFixed(2);
    const profit = +(item.price - ingredientCost).toFixed(2);
    const marginPercent = item.price > 0 ? +((profit / item.price) * 100).toFixed(1) : 0;
    const costPercent = item.price > 0 ? +((ingredientCost / item.price) * 100).toFixed(1) : 0;
    const markup = ingredientCost > 0 ? +((item.price / ingredientCost)).toFixed(1) : 0;

    result.push({
      id: item.id,
      name: item.name,
      category: item.category_name,
      category_color: item.category_color,
      station: item.station,
      sell_price: item.price,
      ingredient_cost: ingredientCost,
      profit_per_unit: profit,
      margin_percent: marginPercent,
      cost_percent: costPercent,
      markup_multiplier: markup,
      has_recipe: recipe.length > 0,
      ingredients,
      qty_sold: sales.qty_sold,
      total_revenue: +sales.revenue.toFixed(2),
      total_profit: +(sales.qty_sold * profit).toFixed(2),
      total_cogs: +(sales.qty_sold * ingredientCost).toFixed(2),
    });
  }

  // Sort by margin (lowest first = needs attention)
  result.sort((a, b) => a.margin_percent - b.margin_percent);

  // Summary stats
  const withRecipe = result.filter(r => r.has_recipe);
  const avgMargin = withRecipe.length > 0
    ? +(withRecipe.reduce((s, r) => s + r.margin_percent, 0) / withRecipe.length).toFixed(1)
    : 0;
  const totalRevenue = result.reduce((s, r) => s + r.total_revenue, 0);
  const totalCogs = result.reduce((s, r) => s + r.total_cogs, 0);
  const totalProfit = result.reduce((s, r) => s + r.total_profit, 0);
  const lowMarginCount = withRecipe.filter(r => r.margin_percent < 60).length;
  const highMarginCount = withRecipe.filter(r => r.margin_percent >= 75).length;

  res.json({
    items: result,
    summary: {
      total_items: result.length,
      items_with_recipes: withRecipe.length,
      avg_margin: avgMargin,
      total_revenue: +totalRevenue.toFixed(2),
      total_cogs: +totalCogs.toFixed(2),
      total_profit: +totalProfit.toFixed(2),
      overall_margin: totalRevenue > 0 ? +((totalProfit / totalRevenue) * 100).toFixed(1) : 0,
      low_margin_items: lowMarginCount,
      high_margin_items: highMarginCount,
      days_analyzed: days,
    }
  });
});

// POST /api/inventory/profitability/analyze - AI analysis of a specific item
router.post('/profitability/analyze', async (req, res) => {
  const db = getDb();
  const { menu_item_id } = req.body;

  if (!menu_item_id) return res.status(400).json({ error: 'menu_item_id required' });

  const item = db.prepare(`
    SELECT mi.*, mc.name as category_name
    FROM menu_items mi
    LEFT JOIN menu_categories mc ON mi.category_id = mc.id
    WHERE mi.id = ?
  `).get(menu_item_id);

  if (!item) return res.status(404).json({ error: 'Menu item not found' });

  const recipe = db.prepare(`
    SELECT r.*, i.name as ingredient_name, i.cost_per_unit, i.unit as ingredient_unit
    FROM recipes r
    JOIN ingredients i ON r.ingredient_id = i.id
    WHERE r.menu_item_id = ?
  `).all(menu_item_id);

  let ingredientCost = 0;
  const breakdown = recipe.map(r => {
    const cost = +(r.quantity * r.cost_per_unit).toFixed(2);
    ingredientCost += cost;
    return { name: r.ingredient_name, qty: r.quantity, unit: r.unit, cost_per_unit: r.cost_per_unit, line_cost: cost };
  });

  const margin = item.price > 0 ? +(((item.price - ingredientCost) / item.price) * 100).toFixed(1) : 0;

  // Get sales volume
  const sales = db.prepare(`
    SELECT COALESCE(SUM(oi.quantity), 0) as qty FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.menu_item_id = ? AND o.status = 'closed' AND oi.voided = 0
      AND o.opened_at >= datetime('now', '-30 days')
  `).get(menu_item_id);

  // Build AI prompt
  const prompt = `You are a restaurant profitability consultant. Analyze this menu item and give actionable recommendations.

Menu Item: ${item.name}
Category: ${item.category_name || 'Uncategorized'}
Sell Price: $${item.price.toFixed(2)}
Total Ingredient Cost: $${ingredientCost.toFixed(2)}
Profit per Unit: $${(item.price - ingredientCost).toFixed(2)}
Margin: ${margin}%
Units Sold (30 days): ${sales.qty}
Monthly Revenue: $${(sales.qty * item.price).toFixed(2)}
Monthly Profit: $${(sales.qty * (item.price - ingredientCost)).toFixed(2)}

Ingredient Breakdown:
${breakdown.map(b => `- ${b.name}: ${b.qty} ${b.unit} x $${b.cost_per_unit.toFixed(2)} = $${b.line_cost.toFixed(2)}`).join('\n')}

Provide a concise analysis (3-5 bullet points) covering:
1. Is this margin healthy for its category? (Target: drinks 75-85%, food 65-75%)
2. Which ingredient is eating the most margin?
3. Specific ways to improve profitability (portion adjustment, price change, ingredient substitution)
4. Is the sales volume justifying the menu space?
Keep each point to 1-2 sentences. Be specific with numbers.`;

  // Try AI analysis
  const apiKey = process.env.ANTHROPIC_API_KEY || db.prepare(`SELECT value FROM settings WHERE key = 'anthropic_api_key'`).get()?.value;

  if (!apiKey) {
    // Return a rule-based analysis without AI
    const tips = [];
    if (margin < 60) tips.push(`Low margin alert: ${margin}% is below the 65% minimum target. Consider raising price by $${Math.ceil((ingredientCost / 0.65) - item.price)} or reducing portion size.`);
    else if (margin < 70) tips.push(`Margin of ${margin}% is acceptable but below optimal. A $1 price increase would bring it to ${(((item.price + 1 - ingredientCost) / (item.price + 1)) * 100).toFixed(0)}%.`);
    else tips.push(`Strong margin at ${margin}%. This item is a healthy contributor.`);

    if (breakdown.length > 0) {
      const costliest = breakdown.sort((a, b) => b.line_cost - a.line_cost)[0];
      tips.push(`Highest cost ingredient: ${costliest.name} at $${costliest.line_cost.toFixed(2)} (${((costliest.line_cost / ingredientCost) * 100).toFixed(0)}% of total cost). Look into bulk pricing or alternatives.`);
    }

    if (sales.qty === 0) tips.push('No sales in the last 30 days. Consider promoting this item or removing it from the menu.');
    else if (sales.qty < 10) tips.push(`Only ${sales.qty} sold in 30 days. Low volume means this item should either be promoted or replaced.`);
    else tips.push(`${sales.qty} units sold in 30 days generating $${(sales.qty * (item.price - ingredientCost)).toFixed(2)} profit. Solid performer.`);

    if (item.price < ingredientCost * 2) tips.push(`Markup is only ${(item.price / ingredientCost).toFixed(1)}x. Industry standard is 3-4x for drinks and 2.5-3x for food.`);

    return res.json({
      item_name: item.name,
      analysis: tips.join('\n\n'),
      source: 'rule-based',
      data: { sell_price: item.price, ingredient_cost: ingredientCost, margin, qty_sold: sales.qty, breakdown }
    });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const aiData = await response.json();
    const analysis = aiData.content?.[0]?.text || 'Analysis unavailable';

    res.json({
      item_name: item.name,
      analysis,
      source: 'ai',
      data: { sell_price: item.price, ingredient_cost: ingredientCost, margin, qty_sold: sales.qty, breakdown }
    });
  } catch (err) {
    res.status(500).json({ error: 'AI analysis failed: ' + err.message });
  }
});

module.exports = router;
