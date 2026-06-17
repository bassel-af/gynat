'use client';

import { useParams } from 'next/navigation';
import { CollectionsList } from '@/components/collections/CollectionsList/CollectionsList';
import { CollectionsResolved } from '@/components/collections/CollectionsResolved';

/**
 * Collections list route (Screen 3). Resolves the workspace by slug, then
 * renders the live collections list.
 */
export default function CollectionsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  return (
    <CollectionsResolved slug={slug}>
      {(ws) => (
        <CollectionsList
          slug={slug}
          workspaceId={ws.id}
          workspaceName={ws.nameAr}
          canEdit={ws.isAdmin}
        />
      )}
    </CollectionsResolved>
  );
}
