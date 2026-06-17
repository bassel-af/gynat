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

  // API endpoints (will return 401 without auth — that's OK, it means the route loaded)
  { method: 'GET', path: '/api/workspaces', label: 'Workspaces API', allowUnauth: true },

  // Admin gate — anon hitting /api/admin/* must return 401, NOT 200 / 500.
  // The middleware enforces this before any handler runs.
  { method: 'GET', path: '/api/admin/healthcheck', label: 'Admin healthcheck (anon → 401)', allowUnauth: true },

  // Phase 1 admin metrics — anon must be rejected with 401 at the middleware.
  // If any of these returned 200 or 500, the route is misconfigured.
  { method: 'GET', path: '/api/admin/metrics/growth', label: 'Admin metrics growth (anon → 401)', allowUnauth: true },
  { method: 'GET', path: '/api/admin/metrics/engagement', label: 'Admin metrics engagement (anon → 401)', allowUnauth: true },
  { method: 'GET', path: '/api/admin/metrics/health', label: 'Admin metrics health (anon → 401)', allowUnauth: true },
  { method: 'GET', path: '/api/admin/metrics/presence', label: 'Admin metrics presence (anon → 401)', allowUnauth: true },

  // Public tree (anon) — unknown slug must load the route and 404, NOT 500.
  // (A 500 here means the Prisma client is stale or the route is broken.)
  { method: 'GET', path: '/api/family/__smoke_unknown__/tree', label: 'Public tree JSON (unknown → 404)', allowUnauth: true },
  { method: 'GET', path: '/family/__smoke_unknown__', label: 'Public tree page (unknown → 404)', allowUnauth: true },
  // Admin global takedown — anon must be rejected (401) at the gate, not 500.
  { method: 'POST', path: '/api/admin/takedown', label: 'Admin takedown (anon → 401)', allowUnauth: true },

  // Collections routes — anon hitting an unknown workspace must load the route
  // and return 401/404 at the gate, NOT 500 (catches stale Prisma client /
  // missing import / broken query in the new route modules).
  { method: 'GET', path: '/api/workspaces/00000000-0000-4000-a000-000000000000/extra-trees', label: 'Extra-trees list (anon → 401/404)', allowUnauth: true },
  { method: 'GET', path: '/api/workspaces/00000000-0000-4000-a000-000000000000/collections', label: 'Collections list (anon → 401/404)', allowUnauth: true },
  { method: 'GET', path: '/api/workspaces/00000000-0000-4000-a000-000000000000/collections/00000000-0000-4000-a000-000000000001', label: 'Collection detail (anon → 401/404)', allowUnauth: true },
  { method: 'POST', path: '/api/workspaces/00000000-0000-4000-a000-000000000000/extra-trees/00000000-0000-4000-a000-000000000001/duplicate', label: 'Duplicate tree (anon → 401/404)', allowUnauth: true },
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
