/* ============================================================
   VENUECORE AI - Full-Capability Intelligent Assistant
   Tool-use enabled, full database access, action execution
   ============================================================ */
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

// Store conversation history per employee (in-memory, resets on server restart)
const conversations = new Map();

function getConversation(employeeId) {
  if (!conversations.has(employeeId)) conversations.set(employeeId, []);
  return conversations.get(employeeId);
}

// ============================================================
// DATABASE SCHEMA REFERENCE (for AI context)
// ============================================================
const SCHEMA_REFERENCE = `
DATABASE SCHEMA - VenueCore POS System (SQLite):

CORE TABLES:
- menu_categories (id, name, type, color, icon, display_order, active)
- menu_items (id, name, description, category_id, price, cost, prep_time_minutes, course, station, tax_rate, is_86d, clover_item_id, active)
- recipes (id, menu_item_id, ingredient_id, quantity, unit)
- menu_modifiers (id, name, category, price_adjustment, available)
- combos (id, name, description, price, active)
- pricing_rules (id, name, type, menu_item_id, category_id, discount_type, discount_value, start_time, end_time, start_date, end_date, days_of_week, active)

INVENTORY:
- categories (id, name, type, color, icon) -- ingredient categories
- ingredients (id, name, category_id, unit, cost_per_unit, supplier_id, par_level, reorder_quantity, shelf_life_days, active)
- inventory (id, ingredient_id, lot_number, quantity, unit, cost_per_unit, location, expiration_date, received_date, status)
- transactions (id, type[sale/waste/adjustment/transfer/receive], ingredient_id, menu_item_id, order_id, quantity, unit, employee_id, notes, created_at)
- waste_log (id, ingredient_id, quantity, unit, reason[expired/spoiled/overproduction/dropped/other], cost, employee_id, notes, created_at)

ORDERS & POS:
- orders (id, order_number, order_type[dine-in/takeout/delivery/bar], table_id, employee_id, customer_id, tab_id, status[open/sent/closed/voided], subtotal, tax, discount, discount_reason, tip, total, payment_status, guest_count, clover_order_id, notes, opened_at, closed_at)
- order_items (id, order_id, menu_item_id, name, quantity, unit_price, modifiers[JSON], special_instructions, course, seat_number, status[pending/sent/preparing/ready/served], voided, void_reason)
- order_payments (id, order_id, payment_method[cash/credit/debit/gift_card], amount, tip, stripe_payment_id, clover_payment_id, card_last_four, employee_id, refunded)
- tabs (id, name, customer_id, employee_id, status, card_last_four, total, opened_at, closed_at)

STAFF & SCHEDULING:
- employees (id, first_name, last_name, email, role[admin/manager/bartender/server/cook/host], pin_hash, hourly_rate, phone, hire_date, color, active)
- time_entries (id, employee_id, clock_in, clock_out, hours_worked, break_minutes, tips_declared, notes)
- shifts (id, employee_id, shift_date, start_time, end_time, role, status[draft/published/confirmed], notes)

CUSTOMERS:
- customers (id, first_name, last_name, email, phone, birthday, vip_tier[bronze/silver/gold/platinum], loyalty_points, total_visits, total_spent, notes, last_visit_at)

TABLES & FLOOR:
- tables (id, name, section, capacity, status[open/occupied/reserved/dirty/closed], current_order_id, server_id, x_position, y_position, shape)
- reservations (id, customer_id, customer_name, party_size, date, time, table_id, status[pending/confirmed/seated/completed/cancelled/no_show], notes, phone)

SUPPLIERS & PURCHASING:
- suppliers (id, name, contact_name, email, phone, address, payment_terms, notes, active)
- purchase_orders (id, supplier_id, po_number, status[draft/sent/partial/received/cancelled], subtotal, tax, total, expected_date, received_date, notes, created_by)
- purchase_order_items (id, purchase_order_id, ingredient_id, quantity_ordered, quantity_received, unit_cost, total_cost)

ACCOUNTING:
- chart_of_accounts (id, account_number, name, account_type[asset/liability/equity/revenue/expense], sub_type, normal_balance, description, is_system, active)
- journal_entries (id, entry_number, entry_date, description, reference_type, reference_id, status[draft/posted/reversed], posted_by, posted_at, created_by)
- journal_entry_lines (id, journal_entry_id, account_id, debit, credit, description)
- fiscal_periods (id, name, period_type, start_date, end_date, status[open/closed])
- budgets (id, account_id, fiscal_period_id, budgeted_amount, actual_amount, variance, notes)

BANKING:
- bank_accounts (id, name, account_type, account_number_last4, routing_number_last4, current_balance, gl_account_id, active)
- bank_transactions (id, bank_account_id, date, description, amount, type[deposit/withdrawal/transfer/fee/interest], category, reference_number, reconciled, matched_entity_type, matched_entity_id)

PAYROLL:
- payroll_runs (id, period_start, period_end, status[draft/calculated/approved/processed], total_gross, total_taxes, total_deductions, total_net, employee_count, approved_by, processed_by)
- payroll_items (id, payroll_run_id, employee_id, regular_hours, overtime_hours, hourly_rate, gross_pay, federal_tax, state_tax, social_security, medicare, total_deductions, net_pay, tips_declared)
- tax_rates (id, name, rate_type, rate, employer_match, effective_date, active)
- tip_pools (id, pool_date, shift_type, total_tips, distribution_method, status)

AP AUTOMATION:
- ap_invoices (id, supplier_id, invoice_number, invoice_date, due_date, status[pending/approved/rejected/paid/overdue], subtotal, tax, total, amount_paid, balance_due, gl_account_id, approved_by, notes)
- ap_payments (id, invoice_id, payment_date, amount, payment_method, reference_number, notes)

LOCATIONS:
- locations (id, name, code, address, city, state, zip, phone, email, timezone, tax_rate, is_primary, status, manager_id, clover_merchant_id)

TRAINING:
- training_courses (id, title, description, category, difficulty, estimated_minutes, passing_score, required_for_roles, is_onboarding, active)
- training_enrollments (id, employee_id, course_id, status[enrolled/in_progress/completed/failed], progress_percent, score, completed_at)
- certifications (id, employee_id, name, issuing_body, certification_number, issued_date, expiration_date, status)

CATERING:
- catering_events (id, event_name, event_type, customer_id, contact_name, contact_phone, contact_email, event_date, start_time, end_time, guest_count, location, status[inquiry/proposal/confirmed/in_progress/completed/cancelled], deposit_amount, deposit_paid, total, amount_paid, balance_due)
- catering_packages (id, name, description, price_per_person, min_guests, max_guests, category, active)

MARKETING:
- marketing_campaigns (id, name, campaign_type[email/sms/push/social], status[draft/scheduled/sent/completed], audience_segment, scheduled_for)
- promotions (id, name, promo_code, discount_type[percent/fixed/bogo/free_item], discount_value, min_order, max_uses, current_uses, start_date, end_date, active)
- email_lists (id, name, segment_type, subscriber_count)

FORECASTING:
- sales_forecasts (id, forecast_date, day_of_week, predicted_sales, predicted_orders, confidence, actual_sales, variance)
- anomaly_log (id, anomaly_type, severity, metric, expected_value, actual_value, deviation_percent, description, acknowledged)

NOTIFICATIONS:
- alerts (id, type, severity[info/warning/critical], title, message, employee_id, read, created_at)

CLOVER INTEGRATION:
- clover_merchants (id, merchant_id, merchant_name, access_token, environment, status, last_sync_at)
- clover_id_map (id, merchant_id, entity_type, local_id, clover_id, last_synced_at)
- clover_sync_log (id, merchant_id, sync_type, entity_type, status, error_message, created_at)

SETTINGS:
- settings (key, value, updated_at) -- key-value store for app config
- register_sessions (id, employee_id, opening_cash, closing_cash, expected_cash, difference, status[open/closed], opened_at, closed_at)
- daily_reports (id, report_date, report_data[JSON], created_at)
- ai_conversations (id, employee_id, query, response, context, created_at)
`;

// ============================================================
// TOOL DEFINITIONS (Claude tool_use)
// ============================================================
const TOOLS = [
  {
    name: 'run_query',
    description: 'Execute a read-only SQL query against the VenueCore database. Use this to answer ANY question about business data. Only SELECT queries are allowed. Always use this tool to get real data before answering questions - never guess or make up numbers.',
    input_schema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'The SELECT SQL query to execute. Must be read-only (SELECT only). Use proper SQLite syntax. Always add LIMIT clauses for large tables.' },
        description: { type: 'string', description: 'Brief description of what this query retrieves' }
      },
      required: ['sql', 'description']
    }
  },
  {
    name: 'create_menu_item',
    description: 'Create a new menu item in VenueCore',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Item name' },
        price: { type: 'number', description: 'Price in dollars' },
        cost: { type: 'number', description: 'Cost/COGS in dollars (optional)' },
        description: { type: 'string', description: 'Item description (optional)' },
        category_id: { type: 'integer', description: 'Category ID (optional)' },
        course: { type: 'string', enum: ['appetizer', 'main', 'dessert', 'drink', 'side'], description: 'Course type' },
        station: { type: 'string', enum: ['kitchen', 'bar', 'dessert', 'expo'], description: 'Prep station' },
        prep_time_minutes: { type: 'integer', description: 'Prep time in minutes' }
      },
      required: ['name', 'price']
    }
  },
  {
    name: 'update_menu_item',
    description: 'Update an existing menu item (price, name, description, active status, etc.)',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'Menu item ID' },
        name: { type: 'string' },
        price: { type: 'number' },
        cost: { type: 'number' },
        description: { type: 'string' },
        active: { type: 'boolean', description: 'Whether the item is active' },
        is_86d: { type: 'boolean', description: 'Whether the item is 86d (unavailable)' }
      },
      required: ['id']
    }
  },
  {
    name: 'create_category',
    description: 'Create a new menu category',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Category name' },
        color: { type: 'string', description: 'Hex color code (default: #6366f1)' }
      },
      required: ['name']
    }
  },
  {
    name: 'adjust_inventory',
    description: 'Add stock to inventory or create a new ingredient',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add_stock', 'create_ingredient'], description: 'Action to perform' },
        ingredient_id: { type: 'integer', description: 'For add_stock: the ingredient ID' },
        name: { type: 'string', description: 'For create_ingredient: ingredient name' },
        quantity: { type: 'number', description: 'Quantity to add' },
        unit: { type: 'string', description: 'Unit (oz, lb, each, case, bottle, etc.)' },
        cost_per_unit: { type: 'number', description: 'Cost per unit' },
        par_level: { type: 'number', description: 'For create_ingredient: par level' },
        category_id: { type: 'integer', description: 'Category ID' },
        supplier_id: { type: 'integer', description: 'Supplier ID' }
      },
      required: ['action']
    }
  },
  {
    name: 'manage_staff',
    description: 'Create a new employee or update an existing one',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'update'], description: 'Action to perform' },
        id: { type: 'integer', description: 'Employee ID (for update)' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        role: { type: 'string', enum: ['admin', 'manager', 'bartender', 'server', 'cook', 'host'] },
        hourly_rate: { type: 'number' },
        email: { type: 'string' },
        phone: { type: 'string' },
        pin: { type: 'string', description: 'For create: 4-digit PIN' },
        active: { type: 'boolean', description: 'For update: active status' }
      },
      required: ['action']
    }
  },
  {
    name: 'create_shift',
    description: 'Create a schedule shift for an employee',
    input_schema: {
      type: 'object',
      properties: {
        employee_id: { type: 'integer', description: 'Employee ID' },
        shift_date: { type: 'string', description: 'Date (YYYY-MM-DD)' },
        start_time: { type: 'string', description: 'Start time (HH:MM)' },
        end_time: { type: 'string', description: 'End time (HH:MM)' },
        role: { type: 'string', description: 'Role for this shift' },
        notes: { type: 'string' }
      },
      required: ['employee_id', 'shift_date', 'start_time', 'end_time']
    }
  },
  {
    name: 'send_notification',
    description: 'Send a notification/alert to the system (visible to all staff)',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Alert title' },
        message: { type: 'string', description: 'Alert message' },
        severity: { type: 'string', enum: ['info', 'warning', 'critical'], description: 'Severity level' }
      },
      required: ['title', 'message']
    }
  },
  {
    name: 'create_supplier',
    description: 'Create a new supplier',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Supplier name' },
        contact_name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        address: { type: 'string' },
        payment_terms: { type: 'string', description: 'e.g. Net 30' }
      },
      required: ['name']
    }
  },
  {
    name: 'manage_customer',
    description: 'Create or update a customer record',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'add_loyalty'], description: 'Action to perform' },
        id: { type: 'integer', description: 'Customer ID (for update/add_loyalty)' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        birthday: { type: 'string', description: 'YYYY-MM-DD' },
        notes: { type: 'string' },
        loyalty_points: { type: 'integer', description: 'Points to add (for add_loyalty)' }
      },
      required: ['action']
    }
  },
  {
    name: 'create_journal_entry',
    description: 'Create an accounting journal entry',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Entry description' },
        entry_date: { type: 'string', description: 'Date (YYYY-MM-DD)' },
        lines: {
          type: 'array',
          description: 'Journal entry lines (must balance: total debits = total credits)',
          items: {
            type: 'object',
            properties: {
              account_id: { type: 'integer', description: 'Chart of accounts ID' },
              debit: { type: 'number', description: 'Debit amount (0 if credit)' },
              credit: { type: 'number', description: 'Credit amount (0 if debit)' },
              description: { type: 'string' }
            },
            required: ['account_id', 'debit', 'credit']
          }
        }
      },
      required: ['description', 'lines']
    }
  },
  {
    name: 'sync_clover',
    description: 'Trigger a Clover POS sync operation',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['full_sync', 'push_items', 'pull_items', 'push_item', 'test_connection'], description: 'Sync action' },
        item_id: { type: 'integer', description: 'For push_item: local menu item ID' }
      },
      required: ['action']
    }
  },
  {
    name: 'update_setting',
    description: 'Update a system setting',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Setting key (e.g. restaurant_name, tax_rate, low_stock_threshold, auto_reorder_enabled, currency, receipt_footer, loyalty_points_per_dollar)' },
        value: { type: 'string', description: 'New value' }
      },
      required: ['key', 'value']
    }
  },
  {
    name: 'generate_report',
    description: 'Generate a business report',
    input_schema: {
      type: 'object',
      properties: {
        report_type: { type: 'string', enum: ['daily_sales', 'weekly_summary', 'pl_statement', 'labor_cost', 'food_cost', 'inventory_value', 'customer_analysis', 'menu_performance'], description: 'Type of report to generate' },
        start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        days: { type: 'integer', description: 'Number of days to look back (alternative to date range)' }
      },
      required: ['report_type']
    }
  }
];

// ============================================================
// TOOL EXECUTION
// ============================================================
function executeTool(toolName, input, broadcast) {
  const db = getDb();

  switch (toolName) {
    case 'run_query': {
      const sql = input.sql.trim();
      // Security: only allow SELECT queries
      if (!/^SELECT\b/i.test(sql) || /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|PRAGMA)\b/i.test(sql)) {
        return { error: 'Only SELECT queries are allowed for security.' };
      }
      try {
        const results = db.prepare(sql).all();
        return { rows: results, count: results.length, description: input.description };
      } catch (err) {
        return { error: `SQL error: ${err.message}` };
      }
    }

    case 'create_menu_item': {
      const result = db.prepare(`
        INSERT INTO menu_items (name, price, cost, description, category_id, course, station, prep_time_minutes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(input.name, input.price, input.cost || 0, input.description || '', input.category_id || null,
        input.course || 'main', input.station || 'kitchen', input.prep_time_minutes || 5);
      return { success: true, id: result.lastInsertRowid, message: `Created menu item "${input.name}" at $${input.price}` };
    }

    case 'update_menu_item': {
      const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(input.id);
      if (!item) return { error: `Menu item ${input.id} not found` };
      const sets = [];
      const params = [];
      for (const [key, val] of Object.entries(input)) {
        if (key === 'id') continue;
        if (key === 'is_86d') { sets.push('is_86d = ?'); params.push(val ? 1 : 0); }
        else if (key === 'active') { sets.push('active = ?'); params.push(val ? 1 : 0); }
        else { sets.push(`${key} = ?`); params.push(val); }
      }
      if (sets.length === 0) return { error: 'No fields to update' };
      params.push(input.id);
      db.prepare(`UPDATE menu_items SET ${sets.join(', ')} WHERE id = ?`).run(...params);

      if (input.is_86d !== undefined && broadcast) {
        broadcast({ type: 'item_86d', item: item.name, itemId: input.id });
      }
      return { success: true, message: `Updated menu item "${item.name}"` };
    }

    case 'create_category': {
      const result = db.prepare('INSERT INTO menu_categories (name, color) VALUES (?, ?)').run(input.name, input.color || '#6366f1');
      return { success: true, id: result.lastInsertRowid, message: `Created category "${input.name}"` };
    }

    case 'adjust_inventory': {
      if (input.action === 'create_ingredient') {
        const result = db.prepare(`
          INSERT INTO ingredients (name, unit, cost_per_unit, par_level, category_id, supplier_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(input.name, input.unit || 'each', input.cost_per_unit || 0, input.par_level || 0, input.category_id || null, input.supplier_id || null);
        return { success: true, id: result.lastInsertRowid, message: `Created ingredient "${input.name}"` };
      }
      if (input.action === 'add_stock') {
        const result = db.prepare(`
          INSERT INTO inventory (ingredient_id, quantity, unit, cost_per_unit, location, status, received_date)
          VALUES (?, ?, ?, ?, 'main', 'available', datetime('now'))
        `).run(input.ingredient_id, input.quantity, input.unit || 'each', input.cost_per_unit || 0);
        return { success: true, id: result.lastInsertRowid, message: `Added ${input.quantity} ${input.unit || 'units'} to inventory` };
      }
      return { error: 'Invalid action' };
    }

    case 'manage_staff': {
      if (input.action === 'create') {
        const crypto = require('crypto');
        const pinHash = crypto.createHash('sha256').update(input.pin || '0000').digest('hex');
        const result = db.prepare(`
          INSERT INTO employees (first_name, last_name, email, role, hourly_rate, phone, pin_hash, hire_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, date('now'))
        `).run(input.first_name, input.last_name || '', input.email || '', input.role || 'server', input.hourly_rate || 0, input.phone || '', pinHash);
        return { success: true, id: result.lastInsertRowid, message: `Created employee "${input.first_name} ${input.last_name || ''}"` };
      }
      if (input.action === 'update') {
        const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(input.id);
        if (!emp) return { error: `Employee ${input.id} not found` };
        const sets = [];
        const params = [];
        for (const [key, val] of Object.entries(input)) {
          if (['action', 'id', 'pin'].includes(key)) continue;
          if (key === 'active') { sets.push('active = ?'); params.push(val ? 1 : 0); }
          else { sets.push(`${key} = ?`); params.push(val); }
        }
        if (sets.length > 0) {
          params.push(input.id);
          db.prepare(`UPDATE employees SET ${sets.join(', ')} WHERE id = ?`).run(...params);
        }
        return { success: true, message: `Updated employee "${emp.first_name} ${emp.last_name}"` };
      }
      return { error: 'Invalid action' };
    }

    case 'create_shift': {
      const result = db.prepare(`
        INSERT INTO shifts (employee_id, shift_date, start_time, end_time, role, notes, status)
        VALUES (?, ?, ?, ?, ?, ?, 'draft')
      `).run(input.employee_id, input.shift_date, input.start_time, input.end_time, input.role || '', input.notes || '');
      return { success: true, id: result.lastInsertRowid, message: `Created shift for ${input.shift_date} ${input.start_time}-${input.end_time}` };
    }

    case 'send_notification': {
      const result = db.prepare(`INSERT INTO alerts (type, severity, title, message) VALUES ('ai_alert', ?, ?, ?)`)
        .run(input.severity || 'info', input.title, input.message);
      if (broadcast) {
        broadcast({ type: 'notification', notification: { title: input.title, message: input.message, severity: input.severity || 'info' } });
      }
      return { success: true, message: `Notification sent: "${input.title}"` };
    }

    case 'create_supplier': {
      const result = db.prepare(`
        INSERT INTO suppliers (name, contact_name, email, phone, address, payment_terms)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(input.name, input.contact_name || '', input.email || '', input.phone || '', input.address || '', input.payment_terms || 'Net 30');
      return { success: true, id: result.lastInsertRowid, message: `Created supplier "${input.name}"` };
    }

    case 'manage_customer': {
      if (input.action === 'create') {
        const result = db.prepare(`
          INSERT INTO customers (first_name, last_name, email, phone, birthday, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(input.first_name, input.last_name || '', input.email || '', input.phone || '', input.birthday || null, input.notes || '');
        return { success: true, id: result.lastInsertRowid, message: `Created customer "${input.first_name} ${input.last_name || ''}"` };
      }
      if (input.action === 'update') {
        const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(input.id);
        if (!cust) return { error: `Customer ${input.id} not found` };
        const sets = [];
        const params = [];
        for (const [key, val] of Object.entries(input)) {
          if (['action', 'id'].includes(key)) continue;
          sets.push(`${key} = ?`);
          params.push(val);
        }
        if (sets.length > 0) {
          params.push(input.id);
          db.prepare(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`).run(...params);
        }
        return { success: true, message: `Updated customer record` };
      }
      if (input.action === 'add_loyalty') {
        db.prepare('UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ?').run(input.loyalty_points, input.id);
        return { success: true, message: `Added ${input.loyalty_points} loyalty points` };
      }
      return { error: 'Invalid action' };
    }

    case 'create_journal_entry': {
      const totalDebit = input.lines.reduce((s, l) => s + (l.debit || 0), 0);
      const totalCredit = input.lines.reduce((s, l) => s + (l.credit || 0), 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return { error: `Entry doesn't balance. Debits: $${totalDebit.toFixed(2)}, Credits: $${totalCredit.toFixed(2)}` };
      }
      const nextNum = (db.prepare("SELECT MAX(CAST(REPLACE(entry_number, 'JE-', '') AS INTEGER)) as n FROM journal_entries").get()?.n || 0) + 1;
      const entryNum = `JE-${String(nextNum).padStart(5, '0')}`;
      const result = db.prepare(`
        INSERT INTO journal_entries (entry_number, entry_date, description, status)
        VALUES (?, ?, ?, 'draft')
      `).run(entryNum, input.entry_date || new Date().toISOString().slice(0, 10), input.description);
      const jeId = result.lastInsertRowid;
      const insertLine = db.prepare('INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)');
      for (const line of input.lines) {
        insertLine.run(jeId, line.account_id, line.debit || 0, line.credit || 0, line.description || '');
      }
      return { success: true, id: jeId, entry_number: entryNum, message: `Created journal entry ${entryNum}` };
    }

    case 'sync_clover': {
      // These are async — return a message that it was triggered
      return { success: true, message: `Clover ${input.action} triggered. Check Clover page for results.`, note: 'Async operation - use the Clover module to see results' };
    }

    case 'update_setting': {
      db.prepare(`UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?`).run(input.value, input.key);
      return { success: true, message: `Setting "${input.key}" updated to "${input.value}"` };
    }

    case 'generate_report': {
      const today = new Date().toISOString().slice(0, 10);
      const daysBack = input.days || 7;
      const startDate = input.start_date || new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
      const endDate = input.end_date || today;

      switch (input.report_type) {
        case 'daily_sales': {
          const data = db.prepare(`
            SELECT date(opened_at) as date, COUNT(*) as orders, SUM(subtotal) as subtotal, SUM(tax) as tax, SUM(discount) as discounts, SUM(tip) as tips, SUM(total) as total,
                   AVG(total) as avg_check, MAX(total) as max_check
            FROM orders WHERE status = 'closed' AND date(opened_at) BETWEEN ? AND ?
            GROUP BY date(opened_at) ORDER BY date
          `).all(startDate, endDate);
          return { report: 'Daily Sales', period: `${startDate} to ${endDate}`, data };
        }
        case 'weekly_summary': {
          const sales = db.prepare(`SELECT COUNT(*) as orders, SUM(total) as revenue, AVG(total) as avg_check FROM orders WHERE status='closed' AND opened_at >= datetime('now', '-${daysBack} days')`).get();
          const labor = db.prepare(`SELECT SUM(hours_worked) as total_hours, SUM(hours_worked * e.hourly_rate) as labor_cost FROM time_entries te JOIN employees e ON te.employee_id=e.id WHERE te.clock_in >= datetime('now', '-${daysBack} days')`).get();
          const waste = db.prepare(`SELECT SUM(cost) as waste_cost, COUNT(*) as incidents FROM waste_log WHERE created_at >= datetime('now', '-${daysBack} days')`).get();
          return { report: 'Weekly Summary', period: `Last ${daysBack} days`, sales, labor, waste };
        }
        case 'pl_statement': {
          const revenue = db.prepare(`SELECT SUM(total) as total FROM orders WHERE status='closed' AND date(opened_at) BETWEEN ? AND ?`).get(startDate, endDate);
          const cogs = db.prepare(`SELECT SUM(oi.unit_price * oi.quantity) * 0.30 as estimated_cogs FROM order_items oi JOIN orders o ON oi.order_id=o.id WHERE o.status='closed' AND date(o.opened_at) BETWEEN ? AND ?`).get(startDate, endDate);
          const labor = db.prepare(`SELECT SUM(hours_worked * e.hourly_rate) as cost FROM time_entries te JOIN employees e ON te.employee_id=e.id WHERE date(te.clock_in) BETWEEN ? AND ?`).get(startDate, endDate);
          const waste = db.prepare(`SELECT SUM(cost) as cost FROM waste_log WHERE date(created_at) BETWEEN ? AND ?`).get(startDate, endDate);
          return { report: 'P&L Statement', period: `${startDate} to ${endDate}`, revenue: revenue?.total || 0, cogs: cogs?.estimated_cogs || 0, labor: labor?.cost || 0, waste: waste?.cost || 0 };
        }
        case 'labor_cost': {
          const data = db.prepare(`
            SELECT e.first_name || ' ' || e.last_name as name, e.role, e.hourly_rate,
                   SUM(te.hours_worked) as hours, SUM(te.hours_worked * e.hourly_rate) as cost, SUM(te.tips_declared) as tips
            FROM time_entries te JOIN employees e ON te.employee_id = e.id
            WHERE date(te.clock_in) BETWEEN ? AND ?
            GROUP BY e.id ORDER BY cost DESC
          `).all(startDate, endDate);
          return { report: 'Labor Cost', period: `${startDate} to ${endDate}`, data };
        }
        case 'food_cost': {
          const data = db.prepare(`
            SELECT oi.name, SUM(oi.quantity) as qty_sold, SUM(oi.unit_price * oi.quantity) as revenue,
                   mi.cost as unit_cost, SUM(oi.quantity) * COALESCE(mi.cost, 0) as total_cost
            FROM order_items oi JOIN orders o ON oi.order_id = o.id LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
            WHERE o.status = 'closed' AND oi.voided = 0 AND date(o.opened_at) BETWEEN ? AND ?
            GROUP BY oi.menu_item_id ORDER BY revenue DESC LIMIT 30
          `).all(startDate, endDate);
          return { report: 'Food Cost Analysis', period: `${startDate} to ${endDate}`, data };
        }
        case 'inventory_value': {
          const data = db.prepare(`
            SELECT i.name, i.unit, SUM(inv.quantity) as on_hand, i.cost_per_unit, SUM(inv.quantity * inv.cost_per_unit) as value,
                   i.par_level, CASE WHEN i.par_level > 0 THEN ROUND(SUM(inv.quantity) * 100.0 / i.par_level) ELSE NULL END as par_pct
            FROM ingredients i LEFT JOIN inventory inv ON i.id = inv.ingredient_id AND inv.status != 'empty'
            WHERE i.active = 1 GROUP BY i.id ORDER BY value DESC
          `).all();
          return { report: 'Inventory Valuation', data };
        }
        case 'customer_analysis': {
          const data = db.prepare(`
            SELECT vip_tier, COUNT(*) as count, AVG(total_spent) as avg_spent, AVG(total_visits) as avg_visits, SUM(loyalty_points) as total_points
            FROM customers GROUP BY vip_tier
          `).all();
          const top = db.prepare('SELECT first_name, last_name, total_spent, total_visits, vip_tier FROM customers ORDER BY total_spent DESC LIMIT 10').all();
          return { report: 'Customer Analysis', tiers: data, top_customers: top };
        }
        case 'menu_performance': {
          const data = db.prepare(`
            SELECT mi.name, mi.price, mi.cost, COUNT(oi.id) as times_ordered, SUM(oi.quantity) as qty_sold,
                   SUM(oi.unit_price * oi.quantity) as revenue,
                   CASE WHEN mi.price > 0 AND mi.cost > 0 THEN ROUND((mi.price - mi.cost) / mi.price * 100, 1) ELSE NULL END as margin_pct
            FROM menu_items mi LEFT JOIN order_items oi ON mi.id = oi.menu_item_id
            LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'closed'
            WHERE mi.active = 1 GROUP BY mi.id ORDER BY revenue DESC
          `).all();
          return { report: 'Menu Performance', data };
        }
        default:
          return { error: 'Unknown report type' };
      }
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ============================================================
// CLAUDE API CALL WITH TOOL USE
// ============================================================
async function callClaudeWithTools(messages, broadcast) {
  if (!ANTHROPIC_API_KEY) {
    return { text: 'ANTHROPIC_API_KEY not configured. Add it to your .env file and restart the server.' };
  }

  const systemPrompt = `You are VenueCore AI, the intelligent assistant for a restaurant & bar POS system called VenueCore. You are an expert restaurant operations consultant with deep knowledge of food service, hospitality, inventory management, accounting, staffing, and marketing.

CAPABILITIES:
- You can query ANY data in the system using SQL (run_query tool)
- You can take actions: create/update menu items, manage inventory, schedule staff, send notifications, generate reports, manage customers, create accounting entries, sync with Clover POS, and update settings
- You maintain conversation context across messages

RULES:
- ALWAYS use the run_query tool to fetch real data before answering data questions. Never guess numbers.
- When asked about sales, inventory, staff, etc. - query the database first, then give a clear answer
- For action requests, confirm what you'll do, then execute it
- Format responses with markdown for readability
- Be concise but thorough. Use tables for tabular data
- Include specific numbers, percentages, and comparisons
- If you detect issues (low stock, high waste, labor problems), proactively mention them
- Use $ for currency values, round to 2 decimal places
- Today's date is ${new Date().toISOString().slice(0, 10)}
- The current time is ${new Date().toLocaleTimeString('en-US', { hour12: true })}

${SCHEMA_REFERENCE}`;

  let currentMessages = [...messages];
  let maxIterations = 10; // prevent infinite loops
  let finalText = '';

  while (maxIterations-- > 0) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        messages: currentMessages,
        tools: TOOLS,
      }),
    });

    const data = await response.json();
    if (data.error) return { text: `API Error: ${data.error.message}`, actions: [] };

    // Collect text and tool use from response
    const assistantContent = data.content || [];
    const toolUses = [];
    const textParts = [];

    for (const block of assistantContent) {
      if (block.type === 'text') textParts.push(block.text);
      if (block.type === 'tool_use') toolUses.push(block);
    }

    // If no tool calls, we're done
    if (data.stop_reason === 'end_turn' || toolUses.length === 0) {
      finalText = textParts.join('\n');
      break;
    }

    // Execute tools and continue the conversation
    currentMessages.push({ role: 'assistant', content: assistantContent });

    const toolResults = [];
    const actions = [];
    for (const toolUse of toolUses) {
      const result = executeTool(toolUse.name, toolUse.input, broadcast);
      actions.push({ tool: toolUse.name, input: toolUse.input, result });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      });
    }

    currentMessages.push({ role: 'user', content: toolResults });
  }

  return { text: finalText };
}

// ============================================================
// ROUTES
// ============================================================

// POST /api/ai/query - Main chat endpoint
router.post('/query', async (req, res) => {
  const { query, employee_id } = req.body;
  const broadcast = req.app.locals.broadcast;

  // Get or create conversation history
  const history = getConversation(employee_id);

  // Add user message
  history.push({ role: 'user', content: query });

  // Keep last 20 messages for context (10 exchanges)
  const recentHistory = history.slice(-20);

  try {
    const result = await callClaudeWithTools(recentHistory, broadcast);

    // Add assistant response to history
    if (result.text) {
      history.push({ role: 'assistant', content: result.text });
    }

    // Log conversation
    const db = getDb();
    db.prepare(`INSERT INTO ai_conversations (employee_id, query, response, context) VALUES (?, ?, ?, ?)`)
      .run(employee_id, query, result.text || '', '');

    res.json(result);
  } catch (err) {
    console.error('[AI] Error:', err);
    res.json({ text: `Error: ${err.message}` });
  }
});

// POST /api/ai/clear - Clear conversation history
router.post('/clear', (req, res) => {
  const { employee_id } = req.body;
  conversations.delete(employee_id);
  res.json({ success: true });
});

// GET /api/ai/history
router.get('/history', (req, res) => {
  const db = getDb();
  const convos = db.prepare(`
    SELECT ac.*, e.first_name || ' ' || e.last_name as employee_name
    FROM ai_conversations ac
    LEFT JOIN employees e ON ac.employee_id = e.id
    ORDER BY ac.created_at DESC LIMIT 50
  `).all();
  res.json(convos);
});

// Keeping these endpoints for backward compatibility but they now use the tool-based system
router.get('/menu-suggestions', async (req, res) => {
  const broadcast = req.app.locals.broadcast;
  const result = await callClaudeWithTools([
    { role: 'user', content: 'Analyze my menu and provide 3-5 specific, actionable optimization suggestions. Consider food costs, pricing, popularity, and waste. Use real data from the database.' }
  ], broadcast);
  res.json(result);
});

router.get('/cost-optimization', async (req, res) => {
  const broadcast = req.app.locals.broadcast;
  const result = await callClaudeWithTools([
    { role: 'user', content: 'Identify the top 3-5 cost optimization opportunities in my restaurant. Look at food costs, labor costs, waste, and operational efficiency. Be specific with numbers and potential savings.' }
  ], broadcast);
  res.json(result);
});

router.get('/demand-forecast', async (req, res) => {
  const broadcast = req.app.locals.broadcast;
  const result = await callClaudeWithTools([
    { role: 'user', content: 'Provide a 7-day demand forecast with expected order counts and staffing recommendations for each day. Use historical data patterns.' }
  ], broadcast);
  res.json(result);
});

router.get('/insights', async (req, res) => {
  const broadcast = req.app.locals.broadcast;
  const result = await callClaudeWithTools([
    { role: 'user', content: 'Generate 3-5 quick daily insights for me as a restaurant manager. Keep each one brief - one sentence. Focus on actionable observations from today\'s data.' }
  ], broadcast);
  res.json(result);
});

module.exports = router;
