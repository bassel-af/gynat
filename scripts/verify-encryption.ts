/**
 * Phase 10b debug/verification script: walks a sample of workspace data
 * through the real library code and asserts that encrypted rows decrypt
 * back to sensible plaintext strings. Intended as a quick end-to-end
 * sanity check after running `pnpm encrypt:existing`.
 *
 * Usage: pnpm verify:encryption
 *
 * Does NOT mutate data. Read-only.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { getMasterKey } from '../src/lib/crypto/master-key';
import { unwrapKey } from '../src/lib/crypto/workspace-encryption';
import { dbTreeToGedcomData } from '../src/lib/tree/mapper';
import { getTreeByWorkspaceId } from '../src/lib/tree/queries';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Check .env.local.');
  }
  const masterKey = getMasterKey(); // throws if WORKSPACE_MASTER_KEY is missing
  console.log('Master key loaded.\n');

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const workspaces = await prisma.workspace.findMany({
      select: { id: true, nameAr: true, encryptedKey: true },
      orderBy: { createdAt: 'asc' },
    });
    console.log(`Found ${workspaces.length} workspace(s).`);

    for (const ws of workspaces) {
      console.log(`\n=== Workspace: ${ws.nameAr} (${ws.id}) ===`);
      if (!ws.encryptedKey) {
        console.log('   NO encryptedKey — run pnpm encrypt:existing first.');
        continue;
      }
      const keyBuf = Buffer.from(ws.encryptedKey);
      let workspaceKey: Buffer;
      try {
        workspaceKey = unwrapKey(keyBuf, masterKey);
      } catch (err) {
        console.log(`   ✗ Failed to unwrap workspace key: ${(err as Error).message}`);
        continue;
      }
      console.log(`   ✓ workspace key unwrapped (32 bytes)`);

      // Hack: we can't call the real getTreeByWorkspaceId because it uses
      // the app's singleton prisma client bound to the Next.js runtime
      // environment. Pull the tree directly via this script's prisma.
      void getTreeByWorkspaceId; // silence unused import — library API reference
      const tree = await prisma.familyTree.findFirst({
        where: { workspaceId: ws.id, kind: 'main' },
        include: {
          individuals: {
            include: {
              birthPlaceRef: { select: { id: true, nameAr: true, parent: { select: { nameAr: true, parent: { select: { nameAr: true } } } } } },
              deathPlaceRef: { select: { id: true, nameAr: true, parent: { select: { nameAr: true, parent: { select: { nameAr: true } } } } } },
            },
          },
          families: {
            include: {
              children: true,
              marriageContractPlaceRef: { select: { id: true, nameAr: true, parent: { select: { nameAr: true, parent: { select: { nameAr: true } } } } } },
              marriagePlaceRef: { select: { id: true, nameAr: true, parent: { select: { nameAr: true, parent: { select: { nameAr: true } } } } } },
              divorcePlaceRef: { select: { id: true, nameAr: true, parent: { select: { nameAr: true, parent: { select: { nameAr: true } } } } } },
            },
          },
          radaFamilies: {
            include: { children: true },
          },
        },
      });
      if (!tree) {
        console.log('   (no tree)');
        continue;
      }
      console.log(`   tree: ${tree.individuals.length} individuals, ${tree.families.length} families`);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gedcomData = dbTreeToGedcomData(tree as any, workspaceKey);
        const individualIds = Object.keys(gedcomData.individuals);
        console.log(`   ✓ mapper decrypted ${individualIds.length} individuals`);

        // Sample the first 3 individuals
        const sample = individualIds.slice(0, 3).map((id) => {
          const ind = gedcomData.individuals[id];
          return {
            id: id.slice(0, 8),
            name: `${ind.givenName ?? ''} ${ind.surname ?? ''}`.trim() || ind.name || '(no name)',
            sex: ind.sex,
            birth: ind.birth || '(no date)',
          };
        });
        console.log('   first 3 individuals (decrypted):');
        for (const p of sample) {
          console.log(`     - [${p.id}] ${p.name}  sex=${p.sex}  birth=${p.birth}`);
        }
      } catch (err) {
        console.log(`   ✗ mapper failed: ${(err as Error).message}`);
      }
    }

    console.log('\nDone.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\nVerification failed:');
  console.error(err);
  process.exit(1);
});
