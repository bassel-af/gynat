import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Collection, CollectionItem } from '@/lib/collections/api';

// ---------------------------------------------------------------------------
// CollectionDetail / ItemRow (Screen 4) — the login-only collection-detail
// screen. Chunk 2 made a tree item with a treeId open the family-tree editor
// (/tree?treeId=…), a nested collection item link to that child collection,
// and a tree item WITHOUT a treeId (future borrowed content) stay a plain,
// non-clickable row. These tests pin those three branches + the canEdit gating
// on the per-item edit/remove buttons.
//
// We partial-mock @/lib/collections/api (keep the real badge constants/helpers,
// stub getCollection). next/link → plain <a>. useRouter is stubbed because the
// component calls it at the top level. apiFetch is inert (the shell's UserNav
// fetches on mount).
// ---------------------------------------------------------------------------

const mockGetCollection = vi.fn();

vi.mock('@/lib/collections/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/collections/api')>(
    '@/lib/collections/api',
  );
  return {
    ...actual,
    getCollection: (...args: unknown[]) => mockGetCollection(...args),
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(() => new Promise(() => {})),
}));

import { CollectionDetail } from '@/components/collections/CollectionDetail/CollectionDetail';

const COLLECTION: Collection = {
  id: 'col-1',
  titleAr: 'مجموعة الأجداد',
  descriptionAr: null,
  visibility: 'private',
  publicCode: null,
};

const treeItem = (over: Partial<CollectionItem> = {}): CollectionItem => ({
  id: 'item-tree-1',
  titleAr: 'شجرة بني تميم',
  descriptionAr: null,
  kind: 'tree',
  treeId: 'tree-9',
  linkMode: 'linked',
  sourceLabel: 'extra',
  sourceNameAr: 'بنو تميم',
  peopleCount: 8,
  treeVisibility: 'private',
  childCollectionId: null,
  ...over,
});

const nestedItem = (over: Partial<CollectionItem> = {}): CollectionItem => ({
  id: 'item-nested-1',
  titleAr: 'مجموعة فرعية',
  descriptionAr: null,
  kind: 'collection',
  treeId: null,
  linkMode: null,
  sourceLabel: 'nested',
  sourceNameAr: null,
  peopleCount: null,
  treeVisibility: null,
  childCollectionId: 'col-child-7',
  ...over,
});

function renderDetail(items: CollectionItem[], canEdit = true) {
  mockGetCollection.mockResolvedValue({ collection: COLLECTION, items });
  return render(
    <CollectionDetail
      slug="saeed"
      workspaceId="ws-1"
      workspaceName="آل سعيد"
      canEdit={canEdit}
      collectionId="col-1"
    />,
  );
}

describe('CollectionDetail / ItemRow — login-only collection detail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('links a tree item with a treeId to the family-tree editor (?treeId=)', async () => {
    renderDetail([treeItem()]);

    const titleEl = await screen.findByText('شجرة بني تميم');
    const link = titleEl.closest('a');
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute(
      'href',
      '/workspaces/saeed/tree?treeId=tree-9',
    );
  });

  it('renders NO editor link for a tree item whose treeId is null (borrowed/future)', async () => {
    renderDetail([treeItem({ treeId: null, linkMode: null })]);

    const titleEl = await screen.findByText('شجرة بني تميم');
    // The row must not be an anchor to the tree editor.
    expect(titleEl.closest('a')).toBeNull();
    expect(
      screen.queryByRole('link', { name: /شجرة بني تميم/ }),
    ).not.toBeInTheDocument();
  });

  it('links a nested-collection item to that child collection', async () => {
    renderDetail([nestedItem()]);

    const titleEl = await screen.findByText('مجموعة فرعية');
    const link = titleEl.closest('a');
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute(
      'href',
      '/workspaces/saeed/collections/col-child-7',
    );
  });

  it('renders the per-item edit/remove buttons when canEdit is true', async () => {
    renderDetail([treeItem()], true);

    await screen.findByText('شجرة بني تميم');
    expect(screen.getByLabelText('تعديل العنصر')).toBeInTheDocument();
    expect(screen.getByLabelText('إزالة من المجموعة')).toBeInTheDocument();
  });

  it('hides the per-item edit/remove buttons when canEdit is false', async () => {
    renderDetail([treeItem()], false);

    // The item link still renders for a viewer…
    const titleEl = await screen.findByText('شجرة بني تميم');
    expect(titleEl.closest('a')).toHaveAttribute(
      'href',
      '/workspaces/saeed/tree?treeId=tree-9',
    );
    // …but no management controls.
    expect(screen.queryByLabelText('تعديل العنصر')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('إزالة من المجموعة')).not.toBeInTheDocument();
  });
});
