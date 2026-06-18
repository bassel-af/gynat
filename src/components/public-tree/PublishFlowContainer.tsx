'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { useToast } from '@/context/ToastContext';
import { useOptionalWorkspaceTree } from '@/context/WorkspaceTreeContext';
// Import from the component paths directly (NOT the package barrel) — the barrel
// re-exports this container, so importing the barrel here would be circular.
import { PublishFlow } from './PublishFlow';
import type { PublishCheckpointData } from './PublishCheckpoint';
import type { VisibilityLevel } from './VisibilityLadder';

interface PreviewResponse {
  checkpoint: PublishCheckpointData;
  withheldBranches: { sourceWorkspaceNameAr: string; rootName: string }[];
  confirmationPhrase: string;
  currentLevel: VisibilityLevel;
  publicSlug: string | null;
  allowReuse: boolean;
}

interface PublishFlowContainerProps {
  workspaceId: string;
  /**
   * Which tree to publish. Absent ⇒ the workspace MAIN tree; present ⇒ that
   * `extra` tree. Threaded into the preview fetch (query param) and the
   * visibility PATCH (body field) so the SAME flow drives every tree.
   */
  treeId?: string | null;
  familyName: string;
  onClose: () => void;
  /**
   * Called after a successful visibility change with the new level. Used by the
   * trees-list screen to refresh that row's visibility chip (the tree page
   * refreshes its canvas via `WorkspaceTreeContext` instead).
   */
  onChanged?: (level: VisibilityLevel) => void;
}

/**
 * THE one publish entry point (architectural guarantee): both the tree top bar
 * and every trees-list row mount this, parameterized only by `treeId`. It
 * fetches the live publish checkpoint (`GET .../tree/publish-preview`), drives
 * the real `PublishFlow` (living checkpoint + ladder + type-to-confirm), and
 * performs the real `PATCH .../tree/visibility` for both going-public and
 * going-private. The presentational `PublishFlow` does the sequencing; this only
 * fetches data and performs the persisted actions.
 */
export function PublishFlowContainer({
  workspaceId,
  treeId,
  familyName,
  onClose,
  onChanged,
}: PublishFlowContainerProps) {
  const { showToast } = useToast();
  // Optional: the trees-list screen mounts this OUTSIDE the tree provider, so we
  // refresh the canvas only when a provider is present (the tree page); the list
  // screen refreshes its own row via `onChanged`.
  const refreshTree = useOptionalWorkspaceTree()?.refreshTree;
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The public slug becomes known only after publishing; track it so the
  // success screen shows the real share link.
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);

  // Build the treeId-scoped endpoints once: the preview reads ?treeId, the PATCH
  // carries it in the body (which the visibility route already reads).
  const previewUrl = treeId
    ? `/api/workspaces/${workspaceId}/tree/publish-preview?treeId=${treeId}`
    : `/api/workspaces/${workspaceId}/tree/publish-preview`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(previewUrl);
        const body = await res.json();
        if (!res.ok) {
          if (!cancelled) setLoadError(body.error || 'تعذّر تحميل بيانات النشر');
          return;
        }
        if (!cancelled) setPreview(body);
      } catch {
        if (!cancelled) setLoadError('تعذّر تحميل بيانات النشر');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewUrl]);

  async function patchVisibility(level: VisibilityLevel, confirmationPhrase?: string) {
    const res = await apiFetch(`/api/workspaces/${workspaceId}/tree/visibility`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, confirmationPhrase, treeId: treeId ?? undefined }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'تعذّر تحديث مستوى الظهور');
    }
    return res.json();
  }

  // Surface a load failure once, then close (effect — never during render).
  useEffect(() => {
    if (loadError) {
      showToast(loadError, 'error');
      onClose();
    }
  }, [loadError, showToast, onClose]);

  if (loadError || !preview) return null; // closing or still loading — no flash

  const effectiveSlug = publishedSlug ?? preview.publicSlug;
  const shareUrl = effectiveSlug
    ? `${window.location.origin}/family/${effectiveSlug}`
    : '';
  // The public, no-account report page for this tree (PRD §8.2) — surfaced from
  // the make-private dialog's "request permanent removal" link.
  const reportHref = effectiveSlug ? `/family/${effectiveSlug}/report` : undefined;

  return (
    <PublishFlow
      isOpen
      onClose={onClose}
      familyName={familyName}
      currentLevel={preview.currentLevel}
      checkpointData={preview.checkpoint}
      shareUrl={shareUrl}
      reportHref={reportHref}
      onPublishConfirm={async (level, confirmationPhrase) => {
        const body = await patchVisibility(level, confirmationPhrase);
        if (body?.data?.publicSlug) setPublishedSlug(body.data.publicSlug);
        await refreshTree?.();
        onChanged?.(level);
        showToast('تم نشر الشجرة', 'success');
      }}
      onChangeVisibility={async (level) => {
        // Already-public level switch (link↔search): same endpoint, NO phrase.
        // The server skips the phrase check on public→public and keeps the slug.
        const body = await patchVisibility(level);
        if (body?.data?.publicSlug) setPublishedSlug(body.data.publicSlug);
        await refreshTree?.();
        onChanged?.(level);
        showToast('تم تحديث الإعدادات', 'success');
      }}
      onMakePrivateConfirm={async () => {
        await patchVisibility('private');
        await refreshTree?.();
        onChanged?.('private');
        showToast('أصبحت الشجرة خاصّة', 'success');
      }}
    />
  );
}
