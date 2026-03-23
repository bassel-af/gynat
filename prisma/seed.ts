import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { FAMILIES } from '../src/config/families';
import { parseGedcom } from '../src/lib/gedcom/parser';
import { seedTreeFromGedcomData } from '../src/lib/tree/seed-helpers';

// We can't use the @/ alias or the singleton from src/lib/db.ts here
// because this script runs outside of Next.js/Vite.
// Instead, we create a standalone Prisma client.

const ADMIN_EMAIL = 'bassel@autoflowa.com';

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

    const entries = Object.entries(FAMILIES).filter(([key]) => key !== 'test');

    console.log(`Seeding ${entries.length} workspaces for admin user ${ADMIN_EMAIL} (${adminUserId})...`);

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
          const gedcomData = parseGedcom(gedcomText);

          const result = await seedTreeFromGedcomData(workspace.id, gedcomData, prisma);

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
