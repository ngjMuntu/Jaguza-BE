#!/usr/bin/env node
/*
 Backfills slugs and standard flags on Category/Product collections.
 Idempotent: safe to run multiple times.
*/
const mongoose = require('mongoose');
const slugify = require('slugify');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const Category = require('../../models/category.model');
const Product = require('../../models/product.model');

async function run() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'jaguza';
  if (!uri) {
    console.error('Missing MONGODB_URI');
    process.exit(1);
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { dbName });

  let catUpdated = 0;
  const cats = await Category.find({}).lean();
  for (const c of cats) {
    const updates = {};
    if (!c.slug && c.name) updates.slug = slugify(c.name, { lower: true, strict: true });
    if (typeof c.isEnabled === 'undefined') updates.isEnabled = true;
    if (typeof c.isFeatured === 'undefined') updates.isFeatured = false;
    if (typeof c.menuVisible === 'undefined') updates.menuVisible = true;
    if (typeof c.sortOrder === 'undefined') updates.sortOrder = 0;
    if (Object.keys(updates).length) {
      await Category.updateOne({ _id: c._id }, { $set: updates });
      catUpdated++;
    }
  }

  let prodUpdated = 0;
  const prods = await Product.find({}).lean();
  for (const p of prods) {
    const updates = {};
    if (!p.slug && p.name) updates.slug = slugify(p.name, { lower: true, strict: true });
    if (typeof p.enabled === 'undefined') updates.enabled = true;
    if (typeof p.featured === 'undefined') updates.featured = false;
    if (typeof p.isDeleted === 'undefined') updates.isDeleted = false;
    if (typeof p.lowStockThreshold === 'undefined') updates.lowStockThreshold = 5;
    if (typeof p.minQty === 'undefined') updates.minQty = 1;
    if (Object.keys(updates).length) {
      await Product.updateOne({ _id: p._id }, { $set: updates });
      prodUpdated++;
    }
  }

  console.log(`Categories updated: ${catUpdated}`);
  console.log(`Products updated: ${prodUpdated}`);
  await mongoose.connection.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
