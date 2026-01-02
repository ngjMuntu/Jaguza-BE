const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const defaultEnv = {
  NODE_ENV: 'test',
  PORT: '0',
  BASE_URL: 'http://localhost:4000',
  CLIENT_ORIGIN: 'http://localhost',
  ADMIN_ORIGIN: 'http://localhost',
  CLIENT_URL: 'http://localhost',
  JWT_SECRET: 'testsecret',
  REFRESH_TOKEN_SECRET: 'refreshsecret',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '587',
  SMTP_USER: 'user',
  SMTP_PASS: 'pass',
  EMAIL_FROM: 'no-reply@example.com',
  STRIPE_SECRET_KEY: 'sk_test_mock',
  STRIPE_WEBHOOK_SECRET: 'whsec_mock',
  ADMIN_ROUTE_KEY: 'test-admin-key',
  RATE_LIMIT_WINDOW_MS: '60000',
  RATE_LIMIT_MAX: '1000', // Higher limit for tests
};

async function setupTestApp(overrides = {}) {
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();

  const envVars = {
    MONGODB_URI: uri,
    MONGODB_DB: 'testdb',
    RATE_LIMIT_WINDOW_MS: '60000',
    RATE_LIMIT_MAX: '100',
    ...defaultEnv,
    ...overrides,
  };

  for (const [key, value] of Object.entries(envVars)) {
    process.env[key] = value;
  }

  // Ensure we reuse the same mongoose module instance as the test files.
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  const { connect } = require('../../config/db');
  await connect();

  const app = require('../../server');
  const agent = request.agent(app);

  async function cleanup() {
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
  }

  return { app, agent, cleanup };
}

module.exports = { setupTestApp };
