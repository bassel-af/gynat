import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CollectionVisibilityModal } from '@/components/collections/CollectionVisibilityModal/CollectionVisibilityModal';
import type { Collection } from '@/lib/collections/api';

// ---------------------------------------------------------------------------
// Slice C — the listed (search) level shows the listing-readiness breakdown:
//   - your own not-yet-listed trees, with a single "list them all" affordance
//   - borrowed families that are link-only, shown as BLOCKING with ask/remove
// and surfaces the by-link-only outcome when the server reports listedBlocked.
// ---------------------------------------------------------------------------

const mockSetVisibility = vi.fn();
const mockGetPreview = vi.fn();
vi.mock('@/lib/collections/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/collections/api')>(
    '@/lib/collections/api',
  );
  return {
    ...actual,
    setCollectionVisibility: (...a: unknown[]) => mockSetVisibility(...a),
    getCollectionPublishPreview: (...a: unknown[]) => mockGetPreview(...a),
  };
});

const WS = 'ws-1';
const linkCollection: Collection = {
  id: 'c1',
  titleAr: 'مجموعة',
  descriptionAr: null,
  visibility: 'link',
  publicCode: 'abc',
};

function selectSearch() {
  fireEvent.click(screen.getByText('عامة وتظهر في محركات البحث'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPreview.mockResolvedValue({
    withheldTrees: [],
    publishableCount: 2,
    publicSlug: 'abc',
    currentVisibility: 'public_link',
    fullyListable: false,
    notListedOwnTrees: [{ treeId: 't1', titleAr: 'فرعنا الأول' }],
    notListedBorrowedTrees: [],
  });
});

describe('CollectionVisibilityModal — listed readiness', () => {
  it('shows own not-listed trees with a "list them all" affordance at the search level', async () => {
    render(
      <CollectionVisibilityModal
        workspaceId={WS}
        collection={linkCollection}
        onClose={() => {}}
        onPublished={() => {}}
      />,
    );

    selectSearch();

    await waitFor(() => expect(screen.getByText('فرعنا الأول')).toBeInTheDocument());
    // A single affordance to promote them all.
    expect(screen.getByRole('button', { name: /إدراج.*جميع|إدراجها جميعاً/ })).toBeInTheDocument();
  });

  it('confirms a listed publish with promoteOwnTreesToListed:true after the owner opts in', async () => {
    mockSetVisibility.mockResolvedValue({
      publicSlug: 'abc',
      visibility: 'public_listed',
    });
    const onPublished = vi.fn();

    render(
      <CollectionVisibilityModal
        workspaceId={WS}
        collection={linkCollection}
        onClose={() => {}}
        onPublished={onPublished}
      />,
    );

    selectSearch();
    await waitFor(() => expect(screen.getByText('فرعنا الأول')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /إدراج.*جميع|إدراجها جميعاً/ }));

    // The confirm action publishes at search level with the promote flag.
    fireEvent.click(screen.getByRole('button', { name: /^نشر|حفظ/ }));
    await waitFor(() =>
      expect(mockSetVisibility).toHaveBeenCalledWith(WS, 'c1', 'search', true),
    );
    await waitFor(() => expect(onPublished).toHaveBeenCalled());
  });

  it('shows borrowed not-listed families as blocking with ask/remove guidance', async () => {
    mockGetPreview.mockResolvedValue({
      withheldTrees: [],
      publishableCount: 2,
      publicSlug: 'abc',
      currentVisibility: 'public_link',
      fullyListable: false,
      notListedOwnTrees: [],
      notListedBorrowedTrees: [
        { titleAr: 'عائلة معارة', sourceWorkspaceNameAr: 'آل فلان' },
      ],
    });

    render(
      <CollectionVisibilityModal
        workspaceId={WS}
        collection={linkCollection}
        onClose={() => {}}
        onPublished={() => {}}
      />,
    );

    selectSearch();
    await waitFor(() => expect(screen.getByText('عائلة معارة')).toBeInTheDocument());
    // The source family is named so the owner knows who to ask.
    expect(screen.getByText(/آل فلان/)).toBeInTheDocument();
  });

  it('surfaces the by-link-only outcome when the server reports listedBlocked', async () => {
    mockGetPreview.mockResolvedValue({
      withheldTrees: [],
      publishableCount: 2,
      publicSlug: 'abc',
      currentVisibility: 'public_link',
      fullyListable: false,
      notListedOwnTrees: [],
      notListedBorrowedTrees: [
        { titleAr: 'عائلة معارة', sourceWorkspaceNameAr: 'آل فلان' },
      ],
    });
    mockSetVisibility.mockResolvedValue({
      publicSlug: 'abc',
      visibility: 'public_link',
      listedBlocked: true,
      blockingBorrowed: [{ titleAr: 'عائلة معارة', sourceWorkspaceNameAr: 'آل فلان' }],
    });
    const onPublished = vi.fn();

    render(
      <CollectionVisibilityModal
        workspaceId={WS}
        collection={linkCollection}
        onClose={() => {}}
        onPublished={onPublished}
      />,
    );

    selectSearch();
    await waitFor(() => expect(screen.getByText('عائلة معارة')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^نشر|حفظ/ }));

    // The owner is told it published by link only (not silently search-listed).
    await waitFor(() =>
      expect(screen.getByText(/عبر الرابط فقط/)).toBeInTheDocument(),
    );
    // It did NOT close as a clean success — onPublished is NOT called on a block.
    expect(onPublished).not.toHaveBeenCalled();
  });
});
