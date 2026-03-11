require('dotenv').config();
const { getDb, closeDb } = require('./database');
const { initializeSchema } = require('./schema');
const crypto = require('crypto');

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin.toString()).digest('hex');
}

function seed() {
  initializeSchema();
  const db = getDb();

  console.log('[SEED] Seeding database...');

  // ---- Employees ----
  const insertEmployee = db.prepare(`INSERT OR IGNORE INTO employees (first_name, last_name, pin_hash, role, email, phone, hourly_rate, color, hire_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const employees = [
    ['Admin', 'User', hashPin('1234'), 'admin', 'admin@nexus.pos', '555-0100', 0, '#ef4444', '2024-01-01'],
    ['Sarah', 'Johnson', hashPin('1111'), 'manager', 'sarah@nexus.pos', '555-0101', 28, '#f59e0b', '2024-01-15'],
    ['Mike', 'Chen', hashPin('2222'), 'server', 'mike@nexus.pos', '555-0102', 15, '#6366f1', '2024-02-01'],
    ['Jessica', 'Williams', hashPin('3333'), 'bartender', 'jess@nexus.pos', '555-0103', 18, '#06b6d4', '2024-02-15'],
    ['Carlos', 'Rodriguez', hashPin('4444'), 'cook', 'carlos@nexus.pos', '555-0104', 20, '#10b981', '2024-03-01'],
    ['Emma', 'Davis', hashPin('5555'), 'host', 'emma@nexus.pos', '555-0105', 14, '#8b5cf6', '2024-03-15'],
    ['James', 'Wilson', hashPin('6666'), 'server', 'james@nexus.pos', '555-0106', 15, '#ec4899', '2024-04-01'],
    ['Lisa', 'Martinez', hashPin('7777'), 'bartender', 'lisa@nexus.pos', '555-0107', 18, '#14b8a6', '2024-04-15'],
  ];
  for (const e of employees) insertEmployee.run(...e);
  console.log('[SEED] Employees created');

  // ---- Ingredient Categories ----
  const insertCat = db.prepare(`INSERT OR IGNORE INTO categories (name, color, icon) VALUES (?, ?, ?)`);
  [['Spirits', '#8b5cf6', 'wine'], ['Mixers', '#06b6d4', 'cup'], ['Beer', '#f59e0b', 'beer'],
   ['Wine', '#dc2626', 'wine'], ['Produce', '#10b981', 'leaf'], ['Proteins', '#ef4444', 'meat'],
   ['Dry Goods', '#64748b', 'box']].forEach(c => insertCat.run(...c));

  // ---- Menu Categories ----
  const insertMenuCat = db.prepare(`INSERT OR IGNORE INTO menu_categories (name, color, icon, display_order) VALUES (?, ?, ?, ?)`);
  [['Cocktails', '#8b5cf6', 'cocktail', 1], ['Beer', '#f59e0b', 'beer', 2], ['Wine', '#dc2626', 'wine', 3],
   ['Appetizers', '#06b6d4', 'plate', 4], ['Entrees', '#10b981', 'steak', 5], ['Desserts', '#ec4899', 'cake', 6],
   ['Sides', '#64748b', 'fries', 7], ['Non-Alcoholic', '#94a3b8', 'cup', 8]].forEach(c => insertMenuCat.run(...c));

  // ---- Suppliers ----
  const insertSup = db.prepare(`INSERT OR IGNORE INTO suppliers (name, contact_name, email, phone, payment_terms) VALUES (?, ?, ?, ?, ?)`);
  [['Premium Spirits Co.', 'John Smith', 'john@premspirits.com', '555-1001', 'Net 30'],
   ['Fresh Farms Produce', 'Maria Garcia', 'maria@freshfarms.com', '555-1002', 'Net 15'],
   ['Valley Meats', 'Bob Taylor', 'bob@valleymeats.com', '555-1003', 'Net 30'],
   ['Coastal Beer Dist.', 'Amy Lee', 'amy@coastalbeer.com', '555-1004', 'COD'],
   ['Wine Direct', 'Pierre Dubois', 'pierre@winedirect.com', '555-1005', 'Net 45']].forEach(s => insertSup.run(...s));

  // ---- Ingredients ----
  const insertIng = db.prepare(`INSERT OR IGNORE INTO ingredients (name, category_id, unit, cost_per_unit, supplier_id, par_level, reorder_quantity) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const ingredients = [
    ['Vodka', 1, 'oz', 0.75, 1, 100, 50], ['Gin', 1, 'oz', 0.80, 1, 80, 40],
    ['Rum', 1, 'oz', 0.70, 1, 80, 40], ['Tequila', 1, 'oz', 0.90, 1, 80, 40],
    ['Whiskey', 1, 'oz', 1.00, 1, 80, 40], ['Triple Sec', 1, 'oz', 0.50, 1, 40, 20],
    ['Simple Syrup', 2, 'oz', 0.10, null, 60, 30], ['Lime Juice', 2, 'oz', 0.15, 2, 60, 30],
    ['Lemon Juice', 2, 'oz', 0.15, 2, 40, 20], ['Cranberry Juice', 2, 'oz', 0.08, null, 80, 40],
    ['Orange Juice', 2, 'oz', 0.10, 2, 60, 30], ['Soda Water', 2, 'oz', 0.05, null, 100, 50],
    ['Tonic Water', 2, 'oz', 0.06, null, 80, 40], ['Cola', 2, 'oz', 0.05, null, 100, 50],
    ['IPA (draft)', 3, 'oz', 0.25, 4, 200, 100], ['Lager (draft)', 3, 'oz', 0.20, 4, 200, 100],
    ['Pale Ale (draft)', 3, 'oz', 0.22, 4, 200, 100],
    ['House Red Wine', 4, 'oz', 0.80, 5, 100, 50], ['House White Wine', 4, 'oz', 0.75, 5, 100, 50],
    ['Prosecco', 4, 'oz', 0.90, 5, 60, 30],
    ['Chicken Breast', 6, 'each', 3.50, 3, 30, 15], ['Burger Patty', 6, 'each', 2.80, 3, 40, 20],
    ['Shrimp', 6, 'each', 0.60, 3, 50, 25], ['Salmon Fillet', 6, 'each', 6.50, 3, 20, 10],
    ['Fries (portion)', 7, 'each', 0.80, null, 60, 30], ['Salad Mix', 5, 'each', 1.20, 2, 40, 20],
    ['Wings (6pc)', 6, 'each', 3.00, 3, 30, 15], ['Pizza Dough', 7, 'each', 1.50, null, 30, 15],
    ['Mozzarella', 7, 'oz', 0.40, null, 100, 50], ['Tomato Sauce', 7, 'oz', 0.10, null, 80, 40],
    ['Bun', 7, 'each', 0.50, null, 50, 25], ['Lettuce', 5, 'each', 0.30, 2, 40, 20],
    ['Tomato', 5, 'each', 0.40, 2, 30, 15], ['Onion', 5, 'each', 0.20, 2, 30, 15],
    ['Chocolate Cake', 7, 'each', 2.50, null, 15, 10],
  ];
  for (const i of ingredients) insertIng.run(...i);
  console.log('[SEED] Ingredients created');

  // ---- Inventory ----
  const insertInv = db.prepare(`INSERT INTO inventory (ingredient_id, quantity, full_quantity, location, status) VALUES (?, ?, ?, ?, ?)`);
  for (let i = 1; i <= 20; i++) {
    insertInv.run(i, 750, 750, 'bar', 'open');
    insertInv.run(i, 750, 750, 'storage', 'sealed');
  }
  for (let i = 21; i <= 35; i++) {
    insertInv.run(i, 20, 20, 'kitchen', 'open');
    insertInv.run(i, 20, 20, 'walk-in', 'sealed');
  }
  console.log('[SEED] Inventory stocked');

  // ---- Menu Items ----
  const insertMenu = db.prepare(`INSERT OR IGNORE INTO menu_items (name, description, category_id, price, cost, station, course, prep_time_minutes, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const menuItems = [
    // Cocktails (cat 1)
    ['Margarita', 'Classic lime margarita with salt rim', 1, 14, 3.20, 'bar', 'drink', 3, 1],
    ['Old Fashioned', 'Bourbon, bitters, orange peel', 1, 15, 3.50, 'bar', 'drink', 3, 2],
    ['Mojito', 'Rum, mint, lime, soda', 1, 13, 2.80, 'bar', 'drink', 4, 3],
    ['Moscow Mule', 'Vodka, ginger beer, lime', 1, 13, 2.50, 'bar', 'drink', 2, 4],
    ['Gin & Tonic', 'Premium gin with tonic', 1, 12, 2.40, 'bar', 'drink', 1, 5],
    ['Cosmopolitan', 'Vodka, triple sec, cranberry, lime', 1, 14, 3.00, 'bar', 'drink', 3, 6],
    ['Whiskey Sour', 'Whiskey, lemon, simple syrup', 1, 13, 3.00, 'bar', 'drink', 3, 7],
    ['Espresso Martini', 'Vodka, espresso, coffee liqueur', 1, 15, 3.80, 'bar', 'drink', 4, 8],
    // Beer (cat 2)
    ['IPA (16oz)', 'Local craft IPA', 2, 8, 3.00, 'bar', 'drink', 1, 10],
    ['Lager (16oz)', 'Classic lager draft', 2, 7, 2.40, 'bar', 'drink', 1, 11],
    ['Pale Ale (16oz)', 'Session pale ale', 2, 7.50, 2.64, 'bar', 'drink', 1, 12],
    // Wine (cat 3)
    ['House Red (glass)', 'Cabernet Sauvignon', 3, 12, 4.00, 'bar', 'drink', 1, 13],
    ['House White (glass)', 'Chardonnay', 3, 11, 3.75, 'bar', 'drink', 1, 14],
    ['Prosecco (glass)', 'Italian sparkling', 3, 13, 4.50, 'bar', 'drink', 1, 15],
    // Appetizers (cat 4)
    ['Buffalo Wings', '6pc crispy wings, blue cheese', 4, 14, 5.50, 'fryer', 'appetizer', 12, 20],
    ['Loaded Nachos', 'Chips, cheese, jalapenos, salsa', 4, 13, 4.50, 'kitchen', 'appetizer', 10, 21],
    ['Shrimp Cocktail', '6 jumbo shrimp, cocktail sauce', 4, 16, 6.00, 'kitchen', 'appetizer', 5, 22],
    ['Caesar Salad', 'Romaine, croutons, parmesan', 4, 11, 3.50, 'kitchen', 'appetizer', 5, 23],
    // Entrees (cat 5)
    ['Classic Burger', '8oz patty, lettuce, tomato, fries', 5, 16, 6.50, 'grill', 'main', 15, 30],
    ['Grilled Chicken', 'Herb chicken breast, vegetables', 5, 18, 7.00, 'grill', 'main', 18, 31],
    ['Fish & Chips', 'Beer-battered cod, fries, slaw', 5, 17, 7.50, 'fryer', 'main', 15, 32],
    ['Margherita Pizza', 'Fresh mozzarella, basil, tomato', 5, 15, 5.00, 'kitchen', 'main', 15, 33],
    ['Grilled Salmon', 'Atlantic salmon, risotto, asparagus', 5, 24, 10.00, 'grill', 'main', 20, 34],
    ['Ribeye Steak', '12oz ribeye, mashed potatoes', 5, 32, 14.00, 'grill', 'main', 20, 35],
    // Desserts (cat 6)
    ['Chocolate Lava Cake', 'Warm cake, vanilla ice cream', 6, 10, 3.50, 'kitchen', 'dessert', 12, 40],
    ['Cheesecake', 'NY style, berry compote', 6, 9, 3.00, 'kitchen', 'dessert', 3, 41],
    // Sides (cat 7)
    ['French Fries', 'Crispy seasoned fries', 7, 6, 1.50, 'fryer', 'main', 6, 50],
    ['Onion Rings', 'Beer-battered rings', 7, 7, 2.00, 'fryer', 'main', 6, 51],
    ['Side Salad', 'Mixed greens, vinaigrette', 7, 5, 1.50, 'kitchen', 'main', 3, 52],
    // Non-Alcoholic (cat 8)
    ['Soft Drink', 'Coke, Sprite, etc.', 8, 3, 0.50, 'bar', 'drink', 1, 60],
    ['Iced Tea', 'Fresh brewed', 8, 3.50, 0.40, 'bar', 'drink', 1, 61],
    ['Water', 'Still or sparkling', 8, 0, 0, 'bar', 'drink', 0, 62],
  ];
  for (const m of menuItems) insertMenu.run(...m);
  console.log('[SEED] Menu items created');

  // ---- Recipes ----
  const insertRecipe = db.prepare(`INSERT OR IGNORE INTO recipes (menu_item_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)`);
  const recipes = [
    // Margarita (menu 1): tequila + triple sec + lime juice
    [1, 4, 2, 'oz'], [1, 6, 1, 'oz'], [1, 8, 1, 'oz'],
    // Old Fashioned (menu 2): whiskey + simple syrup
    [2, 5, 2.5, 'oz'], [2, 7, 0.5, 'oz'],
    // Mojito (menu 3): rum + lime + simple syrup + soda
    [3, 3, 2, 'oz'], [3, 8, 1, 'oz'], [3, 7, 0.75, 'oz'], [3, 12, 2, 'oz'],
    // Moscow Mule (menu 4): vodka + lime
    [4, 1, 2, 'oz'], [4, 8, 0.5, 'oz'],
    // G&T (menu 5): gin + tonic
    [5, 2, 2, 'oz'], [5, 13, 4, 'oz'],
    // Cosmo (menu 6): vodka + triple sec + cranberry + lime
    [6, 1, 1.5, 'oz'], [6, 6, 0.5, 'oz'], [6, 10, 1, 'oz'], [6, 8, 0.5, 'oz'],
    // Whiskey Sour (menu 7): whiskey + lemon + simple
    [7, 5, 2, 'oz'], [7, 9, 1, 'oz'], [7, 7, 0.75, 'oz'],
    // Espresso Martini (menu 8): vodka
    [8, 1, 2, 'oz'],
    // IPA (menu 9)
    [9, 15, 16, 'oz'],
    // Lager (menu 10)
    [10, 16, 16, 'oz'],
    // Pale Ale (menu 11)
    [11, 17, 16, 'oz'],
    // Red Wine (menu 12)
    [12, 18, 6, 'oz'],
    // White Wine (menu 13)
    [13, 19, 6, 'oz'],
    // Prosecco (menu 14)
    [14, 20, 6, 'oz'],
    // Wings (menu 15)
    [15, 27, 1, 'each'],
    // Shrimp Cocktail (menu 17)
    [17, 23, 6, 'each'],
    // Caesar Salad (menu 18)
    [18, 26, 1, 'each'],
    // Burger (menu 19)
    [19, 22, 1, 'each'], [19, 25, 1, 'each'], [19, 31, 1, 'each'], [19, 32, 1, 'each'],
    // Grilled Chicken (menu 20)
    [20, 21, 1, 'each'],
    // Fish & Chips (menu 21)
    [21, 25, 1, 'each'],
    // Pizza (menu 22)
    [22, 28, 1, 'each'], [22, 29, 4, 'oz'], [22, 30, 3, 'oz'],
    // Salmon (menu 23)
    [23, 24, 1, 'each'],
    // Fries (menu 27)
    [27, 25, 1, 'each'],
    // Chocolate Cake (menu 25)
    [25, 35, 1, 'each'],
    // Soft Drink (menu 30)
    [30, 14, 12, 'oz'],
  ];
  for (const r of recipes) insertRecipe.run(...r);
  console.log('[SEED] Recipes created');

  // ---- Tables ----
  const insertTable = db.prepare(`INSERT OR IGNORE INTO tables (name, section, capacity, shape, pos_x, pos_y, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const tables = [
    // Main dining
    ['T1', 'main', 4, 'rect', 80, 80, 90, 90], ['T2', 'main', 4, 'rect', 200, 80, 90, 90],
    ['T3', 'main', 6, 'rect', 320, 80, 110, 90], ['T4', 'main', 2, 'circle', 80, 220, 70, 70],
    ['T5', 'main', 2, 'circle', 180, 220, 70, 70], ['T6', 'main', 4, 'rect', 280, 220, 90, 90],
    ['T7', 'main', 8, 'rect', 80, 360, 140, 90], ['T8', 'main', 4, 'rect', 260, 360, 90, 90],
    // Bar
    ['B1', 'bar', 2, 'rect', 500, 80, 70, 60], ['B2', 'bar', 2, 'rect', 580, 80, 70, 60],
    ['B3', 'bar', 2, 'rect', 660, 80, 70, 60], ['B4', 'bar', 2, 'rect', 740, 80, 70, 60],
    // Patio
    ['P1', 'patio', 4, 'circle', 500, 220, 80, 80], ['P2', 'patio', 4, 'circle', 620, 220, 80, 80],
    ['P3', 'patio', 6, 'rect', 500, 340, 110, 90], ['P4', 'patio', 6, 'rect', 640, 340, 110, 90],
  ];
  for (const t of tables) insertTable.run(...t);
  console.log('[SEED] Tables created');

  // ---- Customers ----
  const insertCust = db.prepare(`INSERT OR IGNORE INTO customers (first_name, last_name, email, phone, birthday, loyalty_points, total_visits, total_spent, vip_tier) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  [
    ['Alex', 'Thompson', 'alex@email.com', '555-2001', '1988-06-15', 2500, 35, 1850.00, 'gold'],
    ['Rachel', 'Kim', 'rachel@email.com', '555-2002', '1992-03-22', 750, 12, 680.00, 'silver'],
    ['David', 'Brown', 'david@email.com', '555-2003', '1985-11-08', 5200, 65, 4200.00, 'platinum'],
    ['Sophie', 'Anderson', 'sophie@email.com', '555-2004', '1995-09-30', 150, 4, 220.00, 'regular'],
    ['Marcus', 'Lee', 'marcus@email.com', '555-2005', '1990-01-18', 1200, 20, 1100.00, 'silver'],
    ['Olivia', 'Taylor', null, '555-2006', '1987-07-04', 350, 8, 450.00, 'regular'],
    ['James', 'White', 'james.w@email.com', '555-2007', null, 3800, 48, 3200.00, 'gold'],
    ['Emily', 'Clark', 'emily@email.com', '555-2008', '1993-12-25', 100, 2, 95.00, 'regular'],
  ].forEach(c => insertCust.run(...c));
  console.log('[SEED] Customers created');

  // ---- Menu Modifiers ----
  const insertMod = db.prepare(`INSERT OR IGNORE INTO menu_modifiers (name, category, price_adjustment) VALUES (?, ?, ?)`);
  [
    ['Extra Shot', 'Drinks', 2.00], ['No Ice', 'Drinks', 0], ['Double', 'Drinks', 4.00],
    ['Rocks', 'Drinks', 0], ['Up', 'Drinks', 0], ['Dirty', 'Drinks', 0],
    ['Add Bacon', 'Food', 2.50], ['Add Cheese', 'Food', 1.50], ['Gluten Free', 'Food', 2.00],
    ['Extra Sauce', 'Food', 0.50], ['No Onion', 'Food', 0], ['Well Done', 'Food', 0],
    ['Medium Rare', 'Food', 0], ['Medium', 'Food', 0], ['Rare', 'Food', 0],
  ].forEach(m => insertMod.run(...m));
  console.log('[SEED] Modifiers created');

  // ---- Pricing Rules (Happy Hour) ----
  db.prepare(`INSERT OR IGNORE INTO pricing_rules (name, type, category_id, discount_type, discount_value, start_time, end_time, days_of_week, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('Happy Hour Cocktails', 'happy_hour', 1, 'percent', 25, '16:00', '18:00', '["mon","tue","wed","thu","fri"]', 1);
  db.prepare(`INSERT OR IGNORE INTO pricing_rules (name, type, category_id, discount_type, discount_value, start_time, end_time, days_of_week, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('Happy Hour Beer', 'happy_hour', 2, 'fixed', 2, '16:00', '18:00', '["mon","tue","wed","thu","fri"]', 1);
  db.prepare(`INSERT OR IGNORE INTO pricing_rules (name, type, category_id, discount_type, discount_value, start_time, end_time, days_of_week, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('Wine Wednesday', 'day_of_week', 3, 'percent', 50, '17:00', '22:00', '["wed"]', 1);
  console.log('[SEED] Pricing rules created');

  // ---- Initial Alerts ----
  db.prepare(`INSERT INTO alerts (type, severity, title, message, data) VALUES (?, ?, ?, ?, ?)`)
    .run('system', 'low', 'Welcome to Nexus POS!', 'Your system is set up and ready to go. Start by exploring the POS terminal.', '{}');

  console.log('[SEED] Seeding complete!');
  console.log('');
  console.log('  Default PINs:');
  console.log('  Admin:      1234');
  console.log('  Manager:    1111');
  console.log('  Server:     2222');
  console.log('  Bartender:  3333');
  console.log('  Cook:       4444');
  console.log('  Host:       5555');
  console.log('');

  closeDb();
}

seed();
