const mongoose = require('mongoose');
const slugify = require('slugify');

const seoSchema = new mongoose.Schema({
  metaTitle: { type: String, trim: true },
  metaDescription: { type: String, trim: true }
}, { _id: false });

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  slug: { type: String, required: true, unique: true, index: true },
  description: { type: String, trim: true },
  image: { type: String, trim: true },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', index: true },
  isEnabled: { type: Boolean, default: true, index: true },
  isFeatured: { type: Boolean, default: false, index: true },
  menuVisible: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  seo: seoSchema
}, {
  timestamps: true,
});

categorySchema.index({ isEnabled: 1, sortOrder: 1, name: 1 });

// Auto-generate slug from name
categorySchema.pre('validate', function(next) {
  if (!this.slug && this.name) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

module.exports = mongoose.model('Category', categorySchema);