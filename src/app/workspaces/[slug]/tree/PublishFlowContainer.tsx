'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { useToast } from '@/context/ToastContext';
import { useWorkspaceTree } from '@/context/WorkspaceTreeContext';
import {
  PublishFlow,
  type PublishCheckpointData,
  type VisibilityLevel,
} from '@/components/public-tree';

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
  familyName: string;
  onClose: () => void;
}

/**
 * Real, backend-wired publish flow. Fetches the live publish checkpoint
 * (`GET .../tree/publish-preview`) on open, then drives the real
 * `PATCH .../tree/visibility` for both going-public and going-private. The
 * presentational `PublishFlow` does the sequencing + type-to-confirm; this only
 * fetches data and performs the persisted actions.
 */
export function PublishFlowContainer({
  workspaceId,
  familyName,
  onClose,
}: PublishFlowContainerProps) {
  const { showToast } = useToast();
  const { refreshTree } = useWorkspaceTree();
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The public slug becomes known only after publishing; track it so the
  // success screen shows the real share link.
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/workspaces/${workspaceId}/tree/publish-preview`);
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
  }, [workspaceId]);

  async function patchVisibility(level: VisibilityLevel, confirmationPhrase?: string) {
    const res = await apiFetch(`/api/workspaces/${workspaceId}/tree/visibility`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, confirmationPhrase }),
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
        await refreshTree();
        showToast('تم نشر الشجرة', 'success');
      }}
      onChangeVisibility={async (level) => {
        // Already-public level switch (link↔search): same endpoint, NO phrase.
        // The server skips the phrase check on public→public and keeps the slug.
        const body = await patchVisibility(level);
        if (body?.data?.publicSlug) setPublishedSlug(body.data.publicSlug);
        await refreshTree();
        showToast('تم تحديث الإعدادات', 'success');
      }}
      onMakePrivateConfirm={async () => {
        await patchVisibility('private');
        await refreshTree();
        showToast('أصبحت الشجرة خاصّة', 'success');
      }}
    />
  );
}
