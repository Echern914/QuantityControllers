const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);
router.use(requireRole('admin', 'manager'));

// ============================================================
// AP INVOICES
// ============================================================

// GET /api/ap/invoices
router.get('/invoices', (req, res) => {
  const db = getDb();
  const { status, supplier_id, overdue } = req.query;
  let sql = `SELECT api.*, s.name as supplier_name
    FROM ap_invoices api JOIN suppliers s ON api.supplier_id = s.id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND api.status = ?'; params.push(status); }
  if (supplier_id) { sql += ' AND api.supplier_id = ?'; params.push(supplier_id); }
  if (overdue === 'true') { sql += " AND api.due_date < date('now') AND api.status != 'paid'"; }
  sql += ' ORDER BY api.due_date ASC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/ap/invoices/:id
router.get('/invoices/:id', (req, res) => {
  const db = getDb();
  const invoice = db.prepare(`SELECT api.*, s.name as supplier_name FROM ap_invoices api JOIN suppliers s ON api.supplier_id = s.id WHERE api.id = ?`).get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  invoice.lines = db.prepare(`
    SELECT ail.*, coa.name as account_name, i.name as ingredient_name
    FROM ap_invoice_lines ail
    LEFT JOIN chart_of_accounts coa ON ail.account_id = coa.id
    LEFT JOIN ingredients i ON ail.ingredient_id = i.id
    WHERE ail.invoice_id = ?
  `).all(req.params.id);

  invoice.payments = db.prepare(`SELECT * FROM ap_payments WHERE invoice_id = ? ORDER BY payment_date DESC`).all(req.params.id);

  res.json(invoice);
});

// POST /api/ap/invoices
router.post('/invoices', (req, res) => {
  const db = getDb();
  const { invoice_number, supplier_id, purchase_order_id, invoice_date, due_date, subtotal, tax, shipping, total, lines, gl_account_id, notes, created_by } = req.body;
  if (!invoice_number || !supplier_id || !invoice_date || !due_date) {
    return res.status(400).json({ error: 'Invoice number, supplier, invoice date, and due date required' });
  }

  const invoiceTotal = total || (subtotal || 0) + (tax || 0) + (shipping || 0);

  // Check auto-approve threshold
  const autoApprove = db.prepare("SELECT auto_approve_below FROM approval_workflows WHERE entity_type = 'ap_invoice' AND active = 1 LIMIT 1").get();
  const approvalStatus = (autoApprove && invoiceTotal <= autoApprove.auto_approve_below) ? 'approved' : 'pending';

  const result = db.prepare(`
    INSERT INTO ap_invoices (invoice_number, supplier_id, purchase_order_id, invoice_date, due_date, subtotal, tax, shipping, total, balance_due, approval_status, gl_account_id, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(invoice_number, supplier_id, purchase_order_id || null, invoice_date, due_date, subtotal || 0, tax || 0, shipping || 0, invoiceTotal, invoiceTotal, approvalStatus, gl_account_id || null, notes || null, created_by || null);

  if (lines && lines.length > 0) {
    const insertLine = db.prepare(`INSERT INTO ap_invoice_lines (invoice_id, description, account_id, ingredient_id, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const line of lines) {
      const lineTotal = (line.quantity || 1) * (line.unit_price || 0);
      insertLine.run(result.lastInsertRowid, line.description || '', line.account_id || null, line.ingredient_id || null, line.quantity || 1, line.unit_price || 0, lineTotal);
    }
  }

  res.json({ id: result.lastInsertRowid, approval_status: approvalStatus, message: 'Invoice created' });
});

// POST /api/ap/invoices/:id/approve
router.post('/invoices/:id/approve', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE ap_invoices SET approval_status = 'approved', approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
    .run(req.body.approved_by || null, req.params.id);
  res.json({ message: 'Invoice approved' });
});

// POST /api/ap/invoices/:id/reject
router.post('/invoices/:id/reject', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE ap_invoices SET approval_status = 'rejected', notes = COALESCE(notes, '') || ' | Rejected: ' || ?, updated_at = datetime('now') WHERE id = ?`)
    .run(req.body.reason || 'No reason', req.params.id);
  res.json({ message: 'Invoice rejected' });
});

// ============================================================
// AP PAYMENTS
// ============================================================

// POST /api/ap/invoices/:id/pay
router.post('/invoices/:id/pay', (req, res) => {
  const db = getDb();
  const invoice = db.prepare('SELECT * FROM ap_invoices WHERE id = ?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.approval_status !== 'approved') return res.status(400).json({ error: 'Invoice must be approved before payment' });

  const { amount, payment_method, reference_number, bank_account_id } = req.body;
  const payAmount = amount || invoice.balance_due;

  const result = db.prepare(`
    INSERT INTO ap_payments (invoice_id, amount, payment_date, payment_method, reference_number, bank_account_id, created_by)
    VALUES (?, ?, date('now'), ?, ?, ?, ?)
  `).run(req.params.id, payAmount, payment_method || 'check', reference_number || null, bank_account_id || null, req.body.created_by || null);

  const newBalance = +(invoice.balance_due - payAmount).toFixed(2);
  const newAmountPaid = +(invoice.amount_paid + payAmount).toFixed(2);
  const newStatus = newBalance <= 0 ? 'paid' : 'partial';

  db.prepare(`UPDATE ap_invoices SET amount_paid = ?, balance_due = ?, status = ?, paid_at = CASE WHEN ? <= 0 THEN datetime('now') ELSE paid_at END, payment_method = ?, payment_reference = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(newAmountPaid, Math.max(0, newBalance), newStatus, newBalance, payment_method || 'check', reference_number || null, req.params.id);

  res.json({ id: result.lastInsertRowid, new_balance: Math.max(0, newBalance), status: newStatus, message: 'Payment recorded' });
});

// ============================================================
// AP AGING REPORT
// ============================================================

// GET /api/ap/aging
router.get('/aging', (req, res) => {
  const db = getDb();
  const invoices = db.prepare(`
    SELECT api.*, s.name as supplier_name
    FROM ap_invoices api JOIN suppliers s ON api.supplier_id = s.id
    WHERE api.status != 'paid'
    ORDER BY api.due_date ASC
  `).all();

  const today = new Date();
  const buckets = { current: [], days_1_30: [], days_31_60: [], days_61_90: [], days_over_90: [] };
  const totals = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_over_90: 0 };

  for (const inv of invoices) {
    const due = new Date(inv.due_date);
    const daysOverdue = Math.floor((today - due) / 86400000);
    inv.days_overdue = Math.max(0, daysOverdue);

    let bucket;
    if (daysOverdue <= 0) bucket = 'current';
    else if (daysOverdue <= 30) bucket = 'days_1_30';
    else if (daysOverdue <= 60) bucket = 'days_31_60';
    else if (daysOverdue <= 90) bucket = 'days_61_90';
    else bucket = 'days_over_90';

    buckets[bucket].push(inv);
    totals[bucket] += inv.balance_due;
  }

  const totalOutstanding = Object.values(totals).reduce((s, t) => s + t, 0);

  res.json({ buckets, totals, total_outstanding: +totalOutstanding.toFixed(2), invoice_count: invoices.length });
});

// ============================================================
// APPROVAL WORKFLOWS
// ============================================================

// GET /api/ap/workflows
router.get('/workflows', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM approval_workflows ORDER BY entity_type, min_amount').all());
});

// POST /api/ap/workflows
router.post('/workflows', (req, res) => {
  const db = getDb();
  const { name, entity_type, min_amount, max_amount, required_role, auto_approve_below } = req.body;
  const result = db.prepare(`INSERT INTO approval_workflows (name, entity_type, min_amount, max_amount, required_role, auto_approve_below) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(name, entity_type, min_amount || 0, max_amount || null, required_role || 'manager', auto_approve_below || 0);
  res.json({ id: result.lastInsertRowid, message: 'Workflow created' });
});

// GET /api/ap/dashboard
router.get('/dashboard', (req, res) => {
  const db = getDb();

  const pendingApproval = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM ap_invoices WHERE approval_status = 'pending'").get();
  const unpaid = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(balance_due), 0) as total FROM ap_invoices WHERE status != 'paid'").get();
  const overdue = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(balance_due), 0) as total FROM ap_invoices WHERE due_date < date('now') AND status != 'paid'").get();
  const dueSoon = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(balance_due), 0) as total FROM ap_invoices WHERE due_date >= date('now') AND due_date <= date('now', '+7 days') AND status != 'paid'").get();
  const paidThisMonth = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(amount_paid), 0) as total FROM ap_invoices WHERE paid_at >= date('now', 'start of month')").get();

  const topSuppliers = db.prepare(`
    SELECT s.name, COUNT(api.id) as invoice_count, SUM(api.total) as total_billed, SUM(api.balance_due) as outstanding
    FROM ap_invoices api JOIN suppliers s ON api.supplier_id = s.id
    WHERE api.invoice_date >= date('now', '-90 days')
    GROUP BY s.id ORDER BY total_billed DESC LIMIT 10
  `).all();

  res.json({ pending_approval: pendingApproval, unpaid, overdue, due_soon: dueSoon, paid_this_month: paidThisMonth, top_suppliers: topSuppliers });
});

module.exports = router;
