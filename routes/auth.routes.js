const express = require('express');
const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');
const { body } = require('express-validator');
const {
  register,
  verifyEmail,
  login,
  forgotPassword,
  resetPassword,
  updateProfile,
  logout,
  refresh
} = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const User = require('../models/user.model');

const router = express.Router();

// Stricter per-route rate limits for auth endpoints
const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: Math.max(10, Math.floor(env.RATE_LIMIT_MAX / 4)), // tighter than global
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', authLimiter,
  validate([
    body('name').isString().trim().isLength({ min: 2, max: 100 }),
    body('sex').optional().isIn(['male','female','other']),
    body('email').isEmail().normalizeEmail(),
    body('password').isString().matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/),
    body('phone').optional().isString().trim().isLength({ min: 5, max: 24 }),
    body('city').optional().isString().trim().isLength({ min: 2, max: 100 }),
    body('country').optional().isString().trim().isLength({ min: 2, max: 100 })
  ]),
  register
);

router.get('/verify-email/:token', verifyEmail);

router.post('/login', authLimiter,
  validate([
    body('email').isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 8 })
  ]),
  login
);

router.post('/logout',
  logout
);

// Refresh access token
router.post('/refresh', authLimiter, refresh);

router.post('/forgot-password', authLimiter,
  validate([
    body('email').isEmail().normalizeEmail()
  ]),
  forgotPassword
);

router.put('/reset-password/:token',
  validate([
    body('password').isString().matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)
  ]),
  resetPassword
);

router.put('/profile',
  protect,
  validate([
    body('name').optional().isString().trim().isLength({ min: 2, max: 100 }),
    body('password').optional().isString().matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)
  ]),
  updateProfile
);

// Self profile (for admin UI convenience)
router.get('/profile-self', protect, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password').lean();
  res.json({ user });
});

// Diagnostic: verify auth cookie & role quickly (development aid)
if (env.NODE_ENV !== 'production') {
  router.get('/ping-auth', protect, (req, res) => {
    res.json({ ok: true, user: { id: req.user.id, role: req.user.role } });
  });
}

module.exports = router;