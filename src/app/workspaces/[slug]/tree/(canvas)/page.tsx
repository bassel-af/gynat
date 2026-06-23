'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FamilyTree } from '@/components/tree';
import { useTree } from '@/context/TreeContext';
import { FOCUS_PARAM } from '@/lib/tree/view-modes';

// The canvas view. The shared shell (workspace fetch, providers, sidebar,
// toolbar) lives in the `(canvas)/layout.tsx`; this page only fills the <main>
// with the spatial tree. Returning from the person page carries `?focus=<id>`
// so we can re-center the canvas on the person the member was reading.
function CanvasView() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get(FOCUS_PARAM);
  const treeId = searchParams.get('treeId') ?? undefined;
  const pathname = usePathname();
  const router = useRouter();
  const { setFocusPersonId, setSelectedPersonId } = useTree();

  useEffect(() => {
    if (!focusId) return;
    setSelectedPersonId(focusId);
    setFocusPersonId(focusId);
    // Strip `?focus=` (keeping any treeId) so a refresh or back-nav doesn't
    // re-trigger the focus or strand the param in the URL.
    const cleaned = treeId ? `${pathname}?treeId=${encodeURIComponent(treeId)}` : pathname;
    router.replace(cleaned, { scroll: false });
  }, [focusId, treeId, pathname, router, setFocusPersonId, setSelectedPersonId]);

  return <FamilyTree hideMiniMap />;
}

export default function WorkspaceTreePage() {
  return (
    <Suspense fallback={null}>
      <CanvasView />
    </Suspense>
  );
}
