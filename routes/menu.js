const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// GET /api/menu/categories
router.get('/categories', (req, res) => {
  const db = getDb();
  const categories = db.prepare(`SELECT * FROM menu_categories WHERE active = 1 ORDER BY display_order, name`).all();
  res.json(categories);
});

// POST /api/menu/categories
router.post('/categories', (req, res) => {
  const { name, color, icon } = req.body;
  const db = getDb();
  const result = db.prepare(`INSERT INTO menu_categories (name, color, icon) VALUES (?, ?, ?)`).run(name, color || '#6366f1', icon || 'utensils');
  res.json({ id: result.lastInsertRowid, name, color, icon });
});

// PUT /api/menu/categories/:id
router.put('/categories/:id', (req, res) => {
  const { name, color, display_order } = req.body;
  const db = getDb();
  db.prepare(`UPDATE menu_categories SET name=?, color=?, display_order=? WHERE id=?`)
    .run(name, color || '#6366f1', display_order || 0, req.params.id);
  res.json({ success: true });
});

// DELETE /api/menu/categories/:id
router.delete('/categories/:id', (req, res) => {
  const db = getDb();
  // Unlink items from this category
  db.prepare(`UPDATE menu_items SET category_id = NULL WHERE category_id = ?`).run(req.params.id);
  db.prepare(`UPDATE menu_categories SET active = 0 WHERE id = ?`).run(req.params.id);
  res.json({ success: true });
});

// GET /api/menu/items
router.get('/items', (req, res) => {
  const db = getDb();
  const { category_id, active_only } = req.query;
  let sql = `SELECT mi.*, mc.name as category_name, mc.color as category_color
             FROM menu_items mi
             LEFT JOIN menu_categories mc ON mi.category_id = mc.id`;
  const conditions = [];
  const params = [];

  if (category_id) { conditions.push('mi.category_id = ?'); params.push(category_id); }
  if (active_only !== 'false') { conditions.push('mi.active = 1'); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY mi.display_order, mi.name';

  const items = db.prepare(sql).all(...params);

  // Attach recipes
  const recipeStmt = db.prepare(`SELECT r.*, i.name as ingredient_name FROM recipes r JOIN ingredients i ON r.ingredient_id = i.id WHERE r.menu_item_id = ?`);
  for (const item of items) {
    item.recipes = recipeStmt.all(item.id);
  }

  res.json(items);
});

// POST /api/menu/items
router.post('/items', (req, res) => {
  const { name, description, category_id, price, cost, prep_time_minutes, course, station, tax_rate, recipes: itemRecipes } = req.body;
  const db = getDb();

  const result = db.prepare(`
    INSERT INTO menu_items (name, description, category_id, price, cost, prep_time_minutes, course, station, tax_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, description, category_id, price, cost || 0, prep_time_minutes || 5, course || 'main', station || 'kitchen', tax_rate);

  const menuItemId = result.lastInsertRowid;

  if (itemRecipes && itemRecipes.length) {
    const insertRecipe = db.prepare(`INSERT INTO recipes (menu_item_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)`);
    for (const r of itemRecipes) {
      insertRecipe.run(menuItemId, r.ingredient_id, r.quantity, r.unit || 'oz');
    }
  }

  res.json({ id: menuItemId, name, price });
});

// PUT /api/menu/items/:id
router.put('/items/:id', (req, res) => {
  const { name, description, category_id, price, cost, prep_time_minutes, course, station, tax_rate, active, recipes: itemRecipes } = req.body;
  const db = getDb();

  db.prepare(`
    UPDATE menu_items SET name=?, description=?, category_id=?, price=?, cost=?, prep_time_minutes=?, course=?, station=?, tax_rate=?, active=?
    WHERE id=?
  `).run(name, description, category_id, price, cost, prep_time_minutes, course, station, tax_rate, active ?? 1, req.params.id);

  if (itemRecipes) {
    db.prepare(`DELETE FROM recipes WHERE menu_item_id = ?`).run(req.params.id);
    const insertRecipe = db.prepare(`INSERT INTO recipes (menu_item_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)`);
    for (const r of itemRecipes) {
      insertRecipe.run(req.params.id, r.ingredient_id, r.quantity, r.unit || 'oz');
    }
  }

  res.json({ success: true });
});

// POST /api/menu/items/:id/86
router.post('/items/:id/86', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE menu_items SET is_86d = 1 WHERE id = ?`).run(req.params.id);
  const item = db.prepare(`SELECT name FROM menu_items WHERE id = ?`).get(req.params.id);

  // Broadcast 86'd notification
  req.app.locals.broadcast({ type: 'item_86d', item: item?.name, itemId: req.params.id });
  res.json({ success: true });
});

// POST /api/menu/items/:id/un86
router.post('/items/:id/un86', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE menu_items SET is_86d = 0 WHERE id = ?`).run(req.params.id);
  res.json({ success: true });
});

// GET /api/menu/modifiers
router.get('/modifiers', (req, res) => {
  const db = getDb();
  res.json(db.prepare(`SELECT * FROM menu_modifiers WHERE available = 1 ORDER BY category, name`).all());
});

// POST /api/menu/modifiers
router.post('/modifiers', (req, res) => {
  const { name, category, price_adjustment } = req.body;
  const db = getDb();
  const result = db.prepare(`INSERT INTO menu_modifiers (name, category, price_adjustment) VALUES (?, ?, ?)`).run(name, category, price_adjustment || 0);
  res.json({ id: result.lastInsertRowid });
});

// PUT /api/menu/modifiers/:id
router.put('/modifiers/:id', (req, res) => {
  const { name, category, price_adjustment } = req.body;
  const db = getDb();
  db.prepare(`UPDATE menu_modifiers SET name=?, category=?, price_adjustment=? WHERE id=?`)
    .run(name, category || 'General', price_adjustment || 0, req.params.id);
  res.json({ success: true });
});

// GET /api/menu/combos
router.get('/combos', (req, res) => {
  const db = getDb();
  const combos = db.prepare(`SELECT * FROM combos WHERE active = 1`).all();
  const itemStmt = db.prepare(`SELECT ci.*, mi.name, mi.price FROM combo_items ci JOIN menu_items mi ON ci.menu_item_id = mi.id WHERE ci.combo_id = ?`);
  for (const combo of combos) {
    combo.items = itemStmt.all(combo.id);
  }
  res.json(combos);
});

// GET /api/menu/pricing-rules
router.get('/pricing-rules', (req, res) => {
  const db = getDb();
  res.json(db.prepare(`SELECT * FROM pricing_rules WHERE active = 1`).all());
});

// POST /api/menu/pricing-rules
router.post('/pricing-rules', (req, res) => {
  const { name, type, menu_item_id, category_id, discount_type, discount_value, start_time, end_time, start_date, end_date, days_of_week } = req.body;
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO pricing_rules (name, type, menu_item_id, category_id, discount_type, discount_value, start_time, end_time, start_date, end_date, days_of_week)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, type, menu_item_id, category_id, discount_type, discount_value, start_time, end_time, start_date, end_date, JSON.stringify(days_of_week || []));
  res.json({ id: result.lastInsertRowid });
});

// GET /api/menu/active-prices - get menu with active pricing rules applied
router.get('/active-prices', (req, res) => {
  const db = getDb();
  const items = db.prepare(`SELECT * FROM menu_items WHERE active = 1 AND is_86d = 0 ORDER BY display_order, name`).all();
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5);
  const currentDay = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()];
  const currentDate = now.toISOString().slice(0, 10);

  const rules = db.prepare(`SELECT * FROM pricing_rules WHERE active = 1`).all();

  for (const item of items) {
    item.original_price = item.price;
    item.active_discount = null;

    for (const rule of rules) {
      if (rule.menu_item_id && rule.menu_item_id !== item.id) continue;
      if (rule.category_id && rule.category_id !== item.category_id) continue;

      // Check time window
      if (rule.start_time && rule.end_time) {
        if (currentTime < rule.start_time || currentTime > rule.end_time) continue;
      }
      // Check date range
      if (rule.start_date && currentDate < rule.start_date) continue;
      if (rule.end_date && currentDate > rule.end_date) continue;
      // Check day of week
      if (rule.days_of_week && rule.days_of_week !== '[]') {
        const days = JSON.parse(rule.days_of_week);
        if (days.length > 0 && !days.includes(currentDay)) continue;
      }

      // Apply discount
      if (rule.discount_type === 'percent') {
        item.price = +(item.price * (1 - rule.discount_value / 100)).toFixed(2);
      } else if (rule.discount_type === 'fixed') {
        item.price = +(item.price - rule.discount_value).toFixed(2);
      } else if (rule.discount_type === 'price_override') {
        item.price = rule.discount_value;
      }
      item.active_discount = rule.name;
      break; // First matching rule wins
    }
  }

  res.json(items);
});

module.exports = router;
