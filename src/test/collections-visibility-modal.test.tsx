import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CollectionVisibilityModal } from '@/components/collections/CollectionVisibilityModal/CollectionVisibilityModal';
import type { Collection } from '@/lib/collections/api';

// Stub the publish call AND the authoritative publish-preview fetch; keep the
// real pure helpers + constants.
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

const privateCollection: Collection = {
  id: 'c1',
  titleAr: 'مجموعة',
  descriptionAr: null,
  visibility: 'private',
  publicCode: null,
};

describe('CollectionVisibilityModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authoritative preview that mirrors the simple private-tree case.
    mockGetPreview.mockResolvedValue({
      withheldTrees: [{ titleAr: 'فرع خاص' }],
      publishableCount: 1,
      publicSlug: null,
      currentVisibility: 'private',
    });
  });

  it('does not show the withhold warning while the private level is selected', () => {
    render(
      <CollectionVisibilityModal
        workspaceId={WS}
        collection={privateCollection}
        onClose={() => {}}
        onPublished={() => {}}
      />,
    );

    // No withhold block before a public level is chosen.
    expect(screen.queryByText(/لن تظهر للزوار/)).not.toBeInTheDocument();
  });

  it('lists the SERVER-authoritative withheld trees once a public level is selected', async () => {
    // The server withholds a cross-workspace reuse-off borrow that the OLD
    // client-side rule (treeVisibility === private) would have MISSED: the item
    // is link-visible but its source turned reuse off.
    mockGetPreview.mockResolvedValue({
      withheldTrees: [{ titleAr: 'فرع خاص' }, { titleAr: 'فرع معار بلا إعادة استخدام' }],
      publishableCount: 0,
      publicSlug: null,
      currentVisibility: 'private',
    });

    render(
      <CollectionVisibilityModal
        workspaceId={WS}
        collection={privateCollection}
        onClose={() => {}}
        onPublished={() => {}}
      />,
    );

    fireEvent.click(screen.getByText('عامة عبر الرابط'));

    // Warning reflects the SERVER's list, including the borrow the client rule missed.
    await waitFor(() =>
      expect(screen.getByText('فرع معار بلا إعادة استخدام')).toBeInTheDocument(),
    );
    expect(screen.getByText('فرع خاص')).toBeInTheDocument();
    expect(screen.getByText(/لن تظهر للزوار/)).toBeInTheDocument();
    expect(mockGetPreview).toHaveBeenCalledWith(WS, 'c1');
  });

  it('publishes at the SELECTED level when confirmed', async () => {
    mockSetVisibility.mockResolvedValue({
      publicSlug: 'abc',
      visibility: 'public_link',
    });
    const onPublished = vi.fn();

    render(
      <CollectionVisibilityModal
        workspaceId={WS}
        collection={privateCollection}
        onClose={() => {}}
        onPublished={onPublished}
      />,
    );

    fireEvent.click(screen.getByText('عامة عبر الرابط'));
    fireEvent.click(screen.getByRole('button', { name: /نشر/ }));

    await waitFor(() => expect(mockSetVisibility).toHaveBeenCalledWith(WS, 'c1', 'link'));
    await waitFor(() => expect(onPublished).toHaveBeenCalled());
  });

  it('no longer renders the coming-soon "قريباً" badges', () => {
    render(
      <CollectionVisibilityModal
        workspaceId={WS}
        collection={privateCollection}
        onClose={() => {}}
        onPublished={() => {}}
      />,
    );
    expect(screen.queryByText('قريباً')).not.toBeInTheDocument();
  });
});
