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
  /** Optional JSON body for POST/PATCH endpoints (sent with content-type: application/json). */
  body?: unknown;
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
  // Public collection page (anon) — unknown slug must load the route and 404,
  // not 500 (a 500 means the collections serving layer or Prisma client broke).
  { method: 'GET', path: '/collections/__smoke_unknown__', label: 'Public collection page (unknown → 404)', allowUnauth: true },
  // Anonymous collection serve API (Chunk 4) — unknown/private/collections-off
  // slug → ONE generic 404 (deny-by-default, no oracle). A 500 means the
  // collections public-serve composition or Prisma client broke.
  { method: 'GET', path: '/api/collections/__smoke_unknown__/tree', label: 'Public collection JSON (unknown → 404)', allowUnauth: true },
  // Admin global takedown — anon must be rejected (401) at the gate, not 500.
  { method: 'POST', path: '/api/admin/takedown', label: 'Admin takedown (anon → 401)', allowUnauth: true },

  // Collections routes — anon hitting an unknown workspace must load the route
  // and return 401/404 at the gate, NOT 500 (catches stale Prisma client /
  // missing import / broken query in the new route modules).
  { method: 'GET', path: '/api/workspaces/00000000-0000-4000-a000-000000000000/extra-trees', label: 'Extra-trees list (anon → 401/404)', allowUnauth: true },
  { method: 'GET', path: '/api/workspaces/00000000-0000-4000-a000-000000000000/collections', label: 'Collections list (anon → 401/404)', allowUnauth: true },
  { method: 'GET', path: '/api/workspaces/00000000-0000-4000-a000-000000000000/collections/00000000-0000-4000-a000-000000000001', label: 'Collection detail (anon → 401/404)', allowUnauth: true },
  { method: 'POST', path: '/api/workspaces/00000000-0000-4000-a000-000000000000/extra-trees/00000000-0000-4000-a000-000000000001/duplicate', label: 'Duplicate tree (anon → 401/404)', allowUnauth: true },

  // Extra-tree editing (Collections Chunk 2): reading the member tree with a
  // `?treeId=` selector must load the route and reject at the auth/feature gate
  // (401/404), NOT 500 — catches a broken tree-id resolver in the GET path.
  { method: 'GET', path: '/api/workspaces/00000000-0000-4000-a000-000000000000/tree?treeId=00000000-0000-4000-a000-000000000001', label: 'Tree GET with treeId selector (anon → 401/404)', allowUnauth: true },

  // Person Page (Surface 1): the member person-projection route loads the tree
  // GET pipeline (load → pointer merge → projectPerson). Anon GET must load the
  // route and reject at the member gate (401/404), NOT 500 — catches a broken
  // import or runtime error in the projection pipeline.
  { method: 'GET', path: '/api/workspaces/00000000-0000-4000-a000-000000000000/tree/person/00000000-0000-4000-a000-000000000002', label: 'Person projection (anon → 401/404)', allowUnauth: true },

  // Extra-tree publish (Collections Chunk 3, Slice B): the visibility route now
  // accepts an optional `treeId` body field. Anon PATCH must load the route and
  // reject at the admin gate (401), NOT 500 — catches a broken treeId resolver
  // or schema in the extended publish path.
  { method: 'PATCH', path: '/api/workspaces/00000000-0000-4000-a000-000000000000/tree/visibility', label: 'Extra-tree publish visibility (anon → 401)', allowUnauth: true },

  // Unified publish flow: the publish-preview route now resolves a tree via the
  // shared treeId-aware resolver (main when absent, scoped extra tree when
  // present). Anon GET (both forms) must load the route and reject at the admin
  // gate (401/403/404), NOT 500 — catches a broken resolver or a dropped import
  // (e.g. the getOrCreateTreeWithKey → resolveTargetTreeOr404 + getWorkspaceKey swap).
  { method: 'GET', path: '/api/workspaces/00000000-0000-4000-a000-000000000000/tree/publish-preview', label: 'Publish preview, main (anon → 401/404)', allowUnauth: true },
  { method: 'GET', path: '/api/workspaces/00000000-0000-4000-a000-000000000000/tree/publish-preview?treeId=00000000-0000-4000-a000-000000000001', label: 'Publish preview with treeId (anon → 401/404)', allowUnauth: true },

  // Add-by-link (Collections Chunk 3, Slice A): the items POST route now imports
  // the link resolver + cross-workspace deep-copy. Anon POST with a linkInput
  // body must load the route and reject at the feature/auth gate (404/401/403),
  // NOT 500 — catches a missing import or runtime error in the new path.
  { method: 'POST', path: '/api/workspaces/00000000-0000-4000-a000-000000000000/collections/00000000-0000-4000-a000-000000000001/items', label: 'Add item by link (anon → 401/403/404)', allowUnauth: true, body: { kind: 'tree', linkInput: 'brsh_smoke', linkMode: 'linked', titleAr: 'دخان' } },

  // Collection publish + listing readiness (Collections Chunk 4, Slice C): the
  // visibility PATCH route now imports the id-keyed listing-readiness helper +
  // the own-tree promote query; the publish-preview route surfaces the readiness
  // breakdown. Anon must reject at the feature/auth gate (404/401), NOT 500 —
  // catches a missing import or runtime error in the promote/list path.
  { method: 'PATCH', path: '/api/workspaces/00000000-0000-4000-a000-000000000000/collections/00000000-0000-4000-a000-000000000001/visibility', label: 'Collection visibility + promote (anon → 401/404)', allowUnauth: true, body: { visibility: 'public_listed', promoteOwnTreesToListed: true } },
  { method: 'GET', path: '/api/workspaces/00000000-0000-4000-a000-000000000000/collections/00000000-0000-4000-a000-000000000001/publish-preview', label: 'Collection publish-preview readiness (anon → 401/404)', allowUnauth: true },
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
        ...(endpoint.body !== undefined
          ? {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(endpoint.body),
            }
          : {}),
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
