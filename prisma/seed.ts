import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { FAMILIES } from '../src/config/families';
import { parseGedcom } from '../src/lib/gedcom/parser';
import { extractSubtree, expandGraftFamilies } from '../src/lib/gedcom/graph';
import { seedTreeFromGedcomData } from '../src/lib/tree/seed-helpers';
import { resolveGedcomPlaces } from '../src/lib/tree/seed-place-mapping';
import { seedPlaces } from '../src/lib/seed/seed-places';
import type { PlacesData } from '../src/lib/seed/seed-places';

// We can't use the @/ alias or the singleton from src/lib/db.ts here
// because this script runs outside of Next.js/Vite.
// Instead, we create a standalone Prisma client.

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'bassel@autoflowa.com';

/**
 * Build a Map from Arabic place name -> Place UUID for all global places
 * (workspaceId IS NULL). Used to resolve GEDCOM place strings to Place IDs.
 */
async function buildPlaceNameToIdMap(prisma: PrismaClient): Promise<Map<string, string>> {
  const places = await prisma.place.findMany({
    where: { workspaceId: null },
    select: { id: true, nameAr: true },
  });
  const map = new Map<string, string>();
  for (const place of places) {
    map.set(place.nameAr, place.id);
  }
  return map;
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  try {
    const adminUser = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    if (!adminUser) {
      console.error(`Error: No user found with email ${ADMIN_EMAIL}. Make sure the user has signed up first.`);
      process.exit(1);
    }
    const adminUserId = adminUser.id;

    // --- Seed places FIRST so we can resolve placeIds for tree data ---
    const placesPath = path.resolve(__dirname, 'seed-data', 'places.json');
    if (fs.existsSync(placesPath)) {
      console.log('Seeding places...');
      const raw = fs.readFileSync(placesPath, 'utf-8');
      const placesData: PlacesData = JSON.parse(raw);
      const placesResult = await seedPlaces(prisma, placesData);

      if (placesResult.skipped) {
        console.log('  Places already seeded, skipped.');
      } else {
        console.log(`  Seeded: ${placesResult.countryCount} countries, ${placesResult.regionCount} regions, ${placesResult.cityCount} cities`);
      }
    } else {
      console.log('No places.json found, skipping places seed. Run "pnpm preprocess-geonames" to generate it.');
    }

    // Build place name -> ID lookup from seeded global places
    const placeNameToId = await buildPlaceNameToIdMap(prisma);
    console.log(`  Loaded ${placeNameToId.size} global places for ID lookup.`);

    // --- Seed workspaces and tree data ---
    const entries = Object.entries(FAMILIES).filter(([key]) => key !== 'test');
    console.log(`\nSeeding ${entries.length} workspaces for admin user ${ADMIN_EMAIL} (${adminUserId})...`);

    for (const [, config] of entries) {
      const workspace = await prisma.workspace.upsert({
        where: { slug: config.slug },
        update: { nameAr: config.displayName },
        create: {
          slug: config.slug,
          nameAr: config.displayName,
          createdById: adminUserId,
        },
      });

      await prisma.workspaceMembership.upsert({
        where: {
          userId_workspaceId: {
            userId: adminUserId,
            workspaceId: workspace.id,
          },
        },
        update: {},
        create: {
          userId: adminUserId,
          workspaceId: workspace.id,
          role: 'workspace_admin',
        },
      });

      console.log(`  Seeded workspace: ${config.slug} (${config.displayName})`);

      // Seed tree data from GEDCOM file
      if (config.gedcomFile) {
        const gedcomPath = path.resolve(__dirname, '..', 'public', config.gedcomFile.replace(/^\//, ''));
        if (fs.existsSync(gedcomPath)) {
          const gedcomText = fs.readFileSync(gedcomPath, 'utf-8');
          const fullData = parseGedcom(gedcomText);
          const subtreeData = extractSubtree(fullData, config.rootId);
          const gedcomData = expandGraftFamilies(subtreeData, fullData, config.rootId);

          const fullCount = Object.keys(fullData.individuals).length;
          const subtreeCount = Object.keys(subtreeData.individuals).length;
          const expandedCount = Object.keys(gedcomData.individuals).length;
          console.log(`    Subtree: ${subtreeCount} of ${fullCount} individuals (root: ${config.rootId}), expanded: ${expandedCount}`);

          // Resolve GEDCOM place strings to Arabic names + Place IDs
          const resolvedData = resolveGedcomPlaces(gedcomData, placeNameToId);

          const result = await seedTreeFromGedcomData(workspace.id, resolvedData, prisma);

          if (result.skipped) {
            console.log(`    Tree data already exists, skipped.`);
          } else {
            console.log(`    Seeded tree: ${result.individualCount} individuals, ${result.familyCount} families.`);
          }
        } else {
          console.log(`    GEDCOM file not found: ${gedcomPath}, skipping tree seed.`);
        }
      }
    }

    console.log('Seed completed successfully.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
