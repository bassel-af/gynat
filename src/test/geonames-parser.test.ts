import { describe, test, expect } from 'vitest';
import {
  parseCountryInfoLine,
  parseAdmin1Line,
  parseCityLine,
  parseAlternateNameLine,
  ARAB_COUNTRIES,
  NEIGHBOR_COUNTRIES,
  getCityPopulationThreshold,
} from '@/lib/seed/geonames-parser';

// ---------------------------------------------------------------------------
// countryInfo.txt parsing
// ---------------------------------------------------------------------------

describe('parseCountryInfoLine', () => {
  test('parses a valid country line', () => {
    // countryInfo.txt columns (tab-separated):
    // ISO, ISO3, ISONumeric, fips, Country, Capital, Area, Population, Continent,
    // tld, CurrencyCode, CurrencyName, Phone, PostalCodeFormat, PostalCodeRegex,
    // Languages, geonameId, neighbours, EquivalentFipsCode
    const line = 'SA\tSAU\t682\tSA\tSaudi Arabia\tRiyadh\t2149690\t34813871\tAS\t.sa\tSAR\tSaudi Riyal\t966\t#####\t^(\\d{5})$\tar-SA\t102358\tQA,OM,IQ,YE,JO,AE,KW\t';

    const result = parseCountryInfoLine(line);

    expect(result).not.toBeNull();
    expect(result!.countryCode).toBe('SA');
    expect(result!.nameEn).toBe('Saudi Arabia');
    expect(result!.geonameId).toBe(102358);
  });

  test('returns null for comment lines', () => {
    const line = '# ISO\tISO3\tISO-Numeric\tfips\tCountry\tCapital';
    expect(parseCountryInfoLine(line)).toBeNull();
  });

  test('returns null for empty lines', () => {
    expect(parseCountryInfoLine('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// admin1CodesASCII.txt parsing
// ---------------------------------------------------------------------------

describe('parseAdmin1Line', () => {
  test('parses a valid admin1 line', () => {
    // Format: {countryCode}.{admin1Code}\tname\tasciiName\tgeonameId
    const line = 'SA.01\tRiyadh Region\tRiyadh Region\t108410';

    const result = parseAdmin1Line(line);

    expect(result).not.toBeNull();
    expect(result!.countryCode).toBe('SA');
    expect(result!.admin1Code).toBe('01');
    expect(result!.nameEn).toBe('Riyadh Region');
    expect(result!.geonameId).toBe(108410);
  });

  test('returns null for empty lines', () => {
    expect(parseAdmin1Line('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cities500.txt parsing
// ---------------------------------------------------------------------------

describe('parseCityLine', () => {
  test('parses a valid city line', () => {
    // cities500.txt columns (tab-separated):
    // 0: geonameId, 1: name, 2: asciiName, 3: alternateNames, 4: latitude,
    // 5: longitude, 6: featureClass, 7: featureCode, 8: countryCode,
    // 9: cc2, 10: admin1Code, 11: admin2Code, 12: admin3Code, 13: admin4Code,
    // 14: population, 15: elevation, 16: dem, 17: timezone, 18: modificationDate
    const line = '108411\tRiyadh\tRiyadh\tRiyad,ar-Riyad\t24.6877\t46.7219\tP\tPPLC\tSA\t\t10\t\t\t\t4205961\t\t612\tAsia/Riyadh\t2023-11-08';

    const result = parseCityLine(line);

    expect(result).not.toBeNull();
    expect(result!.geonameId).toBe(108411);
    expect(result!.nameEn).toBe('Riyadh');
    expect(result!.countryCode).toBe('SA');
    expect(result!.admin1Code).toBe('10');
    expect(result!.latitude).toBeCloseTo(24.6877);
    expect(result!.longitude).toBeCloseTo(46.7219);
    expect(result!.population).toBe(4205961);
  });

  test('returns null for empty lines', () => {
    expect(parseCityLine('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// alternateNamesV2.txt parsing
// ---------------------------------------------------------------------------

describe('parseAlternateNameLine', () => {
  test('parses an Arabic alternate name line', () => {
    // alternateNamesV2.txt columns (tab-separated):
    // 0: alternateNameId, 1: geonameId, 2: isoLanguage, 3: alternateName,
    // 4: isPreferred, 5: isShort, 6: isColloquial, 7: isHistoric, 8: from, 9: to
    const line = '12345\t102358\tar\tالمملكة العربية السعودية\t1\t\t\t\t\t';

    const result = parseAlternateNameLine(line);

    expect(result).not.toBeNull();
    expect(result!.geonameId).toBe(102358);
    expect(result!.isoLanguage).toBe('ar');
    expect(result!.alternateName).toBe('المملكة العربية السعودية');
    expect(result!.isPreferred).toBe(true);
  });

  test('parses a non-preferred name', () => {
    const line = '12346\t102358\tar\tالسعودية\t\t\t\t\t\t';

    const result = parseAlternateNameLine(line);

    expect(result).not.toBeNull();
    expect(result!.isPreferred).toBe(false);
  });

  test('parses an English alternate name line', () => {
    const line = '12347\t102358\ten\tKingdom of Saudi Arabia\t1\t\t\t\t\t';

    const result = parseAlternateNameLine(line);

    expect(result).not.toBeNull();
    expect(result!.isoLanguage).toBe('en');
    expect(result!.alternateName).toBe('Kingdom of Saudi Arabia');
  });

  test('returns null for empty lines', () => {
    expect(parseAlternateNameLine('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Population thresholds
// ---------------------------------------------------------------------------

describe('getCityPopulationThreshold', () => {
  test('returns 500 for Arab countries', () => {
    expect(getCityPopulationThreshold('SA')).toBe(500);
    expect(getCityPopulationThreshold('AE')).toBe(500);
    expect(getCityPopulationThreshold('EG')).toBe(500);
    expect(getCityPopulationThreshold('JO')).toBe(500);
  });

  test('returns 5000 for neighboring countries', () => {
    expect(getCityPopulationThreshold('TR')).toBe(5000);
    expect(getCityPopulationThreshold('IR')).toBe(5000);
    expect(getCityPopulationThreshold('PK')).toBe(5000);
    expect(getCityPopulationThreshold('AF')).toBe(5000);
  });

  test('returns 50000 for rest of world', () => {
    expect(getCityPopulationThreshold('US')).toBe(50000);
    expect(getCityPopulationThreshold('GB')).toBe(50000);
    expect(getCityPopulationThreshold('JP')).toBe(50000);
  });
});

// ---------------------------------------------------------------------------
// Country sets
// ---------------------------------------------------------------------------

describe('country sets', () => {
  test('ARAB_COUNTRIES contains expected countries', () => {
    expect(ARAB_COUNTRIES.has('SA')).toBe(true);
    expect(ARAB_COUNTRIES.has('AE')).toBe(true);
    expect(ARAB_COUNTRIES.has('KW')).toBe(true);
    expect(ARAB_COUNTRIES.has('US')).toBe(false);
  });

  test('NEIGHBOR_COUNTRIES contains expected countries', () => {
    expect(NEIGHBOR_COUNTRIES.has('TR')).toBe(true);
    expect(NEIGHBOR_COUNTRIES.has('IR')).toBe(true);
    expect(NEIGHBOR_COUNTRIES.has('SA')).toBe(false);
  });
});
