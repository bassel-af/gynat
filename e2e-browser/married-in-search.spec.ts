/**
 * Visual e2e for "search & navigate to a married-in spouse's family".
 *
 * Bug: the side panel list, stat counts, and search were scoped to the canvas-
 * visible set (root + descendants + spouses + grafts). A married-in spouse's
 * extended family — e.g. her BROTHER'S CHILD (a nephew), who is connected only
 * through the marriage edge and is neither a descendant nor a graft — could not
 * be found in the list/search, and clicking such a person did nothing.
 *
 * Fix: the panel now scopes to everyone connected to the root by blood OR
 * marriage (getConnectedIndividuals). Stats reflect the same set, and clicking a
 * person who isn't on the current canvas re-roots onto their family + focuses
 * them.
 *
 * Fixture (root wins as default root with 4 descendants vs wifeFather's 3):
 *
 *   root ─(rootFam)─ son ─(sonFam, wife=daughterInLaw)─ gc1, gc2, gc3
 *                                   │ daughterInLaw is married-in
 *              wifeFather ─(wifeFam)─ daughterInLaw, wifeBrother
 *                                                       │
 *                       wifeBrother ─(broFam, wife=broWife)─ NEPHEW  ← hidden
 *
 * NEPHEW is connected to root by marriage (root→son→daughterInLaw→wifeFam→
 * wifeBrother→broFam→nephew) but is NOT on the canvas: not a descendant of root,
 * and beyond the graft depth (grafts only reach the spouse's parents + siblings).
 *
 * Requires the dev stack (docker compose + next dev on :4000).
 */

import { test, expect, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:8000';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:gynat-dev-pg-2026@localhost:5432/gynat';

if (!SERVICE_ROLE) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY missing — load .env.local before running Playwright');
}

const PASSWORD = 'TestUser#Passw0rd1';

type TestUser = { email: string; gotrueId: string };

async function createGotrueUser(email: string): Promise<TestUser> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE!,
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`createGotrueUser failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { id: string };
  return { email, gotrueId: json.id };
}

async function getAccessToken(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE! },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`getAccessToken failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function deleteGotrueUser(id: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE!, Authorization: `Bearer ${SERVICE_ROLE}` },
  }).catch(() => {});
}

async function loginViaUI(context: BrowserContext, email: string): Promise<void> {
  const page = await context.newPage();
  await page.goto('/auth/login');
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await Promise.all([
    page.waitForURL('**/workspaces', { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.close();
}

type ApiClient = { post: (path: string, body?: unknown) => Promise<{ status: number; data: any }> };

function makeApiClient(token: string): ApiClient {
  const base = 'http://localhost:4000';
  return {
    async post(urlPath, body) {
      const res = await fetch(base + urlPath, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let data: any = null;
      try { data = await res.json(); } catch { /* empty */ }
      return { status: res.status, data };
    },
  };
}

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

async function ind(api: ApiClient, ws: string, fields: Record<string, unknown>): Promise<string> {
  const r = await api.post(`/api/workspaces/${ws}/tree/individuals`, fields);
  if (r.status !== 201) throw new Error(`individual create failed: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.data.id as string;
}

async function fam(api: ApiClient, ws: string, body: Record<string, unknown>): Promise<string> {
  const r = await api.post(`/api/workspaces/${ws}/tree/families`, body);
  if (r.status !== 201) throw new Error(`family create failed: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.data.id as string;
}

async function addChild(api: ApiClient, ws: string, familyId: string, individualId: string): Promise<void> {
  const r = await api.post(`/api/workspaces/${ws}/tree/families/${familyId}/children`, { individualId });
  if (r.status !== 201 && r.status !== 200) throw new Error(`addChild failed: ${r.status} ${JSON.stringify(r.data)}`);
}

let user: TestUser;
let token: string;

test.beforeAll(async ({ browser }) => {
  const suffix = randomUUID().slice(0, 8);
  user = await createGotrueUser(`pw-mis-${suffix}@test.gynat.local`);
  const ctx = await browser.newContext();
  await loginViaUI(ctx, user.email); // mirrors user into public.users
  await ctx.close();
  token = await getAccessToken(user.email);
});

test.afterAll(async () => {
  if (user) {
    await withPg((c) => c.query('DELETE FROM users WHERE id = $1', [user.gotrueId])).catch(() => {});
    await deleteGotrueUser(user.gotrueId);
  }
});

test('finds and navigates to a married-in spouse\'s hidden relative (nephew)', async ({ browser }) => {
  test.setTimeout(120_000); // fixture build (many API calls) + login + cold route compile
  const api = makeApiClient(token);
  const tag = randomUUID().slice(0, 6);
  const slug = `mis-${tag}`;

  const wsRes = await api.post('/api/workspaces', {
    slug,
    nameAr: `بحث-المصاهرة ${tag}`,
    description: 'married-in search e2e',
  });
  if (wsRes.status !== 201) throw new Error(`workspace create failed: ${wsRes.status} ${JSON.stringify(wsRes.data)}`);
  const ws = wsRes.data.data.id as string;

  // Distinctive given name so the nephew is unambiguous in the sidebar list.
  const NEPHEW_NAME = `سليل-${tag}`;

  let nephewId = '';
  try {
    // --- Core tree: root has TWO sons. son2 has his own line so root's
    //     descendant count (6) dominates wifeFather's (4) and root stays the
    //     default root. (The shared grandchild gc1 counts for both root and
    //     the in-law side, so root needs the extra son2 branch to win.) ---
    const root = await ind(api, ws, { givenName: `الجد-${tag}`, sex: 'M', birthDate: '1900' });
    const son1 = await ind(api, ws, { givenName: `الابن-الأول-${tag}`, sex: 'M', birthDate: '1930' });
    const son2 = await ind(api, ws, { givenName: `الابن-الثاني-${tag}`, sex: 'M', birthDate: '1932' });
    const rootFam = await fam(api, ws, { husbandId: root });
    await addChild(api, ws, rootFam, son1);
    await addChild(api, ws, rootFam, son2);

    // son1 marries the married-in wife; they have one child.
    const daughterInLaw = await ind(api, ws, { givenName: `الكنّة-${tag}`, sex: 'F', birthDate: '1934' });
    const son1Fam = await fam(api, ws, { husbandId: son1, wifeId: daughterInLaw });
    const gc1 = await ind(api, ws, { givenName: `حفيد-أول-${tag}`, sex: 'M', birthDate: '1960' });
    await addChild(api, ws, son1Fam, gc1);

    // son2 marries a wife with no external family; they have three children
    // (these count only toward root, securing root as the default root).
    const son2Wife = await ind(api, ws, { givenName: `زوجة-الابن-الثاني-${tag}`, sex: 'F', birthDate: '1936' });
    const son2Fam = await fam(api, ws, { husbandId: son2, wifeId: son2Wife });
    for (const y of ['1962', '1964', '1966']) {
      const gc = await ind(api, ws, { givenName: `حفيد-${y}-${tag}`, sex: 'M', birthDate: y });
      await addChild(api, ws, son2Fam, gc);
    }

    // --- Married-in wife's family: father + brother (these become grafts) ---
    const wifeFather = await ind(api, ws, { givenName: `والد-الكنّة-${tag}`, sex: 'M', birthDate: '1905' });
    const wifeBrother = await ind(api, ws, { givenName: `أخو-الكنّة-${tag}`, sex: 'M', birthDate: '1938' });
    const wifeFam = await fam(api, ws, { husbandId: wifeFather });
    await addChild(api, ws, wifeFam, daughterInLaw);
    await addChild(api, ws, wifeFam, wifeBrother);

    // --- The hidden relative: the brother's child (nephew) ---
    const broWife = await ind(api, ws, { givenName: `زوجة-الأخ-${tag}`, sex: 'F', birthDate: '1940' });
    nephewId = await ind(api, ws, { givenName: NEPHEW_NAME, sex: 'M', birthDate: '1968' });
    const broFam = await fam(api, ws, { husbandId: wifeBrother, wifeId: broWife });
    await addChild(api, ws, broFam, nephewId);

    // --- Drive the UI ---
    const ctx = await browser.newContext();
    await loginViaUI(ctx, user.email);
    const page = await ctx.newPage();

    await page.goto(`/workspaces/${slug}/tree`);
    await page.waitForLoadState('networkidle');
    // Canvas renders the default-root (root) tree.
    await page.locator(`.react-flow__node[data-id="${root}"]`).waitFor({ timeout: 30_000 });

    // 1) The nephew is NOT on the canvas initially (hidden married-in relative:
    //    connected only via marriage, beyond the graft depth).
    await expect(page.locator(`.react-flow__node[data-id="${nephewId}"]`)).toHaveCount(0);

    // 2) Stats reflect EVERYONE connected by blood or marriage: 13 people, 5 families.
    //    (Old behaviour counted only the canvas-visible set, excluding the brother's
    //    wife + nephew on the far side of the marriage.)
    const statValues = page.locator('[class*="statChipValue"]');
    await expect(statValues.nth(0)).toHaveText('13');
    await expect(statValues.nth(1)).toHaveText('5');

    // 3) The nephew is now findable via the sidebar search (the core bug fix).
    const search = page.getByPlaceholder('ابحث عن شخص في العائلة...');
    await search.fill(NEPHEW_NAME);
    const nephewItem = page.locator('li', { hasText: NEPHEW_NAME });
    await expect(nephewItem).toBeVisible({ timeout: 10_000 });

    // 4) Clicking the hidden relative re-roots onto their family and focuses them:
    //    the nephew node now appears on the canvas.
    await nephewItem.click();
    await expect(page.locator(`.react-flow__node[data-id="${nephewId}"]`)).toBeVisible({ timeout: 20_000 });

    await page.screenshot({ path: 'e2e-browser/screenshots/married-in-search.png', fullPage: true });
    await ctx.close();
  } finally {
    await withPg((c) => c.query('DELETE FROM workspaces WHERE id = $1', [ws])).catch(() => {});
  }
});
