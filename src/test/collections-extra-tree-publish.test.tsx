import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// ExtraTreePublishModal (Slice B) — the make-public ladder for a single extra
// tree. It reuses the same visibility route as the main tree, scoped to treeId.
// These tests pin: (1) going public sends the chosen level + treeId + the typed
// phrase, (2) the phrase gate blocks save until something is typed, (3) a
// public→public switch sends NO phrase. Partial-mock the api so setTreeVisibility
// is stubbed while the pure types stay intact.
// ---------------------------------------------------------------------------

const mockSetTreeVisibility = vi.fn();

vi.mock('@/lib/collections/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/collections/api')>(
    '@/lib/collections/api',
  );
  return {
    ...actual,
    setTreeVisibility: (...a: unknown[]) => mockSetTreeVisibility(...a),
  };
});

import { ExtraTreePublishModal } from '@/components/collections/ExtraTreePublishModal/ExtraTreePublishModal';

const onChanged = vi.fn();
const onClose = vi.fn();

function renderModal(currentLevel: 'private' | 'link' | 'search') {
  return render(
    <ExtraTreePublishModal
      workspaceId="ws-1"
      treeId="extra-9"
      treeName="فرع بني تميم"
      currentLevel={currentLevel}
      onClose={onClose}
      onChanged={onChanged}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSetTreeVisibility.mockResolvedValue({ visibility: 'public_link', publicSlug: 'xyz' });
});

describe('ExtraTreePublishModal — going public', () => {
  test('save is blocked until the confirmation phrase is typed', async () => {
    renderModal('private');
    // Choose "عامة عبر الرابط".
    fireEvent.click(await screen.findByRole('radio', { name: /عامة عبر الرابط/ }));
    const save = screen.getByRole('button', { name: 'حفظ' });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(mockSetTreeVisibility).not.toHaveBeenCalled();
  });

  test('publishes with the chosen level, the treeId, and the typed phrase', async () => {
    renderModal('private');
    fireEvent.click(await screen.findByRole('radio', { name: /عامة عبر الرابط/ }));
    fireEvent.change(screen.getByLabelText('عبارة التأكيد'), {
      target: { value: 'فرع بني تميم' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(mockSetTreeVisibility).toHaveBeenCalledTimes(1));
    const [wsId, treeId, input] = mockSetTreeVisibility.mock.calls[0];
    expect(wsId).toBe('ws-1');
    expect(treeId).toBe('extra-9');
    expect(input).toMatchObject({ level: 'link', confirmationPhrase: 'فرع بني تميم' });
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith('link'));
  });
});

describe('ExtraTreePublishModal — already public', () => {
  test('switching link → search sends NO confirmation phrase', async () => {
    renderModal('link');
    fireEvent.click(await screen.findByRole('radio', { name: /عامة وتظهر في البحث/ }));
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(mockSetTreeVisibility).toHaveBeenCalledTimes(1));
    const [, , input] = mockSetTreeVisibility.mock.calls[0];
    expect(input.level).toBe('search');
    expect(input.confirmationPhrase).toBeUndefined();
  });
});
