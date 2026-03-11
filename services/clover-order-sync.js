/* ============================================================
   VENUECORE - Clover Order Sync Service
   Polls Clover for new orders and auto-deducts inventory
   ============================================================ */
const { getDb } = require('../db/database');
const clover = require('./clover');
const { deductForOrder } = require('./deduction');

let pollInterval = null;
let broadcastFn = null;
let lastPollTimestamp = null;

function setBroadcast(fn) {
  broadcastFn = fn;
}

function startPolling(intervalSeconds = 10) {
  if (pollInterval) clearInterval(pollInterval);

  // Initialize last poll timestamp to now (don't process historical orders)
  lastPollTimestamp = Date.now();

  pollInterval = setInterval(() => pollCloverOrders(), intervalSeconds * 1000);
  console.log(`[Clover Order Sync] Polling every ${intervalSeconds}s for new orders`);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function pollCloverOrders() {
  try {
    const merchantId = clover.getActiveMerchantId();
    if (!merchantId) return;

    const token = clover.getAccessToken(merchantId);
    if (!token) return;

    // Fetch recent orders from Clover (last 30 seconds window)
    const orders = await clover.getCloverOrders(merchantId, {
      filter: `createdTime>${lastPollTimestamp}`
    });

    lastPollTimestamp = Date.now();

    if (!orders || orders.length === 0) return;

    const db = getDb();

    for (const cloverOrder of orders) {
      // Skip if already processed
      const existing = db.prepare(`SELECT id FROM transactions WHERE clover_order_id = ? LIMIT 1`).get(cloverOrder.id);
      if (existing) continue;

      // Only process paid/completed orders
      if (cloverOrder.state !== 'locked' && cloverOrder.paymentState !== 'PAID') continue;

      const lineItems = cloverOrder.lineItems?.elements || [];
      if (lineItems.length === 0) continue;

      // Map Clover line items to local menu items
      const orderItems = [];
      for (const li of lineItems) {
        let menuItem = null;

        // Match by Clover item ID
        if (li.item?.id) {
          menuItem = db.prepare(`SELECT * FROM menu_items WHERE clover_item_id = ? AND active = 1`).get(li.item.id);
        }

        // Fallback: match by name
        if (!menuItem && li.name) {
          menuItem = db.prepare(`SELECT * FROM menu_items WHERE name = ? AND active = 1`).get(li.name);
        }

        if (menuItem) {
          const qty = li.unitQty ? li.unitQty / 1000 : 1; // Clover uses 1/1000 units
          orderItems.push({
            menu_item_id: menuItem.id,
            quantity: qty,
            name: menuItem.name,
          });
        }
      }

      if (orderItems.length === 0) continue;

      // Create local order record
      const orderResult = db.prepare(`
        INSERT INTO orders (order_number, order_type, status, notes, clover_order_id)
        VALUES (?, 'clover', 'closed', ?, ?)
      `).run(
        `CLV-${cloverOrder.id.slice(-8)}`,
        `Auto-synced from Clover`,
        cloverOrder.id
      );

      const orderId = Number(orderResult.lastInsertRowid);

      // Insert order items
      for (const item of orderItems) {
        const mi = db.prepare(`SELECT price FROM menu_items WHERE id = ?`).get(item.menu_item_id);
        db.prepare(`INSERT INTO order_items (order_id, menu_item_id, name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`)
          .run(orderId, item.menu_item_id, item.name, item.quantity, mi?.price || 0);
      }

      // Run deduction
      const deductionResults = deductForOrder(orderId, orderItems, null);

      // Tag transactions
      db.prepare(`UPDATE transactions SET clover_order_id = ? WHERE order_id = ?`).run(cloverOrder.id, orderId);

      // Broadcast real-time update
      if (broadcastFn) {
        broadcastFn({
          type: 'stock_deduction',
          source: 'clover',
          order_number: `CLV-${cloverOrder.id.slice(-8)}`,
          deductions: deductionResults,
          timestamp: new Date().toISOString(),
        });
      }

      console.log(`[Clover Order Sync] Processed order ${cloverOrder.id}: ${deductionResults.length} ingredients deducted`);
    }
  } catch (err) {
    // Don't spam logs for expected connection errors
    if (!err.message?.includes('No access token') && !err.message?.includes('ECONNREFUSED')) {
      console.error('[Clover Order Sync] Error:', err.message);
    }
  }
}

module.exports = { startPolling, stopPolling, setBroadcast, pollCloverOrders };
