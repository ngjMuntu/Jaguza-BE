const asyncHandler = require('express-async-handler');
const Cart = require('../models/cart.model');
const Product = require('../models/product.model');

// @desc    Get current user's cart
// @route   GET /api/cart
// @access  Private
exports.getCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user.id })
    .populate('items.product', 'name slug price images countInStock maxQty')
    .lean();
  res.json(cart || { items: [] });
});

// @desc    Add or update an item in cart
// @route   POST /api/cart
// @access  Private
exports.addToCart = asyncHandler(async (req, res) => {
  const { productId, quantity } = req.body;
  if (!productId || !quantity) {
    res.status(400);
    throw new Error('Product ID and quantity are required');
  }
  const qty = Math.max(1, Math.min(parseInt(quantity, 10), 100));

  const product = await Product.findById(productId).lean();
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  if (product.countInStock < qty) {
    res.status(400);
    throw new Error('Requested quantity exceeds stock');
  }

  let cart = await Cart.findOne({ user: req.user.id });
  if (!cart) {
    cart = new Cart({ user: req.user.id, items: [] });
  }

  const existing = cart.items.find(i => i.product.toString() === productId);
  if (existing) {
    if (product.countInStock < qty) {
      res.status(400);
      throw new Error('Requested quantity exceeds stock');
    }
    existing.quantity = qty;
  } else {
    cart.items.push({ product: productId, quantity: qty });
  }
  await cart.save();
  await cart.populate('items.product', 'name slug price images countInStock maxQty');
  res.json(cart);
});

// @desc    Remove an item from cart
// @route   DELETE /api/cart/:itemId
// @access  Private
exports.removeFromCart = asyncHandler(async (req, res) => {
  const { itemId } = req.params;
  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart) {
    res.status(404);
    throw new Error('Cart not found');
  }
  cart.items = cart.items.filter(i => i._id.toString() !== itemId);
  await cart.save();
  await cart.populate('items.product', 'name slug price images countInStock maxQty');
  res.json(cart);
});

// @desc    Clear all items from cart
// @route   DELETE /api/cart
// @access  Private
exports.clearCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user.id });
  if (cart) {
    cart.items = [];
    await cart.save();
  }
  res.json({ message: 'Cart cleared' });
});