/**
 * «اسم الشهرة» settings toggle (U2): lives next to الكنية / «قفزة نسب» on the
 * workspace settings page, saves on toggle like its neighbours, admin-only;
 * and the flag is exposed from WorkspaceTreeContext.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'fam' }),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/components/ui/UserNav', () => ({ UserNav: () => null }));
vi.mock('@/components/workspace/ShareTokenList/ShareTokenList', () => ({ ShareTokenList: () => null }));
vi.mock('@/components/workspace/IncomingPointerList/IncomingPointerList', () => ({ IncomingPointerList: () => null }));
vi.mock('@/components/collections/EnableCollectionsSetting/EnableCollectionsSetting', () => ({
  EnableCollectionsSetting: () => null,
}));
vi.mock('@/components/collections/JoinCodePanel/JoinCodePanel', () => ({ JoinCodePanel: () => null }));

import WorkspaceDetailPage from '@/app/workspaces/[slug]/page';
import { WorkspaceTreeProvider, useWorkspaceTree } from '@/context/WorkspaceTreeContext';

function json(data: unknown) {
  return { ok: true, json: async () => ({ data }) };
}

function mockApi(role: string, extra: Record<string, unknown> = {}) {
  apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/workspaces/by-slug/fam') {
      return json({
        id: 'ws1', slug: 'fam', nameAr: 'آل سعيد', description: null, memberCount: 1,
        currentUserRole: role, currentUserId: 'u1', ...extra,
      });
    }
    if (url === '/api/workspaces/ws1/members') return json([]);
    if (url === '/api/workspaces/ws1' && init?.method === 'PATCH') return json({});
    return json(null);
  });
}

function patchCalls() {
  return apiFetch.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');
}

beforeEach(() => {
  apiFetch.mockReset();
});

describe('«اسم الشهرة» settings toggle', () => {
  it('admin toggling it sends PATCH {enableFamousName: true}', async () => {
    mockApi('workspace_admin', { enableFamousName: false });
    render(<WorkspaceDetailPage />);
    const toggle = await screen.findByRole('switch', { name: 'اسم الشهرة' });
    fireEvent.click(toggle);
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    const [url, init] = patchCalls()[0];
    expect(url).toBe('/api/workspaces/ws1');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ enableFamousName: true });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
  });

  it('non-admin member cannot change it', async () => {
    mockApi('workspace_member', { enableFamousName: false });
    render(<WorkspaceDetailPage />);
    const toggle = await screen.findByRole('switch', { name: 'اسم الشهرة' });
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(patchCalls()).toHaveLength(0);
  });
});

describe('WorkspaceTreeContext', () => {
  it('exposes enableFamousName', () => {
    function Probe() {
      const { enableFamousName } = useWorkspaceTree();
      return <span data-testid="flag">{String(enableFamousName)}</span>;
    }
    render(
      <WorkspaceTreeProvider workspaceId="ws1" canEdit isAdmin refreshTree={async () => {}} enableFamousName>
        <Probe />
      </WorkspaceTreeProvider>,
    );
    expect(screen.getByTestId('flag').textContent).toBe('true');
  });
});
