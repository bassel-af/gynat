import { describe, it, expect } from 'vitest';
import { shouldRenderCollections } from '@/components/collections/CollectionsResolved';
import type { ResolvedWorkspace } from '@/lib/collections/useWorkspaceResolver';

// ---------------------------------------------------------------------------
// shouldRenderCollections — the gate that reveals the trees/collections nav.
// Off when unresolved or when the workspace hasn't enabled collections.
// ---------------------------------------------------------------------------

const ws = (enableCollections: boolean): ResolvedWorkspace => ({
  id: 'ws-1',
  nameAr: 'العائلة',
  isAdmin: true,
  enableCollections,
});

describe('shouldRenderCollections', () => {
  it('renders when the workspace has collections enabled', () => {
    expect(shouldRenderCollections(ws(true))).toBe(true);
  });

  it('does not render when collections are disabled', () => {
    expect(shouldRenderCollections(ws(false))).toBe(false);
  });

  it('does not render when the workspace is unresolved', () => {
    expect(shouldRenderCollections(null)).toBe(false);
  });
});
