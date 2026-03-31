/**
 * API Smoke Test
 *
 * Hits key endpoints on the running dev server to verify they return 2xx.
 * Catches runtime errors that mocked unit tests miss (stale Prisma clients,
 * missing imports, broken queries, etc.).
 *
 * Usage: pnpm smoke
 * Requires: dev server running on localhost (see package.json "dev" script for port)
 */

const BASE_URL = process.env.SMOKE_URL || 'http://localhost:4000';

interface Endpoint {
  method: string;
  path: string;
  label: string;
  /** If true, skip this endpoint when it returns 401 (requires auth) */
  allowUnauth?: boolean;
}

const ENDPOINTS: Endpoint[] = [
  // Public pages
  { method: 'GET', path: '/', label: 'Landing page' },
  { method: 'GET', path: '/islamic-gedcom', label: 'Islamic GEDCOM reference' },
  { method: 'GET', path: '/policy', label: 'Policy page' },

  // Auth pages (should render, even if not logged in)
  { method: 'GET', path: '/auth/login', label: 'Login page' },
  { method: 'GET', path: '/auth/signup', label: 'Signup page' },

  // Legacy GEDCOM route
  { method: 'GET', path: '/saeed', label: 'Legacy family route' },

  // API endpoints (will return 401 without auth — that's OK, it means the route loaded)
  { method: 'GET', path: '/api/workspaces', label: 'Workspaces API', allowUnauth: true },
];

async function runSmokeTest() {
  console.log(`\n🔥 Smoke testing ${BASE_URL}\n`);

  // First, check if the server is reachable
  try {
    await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(5000) });
  } catch {
    console.error(`❌ Cannot reach ${BASE_URL} — is the dev server running? (pnpm dev)`);
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const endpoint of ENDPOINTS) {
    const url = `${BASE_URL}${endpoint.path}`;
    try {
      const res = await fetch(url, {
        method: endpoint.method,
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });

      const status = res.status;
      const ok = status < 500 && (endpoint.allowUnauth || status < 400);

      if (ok) {
        console.log(`  ✅ ${endpoint.method} ${endpoint.path} → ${status}  ${endpoint.label}`);
        passed++;
      } else {
        console.log(`  ❌ ${endpoint.method} ${endpoint.path} → ${status}  ${endpoint.label}`);
        failed++;
        failures.push(`${endpoint.method} ${endpoint.path} → ${status}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ ${endpoint.method} ${endpoint.path} → ERROR  ${msg}`);
      failed++;
      failures.push(`${endpoint.method} ${endpoint.path} → ${msg}`);
    }
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.error('Failures:');
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
}

runSmokeTest();
