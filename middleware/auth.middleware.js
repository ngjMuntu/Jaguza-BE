const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/user.model');
const { env } = require('../config/env');

exports.protect = asyncHandler(async (req, res, next) => {
  // Prefer HttpOnly cookie
  let token = req.cookies.token || req.cookies.accessToken;
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    res.status(401);
    throw new Error('Not authorized');
  }
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256']
    });
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      res.status(401);
      throw new Error('User not found');
    }
    if (user.isActive === false) {
      res.status(403);
      throw new Error('User is disabled');
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(401);
    throw new Error('Token invalid or expired');
  }
});