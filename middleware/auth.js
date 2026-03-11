const crypto = require('crypto');
const { getDb } = require('../db/database');

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin.toString()).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const db = getDb();
  const session = db.prepare(`
    SELECT s.*, e.id as emp_id, e.first_name, e.last_name, e.role, e.permissions
    FROM sessions s
    JOIN employees e ON s.employee_id = e.id
    WHERE s.token = ? AND s.expires_at > datetime('now') AND e.active = 1
  `).get(token);

  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  req.employee = {
    id: session.emp_id,
    firstName: session.first_name,
    lastName: session.last_name,
    role: session.role,
    permissions: JSON.parse(session.permissions || '{}'),
  };
  next();
}

function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token) {
    const db = getDb();
    const session = db.prepare(`
      SELECT s.*, e.id as emp_id, e.first_name, e.last_name, e.role, e.permissions
      FROM sessions s
      JOIN employees e ON s.employee_id = e.id
      WHERE s.token = ? AND s.expires_at > datetime('now') AND e.active = 1
    `).get(token);
    if (session) {
      req.employee = {
        id: session.emp_id,
        firstName: session.first_name,
        lastName: session.last_name,
        role: session.role,
        permissions: JSON.parse(session.permissions || '{}'),
      };
    }
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.employee) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.employee.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { hashPin, generateToken, authenticate, optionalAuth, requireRole };
