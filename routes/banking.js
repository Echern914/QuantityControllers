const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);
router.use(requireRole('admin', 'manager'));

// ============================================================
// BANK ACCOUNTS
// ============================================================

// GET /api/banking/accounts
router.get('/accounts', (req, res) => {
  const db = getDb();
  const accounts = db.prepare(`
    SELECT ba.*, coa.account_number as gl_account_number, coa.name as gl_account_name
    FROM bank_accounts ba
    LEFT JOIN chart_of_accounts coa ON ba.gl_account_id = coa.id
    WHERE ba.active = 1
    ORDER BY ba.name
  `).all();
  res.json(accounts);
});

// POST /api/banking/accounts
router.post('/accounts', (req, res) => {
  const db = getDb();
  const { name, bank_name, account_number_last4, account_type, gl_account_id, current_balance } = req.body;
  if (!name) return res.status(400).json({ error: 'Account name required' });
  const result = db.prepare(`
    INSERT INTO bank_accounts (name, bank_name, account_number_last4, account_type, gl_account_id, current_balance)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, bank_name || null, account_number_last4 || null, account_type || 'checking', gl_account_id || null, current_balance || 0);
  res.json({ id: result.lastInsertRowid, message: 'Bank account created' });
});

// PUT /api/banking/accounts/:id
router.put('/accounts/:id', (req, res) => {
  const db = getDb();
  const { name, bank_name, gl_account_id, current_balance, active } = req.body;
  db.prepare(`UPDATE bank_accounts SET name = COALESCE(?, name), bank_name = COALESCE(?, bank_name), gl_account_id = COALESCE(?, gl_account_id), current_balance = COALESCE(?, current_balance), active = COALESCE(?, active) WHERE id = ?`)
    .run(name, bank_name, gl_account_id, current_balance, active !== undefined ? (active ? 1 : 0) : null, req.params.id);
  res.json({ message: 'Bank account updated' });
});

// ============================================================
// BANK TRANSACTIONS
// ============================================================

// GET /api/banking/accounts/:id/transactions
router.get('/accounts/:id/transactions', (req, res) => {
  const db = getDb();
  const { start_date, end_date, reconciled, matched } = req.query;
  let sql = 'SELECT * FROM bank_transactions WHERE bank_account_id = ?';
  const params = [req.params.id];
  if (start_date) { sql += ' AND transaction_date >= ?'; params.push(start_date); }
  if (end_date) { sql += ' AND transaction_date <= ?'; params.push(end_date); }
  if (reconciled !== undefined) { sql += ' AND reconciled = ?'; params.push(reconciled === 'true' ? 1 : 0); }
  if (matched !== undefined) { sql += ' AND matched = ?'; params.push(matched === 'true' ? 1 : 0); }
  sql += ' ORDER BY transaction_date DESC, id DESC';
  res.json(db.prepare(sql).all(...params));
});

// POST /api/banking/accounts/:id/transactions
router.post('/accounts/:id/transactions', (req, res) => {
  const db = getDb();
  const { transaction_date, description, reference, amount, transaction_type, category } = req.body;
  if (!transaction_date || !amount) return res.status(400).json({ error: 'Date and amount required' });

  const result = db.prepare(`
    INSERT INTO bank_transactions (bank_account_id, transaction_date, description, reference, amount, transaction_type, category)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.id, transaction_date, description || '', reference || null, amount, transaction_type || (amount >= 0 ? 'credit' : 'debit'), category || null);

  // Update balance
  db.prepare(`UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?`).run(amount, req.params.id);

  res.json({ id: result.lastInsertRowid, message: 'Transaction recorded' });
});

// POST /api/banking/accounts/:id/import - Bulk import transactions (CSV-style)
router.post('/accounts/:id/import', (req, res) => {
  const db = getDb();
  const { transactions } = req.body;
  if (!transactions || !Array.isArray(transactions)) return res.status(400).json({ error: 'Transactions array required' });

  const insert = db.prepare(`INSERT INTO bank_transactions (bank_account_id, transaction_date, description, reference, amount, transaction_type, category) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  let imported = 0;
  let totalAmount = 0;

  const importMany = db.transaction((txns) => {
    for (const t of txns) {
      insert.run(req.params.id, t.transaction_date || t.date, t.description || '', t.reference || null, t.amount, t.amount >= 0 ? 'credit' : 'debit', t.category || null);
      totalAmount += t.amount;
      imported++;
    }
  });

  importMany(transactions);
  db.prepare('UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?').run(totalAmount, req.params.id);

  res.json({ imported, message: `${imported} transactions imported` });
});

// ============================================================
// TRANSACTION MATCHING
// ============================================================

// POST /api/banking/transactions/:id/match
router.post('/transactions/:id/match', (req, res) => {
  const db = getDb();
  const { entity_type, entity_id } = req.body;
  db.prepare(`UPDATE bank_transactions SET matched = 1, matched_entity_type = ?, matched_entity_id = ? WHERE id = ?`)
    .run(entity_type, entity_id, req.params.id);
  res.json({ message: 'Transaction matched' });
});

// POST /api/banking/transactions/:id/unmatch
router.post('/transactions/:id/unmatch', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE bank_transactions SET matched = 0, matched_entity_type = NULL, matched_entity_id = NULL WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Transaction unmatched' });
});

// GET /api/banking/auto-match/:accountId - Suggest matches
router.get('/auto-match/:accountId', (req, res) => {
  const db = getDb();

  const unmatched = db.prepare(`SELECT * FROM bank_transactions WHERE bank_account_id = ? AND matched = 0 ORDER BY transaction_date DESC LIMIT 50`).all(req.params.accountId);

  const suggestions = [];
  for (const tx of unmatched) {
    // Try to match with AP payments
    if (tx.amount < 0) {
      const apMatch = db.prepare(`
        SELECT ap.id, ap.invoice_number, s.name as supplier_name, ap.total
        FROM ap_invoices ap JOIN suppliers s ON ap.supplier_id = s.id
        WHERE ap.status = 'paid' AND ABS(ap.total - ABS(?)) < 0.01
        AND ap.paid_at >= date(?, '-3 days') AND ap.paid_at <= date(?, '+3 days')
        LIMIT 1
      `).get(Math.abs(tx.amount), tx.transaction_date, tx.transaction_date);

      if (apMatch) {
        suggestions.push({ transaction_id: tx.id, entity_type: 'ap_invoice', entity_id: apMatch.id, confidence: 0.9, description: `AP Invoice ${apMatch.invoice_number} - ${apMatch.supplier_name}` });
      }
    }

    // Try to match with daily sales deposits
    if (tx.amount > 0) {
      const salesMatch = db.prepare(`
        SELECT date(opened_at) as sale_date, SUM(total) as total
        FROM orders WHERE status = 'closed'
        AND date(opened_at) >= date(?, '-2 days') AND date(opened_at) <= date(?, '+1 day')
        GROUP BY sale_date
        HAVING ABS(total - ?) < (? * 0.02)
        LIMIT 1
      `).get(tx.transaction_date, tx.transaction_date, tx.amount, tx.amount);

      if (salesMatch) {
        suggestions.push({ transaction_id: tx.id, entity_type: 'daily_sales', entity_id: null, confidence: 0.75, description: `Daily sales deposit for ${salesMatch.sale_date}` });
      }
    }
  }

  res.json({ unmatched_count: unmatched.length, suggestions });
});

// ============================================================
// BANK RECONCILIATION
// ============================================================

// POST /api/banking/accounts/:id/reconcile
router.post('/accounts/:id/reconcile', (req, res) => {
  const db = getDb();
  const { statement_date, statement_balance, matched_transaction_ids } = req.body;
  if (!statement_date || statement_balance === undefined) {
    return res.status(400).json({ error: 'Statement date and balance required' });
  }

  const account = db.prepare('SELECT * FROM bank_accounts WHERE id = ?').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const bookBalance = account.current_balance;
  const difference = +(statement_balance - bookBalance).toFixed(2);

  const result = db.prepare(`
    INSERT INTO bank_reconciliations (bank_account_id, statement_date, statement_balance, book_balance, difference, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.params.id, statement_date, statement_balance, bookBalance, difference, Math.abs(difference) < 0.01 ? 'completed' : 'in_progress');

  // Mark transactions as reconciled
  if (matched_transaction_ids && matched_transaction_ids.length > 0) {
    const markReconciled = db.prepare(`UPDATE bank_transactions SET reconciled = 1, reconciliation_id = ? WHERE id = ?`);
    for (const txId of matched_transaction_ids) {
      markReconciled.run(result.lastInsertRowid, txId);
    }
  }

  db.prepare(`UPDATE bank_accounts SET last_reconciled_date = ?, last_statement_balance = ? WHERE id = ?`).run(statement_date, statement_balance, req.params.id);

  res.json({ id: result.lastInsertRowid, difference, status: Math.abs(difference) < 0.01 ? 'completed' : 'in_progress', message: 'Reconciliation saved' });
});

// GET /api/banking/accounts/:id/reconciliations
router.get('/accounts/:id/reconciliations', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM bank_reconciliations WHERE bank_account_id = ? ORDER BY statement_date DESC').all(req.params.id));
});

// GET /api/banking/dashboard
router.get('/dashboard', (req, res) => {
  const db = getDb();
  const accounts = db.prepare('SELECT id, name, bank_name, account_type, current_balance, last_reconciled_date FROM bank_accounts WHERE active = 1').all();
  const totalBalance = accounts.reduce((s, a) => s + a.current_balance, 0);
  const unreconciledCount = db.prepare('SELECT COUNT(*) as count FROM bank_transactions WHERE reconciled = 0').get().count;
  const unmatchedCount = db.prepare('SELECT COUNT(*) as count FROM bank_transactions WHERE matched = 0').get().count;

  res.json({ accounts, total_balance: +totalBalance.toFixed(2), unreconciled_transactions: unreconciledCount, unmatched_transactions: unmatchedCount });
});

module.exports = router;
