/**
 * Visual e2e: a man married to two sisters renders as a SINGLE husband node
 * with the sisters as spouse-cards on his node, mirroring non-sister polygamy.
 *
 * Builds the fixture via the workspace tree API (so we go through Zod
 * validation + audit log + encryption like a real edit), opens the tree, then
 * asserts on React Flow's DOM.
 *
 * Requires the dev stack to be up (docker compose + next dev on :4000).
 */

import { test, expect, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:8000';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:gynat-dev-pg-2026@localhost:5432/gynat';

if (!SERVICE_ROLE) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY missing — load .env.local before running Playwright',
  );
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
  if (!res.ok) {
    throw new Error(`createGotrueUser failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { id: string };
  return { email, gotrueId: json.id };
}

async function getAccessToken(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE! },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`getAccessToken failed: ${res.status} ${await res.text()}`);
  }
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

type Authed = (path: string, body?: unknown) => Promise<{ status: number; data: any }>;

function makeAuthedClient(request: APIRequestContext, token: string): Authed {
  return async (urlPath, body) => {
    const opts: Parameters<APIRequestContext['post']>[1] = {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    };
    if (body !== undefined) opts.data = body as object;
    const resp = await request.post(urlPath, opts);
    let data: any = null;
    try { data = await resp.json(); } catch { /* empty body */ }
    return { status: resp.status(), data };
  };
}

let user: TestUser;
let token: string;
let workspaceId: string;
let slug: string;
const ids: Record<string, string> = {};

test.beforeAll(async ({ browser, request }) => {
  const suffix = randomUUID().slice(0, 8);
  user = await createGotrueUser(`pw-sw-${suffix}@test.gynat.local`);

  // First login mirrors the user into public.users via /api/auth/sync-user.
  const ctx = await browser.newContext();
  await loginViaUI(ctx, user.email);
  await ctx.close();

  token = await getAccessToken(user.email);
  const post = makeAuthedClient(request, token);

  // Create a fresh workspace.
  slug = `sw-${suffix}`;
  const wsResp = await post('/api/workspaces', {
    slug,
    nameAr: `سيستر-وايفز ${suffix}`,
    description: 'sister-wives e2e fixture',
  });
  if (wsResp.status !== 201) {
    throw new Error(`workspace create failed: ${wsResp.status} ${JSON.stringify(wsResp.data)}`);
  }
  workspaceId = wsResp.data.data.id;

  // ---- Build the fixture via the tree API ----
  const indi = async (fields: Record<string, unknown>) => {
    const r = await post(`/api/workspaces/${workspaceId}/tree/individuals`, fields);
    if (r.status !== 201) throw new Error(`individual create failed: ${r.status} ${JSON.stringify(r.data)}`);
    return r.data.data.id as string;
  };
  const fam = async (body: Record<string, unknown>) => {
    const r = await post(`/api/workspaces/${workspaceId}/tree/families`, body);
    if (r.status !== 201) throw new Error(`family create failed: ${r.status} ${JSON.stringify(r.data)}`);
    return r.data.data.id as string;
  };
  const addChild = async (familyId: string, individualId: string) => {
    const r = await post(`/api/workspaces/${workspaceId}/tree/families/${familyId}/children`, { individualId });
    if (r.status !== 201 && r.status !== 200) {
      throw new Error(`addChild failed: ${r.status} ${JSON.stringify(r.data)}`);
    }
  };

  ids.father = await indi({ givenName: 'أب-الزوجتين', sex: 'M', birthDate: '1920' });
  ids.mother = await indi({ givenName: 'أم-الزوجتين', sex: 'F', birthDate: '1925' });
  ids.brotherEldest = await indi({ givenName: 'الأخ-الأكبر', sex: 'M', birthDate: '1945' });
  ids.sister1 = await indi({ givenName: 'الأخت-الأولى', sex: 'F', birthDate: '1950' });
  ids.sister2 = await indi({ givenName: 'الأخت-الثانية', sex: 'F', birthDate: '1955' });
  ids.brotherYoungest = await indi({ givenName: 'الأخ-الأصغر', sex: 'M', birthDate: '1960' });
  ids.husband = await indi({ givenName: 'الزوج-المشترك', sex: 'M', birthDate: '1948' });
  ids.child1 = await indi({ givenName: 'ابن-الأولى', sex: 'M', birthDate: '1972' });
  ids.child2 = await indi({ givenName: 'بنت-الثانية', sex: 'F', birthDate: '1978' });

  ids.famParent = await fam({ husbandId: ids.father, wifeId: ids.mother });
  await addChild(ids.famParent, ids.brotherEldest);
  await addChild(ids.famParent, ids.sister1);
  await addChild(ids.famParent, ids.sister2);
  await addChild(ids.famParent, ids.brotherYoungest);

  ids.famHS1 = await fam({ husbandId: ids.husband, wifeId: ids.sister1 });
  await addChild(ids.famHS1, ids.child1);

  ids.famHS2 = await fam({ husbandId: ids.husband, wifeId: ids.sister2 });
  await addChild(ids.famHS2, ids.child2);
});

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

test.afterAll(async () => {
  // Best-effort cleanup. The Workspace cascade chain (Workspace → FamilyTree
  // → Individual / Family / FamilyChild / TreeEditLog) is wired in the
  // Prisma schema, so deleting the workspace row is enough.
  if (workspaceId) {
    await withPg((c) => c.query('DELETE FROM workspaces WHERE id = $1', [workspaceId])).catch(() => {});
  }
  if (user) {
    await withPg((c) => c.query('DELETE FROM users WHERE id = $1', [user.gotrueId])).catch(() => {});
    await deleteGotrueUser(user.gotrueId);
  }
});

test('sister-wives husband renders as single node with sisters as spouse-cards', async ({ browser }) => {
  const ctx = await browser.newContext();
  await loginViaUI(ctx, user.email);
  const page = await ctx.newPage();

  await page.goto(`/workspaces/${slug}/tree`);

  // Wait for React Flow nodes to appear. The husband node id IS the
  // husband's individual id (mainNode.id === person.id in buildTreeData).
  const husbandNode = page.locator(`.react-flow__node[data-id="${ids.husband}"]`);
  await expect(husbandNode).toBeVisible({ timeout: 20_000 });

  // The sisters must NOT exist as their own React Flow nodes — they are
  // rendered as spouse-cards INSIDE the husband's node.
  await expect(page.locator(`.react-flow__node[data-id="${ids.sister1}"]`)).toHaveCount(0);
  await expect(page.locator(`.react-flow__node[data-id="${ids.sister2}"]`)).toHaveCount(0);

  // Sister names must be present inside the husband's node DOM.
  const husbandText = (await husbandNode.innerText()).replace(/\s+/g, ' ');
  expect(husbandText).toContain('الأخت-الأولى');
  expect(husbandText).toContain('الأخت-الثانية');
  expect(husbandText).toContain('الزوج-المشترك');

  // Parent edges from F's parent FAM (or F directly) to H must terminate on
  // spouse-target handles. The edge id pattern is:
  //   `${parentSourceId}-${husbandId}-via-${sisterId}`
  // where parentSourceId is the parent FAM id (when both parents exist).
  const sister1ParentEdge = page.locator(
    `.react-flow__edge[data-id$="-${ids.husband}-via-${ids.sister1}"]`,
  );
  const sister2ParentEdge = page.locator(
    `.react-flow__edge[data-id$="-${ids.husband}-via-${ids.sister2}"]`,
  );
  await expect(sister1ParentEdge).toHaveCount(1);
  await expect(sister2ParentEdge).toHaveCount(1);

  // Husband-to-children edges (H is the family.husbandId, so children edges
  // run from his node to the kids).
  await expect(page.locator(`.react-flow__node[data-id="${ids.child1}"]`)).toBeVisible();
  await expect(page.locator(`.react-flow__node[data-id="${ids.child2}"]`)).toBeVisible();

  // Other parent FAM siblings (the brothers) DO render as their own nodes —
  // sanity check that the cluster pattern only swallows the sister-wives.
  await expect(page.locator(`.react-flow__node[data-id="${ids.brotherEldest}"]`)).toBeVisible();
  await expect(page.locator(`.react-flow__node[data-id="${ids.brotherYoungest}"]`)).toBeVisible();

  // Save a screenshot for visual review.
  const shotDir = path.resolve(__dirname, 'screenshots');
  await fs.mkdir(shotDir, { recursive: true });
  const shotPath = path.join(shotDir, 'sister-wives-A2.png');
  const viewport = page.locator('.react-flow__viewport').first();
  await viewport.screenshot({ path: shotPath });

  await ctx.close();
});
