'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api/client';

interface PointerActionsResult {
  breakPointer: (pointerId: string) => Promise<boolean>;
  copyPointer: (pointerId: string) => Promise<boolean>;
  isLoading: boolean;
  error: string;
}

/**
 * Hook for pointer actions (disconnect / deep copy) from the sidebar.
 * Returns success boolean so callers can refreshTree on success.
 */
export function usePointerActions(workspaceId: string): PointerActionsResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const breakPointer = useCallback(async (pointerId: string): Promise<boolean> => {
    setIsLoading(true);
    setError('');
    try {
      const res = await apiFetch(
        `/api/workspaces/${workspaceId}/branch-pointers/${pointerId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const body = await res.json();
        setError(body.error || 'فشل في فصل الفرع');
        return false;
      }
      return true;
    } catch {
      setError('فشل في فصل الفرع');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  const copyPointer = useCallback(async (pointerId: string): Promise<boolean> => {
    setIsLoading(true);
    setError('');
    try {
      const res = await apiFetch(
        `/api/workspaces/${workspaceId}/branch-pointers/${pointerId}/copy`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const body = await res.json();
        setError(body.error || 'فشل في نسخ الفرع');
        return false;
      }
      return true;
    } catch {
      setError('فشل في نسخ الفرع');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  return { breakPointer, copyPointer, isLoading, error };
}
