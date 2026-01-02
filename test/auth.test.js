const mongoose = require('mongoose');
const { setupTestApp } = require('./helpers/setupTestApp');
const request = require('supertest');

// Mock nodemailer to prevent real emails during tests
jest.mock('nodemailer', () => ({
  createTransport: () => ({
    sendMail: jest.fn().mockResolvedValue(true),
  }),
}));

let app;
let agent;
let cleanup;

jest.setTimeout(30000);

beforeAll(async () => {
  ({ app, agent, cleanup } = await setupTestApp());
});

beforeEach(async () => {
  // Clear all collections
  const collections = await mongoose.connection.db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

describe('Auth API', () => {
  it('should register a new user', async () => {
    // get CSRF token
    const csrfRes = await agent.get('/api/csrf-token');
    const token = csrfRes.body.csrfToken;
    const res = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', token)
      .send({
        name: 'Test User',
        email: 'testuser@example.com',
        password: 'TestPassword123!',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toMatch(/Registration successful/i);
  });

  it('should not register with existing email', async () => {
    const csrfRes1 = await agent.get('/api/csrf-token');
    const token1 = csrfRes1.body.csrfToken;
    await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', token1)
      .send({
        name: 'Test User',
        email: 'testuser@example.com',
        password: 'TestPassword123!',
      });

    const csrfRes2 = await agent.get('/api/csrf-token');
    const token2 = csrfRes2.body.csrfToken;
    const res = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', token2)
      .send({
        name: 'Test User',
        email: 'testuser@example.com',
        password: 'TestPassword123!',
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/User already exists/i);
  });

  it('should login with correct credentials', async () => {
    const csrfRes = await agent.get('/api/csrf-token');
    const token = csrfRes.body.csrfToken;
    await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', token)
      .send({
        name: 'Login User',
        email: 'loginuser@example.com',
        password: 'LoginPassword123!',
      });

    // Mark user as verified for login to succeed
    const User = require('../models/user.model');
    await User.updateOne({ email: 'loginuser@example.com' }, { $set: { isVerified: true } });

    const csrfRes2 = await agent.get('/api/csrf-token');
    const token2 = csrfRes2.body.csrfToken;
    const res = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', token2)
      .send({
        email: 'loginuser@example.com',
        password: 'LoginPassword123!',
      });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message');
  });

  it('rotates refresh tokens on /refresh and detects reuse', async () => {
    // register
    const csrfRes = await agent.get('/api/csrf-token');
    const csrf = csrfRes.body.csrfToken;
    await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrf)
      .send({
        name: 'Refresh User',
        email: 'refreshuser@example.com',
        password: 'RefreshPassword123!'
      });

    const User = require('../models/user.model');
    await User.updateOne({ email: 'refreshuser@example.com' }, { $set: { isVerified: true } });

    // login
    const csrfRes2 = await agent.get('/api/csrf-token');
    const csrf2 = csrfRes2.body.csrfToken;
    const loginRes = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrf2)
      .send({ email: 'refreshuser@example.com', password: 'RefreshPassword123!' });
    expect(loginRes.statusCode).toBe(200);

    const setCookies = loginRes.headers['set-cookie'] || [];
    const refreshCookie = setCookies.find((c) => c.startsWith('refreshToken='));
    expect(refreshCookie).toBeTruthy();
    const refresh1 = refreshCookie.split(';')[0];

    // refresh once => should rotate
    const csrfRes3 = await agent.get('/api/csrf-token');
    const csrf3 = csrfRes3.body.csrfToken;
    const refreshRes1 = await agent
      .post('/api/auth/refresh')
      .set('X-CSRF-Token', csrf3)
      .send({});
    expect(refreshRes1.statusCode).toBe(200);

    const refreshSetCookies = refreshRes1.headers['set-cookie'] || [];
    const refreshCookie2 = refreshSetCookies.find((c) => c.startsWith('refreshToken='));
    expect(refreshCookie2).toBeTruthy();
    const refresh2 = refreshCookie2.split(';')[0];
    expect(refresh2).not.toBe(refresh1);

    // attacker reuses old refresh token => should 401 and revoke family
    const evil = request.agent(app);
    const evilCsrfRes = await evil.get('/api/csrf-token');
    const evilCsrf = evilCsrfRes.body.csrfToken;
    const reuseRes = await evil
      .post('/api/auth/refresh')
      .set('X-CSRF-Token', evilCsrf)
      .set('Cookie', refresh1)
      .send({});
    expect(reuseRes.statusCode).toBe(401);

    // now the legitimate session should no longer be able to refresh
    const csrfRes4 = await agent.get('/api/csrf-token');
    const csrf4 = csrfRes4.body.csrfToken;
    const refreshRes2 = await agent
      .post('/api/auth/refresh')
      .set('X-CSRF-Token', csrf4)
      .send({});
    expect(refreshRes2.statusCode).toBe(401);
  });

  it('revokes refresh token on /logout', async () => {
    const csrfRes = await agent.get('/api/csrf-token');
    const csrf = csrfRes.body.csrfToken;
    await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrf)
      .send({
        name: 'Logout User',
        email: 'logoutuser@example.com',
        password: 'LogoutPassword123!'
      });

    const User = require('../models/user.model');
    await User.updateOne({ email: 'logoutuser@example.com' }, { $set: { isVerified: true } });

    const csrfRes2 = await agent.get('/api/csrf-token');
    const csrf2 = csrfRes2.body.csrfToken;
    const loginRes = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrf2)
      .send({ email: 'logoutuser@example.com', password: 'LogoutPassword123!' });
    expect(loginRes.statusCode).toBe(200);

    const csrfRes3 = await agent.get('/api/csrf-token');
    const csrf3 = csrfRes3.body.csrfToken;
    const logoutRes = await agent
      .post('/api/auth/logout')
      .set('X-CSRF-Token', csrf3)
      .send({});
    expect(logoutRes.statusCode).toBe(200);

    // refresh should now fail
    const csrfRes4 = await agent.get('/api/csrf-token');
    const csrf4 = csrfRes4.body.csrfToken;
    const refreshRes = await agent
      .post('/api/auth/refresh')
      .set('X-CSRF-Token', csrf4)
      .send({});
    expect(refreshRes.statusCode).toBe(401);
  });

  it('should return 404 for unknown route', async () => {
    const res = await agent.get('/api/unknown');
    expect(res.statusCode).toBe(404);
    expect(res.body.message).toMatch(/Not Found/i);
  });
});
