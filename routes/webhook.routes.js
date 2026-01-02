const express = require('express');
const { handleStripeWebhook } = require('../controllers/webhook.controller');

const router = express.Router();

router.post('/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);

module.exports = router;
