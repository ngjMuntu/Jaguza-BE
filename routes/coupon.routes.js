const express = require('express');
const { body } = require('express-validator');
const { protect } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const {
  validateCoupon,
  getActiveCoupons
} = require('../controllers/coupon.controller');

const router = express.Router();

// Public: Get active promotional coupons
router.get('/active', getActiveCoupons);

// Protected: Validate a coupon code
router.post('/validate',
  protect,
  validate([
    body('code').isString().trim().notEmpty(),
    body('orderTotal').optional().isFloat({ min: 0 })
  ]),
  validateCoupon
);

module.exports = router;
