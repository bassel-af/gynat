'use client';

import { useEffect, useState } from 'react';
import { fetchTreeEntry, type SourceEntryDto } from '@/lib/tree/source-entries-api';

/**
 * The tree-wide source («مصدر الشجرة») as the viewer may see it — shown
 * read-only in the person form's create modes: a new person inherits it.
 * Best effort: a failed fetch simply shows nothing.
 */
export function useTreeSourceEntry(
  workspaceId: string | undefined,
  treeId: string | undefined,
  enabled: boolean,
): SourceEntryDto | null {
  const [entry, setEntry] = useState<SourceEntryDto | null>(null);
  useEffect(() => {
    if (!enabled || !workspaceId) {
      setEntry(null);
      return;
    }
    let live = true;
    fetchTreeEntry(workspaceId, treeId)
      .then((e) => live && setEntry(e))
      .catch(() => live && setEntry(null));
    return () => {
      live = false;
    };
  }, [workspaceId, treeId, enabled]);
  return entry;
}
