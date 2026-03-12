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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_item_id INTEGER NOT NULL,
      ingredient_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT 'oz',
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS menu_modifiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      price_adjustment REAL DEFAULT 0,
      available INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
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
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE SET NULL
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
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES employees(id) ON DELETE SET NULL
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE SET NULL
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
      FOREIGN KEY (ordered_by) REFERENCES employees(id) ON DELETE SET NULL
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
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
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
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE SET NULL,
      FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE SET NULL,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
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
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE SET NULL,
      FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE SET NULL,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
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
      FOREIGN KEY (acknowledged_by) REFERENCES employees(id) ON DELETE SET NULL
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
      FOREIGN KEY (target_employee_id) REFERENCES employees(id) ON DELETE SET NULL
    );

    -- ============================================================
    -- SUPPLY MONITORING & REORDER REQUESTS
    -- ============================================================
    CREATE TABLE IF NOT EXISTS reorder_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_id INTEGER NOT NULL,
      supplier_id INTEGER,
      ingredient_name TEXT NOT NULL,
      current_stock REAL DEFAULT 0,
      par_level REAL DEFAULT 0,
      suggested_qty REAL NOT NULL,
      unit TEXT NOT NULL,
      unit_cost REAL DEFAULT 0,
      est_total REAL DEFAULT 0,
      urgency TEXT DEFAULT 'medium',
      reason TEXT,
      status TEXT DEFAULT 'pending',
      approved_by INTEGER,
      approved_at DATETIME,
      rejected_by INTEGER,
      rejected_at DATETIME,
      rejection_reason TEXT,
      purchase_order_id INTEGER,
      notification_sent INTEGER DEFAULT 0,
      email_sent INTEGER DEFAULT 0,
      sms_sent INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
      FOREIGN KEY (approved_by) REFERENCES employees(id) ON DELETE SET NULL,
      FOREIGN KEY (rejected_by) REFERENCES employees(id) ON DELETE SET NULL,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reorder_requests_status ON reorder_requests(status);
    CREATE INDEX IF NOT EXISTS idx_reorder_requests_ingredient ON reorder_requests(ingredient_id);

    CREATE TABLE IF NOT EXISTS notification_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      notify_low_stock INTEGER DEFAULT 1,
      notify_out_of_stock INTEGER DEFAULT 1,
      notify_reorder_ready INTEGER DEFAULT 1,
      notify_expiring INTEGER DEFAULT 0,
      email TEXT,
      phone TEXT,
      email_enabled INTEGER DEFAULT 0,
      sms_enabled INTEGER DEFAULT 0,
      push_enabled INTEGER DEFAULT 1,
      low_stock_threshold REAL DEFAULT 0.20,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_prefs_employee ON notification_preferences(employee_id);

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
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
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
      FOREIGN KEY (generated_by) REFERENCES employees(id) ON DELETE SET NULL
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
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
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
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
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
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
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
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
      FOREIGN KEY (requested_by) REFERENCES employees(id) ON DELETE SET NULL,
      FOREIGN KEY (approved_by) REFERENCES employees(id) ON DELETE SET NULL
    );

    -- ============================================================
    -- ACCOUNTING ENGINE (Restaurant-Specific Double-Entry)
    -- ============================================================
    CREATE TABLE IF NOT EXISTS fiscal_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      period_type TEXT DEFAULT 'monthly',
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status TEXT DEFAULT 'open',
      closed_by INTEGER,
      closed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (closed_by) REFERENCES employees(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS chart_of_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_number TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      sub_type TEXT,
      parent_id INTEGER,
      normal_balance TEXT DEFAULT 'debit',
      description TEXT,
      is_system INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_coa_type ON chart_of_accounts(account_type);
    CREATE INDEX IF NOT EXISTS idx_coa_number ON chart_of_accounts(account_number);

    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_number TEXT UNIQUE,
      entry_date DATE NOT NULL,
      fiscal_period_id INTEGER,
      description TEXT,
      source TEXT DEFAULT 'manual',
      source_id INTEGER,
      reference TEXT,
      status TEXT DEFAULT 'draft',
      approved_by INTEGER,
      approved_at DATETIME,
      posted_by INTEGER,
      posted_at DATETIME,
      reversed INTEGER DEFAULT 0,
      reversal_of INTEGER,
      location_id INTEGER,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fiscal_period_id) REFERENCES fiscal_periods(id) ON DELETE RESTRICT,
      FOREIGN KEY (approved_by) REFERENCES employees(id) ON DELETE SET NULL,
      FOREIGN KEY (posted_by) REFERENCES employees(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL,
      FOREIGN KEY (reversal_of) REFERENCES journal_entries(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_je_date ON journal_entries(entry_date);
    CREATE INDEX IF NOT EXISTS idx_je_status ON journal_entries(status);
    CREATE INDEX IF NOT EXISTS idx_je_source ON journal_entries(source);

    CREATE TABLE IF NOT EXISTS journal_entry_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journal_entry_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      description TEXT,
      debit REAL DEFAULT 0,
      credit REAL DEFAULT 0,
      location_id INTEGER,
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_jel_entry ON journal_entry_lines(journal_entry_id);
    CREATE INDEX IF NOT EXISTS idx_jel_account ON journal_entry_lines(account_id);

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      fiscal_period_id INTEGER,
      account_id INTEGER NOT NULL,
      budget_type TEXT DEFAULT 'fixed',
      amount REAL DEFAULT 0,
      location_id INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fiscal_period_id) REFERENCES fiscal_periods(id) ON DELETE SET NULL,
      FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT
    );

    -- ============================================================
    -- ACCOUNTS PAYABLE AUTOMATION
    -- ============================================================
    CREATE TABLE IF NOT EXISTS ap_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL,
      supplier_id INTEGER NOT NULL,
      purchase_order_id INTEGER,
      invoice_date DATE NOT NULL,
      due_date DATE NOT NULL,
      subtotal REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      shipping REAL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      amount_paid REAL DEFAULT 0,
      balance_due REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      approval_status TEXT DEFAULT 'pending',
      approved_by INTEGER,
      approved_at DATETIME,
      payment_method TEXT,
      payment_reference TEXT,
      paid_at DATETIME,
      gl_account_id INTEGER,
      location_id INTEGER,
      notes TEXT,
      attachment_path TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
      FOREIGN KEY (approved_by) REFERENCES employees(id) ON DELETE SET NULL,
      FOREIGN KEY (gl_account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
      FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ap_supplier ON ap_invoices(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_ap_status ON ap_invoices(status);
    CREATE INDEX IF NOT EXISTS idx_ap_due ON ap_invoices(due_date);

    CREATE TABLE IF NOT EXISTS ap_invoice_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      description TEXT,
      account_id INTEGER,
      ingredient_id INTEGER,
      quantity REAL DEFAULT 1,
      unit_price REAL DEFAULT 0,
      total REAL DEFAULT 0,
      FOREIGN KEY (invoice_id) REFERENCES ap_invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS ap_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_date DATE NOT NULL,
      payment_method TEXT DEFAULT 'check',
      reference_number TEXT,
      bank_account_id INTEGER,
      notes TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES ap_invoices(id) ON DELETE RESTRICT,
      FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE RESTRICT,
      FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS approval_workflows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      min_amount REAL DEFAULT 0,
      max_amount REAL,
      required_role TEXT DEFAULT 'manager',
      auto_approve_below REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ============================================================
    -- BANK RECONCILIATION
    -- ============================================================
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      bank_name TEXT,
      account_number_last4 TEXT,
      routing_number_last4 TEXT,
      account_type TEXT DEFAULT 'checking',
      gl_account_id INTEGER,
      current_balance REAL DEFAULT 0,
      last_reconciled_date DATE,
      last_statement_balance REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      location_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (gl_account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS bank_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_account_id INTEGER NOT NULL,
      transaction_date DATE NOT NULL,
      description TEXT,
      reference TEXT,
      amount REAL NOT NULL,
      transaction_type TEXT DEFAULT 'debit',
      category TEXT,
      matched INTEGER DEFAULT 0,
      matched_entity_type TEXT,
      matched_entity_id INTEGER,
      reconciled INTEGER DEFAULT 0,
      reconciliation_id INTEGER,
      imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_bank_tx_account ON bank_transactions(bank_account_id);
    CREATE INDEX IF NOT EXISTS idx_bank_tx_date ON bank_transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_bank_tx_reconciled ON bank_transactions(reconciled);

    CREATE TABLE IF NOT EXISTS bank_reconciliations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_account_id INTEGER NOT NULL,
      statement_date DATE NOT NULL,
      statement_balance REAL NOT NULL,
      book_balance REAL NOT NULL,
      difference REAL DEFAULT 0,
      status TEXT DEFAULT 'in_progress',
      completed_by INTEGER,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE RESTRICT,
      FOREIGN KEY (completed_by) REFERENCES employees(id) ON DELETE SET NULL
    );

    -- ============================================================
    -- PAYROLL & HR
    -- ============================================================
    CREATE TABLE IF NOT EXISTS payroll_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pay_period_start DATE NOT NULL,
      pay_period_end DATE NOT NULL,
      pay_date DATE NOT NULL,
      status TEXT DEFAULT 'draft',
      total_gross REAL DEFAULT 0,
      total_deductions REAL DEFAULT 0,
      total_employer_taxes REAL DEFAULT 0,
      total_net REAL DEFAULT 0,
      total_tips REAL DEFAULT 0,
      employee_count INTEGER DEFAULT 0,
      location_id INTEGER,
      approved_by INTEGER,
      approved_at DATETIME,
      processed_by INTEGER,
      processed_at DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (approved_by) REFERENCES employees(id) ON DELETE SET NULL,
      FOREIGN KEY (processed_by) REFERENCES employees(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS payroll_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payroll_run_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      regular_hours REAL DEFAULT 0,
      overtime_hours REAL DEFAULT 0,
      hourly_rate REAL DEFAULT 0,
      overtime_rate REAL DEFAULT 0,
      regular_pay REAL DEFAULT 0,
      overtime_pay REAL DEFAULT 0,
      gross_pay REAL DEFAULT 0,
      tips_cash REAL DEFAULT 0,
      tips_credit REAL DEFAULT 0,
      tips_pooled REAL DEFAULT 0,
      total_tips REAL DEFAULT 0,
      federal_tax REAL DEFAULT 0,
      state_tax REAL DEFAULT 0,
      social_security REAL DEFAULT 0,
      medicare REAL DEFAULT 0,
      other_deductions REAL DEFAULT 0,
      total_deductions REAL DEFAULT 0,
      net_pay REAL DEFAULT 0,
      payment_method TEXT DEFAULT 'direct_deposit',
      FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_payroll_items_run ON payroll_items(payroll_run_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_items_emp ON payroll_items(employee_id);

    CREATE TABLE IF NOT EXISTS tax_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rate_type TEXT NOT NULL,
      rate REAL NOT NULL,
      bracket_min REAL DEFAULT 0,
      bracket_max REAL,
      employer_match REAL DEFAULT 0,
      effective_date DATE,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tip_pools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pool_date DATE NOT NULL,
      shift TEXT,
      total_tips REAL DEFAULT 0,
      total_hours REAL DEFAULT 0,
      rate_per_hour REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tip_pool_distributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tip_pool_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      hours_worked REAL DEFAULT 0,
      share_amount REAL DEFAULT 0,
      role TEXT,
      weight REAL DEFAULT 1.0,
      FOREIGN KEY (tip_pool_id) REFERENCES tip_pools(id) ON DELETE CASCADE,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS employee_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      document_type TEXT NOT NULL,
      name TEXT NOT NULL,
      file_path TEXT,
      expiration_date DATE,
      verified INTEGER DEFAULT 0,
      verified_by INTEGER,
      notes TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (verified_by) REFERENCES employees(id) ON DELETE SET NULL
    );

    -- ============================================================
    -- MULTI-LOCATION MANAGEMENT
    -- ============================================================
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      phone TEXT,
      email TEXT,
      timezone TEXT DEFAULT 'America/New_York',
      tax_rate REAL DEFAULT 0.08,
      is_primary INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      manager_id INTEGER,
      opening_date DATE,
      pos_system TEXT DEFAULT 'venuecore',
      clover_merchant_id TEXT,
      stripe_account_id TEXT,
      settings TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS location_employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      role TEXT DEFAULT 'staff',
      is_primary INTEGER DEFAULT 1,
      start_date DATE,
      end_date DATE,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      UNIQUE(location_id, employee_id)
    );

    CREATE TABLE IF NOT EXISTS location_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      ingredient_id INTEGER NOT NULL,
      par_level REAL DEFAULT 0,
      current_stock REAL DEFAULT 0,
      last_count_date DATE,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
      UNIQUE(location_id, ingredient_id)
    );

    CREATE TABLE IF NOT EXISTS inter_location_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_location_id INTEGER NOT NULL,
      to_location_id INTEGER NOT NULL,
      ingredient_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT,
      status TEXT DEFAULT 'requested',
      requested_by INTEGER,
      approved_by INTEGER,
      shipped_at DATETIME,
      received_at DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (from_location_id) REFERENCES locations(id) ON DELETE RESTRICT,
      FOREIGN KEY (to_location_id) REFERENCES locations(id) ON DELETE RESTRICT,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
      FOREIGN KEY (requested_by) REFERENCES employees(id) ON DELETE SET NULL,
      FOREIGN KEY (approved_by) REFERENCES employees(id) ON DELETE SET NULL
    );

    -- ============================================================
    -- TRAINING & LMS (Learning Management System)
    -- ============================================================
    CREATE TABLE IF NOT EXISTS training_courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'general',
      difficulty TEXT DEFAULT 'beginner',
      estimated_minutes INTEGER DEFAULT 30,
      passing_score INTEGER DEFAULT 80,
      required_for_roles TEXT DEFAULT '[]',
      is_onboarding INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS training_lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      content_type TEXT DEFAULT 'text',
      media_url TEXT,
      display_order INTEGER DEFAULT 0,
      duration_minutes INTEGER DEFAULT 10,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES training_courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS training_quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id INTEGER NOT NULL,
      question TEXT NOT NULL,
      question_type TEXT DEFAULT 'multiple_choice',
      options TEXT DEFAULT '[]',
      correct_answer TEXT NOT NULL,
      explanation TEXT,
      points INTEGER DEFAULT 10,
      display_order INTEGER DEFAULT 0,
      FOREIGN KEY (lesson_id) REFERENCES training_lessons(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS training_enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      status TEXT DEFAULT 'enrolled',
      progress_percent INTEGER DEFAULT 0,
      current_lesson_id INTEGER,
      score INTEGER DEFAULT 0,
      attempts INTEGER DEFAULT 0,
      started_at DATETIME,
      completed_at DATETIME,
      due_date DATE,
      assigned_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES training_courses(id) ON DELETE CASCADE,
      FOREIGN KEY (current_lesson_id) REFERENCES training_lessons(id) ON DELETE SET NULL,
      FOREIGN KEY (assigned_by) REFERENCES employees(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_enrollment_emp ON training_enrollments(employee_id);
    CREATE INDEX IF NOT EXISTS idx_enrollment_course ON training_enrollments(course_id);

    CREATE TABLE IF NOT EXISTS training_lesson_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enrollment_id INTEGER NOT NULL,
      lesson_id INTEGER NOT NULL,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      quiz_score INTEGER,
      quiz_answers TEXT DEFAULT '{}',
      FOREIGN KEY (enrollment_id) REFERENCES training_enrollments(id) ON DELETE CASCADE,
      FOREIGN KEY (lesson_id) REFERENCES training_lessons(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS certifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      issuing_body TEXT,
      certification_number TEXT,
      issued_date DATE,
      expiration_date DATE,
      status TEXT DEFAULT 'active',
      course_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES training_courses(id) ON DELETE SET NULL
    );

    -- ============================================================
    -- CATERING & EVENTS
    -- ============================================================
    CREATE TABLE IF NOT EXISTS catering_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_name TEXT NOT NULL,
      event_type TEXT DEFAULT 'private_party',
      customer_id INTEGER,
      contact_name TEXT NOT NULL,
      contact_phone TEXT,
      contact_email TEXT,
      event_date DATE NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      guest_count INTEGER DEFAULT 20,
      location TEXT,
      venue_type TEXT DEFAULT 'on_premise',
      status TEXT DEFAULT 'inquiry',
      deposit_amount REAL DEFAULT 0,
      deposit_paid INTEGER DEFAULT 0,
      subtotal REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      service_charge REAL DEFAULT 0,
      total REAL DEFAULT 0,
      amount_paid REAL DEFAULT 0,
      balance_due REAL DEFAULT 0,
      staff_needed INTEGER DEFAULT 0,
      setup_time TEXT,
      cleanup_time TEXT,
      special_requirements TEXT,
      dietary_notes TEXT,
      notes TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_catering_date ON catering_events(event_date);
    CREATE INDEX IF NOT EXISTS idx_catering_status ON catering_events(status);

    CREATE TABLE IF NOT EXISTS catering_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price_per_person REAL DEFAULT 0,
      min_guests INTEGER DEFAULT 10,
      max_guests INTEGER,
      includes TEXT DEFAULT '[]',
      category TEXT DEFAULT 'standard',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS catering_event_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      menu_item_id INTEGER,
      package_id INTEGER,
      custom_item_name TEXT,
      quantity INTEGER DEFAULT 1,
      unit_price REAL DEFAULT 0,
      total REAL DEFAULT 0,
      notes TEXT,
      FOREIGN KEY (event_id) REFERENCES catering_events(id) ON DELETE CASCADE,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL,
      FOREIGN KEY (package_id) REFERENCES catering_packages(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS catering_event_staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      role TEXT DEFAULT 'server',
      start_time TEXT,
      end_time TEXT,
      confirmed INTEGER DEFAULT 0,
      FOREIGN KEY (event_id) REFERENCES catering_events(id) ON DELETE CASCADE,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );

    -- ============================================================
    -- MARKETING & CAMPAIGNS
    -- ============================================================
    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      campaign_type TEXT DEFAULT 'email',
      status TEXT DEFAULT 'draft',
      target_audience TEXT DEFAULT 'all',
      audience_filter TEXT DEFAULT '{}',
      subject TEXT,
      content TEXT,
      template TEXT,
      send_date DATETIME,
      sent_at DATETIME,
      recipients_count INTEGER DEFAULT 0,
      opens_count INTEGER DEFAULT 0,
      clicks_count INTEGER DEFAULT 0,
      conversions_count INTEGER DEFAULT 0,
      revenue_generated REAL DEFAULT 0,
      budget REAL DEFAULT 0,
      spent REAL DEFAULT 0,
      location_id INTEGER,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE,
      promotion_type TEXT DEFAULT 'discount',
      discount_type TEXT DEFAULT 'percent',
      discount_value REAL DEFAULT 0,
      min_order_amount REAL DEFAULT 0,
      max_discount REAL,
      applicable_items TEXT DEFAULT '[]',
      applicable_categories TEXT DEFAULT '[]',
      start_date DATE,
      end_date DATE,
      start_time TEXT,
      end_time TEXT,
      days_of_week TEXT DEFAULT '[]',
      max_uses INTEGER,
      uses_count INTEGER DEFAULT 0,
      max_uses_per_customer INTEGER,
      stackable INTEGER DEFAULT 0,
      campaign_id INTEGER,
      location_id INTEGER,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_promo_code ON promotions(code);
    CREATE INDEX IF NOT EXISTS idx_promo_dates ON promotions(start_date, end_date);

    CREATE TABLE IF NOT EXISTS promotion_uses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promotion_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      customer_id INTEGER,
      discount_amount REAL DEFAULT 0,
      used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS email_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      segment_rules TEXT DEFAULT '{}',
      subscriber_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL,
      customer_id INTEGER,
      email TEXT NOT NULL,
      first_name TEXT,
      status TEXT DEFAULT 'subscribed',
      subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      unsubscribed_at DATETIME,
      FOREIGN KEY (list_id) REFERENCES email_lists(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    -- ============================================================
    -- FORECASTING & INTELLIGENCE
    -- ============================================================
    CREATE TABLE IF NOT EXISTS sales_forecasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      forecast_date DATE NOT NULL,
      day_of_week INTEGER,
      predicted_sales REAL DEFAULT 0,
      predicted_orders INTEGER DEFAULT 0,
      predicted_guests INTEGER DEFAULT 0,
      confidence REAL DEFAULT 0,
      actual_sales REAL,
      actual_orders INTEGER,
      variance REAL,
      model_version TEXT,
      location_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_forecast_date ON sales_forecasts(forecast_date);

    CREATE TABLE IF NOT EXISTS labor_forecasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      forecast_date DATE NOT NULL,
      hour INTEGER,
      predicted_covers INTEGER DEFAULT 0,
      recommended_staff INTEGER DEFAULT 0,
      recommended_roles TEXT DEFAULT '{}',
      actual_staff INTEGER,
      location_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ============================================================
    -- CLOVER APP MARKET INTEGRATION (Multi-Tenant)
    -- ============================================================
    CREATE TABLE IF NOT EXISTS clover_merchants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT NOT NULL UNIQUE,
      merchant_name TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_expires_at DATETIME,
      environment TEXT DEFAULT 'sandbox',
      status TEXT DEFAULT 'active',
      scopes TEXT DEFAULT '[]',
      installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_sync_at DATETIME,
      sync_config TEXT DEFAULT '{"menu":true,"orders":true,"payments":true,"inventory":true}',
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_clover_merchant_id ON clover_merchants(merchant_id);

    CREATE TABLE IF NOT EXISTS clover_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT NOT NULL,
      sync_type TEXT NOT NULL,
      direction TEXT DEFAULT 'push',
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      local_id INTEGER,
      clover_id TEXT,
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      request_payload TEXT,
      response_payload TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (merchant_id) REFERENCES clover_merchants(merchant_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_clover_sync_merchant ON clover_sync_log(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_clover_sync_status ON clover_sync_log(status);

    CREATE TABLE IF NOT EXISTS clover_webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT NOT NULL,
      webhook_id TEXT,
      event_type TEXT NOT NULL,
      payload TEXT,
      processed INTEGER DEFAULT 0,
      processed_at DATETIME,
      error_message TEXT,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (merchant_id) REFERENCES clover_merchants(merchant_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_clover_webhooks_merchant ON clover_webhooks(merchant_id);

    CREATE TABLE IF NOT EXISTS clover_id_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      local_id INTEGER NOT NULL,
      clover_id TEXT NOT NULL,
      last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (merchant_id) REFERENCES clover_merchants(merchant_id) ON DELETE CASCADE,
      UNIQUE(merchant_id, entity_type, local_id),
      UNIQUE(merchant_id, entity_type, clover_id)
    );

    -- ============================================================
    -- SALES TAX MANAGEMENT
    -- ============================================================
    CREATE TABLE IF NOT EXISTS sales_tax_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state_code TEXT NOT NULL,
      state_name TEXT NOT NULL,
      state_rate REAL NOT NULL DEFAULT 0,
      county_name TEXT,
      county_rate REAL DEFAULT 0,
      city_name TEXT,
      city_rate REAL DEFAULT 0,
      special_district_rate REAL DEFAULT 0,
      combined_rate REAL GENERATED ALWAYS AS (state_rate + county_rate + city_rate + special_district_rate) STORED,
      food_taxed INTEGER DEFAULT 1,
      food_rate_override REAL,
      alcohol_rate_override REAL,
      has_reduced_food_rate INTEGER DEFAULT 0,
      filing_frequency TEXT DEFAULT 'monthly',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales_tax_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_id INTEGER NOT NULL,
      rule_type TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT,
      exempt INTEGER DEFAULT 0,
      special_rate REAL,
      notes TEXT,
      FOREIGN KEY (config_id) REFERENCES sales_tax_config(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sales_tax_collected (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      order_number TEXT,
      sale_date DATE NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      food_amount REAL DEFAULT 0,
      beverage_amount REAL DEFAULT 0,
      alcohol_amount REAL DEFAULT 0,
      other_amount REAL DEFAULT 0,
      tax_rate REAL NOT NULL,
      food_tax REAL DEFAULT 0,
      beverage_tax REAL DEFAULT 0,
      alcohol_tax REAL DEFAULT 0,
      other_tax REAL DEFAULT 0,
      total_tax REAL NOT NULL DEFAULT 0,
      state_portion REAL DEFAULT 0,
      county_portion REAL DEFAULT 0,
      city_portion REAL DEFAULT 0,
      special_portion REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tax_collected_date ON sales_tax_collected(sale_date);
    CREATE INDEX IF NOT EXISTS idx_tax_collected_order ON sales_tax_collected(order_id);

    CREATE TABLE IF NOT EXISTS sales_tax_filings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      filing_frequency TEXT NOT NULL,
      state_code TEXT NOT NULL,
      total_gross_sales REAL DEFAULT 0,
      total_taxable_sales REAL DEFAULT 0,
      total_exempt_sales REAL DEFAULT 0,
      total_tax_collected REAL DEFAULT 0,
      state_tax_due REAL DEFAULT 0,
      county_tax_due REAL DEFAULT 0,
      city_tax_due REAL DEFAULT 0,
      special_tax_due REAL DEFAULT 0,
      total_tax_due REAL DEFAULT 0,
      adjustments REAL DEFAULT 0,
      penalties REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      due_date DATE,
      filed_date DATE,
      confirmation_number TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tax_filings_period ON sales_tax_filings(period_start, period_end);
    CREATE INDEX IF NOT EXISTS idx_tax_filings_status ON sales_tax_filings(status);

    CREATE TABLE IF NOT EXISTS sales_tax_filing_deadlines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state_code TEXT NOT NULL,
      frequency TEXT NOT NULL,
      month INTEGER,
      day_of_month INTEGER NOT NULL,
      description TEXT,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS state_tax_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state_code TEXT UNIQUE NOT NULL,
      state_name TEXT NOT NULL,
      base_sales_tax_rate REAL NOT NULL DEFAULT 0,
      max_local_rate REAL DEFAULT 0,
      avg_combined_rate REAL DEFAULT 0,
      food_taxed INTEGER DEFAULT 1,
      food_reduced_rate REAL,
      alcohol_extra_rate REAL DEFAULT 0,
      prepared_food_taxed INTEGER DEFAULT 1,
      grocery_taxed INTEGER DEFAULT 0,
      filing_frequencies TEXT DEFAULT '["monthly"]',
      tax_holidays TEXT,
      notes TEXT,
      last_updated DATE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_state_profiles_code ON state_tax_profiles(state_code);

    CREATE TABLE IF NOT EXISTS sales_tax_exemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_id INTEGER,
      customer_id INTEGER,
      exemption_type TEXT NOT NULL,
      certificate_number TEXT,
      issuing_state TEXT,
      expiration_date DATE,
      notes TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (config_id) REFERENCES sales_tax_config(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS anomaly_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anomaly_type TEXT NOT NULL,
      severity TEXT DEFAULT 'medium',
      metric TEXT NOT NULL,
      expected_value REAL,
      actual_value REAL,
      deviation_percent REAL,
      description TEXT,
      acknowledged INTEGER DEFAULT 0,
      acknowledged_by INTEGER,
      location_id INTEGER,
      detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (acknowledged_by) REFERENCES employees(id) ON DELETE SET NULL
    );

    -- ============================================================
    -- PERFORMANCE INDEXES (FK columns & common lookups)
    -- ============================================================

    -- Ingredients
    CREATE INDEX IF NOT EXISTS idx_ingredients_category ON ingredients(category_id);
    CREATE INDEX IF NOT EXISTS idx_ingredients_supplier ON ingredients(supplier_id);

    -- Menu
    CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
    CREATE INDEX IF NOT EXISTS idx_menu_items_station ON menu_items(station);
    CREATE INDEX IF NOT EXISTS idx_recipes_menu_item ON recipes(menu_item_id);
    CREATE INDEX IF NOT EXISTS idx_recipes_ingredient ON recipes(ingredient_id);
    CREATE INDEX IF NOT EXISTS idx_menu_item_modifiers_item ON menu_item_modifiers(menu_item_id);
    CREATE INDEX IF NOT EXISTS idx_menu_item_modifiers_mod ON menu_item_modifiers(modifier_id);
    CREATE INDEX IF NOT EXISTS idx_combo_items_combo ON combo_items(combo_id);

    -- Employees & Time
    CREATE INDEX IF NOT EXISTS idx_employees_pin ON employees(pin_hash);
    CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(active);
    CREATE INDEX IF NOT EXISTS idx_time_entries_employee ON time_entries(employee_id);
    CREATE INDEX IF NOT EXISTS idx_time_entries_clockin ON time_entries(clock_in);
    CREATE INDEX IF NOT EXISTS idx_shifts_employee ON shifts(employee_id);
    CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(shift_date);

    -- Orders & Payments
    CREATE INDEX IF NOT EXISTS idx_orders_employee ON orders(employee_id);
    CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_menu_item ON order_items(menu_item_id);
    CREATE INDEX IF NOT EXISTS idx_payments_order ON order_payments(order_id);
    CREATE INDEX IF NOT EXISTS idx_payments_employee ON order_payments(employee_id);

    -- Tables & Reservations
    CREATE INDEX IF NOT EXISTS idx_reservations_customer ON reservations(customer_id);
    CREATE INDEX IF NOT EXISTS idx_reservations_table ON reservations(table_id);
    CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(reservation_date);
    CREATE INDEX IF NOT EXISTS idx_tabs_customer ON tabs(customer_id);

    -- Customers
    CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

    -- Kitchen
    CREATE INDEX IF NOT EXISTS idx_kitchen_order ON kitchen_queue(order_id);
    CREATE INDEX IF NOT EXISTS idx_kitchen_order_item ON kitchen_queue(order_item_id);

    -- Purchase Orders
    CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
    CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(purchase_order_id);
    CREATE INDEX IF NOT EXISTS idx_po_items_ingredient ON purchase_order_items(ingredient_id);

    -- Waste & Stock Transfers
    CREATE INDEX IF NOT EXISTS idx_waste_ingredient ON waste_log(ingredient_id);
    CREATE INDEX IF NOT EXISTS idx_stock_transfers_ingredient ON stock_transfers(ingredient_id);

    -- Notifications
    CREATE INDEX IF NOT EXISTS idx_notifications_target ON notifications(target_employee_id);

    -- AP
    CREATE INDEX IF NOT EXISTS idx_ap_lines_invoice ON ap_invoice_lines(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_ap_payments_invoice ON ap_payments(invoice_id);

    -- Bank
    CREATE INDEX IF NOT EXISTS idx_bank_recon_account ON bank_reconciliations(bank_account_id);

    -- Payroll
    CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON payroll_runs(pay_period_start, pay_period_end);

    -- Locations
    CREATE INDEX IF NOT EXISTS idx_location_employees_location ON location_employees(location_id);
    CREATE INDEX IF NOT EXISTS idx_location_employees_employee ON location_employees(employee_id);
    CREATE INDEX IF NOT EXISTS idx_location_inventory_location ON location_inventory(location_id);
    CREATE INDEX IF NOT EXISTS idx_location_inventory_ingredient ON location_inventory(ingredient_id);
    CREATE INDEX IF NOT EXISTS idx_inter_transfers_from ON inter_location_transfers(from_location_id);
    CREATE INDEX IF NOT EXISTS idx_inter_transfers_to ON inter_location_transfers(to_location_id);

    -- Catering
    CREATE INDEX IF NOT EXISTS idx_catering_customer ON catering_events(customer_id);
    CREATE INDEX IF NOT EXISTS idx_catering_items_event ON catering_event_items(event_id);
    CREATE INDEX IF NOT EXISTS idx_catering_staff_event ON catering_event_staff(event_id);

    -- Marketing
    CREATE INDEX IF NOT EXISTS idx_promo_usage_promo ON promotion_uses(promotion_id);
    CREATE INDEX IF NOT EXISTS idx_promo_usage_order ON promotion_uses(order_id);
    CREATE INDEX IF NOT EXISTS idx_email_subscribers_list ON email_subscribers(list_id);
    CREATE INDEX IF NOT EXISTS idx_email_subscribers_customer ON email_subscribers(customer_id);

    -- Clover
    CREATE INDEX IF NOT EXISTS idx_clover_idmap_merchant ON clover_id_map(merchant_id);

    -- Tax
    CREATE INDEX IF NOT EXISTS idx_tax_exemptions_customer ON sales_tax_exemptions(customer_id);
    CREATE INDEX IF NOT EXISTS idx_tax_exemptions_config ON sales_tax_exemptions(config_id);

    -- Anomaly log
    CREATE INDEX IF NOT EXISTS idx_anomaly_severity ON anomaly_log(severity);
    CREATE INDEX IF NOT EXISTS idx_anomaly_detected ON anomaly_log(detected_at);
  `);

  // Insert default settings
  const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  const defaults = {
    restaurant_name: process.env.RESTAURANT_NAME || 'VenueCore Bar & Grill',
    tax_rate: process.env.TAX_RATE || '0.08',
    tip_pool_enabled: process.env.TIP_POOL_ENABLED || 'false',
    low_stock_threshold: process.env.LOW_STOCK_THRESHOLD || '20',
    auto_reorder_enabled: process.env.AUTO_REORDER_ENABLED || 'false',
    order_number_prefix: 'VC',
    next_order_number: '1001',
    currency: 'USD',
    receipt_footer: 'Thank you for dining with us!',
    loyalty_points_per_dollar: '1',
    loyalty_redemption_rate: '100',
    // Payroll defaults
    federal_tax_rate: '0.12',
    state_tax_rate: '0.05',
    social_security_rate: '0.062',
    medicare_rate: '0.0145',
    overtime_multiplier: '1.5',
    overtime_threshold_hours: '40',
    // Multi-location
    multi_location_enabled: 'false',
  };
  for (const [key, value] of Object.entries(defaults)) {
    insertSetting.run(key, value);
  }

  // Seed Chart of Accounts (Restaurant-specific)
  const insertAccount = db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name, account_type, sub_type, normal_balance, is_system) VALUES (?, ?, ?, ?, ?, 1)`);
  const accounts = [
    // Assets
    ['1000', 'Cash', 'asset', 'current', 'debit'],
    ['1010', 'Checking Account', 'asset', 'current', 'debit'],
    ['1020', 'Savings Account', 'asset', 'current', 'debit'],
    ['1100', 'Accounts Receivable', 'asset', 'current', 'debit'],
    ['1200', 'Food Inventory', 'asset', 'current', 'debit'],
    ['1210', 'Beverage Inventory', 'asset', 'current', 'debit'],
    ['1220', 'Supplies Inventory', 'asset', 'current', 'debit'],
    ['1300', 'Prepaid Expenses', 'asset', 'current', 'debit'],
    ['1500', 'Equipment', 'asset', 'fixed', 'debit'],
    ['1510', 'Furniture & Fixtures', 'asset', 'fixed', 'debit'],
    ['1520', 'Leasehold Improvements', 'asset', 'fixed', 'debit'],
    ['1600', 'Accumulated Depreciation', 'asset', 'contra', 'credit'],
    // Liabilities
    ['2000', 'Accounts Payable', 'liability', 'current', 'credit'],
    ['2100', 'Sales Tax Payable', 'liability', 'current', 'credit'],
    ['2200', 'Payroll Taxes Payable', 'liability', 'current', 'credit'],
    ['2210', 'Federal Tax Withholding', 'liability', 'current', 'credit'],
    ['2220', 'State Tax Withholding', 'liability', 'current', 'credit'],
    ['2230', 'Social Security Payable', 'liability', 'current', 'credit'],
    ['2240', 'Medicare Payable', 'liability', 'current', 'credit'],
    ['2300', 'Tips Payable', 'liability', 'current', 'credit'],
    ['2400', 'Accrued Wages', 'liability', 'current', 'credit'],
    ['2500', 'Customer Deposits', 'liability', 'current', 'credit'],
    ['2600', 'Gift Cards Outstanding', 'liability', 'current', 'credit'],
    ['2700', 'Line of Credit', 'liability', 'long_term', 'credit'],
    ['2800', 'Notes Payable', 'liability', 'long_term', 'credit'],
    // Equity
    ['3000', 'Owner\'s Equity', 'equity', 'equity', 'credit'],
    ['3100', 'Retained Earnings', 'equity', 'equity', 'credit'],
    ['3200', 'Owner\'s Draw', 'equity', 'equity', 'debit'],
    // Revenue
    ['4000', 'Food Sales', 'revenue', 'operating', 'credit'],
    ['4010', 'Beverage Sales', 'revenue', 'operating', 'credit'],
    ['4020', 'Alcohol Sales', 'revenue', 'operating', 'credit'],
    ['4100', 'Catering Revenue', 'revenue', 'operating', 'credit'],
    ['4200', 'Delivery Revenue', 'revenue', 'operating', 'credit'],
    ['4300', 'Gift Card Sales', 'revenue', 'operating', 'credit'],
    ['4400', 'Tips Revenue', 'revenue', 'operating', 'credit'],
    ['4500', 'Other Income', 'revenue', 'other', 'credit'],
    // COGS
    ['5000', 'Cost of Food', 'expense', 'cogs', 'debit'],
    ['5010', 'Cost of Beverages', 'expense', 'cogs', 'debit'],
    ['5020', 'Cost of Alcohol', 'expense', 'cogs', 'debit'],
    ['5100', 'Waste & Spoilage', 'expense', 'cogs', 'debit'],
    // Labor
    ['6000', 'Wages - FOH', 'expense', 'labor', 'debit'],
    ['6010', 'Wages - BOH', 'expense', 'labor', 'debit'],
    ['6020', 'Wages - Management', 'expense', 'labor', 'debit'],
    ['6100', 'Overtime Pay', 'expense', 'labor', 'debit'],
    ['6200', 'Employer Payroll Taxes', 'expense', 'labor', 'debit'],
    ['6300', 'Employee Benefits', 'expense', 'labor', 'debit'],
    ['6400', 'Workers Compensation', 'expense', 'labor', 'debit'],
    // Operating Expenses
    ['7000', 'Rent', 'expense', 'operating', 'debit'],
    ['7100', 'Utilities', 'expense', 'operating', 'debit'],
    ['7200', 'Insurance', 'expense', 'operating', 'debit'],
    ['7300', 'Marketing & Advertising', 'expense', 'operating', 'debit'],
    ['7400', 'Repairs & Maintenance', 'expense', 'operating', 'debit'],
    ['7500', 'Supplies (non-food)', 'expense', 'operating', 'debit'],
    ['7600', 'Licensing & Permits', 'expense', 'operating', 'debit'],
    ['7700', 'Credit Card Processing Fees', 'expense', 'operating', 'debit'],
    ['7800', 'Technology & Software', 'expense', 'operating', 'debit'],
    ['7900', 'Depreciation', 'expense', 'operating', 'debit'],
    ['8000', 'Professional Services', 'expense', 'operating', 'debit'],
    ['8100', 'Training & Development', 'expense', 'operating', 'debit'],
    ['8200', 'Miscellaneous Expense', 'expense', 'operating', 'debit'],
  ];
  for (const [num, name, type, sub, balance] of accounts) {
    insertAccount.run(num, name, type, sub, balance);
  }

  // Seed default tax rates
  const insertTax = db.prepare(`INSERT OR IGNORE INTO tax_rates (name, rate_type, rate, employer_match, effective_date, active) VALUES (?, ?, ?, ?, date('now'), 1)`);
  const taxRates = [
    ['Federal Income Tax', 'federal', 0.12, 0],
    ['State Income Tax', 'state', 0.05, 0],
    ['Social Security (FICA)', 'social_security', 0.062, 0.062],
    ['Medicare', 'medicare', 0.0145, 0.0145],
    ['Federal Unemployment (FUTA)', 'futa', 0.006, 0],
    ['State Unemployment (SUTA)', 'suta', 0.027, 0],
  ];
  for (const [name, type, rate, match] of taxRates) {
    insertTax.run(name, type, rate, match);
  }

  // Seed all 50 state tax profiles (restaurant/bar-focused)
  const insertStateProfile = db.prepare(`INSERT OR IGNORE INTO state_tax_profiles (state_code, state_name, base_sales_tax_rate, max_local_rate, avg_combined_rate, food_taxed, food_reduced_rate, alcohol_extra_rate, prepared_food_taxed, grocery_taxed, filing_frequencies, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const stateProfiles = [
    ['AL', 'Alabama',           0.04,   0.075, 0.0922, 1, null,  0,     1, 1, '["monthly"]', 'Prepared food taxed at full rate. Groceries taxed at reduced state rate in some counties.'],
    ['AK', 'Alaska',            0,      0.075, 0.0176, 0, null,  0,     0, 0, '["quarterly"]', 'No state sales tax. Some municipalities levy local sales tax.'],
    ['AZ', 'Arizona',           0.056,  0.058, 0.0840, 1, null,  0,     1, 0, '["monthly"]', 'Uses Transaction Privilege Tax (TPT). Prepared food taxable; groceries exempt.'],
    ['AR', 'Arkansas',          0.065,  0.0525,0.0947, 1, 0.005, 0,     1, 1, '["monthly"]', 'Groceries taxed at reduced 0.125%. Prepared food at full rate + local.'],
    ['CA', 'California',        0.0725, 0.035, 0.0868, 1, null,  0,     1, 0, '["monthly","quarterly"]', 'Prepared food taxable. Groceries exempt. Alcohol taxed at standard rate.'],
    ['CO', 'Colorado',          0.029,  0.083, 0.0777, 0, null,  0,     1, 0, '["monthly"]', 'Groceries exempt from state tax. Prepared food taxable. Complex local tax rules.'],
    ['CT', 'Connecticut',       0.0635, 0,     0.0635, 1, null,  0,     1, 0, '["monthly"]', 'Meals over $50 taxed at 7.35%. Standard meals at 6.35%. No local taxes.'],
    ['DE', 'Delaware',          0,      0,     0,      0, null,  0,     0, 0, '["monthly"]', 'No sales tax. Gross receipts tax applies to businesses instead.'],
    ['FL', 'Florida',           0.06,   0.025, 0.0701, 1, null,  0,     1, 0, '["monthly"]', 'Prepared food taxable. Groceries exempt. Discretionary surtax varies by county.'],
    ['GA', 'Georgia',           0.04,   0.05,  0.0732, 1, null,  0,     1, 0, '["monthly"]', 'Prepared food taxable. Groceries exempt from state but may have local tax.'],
    ['HI', 'Hawaii',            0.04,   0.005, 0.0444, 1, null,  0,     1, 1, '["monthly","quarterly"]', 'Uses General Excise Tax (GET). All food taxable. Rate is on gross income.'],
    ['ID', 'Idaho',             0.06,   0.03,  0.0602, 1, null,  0,     1, 1, '["monthly"]', 'All food including groceries taxable at full rate.'],
    ['IL', 'Illinois',          0.0625, 0.0475,0.0882, 1, 0.01,  0.0025,1, 0, '["monthly"]', 'Groceries at 1%. Prepared food at full rate. Chicago has additional taxes on restaurants.'],
    ['IN', 'Indiana',           0.07,   0,     0.07,   1, null,  0,     1, 0, '["monthly"]', 'Prepared food taxable. Groceries exempt. No local option sales tax.'],
    ['IA', 'Iowa',              0.06,   0.01,  0.0694, 1, null,  0,     1, 0, '["monthly","quarterly"]', 'Prepared food taxable. Groceries exempt from state tax.'],
    ['KS', 'Kansas',            0.065,  0.04,  0.0877, 1, null,  0,     1, 1, '["monthly"]', 'All food including groceries taxable. State reducing grocery rate to 0% by 2025.'],
    ['KY', 'Kentucky',          0.06,   0,     0.06,   1, null,  0,     1, 0, '["monthly"]', 'Restaurant meals taxed at 6%. Groceries exempt. No local sales taxes.'],
    ['LA', 'Louisiana',         0.0445, 0.07,  0.0956, 1, null,  0,     1, 0, '["monthly"]', 'Prepared food taxable at full combined rate. Groceries exempt from state.'],
    ['ME', 'Maine',             0.055,  0,     0.055,  1, null,  0,     1, 0, '["monthly"]', 'Prepared food at 8%. Groceries exempt. No local sales tax.'],
    ['MD', 'Maryland',          0.06,   0,     0.06,   1, null,  0.09,  1, 0, '["monthly"]', 'Meals taxed at 6%. Alcohol has separate 9% tax. Groceries exempt.'],
    ['MA', 'Massachusetts',     0.0625, 0,     0.0625, 1, null,  0,     1, 0, '["monthly"]', 'Meals taxed at 6.25%. Groceries exempt. Some cities add 0.75% local meals tax.'],
    ['MI', 'Michigan',          0.06,   0,     0.06,   1, null,  0,     1, 0, '["monthly"]', 'Prepared food taxable at 6%. Groceries exempt. No local sales taxes.'],
    ['MN', 'Minnesota',         0.06875,0.02,  0.0777, 1, null,  0.025, 1, 0, '["monthly"]', 'Prepared food taxable. Groceries exempt. Liquor has additional 2.5% tax.'],
    ['MS', 'Mississippi',       0.07,   0.0025,0.0707, 1, null,  0,     1, 1, '["monthly"]', 'All food taxable at 7%. Restaurants included. One of the highest food tax states.'],
    ['MO', 'Missouri',          0.04225,0.0563,0.0825, 1, 0.01225,0,    1, 0, '["monthly","quarterly"]', 'Groceries at reduced 1.225%. Prepared food at full rate.'],
    ['MT', 'Montana',           0,      0.03,  0,      0, null,  0,     0, 0, '["quarterly"]', 'No state sales tax. Some resort communities levy local tax up to 3%.'],
    ['NE', 'Nebraska',          0.055,  0.025, 0.0694, 1, null,  0,     1, 0, '["monthly","quarterly"]', 'Prepared food taxable. Groceries exempt from state tax.'],
    ['NV', 'Nevada',            0.0685, 0.0138,0.0823, 1, null,  0,     1, 0, '["monthly"]', 'Prepared food taxable. Groceries exempt. No separate alcohol sales tax.'],
    ['NH', 'New Hampshire',     0,      0,     0,      0, null,  0,     0, 0, '["monthly"]', 'No sales tax. Meals & rooms tax of 8.5% applies to restaurant food.'],
    ['NJ', 'New Jersey',        0.06625,0,     0.06625,0, null,  0,     1, 0, '["monthly","quarterly"]', 'Prepared food taxable. Groceries exempt. No local sales taxes.'],
    ['NM', 'New Mexico',        0.05125,0.0481,0.0783, 1, null,  0,     1, 1, '["monthly"]', 'Uses Gross Receipts Tax. All food including groceries taxable.'],
    ['NY', 'New York',          0.04,   0.045, 0.0852, 0, null,  0,     1, 0, '["monthly","quarterly"]', 'Prepared food taxable. Groceries exempt. NYC adds 4.5% city tax.'],
    ['NC', 'North Carolina',    0.0475, 0.0275,0.0696, 1, null,  0,     1, 0, '["monthly"]', 'Prepared food taxable at full rate. Groceries at 2%. Local taxes apply.'],
    ['ND', 'North Dakota',      0.05,   0.035, 0.0696, 1, null,  0,     1, 0, '["monthly","quarterly"]', 'Prepared food taxable. Groceries exempt from state tax.'],
    ['OH', 'Ohio',              0.0575, 0.0225,0.0724, 1, null,  0,     1, 0, '["monthly"]', 'Prepared food taxable. Groceries exempt. County permissive taxes apply.'],
    ['OK', 'Oklahoma',          0.045,  0.07,  0.0895, 1, null,  0,     1, 1, '["monthly"]', 'All food including groceries taxable at full state+local rate.'],
    ['OR', 'Oregon',            0,      0,     0,      0, null,  0,     0, 0, '["quarterly"]', 'No state or local sales tax. Some cities have small business taxes.'],
    ['PA', 'Pennsylvania',      0.06,   0.02,  0.0634, 0, null,  0,     1, 0, '["monthly"]', 'Prepared food taxable. Groceries exempt. Philadelphia adds 2% local tax.'],
    ['RI', 'Rhode Island',      0.07,   0,     0.07,   1, null,  0.01,  1, 0, '["monthly"]', 'Meals taxed at 8% (7% state + 1% meals tax). Groceries exempt.'],
    ['SC', 'South Carolina',    0.06,   0.03,  0.0746, 1, null,  0,     1, 0, '["monthly"]', 'Prepared food taxable. Groceries exempt from state. Local taxes apply.'],
    ['SD', 'South Dakota',      0.042,  0.04,  0.0640, 1, null,  0,     1, 1, '["monthly","quarterly"]', 'All food including groceries taxable at full rate.'],
    ['TN', 'Tennessee',         0.07,   0.0275,0.0755, 1, 0.04,  0,     1, 1, '["monthly"]', 'Groceries at reduced 4%. Prepared food at full 7%+ rate.'],
    ['TX', 'Texas',             0.0625, 0.02,  0.0819, 1, null,  0,     1, 0, '["monthly","quarterly"]', 'Prepared food taxable. Groceries exempt. Mixed beverage tax of 6.7% on alcohol.'],
    ['UT', 'Utah',              0.0485, 0.0395,0.0726, 1, 0.03,  0,     1, 1, '["monthly","quarterly"]', 'Groceries at reduced 3%. Prepared food at full rate. Restaurant tax applies.'],
    ['VT', 'Vermont',           0.06,   0.01,  0.0634, 1, null,  0.10,  1, 0, '["monthly","quarterly"]', 'Prepared food at 9% (meals tax). Groceries exempt. Alcohol 10% tax.'],
    ['VA', 'Virginia',          0.043,  0.017, 0.0575, 1, 0.025, 0,     1, 0, '["monthly"]', 'Groceries at reduced 2.5%. Prepared food at full rate. Some areas add food tax.'],
    ['WA', 'Washington',        0.065,  0.04,  0.1029, 1, null,  0,     1, 0, '["monthly"]', 'Prepared food taxable. Groceries exempt. High combined rates in Seattle area.'],
    ['WV', 'West Virginia',     0.06,   0.01,  0.0651, 1, null,  0,     1, 0, '["monthly"]', 'Prepared food taxable at 6%. Groceries exempt from state. Local can add 1%.'],
    ['WI', 'Wisconsin',         0.05,   0.0175,0.0543, 1, null,  0,     1, 0, '["monthly","quarterly"]', 'Prepared food taxable. Groceries exempt. County tax up to 0.5%.'],
    ['WY', 'Wyoming',           0.04,   0.02,  0.0536, 1, null,  0,     1, 0, '["monthly","quarterly"]', 'Prepared food taxable. Groceries exempt from state tax.'],
    ['DC', 'District of Columbia',0.06, 0,     0.10,   1, null,  0.10,  1, 0, '["monthly"]', 'Restaurant meals taxed at 10%. Groceries exempt. Alcohol at 10%.'],
  ];
  for (const [code, name, rate, maxLocal, avgCombined, foodTaxed, foodReduced, alcoholExtra, prepFood, grocery, freq, notes] of stateProfiles) {
    insertStateProfile.run(code, name, rate, maxLocal, avgCombined, foodTaxed, foodReduced, alcoholExtra, prepFood, grocery, freq, notes);
  }

  // Seed filing deadline templates (general deadlines by frequency)
  const insertDeadline = db.prepare(`INSERT OR IGNORE INTO sales_tax_filing_deadlines (state_code, frequency, month, day_of_month, description) VALUES (?, ?, ?, ?, ?)`);
  // Monthly filers: generally due 20th of the following month
  for (const [code] of stateProfiles) {
    if (code === 'AK' || code === 'DE' || code === 'MT' || code === 'NH' || code === 'OR') continue;
    for (let m = 1; m <= 12; m++) {
      insertDeadline.run(code, 'monthly', m, 20, `Monthly sales tax return - ${code}`);
    }
  }
  // Quarterly filers: due 20th of month after quarter ends
  const qMonths = [4, 7, 10, 1];
  const qDesc = ['Q1 (Jan-Mar)', 'Q2 (Apr-Jun)', 'Q3 (Jul-Sep)', 'Q4 (Oct-Dec)'];
  for (const [code] of stateProfiles) {
    if (code === 'DE' || code === 'NH' || code === 'OR') continue;
    for (let q = 0; q < 4; q++) {
      insertDeadline.run(code, 'quarterly', qMonths[q], 20, `Quarterly sales tax return ${qDesc[q]} - ${code}`);
    }
  }

  // Seed default primary location
  db.prepare(`INSERT OR IGNORE INTO locations (id, name, code, is_primary, status) VALUES (1, ?, 'HQ', 1, 'active')`).run(process.env.RESTAURANT_NAME || 'VenueCore Bar & Grill');

  console.log('[DB] Schema initialized');
}

module.exports = { initializeSchema };
