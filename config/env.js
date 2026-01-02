// Loads .env, validates, and exports a typed env object
const path = require('path');
const dotenv = require('dotenv');
const { cleanEnv, str, num } = require('envalid');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'test', 'production'], default: 'development' }),
  PORT: num({ default: 4000 }),
  BASE_URL: str({ default: 'http://localhost:4000' }),
  CLIENT_ORIGIN: str({ default: 'http://localhost:5173' }),
  ADMIN_ORIGIN: str({ default: 'http://localhost:5174' }),
  // Back-compat alias used by legacy code/tests
  CLIENT_URL: str({ default: 'http://localhost:5173' }),

  MONGODB_URI: str(),
  MONGODB_DB: str({ default: 'jaguza' }),
  // Disable mongodb-memory-server fallback to avoid mock data
  DISABLE_MEMORY_DB: str({ default: 'false' }),

  JWT_SECRET: str(),
  JWT_EXPIRES_IN: str({ default: '15m' }),
  REFRESH_TOKEN_SECRET: str(),
  REFRESH_TOKEN_EXPIRES_IN: str({ default: '30d' }),

  REDIS_URL: str({ default: 'redis://localhost:6379' }),

  SMTP_HOST: str(),
  SMTP_PORT: num({ default: 587 }),
  SMTP_USER: str(),
  SMTP_PASS: str(),
  EMAIL_FROM: str({ default: 'Jaguza <no-reply@jaguza.com>' }),
  // Back-compat aliases used by legacy code/tests
  EMAIL_HOST: str({ default: '' }),
  EMAIL_PORT: str({ default: '' }),
  EMAIL_USER: str({ default: '' }),
  EMAIL_PASS: str({ default: '' }),

  // Stripe - required in production for payment processing
  STRIPE_SECRET_KEY: str({ devDefault: '' }),
  STRIPE_WEBHOOK_SECRET: str({ devDefault: '' }),

  S3_BUCKET: str({ default: '' }),
  S3_REGION: str({ default: '' }),
  S3_ACCESS_KEY_ID: str({ default: '' }),
  S3_SECRET_ACCESS_KEY: str({ default: '' }),

  RATE_LIMIT_WINDOW_MS: num({ default: 60000 }),
  RATE_LIMIT_MAX: num({ default: 120 }),

  // Admin hardening
  ADMIN_ROUTE_KEY: str({ devDefault: 'change-this-admin-key' }),
  ADMIN_RATE_LIMIT_MAX: num({ default: 60 }),
  ADMIN_IP_ALLOWLIST: str({ default: '' }), // comma separated list; empty = disabled

  // Error tracking (optional)
  SENTRY_DSN: str({ default: '' }), // e.g., https://xxx@sentry.io/xxx
});

module.exports = { env };