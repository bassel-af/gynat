'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { useTree } from '@/context/TreeContext';
import type { PointerMetadata } from '@/context/WorkspaceTreeContext';

/**
 * Fetches tree data from the workspace API and feeds it into TreeContext.
 * Fetches tree data from the workspace API and feeds it into TreeContext.
 */
export function useWorkspaceTreeData(workspaceId: string) {
  const { setData, setError } = useTree();
  const refreshCounter = useRef(0);
  const [pointers, setPointers] = useState<PointerMetadata[]>([]);

  const fetchTree = useCallback(async () => {
    const currentRefresh = ++refreshCounter.current;
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/tree`, {
        cache: 'no-cache',
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'فشل في تحميل شجرة العائلة');
      }
      const body = await res.json();
      // Only apply if this is still the latest request
      if (currentRefresh === refreshCounter.current) {
        setData(body.data);
        // Store pointers metadata if present in response
        if (body.pointers) {
          setPointers(body.pointers);
        }
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

  return { refreshTree: fetchTree, pointers };
}
