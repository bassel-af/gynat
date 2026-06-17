'use client';

import { useParams } from 'next/navigation';
import { TreesArea } from '@/components/collections/TreesArea/TreesArea';
import { CollectionsResolved } from '@/components/collections/CollectionsResolved';

/**
 * Trees area route (Screen 2). Resolves the workspace by slug, then renders the
 * trees area against live data.
 */
export default function TreesPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  return (
    <CollectionsResolved slug={slug}>
      {(ws) => (
        <TreesArea
          slug={slug}
          workspaceId={ws.id}
          workspaceName={ws.nameAr}
          canEdit={ws.isAdmin}
        />
      )}
    </CollectionsResolved>
  );
}
