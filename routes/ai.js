const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

async function callClaude(systemPrompt, userPrompt) {
  if (!ANTHROPIC_API_KEY) {
    return { error: 'ANTHROPIC_API_KEY not configured. Add it to your .env file.' };
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  const data = await response.json();
  if (data.error) return { error: data.error.message };
  return { text: data.content?.[0]?.text || 'No response' };
}

function getBusinessContext() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  return {
    today_sales: db.prepare(`SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as orders FROM orders WHERE status = 'closed' AND date(opened_at) = ?`).get(today),
    top_items_7d: db.prepare(`
      SELECT oi.name, SUM(oi.quantity) as qty, SUM(oi.unit_price * oi.quantity) as revenue
      FROM order_items oi JOIN orders o ON oi.order_id = o.id
      WHERE o.status = 'closed' AND oi.voided = 0 AND o.opened_at >= datetime('now', '-7 days')
      GROUP BY oi.menu_item_id ORDER BY revenue DESC LIMIT 10
    `).all(),
    low_stock: db.prepare(`
      SELECT i.name, COALESCE(SUM(inv.quantity), 0) as remaining
      FROM ingredients i LEFT JOIN inventory inv ON i.id = inv.ingredient_id AND inv.status != 'empty'
      WHERE i.active = 1 GROUP BY i.id HAVING remaining < i.par_level AND i.par_level > 0
    `).all(),
    labor_today: db.prepare(`SELECT COUNT(*) as clocked_in FROM time_entries WHERE clock_out IS NULL`).get(),
    menu_items: db.prepare(`SELECT name, price, cost, is_86d FROM menu_items WHERE active = 1`).all(),
    recent_waste: db.prepare(`SELECT i.name, w.quantity, w.reason, w.cost FROM waste_log w JOIN ingredients i ON w.ingredient_id = i.id WHERE w.created_at >= datetime('now', '-7 days') ORDER BY w.cost DESC LIMIT 10`).all(),
  };
}

// POST /api/ai/query - Natural language query
router.post('/query', async (req, res) => {
  const { query, employee_id } = req.body;
  const context = getBusinessContext();

  const systemPrompt = `You are VenueCore AI, an intelligent assistant for a restaurant/bar POS system called VenueCore. You have access to the restaurant's real-time data. Be concise, actionable, and use specific numbers from the data provided. Format responses with markdown. If asked about things not in the data, say so. Never make up numbers.`;

  const userPrompt = `Restaurant data:\n${JSON.stringify(context, null, 2)}\n\nQuestion: ${query}`;

  const result = await callClaude(systemPrompt, userPrompt);

  // Log conversation
  const db = getDb();
  db.prepare(`INSERT INTO ai_conversations (employee_id, query, response, context) VALUES (?, ?, ?, ?)`)
    .run(employee_id, query, result.text || result.error, JSON.stringify(context));

  res.json(result);
});

// GET /api/ai/menu-suggestions
router.get('/menu-suggestions', async (req, res) => {
  const context = getBusinessContext();

  const systemPrompt = `You are a restaurant consultant AI. Analyze the menu data and provide actionable suggestions to improve profitability. Consider food costs, pricing, popularity, and waste.`;
  const userPrompt = `Here is the restaurant's current data:\n${JSON.stringify(context, null, 2)}\n\nProvide 3-5 specific, actionable menu optimization suggestions. For each: what to change, why, and expected impact.`;

  const result = await callClaude(systemPrompt, userPrompt);
  res.json(result);
});

// GET /api/ai/cost-optimization
router.get('/cost-optimization', async (req, res) => {
  const context = getBusinessContext();

  const systemPrompt = `You are a restaurant operations consultant. Analyze costs and waste data to find savings opportunities.`;
  const userPrompt = `Restaurant data:\n${JSON.stringify(context, null, 2)}\n\nIdentify the top 3-5 cost optimization opportunities. Be specific with numbers and potential savings.`;

  const result = await callClaude(systemPrompt, userPrompt);
  res.json(result);
});

// GET /api/ai/demand-forecast
router.get('/demand-forecast', async (req, res) => {
  const db = getDb();
  const historical = db.prepare(`
    SELECT date(opened_at) as day, strftime('%w', opened_at) as dow, COUNT(*) as orders, SUM(total) as sales
    FROM orders WHERE status = 'closed' AND opened_at >= datetime('now', '-30 days')
    GROUP BY day ORDER BY day
  `).all();

  const hourlyPattern = db.prepare(`
    SELECT CAST(strftime('%H', opened_at) AS INTEGER) as hour, strftime('%w', opened_at) as dow,
           AVG(order_count) as avg_orders
    FROM (SELECT opened_at, COUNT(*) as order_count FROM orders WHERE status = 'closed' AND opened_at >= datetime('now', '-30 days') GROUP BY date(opened_at), strftime('%H', opened_at))
    GROUP BY hour, dow
  `).all();

  const systemPrompt = `You are a demand forecasting AI for restaurants. Analyze historical sales data and predict demand for the upcoming week. Consider day-of-week patterns.`;
  const userPrompt = `Historical daily sales (last 30 days):\n${JSON.stringify(historical, null, 2)}\n\nHourly patterns:\n${JSON.stringify(hourlyPattern, null, 2)}\n\nProvide a 7-day demand forecast with expected order counts and staffing recommendations for each day.`;

  const result = await callClaude(systemPrompt, userPrompt);
  res.json(result);
});

// GET /api/ai/insights
router.get('/insights', async (req, res) => {
  const context = getBusinessContext();

  const systemPrompt = `You are VenueCore AI. Generate 3-5 quick daily insights for a restaurant manager. Be brief - one sentence each. Include an emoji for each insight. Focus on actionable observations.`;
  const userPrompt = `Today's data:\n${JSON.stringify(context, null, 2)}\n\nGenerate today's quick insights.`;

  const result = await callClaude(systemPrompt, userPrompt);
  res.json(result);
});

// GET /api/ai/history
router.get('/history', (req, res) => {
  const db = getDb();
  const conversations = db.prepare(`
    SELECT ac.*, e.first_name || ' ' || e.last_name as employee_name
    FROM ai_conversations ac
    LEFT JOIN employees e ON ac.employee_id = e.id
    ORDER BY ac.created_at DESC LIMIT 50
  `).all();
  res.json(conversations);
});

module.exports = router;
