/**
 * «اسم الشهرة» in the person panel (U6): the hero leads with the famous name
 * and shows the other name on a grey line; the gold kunya is hidden when it is
 * the famous name itself; relatives lists, the marriage header, the move
 * picker and the «قفزة نسب» preview all go by the lead name.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Family, GedcomData, Individual } from '@/lib/gedcom/types';

function ind(id: string, over: Partial<Individual> = {}): Individual {
  return {
    id, type: 'INDI', name: id, givenName: id, surname: '', sex: 'M',
    birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    kunya: '', notes: '', isDeceased: true, isPrivate: false,
    familiesAsSpouse: [], familyAsChild: null, ...over,
  };
}
const EV = { date: '', hijriDate: '', place: '', description: '', notes: '' };
function fam(id: string, husband: string | null, wife: string | null, children: string[] = []): Family {
  return { id, type: 'FAM', husband, wife, children, marriageContract: EV, marriage: EV, divorce: EV, isDivorced: false };
}

/** هاشم ← عبدالمطلب ← أبو طالب (+ فاطمة) ← علي. */
function makeData(): GedcomData {
  return {
    individuals: {
      HASHIM: ind('HASHIM', { name: 'عمرو', givenName: 'عمرو', famousName: 'هاشم', familiesAsSpouse: ['F0'] }),
      AM: ind('AM', {
        name: 'شيبة', givenName: 'شيبة', famousName: 'عبدالمطلب', kunya: 'أبو الحارث',
        familyAsChild: 'F0', familiesAsSpouse: ['F1'],
      }),
      AT: ind('AT', {
        name: 'عبدمناف', givenName: 'عبدمناف', famousName: 'أبو طالب', kunya: 'أبو طالب',
        familyAsChild: 'F1', familiesAsSpouse: ['F2'],
      }),
      FATIMA: ind('FATIMA', { name: 'فاطمة', givenName: 'فاطمة', sex: 'F', familiesAsSpouse: ['F2'] }),
      ALI: ind('ALI', { name: 'علي', givenName: 'علي', kunya: 'أبو الحسن', familyAsChild: 'F2' }),
    },
    families: {
      F0: fam('F0', 'HASHIM', null, ['AM']),
      F1: fam('F1', 'AM', null, ['AT']),
      F2: fam('F2', 'AT', 'FATIMA', ['ALI']),
    },
  };
}

let panelData: GedcomData = makeData();

vi.mock('@/context/TreeContext', () => ({
  useTree: () => ({
    data: panelData,
    selectedRootId: 'HASHIM',
    visiblePersonIds: new Set(Object.keys(panelData.individuals)),
    graftPersonIds: new Set<string>(),
    setSelectedPersonId: vi.fn(),
    setSelectedRootId: vi.fn(),
    setFocusPersonId: vi.fn(),
    setHighlightedPersonId: vi.fn(),
    setMobileSidebarOpen: vi.fn(),
  }),
}));
vi.mock('@/context/WorkspaceTreeContext', () => ({
  useOptionalWorkspaceTree: () => ({
    workspaceId: 'ws', canEdit: false, isAdmin: false, refreshTree: async () => undefined, pointers: [],
  }),
}));
vi.mock('@/context/UndoStackContext', () => ({ useOptionalUndoStack: () => null }));
vi.mock('@/hooks/useCalendarPreference', () => ({
  useCalendarPreference: () => ({ preference: 'hijri', setPreference: vi.fn(), loading: false }),
}));
vi.mock('@/hooks/usePersonSources', () => ({
  usePersonSources: () => ({ entries: [], inherited: null, loaded: false, error: false, refetch: vi.fn() }),
  notifySourcesChanged: vi.fn(),
}));
vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn(async () => new Response('{}')) }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'abc' }),
  usePathname: () => '/workspaces/abc/tree',
  useRouter: () => ({ push: vi.fn() }),
}));

import { PersonDetail } from '@/components/ui/Sidebar/PersonDetail';
import { MoveSubtreeModal } from '@/components/tree/MoveSubtreeModal';
import { AncestryJumpForm } from '@/components/tree/AncestryJumpForm';
import { getFamiliesForPicker, getTargetFamiliesForMove } from '@/lib/person-detail-helpers';

beforeEach(() => {
  panelData = makeData();
  vi.stubGlobal('matchMedia', () => ({ matches: false }) as MediaQueryList);
});
afterEach(() => vi.unstubAllGlobals());

const heroName = () => screen.getByRole('heading', { level: 2 }).textContent;

describe('person panel hero', () => {
  it('leads with the famous name and shows the real name on a grey line', () => {
    render(<PersonDetail personId="AM" />);
    expect(heroName()).toBe('عبدالمطلب');
    expect(screen.getByText('واسمه شيبة')).toBeTruthy();
  });

  it('shows a kunya that differs from the famous name', () => {
    render(<PersonDetail personId="AM" />);
    expect(screen.getByText('أبو الحارث')).toBeTruthy();
  });

  it('does not repeat a kunya that is the famous name itself', () => {
    render(<PersonDetail personId="AT" />);
    expect(heroName()).toBe('أبو طالب');
    expect(screen.getAllByText('أبو طالب')).toHaveLength(1);
  });

  it('is unchanged for a person without a famous name', () => {
    render(<PersonDetail personId="ALI" />);
    expect(heroName()).toBe('علي');
    expect(screen.getByText('أبو الحسن')).toBeTruthy();
  });
});

describe('person panel relatives', () => {
  it('lists a parent by his famous name with his real name on a grey line', () => {
    render(<PersonDetail personId="ALI" />);
    expect(screen.getByText('أبو طالب')).toBeTruthy();
    expect(screen.getByText('واسمه عبدمناف')).toBeTruthy();
  });

  it('names the spouse by the lead name everywhere, marriage header included', () => {
    render(<PersonDetail personId="FATIMA" />);
    expect(screen.getAllByText('أبو طالب').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('عبدمناف')).toBeNull();
  });
});

describe('getFamiliesForPicker', () => {
  it('names the spouse by the lead name', () => {
    const data = makeData();
    const [row] = getFamiliesForPicker(data.individuals.FATIMA, data);
    expect(row.spouseName).toBe('أبو طالب');
  });
});

describe('move-subtree options', () => {
  it('carries the parent\'s other name as the family option\'s grey line', () => {
    const data = makeData();
    data.individuals.C = ind('C', { name: 'قصي', givenName: 'قصي' });
    const target = getTargetFamiliesForMove(data.individuals.C, data, new Set(['C'])).find((f) => f.familyId === 'F1');
    expect(target?.alternate).toBe('واسمه شيبة');
  });

  it('joins both parents\' other names with « · »', () => {
    const data = makeData();
    data.individuals.FATIMA = { ...data.individuals.FATIMA, famousName: 'أم علي' };
    data.individuals.C = ind('C', { name: 'قصي', givenName: 'قصي' });
    const target = getTargetFamiliesForMove(data.individuals.C, data, new Set(['C'])).find((f) => f.familyId === 'F2');
    expect(target?.alternate).toBe('واسمه عبدمناف · واسمها فاطمة');
  });

  it('has no grey line when no parent has a famous name', () => {
    const data = makeData();
    data.individuals.P = ind('P', { name: 'مرة', givenName: 'مرة', familiesAsSpouse: ['F9'] });
    data.families.F9 = fam('F9', 'P', null);
    data.individuals.C = ind('C', { name: 'قصي', givenName: 'قصي' });
    const target = getTargetFamiliesForMove(data.individuals.C, data, new Set(['C'])).find((f) => f.familyId === 'F9');
    expect(target?.alternate).toBeNull();
  });

  it('shows an option\'s grey line in the picker', () => {
    render(
      <MoveSubtreeModal
        isOpen onClose={vi.fn()} onConfirm={vi.fn()}
        options={[{ kind: 'solo', individualId: 'AT', name: 'أبو طالب بن عبدالمطلب', sex: 'M', alternate: 'واسمه عبدمناف' }]}
        personName="علي" descendantCount={0} intent="assign"
      />,
    );
    expect(screen.getByText('واسمه عبدمناف')).toBeTruthy();
  });
});

describe('«قفزة نسب» preview', () => {
  function renderJumpForm(data: GedcomData) {
    render(
      <AncestryJumpForm mode="create" person={data.individuals.C} data={data} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'شخص موجود في الشجرة' }));
  }
  function pick(name: string) {
    fireEvent.change(screen.getByPlaceholderText('ابحث عن شخص...'), { target: { value: name } });
    fireEvent.mouseDown(screen.getAllByRole('option')[0]);
  }

  it('puts a lone ancestor\'s famous name in the genitive after «من وَلَد»', async () => {
    const data = makeData();
    data.individuals.LAHAB = ind('LAHAB', { name: 'عبدالعزى', givenName: 'عبدالعزى', famousName: 'أبو لهب' });
    data.individuals.C = ind('C', { name: 'قصي', givenName: 'قصي' });
    renderJumpForm(data);
    pick('أبو لهب');
    await waitFor(() => screen.getByLabelText('من'));
    expect(screen.getByText(/قصي، من وَلَد أبي لهب/)).toBeTruthy();
  });

  it('puts the chosen couple\'s husband in the genitive after «من وَلَد»', async () => {
    const data = makeData();
    data.individuals.C = ind('C', { name: 'قصي', givenName: 'قصي' });
    renderJumpForm(data);
    pick('أبو طالب');
    await waitFor(() => screen.getByText('اختر العائلة'));
    fireEvent.click(screen.getByRole('radio'));
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    await waitFor(() => screen.getByLabelText('من'));
    expect(screen.getByText(/قصي، من وَلَد أبي طالب/)).toBeTruthy();
  });
});
