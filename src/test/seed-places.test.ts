import { describe, test, expect, vi, beforeEach } from 'vitest';
import { seedPlaces } from '@/lib/seed/seed-places';
import type { PrismaLikePlaces } from '@/lib/seed/seed-places';

// ---------------------------------------------------------------------------
// Sample places.json data (minimal fixtures)
// ---------------------------------------------------------------------------

const samplePlacesData = {
  countries: [
    {
      geonameId: 102358,
      nameAr: 'المملكة العربية السعودية',
      nameEn: 'Saudi Arabia',
      countryCode: 'SA',
      latitude: 25,
      longitude: 45,
    },
    {
      geonameId: 290557,
      nameAr: 'الإمارات العربية المتحدة',
      nameEn: 'United Arab Emirates',
      countryCode: 'AE',
      latitude: 24,
      longitude: 54,
    },
  ],
  regions: [
    {
      geonameId: 108410,
      nameAr: 'منطقة الرياض',
      nameEn: 'Riyadh Region',
      countryCode: 'SA',
      admin1Code: '10',
      parentGeonameId: 102358,
      latitude: 24.5,
      longitude: 45.5,
    },
    {
      geonameId: 104515,
      nameAr: 'منطقة مكة المكرمة',
      nameEn: 'Makkah Region',
      countryCode: 'SA',
      admin1Code: '02',
      parentGeonameId: 102358,
      latitude: 21.5,
      longitude: 40.5,
    },
  ],
  cities: [
    {
      geonameId: 108411,
      nameAr: 'الرياض',
      nameEn: 'Riyadh',
      countryCode: 'SA',
      admin1Code: '10',
      parentGeonameId: 108410,
      latitude: 24.69,
      longitude: 46.72,
      population: 4200000,
    },
    {
      geonameId: 104516,
      nameAr: 'جدة',
      nameEn: 'Jeddah',
      countryCode: 'SA',
      admin1Code: '02',
      parentGeonameId: 104515,
      latitude: 21.54,
      longitude: 39.17,
      population: 2800000,
    },
  ],
};

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockPlaceCount = vi.fn();
const mockPlaceCreateMany = vi.fn();

function createMockPrisma(): PrismaLikePlaces {
  return {
    place: {
      count: mockPlaceCount,
      createMany: mockPlaceCreateMany,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('seedPlaces', () => {
  let mockPrisma: PrismaLikePlaces;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    mockPlaceCreateMany.mockResolvedValue({ count: 0 });
  });

  test('skips seeding if global places already exist', async () => {
    mockPlaceCount.mockResolvedValue(100);

    const result = await seedPlaces(mockPrisma, samplePlacesData);

    expect(result.skipped).toBe(true);
    expect(mockPlaceCreateMany).not.toHaveBeenCalled();
  });

  test('inserts countries first with workspaceId null', async () => {
    mockPlaceCount.mockResolvedValue(0);
    mockPlaceCreateMany.mockResolvedValue({ count: 2 });

    await seedPlaces(mockPrisma, samplePlacesData);

    // First createMany call should be for countries
    const firstCall = mockPlaceCreateMany.mock.calls[0][0];
    const countryData = firstCall.data;

    expect(countryData).toHaveLength(2);
    expect(countryData[0]).toMatchObject({
      nameAr: 'المملكة العربية السعودية',
      nameEn: 'Saudi Arabia',
      workspaceId: null,
      latitude: 25,
      longitude: 45,
      parentId: null,
    });
    expect(countryData[1]).toMatchObject({
      nameAr: 'الإمارات العربية المتحدة',
      nameEn: 'United Arab Emirates',
      workspaceId: null,
    });
  });

  test('inserts regions with parentId set to their country UUID', async () => {
    mockPlaceCount.mockResolvedValue(0);
    mockPlaceCreateMany.mockResolvedValue({ count: 2 });

    const result = await seedPlaces(mockPrisma, samplePlacesData);

    // Second createMany call should be for regions
    const regionCall = mockPlaceCreateMany.mock.calls[1][0];
    const regionData = regionCall.data;

    expect(regionData).toHaveLength(2);

    // Both regions should have the Saudi Arabia country UUID as parentId
    const saudiUuid = result.geonameIdToDbId[102358];
    expect(saudiUuid).toBeDefined();
    expect(regionData[0].parentId).toBe(saudiUuid);
    expect(regionData[1].parentId).toBe(saudiUuid);
    expect(regionData[0].workspaceId).toBeNull();
  });

  test('inserts cities with parentId set to their region UUID', async () => {
    mockPlaceCount.mockResolvedValue(0);
    mockPlaceCreateMany.mockResolvedValue({ count: 2 });

    const result = await seedPlaces(mockPrisma, samplePlacesData);

    // Third createMany call should be for cities
    const cityCall = mockPlaceCreateMany.mock.calls[2][0];
    const cityData = cityCall.data;

    expect(cityData).toHaveLength(2);

    // Riyadh city -> Riyadh region
    const riyadhRegionUuid = result.geonameIdToDbId[108410];
    expect(cityData[0].parentId).toBe(riyadhRegionUuid);

    // Jeddah city -> Makkah region
    const makkahRegionUuid = result.geonameIdToDbId[104515];
    expect(cityData[1].parentId).toBe(makkahRegionUuid);
  });

  test('returns counts of inserted records', async () => {
    mockPlaceCount.mockResolvedValue(0);
    mockPlaceCreateMany
      .mockResolvedValueOnce({ count: 2 }) // countries
      .mockResolvedValueOnce({ count: 2 }) // regions
      .mockResolvedValueOnce({ count: 2 }); // cities

    const result = await seedPlaces(mockPrisma, samplePlacesData);

    expect(result.skipped).toBe(false);
    expect(result.countryCount).toBe(2);
    expect(result.regionCount).toBe(2);
    expect(result.cityCount).toBe(2);
  });

  test('returns geonameId to DB UUID mapping', async () => {
    mockPlaceCount.mockResolvedValue(0);
    mockPlaceCreateMany.mockResolvedValue({ count: 2 });

    const result = await seedPlaces(mockPrisma, samplePlacesData);

    // All geonameIds should be in the mapping
    expect(result.geonameIdToDbId[102358]).toBeDefined();
    expect(result.geonameIdToDbId[290557]).toBeDefined();
    expect(result.geonameIdToDbId[108410]).toBeDefined();
    expect(result.geonameIdToDbId[104515]).toBeDefined();
    expect(result.geonameIdToDbId[108411]).toBeDefined();
    expect(result.geonameIdToDbId[104516]).toBeDefined();

    // UUIDs should look like UUIDs (36 chars with dashes)
    const uuid = result.geonameIdToDbId[102358];
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test('batches large datasets in chunks of 1000', async () => {
    mockPlaceCount.mockResolvedValue(0);
    mockPlaceCreateMany.mockResolvedValue({ count: 1000 });

    // Create data with 2500 cities to test chunking
    const largeCitiesData = {
      countries: [samplePlacesData.countries[0]],
      regions: [samplePlacesData.regions[0]],
      cities: Array.from({ length: 2500 }, (_, i) => ({
        geonameId: 200000 + i,
        nameAr: `مدينة ${i}`,
        nameEn: `City ${i}`,
        countryCode: 'SA',
        admin1Code: '10',
        parentGeonameId: 108410,
        latitude: 24 + i * 0.01,
        longitude: 46 + i * 0.01,
        population: 50000 + i,
      })),
    };

    await seedPlaces(mockPrisma, largeCitiesData);

    // 1 call for countries + 1 call for regions + 3 calls for cities (2500 / 1000 = 3 batches)
    expect(mockPlaceCreateMany).toHaveBeenCalledTimes(5);

    // First city batch should have 1000 items
    const cityBatch1 = mockPlaceCreateMany.mock.calls[2][0].data;
    expect(cityBatch1).toHaveLength(1000);

    // Second city batch should have 1000 items
    const cityBatch2 = mockPlaceCreateMany.mock.calls[3][0].data;
    expect(cityBatch2).toHaveLength(1000);

    // Third city batch should have 500 items
    const cityBatch3 = mockPlaceCreateMany.mock.calls[4][0].data;
    expect(cityBatch3).toHaveLength(500);
  });

  test('falls back city parentId to country when region not found', async () => {
    mockPlaceCount.mockResolvedValue(0);
    mockPlaceCreateMany.mockResolvedValue({ count: 1 });

    const dataWithOrphanCity = {
      countries: [samplePlacesData.countries[0]],
      regions: [], // No regions
      cities: [
        {
          geonameId: 108411,
          nameAr: 'الرياض',
          nameEn: 'Riyadh',
          countryCode: 'SA',
          admin1Code: '10',
          parentGeonameId: 999999, // Non-existent region
          latitude: 24.69,
          longitude: 46.72,
          population: 4200000,
        },
      ],
    };

    const result = await seedPlaces(mockPrisma, dataWithOrphanCity);

    // Cities are the last createMany call (regions were empty so skipped)
    const lastCallIndex = mockPlaceCreateMany.mock.calls.length - 1;
    const cityCall = mockPlaceCreateMany.mock.calls[lastCallIndex][0];
    const cityData = cityCall.data;

    // Should fall back to country UUID since region wasn't found
    const saudiUuid = result.geonameIdToDbId[102358];
    expect(cityData[0].parentId).toBe(saudiUuid);
  });

  test('handles empty places data', async () => {
    mockPlaceCount.mockResolvedValue(0);

    const emptyData = { countries: [], regions: [], cities: [] };
    const result = await seedPlaces(mockPrisma, emptyData);

    expect(result.skipped).toBe(false);
    expect(result.countryCount).toBe(0);
    expect(result.regionCount).toBe(0);
    expect(result.cityCount).toBe(0);
    // No createMany calls when there's no data
    expect(mockPlaceCreateMany).not.toHaveBeenCalled();
  });
});
