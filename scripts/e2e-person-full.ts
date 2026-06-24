/**
 * COMPREHENSIVE e2e verification for the Person Page — member + public surfaces.
 * (Verification scratch harness — not part of the shipped feature.)
 *
 * Builds a richer real family through the LIVE tree API, then exercises both
 * the member endpoint and the SSR public person page through the running app.
 *
 * Run with env preloaded so module-load encryption init succeeds:
 *   npx tsx --env-file=.env.local --env-file=.env scripts/e2e-person-full.ts
 *
 * Requires: dev server on localhost:4000, Docker Supabase stack up.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { getOrCreateWorkspaceKey } from '../src/lib/tree/encryption';

const BASE_URL = 'http://localhost:4000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DB_URL = process.env.DATABASE_URL!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !DB_URL) {
  console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: DB_URL });
const prisma = new PrismaClient({ adapter });

async function createAuthUser(email: string): Promise<{ id: string; token: string }> {
  const resCreate = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'Test1234!', email_confirm: true }),
  });
  if (!resCreate.ok) throw new Error(`admin create user failed: ${resCreate.status} ${await resCreate.text()}`);
  const created = await resCreate.json();
  const resToken = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'Test1234!' }),
  });
  if (!resToken.ok) throw new Error(`token fetch failed: ${resToken.status} ${await resToken.text()}`);
  const token = await resToken.json();
  return { id: created.id as string, token: token.access_token as string };
}

async function deleteAuthUser(userId: string) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
}

const uid = () => Math.random().toString(36).slice(2, 10);

/** Count occurrences of a JSON key anywhere in a parsed structure. */
function countKeyDeep(node: unknown, key: string): number {
  if (Array.isArray(node)) return node.reduce<number>((n, x) => n + countKeyDeep(x, key), 0);
  if (node && typeof node === 'object') {
    let n = 0;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === key) n += 1;
      n += countKeyDeep(v, key);
    }
    return n;
  }
  return 0;
}

/** Extract every JSON-LD script block from served HTML. */
function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try { out.push(JSON.parse(m[1])); } catch { /* ignore */ }
  }
  return out;
}

/** The schema.org Person graph (the one with a `@id` = canonical url), if any. */
function findPersonGraph(blocks: unknown[]): Record<string, unknown> | null {
  for (const b of blocks) {
    if (b && typeof b === 'object' && (b as Record<string, unknown>)['@type'] === 'Person') {
      return b as Record<string, unknown>;
    }
  }
  return null;
}

async function main() {
  const stamp = uid();
  const adminEmail = `e2e-pf-${stamp}@test.local`;
  const slug = `e2e-pf-${stamp}`;

  let admin: { id: string; token: string } | null = null;
  let workspaceId: string | null = null;
  let failed = false;

  const auth = () => ({ authorization: `Bearer ${admin!.token}`, 'content-type': 'application/json' });
  const checks: { label: string; ok: boolean }[] = [];
  const check = (label: string, ok: boolean) => {
    checks.push({ label, ok });
    console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) failed = true;
  };

  async function createPerson(body: Record<string, unknown>): Promise<string> {
    const res = await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/tree/individuals`, {
      method: 'POST', headers: auth(), body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`create individual failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return (data.data?.id ?? data.id) as string;
  }
  async function createFamily(body: Record<string, unknown>): Promise<string> {
    const res = await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/tree/families`, {
      method: 'POST', headers: auth(), body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`create family failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return (data.data?.id ?? data.id) as string;
  }
  async function addChild(familyId: string, individualId: string) {
    const res = await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/tree/families/${familyId}/children`, {
      method: 'POST', headers: auth(), body: JSON.stringify({ individualId }),
    });
    if (!res.ok) throw new Error(`add child failed: ${res.status} ${await res.text()}`);
  }
  const personGet = (id: string) =>
    fetch(`${BASE_URL}/api/workspaces/${workspaceId}/tree/person/${id}`, {
      headers: { authorization: `Bearer ${admin!.token}` },
    });

  try {
    console.log(`\nCreating admin user + workspace ${slug}...`);
    admin = await createAuthUser(adminEmail);
    await prisma.user.create({ data: { id: admin.id, email: adminEmail, displayName: `Admin ${stamp}` } });
    const ws = await prisma.workspace.create({ data: { slug, nameAr: `بيت الاختبار ${stamp}`, createdById: admin.id } });
    workspaceId = ws.id;
    await prisma.workspaceMembership.create({
      data: { userId: admin.id, workspaceId: ws.id, role: 'workspace_admin', permissions: [] },
    });
    await getOrCreateWorkspaceKey(ws.id);
    await prisma.familyTree.create({ data: { workspaceId: ws.id } });

    console.log(`Building family via the live tree API...`);
    // Patriline: greatGrandfather (public) -> grandfather (PRIVATE) -> father (public) -> SUBJECT.
    // Subject married to wife -> child + privateChild.
    // Subject siblings: a public sister + a PRIVATE brother.
    // Subject's mother (public) -> her mother (grandmother, public) -> her mother (greatGrandmother, public)
    //   => female line 2 levels deep above subject's mother (tests public cap=1 vs member unbounded).
    // Subject's father has a sibling (uncle, public) -> a cousin (public).
    // A living person (recent birth) to test the 130-yr birth-date hide on the public surface.
    const greatGrandfather = await createPerson({ givenName: 'جدالاكبر', surname: 'الاختبار', sex: 'M', isDeceased: true, birthDate: '1900' });
    const grandfather = await createPerson({ givenName: 'الجدالخاص', surname: 'الاختبار', sex: 'M', isPrivate: true });
    const father = await createPerson({ givenName: 'الاب', surname: 'الاختبار', sex: 'M', isDeceased: true, birthDate: '1950' });
    const uncle = await createPerson({ givenName: 'العم', surname: 'الاختبار', sex: 'M', isDeceased: true });
    const cousin = await createPerson({ givenName: 'ابنالعم', surname: 'الاختبار', sex: 'M' });

    const mother = await createPerson({ givenName: 'الام', surname: 'سعيد', sex: 'F', isDeceased: true });
    const grandmother = await createPerson({ givenName: 'الجدة', surname: 'سعيد', sex: 'F', isDeceased: true });
    const greatGrandmother = await createPerson({ givenName: 'الجدةالكبرى', surname: 'سعيد', sex: 'F', isDeceased: true });

    const subject = await createPerson({ givenName: 'باسل', surname: 'الاختبار', sex: 'M', kunya: 'ابو عمر', isDeceased: true, birthDate: '1980' });
    const sister = await createPerson({ givenName: 'الاخت', surname: 'الاختبار', sex: 'F' });
    const privateBrother = await createPerson({ givenName: 'الاخالخاص', surname: 'الاختبار', sex: 'M', isPrivate: true });

    const wife = await createPerson({ givenName: 'الزوجة', surname: 'اخرى', sex: 'F' });
    // Living child with a recent birth date — must have its birth hidden on public.
    const child = await createPerson({ givenName: 'عمر', surname: 'الاختبار', sex: 'M', birthDate: '2015' });
    const privateChild = await createPerson({ givenName: 'الابنالخاص', surname: 'الاختبار', sex: 'M', isPrivate: true });
    const grandchild = await createPerson({ givenName: 'الحفيد', surname: 'الاختبار', sex: 'M', birthDate: '2018' });

    // greatGrandmother -> grandmother -> mother  (female line above mother)
    const fGGm = await createFamily({ wifeId: greatGrandmother });
    await addChild(fGGm, grandmother);
    const fGm = await createFamily({ wifeId: grandmother });
    await addChild(fGm, mother);

    // greatGrandfather -> grandfather(PRIVATE) ; grandfather -> father + uncle ; uncle -> cousin.
    // (uncle is a SIBLING OF THE FATHER → a true paternal عم; cousin is his child.
    //  Note the shared parent — grandfather — is PRIVATE: the member surface must
    //  still enumerate the father's siblings/cousins despite the hidden parent.)
    const fGGf = await createFamily({ husbandId: greatGrandfather });
    await addChild(fGGf, grandfather);
    const fGf = await createFamily({ husbandId: grandfather });
    await addChild(fGf, father);
    await addChild(fGf, uncle);
    const fUncle = await createFamily({ husbandId: uncle });
    await addChild(fUncle, cousin);

    // father + mother -> subject + sister + privateBrother
    const fFather = await createFamily({ husbandId: father, wifeId: mother });
    await addChild(fFather, subject);
    await addChild(fFather, sister);
    await addChild(fFather, privateBrother);

    // subject + wife -> child + privateChild ; child -> grandchild
    const fSubject = await createFamily({ husbandId: subject, wifeId: wife });
    await addChild(fSubject, child);
    await addChild(fSubject, privateChild);
    const fChild = await createFamily({ husbandId: child });
    await addChild(fChild, grandchild);

    // ===================== MEMBER SURFACE =====================
    console.log(`\nMEMBER surface:`);
    const res = await personGet(subject);
    check('GET subject → 200', res.status === 200);
    const proj = await res.json();

    // Item 3: member CONTINUES past the private patrilineal ancestor.
    // paternalChain is oldest→father: [greatGrandfather, «خاص»(grandfather), father]
    const chain: Array<{ id?: string; name: string; private?: boolean }> = proj.paternalChain ?? [];
    check('member paternalChain reaches the great-grandfather PAST the private grandfather (≥3 nodes)', chain.length >= 3);
    const placeholder = chain.find((c) => c.private === true);
    check('private grandfather appears as a «خاص» placeholder in the chain', !!placeholder && placeholder.name === 'خاص');
    check('the «خاص» placeholder carries NO id (non-clickable, no enumeration handle)', !!placeholder && placeholder.id === undefined);
    check('great-grandfather (above the private ancestor) IS present + clickable', chain.some((c) => c.name.includes('جدالاكبر') && !!c.id));

    // Item 2: private relatives absent from family/cousin groups.
    const sibNames: string[] = (proj.siblings ?? []).map((s: { name?: string }) => s.name ?? '');
    check('private BROTHER absent from siblings', !sibNames.some((n) => n.includes('الاخالخاص') || n === 'خاص'));
    check('public sister present among siblings', sibNames.some((n) => n.includes('الاخت')));
    const marriageChildren: string[] = (proj.marriages ?? []).flatMap((m: { children?: { name?: string }[] }) =>
      (m.children ?? []).map((c) => c.name ?? ''));
    check('private CHILD absent from marriage children', !marriageChildren.some((n) => n.includes('الابنالخاص') || n === 'خاص'));
    check('public child "عمر" present in marriage children', marriageChildren.some((n) => n.includes('عمر')));
    const gcNames: string[] = (proj.grandchildren ?? []).map((g: { name?: string }) => g.name ?? '');
    check('grandchild present (الأحفاد group populated)', gcNames.some((n) => n.includes('الحفيد')));
    const cousinNames: string[] = [...(proj.paternalCousins ?? []), ...(proj.maternalCousins ?? [])].map((c: { name?: string }) => c.name ?? '');
    check('cousin present (cousins group populated)', cousinNames.some((n) => n.includes('ابنالعم')));

    // Item 3 (mother line) + member maternal recursion is unbounded:
    // maternalChain ends with the mother carrying .mother (grandmother) carrying .mother (greatGrandmother).
    const maternal: Array<{ name: string; mother?: { name: string; mother?: { name: string } } }> = proj.maternalChain ?? [];
    const motherNode = maternal[maternal.length - 1];
    check('member maternal female line is UNBOUNDED: mother → grandmother → great-grandmother',
      !!motherNode?.mother?.mother && motherNode.mother.mother.name.includes('الجدةالكبرى'));

    // Item 2: private subject → 404 ; unknown → 404.
    check('GET the PRIVATE brother → 404 (private person has no page)', (await personGet(privateBrother)).status === 404);
    check('GET unknown id → 404', (await personGet('does-not-exist')).status === 404);

    // ===================== PUBLISH (public_listed) =====================
    console.log(`\nPublishing the tree public_listed (admin)...`);
    const familyName = `بيت الاختبار ${stamp}`;
    const pubRes = await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/tree/visibility`, {
      method: 'PATCH', headers: auth(),
      body: JSON.stringify({ level: 'search', confirmationPhrase: familyName }),
    });
    check('publish public_listed → 200', pubRes.status === 200);
    const treeRec = await prisma.familyTree.findFirst({ where: { workspaceId, kind: 'main' }, select: { publicSlug: true, visibility: true } });
    const pubSlug = treeRec?.publicSlug as string;
    check('public slug minted + visibility public_listed', !!pubSlug && treeRec?.visibility === 'public_listed');

    // ===================== PUBLIC SURFACE (public_listed) =====================
    console.log(`\nPUBLIC surface (public_listed, indexable):`);
    const pubPersonRes = await fetch(`${BASE_URL}/family/${pubSlug}/person/${subject}`);
    check('GET public person page → 200', pubPersonRes.status === 200);
    const pubHtml = await pubPersonRes.text();
    const blocks = extractJsonLd(pubHtml);
    const personGraph = findPersonGraph(blocks);

    // Item 5: Person JSON-LD present + DATELESS + first-degree + no private + title=family name.
    check('Person JSON-LD present on the indexable page', !!personGraph);
    if (personGraph) {
      const totalBirth = blocks.reduce<number>((n, b) => n + countKeyDeep(b, 'birthDate'), 0);
      const totalDeath = blocks.reduce<number>((n, b) => n + countKeyDeep(b, 'deathDate'), 0);
      check('Person JSON-LD is DATELESS: zero birthDate keys anywhere in served JSON-LD', totalBirth === 0);
      check('Person JSON-LD is DATELESS: zero deathDate keys anywhere in served JSON-LD', totalDeath === 0);
      // First-degree only: no grandchildren/cousins/uncles keys; only parent/children/spouse/sibling.
      const allKeys = new Set<string>();
      const collect = (node: unknown) => {
        if (Array.isArray(node)) node.forEach(collect);
        else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) { allKeys.add(k); collect(v); }
      };
      collect(personGraph);
      const allowed = new Set(['@context', '@type', '@id', 'name', 'gender', 'url', 'parent', 'children', 'spouse', 'sibling']);
      const extra = [...allKeys].filter((k) => !allowed.has(k));
      check('Person JSON-LD focal keys are first-degree only (no extra keys)', extra.length === 0);
      // No private person leaked: the private grandfather/brother/child names must not appear anywhere in JSON-LD.
      const jsonStr = JSON.stringify(blocks);
      check('no private person name leaked in JSON-LD (grandfather)', !jsonStr.includes('الجدالخاص'));
      check('no private person name leaked in JSON-LD (brother)', !jsonStr.includes('الاخالخاص'));
      check('no private person name leaked in JSON-LD (child)', !jsonStr.includes('الابنالخاص'));
      check('no «خاص» placeholder leaked in JSON-LD (no structural oracle)', !jsonStr.includes('"name":"خاص"'));
    }
    // Page <title> is the FAMILY name, not the person's given name.
    const titleMatch = pubHtml.match(/<title>([^<]*)<\/title>/);
    const title = titleMatch?.[1] ?? '';
    check('page <title> = family name (contains the family name)', title.includes('بيت الاختبار'));
    check('page <title> is NOT the person\'s given name "باسل"', !title.includes('باسل'));
    // Indexable → robots index (no global noindex meta on this page).
    check('indexable page is NOT marked noindex', !/<meta[^>]*name="robots"[^>]*noindex/i.test(pubHtml));

    // Item 6: public STOPS at the private patrilineal ancestor — the great-grandfather
    // (above the private grandfather) must NOT be revealed on the public human page.
    check('public page does NOT reveal the great-grandfather above the private ancestor', !pubHtml.includes('جدالاكبر'));
    // The private ancestor is still a «خاص» placeholder on the human page (continuity), but its parent is hidden.
    // (The father below it IS shown.)
    check('public page DOES show the father (below the private ancestor)', pubHtml.includes('الاب'));

    // Item 7: public maternal female-line recursion capped at ONE level — grandmother
    // shown (1 level above mother) but NOT the great-grandmother (2 levels).
    check('public page shows the grandmother (maternal line, 1 level)', pubHtml.includes('الجدة'));
    check('public page does NOT show the great-grandmother (maternal recursion capped at 1)', !pubHtml.includes('الجدةالكبرى'));

    // Item 4 / privacy: living child born 2015 — its birth date (2015) must be hidden
    // on the public human page (130-yr living rule blanks living births).
    check('living child birth year 2015 is NOT shown on the public page', !pubHtml.includes('2015'));
    check('living grandchild birth year 2018 is NOT shown on the public page', !pubHtml.includes('2018'));
    // Deceased subject born 1980 — the human page MAY show deceased dates; assert the
    // deceased great-grandfather year does not appear only because he's withheld (item 6),
    // not a date rule — skip asserting deceased dates here.

    // Item 8: private id → 404 (no oracle); unknown id → 404 on the public surface.
    check('public GET private grandfather id → 404 (no existence oracle)',
      (await fetch(`${BASE_URL}/family/${pubSlug}/person/${grandfather}`)).status === 404);
    check('public GET unknown id → 404', (await fetch(`${BASE_URL}/family/${pubSlug}/person/does-not-exist`)).status === 404);

    // ===================== PUBLIC SURFACE (public_link → noindex) =====================
    console.log(`\nSwitching to public_link (by-link only, noindex):`);
    const linkRes = await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/tree/visibility`, {
      method: 'PATCH', headers: auth(), body: JSON.stringify({ level: 'link' }),
    });
    check('switch to public_link → 200', linkRes.status === 200);
    const linkPersonRes = await fetch(`${BASE_URL}/family/${pubSlug}/person/${subject}`);
    check('public_link person page still served → 200', linkPersonRes.status === 200);
    const linkHtml = await linkPersonRes.text();
    check('public_link page IS marked noindex', /<meta[^>]*name="robots"[^>]*noindex/i.test(linkHtml));
    const linkBlocks = extractJsonLd(linkHtml);
    check('public_link page emits ZERO Person JSON-LD (not indexable)', !findPersonGraph(linkBlocks));

    // Revert to private (cleanup of the publish; workspace is deleted below anyway).
    console.log(`\nReverting tree to private...`);
    const privRes = await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/tree/visibility`, {
      method: 'PATCH', headers: auth(), body: JSON.stringify({ level: 'private' }),
    });
    check('revert to private → 200', privRes.status === 200);
    check('private tree → public person page 404 (deny-by-default)',
      (await fetch(`${BASE_URL}/family/${pubSlug}/person/${subject}`)).status === 404);
  } catch (err) {
    failed = true;
    console.error('\ne2e threw:', err);
  } finally {
    console.log(`\nCleanup...`);
    try { if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }); }
    catch (e) { console.error('  workspace cleanup failed:', e); }
    try {
      if (admin) { await prisma.user.delete({ where: { id: admin.id } }).catch(() => {}); await deleteAuthUser(admin.id); }
    } catch (e) { console.error('  user cleanup failed:', e); }
    await prisma.$disconnect();
  }

  const passed = checks.filter((c) => c.ok).length;
  console.log(`\n${failed ? 'OVERALL: FAIL' : 'OVERALL: PASS'} — ${passed}/${checks.length} checks`);
  process.exit(failed ? 1 : 0);
}

main();
