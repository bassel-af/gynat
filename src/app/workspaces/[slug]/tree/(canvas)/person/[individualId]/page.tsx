'use client';

import { Suspense, useEffect, useRef, useState, type ComponentProps } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PersonPage } from '@/components/person';
import personStyles from '@/components/person/person.module.css';
import { useOptionalWorkspaceTree } from '@/context/WorkspaceTreeContext';
import { useTree } from '@/context/TreeContext';
import { getViewMode, type ViewModeContext } from '@/lib/tree/view-modes';
import { shouldCollapseDrawerOnPersonView } from '@/lib/utils/viewport';
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

  // Keep the shared sidebar in sync with the person being viewed: it then shows
  // THIS person's PersonDetail (relationships one tap away) instead of a generic
  // search list, and a relationship-click navigates the page (the same shell as
  // the canvas, so this is just a context update — no remount).
  //
  // Also collapse the mobile drawer on every person-page entry — but ONLY at
  // TABLET width. The drawer is a full-screen overlay at ≤768px and not every
  // path here closes it (e.g. the canvas view-switcher is a bare <Link>), so on
  // a tablet landing here with it open strands the dark overlay over the page.
  // This single route-level chokepoint guarantees it's shut on tablet however we
  // arrived. On a PHONE (≤480px) we DELIBERATELY leave it open — the member
  // browses person→person inside the drawer (`shouldCollapseDrawerOnPersonView`).
  // Runs only on navigation, so a later FAB re-open on this page is not undone.
  // `treeData` is the shared TreeContext tree, refreshed by `refreshTree()` after
  // every edit (add child/spouse/parent, etc.). We depend on its reference below
  // so that a mutation made from the persistent sidebar — which re-fetches the
  // tree but NOT this page's separate person projection — also re-pulls the
  // projection. Without it, a newly added son never appears here until a full
  // reload in a fresh tab.
  const { setSelectedPersonId, setMobileSidebarOpen, data: treeData } = useTree();
  useEffect(() => {
    setSelectedPersonId(individualId);
    if (shouldCollapseDrawerOnPersonView()) setMobileSidebarOpen(false);
  }, [individualId, setSelectedPersonId, setMobileSidebarOpen]);

  const [projection, setProjection] = useState<Projection | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');

  // Tracks whether we already have content on screen, so a re-fetch triggered by
  // an in-place edit (tree data changed) doesn't flash the full-page spinner —
  // the current person stays visible and the fresh projection swaps in silently.
  // Reset when the viewed person changes so switching people shows the spinner.
  const hasContentRef = useRef(false);
  useEffect(() => {
    hasContentRef.current = false;
  }, [individualId]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    if (!hasContentRef.current) setLoading(true);
    setNotFound(false);
    setError('');
    (async () => {
      try {
        // `no-cache` forces revalidation against the ETag (keyed on tree mtime)
        // instead of trusting the `max-age=30` freshness window — otherwise a
        // manual refresh right after an edit would still serve the stale body.
        const res = await apiFetch(
          `/api/workspaces/${workspaceId}/tree/person/${individualId}`,
          { cache: 'no-cache' },
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
        if (!cancelled) {
          setProjection(data);
          hasContentRef.current = true;
        }
      } catch {
        if (!cancelled) setError('فشل في تحميل صفحة الشخص');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, individualId, treeData]);

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

  // The person view lives inside the shared tree shell's fixed, non-scrolling
  // `.main-content` (kept that way for the React-Flow canvas). Give the (tall)
  // person page its own scroll container so it scrolls top-to-bottom without
  // touching the canvas viewport.
  return (
    <div className={personStyles.scrollHost}>
      <PersonPage
        projection={projection}
        hrefFor={hrefFor}
        backHref={backHref}
        treeHref={treeHref}
        enableKunya={workspace?.enableKunya}
      />
    </div>
  );
}

export default function PersonPageRoute() {
  return (
    <Suspense fallback={null}>
      <PersonView />
    </Suspense>
  );
}
