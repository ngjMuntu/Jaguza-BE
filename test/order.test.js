const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Category = require('../models/category.model');
const Product = require('../models/product.model');
const { setupTestApp } = require('./helpers/setupTestApp');

let agent;
let cleanup;

jest.setTimeout(30000);

beforeAll(async () => {
  ({ agent, cleanup } = await setupTestApp());
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

async function getCsrfToken() {
  const res = await agent.get('/api/csrf-token');
  return res.body.csrfToken;
}

async function createAuthedUser() {
  const user = await User.create({
    name: 'Buyer',
    email: `buyer-${new mongoose.Types.ObjectId()}@example.com`,
    password: 'Password123!',
    isVerified: true,
  });
  const token = jwt.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '15m',
    algorithm: 'HS256',
  });
  return { user, token };
}

describe('Orders - inventory integrity', () => {
  it('decrements product stock when creating an order', async () => {
    const { token } = await createAuthedUser();
    const csrf = await getCsrfToken();

    const category = await Category.create({ name: `Category ${new mongoose.Types.ObjectId()}` });
    const product = await Product.create({
      name: `Product ${new mongoose.Types.ObjectId()}`,
      category: category._id,
      price: 10,
      countInStock: 2,
      enabled: true,
      isDeleted: false,
    });

    const res = await agent
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('X-CSRF-Token', csrf)
      .send({
        orderItems: [{ productId: product._id.toString(), qty: 1 }],
        shippingAddress: {
          address: '123 Main',
          city: 'Kampala',
          postalCode: '00000',
          country: 'UG',
        },
        paymentMethod: 'card',
      });

    expect(res.statusCode).toBe(201);

    const updated = await Product.findById(product._id).lean();
    expect(updated.countInStock).toBe(1);
  });

  it('rejects orders that would oversell stock', async () => {
    const { token } = await createAuthedUser();
    const csrf = await getCsrfToken();

    const category = await Category.create({ name: `Category ${new mongoose.Types.ObjectId()}` });
    const product = await Product.create({
      name: `Product ${new mongoose.Types.ObjectId()}`,
      category: category._id,
      price: 10,
      countInStock: 1,
      enabled: true,
      isDeleted: false,
    });

    const res = await agent
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('X-CSRF-Token', csrf)
      .send({
        orderItems: [{ productId: product._id.toString(), qty: 2 }],
        shippingAddress: {
          address: '123 Main',
          city: 'Kampala',
          postalCode: '00000',
          country: 'UG',
        },
        paymentMethod: 'card',
      });

    expect(res.statusCode).toBe(409);

    const updated = await Product.findById(product._id).lean();
    expect(updated.countInStock).toBe(1);
  });
});
