const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1 },
}, { _id: true });

const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items: [cartItemSchema],
}, {
  timestamps: true,
});

// User index created automatically via unique: true
// cartSchema.index({ user: 1 }); // Removed to prevent duplicate index warning

module.exports = mongoose.model('Cart', cartSchema);