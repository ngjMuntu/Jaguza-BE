const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Product = require('../models/product.model');
const Order = require('../models/order.model');

/**
 * @desc    Get reviews for a product
 * @route   GET /api/reviews/product/:productId
 * @access  Public
 */
exports.getProductReviews = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { page = 1, limit = 10, sort = 'newest' } = req.query;
  
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    res.status(400);
    throw new Error('Invalid product ID');
  }
  
  const product = await Product.findById(productId)
    .select('reviews ratingAvg ratingCount name')
    .lean();
  
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  
  let reviews = product.reviews || [];
  
  // Sort reviews
  if (sort === 'newest') {
    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else if (sort === 'oldest') {
    reviews.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } else if (sort === 'highest') {
    reviews.sort((a, b) => b.rating - a.rating);
  } else if (sort === 'lowest') {
    reviews.sort((a, b) => a.rating - b.rating);
  }
  
  // Paginate
  const skip = (Number(page) - 1) * Number(limit);
  const paginatedReviews = reviews.slice(skip, skip + Number(limit));
  
  // Get user info for reviews
  const User = require('../models/user.model');
  const userIds = paginatedReviews.map(r => r.user).filter(Boolean);
  const users = await User.find({ _id: { $in: userIds } })
    .select('name')
    .lean();
  const userMap = new Map(users.map(u => [u._id.toString(), u]));
  
  const reviewsWithUser = paginatedReviews.map(r => ({
    ...r,
    userName: userMap.get(r.user?.toString())?.name || 'Anonymous'
  }));
  
  // Calculate rating distribution
  const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach(r => {
    if (r.rating >= 1 && r.rating <= 5) {
      ratingDistribution[r.rating]++;
    }
  });
  
  res.json({
    productId,
    productName: product.name,
    ratingAvg: product.ratingAvg || 0,
    ratingCount: product.ratingCount || 0,
    ratingDistribution,
    reviews: reviewsWithUser,
    page: Number(page),
    pages: Math.ceil(reviews.length / Number(limit)),
    total: reviews.length
  });
});

/**
 * @desc    Add a review to a product
 * @route   POST /api/reviews/product/:productId
 * @access  Private (must have purchased)
 */
exports.addProductReview = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { rating, comment } = req.body;
  const userId = req.user.id;
  
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    res.status(400);
    throw new Error('Invalid product ID');
  }
  
  if (!rating || rating < 1 || rating > 5) {
    res.status(400);
    throw new Error('Rating must be between 1 and 5');
  }
  
  const product = await Product.findById(productId);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  
  // Check if user has purchased this product
  const hasPurchased = await Order.exists({
    user: userId,
    'orderItems.product': productId,
    isPaid: true,
    status: { $in: ['confirmed', 'processing', 'shipped', 'delivered'] }
  });
  
  if (!hasPurchased) {
    res.status(403);
    throw new Error('You can only review products you have purchased');
  }
  
  // Check if user already reviewed this product
  const existingReview = product.reviews.find(
    r => r.user && r.user.toString() === userId
  );
  
  if (existingReview) {
    res.status(400);
    throw new Error('You have already reviewed this product');
  }
  
  // Add the review
  const review = {
    user: userId,
    rating: Number(rating),
    comment: comment?.trim() || '',
    createdAt: new Date()
  };
  
  product.reviews.push(review);
  
  // Recalculate rating average
  const totalRating = product.reviews.reduce((sum, r) => sum + r.rating, 0);
  product.ratingCount = product.reviews.length;
  product.ratingAvg = Number((totalRating / product.ratingCount).toFixed(1));
  
  await product.save();
  
  res.status(201).json({
    message: 'Review added successfully',
    review: {
      ...review,
      userName: req.user.name
    },
    newRatingAvg: product.ratingAvg,
    newRatingCount: product.ratingCount
  });
});

/**
 * @desc    Update a review
 * @route   PUT /api/reviews/:reviewId
 * @access  Private (owner only)
 */
exports.updateReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const { rating, comment } = req.body;
  const userId = req.user.id;
  
  // Find product with this review
  const product = await Product.findOne({ 'reviews._id': reviewId });
  
  if (!product) {
    res.status(404);
    throw new Error('Review not found');
  }
  
  const review = product.reviews.id(reviewId);
  
  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }
  
  if (review.user.toString() !== userId) {
    res.status(403);
    throw new Error('You can only edit your own reviews');
  }
  
  // Update review
  if (rating) review.rating = Number(rating);
  if (comment !== undefined) review.comment = comment.trim();
  
  // Recalculate rating average
  const totalRating = product.reviews.reduce((sum, r) => sum + r.rating, 0);
  product.ratingAvg = Number((totalRating / product.reviews.length).toFixed(1));
  
  await product.save();
  
  res.json({
    message: 'Review updated successfully',
    review,
    newRatingAvg: product.ratingAvg
  });
});

/**
 * @desc    Delete a review
 * @route   DELETE /api/reviews/:reviewId
 * @access  Private (owner or admin)
 */
exports.deleteReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';
  
  const product = await Product.findOne({ 'reviews._id': reviewId });
  
  if (!product) {
    res.status(404);
    throw new Error('Review not found');
  }
  
  const review = product.reviews.id(reviewId);
  
  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }
  
  if (review.user.toString() !== userId && !isAdmin) {
    res.status(403);
    throw new Error('Not authorized to delete this review');
  }
  
  // Remove review
  product.reviews.pull(reviewId);
  
  // Recalculate rating
  if (product.reviews.length > 0) {
    const totalRating = product.reviews.reduce((sum, r) => sum + r.rating, 0);
    product.ratingCount = product.reviews.length;
    product.ratingAvg = Number((totalRating / product.ratingCount).toFixed(1));
  } else {
    product.ratingCount = 0;
    product.ratingAvg = 0;
  }
  
  await product.save();
  
  res.json({
    message: 'Review deleted successfully',
    newRatingAvg: product.ratingAvg,
    newRatingCount: product.ratingCount
  });
});

/**
 * @desc    Check if user can review a product
 * @route   GET /api/reviews/can-review/:productId
 * @access  Private
 */
exports.canReviewProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const userId = req.user.id;
  
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    res.status(400);
    throw new Error('Invalid product ID');
  }
  
  // Check if purchased
  const hasPurchased = await Order.exists({
    user: userId,
    'orderItems.product': productId,
    isPaid: true,
    status: { $in: ['confirmed', 'processing', 'shipped', 'delivered'] }
  });
  
  if (!hasPurchased) {
    return res.json({ canReview: false, reason: 'not_purchased' });
  }
  
  // Check if already reviewed
  const product = await Product.findById(productId).select('reviews').lean();
  const hasReviewed = product?.reviews?.some(
    r => r.user && r.user.toString() === userId
  );
  
  if (hasReviewed) {
    return res.json({ canReview: false, reason: 'already_reviewed' });
  }
  
  res.json({ canReview: true });
});

/**
 * @desc    Get user's reviews
 * @route   GET /api/reviews/my-reviews
 * @access  Private
 */
exports.getMyReviews = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  const products = await Product.find({ 'reviews.user': userId })
    .select('name slug images reviews')
    .lean();
  
  const myReviews = products.flatMap(product => {
    const userReviews = product.reviews.filter(
      r => r.user && r.user.toString() === userId
    );
    return userReviews.map(review => ({
      ...review,
      productId: product._id,
      productName: product.name,
      productSlug: product.slug,
      productImage: product.images?.[0]
    }));
  });
  
  // Sort by newest first
  myReviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json(myReviews);
});
