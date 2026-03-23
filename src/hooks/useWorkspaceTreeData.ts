'use client';

import { useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api/client';
import { useTree } from '@/context/TreeContext';

/**
 * Fetches tree data from the workspace API and feeds it into TreeContext.
 * Replaces useGedcomData for database-backed workspace trees.
 */
export function useWorkspaceTreeData(workspaceId: string) {
  const { setData, setError } = useTree();
  const refreshCounter = useRef(0);

  const fetchTree = useCallback(async () => {
    const currentRefresh = ++refreshCounter.current;
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/tree`);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'فشل في تحميل شجرة العائلة');
      }
      const body = await res.json();
      // Only apply if this is still the latest request
      if (currentRefresh === refreshCounter.current) {
        setData(body.data);
      }
    } catch (err) {
      if (currentRefresh === refreshCounter.current) {
        setError(err instanceof Error ? err.message : 'فشل في تحميل شجرة العائلة');
      }
    }
  }, [workspaceId, setData, setError]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  return { refreshTree: fetchTree };
}
