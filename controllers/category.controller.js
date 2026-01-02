const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Category = require('../models/category.model');

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public
exports.getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find().sort('name').lean();
  res.json(categories);
});

// @desc    Get single category by slug or ID
// @route   GET /api/categories/:identifier
// @access  Public
exports.getCategory = asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const isObjectId = mongoose.Types.ObjectId.isValid(identifier);
  const category = await Category.findOne(
    isObjectId ? { _id: identifier } : { slug: identifier }
  ).lean();
  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }
  res.json(category);
});