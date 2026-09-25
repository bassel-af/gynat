import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CanvasToolbar } from '@/components/tree/CanvasToolbar/CanvasToolbar';

vi.mock('@/components/ui/UserNav/UserNav', () => ({ UserNav: () => null }));
vi.mock('@/components/tree/RootBackChip/RootBackChip', () => ({ RootBackChip: () => null }));
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

let ctx: Record<string, unknown> = {};
vi.mock('@/context/WorkspaceTreeContext', () => ({ useWorkspaceTree: () => ctx }));

beforeEach(() => {
  ctx = { workspaceId: 'ws', isAdmin: false, enableAuditLog: false, enableTreeExport: true, pointers: [] };
});

describe('CanvasToolbar — «المصادر» entry point', () => {
  it('is hidden from non-admins', () => {
    render(<CanvasToolbar workspaceSlug="fam" workspaceId="ws" />);
    expect(screen.queryByRole('link', { name: 'المصادر' })).toBeNull();
  });

  it('admins get a link to the sources page (no audit-log toggle needed)', () => {
    ctx = { ...ctx, isAdmin: true };
    render(<CanvasToolbar workspaceSlug="fam" workspaceId="ws" />);
    expect(screen.getByRole('link', { name: 'المصادر' })).toHaveAttribute('href', '/workspaces/fam/tree/sources');
  });

  it('keeps the open extra tree', () => {
    ctx = { ...ctx, isAdmin: true, activeTreeId: 'T1' };
    render(<CanvasToolbar workspaceSlug="fam" workspaceId="ws" />);
    expect(screen.getByRole('link', { name: 'المصادر' })).toHaveAttribute(
      'href',
      '/workspaces/fam/tree/sources?treeId=T1',
    );
  });
});
