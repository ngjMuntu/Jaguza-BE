const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Order = require('../models/order.model');
const transporter = require('../config/email.config');
const Product = require('../models/product.model');
const { calculateShipping, calculateTax, getShippingMethods } = require('../utils/shipping.utils');
const { applyCouponToOrder } = require('./coupon.controller');

function normalizeOrderItems(orderItems) {
  const items = Array.isArray(orderItems) ? orderItems : [];
  return items
    .map((it) => {
      const productId = it.productId || it.product;
      const qty = Number(it.qty ?? it.quantity ?? 0);
      return { productId, qty };
    })
    .filter((it) => it.productId && Number.isFinite(it.qty) && it.qty > 0);
}

// Helper to check if we can use transactions (replica set required)
async function canUseTransactions() {
  try {
    const adminDb = mongoose.connection.db.admin();
    const { ismaster } = await adminDb.command({ ismaster: 1 });
    // Transactions require replica set or sharded cluster
    return !!(ismaster.setName || ismaster.msg === 'isdbgrid');
  } catch {
    return false;
  }
}

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
exports.addOrderItems = asyncHandler(async (req, res) => {
  const {
    orderItems,
    shippingAddress,
    paymentMethod,
    shippingMethod = 'standard',
    couponCode,
  } = req.body;

  const normalized = normalizeOrderItems(orderItems);
  if (normalized.length === 0) {
    res.status(400);
    throw new Error('No order items');
  }

  // Check if transactions are supported
  const useTransaction = await canUseTransactions();
  
  if (useTransaction) {
    // Use MongoDB transaction for atomic operations
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Decrement stock per item within transaction
      for (const it of normalized) {
        const result = await Product.updateOne(
          { _id: it.productId, enabled: true, isDeleted: { $ne: true }, countInStock: { $gte: it.qty } },
          { $inc: { countInStock: -it.qty } },
          { session }
        );
        const modified = result?.modifiedCount ?? result?.nModified ?? 0;
        if (!modified) {
          throw new Error('Insufficient stock for one or more items');
        }
      }

      // Fetch products AFTER decrement to compute snapshots & prices
      const productIds = normalized.map((it) => it.productId);
      const products = await Product.find({ _id: { $in: productIds } })
        .select('name sku price images')
        .session(session)
        .lean();
      const byId = new Map(products.map((p) => [p._id.toString(), p]));

      const computedItems = [];
      let itemsPrice = 0;
      for (const it of normalized) {
        const product = byId.get(String(it.productId));
        if (!product) {
          throw new Error('One or more products are unavailable');
        }
        const unitPrice = Number(product.price) || 0;
        itemsPrice += unitPrice * it.qty;
        computedItems.push({
          product: product._id,
          sku: product.sku,
          name: product.name,
          qty: it.qty,
          image: Array.isArray(product.images) ? product.images[0] : undefined,
          price: unitPrice,
        });
      }

      // Calculate shipping based on country
      const countryCode = shippingAddress?.country || 'UG';
      const shippingCalc = calculateShipping({
        countryCode,
        orderTotal: itemsPrice,
        method: shippingMethod,
        itemCount: computedItems.reduce((sum, it) => sum + it.qty, 0)
      });
      const shippingPrice = shippingCalc.cost;

      // Calculate tax based on country
      const taxCalc = calculateTax({
        countryCode,
        subtotal: itemsPrice
      });
      const taxPrice = taxCalc.amount;

      // Apply coupon if provided
      let discountAmount = 0;
      let appliedCoupon = null;
      if (couponCode) {
        const couponResult = await applyCouponToOrder(couponCode, req.user.id, null, itemsPrice);
        if (couponResult.applied) {
          discountAmount = couponResult.discount;
          appliedCoupon = couponResult.couponId;
        }
      }

      const totalPrice = Number((itemsPrice + shippingPrice + taxPrice - discountAmount).toFixed(2));

      const shipping = {
        address: {
          line1: shippingAddress?.address,
          line2: shippingAddress?.line2,
          city: shippingAddress?.city,
          state: shippingAddress?.state,
          postalCode: shippingAddress?.postalCode,
          country: shippingAddress?.country,
        },
        status: 'pending',
        method: shippingMethod,
        estimatedDays: shippingCalc.estimatedDays,
      };

      const payment = {
        method: paymentMethod || 'card',
        status: 'pending',
        currency: 'usd',
      };

      const order = new Order({
        user: req.user.id,
        orderItems: computedItems,
        shipping,
        payment,
        itemsPrice,
        shippingPrice,
        taxPrice,
        discountAmount,
        coupon: appliedCoupon,
        totalPrice,
      });
      const createdOrder = await order.save({ session });

      await session.commitTransaction();
      session.endSession();

      // Send order confirmation email (non-blocking)
      sendOrderEmail(createdOrder, req.user.email);

      return res.status(201).json(createdOrder);
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      
      if (err.message === 'Insufficient stock for one or more items') {
        res.status(409);
      } else if (err.message === 'One or more products are unavailable') {
        res.status(400);
      }
      throw err;
    }
  } else {
    // Fallback: Compensating transaction approach for standalone MongoDB
    const decremented = [];

    try {
      // Decrement stock per item with atomic conditional update
      for (const it of normalized) {
        const result = await Product.updateOne(
          { _id: it.productId, enabled: true, isDeleted: { $ne: true }, countInStock: { $gte: it.qty } },
          { $inc: { countInStock: -it.qty } },
          undefined
        );
        const modified = result?.modifiedCount ?? result?.nModified ?? 0;
        if (!modified) {
          res.status(409);
          throw new Error('Insufficient stock for one or more items');
        }
        decremented.push({ productId: it.productId, qty: it.qty });
      }

      // Fetch products AFTER decrement to compute snapshots & prices
      const productIds = normalized.map((it) => it.productId);
      const products = await Product.find({ _id: { $in: productIds } })
        .select('name sku price images')
        .lean();
      const byId = new Map(products.map((p) => [p._id.toString(), p]));

      const computedItems = [];
      let itemsPrice = 0;
      for (const it of normalized) {
        const product = byId.get(String(it.productId));
        if (!product) {
          res.status(400);
          throw new Error('One or more products are unavailable');
        }
        const unitPrice = Number(product.price) || 0;
        itemsPrice += unitPrice * it.qty;
        computedItems.push({
          product: product._id,
          sku: product.sku,
          name: product.name,
          qty: it.qty,
          image: Array.isArray(product.images) ? product.images[0] : undefined,
          price: unitPrice,
        });
      }

      // Calculate shipping based on country
      const countryCode = shippingAddress?.country || 'UG';
      const shippingCalc = calculateShipping({
        countryCode,
        orderTotal: itemsPrice,
        method: shippingMethod,
        itemCount: computedItems.reduce((sum, it) => sum + it.qty, 0)
      });
      const shippingPrice = shippingCalc.cost;

      // Calculate tax based on country
      const taxCalc = calculateTax({
        countryCode,
        subtotal: itemsPrice
      });
      const taxPrice = taxCalc.amount;

      // Apply coupon if provided
      let discountAmount = 0;
      let appliedCoupon = null;
      if (couponCode) {
        const couponResult = await applyCouponToOrder(couponCode, req.user.id, null, itemsPrice);
        if (couponResult.applied) {
          discountAmount = couponResult.discount;
          appliedCoupon = couponResult.couponId;
        }
      }

      const totalPrice = Number((itemsPrice + shippingPrice + taxPrice - discountAmount).toFixed(2));

      const shipping = {
        address: {
          line1: shippingAddress?.address,
          line2: shippingAddress?.line2,
          city: shippingAddress?.city,
          state: shippingAddress?.state,
          postalCode: shippingAddress?.postalCode,
          country: shippingAddress?.country,
        },
        status: 'pending',
        method: shippingMethod,
        estimatedDays: shippingCalc.estimatedDays,
      };

      const payment = {
        method: paymentMethod || 'card',
        status: 'pending',
        currency: 'usd',
      };

      const order = new Order({
        user: req.user.id,
        orderItems: computedItems,
        shipping,
        payment,
        itemsPrice,
        shippingPrice,
        taxPrice,
        discountAmount,
        coupon: appliedCoupon,
        totalPrice,
      });
      const createdOrder = await order.save();

      // Send order confirmation email (non-blocking)
      sendOrderEmail(createdOrder, req.user.email);

      res.status(201).json(createdOrder);
    } catch (err) {
      if (decremented.length > 0) {
        // Compensating rollback
        await Promise.all(
          decremented.map((d) => Product.updateOne({ _id: d.productId }, { $inc: { countInStock: d.qty } }))
        );
      }
      throw err;
    }
  }
});

// Helper to send order email (non-blocking)
function sendOrderEmail(order, email) {
  try {
    transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: `Order #${order._id}`,
      html: `<p>Thank you! Your order has been created and is awaiting payment confirmation.</p>`,
    }).catch((e) => {
      if (process.env.NODE_ENV !== 'test') {
        console.error('Order email failed:', e.message);
      }
    });
  } catch (e) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('Order email failed:', e.message);
    }
  }
}

// @desc    Get logged-in user's orders
// @route   GET /api/orders
// @access  Private
exports.getMyOrders = asyncHandler(async (req, res) => {
  const MAX_LIMIT = 100;
  let { page = 1, limit = 50 } = req.query;
  page = Math.max(1, Number.parseInt(page, 10) || 1);
  limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(limit, 10) || 50));

  const orders = await Order.find({ user: req.user.id })
    .sort('-createdAt')
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  res.json(orders);
});

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
exports.getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email');
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  // ensure user owns this order
  if (order.user._id.toString() !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to view this order');
  }
  res.json(order);
});

// @desc    Payment status is updated via Stripe webhook (server-side verification)
// @route   PUT /api/orders/:id/pay (removed)
// @access  Private