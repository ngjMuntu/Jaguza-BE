const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
}, {
  timestamps: true,
});

// User index created automatically via unique: true
// wishlistSchema.index({ user: 1 }); // Removed to prevent duplicate index warning

module.exports = mongoose.model('Wishlist', wishlistSchema);