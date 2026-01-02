const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Order = require('../models/order.model');
const Category = require('../models/category.model');
const Product = require('../models/product.model');
const { setupTestApp } = require('./helpers/setupTestApp');

const mockPaymentIntentsCreate = jest.fn();
const mockConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: { create: mockPaymentIntentsCreate },
    webhooks: { constructEvent: mockConstructEvent },
  }));
});

let app;
let agent;
let cleanup;

jest.setTimeout(30000);

beforeAll(async () => {
  ({ app, agent, cleanup } = await setupTestApp());
});

beforeEach(async () => {
  mockPaymentIntentsCreate.mockReset();
  mockConstructEvent.mockReset();
  const collections = await mongoose.connection.db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

function uniqueValue() {
  return new mongoose.Types.ObjectId().toString();
}

async function createUser(attrs = {}) {
  const suffix = uniqueValue();
  return User.create({
    name: `Buyer ${suffix.slice(-5)}`,
    email: `buyer-${suffix}@example.com`,
    password: 'Password123!',
    isVerified: true,
    ...attrs,
  });
}

async function createOrder(user, overrides = {}) {
  const suffix = uniqueValue();
  const category = await Category.create({ name: `Category ${suffix}` });
  const product = await Product.create({
    name: `Product ${suffix}`,
    category: category._id,
    price: overrides.productPrice ?? 12.99,
    sku: `sku-${suffix.slice(-6)}`,
    countInStock: 10,
  });

  const itemsPrice = overrides.itemsPrice ?? product.price;
  const shippingPrice = overrides.shippingPrice ?? 0;
  const taxPrice = overrides.taxPrice ?? 0;
  const totalPrice = overrides.totalPrice ?? (itemsPrice + shippingPrice + taxPrice);

  const defaultOrder = {
    user: user._id,
    orderItems: [{
      product: product._id,
      sku: product.sku,
      name: product.name,
      qty: 1,
      price: product.price,
    }],
    itemsPrice,
    shippingPrice,
    taxPrice,
    totalPrice,
    payment: overrides.payment,
    status: overrides.status,
    isPaid: overrides.isPaid ?? false,
  };

  return Order.create({ ...defaultOrder, ...overrides });
}

async function getCsrfToken() {
  const res = await agent.get('/api/csrf-token');
  return res.body.csrfToken;
}

describe('Payment intents', () => {
  it('creates a PaymentIntent using the stored order total and metadata', async () => {
    const user = await createUser();
    const order = await createOrder(user, { totalPrice: 24.57, shippingPrice: 0, taxPrice: 0 });
    const amountCents = Math.round(order.totalPrice * 100);
    mockPaymentIntentsCreate.mockResolvedValue({
      id: 'pi_123',
      client_secret: 'secret_123',
    });

    const csrf = await getCsrfToken();
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const res = await agent
      .post('/api/payments/create-payment-intent')
      .set('Authorization', `Bearer ${token}`)
      .set('X-CSRF-Token', csrf)
      .send({ orderId: order.id, currency: 'USD', injectAmount: 5 });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('clientSecret', 'secret_123');
    expect(mockPaymentIntentsCreate).toHaveBeenCalledTimes(1);
    const [payload] = mockPaymentIntentsCreate.mock.calls[0];
    expect(payload.amount).toBe(amountCents);
    expect(payload.currency).toBe('usd');
    expect(payload.metadata.orderId).toBe(order.id);
    expect(payload.metadata.userId).toBe(user.id);

    const updated = await Order.findById(order.id);
    expect(updated.payment.status).toBe('pending');
    expect(updated.payment.intentId).toBe('pi_123');
    expect(updated.payment.amount).toBe(amountCents);
    expect(updated.payment.currency).toBe('usd');
    expect(updated.isPaid).toBe(false);
  });

  it('rejects attempts to pay another users order', async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const order = await createOrder(owner);

    const csrf = await getCsrfToken();
    const token = jwt.sign({ id: intruder._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const res = await agent
      .post('/api/payments/create-payment-intent')
      .set('Authorization', `Bearer ${token}`)
      .set('X-CSRF-Token', csrf)
      .send({ orderId: order.id });

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/Not allowed/i);
    expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
  });
});

describe('Stripe webhook', () => {
  it('marks the order as paid when payment_intent.succeeded arrives', async () => {
    const user = await createUser();
    const order = await createOrder(user, {
      payment: { status: 'pending', intentId: 'pi_paid', method: 'card' },
      status: 'pending',
      isPaid: false,
    });

    const paymentIntent = {
      id: 'pi_paid',
      metadata: { orderId: order.id },
      currency: 'usd',
      amount_received: 2457,
      payment_method_types: ['card'],
      charges: {
        data: [{ id: 'ch_123', receipt_url: 'https://stripe.test/receipt/ch_123' }],
      },
    };

    const eventId = `evt_${uniqueValue().slice(-8)}`;
    mockConstructEvent.mockImplementation((body, signature, secret) => {
      expect(Buffer.isBuffer(body)).toBe(true);
      expect(signature).toBe('sig_mock');
      expect(secret).toBe(process.env.STRIPE_WEBHOOK_SECRET);
      return { id: eventId, type: 'payment_intent.succeeded', data: { object: paymentIntent } };
    });

    const res = await request(app)
      .post('/webhook/stripe')
      .set('stripe-signature', 'sig_mock')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ test: true }));

    expect(res.statusCode).toBe(200);
    expect(mockConstructEvent).toHaveBeenCalledTimes(1);

    const updated = await Order.findById(order.id);
    expect(updated.isPaid).toBe(true);
    expect(updated.status).toBe('confirmed');
    expect(updated.payment.status).toBe('paid');
    expect(updated.payment.transactionId).toBe('ch_123');
    expect(updated.payment.receiptUrl).toBe('https://stripe.test/receipt/ch_123');
    expect(updated.payment.amount).toBe(paymentIntent.amount_received);
    expect(updated.payment.currency).toBe('usd');
    expect(updated.payment.failureReason).toBeUndefined();
  });

  it('treats duplicate webhook deliveries as success (idempotent)', async () => {
    const user = await createUser();
    const order = await createOrder(user, {
      payment: { status: 'pending', intentId: 'pi_paid2', method: 'card' },
      status: 'pending',
      isPaid: false,
    });

    const paymentIntent = {
      id: 'pi_paid2',
      metadata: { orderId: order.id },
      currency: 'usd',
      amount_received: 2457,
      payment_method_types: ['card'],
      charges: {
        data: [{ id: 'ch_456', receipt_url: 'https://stripe.test/receipt/ch_456' }],
      },
    };

    const eventId = `evt_${uniqueValue().slice(-8)}`;
    mockConstructEvent.mockImplementation(() => {
      return { id: eventId, type: 'payment_intent.succeeded', data: { object: paymentIntent } };
    });

    const res1 = await request(app)
      .post('/webhook/stripe')
      .set('stripe-signature', 'sig_mock')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ test: true }));
    expect(res1.statusCode).toBe(200);

    const res2 = await request(app)
      .post('/webhook/stripe')
      .set('stripe-signature', 'sig_mock')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ test: true }));
    expect(res2.statusCode).toBe(200);

    const updated = await Order.findById(order.id);
    expect(updated.isPaid).toBe(true);
    expect(updated.payment.status).toBe('paid');
  });
});
