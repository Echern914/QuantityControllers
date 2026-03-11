const { getDb } = require('./database');

function initializeSchema() {
  const db = getDb();

  db.exec(`
    -- ============================================================
    -- CATEGORIES & INGREDIENTS (from bar-inventory, enhanced)
    -- ============================================================
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT DEFAULT 'ingredient',
      color TEXT DEFAULT '#6366f1',
      icon TEXT DEFAULT 'box',
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      payment_terms TEXT DEFAULT 'Net 30',
      notes TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_id INTEGER,
      unit TEXT NOT NULL DEFAULT 'oz',
      cost_per_unit REAL DEFAULT 0,
      supplier_id INTEGER,
      par_level REAL DEFAULT 0,
      reorder_quantity REAL DEFAULT 0,
      shelf_life_days INTEGER,
      last_order_date DATETIME,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      full_quantity REAL,
      location TEXT DEFAULT 'bar',
      status TEXT DEFAULT 'sealed',
      expiration_date DATETIME,
      lot_number TEXT,
      received_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      purchase_order_id INTEGER,
      opened_at DATETIME,
      emptied_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_ingredient ON inventory(ingredient_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);
    CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory(location);

    -- ============================================================
    -- MENU SYSTEM
    -- ============================================================
    CREATE TABLE IF NOT EXISTS menu_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6366f1',
      icon TEXT DEFAULT 'utensils',
      display_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      category_id INTEGER,
      price REAL NOT NULL DEFAULT 0,
      cost REAL DEFAULT 0,
      image_url TEXT,
      prep_time_minutes INTEGER DEFAULT 5,
      course TEXT DEFAULT 'main',
      station TEXT DEFAULT 'bar',
      tax_rate REAL,
      is_86d INTEGER DEFAULT 0,
      display_order INTEGER DEFAULT 0,
      clover_item_id TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES menu_categories(id)
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_item_id INTEGER NOT NULL,
      ingredient_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT 'oz',
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
    );

    CREATE TABLE IF NOT EXISTS menu_modifiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      price_adjustment REAL DEFAULT 0,
      available INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS menu_item_modifiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_item_id INTEGER NOT NULL,
      modifier_id INTEGER NOT NULL,
      is_default INTEGER DEFAULT 0,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
      FOREIGN KEY (modifier_id) REFERENCES menu_modifiers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS combos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS combo_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      combo_id INTEGER NOT NULL,
      menu_item_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      FOREIGN KEY (combo_id) REFERENCES combos(id) ON DELETE CASCADE,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
    );

    CREATE TABLE IF NOT EXISTS pricing_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'happy_hour',
      menu_item_id INTEGER,
      category_id INTEGER,
      discount_type TEXT DEFAULT 'percent',
      discount_value REAL NOT NULL,
      start_time TEXT,
      end_time TEXT,
      start_date DATE,
      end_date DATE,
      days_of_week TEXT DEFAULT '[]',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
      FOREIGN KEY (category_id) REFERENCES menu_categories(id)
    );

    -- ============================================================
    -- EMPLOYEES & AUTH
    -- ============================================================
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'server',
      email TEXT,
      phone TEXT,
      hourly_rate REAL DEFAULT 0,
      hire_date DATE,
      color TEXT DEFAULT '#6366f1',
      active INTEGER DEFAULT 1,
      permissions TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      employee_id INTEGER NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      clock_in DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      clock_out DATETIME,
      break_minutes INTEGER DEFAULT 0,
      hours_worked REAL,
      hourly_rate_snapshot REAL,
      tips REAL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      shift_date DATE NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      station TEXT,
      notes TEXT,
      published INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    -- ============================================================
    -- TABLES & FLOOR PLAN
    -- ============================================================
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      section TEXT DEFAULT 'main',
      capacity INTEGER DEFAULT 4,
      status TEXT DEFAULT 'open',
      shape TEXT DEFAULT 'rect',
      pos_x REAL DEFAULT 0,
      pos_y REAL DEFAULT 0,
      width REAL DEFAULT 80,
      height REAL DEFAULT 80,
      current_order_id INTEGER,
      server_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      guest_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      party_size INTEGER DEFAULT 2,
      table_id INTEGER,
      reservation_date DATE NOT NULL,
      reservation_time TEXT NOT NULL,
      duration_minutes INTEGER DEFAULT 90,
      status TEXT DEFAULT 'confirmed',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (table_id) REFERENCES tables(id)
    );

    -- ============================================================
    -- ORDERS & PAYMENTS (the core POS)
    -- ============================================================
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE,
      order_type TEXT DEFAULT 'dine-in',
      table_id INTEGER,
      employee_id INTEGER,
      customer_id INTEGER,
      tab_id INTEGER,
      status TEXT DEFAULT 'open',
      subtotal REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      discount_reason TEXT,
      tip REAL DEFAULT 0,
      total REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'unpaid',
      guest_count INTEGER DEFAULT 1,
      clover_order_id TEXT,
      notes TEXT,
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (table_id) REFERENCES tables(id),
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (tab_id) REFERENCES tabs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);
    CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(opened_at);

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      menu_item_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_price REAL NOT NULL,
      modifiers TEXT DEFAULT '[]',
      special_instructions TEXT,
      course TEXT DEFAULT 'main',
      seat_number INTEGER DEFAULT 1,
      status TEXT DEFAULT 'pending',
      sent_to_kitchen_at DATETIME,
      prepared_at DATETIME,
      voided INTEGER DEFAULT 0,
      void_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
    );

    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(status);

    CREATE TABLE IF NOT EXISTS order_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      amount REAL NOT NULL,
      tip REAL DEFAULT 0,
      stripe_payment_id TEXT,
      clover_payment_id TEXT,
      card_last_four TEXT,
      employee_id INTEGER,
      refunded INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS tabs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      customer_id INTEGER,
      employee_id INTEGER,
      status TEXT DEFAULT 'open',
      card_token TEXT,
      card_last_four TEXT,
      total REAL DEFAULT 0,
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    -- ============================================================
    -- KITCHEN DISPLAY SYSTEM
    -- ============================================================
    CREATE TABLE IF NOT EXISTS kitchen_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      order_item_id INTEGER NOT NULL,
      station TEXT DEFAULT 'kitchen',
      priority INTEGER DEFAULT 0,
      status TEXT DEFAULT 'queued',
      queued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME,
      estimated_prep_minutes INTEGER DEFAULT 5,
      bump_count INTEGER DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (order_item_id) REFERENCES order_items(id)
    );

    CREATE INDEX IF NOT EXISTS idx_kitchen_status ON kitchen_queue(status);
    CREATE INDEX IF NOT EXISTS idx_kitchen_station ON kitchen_queue(station);

    -- ============================================================
    -- CUSTOMERS & LOYALTY
    -- ============================================================
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT,
      email TEXT UNIQUE,
      phone TEXT,
      birthday DATE,
      notes TEXT,
      loyalty_points INTEGER DEFAULT 0,
      total_visits INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      vip_tier TEXT DEFAULT 'regular',
      favorite_items TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_visit_at DATETIME
    );

    -- ============================================================
    -- SUPPLIERS & PURCHASE ORDERS
    -- ============================================================
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      order_number TEXT,
      status TEXT DEFAULT 'draft',
      ordered_by INTEGER,
      total_cost REAL DEFAULT 0,
      ordered_at DATETIME,
      expected_delivery DATE,
      received_at DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (ordered_by) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id INTEGER NOT NULL,
      ingredient_id INTEGER NOT NULL,
      quantity_ordered REAL NOT NULL,
      quantity_received REAL DEFAULT 0,
      unit_cost REAL DEFAULT 0,
      total_cost REAL DEFAULT 0,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
    );

    -- ============================================================
    -- TRANSACTIONS & WASTE (enhanced from bar-inventory)
    -- ============================================================
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'sale',
      ingredient_id INTEGER,
      inventory_id INTEGER,
      menu_item_id INTEGER,
      order_id INTEGER,
      quantity REAL,
      unit TEXT,
      status TEXT DEFAULT 'SUCCESS',
      employee_id INTEGER,
      employee_name TEXT,
      clover_order_id TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
      FOREIGN KEY (inventory_id) REFERENCES inventory(id),
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(created_at);

    CREATE TABLE IF NOT EXISTS waste_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_id INTEGER NOT NULL,
      inventory_id INTEGER,
      quantity REAL NOT NULL,
      unit TEXT,
      reason TEXT DEFAULT 'other',
      cost REAL DEFAULT 0,
      employee_id INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
      FOREIGN KEY (inventory_id) REFERENCES inventory(id),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    -- ============================================================
    -- ALERTS & NOTIFICATIONS
    -- ============================================================
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      severity TEXT DEFAULT 'medium',
      title TEXT NOT NULL,
      message TEXT,
      data TEXT DEFAULT '{}',
      acknowledged INTEGER DEFAULT 0,
      acknowledged_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (acknowledged_by) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      data TEXT DEFAULT '{}',
      target_role TEXT,
      target_employee_id INTEGER,
      read_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (target_employee_id) REFERENCES employees(id)
    );

    -- ============================================================
    -- REGISTER & REPORTS
    -- ============================================================
    CREATE TABLE IF NOT EXISTS register_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      register_name TEXT DEFAULT 'Main',
      employee_id INTEGER NOT NULL,
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      opening_cash REAL DEFAULT 0,
      closing_cash REAL,
      expected_cash REAL,
      cash_difference REAL,
      status TEXT DEFAULT 'open',
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_date DATE UNIQUE,
      gross_sales REAL DEFAULT 0,
      net_sales REAL DEFAULT 0,
      tax_collected REAL DEFAULT 0,
      total_discounts REAL DEFAULT 0,
      total_tips REAL DEFAULT 0,
      total_refunds REAL DEFAULT 0,
      cash_total REAL DEFAULT 0,
      card_total REAL DEFAULT 0,
      order_count INTEGER DEFAULT 0,
      guest_count INTEGER DEFAULT 0,
      labor_cost REAL DEFAULT 0,
      food_cost REAL DEFAULT 0,
      generated_at DATETIME,
      generated_by INTEGER,
      FOREIGN KEY (generated_by) REFERENCES employees(id)
    );

    -- ============================================================
    -- AI & SETTINGS
    -- ============================================================
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER,
      query TEXT NOT NULL,
      response TEXT,
      context TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ============================================================
    -- INVENTORY COUNTS (Physical count sheets)
    -- ============================================================
    CREATE TABLE IF NOT EXISTS inventory_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      count_date DATE NOT NULL DEFAULT (date('now')),
      employee_id INTEGER,
      status TEXT DEFAULT 'in_progress',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS inventory_count_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      count_id INTEGER NOT NULL,
      ingredient_id INTEGER NOT NULL,
      expected_qty REAL DEFAULT 0,
      actual_qty REAL DEFAULT 0,
      variance REAL DEFAULT 0,
      variance_cost REAL DEFAULT 0,
      notes TEXT,
      FOREIGN KEY (count_id) REFERENCES inventory_counts(id) ON DELETE CASCADE,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
    );

    -- ============================================================
    -- STOCK TRANSFERS
    -- ============================================================
    CREATE TABLE IF NOT EXISTS stock_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_id INTEGER NOT NULL,
      from_location TEXT NOT NULL,
      to_location TEXT NOT NULL,
      quantity REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      requested_by INTEGER,
      approved_by INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
      FOREIGN KEY (requested_by) REFERENCES employees(id),
      FOREIGN KEY (approved_by) REFERENCES employees(id)
    );
  `);

  // Insert default settings
  const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  const defaults = {
    restaurant_name: process.env.RESTAURANT_NAME || 'Nexus Bar & Grill',
    tax_rate: process.env.TAX_RATE || '0.08',
    tip_pool_enabled: process.env.TIP_POOL_ENABLED || 'false',
    low_stock_threshold: process.env.LOW_STOCK_THRESHOLD || '20',
    auto_reorder_enabled: process.env.AUTO_REORDER_ENABLED || 'false',
    order_number_prefix: 'NX',
    next_order_number: '1001',
    currency: 'USD',
    receipt_footer: 'Thank you for dining with us!',
    loyalty_points_per_dollar: '1',
    loyalty_redemption_rate: '100',
  };
  for (const [key, value] of Object.entries(defaults)) {
    insertSetting.run(key, value);
  }

  console.log('[DB] Schema initialized');
}

module.exports = { initializeSchema };
