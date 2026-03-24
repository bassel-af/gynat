/**
 * Standalone script to seed the Place table from places.json.
 *
 * Usage:
 *   pnpm seed:places
 *   # or: npx tsx src/lib/seed/run-seed-places.ts
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { seedPlaces } from './seed-places';
import type { PlacesData } from './seed-places';

const PLACES_FILE = path.resolve(__dirname, '../../../prisma/seed-data/places.json');

async function main(): Promise<void> {
  console.log('=== Seeding Places ===');

  if (!fs.existsSync(PLACES_FILE)) {
    console.error(`Error: ${PLACES_FILE} not found.`);
    console.error('Run "pnpm preprocess-geonames" first to generate the data.');
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('Reading places.json...');
    const raw = fs.readFileSync(PLACES_FILE, 'utf-8');
    const data: PlacesData = JSON.parse(raw);
    console.log(`  Countries: ${data.countries.length}, Regions: ${data.regions.length}, Cities: ${data.cities.length}`);

    const result = await seedPlaces(prisma, data);

    if (result.skipped) {
      console.log('Places already seeded, skipped.');
    } else {
      console.log(`Seeded: ${result.countryCount} countries, ${result.regionCount} regions, ${result.cityCount} cities`);
    }

    console.log('Done.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
