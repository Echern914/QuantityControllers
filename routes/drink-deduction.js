/* ============================================================
   VENUECORE - Recipe Deduction Routes
   Real-time inventory deduction from Clover sales
   Covers ALL inventory: drinks, food, garnishes, supplies
   ============================================================ */
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { deductForOrder } = require('../services/deduction');

// ============================================================
// LIVE STOCK CARDS - Real-time ingredient status
// ============================================================

// GET /api/drink-deduction/stock-cards - All ingredient cards with fractional display
router.get('/stock-cards', (req, res) => {
  const db = getDb();
  const cards = db.prepare(`
    SELECT i.id, i.name, i.unit, i.cost_per_unit, i.par_level, i.category_id,
           c.name as category_name, c.color as category_color,
           COALESCE(SUM(CASE WHEN inv.status != 'empty' THEN inv.quantity ELSE 0 END), 0) as current_stock,
           COALESCE(SUM(inv.full_quantity), 0) as total_capacity,
           COUNT(CASE WHEN inv.status = 'open' THEN 1 END) as open_containers,
           COUNT(CASE WHEN inv.status = 'sealed' THEN 1 END) as sealed_containers,
           MAX(CASE WHEN inv.status != 'empty' THEN inv.received_date END) as last_restocked
    FROM ingredients i
    LEFT JOIN inventory inv ON i.id = inv.ingredient_id
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE i.active = 1
    GROUP BY i.id
    ORDER BY i.name
  `).all();

  // Enrich with usage stats and recipe count
  const usageStmt = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) as today_usage
    FROM transactions
    WHERE ingredient_id = ? AND type = 'sale' AND date(created_at) = date('now')
  `);

  const recipeCountStmt = db.prepare(`
    SELECT COUNT(DISTINCT menu_item_id) as drink_count FROM recipes WHERE ingredient_id = ?
  `);

  const avgDailyStmt = db.prepare(`
    SELECT COALESCE(AVG(daily_total), 0) as avg_daily
    FROM (
      SELECT SUM(quantity) as daily_total
      FROM transactions
      WHERE ingredient_id = ? AND type = 'sale' AND created_at >= datetime('now', '-14 days')
      GROUP BY date(created_at)
    )
  `);

  for (const card of cards) {
    const usage = usageStmt.get(card.id);
    const recipes = recipeCountStmt.get(card.id);
    const avgDaily = avgDailyStmt.get(card.id);

    card.today_usage = usage.today_usage;
    card.drink_count = recipes.drink_count;
    card.avg_daily_usage = avgDaily.avg_daily;
    card.days_remaining = avgDaily.avg_daily > 0
      ? Math.floor(card.current_stock / avgDaily.avg_daily)
      : card.current_stock > 0 ? 999 : 0;

    // Stock level classification
    if (card.current_stock <= 0) {
      card.stock_level = 'critical';
    } else if (card.par_level > 0 && card.current_stock <= card.par_level * 1.2) {
      card.stock_level = card.current_stock <= card.par_level ? 'critical' : 'low';
    } else if (card.total_capacity > 0 && card.current_stock / card.total_capacity < 0.25) {
      card.stock_level = 'low';
    } else {
      card.stock_level = 'good';
    }
  }

  res.json(cards);
});

// ============================================================
// INGREDIENT DETAIL - Deduction history, drinks remaining, restock info
// ============================================================

// GET /api/drink-deduction/ingredient/:id - Full detail for an ingredient card
router.get('/ingredient/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);

  const ingredient = db.prepare(`
    SELECT i.*, c.name as category_name, s.name as supplier_name,
           COALESCE(SUM(CASE WHEN inv.status != 'empty' THEN inv.quantity ELSE 0 END), 0) as current_stock,
           COALESCE(SUM(inv.full_quantity), 0) as total_capacity
    FROM ingredients i
    LEFT JOIN categories c ON i.category_id = c.id
    LEFT JOIN suppliers s ON i.supplier_id = s.id
    LEFT JOIN inventory inv ON i.id = inv.ingredient_id
    WHERE i.id = ?
    GROUP BY i.id
  `).get(id);

  if (!ingredient) return res.status(404).json({ error: 'Ingredient not found' });

  // Today's deduction history (what items used it)
  const deductions = db.prepare(`
    SELECT t.quantity, t.unit, t.created_at, t.status,
           mi.name as drink_name, o.order_number,
           e.first_name || ' ' || e.last_name as employee_name
    FROM transactions t
    LEFT JOIN menu_items mi ON t.menu_item_id = mi.id
    LEFT JOIN orders o ON t.order_id = o.id
    LEFT JOIN employees e ON t.employee_id = e.id
    WHERE t.ingredient_id = ? AND t.type = 'sale' AND date(t.created_at) = date('now')
    ORDER BY t.created_at DESC
  `).all(id);

  // How many more items can be made with this ingredient
  const recipes = db.prepare(`
    SELECT r.menu_item_id, r.quantity as required_qty, r.unit,
           mi.name as drink_name, mi.price
    FROM recipes r
    JOIN menu_items mi ON r.menu_item_id = mi.id
    WHERE r.ingredient_id = ? AND mi.active = 1
    ORDER BY mi.name
  `).all(id);

  const drinksRemaining = recipes.map(r => ({
    drink_name: r.drink_name,
    price: r.price,
    required_per_drink: r.required_qty,
    unit: r.unit,
    can_make: r.required_qty > 0 ? Math.floor(ingredient.current_stock / r.required_qty) : 0,
  }));

  // Last restock info
  const lastRestock = db.prepare(`
    SELECT inv.received_date, inv.quantity, inv.full_quantity, inv.location
    FROM inventory inv
    WHERE inv.ingredient_id = ? AND inv.received_date IS NOT NULL
    ORDER BY inv.received_date DESC LIMIT 1
  `).get(id);

  // Weekly usage breakdown
  const weeklyUsage = db.prepare(`
    SELECT date(created_at) as day,
           SUM(quantity) as total_used,
           COUNT(*) as pour_count
    FROM transactions
    WHERE ingredient_id = ? AND type = 'sale' AND created_at >= datetime('now', '-7 days')
    GROUP BY date(created_at)
    ORDER BY day DESC
  `).all(id);

  res.json({
    ingredient,
    deductions,
    drinks_remaining: drinksRemaining,
    last_restock: lastRestock,
    weekly_usage: weeklyUsage,
  });
});

// ============================================================
// CLOVER ORDER SYNC - Process Clover orders and auto-deduct
// ============================================================

// POST /api/drink-deduction/process-clover-order - Process a Clover order for deduction
router.post('/process-clover-order', (req, res) => {
  const { clover_order_id, line_items } = req.body;
  const db = getDb();

  if (!clover_order_id || !line_items) {
    return res.status(400).json({ error: 'clover_order_id and line_items required' });
  }

  // Check if we already processed this order
  const existing = db.prepare(`SELECT id FROM transactions WHERE clover_order_id = ? LIMIT 1`).get(clover_order_id);
  if (existing) {
    return res.json({ already_processed: true, message: 'Order already deducted' });
  }

  // Map Clover items to local menu items
  const results = [];
  const orderItems = [];

  for (const li of line_items) {
    // Try to match by clover_item_id first, then by name
    let menuItem = null;
    if (li.item_id) {
      menuItem = db.prepare(`SELECT * FROM menu_items WHERE clover_item_id = ? AND active = 1`).get(li.item_id);
    }
    if (!menuItem && li.name) {
      menuItem = db.prepare(`SELECT * FROM menu_items WHERE name = ? AND active = 1`).get(li.name);
    }

    if (menuItem) {
      orderItems.push({
        menu_item_id: menuItem.id,
        quantity: li.quantity || 1,
        name: menuItem.name,
      });
    } else {
      results.push({ item: li.name, status: 'NOT_MATCHED', message: 'No matching menu item found' });
    }
  }

  if (orderItems.length === 0) {
    return res.json({ deductions: results, message: 'No items matched' });
  }

  // Create a local order record for tracking
  const orderResult = db.prepare(`
    INSERT INTO orders (order_number, order_type, status, notes)
    VALUES (?, 'clover', 'closed', ?)
  `).run(`CLV-${clover_order_id.slice(-8)}`, `Clover order ${clover_order_id}`);

  const orderId = Number(orderResult.lastInsertRowid);

  // Insert order items
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, menu_item_id, name, quantity, unit_price)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const item of orderItems) {
    const mi = db.prepare(`SELECT price FROM menu_items WHERE id = ?`).get(item.menu_item_id);
    insertItem.run(orderId, item.menu_item_id, item.name, item.quantity, mi?.price || 0);
  }

  // Run deduction engine
  const deductionResults = deductForOrder(orderId, orderItems, null);

  // Tag transactions with clover_order_id
  db.prepare(`UPDATE transactions SET clover_order_id = ? WHERE order_id = ?`).run(clover_order_id, orderId);

  // Broadcast stock update via SSE
  if (req.app.locals.broadcast) {
    req.app.locals.broadcast({
      type: 'stock_deduction',
      order_number: `CLV-${clover_order_id.slice(-8)}`,
      deductions: deductionResults,
      timestamp: new Date().toISOString(),
    });
  }

  res.json({ order_id: orderId, deductions: deductionResults });
});

// ============================================================
// END OF NIGHT SUMMARY
// ============================================================

// GET /api/drink-deduction/end-of-night - Nightly summary report
router.get('/end-of-night', (req, res) => {
  const db = getDb();
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  // Every bottle opened today
  const bottlesOpened = db.prepare(`
    SELECT inv.id, i.name as ingredient_name, i.unit, inv.location,
           inv.opened_at, inv.full_quantity
    FROM inventory inv
    JOIN ingredients i ON inv.ingredient_id = i.id
    WHERE date(inv.opened_at) = ? AND inv.status IN ('open', 'empty')
    ORDER BY inv.opened_at
  `).all(date);

  // Total pours per ingredient
  const totalPours = db.prepare(`
    SELECT i.id, i.name, i.unit, i.par_level,
           COALESCE(SUM(t.quantity), 0) as total_poured,
           COUNT(t.id) as pour_count,
           COUNT(DISTINCT t.menu_item_id) as drink_types,
           COUNT(DISTINCT t.order_id) as order_count
    FROM ingredients i
    LEFT JOIN transactions t ON i.id = t.ingredient_id AND t.type = 'sale' AND date(t.created_at) = ?
    WHERE i.active = 1
    GROUP BY i.id
    HAVING total_poured > 0
    ORDER BY total_poured DESC
  `).all(date);

  // Variance: expected vs actual (orders placed vs stock change)
  const variance = db.prepare(`
    SELECT i.id, i.name, i.unit,
           COALESCE(SUM(CASE WHEN t.type = 'sale' THEN t.quantity ELSE 0 END), 0) as expected_usage,
           COALESCE(SUM(CASE WHEN t.type = 'waste' THEN t.quantity ELSE 0 END), 0) as logged_waste,
           COALESCE(SUM(CASE WHEN t.status = 'PARTIAL' OR t.status = 'OUT_OF_STOCK' THEN t.quantity ELSE 0 END), 0) as flagged_usage
    FROM ingredients i
    LEFT JOIN transactions t ON i.id = t.ingredient_id AND date(t.created_at) = ?
    WHERE i.active = 1
    GROUP BY i.id
    HAVING expected_usage > 0 OR logged_waste > 0
    ORDER BY expected_usage DESC
  `).all(date);

  // Zero-stock sales (drinks rung up when ingredient was at zero)
  const zeroStockSales = db.prepare(`
    SELECT t.id, t.quantity, t.unit, t.created_at, t.status,
           i.name as ingredient_name,
           mi.name as drink_name,
           o.order_number,
           e.first_name || ' ' || e.last_name as employee_name
    FROM transactions t
    JOIN ingredients i ON t.ingredient_id = i.id
    LEFT JOIN menu_items mi ON t.menu_item_id = mi.id
    LEFT JOIN orders o ON t.order_id = o.id
    LEFT JOIN employees e ON t.employee_id = e.id
    WHERE t.type = 'sale' AND date(t.created_at) = ?
      AND (t.status = 'PARTIAL' OR t.status = 'OUT_OF_STOCK')
    ORDER BY t.created_at DESC
  `).all(date);

  // Top items sold today
  const topDrinks = db.prepare(`
    SELECT mi.name, SUM(oi.quantity) as qty_sold, SUM(oi.quantity * oi.unit_price) as revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    WHERE date(o.opened_at) = ? AND o.status != 'voided' AND oi.voided = 0
    GROUP BY mi.id
    ORDER BY qty_sold DESC
    LIMIT 15
  `).all(date);

  res.json({
    date,
    bottles_opened: bottlesOpened,
    total_pours: totalPours,
    variance,
    zero_stock_sales: zeroStockSales,
    top_drinks: topDrinks,
    summary: {
      total_containers_opened: bottlesOpened.length,
      total_ingredients_used: totalPours.length,
      total_deductions: totalPours.reduce((s, p) => s + p.pour_count, 0),
      total_variance_flags: zeroStockSales.length,
      total_items_sold: topDrinks.reduce((s, d) => s + d.qty_sold, 0),
      total_revenue: topDrinks.reduce((s, d) => s + d.revenue, 0),
    }
  });
});

// ============================================================
// RECIPE MANAGEMENT (enhanced)
// ============================================================

// GET /api/drink-deduction/recipes - All recipes with stock status
router.get('/recipes', (req, res) => {
  const db = getDb();
  const recipes = db.prepare(`
    SELECT r.id, r.menu_item_id, r.ingredient_id, r.quantity, r.unit,
           mi.name as drink_name, mi.price as drink_price, mi.station, mi.is_86d,
           mc.name as category_name,
           i.name as ingredient_name, i.cost_per_unit, i.unit as ingredient_unit,
           COALESCE(stock.current_stock, 0) as ingredient_stock
    FROM recipes r
    JOIN menu_items mi ON r.menu_item_id = mi.id
    JOIN ingredients i ON r.ingredient_id = i.id
    LEFT JOIN menu_categories mc ON mi.category_id = mc.id
    LEFT JOIN (
      SELECT ingredient_id, SUM(CASE WHEN status != 'empty' THEN quantity ELSE 0 END) as current_stock
      FROM inventory GROUP BY ingredient_id
    ) stock ON r.ingredient_id = stock.ingredient_id
    WHERE mi.active = 1
    ORDER BY mi.name, i.name
  `).all();

  // Group by menu item
  const grouped = {};
  for (const r of recipes) {
    if (!grouped[r.menu_item_id]) {
      grouped[r.menu_item_id] = {
        menu_item_id: r.menu_item_id,
        drink_name: r.drink_name,
        drink_price: r.drink_price,
        station: r.station,
        is_86d: r.is_86d,
        category_name: r.category_name,
        ingredients: [],
        total_cost: 0,
        can_make: Infinity,
      };
    }
    const lineCost = +(r.quantity * r.cost_per_unit).toFixed(2);
    const canMake = r.quantity > 0 ? Math.floor(r.ingredient_stock / r.quantity) : 0;

    grouped[r.menu_item_id].ingredients.push({
      ingredient_id: r.ingredient_id,
      name: r.ingredient_name,
      quantity: r.quantity,
      unit: r.unit,
      cost_per_unit: r.cost_per_unit,
      line_cost: lineCost,
      current_stock: r.ingredient_stock,
      can_make: canMake,
    });

    grouped[r.menu_item_id].total_cost += lineCost;
    grouped[r.menu_item_id].can_make = Math.min(grouped[r.menu_item_id].can_make, canMake);
  }

  // Finalize
  const result = Object.values(grouped).map(d => ({
    ...d,
    total_cost: +d.total_cost.toFixed(2),
    can_make: d.can_make === Infinity ? 0 : d.can_make,
    margin_percent: d.drink_price > 0 ? +(((d.drink_price - d.total_cost) / d.drink_price) * 100).toFixed(1) : 0,
  }));

  res.json(result);
});

// ============================================================
// MANUAL DEDUCTION - For testing / manual use
// ============================================================

// POST /api/drink-deduction/manual - Manually deduct a menu item
router.post('/manual', (req, res) => {
  const { menu_item_id, quantity, employee_id } = req.body;
  const db = getDb();

  if (!menu_item_id) return res.status(400).json({ error: 'menu_item_id required' });

  const menuItem = db.prepare(`SELECT * FROM menu_items WHERE id = ?`).get(menu_item_id);
  if (!menuItem) return res.status(404).json({ error: 'Menu item not found' });

  // Create order for tracking
  const orderResult = db.prepare(`
    INSERT INTO orders (order_number, order_type, status, employee_id, notes)
    VALUES (?, 'manual', 'closed', ?, 'Manual deduction')
  `).run(`MAN-${Date.now().toString(36).toUpperCase()}`, employee_id);

  const orderId = Number(orderResult.lastInsertRowid);

  db.prepare(`INSERT INTO order_items (order_id, menu_item_id, name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`)
    .run(orderId, menu_item_id, menuItem.name, quantity || 1, menuItem.price);

  const orderItems = [{ menu_item_id, quantity: quantity || 1 }];
  const deductionResults = deductForOrder(orderId, orderItems, employee_id);

  // Broadcast
  if (req.app.locals.broadcast) {
    req.app.locals.broadcast({
      type: 'stock_deduction',
      order_number: `MAN-${orderId}`,
      deductions: deductionResults,
      timestamp: new Date().toISOString(),
    });
  }

  res.json({ order_id: orderId, deductions: deductionResults });
});

module.exports = router;
