'use client';

import Link from 'next/link';
import { type ReactNode } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { CollectionsPageShell } from '@/components/collections/CollectionsPageShell/CollectionsPageShell';
import {
  useWorkspaceResolver,
  type ResolvedWorkspace,
} from '@/lib/collections/useWorkspaceResolver';

/**
 * Whether a collections route should render its area. Off when the resolver is
 * still working, errored, or the workspace hasn't enabled collections. Pure so
 * the gate is unit-testable.
 */
export function shouldRenderCollections(ws: ResolvedWorkspace | null): boolean {
  return ws != null && ws.enableCollections;
}

interface CollectionsResolvedProps {
  slug: string;
  children: (workspace: ResolvedWorkspace) => ReactNode;
}

/**
 * Shared wrapper for the three collections routes: resolves the workspace by
 * slug, then renders loading / error / collections-disabled states or hands the
 * resolved workspace to its render-prop child.
 */
export function CollectionsResolved({ slug, children }: CollectionsResolvedProps) {
  const { workspace, loading, error } = useWorkspaceResolver(slug);

  if (loading) {
    return (
      <CollectionsPageShell
        workspaceName="المساحة"
        crumbs={[{ label: 'المساحة' }]}
      >
        <div style={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}>
          <Spinner size="lg" label="جاري التحميل..." />
        </div>
      </CollectionsPageShell>
    );
  }

  if (error || !workspace) {
    return (
      <CollectionsPageShell
        workspaceName="المساحة"
        crumbs={[{ label: 'المساحة' }]}
      >
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <p>{error || 'تعذّر تحميل المساحة.'}</p>
          <Link href="/workspaces">العودة إلى المساحات</Link>
        </div>
      </CollectionsPageShell>
    );
  }

  if (!shouldRenderCollections(workspace)) {
    return (
      <CollectionsPageShell
        workspaceName={workspace.nameAr}
        crumbs={[
          { label: 'المساحة', href: `/workspaces/${slug}` },
          { label: 'المجموعات' },
        ]}
      >
        <div style={{ padding: '2rem', textAlign: 'center', lineHeight: 1.9 }}>
          <p>المجموعات غير مفعّلة في هذه المساحة.</p>
          <Link href={`/workspaces/${slug}`}>
            فعّلها من إعدادات المساحة للبدء.
          </Link>
        </div>
      </CollectionsPageShell>
    );
  }

  return <>{children(workspace)}</>;
}
