const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { setupTestApp } = require('./helpers/setupTestApp');

let app;
let agent;
let cleanup;

jest.setTimeout(30000);

beforeAll(async () => {
  ({ app, agent, cleanup } = await setupTestApp());
});

beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

function adminPath(path) {
  return `/api/admin/${process.env.ADMIN_ROUTE_KEY}${path}`;
}

async function createUser(overrides = {}) {
  const User = require('../models/user.model');
  const suffix = new mongoose.Types.ObjectId().toString().slice(-8);
  return User.create({
    name: `User ${suffix}`,
    email: `user-${suffix}@example.com`,
    password: 'Password123!'
      ,
    isVerified: true,
    ...overrides,
  });
}

function signAccessToken(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '15m',
    algorithm: 'HS256',
  });
}

describe('Admin route security', () => {
  it('rejects requests without x-admin-route-key', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = signAccessToken(admin);

    const res = await agent
      .get(adminPath('/users'))
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(401);
  });

  it('rejects requests with wrong x-admin-route-key (no 500)', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = signAccessToken(admin);

    const res = await agent
      .get(adminPath('/users'))
      .set('Authorization', `Bearer ${token}`)
      .set('x-admin-route-key', 'wrong-key');

    expect(res.statusCode).toBe(401);
  });

  it('rejects non-admin roles even with correct route key', async () => {
    const staff = await createUser({ role: 'staff' });
    const token = signAccessToken(staff);

    const res = await agent
      .get(adminPath('/users'))
      .set('Authorization', `Bearer ${token}`)
      .set('x-admin-route-key', process.env.ADMIN_ROUTE_KEY);

    expect(res.statusCode).toBe(403);
  });

  it('allows admin role with correct route key', async () => {
    const admin = await createUser({ role: 'admin' });
    const token = signAccessToken(admin);

    const res = await agent
      .get(adminPath('/users'))
      .set('Authorization', `Bearer ${token}`)
      .set('x-admin-route-key', process.env.ADMIN_ROUTE_KEY);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('users');
  });

  it('allows setting user role to staff (schema-aligned)', async () => {
    const admin = await createUser({ role: 'admin' });
    const target = await createUser({ role: 'user' });
    const token = signAccessToken(admin);

    const csrfRes = await agent.get('/api/csrf-token');
    const csrf = csrfRes.body.csrfToken;

    const res = await agent
      .put(adminPath(`/users/${target._id}`))
      .set('Authorization', `Bearer ${token}`)
      .set('x-admin-route-key', process.env.ADMIN_ROUTE_KEY)
      .set('X-CSRF-Token', csrf)
      .send({ role: 'staff' });

    expect(res.statusCode).toBe(200);

    const User = require('../models/user.model');
    const updated = await User.findById(target._id);
    expect(updated.role).toBe('staff');
  });
});
