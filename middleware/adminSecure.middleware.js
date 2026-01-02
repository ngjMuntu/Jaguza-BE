const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { env } = require('../config/env');

// Rate limiter specifically for admin routes (stricter)
const adminLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.ADMIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware to ensure request originates from approved origin (CORS handled earlier) and has route key header
function verifyAdminRouteKey(req, res, next) {
  const headerKey = req.headers['x-admin-route-key'];

  // Constant-time compare without length-mismatch throws.
  const a = typeof headerKey === 'string' ? headerKey : '';
  const b = typeof env.ADMIN_ROUTE_KEY === 'string' ? env.ADMIN_ROUTE_KEY : '';
  if (!a || !b) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const ah = crypto.createHash('sha256').update(a).digest();
  const bh = crypto.createHash('sha256').update(b).digest();
  if (!crypto.timingSafeEqual(ah, bh)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
}

// Optional IP allowlist (supports proxy, uses req.ip which respects trust proxy)
function ipAllowlist(req, res, next) {
  if (!env.ADMIN_IP_ALLOWLIST) return next();
  const allow = env.ADMIN_IP_ALLOWLIST.split(',').map(s => s.trim()).filter(Boolean);
  if (allow.length === 0) return next();
  const ip = req.ip; // already normalized by express
  if (!allow.includes(ip)) {
    return res.status(403).json({ message: 'Admin access denied (IP)' });
  }
  next();
}

module.exports = { adminLimiter, verifyAdminRouteKey, ipAllowlist };