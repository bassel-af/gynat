'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { WorkspaceTreeClient } from './WorkspaceTreeClient';

export default function WorkspaceTreePage() {
  const params = useParams<{ slug: string }>();
  return (
    <Suspense fallback={<div className="loading">جاري التحميل...</div>}>
      <WorkspaceTreeClient slug={params.slug} />
    </Suspense>
  );
}
