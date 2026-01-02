const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Product = require('../models/product.model');
const Category = require('../models/category.model');
const { safeSearchRegex } = require('../utils/regex.utils');

// @desc    Get products (paginated, filtered, sorted, searched)
// @route   GET /api/products
// @access  Public
exports.getProducts = asyncHandler(async (req, res) => {
  const MAX_LIMIT = 100;
  const ALLOWED_SORTS = new Set(['createdAt', 'price', 'name', 'ratingAvg', 'ratingCount']);

  let { page = 1, limit = 12, sort = 'createdAt', order = 'desc', category, search } = req.query;
  page = Math.max(1, Number.parseInt(page, 10) || 1);
  limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(limit, 10) || 12));
  if (!ALLOWED_SORTS.has(String(sort))) sort = 'createdAt';
  const sortOrder = String(order).toLowerCase() === 'asc' ? 1 : -1;

  const query = { enabled: true, isDeleted: { $ne: true } };
  if (category) {
    const cat = await Category.findOne({ slug: category }).lean();
    if (cat) query.category = cat._id;
  }
  if (search) {
    const rx = safeSearchRegex(search);
    if (rx) query.name = rx;
  }
  const total = await Product.countDocuments(query);
  const products = await Product.find(query)
    .populate('category', 'name slug')
    .sort({ [sort]: sortOrder })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  res.json({
    page,
    pages: Math.ceil(total / limit),
    total,
    products
  });
});

// @desc    Get single product by slug or ID
// @route   GET /api/products/:identifier
// @access  Public
exports.getProductById = asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const isObjectId = mongoose.Types.ObjectId.isValid(identifier);
  const product = await Product.findOne(
    isObjectId
      ? { _id: identifier, enabled: true, isDeleted: { $ne: true } }
      : { slug: identifier, enabled: true, isDeleted: { $ne: true } }
  ).populate('category', 'name slug').lean();

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  res.json(product);
});