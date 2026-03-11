require('dotenv').config();
const { getDb, closeDb } = require('./database');
const { initializeSchema } = require('./schema');
const crypto = require('crypto');

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin.toString()).digest('hex');
}

function seed() {
  initializeSchema();
  const db = getDb();

  console.log('[SEED] Initializing clean database...');

  // Single admin user - all other data added through the UI
  db.prepare(`INSERT OR IGNORE INTO employees (first_name, last_name, pin_hash, role, email, hourly_rate, color, hire_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('Admin', 'User', hashPin('1234'), 'admin', 'admin@venuecore.pos', 0, '#6366f1', new Date().toISOString().slice(0, 10));

  console.log('');
  console.log('[SEED] Clean database ready.');
  console.log('');
  console.log('  Admin PIN: 1234');
  console.log('');
  console.log('  Add all data (menu, staff, inventory, etc.) through the admin UI.');
  console.log('');

  closeDb();
}

seed();
