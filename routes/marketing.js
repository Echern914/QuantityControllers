const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// ============================================================
// CAMPAIGNS
// ============================================================

// GET /api/marketing/campaigns
router.get('/campaigns', (req, res) => {
  const db = getDb();
  const { status } = req.query;
  let sql = 'SELECT * FROM marketing_campaigns WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/marketing/campaigns/:id
router.get('/campaigns/:id', (req, res) => {
  const db = getDb();
  const campaign = db.prepare('SELECT * FROM marketing_campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  campaign.promotions = db.prepare('SELECT * FROM promotions WHERE campaign_id = ?').all(req.params.id);
  res.json(campaign);
});

// POST /api/marketing/campaigns
router.post('/campaigns', (req, res) => {
  const db = getDb();
  const { name, campaign_type, target_audience, audience_filter, subject, content, template, send_date, budget, created_by } = req.body;
  if (!name) return res.status(400).json({ error: 'Campaign name required' });

  const result = db.prepare(`
    INSERT INTO marketing_campaigns (name, campaign_type, target_audience, audience_filter, subject, content, template, send_date, budget, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, campaign_type || 'email', target_audience || 'all', JSON.stringify(audience_filter || {}), subject || '', content || '', template || null, send_date || null, budget || 0, created_by || null);

  res.json({ id: result.lastInsertRowid, message: 'Campaign created' });
});

// PUT /api/marketing/campaigns/:id
router.put('/campaigns/:id', (req, res) => {
  const db = getDb();
  const fields = ['name', 'campaign_type', 'target_audience', 'subject', 'content', 'template', 'send_date', 'budget', 'status'];
  const updates = [];
  const values = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); values.push(req.body[f]); }
  }
  if (req.body.audience_filter) { updates.push('audience_filter = ?'); values.push(JSON.stringify(req.body.audience_filter)); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push("updated_at = datetime('now')");
  values.push(req.params.id);
  db.prepare(`UPDATE marketing_campaigns SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ message: 'Campaign updated' });
});

// POST /api/marketing/campaigns/:id/send
router.post('/campaigns/:id/send', (req, res) => {
  const db = getDb();
  const campaign = db.prepare('SELECT * FROM marketing_campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  // Count target audience
  let recipientCount = 0;
  const audienceFilter = JSON.parse(campaign.audience_filter || '{}');

  if (campaign.target_audience === 'all') {
    recipientCount = db.prepare("SELECT COUNT(*) as c FROM customers WHERE email IS NOT NULL AND email != ''").get().c;
  } else if (campaign.target_audience === 'vip') {
    recipientCount = db.prepare("SELECT COUNT(*) as c FROM customers WHERE email IS NOT NULL AND vip_tier != 'regular'").get().c;
  } else if (campaign.target_audience === 'inactive') {
    recipientCount = db.prepare("SELECT COUNT(*) as c FROM customers WHERE email IS NOT NULL AND (last_visit_at IS NULL OR last_visit_at < date('now', '-30 days'))").get().c;
  } else if (campaign.target_audience === 'birthday') {
    recipientCount = db.prepare("SELECT COUNT(*) as c FROM customers WHERE email IS NOT NULL AND strftime('%m-%d', birthday) = strftime('%m-%d', 'now')").get().c;
  } else {
    recipientCount = db.prepare("SELECT COUNT(*) as c FROM customers WHERE email IS NOT NULL").get().c;
  }

  db.prepare(`UPDATE marketing_campaigns SET status = 'sent', sent_at = datetime('now'), recipients_count = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(recipientCount, req.params.id);

  res.json({ recipients: recipientCount, message: `Campaign sent to ${recipientCount} recipients` });
});

// ============================================================
// PROMOTIONS
// ============================================================

// GET /api/marketing/promotions
router.get('/promotions', (req, res) => {
  const db = getDb();
  const { active } = req.query;
  let sql = 'SELECT * FROM promotions WHERE 1=1';
  const params = [];
  if (active === 'true') { sql += " AND active = 1 AND (end_date IS NULL OR end_date >= date('now'))"; }
  sql += ' ORDER BY created_at DESC';

  const promos = db.prepare(sql).all(...params);
  for (const p of promos) {
    try { p.applicable_items = JSON.parse(p.applicable_items); } catch { p.applicable_items = []; }
    try { p.applicable_categories = JSON.parse(p.applicable_categories); } catch { p.applicable_categories = []; }
    try { p.days_of_week = JSON.parse(p.days_of_week); } catch { p.days_of_week = []; }
  }
  res.json(promos);
});

// POST /api/marketing/promotions
router.post('/promotions', (req, res) => {
  const db = getDb();
  const { name, code, promotion_type, discount_type, discount_value, min_order_amount, max_discount, applicable_items, applicable_categories, start_date, end_date, start_time, end_time, days_of_week, max_uses, max_uses_per_customer, stackable, campaign_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Promotion name required' });

  const promoCode = code || name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10).toUpperCase();

  const result = db.prepare(`
    INSERT INTO promotions (name, code, promotion_type, discount_type, discount_value, min_order_amount, max_discount, applicable_items, applicable_categories, start_date, end_date, start_time, end_time, days_of_week, max_uses, max_uses_per_customer, stackable, campaign_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, promoCode, promotion_type || 'discount', discount_type || 'percent', discount_value || 0, min_order_amount || 0, max_discount || null, JSON.stringify(applicable_items || []), JSON.stringify(applicable_categories || []), start_date || null, end_date || null, start_time || null, end_time || null, JSON.stringify(days_of_week || []), max_uses || null, max_uses_per_customer || null, stackable ? 1 : 0, campaign_id || null);

  res.json({ id: result.lastInsertRowid, code: promoCode, message: 'Promotion created' });
});

// POST /api/marketing/promotions/validate
router.post('/promotions/validate', (req, res) => {
  const db = getDb();
  const { code, order_total, customer_id } = req.body;
  if (!code) return res.status(400).json({ error: 'Promo code required' });

  const promo = db.prepare("SELECT * FROM promotions WHERE code = ? AND active = 1").get(code.toUpperCase());
  if (!promo) return res.status(404).json({ error: 'Invalid promo code' });

  // Check dates
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (promo.start_date && today < promo.start_date) return res.status(400).json({ error: 'Promotion not yet active' });
  if (promo.end_date && today > promo.end_date) return res.status(400).json({ error: 'Promotion expired' });

  // Check max uses
  if (promo.max_uses && promo.uses_count >= promo.max_uses) return res.status(400).json({ error: 'Promotion usage limit reached' });

  // Check per-customer limit
  if (promo.max_uses_per_customer && customer_id) {
    const customerUses = db.prepare('SELECT COUNT(*) as c FROM promotion_uses WHERE promotion_id = ? AND customer_id = ?').get(promo.id, customer_id).c;
    if (customerUses >= promo.max_uses_per_customer) return res.status(400).json({ error: 'You have already used this promotion' });
  }

  // Check min order
  if (promo.min_order_amount && (order_total || 0) < promo.min_order_amount) {
    return res.status(400).json({ error: `Minimum order of $${promo.min_order_amount} required` });
  }

  // Calculate discount
  let discount = 0;
  if (promo.discount_type === 'percent') {
    discount = (order_total || 0) * (promo.discount_value / 100);
    if (promo.max_discount) discount = Math.min(discount, promo.max_discount);
  } else {
    discount = promo.discount_value;
  }

  res.json({ valid: true, promotion: promo, discount: +discount.toFixed(2), message: `${promo.name}: $${discount.toFixed(2)} off` });
});

// POST /api/marketing/promotions/:id/apply
router.post('/promotions/:id/apply', (req, res) => {
  const db = getDb();
  const { order_id, customer_id, discount_amount } = req.body;
  db.prepare('INSERT INTO promotion_uses (promotion_id, order_id, customer_id, discount_amount) VALUES (?, ?, ?, ?)')
    .run(req.params.id, order_id, customer_id || null, discount_amount || 0);
  db.prepare('UPDATE promotions SET uses_count = uses_count + 1 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Promotion applied' });
});

// ============================================================
// EMAIL LISTS
// ============================================================

// GET /api/marketing/email-lists
router.get('/email-lists', (req, res) => {
  const db = getDb();
  const lists = db.prepare('SELECT * FROM email_lists ORDER BY name').all();
  for (const list of lists) {
    list.subscriber_count = db.prepare("SELECT COUNT(*) as c FROM email_subscribers WHERE list_id = ? AND status = 'subscribed'").get(list.id).c;
  }
  res.json(lists);
});

// POST /api/marketing/email-lists
router.post('/email-lists', (req, res) => {
  const db = getDb();
  const { name, description, segment_rules } = req.body;
  if (!name) return res.status(400).json({ error: 'List name required' });
  const result = db.prepare('INSERT INTO email_lists (name, description, segment_rules) VALUES (?, ?, ?)').run(name, description || '', JSON.stringify(segment_rules || {}));
  res.json({ id: result.lastInsertRowid, message: 'Email list created' });
});

// POST /api/marketing/email-lists/:id/subscribe
router.post('/email-lists/:id/subscribe', (req, res) => {
  const db = getDb();
  const { email, first_name, customer_id } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    db.prepare('INSERT INTO email_subscribers (list_id, customer_id, email, first_name) VALUES (?, ?, ?, ?)').run(req.params.id, customer_id || null, email, first_name || null);
    res.json({ message: 'Subscribed' });
  } catch (err) {
    res.json({ message: 'Already subscribed' });
  }
});

// POST /api/marketing/email-lists/:id/auto-populate
router.post('/email-lists/:id/auto-populate', (req, res) => {
  const db = getDb();
  const { segment } = req.body;

  let customers;
  if (segment === 'vip') {
    customers = db.prepare("SELECT * FROM customers WHERE email IS NOT NULL AND email != '' AND vip_tier != 'regular'").all();
  } else if (segment === 'recent') {
    customers = db.prepare("SELECT * FROM customers WHERE email IS NOT NULL AND email != '' AND last_visit_at >= date('now', '-30 days')").all();
  } else {
    customers = db.prepare("SELECT * FROM customers WHERE email IS NOT NULL AND email != ''").all();
  }

  const insert = db.prepare('INSERT OR IGNORE INTO email_subscribers (list_id, customer_id, email, first_name) VALUES (?, ?, ?, ?)');
  let added = 0;
  for (const c of customers) {
    const result = insert.run(req.params.id, c.id, c.email, c.first_name);
    if (result.changes > 0) added++;
  }

  res.json({ added, total_customers: customers.length, message: `${added} subscribers added` });
});

// ============================================================
// MARKETING DASHBOARD
// ============================================================

// GET /api/marketing/dashboard
router.get('/dashboard', (req, res) => {
  const db = getDb();

  const activeCampaigns = db.prepare("SELECT COUNT(*) as c FROM marketing_campaigns WHERE status IN ('active', 'sent')").get().c;
  const activePromos = db.prepare("SELECT COUNT(*) as c FROM promotions WHERE active = 1 AND (end_date IS NULL OR end_date >= date('now'))").get().c;
  const totalSent = db.prepare("SELECT COALESCE(SUM(recipients_count), 0) as c FROM marketing_campaigns WHERE status = 'sent'").get().c;
  const totalConversions = db.prepare("SELECT COALESCE(SUM(conversions_count), 0) as c FROM marketing_campaigns").get().c;
  const revenueGenerated = db.prepare("SELECT COALESCE(SUM(revenue_generated), 0) as r FROM marketing_campaigns").get().r;
  const promoUses = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(discount_amount), 0) as total FROM promotion_uses WHERE used_at >= date('now', '-30 days')").get();

  const recentCampaigns = db.prepare("SELECT id, name, campaign_type, status, recipients_count, opens_count, conversions_count, sent_at FROM marketing_campaigns ORDER BY created_at DESC LIMIT 5").all();

  const customerSegments = {
    total: db.prepare("SELECT COUNT(*) as c FROM customers WHERE email IS NOT NULL").get().c,
    vip: db.prepare("SELECT COUNT(*) as c FROM customers WHERE vip_tier != 'regular'").get().c,
    active: db.prepare("SELECT COUNT(*) as c FROM customers WHERE last_visit_at >= date('now', '-30 days')").get().c,
    lapsed: db.prepare("SELECT COUNT(*) as c FROM customers WHERE last_visit_at < date('now', '-60 days') OR last_visit_at IS NULL").get().c,
  };

  res.json({
    active_campaigns: activeCampaigns, active_promotions: activePromos, total_emails_sent: totalSent,
    total_conversions: totalConversions, revenue_generated: +revenueGenerated.toFixed(2),
    promo_uses_30d: promoUses.c, promo_discount_30d: +promoUses.total.toFixed(2),
    recent_campaigns: recentCampaigns, customer_segments: customerSegments,
  });
});

module.exports = router;
