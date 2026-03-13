const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { paginate } = require('../middleware/response');

// All routes require authentication
router.use(authenticate);
router.use(requireRole('admin', 'manager'));

// ============================================================
// CHART OF ACCOUNTS
// ============================================================

// GET /api/accounting/accounts
router.get('/accounts', (req, res) => {
  const db = getDb();
  const { type, active } = req.query;
  let sql = 'SELECT * FROM chart_of_accounts WHERE 1=1';
  const params = [];
  if (type) { sql += ' AND account_type = ?'; params.push(type); }
  if (active !== undefined) { sql += ' AND active = ?'; params.push(active === 'true' ? 1 : 0); }
  sql += ' ORDER BY account_number';
  res.json(db.prepare(sql).all(...params));
});

// POST /api/accounting/accounts
router.post('/accounts', (req, res) => {
  const db = getDb();
  const { account_number, name, account_type, sub_type, parent_id, normal_balance, description } = req.body;
  if (!account_number || !name || !account_type) {
    return res.status(400).json({ error: 'Account number, name, and type are required' });
  }
  const result = db.prepare(`
    INSERT INTO chart_of_accounts (account_number, name, account_type, sub_type, parent_id, normal_balance, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(account_number, name, account_type, sub_type || null, parent_id || null, normal_balance || 'debit', description || null);
  res.json({ success: true, id: result.lastInsertRowid, message: 'Account created' });
});

// PUT /api/accounting/accounts/:id
router.put('/accounts/:id', (req, res) => {
  const db = getDb();
  const { name, sub_type, description, active } = req.body;
  const account = db.prepare('SELECT * FROM chart_of_accounts WHERE id = ?').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  if (account.is_system && active === false) return res.status(400).json({ error: 'Cannot deactivate system accounts' });

  db.prepare(`UPDATE chart_of_accounts SET name = COALESCE(?, name), sub_type = COALESCE(?, sub_type), description = COALESCE(?, description), active = COALESCE(?, active) WHERE id = ?`)
    .run(name, sub_type, description, active !== undefined ? (active ? 1 : 0) : null, req.params.id);
  res.json({ success: true, message: 'Account updated' });
});

// GET /api/accounting/trial-balance
router.get('/trial-balance', (req, res) => {
  const db = getDb();
  const { as_of_date } = req.query;
  const asOf = as_of_date || new Date().toISOString().slice(0, 10);

  const balances = db.prepare(`
    SELECT coa.id, coa.account_number, coa.name, coa.account_type, coa.normal_balance,
           COALESCE(SUM(jel.debit), 0) as total_debits,
           COALESCE(SUM(jel.credit), 0) as total_credits,
           COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0) as balance
    FROM chart_of_accounts coa
    LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.status = 'posted' AND je.entry_date <= ?
    WHERE coa.active = 1
    GROUP BY coa.id
    HAVING total_debits > 0 OR total_credits > 0
    ORDER BY coa.account_number
  `).all(asOf);

  const totalDebits = balances.reduce((s, b) => s + b.total_debits, 0);
  const totalCredits = balances.reduce((s, b) => s + b.total_credits, 0);

  res.json({ as_of_date: asOf, accounts: balances, total_debits: totalDebits, total_credits: totalCredits, in_balance: Math.abs(totalDebits - totalCredits) < 0.01 });
});

// ============================================================
// JOURNAL ENTRIES
// ============================================================

// GET /api/accounting/journal-entries
router.get('/journal-entries', (req, res) => {
  const db = getDb();
  const { status, source, start_date, end_date } = req.query;
  let sql = `SELECT je.*, e.first_name || ' ' || COALESCE(e.last_name, '') as created_by_name
    FROM journal_entries je LEFT JOIN employees e ON je.created_by = e.id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND je.status = ?'; params.push(status); }
  if (source) { sql += ' AND je.source = ?'; params.push(source); }
  if (start_date) { sql += ' AND je.entry_date >= ?'; params.push(start_date); }
  if (end_date) { sql += ' AND je.entry_date <= ?'; params.push(end_date); }
  sql += ' ORDER BY je.entry_date DESC, je.id DESC';
  const result = paginate(db, sql, params, req.query, { defaultLimit: 200 });
  const entries = Array.isArray(result) ? result : result.data;

  // Fetch lines for each entry
  const getLines = db.prepare(`SELECT jel.*, coa.account_number, coa.name as account_name FROM journal_entry_lines jel JOIN chart_of_accounts coa ON jel.account_id = coa.id WHERE jel.journal_entry_id = ?`);
  for (const entry of entries) {
    entry.lines = getLines.all(entry.id);
  }
  if (Array.isArray(result)) {
    res.json(entries);
  } else {
    res.json({ data: entries, pagination: result.pagination });
  }
});

// POST /api/accounting/journal-entries
router.post('/journal-entries', (req, res) => {
  const db = getDb();
  const { entry_date, description, source, reference, lines, created_by } = req.body;
  if (!entry_date || !lines || lines.length < 2) {
    return res.status(400).json({ error: 'Entry date and at least 2 lines required' });
  }

  // Validate debits = credits
  const totalDebits = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredits = lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    return res.status(400).json({ error: `Debits ($${totalDebits.toFixed(2)}) must equal credits ($${totalCredits.toFixed(2)})` });
  }

  // Generate entry number
  const count = db.prepare('SELECT COUNT(*) as c FROM journal_entries').get().c;
  const entryNumber = `JE-${String(count + 1).padStart(5, '0')}`;

  const result = db.prepare(`
    INSERT INTO journal_entries (entry_number, entry_date, description, source, reference, status, created_by)
    VALUES (?, ?, ?, ?, ?, 'draft', ?)
  `).run(entryNumber, entry_date, description || '', source || 'manual', reference || null, created_by || null);

  const insertLine = db.prepare(`INSERT INTO journal_entry_lines (journal_entry_id, account_id, description, debit, credit) VALUES (?, ?, ?, ?, ?)`);
  for (const line of lines) {
    insertLine.run(result.lastInsertRowid, line.account_id, line.description || '', line.debit || 0, line.credit || 0);
  }

  res.json({ success: true, id: result.lastInsertRowid, entry_number: entryNumber, message: 'Journal entry created' });
});

// POST /api/accounting/journal-entries/:id/post
router.post('/journal-entries/:id/post', (req, res) => {
  const db = getDb();
  const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  if (entry.status === 'posted') return res.status(400).json({ error: 'Already posted' });

  db.prepare(`UPDATE journal_entries SET status = 'posted', posted_at = datetime('now'), posted_by = ? WHERE id = ?`)
    .run(req.body.posted_by || null, req.params.id);
  res.json({ success: true, message: 'Journal entry posted' });
});

// POST /api/accounting/journal-entries/:id/reverse
router.post('/journal-entries/:id/reverse', (req, res) => {
  const db = getDb();
  const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  if (entry.status !== 'posted') return res.status(400).json({ error: 'Can only reverse posted entries' });

  const lines = db.prepare('SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?').all(req.params.id);
  const count = db.prepare('SELECT COUNT(*) as c FROM journal_entries').get().c;
  const entryNumber = `JE-${String(count + 1).padStart(5, '0')}`;

  const result = db.prepare(`
    INSERT INTO journal_entries (entry_number, entry_date, description, source, reference, status, reversal_of, created_by)
    VALUES (?, date('now'), ?, 'reversal', ?, 'posted', ?, ?)
  `).run(entryNumber, `Reversal of ${entry.entry_number}: ${entry.description || ''}`, entry.entry_number, req.params.id, req.body.created_by || null);

  const insertLine = db.prepare(`INSERT INTO journal_entry_lines (journal_entry_id, account_id, description, debit, credit) VALUES (?, ?, ?, ?, ?)`);
  for (const line of lines) {
    insertLine.run(result.lastInsertRowid, line.account_id, `Reversal: ${line.description || ''}`, line.credit, line.debit);
  }

  db.prepare('UPDATE journal_entries SET reversed = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true, id: result.lastInsertRowid, entry_number: entryNumber, message: 'Entry reversed' });
});

// ============================================================
// FINANCIAL STATEMENTS
// ============================================================

// GET /api/accounting/income-statement
router.get('/income-statement', (req, res) => {
  const db = getDb();
  const { start_date, end_date } = req.query;
  const start = start_date || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const end = end_date || new Date().toISOString().slice(0, 10);

  const getSection = (type) => db.prepare(`
    SELECT coa.id, coa.account_number, coa.name, coa.sub_type,
           COALESCE(SUM(jel.credit), 0) - COALESCE(SUM(jel.debit), 0) as balance
    FROM chart_of_accounts coa
    LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.status = 'posted' AND je.entry_date >= ? AND je.entry_date <= ?
    WHERE coa.account_type = ? AND coa.active = 1
    GROUP BY coa.id
    HAVING balance != 0
    ORDER BY coa.account_number
  `).all(start, end, type);

  const revenue = getSection('revenue');
  const expenses = db.prepare(`
    SELECT coa.id, coa.account_number, coa.name, coa.sub_type,
           COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0) as balance
    FROM chart_of_accounts coa
    LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.status = 'posted' AND je.entry_date >= ? AND je.entry_date <= ?
    WHERE coa.account_type = 'expense' AND coa.active = 1
    GROUP BY coa.id
    HAVING balance != 0
    ORDER BY coa.account_number
  `).all(start, end);

  const totalRevenue = revenue.reduce((s, r) => s + r.balance, 0);
  const cogsList = expenses.filter(e => e.sub_type === 'cogs');
  const laborList = expenses.filter(e => e.sub_type === 'labor');
  const operatingList = expenses.filter(e => e.sub_type === 'operating');

  const totalCogs = cogsList.reduce((s, e) => s + e.balance, 0);
  const totalLabor = laborList.reduce((s, e) => s + e.balance, 0);
  const totalOperating = operatingList.reduce((s, e) => s + e.balance, 0);
  const totalExpenses = totalCogs + totalLabor + totalOperating;
  const grossProfit = totalRevenue - totalCogs;
  const operatingProfit = grossProfit - totalLabor - totalOperating;

  res.json({
    period: { start, end },
    revenue: { accounts: revenue, total: +totalRevenue.toFixed(2) },
    cost_of_goods: { accounts: cogsList, total: +totalCogs.toFixed(2) },
    gross_profit: +grossProfit.toFixed(2),
    gross_margin: totalRevenue > 0 ? +((grossProfit / totalRevenue) * 100).toFixed(1) : 0,
    labor: { accounts: laborList, total: +totalLabor.toFixed(2) },
    operating_expenses: { accounts: operatingList, total: +totalOperating.toFixed(2) },
    total_expenses: +totalExpenses.toFixed(2),
    operating_profit: +operatingProfit.toFixed(2),
    net_margin: totalRevenue > 0 ? +((operatingProfit / totalRevenue) * 100).toFixed(1) : 0,
    prime_cost: +(totalCogs + totalLabor).toFixed(2),
    prime_cost_percent: totalRevenue > 0 ? +(((totalCogs + totalLabor) / totalRevenue) * 100).toFixed(1) : 0,
  });
});

// GET /api/accounting/balance-sheet
router.get('/balance-sheet', (req, res) => {
  const db = getDb();
  const { as_of_date } = req.query;
  const asOf = as_of_date || new Date().toISOString().slice(0, 10);

  const getSection = (type, normalDebit) => {
    const balanceExpr = normalDebit
      ? 'COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0)'
      : 'COALESCE(SUM(jel.credit), 0) - COALESCE(SUM(jel.debit), 0)';
    return db.prepare(`
      SELECT coa.id, coa.account_number, coa.name, coa.sub_type,
             ${balanceExpr} as balance
      FROM chart_of_accounts coa
      LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
      LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.status = 'posted' AND je.entry_date <= ?
      WHERE coa.account_type = ? AND coa.active = 1
      GROUP BY coa.id
      HAVING balance != 0
      ORDER BY coa.account_number
    `).all(asOf, type);
  };

  const assets = getSection('asset', true);
  const liabilities = getSection('liability', false);
  const equity = getSection('equity', false);

  const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.balance, 0);
  const totalEquity = equity.reduce((s, e) => s + e.balance, 0);

  res.json({
    as_of_date: asOf,
    assets: { accounts: assets, total: +totalAssets.toFixed(2) },
    liabilities: { accounts: liabilities, total: +totalLiabilities.toFixed(2) },
    equity: { accounts: equity, total: +totalEquity.toFixed(2) },
    total_liabilities_and_equity: +(totalLiabilities + totalEquity).toFixed(2),
    in_balance: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
  });
});

// GET /api/accounting/cash-flow
router.get('/cash-flow', (req, res) => {
  const db = getDb();
  const { start_date, end_date } = req.query;
  const start = start_date || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const end = end_date || new Date().toISOString().slice(0, 10);

  // Cash accounts activity
  const cashActivity = db.prepare(`
    SELECT coa.name, jel.description,
           SUM(jel.debit) as inflows, SUM(jel.credit) as outflows
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    JOIN chart_of_accounts coa ON jel.account_id = coa.id
    WHERE je.status = 'posted' AND je.entry_date >= ? AND je.entry_date <= ?
      AND coa.account_number IN ('1000', '1010', '1020')
    GROUP BY coa.id
  `).all(start, end);

  const totalInflows = cashActivity.reduce((s, c) => s + (c.inflows || 0), 0);
  const totalOutflows = cashActivity.reduce((s, c) => s + (c.outflows || 0), 0);

  res.json({
    period: { start, end },
    cash_accounts: cashActivity,
    total_inflows: +totalInflows.toFixed(2),
    total_outflows: +totalOutflows.toFixed(2),
    net_cash_flow: +(totalInflows - totalOutflows).toFixed(2),
  });
});

// ============================================================
// FISCAL PERIODS
// ============================================================

// GET /api/accounting/fiscal-periods
router.get('/fiscal-periods', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM fiscal_periods ORDER BY start_date DESC').all());
});

// POST /api/accounting/fiscal-periods
router.post('/fiscal-periods', (req, res) => {
  const db = getDb();
  const { name, period_type, start_date, end_date } = req.body;
  if (!name || !start_date || !end_date) return res.status(400).json({ error: 'Name, start, and end date required' });
  const result = db.prepare(`INSERT INTO fiscal_periods (name, period_type, start_date, end_date) VALUES (?, ?, ?, ?)`).run(name, period_type || 'monthly', start_date, end_date);
  res.json({ success: true, id: result.lastInsertRowid, message: 'Fiscal period created' });
});

// POST /api/accounting/fiscal-periods/:id/close
router.post('/fiscal-periods/:id/close', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE fiscal_periods SET status = 'closed', closed_by = ?, closed_at = datetime('now') WHERE id = ?`).run(req.body.closed_by || null, req.params.id);
  res.json({ success: true, message: 'Period closed' });
});

// ============================================================
// BUDGETS
// ============================================================

// GET /api/accounting/budgets
router.get('/budgets', (req, res) => {
  const db = getDb();
  const budgets = db.prepare(`
    SELECT b.*, coa.account_number, coa.name as account_name, fp.name as period_name
    FROM budgets b
    JOIN chart_of_accounts coa ON b.account_id = coa.id
    LEFT JOIN fiscal_periods fp ON b.fiscal_period_id = fp.id
    ORDER BY coa.account_number
  `).all();
  res.json(budgets);
});

// POST /api/accounting/budgets
router.post('/budgets', (req, res) => {
  const db = getDb();
  const { name, fiscal_period_id, account_id, budget_type, amount } = req.body;
  const result = db.prepare(`INSERT INTO budgets (name, fiscal_period_id, account_id, budget_type, amount) VALUES (?, ?, ?, ?, ?)`).run(name, fiscal_period_id || null, account_id, budget_type || 'fixed', amount || 0);
  res.json({ success: true, id: result.lastInsertRowid, message: 'Budget created' });
});

// GET /api/accounting/budget-vs-actual
router.get('/budget-vs-actual', (req, res) => {
  const db = getDb();
  const { start_date, end_date } = req.query;
  const start = start_date || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const end = end_date || new Date().toISOString().slice(0, 10);

  const comparison = db.prepare(`
    SELECT coa.account_number, coa.name, coa.account_type,
           COALESCE(b.amount, 0) as budget,
           COALESCE(SUM(CASE WHEN coa.normal_balance = 'debit' THEN jel.debit - jel.credit ELSE jel.credit - jel.debit END), 0) as actual
    FROM chart_of_accounts coa
    LEFT JOIN budgets b ON coa.id = b.account_id
    LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.status = 'posted' AND je.entry_date >= ? AND je.entry_date <= ?
    WHERE coa.active = 1 AND (b.id IS NOT NULL OR jel.id IS NOT NULL)
    GROUP BY coa.id
    ORDER BY coa.account_number
  `).all(start, end);

  for (const row of comparison) {
    row.variance = +(row.actual - row.budget).toFixed(2);
    row.variance_percent = row.budget > 0 ? +((row.variance / row.budget) * 100).toFixed(1) : 0;
  }

  res.json({ period: { start, end }, accounts: comparison });
});

// POST /api/accounting/auto-journal/daily-sales
router.post('/auto-journal/daily-sales', (req, res) => {
  const db = getDb();
  const date = req.body.date || new Date().toISOString().slice(0, 10);

  const sales = db.prepare(`
    SELECT COALESCE(SUM(subtotal), 0) as revenue, COALESCE(SUM(tax), 0) as tax,
           COALESCE(SUM(tip), 0) as tips, COALESCE(SUM(total), 0) as total
    FROM orders WHERE status = 'closed' AND date(opened_at) = ?
  `).get(date);

  if (sales.total === 0) return res.json({ success: true, message: 'No sales to journal' });

  const payments = db.prepare(`
    SELECT payment_method, SUM(amount) as total
    FROM order_payments op JOIN orders o ON op.order_id = o.id
    WHERE o.status = 'closed' AND date(o.opened_at) = ?
    GROUP BY payment_method
  `).all(date);

  const count = db.prepare('SELECT COUNT(*) as c FROM journal_entries').get().c;
  const entryNumber = `JE-${String(count + 1).padStart(5, '0')}`;

  const result = db.prepare(`
    INSERT INTO journal_entries (entry_number, entry_date, description, source, source_id, status)
    VALUES (?, ?, ?, 'auto_daily_sales', NULL, 'posted')
  `).run(entryNumber, date, `Daily sales journal - ${date}`);

  const insertLine = db.prepare(`INSERT INTO journal_entry_lines (journal_entry_id, account_id, description, debit, credit) VALUES (?, ?, ?, ?, ?)`);

  // Debit cash/bank for payments
  const cashAcct = db.prepare("SELECT id FROM chart_of_accounts WHERE account_number = '1000'").get();
  const bankAcct = db.prepare("SELECT id FROM chart_of_accounts WHERE account_number = '1010'").get();
  const foodSales = db.prepare("SELECT id FROM chart_of_accounts WHERE account_number = '4000'").get();
  const taxPayable = db.prepare("SELECT id FROM chart_of_accounts WHERE account_number = '2100'").get();
  const tipsPayable = db.prepare("SELECT id FROM chart_of_accounts WHERE account_number = '2300'").get();

  for (const p of payments) {
    const acctId = p.payment_method === 'cash' ? cashAcct?.id : bankAcct?.id;
    if (acctId) insertLine.run(result.lastInsertRowid, acctId, `${p.payment_method} receipts`, p.total, 0);
  }

  // Credit revenue
  if (foodSales && sales.revenue > 0) insertLine.run(result.lastInsertRowid, foodSales.id, 'Sales revenue', 0, sales.revenue);
  if (taxPayable && sales.tax > 0) insertLine.run(result.lastInsertRowid, taxPayable.id, 'Sales tax collected', 0, sales.tax);
  if (tipsPayable && sales.tips > 0) insertLine.run(result.lastInsertRowid, tipsPayable.id, 'Tips collected', 0, sales.tips);

  res.json({ success: true, id: result.lastInsertRowid, entry_number: entryNumber, message: 'Daily sales journal entry created' });
});

module.exports = router;
