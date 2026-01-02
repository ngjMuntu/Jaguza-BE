const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: { 
    type: String, 
    required: true, 
    unique: true, 
    uppercase: true, 
    trim: true,
    index: true 
  },
  description: { type: String, trim: true },
  
  // Discount type and value
  discountType: { 
    type: String, 
    enum: ['percentage', 'fixed'], 
    required: true,
    default: 'percentage'
  },
  discountValue: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  
  // Constraints
  minOrderAmount: { type: Number, default: 0, min: 0 },
  maxDiscountAmount: { type: Number, min: 0 }, // Cap for percentage discounts
  
  // Usage limits
  usageLimit: { type: Number, min: 0 }, // Total times coupon can be used
  usageLimitPerUser: { type: Number, default: 1, min: 1 }, // Per user limit
  usedCount: { type: Number, default: 0, min: 0 },
  
  // Validity period
  validFrom: { type: Date, default: Date.now },
  validUntil: { type: Date, required: true },
  
  // Targeting
  applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  excludedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  
  // User restrictions
  allowedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Empty = all users
  firstOrderOnly: { type: Boolean, default: false },
  
  // Status
  isActive: { type: Boolean, default: true, index: true },
  
  // Tracking
  usedBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    usedAt: { type: Date, default: Date.now },
    discountApplied: { type: Number }
  }]
}, {
  timestamps: true,
});

// Indexes for efficient querying
couponSchema.index({ isActive: 1, validUntil: 1 });
couponSchema.index({ code: 1, isActive: 1 });

// Virtual to check if coupon is currently valid
couponSchema.virtual('isValid').get(function() {
  const now = new Date();
  return (
    this.isActive &&
    now >= this.validFrom &&
    now <= this.validUntil &&
    (this.usageLimit === undefined || this.usedCount < this.usageLimit)
  );
});

// Method to calculate discount for an order
couponSchema.methods.calculateDiscount = function(orderTotal, orderItems = []) {
  if (!this.isValid) return 0;
  if (orderTotal < this.minOrderAmount) return 0;
  
  let discount = 0;
  
  if (this.discountType === 'percentage') {
    discount = (orderTotal * this.discountValue) / 100;
    // Apply max discount cap if set
    if (this.maxDiscountAmount && discount > this.maxDiscountAmount) {
      discount = this.maxDiscountAmount;
    }
  } else {
    // Fixed discount
    discount = Math.min(this.discountValue, orderTotal);
  }
  
  return Number(discount.toFixed(2));
};

// Method to check if user can use this coupon
couponSchema.methods.canBeUsedBy = async function(userId, isFirstOrder = false) {
  // Check if coupon is valid
  if (!this.isValid) {
    return { valid: false, reason: 'Coupon is not valid or has expired' };
  }
  
  // Check first order restriction
  if (this.firstOrderOnly && !isFirstOrder) {
    return { valid: false, reason: 'This coupon is only valid for first orders' };
  }
  
  // Check allowed users
  if (this.allowedUsers.length > 0) {
    const isAllowed = this.allowedUsers.some(u => u.toString() === userId.toString());
    if (!isAllowed) {
      return { valid: false, reason: 'This coupon is not available for your account' };
    }
  }
  
  // Check per-user usage limit
  const userUsageCount = this.usedBy.filter(u => u.user.toString() === userId.toString()).length;
  if (userUsageCount >= this.usageLimitPerUser) {
    return { valid: false, reason: 'You have already used this coupon the maximum number of times' };
  }
  
  return { valid: true };
};

// Static method to find valid coupon by code
couponSchema.statics.findValidByCode = function(code) {
  const now = new Date();
  return this.findOne({
    code: code.toUpperCase(),
    isActive: true,
    validFrom: { $lte: now },
    validUntil: { $gte: now },
    $or: [
      { usageLimit: { $exists: false } },
      { $expr: { $lt: ['$usedCount', '$usageLimit'] } }
    ]
  });
};

module.exports = mongoose.model('Coupon', couponSchema);
