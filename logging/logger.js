const fs = require('fs');
const path = require('path');
const morgan = require('morgan');
const winston = require('winston');

const logDir = __dirname;
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

// Access log
const accessStream = fs.createWriteStream(path.join(logDir, 'access.log'), { flags: 'a' });

// Phase 7: Enhanced access logger with request ID
const accessLogger = morgan(':date[iso] :method :url :status :res[content-length] - :response-time ms :req[x-request-id]', { stream: accessStream });

// Phase 7: Structured error logger with request correlation
const errorLogger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(logDir, 'error.log') }),
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ] : [])
  ]
});

// Phase 7: Application logger for structured logging
const appLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(logDir, 'app.log') }),
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ] : [])
  ]
});

// Helper to add request context to logs
function logWithContext(level, message, meta = {}, req = null) {
  const logData = {
    ...meta,
    ...(req ? {
      requestId: req.id,
      method: req.method,
      url: req.url,
      userId: req.user?.id,
      ip: req.ip
    } : {})
  };
  appLogger.log(level, message, logData);
}

module.exports = { accessLogger, errorLogger, appLogger, logWithContext };