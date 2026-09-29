import type { Individual } from '@/lib/gedcom/types';
import { getAlternateNameLine, getLeadName, isFamousNameLead } from '@/lib/gedcom/display';
import type { Gender } from '@/lib/tree/person-projection';

/** The name fields a projected person (subject or chip) carries. */
interface ProjectedNames {
  givenName: string;
  famousName?: string;
  famousNameInNasab?: boolean;
  gender: Gender;
}

/**
 * Adapt a projected person to the `Individual` shape the shared display
 * helpers (getLeadName, getNasabToken, getAlternateNameLine) read. Only the
 * name fields matter; `name` is the bare given name so the helpers' «famous
 * name equals real name» check compares like with like.
 */
export function asNamedIndividual(p: ProjectedNames): Individual {
  return {
    id: '',
    type: 'INDI',
    name: p.givenName,
    givenName: p.givenName,
    surname: '',
    sex: p.gender === 'female' ? 'F' : 'M',
    famousName: p.famousName ?? '',
    ...(typeof p.famousNameInNasab === 'boolean' ? { famousNameInNasab: p.famousNameInNasab } : {}),
    birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    kunya: '', notes: '', isDeceased: false, isPrivate: false,
    familiesAsSpouse: [], familyAsChild: null,
  };
}

/**
 * The two name lines of a person card (lineage card, relation chip): the lead
 * name as the main line, and the other name as a small grey line (or null).
 * When the real name leads, the card keeps its full display name (`name`).
 */
export function chipNameLines(p: ProjectedNames & { name: string }): {
  lead: string;
  alt: string | null;
} {
  const person = asNamedIndividual(p);
  return {
    lead: isFamousNameLead(person) ? getLeadName(person) : p.name,
    alt: getAlternateNameLine(person),
  };
}
