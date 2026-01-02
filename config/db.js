const mongoose = require('mongoose');
const { env } = require('./env');
let MongoMemoryServer;
try {
  // Lazy-load to avoid bundling in production
  ({ MongoMemoryServer } = require('mongodb-memory-server'));
} catch {}

let connected = false;
let lastUri = null;
let lastDbName = null;

async function connect() {
  const uri = env.MONGODB_URI;
  const dbName = env.MONGODB_DB;

  // If already connected but config changed (common in tests), reconnect.
  if (connected) {
    if (lastUri === uri && lastDbName === dbName && mongoose.connection.readyState === 1) {
      return mongoose.connection;
    }
    try {
      await mongoose.disconnect();
    } catch {}
    connected = false;
  }

  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(uri, {
      dbName,
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 15000,
    });
  } catch (err) {
    console.error('[db] connection failed. Fix your database configuration instead of using an in-memory fallback.');
    throw err;
  }

  connected = true;
  lastUri = uri;
  lastDbName = dbName;

  mongoose.connection.on('connected', () => {
    console.log(`[db] connected to ${dbName}`);
  });

  mongoose.connection.on('error', (err) => {
    console.error('[db] connection error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    connected = false;
    if (env.NODE_ENV !== 'test') {
      console.warn('[db] disconnected');
    }
  });

  return mongoose.connection;
}

module.exports = { connect };