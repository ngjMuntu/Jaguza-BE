const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist
} = require('../controllers/wishlist.controller');

const router = express.Router();

router.use(protect);
router.get('/', getWishlist);
router.post('/', addToWishlist);
router.delete('/:productId', removeFromWishlist);
router.delete('/', clearWishlist);

module.exports = router;