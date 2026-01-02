const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');
const { adminLimiter, verifyAdminRouteKey, ipAllowlist } = require('../middleware/adminSecure.middleware');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validate.middleware');
const adminController = require('../controllers/admin.controller');

const router = express.Router();

// Security layers in chain
router.use(adminLimiter, verifyAdminRouteKey, ipAllowlist, protect, authorizeRoles('admin'));

// Users
router.get('/users', validate([
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isString().trim(),
  query('role').optional().isIn(['user','vip','wholesale','staff','admin']),
  query('isActive').optional().isBoolean().toBoolean()
]), adminController.listUsers);
router.get('/users/:id', validate([param('id').isMongoId()]), adminController.getUser);
router.put('/users/:id', validate([
  param('id').isMongoId(),
  body('name').optional().isString().isLength({ min: 2, max: 100 }),
  body('role').optional().isIn(['user','vip','wholesale','staff','admin'])
]), adminController.updateUser);
router.post('/users/:id/activate', validate([param('id').isMongoId()]), adminController.activateUser);
router.post('/users/:id/deactivate', validate([param('id').isMongoId()]), adminController.deactivateUser);
router.delete('/users/:id', validate([param('id').isMongoId()]), adminController.deleteUser);

// Products CRUD
router.get('/products', validate([
  query('page').optional().isInt({ min:1 }),
  query('limit').optional().isInt({ min:1, max:100 }),
  query('search').optional().isString().trim(),
  query('category').optional().isMongoId(),
  query('enabled').optional().isBoolean().toBoolean(),
  query('featured').optional().isBoolean().toBoolean()
]), adminController.listProducts);
router.post('/products', validate([
  body('name').isString().notEmpty(),
  body('description').optional().isString(),
  body('category').isMongoId(),
  body('price').isFloat({ min:0 }),
  body('countInStock').isInt({ min:0 }),
  body('sku').optional().isString().trim(),
  body('tags').optional().isArray(),
  body('tags.*').optional().isString().trim(),
  body('enabled').optional().isBoolean().toBoolean(),
  body('featured').optional().isBoolean().toBoolean(),
  body('discountPercent').optional().isFloat({ min: 0, max: 100 }),
  body('promoPrice').optional().isFloat({ min: 0 }),
  body('minQty').optional().isInt({ min: 1 }),
  body('maxQty').optional().isInt({ min: 1 }),
  body('lowStockThreshold').optional().isInt({ min: 0 })
]), adminController.createProduct);
router.get('/products/:id', validate([param('id').isMongoId()]), adminController.getProduct);
router.put('/products/:id', validate([
  param('id').isMongoId(),
  body('name').optional().isString().notEmpty(),
  body('description').optional().isString(),
  body('category').optional().isMongoId(),
  body('price').optional().isFloat({ min:0 }),
  body('countInStock').optional().isInt({ min:0 }),
  body('sku').optional().isString().trim(),
  body('tags').optional().isArray(),
  body('tags.*').optional().isString().trim(),
  body('enabled').optional().isBoolean().toBoolean(),
  body('featured').optional().isBoolean().toBoolean(),
  body('discountPercent').optional().isFloat({ min: 0, max: 100 }),
  body('promoPrice').optional().isFloat({ min: 0 }),
  body('minQty').optional().isInt({ min: 1 }),
  body('maxQty').optional().isInt({ min: 1 }),
  body('lowStockThreshold').optional().isInt({ min: 0 })
]), adminController.updateProduct);
router.put('/products/:id/visibility', validate([
  param('id').isMongoId(),
  body('enabled').isBoolean().toBoolean()
]), adminController.setProductVisibility);
router.put('/products/:id/feature', validate([
  param('id').isMongoId(),
  body('featured').isBoolean().toBoolean()
]), adminController.setProductFeatured);
router.delete('/products/:id', validate([param('id').isMongoId()]), adminController.deleteProduct);

// Categories
router.get('/categories', adminController.listCategories);
router.get('/categories/tree', adminController.listCategoryTree);
router.post('/categories', validate([
  body('name').isString().notEmpty(),
  body('description').optional().isString(),
  body('parent').optional().isMongoId(),
  body('isEnabled').optional().isBoolean().toBoolean(),
  body('isFeatured').optional().isBoolean().toBoolean(),
  body('menuVisible').optional().isBoolean().toBoolean(),
  body('sortOrder').optional().isInt(),
  body('image').optional().isString().trim()
]), adminController.createCategory);
router.put('/categories/:id', validate([
  param('id').isMongoId(),
  body('name').optional().isString().notEmpty(),
  body('description').optional().isString(),
  body('parent').optional().custom((val) => val === null || val === '' || /^[0-9a-fA-F]{24}$/.test(String(val))),
  body('isEnabled').optional().isBoolean().toBoolean(),
  body('isFeatured').optional().isBoolean().toBoolean(),
  body('menuVisible').optional().isBoolean().toBoolean(),
  body('sortOrder').optional().isInt(),
  body('image').optional().isString().trim()
]), adminController.updateCategory);
router.put('/categories/:id/visibility', validate([
  param('id').isMongoId(),
  body('isEnabled').isBoolean().toBoolean()
]), adminController.setCategoryVisibility);
router.put('/categories/:id/feature', validate([
  param('id').isMongoId(),
  body('isFeatured').isBoolean().toBoolean()
]), adminController.setCategoryFeatured);
router.delete('/categories/:id', validate([param('id').isMongoId()]), adminController.deleteCategory);

// Orders
router.get('/orders', validate([
  query('page').optional().isInt({ min:1 }),
  query('limit').optional().isInt({ min:1, max:100 }),
  query('user').optional().isMongoId(),
  query('status').optional().isIn(['pending','confirmed','processing','shipped','delivered','cancelled','returned','refunded']),
  query('paymentStatus').optional().isIn(['pending','paid','failed','refunded']),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601()
]), adminController.listOrders);
router.get('/orders/:id', validate([param('id').isMongoId()]), adminController.getOrder);
router.put('/orders/:id/deliver', validate([param('id').isMongoId()]), adminController.markDelivered);
router.put('/orders/:id/status', validate([
  param('id').isMongoId(),
  body('status').isIn(['pending','confirmed','processing','shipped','delivered','cancelled','returned','refunded']),
  body('shippingStatus').optional().isIn(['pending','shipped','in-transit','delivered','returned']),
  body('trackingNumber').optional().isString().trim(),
  body('courier').optional().isString().trim()
]), adminController.updateOrderStatus);

// Analytics
router.get('/analytics/summary', adminController.summary);
router.get('/analytics/sales', adminController.salesOverTime);
router.get('/analytics/top-products', adminController.topProducts);
router.get('/analytics/users', adminController.userGrowth);

module.exports = router;