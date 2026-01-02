const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  sku:       { type: String, trim: true },
  name:      { type: String, required: true },
  qty:       { type: Number, required: true, min: 1 },
  image:     { type: String },
  price:     { type: Number, required: true, min: 0 },
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  method: { type: String, trim: true },
  status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  transactionId: { type: String, trim: true },
  intentId: { type: String, trim: true },
  amount: { type: Number, min: 0 }, // stored in the smallest currency unit (e.g., cents)
  currency: { type: String, trim: true },
  receiptUrl: { type: String, trim: true },
  failureReason: { type: String, trim: true }
}, { _id: false });

const shippingSchema = new mongoose.Schema({
  address: {
    line1: { type: String, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    country: { type: String, trim: true }
  },
  method: { type: String, enum: ['standard', 'express'], default: 'standard' },
  estimatedDays: { type: String, trim: true },
  courier: { type: String, trim: true },
  trackingNumber: { type: String, trim: true },
  trackingUrl: { type: String, trim: true },
  status: { type: String, enum: ['pending', 'processing', 'shipped', 'in-transit', 'out-for-delivery', 'delivered', 'returned', 'failed'], default: 'pending' },
  shippedAt: { type: Date },
  estimatedDelivery: { type: Date }
}, { _id: false });

const refundSchema = new mongoose.Schema({
  amount: { type: Number, min: 0 },
  reason: { type: String, trim: true },
  date: { type: Date }
}, { _id: false });

// Timeline event for order tracking
const timelineEventSchema = new mongoose.Schema({
  status: { type: String, required: true },
  message: { type: String },
  timestamp: { type: Date, default: Date.now },
  location: { type: String, trim: true }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderNumber:   { type: String, unique: true, sparse: true },
  orderItems:    [orderItemSchema],
  status:        { type: String, enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned', 'refunded'], default: 'pending', index: true },
  itemsPrice:     { type: Number, required: true, min: 0 },
  shippingPrice:  { type: Number, required: true, min: 0 },
  taxPrice:       { type: Number, required: true, min: 0 },
  discountAmount: { type: Number, default: 0, min: 0 },
  coupon:         { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
  totalPrice:     { type: Number, required: true, min: 0 },
  payment:        paymentSchema,
  shipping:       shippingSchema,
  refund:         refundSchema,
  timeline:       [timelineEventSchema],
  invoiceNumber:  { type: String, trim: true },
  notes:          { type: String, trim: true },
  isPaid:         { type: Boolean, default: false },
  paidAt:         Date,
  isDelivered:    { type: Boolean, default: false },
  deliveredAt:    Date,
}, {
  timestamps: true,
});

// Generate order number before saving
orderSchema.pre('save', function(next) {
  if (!this.orderNumber && this.isNew) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.orderNumber = `JGZ-${timestamp}-${random}`;
  }
  next();
});

// Add timeline event method
orderSchema.methods.addTimelineEvent = function(status, message, location) {
  this.timeline.push({
    status,
    message,
    location,
    timestamp: new Date()
  });
};

// Query hot paths
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ 'payment.intentId': 1 });

module.exports = mongoose.model('Order', orderSchema);