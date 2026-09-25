import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'fam' }),
  useSearchParams: () => search,
}));
vi.mock('@/components/ui/UserNav', () => ({ UserNav: () => null }));
const managerProps = vi.fn();
vi.mock('@/components/sources/SourcesManager', () => ({
  SourcesManager: (p: unknown) => {
    managerProps(p);
    return <div data-testid="manager" />;
  },
}));
vi.mock('@/components/sources/TreeSourceCard', () => ({
  TreeSourceCard: () => <div data-testid="tree-card" />,
}));

import SourcesPage from '@/app/workspaces/[slug]/tree/sources/page';

function workspace(role: string, extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({ data: { id: 'ws', slug: 'fam', nameAr: 'آل سعيد', currentUserRole: role, ...extra } }),
  };
}

beforeEach(() => {
  apiFetch.mockReset();
  managerProps.mockReset();
  search = new URLSearchParams();
});

describe('«المصادر» page', () => {
  it('admins see the tree card and the list', async () => {
    apiFetch.mockResolvedValue(workspace('workspace_admin'));
    render(<SourcesPage />);
    expect(await screen.findByTestId('manager')).toBeInTheDocument();
    expect(screen.getByTestId('tree-card')).toBeInTheDocument();
  });

  it('non-admins get a no-access message and no list', async () => {
    apiFetch.mockResolvedValue(workspace('workspace_member'));
    render(<SourcesPage />);
    expect(await screen.findByText('ليس لديك صلاحية الوصول للمصادر')).toBeInTheDocument();
    expect(screen.queryByTestId('manager')).toBeNull();
    expect(screen.queryByTestId('tree-card')).toBeNull();
  });

  it('passes ?treeId through to the list and back link', async () => {
    search = new URLSearchParams('treeId=T1');
    apiFetch.mockResolvedValue(workspace('workspace_admin'));
    render(<SourcesPage />);
    await screen.findByTestId('manager');
    expect(managerProps).toHaveBeenCalledWith(expect.objectContaining({ treeId: 'T1', workspaceId: 'ws', slug: 'fam' }));
    expect(screen.getByRole('link', { name: /العودة للشجرة/ })).toHaveAttribute('href', '/workspaces/fam/tree?treeId=T1');
  });

  it('hands the workspace birth-date hiding to the list (the people picker rows)', async () => {
    apiFetch.mockResolvedValue(workspace('workspace_admin', { hideBirthDateForFemale: true, hideBirthDateForMale: false }));
    render(<SourcesPage />);
    await screen.findByTestId('manager');
    expect(managerProps).toHaveBeenCalledWith(
      expect.objectContaining({ birthPrivacy: { hideBirthDateForFemale: true, hideBirthDateForMale: false } }),
    );
  });
});
