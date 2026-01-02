const NodeCache = require('node-cache');
// In test env, disable the internal checkperiod timer so Jest can exit cleanly.
const cache = new NodeCache({ stdTTL: 600, checkperiod: process.env.NODE_ENV === 'test' ? 0 : 120 });
module.exports = cache;