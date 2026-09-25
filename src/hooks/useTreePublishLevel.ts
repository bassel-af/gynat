'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type { TreePublishLevel } from '@/components/sources/SourceVisibilityPicker';

function isLevel(v: unknown): v is TreePublishLevel {
  return v === 'private' || v === 'public_link' || v === 'public_listed';
}

/**
 * The current tree's publish level, for the sources visibility status line.
 * Admin-only on the server, so it is only asked for when `enabled` (admins);
 * null while unknown or on any failure (the status line then stays hidden).
 */
export function useTreePublishLevel(
  workspaceId: string,
  treeId: string | undefined,
  enabled: boolean,
): TreePublishLevel | null {
  const [level, setLevel] = useState<TreePublishLevel | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const qs = treeId ? `?treeId=${encodeURIComponent(treeId)}` : '';
    apiFetch(`/api/workspaces/${workspaceId}/tree/visibility${qs}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { data?: { visibility?: unknown } };
        if (active && isLevel(body.data?.visibility)) setLevel(body.data.visibility);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [workspaceId, treeId, enabled]);

  return enabled ? level : null;
}
