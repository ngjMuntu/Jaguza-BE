const asyncHandler = require('express-async-handler');
const Order = require('../models/order.model');
const { getStripe } = require('../utils/payment.utils');
const WebhookEvent = require('../models/webhookEvent.model');
const { env } = require('../config/env');

const STRIPE_WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;

async function markOrderPaid(paymentIntent) {
  const orderId = paymentIntent?.metadata?.orderId;
  if (!orderId) return;
  const order = await Order.findById(orderId);
  if (!order) return;

  // Do not mutate terminal-ish states.
  if (order.status === 'cancelled' || order.status === 'refunded') return;

  // Idempotency: if already paid, do nothing.
  if (order.isPaid || order.payment?.status === 'paid') return;

  // Guard against mismatched payment amount/currency.
  const expectedAmount = order.payment?.amount;
  const expectedCurrency = order.payment?.currency;
  if (Number.isFinite(expectedAmount) && expectedAmount > 0 && paymentIntent.amount_received != null) {
    if (Number(paymentIntent.amount_received) !== Number(expectedAmount)) {
      order.payment = order.payment || {};
      order.payment.status = 'failed';
      order.payment.failureReason = 'Payment amount mismatch';
      await order.save();
      return;
    }
  }
  if (expectedCurrency && paymentIntent.currency) {
    if (String(paymentIntent.currency).toLowerCase() !== String(expectedCurrency).toLowerCase()) {
      order.payment = order.payment || {};
      order.payment.status = 'failed';
      order.payment.failureReason = 'Payment currency mismatch';
      await order.save();
      return;
    }
  }

  const charge = paymentIntent.charges?.data?.[0];
  order.payment = order.payment || {};
  order.payment.status = 'paid';
  order.payment.intentId = paymentIntent.id;
  order.payment.transactionId = charge?.id || paymentIntent.id;
  order.payment.currency = paymentIntent.currency;
  order.payment.amount = paymentIntent.amount_received;
  order.payment.method = paymentIntent.payment_method_types?.[0] || order.payment.method || 'card';
  order.payment.receiptUrl = charge?.receipt_url || order.payment.receiptUrl;
  order.payment.failureReason = undefined;
  order.isPaid = true;
  order.paidAt = new Date();
  if (order.status === 'pending') order.status = 'confirmed';
  await order.save();
}

async function markOrderFailed(paymentIntent) {
  const orderId = paymentIntent?.metadata?.orderId;
  if (!orderId) return;
  const order = await Order.findById(orderId);
  if (!order) return;

  // If already settled/refunded, ignore late failure events.
  if (order.isPaid || order.payment?.status === 'paid' || order.payment?.status === 'refunded' || order.status === 'refunded') {
    return;
  }

  order.payment = order.payment || {};
  order.payment.status = 'failed';
  order.payment.intentId = paymentIntent.id;
  order.payment.failureReason = paymentIntent.last_payment_error?.message || 'Payment failed';
  order.isPaid = false;
  await order.save();
}

async function markOrderRefunded(charge) {
  const intentId = charge?.payment_intent;
  if (!intentId) return;
  const order = await Order.findOne({ 'payment.intentId': intentId });
  if (!order) return;

  // Idempotency: if already refunded, do nothing.
  if (order.payment?.status === 'refunded' || order.status === 'refunded') return;

  order.payment = order.payment || {};
  order.payment.status = 'refunded';
  order.payment.transactionId = charge.id || order.payment.transactionId;
  order.refund = order.refund || {};
  order.refund.amount = charge.amount_refunded;
  order.refund.reason = charge.refunds?.data?.[0]?.reason || order.refund.reason;
  order.refund.date = new Date();
  order.status = 'refunded';
  order.isPaid = false;
  await order.save();
}

exports.handleStripeWebhook = asyncHandler(async (req, res) => {
  if (!env.STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe-webhook] Missing Stripe configuration');
    return res.status(503).json({ message: 'Stripe webhook not configured' });
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).send('Missing Stripe-Signature header');
  }

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const provider = 'stripe';
  const eventId = event?.id ? String(event.id) : '';
  if (!eventId) {
    return res.status(400).send('Webhook Error: Missing event id');
  }
  const eventType = event?.type ? String(event.type) : 'unknown';
  const orderId = event?.data?.object?.metadata?.orderId ? String(event.data.object.metadata.orderId) : undefined;

  // Webhook idempotency (with retry-safety):
  // - We only set processedAt after successful handling.
  // - If a prior attempt failed mid-handler, Stripe retries should re-run the handler.
  let eventRecord;
  try {
    const now = new Date();
    eventRecord = await WebhookEvent.findOneAndUpdate(
      { provider, eventId },
      {
        $setOnInsert: { provider, eventId, receivedAt: now },
        $set: { type: eventType, orderId, lastSeenAt: now },
        $inc: { attempts: 1 },
      },
      { upsert: true, new: true, runValidators: true }
    );
  } catch (err) {
    console.error('[stripe-webhook] Failed to persist event idempotency record', err);
    return res.status(500).send('Failed to process event');
  }

  if (eventRecord?.processedAt) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await markOrderPaid(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await markOrderFailed(event.data.object);
        break;
      case 'charge.refunded':
        await markOrderRefunded(event.data.object);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error('[stripe-webhook] Handler failure', err);
    try {
      await WebhookEvent.updateOne(
        { provider, eventId },
        { $set: { lastError: String(err?.message || err || 'Handler failure') } }
      );
    } catch {}
    return res.status(500).send('Failed to process event');
  }

  await WebhookEvent.updateOne(
    { provider, eventId },
    { $set: { processedAt: new Date(), lastError: undefined } }
  );

  res.json({ received: true });
});
