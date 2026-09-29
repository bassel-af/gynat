import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { GedcomData, Individual } from '@/lib/gedcom/types';

const mockFamilyTreeFindUnique = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    familyTree: { findUnique: (...a: unknown[]) => mockFamilyTreeFindUnique(...a) },
  },
}));

import { applyPublicRedaction, loadPublicTreeBySlug } from '@/lib/tree/public-serve';

function person(id: string, overrides: Partial<Individual> = {}): Individual {
  return {
    id, type: 'INDI', name: id, givenName: id, surname: '', sex: 'M',
    birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    kunya: '', famousName: 'هاشم', famousNameInNasab: true,
    notes: '', isDeceased: true, isPrivate: false, familiesAsSpouse: [], familyAsChild: null,
    ...overrides,
  };
}

const data = (): GedcomData => ({ individuals: { a: person('a') }, families: {} });
const SETTINGS = {
  enableKunya: true, enableFamousName: true,
  hideBirthDateForFemale: false, hideBirthDateForMale: false,
};

beforeEach(() => vi.clearAllMocks());

describe('applyPublicRedaction — famous name', () => {
  test('feature off → the public page carries no famous name', () => {
    const out = applyPublicRedaction(data(), { ...SETTINGS, enableFamousName: false });
    expect(out.individuals.a.famousName).toBeUndefined();
  });

  test('feature off → the public page carries no in-nasab choice', () => {
    const out = applyPublicRedaction(data(), { ...SETTINGS, enableFamousName: false });
    expect(out.individuals.a.famousNameInNasab).toBeUndefined();
  });

  test('feature on → a public person keeps the famous name', () => {
    const out = applyPublicRedaction(data(), SETTINGS);
    expect(out.individuals.a.famousName).toBe('هاشم');
  });
});

describe('loadPublicTreeBySlug — famous-name setting', () => {
  test('reads the owner\'s famous-name toggle into the record', async () => {
    mockFamilyTreeFindUnique.mockResolvedValue({
      id: 'tree-1', workspaceId: 'ws-1', nameAr: null, visibility: 'public_link',
      lastModifiedAt: new Date(), publicSlug: 'slug', kind: 'main', personPagesIndexable: false,
      workspace: {
        nameAr: 'آل', enableKunya: false, enableFamousName: true,
        hideBirthDateForFemale: false, hideBirthDateForMale: false,
      },
    });
    const rec = await loadPublicTreeBySlug('slug');
    expect(rec?.enableFamousName).toBe(true);
  });

  test('selects the famous-name toggle from the workspace', async () => {
    mockFamilyTreeFindUnique.mockResolvedValue(null);
    await loadPublicTreeBySlug('slug');
    const select = mockFamilyTreeFindUnique.mock.calls[0][0].select;
    expect(select.workspace.select.enableFamousName).toBe(true);
  });
});
