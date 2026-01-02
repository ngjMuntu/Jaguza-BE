const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema({
  provider: { type: String, required: true, trim: true },
  eventId: { type: String, required: true, trim: true },
  type: { type: String, required: true, trim: true },
  orderId: { type: String, trim: true },
  receivedAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date },
  attempts: { type: Number, default: 0, min: 0 },
  processedAt: { type: Date },
  lastError: { type: String, trim: true },
}, {
  timestamps: true,
});

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
// Prevent unbounded growth of idempotency records.
webhookEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
