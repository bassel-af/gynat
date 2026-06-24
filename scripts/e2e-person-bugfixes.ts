/**
 * Real-browser verification of the FOUR person-page member-screen bug fixes:
 *
 *  Bug 1 — the subject's own name is NOT a clickable link (lead is a <span>).
 *  Bug 2 — clicking a person in the sidebar navigates the person view to them.
 *  Bug 3 — on the person view the sidebar view-switcher flips to the TREE icon
 *          (so it can go back to the canvas).
 *  Bug 4 — the (tall) person page scrolls top-to-bottom inside the shell.
 *
 * Logs in through the real /auth/login, builds a tiny family, opens the person
 * view, and asserts each fix. Screenshots → /tmp. Cleans up the test user + ws.
 *
 * Run: npx tsx --env-file=.env.local --env-file=.env scripts/e2e-person-bugfixes.ts
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
  const email = `e2e-bf-${stamp}@test.local`;
  const slug = `e2e-bf-${stamp}`;
  let userId: string | null = null;
  let workspaceId: string | null = null;
  let subjectId = '';
  let childId = '';
  let failed = false;
  const checks: { label: string; ok: boolean }[] = [];
  const check = (label: string, ok: boolean) => { checks.push({ label, ok }); console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed = true; };

  try {
    userId = await createAuthUser(email);
    await prisma.user.create({ data: { id: userId, email, displayName: `Admin ${stamp}` } });
    const ws = await prisma.workspace.create({ data: { slug, nameAr: `بيت الإصلاح ${stamp}`, createdById: userId } });
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
    // Father → subject; subject + wife → child. Long bio so the page is tall.
    const father = await mk({ givenName: 'الجد', surname: 'الإصلاح', sex: 'M', isDeceased: true });
    const longBio = 'هذه سيرة طويلة جدا مكررة لإطالة الصفحة. '.repeat(40);
    const subject = await mk({ givenName: 'باسل', surname: 'الإصلاح', sex: 'M', kunya: 'ابو عمر', isDeceased: true, birthNotes: longBio });
    const wife = await mk({ givenName: 'الزوجة', surname: 'اخرى', sex: 'F' });
    const child = await mk({ givenName: 'عمر', surname: 'الإصلاح', sex: 'M', isDeceased: true });
    subjectId = subject; childId = child;
    const fF = await mkFam({ husbandId: father }); await addChild(fF, subject);
    const fS = await mkFam({ husbandId: subject, wifeId: wife }); await addChild(fS, child);

    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 760 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();

    // --- Log in ---
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', PASSWORD);
    await Promise.all([
      page.waitForURL(/\/workspaces/, { timeout: 20000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(1500);

    // --- Go straight to the subject's person page (deep link). ---
    await page.goto(`${BASE_URL}/workspaces/${slug}/tree/person/${subjectId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: '/tmp/bf-1-personview.png', fullPage: false });
    check('on the person route', /\/tree\/person\//.test(page.url()));

    // ---------- Bug 1: subject lead is NOT a link ----------
    // The hero h1 holds the ribbon. The subject given name is the lead; assert it
    // is not inside an <a>, and no link in the ribbon points at the subject's page.
    const leadIsLink = await page.evaluate((subjId) => {
      const h1 = document.querySelector('h1');
      if (!h1) return { found: false, isAnchor: false, selfHref: false };
      // the lead is the first name-bearing element in the ribbon
      const selfHref = !!h1.querySelector(`a[href*="/person/${subjId}"]`);
      // find the element whose text is the subject given name "باسل"
      const lead = Array.from(h1.querySelectorAll('span, a')).find((el) => el.textContent?.trim() === 'باسل');
      return { found: !!lead, isAnchor: lead?.tagName.toLowerCase() === 'a', selfHref };
    }, subjectId);
    check('Bug1: subject lead element found in the ribbon', leadIsLink.found);
    check('Bug1: subject lead is NOT an anchor', leadIsLink.found && !leadIsLink.isAnchor);
    check('Bug1: no ribbon link points at the subject\'s own page', !leadIsLink.selfHref);

    // ancestor (the father "الجد") IS still a link in the bloodline / ribbon
    const ancestorLink = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a')).find((el) => el.textContent?.includes('الجد'));
      return { present: !!a, href: a?.getAttribute('href') ?? '' };
    });
    check('Bug1: ancestor (الجد) stays clickable', ancestorLink.present && ancestorLink.href.includes('/person/'));

    // ---------- Bug 3: sidebar view-switcher shows the TREE (back) icon ----------
    // On the person view the sidebar PersonDetail switcher must offer "عرض في الشجرة"
    // and NOT "عرض صفحة الشخص".
    const toPersonInSidebar = await page.getByLabel('عرض صفحة الشخص').count();
    const toTreeLinks = await page.getByRole('link', { name: /عرض في الشجرة/ }).count();
    check('Bug3: sidebar does NOT show the "go to person" icon on the person view', toPersonInSidebar === 0);
    check('Bug3: a "back to tree" affordance is present on the person view', toTreeLinks >= 1);

    // ---------- Bug 4: the person page scrolls ----------
    // The person <main> (`.root`) is wrapped by the `.scrollHost` div. Find the
    // person main specifically (its className contains "root"), take its parent
    // (the scrollHost) and assert it is an overflowing, scrollable container.
    const scroll = await page.evaluate(() => {
      const personMain = Array.from(document.querySelectorAll('main')).find((m) => /root/.test(m.className));
      const host = personMain?.parentElement as HTMLElement | null;
      if (!host) return { scrollable: false, moved: false, scrollHeight: 0, clientHeight: 0 };
      const style = getComputedStyle(host);
      const overflows = host.scrollHeight > host.clientHeight + 4;
      const isAuto = style.overflowY === 'auto' || style.overflowY === 'scroll';
      const before = host.scrollTop;
      host.scrollTop = host.scrollHeight;
      const after = host.scrollTop;
      return { scrollable: isAuto && overflows, moved: after > before, scrollHeight: host.scrollHeight, clientHeight: host.clientHeight };
    });
    check(`Bug4: a scroll container wraps the person page (sh=${scroll.scrollHeight} ch=${scroll.clientHeight})`, scroll.scrollable);
    check('Bug4: the person page actually scrolls (scrollTop moved)', scroll.moved);
    await page.screenshot({ path: '/tmp/bf-2-scrolled-bottom.png', fullPage: false });
    await page.evaluate(() => {
      const personMain = Array.from(document.querySelectorAll('main')).find((m) => /root/.test(m.className));
      const host = personMain?.parentElement as HTMLElement | null;
      if (host) host.scrollTop = 0;
    });

    // ---------- Bug 2: clicking a person in the sidebar navigates the page ----------
    // The page synced selection, so the sidebar shows the subject's PersonDetail.
    // Click the child "عمر" in the "الأبناء" relationship list (a sidebar button)
    // and assert the URL changes to the child's person page.
    await page.waitForTimeout(800);
    const aside = page.locator('aside');
    const childBtn = aside.locator('button', { hasText: 'عمر' }).first();
    const childBtnVisible = await childBtn.isVisible().catch(() => false);
    check('Bug2: a clickable relationship (child عمر) is present in the sidebar', childBtnVisible);
    if (childBtnVisible) {
      await childBtn.click();
      await page.waitForURL((u) => u.pathname.includes(`/person/${childId}`), { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/tmp/bf-3-navigated-to-child.png', fullPage: false });
      check('Bug2: URL navigated to the clicked person (child)', page.url().includes(`/person/${childId}`));
      // After navigation, the child is the SUBJECT (lead, non-clickable) and the
      // former subject "باسل" is now a clickable ancestor link.
      const childIsSubject = await page.evaluate((parentId) => {
        const h1 = document.querySelector('h1');
        const lead = h1 && Array.from(h1.querySelectorAll('span, a')).find((el) => el.textContent?.trim() === 'عمر');
        const parentNowLink = !!Array.from(document.querySelectorAll('a')).find((a) => a.getAttribute('href')?.includes(`/person/${parentId}`));
        return { leadIsChild: !!lead && lead.tagName.toLowerCase() !== 'a', parentNowLink };
      }, subjectId);
      check('Bug2: the clicked person (عمر) is now the page subject (non-clickable lead)', childIsSubject.leadIsChild);
      check('Bug2: the former subject (باسل) is now a clickable ancestor link', childIsSubject.parentNowLink);
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
