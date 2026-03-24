// ---------------------------------------------------------------------------
// GeoNames TSV line parsers
// ---------------------------------------------------------------------------
// Pure functions that parse individual lines from GeoNames data files.
// These are used by the preprocessing script (scripts/preprocess-geonames.ts).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Country sets and population thresholds
// ---------------------------------------------------------------------------

export const ARAB_COUNTRIES = new Set([
  'SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'EG', 'JO', 'LB', 'SY', 'IQ', 'PS',
  'YE', 'MA', 'DZ', 'TN', 'LY', 'SD', 'SO', 'MR', 'DJ', 'KM',
]);

export const NEIGHBOR_COUNTRIES = new Set(['TR', 'IR', 'PK', 'AF']);

export function getCityPopulationThreshold(countryCode: string): number {
  if (ARAB_COUNTRIES.has(countryCode)) return 500;
  if (NEIGHBOR_COUNTRIES.has(countryCode)) return 5000;
  return 50000;
}

// ---------------------------------------------------------------------------
// Parsed types
// ---------------------------------------------------------------------------

export interface ParsedCountryInfo {
  countryCode: string;
  nameEn: string;
  geonameId: number;
}

export interface ParsedAdmin1 {
  countryCode: string;
  admin1Code: string;
  nameEn: string;
  geonameId: number;
}

export interface ParsedCity {
  geonameId: number;
  nameEn: string;
  countryCode: string;
  admin1Code: string;
  latitude: number;
  longitude: number;
  population: number;
}

export interface ParsedAlternateName {
  geonameId: number;
  isoLanguage: string;
  alternateName: string;
  isPreferred: boolean;
}

// ---------------------------------------------------------------------------
// Line parsers
// ---------------------------------------------------------------------------

/**
 * Parse a line from countryInfo.txt.
 * Returns null for comment lines (starting with #) and empty lines.
 */
export function parseCountryInfoLine(line: string): ParsedCountryInfo | null {
  if (!line || line.startsWith('#')) return null;

  const cols = line.split('\t');
  if (cols.length < 17) return null;

  return {
    countryCode: cols[0],
    nameEn: cols[4],
    geonameId: parseInt(cols[16], 10),
  };
}

/**
 * Parse a line from admin1CodesASCII.txt.
 * Format: {countryCode}.{admin1Code}\tname\tasciiName\tgeonameId
 */
export function parseAdmin1Line(line: string): ParsedAdmin1 | null {
  if (!line) return null;

  const cols = line.split('\t');
  if (cols.length < 4) return null;

  const codeParts = cols[0].split('.');
  if (codeParts.length < 2) return null;

  return {
    countryCode: codeParts[0],
    admin1Code: codeParts[1],
    nameEn: cols[1],
    geonameId: parseInt(cols[3], 10),
  };
}

/**
 * Parse a line from cities500.txt.
 * Columns: geonameId, name, asciiName, alternateNames, lat, lon,
 * featureClass, featureCode, countryCode, cc2, admin1Code, admin2Code,
 * admin3Code, admin4Code, population, elevation, dem, timezone, modificationDate
 */
export function parseCityLine(line: string): ParsedCity | null {
  if (!line) return null;

  const cols = line.split('\t');
  if (cols.length < 15) return null;

  return {
    geonameId: parseInt(cols[0], 10),
    nameEn: cols[1],
    countryCode: cols[8],
    admin1Code: cols[10],
    latitude: parseFloat(cols[4]),
    longitude: parseFloat(cols[5]),
    population: parseInt(cols[14], 10),
  };
}

/**
 * Parse a line from alternateNamesV2.txt.
 * Columns: alternateNameId, geonameId, isoLanguage, alternateName,
 * isPreferred, isShort, isColloquial, isHistoric, from, to
 */
export function parseAlternateNameLine(line: string): ParsedAlternateName | null {
  if (!line) return null;

  const cols = line.split('\t');
  if (cols.length < 4) return null;

  return {
    geonameId: parseInt(cols[1], 10),
    isoLanguage: cols[2],
    alternateName: cols[3],
    isPreferred: cols[4] === '1',
  };
}
