const asyncHandler = require('express-async-handler');
const Coupon = require('../models/coupon.model');
const Order = require('../models/order.model');

/**
 * @desc    Validate a coupon code
 * @route   POST /api/coupons/validate
 * @access  Private
 */
exports.validateCoupon = asyncHandler(async (req, res) => {
  const { code, orderTotal = 0 } = req.body;
  
  if (!code) {
    res.status(400);
    throw new Error('Coupon code is required');
  }
  
  const coupon = await Coupon.findValidByCode(code);
  
  if (!coupon) {
    res.status(404);
    throw new Error('Invalid or expired coupon code');
  }
  
  // Check if this is user's first order
  const orderCount = await Order.countDocuments({ user: req.user.id });
  const isFirstOrder = orderCount === 0;
  
  // Check if user can use this coupon
  const canUse = await coupon.canBeUsedBy(req.user.id, isFirstOrder);
  if (!canUse.valid) {
    res.status(400);
    throw new Error(canUse.reason);
  }
  
  // Check minimum order amount
  if (orderTotal < coupon.minOrderAmount) {
    res.status(400);
    throw new Error(`Minimum order amount of $${coupon.minOrderAmount} required`);
  }
  
  // Calculate discount
  const discount = coupon.calculateDiscount(orderTotal);
  
  res.json({
    valid: true,
    code: coupon.code,
    description: coupon.description,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    calculatedDiscount: discount,
    minOrderAmount: coupon.minOrderAmount,
    maxDiscountAmount: coupon.maxDiscountAmount,
    validUntil: coupon.validUntil
  });
});

/**
 * @desc    Apply coupon to order (internal use during checkout)
 * @access  Internal
 */
exports.applyCouponToOrder = async (couponCode, userId, orderId, orderTotal) => {
  if (!couponCode) return { discount: 0, applied: false };
  
  const coupon = await Coupon.findValidByCode(couponCode);
  if (!coupon) return { discount: 0, applied: false, error: 'Invalid coupon' };
  
  const orderCount = await Order.countDocuments({ user: userId, _id: { $ne: orderId } });
  const isFirstOrder = orderCount === 0;
  
  const canUse = await coupon.canBeUsedBy(userId, isFirstOrder);
  if (!canUse.valid) return { discount: 0, applied: false, error: canUse.reason };
  
  const discount = coupon.calculateDiscount(orderTotal);
  
  // Record usage
  coupon.usedBy.push({
    user: userId,
    order: orderId,
    discountApplied: discount
  });
  coupon.usedCount += 1;
  await coupon.save();
  
  return { discount, applied: true, couponId: coupon._id };
};

/**
 * @desc    Get active public coupons (for display)
 * @route   GET /api/coupons/active
 * @access  Public
 */
exports.getActiveCoupons = asyncHandler(async (req, res) => {
  const now = new Date();
  
  const coupons = await Coupon.find({
    isActive: true,
    validFrom: { $lte: now },
    validUntil: { $gte: now },
    allowedUsers: { $size: 0 }, // Only public coupons
    $or: [
      { usageLimit: { $exists: false } },
      { $expr: { $lt: ['$usedCount', '$usageLimit'] } }
    ]
  })
  .select('code description discountType discountValue minOrderAmount validUntil')
  .limit(10)
  .lean();
  
  res.json(coupons);
});

// ========== ADMIN ROUTES ==========

/**
 * @desc    List all coupons (admin)
 * @route   GET /api/admin/.../coupons
 * @access  Admin
 */
exports.listCoupons = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  
  const query = {};
  if (status === 'active') {
    const now = new Date();
    query.isActive = true;
    query.validUntil = { $gte: now };
  } else if (status === 'expired') {
    query.validUntil = { $lt: new Date() };
  } else if (status === 'inactive') {
    query.isActive = false;
  }
  
  const [coupons, total] = await Promise.all([
    Coupon.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Coupon.countDocuments(query)
  ]);
  
  res.json({
    coupons,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    total
  });
});

/**
 * @desc    Create coupon (admin)
 * @route   POST /api/admin/.../coupons
 * @access  Admin
 */
exports.createCoupon = asyncHandler(async (req, res) => {
  const {
    code,
    description,
    discountType,
    discountValue,
    minOrderAmount,
    maxDiscountAmount,
    usageLimit,
    usageLimitPerUser,
    validFrom,
    validUntil,
    applicableCategories,
    applicableProducts,
    excludedProducts,
    allowedUsers,
    firstOrderOnly,
    isActive
  } = req.body;
  
  // Check if code already exists
  const existing = await Coupon.findOne({ code: code.toUpperCase() });
  if (existing) {
    res.status(400);
    throw new Error('Coupon code already exists');
  }
  
  const coupon = await Coupon.create({
    code: code.toUpperCase(),
    description,
    discountType,
    discountValue,
    minOrderAmount,
    maxDiscountAmount,
    usageLimit,
    usageLimitPerUser,
    validFrom,
    validUntil,
    applicableCategories,
    applicableProducts,
    excludedProducts,
    allowedUsers,
    firstOrderOnly,
    isActive: isActive !== false
  });
  
  res.status(201).json(coupon);
});

/**
 * @desc    Update coupon (admin)
 * @route   PUT /api/admin/.../coupons/:id
 * @access  Admin
 */
exports.updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  
  if (!coupon) {
    res.status(404);
    throw new Error('Coupon not found');
  }
  
  const updates = req.body;
  
  // Prevent changing code if already used
  if (updates.code && coupon.usedCount > 0 && updates.code !== coupon.code) {
    res.status(400);
    throw new Error('Cannot change code of a coupon that has been used');
  }
  
  Object.assign(coupon, updates);
  await coupon.save();
  
  res.json(coupon);
});

/**
 * @desc    Delete coupon (admin)
 * @route   DELETE /api/admin/.../coupons/:id
 * @access  Admin
 */
exports.deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  
  if (!coupon) {
    res.status(404);
    throw new Error('Coupon not found');
  }
  
  // Soft delete by deactivating if already used
  if (coupon.usedCount > 0) {
    coupon.isActive = false;
    await coupon.save();
    return res.json({ message: 'Coupon deactivated (has usage history)' });
  }
  
  await Coupon.findByIdAndDelete(req.params.id);
  res.json({ message: 'Coupon deleted' });
});

/**
 * @desc    Get coupon usage stats (admin)
 * @route   GET /api/admin/.../coupons/:id/stats
 * @access  Admin
 */
exports.getCouponStats = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id)
    .populate('usedBy.user', 'name email')
    .populate('usedBy.order', 'totalPrice createdAt');
  
  if (!coupon) {
    res.status(404);
    throw new Error('Coupon not found');
  }
  
  const totalDiscountGiven = coupon.usedBy.reduce((sum, u) => sum + (u.discountApplied || 0), 0);
  
  res.json({
    coupon: {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      isActive: coupon.isActive,
      validUntil: coupon.validUntil
    },
    stats: {
      usedCount: coupon.usedCount,
      usageLimit: coupon.usageLimit,
      totalDiscountGiven: Number(totalDiscountGiven.toFixed(2)),
      recentUsage: coupon.usedBy.slice(-10).reverse()
    }
  });
});
