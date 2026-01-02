// Create admin user script
const mongoose = require('mongoose');
require('dotenv').config();

async function createAdmin() {
  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || 'jaguza' });
  console.log('Connected to database:', process.env.MONGODB_DB || 'jaguza');
  
  const User = require('../models/user.model');
  
  // Check if admin already exists
  const existing = await User.findOne({ email: 'admin@jaguza.com' });
  if (existing) {
    console.log('\nAdmin user already exists!');
    console.log('Email:', existing.email);
    console.log('Current role:', existing.role);
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      await existing.save();
      console.log('Updated role to admin');
    }
    console.log('\nUse these credentials to login:');
    console.log('Email:    admin@jaguza.com');
    console.log('Password: (your existing password)');
  } else {
    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@jaguza.com',
      password: 'Admin@2026!',
      role: 'admin',
      isVerified: true,
      isActive: true
    });
    console.log('\n=============================');
    console.log('   ADMIN USER CREATED!');
    console.log('=============================');
    console.log('Email:    admin@jaguza.com');
    console.log('Password: Admin@2026!');
    console.log('=============================');
    console.log('\nYou can now login to the admin dashboard at:');
    console.log('http://localhost:5174');
  }
  
  await mongoose.disconnect();
  console.log('\nDone!');
}

createAdmin().catch(e => { 
  console.error('Error:', e.message); 
  process.exit(1); 
});
