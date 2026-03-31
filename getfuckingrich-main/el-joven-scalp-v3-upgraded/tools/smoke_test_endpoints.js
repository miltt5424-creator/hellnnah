#!/usr/bin/env node
'use strict';

/**
 * El Joven Scalp — Smoke test for all API endpoints
 * Usage: node tools/smoke_test_endpoints.js [base_url]
 */

const BASE = process.argv[2] || 'http://localhost:8080';

const ENDPOINTS = [
  { method: 'GET',  path: '/health',                         expect: 200 },
  { method: 'GET',  path: '/api/price?symbol=XAU%2FUSD',    expect: 200 },
  { method: 'GET',  path: '/api/price/all',                  expect: 200 },
  { method: 'GET',  path: '/api/price/symbols',              expect: 200 },
  { method: 'GET',  path: '/api/history?symbol=XAU%2FUSD',  expect: [200, 401] },
  { method: 'GET',  path: '/api/news',                       expect: [200, 401] },
  { method: 'GET',  path: '/api/calendar',                   expect: [200, 401] },
  { method: 'GET',  path: '/api/journal',                    expect: [200, 401] },
  { method: 'GET',  path: '/api/journal/stats',              expect: [200, 401] },
  { method: 'GET',  path: '/api/auth/check',                 expect: 200 },
];

async function run() {
  console.log(`\n🟡 El Joven Scalp — Smoke Test`);
  console.log(`   Target: ${BASE}\n`);

  let passed = 0, failed = 0;

  for (const ep of ENDPOINTS) {
    try {
      const res = await fetch(`${BASE}${ep.path}`, { method: ep.method });
      const expected = Array.isArray(ep.expect) ? ep.expect : [ep.expect];
      const ok = expected.includes(res.status);
      if (ok) {
        console.log(`  ✅ ${ep.method} ${ep.path} → ${res.status}`);
        passed++;
      } else {
        console.log(`  ❌ ${ep.method} ${ep.path} → ${res.status} (expected ${expected.join(' or ')})`);
        failed++;
      }
    } catch (err) {
      console.log(`  💥 ${ep.method} ${ep.path} → ERROR: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
