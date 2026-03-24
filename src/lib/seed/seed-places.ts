import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Types for the places.json data
// ---------------------------------------------------------------------------

export interface PlaceCountry {
  geonameId: number;
  nameAr: string;
  nameEn: string;
  countryCode: string;
  latitude: number;
  longitude: number;
}

export interface PlaceRegion {
  geonameId: number;
  nameAr: string;
  nameEn: string;
  countryCode: string;
  admin1Code: string;
  parentGeonameId: number;
  latitude: number;
  longitude: number;
}

export interface PlaceCity {
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

export interface PlacesData {
  countries: PlaceCountry[];
  regions: PlaceRegion[];
  cities: PlaceCity[];
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface SeedPlacesResult {
  skipped: boolean;
  countryCount: number;
  regionCount: number;
  cityCount: number;
  /** Mapping from GeoNames geonameId to the generated DB UUID */
  geonameIdToDbId: Record<number, string>;
}

// ---------------------------------------------------------------------------
// Prisma-like interface (for testability)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PrismaLikePlaces {
  place: {
    count: (args?: any) => Promise<number>;
    createMany: (args: { data: any[] }) => Promise<{ count: number }>;
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function insertInBatches(
  prismaPlace: PrismaLikePlaces['place'],
  records: Record<string, unknown>[],
): Promise<void> {
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await prismaPlace.createMany({ data: batch });
  }
}

// ---------------------------------------------------------------------------
// Build a country-code-to-geonameId lookup from countries data
// ---------------------------------------------------------------------------

function buildCountryCodeToGeonameId(
  countries: PlaceCountry[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of countries) {
    map.set(c.countryCode, c.geonameId);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

export async function seedPlaces(
  prisma: PrismaLikePlaces,
  data: PlacesData,
): Promise<SeedPlacesResult> {
  const geonameIdToDbId: Record<number, string> = {};

  // Check if already seeded
  const existingCount = await prisma.place.count({
    where: { workspaceId: null },
  });
  if (existingCount > 0) {
    return {
      skipped: true,
      countryCount: 0,
      regionCount: 0,
      cityCount: 0,
      geonameIdToDbId,
    };
  }

  // Early return for empty data
  if (
    data.countries.length === 0 &&
    data.regions.length === 0 &&
    data.cities.length === 0
  ) {
    return {
      skipped: false,
      countryCount: 0,
      regionCount: 0,
      cityCount: 0,
      geonameIdToDbId,
    };
  }

  // --- Countries ---
  const countryRecords = data.countries.map((c) => {
    const id = randomUUID();
    geonameIdToDbId[c.geonameId] = id;
    return {
      id,
      workspaceId: null,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      parentId: null,
      latitude: c.latitude,
      longitude: c.longitude,
    };
  });

  if (countryRecords.length > 0) {
    await insertInBatches(prisma.place, countryRecords);
  }

  // --- Regions ---
  const regionRecords = data.regions.map((r) => {
    const id = randomUUID();
    geonameIdToDbId[r.geonameId] = id;
    const parentId = geonameIdToDbId[r.parentGeonameId] ?? null;
    return {
      id,
      workspaceId: null,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      parentId,
      latitude: r.latitude,
      longitude: r.longitude,
    };
  });

  if (regionRecords.length > 0) {
    await insertInBatches(prisma.place, regionRecords);
  }

  // --- Cities ---
  const countryCodeToGeonameId = buildCountryCodeToGeonameId(data.countries);

  const cityRecords = data.cities.map((c) => {
    const id = randomUUID();
    geonameIdToDbId[c.geonameId] = id;
    // Try region first, fall back to country
    let parentId = geonameIdToDbId[c.parentGeonameId] ?? null;
    if (!parentId) {
      const countryGeonameId = countryCodeToGeonameId.get(c.countryCode);
      if (countryGeonameId !== undefined) {
        parentId = geonameIdToDbId[countryGeonameId] ?? null;
      }
    }
    return {
      id,
      workspaceId: null,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      parentId,
      latitude: c.latitude,
      longitude: c.longitude,
    };
  });

  if (cityRecords.length > 0) {
    await insertInBatches(prisma.place, cityRecords);
  }

  return {
    skipped: false,
    countryCount: countryRecords.length,
    regionCount: regionRecords.length,
    cityCount: cityRecords.length,
    geonameIdToDbId,
  };
}
