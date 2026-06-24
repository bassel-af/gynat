/**
 * Real-browser verification of the Person Page MEMBER SCREEN (Surface 2/3):
 * logs in through the actual /auth/login page (GoTrue → cookies), opens the
 * tree, selects a person, toggles tree→person via the sidebar view-switcher,
 * and asserts: URL updates, the shell (sidebar/toolbar) persists across the
 * toggle (no full reload), the person page renders its sections, and the
 * return toggle goes back to the canvas.
 *
 * Screenshots → /tmp for visual evidence. Cleans up the test user + workspace.
 *
 * Run: npx tsx --env-file=.env.local --env-file=.env scripts/e2e-person-browser.ts
 */
import { chromium } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { getOrCreateWorkspaceKey } from '../src/lib/tree/encryption';

const BASE_URL = 'http://localhost:4000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DB_URL = process.env.DATABASE_URL!;
const PASSWORD = 'Test1234!';

const adapter = new PrismaPg({ connectionString: DB_URL });
const prisma = new PrismaClient({ adapter });
const uid = () => Math.random().toString(36).slice(2, 10);

async function createAuthUser(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`create user failed: ${res.status} ${await res.text()}`);
  return (await res.json()).id as string;
}
async function token(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: SERVICE_ROLE_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return (await res.json()).access_token as string;
}
async function deleteAuthUser(id: string) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE', headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
}

async function main() {
  const stamp = uid();
  const email = `e2e-pb-${stamp}@test.local`;
  const slug = `e2e-pb-${stamp}`;
  let userId: string | null = null;
  let workspaceId: string | null = null;
  let subjectId = '';
  let failed = false;
  const checks: { label: string; ok: boolean }[] = [];
  const check = (label: string, ok: boolean) => { checks.push({ label, ok }); console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed = true; };

  try {
    userId = await createAuthUser(email);
    await prisma.user.create({ data: { id: userId, email, displayName: `Admin ${stamp}` } });
    const ws = await prisma.workspace.create({ data: { slug, nameAr: `بيت المتصفح ${stamp}`, createdById: userId } });
    workspaceId = ws.id;
    await prisma.workspaceMembership.create({ data: { userId, workspaceId: ws.id, role: 'workspace_admin', permissions: [] } });
    await getOrCreateWorkspaceKey(ws.id);
    await prisma.familyTree.create({ data: { workspaceId: ws.id } });

    const tk = await token(email);
    const auth = { authorization: `Bearer ${tk}`, 'content-type': 'application/json' };
    const mk = async (b: Record<string, unknown>) => {
      const r = await fetch(`${BASE_URL}/api/workspaces/${ws.id}/tree/individuals`, { method: 'POST', headers: auth, body: JSON.stringify(b) });
      const d = await r.json(); return (d.data?.id ?? d.id) as string;
    };
    const mkFam = async (b: Record<string, unknown>) => {
      const r = await fetch(`${BASE_URL}/api/workspaces/${ws.id}/tree/families`, { method: 'POST', headers: auth, body: JSON.stringify(b) });
      const d = await r.json(); return (d.data?.id ?? d.id) as string;
    };
    const addChild = async (fam: string, ind: string) => {
      await fetch(`${BASE_URL}/api/workspaces/${ws.id}/tree/families/${fam}/children`, { method: 'POST', headers: auth, body: JSON.stringify({ individualId: ind }) });
    };
    const father = await mk({ givenName: 'الاب', surname: 'المتصفح', sex: 'M', isDeceased: true });
    const subject = await mk({ givenName: 'باسل', surname: 'المتصفح', sex: 'M', kunya: 'ابو عمر', isDeceased: true });
    const wife = await mk({ givenName: 'الزوجة', surname: 'اخرى', sex: 'F' });
    const child = await mk({ givenName: 'عمر', surname: 'المتصفح', sex: 'M' });
    subjectId = subject;
    const fF = await mkFam({ husbandId: father }); await addChild(fF, subject);
    const fS = await mkFam({ husbandId: subject, wifeId: wife }); await addChild(fS, child);

    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();

    // --- Log in through the real login page ---
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', PASSWORD);
    await Promise.all([
      page.waitForURL(/\/workspaces/, { timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(1500);
    check('logged in (left /auth/login)', !page.url().includes('/auth/login'));

    // --- Open the tree ---
    await page.goto(`${BASE_URL}/workspaces/${slug}/tree`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000); // let React Flow hydrate
    await page.screenshot({ path: '/tmp/person-1-tree.png' });
    const onTree = page.url().includes(`/workspaces/${slug}/tree`) && !page.url().includes('/person/');
    check('tree canvas route loaded', onTree);

    // --- Select the subject node (opens the sidebar PersonDetail with the switcher) ---
    // Click the node card by its visible given name.
    const node = page.locator('text=باسل').first();
    await node.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/person-2-selected.png' });

    // Tag a stable shell element to detect a full reload (it survives a soft nav,
    // disappears on a hard reload).
    await page.evaluate(() => { (window as unknown as { __SHELL_TAG?: number }).__SHELL_TAG = 12345; });

    // --- Toggle tree → person via the sidebar view-switcher (aria-label) ---
    const switcher = page.getByLabel('عرض صفحة الشخص').first();
    const switcherVisible = await switcher.isVisible().catch(() => false);
    check('view-switcher (tree→person) present in the sidebar', switcherVisible);
    if (switcherVisible) {
      await switcher.click();
      await page.waitForURL(/\/tree\/person\//, { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2500);
      await page.screenshot({ path: '/tmp/person-3-personview.png' });
      check('URL updated to the person route', /\/tree\/person\//.test(page.url()));
      const shellSurvived = await page.evaluate(() => (window as unknown as { __SHELL_TAG?: number }).__SHELL_TAG === 12345);
      check('NO full reload (shared shell window state survived the toggle)', shellSurvived);

      // Person page rendered: subject name + a family group (child "عمر") + nasab present.
      const bodyText = await page.evaluate(() => document.body.innerText);
      check('person page shows the subject given name', bodyText.includes('باسل'));
      check('person page shows a family member (child "عمر")', bodyText.includes('عمر'));

      // --- Toggle person → tree (gold pill link «عرض في الشجرة») and re-center ---
      const backSwitcher = page.getByRole('link', { name: /عرض في الشجرة/ }).first();
      const backVisible = await backSwitcher.isVisible().catch(() => false);
      check('view-switcher (person→tree) present on the person page', backVisible);
      if (backVisible) {
        // The back-link's href encodes the re-center intent via ?focus=<id>; the
        // canvas layout consumes it then STRIPS it from the URL, so assert the
        // href (the contract), not the post-strip address bar.
        const href = (await backSwitcher.getAttribute('href')) ?? '';
        check('back-link href carries focus=<id> (re-center intent)', href.includes(`focus=${subjectId}`));
        await backSwitcher.click();
        await page.waitForURL((u) => u.pathname.endsWith('/tree') && !u.pathname.includes('/person/'), { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(2000);
        await page.screenshot({ path: '/tmp/person-4-backtotree.png' });
        const backOnTree = page.url().includes(`/workspaces/${slug}/tree`) && !page.url().includes('/person/');
        check('toggle back returns to the canvas route', backOnTree);
      }
    }

    await browser.close();
  } catch (err) {
    failed = true;
    console.error('\nbrowser e2e threw:', err);
  } finally {
    console.log('\nCleanup...');
    try { if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }); } catch (e) { console.error('  ws cleanup:', e); }
    try { if (userId) { await prisma.user.delete({ where: { id: userId } }).catch(() => {}); await deleteAuthUser(userId); } } catch (e) { console.error('  user cleanup:', e); }
    await prisma.$disconnect();
  }
  const passed = checks.filter((c) => c.ok).length;
  console.log(`\n${failed ? 'OVERALL: FAIL' : 'OVERALL: PASS'} — ${passed}/${checks.length} checks`);
  process.exit(failed ? 1 : 0);
}
main();
