/* ============================================================
   VENUECORE - Clover App Market Routes
   OAuth 2.0, Sync, Webhooks
   ============================================================ */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDb } = require('../db/database');
const clover = require('../services/clover');

// ============================================================
// OAuth 2.0 Flow
// ============================================================

// GET /api/clover/oauth/authorize - Start OAuth flow
router.get('/oauth/authorize', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  // Store state in a cookie or session for validation
  res.json({ url: clover.getAuthorizationUrl(state), state });
});

// GET /api/clover/oauth/callback - OAuth callback from Clover
router.get('/oauth/callback', async (req, res) => {
  const { code, merchant_id, state } = req.query;

  if (!code || !merchant_id) {
    return res.status(400).send('Missing code or merchant_id');
  }

  try {
    // Exchange authorization code for access token
    const tokenData = await clover.exchangeCodeForToken(code);

    // Get merchant info
    let merchantName = 'Unknown';
    try {
      const info = await clover.getMerchantInfo(merchant_id);
      merchantName = info.name || merchantName;
    } catch {}

    // Save merchant
    clover.saveMerchant(merchant_id, tokenData.access_token, merchantName);

    // Redirect to the app's Clover management page
    res.redirect(`/#/clover?installed=true&merchant=${merchant_id}`);
  } catch (err) {
    console.error('[Clover OAuth] Error:', err.message);
    res.redirect(`/#/clover?error=${encodeURIComponent(err.message)}`);
  }
});

// POST /api/clover/oauth/disconnect - Disconnect a merchant
router.post('/oauth/disconnect', (req, res) => {
  const { merchant_id } = req.body;
  if (!merchant_id) return res.status(400).json({ error: 'merchant_id required' });
  clover.removeMerchant(merchant_id);
  res.json({ success: true });
});

// ============================================================
// Connection & Status
// ============================================================

// GET /api/clover/status - Check connection status
router.get('/status', async (req, res) => {
  const merchantId = req.query.merchant_id || clover.getActiveMerchantId();
  if (!merchantId) {
    return res.json({
      connected: false,
      configured: !!(process.env.CLOVER_APP_ID && process.env.CLOVER_APP_SECRET),
      environment: clover.getEnv(),
      merchants: []
    });
  }

  try {
    const result = await clover.testConnection(merchantId);
    const merchants = clover.getAllMerchants();
    res.json({
      ...result,
      configured: true,
      environment: clover.getEnv(),
      merchants: merchants.map(m => ({
        merchant_id: m.merchant_id,
        name: m.merchant_name,
        status: m.status,
        environment: m.environment,
        installed_at: m.installed_at,
        last_sync_at: m.last_sync_at
      }))
    });
  } catch (err) {
    res.json({ connected: false, error: err.message, environment: clover.getEnv() });
  }
});

// POST /api/clover/test - Test connection with specific merchant
router.post('/test', async (req, res) => {
  const merchantId = req.body.merchant_id || clover.getActiveMerchantId();
  if (!merchantId) return res.status(400).json({ error: 'No merchant configured' });

  try {
    const result = await clover.testConnection(merchantId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Menu / Item Sync
// ============================================================

// GET /api/clover/items - Get items from Clover
router.get('/items', async (req, res) => {
  const merchantId = req.query.merchant_id || clover.getActiveMerchantId();
  if (!merchantId) return res.status(400).json({ error: 'No merchant configured' });

  try {
    const items = await clover.getCloverItems(merchantId);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clover/sync/items/push - Push all VenueCore items to Clover
router.post('/sync/items/push', async (req, res) => {
  const merchantId = req.body.merchant_id || clover.getActiveMerchantId();
  if (!merchantId) return res.status(400).json({ error: 'No merchant configured' });

  try {
    const results = await clover.pushAllItemsToClover(merchantId);
    req.app.locals.broadcast({ type: 'notification', notification: { title: 'Clover Sync', message: `Pushed ${results.pushed} items to Clover`, severity: 'info' } });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clover/sync/items/pull - Pull items from Clover into VenueCore
router.post('/sync/items/pull', async (req, res) => {
  const merchantId = req.body.merchant_id || clover.getActiveMerchantId();
  if (!merchantId) return res.status(400).json({ error: 'No merchant configured' });

  try {
    const results = await clover.pullItemsFromClover(merchantId);
    req.app.locals.broadcast({ type: 'notification', notification: { title: 'Clover Sync', message: `Pulled ${results.created + results.updated} items from Clover`, severity: 'info' } });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clover/sync/items/:id/push - Push single item to Clover
router.post('/sync/items/:id/push', async (req, res) => {
  const merchantId = req.body.merchant_id || clover.getActiveMerchantId();
  if (!merchantId) return res.status(400).json({ error: 'No merchant configured' });

  const db = getDb();
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  try {
    const cloverId = await clover.pushItemToClover(merchantId, item);
    res.json({ success: true, clover_id: cloverId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Category Sync
// ============================================================

// GET /api/clover/categories - Get categories from Clover
router.get('/categories', async (req, res) => {
  const merchantId = req.query.merchant_id || clover.getActiveMerchantId();
  if (!merchantId) return res.status(400).json({ error: 'No merchant configured' });

  try {
    const categories = await clover.getCloverCategories(merchantId);
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clover/sync/categories/push - Push categories to Clover
router.post('/sync/categories/push', async (req, res) => {
  const merchantId = req.body.merchant_id || clover.getActiveMerchantId();
  if (!merchantId) return res.status(400).json({ error: 'No merchant configured' });

  const db = getDb();
  const categories = db.prepare('SELECT * FROM menu_categories WHERE active = 1').all();
  const results = { pushed: 0, errors: [] };

  for (const cat of categories) {
    try {
      await clover.pushCategoryToClover(merchantId, cat);
      results.pushed++;
    } catch (err) {
      results.errors.push({ category: cat.name, error: err.message });
    }
  }

  res.json(results);
});

// ============================================================
// Order Sync
// ============================================================

// GET /api/clover/orders - Get orders from Clover
router.get('/orders', async (req, res) => {
  const merchantId = req.query.merchant_id || clover.getActiveMerchantId();
  if (!merchantId) return res.status(400).json({ error: 'No merchant configured' });

  try {
    const orders = await clover.getCloverOrders(merchantId);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clover/sync/orders/:id/push - Push single order to Clover
router.post('/sync/orders/:id/push', async (req, res) => {
  const merchantId = req.body.merchant_id || clover.getActiveMerchantId();
  if (!merchantId) return res.status(400).json({ error: 'No merchant configured' });

  const db = getDb();
  const order = db.prepare(`
    SELECT o.*, e.first_name || ' ' || e.last_name as server_name
    FROM orders o LEFT JOIN employees e ON o.employee_id = e.id WHERE o.id = ?
  `).get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ? AND voided = 0').all(req.params.id);

  try {
    const cloverId = await clover.pushOrderToClover(merchantId, order);
    res.json({ success: true, clover_order_id: cloverId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Inventory Sync
// ============================================================

// GET /api/clover/inventory - Get inventory from Clover
router.get('/inventory', async (req, res) => {
  const merchantId = req.query.merchant_id || clover.getActiveMerchantId();
  if (!merchantId) return res.status(400).json({ error: 'No merchant configured' });

  try {
    const inventory = await clover.getCloverInventory(merchantId);
    res.json(inventory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Employees
// ============================================================

// GET /api/clover/employees - Get employees from Clover
router.get('/employees', async (req, res) => {
  const merchantId = req.query.merchant_id || clover.getActiveMerchantId();
  if (!merchantId) return res.status(400).json({ error: 'No merchant configured' });

  try {
    const employees = await clover.getCloverEmployees(merchantId);
    res.json(employees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Full Sync
// ============================================================

// POST /api/clover/sync/full - Run full bidirectional sync
router.post('/sync/full', async (req, res) => {
  const merchantId = req.body.merchant_id || clover.getActiveMerchantId();
  if (!merchantId) return res.status(400).json({ error: 'No merchant configured' });

  try {
    const results = await clover.fullSync(merchantId);
    req.app.locals.broadcast({ type: 'notification', notification: { title: 'Clover Full Sync', message: `Sync complete: ${results.items.pushed} items pushed, ${results.categories.pushed} categories synced`, severity: 'info' } });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Sync Log
// ============================================================

// GET /api/clover/sync/log - Get sync history
router.get('/sync/log', (req, res) => {
  const merchantId = req.query.merchant_id || clover.getActiveMerchantId();
  if (!merchantId) return res.status(400).json({ error: 'No merchant configured' });

  const limit = parseInt(req.query.limit || '50');
  const log = clover.getSyncLog(merchantId, limit);
  res.json(log);
});

// GET /api/clover/sync/mappings - Get ID mappings
router.get('/sync/mappings', (req, res) => {
  const merchantId = req.query.merchant_id || clover.getActiveMerchantId();
  if (!merchantId) return res.status(400).json({ error: 'No merchant configured' });

  const db = getDb();
  const mappings = db.prepare('SELECT * FROM clover_id_map WHERE merchant_id = ? ORDER BY last_synced_at DESC').all(merchantId);
  res.json(mappings);
});

// ============================================================
// Webhooks
// ============================================================

// POST /api/clover/webhooks - Receive webhook from Clover
router.post('/webhooks', async (req, res) => {
  // Verify webhook signature if configured
  const signature = req.headers['x-clover-hmac'];
  if (process.env.CLOVER_WEBHOOK_SECRET && signature) {
    const expected = crypto.createHmac('sha256', process.env.CLOVER_WEBHOOK_SECRET)
      .update(JSON.stringify(req.body))
      .digest('base64');
    if (signature !== expected) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
  }

  const events = req.body.merchants || {};
  let processed = 0;

  for (const [merchantId, merchantEvents] of Object.entries(events)) {
    for (const event of merchantEvents) {
      const webhookRecord = clover.saveWebhook(merchantId, event.type, event);
      try {
        const webhook = getDb().prepare('SELECT * FROM clover_webhooks WHERE id = ?').get(webhookRecord.lastInsertRowid);
        await clover.processWebhook(webhook);
        processed++;
      } catch (err) {
        console.error(`[Clover Webhook] Error processing ${event.type}:`, err.message);
      }
    }
  }

  req.app.locals.broadcast({ type: 'clover_webhook', processed });
  res.json({ processed });
});

// GET /api/clover/webhooks/history - Get webhook history
router.get('/webhooks/history', (req, res) => {
  const merchantId = req.query.merchant_id || clover.getActiveMerchantId();
  if (!merchantId) return res.status(400).json({ error: 'No merchant configured' });

  const db = getDb();
  const limit = parseInt(req.query.limit || '50');
  const webhooks = db.prepare('SELECT * FROM clover_webhooks WHERE merchant_id = ? ORDER BY received_at DESC LIMIT ?').all(merchantId, limit);
  res.json(webhooks);
});

// ============================================================
// App Market Required Endpoints
// ============================================================

// POST /api/clover/app/installed - Called when merchant installs app
router.post('/app/installed', async (req, res) => {
  const { merchant_id, access_token } = req.body;
  if (!merchant_id || !access_token) {
    return res.status(400).json({ error: 'merchant_id and access_token required' });
  }

  let merchantName = 'Unknown';
  try {
    const info = await clover.getMerchantInfo(merchant_id);
    merchantName = info.name || merchantName;
  } catch {}

  clover.saveMerchant(merchant_id, access_token, merchantName);
  res.json({ success: true });
});

// POST /api/clover/app/uninstalled - Called when merchant uninstalls app
router.post('/app/uninstalled', (req, res) => {
  const { merchant_id } = req.body;
  if (merchant_id) {
    clover.removeMerchant(merchant_id);
  }
  res.json({ success: true });
});

// GET /api/clover/config - Get current Clover config (safe, no secrets)
router.get('/config', (req, res) => {
  res.json({
    environment: clover.getEnv(),
    appId: process.env.CLOVER_APP_ID ? '***configured***' : null,
    appSecret: process.env.CLOVER_APP_SECRET ? '***configured***' : null,
    redirectUri: process.env.CLOVER_REDIRECT_URI || `http://localhost:${process.env.PORT || 4000}/api/clover/oauth/callback`,
    webhookUrl: `${req.protocol}://${req.get('host')}/api/clover/webhooks`,
    devMerchantId: process.env.CLOVER_MERCHANT_ID || null,
    hasDevToken: !!process.env.CLOVER_API_TOKEN,
  });
});

module.exports = router;
