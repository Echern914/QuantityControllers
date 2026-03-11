const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { logWaste } = require('../services/deduction');

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

  res.json(db.prepare(sql).all(...params));
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
  res.json({ id: result.lastInsertRowid });
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
  res.json({ id: result.lastInsertRowid });
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
  res.json({ id: result.lastInsertRowid });
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
  sql += ' ORDER BY w.created_at DESC LIMIT 500';
  res.json(db.prepare(sql).all(...params));
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

  res.json({ id: result });
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
  res.json({ id: result.lastInsertRowid });
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

module.exports = router;
