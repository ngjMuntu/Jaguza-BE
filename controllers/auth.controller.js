const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/user.model');
const RefreshToken = require('../models/refreshToken.model');
const transporter = require('../config/email.config');
const { env } = require('../config/env');

const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge: 15 * 60 * 1000, // 15 minutes
};
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  // Must be available to both /refresh and /logout.
  path: '/api/auth',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

// Helper: Generate JWT
const generateAccessToken = (id, role) => {
  return jwt.sign({ id, role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN || '15m',
    algorithm: 'HS256'
  });
};

function generateRefreshToken(user) {
  const jti = crypto.randomBytes(16).toString('hex');
  const familyId = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign({ id: user._id.toString(), jti, fid: familyId }, env.REFRESH_TOKEN_SECRET, {
    expiresIn: env.REFRESH_TOKEN_EXPIRES_IN || '30d',
    algorithm: 'HS256'
  });
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return { token, jti, familyId, expiresAt };
}

function ipFromReq(req) {
  return (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.ip;
}

async function issueSessionCookies(res, user, accessToken, refreshToken) {
  res.cookie('token', accessToken, ACCESS_COOKIE_OPTIONS);
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
}

async function revokeRefreshFamily({ userId, familyId, reason, revokedByIp }) {
  await RefreshToken.updateMany(
    { user: userId, familyId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokedReason: reason || 'revoked', revokedByIp } }
  );
}

function passwordStrong(pw) {
  // At least 8 chars, uppercase, lowercase, number
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(pw);
}

// @desc    Register user & send verify email
// @route   POST /api/auth/register
// @access  Public
exports.register = asyncHandler(async (req, res) => {
  const { name, sex, email, password, phone, city, country } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email and password are required' });
  }
  if (!passwordStrong(password)) {
    return res.status(400).json({ message: 'Password must be at least 8 characters and include upper, lower and number' });
  }

  const exists = await User.findOne({ email });
  if (exists) {
    return res.status(400).json({ message: 'User already exists' });
  }

  const user = new User({ name, sex, email, password, phone, city, country });
  const verifyToken = user.getVerifyToken();

  try {
    await user.save();

    const verifyURL = `${env.CLIENT_ORIGIN}/verify-email/${verifyToken}`;
    await transporter.sendMail({
      from: env.EMAIL_FROM,
      to: user.email,
      subject: 'Jaguza Email Verification',
      html: `<p>Hi ${user.name}, verify your email by clicking <a href="${verifyURL}">here</a>.</p>`,
    });

    res.status(201).json({ message: 'Registration successful. Check your email to verify.', clientId: user.clientId });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// @desc    Verify email
// @route   GET /api/auth/verify-email/:token
// @access  Public
exports.verifyEmail = asyncHandler(async (req, res) => {
  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    verifyToken: hashedToken,
    verifyTokenExpires: { $gt: Date.now() },
  });

  if (!user) {
    return res.status(400).json({ message: 'Invalid or expired verification token' });
  }

  if (user.isActive === false) {
    return res.status(403).json({ message: 'Account is disabled' });
  }

  user.isVerified = true;
  user.verifyToken = undefined;
  user.verifyTokenExpires = undefined;
  await user.save();

  const access = generateAccessToken(user._id, user.role);
  const { token: refresh, jti, familyId, expiresAt } = generateRefreshToken(user);
  await RefreshToken.create({
    user: user._id,
    jti,
    familyId,
    expiresAt,
    createdByIp: ipFromReq(req),
    createdByUa: req.get('user-agent') || undefined,
  });
  await issueSessionCookies(res, user, access, refresh);

  res.json({
    message: 'Email verified successfully',
    user: { id: user._id, name: user.name, email: user.email },
  });
});

// @desc    Login user & get token
// @route   POST /api/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password +failedLoginAttempts +lockUntil');
  
  // Check if account is locked
  if (user && user.lockUntil && user.lockUntil > Date.now()) {
    const remainingMs = user.lockUntil - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    return res.status(423).json({ 
      message: `Account temporarily locked. Try again in ${remainingMin} minute${remainingMin > 1 ? 's' : ''}.`,
      lockedUntil: user.lockUntil
    });
  }

  if (!user || !(await user.matchPassword(password))) {
    // Increment failed attempts if user exists
    if (user) {
      await user.incLoginAttempts();
      
      // Check if this attempt caused a lock
      const updatedUser = await User.findById(user._id).select('failedLoginAttempts lockUntil');
      if (updatedUser.lockUntil && updatedUser.lockUntil > Date.now()) {
        return res.status(423).json({ 
          message: 'Too many failed attempts. Account locked for 15 minutes.',
          lockedUntil: updatedUser.lockUntil
        });
      }
      
      const remaining = User.MAX_LOGIN_ATTEMPTS - updatedUser.failedLoginAttempts;
      if (remaining <= 2 && remaining > 0) {
        return res.status(401).json({ 
          message: `Invalid credentials. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining before lockout.`
        });
      }
    }
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  if (user.isActive === false) {
    return res.status(403).json({ message: 'Account is disabled' });
  }

  if (!user.isVerified) {
    return res.status(403).json({ message: 'Please verify your email before logging in' });
  }

  // Reset failed login attempts on successful login
  await user.resetLoginAttempts();

  const access = generateAccessToken(user._id, user.role);
  const { token: refresh, jti, familyId, expiresAt } = generateRefreshToken(user);
  await RefreshToken.create({
    user: user._id,
    jti,
    familyId,
    expiresAt,
    createdByIp: ipFromReq(req),
    createdByUa: req.get('user-agent') || undefined,
  });
  await issueSessionCookies(res, user, access, refresh);

  res.json({
    message: 'Login successful',
    user: { id: user._id, name: user.name, email: user.email },
  });
});

// @desc    Forgot password – send reset email
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    return res.status(404).json({ message: 'No user with that email' });
  }

  const resetToken = user.getResetPasswordToken();
  await user.save({ validateBeforeSave: false });

  const resetURL = `${env.CLIENT_ORIGIN}/reset-password/${resetToken}`;
  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: user.email,
    subject: 'Jaguza Password Reset',
    html: `<p>Click <a href="${resetURL}">here</a> to reset your password.</p>`,
  });

  res.json({ message: 'Password reset email sent' });
});

// @desc    Reset password
// @route   PUT /api/auth/reset-password/:token
// @access  Public
exports.resetPassword = asyncHandler(async (req, res) => {
  const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    resetPasswordToken: hashed,
    resetPasswordExpires: { $gt: Date.now() },
  });

  if (!user) {
    return res.status(400).json({ message: 'Invalid or expired reset token' });
  }

  const { password } = req.body;
  if (!passwordStrong(password)) {
    return res.status(400).json({ message: 'Password must be at least 8 characters and include upper, lower and number' });
  }

  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  // Invalidate all refresh sessions on password reset for safety.
  await RefreshToken.updateMany(
    { user: user._id, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokedReason: 'password_reset', revokedByIp: ipFromReq(req) } }
  );
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.json({ message: 'Password has been reset' });
});

// @desc    Update user profile (name or password)
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (req.body.name) user.name = req.body.name;
  if (req.body.password) {
    if (!passwordStrong(req.body.password)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters and include upper, lower and number' });
    }
    user.password = req.body.password;
  }
  await user.save();

  // If password changed, revoke all refresh sessions to force re-login elsewhere.
  if (req.body.password) {
    await RefreshToken.updateMany(
      { user: user._id, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date(), revokedReason: 'password_change', revokedByIp: ipFromReq(req) } }
    );
    res.clearCookie('refreshToken', { path: '/api/auth' });
  }

  res.json({
    message: 'Profile updated successfully',
    user: { id: user._id, name: user.name, email: user.email },
  });
});

// @desc    Logout user (clear auth cookie)
// @route   POST /api/auth/logout
// @access  Public
exports.logout = asyncHandler(async (req, res) => {
  // Clear cookies and revoke the presented refresh token (if any).
  const rt = req.cookies.refreshToken;
  res.clearCookie('token', { path: '/' });
  res.clearCookie('refreshToken', { path: '/api/auth' });

  if (rt) {
    try {
      const payload = jwt.verify(rt, env.REFRESH_TOKEN_SECRET, { algorithms: ['HS256'] });
      await RefreshToken.updateOne(
        { user: payload.id, jti: payload.jti, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date(), revokedReason: 'logout', revokedByIp: ipFromReq(req) } }
      );
    } catch {
      // Ignore invalid/expired tokens; cookies are already cleared.
    }
  }
  res.json({ message: 'Logged out' });
});

// @desc    Refresh access token
// @route   POST /api/auth/refresh
// @access  Public (uses HttpOnly cookie)
exports.refresh = asyncHandler(async (req, res) => {
  const rt = req.cookies.refreshToken;
  if (!rt) return res.status(401).json({ message: 'No refresh token' });
  try {
    const payload = jwt.verify(rt, env.REFRESH_TOKEN_SECRET, { algorithms: ['HS256'] });
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ message: 'Refresh token invalid' });

     if (user.isActive === false) {
      await RefreshToken.updateMany(
        { user: user._id, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date(), revokedReason: 'user_disabled', revokedByIp: ipFromReq(req) } }
      );
      res.clearCookie('token', { path: '/' });
      res.clearCookie('refreshToken', { path: '/api/auth' });
      return res.status(403).json({ message: 'Account is disabled' });
    }

    const tokenRecord = await RefreshToken.findOne({ user: user._id, jti: payload.jti });
    if (!tokenRecord) {
      return res.status(401).json({ message: 'Refresh token invalid' });
    }

    // Reuse detection: if a revoked token is presented again, revoke the whole family.
    if (tokenRecord.revokedAt) {
      await revokeRefreshFamily({
        userId: user._id,
        familyId: tokenRecord.familyId,
        reason: 'reuse_detected',
        revokedByIp: ipFromReq(req),
      });
      res.clearCookie('token', { path: '/' });
      res.clearCookie('refreshToken', { path: '/api/auth' });
      return res.status(401).json({ message: 'Refresh token invalid' });
    }

    // Rotate refresh token
    const newAccess = generateAccessToken(user._id, user.role);
    const newJti = crypto.randomBytes(16).toString('hex');
    const familyId = tokenRecord.familyId || payload.fid;
    const newRefresh = jwt.sign({ id: user._id.toString(), jti: newJti, fid: familyId }, env.REFRESH_TOKEN_SECRET, {
      expiresIn: env.REFRESH_TOKEN_EXPIRES_IN || '30d',
      algorithm: 'HS256'
    });
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    tokenRecord.revokedAt = new Date();
    tokenRecord.revokedReason = 'rotated';
    tokenRecord.revokedByIp = ipFromReq(req);
    tokenRecord.lastUsedAt = new Date();
    tokenRecord.replacedByJti = newJti;
    await tokenRecord.save();

    await RefreshToken.create({
      user: user._id,
      jti: newJti,
      familyId,
      expiresAt,
      createdByIp: ipFromReq(req),
      createdByUa: req.get('user-agent') || undefined,
    });

    await issueSessionCookies(res, user, newAccess, newRefresh);
    res.json({ message: 'Refreshed' });
  } catch (e) {
    return res.status(401).json({ message: 'Refresh token expired or invalid' });
  }
});
