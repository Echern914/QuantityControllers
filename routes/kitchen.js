const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// GET /api/kitchen/queue
router.get('/queue', (req, res) => {
  const db = getDb();
  const { station } = req.query;

  let sql = `SELECT kq.*, oi.name as item_name, oi.quantity, oi.modifiers, oi.special_instructions,
             oi.course, oi.seat_number, o.order_number, o.order_type, t.name as table_name,
             ROUND((julianday('now') - julianday(kq.queued_at)) * 1440) as minutes_waiting
             FROM kitchen_queue kq
             JOIN order_items oi ON kq.order_item_id = oi.id
             JOIN orders o ON kq.order_id = o.id
             LEFT JOIN tables t ON o.table_id = t.id
             WHERE kq.status IN ('queued', 'preparing')`;

  const params = [];
  if (station) { sql += ' AND kq.station = ?'; params.push(station); }
  sql += ' ORDER BY kq.priority DESC, kq.queued_at ASC';

  const queue = db.prepare(sql).all(...params);

  // Parse modifiers
  for (const item of queue) {
    item.modifiers = JSON.parse(item.modifiers || '[]');
    if (item.minutes_waiting > 10) item.urgency = 'critical';
    else if (item.minutes_waiting > 5) item.urgency = 'warning';
    else item.urgency = 'normal';
  }

  res.json(queue);
});

// GET /api/kitchen/orders - grouped by order
router.get('/orders', (req, res) => {
  const db = getDb();
  const { station } = req.query;

  let stationFilter = '';
  const params = [];
  if (station) { stationFilter = 'AND kq.station = ?'; params.push(station); }

  const orders = db.prepare(`
    SELECT DISTINCT o.id, o.order_number, o.order_type, t.name as table_name,
           MIN(kq.queued_at) as first_item_at,
           ROUND((julianday('now') - julianday(MIN(kq.queued_at))) * 1440) as minutes_waiting,
           COUNT(kq.id) as total_items,
           SUM(CASE WHEN kq.status = 'queued' THEN 1 ELSE 0 END) as queued_count,
           SUM(CASE WHEN kq.status = 'preparing' THEN 1 ELSE 0 END) as preparing_count
    FROM kitchen_queue kq
    JOIN orders o ON kq.order_id = o.id
    LEFT JOIN tables t ON o.table_id = t.id
    WHERE kq.status IN ('queued', 'preparing') ${stationFilter}
    GROUP BY o.id
    ORDER BY MIN(kq.queued_at) ASC
  `).all(...params);

  for (const order of orders) {
    order.items = db.prepare(`
      SELECT kq.*, oi.name, oi.quantity, oi.modifiers, oi.special_instructions, oi.course, oi.seat_number
      FROM kitchen_queue kq
      JOIN order_items oi ON kq.order_item_id = oi.id
      WHERE kq.order_id = ? AND kq.status IN ('queued', 'preparing') ${station ? 'AND kq.station = ?' : ''}
      ORDER BY oi.course, kq.queued_at
    `).all(order.id, ...(station ? [station] : []));

    for (const item of order.items) {
      item.modifiers = JSON.parse(item.modifiers || '[]');
    }

    if (order.minutes_waiting > 10) order.urgency = 'critical';
    else if (order.minutes_waiting > 5) order.urgency = 'warning';
    else order.urgency = 'normal';
  }

  res.json(orders);
});

// PATCH /api/kitchen/queue/:id/start
router.patch('/queue/:id/start', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE kitchen_queue SET status = 'preparing', started_at = datetime('now') WHERE id = ?`).run(req.params.id);
  db.prepare(`UPDATE order_items SET status = 'preparing' WHERE id = (SELECT order_item_id FROM kitchen_queue WHERE id = ?)`).run(req.params.id);
  res.json({ success: true });
});

// PATCH /api/kitchen/queue/:id/ready
router.patch('/queue/:id/ready', (req, res) => {
  const db = getDb();
  const item = db.prepare(`SELECT kq.*, o.order_number, t.name as table_name FROM kitchen_queue kq JOIN orders o ON kq.order_id = o.id LEFT JOIN tables t ON o.table_id = t.id WHERE kq.id = ?`).get(req.params.id);

  db.prepare(`UPDATE kitchen_queue SET status = 'ready', completed_at = datetime('now') WHERE id = ?`).run(req.params.id);
  db.prepare(`UPDATE order_items SET status = 'ready', prepared_at = datetime('now') WHERE id = ?`).run(item.order_item_id);

  // Check if all items for the order are ready
  const remaining = db.prepare(`SELECT COUNT(*) as count FROM kitchen_queue WHERE order_id = ? AND status IN ('queued', 'preparing')`).get(item.order_id);
  if (remaining.count === 0) {
    db.prepare(`UPDATE orders SET status = 'ready' WHERE id = ?`).run(item.order_id);
    req.app.locals.broadcast({ type: 'order_ready', orderId: item.order_id, orderNumber: item.order_number, table: item.table_name });
  }

  req.app.locals.broadcast({ type: 'item_ready', orderId: item.order_id, orderNumber: item.order_number });
  res.json({ success: true, all_ready: remaining.count === 0 });
});

// PATCH /api/kitchen/queue/:id/served
router.patch('/queue/:id/served', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE kitchen_queue SET status = 'served' WHERE id = ?`).run(req.params.id);
  db.prepare(`UPDATE order_items SET status = 'served' WHERE id = (SELECT order_item_id FROM kitchen_queue WHERE id = ?)`).run(req.params.id);
  res.json({ success: true });
});

// POST /api/kitchen/bump/:orderId - bump entire order
router.post('/bump/:orderId', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE kitchen_queue SET priority = priority + 1, bump_count = bump_count + 1 WHERE order_id = ? AND status IN ('queued', 'preparing')`).run(req.params.orderId);
  req.app.locals.broadcast({ type: 'order_bumped', orderId: req.params.orderId });
  res.json({ success: true });
});

// GET /api/kitchen/stats
router.get('/stats', (req, res) => {
  const db = getDb();
  const stats = {
    current_queue: db.prepare(`SELECT COUNT(*) as count FROM kitchen_queue WHERE status IN ('queued', 'preparing')`).get().count,
    avg_prep_time: db.prepare(`SELECT ROUND(AVG((julianday(completed_at) - julianday(queued_at)) * 1440), 1) as avg_minutes FROM kitchen_queue WHERE completed_at IS NOT NULL AND date(completed_at) = date('now')`).get()?.avg_minutes || 0,
    completed_today: db.prepare(`SELECT COUNT(*) as count FROM kitchen_queue WHERE status IN ('ready', 'served') AND date(completed_at) = date('now')`).get().count,
    by_station: db.prepare(`SELECT station, COUNT(*) as count FROM kitchen_queue WHERE status IN ('queued', 'preparing') GROUP BY station`).all(),
    longest_wait: db.prepare(`SELECT ROUND(MAX((julianday('now') - julianday(queued_at)) * 1440)) as minutes FROM kitchen_queue WHERE status IN ('queued', 'preparing')`).get()?.minutes || 0,
  };
  res.json(stats);
});

module.exports = router;
