/**
 * BUG-EVIDENCE harness for the 4 product-owner-found member-screen bugs.
 * Verification-only: this CHARACTERIZES current behavior (pre-fix). It prints
 * OBSERVED lines (not pass/fail) so the report can state the live state.
 *
 *   Bug 1: subject's own name is a clickable <a> in the nasab ribbon.
 *   Bug 2: clicking a relative in the sidebar does NOT change the person view.
 *   Bug 3: on the person view, the sidebar toggle still shows the person icon
 *          (currentMode hardcoded "tree") instead of the tree icon.
 *   Bug 4: the person page content does not scroll (clipped by main-content).
 *
 * Run: npx tsx --env-file=.env.local --env-file=.env scripts/e2e-person-bugs.ts
 */
import { chromium } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { getOrCreateWorkspaceKey } from '../src/lib/tree/encryption';

const BASE = 'http://localhost:4000';
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PASSWORD = 'Test1234!';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const uid = () => Math.random().toString(36).slice(2, 10);
const obs = (label: string, value: unknown) => console.log(`   OBSERVED  ${label}: ${JSON.stringify(value)}`);

async function main() {
  const stamp = uid(); const email = `e2e-bug-${stamp}@test.local`; const slug = `e2e-bug-${stamp}`;
  let userId = '', wsId = '';
  try {
    const cu = await fetch(`${SB}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) });
    userId = (await cu.json()).id;
    await prisma.user.create({ data: { id: userId, email, displayName: 'Bug' } });
    const ws = await prisma.workspace.create({ data: { slug, nameAr: `بيت العلل ${stamp}`, createdById: userId } });
    wsId = ws.id;
    await prisma.workspaceMembership.create({ data: { userId, workspaceId: ws.id, role: 'workspace_admin', permissions: [] } });
    await getOrCreateWorkspaceKey(ws.id);
    await prisma.familyTree.create({ data: { workspaceId: ws.id } });
    const tr = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
    const tk = (await tr.json()).access_token;
    const auth = { authorization: `Bearer ${tk}`, 'content-type': 'application/json' };
    const mk = async (b: Record<string, unknown>) => { const r = await fetch(`${BASE}/api/workspaces/${ws.id}/tree/individuals`, { method: 'POST', headers: auth, body: JSON.stringify(b) }); return (await r.json()).data?.id; };
    const mkFam = async (b: Record<string, unknown>) => { const r = await fetch(`${BASE}/api/workspaces/${ws.id}/tree/families`, { method: 'POST', headers: auth, body: JSON.stringify(b) }); return (await r.json()).data?.id; };
    const addChild = async (f: string, i: string) => { await fetch(`${BASE}/api/workspaces/${ws.id}/tree/families/${f}/children`, { method: 'POST', headers: auth, body: JSON.stringify({ individualId: i }) }); };
    const father = await mk({ givenName: 'الاب', surname: 'العلل', sex: 'M', isDeceased: true });
    // Long bio so the person page reliably overflows the viewport — needed for
    // the Bug 4 (no-scroll) characterization to fire on the pre-fix code.
    const longBio = 'هذه سيرة طويلة جدا مكررة لإطالة الصفحة حتى تتجاوز ارتفاع النافذة. '.repeat(40);
    const subject = await mk({ givenName: 'باسل', surname: 'العلل', sex: 'M', kunya: 'ابو عمر', isDeceased: true, birthNotes: longBio });
    const wife = await mk({ givenName: 'الزوجة', surname: 'اخرى', sex: 'F', isDeceased: true });
    const child = await mk({ givenName: 'عمر', surname: 'العلل', sex: 'M', isDeceased: true });
    const sibling = await mk({ givenName: 'محمود', surname: 'العلل', sex: 'M', isDeceased: true });
    const fF = await mkFam({ husbandId: father }); await addChild(fF, subject); await addChild(fF, sibling);
    const fS = await mkFam({ husbandId: subject, wifeId: wife }); await addChild(fS, child);

    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 1400, height: 700 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    // login
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', PASSWORD);
    await Promise.all([page.waitForURL(/\/workspaces/, { timeout: 20000 }).catch(() => {}), page.click('button[type="submit"]')]);
    await page.waitForTimeout(1500);

    // Go DIRECTLY to the person page for the subject.
    await page.goto(`${BASE}/workspaces/${slug}/tree/person/${subject}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/bug-person.png' });

    console.log('\n=== Bug 1: subject own name clickable in nasab ribbon ===');
    // The ribbon lead is the subject's given name ("باسل"). Inspect the ACTUAL
    // lead element (the element in the h1 whose text is the subject given name),
    // not just "the first <a>": pre-fix the lead is an <a> targeting its own
    // page (the bug); fixed it is a styled <span> with no href and no link in
    // the whole ribbon points at the subject.
    const leadIsLink = await page.evaluate((subjId) => {
      const h1 = document.querySelector('h1');
      if (!h1) return { found: false };
      const lead = Array.from(h1.querySelectorAll('span, a')).find((el) => el.textContent?.trim() === 'باسل') as HTMLElement | undefined;
      const selfLink = h1.querySelector(`a[href*="/person/${subjId}"]`) as HTMLAnchorElement | null;
      return {
        found: !!lead,
        leadTag: lead?.tagName ?? null,
        leadIsAnchor: lead?.tagName.toLowerCase() === 'a',
        anyRibbonLinkTargetsSelf: !!selfLink,
      };
    }, subject);
    obs('ribbon lead element', leadIsLink);
    obs('BUG1 present (subject lead is clickable / self-link)',
      !!((leadIsLink as { leadIsAnchor?: boolean }).leadIsAnchor || (leadIsLink as { anyRibbonLinkTargetsSelf?: boolean }).anyRibbonLinkTargetsSelf));
    obs('RESOLVED (subject lead is a non-clickable span, no self-link)',
      !!leadIsLink.found && !(leadIsLink as { leadIsAnchor?: boolean }).leadIsAnchor && !(leadIsLink as { anyRibbonLinkTargetsSelf?: boolean }).anyRibbonLinkTargetsSelf);

    console.log('\n=== Bug 3: toggle icon on the person view ===');
    // On the person view, the sidebar should offer "back to tree" (tree icon).
    // The sidebar ViewSwitcherIconButton hardcodes currentMode="tree", so it
    // renders the PERSON icon and links to the person route (a self-link), not
    // the tree route. Detect by the switcher's aria-label + href on this page.
    const sidebarSwitcher = await page.evaluate((subjId) => {
      const toPerson = document.querySelector('[aria-label="عرض صفحة الشخص"]');
      const toTree = document.querySelector('[aria-label="عرض في الشجرة"]');
      const el = (toPerson ?? toTree) as HTMLAnchorElement | null;
      return {
        sidebarTogglePresent: !!el,
        sidebarToggleLabel: el?.getAttribute('aria-label') ?? null,
        sidebarToggleHref: el?.getAttribute('href') ?? null,
        // BUG3: on the person page the sidebar switcher still says "go to person" (self) instead of "back to tree".
        stillSaysGoToPerson: el?.getAttribute('aria-label') === 'عرض صفحة الشخص',
        hrefIsSelfPersonRoute: (el?.getAttribute('href') ?? '').includes(`/tree/person/${subjId}`),
      };
    }, subject);
    obs('sidebar view-switcher on person page', sidebarSwitcher);
    obs('BUG3 present (sidebar toggle still points to person, not tree)', !!(sidebarSwitcher as { stillSaysGoToPerson?: boolean }).stillSaysGoToPerson);
    obs('RESOLVED (sidebar toggle flips to "back to tree" on the person view)',
      (sidebarSwitcher as { sidebarToggleLabel?: string }).sidebarToggleLabel === 'عرض في الشجرة');

    console.log('\n=== Bug 2: clicking a sidebar relative does not change the person view ===');
    const urlBefore = page.url();
    const subjectBefore = await page.evaluate(() => document.querySelector('h1')?.innerText ?? '');
    // The sidebar PersonDetail is showing the subject's relatives (it reads the
    // selected person from TreeContext). Click a relative by name in the sidebar.
    // We click the sibling "محمود" wherever it appears as a clickable rel item.
    const relClickable = page.locator('aside >> text=محمود').first();
    const relVisible = await relClickable.isVisible().catch(() => false);
    obs('sibling "محمود" clickable in sidebar', relVisible);
    if (relVisible) {
      await relClickable.click().catch(() => {});
      await page.waitForTimeout(2000);
      const urlAfter = page.url();
      const subjectAfter = await page.evaluate(() => document.querySelector('h1')?.innerText ?? '');
      await page.screenshot({ path: '/tmp/bug-after-relclick.png' });
      obs('URL changed after sidebar relative click', urlBefore !== urlAfter);
      obs('person-page subject (h1) changed after click', subjectBefore !== subjectAfter);
      obs('person page now shows the CLICKED relative "محمود" as subject', subjectAfter.includes('محمود'));
      obs('BUG2 present (person view did NOT navigate to the clicked relative)', urlBefore === urlAfter && !subjectAfter.includes('محمود'));
      obs('RESOLVED (clicking a sidebar relative navigates the person view to them)',
        urlBefore !== urlAfter && subjectAfter.includes('محمود'));
    } else {
      // Fall back: click anywhere a rel person token is.
      obs('BUG2 check skipped — could not locate the sidebar relative token', true);
    }

    console.log('\n=== Bug 4: person page does not scroll ===');
    // Shrink viewport already small (700h). Measure whether the person content
    // overflows its scroll container and whether that container can scroll.
    const scrollInfo = await page.evaluate(() => {
      // The person content lives inside <main class="main-content">.
      const main = document.querySelector('main.main-content') as HTMLElement | null;
      if (!main) return { found: false };
      const cs = getComputedStyle(main);
      // Find the tallest scrollable-candidate child (the person root).
      const child = main.querySelector(':scope > div') as HTMLElement | null;
      return {
        found: true,
        mainOverflowY: cs.overflowY,
        mainClientH: main.clientHeight,
        mainScrollH: main.scrollHeight,
        contentOverflows: main.scrollHeight > main.clientHeight + 4,
        childScrollH: child?.scrollHeight ?? null,
      };
    });
    obs('main-content scroll metrics', scrollInfo);
    const si = scrollInfo as { mainOverflowY?: string; contentOverflows?: boolean };
    // PRE-FIX bug signal: the person content overflowed `main-content` while it
    // was clipped (overflow:hidden) with NO inner scroll container of its own.
    obs('BUG4 present (content overflows but main-content overflow is hidden, no inner scroller)',
      !!si.contentOverflows && (si.mainOverflowY === 'hidden' || si.mainOverflowY === 'clip'));
    // Try to scroll the shell's main-content (should NOT move — by design it
    // stays a fixed viewport for the React-Flow canvas).
    const canScrollMain = await page.evaluate(() => {
      const main = document.querySelector('main.main-content') as HTMLElement | null;
      if (!main) return null;
      main.scrollTop = 9999; const moved = main.scrollTop > 0; main.scrollTop = 0; return moved;
    });
    obs('main-content itself scrolls (expected NO — fixed canvas viewport)', canScrollMain);

    // FIXED signal: the person page is now wrapped in its own `.scrollHost`
    // container (the person <main class*="root"> parent) which overflows AND
    // actually scrolls — top-to-bottom — without touching the canvas viewport.
    const hostScroll = await page.evaluate(() => {
      const personMain = Array.from(document.querySelectorAll('main')).find((m) => /root/.test(m.className));
      const host = personMain?.parentElement as HTMLElement | null;
      if (!host) return { found: false, overflowY: null as string | null, scrollH: 0, clientH: 0, moved: false };
      const cs = getComputedStyle(host);
      const isAuto = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
      const overflows = host.scrollHeight > host.clientHeight + 4;
      host.scrollTop = host.scrollHeight; const moved = host.scrollTop > 0; host.scrollTop = 0;
      return { found: true, overflowY: cs.overflowY, scrollH: host.scrollHeight, clientH: host.clientHeight, scrollable: isAuto && overflows, moved };
    });
    obs('person-page scrollHost container', hostScroll);
    obs('RESOLVED (person page scrolls in its own container, canvas untouched)',
      !!(hostScroll as { scrollable?: boolean }).scrollable && !!(hostScroll as { moved?: boolean }).moved && canScrollMain === false);

    await b.close();
  } catch (err) {
    console.error('\nbug harness threw:', err);
  } finally {
    if (wsId) await prisma.workspace.delete({ where: { id: wsId } }).catch(() => {});
    if (userId) { await prisma.user.delete({ where: { id: userId } }).catch(() => {}); await fetch(`${SB}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: { apikey: KEY, authorization: `Bearer ${KEY}` } }); }
    await prisma.$disconnect();
  }
}
main();
