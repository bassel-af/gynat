'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPersonSources, type SourceEntryDto } from '@/lib/tree/source-entries-api';

/**
 * Sources («المصادر») of one person, for the sidebar panel and the member
 * person page. Fetched when the consumer mounts (i.e. when the person is
 * shown), refetched after every mutation. No cache across people: switching
 * people clears the state, and a late answer for the previous person is
 * dropped.
 *
 * Sources are not in the tree payload, so an undo/redo (which refreshes only
 * the tree) announces itself through `notifySourcesChanged()`.
 */

const listeners = new Set<() => void>();

/** Tell every mounted `usePersonSources` to refetch (after an undo/redo). */
export function notifySourcesChanged(): void {
  for (const listener of listeners) listener();
}

export interface PersonSourcesState {
  entries: SourceEntryDto[];
  inherited: SourceEntryDto | null;
  /** The first answer for the CURRENT person has arrived (or failed). */
  loaded: boolean;
  error: boolean;
  refetch: () => Promise<void>;
}

export function usePersonSources(
  workspaceId: string | undefined,
  treeId: string | undefined,
  individualId: string,
  { enabled = true }: { enabled?: boolean } = {},
): PersonSourcesState {
  const [entries, setEntries] = useState<SourceEntryDto[]>([]);
  const [inherited, setInherited] = useState<SourceEntryDto | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  // Every request gets a ticket; only the newest one may write state.
  const ticketRef = useRef(0);

  const load = useCallback(async () => {
    if (!enabled || !workspaceId) return;
    const ticket = ++ticketRef.current;
    try {
      const data = await fetchPersonSources(workspaceId, individualId, treeId);
      if (ticket !== ticketRef.current) return;
      setEntries(data.entries);
      setInherited(data.inherited);
      setError(false);
    } catch {
      if (ticket !== ticketRef.current) return;
      setEntries([]);
      setInherited(null);
      setError(true);
    } finally {
      if (ticket === ticketRef.current) setLoaded(true);
    }
  }, [enabled, workspaceId, individualId, treeId]);

  useEffect(() => {
    // New person (or tree): forget the previous one before anything renders.
    ticketRef.current++;
    setEntries([]);
    setInherited(null);
    setLoaded(false);
    setError(false);
    void load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    const listener = () => void load();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [enabled, load]);

  return { entries, inherited, loaded, error, refetch: load };
}
