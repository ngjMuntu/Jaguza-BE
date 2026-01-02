const asyncHandler = require('express-async-handler');
const Wishlist = require('../models/wishlist.model');

// @desc    Get current user's wishlist
// @route   GET /api/wishlist
// @access  Private
exports.getWishlist = asyncHandler(async (req, res) => {
  const wl = await Wishlist.findOne({ user: req.user.id })
    .populate('products', 'name slug price images countInStock')
    .lean();
  res.json(wl || { products: [] });
});

// @desc    Add a product to wishlist
// @route   POST /api/wishlist
// @access  Private
exports.addToWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.body;
  let wl = await Wishlist.findOne({ user: req.user.id });
  if (!wl) wl = new Wishlist({ user: req.user.id, products: [] });

  // Prevent duplicates: compare ObjectIds as strings
  if (!wl.products.some(p => p.toString() === productId)) {
    wl.products.push(productId);
    await wl.save();
  }
  await wl.populate('products', 'name slug price images countInStock');
  res.json(wl);
});

// @desc    Remove a product from wishlist
// @route   DELETE /api/wishlist/:productId
// @access  Private
exports.removeFromWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const wl = await Wishlist.findOne({ user: req.user.id });
  if (!wl) {
    res.status(404);
    throw new Error('Wishlist not found');
  }
  wl.products = wl.products.filter(p => p.toString() !== productId);
  await wl.save();
  await wl.populate('products', 'name slug price images countInStock');
  res.json(wl);
});

// @desc    Clear wishlist
// @route   DELETE /api/wishlist
// @access  Private
exports.clearWishlist = asyncHandler(async (req, res) => {
  const wl = await Wishlist.findOne({ user: req.user.id });
  if (wl) {
    wl.products = [];
    await wl.save();
  }
  res.json({ message: 'Wishlist cleared' });
});