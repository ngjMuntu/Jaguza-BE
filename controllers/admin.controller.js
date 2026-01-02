const asyncHandler = require('express-async-handler');
const User = require('../models/user.model');
const Product = require('../models/product.model');
const Category = require('../models/category.model');
const Order = require('../models/order.model');
const { safeSearchRegex } = require('../utils/regex.utils');

function normalizeCsvishStringArray(value) {
  if (!Array.isArray(value)) return undefined;
  const arr = value
    .map((s) => String(s).trim())
    .filter(Boolean);
  return arr.length ? arr : [];
}

function buildCategoryTree(categories) {
  const nodesById = new Map();
  categories.forEach((c) => {
    nodesById.set(String(c._id), { ...c, children: [] });
  });
  const roots = [];
  nodesById.forEach((node) => {
    const parentId = node.parent ? String(node.parent) : null;
    if (parentId && nodesById.has(parentId)) {
      nodesById.get(parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortChildren = (list) => {
    list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name)));
    list.forEach((n) => n.children?.length && sortChildren(n.children));
  };
  sortChildren(roots);
  return roots;
}

// Helper to paginate
function buildPagination(req) {
  const MAX_LIMIT = 100;
  let { page = 1, limit = 20 } = req.query;
  page = Math.max(1, Number.parseInt(page, 10) || 1);
  limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

// USERS
exports.listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req);
  const q = {};
  if (req.query.search) {
    const rx = safeSearchRegex(req.query.search);
    q.$or = [
      ...(rx ? [
        { name: rx },
        { email: rx },
        { phone: rx }
      ] : [])
    ];
  }
  if (req.query.role) q.role = req.query.role;
  if (req.query.isActive !== undefined) q.isActive = !!req.query.isActive;
  const total = await User.countDocuments(q);
  const users = await User.find(q).sort('-createdAt').skip(skip).limit(limit).lean();
  res.json({ page, pages: Math.ceil(total/limit), total, users: users.map(u => ({
    id: u._id,
    clientId: u.clientId,
    name: u.name,
    email: u.email,
    role: u.role,
    sex: u.sex,
    city: u.city,
    country: u.country,
    isActive: u.isActive,
    isVerified: u.isVerified,
    createdAt: u.createdAt
  })) });
});

exports.getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).lean();
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({
    id: user._id,
    clientId: user.clientId,
    name: user.name,
    email: user.email,
    role: user.role,
    sex: user.sex,
    phone: user.phone,
    city: user.city,
    country: user.country,
    isVerified: user.isVerified,
    loyaltyPoints: user.loyaltyPoints,
    totalSpent: user.totalSpent,
    createdAt: user.createdAt
  });
});

exports.updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (req.body.name) user.name = req.body.name;
  if (req.body.role) user.role = req.body.role;
  await user.save();
  res.json({ message: 'User updated', user: user.toJSON() });
});

exports.activateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  user.isActive = true;
  await user.save();
  res.json({ message: 'User activated', user: user.toJSON() });
});

exports.deactivateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  user.isActive = false;
  await user.save();
  res.json({ message: 'User deactivated', user: user.toJSON() });
});

exports.deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ message: 'User deleted' });
});

// PRODUCTS
exports.listProducts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req);
  const q = {};
  if (req.query.search) {
    const rx = safeSearchRegex(req.query.search);
    if (rx) q.name = rx;
  }
  if (req.query.category) q.category = req.query.category;
  if (req.query.enabled !== undefined) q.enabled = !!req.query.enabled;
  if (req.query.featured !== undefined) q.featured = !!req.query.featured;
  // Admin should see deleted products as well; keep default behavior (no isDeleted filter)
  const total = await Product.countDocuments(q);
  const products = await Product.find(q).populate('category','name slug').sort('-createdAt').skip(skip).limit(limit).lean();
  res.json({ page, pages: Math.ceil(total/limit), total, products });
});

exports.createProduct = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    category,
    price,
    countInStock,
    sku,
    tags,
    enabled,
    featured,
    discountPercent,
    promoPrice,
    minQty,
    maxQty,
    lowStockThreshold,
  } = req.body;

  const product = await Product.create({
    name,
    description,
    category,
    price,
    countInStock,
    sku,
    tags: normalizeCsvishStringArray(tags),
    enabled: enabled !== undefined ? !!enabled : undefined,
    featured: featured !== undefined ? !!featured : undefined,
    discountPercent,
    promoPrice,
    minQty,
    maxQty,
    lowStockThreshold,
    images: [],
  });
  res.status(201).json(product);
});

exports.getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).populate('category','name slug');
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
});

exports.updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  ['name','description','category','price','countInStock','sku','discountPercent','promoPrice','minQty','maxQty','lowStockThreshold','enabled','featured'].forEach(f => {
    if (req.body[f] !== undefined) product[f] = req.body[f];
  });
  if (req.body.tags !== undefined) product.tags = normalizeCsvishStringArray(req.body.tags);
  await product.save();
  res.json({ message:'Product updated', product });
});

exports.setProductVisibility = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  product.enabled = !!req.body.enabled;
  await product.save();
  res.json({ message: 'Product visibility updated', product });
});

exports.setProductFeatured = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  product.featured = !!req.body.featured;
  await product.save();
  res.json({ message: 'Product featured updated', product });
});

exports.deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json({ message: 'Product deleted' });
});

// CATEGORIES
exports.listCategories = asyncHandler(async (_req, res) => {
  const categories = await Category.find().sort('name').lean();
  res.json(categories);
});

exports.listCategoryTree = asyncHandler(async (_req, res) => {
  const categories = await Category.find().lean();
  res.json(buildCategoryTree(categories));
});

exports.createCategory = asyncHandler(async (req, res) => {
  const cat = await Category.create({
    name: req.body.name,
    description: req.body.description,
    parent: req.body.parent || undefined,
    isEnabled: req.body.isEnabled,
    isFeatured: req.body.isFeatured,
    menuVisible: req.body.menuVisible,
    sortOrder: req.body.sortOrder,
    image: req.body.image,
  });
  res.status(201).json(cat);
});

exports.updateCategory = asyncHandler(async (req, res) => {
  const cat = await Category.findById(req.params.id);
  if (!cat) return res.status(404).json({ message: 'Category not found' });
  if (req.body.name) cat.name = req.body.name;
  if (req.body.description !== undefined) cat.description = req.body.description;
  if (req.body.parent !== undefined) cat.parent = req.body.parent ? req.body.parent : undefined;
  if (req.body.isEnabled !== undefined) cat.isEnabled = !!req.body.isEnabled;
  if (req.body.isFeatured !== undefined) cat.isFeatured = !!req.body.isFeatured;
  if (req.body.menuVisible !== undefined) cat.menuVisible = !!req.body.menuVisible;
  if (req.body.sortOrder !== undefined) cat.sortOrder = req.body.sortOrder;
  if (req.body.image !== undefined) cat.image = req.body.image;
  await cat.save();
  res.json({ message: 'Category updated', category: cat });
});

exports.setCategoryVisibility = asyncHandler(async (req, res) => {
  const cat = await Category.findById(req.params.id);
  if (!cat) return res.status(404).json({ message: 'Category not found' });
  cat.isEnabled = !!req.body.isEnabled;
  await cat.save();
  res.json({ message: 'Category visibility updated', category: cat });
});

exports.setCategoryFeatured = asyncHandler(async (req, res) => {
  const cat = await Category.findById(req.params.id);
  if (!cat) return res.status(404).json({ message: 'Category not found' });
  cat.isFeatured = !!req.body.isFeatured;
  await cat.save();
  res.json({ message: 'Category featured updated', category: cat });
});

exports.deleteCategory = asyncHandler(async (req, res) => {
  const cat = await Category.findByIdAndDelete(req.params.id);
  if (!cat) return res.status(404).json({ message: 'Category not found' });
  res.json({ message: 'Category deleted' });
});

// ORDERS
exports.listOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = buildPagination(req);
  const q = {};
  if (req.query.user) q.user = req.query.user;
  if (req.query.status) q.status = req.query.status;
  if (req.query.paymentStatus) q['payment.status'] = req.query.paymentStatus;
  if (req.query.from || req.query.to) {
    q.createdAt = {};
    if (req.query.from) q.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) q.createdAt.$lte = new Date(req.query.to);
  }
  const total = await Order.countDocuments(q);
  const orders = await Order.find(q).populate('user','name email').sort('-createdAt').skip(skip).limit(limit).lean();
  res.json({ page, pages: Math.ceil(total/limit), total, orders });
});

exports.getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('user','name email');
  if (!order) return res.status(404).json({ message: 'Order not found' });
  res.json(order);
});

exports.markDelivered = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  order.isDelivered = true; order.deliveredAt = new Date();
  await order.save();
  res.json({ message: 'Order marked delivered', order });
});

exports.updateOrderStatus = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });

  order.status = req.body.status;
  if (req.body.shippingStatus !== undefined) {
    order.shipping = order.shipping || {};
    order.shipping.status = req.body.shippingStatus;
  }
  if (req.body.trackingNumber !== undefined) {
    order.shipping = order.shipping || {};
    order.shipping.trackingNumber = req.body.trackingNumber;
  }
  if (req.body.courier !== undefined) {
    order.shipping = order.shipping || {};
    order.shipping.courier = req.body.courier;
  }
  if (req.body.status === 'delivered') {
    order.isDelivered = true;
    order.deliveredAt = order.deliveredAt || new Date();
  }

  await order.save();
  res.json({ message: 'Order updated', order });
});

// ANALYTICS
exports.summary = asyncHandler(async (_req, res) => {
  const [users, products, orders, salesAgg] = await Promise.all([
    User.countDocuments(),
    Product.countDocuments(),
    Order.countDocuments(),
    Order.aggregate([
      { $group: { _id: null, total: { $sum: '$totalPrice' } } }
    ])
  ]);
  res.json({ users, products, orders, sales: salesAgg[0]?.total || 0 });
});

exports.salesOverTime = asyncHandler(async (req, res) => {
  const rangeDays = Math.min(366, Math.max(1, Number.parseInt(req.query.days, 10) || 30));
  const from = new Date(Date.now() - rangeDays*24*60*60*1000);
  const data = await Order.aggregate([
    { $match: { createdAt: { $gte: from } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, sales: { $sum: '$totalPrice' }, orders: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  res.json(data);
});

exports.topProducts = asyncHandler(async (req, res) => {
  const limit = Math.min(20, Math.max(1, Number.parseInt(req.query.limit, 10) || 5));
  const data = await Order.aggregate([
    { $unwind: '$orderItems' },
    { $group: { _id: '$orderItems.product', quantity: { $sum: '$orderItems.qty' }, revenue: { $sum: { $multiply: ['$orderItems.qty', '$orderItems.price'] } } } },
    { $sort: { quantity: -1 } },
    { $limit: limit },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $project: { _id: 0, productId: '$product._id', name: '$product.name', quantity: 1, revenue: 1 } }
  ]);
  res.json(data);
});

exports.userGrowth = asyncHandler(async (req, res) => {
  const days = Math.min(366, Math.max(1, Number.parseInt(req.query.days, 10) || 30));
  const from = new Date(Date.now() - days*24*60*60*1000);
  const data = await User.aggregate([
    { $match: { createdAt: { $gte: from } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum:1 } } },
    { $sort: { _id: 1 } }
  ]);
  res.json(data);
});
