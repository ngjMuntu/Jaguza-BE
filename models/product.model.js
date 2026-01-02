const mongoose = require('mongoose');
const slugify = require('slugify');

const variantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  values: [{ type: String, trim: true }]
}, { _id: false });

const downloadSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  url: { type: String, required: true, trim: true }
}, { _id: false });

const seoSchema = new mongoose.Schema({
  metaTitle: { type: String, trim: true },
  metaDescription: { type: String, trim: true },
  altTags: [{ type: String, trim: true }]
}, { _id: false });

const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, index: true },
  sku: { type: String, unique: true, sparse: true, trim: true },
  description: { type: String },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },

  price: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'USD' },
  discountPercent: { type: Number, min: 0, max: 100 },
  promoPrice: { type: Number, min: 0 },

  countInStock: { type: Number, default: 0, min: 0 },
  lowStockThreshold: { type: Number, default: 5 },
  minQty: { type: Number, default: 1 },
  maxQty: { type: Number },

  images: [{ type: String }],
  videos: [{ type: String }],
  media360: [{ type: String }],
  downloads: [downloadSchema],

  tags: [{ type: String, index: true }],
  variants: [variantSchema],

  enabled: { type: Boolean, default: true, index: true },
  featured: { type: Boolean, default: false, index: true },
  isDeleted: { type: Boolean, default: false, index: true },

  seo: seoSchema,

  reviews: [reviewSchema],
  ratingAvg: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 }
}, { timestamps: true });

// Text index: avoid mixing non-text index parts with array fields (MongoDB rejects arrays in non-text parts).
productSchema.index({ name: 'text', description: 'text', tags: 'text' });

// Storefront query indexes
productSchema.index({ enabled: 1, isDeleted: 1, category: 1, createdAt: -1 });
productSchema.index({ enabled: 1, isDeleted: 1, featured: 1, createdAt: -1 });
productSchema.index({ enabled: 1, isDeleted: 1, price: 1 });

// Auto-generate slug
productSchema.pre('validate', function(next) {
  if (!this.slug && this.name) this.slug = slugify(this.name, { lower: true, strict: true });
  next();
});

module.exports = mongoose.model('Product', productSchema);