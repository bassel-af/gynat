'use client';

import { Suspense, useEffect, useState, type ComponentProps } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PersonPage } from '@/components/person';
import { useOptionalWorkspaceTree } from '@/context/WorkspaceTreeContext';
import { getViewMode, type ViewModeContext } from '@/lib/tree/view-modes';
import { apiFetch } from '@/lib/api/client';
import { Spinner } from '@/components/ui/Spinner';

// The focused person view. It lives INSIDE the `(canvas)/layout.tsx`, so the
// sidebar/toolbar/providers persist across the route change (instant toggle, no
// shell remount). It fetches the SAFE, display-ready PersonProjection from the
// member endpoint and hands it to Surface 3's presentational <PersonPage> with
// the nav hrefs built from the single source `@/lib/tree/view-modes`. Member
// surface only — always noindex; no metadata, no JSON-LD.
//
// NOTE: the projection type/field names are owned by Surface 1 and consumed by
// Surface 3's <PersonPage>. This route deliberately derives the fetched type
// from <PersonPage>'s own prop (`ComponentProps`) and never imports
// `person-projection` directly, so the field-name churn there can't touch it.
type Projection = ComponentProps<typeof PersonPage>['projection'];

function PersonView() {
  const params = useParams<{ slug: string; individualId: string }>();
  const slug = params.slug;
  const individualId = params.individualId;
  const treeId = useSearchParams().get('treeId') ?? undefined;

  const workspace = useOptionalWorkspaceTree();
  // The member person endpoint reads the workspace MAIN tree (branch pointers
  // only anchor there); treeId is still threaded into nav hrefs for continuity.
  const workspaceId = workspace?.workspaceId;

  const [projection, setProjection] = useState<Projection | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setError('');
    (async () => {
      try {
        const res = await apiFetch(
          `/api/workspaces/${workspaceId}/tree/person/${individualId}`,
        );
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) {
          setError('فشل في تحميل صفحة الشخص');
          return;
        }
        const data = (await res.json()) as Projection;
        if (!cancelled) setProjection(data);
      } catch {
        if (!cancelled) setError('فشل في تحميل صفحة الشخص');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, individualId]);

  // Single source of truth for both nav directions (`@/lib/tree/view-modes`).
  const ctx: ViewModeContext = { slug, individualId, treeId };
  const treeHref = getViewMode('tree').href(ctx);
  const backHref = treeHref;
  const hrefFor = (id: string) =>
    getViewMode('person').href({ slug, individualId: id, treeId });

  if (loading || !workspaceId) {
    return (
      <div className="loading">
        <Spinner size="lg" label="جاري تحميل صفحة الشخص..." />
      </div>
    );
  }

  if (notFound || !projection) {
    return (
      <div className="error">
        <Link href={treeHref}>&rarr; العودة للشجرة</Link>
        <p>{error || 'لم يتم العثور على هذا الشخص'}</p>
      </div>
    );
  }

  return (
    <PersonPage
      projection={projection}
      hrefFor={hrefFor}
      backHref={backHref}
      treeHref={treeHref}
      enableKunya={workspace?.enableKunya}
    />
  );
}

export default function PersonPageRoute() {
  return (
    <Suspense fallback={null}>
      <PersonView />
    </Suspense>
  );
}
