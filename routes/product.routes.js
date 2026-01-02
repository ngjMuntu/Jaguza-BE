const express = require('express');
const { getProducts, getProductById } = require('../controllers/product.controller');
const cacheMiddleware = require('../middleware/cache.middleware');

const router = express.Router();

router.get('/', cacheMiddleware(300), getProducts);
router.get('/:identifier', cacheMiddleware(300), getProductById);

module.exports = router;