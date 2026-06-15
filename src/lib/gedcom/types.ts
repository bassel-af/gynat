export interface FamilyEvent {
  date: string;
  hijriDate: string;
  place: string;
  placeId?: string;
  description: string;
  notes: string;
}

export interface Individual {
  id: string;
  type: 'INDI';
  name: string;
  givenName: string;
  surname: string;
  sex: 'M' | 'F' | null;
  birth: string;
  birthPlace: string;
  birthPlaceId?: string;
  birthDescription: string;
  birthNotes: string;
  birthHijriDate: string;
  death: string;
  deathPlace: string;
  deathPlaceId?: string;
  deathDescription: string;
  deathNotes: string;
  deathHijriDate: string;
  kunya: string;
  notes: string;
  isDeceased: boolean;
  isPrivate: boolean;
  familiesAsSpouse: string[];
  familyAsChild: string | null;
  radaFamiliesAsChild?: string[];  // _RADA_FAM IDs (can be in multiple rada'a families)
  /** Set on individuals merged from a branch pointer (read-only in target tree) */
  _pointed?: boolean;
  /** Source workspace ID for pointed individuals */
  _sourceWorkspaceId?: string;
  /** Which pointer brought this individual in (target tree) */
  _pointerId?: string;
  /** True if this person is a shared branch root (source tree only) */
  _sharedRoot?: boolean;
  /**
   * Public visibility discriminant. Derived, response-only — never persisted
   * (not in Prisma). Set by `redactForPublic` on the serialized public
   * GedcomData. Undefined in the member view is equivalent to `'full'`.
   */
  publicDisplay?: 'full' | 'living' | 'redacted';
}

/**
 * Fields that must NEVER reach the anonymous public surface: internal
 * composition flags and cross-workspace place-id references. Co-located with
 * `Individual` so the strip list (used by `redactForPublic`) tracks the type —
 * adding a new internal `_`/`*PlaceId` field here keeps it out of public output.
 * NOTE: `publicDisplay` is intentionally NOT here — it is the public output.
 */
export const INTERNAL_INDIVIDUAL_KEYS = [
  '_pointed',
  '_sourceWorkspaceId',
  '_pointerId',
  '_sharedRoot',
  'birthPlaceId',
  'deathPlaceId',
] as const;

export interface Family {
  id: string;
  type: 'FAM';
  husband: string | null;
  wife: string | null;
  children: string[];
  marriageContract: FamilyEvent;
  marriage: FamilyEvent;
  divorce: FamilyEvent;
  isDivorced: boolean;
  isUmmWalad?: boolean;
  /** Set on families merged from a branch pointer (read-only in target tree) */
  _pointed?: boolean;
  /** Source workspace ID for pointed families */
  _sourceWorkspaceId?: string;
  /** Which pointer brought this family in (target tree) */
  _pointerId?: string;
}

export interface RadaFamily {
  id: string;
  type: '_RADA_FAM';
  fosterFather: string | null;  // individual ID
  fosterMother: string | null;  // individual ID
  children: string[];           // individual IDs
  notes: string;
}

export interface GedcomData {
  individuals: Record<string, Individual>;
  families: Record<string, Family>;
  radaFamilies?: Record<string, RadaFamily>;
}

export interface RootAncestor {
  id: string;
  text: string;
}

export interface TreeConfig {
  maxDepth: number;
}
