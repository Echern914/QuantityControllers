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
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (approved_by) REFERENCES employees(id),
      FOREIGN KEY (rejected_by) REFERENCES employees(id),
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)
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
      FOREIGN KEY (employee_id) REFERENCES employees(id)
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
      FOREIGN KEY (closed_by) REFERENCES employees(id)
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
      FOREIGN KEY (parent_id) REFERENCES chart_of_accounts(id)
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
      FOREIGN KEY (fiscal_period_id) REFERENCES fiscal_periods(id),
      FOREIGN KEY (approved_by) REFERENCES employees(id),
      FOREIGN KEY (posted_by) REFERENCES employees(id),
      FOREIGN KEY (created_by) REFERENCES employees(id),
      FOREIGN KEY (reversal_of) REFERENCES journal_entries(id)
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
      FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
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
      FOREIGN KEY (fiscal_period_id) REFERENCES fiscal_periods(id),
      FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
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
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
      FOREIGN KEY (approved_by) REFERENCES employees(id),
      FOREIGN KEY (gl_account_id) REFERENCES chart_of_accounts(id),
      FOREIGN KEY (created_by) REFERENCES employees(id)
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
      FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id),
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
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
      FOREIGN KEY (invoice_id) REFERENCES ap_invoices(id),
      FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id),
      FOREIGN KEY (created_by) REFERENCES employees(id)
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
      FOREIGN KEY (gl_account_id) REFERENCES chart_of_accounts(id)
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
      FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id)
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
      FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id),
      FOREIGN KEY (completed_by) REFERENCES employees(id)
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
      FOREIGN KEY (approved_by) REFERENCES employees(id),
      FOREIGN KEY (processed_by) REFERENCES employees(id)
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
      FOREIGN KEY (employee_id) REFERENCES employees(id)
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
      FOREIGN KEY (created_by) REFERENCES employees(id)
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
      FOREIGN KEY (employee_id) REFERENCES employees(id)
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
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      FOREIGN KEY (verified_by) REFERENCES employees(id)
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
      FOREIGN KEY (manager_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS location_employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      role TEXT DEFAULT 'staff',
      is_primary INTEGER DEFAULT 1,
      start_date DATE,
      end_date DATE,
      FOREIGN KEY (location_id) REFERENCES locations(id),
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      UNIQUE(location_id, employee_id)
    );

    CREATE TABLE IF NOT EXISTS location_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      ingredient_id INTEGER NOT NULL,
      par_level REAL DEFAULT 0,
      current_stock REAL DEFAULT 0,
      last_count_date DATE,
      FOREIGN KEY (location_id) REFERENCES locations(id),
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
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
      FOREIGN KEY (from_location_id) REFERENCES locations(id),
      FOREIGN KEY (to_location_id) REFERENCES locations(id),
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
      FOREIGN KEY (requested_by) REFERENCES employees(id),
      FOREIGN KEY (approved_by) REFERENCES employees(id)
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
      FOREIGN KEY (created_by) REFERENCES employees(id)
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
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      FOREIGN KEY (course_id) REFERENCES training_courses(id),
      FOREIGN KEY (current_lesson_id) REFERENCES training_lessons(id),
      FOREIGN KEY (assigned_by) REFERENCES employees(id)
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
      FOREIGN KEY (lesson_id) REFERENCES training_lessons(id)
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
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      FOREIGN KEY (course_id) REFERENCES training_courses(id)
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
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (created_by) REFERENCES employees(id)
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
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
      FOREIGN KEY (package_id) REFERENCES catering_packages(id)
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
      FOREIGN KEY (employee_id) REFERENCES employees(id)
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
      FOREIGN KEY (created_by) REFERENCES employees(id)
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
      FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns(id)
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
      FOREIGN KEY (promotion_id) REFERENCES promotions(id),
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
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
      FOREIGN KEY (customer_id) REFERENCES customers(id)
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
      FOREIGN KEY (merchant_id) REFERENCES clover_merchants(merchant_id)
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
      FOREIGN KEY (merchant_id) REFERENCES clover_merchants(merchant_id)
    );

    CREATE INDEX IF NOT EXISTS idx_clover_webhooks_merchant ON clover_webhooks(merchant_id);

    CREATE TABLE IF NOT EXISTS clover_id_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      local_id INTEGER NOT NULL,
      clover_id TEXT NOT NULL,
      last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (merchant_id) REFERENCES clover_merchants(merchant_id),
      UNIQUE(merchant_id, entity_type, local_id),
      UNIQUE(merchant_id, entity_type, clover_id)
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
      FOREIGN KEY (acknowledged_by) REFERENCES employees(id)
    );
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

  // Seed default primary location
  db.prepare(`INSERT OR IGNORE INTO locations (id, name, code, is_primary, status) VALUES (1, ?, 'HQ', 1, 'active')`).run(process.env.RESTAURANT_NAME || 'VenueCore Bar & Grill');

  console.log('[DB] Schema initialized');
}

module.exports = { initializeSchema };
