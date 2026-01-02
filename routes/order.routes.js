const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const rateLimit = require('express-rate-limit');
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validate.middleware');
const { env } = require('../config/env');
const {
  addOrderItems,
  getMyOrders,
  getOrderById
} = require('../controllers/order.controller');

const router = express.Router();
router.use(protect);

// Prevent abuse/spam orders per user; keeps checkout endpoints predictable.
const createOrderLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?.id || req.ip),
});

router.post('/',
  createOrderLimiter,
  validate([
    // Back-compat: accept orderItems; prefer minimal item shape { productId, qty }
    body('orderItems').isArray({ min: 1 }),
    body('orderItems.*.productId').optional().isMongoId(),
    body('orderItems.*.product').optional().isMongoId(),
    body('orderItems.*.qty').optional().isInt({ min: 1, max: 100 }),
    body('orderItems.*.quantity').optional().isInt({ min: 1, max: 100 }),

    // Shipping (minimal required set)
    body('shippingAddress.address').isString().notEmpty(),
    body('shippingAddress.city').isString().notEmpty(),
    body('shippingAddress.postalCode').isString().notEmpty(),
    body('shippingAddress.country').isString().notEmpty(),

    // Payment method optional; defaults to 'card'
    body('paymentMethod').optional().isString().notEmpty(),
  ]),
  addOrderItems
);
router.get('/', getMyOrders);
router.get('/:id', validate([param('id').isMongoId()]), getOrderById);

module.exports = router;