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
  notes: string;
  isDeceased: boolean;
  isPrivate: boolean;
  familiesAsSpouse: string[];
  familyAsChild: string | null;
  /** Set on individuals merged from a branch pointer (read-only in target tree) */
  _pointed?: boolean;
  /** Source workspace ID for pointed individuals */
  _sourceWorkspaceId?: string;
  /** Which pointer brought this individual in (target tree) */
  _pointerId?: string;
  /** True if this person is a shared branch root (source tree only) */
  _sharedRoot?: boolean;
}

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

export interface GedcomData {
  individuals: Record<string, Individual>;
  families: Record<string, Family>;
}

export interface RootAncestor {
  id: string;
  text: string;
}

export interface TreeConfig {
  maxDepth: number;
}
