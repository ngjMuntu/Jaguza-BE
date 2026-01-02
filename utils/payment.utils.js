let stripe;
function getStripe() {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('Stripe not configured');
    const Stripe = require('stripe');
    stripe = new Stripe(key);
  }
  return stripe;
}
async function createPaymentIntent(amount, currency = 'usd', metadata = {}) {
  const s = getStripe();
  return await s.paymentIntents.create(
    { amount, currency, payment_method_types: ['card'], metadata },
    { idempotencyKey: `pi:create:${metadata.orderId || 'order'}:${amount}:${currency}` }
  );
}
module.exports = { createPaymentIntent, getStripe };