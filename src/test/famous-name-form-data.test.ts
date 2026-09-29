import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Individual, GedcomData } from '@/lib/gedcom/types';
import type { IndividualFormData } from '@/components/tree/IndividualForm/IndividualForm';
import type { UndoEntry } from '@/lib/undo/types';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

import { usePersonActions } from '@/hooks/usePersonActions';
import { apiFetch } from '@/lib/api/client';
import {
  buildEditInitialData,
  serializeIndividualForm,
  personUndoSnapshot,
} from '@/lib/person-detail-helpers';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

function makeIndividual(overrides: Partial<Individual> = {}): Individual {
  return {
    id: '@I1@',
    type: 'INDI',
    name: 'عبدالمطلب',
    givenName: 'عبدالمطلب',
    surname: 'الهاشمي',
    sex: 'M',
    birth: '1950',
    birthPlace: 'مكة',
    birthPlaceId: 'pl-1',
    birthDescription: 'وصف',
    birthNotes: 'ملاحظة',
    birthHijriDate: '1370',
    death: '2000',
    deathPlace: 'المدينة',
    deathPlaceId: 'pl-2',
    deathDescription: 'وصف2',
    deathNotes: 'ملاحظة2',
    deathHijriDate: '1420',
    kunya: 'أبو الحارث',
    notes: 'نص',
    isDeceased: true,
    isPrivate: false,
    familiesAsSpouse: [],
    familyAsChild: null,
    ...overrides,
  };
}

/** What the edit form submits: EMPTY_FORM + initial data + the user's change. */
function editRoundTrip(person: Individual, change: Partial<IndividualFormData>): Record<string, unknown> {
  const initial = buildEditInitialData(person) as Partial<IndividualFormData>;
  return serializeIndividualForm({ ...(initial as IndividualFormData), ...change });
}

describe('famous name — form data round trip', () => {
  it('an explicit false choice survives an unrelated edit', () => {
    const person = makeIndividual({ famousName: 'شيبة', famousNameInNasab: false });
    const payload = editRoundTrip(person, { notes: 'تعديل' });
    expect(payload.famousNameInNasab).toBe(false);
  });

  it('a saved true choice survives an unrelated edit', () => {
    const person = makeIndividual({ famousName: 'شيبة', famousNameInNasab: true });
    expect(editRoundTrip(person, { notes: 'تعديل' }).famousNameInNasab).toBe(true);
  });

  it('an unset choice stays null (never coerced to false)', () => {
    const person = makeIndividual({ famousName: 'شيبة' });
    expect(buildEditInitialData(person).famousNameInNasab).toBeNull();
    expect(editRoundTrip(person, { notes: 'تعديل' }).famousNameInNasab).toBeNull();
  });

  it('the famous name itself survives an unrelated edit', () => {
    const person = makeIndividual({ famousName: 'شيبة' });
    expect(editRoundTrip(person, { notes: 'تعديل' }).famousName).toBe('شيبة');
  });

  it('a person without a famous name sends null', () => {
    expect(editRoundTrip(makeIndividual(), {}).famousName).toBeNull();
  });

  it('clearing the famous name sends famousNameInNasab null', () => {
    const person = makeIndividual({ famousName: 'شيبة', famousNameInNasab: false });
    const payload = editRoundTrip(person, { famousName: '' });
    expect(payload.famousName).toBeNull();
    expect(payload.famousNameInNasab).toBeNull();
  });
});

describe('personUndoSnapshot', () => {
  it('keeps every field the hand-written snapshots carried, plus both famous-name fields', () => {
    const person = makeIndividual({ famousName: 'شيبة', famousNameInNasab: false });
    expect(personUndoSnapshot(person)).toEqual({
      givenName: 'عبدالمطلب',
      surname: 'الهاشمي',
      sex: 'M',
      birthDate: '1950',
      birthPlace: 'مكة',
      birthPlaceId: 'pl-1',
      birthDescription: 'وصف',
      birthNotes: 'ملاحظة',
      birthHijriDate: '1370',
      deathDate: '2000',
      deathPlace: 'المدينة',
      deathPlaceId: 'pl-2',
      deathDescription: 'وصف2',
      deathNotes: 'ملاحظة2',
      deathHijriDate: '1420',
      kunya: 'أبو الحارث',
      famousName: 'شيبة',
      famousNameInNasab: false,
      isDeceased: true,
      isPrivate: false,
      notes: 'نص',
    });
  });

  it('an unset choice snapshots as null', () => {
    const snap = personUndoSnapshot(makeIndividual({ famousName: 'شيبة' }));
    expect(snap.famousNameInNasab).toBeNull();
  });
});

describe('usePersonActions — undo restores the famous name', () => {
  let refreshTree: Mock<() => Promise<void>>;
  let onPushUndo: Mock<(entry: UndoEntry) => void>;

  beforeEach(() => {
    mockApiFetch.mockReset();
    refreshTree = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    onPushUndo = vi.fn<(entry: UndoEntry) => void>();
  });

  function renderActions(person: Individual) {
    const data: GedcomData = { individuals: { '@I1@': person }, families: {} };
    return renderHook(() =>
      usePersonActions({
        personId: '@I1@',
        workspace: { workspaceId: 'ws-1', canEdit: true, refreshTree },
        person,
        data,
        setSelectedPersonId: vi.fn(),
        onPushUndo,
      }),
    );
  }

  function bodyOf(call: unknown[]): Record<string, unknown> {
    return JSON.parse((call[1] as { body: string }).body);
  }

  it('edit then undo PATCHes both famous-name fields back', async () => {
    mockApiFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    const person = makeIndividual({ famousName: 'شيبة', famousNameInNasab: false });
    const { result } = renderActions(person);
    const edited = {
      ...(buildEditInitialData(person) as unknown as IndividualFormData),
      famousName: '',
    };
    await act(async () => {
      await result.current.handleEditSubmit(edited);
    });
    const entry = onPushUndo.mock.calls[0][0] as UndoEntry;
    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    await entry.undo();
    const patch = mockApiFetch.mock.calls.find((c) => (c[1] as { method?: string })?.method === 'PATCH');
    expect(patch).toBeDefined();
    const body = bodyOf(patch!);
    expect(body.famousName).toBe('شيبة');
    expect(body.famousNameInNasab).toBe(false);
  });

  it('delete then undo re-POSTs both famous-name fields', async () => {
    mockApiFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { hasImpact: false } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { entries: [], inherited: null } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const person = makeIndividual({ famousName: 'شيبة', famousNameInNasab: true });
    const { result } = renderActions(person);
    await act(async () => {
      await result.current.handleDeleteClick();
    });
    await act(async () => {
      await result.current.handleCascadeConfirm();
    });
    const entry = onPushUndo.mock.calls[0][0] as UndoEntry;
    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValue(new Response(JSON.stringify({ data: { id: '@I99@' } }), { status: 201 }));
    await entry.undo();
    const post = mockApiFetch.mock.calls.find(
      (c) => c[0] === '/api/workspaces/ws-1/tree/individuals' && (c[1] as { method?: string })?.method === 'POST',
    );
    expect(post).toBeDefined();
    const body = bodyOf(post!);
    expect(body.famousName).toBe('شيبة');
    expect(body.famousNameInNasab).toBe(true);
  });
});
