const Order = require('../models/order.model');
const Product = require('../models/product.model');
const User = require('../models/user.model');
const logger = require('../logging/logger');

/**
 * Get dashboard overview stats
 * @route GET /api/admin/analytics/overview
 */
exports.getOverview = async (req, res, next) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Current month stats
    const [
      totalOrders,
      monthOrders,
      lastMonthOrders,
      totalRevenue,
      monthRevenue,
      lastMonthRevenue,
      totalCustomers,
      newCustomers,
      totalProducts,
      lowStockProducts,
    ] = await Promise.all([
      Order.countDocuments({ isPaid: true }),
      Order.countDocuments({ isPaid: true, createdAt: { $gte: startOfMonth } }),
      Order.countDocuments({ 
        isPaid: true, 
        createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } 
      }),
      Order.aggregate([
        { $match: { isPaid: true } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
      ]).then(r => r[0]?.total || 0),
      Order.aggregate([
        { $match: { isPaid: true, createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
      ]).then(r => r[0]?.total || 0),
      Order.aggregate([
        { $match: { isPaid: true, createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
      ]).then(r => r[0]?.total || 0),
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'customer', createdAt: { $gte: startOfMonth } }),
      Product.countDocuments({ isDeleted: { $ne: true } }),
      Product.countDocuments({ 
        isDeleted: { $ne: true }, 
        $expr: { $lte: ['$countInStock', '$lowStockThreshold'] }
      }),
    ]);

    // Calculate growth percentages
    const orderGrowth = lastMonthOrders > 0 
      ? ((monthOrders - lastMonthOrders) / lastMonthOrders * 100).toFixed(1) 
      : 100;
    const revenueGrowth = lastMonthRevenue > 0 
      ? ((monthRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(1) 
      : 100;

    res.json({
      orders: {
        total: totalOrders,
        thisMonth: monthOrders,
        growth: parseFloat(orderGrowth),
      },
      revenue: {
        total: totalRevenue,
        thisMonth: monthRevenue,
        growth: parseFloat(revenueGrowth),
      },
      customers: {
        total: totalCustomers,
        newThisMonth: newCustomers,
      },
      products: {
        total: totalProducts,
        lowStock: lowStockProducts,
      },
    });
  } catch (err) {
    logger.error('Analytics overview error:', err);
    next(err);
  }
};

/**
 * Get sales chart data
 * @route GET /api/admin/analytics/sales
 */
exports.getSalesData = async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;
    
    let startDate;
    let groupBy;
    
    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        groupBy = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        groupBy = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
        break;
      case '12m':
        startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
        groupBy = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        groupBy = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
    }

    const salesData = await Order.aggregate([
      { 
        $match: { 
          isPaid: true, 
          createdAt: { $gte: startDate } 
        } 
      },
      {
        $group: {
          _id: groupBy,
          revenue: { $sum: '$totalPrice' },
          orders: { $sum: 1 },
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      period,
      data: salesData.map(d => ({
        date: d._id,
        revenue: d.revenue,
        orders: d.orders,
      })),
    });
  } catch (err) {
    logger.error('Sales data error:', err);
    next(err);
  }
};

/**
 * Get top selling products
 * @route GET /api/admin/analytics/top-products
 */
exports.getTopProducts = async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;

    const topProducts = await Order.aggregate([
      { $match: { isPaid: true } },
      { $unwind: '$orderItems' },
      {
        $group: {
          _id: '$orderItems.product',
          totalSold: { $sum: '$orderItems.qty' },
          revenue: { $sum: { $multiply: ['$orderItems.price', '$orderItems.qty'] } },
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          _id: 1,
          name: '$product.name',
          image: { $arrayElemAt: ['$product.images', 0] },
          totalSold: 1,
          revenue: 1,
        }
      }
    ]);

    res.json(topProducts);
  } catch (err) {
    logger.error('Top products error:', err);
    next(err);
  }
};

/**
 * Get orders by status
 * @route GET /api/admin/analytics/order-status
 */
exports.getOrdersByStatus = async (req, res, next) => {
  try {
    const statusData = await Order.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statusMap = statusData.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    res.json({
      pending: statusMap.pending || 0,
      processing: statusMap.processing || 0,
      shipped: statusMap.shipped || 0,
      delivered: statusMap.delivered || 0,
      cancelled: statusMap.cancelled || 0,
    });
  } catch (err) {
    logger.error('Order status error:', err);
    next(err);
  }
};

/**
 * Get customer acquisition data
 * @route GET /api/admin/analytics/customers
 */
exports.getCustomerData = async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const customerData = await User.aggregate([
      { $match: { role: 'customer', createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          newCustomers: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get repeat vs new customer orders
    const ordersByCustomerType = await Order.aggregate([
      { $match: { isPaid: true, createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: '$user',
          orderCount: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: { $cond: [{ $gt: ['$orderCount', 1] }, 'repeat', 'new'] },
          count: { $sum: 1 }
        }
      }
    ]);

    const typeMap = ordersByCustomerType.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    res.json({
      acquisitionData: customerData.map(d => ({
        date: d._id,
        newCustomers: d.newCustomers,
      })),
      customerTypes: {
        new: typeMap.new || 0,
        repeat: typeMap.repeat || 0,
      }
    });
  } catch (err) {
    logger.error('Customer data error:', err);
    next(err);
  }
};

/**
 * Get revenue by category
 * @route GET /api/admin/analytics/revenue-by-category
 */
exports.getRevenueByCategory = async (req, res, next) => {
  try {
    const revenueByCategory = await Order.aggregate([
      { $match: { isPaid: true } },
      { $unwind: '$orderItems' },
      {
        $lookup: {
          from: 'products',
          localField: 'orderItems.product',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $lookup: {
          from: 'categories',
          localField: 'product.category',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$category._id',
          name: { $first: '$category.name' },
          revenue: { $sum: { $multiply: ['$orderItems.price', '$orderItems.qty'] } },
          orders: { $sum: 1 }
        }
      },
      { $sort: { revenue: -1 } }
    ]);

    res.json(revenueByCategory.map(item => ({
      category: item.name || 'Uncategorized',
      revenue: item.revenue,
      orders: item.orders,
    })));
  } catch (err) {
    logger.error('Revenue by category error:', err);
    next(err);
  }
};
