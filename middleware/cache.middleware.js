const cache = require('../cache/cache.config');

/**
 * Cache middleware factory.
 * @param {number} ttlSeconds  Time to live in seconds
 */
function cacheMiddleware(ttlSeconds) {
  return (req, res, next) => {
    const key = '__expres__' + (req.originalUrl || req.url);
    const cachedBody = cache.get(key);
    if (cachedBody) {
      return res.json(cachedBody);
    }
    res.sendResponse = res.json.bind(res);
    res.json = (body) => {
      cache.set(key, body, ttlSeconds);
      res.sendResponse(body);
    };
    next();
  };
}

module.exports = cacheMiddleware;