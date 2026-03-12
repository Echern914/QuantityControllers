const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { hashPin, generateToken } = require('../middleware/auth');

// ============================================================
//  DEMO RECORD TRACKING
//  Instead of broad DELETEs, we track every demo-created record
//  so cleanup only removes what the demo inserted.
// ============================================================

function ensureDemoTracker(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _demo_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function trackDemo(db, tableName, recordId) {
  db.prepare(`INSERT INTO _demo_records (table_name, record_id) VALUES (?, ?)`).run(tableName, recordId);
}

// Helper: insert + track in one call
function demoInsert(db, tableName, stmt, ...args) {
  const result = stmt.run(...args);
  trackDemo(db, tableName, result.lastInsertRowid);
  return result;
}

// POST /api/demo/start - Seed demo data and return a demo session
router.post('/start', (req, res) => {
  const db = getDb();
  ensureDemoTracker(db);

  // Check if demo data already exists (by checking for demo employee)
  const existing = db.prepare(`SELECT id FROM employees WHERE email = 'demo@venuecore.pos'`).get();
  if (existing) {
    // Demo data exists — reuse it instead of recreating (supports multiple concurrent users)
    try {
      const token = generateToken();
      db.prepare(`INSERT INTO sessions (token, employee_id, expires_at) VALUES (?, ?, datetime('now', '+2 hours'))`)
        .run(token, existing.id);

      // Track active demo sessions
      const count = db.prepare(`SELECT COALESCE(value, '0') as v FROM settings WHERE key = 'demo_session_count'`).get();
      const newCount = parseInt(count?.v || '0') + 1;
      db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('demo_session_count', ?)`).run(String(newCount));

      return res.json({
        token,
        employee: {
          id: existing.id,
          firstName: 'Demo',
          lastName: 'Admin',
          role: 'admin',
          color: '#6366f1',
          permissions: {},
        },
        demo: true,
      });
    } catch (err) {
      // Existing demo data is corrupted — clean it up and fall through to recreate
      console.error('[Demo] Reuse failed, recreating:', err.message);
      try { cleanupDemo(db); } catch {}
    }
  }

  // ---- Demo Employees ----
  const insertEmp = db.prepare(`INSERT INTO employees (first_name, last_name, pin_hash, role, email, phone, hourly_rate, color, hire_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const demoAdmin = demoInsert(db, 'employees', insertEmp, 'Demo', 'Admin', hashPin('0000'), 'admin', 'demo@venuecore.pos', '555-0000', 0, '#6366f1', '2025-01-01');
  const demoAdminId = demoAdmin.lastInsertRowid;
  const demoMgr = demoInsert(db, 'employees', insertEmp, 'Sarah', 'Johnson', hashPin('0001'), 'manager', 'demo.mgr@venuecore.pos', '555-0001', 28, '#f59e0b', '2025-01-15');
  const demoMgrId = demoMgr.lastInsertRowid;
  const demoServer = demoInsert(db, 'employees', insertEmp, 'Mike', 'Chen', hashPin('0002'), 'server', 'demo.server@venuecore.pos', '555-0002', 15, '#06b6d4', '2025-02-01');
  const demoServerId = demoServer.lastInsertRowid;
  const demoBartender = demoInsert(db, 'employees', insertEmp, 'Jessica', 'Williams', hashPin('0003'), 'bartender', 'demo.bar@venuecore.pos', '555-0003', 18, '#ec4899', '2025-02-15');
  const demoBartenderId = demoBartender.lastInsertRowid;
  const demoCook = demoInsert(db, 'employees', insertEmp, 'Carlos', 'Rodriguez', hashPin('0004'), 'cook', 'demo.cook@venuecore.pos', '555-0004', 20, '#10b981', '2025-03-01');
  const demoCookId = demoCook.lastInsertRowid;

  // ---- Ingredient Categories ----
  const insertCat = db.prepare(`INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)`);
  const catSpirits = demoInsert(db, 'categories', insertCat, 'Spirits', '#8b5cf6', 'wine').lastInsertRowid;
  const catMixers = demoInsert(db, 'categories', insertCat, 'Mixers', '#06b6d4', 'cup').lastInsertRowid;
  const catBeer = demoInsert(db, 'categories', insertCat, 'Beer', '#f59e0b', 'beer').lastInsertRowid;
  const catProduce = demoInsert(db, 'categories', insertCat, 'Produce', '#10b981', 'leaf').lastInsertRowid;
  const catProteins = demoInsert(db, 'categories', insertCat, 'Proteins', '#ef4444', 'meat').lastInsertRowid;

  // ---- Menu Categories ----
  const insertMenuCat = db.prepare(`INSERT INTO menu_categories (name, color, icon, display_order) VALUES (?, ?, ?, ?)`);
  const mcCocktails = demoInsert(db, 'menu_categories', insertMenuCat, 'Cocktails', '#8b5cf6', 'cocktail', 1).lastInsertRowid;
  const mcBeer = demoInsert(db, 'menu_categories', insertMenuCat, 'Beer', '#f59e0b', 'beer', 2).lastInsertRowid;
  const mcApps = demoInsert(db, 'menu_categories', insertMenuCat, 'Appetizers', '#06b6d4', 'plate', 3).lastInsertRowid;
  const mcEntrees = demoInsert(db, 'menu_categories', insertMenuCat, 'Entrees', '#10b981', 'steak', 4).lastInsertRowid;
  const mcNonAlc = demoInsert(db, 'menu_categories', insertMenuCat, 'Non-Alcoholic', '#94a3b8', 'cup', 5).lastInsertRowid;

  // ---- Suppliers ----
  const insertSup = db.prepare(`INSERT INTO suppliers (name, contact_name, email, phone, payment_terms) VALUES (?, ?, ?, ?, ?)`);
  const sup1 = demoInsert(db, 'suppliers', insertSup, 'Premium Spirits Co.', 'John Smith', 'john@premspirits.com', '555-1001', 'Net 30').lastInsertRowid;
  const sup2 = demoInsert(db, 'suppliers', insertSup, 'Fresh Farms Produce', 'Maria Garcia', 'maria@freshfarms.com', '555-1002', 'Net 15').lastInsertRowid;

  // ---- Ingredients ----
  const insertIng = db.prepare(`INSERT INTO ingredients (name, category_id, unit, cost_per_unit, supplier_id, par_level, reorder_quantity, shelf_life_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const ingVodka = demoInsert(db, 'ingredients', insertIng, 'Vodka', catSpirits, 'oz', 0.75, sup1, 100, 50, null).lastInsertRowid;
  const ingGin = demoInsert(db, 'ingredients', insertIng, 'Gin', catSpirits, 'oz', 0.80, sup1, 80, 40, null).lastInsertRowid;
  const ingLime = demoInsert(db, 'ingredients', insertIng, 'Lime Juice', catMixers, 'oz', 0.15, sup2, 60, 30, 7).lastInsertRowid;
  const ingTonic = demoInsert(db, 'ingredients', insertIng, 'Tonic Water', catMixers, 'oz', 0.06, null, 80, 40, 90).lastInsertRowid;
  const ingIPA = demoInsert(db, 'ingredients', insertIng, 'IPA (draft)', catBeer, 'oz', 0.25, null, 200, 100, 60).lastInsertRowid;
  const ingChicken = demoInsert(db, 'ingredients', insertIng, 'Chicken Breast', catProteins, 'each', 3.50, null, 30, 15, 5).lastInsertRowid;
  const ingFries = demoInsert(db, 'ingredients', insertIng, 'Fries (portion)', catProduce, 'each', 0.80, sup2, 60, 30, 30).lastInsertRowid;

  // ---- Inventory ----
  const insertInv = db.prepare(`INSERT INTO inventory (ingredient_id, quantity, full_quantity, location, status, expiration_date, lot_number, received_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const today = new Date().toISOString().slice(0, 10);
  const future = (d) => { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString().slice(0, 10); };
  const past = (d) => { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString().slice(0, 10); };
  demoInsert(db, 'inventory', insertInv, ingVodka, 350, 750, 'bar', 'open', null, 'DEMO-1001', past(14));
  demoInsert(db, 'inventory', insertInv, ingGin, 280, 750, 'bar', 'open', null, 'DEMO-1002', past(10));
  demoInsert(db, 'inventory', insertInv, ingLime, 15, 750, 'bar', 'open', future(2), 'DEMO-1003', past(5));
  demoInsert(db, 'inventory', insertInv, ingTonic, 500, 750, 'bar', 'open', future(60), 'DEMO-1004', past(3));
  demoInsert(db, 'inventory', insertInv, ingIPA, 120, 750, 'bar', 'open', future(45), 'DEMO-1005', past(2));
  demoInsert(db, 'inventory', insertInv, ingChicken, 5, 20, 'kitchen', 'open', future(2), 'DEMO-1006', past(1));
  demoInsert(db, 'inventory', insertInv, ingFries, 8, 20, 'kitchen', 'open', future(10), 'DEMO-1007', past(1));

  // ---- Menu Items ----
  const insertMenu = db.prepare(`INSERT INTO menu_items (name, description, category_id, price, cost, station, course, prep_time_minutes, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const miGnT = demoInsert(db, 'menu_items', insertMenu, 'Gin & Tonic', 'Premium gin with tonic', mcCocktails, 12, 2.40, 'bar', 'drink', 2, 1).lastInsertRowid;
  const miMoscow = demoInsert(db, 'menu_items', insertMenu, 'Moscow Mule', 'Vodka, ginger beer, lime', mcCocktails, 13, 2.50, 'bar', 'drink', 3, 2).lastInsertRowid;
  const miIPA = demoInsert(db, 'menu_items', insertMenu, 'IPA (16oz)', 'Local craft IPA', mcBeer, 8, 3.00, 'bar', 'drink', 1, 3).lastInsertRowid;
  const miWings = demoInsert(db, 'menu_items', insertMenu, 'Buffalo Wings', '6pc crispy wings, blue cheese', mcApps, 14, 5.50, 'fryer', 'appetizer', 12, 4).lastInsertRowid;
  const miBurger = demoInsert(db, 'menu_items', insertMenu, 'Classic Burger', '8oz patty, lettuce, tomato, fries', mcEntrees, 16, 6.50, 'grill', 'main', 15, 5).lastInsertRowid;
  const miChicken = demoInsert(db, 'menu_items', insertMenu, 'Grilled Chicken', 'Herb chicken breast, vegetables', mcEntrees, 18, 7.00, 'grill', 'main', 18, 6).lastInsertRowid;
  const miSoda = demoInsert(db, 'menu_items', insertMenu, 'Soft Drink', 'Coke, Sprite, etc.', mcNonAlc, 3, 0.50, 'bar', 'drink', 1, 7).lastInsertRowid;

  // ---- Recipes ----
  const insertRecipe = db.prepare(`INSERT INTO recipes (menu_item_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)`);
  demoInsert(db, 'recipes', insertRecipe, miGnT, ingGin, 2, 'oz');
  demoInsert(db, 'recipes', insertRecipe, miGnT, ingTonic, 4, 'oz');
  demoInsert(db, 'recipes', insertRecipe, miMoscow, ingVodka, 2, 'oz');
  demoInsert(db, 'recipes', insertRecipe, miMoscow, ingLime, 0.5, 'oz');
  demoInsert(db, 'recipes', insertRecipe, miIPA, ingIPA, 16, 'oz');
  demoInsert(db, 'recipes', insertRecipe, miChicken, ingChicken, 1, 'each');
  demoInsert(db, 'recipes', insertRecipe, miBurger, ingFries, 1, 'each');

  // ---- Tables ----
  const insertTable = db.prepare(`INSERT INTO tables (name, section, capacity, shape, pos_x, pos_y, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const tbl1 = demoInsert(db, 'tables', insertTable, 'T1', 'main', 4, 'rect', 80, 80, 90, 90).lastInsertRowid;
  const tbl2 = demoInsert(db, 'tables', insertTable, 'T2', 'main', 4, 'rect', 200, 80, 90, 90).lastInsertRowid;
  const tbl3 = demoInsert(db, 'tables', insertTable, 'T3', 'main', 6, 'rect', 320, 80, 110, 90).lastInsertRowid;
  demoInsert(db, 'tables', insertTable, 'B1', 'bar', 2, 'rect', 500, 80, 70, 60);
  demoInsert(db, 'tables', insertTable, 'B2', 'bar', 2, 'rect', 580, 80, 70, 60);
  demoInsert(db, 'tables', insertTable, 'P1', 'patio', 4, 'circle', 500, 220, 80, 80);

  // ---- Customers ----
  const insertCust = db.prepare(`INSERT INTO customers (first_name, last_name, email, phone, birthday, loyalty_points, total_visits, total_spent, vip_tier) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  demoInsert(db, 'customers', insertCust, 'Alex', 'Thompson', 'alex@demo.com', '555-2001', '1988-06-15', 2500, 35, 1850.00, 'gold');
  demoInsert(db, 'customers', insertCust, 'Rachel', 'Kim', 'rachel@demo.com', '555-2002', '1992-03-22', 750, 12, 680.00, 'silver');

  // ---- Modifiers ----
  const insertMod = db.prepare(`INSERT INTO menu_modifiers (name, category, price_adjustment) VALUES (?, ?, ?)`);
  demoInsert(db, 'menu_modifiers', insertMod, 'Extra Shot', 'Drinks', 2.00);
  demoInsert(db, 'menu_modifiers', insertMod, 'No Ice', 'Drinks', 0);
  demoInsert(db, 'menu_modifiers', insertMod, 'Add Bacon', 'Food', 2.50);
  demoInsert(db, 'menu_modifiers', insertMod, 'Well Done', 'Food', 0);

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
      const result = demoInsert(db, 'orders', insertOrder, `DM-${orderNum++}`, 'dine-in', subtotal, tax, tip, total, guests, dt, dt, empId, tblId);
      const itemCount = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < itemCount; i++) {
        const m = menuRef[Math.floor(Math.random() * menuRef.length)];
        demoInsert(db, 'order_items', insertOI, result.lastInsertRowid, m.id, m.name, 1, m.price);
      }
    }
  }

  // ---- Waste entries ----
  const insertWaste = db.prepare(`INSERT INTO waste_log (ingredient_id, quantity, unit, reason, cost, employee_id, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  demoInsert(db, 'waste_log', insertWaste, ingLime, 8, 'oz', 'expired', 1.20, demoCookId, 'Past expiration', past(1));
  demoInsert(db, 'waste_log', insertWaste, ingChicken, 1, 'each', 'spoiled', 3.50, demoCookId, 'Off smell', past(2));
  demoInsert(db, 'waste_log', insertWaste, ingVodka, 3, 'oz', 'spill', 2.25, demoBartenderId, 'Knocked over', past(3));

  // ---- Back Office Demo Data ----

  // Catering events
  try {
    const insertEvent = db.prepare(`INSERT INTO catering_events (event_name, event_type, contact_name, contact_phone, contact_email, guest_count, event_date, start_time, end_time, venue_type, status, subtotal, tax, service_charge, total, deposit_amount, deposit_paid, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    demoInsert(db, 'catering_events', insertEvent, 'Smith Wedding Reception', 'wedding', 'Emily Smith', '555-3001', 'emily@demo.com', 120, future(14), '17:00', '23:00', 'on_premise', 'confirmed', 7200, 576, 1440, 9216, 3000, 1, 'Demo catering event');
    demoInsert(db, 'catering_events', insertEvent, 'Tech Corp Holiday Party', 'corporate', 'David Lee', '555-3002', 'david@demo.com', 60, future(30), '18:00', '22:00', 'on_premise', 'inquiry', 3600, 288, 720, 4608, 1500, 0, 'Demo corporate event');

    const insertPkg = db.prepare(`INSERT INTO catering_packages (name, description, price_per_person, min_guests, max_guests, category, includes) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    demoInsert(db, 'catering_packages', insertPkg, 'Classic Buffet', 'Full buffet with 3 entrees, 2 sides, salad, and dessert', 45.00, 20, 200, 'standard', '["Buffet Setup","3 Entrees","2 Sides","Garden Salad","Dessert Table"]');
    demoInsert(db, 'catering_packages', insertPkg, 'Premium Plated', 'Plated 4-course dinner with wine pairing', 85.00, 10, 100, 'premium', '["4-Course Plated","Wine Pairing","Custom Menu","Table Flowers","Valet Parking"]');
  } catch (e) { /* tables may not exist yet */ }

  // Marketing campaigns & promotions
  try {
    const insertCampaign = db.prepare(`INSERT INTO marketing_campaigns (name, campaign_type, target_audience, subject, content, status, recipients_count, opens_count, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    demoInsert(db, 'marketing_campaigns', insertCampaign, 'Happy Hour Launch', 'email', 'all', 'New Happy Hour Specials!', 'Join us every weekday 4-6pm for half-price appetizers and $5 cocktails.', 'sent', 245, 98, past(7));
    demoInsert(db, 'marketing_campaigns', insertCampaign, 'VIP Weekend Event', 'email', 'vip', 'Exclusive Wine Tasting Event', 'You\'re invited to our exclusive Saturday wine tasting. Limited spots.', 'sent', 42, 31, past(3));
    demoInsert(db, 'marketing_campaigns', insertCampaign, 'March Newsletter', 'email', 'all', 'What\'s New at VenueCore', 'New spring menu items, upcoming events, and more.', 'draft', 0, 0, null);

    const insertPromo = db.prepare(`INSERT INTO promotions (name, code, discount_type, discount_value, start_date, end_date, min_order_amount, max_uses, uses_count, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    demoInsert(db, 'promotions', insertPromo, 'Happy Hour 20% Off', 'HAPPY20', 'percent', 20, past(30), future(60), 15, null, 87, 1);
    demoInsert(db, 'promotions', insertPromo, 'First Visit $10 Off', 'WELCOME10', 'fixed', 10, past(60), future(30), 25, 500, 123, 1);
    demoInsert(db, 'promotions', insertPromo, 'Birthday Special', 'BDAY25', 'percent', 25, past(90), future(90), 0, null, 34, 1);
  } catch (e) { /* tables may not exist */ }

  // Training courses
  try {
    const insertCourse = db.prepare(`INSERT INTO training_courses (title, description, category, difficulty, estimated_minutes, passing_score, is_onboarding, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const course1 = demoInsert(db, 'training_courses', insertCourse, 'Food Safety Fundamentals', 'Essential food safety practices for all kitchen staff', 'food_safety', 'beginner', 45, 80, 1, 1).lastInsertRowid;
    const course2 = demoInsert(db, 'training_courses', insertCourse, 'POS System Training', 'Learn how to operate the VenueCore POS system', 'general', 'beginner', 30, 70, 1, 1).lastInsertRowid;
    const course3 = demoInsert(db, 'training_courses', insertCourse, 'Advanced Mixology', 'Craft cocktail techniques and recipes', 'bartending', 'advanced', 60, 85, 0, 1).lastInsertRowid;

    const insertLesson = db.prepare(`INSERT INTO training_lessons (course_id, title, content, sort_order, duration_minutes) VALUES (?, ?, ?, ?, ?)`);
    demoInsert(db, 'training_lessons', insertLesson, course1, 'Temperature Danger Zone', 'Understanding the 40-140F danger zone for food safety.', 1, 15);
    demoInsert(db, 'training_lessons', insertLesson, course1, 'Handwashing Protocol', 'Proper handwashing technique and when to wash.', 2, 10);
    demoInsert(db, 'training_lessons', insertLesson, course1, 'Cross-Contamination Prevention', 'Preventing cross-contamination in the kitchen.', 3, 20);
    demoInsert(db, 'training_lessons', insertLesson, course2, 'Taking Orders', 'How to create and manage orders in the POS.', 1, 15);
    demoInsert(db, 'training_lessons', insertLesson, course2, 'Payments & Closing', 'Processing payments and closing orders.', 2, 15);
    demoInsert(db, 'training_lessons', insertLesson, course3, 'Classic Cocktails', 'Master the old fashioned, manhattan, and martini.', 1, 20);
    demoInsert(db, 'training_lessons', insertLesson, course3, 'Modern Techniques', 'Muddling, infusions, and smoking.', 2, 20);

    const insertEnroll = db.prepare(`INSERT INTO training_enrollments (employee_id, course_id, status, progress_percent, score, enrolled_at, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    demoInsert(db, 'training_enrollments', insertEnroll, demoServerId, course1, 'completed', 100, 92, past(30), past(15));
    demoInsert(db, 'training_enrollments', insertEnroll, demoServerId, course2, 'completed', 100, 88, past(28), past(14));
    demoInsert(db, 'training_enrollments', insertEnroll, demoBartenderId, course3, 'in_progress', 50, 0, past(10), future(20));
    demoInsert(db, 'training_enrollments', insertEnroll, demoCookId, course1, 'in_progress', 66, 0, past(7), future(7));
  } catch (e) { /* tables may not exist */ }

  // Bank accounts & transactions
  try {
    const insertBank = db.prepare(`INSERT INTO bank_accounts (name, bank_name, account_number_last4, account_type, current_balance) VALUES (?, ?, ?, ?, ?)`);
    const bankMain = demoInsert(db, 'bank_accounts', insertBank, 'Main Checking', 'Chase', '4521', 'checking', 45230.50).lastInsertRowid;
    demoInsert(db, 'bank_accounts', insertBank, 'Savings Reserve', 'Chase', '8877', 'savings', 25000.00);

    const insertBankTxn = db.prepare(`INSERT INTO bank_transactions (bank_account_id, transaction_date, amount, description, reference, matched, reconciled) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    demoInsert(db, 'bank_transactions', insertBankTxn, bankMain, past(1), 2847.50, 'Daily deposit - POS sales', 'DEP-001', 1, 1);
    demoInsert(db, 'bank_transactions', insertBankTxn, bankMain, past(2), 3124.00, 'Daily deposit - POS sales', 'DEP-002', 1, 1);
    demoInsert(db, 'bank_transactions', insertBankTxn, bankMain, past(1), -1250.00, 'Premium Spirits Co. payment', 'CHK-1001', 1, 0);
    demoInsert(db, 'bank_transactions', insertBankTxn, bankMain, past(3), -890.00, 'Fresh Farms Produce payment', 'CHK-1002', 0, 0);
    demoInsert(db, 'bank_transactions', insertBankTxn, bankMain, today, 2650.00, 'Daily deposit - POS sales', 'DEP-003', 0, 0);
  } catch (e) { /* tables may not exist */ }

  // ---- Sales Tax Demo Data ----
  try {
    // Set up tax config for New York (good demo state with local taxes)
    const insertTaxConfig = db.prepare(`INSERT INTO sales_tax_config (state_code, state_name, state_rate, county_name, county_rate, city_name, city_rate, special_district_rate, food_taxed, filing_frequency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const taxConfig = demoInsert(db, 'sales_tax_config', insertTaxConfig, 'NY', 'New York', 0.04, 'New York County', 0.045, 'New York City', 0.0, 0.00375, 1, 'monthly');
    const taxConfigId = taxConfig.lastInsertRowid;

    // Tax rules
    const insertTaxRule = db.prepare(`INSERT INTO sales_tax_rules (config_id, rule_type, description, category, exempt, special_rate, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    demoInsert(db, 'sales_tax_rules', insertTaxRule, taxConfigId, 'exemption', 'Unprepared grocery items exempt from state tax', 'grocery', 1, null, 'New York exempts grocery items from sales tax');
    demoInsert(db, 'sales_tax_rules', insertTaxRule, taxConfigId, 'standard', 'Prepared food/meals taxed at combined rate', 'prepared_food', 0, null, 'Standard rate applies to all restaurant meals');

    // Update settings tax_rate to match
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('tax_rate', '0.08875')`).run();

    // Generate tax collected records for last 30 days
    const insertTaxCollected = db.prepare(`INSERT INTO sales_tax_collected (order_number, sale_date, subtotal, food_amount, beverage_amount, alcohol_amount, other_amount, tax_rate, food_tax, beverage_tax, alcohol_tax, other_tax, total_tax, state_portion, county_portion, city_portion, special_portion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    for (let d = 0; d < 30; d++) {
      const date = past(d);
      const ordersPerDay = 6 + Math.floor(Math.random() * 10);
      for (let o = 0; o < ordersPerDay; o++) {
        const foodAmt = 15 + Math.floor(Math.random() * 40);
        const bevAmt = 5 + Math.floor(Math.random() * 15);
        const alcAmt = Math.random() > 0.4 ? 8 + Math.floor(Math.random() * 20) : 0;
        const subtotal = foodAmt + bevAmt + alcAmt;
        const rate = 0.08875;
        const foodTax = +(foodAmt * rate).toFixed(2);
        const bevTax = +(bevAmt * rate).toFixed(2);
        const alcTax = +(alcAmt * rate).toFixed(2);
        const totalTax = +(foodTax + bevTax + alcTax).toFixed(2);
        const statePortion = +(subtotal * 0.04).toFixed(2);
        const countyPortion = +(subtotal * 0.045).toFixed(2);
        const specialPortion = +(subtotal * 0.00375).toFixed(2);

        demoInsert(db, 'sales_tax_collected', insertTaxCollected,
          `DM-TAX-${d * 20 + o}`, date, subtotal,
          foodAmt, bevAmt, alcAmt, 0,
          rate, foodTax, bevTax, alcTax, 0, totalTax,
          statePortion, countyPortion, 0, specialPortion
        );
      }
    }

    // Generate a pending filing for last month
    const lastMonthStart = new Date();
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
    lastMonthStart.setDate(1);
    const lastMonthEnd = new Date(lastMonthStart.getFullYear(), lastMonthStart.getMonth() + 1, 0);
    const lms = lastMonthStart.toISOString().slice(0, 10);
    const lme = lastMonthEnd.toISOString().slice(0, 10);

    const filingAgg = db.prepare(`
      SELECT COALESCE(SUM(subtotal), 0) as gross, COALESCE(SUM(total_tax), 0) as tax,
        COALESCE(SUM(state_portion), 0) as st, COALESCE(SUM(county_portion), 0) as ct, COALESCE(SUM(special_portion), 0) as sp
      FROM sales_tax_collected WHERE sale_date BETWEEN ? AND ?
    `).get(lms, lme);

    const insertFiling = db.prepare(`INSERT INTO sales_tax_filings (period_start, period_end, filing_frequency, state_code, total_gross_sales, total_taxable_sales, total_exempt_sales, total_tax_collected, state_tax_due, county_tax_due, city_tax_due, special_tax_due, total_tax_due, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    demoInsert(db, 'sales_tax_filings', insertFiling, lms, lme, 'monthly', 'NY',
      filingAgg.gross, filingAgg.gross, 0, filingAgg.tax,
      filingAgg.st, filingAgg.ct, 0, filingAgg.sp, filingAgg.tax,
      `${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth() + 2).padStart(2, '0')}-20`, 'pending'
    );
  } catch (e) { console.error('[Demo] Sales tax data error:', e.message); }

  // ---- Alert ----
  const alertResult = db.prepare(`INSERT INTO alerts (type, severity, title, message, data) VALUES (?, ?, ?, ?, ?)`)
    .run('system', 'low', 'Demo Mode Active', 'You are exploring VenueCore in demo mode. All data is temporary.', '{"demo":true}');
  trackDemo(db, 'alerts', alertResult.lastInsertRowid);

  // ---- Trigger supply monitor to create demo reorder requests ----
  try {
    const { runCheck } = require('../services/supply-monitor');
    runCheck();
    // Track any reorder requests created by the supply monitor for demo ingredients
    const demoIngIds = [ingVodka, ingGin, ingLime, ingTonic, ingIPA, ingChicken, ingFries];
    const ph = demoIngIds.map(() => '?').join(',');
    const reorderRows = db.prepare(`SELECT id FROM reorder_requests WHERE ingredient_id IN (${ph})`).all(...demoIngIds);
    for (const row of reorderRows) trackDemo(db, 'reorder_requests', row.id);
  } catch (e) { console.error('[Demo] Supply check error:', e.message); }

  // ---- Create demo session ----
  const token = generateToken();
  db.prepare(`INSERT INTO sessions (token, employee_id, expires_at) VALUES (?, ?, datetime('now', '+2 hours'))`)
    .run(token, demoAdminId);

  // Tag that demo is active and track session count
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('demo_active', 'true')`).run();
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('demo_session_count', '1')`).run();

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

// POST /api/demo/cleanup - Decrement session count; only wipe data when last user exits
router.post('/cleanup', (req, res) => {
  const db = getDb();

  // Expire the caller's session token
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
  }

  // Decrement active demo session count
  const count = db.prepare(`SELECT COALESCE(value, '0') as v FROM settings WHERE key = 'demo_session_count'`).get();
  const remaining = Math.max(0, parseInt(count?.v || '0') - 1);
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('demo_session_count', ?)`).run(String(remaining));

  if (remaining <= 0) {
    // Last demo user exited — clean up all demo data so next start is fresh
    cleanupDemo(db);
  }

  res.json({ success: true });
});

// GET /api/demo/tour-progress - Get saved tour step
router.get('/tour-progress', (req, res) => {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'demo_tour_step'`).get();
  res.json({ step: row ? parseInt(row.value) : 0 });
});

// POST /api/demo/tour-progress - Save tour step
router.post('/tour-progress', (req, res) => {
  const db = getDb();
  const { step } = req.body;
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('demo_tour_step', ?)`).run(String(step || 0));
  res.json({ success: true });
});

function cleanupDemo(db) {
  // Temporarily disable FK checks so we can delete in any order without constraint errors
  db.pragma('foreign_keys = OFF');

  try {
    // Check if the tracking table exists
    const hasTracker = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='_demo_records'`).get();

    if (hasTracker) {
      // Get all tracked demo records grouped by table
      const tables = db.prepare(`SELECT DISTINCT table_name FROM _demo_records`).all().map(r => r.table_name);

      for (const tableName of tables) {
        const ids = db.prepare(`SELECT record_id FROM _demo_records WHERE table_name = ?`).all(tableName).map(r => r.record_id);
        if (ids.length === 0) continue;

        // Delete in batches of 500 to avoid SQLite variable limits
        for (let i = 0; i < ids.length; i += 500) {
          const batch = ids.slice(i, i + 500);
          const ph = batch.map(() => '?').join(',');
          try {
            db.prepare(`DELETE FROM "${tableName}" WHERE id IN (${ph})`).run(...batch);
          } catch (e) {
            // Table might have been dropped or altered
            console.error(`[Demo cleanup] Error deleting from ${tableName}:`, e.message);
          }
        }
      }

      // Clear the tracking table
      db.prepare(`DELETE FROM _demo_records`).run();
    } else {
      // Fallback: legacy cleanup for demos started before tracking was added
      // Only delete records that are clearly identifiable as demo data
      const demoEmps = db.prepare(`SELECT id FROM employees WHERE email LIKE 'demo%@venuecore.pos'`).all();
      const demoIds = demoEmps.map(e => e.id);

      if (demoIds.length > 0) {
        const placeholders = demoIds.map(() => '?').join(',');
        const demoOrders = db.prepare(`SELECT id FROM orders WHERE employee_id IN (${placeholders})`).all(...demoIds);
        if (demoOrders.length > 0) {
          const orderIds = demoOrders.map(o => o.id);
          const orderPh = orderIds.map(() => '?').join(',');
          try { db.prepare(`DELETE FROM order_items WHERE order_id IN (${orderPh})`).run(...orderIds); } catch {}
          try { db.prepare(`DELETE FROM order_payments WHERE order_id IN (${orderPh})`).run(...orderIds); } catch {}
          try { db.prepare(`DELETE FROM kitchen_queue WHERE order_id IN (${orderPh})`).run(...orderIds); } catch {}
          try { db.prepare(`DELETE FROM transactions WHERE order_id IN (${orderPh})`).run(...orderIds); } catch {}
        }
        try { db.prepare(`DELETE FROM orders WHERE employee_id IN (${placeholders})`).run(...demoIds); } catch {}
        try { db.prepare(`DELETE FROM time_entries WHERE employee_id IN (${placeholders})`).run(...demoIds); } catch {}
        try { db.prepare(`DELETE FROM sessions WHERE employee_id IN (${placeholders})`).run(...demoIds); } catch {}
        try { db.prepare(`DELETE FROM waste_log WHERE employee_id IN (${placeholders})`).run(...demoIds); } catch {}
        try { db.prepare(`DELETE FROM shifts WHERE employee_id IN (${placeholders})`).run(...demoIds); } catch {}
        try { db.prepare(`DELETE FROM training_enrollments WHERE employee_id IN (${placeholders})`).run(...demoIds); } catch {}
        try { db.prepare(`DELETE FROM notification_preferences WHERE employee_id IN (${placeholders})`).run(...demoIds); } catch {}
        try { db.prepare(`DELETE FROM employees WHERE id IN (${placeholders})`).run(...demoIds); } catch {}
      }

      // Only delete orders with demo prefix
      try { db.prepare(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'DM-%')`).run(); } catch {}
      try { db.prepare(`DELETE FROM orders WHERE order_number LIKE 'DM-%'`).run(); } catch {}

      // Only delete demo-tagged inventory
      try { db.prepare(`DELETE FROM inventory WHERE lot_number LIKE 'DEMO-%'`).run(); } catch {}

      // Only delete demo customers
      try { db.prepare(`DELETE FROM customers WHERE email LIKE '%@demo.com'`).run(); } catch {}

      // Only delete demo suppliers
      try { db.prepare(`DELETE FROM suppliers WHERE email LIKE 'john@premspirits.com' OR email LIKE 'maria@freshfarms.com'`).run(); } catch {}

      // Only delete demo alerts
      try { db.prepare(`DELETE FROM alerts WHERE data LIKE '%"demo":true%'`).run(); } catch {}

      // Demo reorder requests scoped to demo ingredients
      try { db.prepare(`DELETE FROM reorder_requests WHERE ingredient_id IN (SELECT id FROM ingredients WHERE name IN ('Vodka','Gin','Lime Juice','Tonic Water','IPA (draft)','Chicken Breast','Fries (portion)') AND id NOT IN (SELECT DISTINCT ingredient_id FROM inventory WHERE lot_number NOT LIKE 'DEMO-%' AND lot_number IS NOT NULL))`).run(); } catch {}

      // Demo menu data — delete by known demo names (FK checks are off so order doesn't matter)
      const demoMenuNames = ['Gin & Tonic','Moscow Mule','IPA (16oz)','Buffalo Wings','Classic Burger','Grilled Chicken','Soft Drink'];
      const demoMenuPh = demoMenuNames.map(() => '?').join(',');
      try { db.prepare(`DELETE FROM recipes WHERE menu_item_id IN (SELECT id FROM menu_items WHERE name IN (${demoMenuPh}))`).run(...demoMenuNames); } catch {}
      try { db.prepare(`DELETE FROM menu_items WHERE name IN (${demoMenuPh})`).run(...demoMenuNames); } catch {}

      const demoModNames = ['Extra Shot','No Ice','Add Bacon','Well Done'];
      try { db.prepare(`DELETE FROM menu_modifiers WHERE name IN (${demoModNames.map(() => '?').join(',')})`).run(...demoModNames); } catch {}

      // Demo menu categories (only if no non-demo items reference them)
      const demoMenuCats = ['Cocktails','Beer','Appetizers','Entrees','Non-Alcoholic'];
      for (const catName of demoMenuCats) {
        try { db.prepare(`DELETE FROM menu_categories WHERE name = ? AND id NOT IN (SELECT DISTINCT category_id FROM menu_items WHERE category_id IS NOT NULL)`).run(catName); } catch {}
      }

      // Demo ingredient categories + ingredients
      const demoIngNames = ['Vodka','Gin','Lime Juice','Tonic Water','IPA (draft)','Chicken Breast','Fries (portion)'];
      try { db.prepare(`DELETE FROM ingredients WHERE name IN (${demoIngNames.map(() => '?').join(',')})`).run(...demoIngNames); } catch {}

      const demoIngCats = ['Spirits','Mixers','Beer','Produce','Proteins'];
      for (const catName of demoIngCats) {
        try { db.prepare(`DELETE FROM categories WHERE name = ? AND id NOT IN (SELECT DISTINCT category_id FROM ingredients WHERE category_id IS NOT NULL)`).run(catName); } catch {}
      }

      // Demo tables
      try { db.prepare(`DELETE FROM tables WHERE name IN ('T1','T2','T3','B1','B2','P1')`).run(); } catch {}

      // Demo back-office data
      try { db.prepare(`DELETE FROM catering_events WHERE notes LIKE '%Demo%'`).run(); } catch {}
      try { db.prepare(`DELETE FROM catering_packages WHERE name IN ('Classic Buffet','Premium Plated')`).run(); } catch {}
      try { db.prepare(`DELETE FROM marketing_campaigns WHERE name IN ('Happy Hour Launch','VIP Weekend Event','March Newsletter')`).run(); } catch {}
      try { db.prepare(`DELETE FROM promotions WHERE code IN ('HAPPY20','WELCOME10','BDAY25')`).run(); } catch {}
      try { db.prepare(`DELETE FROM bank_transactions WHERE reference LIKE 'DEP-%' OR reference LIKE 'CHK-%'`).run(); } catch {}
      try { db.prepare(`DELETE FROM bank_accounts WHERE bank_name = 'Chase' AND account_number_last4 IN ('4521','8877')`).run(); } catch {}
      try {
        const demoCourses = db.prepare(`SELECT id FROM training_courses WHERE title IN ('Food Safety Fundamentals','POS System Training','Advanced Mixology')`).all();
        if (demoCourses.length > 0) {
          const cIds = demoCourses.map(c => c.id);
          const ph = cIds.map(() => '?').join(',');
          db.prepare(`DELETE FROM training_enrollments WHERE course_id IN (${ph})`).run(...cIds);
          db.prepare(`DELETE FROM training_lessons WHERE course_id IN (${ph})`).run(...cIds);
          db.prepare(`DELETE FROM training_courses WHERE id IN (${ph})`).run(...cIds);
        }
      } catch {}
    }

    // Always clean up demo settings
    try { db.prepare(`DELETE FROM settings WHERE key IN ('demo_active', 'demo_session_count', 'demo_tour_step')`).run(); } catch {}

  } finally {
    // Always re-enable FK checks
    db.pragma('foreign_keys = ON');
  }
}

module.exports = router;
module.exports.cleanupDemo = cleanupDemo;
