const express = require('express');
const { body, param } = require('express-validator');
const { protect } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const {
  getCart,
  addToCart,
  removeFromCart,
  clearCart
} = require('../controllers/cart.controller');

const router = express.Router();

router.use(protect);
router.get('/', getCart);
router.post('/',
  validate([
    body('productId').isMongoId(),
    body('quantity').isInt({ min: 1, max: 100 })
  ]),
  addToCart
);
router.delete('/:itemId',
  validate([
    param('itemId').isMongoId()
  ]),
  removeFromCart
);
router.delete('/', clearCart);

module.exports = router;