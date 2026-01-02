const express = require('express');
const { getCategories, getCategory } = require('../controllers/category.controller');
const cacheMiddleware = require('../middleware/cache.middleware');

const router = express.Router();

router.get('/', cacheMiddleware(300), getCategories);
router.get('/:identifier', cacheMiddleware(300), getCategory);

module.exports = router;