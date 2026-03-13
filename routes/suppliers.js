const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// CRUD for suppliers
router.get('/', (req, res) => {
  try {
    const db = getDb();
    res.json(db.prepare(`SELECT * FROM suppliers WHERE active = 1 ORDER BY name`).all());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, contact_name, email, phone, address, payment_terms, notes } = req.body;
    const db = getDb();
    const result = db.prepare(`INSERT INTO suppliers (name, contact_name, email, phone, address, payment_terms, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(name, contact_name, email, phone, address, payment_terms || 'Net 30', notes);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { name, contact_name, email, phone, address, payment_terms, notes, active } = req.body;
    const db = getDb();
    db.prepare(`UPDATE suppliers SET name=?, contact_name=?, email=?, phone=?, address=?, payment_terms=?, notes=?, active=?, updated_at=datetime('now') WHERE id=?`)
      .run(name, contact_name, email, phone, address, payment_terms, notes, active ?? 1, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Purchase Orders
router.get('/purchase-orders', (req, res) => {
  try {
    const db = getDb();
    const { status, supplier_id } = req.query;
    let sql = `SELECT po.*, s.name as supplier_name, e.first_name || ' ' || e.last_name as ordered_by_name
               FROM purchase_orders po
               JOIN suppliers s ON po.supplier_id = s.id
               LEFT JOIN employees e ON po.ordered_by = e.id`;
    const conditions = [];
    const params = [];
    if (status) { conditions.push('po.status = ?'); params.push(status); }
    if (supplier_id) { conditions.push('po.supplier_id = ?'); params.push(supplier_id); }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY po.created_at DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/purchase-orders/:id', (req, res) => {
  try {
    const db = getDb();
    const po = db.prepare(`SELECT po.*, s.name as supplier_name FROM purchase_orders po JOIN suppliers s ON po.supplier_id = s.id WHERE po.id = ?`).get(req.params.id);
    if (!po) return res.status(404).json({ error: 'PO not found' });
    po.items = db.prepare(`SELECT poi.*, i.name as ingredient_name, i.unit FROM purchase_order_items poi JOIN ingredients i ON poi.ingredient_id = i.id WHERE poi.purchase_order_id = ?`).all(po.id);
    res.json(po);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/purchase-orders', (req, res) => {
  try {
    const { supplier_id, ordered_by, items, notes, expected_delivery } = req.body;
    const db = getDb();

    const totalCost = items.reduce((s, i) => s + (i.quantity_ordered * i.unit_cost), 0);
    const orderNumber = `PO-${Date.now().toString(36).toUpperCase()}`;

    const result = db.prepare(`INSERT INTO purchase_orders (supplier_id, order_number, ordered_by, total_cost, notes, expected_delivery, ordered_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`)
      .run(supplier_id, orderNumber, ordered_by, totalCost, notes, expected_delivery);

    const poId = result.lastInsertRowid;
    const insertItem = db.prepare(`INSERT INTO purchase_order_items (purchase_order_id, ingredient_id, quantity_ordered, unit_cost, total_cost) VALUES (?, ?, ?, ?, ?)`);
    for (const item of items) {
      insertItem.run(poId, item.ingredient_id, item.quantity_ordered, item.unit_cost, item.quantity_ordered * item.unit_cost);
    }

    res.json({ success: true, id: poId, order_number: orderNumber, total_cost: totalCost });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/purchase-orders/:id/receive', (req, res) => {
  try {
    const { items } = req.body; // [{ ingredient_id, quantity_received, location }]
    const db = getDb();

    db.transaction(() => {
      for (const item of items) {
        db.prepare(`UPDATE purchase_order_items SET quantity_received = ? WHERE purchase_order_id = ? AND ingredient_id = ?`)
          .run(item.quantity_received, req.params.id, item.ingredient_id);

        // Add to inventory
        db.prepare(`INSERT INTO inventory (ingredient_id, quantity, full_quantity, location, status, purchase_order_id, received_date) VALUES (?, ?, ?, ?, 'sealed', ?, datetime('now'))`)
          .run(item.ingredient_id, item.quantity_received, item.quantity_received, item.location || 'storage', req.params.id);
      }

      db.prepare(`UPDATE purchase_orders SET status = 'received', received_at = datetime('now') WHERE id = ?`).run(req.params.id);
    })();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
