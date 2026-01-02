const transporter = require('../config/email.config');

/**
 * Send a generic email.
 * @param {string} to
 * @param {string} subject
 * @param {string} html
 */
async function sendEmail(to, subject, html) {
  if (process.env.NODE_ENV === 'test') {
    // Skip sending emails in test mode
    return;
  }
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  await transporter.sendMail({ from, to, subject, html });
}

function verificationTemplate(name, link) {
  return `<p>Hi ${name},</p>
          <p>Please verify your email by clicking <a href="${link}">here</a>.</p>`;
}

function resetPasswordTemplate(name, link) {
  return `<p>Hi ${name},</p>
          <p>Reset your password by clicking <a href="${link}">here</a>. This link is valid for 1 hour.</p>`;
}

function orderConfirmationTemplate(orderId) {
  return `<p>Thank you for your order!</p>
          <p>Order ID: ${orderId}</p>`;
}

function paymentConfirmationTemplate(orderId) {
  return `<p>Your payment for Order ${orderId} was successful.</p>`;
}

module.exports = {
  sendEmail,
  verificationTemplate,
  resetPasswordTemplate,
  orderConfirmationTemplate,
  paymentConfirmationTemplate
};