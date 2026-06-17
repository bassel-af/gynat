'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

/** What the collections pages need from the resolved workspace. */
export interface ResolvedWorkspace {
  id: string;
  nameAr: string;
  isAdmin: boolean;
  enableCollections: boolean;
}

interface ResolverState {
  workspace: ResolvedWorkspace | null;
  loading: boolean;
  error: string | null;
}

/**
 * Resolve a workspace slug → its UUID, display name, admin flag, and the
 * collections-enabled gate, via the same `by-slug` endpoint the tree uses.
 * Centralised so the three collections routes resolve identically.
 */
export function useWorkspaceResolver(slug: string): ResolverState {
  const [state, setState] = useState<ResolverState>({
    workspace: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      try {
        const res = await apiFetch(`/api/workspaces/by-slug/${slug}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) {
            setState({
              workspace: null,
              loading: false,
              error: body?.error || 'فشل في تحميل المساحة',
            });
          }
          return;
        }
        const ws = body.data;
        if (!cancelled) {
          setState({
            workspace: {
              id: ws.id,
              nameAr: ws.nameAr,
              isAdmin: ws.currentUserRole === 'workspace_admin',
              enableCollections: Boolean(ws.enableCollections),
            },
            loading: false,
            error: null,
          });
        }
      } catch {
        if (!cancelled) {
          setState({
            workspace: null,
            loading: false,
            error: 'فشل في تحميل المساحة',
          });
        }
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return state;
}
