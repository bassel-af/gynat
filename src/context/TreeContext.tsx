'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { GedcomData, RootAncestor, TreeConfig } from '@/lib/gedcom';
import { findRootAncestors, findDefaultRoot, getDisplayNameWithNasab, DEFAULT_NASAB_DEPTH, getAllDescendants, getTreeVisibleIndividuals, findTopmostAncestor, computeGraftDescriptors } from '@/lib/gedcom';

export type RootFilterStrategy = 'all' | 'descendants';
export type ViewMode = 'single' | 'multi';

interface TreeState {
  data: GedcomData | null;
  selectedRootId: string | null;
  initialRootId: string | null;
  rootsList: RootAncestor[];
  rootFilterStrategy: RootFilterStrategy;
  viewMode: ViewMode;
  searchQuery: string;
  focusPersonId: string | null;
  selectedPersonId: string | null;
  highlightedPersonId: string | null;
  visiblePersonIds: Set<string>;
  graftPersonIds: Set<string>;
  isMobileSidebarOpen: boolean;
  config: TreeConfig;
  isLoading: boolean;
  error: string | null;
}

interface TreeContextValue extends TreeState {
  setData: (data: GedcomData) => void;
  setSelectedRootId: (id: string | null) => void;
  setRootFilterStrategy: (strategy: RootFilterStrategy) => void;
  setViewMode: (mode: ViewMode) => void;
  setSearchQuery: (query: string) => void;
  setFocusPersonId: (id: string | null) => void;
  setSelectedPersonId: (id: string | null) => void;
  setHighlightedPersonId: (id: string | null) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setConfig: (config: Partial<TreeConfig>) => void;
  setError: (error: string | null) => void;
}

const defaultConfig: TreeConfig = {
  maxDepth: 50,
};

const TreeContext = createContext<TreeContextValue | null>(null);

interface TreeProviderProps {
  children: ReactNode;
  forcedRootId?: string; // When set, use this root instead of auto-detecting
}

export function TreeProvider({ children, forcedRootId }: TreeProviderProps) {
  const [data, setDataState] = useState<GedcomData | null>(null);
  const [selectedRootId, setSelectedRootIdState] = useState<string | null>(null);
  const [initialRootId, setInitialRootId] = useState<string | null>(null);
  const [allRootsList, setAllRootsList] = useState<RootAncestor[]>([]);
  const [descendantsRootsList, setDescendantsRootsList] = useState<RootAncestor[]>([]);
  const [rootFilterStrategy, setRootFilterStrategyState] = useState<RootFilterStrategy>('descendants');
  const [searchQuery, setSearchQuery] = useState('');
  const [focusPersonId, setFocusPersonId] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [highlightedPersonId, setHighlightedPersonIdState] = useState<string | null>(null);
  const [config, setConfigState] = useState<TreeConfig>(defaultConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewModeState] = useState<ViewMode>('single');
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);

  // Compute rootsList based on strategy
  const rootsList = rootFilterStrategy === 'all' ? allRootsList : descendantsRootsList;

  const setData = useCallback((newData: GedcomData) => {
    setDataState(newData);

    // Build list of all individuals
    const allRoots = findRootAncestors(newData).map((person) => ({
      id: person.id,
      text: getDisplayNameWithNasab(newData, person, DEFAULT_NASAB_DEPTH) + (person.birth ? ` (${person.birth})` : ''),
    }));
    setAllRootsList(allRoots);

    // Determine the root to use
    let targetRoot = forcedRootId ? newData.individuals[forcedRootId] : null;

    // Validate forced root exists
    if (forcedRootId && !targetRoot) {
      console.error(`Forced root ID "${forcedRootId}" not found in GEDCOM data`);
    }

    // Fall back to default root if forced root is invalid or not provided
    if (!targetRoot) {
      targetRoot = findDefaultRoot(newData);
    }

    if (targetRoot) {
      setInitialRootId(targetRoot.id);
      setSelectedRootIdState((prev) => {
        if (!prev || !newData.individuals[prev]) return targetRoot!.id;
        // If the current root now has parents (parent added above it),
        // walk up to the new topmost ancestor
        const topAncestor = findTopmostAncestor(newData, prev);
        return topAncestor ?? prev;
      });

      // Build list of descendants of the initial root (including the root itself)
      const descendantIds = getAllDescendants(newData, targetRoot.id);
      descendantIds.add(targetRoot.id); // Include the root itself

      const descendantsRoots = allRoots.filter((r) => descendantIds.has(r.id));
      setDescendantsRootsList(descendantsRoots);

      // When forced root is set, always use descendants filter
      if (forcedRootId) {
        setRootFilterStrategyState('descendants');
      }
    } else {
      // No root found, use all individuals for both lists
      setDescendantsRootsList(allRoots);
    }

    setIsLoading(false);
  }, [forcedRootId]);

  const setSelectedRootId = useCallback((id: string | null) => {
    setSelectedRootIdState(id);
  }, []);

  const setRootFilterStrategy = useCallback((strategy: RootFilterStrategy) => {
    setRootFilterStrategyState(strategy);
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
  }, []);

  const setConfig = useCallback((newConfig: Partial<TreeConfig>) => {
    setConfigState((prev) => ({ ...prev, ...newConfig }));
  }, []);

  const setHighlightedPersonId = useCallback((id: string | null) => {
    setHighlightedPersonIdState(id);
  }, []);

  const { visiblePersonIds, graftPersonIds } = useMemo(() => {
    if (!data || !selectedRootId) return { visiblePersonIds: new Set<string>(), graftPersonIds: new Set<string>() };
    const visible = getTreeVisibleIndividuals(data, selectedRootId);

    // Always include graft individuals (parents + siblings of married-in spouses)
    const graftOnly = new Set<string>();
    const grafts = computeGraftDescriptors(data, selectedRootId);
    for (const descriptors of grafts.values()) {
      for (const graft of descriptors) {
        for (const parentId of graft.parentIds) {
          if (!visible.has(parentId)) {
            graftOnly.add(parentId);
          }
          visible.add(parentId);
        }
        for (const siblingId of graft.siblingIds) {
          if (!visible.has(siblingId)) {
            graftOnly.add(siblingId);
          }
          visible.add(siblingId);
        }
      }
    }

    return { visiblePersonIds: visible, graftPersonIds: graftOnly };
  }, [data, selectedRootId]);

  const setError = useCallback((err: string | null) => {
    setErrorState(err);
    setIsLoading(false);
  }, []);

  const value: TreeContextValue = {
    data,
    selectedRootId,
    initialRootId,
    rootsList,
    rootFilterStrategy,
    viewMode,
    searchQuery,
    focusPersonId,
    selectedPersonId,
    highlightedPersonId,
    visiblePersonIds,
    graftPersonIds,
    isMobileSidebarOpen,
    config,
    isLoading,
    error,
    setData,
    setSelectedRootId,
    setRootFilterStrategy,
    setViewMode,
    setSearchQuery,
    setFocusPersonId,
    setSelectedPersonId,
    setHighlightedPersonId,
    setMobileSidebarOpen,
    setConfig,
    setError,
  };

  return <TreeContext.Provider value={value}>{children}</TreeContext.Provider>;
}

export function useTree() {
  const context = useContext(TreeContext);
  if (!context) {
    throw new Error('useTree must be used within a TreeProvider');
  }
  return context;
}
