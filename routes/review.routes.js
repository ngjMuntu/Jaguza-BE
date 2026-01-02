const express = require('express');
const { body, param, query } = require('express-validator');
const { protect } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const {
  getProductReviews,
  addProductReview,
  updateReview,
  deleteReview,
  canReviewProduct,
  getMyReviews
} = require('../controllers/review.controller');

const router = express.Router();

// Public: Get reviews for a product
router.get('/product/:productId',
  validate([
    param('productId').isMongoId(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('sort').optional().isIn(['newest', 'oldest', 'highest', 'lowest'])
  ]),
  getProductReviews
);

// Protected: Check if user can review a product
router.get('/can-review/:productId',
  protect,
  validate([param('productId').isMongoId()]),
  canReviewProduct
);

// Protected: Get user's own reviews
router.get('/my-reviews', protect, getMyReviews);

// Protected: Add a review
router.post('/product/:productId',
  protect,
  validate([
    param('productId').isMongoId(),
    body('rating').isInt({ min: 1, max: 5 }),
    body('comment').optional().isString().trim().isLength({ max: 2000 })
  ]),
  addProductReview
);

// Protected: Update own review
router.put('/:reviewId',
  protect,
  validate([
    param('reviewId').isMongoId(),
    body('rating').optional().isInt({ min: 1, max: 5 }),
    body('comment').optional().isString().trim().isLength({ max: 2000 })
  ]),
  updateReview
);

// Protected: Delete own review (or admin)
router.delete('/:reviewId',
  protect,
  validate([param('reviewId').isMongoId()]),
  deleteReview
);

module.exports = router;
