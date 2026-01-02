const asyncHandler = require('express-async-handler');
const Order = require('../models/order.model');
const { createPaymentIntent } = require('../utils/payment.utils');

exports.createPaymentIntent = asyncHandler(async (req, res) => {
  const { orderId, currency = 'usd' } = req.body;
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ message: 'Payments are not configured' });
  }

  // CRITICAL: Verify user email is confirmed before allowing payment
  if (!req.user.isVerified) {
    res.status(403);
    throw new Error('Please verify your email address before making a payment');
  }

  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  if (order.user.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Not allowed to pay for this order');
  }
  if (order.isPaid) {
    res.status(400);
    throw new Error('Order already settled');
  }

  const amountCents = Math.round((Number(order.totalPrice) || 0) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    res.status(400);
    throw new Error('Order total is invalid for payment');
  }
  const normalizedCurrency = (currency || 'usd').toLowerCase();

  const intent = await createPaymentIntent(amountCents, normalizedCurrency, {
    userId: req.user.id,
    orderId: order.id,
  });

  order.payment = order.payment || {};
  order.payment.method = 'card';
  order.payment.status = 'pending';
  order.payment.transactionId = intent.id;
  order.payment.intentId = intent.id;
  order.payment.currency = normalizedCurrency;
  order.payment.amount = amountCents;
  order.payment.receiptUrl = undefined;
  order.payment.failureReason = undefined;
  order.isPaid = false;
  await order.save();

  res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
});