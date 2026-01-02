const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const { doubleCsrf } = require('csrf-csrf');
const sanitizeInput = require('./middleware/sanitize.middleware');
const hpp = require('hpp');
const { httpsRedirect, hstsHeader } = require('./middleware/https.middleware');

const { env } = require('./config/env');
const { connect } = require('./config/db');
const { errorLogger, appLogger } = require('./logging/logger');
const requestIdMiddleware = require('./middleware/requestId.middleware');

// Sentry error tracking (optional - only loads if SENTRY_DSN is configured)
let Sentry = null;
if (env.SENTRY_DSN) {
  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
      integrations: [],
    });
    console.log('[sentry] Error tracking initialized');
  } catch (e) {
    console.warn('[sentry] @sentry/node not installed, skipping error tracking');
  }
}

// route modules
const authRoutes = require('./routes/auth.routes');
const productRoutes = require('./routes/product.routes');
const categoryRoutes = require('./routes/category.routes');
const cartRoutes = require('./routes/cart.routes');
const orderRoutes = require('./routes/order.routes');
const paymentRoutes = require('./routes/payment.routes');
const wishlistRoutes = require('./routes/wishlist.routes');
const adminRoutes = require('./routes/admin.routes');
const webhookRoutes = require('./routes/webhook.routes');
const reviewRoutes = require('./routes/review.routes');
const couponRoutes = require('./routes/coupon.routes');
const analyticsRoutes = require('./routes/analytics.routes');

const app = express();

// Sentry request handler (if available)
if (Sentry) {
  app.use(Sentry.Handlers.requestHandler());
}

// trust proxy when behind load balancers
app.set('trust proxy', 1);

// HTTPS redirect and HSTS (production only)
app.use(httpsRedirect);
app.use(hstsHeader);

// Phase 7: Add request ID for observability and tracing
app.use(requestIdMiddleware);

// Workaround: Some third-party middleware (e.g., express-mongo-sanitize) tries to
// assign to req.query, which is a read-only getter in Express 5. Make it writable
// up-front by redefining the property per request.
app.use((req, _res, next) => {
  try {
    const q = req.query;
    // Only redefine if current property is a getter (no own writable value)
    const desc = Object.getOwnPropertyDescriptor(req, 'query');
    if (!desc || desc.get || desc.set || desc.writable === false) {
      Object.defineProperty(req, 'query', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: q && typeof q === 'object' ? { ...q } : {},
      });
    }
  } catch {}
  next();
});

// logging to file + console
const logsDir = path.join(__dirname, 'logging');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
const accessLogStream = fs.createWriteStream(path.join(logsDir, 'access.log'), { flags: 'a' });
app.use(morgan('combined', { stream: accessLogStream }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// security + perf
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://js.stripe.com', 'https://www.googletagmanager.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: [
        "'self'",
        env.CLIENT_ORIGIN,
        env.ADMIN_ORIGIN,
        'https://www.google-analytics.com',
        'https://www.googletagmanager.com',
        'https://api.stripe.com',
        'https://r.stripe.com'
      ],
      frameSrc: ["'self'", 'https://js.stripe.com'],
    }
  } : false,
}));
app.use(compression());

// CORS (merge client + admin origins; support comma separated lists)
const clientOrigins = env.CLIENT_ORIGIN.split(',').map(s => s.trim()).filter(Boolean);
const extraAdminOrigins = env.ADMIN_ORIGIN ? env.ADMIN_ORIGIN.split(',').map(s=>s.trim()).filter(Boolean) : [];
const allowedOrigins = [...new Set([...clientOrigins, ...extraAdminOrigins])];
app.use(cors({
  origin: function(origin, callback) {
    // Allow non-browser / curl (no origin) plus listed origins
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    // Disallow unknown origins without throwing to avoid 500s
    return callback(null, false);
  },
  credentials: true,
}));

// Webhooks must be registered before JSON body parsing so we can verify signatures
app.use('/webhook', webhookRoutes);

// parsers
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
// Global input hardening (Express 5-safe)
app.use(sanitizeInput);
app.use(hpp());
app.use(cookieParser());

// static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// health
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime(), ts: Date.now() }));

// CSRF protection (csurf is deprecated/unmaintained). Keep the same public contract:
// - Token endpoint: GET /api/csrf-token -> { csrfToken }
// - Client sends header: X-CSRF-Token: <token>
const csrfExcludedPaths = ['/webhook/stripe'];
const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => env.REFRESH_TOKEN_SECRET || env.JWT_SECRET,
  // For stateless apps, use a fixed identifier or derive from request
  getSessionIdentifier: (req) => req.ip || 'anonymous',
  cookieName: 'jaguza_csrf',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.NODE_ENV === 'production',
    path: '/',
  },
  getCsrfTokenFromRequest: (req) => req.get('X-CSRF-Token'),
});

// Expose a CSRF token for SPAs (sets the CSRF cookie and returns the token)
app.get('/api/csrf-token', (req, res) => {
  const token = generateCsrfToken(req, res);
  res.json({ csrfToken: token });
});

// Apply CSRF globally after parsers while allowing PSP/webhook callbacks to bypass
app.use((req, res, next) => {
  if (csrfExcludedPaths.some((path) => req.path.startsWith(path))) {
    return next();
  }
  return doubleCsrfProtection(req, res, next);
});

// Phase 6: Granular rate limiting per route type
// Rate limit handler with Retry-After header
const rateLimitHandler = (req, res) => {
  const retryAfter = Math.ceil((env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000) / 1000);
  res.set('Retry-After', String(retryAfter));
  res.status(429).json({ 
    message: 'Too many requests, please try again later',
    retryAfter
  });
};

// General API rate limit (per IP)
const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000, // 15 min default
  max: env.RATE_LIMIT_MAX || 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Stricter limits for auth endpoints (login, register, password reset)
// In test mode, be more lenient to avoid breaking sequential integration tests
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'test' ? 1000 : 10, // 10 attempts per 15 min in prod, 1000 in test
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    res.set('Retry-After', '900'); // 15 minutes
    res.status(429).json({ 
      message: 'Too many authentication attempts, please try again later',
      retryAfter: 900
    });
  },
});

// Moderate limits for mutating endpoints (cart, orders, payments)
const mutateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'test' ? 1000 : 30, // 30 mutations per 15 min in prod, 1000 in test
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    res.set('Retry-After', '900'); // 15 minutes
    res.status(429).json({ 
      message: 'Too many requests, please slow down',
      retryAfter: 900
    });
  },
});

// api routes with appropriate rate limits
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/products', generalLimiter, productRoutes);
app.use('/api/categories', generalLimiter, categoryRoutes);
app.use('/api/cart', mutateLimiter, cartRoutes);
app.use('/api/orders', mutateLimiter, orderRoutes);
app.use('/api/payments', mutateLimiter, paymentRoutes);
app.use('/api/wishlist', mutateLimiter, wishlistRoutes);
app.use('/api/reviews', mutateLimiter, reviewRoutes);
app.use('/api/coupons', generalLimiter, couponRoutes);

// Admin routes hidden behind keyed path segment (security by obscurity + layered controls)
// e.g., /api/admin/<ADMIN_ROUTE_KEY>/...
app.use(`/api/admin/${env.ADMIN_ROUTE_KEY}`, adminRoutes);
app.use(`/api/admin/${env.ADMIN_ROUTE_KEY}/analytics`, analyticsRoutes);

// Minimal OpenAPI (expandable): includes basic auth, csrf, health
const openapi = {
  openapi: '3.0.0',
  info: { title: 'Jaguza API', version: '1.0.0' },
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'token'
      }
    }
  },
  paths: {
    '/health': { get: { summary: 'Health check', responses: { 200: { description: 'OK' } } } },
    '/api/csrf-token': { get: { summary: 'Get CSRF token', responses: { 200: { description: 'Token' } } } },
    '/api/auth/login': { post: { summary: 'Login', responses: { 200: { description: 'OK' }, 401: { description: 'Invalid' } } } },
    '/api/auth/register': { post: { summary: 'Register', responses: { 201: { description: 'Created' }, 400: { description: 'Bad Request' } } } },
    '/api/auth/logout': { post: { summary: 'Logout', security: [{ cookieAuth: [] }], responses: { 200: { description: 'OK' } } } },
    '/api/auth/refresh': { post: { summary: 'Refresh access token', responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorized' } } } },
  },
};
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

// 404
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'Not Found' });
  }
  next();
});

// Sentry error handler (if available) - must be before custom error handler
if (Sentry) {
  app.use(Sentry.Handlers.errorHandler());
}

// Phase 7: Enhanced error handler with request context and Sentry integration
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // csurf used EBADCSRFTOKEN; csrf-csrf uses a Forbidden-style error. Handle both.
  const isCsrfError =
    err?.code === 'EBADCSRFTOKEN' ||
    (Number(err?.status || err?.statusCode) === 403 && /csrf/i.test(String(err?.message || '')));

  if (isCsrfError) {
    return res.status(403).json({ message: 'Invalid CSRF token', requestId: req.id });
  }

  const status = err.status || err.statusCode || (res.statusCode >= 400 ? res.statusCode : 500);

  // Capture to Sentry if available and is a server error
  if (Sentry && status >= 500) {
    Sentry.withScope((scope) => {
      scope.setTag('requestId', req.id);
      scope.setUser({ id: req.user?.id, ip_address: req.ip });
      scope.setExtra('method', req.method);
      scope.setExtra('url', req.url);
      Sentry.captureException(err);
    });
  }

  // Phase 7: Structured error logging with request context
  errorLogger.error({
    message: err.message,
    stack: err.stack,
    status,
    requestId: req.id,
    method: req.method,
    url: req.url,
    userId: req.user?.id,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  res.status(status).json({
    message: err.message || 'Internal Server Error',
    requestId: req.id, // Phase 7: Include request ID in error response for support
    ...(env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
  });
});

// start
if (env.NODE_ENV !== 'test') {
  (async () => {
    try {
      await connect();
      const server = app.listen(env.PORT, () => {
        console.log(`API running on ${env.BASE_URL} (env: ${env.NODE_ENV})`);
        console.log(`Docs: ${env.BASE_URL}/docs  Health: ${env.BASE_URL}/health`);
      });
      
      // Production safety checks
      if (env.NODE_ENV === 'production') {
        const errors = [];
        if (env.ADMIN_ROUTE_KEY === 'change-this-admin-key') {
          errors.push('ADMIN_ROUTE_KEY must be changed from default value');
        }
        if (!env.STRIPE_SECRET_KEY || !env.STRIPE_SECRET_KEY.startsWith('sk_')) {
          errors.push('STRIPE_SECRET_KEY must be set to a valid Stripe secret key');
        }
        if (!env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) {
          errors.push('STRIPE_WEBHOOK_SECRET must be set to a valid Stripe webhook secret');
        }
        if (errors.length > 0) {
          console.error('\n[PRODUCTION SAFETY] Refusing to start due to configuration errors:');
          errors.forEach(err => console.error(`  - ${err}`));
          process.exit(1);
        }
      }
      
      // Graceful shutdown
      const shutdown = async (signal) => {
        console.log(`\n[${signal}] shutting down...`);
        server.close(() => {
          console.log('HTTP server closed');
        });
        try {
          const mongoose = require('mongoose');
          await mongoose.connection.close(false);
          console.log('DB connection closed');
        } catch (e) {}
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    } catch (e) {
      console.error('Failed to start server:', e);
      process.exit(1);
    }
  })();
}

module.exports = app;
