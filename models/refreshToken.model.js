const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // JWT id (jti) for lookup; store only identifiers, not raw tokens.
  jti: { type: String, required: true, trim: true, unique: true, index: true },
  familyId: { type: String, required: true, trim: true, index: true },

  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },

  lastUsedAt: { type: Date },
  replacedByJti: { type: String, trim: true },

  revokedAt: { type: Date },
  revokedReason: { type: String, trim: true },

  createdByIp: { type: String, trim: true },
  createdByUa: { type: String, trim: true },
  revokedByIp: { type: String, trim: true },
}, {
  timestamps: false,
});

// Cleanup expired refresh tokens automatically.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
