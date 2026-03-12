require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeSchema } = require('./db/schema');
const { errorHandler } = require('./middleware/errorHandler');
const { startMonitor, setBroadcast } = require('./services/supply-monitor');
const cloverOrderSync = require('./services/clover-order-sync');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// SSE clients for real-time notifications
const sseClients = new Set();
app.locals.sseClients = sseClients;

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(msg);
  }
}
app.locals.broadcast = broadcast;

// API Routes - Core Operations
app.use('/api/auth', require('./routes/auth'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/pos', require('./routes/pos'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/timeclock', require('./routes/timeclock'));
app.use('/api/scheduling', require('./routes/scheduling'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/tables', require('./routes/tables'));
app.use('/api/reservations', require('./routes/reservations'));
app.use('/api/kitchen', require('./routes/kitchen'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/demo', require('./routes/demo'));

// API Routes - Business Intelligence & Back Office
app.use('/api/accounting', require('./routes/accounting'));
app.use('/api/payroll', require('./routes/payroll'));
app.use('/api/ap', require('./routes/ap-automation'));
app.use('/api/banking', require('./routes/banking'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/training', require('./routes/training'));
app.use('/api/catering', require('./routes/catering'));
app.use('/api/marketing', require('./routes/marketing'));
app.use('/api/forecasting', require('./routes/forecasting'));
app.use('/api/reorder', require('./routes/reorder'));
app.use('/api/clover', require('./routes/clover'));
app.use('/api/drink-deduction', require('./routes/drink-deduction'));
app.use('/api/sales-tax', require('./routes/sales-tax'));

// SSE endpoint
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// SPA fallback
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use(errorHandler);

// Initialize DB and start
initializeSchema();

// Clean up any leftover demo data from previous sessions (e.g. browser closed without exiting demo)
try {
  const { getDb } = require('./db/database');
  const db = getDb();
  const demoExists = db.prepare(`SELECT id FROM employees WHERE email LIKE 'demo%@venuecore.pos'`).get();
  if (demoExists) {
    console.log('[Startup] Cleaning up leftover demo data...');
    const { cleanupDemo } = require('./routes/demo');
    cleanupDemo(db);
    console.log('[Startup] Demo data cleaned');
  }
} catch (e) {
  console.error('[Startup] Demo cleanup error:', e.message);
}

// Start supply monitor (checks inventory every 15 minutes)
setBroadcast(broadcast);
startMonitor(15);

// Start Clover order sync (polls every 10 seconds for new orders)
cloverOrderSync.setBroadcast(broadcast);
cloverOrderSync.startPolling(10);

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║         VENUECORE POS SYSTEM v2.0              ║
  ║          http://localhost:${PORT}               ║
  ╚══════════════════════════════════════════════╝
  `);
});
