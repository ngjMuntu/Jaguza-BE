#!/usr/bin/env node

/*
  Phase 8: Production env verification

  Usage:
    NODE_ENV=production node scripts/verify-env.js

  Notes:
  - This script is intentionally stricter than config/env.js.
  - It fails fast with exit code 1 if it finds dangerous or missing config.
*/

const { env } = require('../config/env');

function fail(errors) {
  for (const msg of errors) console.error(`[verify-env] ERROR: ${msg}`);
  process.exit(1);
}

function warn(warnings) {
  for (const msg of warnings) console.warn(`[verify-env] WARN: ${msg}`);
}

function isProbablyHttpsUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

function looksLikeLocalhost(value) {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(String(value));
}

function minLen(name, value, n, errors) {
  if (typeof value !== 'string' || value.length < n) {
    errors.push(`${name} must be at least ${n} characters`);
  }
}

(function main() {
  const errors = [];
  const warnings = [];

  const nodeEnv = env.NODE_ENV;
  const isProd = nodeEnv === 'production';

  // Always check basic secret strength
  minLen('JWT_SECRET', env.JWT_SECRET, 32, errors);
  minLen('REFRESH_TOKEN_SECRET', env.REFRESH_TOKEN_SECRET, 32, errors);

  if (isProd) {
    // URLs should be https in production
    if (!isProbablyHttpsUrl(env.BASE_URL)) errors.push(`BASE_URL must be https in production (got: ${env.BASE_URL})`);

    // Origins should not be localhost in production
    if (looksLikeLocalhost(env.CLIENT_ORIGIN)) errors.push(`CLIENT_ORIGIN must not be localhost in production (got: ${env.CLIENT_ORIGIN})`);
    if (looksLikeLocalhost(env.ADMIN_ORIGIN)) errors.push(`ADMIN_ORIGIN must not be localhost in production (got: ${env.ADMIN_ORIGIN})`);

    // Admin key must be changed
    if (!env.ADMIN_ROUTE_KEY || env.ADMIN_ROUTE_KEY === 'change-this-admin-key') {
      errors.push('ADMIN_ROUTE_KEY is unsafe (must be changed from default)');
    }
    minLen('ADMIN_ROUTE_KEY', env.ADMIN_ROUTE_KEY, 20, errors);

    // Stripe must be configured in production
    if (!env.STRIPE_SECRET_KEY) errors.push('STRIPE_SECRET_KEY is required in production');
    if (!env.STRIPE_WEBHOOK_SECRET) errors.push('STRIPE_WEBHOOK_SECRET is required in production');

    if (env.STRIPE_SECRET_KEY && env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
      errors.push('STRIPE_SECRET_KEY looks like a test key (sk_test_) but NODE_ENV=production');
    }
    if (env.STRIPE_WEBHOOK_SECRET && !env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) {
      warnings.push('STRIPE_WEBHOOK_SECRET does not look like a Stripe webhook secret (expected whsec_...)');
    }

    // Database sanity
    if (looksLikeLocalhost(env.MONGODB_URI)) warnings.push('MONGODB_URI points at localhost; ensure this is intentional for production');

    // Rate limiting sanity
    if (Number(env.RATE_LIMIT_MAX) > 2000) warnings.push(`RATE_LIMIT_MAX is very high (${env.RATE_LIMIT_MAX}); verify this is intentional`);

    // Cookies
    if (!isProbablyHttpsUrl(env.BASE_URL)) {
      warnings.push('CSRF cookie is set secure in production; ensure BASE_URL is reachable via https');
    }
  } else {
    // Non-prod warnings
    if (!env.STRIPE_SECRET_KEY) warnings.push('STRIPE_SECRET_KEY is empty (ok for dev, but required for production payments)');
    if (!env.STRIPE_WEBHOOK_SECRET) warnings.push('STRIPE_WEBHOOK_SECRET is empty (ok for dev, but required for production webhooks)');
  }

  if (errors.length) fail(errors);
  if (warnings.length) warn(warnings);

  console.log('[verify-env] OK');
  process.exit(0);
})();
