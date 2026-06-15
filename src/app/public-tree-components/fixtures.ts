/**
 * Static placeholder fixtures for the Public Tree component preview harness.
 *
 * These are illustrative only — NOT real data and NOT the production data
 * shapes. The TDD phase replaces these with server-computed view models. Prop
 * interfaces on the components are the contract; these fixtures just satisfy
 * them so the owner can view the real UI.
 */

import type { GedcomData } from '@/lib/gedcom/types';
import type {
  CheckpointPerson,
  CheckpointHousehold,
  PublishCheckpointData,
} from '@/components/public-tree/PublishCheckpoint';

// --- A small redacted public tree (already-redacted, as the server would send) ---
// Living people have birth/birthHijriDate/places cleared; a private person is
// present as a redacted entry. The components never re-derive any of this.

function makeIndividual(
  partial: Partial<GedcomData['individuals'][string]> & { id: string },
): GedcomData['individuals'][string] {
  return {
    type: 'INDI',
    name: '',
    givenName: '',
    surname: '',
    sex: null,
    birth: '',
    birthPlace: '',
    birthDescription: '',
    birthNotes: '',
    birthHijriDate: '',
    death: '',
    deathPlace: '',
    deathDescription: '',
    deathNotes: '',
    deathHijriDate: '',
    kunya: '',
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    familyAsChild: null,
    ...partial,
  };
}

export const sampleTree: GedcomData = {
  individuals: {
    i1: makeIndividual({
      id: 'i1',
      name: 'محمد السعيد',
      givenName: 'محمد',
      surname: 'السعيد',
      sex: 'M',
      birth: '1870',
      birthHijriDate: '1287',
      birthPlace: 'حلب',
      death: '1945',
      deathHijriDate: '1364',
      deathPlace: 'دمشق',
      kunya: 'أبو أحمد',
      notes:
        'من أعيان تجّار حلب، رحل بأسرته إلى دمشق سنة ١٣٢٤ هـ، وأسّس بيت السعيد الكبير في حيّ الصّالحيّة.',
      isDeceased: true,
      familiesAsSpouse: ['f1'],
    }),
    i2: makeIndividual({
      id: 'i2',
      name: 'أحمد السعيد',
      givenName: 'أحمد',
      surname: 'السعيد',
      sex: 'M',
      birth: '1902',
      death: '1978',
      isDeceased: true,
      familyAsChild: 'f1',
    }),
    i3: makeIndividual({
      id: 'i3',
      name: 'يوسف السعيد',
      givenName: 'يوسف',
      surname: 'السعيد',
      sex: 'M',
      kunya: 'أبو محمّد',
      // living — birth withheld by server (empty), not deceased
      notes: 'مهندسٌ مدنيّ، أسهم في ترميم عددٍ من البيوت التراثيّة في المدينة القديمة.',
      isDeceased: false,
      familyAsChild: 'f1',
    }),
    i4: makeIndividual({
      id: 'i4',
      // private / redacted — server sends a placeholder
      name: 'خاص',
      sex: 'M',
      isPrivate: true,
      familyAsChild: 'f1',
    }),
  },
  families: {
    f1: {
      id: 'f1',
      type: 'FAM',
      husband: 'i1',
      wife: null,
      children: ['i2', 'i3', 'i4'],
      marriageContract: { date: '', hijriDate: '', place: '', description: '', notes: '' },
      marriage: { date: '', hijriDate: '', place: '', description: '', notes: '' },
      divorce: { date: '', hijriDate: '', place: '', description: '', notes: '' },
      isDivorced: false,
    },
  },
};

// --- Publish checkpoint view-model fixture ---
// Uses the component's canonical view-model types (the contract for the TDD phase).

const checkpointAttention: CheckpointPerson[] = [
  { id: 'a1', name: 'سامي السعيد', gender: 'male', meta: 'بلا تاريخ ميلاد · بلا علامة وفاة', needsAttention: true },
  { id: 'a2', name: 'هدى السعيد', gender: 'female', meta: 'بلا تاريخ ميلاد · بلا علامة وفاة', needsAttention: true },
];

const checkpointHouseholds: CheckpointHousehold[] = [
  {
    id: 'h1',
    title: 'بيت أحمد السعيد',
    members: [
      { id: 'h1a', name: 'يوسف بن أحمد', gender: 'male', meta: 'وُلد ١٩٧٢' },
      { id: 'h1b', name: 'ليلى بنت أحمد', gender: 'female', meta: 'وُلدت ١٩٧٥' },
      { id: 'h1c', name: 'رنا بنت أحمد', gender: 'female', meta: 'وُلدت ١٩٨٠' },
    ],
  },
  {
    id: 'h2',
    title: 'بيت خالد السعيد',
    members: [
      { id: 'h2a', name: 'عمر بن خالد', gender: 'male', meta: 'وُلد ١٩٧٨' },
      { id: 'h2b', name: 'مريم بنت خالد', gender: 'female', meta: 'وُلدت ١٩٨٢' },
    ],
  },
];

export const checkpointData: PublishCheckpointData = {
  livingCount: 47,
  attention: checkpointAttention,
  households: checkpointHouseholds,
};
