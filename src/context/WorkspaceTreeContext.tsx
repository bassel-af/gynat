'use client';

import { createContext, useContext, type ReactNode } from 'react';

interface WorkspaceTreeContextValue {
  workspaceId: string;
  canEdit: boolean;
  refreshTree: () => Promise<void>;
}

const WorkspaceTreeContext = createContext<WorkspaceTreeContextValue | null>(null);

interface WorkspaceTreeProviderProps {
  children: ReactNode;
  workspaceId: string;
  canEdit: boolean;
  refreshTree: () => Promise<void>;
}

export function WorkspaceTreeProvider({
  children,
  workspaceId,
  canEdit,
  refreshTree,
}: WorkspaceTreeProviderProps) {
  return (
    <WorkspaceTreeContext.Provider value={{ workspaceId, canEdit, refreshTree }}>
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
