const crypto = require('crypto');

/**
 * Phase 7: Request ID middleware for request tracing
 * Adds a unique request ID to every request for observability
 */
function requestIdMiddleware(req, res, next) {
  // Use existing request ID from header (e.g., from load balancer) or generate new one
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  
  // Attach to request for use in logs
  req.id = requestId;
  
  // Send back in response headers for client-side correlation
  res.setHeader('X-Request-ID', requestId);
  
  next();
}

module.exports = requestIdMiddleware;
