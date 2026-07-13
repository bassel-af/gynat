import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { GedcomData } from '@/lib/gedcom/types';

// Regression guard for: "adding a son from the persistent sidebar didn't update
// the person details page." The member Person Page fetches its OWN projection
// from a separate endpoint, independent of the sidebar's tree fetch. The fix
// makes it (1) re-fetch whenever the shared TreeContext tree changes — which is
// what `refreshTree()` does after every edit — and (2) send `cache: 'no-cache'`
// so a manual refresh right after an edit revalidates instead of serving the
// `max-age=30` cached body.

let treeData: GedcomData = { individuals: {}, families: {} };
const setSelectedPersonId = vi.fn();
const setMobileSidebarOpen = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'al-saeed', individualId: 'I7' }),
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock('@/context/TreeContext', () => ({
  useTree: () => ({ setSelectedPersonId, setMobileSidebarOpen, data: treeData }),
}));

vi.mock('@/context/WorkspaceTreeContext', () => ({
  useOptionalWorkspaceTree: () => ({ workspaceId: 'ws-1', enableKunya: false }),
}));

vi.mock('@/lib/utils/viewport', () => ({
  shouldCollapseDrawerOnPersonView: () => false,
}));

// Stub Surface-3's presentational page: we only care about which projection it
// receives, surfaced here by its display name.
vi.mock('@/components/person', () => ({
  PersonPage: ({ projection }: { projection: { name: string } }) => (
    <div data-testid="person">{projection.name}</div>
  ),
}));

const apiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

function projectionResponse(name: string) {
  return { status: 200, ok: true, json: async () => ({ name }) };
}

// Imported AFTER the mocks are registered.
import PersonPageRoute from '@/app/workspaces/[slug]/tree/(canvas)/person/[individualId]/page';

describe('member Person Page — refetch on tree change', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    treeData = { individuals: {}, families: {} };
  });

  it('fetches the projection with cache: no-cache on first load', async () => {
    apiFetch.mockResolvedValue(projectionResponse('سعيد'));
    render(<PersonPageRoute />);

    await waitFor(() => expect(screen.getByTestId('person')).toHaveTextContent('سعيد'));

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-1/tree/person/I7',
      { cache: 'no-cache' },
    );
  });

  it('re-fetches when the shared tree changes (e.g. after adding a son)', async () => {
    apiFetch
      .mockResolvedValueOnce(projectionResponse('قبل')) // before the edit
      .mockResolvedValueOnce(projectionResponse('بعد')); // after refreshTree()

    const { rerender } = render(<PersonPageRoute />);
    await waitFor(() => expect(screen.getByTestId('person')).toHaveTextContent('قبل'));
    expect(apiFetch).toHaveBeenCalledTimes(1);

    // Simulate refreshTree(): TreeContext.setData installs a NEW object reference.
    treeData = { individuals: {}, families: {} };
    rerender(<PersonPageRoute />);

    await waitFor(() => expect(screen.getByTestId('person')).toHaveTextContent('بعد'));
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
