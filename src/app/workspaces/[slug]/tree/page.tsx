'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { WorkspaceTreeClient } from './WorkspaceTreeClient';

function WorkspaceTreePageInner() {
  const params = useParams<{ slug: string }>();
  // `?treeId=<id>` opens the editor on an `extra` tree; absent ⇒ main tree.
  const treeId = useSearchParams().get('treeId') ?? undefined;
  return <WorkspaceTreeClient slug={params.slug} treeId={treeId} />;
}

export default function WorkspaceTreePage() {
  return (
    <Suspense fallback={<div className="loading">جاري التحميل...</div>}>
      <WorkspaceTreePageInner />
    </Suspense>
  );
}
