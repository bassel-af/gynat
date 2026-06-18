import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { WorkspaceTree } from '@/lib/collections/api';

// ---------------------------------------------------------------------------
// TreesArea (Screen 2) — the login-only "workspace trees" screen.
//
// Chunk 2 wired each extra-tree card's title into a <Link> that opens the
// family-tree editor on that tree (/tree?treeId=…) and REMOVED the old
// standalone "تعديل المحتوى" button. These tests pin that entry point + the
// canEdit gating so a regression (a lost ?treeId=, a re-introduced edit
// button, a viewer seeing manage actions) fails loudly.
//
// We partial-mock @/lib/collections/api so the real pure helpers / badge
// constants stay intact while `listExtraTrees` is stubbed. next/link renders
// as a plain <a> (its href is the whole point). apiFetch is stubbed because
// the shared page shell mounts <UserNav>, which fetches on mount.
// ---------------------------------------------------------------------------

const mockListExtraTrees = vi.fn();

vi.mock('@/lib/collections/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/collections/api')>(
    '@/lib/collections/api',
  );
  return {
    ...actual,
    listExtraTrees: (...args: unknown[]) => mockListExtraTrees(...args),
  };
});

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// The page shell mounts <UserNav>, which calls apiFetch on mount. Keep it inert.
vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(() => new Promise(() => {})),
}));

import { TreesArea } from '@/components/collections/TreesArea/TreesArea';

const extraTree = (over: Partial<WorkspaceTree> = {}): WorkspaceTree => ({
  id: 'tree-extra-1',
  nameAr: 'بنو تميم',
  kind: 'extra',
  visibility: 'private',
  peopleCount: 12,
  ...over,
});

const mainTree = (over: Partial<WorkspaceTree> = {}): WorkspaceTree => ({
  id: 'tree-main-1',
  nameAr: 'آل سعيد',
  kind: 'main',
  visibility: 'private',
  peopleCount: 40,
  ...over,
});

function renderTreesArea(canEdit = true) {
  return render(
    <TreesArea
      slug="saeed"
      workspaceId="ws-1"
      workspaceName="آل سعيد"
      canEdit={canEdit}
    />,
  );
}

describe('TreesArea — login-only trees screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('links an extra-tree card to the family-tree editor with ?treeId=', async () => {
    mockListExtraTrees.mockResolvedValue([mainTree(), extraTree()]);
    renderTreesArea();

    // The card title is the entry point — find its anchor by the tree name.
    const titleEl = await screen.findByText('بنو تميم');
    const link = titleEl.closest('a');
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute(
      'href',
      '/workspaces/saeed/tree?treeId=tree-extra-1',
    );
  });

  it('exposes NO standalone "تعديل المحتوى" control (button removal stays removed)', async () => {
    mockListExtraTrees.mockResolvedValue([mainTree(), extraTree()]);
    renderTreesArea();

    await screen.findByText('بنو تميم');
    expect(screen.queryByText('تعديل المحتوى')).not.toBeInTheDocument();
  });

  it('links the main-tree card to /tree with NO treeId query', async () => {
    mockListExtraTrees.mockResolvedValue([mainTree(), extraTree()]);
    renderTreesArea();

    // The main card shows the workspace name as its title.
    const mainTitle = await screen.findByText('آل سعيد', {
      selector: `span`,
    });
    const link = mainTitle.closest('a');
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute('href', '/workspaces/saeed/tree');
    // Guard against a ?treeId= leaking onto the locked main card.
    expect(link?.getAttribute('href')).not.toContain('treeId');
  });

  it('hides duplicate/rename/delete actions when canEdit is false, but keeps the editor link', async () => {
    mockListExtraTrees.mockResolvedValue([mainTree(), extraTree()]);
    renderTreesArea(false);

    // The title link still renders — a viewer can open, just not manage.
    const titleEl = await screen.findByText('بنو تميم');
    expect(titleEl.closest('a')).toHaveAttribute(
      'href',
      '/workspaces/saeed/tree?treeId=tree-extra-1',
    );

    // None of the management controls are present.
    expect(screen.queryByText('إعادة التسمية')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('حذف')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('تكرار')).not.toBeInTheDocument();
  });

  it('shows duplicate/rename/delete actions when canEdit is true', async () => {
    mockListExtraTrees.mockResolvedValue([mainTree(), extraTree()]);
    renderTreesArea(true);

    await screen.findByText('بنو تميم');
    expect(screen.getByText('إعادة التسمية')).toBeInTheDocument();
    expect(screen.getByLabelText('حذف')).toBeInTheDocument();
    // Two "تكرار" buttons: one on the main card, one on the extra card.
    expect(screen.getAllByLabelText('تكرار').length).toBeGreaterThanOrEqual(1);
  });

  // Unified publish flow: the SAME share-icon publish action appears on EVERY
  // row — the main card AND every extra card — so a single shared component
  // drives all of them and they can never diverge.
  it('shows the publish (نشر الشجرة) button on both the main row and each extra row', async () => {
    mockListExtraTrees.mockResolvedValue([mainTree(), extraTree()]);
    renderTreesArea(true);

    await screen.findByText('بنو تميم');
    // One on the locked main card + one on the single extra card.
    expect(screen.getAllByLabelText('نشر الشجرة')).toHaveLength(2);
  });

  it('no longer renders the old "الظهور" text button (replaced by the shared share-icon)', async () => {
    mockListExtraTrees.mockResolvedValue([mainTree(), extraTree()]);
    renderTreesArea(true);

    await screen.findByText('بنو تميم');
    expect(screen.queryByText('الظهور')).not.toBeInTheDocument();
  });

  it('hides the publish button from viewers (canEdit false)', async () => {
    mockListExtraTrees.mockResolvedValue([mainTree(), extraTree()]);
    renderTreesArea(false);

    await screen.findByText('بنو تميم');
    expect(screen.queryByLabelText('نشر الشجرة')).not.toBeInTheDocument();
  });
});
