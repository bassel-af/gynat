/**
 * E2E verification for the Person Page MEMBER data path (Surface 2 body):
 *   GET /api/workspaces/[id]/tree/person/[individualId]  →  PersonProjection
 *
 * Creates a throwaway admin user + workspace via the Supabase admin API, builds
 * a small real family through the LIVE tree API (so encryption + persistence go
 * through the production code path), then hits the member person endpoint and
 * asserts the projection shape the Person Page route + <PersonPage> consume:
 *   - subject identity (givenName/surname; NO `subject.name` field)
 *   - paternal chain present, marriages + children present
 *   - a PRIVATE relative is omitted / placeholdered (the projection is the
 *     redactor for this surface)
 *   - 404 for an unknown individual
 *   - ETag/304 round-trip
 * Cleans up on exit.
 *
 * Requires: dev server on localhost:4000, Docker Supabase stack up, .env.local.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
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
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
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

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

async function main() {
  const stamp = uid();
  const adminEmail = `e2e-person-${stamp}@test.local`;
  const slug = `e2e-person-${stamp}`;

  let admin: { id: string; token: string } | null = null;
  let workspaceId: string | null = null;
  let failed = false;

  const auth = () => ({ authorization: `Bearer ${admin!.token}`, 'content-type': 'application/json' });
  const checks: { label: string; ok: boolean }[] = [];
  const check = (label: string, ok: boolean) => {
    checks.push({ label, ok });
    console.log(`   ${ok ? '✅' : '❌'} ${label}`);
    if (!ok) failed = true;
  };

  async function createPerson(body: Record<string, unknown>): Promise<string> {
    const res = await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/tree/individuals`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`create individual failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return (data.data?.id ?? data.id) as string;
  }

  async function createFamily(body: Record<string, unknown>): Promise<string> {
    const res = await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/tree/families`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`create family failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return (data.data?.id ?? data.id) as string;
  }

  async function addChild(familyId: string, individualId: string) {
    const res = await fetch(
      `${BASE_URL}/api/workspaces/${workspaceId}/tree/families/${familyId}/children`,
      { method: 'POST', headers: auth(), body: JSON.stringify({ individualId }) },
    );
    if (!res.ok) throw new Error(`add child failed: ${res.status} ${await res.text()}`);
  }

  try {
    console.log(`\n🔧 Creating admin user + workspace ${slug}...`);
    admin = await createAuthUser(adminEmail);
    await prisma.user.create({ data: { id: admin.id, email: adminEmail, displayName: `Admin ${stamp}` } });
    const ws = await prisma.workspace.create({
      data: { slug, nameAr: `اختبار الشخص ${stamp}`, createdById: admin.id },
    });
    workspaceId = ws.id;
    await prisma.workspaceMembership.create({
      data: { userId: admin.id, workspaceId: ws.id, role: 'workspace_admin', permissions: [] },
    });
    await getOrCreateWorkspaceKey(ws.id);
    await prisma.familyTree.create({ data: { workspaceId: ws.id } });

    console.log(`🔧 Building a small family via the live tree API...`);
    // grandfather → father → SUBJECT; subject married to wife with a child;
    // plus a PRIVATE sibling to exercise redaction.
    const grandfather = await createPerson({ givenName: 'جد', surname: 'العائلة', sex: 'M' });
    const father = await createPerson({ givenName: 'أب', surname: 'العائلة', sex: 'M' });
    const subject = await createPerson({ givenName: 'باسل', surname: 'العائلة', sex: 'M', kunya: 'أبو عمر' });
    const wife = await createPerson({ givenName: 'زوجة', surname: 'أخرى', sex: 'F' });
    const child = await createPerson({ givenName: 'عمر', surname: 'العائلة', sex: 'M' });
    const privateSibling = await createPerson({ givenName: 'سر', surname: 'العائلة', sex: 'M' });

    // grandfather + (someone) → father; father → subject + privateSibling
    const fGrand = await createFamily({ husbandId: grandfather });
    await addChild(fGrand, father);
    const fFather = await createFamily({ husbandId: father });
    await addChild(fFather, subject);
    await addChild(fFather, privateSibling);
    // subject + wife → child
    const fSubject = await createFamily({ husbandId: subject, wifeId: wife });
    await addChild(fSubject, child);

    // Flag the sibling private (server-side redaction must omit/placeholder it).
    await prisma.individual.update({ where: { id: privateSibling }, data: { isPrivate: true } });

    console.log(`\n🔎 Person endpoint scenarios:`);

    // --- Scenario 1: subject projection shape ---
    const res = await fetch(
      `${BASE_URL}/api/workspaces/${workspaceId}/tree/person/${subject}`,
      { headers: { authorization: `Bearer ${admin.token}` } },
    );
    check('GET subject → 200', res.status === 200);
    const etag = res.headers.get('etag');
    check('response carries an ETag', !!etag);
    const proj = await res.json();

    check('has subject + givenName "باسل"', proj?.subject?.givenName === 'باسل');
    check('subject surname present', proj?.subject?.surname === 'العائلة');
    check('subject carries the display identity fields (name/givenName/surname/house)',
      typeof proj?.subject?.name === 'string' &&
      typeof proj?.subject?.givenName === 'string' &&
      'house' in (proj?.subject ?? {}));
    check('paternalChain is a non-empty array (father, grandfather)',
      Array.isArray(proj?.paternalChain) && proj.paternalChain.length >= 2);
    check('marriages present with a child "عمر"',
      Array.isArray(proj?.marriages) &&
      proj.marriages.some((m: { children?: { givenName?: string }[] }) =>
        (m.children ?? []).some((c) => c.givenName === 'عمر')));

    // --- Scenario 2: PRIVATE sibling redaction ---
    const siblingNames: string[] = (proj?.siblings ?? []).map((s: { name?: string }) => s.name ?? '');
    check('private sibling name "سر" is NOT leaked among siblings',
      !siblingNames.includes('سر'));

    // --- Scenario 3: private subject itself → 404 ---
    const resPriv = await fetch(
      `${BASE_URL}/api/workspaces/${workspaceId}/tree/person/${privateSibling}`,
      { headers: { authorization: `Bearer ${admin.token}` } },
    );
    check('GET a PRIVATE individual → 404 (projection is the redactor)', resPriv.status === 404);

    // --- Scenario 4: unknown id → 404 ---
    const resUnknown = await fetch(
      `${BASE_URL}/api/workspaces/${workspaceId}/tree/person/does-not-exist`,
      { headers: { authorization: `Bearer ${admin.token}` } },
    );
    check('GET unknown individual → 404', resUnknown.status === 404);

    // --- Scenario 5: ETag 304 round-trip ---
    if (etag) {
      const res304 = await fetch(
        `${BASE_URL}/api/workspaces/${workspaceId}/tree/person/${subject}`,
        { headers: { authorization: `Bearer ${admin.token}`, 'if-none-match': etag } },
      );
      check('If-None-Match with the ETag → 304', res304.status === 304);
    }

    // --- Scenario 6: unauthenticated → not 200 ---
    const resAnon = await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/tree/person/${subject}`);
    check('unauthenticated request → not 200', resAnon.status !== 200);
  } catch (err) {
    failed = true;
    console.error('\n💥 e2e threw:', err);
  } finally {
    console.log(`\n🧹 Cleanup...`);
    try {
      if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } });
    } catch (e) {
      console.error('   workspace cleanup failed:', e);
    }
    try {
      if (admin) {
        await prisma.user.delete({ where: { id: admin.id } }).catch(() => {});
        await deleteAuthUser(admin.id);
      }
    } catch (e) {
      console.error('   user cleanup failed:', e);
    }
    await prisma.$disconnect();
  }

  const passed = checks.filter((c) => c.ok).length;
  console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'} — ${passed}/${checks.length} checks`);
  process.exit(failed ? 1 : 0);
}

main();
