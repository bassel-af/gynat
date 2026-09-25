/** A small family for the Sources people-picker tests (see source-people.test.ts). */
import type { GedcomData, Individual, Family, FamilyEvent } from '@/lib/gedcom/types';

const EV: FamilyEvent = { date: '', hijriDate: '', place: '', description: '', notes: '' };

export function buildPickerFamily(): GedcomData {
  const individuals: Record<string, Individual> = {};
  const families: Record<string, Family> = {};
  const ind = (id: string, givenName: string, sex: 'M' | 'F', over: Partial<Individual> = {}) => {
    individuals[id] = {
      id, type: 'INDI', name: givenName, givenName, surname: 'العطار', sex,
      birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
      death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
      kunya: '', notes: '', isDeceased: false, isPrivate: false,
      familiesAsSpouse: [], familyAsChild: null, ...over,
    } as Individual;
  };
  const fam = (id: string, husband: string | null, wife: string | null, children: string[]) => {
    families[id] = {
      id, type: 'FAM', husband, wife, children,
      marriageContract: EV, marriage: EV, divorce: EV, isDivorced: false,
    } as Family;
    if (husband) individuals[husband].familiesAsSpouse.push(id);
    if (wife) individuals[wife].familiesAsSpouse.push(id);
    for (const c of children) individuals[c].familyAsChild = id;
  };
  ind('GF', 'عبد الله', 'M');
  ind('M', 'محمد', 'M', { birth: '12 JAN 1931', birthHijriDate: '1350' });
  ind('W1', 'فاطمة', 'F');
  ind('W2', 'زينب', 'F');
  ind('K1', 'أحمد', 'M', { birthHijriDate: '1375' });
  ind('K2', 'سعاد', 'F', { birth: '1957' });
  ind('K3', 'خالد', 'M');
  ind('KP', 'خاص', 'M', { isPrivate: true });
  ind('KB', 'يوسف', 'M', { _pointed: true });
  ind('OTHER', 'عبد الرحمن', 'M');
  fam('F0', 'GF', null, ['M', 'OTHER']);
  fam('F1', 'M', 'W1', ['K1', 'K2', 'KP']);
  fam('F2', 'M', 'W2', ['K3', 'KB']);
  return { individuals, families };
}

