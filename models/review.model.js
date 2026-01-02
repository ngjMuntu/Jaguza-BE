import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      // Optional - used to verify purchase
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
    },
    title: {
      type: String,
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    comment: {
      type: String,
      required: [true, 'Review comment is required'],
      trim: true,
      minlength: [10, 'Comment must be at least 10 characters'],
      maxlength: [2000, 'Comment cannot exceed 2000 characters'],
    },
    images: [
      {
        type: String,
        validate: {
          validator: (v) => /^https?:\/\/.+/i.test(v),
          message: 'Invalid image URL',
        },
      },
    ],
    verifiedPurchase: {
      type: Boolean,
      default: false,
    },
    helpfulCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    helpfulVotes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isApproved: {
      type: Boolean,
      default: true, // Auto-approve or require moderation
    },
    adminResponse: {
      comment: String,
      respondedAt: Date,
      respondedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index - one review per user per product
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

// Index for querying approved reviews
reviewSchema.index({ product: 1, isApproved: 1, createdAt: -1 });

// Virtual for time since review
reviewSchema.virtual('timeAgo').get(function () {
  const seconds = Math.floor((new Date() - this.createdAt) / 1000);
  
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
  };
  
  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
    }
  }
  
  return 'Just now';
});

// Static: Get product review statistics
reviewSchema.statics.getProductStats = async function (productId) {
  const stats = await this.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId), isApproved: true } },
    {
      $group: {
        _id: '$product',
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
        ratingDistribution: {
          $push: '$rating',
        },
      },
    },
  ]);
  
  if (stats.length === 0) {
    return {
      averageRating: 0,
      totalReviews: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }
  
  // Calculate rating distribution
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  stats[0].ratingDistribution.forEach((rating) => {
    distribution[rating]++;
  });
  
  return {
    averageRating: Math.round(stats[0].averageRating * 10) / 10,
    totalReviews: stats[0].totalReviews,
    ratingDistribution: distribution,
  };
};

// Static: Update product rating after review change
reviewSchema.statics.updateProductRating = async function (productId) {
  const stats = await this.getProductStats(productId);
  
  await mongoose.model('Product').findByIdAndUpdate(productId, {
    ratingAvg: stats.averageRating,
    ratingCount: stats.totalReviews,
  });
  
  return stats;
};

// Post-save hook to update product rating
reviewSchema.post('save', async function () {
  await this.constructor.updateProductRating(this.product);
});

// Post-remove hook to update product rating
reviewSchema.post('findOneAndDelete', async function (doc) {
  if (doc) {
    await mongoose.model('Review').updateProductRating(doc.product);
  }
});

// Method: Check if user has already reviewed this product
reviewSchema.statics.hasUserReviewed = async function (userId, productId) {
  const review = await this.findOne({ user: userId, product: productId });
  return !!review;
};

// Method: Mark review as helpful
reviewSchema.methods.markHelpful = async function (userId) {
  // Check if user already voted
  if (this.helpfulVotes.includes(userId)) {
    return false;
  }
  
  this.helpfulVotes.push(userId);
  this.helpfulCount = this.helpfulVotes.length;
  await this.save();
  return true;
};

const Review = mongoose.model('Review', reviewSchema);

export default Review;
