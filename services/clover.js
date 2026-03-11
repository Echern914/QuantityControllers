/* ============================================================
   VENUECORE - Clover App Market Integration Service
   Multi-tenant OAuth2 + REST API client
   ============================================================ */
const { getDb } = require('../db/database');

const CLOVER_ENVIRONMENTS = {
  sandbox: {
    apiBase: 'https://sandbox.dev.clover.com',
    appBase: 'https://sandbox.dev.clover.com',
    oauthBase: 'https://sandbox.dev.clover.com/oauth'
  },
  production: {
    apiBase: 'https://api.clover.com',
    appBase: 'https://www.clover.com',
    oauthBase: 'https://www.clover.com/oauth'
  }
};

function getEnv() {
  return process.env.CLOVER_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
}

function getUrls() {
  return CLOVER_ENVIRONMENTS[getEnv()];
}

// ---- OAuth 2.0 ----

function getAuthorizationUrl(state) {
  const urls = getUrls();
  const clientId = process.env.CLOVER_APP_ID;
  const redirectUri = process.env.CLOVER_REDIRECT_URI || `http://localhost:${process.env.PORT || 4000}/api/clover/oauth/callback`;
  return `${urls.oauthBase}/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
}

async function exchangeCodeForToken(code) {
  const urls = getUrls();
  const clientId = process.env.CLOVER_APP_ID;
  const clientSecret = process.env.CLOVER_APP_SECRET;

  const response = await fetch(`${urls.oauthBase}/token?client_id=${clientId}&client_secret=${clientSecret}&code=${code}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth token exchange failed: ${response.status} - ${text}`);
  }
  return response.json();
}

// ---- Merchant Management ----

function saveMerchant(merchantId, accessToken, merchantName) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM clover_merchants WHERE merchant_id = ?').get(merchantId);
  if (existing) {
    db.prepare(`UPDATE clover_merchants SET access_token = ?, merchant_name = ?, status = 'active', updated_at = datetime('now') WHERE merchant_id = ?`)
      .run(accessToken, merchantName, merchantId);
    return existing.id;
  }
  const result = db.prepare(`INSERT INTO clover_merchants (merchant_id, merchant_name, access_token, environment) VALUES (?, ?, ?, ?)`)
    .run(merchantId, merchantName, accessToken, getEnv());
  return result.lastInsertRowid;
}

function getMerchant(merchantId) {
  const db = getDb();
  return db.prepare('SELECT * FROM clover_merchants WHERE merchant_id = ? AND status = ?').get(merchantId, 'active');
}

function getAllMerchants() {
  const db = getDb();
  return db.prepare('SELECT * FROM clover_merchants ORDER BY installed_at DESC').all();
}

function removeMerchant(merchantId) {
  const db = getDb();
  db.prepare(`UPDATE clover_merchants SET status = 'uninstalled', updated_at = datetime('now') WHERE merchant_id = ?`).run(merchantId);
}

function ensureDevMerchant() {
  // Auto-register the dev merchant from .env into the clover_merchants table
  const merchantId = process.env.CLOVER_MERCHANT_ID;
  const token = process.env.CLOVER_API_TOKEN;
  if (!merchantId || !token) return;
  const db = getDb();
  const existing = db.prepare('SELECT id FROM clover_merchants WHERE merchant_id = ?').get(merchantId);
  if (!existing) {
    db.prepare(`INSERT INTO clover_merchants (merchant_id, merchant_name, access_token, environment, status) VALUES (?, ?, ?, ?, 'active')`)
      .run(merchantId, 'Dev Merchant', token, getEnv());
  }
}

function getActiveMerchantId() {
  // For single-merchant dev mode, use .env; for multi-tenant, pick active
  if (process.env.CLOVER_MERCHANT_ID) {
    ensureDevMerchant();
    return process.env.CLOVER_MERCHANT_ID;
  }
  const db = getDb();
  const m = db.prepare(`SELECT merchant_id FROM clover_merchants WHERE status = 'active' ORDER BY installed_at DESC LIMIT 1`).get();
  return m?.merchant_id;
}

function getAccessToken(merchantId) {
  // Dev mode: use env token
  if (process.env.CLOVER_API_TOKEN && merchantId === process.env.CLOVER_MERCHANT_ID) {
    return process.env.CLOVER_API_TOKEN;
  }
  const m = getMerchant(merchantId);
  return m?.access_token;
}

// ---- API Client ----

async function cloverApi(merchantId, method, path, body) {
  const token = getAccessToken(merchantId);
  if (!token) throw new Error(`No access token for merchant ${merchantId}`);

  const urls = getUrls();
  const url = `${urls.apiBase}/v3/merchants/${merchantId}${path}`;

  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);

  const response = await fetch(url, opts);

  if (response.status === 429) {
    // Rate limited - wait and retry once
    const retryAfter = parseInt(response.headers.get('Retry-After') || '2') * 1000;
    await new Promise(r => setTimeout(r, retryAfter));
    return cloverApi(merchantId, method, path, body);
  }

  if (!response.ok) {
    const text = await response.text();
    logSync(merchantId, method, 'api_call', null, null, null, 'error', text);
    throw new Error(`Clover API ${method} ${path}: ${response.status} - ${text}`);
  }

  const data = response.status === 204 ? null : await response.json();
  return data;
}

// Convenience wrappers
const api = {
  get: (mid, path) => cloverApi(mid, 'GET', path),
  post: (mid, path, body) => cloverApi(mid, 'POST', path, body),
  put: (mid, path, body) => cloverApi(mid, 'PUT', path, body),
  delete: (mid, path) => cloverApi(mid, 'DELETE', path),
};

// ---- Merchant Info ----

async function getMerchantInfo(merchantId) {
  return api.get(merchantId, '');
}

// ---- Menu / Items Sync ----

async function getCloverItems(merchantId) {
  const data = await api.get(merchantId, '/items?expand=categories,modifierGroups&limit=1000');
  return data.elements || [];
}

async function pushItemToClover(merchantId, localItem) {
  const cloverItem = {
    name: localItem.name,
    price: Math.round(localItem.price * 100), // Clover uses cents
    priceType: 'FIXED',
    defaultTaxRates: true,
  };

  // Check if already mapped
  const existing = getIdMapping(merchantId, 'menu_item', localItem.id);
  if (existing) {
    // Update existing
    await api.put(merchantId, `/items/${existing.clover_id}`, cloverItem);
    updateSyncTimestamp(merchantId, 'menu_item', localItem.id);
    logSync(merchantId, 'push', 'menu_item', null, localItem.id, existing.clover_id, 'success');
    return existing.clover_id;
  }

  // Create new
  const result = await api.post(merchantId, '/items', cloverItem);
  saveIdMapping(merchantId, 'menu_item', localItem.id, result.id);
  logSync(merchantId, 'push', 'menu_item', null, localItem.id, result.id, 'success');

  // Update local record with clover_item_id
  const db = getDb();
  db.prepare('UPDATE menu_items SET clover_item_id = ? WHERE id = ?').run(result.id, localItem.id);

  return result.id;
}

async function pullItemsFromClover(merchantId) {
  const cloverItems = await getCloverItems(merchantId);
  const db = getDb();
  const results = { created: 0, updated: 0, skipped: 0 };

  for (const ci of cloverItems) {
    const existing = getIdMappingByClover(merchantId, 'menu_item', ci.id);
    if (existing) {
      // Update local item
      db.prepare('UPDATE menu_items SET name = ?, price = ? WHERE id = ?')
        .run(ci.name, ci.price / 100, existing.local_id);
      updateSyncTimestamp(merchantId, 'menu_item', existing.local_id);
      results.updated++;
    } else {
      // Create local item
      const result = db.prepare('INSERT INTO menu_items (name, price, clover_item_id) VALUES (?, ?, ?)')
        .run(ci.name, ci.price / 100, ci.id);
      saveIdMapping(merchantId, 'menu_item', result.lastInsertRowid, ci.id);
      results.created++;
    }
  }

  logSync(merchantId, 'pull', 'menu_items_bulk', null, null, null, 'success', JSON.stringify(results));
  return results;
}

async function pushAllItemsToClover(merchantId) {
  const db = getDb();
  const items = db.prepare('SELECT * FROM menu_items WHERE active = 1').all();
  const results = { pushed: 0, errors: [] };

  for (const item of items) {
    try {
      await pushItemToClover(merchantId, item);
      results.pushed++;
    } catch (err) {
      results.errors.push({ item: item.name, error: err.message });
    }
  }

  return results;
}

// ---- Order Sync ----

async function pushOrderToClover(merchantId, localOrder) {
  // Create order in Clover
  const cloverOrder = {
    state: localOrder.status === 'open' ? 'open' : 'locked',
    total: Math.round(localOrder.total * 100),
    note: localOrder.notes || undefined,
  };

  const existing = getIdMapping(merchantId, 'order', localOrder.id);
  if (existing) {
    await api.put(merchantId, `/orders/${existing.clover_id}`, cloverOrder);
    return existing.clover_id;
  }

  const result = await api.post(merchantId, '/orders', cloverOrder);
  saveIdMapping(merchantId, 'order', localOrder.id, result.id);

  // Update local record
  const db = getDb();
  db.prepare('UPDATE orders SET clover_order_id = ? WHERE id = ?').run(result.id, localOrder.id);

  // Push line items
  if (localOrder.items) {
    for (const item of localOrder.items) {
      const itemMapping = getIdMapping(merchantId, 'menu_item', item.menu_item_id);
      if (itemMapping) {
        await api.post(merchantId, `/orders/${result.id}/line_items`, {
          item: { id: itemMapping.clover_id },
          name: item.name,
          price: Math.round(item.unit_price * 100),
          qty: item.quantity * 1000 // Clover uses units of 1/1000
        });
      }
    }
  }

  logSync(merchantId, 'push', 'order', null, localOrder.id, result.id, 'success');
  return result.id;
}

async function getCloverOrders(merchantId, params = {}) {
  let path = '/orders?expand=lineItems&orderBy=createdTime+DESC&limit=50';
  if (params.filter) path += `&filter=${params.filter}`;
  const data = await api.get(merchantId, path);
  return data.elements || [];
}

// ---- Payment Sync ----

async function getCloverPayments(merchantId, orderId) {
  const data = await api.get(merchantId, `/orders/${orderId}/payments`);
  return data.elements || [];
}

async function recordCloverPayment(merchantId, cloverOrderId, payment) {
  // Record a payment on a Clover order
  const paymentData = {
    order: { id: cloverOrderId },
    amount: Math.round(payment.amount * 100),
    tipAmount: Math.round((payment.tip || 0) * 100),
    result: 'SUCCESS',
  };
  return api.post(merchantId, `/orders/${cloverOrderId}/payments`, paymentData);
}

// ---- Inventory Sync ----

async function getCloverInventory(merchantId) {
  const data = await api.get(merchantId, '/item_stocks?limit=1000');
  return data.elements || [];
}

async function updateCloverStock(merchantId, cloverItemId, quantity) {
  return api.post(merchantId, `/item_stocks/${cloverItemId}`, {
    quantity: quantity,
    stockCount: quantity
  });
}

// ---- Category Sync ----

async function getCloverCategories(merchantId) {
  const data = await api.get(merchantId, '/categories?limit=500');
  return data.elements || [];
}

async function pushCategoryToClover(merchantId, localCategory) {
  const existing = getIdMapping(merchantId, 'category', localCategory.id);
  if (existing) {
    await api.put(merchantId, `/categories/${existing.clover_id}`, { name: localCategory.name });
    return existing.clover_id;
  }

  const result = await api.post(merchantId, '/categories', { name: localCategory.name });
  saveIdMapping(merchantId, 'category', localCategory.id, result.id);
  return result.id;
}

// ---- Employees ----

async function getCloverEmployees(merchantId) {
  const data = await api.get(merchantId, '/employees?limit=500');
  return data.elements || [];
}

// ---- ID Mapping ----

function saveIdMapping(merchantId, entityType, localId, cloverId) {
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO clover_id_map (merchant_id, entity_type, local_id, clover_id, last_synced_at) VALUES (?, ?, ?, ?, datetime('now'))`)
    .run(merchantId, entityType, localId, cloverId);
}

function getIdMapping(merchantId, entityType, localId) {
  const db = getDb();
  return db.prepare('SELECT * FROM clover_id_map WHERE merchant_id = ? AND entity_type = ? AND local_id = ?')
    .get(merchantId, entityType, localId);
}

function getIdMappingByClover(merchantId, entityType, cloverId) {
  const db = getDb();
  return db.prepare('SELECT * FROM clover_id_map WHERE merchant_id = ? AND entity_type = ? AND clover_id = ?')
    .get(merchantId, entityType, cloverId);
}

function updateSyncTimestamp(merchantId, entityType, localId) {
  const db = getDb();
  db.prepare(`UPDATE clover_id_map SET last_synced_at = datetime('now') WHERE merchant_id = ? AND entity_type = ? AND local_id = ?`)
    .run(merchantId, entityType, localId);
}

// ---- Sync Logging ----

function logSync(merchantId, syncType, entityType, entityId, localId, cloverId, status, detail) {
  const db = getDb();
  db.prepare(`INSERT INTO clover_sync_log (merchant_id, sync_type, entity_type, entity_id, local_id, clover_id, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(merchantId, syncType, entityType, entityId, localId, cloverId, status, detail);
}

function getSyncLog(merchantId, limit = 50) {
  const db = getDb();
  return db.prepare('SELECT * FROM clover_sync_log WHERE merchant_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(merchantId, limit);
}

// ---- Webhook Processing ----

function saveWebhook(merchantId, eventType, payload) {
  const db = getDb();
  return db.prepare('INSERT INTO clover_webhooks (merchant_id, event_type, payload) VALUES (?, ?, ?)')
    .run(merchantId, eventType, JSON.stringify(payload));
}

async function processWebhook(webhook) {
  const db = getDb();
  try {
    const payload = JSON.parse(webhook.payload);
    const merchantId = webhook.merchant_id;

    switch (webhook.event_type) {
      case 'items.created':
      case 'items.updated':
        // Pull updated item from Clover
        if (payload.objectId) {
          const item = await api.get(merchantId, `/items/${payload.objectId}`);
          const mapping = getIdMappingByClover(merchantId, 'menu_item', payload.objectId);
          if (mapping) {
            db.prepare('UPDATE menu_items SET name = ?, price = ? WHERE id = ?')
              .run(item.name, item.price / 100, mapping.local_id);
          }
        }
        break;

      case 'items.deleted':
        if (payload.objectId) {
          const mapping = getIdMappingByClover(merchantId, 'menu_item', payload.objectId);
          if (mapping) {
            db.prepare('UPDATE menu_items SET active = 0 WHERE id = ?').run(mapping.local_id);
          }
        }
        break;

      case 'orders.created':
      case 'orders.updated':
        // Could pull and sync order
        break;

      case 'payments.created':
        // Payment received on Clover side
        break;

      case 'app.uninstalled':
        removeMerchant(merchantId);
        break;
    }

    db.prepare(`UPDATE clover_webhooks SET processed = 1, processed_at = datetime('now') WHERE id = ?`).run(webhook.id);
  } catch (err) {
    db.prepare(`UPDATE clover_webhooks SET error_message = ? WHERE id = ?`).run(err.message, webhook.id);
    throw err;
  }
}

// ---- Full Sync ----

async function fullSync(merchantId) {
  const results = {
    merchant: null,
    items: { pushed: 0, pulled: 0, errors: [] },
    categories: { pushed: 0, errors: [] },
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  // Get merchant info
  try {
    results.merchant = await getMerchantInfo(merchantId);
  } catch (err) {
    results.merchant = { error: err.message };
  }

  // Push categories
  const db = getDb();
  const localCategories = db.prepare('SELECT * FROM menu_categories WHERE active = 1').all();
  for (const cat of localCategories) {
    try {
      await pushCategoryToClover(merchantId, cat);
      results.categories.pushed++;
    } catch (err) {
      results.categories.errors.push({ category: cat.name, error: err.message });
    }
  }

  // Push menu items
  const pushResults = await pushAllItemsToClover(merchantId);
  results.items.pushed = pushResults.pushed;
  results.items.errors = pushResults.errors;

  // Update last sync timestamp
  db.prepare(`UPDATE clover_merchants SET last_sync_at = datetime('now') WHERE merchant_id = ?`).run(merchantId);

  results.completedAt = new Date().toISOString();
  logSync(merchantId, 'full_sync', 'all', null, null, null, 'success', JSON.stringify(results));
  return results;
}

// ---- Connection Test ----

async function testConnection(merchantId) {
  try {
    const info = await getMerchantInfo(merchantId);
    return { connected: true, merchant: info.name, id: info.id };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

module.exports = {
  getUrls,
  getEnv,
  ensureDevMerchant,
  getAuthorizationUrl,
  exchangeCodeForToken,
  saveMerchant,
  getMerchant,
  getAllMerchants,
  removeMerchant,
  getActiveMerchantId,
  getAccessToken,
  api,
  getMerchantInfo,
  getCloverItems,
  pushItemToClover,
  pullItemsFromClover,
  pushAllItemsToClover,
  pushOrderToClover,
  getCloverOrders,
  getCloverPayments,
  recordCloverPayment,
  getCloverInventory,
  updateCloverStock,
  getCloverCategories,
  pushCategoryToClover,
  getCloverEmployees,
  saveIdMapping,
  getIdMapping,
  getIdMappingByClover,
  getSyncLog,
  saveWebhook,
  processWebhook,
  fullSync,
  testConnection,
};
