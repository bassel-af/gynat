'use client';

import { useParams } from 'next/navigation';
import { CollectionDetail } from '@/components/collections/CollectionDetail/CollectionDetail';
import { CollectionsResolved } from '@/components/collections/CollectionsResolved';

/**
 * Collection detail route (Screens 4-7). Resolves the workspace by slug, then
 * renders the live collection detail.
 */
export default function CollectionDetailPage() {
  const params = useParams<{ slug: string; collectionId: string }>();
  const { slug, collectionId } = params;

  return (
    <CollectionsResolved slug={slug}>
      {(ws) => (
        <CollectionDetail
          slug={slug}
          workspaceId={ws.id}
          workspaceName={ws.nameAr}
          canEdit={ws.isAdmin}
          collectionId={collectionId}
        />
      )}
    </CollectionsResolved>
  );
}
