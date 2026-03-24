#!/usr/bin/env tsx
/**
 * Preprocessing script for GeoNames data.
 *
 * Downloads GeoNames data files, parses them, builds Arabic name lookups,
 * and outputs a processed `places.json` for seeding the Place table.
 *
 * Usage:
 *   pnpm preprocess-geonames
 *   # or: npx tsx scripts/preprocess-geonames.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { execSync } from 'child_process';

// We import from the src module using relative paths since this script
// runs outside of Vite/Next.js and the @/ alias is not available.
import {
  parseCountryInfoLine,
  parseAdmin1Line,
  parseCityLine,
  parseAlternateNameLine,
  getCityPopulationThreshold,
} from '../src/lib/seed/geonames-parser';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const DATA_DIR = path.join(SCRIPT_DIR, 'geonames-data');
const OUTPUT_DIR = path.join(SCRIPT_DIR, '..', 'prisma', 'seed-data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'places.json');

const GEONAMES_BASE = 'https://download.geonames.org/export/dump';

const FILES = {
  cities500: {
    url: `${GEONAMES_BASE}/cities500.zip`,
    zipName: 'cities500.zip',
    fileName: 'cities500.txt',
  },
  alternateNames: {
    url: `${GEONAMES_BASE}/alternateNamesV2.zip`,
    zipName: 'alternateNamesV2.zip',
    fileName: 'alternateNamesV2.txt',
  },
  admin1: {
    url: `${GEONAMES_BASE}/admin1CodesASCII.txt`,
    fileName: 'admin1CodesASCII.txt',
  },
  countryInfo: {
    url: `${GEONAMES_BASE}/countryInfo.txt`,
    fileName: 'countryInfo.txt',
  },
};

// ---------------------------------------------------------------------------
// Download helpers
// ---------------------------------------------------------------------------

async function downloadFile(url: string, destPath: string): Promise<void> {
  if (fs.existsSync(destPath)) {
    console.log(`  Already downloaded: ${path.basename(destPath)}`);
    return;
  }

  console.log(`  Downloading: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  console.log(`  Saved: ${path.basename(destPath)} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
}

function unzipFile(zipPath: string, destDir: string): void {
  const baseName = path.basename(zipPath, '.zip') + '.txt';
  const destPath = path.join(destDir, baseName);
  if (fs.existsSync(destPath)) {
    console.log(`  Already extracted: ${baseName}`);
    return;
  }

  console.log(`  Extracting: ${path.basename(zipPath)}`);
  execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'pipe' });
}

// ---------------------------------------------------------------------------
// Stream line reader for large files
// ---------------------------------------------------------------------------

function createLineReader(filePath: string): readline.Interface {
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  return readline.createInterface({ input: stream, crlfDelay: Infinity });
}

// ---------------------------------------------------------------------------
// Step 1: Download all files
// ---------------------------------------------------------------------------

async function downloadAll(): Promise<void> {
  console.log('\n--- Step 1: Downloading GeoNames files ---');
  fs.mkdirSync(DATA_DIR, { recursive: true });

  for (const [key, config] of Object.entries(FILES)) {
    const destFile = 'zipName' in config ? config.zipName : config.fileName;
    const destPath = path.join(DATA_DIR, destFile);
    await downloadFile(config.url, destPath);

    if ('zipName' in config) {
      unzipFile(destPath, DATA_DIR);
    }
  }
}

// ---------------------------------------------------------------------------
// Step 2: Build Arabic + English name lookups from alternateNamesV2
// ---------------------------------------------------------------------------

interface NameEntry {
  name: string;
  isPreferred: boolean;
}

async function buildNameLookups(): Promise<{
  arNames: Map<number, string>;
  enNames: Map<number, string>;
}> {
  console.log('\n--- Step 2: Building Arabic and English name lookups ---');

  const arCandidates = new Map<number, NameEntry>();
  const enCandidates = new Map<number, NameEntry>();

  const filePath = path.join(DATA_DIR, FILES.alternateNames.fileName);
  const rl = createLineReader(filePath);

  let lineCount = 0;
  let arCount = 0;
  let enCount = 0;

  for await (const line of rl) {
    lineCount++;
    if (lineCount % 5_000_000 === 0) {
      console.log(`  Processed ${(lineCount / 1_000_000).toFixed(0)}M lines...`);
    }

    const parsed = parseAlternateNameLine(line);
    if (!parsed) continue;

    if (parsed.isoLanguage === 'ar') {
      const existing = arCandidates.get(parsed.geonameId);
      if (!existing || (parsed.isPreferred && !existing.isPreferred)) {
        arCandidates.set(parsed.geonameId, {
          name: parsed.alternateName,
          isPreferred: parsed.isPreferred,
        });
      }
      arCount++;
    } else if (parsed.isoLanguage === 'en') {
      const existing = enCandidates.get(parsed.geonameId);
      if (!existing || (parsed.isPreferred && !existing.isPreferred)) {
        enCandidates.set(parsed.geonameId, {
          name: parsed.alternateName,
          isPreferred: parsed.isPreferred,
        });
      }
      enCount++;
    }
  }

  const arNames = new Map<number, string>();
  for (const [id, entry] of arCandidates) {
    arNames.set(id, entry.name);
  }

  const enNames = new Map<number, string>();
  for (const [id, entry] of enCandidates) {
    enNames.set(id, entry.name);
  }

  console.log(`  Total lines: ${lineCount.toLocaleString()}`);
  console.log(`  Arabic names: ${arNames.size.toLocaleString()} unique geonameIds (from ${arCount.toLocaleString()} rows)`);
  console.log(`  English names: ${enNames.size.toLocaleString()} unique geonameIds (from ${enCount.toLocaleString()} rows)`);

  return { arNames, enNames };
}

// ---------------------------------------------------------------------------
// Step 3: Process countries
// ---------------------------------------------------------------------------

interface CountryOutput {
  geonameId: number;
  nameAr: string;
  nameEn: string;
  countryCode: string;
  latitude: number;
  longitude: number;
}

async function processCountries(
  arNames: Map<number, string>,
  enNames: Map<number, string>,
): Promise<{ countries: CountryOutput[]; countryGeonameIdByCode: Map<string, number> }> {
  console.log('\n--- Step 3: Processing countries ---');

  const filePath = path.join(DATA_DIR, FILES.countryInfo.fileName);
  const rl = createLineReader(filePath);

  const countries: CountryOutput[] = [];
  const countryGeonameIdByCode = new Map<string, number>();
  let withAr = 0;
  let withoutAr = 0;

  // We also need lat/lon for countries — GeoNames countryInfo doesn't include these
  // directly, so we'll use a simple lookup from the cities data or a static fallback.
  // For now, we use 0/0 and will try to improve later from admin1/cities data.
  // Actually, let's read countryInfo which has no coords — we'll set them to 0
  // and update from the alternateNames/cities file if needed later.

  for await (const line of rl) {
    const parsed = parseCountryInfoLine(line);
    if (!parsed) continue;

    const arName = arNames.get(parsed.geonameId);
    const enName = enNames.get(parsed.geonameId) ?? parsed.nameEn;

    if (arName) {
      withAr++;
    } else {
      withoutAr++;
    }

    countryGeonameIdByCode.set(parsed.countryCode, parsed.geonameId);

    countries.push({
      geonameId: parsed.geonameId,
      nameAr: arName ?? parsed.nameEn, // Fallback to English if no Arabic
      nameEn: enName,
      countryCode: parsed.countryCode,
      latitude: 0,
      longitude: 0,
    });
  }

  console.log(`  Total countries: ${countries.length}`);
  console.log(`  With Arabic name: ${withAr}`);
  console.log(`  Without Arabic name: ${withoutAr} (using English fallback)`);

  return { countries, countryGeonameIdByCode };
}

// ---------------------------------------------------------------------------
// Step 4: Process admin1 regions
// ---------------------------------------------------------------------------

interface RegionOutput {
  geonameId: number;
  nameAr: string;
  nameEn: string;
  countryCode: string;
  admin1Code: string;
  parentGeonameId: number;
  latitude: number;
  longitude: number;
}

async function processRegions(
  arNames: Map<number, string>,
  enNames: Map<number, string>,
  countryGeonameIdByCode: Map<string, number>,
): Promise<{ regions: RegionOutput[]; regionGeonameIdByKey: Map<string, number> }> {
  console.log('\n--- Step 4: Processing admin1 regions ---');

  const filePath = path.join(DATA_DIR, FILES.admin1.fileName);
  const rl = createLineReader(filePath);

  const regions: RegionOutput[] = [];
  const regionGeonameIdByKey = new Map<string, number>(); // key: "SA.01"
  let withAr = 0;
  let withoutAr = 0;

  for await (const line of rl) {
    const parsed = parseAdmin1Line(line);
    if (!parsed) continue;

    const countryGeonameId = countryGeonameIdByCode.get(parsed.countryCode);
    if (countryGeonameId === undefined) continue; // Skip regions for unknown countries

    const arName = arNames.get(parsed.geonameId);
    const enName = enNames.get(parsed.geonameId) ?? parsed.nameEn;

    if (arName) {
      withAr++;
    } else {
      withoutAr++;
    }

    const key = `${parsed.countryCode}.${parsed.admin1Code}`;
    regionGeonameIdByKey.set(key, parsed.geonameId);

    regions.push({
      geonameId: parsed.geonameId,
      nameAr: arName ?? parsed.nameEn,
      nameEn: enName,
      countryCode: parsed.countryCode,
      admin1Code: parsed.admin1Code,
      parentGeonameId: countryGeonameId,
      latitude: 0,
      longitude: 0,
    });
  }

  console.log(`  Total regions: ${regions.length}`);
  console.log(`  With Arabic name: ${withAr}`);
  console.log(`  Without Arabic name: ${withoutAr} (using English fallback)`);

  return { regions, regionGeonameIdByKey };
}

// ---------------------------------------------------------------------------
// Step 5: Process cities with population thresholds
// ---------------------------------------------------------------------------

interface CityOutput {
  geonameId: number;
  nameAr: string;
  nameEn: string;
  countryCode: string;
  admin1Code: string;
  parentGeonameId: number;
  latitude: number;
  longitude: number;
  population: number;
}

async function processCities(
  arNames: Map<number, string>,
  enNames: Map<number, string>,
  countryGeonameIdByCode: Map<string, number>,
  regionGeonameIdByKey: Map<string, number>,
): Promise<CityOutput[]> {
  console.log('\n--- Step 5: Processing cities ---');

  const filePath = path.join(DATA_DIR, FILES.cities500.fileName);
  const rl = createLineReader(filePath);

  const cities: CityOutput[] = [];
  let totalParsed = 0;
  let skippedByPop = 0;
  let withAr = 0;
  let withoutAr = 0;

  for await (const line of rl) {
    const parsed = parseCityLine(line);
    if (!parsed) continue;
    totalParsed++;

    // Apply population threshold
    const threshold = getCityPopulationThreshold(parsed.countryCode);
    if (parsed.population < threshold) {
      skippedByPop++;
      continue;
    }

    const arName = arNames.get(parsed.geonameId);
    const enName = enNames.get(parsed.geonameId) ?? parsed.nameEn;

    if (arName) {
      withAr++;
    } else {
      withoutAr++;
    }

    // Determine parent: prefer region, fall back to country
    const regionKey = `${parsed.countryCode}.${parsed.admin1Code}`;
    let parentGeonameId = regionGeonameIdByKey.get(regionKey);
    if (parentGeonameId === undefined) {
      parentGeonameId = countryGeonameIdByCode.get(parsed.countryCode) ?? 0;
    }

    cities.push({
      geonameId: parsed.geonameId,
      nameAr: arName ?? parsed.nameEn,
      nameEn: enName,
      countryCode: parsed.countryCode,
      admin1Code: parsed.admin1Code,
      parentGeonameId,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      population: parsed.population,
    });
  }

  console.log(`  Total cities parsed: ${totalParsed.toLocaleString()}`);
  console.log(`  Skipped (below threshold): ${skippedByPop.toLocaleString()}`);
  console.log(`  Included: ${cities.length.toLocaleString()}`);
  console.log(`  With Arabic name: ${withAr}`);
  console.log(`  Without Arabic name: ${withoutAr} (using English fallback)`);

  return cities;
}

// ---------------------------------------------------------------------------
// Step 6: Update country and region coordinates from cities
// ---------------------------------------------------------------------------

function updateCoordinatesFromCities(
  countries: CountryOutput[],
  regions: RegionOutput[],
  cities: CityOutput[],
): void {
  console.log('\n--- Step 6: Updating country/region coordinates from cities ---');

  // Build best city per country (highest population)
  const bestCityByCountry = new Map<string, CityOutput>();
  // Build best city per region key
  const bestCityByRegionKey = new Map<string, CityOutput>();

  for (const city of cities) {
    const existing = bestCityByCountry.get(city.countryCode);
    if (!existing || city.population > existing.population) {
      bestCityByCountry.set(city.countryCode, city);
    }

    const regionKey = `${city.countryCode}.${city.admin1Code}`;
    const existingRegion = bestCityByRegionKey.get(regionKey);
    if (!existingRegion || city.population > existingRegion.population) {
      bestCityByRegionKey.set(regionKey, city);
    }
  }

  let countriesUpdated = 0;
  for (const country of countries) {
    const bestCity = bestCityByCountry.get(country.countryCode);
    if (bestCity) {
      country.latitude = bestCity.latitude;
      country.longitude = bestCity.longitude;
      countriesUpdated++;
    }
  }

  let regionsUpdated = 0;
  for (const region of regions) {
    const key = `${region.countryCode}.${region.admin1Code}`;
    const bestCity = bestCityByRegionKey.get(key);
    if (bestCity) {
      region.latitude = bestCity.latitude;
      region.longitude = bestCity.longitude;
      regionsUpdated++;
    }
  }

  console.log(`  Countries with coords: ${countriesUpdated}/${countries.length}`);
  console.log(`  Regions with coords: ${regionsUpdated}/${regions.length}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== GeoNames Preprocessing Script ===');
  console.log(`Output: ${OUTPUT_FILE}`);

  await downloadAll();
  const { arNames, enNames } = await buildNameLookups();
  const { countries, countryGeonameIdByCode } = await processCountries(arNames, enNames);
  const { regions, regionGeonameIdByKey } = await processRegions(arNames, enNames, countryGeonameIdByCode);
  const cities = await processCities(arNames, enNames, countryGeonameIdByCode, regionGeonameIdByKey);

  updateCoordinatesFromCities(countries, regions, cities);

  // Write output
  console.log('\n--- Writing output ---');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const output = { countries, regions, cities };
  const json = JSON.stringify(output, null, 2);
  fs.writeFileSync(OUTPUT_FILE, json, 'utf-8');

  const fileSizeMB = (Buffer.byteLength(json, 'utf-8') / 1024 / 1024).toFixed(1);
  console.log(`  Written: ${OUTPUT_FILE} (${fileSizeMB} MB)`);

  // Final stats
  console.log('\n=== Final Stats ===');
  console.log(`  Countries: ${countries.length}`);
  console.log(`  Regions:   ${regions.length}`);
  console.log(`  Cities:    ${cities.length}`);
  console.log(`  Total:     ${countries.length + regions.length + cities.length}`);
}

main().catch((err) => {
  console.error('Preprocessing failed:', err);
  process.exit(1);
});
