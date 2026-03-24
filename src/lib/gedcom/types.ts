export interface Individual {
  id: string;
  type: 'INDI';
  name: string;
  givenName: string;
  surname: string;
  sex: 'M' | 'F' | null;
  birth: string;
  birthPlace: string;
  birthDescription: string;
  birthNotes: string;
  death: string;
  deathPlace: string;
  deathDescription: string;
  deathNotes: string;
  notes: string;
  isDeceased: boolean;
  isPrivate: boolean;
  familiesAsSpouse: string[];
  familyAsChild: string | null;
}

export interface Family {
  id: string;
  type: 'FAM';
  husband: string | null;
  wife: string | null;
  children: string[];
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
