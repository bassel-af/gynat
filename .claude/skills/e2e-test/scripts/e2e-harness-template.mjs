// Real-infra browser e2e harness TEMPLATE for this app.
// Copy to the PROJECT ROOT (e.g. ./e2e-run.mjs) so ESM resolves node_modules,
// adapt the `browserFlow()` middle section to your feature, run:
//   node e2e-run.mjs <uniqueStamp>
// then DELETE the copy when done. Creates an ISOLATED throwaway user + workspace,
// drives the real UI, and tears everything down in finally (even on failure).
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });
import { chromium } from '@playwright/test'; // NOT 'playwright' — that pkg isn't installed
import pg from 'pg';

const APP = 'http://localhost:4000';
const GOTRUE = 'http://localhost:8000/auth/v1';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const stamp = process.argv[2] || 'e2e';          // unique per run → no slug/email collisions
const email = `e2e-${stamp}@example.com`;
const password = 'E2ePassw0rd!test';
const slug = `e2e-${stamp}`;

const log = (...a) => console.log('•', ...a);
let userId, workspaceId, fatherId, bearer;

async function j(res, label) {
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${label} → ${res.status}: ${text.slice(0, 300)}`);
  return body;
}

async function setup() {
  // 1. Confirmed GoTrue user.
  const created = await j(await fetch(`${GOTRUE}/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  }), 'gotrue admin create');
  userId = created.id;
  log('created user', userId, email);

  // 2. Password-grant a Bearer token (same path the login form drives).
  const tok = await j(await fetch(`${GOTRUE}/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }), 'password grant');
  bearer = tok.access_token;
  const auth = { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' };

  // 3. Sync into public.users (workspace create FKs to it). REQUIRED.
  await j(await fetch(`${APP}/api/auth/sync-user`, { method: 'POST', headers: auth, body: '{}' }), 'sync-user');

  // 4. Workspace (creator becomes admin + gets a main tree).
  const ws = await j(await fetch(`${APP}/api/workspaces`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ slug, nameAr: 'عائلة اختبار e2e', description: 'temp e2e' }),
  }), 'create workspace');
  workspaceId = ws.data?.id ?? ws.id;
  log('created workspace', workspaceId, slug);

  // 5+. Fixture — ADAPT to your feature. Example: a father with a family.
  const father = await j(await fetch(`${APP}/api/workspaces/${workspaceId}/tree/individuals`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ givenName: 'الأب', fullName: 'الأب المختبر', sex: 'M' }),
  }), 'create father');
  fatherId = father.data.id;
  await j(await fetch(`${APP}/api/workspaces/${workspaceId}/tree/families`, {
    method: 'POST', headers: auth, body: JSON.stringify({ husbandId: fatherId }),
  }), 'create family');
  log('fixture ready — father', fatherId);
}

async function browserFlow() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  let fullLoads = 0;
  page.on('load', () => { fullLoads++; });          // count full reloads to prove in-place updates

  try {
    // Log in through the real UI.
    await page.goto(`${APP}/auth/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await Promise.all([
      page.waitForURL('**/workspaces**', { timeout: 20000 }),
      page.click('button[type="submit"]'),
    ]);
    log('logged in');

    // ===== ADAPT BELOW: exercise + assert your feature =====
    const SON = `الابن الجديد ${stamp}`;
    await page.goto(`${APP}/workspaces/${slug}/tree/person/${fatherId}`, { waitUntil: 'networkidle' });
    await page.getByText('الأب المختبر').first().waitFor({ timeout: 20000 });
    if (await page.getByText(SON).count() > 0) throw new Error('fixture dirty — son already present');
    const loadsBefore = fullLoads;

    await page.getByRole('button', { name: 'إضافة ابن/ابنة' }).first().click();
    const nameField = page.getByPlaceholder('مثال: أحمد').first();
    await nameField.waitFor({ timeout: 10000 });
    await nameField.fill(SON);
    await page.check('input[name="sex"][value="M"]');           // submit disabled until name+sex set
    await page.getByRole('button', { name: 'إضافة', exact: true }).click(); // footer submit (form= linked)

    await page.getByText(SON).first().waitFor({ timeout: 20000 });
    const extra = fullLoads - loadsBefore;
    if (extra !== 0) throw new Error(`expected 0 full reloads, saw ${extra}`);
    console.log(`\nRESULT: PASS — son appeared with ${extra} full reloads`);
    // ===== ADAPT ABOVE =====
  } finally {
    await browser.close();
  }
}

async function teardown() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    if (workspaceId) {
      await client.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]); // FK cascades
      log('deleted workspace + cascaded tree data');
    }
  } finally { await client.end(); }
  if (userId) {
    await fetch(`${GOTRUE}/admin/users/${userId}`, {
      method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    });
    log('deleted GoTrue user');
  }
}

let failed = false;
try {
  await setup();
  await browserFlow();
} catch (e) {
  failed = true;
  console.error('\nRESULT: FAIL —', e.message);
} finally {
  try { await teardown(); } catch (e) { console.error('teardown error:', e.message); }
}
process.exit(failed ? 1 : 0);
