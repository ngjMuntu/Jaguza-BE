// Simple dev seeder to populate a few categories and products
const { connect } = require('../config/db');
const Category = require('../models/category.model');
const Product = require('../models/product.model');
const User = require('../models/user.model');

// NOTE: Do not run in production. Controlled by env.
async function run() {
  await connect();

  const existingCats = await Category.countDocuments();
  if (existingCats === 0) {
    const cats = await Category.insertMany([
      { name: 'Electronics' },
      { name: 'Beauty & Personal Care' },
      { name: 'Kitchenware' },
      { name: 'Fashion & Clothing' },
      { name: 'Sports & Outdoors' },
      { name: 'Furniture' },
    ]);
    console.log(`[seed] inserted ${cats.length} categories`);

    // create a few products
    const pick = (i) => cats[i % cats.length]._id;
    const prods = await Product.insertMany([
      {
        name: 'Wireless Headphones',
        description: 'Comfortable over-ear wireless headphones with noise cancellation.',
        category: pick(0),
        images: ['https://picsum.photos/seed/prod1/600/400'],
        price: 79.99,
        countInStock: 20,
      },
      {
        name: 'Vitamin C Serum',
        description: 'Brightening facial serum with stabilized vitamin C.',
        category: pick(1),
        images: ['https://picsum.photos/seed/prod2/600/400'],
        price: 24.50,
        countInStock: 50,
      },
      {
        name: 'Non-stick Frying Pan',
        description: 'Durable non-stick pan suitable for all cooktops.',
        category: pick(2),
        images: ['https://picsum.photos/seed/prod3/600/400'],
        price: 32.00,
        countInStock: 35,
      },
      {
        name: 'Athletic Running Shoes',
        description: 'Lightweight running shoes with breathable mesh upper.',
        category: pick(4),
        images: ['https://picsum.photos/seed/prod4/600/400'],
        price: 59.99,
        countInStock: 40,
      },
    ]);
    console.log(`[seed] inserted ${prods.length} products`);
  } else {
    console.log('[seed] categories already exist; skipping');
  }

  const existingUsers = await User.countDocuments();
  if (existingUsers === 0) {
    await User.create({
      name: 'Demo User',
      email: 'demo@example.com',
      password: 'Password123', // meets policy: upper/lower/number
      isVerified: true,
    });
    console.log('[seed] inserted demo user: demo@example.com / Password123');
  } else {
    console.log('[seed] users already exist; skipping');
  }

  process.exit(0);
}

run().catch((e) => {
  console.error('[seed] failed:', e);
  process.exit(1);
});
