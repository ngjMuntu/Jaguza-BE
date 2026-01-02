/**
 * HTTPS Redirect Middleware
 * Forces HTTPS in production environments
 */

const { env } = require('../config/env');

/**
 * Redirects HTTP requests to HTTPS in production
 * Supports load balancers via X-Forwarded-Proto header
 */
function httpsRedirect(req, res, next) {
  // Skip in non-production environments
  if (env.NODE_ENV !== 'production') {
    return next();
  }

  // Check if request is already HTTPS
  const isHttps = 
    req.secure || 
    req.headers['x-forwarded-proto'] === 'https' ||
    req.protocol === 'https';

  if (!isHttps) {
    // Redirect to HTTPS version
    const httpsUrl = `https://${req.headers.host}${req.url}`;
    return res.redirect(301, httpsUrl);
  }

  next();
}

/**
 * Adds HSTS header for enhanced security
 * max-age: 1 year, includeSubDomains, preload-ready
 */
function hstsHeader(req, res, next) {
  if (env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }
  next();
}

module.exports = { httpsRedirect, hstsHeader };
