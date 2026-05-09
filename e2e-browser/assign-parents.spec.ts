/**
 * Visual e2e for the generalized "تعيين والدين موجودين / تغيير الوالدين" flow.
 *
 * Covers two new scenarios that didn't work before:
 *   1. ASSIGN: a parentless person can be linked to an existing couple as their child.
 *   2. ORPHAN AUTO-DELETE: when a child is moved out of a single-parent family whose
 *      only remaining parent has no other connections, that parent is auto-deleted.
 *
 * Each test owns its own workspace + fixture so the person under test is the default
 * root of the tree (the one with the most descendants).
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

type ApiClient = {
  post: (path: string, body?: unknown) => Promise<{ status: number; data: any }>;
  get: (path: string) => Promise<{ status: number; data: any }>;
};

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
    async get(urlPath) {
      const res = await fetch(base + urlPath, {
        headers: { Authorization: `Bearer ${token}` },
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

let user: TestUser;
let token: string;

test.beforeAll(async ({ browser }) => {
  const suffix = randomUUID().slice(0, 8);
  user = await createGotrueUser(`pw-ap-${suffix}@test.gynat.local`);

  // First login mirrors the user into public.users via /api/auth/sync-user.
  const ctx = await browser.newContext();
  await loginViaUI(ctx, user.email);
  await ctx.close();

  token = await getAccessToken(user.email);
});

test.afterAll(async () => {
  if (user) {
    await withPg((c) => c.query('DELETE FROM users WHERE id = $1', [user.gotrueId])).catch(() => {});
    await deleteGotrueUser(user.gotrueId);
  }
});

async function buildIndividual(api: ApiClient, workspaceId: string, fields: Record<string, unknown>): Promise<string> {
  const r = await api.post(`/api/workspaces/${workspaceId}/tree/individuals`, fields);
  if (r.status !== 201) throw new Error(`individual create failed: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.data.id as string;
}

async function buildFamily(api: ApiClient, workspaceId: string, body: Record<string, unknown>): Promise<string> {
  const r = await api.post(`/api/workspaces/${workspaceId}/tree/families`, body);
  if (r.status !== 201) throw new Error(`family create failed: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.data.id as string;
}

async function addChildToFamily(api: ApiClient, workspaceId: string, familyId: string, individualId: string): Promise<void> {
  const r = await api.post(`/api/workspaces/${workspaceId}/tree/families/${familyId}/children`, { individualId });
  if (r.status !== 201 && r.status !== 200) {
    throw new Error(`addChild failed: ${r.status} ${JSON.stringify(r.data)}`);
  }
}

async function createWorkspace(api: ApiClient, slug: string): Promise<string> {
  const r = await api.post('/api/workspaces', {
    slug,
    nameAr: `تعيين-الوالدين ${slug}`,
    description: 'assign-parents e2e fixture',
  });
  if (r.status !== 201) throw new Error(`workspace create failed: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.data.id as string;
}

async function deleteWorkspace(workspaceId: string): Promise<void> {
  await withPg((c) => c.query('DELETE FROM workspaces WHERE id = $1', [workspaceId])).catch(() => {});
}

test('assigns existing parents to a parentless person via the picker modal', async ({ browser }) => {
  const api = makeApiClient(token);
  const slug = `apa-${randomUUID().slice(0, 8)}`;
  const workspaceId = await createWorkspace(api, slug);

  try {
    // Fixture: parentlessHusband is the default root because he has the most descendants.
    // The candidate couple is also a "root" (no parents) but has zero descendants.
    const candidateFather = await buildIndividual(api, workspaceId, { givenName: 'الأب-المرشّح', sex: 'M', birthDate: '1900' });
    const candidateMother = await buildIndividual(api, workspaceId, { givenName: 'الأم-المرشّحة', sex: 'F', birthDate: '1905' });
    const candidateCouple = await buildFamily(api, workspaceId, { husbandId: candidateFather, wifeId: candidateMother });

    const parentlessHusband = await buildIndividual(api, workspaceId, { givenName: 'الزوج-بلا-والدين', sex: 'M', birthDate: '1930' });
    const wife = await buildIndividual(api, workspaceId, { givenName: 'الزوجة', sex: 'F', birthDate: '1935' });
    const husbandWifeFam = await buildFamily(api, workspaceId, { husbandId: parentlessHusband, wifeId: wife });
    // Give them descendants so this couple wins as the default root.
    const son = await buildIndividual(api, workspaceId, { givenName: 'الابن', sex: 'M', birthDate: '1960' });
    const daughter = await buildIndividual(api, workspaceId, { givenName: 'البنت', sex: 'F', birthDate: '1962' });
    await addChildToFamily(api, workspaceId, husbandWifeFam, son);
    await addChildToFamily(api, workspaceId, husbandWifeFam, daughter);

    const ctx = await browser.newContext();
    await loginViaUI(ctx, user.email);
    const page = await ctx.newPage();

    await page.goto(`/workspaces/${slug}/tree`);
    await page.locator(`.react-flow__node[data-id="${parentlessHusband}"]`).waitFor({ timeout: 20_000 });
    await page.locator(`.react-flow__node[data-id="${parentlessHusband}"]`).click();

    // The action button should read "تعيين والدين موجودين" because he has no familyAsChild.
    const assignBtn = page.getByRole('button', { name: 'تعيين والدين موجودين' });
    await expect(assignBtn).toBeVisible({ timeout: 10_000 });
    await assignBtn.click();

    // Picker title.
    await expect(page.getByRole('heading', { name: 'تعيين والدين موجودين' })).toBeVisible();

    const candidateRow = page.locator('label', { hasText: 'الأب-المرشّح' });
    await candidateRow.click();
    await page.getByRole('button', { name: 'التالي' }).click();

    // Confirm step should mention the new parents in the detail row (exact match
    // distinguishes the row from the sentence that embeds the same names).
    await expect(page.getByText('الأب-المرشّح + الأم-المرشّحة', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'تأكيد' }).click();

    await expect(page.getByRole('heading', { name: 'تأكيد تعيين الوالدين' })).toHaveCount(0, { timeout: 10_000 });
    await ctx.close();

    // Verify via the API that the husband is now a child of the candidate couple.
    const tree = await api.get(`/api/workspaces/${workspaceId}/tree`);
    expect(tree.status).toBe(200);
    const husbandRecord = tree.data.data.individuals[parentlessHusband];
    expect(husbandRecord.familyAsChild).toBe(candidateCouple);
    expect(tree.data.data.families[candidateCouple].children).toContain(parentlessHusband);
  } finally {
    await deleteWorkspace(workspaceId);
  }
});

test('moving a child away auto-deletes a previous parent who is fully disconnected', async ({ browser }) => {
  const api = makeApiClient(token);
  const slug = `apo-${randomUUID().slice(0, 8)}`;
  const workspaceId = await createWorkspace(api, slug);

  try {
    // Fixture: lonelyParent is the default root (most descendants: 1).
    const lonelyParent = await buildIndividual(api, workspaceId, { givenName: 'الأب-الوحيد', sex: 'M', birthDate: '1910' });
    const lonelyFam = await buildFamily(api, workspaceId, { husbandId: lonelyParent });
    const movedChild = await buildIndividual(api, workspaceId, { givenName: 'الابن-المنقول', sex: 'M', birthDate: '1940' });
    await addChildToFamily(api, workspaceId, lonelyFam, movedChild);

    const newFather = await buildIndividual(api, workspaceId, { givenName: 'الأب-البديل', sex: 'M', birthDate: '1908' });
    const newMother = await buildIndividual(api, workspaceId, { givenName: 'الأم-البديلة', sex: 'F', birthDate: '1912' });
    const newCouple = await buildFamily(api, workspaceId, { husbandId: newFather, wifeId: newMother });

    const ctx = await browser.newContext();
    await loginViaUI(ctx, user.email);
    const page = await ctx.newPage();

    await page.goto(`/workspaces/${slug}/tree`);
    await page.locator(`.react-flow__node[data-id="${movedChild}"]`).waitFor({ timeout: 20_000 });
    await page.locator(`.react-flow__node[data-id="${movedChild}"]`).click();

    const changeBtn = page.getByRole('button', { name: 'تغيير الوالدين' });
    await expect(changeBtn).toBeVisible({ timeout: 10_000 });
    await changeBtn.click();

    const newCoupleRow = page.locator('label', { hasText: 'الأب-البديل' });
    await newCoupleRow.click();
    await page.getByRole('button', { name: 'التالي' }).click();

    // Orphan warning should appear with the lonely parent's name.
    await expect(page.getByText(/سيتم حذف.*الأب-الوحيد/)).toBeVisible();
    await page.getByRole('button', { name: 'تأكيد' }).click();

    await expect(page.getByRole('heading', { name: 'تأكيد تغيير الوالدين' })).toHaveCount(0, { timeout: 10_000 });
    await ctx.close();

    // Verify via API: the lonely parent is gone, the moved child is now under the new couple.
    const tree = await api.get(`/api/workspaces/${workspaceId}/tree`);
    expect(tree.status).toBe(200);
    expect(tree.data.data.individuals[lonelyParent]).toBeUndefined();
    const movedRecord = tree.data.data.individuals[movedChild];
    expect(movedRecord.familyAsChild).toBe(newCouple);
    expect(tree.data.data.families[newCouple].children).toContain(movedChild);
  } finally {
    await deleteWorkspace(workspaceId);
  }
});

test('assigns a free-floating individual as a single parent (creates new FAM on the fly)', async ({ browser }) => {
  const api = makeApiClient(token);
  const slug = `aps-${randomUUID().slice(0, 8)}`;
  const workspaceId = await createWorkspace(api, slug);

  try {
    // Fixture: parentlessSon is the default root (he has descendants).
    // هالة exists as an individual but is not in any FAM. Picking her must
    // create a new WIFE-only FAM and link the son as her child.
    const parentlessSon = await buildIndividual(api, workspaceId, { givenName: 'أبو-العاص', sex: 'M', birthDate: '1900' });
    const wife = await buildIndividual(api, workspaceId, { givenName: 'الزوجة', sex: 'F', birthDate: '1905' });
    const sonsFam = await buildFamily(api, workspaceId, { husbandId: parentlessSon, wifeId: wife });
    const grandchild = await buildIndividual(api, workspaceId, { givenName: 'الحفيد', sex: 'M', birthDate: '1930' });
    await addChildToFamily(api, workspaceId, sonsFam, grandchild);

    // هالة has a known father (وهب) but no marriage of her own — she's still a "solo"
    // candidate (no FAMS), and her row should disambiguate as "هالة بنت وهب" via nasab.
    const halaFather = await buildIndividual(api, workspaceId, { givenName: 'وهب', sex: 'M', birthDate: '1850' });
    const halaParentFam = await buildFamily(api, workspaceId, { husbandId: halaFather });
    const halaId = await buildIndividual(api, workspaceId, { givenName: 'هالة', sex: 'F', birthDate: '1875' });
    await addChildToFamily(api, workspaceId, halaParentFam, halaId);

    const ctx = await browser.newContext();
    await loginViaUI(ctx, user.email);
    const page = await ctx.newPage();

    await page.goto(`/workspaces/${slug}/tree`);
    await page.locator(`.react-flow__node[data-id="${parentlessSon}"]`).waitFor({ timeout: 20_000 });
    await page.locator(`.react-flow__node[data-id="${parentlessSon}"]`).click();

    const assignBtn = page.getByRole('button', { name: 'تعيين والدين موجودين' });
    await expect(assignBtn).toBeVisible({ timeout: 10_000 });
    await assignBtn.click();

    // The merged list must show هالة with her nasab ("هالة بنت وهب") and the badge.
    const halaRow = page.locator('label', { hasText: 'هالة بنت وهب' });
    await expect(halaRow).toBeVisible();
    await expect(halaRow.getByText('عائلة جديدة')).toBeVisible();
    await halaRow.click();
    await page.getByRole('button', { name: 'التالي' }).click();

    // Confirm step: detail row should annotate that a new FAM is created.
    await expect(page.getByText('هالة بنت وهب (عائلة جديدة)')).toBeVisible();
    await page.getByRole('button', { name: 'تأكيد' }).click();

    await expect(page.getByRole('heading', { name: 'تأكيد تعيين الوالدين' })).toHaveCount(0, { timeout: 10_000 });
    await ctx.close();

    // Verify via API: a brand-new FAM exists with هالة as wife and the son as a child.
    const tree = await api.get(`/api/workspaces/${workspaceId}/tree`);
    expect(tree.status).toBe(200);
    const sonRecord = tree.data.data.individuals[parentlessSon];
    expect(sonRecord.familyAsChild).toBeTruthy();
    const newFam = tree.data.data.families[sonRecord.familyAsChild];
    expect(newFam).toBeTruthy();
    expect(newFam.wife).toBe(halaId);
    expect(newFam.husband).toBeNull();
    expect(newFam.children).toContain(parentlessSon);
  } finally {
    await deleteWorkspace(workspaceId);
  }
});
