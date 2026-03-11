const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDb } = require('../db/database');
const { hashPin, generateToken } = require('../middleware/auth');

// POST /api/demo/start - Seed demo data and return a demo session
router.post('/start', (req, res) => {
  const db = getDb();

  // Check if demo data already exists (by checking for demo employee)
  const existing = db.prepare(`SELECT id FROM employees WHERE email = 'demo@venuecore.pos'`).get();
  if (existing) {
    // Clean up old demo data first
    cleanupDemo(db);
  }

  // ---- Demo Employees ----
  const insertEmp = db.prepare(`INSERT INTO employees (first_name, last_name, pin_hash, role, email, phone, hourly_rate, color, hire_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const demoAdmin = insertEmp.run('Demo', 'Admin', hashPin('0000'), 'admin', 'demo@venuecore.pos', '555-0000', 0, '#6366f1', '2025-01-01');
  const demoAdminId = demoAdmin.lastInsertRowid;
  const demoMgr = insertEmp.run('Sarah', 'Johnson', hashPin('0001'), 'manager', 'demo.mgr@venuecore.pos', '555-0001', 28, '#f59e0b', '2025-01-15');
  const demoMgrId = demoMgr.lastInsertRowid;
  const demoServer = insertEmp.run('Mike', 'Chen', hashPin('0002'), 'server', 'demo.server@venuecore.pos', '555-0002', 15, '#06b6d4', '2025-02-01');
  const demoServerId = demoServer.lastInsertRowid;
  const demoBartender = insertEmp.run('Jessica', 'Williams', hashPin('0003'), 'bartender', 'demo.bar@venuecore.pos', '555-0003', 18, '#ec4899', '2025-02-15');
  const demoBartenderId = demoBartender.lastInsertRowid;
  const demoCook = insertEmp.run('Carlos', 'Rodriguez', hashPin('0004'), 'cook', 'demo.cook@venuecore.pos', '555-0004', 20, '#10b981', '2025-03-01');
  const demoCookId = demoCook.lastInsertRowid;

  // ---- Ingredient Categories ----
  const insertCat = db.prepare(`INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)`);
  const catSpirits = insertCat.run('Spirits', '#8b5cf6', 'wine').lastInsertRowid;
  const catMixers = insertCat.run('Mixers', '#06b6d4', 'cup').lastInsertRowid;
  const catBeer = insertCat.run('Beer', '#f59e0b', 'beer').lastInsertRowid;
  const catProduce = insertCat.run('Produce', '#10b981', 'leaf').lastInsertRowid;
  const catProteins = insertCat.run('Proteins', '#ef4444', 'meat').lastInsertRowid;

  // ---- Menu Categories ----
  const insertMenuCat = db.prepare(`INSERT INTO menu_categories (name, color, icon, display_order) VALUES (?, ?, ?, ?)`);
  const mcCocktails = insertMenuCat.run('Cocktails', '#8b5cf6', 'cocktail', 1).lastInsertRowid;
  const mcBeer = insertMenuCat.run('Beer', '#f59e0b', 'beer', 2).lastInsertRowid;
  const mcApps = insertMenuCat.run('Appetizers', '#06b6d4', 'plate', 3).lastInsertRowid;
  const mcEntrees = insertMenuCat.run('Entrees', '#10b981', 'steak', 4).lastInsertRowid;
  const mcNonAlc = insertMenuCat.run('Non-Alcoholic', '#94a3b8', 'cup', 5).lastInsertRowid;

  // ---- Suppliers ----
  const insertSup = db.prepare(`INSERT INTO suppliers (name, contact_name, email, phone, payment_terms) VALUES (?, ?, ?, ?, ?)`);
  const sup1 = insertSup.run('Premium Spirits Co.', 'John Smith', 'john@premspirits.com', '555-1001', 'Net 30').lastInsertRowid;
  const sup2 = insertSup.run('Fresh Farms Produce', 'Maria Garcia', 'maria@freshfarms.com', '555-1002', 'Net 15').lastInsertRowid;

  // ---- Ingredients ----
  const insertIng = db.prepare(`INSERT INTO ingredients (name, category_id, unit, cost_per_unit, supplier_id, par_level, reorder_quantity, shelf_life_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const ingVodka = insertIng.run('Vodka', catSpirits, 'oz', 0.75, sup1, 100, 50, null).lastInsertRowid;
  const ingGin = insertIng.run('Gin', catSpirits, 'oz', 0.80, sup1, 80, 40, null).lastInsertRowid;
  const ingLime = insertIng.run('Lime Juice', catMixers, 'oz', 0.15, sup2, 60, 30, 7).lastInsertRowid;
  const ingTonic = insertIng.run('Tonic Water', catMixers, 'oz', 0.06, null, 80, 40, 90).lastInsertRowid;
  const ingIPA = insertIng.run('IPA (draft)', catBeer, 'oz', 0.25, null, 200, 100, 60).lastInsertRowid;
  const ingChicken = insertIng.run('Chicken Breast', catProteins, 'each', 3.50, null, 30, 15, 5).lastInsertRowid;
  const ingFries = insertIng.run('Fries (portion)', catProduce, 'each', 0.80, sup2, 60, 30, 30).lastInsertRowid;

  // ---- Inventory ----
  const insertInv = db.prepare(`INSERT INTO inventory (ingredient_id, quantity, full_quantity, location, status, expiration_date, lot_number, received_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const today = new Date().toISOString().slice(0, 10);
  const future = (d) => { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString().slice(0, 10); };
  const past = (d) => { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString().slice(0, 10); };
  insertInv.run(ingVodka, 350, 750, 'bar', 'open', null, 'DEMO-1001', past(14));
  insertInv.run(ingGin, 280, 750, 'bar', 'open', null, 'DEMO-1002', past(10));
  insertInv.run(ingLime, 15, 750, 'bar', 'open', future(2), 'DEMO-1003', past(5));
  insertInv.run(ingTonic, 500, 750, 'bar', 'open', future(60), 'DEMO-1004', past(3));
  insertInv.run(ingIPA, 120, 750, 'bar', 'open', future(45), 'DEMO-1005', past(2));
  insertInv.run(ingChicken, 5, 20, 'kitchen', 'open', future(2), 'DEMO-1006', past(1));
  insertInv.run(ingFries, 8, 20, 'kitchen', 'open', future(10), 'DEMO-1007', past(1));

  // ---- Menu Items ----
  const insertMenu = db.prepare(`INSERT INTO menu_items (name, description, category_id, price, cost, station, course, prep_time_minutes, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const miGnT = insertMenu.run('Gin & Tonic', 'Premium gin with tonic', mcCocktails, 12, 2.40, 'bar', 'drink', 2, 1).lastInsertRowid;
  const miMoscow = insertMenu.run('Moscow Mule', 'Vodka, ginger beer, lime', mcCocktails, 13, 2.50, 'bar', 'drink', 3, 2).lastInsertRowid;
  const miIPA = insertMenu.run('IPA (16oz)', 'Local craft IPA', mcBeer, 8, 3.00, 'bar', 'drink', 1, 3).lastInsertRowid;
  const miWings = insertMenu.run('Buffalo Wings', '6pc crispy wings, blue cheese', mcApps, 14, 5.50, 'fryer', 'appetizer', 12, 4).lastInsertRowid;
  const miBurger = insertMenu.run('Classic Burger', '8oz patty, lettuce, tomato, fries', mcEntrees, 16, 6.50, 'grill', 'main', 15, 5).lastInsertRowid;
  const miChicken = insertMenu.run('Grilled Chicken', 'Herb chicken breast, vegetables', mcEntrees, 18, 7.00, 'grill', 'main', 18, 6).lastInsertRowid;
  const miSoda = insertMenu.run('Soft Drink', 'Coke, Sprite, etc.', mcNonAlc, 3, 0.50, 'bar', 'drink', 1, 7).lastInsertRowid;

  // ---- Recipes ----
  const insertRecipe = db.prepare(`INSERT INTO recipes (menu_item_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)`);
  insertRecipe.run(miGnT, ingGin, 2, 'oz');
  insertRecipe.run(miGnT, ingTonic, 4, 'oz');
  insertRecipe.run(miMoscow, ingVodka, 2, 'oz');
  insertRecipe.run(miMoscow, ingLime, 0.5, 'oz');
  insertRecipe.run(miIPA, ingIPA, 16, 'oz');
  insertRecipe.run(miChicken, ingChicken, 1, 'each');
  insertRecipe.run(miBurger, ingFries, 1, 'each');

  // ---- Tables ----
  const insertTable = db.prepare(`INSERT INTO tables (name, section, capacity, shape, pos_x, pos_y, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const tbl1 = insertTable.run('T1', 'main', 4, 'rect', 80, 80, 90, 90).lastInsertRowid;
  const tbl2 = insertTable.run('T2', 'main', 4, 'rect', 200, 80, 90, 90).lastInsertRowid;
  const tbl3 = insertTable.run('T3', 'main', 6, 'rect', 320, 80, 110, 90).lastInsertRowid;
  insertTable.run('B1', 'bar', 2, 'rect', 500, 80, 70, 60);
  insertTable.run('B2', 'bar', 2, 'rect', 580, 80, 70, 60);
  insertTable.run('P1', 'patio', 4, 'circle', 500, 220, 80, 80);

  // ---- Customers ----
  const insertCust = db.prepare(`INSERT INTO customers (first_name, last_name, email, phone, birthday, loyalty_points, total_visits, total_spent, vip_tier) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertCust.run('Alex', 'Thompson', 'alex@demo.com', '555-2001', '1988-06-15', 2500, 35, 1850.00, 'gold');
  insertCust.run('Rachel', 'Kim', 'rachel@demo.com', '555-2002', '1992-03-22', 750, 12, 680.00, 'silver');

  // ---- Modifiers ----
  const insertMod = db.prepare(`INSERT INTO menu_modifiers (name, category, price_adjustment) VALUES (?, ?, ?)`);
  insertMod.run('Extra Shot', 'Drinks', 2.00);
  insertMod.run('No Ice', 'Drinks', 0);
  insertMod.run('Add Bacon', 'Food', 2.50);
  insertMod.run('Well Done', 'Food', 0);

  // ---- Sample Orders (last 5 days for analytics) ----
  const insertOrder = db.prepare(`INSERT INTO orders (order_number, order_type, status, subtotal, tax, discount, tip, total, guest_count, payment_status, opened_at, closed_at, employee_id, table_id) VALUES (?, ?, 'closed', ?, ?, 0, ?, ?, ?, 'paid', ?, ?, ?, ?)`);
  const insertOI = db.prepare(`INSERT INTO order_items (order_id, menu_item_id, name, quantity, unit_price, status) VALUES (?, ?, ?, ?, ?, 'served')`);
  const menuRef = [
    { id: miGnT, name: 'Gin & Tonic', price: 12 },
    { id: miMoscow, name: 'Moscow Mule', price: 13 },
    { id: miIPA, name: 'IPA (16oz)', price: 8 },
    { id: miWings, name: 'Buffalo Wings', price: 14 },
    { id: miBurger, name: 'Classic Burger', price: 16 },
    { id: miChicken, name: 'Grilled Chicken', price: 18 },
    { id: miSoda, name: 'Soft Drink', price: 3 },
  ];
  const empIds = [demoServerId, demoBartenderId, demoMgrId];
  const tableIds = [tbl1, tbl2, tbl3];
  let orderNum = 5001;

  for (let d = 0; d < 5; d++) {
    const ordersPerDay = 8 + Math.floor(Math.random() * 8);
    for (let o = 0; o < ordersPerDay; o++) {
      const hour = 11 + Math.floor(Math.random() * 10);
      const dt = `${past(d)} ${String(hour).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00`;
      const subtotal = 18 + Math.floor(Math.random() * 50);
      const tax = +(subtotal * 0.08).toFixed(2);
      const tip = +(subtotal * (0.15 + Math.random() * 0.1)).toFixed(2);
      const total = +(subtotal + tax).toFixed(2);
      const guests = 1 + Math.floor(Math.random() * 3);
      const empId = empIds[Math.floor(Math.random() * empIds.length)];
      const tblId = tableIds[Math.floor(Math.random() * tableIds.length)];
      const result = insertOrder.run(`DM-${orderNum++}`, 'dine-in', subtotal, tax, tip, total, guests, dt, dt, empId, tblId);
      const itemCount = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < itemCount; i++) {
        const m = menuRef[Math.floor(Math.random() * menuRef.length)];
        insertOI.run(result.lastInsertRowid, m.id, m.name, 1, m.price);
      }
    }
  }

  // ---- Waste entries ----
  const insertWaste = db.prepare(`INSERT INTO waste_log (ingredient_id, quantity, unit, reason, cost, employee_id, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  insertWaste.run(ingLime, 8, 'oz', 'expired', 1.20, demoCookId, 'Past expiration', past(1));
  insertWaste.run(ingChicken, 1, 'each', 'spoiled', 3.50, demoCookId, 'Off smell', past(2));
  insertWaste.run(ingVodka, 3, 'oz', 'spill', 2.25, demoBartenderId, 'Knocked over', past(3));

  // ---- Back Office Demo Data ----

  // Catering events
  try {
    const insertEvent = db.prepare(`INSERT INTO catering_events (event_name, event_type, contact_name, contact_phone, contact_email, guest_count, event_date, start_time, end_time, venue_type, status, subtotal, tax, service_charge, total, deposit_amount, deposit_paid, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertEvent.run('Smith Wedding Reception', 'wedding', 'Emily Smith', '555-3001', 'emily@demo.com', 120, future(14), '17:00', '23:00', 'on_premise', 'confirmed', 7200, 576, 1440, 9216, 3000, 1, 'Demo catering event');
    insertEvent.run('Tech Corp Holiday Party', 'corporate', 'David Lee', '555-3002', 'david@demo.com', 60, future(30), '18:00', '22:00', 'on_premise', 'inquiry', 3600, 288, 720, 4608, 1500, 0, 'Demo corporate event');

    // Catering packages
    const insertPkg = db.prepare(`INSERT INTO catering_packages (name, description, price_per_person, min_guests, max_guests, category, includes) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insertPkg.run('Classic Buffet', 'Full buffet with 3 entrees, 2 sides, salad, and dessert', 45.00, 20, 200, 'standard', '["Buffet Setup","3 Entrees","2 Sides","Garden Salad","Dessert Table"]');
    insertPkg.run('Premium Plated', 'Plated 4-course dinner with wine pairing', 85.00, 10, 100, 'premium', '["4-Course Plated","Wine Pairing","Custom Menu","Table Flowers","Valet Parking"]');
  } catch (e) { /* tables may not exist yet */ }

  // Marketing campaigns & promotions
  try {
    const insertCampaign = db.prepare(`INSERT INTO marketing_campaigns (name, campaign_type, target_audience, subject, content, status, recipients_count, opens_count, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertCampaign.run('Happy Hour Launch', 'email', 'all', 'New Happy Hour Specials!', 'Join us every weekday 4-6pm for half-price appetizers and $5 cocktails.', 'sent', 245, 98, past(7));
    insertCampaign.run('VIP Weekend Event', 'email', 'vip', 'Exclusive Wine Tasting Event', 'You\'re invited to our exclusive Saturday wine tasting. Limited spots.', 'sent', 42, 31, past(3));
    insertCampaign.run('March Newsletter', 'email', 'all', 'What\'s New at VenueCore', 'New spring menu items, upcoming events, and more.', 'draft', 0, 0, null);

    const insertPromo = db.prepare(`INSERT INTO promotions (name, code, discount_type, discount_value, start_date, end_date, min_order_amount, max_uses, uses_count, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertPromo.run('Happy Hour 20% Off', 'HAPPY20', 'percent', 20, past(30), future(60), 15, null, 87, 1);
    insertPromo.run('First Visit $10 Off', 'WELCOME10', 'fixed', 10, past(60), future(30), 25, 500, 123, 1);
    insertPromo.run('Birthday Special', 'BDAY25', 'percent', 25, past(90), future(90), 0, null, 34, 1);
  } catch (e) { /* tables may not exist */ }

  // Training courses
  try {
    const insertCourse = db.prepare(`INSERT INTO training_courses (title, description, category, difficulty, estimated_minutes, passing_score, is_onboarding, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const course1 = insertCourse.run('Food Safety Fundamentals', 'Essential food safety practices for all kitchen staff', 'food_safety', 'beginner', 45, 80, 1, 1).lastInsertRowid;
    const course2 = insertCourse.run('POS System Training', 'Learn how to operate the VenueCore POS system', 'general', 'beginner', 30, 70, 1, 1).lastInsertRowid;
    const course3 = insertCourse.run('Advanced Mixology', 'Craft cocktail techniques and recipes', 'bartending', 'advanced', 60, 85, 0, 1).lastInsertRowid;

    const insertLesson = db.prepare(`INSERT INTO training_lessons (course_id, title, content, sort_order, duration_minutes) VALUES (?, ?, ?, ?, ?)`);
    insertLesson.run(course1, 'Temperature Danger Zone', 'Understanding the 40-140F danger zone for food safety.', 1, 15);
    insertLesson.run(course1, 'Handwashing Protocol', 'Proper handwashing technique and when to wash.', 2, 10);
    insertLesson.run(course1, 'Cross-Contamination Prevention', 'Preventing cross-contamination in the kitchen.', 3, 20);
    insertLesson.run(course2, 'Taking Orders', 'How to create and manage orders in the POS.', 1, 15);
    insertLesson.run(course2, 'Payments & Closing', 'Processing payments and closing orders.', 2, 15);
    insertLesson.run(course3, 'Classic Cocktails', 'Master the old fashioned, manhattan, and martini.', 1, 20);
    insertLesson.run(course3, 'Modern Techniques', 'Muddling, infusions, and smoking.', 2, 20);

    // Enrollments
    const insertEnroll = db.prepare(`INSERT INTO training_enrollments (employee_id, course_id, status, progress_percent, score, enrolled_at, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insertEnroll.run(demoServerId, course1, 'completed', 100, 92, past(30), past(15));
    insertEnroll.run(demoServerId, course2, 'completed', 100, 88, past(28), past(14));
    insertEnroll.run(demoBartenderId, course3, 'in_progress', 50, 0, past(10), future(20));
    insertEnroll.run(demoCookId, course1, 'in_progress', 66, 0, past(7), future(7));
  } catch (e) { /* tables may not exist */ }

  // Bank accounts & transactions
  try {
    const insertBank = db.prepare(`INSERT INTO bank_accounts (name, bank_name, account_number_last4, account_type, current_balance) VALUES (?, ?, ?, ?, ?)`);
    const bankMain = insertBank.run('Main Checking', 'Chase', '4521', 'checking', 45230.50).lastInsertRowid;
    insertBank.run('Savings Reserve', 'Chase', '8877', 'savings', 25000.00);

    const insertBankTxn = db.prepare(`INSERT INTO bank_transactions (bank_account_id, transaction_date, amount, description, reference, matched, reconciled) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insertBankTxn.run(bankMain, past(1), 2847.50, 'Daily deposit - POS sales', 'DEP-001', 1, 1);
    insertBankTxn.run(bankMain, past(2), 3124.00, 'Daily deposit - POS sales', 'DEP-002', 1, 1);
    insertBankTxn.run(bankMain, past(1), -1250.00, 'Premium Spirits Co. payment', 'CHK-1001', 1, 0);
    insertBankTxn.run(bankMain, past(3), -890.00, 'Fresh Farms Produce payment', 'CHK-1002', 0, 0);
    insertBankTxn.run(bankMain, today, 2650.00, 'Daily deposit - POS sales', 'DEP-003', 0, 0);
  } catch (e) { /* tables may not exist */ }

  // ---- Alert ----
  db.prepare(`INSERT INTO alerts (type, severity, title, message, data) VALUES (?, ?, ?, ?, ?)`)
    .run('system', 'low', 'Demo Mode Active', 'You are exploring VenueCore in demo mode. All data is temporary.', '{"demo":true}');

  // ---- Trigger supply monitor to create demo reorder requests ----
  try {
    const { runCheck } = require('../services/supply-monitor');
    runCheck();
  } catch (e) { console.error('[Demo] Supply check error:', e.message); }

  // ---- Create demo session ----
  const token = generateToken();
  db.prepare(`INSERT INTO sessions (token, employee_id, expires_at) VALUES (?, ?, datetime('now', '+2 hours'))`)
    .run(token, demoAdminId);

  // Tag that demo is active
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('demo_active', 'true')`).run();

  res.json({
    token,
    employee: {
      id: demoAdminId,
      firstName: 'Demo',
      lastName: 'Admin',
      role: 'admin',
      color: '#6366f1',
      permissions: {},
    },
    demo: true,
  });
});

// POST /api/demo/cleanup - Remove all demo data
router.post('/cleanup', (req, res) => {
  const db = getDb();
  cleanupDemo(db);
  res.json({ success: true });
});

function cleanupDemo(db) {
  // Delete demo employees and all their related data
  const demoEmps = db.prepare(`SELECT id FROM employees WHERE email LIKE 'demo%@venuecore.pos'`).all();
  const demoIds = demoEmps.map(e => e.id);

  if (demoIds.length > 0) {
    const placeholders = demoIds.map(() => '?').join(',');

    // Delete orders + items for demo employees
    const demoOrders = db.prepare(`SELECT id FROM orders WHERE employee_id IN (${placeholders})`).all(...demoIds);
    if (demoOrders.length > 0) {
      const orderIds = demoOrders.map(o => o.id);
      const orderPlaceholders = orderIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM order_items WHERE order_id IN (${orderPlaceholders})`).run(...orderIds);
      db.prepare(`DELETE FROM order_payments WHERE order_id IN (${orderPlaceholders})`).run(...orderIds);
      db.prepare(`DELETE FROM kitchen_queue WHERE order_id IN (${orderPlaceholders})`).run(...orderIds);
    }
    db.prepare(`DELETE FROM orders WHERE employee_id IN (${placeholders})`).run(...demoIds);
    db.prepare(`DELETE FROM time_entries WHERE employee_id IN (${placeholders})`).run(...demoIds);
    db.prepare(`DELETE FROM sessions WHERE employee_id IN (${placeholders})`).run(...demoIds);
    db.prepare(`DELETE FROM waste_log WHERE employee_id IN (${placeholders})`).run(...demoIds);
    db.prepare(`DELETE FROM shifts WHERE employee_id IN (${placeholders})`).run(...demoIds);
    db.prepare(`DELETE FROM employees WHERE id IN (${placeholders})`).run(...demoIds);
  }

  // Delete reorder requests and supply alert data BEFORE ingredients/suppliers (FK constraint)
  try { db.prepare(`DELETE FROM reorder_requests`).run(); } catch {}
  try { db.prepare(`DELETE FROM notification_preferences`).run(); } catch {}
  db.prepare(`DELETE FROM alerts WHERE type IN ('reorder_request', 'reorder_approved', 'expiring_stock', 'low_stock', 'out_of_stock')`).run();

  // Delete demo-specific data (using demo lot numbers and order numbers)
  db.prepare(`DELETE FROM inventory WHERE lot_number LIKE 'DEMO-%'`).run();
  db.prepare(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'DM-%')`).run();
  db.prepare(`DELETE FROM orders WHERE order_number LIKE 'DM-%'`).run();

  // Delete seeded categories, menu items, etc. (only if no real data references them)
  db.prepare(`DELETE FROM recipes`).run();
  db.prepare(`DELETE FROM menu_items WHERE id NOT IN (SELECT DISTINCT menu_item_id FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE order_number NOT LIKE 'DM-%'))`).run();
  db.prepare(`DELETE FROM menu_categories WHERE id NOT IN (SELECT DISTINCT category_id FROM menu_items WHERE category_id IS NOT NULL)`).run();
  db.prepare(`DELETE FROM ingredients WHERE id NOT IN (SELECT DISTINCT ingredient_id FROM inventory WHERE lot_number NOT LIKE 'DEMO-%')`).run();
  db.prepare(`DELETE FROM categories WHERE id NOT IN (SELECT DISTINCT category_id FROM ingredients WHERE category_id IS NOT NULL)`).run();
  db.prepare(`DELETE FROM tables WHERE id NOT IN (SELECT DISTINCT table_id FROM orders WHERE table_id IS NOT NULL AND order_number NOT LIKE 'DM-%')`).run();
  db.prepare(`DELETE FROM customers WHERE email LIKE '%@demo.com'`).run();
  db.prepare(`DELETE FROM menu_modifiers WHERE id NOT IN (SELECT DISTINCT modifier_id FROM menu_item_modifiers)`).run();
  db.prepare(`DELETE FROM suppliers WHERE email LIKE '%@%spirits.com' OR email LIKE '%@freshfarms.com'`).run();
  db.prepare(`DELETE FROM alerts WHERE data LIKE '%demo%'`).run();
  db.prepare(`DELETE FROM settings WHERE key = 'demo_active'`).run();

  // Cleanup back-office demo data
  try { db.prepare(`DELETE FROM catering_events WHERE notes LIKE '%Demo%'`).run(); } catch {}
  try { db.prepare(`DELETE FROM catering_packages WHERE name IN ('Classic Buffet', 'Premium Plated')`).run(); } catch {}
  try { db.prepare(`DELETE FROM marketing_campaigns WHERE name IN ('Happy Hour Launch', 'VIP Weekend Event', 'March Newsletter')`).run(); } catch {}
  try { db.prepare(`DELETE FROM promotions WHERE code IN ('HAPPY20', 'WELCOME10', 'BDAY25')`).run(); } catch {}
  try {
    const demoCourses = db.prepare(`SELECT id FROM training_courses WHERE title IN ('Food Safety Fundamentals', 'POS System Training', 'Advanced Mixology')`).all();
    if (demoCourses.length > 0) {
      const cIds = demoCourses.map(c => c.id);
      const ph = cIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM training_enrollments WHERE course_id IN (${ph})`).run(...cIds);
      db.prepare(`DELETE FROM training_lessons WHERE course_id IN (${ph})`).run(...cIds);
      db.prepare(`DELETE FROM training_courses WHERE id IN (${ph})`).run(...cIds);
    }
  } catch {}
  try { db.prepare(`DELETE FROM bank_transactions WHERE reference LIKE 'DEP-%' OR reference LIKE 'CHK-%'`).run(); } catch {}
  try { db.prepare(`DELETE FROM bank_accounts WHERE bank_name = 'Chase' AND account_number_last4 IN ('4521', '8877')`).run(); } catch {}
}

module.exports = router;
