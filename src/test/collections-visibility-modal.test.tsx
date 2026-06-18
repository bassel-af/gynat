import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CollectionVisibilityModal } from '@/components/collections/CollectionVisibilityModal/CollectionVisibilityModal';
import type { Collection, CollectionItem } from '@/lib/collections/api';

// Stub only the publish call; keep the real pure helpers + constants.
const mockSetVisibility = vi.fn();
vi.mock('@/lib/collections/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/collections/api')>(
    '@/lib/collections/api',
  );
  return {
    ...actual,
    setCollectionVisibility: (...a: unknown[]) => mockSetVisibility(...a),
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

const items: CollectionItem[] = [
  {
    id: 'i1',
    titleAr: 'فرع خاص',
    kind: 'tree',
    treeId: 't1',
    treeVisibility: 'private',
    withheldWhenPublic: true,
  },
  {
    id: 'i2',
    titleAr: 'فرع عام',
    kind: 'tree',
    treeId: 't2',
    treeVisibility: 'link',
    withheldWhenPublic: false,
  },
];

describe('CollectionVisibilityModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not show the withhold warning while the private level is selected', () => {
    render(
      <CollectionVisibilityModal
        workspaceId={WS}
        collection={privateCollection}
        items={items}
        onClose={() => {}}
        onPublished={() => {}}
      />,
    );

    // No withhold block before a public level is chosen.
    expect(screen.queryByText(/لن تظهر للزوار/)).not.toBeInTheDocument();
  });

  it('lists ONLY the withheld tree by name once a public level is selected', () => {
    render(
      <CollectionVisibilityModal
        workspaceId={WS}
        collection={privateCollection}
        items={items}
        onClose={() => {}}
        onPublished={() => {}}
      />,
    );

    // Select "عامة عبر الرابط" (link).
    fireEvent.click(screen.getByText('عامة عبر الرابط'));

    // Warning appears, naming the private tree but NOT the public one.
    expect(screen.getByText(/لن تظهر للزوار/)).toBeInTheDocument();
    expect(screen.getByText('فرع خاص')).toBeInTheDocument();
    expect(screen.queryByText('فرع عام')).not.toBeInTheDocument();
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
        items={items}
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
        items={items}
        onClose={() => {}}
        onPublished={() => {}}
      />,
    );
    expect(screen.queryByText('قريباً')).not.toBeInTheDocument();
  });
});
