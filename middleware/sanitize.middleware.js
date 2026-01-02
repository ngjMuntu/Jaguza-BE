// Custom sanitize middleware to prevent MongoDB operator injection
// Express 5 compatibility: req.query is a getter, so we sanitize a copy and reassign if the property is writable
function isPlainObject(val) {
  return Object.prototype.toString.call(val) === '[object Object]';
}

function sanitizeObject(obj) {
  if (!isPlainObject(obj)) return obj;
  const sanitized = {};
  for (const key of Object.keys(obj)) {
    // Skip dangerous MongoDB operators
    if (key.startsWith('$') || key.includes('.')) {
      continue;
    }
    const val = obj[key];
    if (isPlainObject(val)) {
      sanitized[key] = sanitizeObject(val);
    } else if (Array.isArray(val)) {
      sanitized[key] = val.map(item => isPlainObject(item) ? sanitizeObject(item) : item);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

module.exports = function sanitizeMiddleware(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }
  if (req.headers && typeof req.headers === 'object') {
    // Only sanitize custom headers, not standard ones
    sanitizeObject(req.headers);
  }
  // Sanitize query params - Express 5 compatible (server.js makes req.query writable)
  if (req.query && typeof req.query === 'object') {
    const sanitizedQuery = sanitizeObject(req.query);
    // Only reassign if the property is writable (set up by server.js middleware)
    const desc = Object.getOwnPropertyDescriptor(req, 'query');
    if (desc && desc.writable) {
      req.query = sanitizedQuery;
    }
  }
  next();
};
