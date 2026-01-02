const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

// All routes require admin authentication
router.use(protect, authorizeRoles('admin'));

// Dashboard overview
router.get('/overview', analyticsController.getOverview);

// Sales chart data
router.get('/sales', analyticsController.getSalesData);

// Top selling products
router.get('/top-products', analyticsController.getTopProducts);

// Orders by status
router.get('/order-status', analyticsController.getOrdersByStatus);

// Customer acquisition data
router.get('/customers', analyticsController.getCustomerData);

// Revenue by category
router.get('/revenue-by-category', analyticsController.getRevenueByCategory);

module.exports = router;
