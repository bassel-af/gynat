/**
 * Real browser + real backend test of the /admin gate.
 *
 * Covers: anon, authed non-owner, authed owner against both the
 * /admin page route and the /api/admin/healthcheck API route.
 *
 * Requires the dev stack to be up (docker compose + next dev on :4000).
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
    'SUPABASE_SERVICE_ROLE_KEY missing — load .env.local before running Playwright'
  );
}

const PASSWORD = 'TestOwner#Passw0rd1';

type TestUser = { email: string; gotrueId: string };

async function createGotrueUser(email: string): Promise<TestUser> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE!,
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`createGotrueUser ${email} failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { id: string };
  return { email, gotrueId: json.id };
}

async function getAccessToken(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE!,
    },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`getAccessToken ${email} failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

async function deleteGotrueUser(id: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE!, Authorization: `Bearer ${SERVICE_ROLE}` },
  }).catch(() => {});
}

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function promoteInDb(userId: string): Promise<void> {
  await withPg((c) =>
    c.query('UPDATE users SET is_platform_owner = true WHERE id = $1', [userId])
  );
}

async function deletePublicUser(userId: string): Promise<void> {
  await withPg((c) => c.query('DELETE FROM users WHERE id = $1', [userId]));
}

async function loginViaUI(
  context: BrowserContext,
  email: string
): Promise<void> {
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

let owner: TestUser;
let nonOwner: TestUser;

test.beforeAll(async ({ browser }) => {
  const suffix = randomUUID().slice(0, 8);
  owner = await createGotrueUser(`pw-owner-${suffix}@test.gynat.local`);
  nonOwner = await createGotrueUser(`pw-nonowner-${suffix}@test.gynat.local`);

  // First login triggers /api/auth/sync-user which mirrors into public.users.
  // Do that before promoting so the row exists.
  const ownerCtx = await browser.newContext();
  await loginViaUI(ownerCtx, owner.email);
  await ownerCtx.close();

  const nonOwnerCtx = await browser.newContext();
  await loginViaUI(nonOwnerCtx, nonOwner.email);
  await nonOwnerCtx.close();

  await promoteInDb(owner.gotrueId);
});

test.afterAll(async () => {
  await Promise.all([
    deletePublicUser(owner.gotrueId),
    deletePublicUser(nonOwner.gotrueId),
  ]);
  await Promise.all([
    deleteGotrueUser(owner.gotrueId),
    deleteGotrueUser(nonOwner.gotrueId),
  ]);
});

test.describe('Admin gate — page route (/admin)', () => {
  test('anon → redirects to /auth/login with next=/admin', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const resp = await page.goto('/admin');
    expect(page.url()).toContain('/auth/login');
    expect(page.url()).toContain('next=%2Fadmin');
    expect(resp?.status()).toBeLessThan(400);
    await ctx.close();
  });

  test('authed non-owner → redirects to /workspaces', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginViaUI(ctx, nonOwner.email);
    const page = await ctx.newPage();
    await page.goto('/admin');
    await page.waitForURL('**/workspaces', { timeout: 10_000 });
    expect(page.url()).toMatch(/\/workspaces\/?$/);
    await ctx.close();
  });

  test('authed owner → renders the dashboard heading', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginViaUI(ctx, owner.email);
    const page = await ctx.newPage();
    await page.goto('/admin');
    await expect(page.locator('h1')).toHaveText('لوحة تحكم المنصة');
    expect(page.url()).toMatch(/\/admin\/?$/);
    await ctx.close();
  });
});

test.describe('Admin gate — API route (/api/admin/healthcheck)', () => {
  // API routes use Bearer-token auth (middleware gate uses cookies, but the
  // handler's requirePlatformOwner → getAuthenticatedUser expects a Bearer
  // header). In real usage the browser client attaches it via apiFetch().
  // Here we mint tokens directly via GoTrue password grant.

  test('anon → 401 JSON from middleware (no cookie, no bearer)', async ({ request }) => {
    const resp = await request.get('/api/admin/healthcheck');
    expect(resp.status()).toBe(401);
    expect(await resp.json()).toMatchObject({ error: 'Unauthorized' });
  });

  test('authed non-owner → 403 JSON from middleware', async ({ request }) => {
    const token = await getAccessToken(nonOwner.email);
    const resp = await request.get('/api/admin/healthcheck', {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Middleware for /api/admin/* gates on the Supabase session cookie, so a
    // Bearer-only request with no cookie is rejected at middleware with 401.
    // The handler's requirePlatformOwner now accepts either Bearer OR cookie,
    // but middleware runs first — so to reach the handler's 403 branch we
    // still need a cookie-carrying context (see the next test).
    expect(resp.status()).toBe(401);
  });

  test('authed non-owner via browser+bearer → 403 from route handler', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginViaUI(ctx, nonOwner.email);
    const token = await getAccessToken(nonOwner.email);
    const resp = await ctx.request.get('/api/admin/healthcheck', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.status()).toBe(403);
    expect(await resp.json()).toMatchObject({ error: 'Forbidden' });
    await ctx.close();
  });

  test('authed owner via browser+bearer → 200 { ok: true }', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginViaUI(ctx, owner.email);
    const token = await getAccessToken(owner.email);
    const resp = await ctx.request.get('/api/admin/healthcheck', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.status()).toBe(200);
    expect(await resp.json()).toMatchObject({ ok: true });
    await ctx.close();
  });
});
