const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const addressSchema = new mongoose.Schema({
  line1: { type: String, trim: true },
  line2: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  postalCode: { type: String, trim: true },
  country: { type: String, trim: true }
}, { _id: false });

const userSchema = new mongoose.Schema({
  clientId: { type: String, unique: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  sex: { type: String, enum: ['male','female','other'], default: 'other' },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  password: { type: String, required: true, minlength: 8, select: true },
  role: { type: String, enum: ['user', 'vip', 'wholesale', 'staff', 'admin'], default: 'user' },
  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  phone: { type: String, trim: true },
  city: { type: String, trim: true },
  country: { type: String, trim: true },
  address: addressSchema,
  loyaltyPoints: { type: Number, default: 0 },
  subscribedToNewsletter: { type: Boolean, default: false },
  totalSpent: { type: Number, default: 0 },

  // Account lockout fields
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },

  verifyToken: String,
  verifyTokenExpires: Date,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  // Single active refresh token identifier for rotation
  refreshTokenId: { type: String, default: null },
  refreshTokenExpires: { type: Date, default: null },
}, {
  timestamps: true,
  toJSON: {
    transform: function (_doc, ret) {
      delete ret.password;
      delete ret.verifyToken;
      delete ret.verifyTokenExpires;
      delete ret.resetPasswordToken;
      delete ret.resetPasswordExpires;
      delete ret.refreshTokenId;
      delete ret.refreshTokenExpires;
      delete ret.failedLoginAttempts;
      delete ret.lockUntil;
      return ret;
    }
  }
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Generate clientId if missing
userSchema.pre('save', function(next) {
  if (!this.clientId) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let rand = '';
    for (let i = 0; i < 12; i++) rand += chars[Math.floor(Math.random() * chars.length)];
    this.clientId = `CLT-${rand}`;
  }
  next();
});

// Compare password
userSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

// Account lockout constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes

// Check if account is currently locked
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Increment failed login attempts and lock if necessary
userSchema.methods.incLoginAttempts = async function() {
  // If we have a previous lock that has expired, reset attempts
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { failedLoginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }
  
  const updates = { $inc: { failedLoginAttempts: 1 } };
  
  // Lock account if max attempts reached
  if (this.failedLoginAttempts + 1 >= MAX_LOGIN_ATTEMPTS && !this.isLocked) {
    updates.$set = { lockUntil: new Date(Date.now() + LOCK_TIME_MS) };
  }
  
  return this.updateOne(updates);
};

// Reset login attempts on successful login
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $set: { failedLoginAttempts: 0 },
    $unset: { lockUntil: 1 }
  });
};

// Generate email verification token
userSchema.methods.getVerifyToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.verifyToken = crypto.createHash('sha256').update(token).digest('hex');
  this.verifyTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24h
  return token;
};

// Generate reset password token
userSchema.methods.getResetPasswordToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
  this.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1h
  return token;
};

// Export constants for use in controllers
userSchema.statics.MAX_LOGIN_ATTEMPTS = MAX_LOGIN_ATTEMPTS;
userSchema.statics.LOCK_TIME_MS = LOCK_TIME_MS;

module.exports = mongoose.model('User', userSchema);