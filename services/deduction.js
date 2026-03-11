const { getDb } = require('../db/database');

/**
 * Smart inventory deduction engine (enhanced from bar-inventory)
 * Processes an order's items and deducts from inventory intelligently:
 * 1. Prefers open containers at the bar
 * 2. Falls back to other locations
 * 3. Opens sealed containers on demand
 * 4. Handles partial fulfillment
 * 5. Auto-86s items when stock depleted
 * 6. Triggers low-stock alerts
 */
function deductForOrder(orderId, orderItems, employeeId) {
  const db = getDb();
  const results = [];
  const threshold = parseInt(process.env.LOW_STOCK_THRESHOLD || '20') / 100;

  const deductTransaction = db.transaction(() => {
    for (const orderItem of orderItems) {
      const recipes = db.prepare(`
        SELECT r.*, i.name as ingredient_name, i.cost_per_unit, i.par_level
        FROM recipes r
        JOIN ingredients i ON r.ingredient_id = i.id
        WHERE r.menu_item_id = ?
      `).all(orderItem.menu_item_id);

      for (const recipe of recipes) {
        let needed = recipe.quantity * orderItem.quantity;
        let totalDeducted = 0;
        let status = 'SUCCESS';

        // Priority order: open at bar > open elsewhere > sealed at bar > sealed elsewhere
        const inventory = db.prepare(`
          SELECT * FROM inventory
          WHERE ingredient_id = ? AND status != 'empty' AND quantity > 0
          ORDER BY
            CASE WHEN status = 'open' AND location = 'bar' THEN 1
                 WHEN status = 'open' THEN 2
                 WHEN location = 'bar' THEN 3
                 ELSE 4
            END,
            quantity ASC
        `).all(recipe.ingredient_id);

        for (const inv of inventory) {
          if (needed <= 0) break;

          // Open sealed containers if needed
          if (inv.status === 'sealed') {
            db.prepare(`UPDATE inventory SET status = 'open', opened_at = datetime('now') WHERE id = ?`).run(inv.id);
          }

          const deduct = Math.min(needed, inv.quantity);
          const newQty = +(inv.quantity - deduct).toFixed(4);

          db.prepare(`UPDATE inventory SET quantity = ?${newQty <= 0 ? ", status = 'empty', emptied_at = datetime('now')" : ''} WHERE id = ?`)
            .run(newQty, inv.id);

          // Log transaction
          db.prepare(`
            INSERT INTO transactions (type, ingredient_id, inventory_id, menu_item_id, order_id, quantity, unit, status, employee_id)
            VALUES ('sale', ?, ?, ?, ?, ?, ?, 'SUCCESS', ?)
          `).run(recipe.ingredient_id, inv.id, orderItem.menu_item_id, orderId, deduct, recipe.unit, employeeId);

          totalDeducted += deduct;
          needed = +(needed - deduct).toFixed(4);
        }

        if (needed > 0) {
          status = totalDeducted > 0 ? 'PARTIAL' : 'OUT_OF_STOCK';

          // Auto-86 the menu item
          db.prepare(`UPDATE menu_items SET is_86d = 1 WHERE id = ?`).run(orderItem.menu_item_id);

          // Create alert
          db.prepare(`INSERT INTO alerts (type, severity, title, message, data) VALUES (?, ?, ?, ?, ?)`)
            .run('out_of_stock', 'critical', `${recipe.ingredient_name} is out of stock`,
              `Cannot fulfill order #${orderId} - need ${needed} ${recipe.unit} more`,
              JSON.stringify({ ingredient_id: recipe.ingredient_id, menu_item_id: orderItem.menu_item_id }));
        }

        // Check low stock
        const totalRemaining = db.prepare(`SELECT COALESCE(SUM(quantity), 0) as total FROM inventory WHERE ingredient_id = ? AND status != 'empty'`).get(recipe.ingredient_id);
        const fullTotal = db.prepare(`SELECT COALESCE(SUM(full_quantity), 0) as total FROM inventory WHERE ingredient_id = ?`).get(recipe.ingredient_id);

        if (fullTotal.total > 0 && totalRemaining.total / fullTotal.total < threshold && totalRemaining.total > 0) {
          const existing = db.prepare(`SELECT id FROM alerts WHERE type = 'low_stock' AND data LIKE ? AND acknowledged = 0`).get(`%"ingredient_id":${recipe.ingredient_id}%`);
          if (!existing) {
            db.prepare(`INSERT INTO alerts (type, severity, title, message, data) VALUES (?, ?, ?, ?, ?)`)
              .run('low_stock', 'high', `Low stock: ${recipe.ingredient_name}`,
                `Only ${totalRemaining.total.toFixed(1)} ${recipe.unit} remaining (${(totalRemaining.total / fullTotal.total * 100).toFixed(0)}%)`,
                JSON.stringify({ ingredient_id: recipe.ingredient_id, remaining: totalRemaining.total, par_level: recipe.par_level }));
          }
        }

        results.push({
          ingredient: recipe.ingredient_name,
          needed: recipe.quantity * orderItem.quantity,
          deducted: totalDeducted,
          status,
        });
      }
    }
    return results;
  });

  return deductTransaction();
}

function logWaste(ingredientId, inventoryId, quantity, unit, reason, cost, employeeId, notes) {
  const db = getDb();
  db.prepare(`INSERT INTO waste_log (ingredient_id, inventory_id, quantity, unit, reason, cost, employee_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(ingredientId, inventoryId, quantity, unit, reason, cost, employeeId, notes);

  if (inventoryId) {
    const inv = db.prepare(`SELECT quantity FROM inventory WHERE id = ?`).get(inventoryId);
    if (inv) {
      const newQty = Math.max(0, inv.quantity - quantity);
      db.prepare(`UPDATE inventory SET quantity = ?${newQty <= 0 ? ", status = 'empty', emptied_at = datetime('now')" : ''} WHERE id = ?`)
        .run(newQty, inventoryId);
    }
  }

  db.prepare(`INSERT INTO transactions (type, ingredient_id, inventory_id, quantity, unit, status, employee_id, notes) VALUES ('waste', ?, ?, ?, ?, 'SUCCESS', ?, ?)`)
    .run(ingredientId, inventoryId, quantity, unit, employeeId, reason);
}

module.exports = { deductForOrder, logWaste };
