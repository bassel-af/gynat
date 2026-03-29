'use client';

import { createContext, useContext, type ReactNode } from 'react';

/** Metadata about an active branch pointer (from GET /tree response) */
export interface PointerMetadata {
  id: string;
  sourceWorkspaceNameAr?: string;
  sourceWorkspaceSlug?: string;
  sourceRootName: string;
  anchorIndividualId: string;
  relationship: string;
  status: string;
}

interface WorkspaceTreeContextValue {
  workspaceId: string;
  canEdit: boolean;
  isAdmin: boolean;
  refreshTree: () => Promise<void>;
  /** Branch pointer metadata from GET /tree response */
  pointers?: PointerMetadata[];
  /** Whether the workspace has umm walad feature enabled */
  enableUmmWalad?: boolean;
}

const WorkspaceTreeContext = createContext<WorkspaceTreeContextValue | null>(null);

interface WorkspaceTreeProviderProps {
  children: ReactNode;
  workspaceId: string;
  canEdit: boolean;
  isAdmin: boolean;
  refreshTree: () => Promise<void>;
  pointers?: PointerMetadata[];
  enableUmmWalad?: boolean;
}

export function WorkspaceTreeProvider({
  children,
  workspaceId,
  canEdit,
  isAdmin,
  refreshTree,
  pointers,
  enableUmmWalad,
}: WorkspaceTreeProviderProps) {
  return (
    <WorkspaceTreeContext.Provider value={{ workspaceId, canEdit, isAdmin, refreshTree, pointers, enableUmmWalad }}>
      {children}
    </WorkspaceTreeContext.Provider>
  );
}

export function useWorkspaceTree() {
  const context = useContext(WorkspaceTreeContext);
  if (!context) {
    throw new Error('useWorkspaceTree must be used within a WorkspaceTreeProvider');
  }
  return context;
}
