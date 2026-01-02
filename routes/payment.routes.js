const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const { createPaymentIntent } = require('../controllers/payment.controller');
const { validate } = require('../middleware/validate.middleware');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');

const router = express.Router();

router.use(protect);

const paymentIntentLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?.id || req.ip),
});
router.post('/create-payment-intent',
  paymentIntentLimiter,
  validate([
    body('orderId').isMongoId(),
    body('currency').optional().isString().isLength({ min: 3, max: 3 })
  ]),
  createPaymentIntent
);

module.exports = router;