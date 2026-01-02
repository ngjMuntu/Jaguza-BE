#!/usr/bin/env node

/*
  Phase 8: Post-deploy smoke test

  Usage:
    BASE_URL=https://api.yourdomain.com node scripts/smoke-test.js

  Expected:
  - Backend is already running and reachable.
  - Exits 0 on success, 1 on failure.
*/

const { env } = require('../config/env');

const baseUrl = (process.env.BASE_URL || env.BASE_URL || '').replace(/\/$/, '');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getJson(path) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'accept': 'application/json' },
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { url, res, text, json };
}

(async function main() {
  try {
    assert(baseUrl, 'BASE_URL is not set');

    // 1) Health
    {
      const { url, res, json, text } = await getJson('/health');
      assert(res.ok, `GET ${url} failed: ${res.status} ${text}`);
      assert(json && json.status === 'ok', `GET ${url} unexpected response: ${text}`);
    }

    // 2) CSRF token endpoint
    {
      const { url, res, json, text } = await getJson('/api/csrf-token');
      assert(res.ok, `GET ${url} failed: ${res.status} ${text}`);
      assert(json && typeof json.csrfToken === 'string' && json.csrfToken.length > 10, `GET ${url} missing csrfToken: ${text}`);
    }

    // 3) Public catalog endpoints
    {
      const { url, res, json, text } = await getJson('/api/products?limit=1&page=1');
      assert(res.ok, `GET ${url} failed: ${res.status} ${text}`);
      assert(json && Array.isArray(json.products), `GET ${url} expected { products: [] }: ${text}`);
    }

    {
      const { url, res, json, text } = await getJson('/api/categories');
      assert(res.ok, `GET ${url} failed: ${res.status} ${text}`);
      assert(Array.isArray(json), `GET ${url} expected an array: ${text}`);
    }

    console.log('[smoke-test] OK');
    process.exit(0);
  } catch (e) {
    console.error('[smoke-test] FAIL:', e?.message || e);
    process.exit(1);
  }
})();
