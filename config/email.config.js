const nodemailer = require('nodemailer');
const { env } = require('../config/env');

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST || env.EMAIL_HOST,
  port: Number(env.SMTP_PORT || env.EMAIL_PORT || 587),
  secure: false, // STARTTLS will upgrade if supported
  auth: {
    user: env.SMTP_USER || env.EMAIL_USER,
    pass: env.SMTP_PASS || env.EMAIL_PASS,
  },
});

module.exports = transporter;