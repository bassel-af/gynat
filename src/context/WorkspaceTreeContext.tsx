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
  /**
   * Which tree the editor is mutating. Set when the member tree view was
   * opened on an `extra` tree (via `?treeId=`); absent ⇒ the workspace main
   * tree. Threaded into mutation request bodies so edits target the right tree.
   */
  activeTreeId?: string;
  /** Branch pointer metadata from GET /tree response */
  pointers?: PointerMetadata[];
  /** Whether the workspace has umm walad feature enabled */
  enableUmmWalad?: boolean;
  /** Whether the workspace has rada'a (foster nursing) feature enabled */
  enableRadaa?: boolean;
  /** Whether new «قفزة نسب» (ancestry jumps) can be added in this workspace */
  enableAncestryJumps?: boolean;
  /** Whether the workspace has kunya feature enabled */
  enableKunya?: boolean;
  /** Whether the workspace has audit log feature enabled */
  enableAuditLog?: boolean;
  /** Whether tree export is available in this workspace */
  enableTreeExport?: boolean;
  /** Whether non-admin members are allowed to export the tree */
  allowMemberExport?: boolean;
  /** Whether to hide birth dates for female individuals */
  hideBirthDateForFemale?: boolean;
  /** Whether to hide birth dates for male individuals */
  hideBirthDateForMale?: boolean;
  /** Workspace description (shown in sidebar "about" panel) */
  description?: string;
  /** Workspace (family) name in Arabic — shown in the sidebar title */
  familyName?: string;
  /** Pre-check "deceased" on new person forms (create mode only) */
  defaultNewPersonDeceased?: boolean;
  /**
   * Set ONLY by the anonymous public tree viewer (`/family/[slug]`): the
   * published tree's slug. Panels that would call member APIs read public
   * routes instead (e.g. «المصادر»).
   */
  publicSlug?: string;
}

const WorkspaceTreeContext = createContext<WorkspaceTreeContextValue | null>(null);

interface WorkspaceTreeProviderProps {
  children: ReactNode;
  workspaceId: string;
  canEdit: boolean;
  isAdmin: boolean;
  refreshTree: () => Promise<void>;
  activeTreeId?: string;
  pointers?: PointerMetadata[];
  enableUmmWalad?: boolean;
  enableRadaa?: boolean;
  enableAncestryJumps?: boolean;
  enableKunya?: boolean;
  enableAuditLog?: boolean;
  enableTreeExport?: boolean;
  allowMemberExport?: boolean;
  hideBirthDateForFemale?: boolean;
  hideBirthDateForMale?: boolean;
  description?: string;
  familyName?: string;
  defaultNewPersonDeceased?: boolean;
  publicSlug?: string;
}

export function WorkspaceTreeProvider({
  children,
  workspaceId,
  canEdit,
  isAdmin,
  refreshTree,
  activeTreeId,
  pointers,
  enableUmmWalad,
  enableRadaa,
  enableAncestryJumps,
  enableKunya,
  enableAuditLog,
  enableTreeExport,
  allowMemberExport,
  hideBirthDateForFemale,
  hideBirthDateForMale,
  description,
  familyName,
  defaultNewPersonDeceased,
  publicSlug,
}: WorkspaceTreeProviderProps) {
  return (
    <WorkspaceTreeContext.Provider value={{ workspaceId, canEdit, isAdmin, refreshTree, activeTreeId, pointers, enableUmmWalad, enableRadaa, enableAncestryJumps, enableKunya, enableAuditLog, enableTreeExport, allowMemberExport, hideBirthDateForFemale, hideBirthDateForMale, description, familyName, defaultNewPersonDeceased, publicSlug }}>
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

export function useOptionalWorkspaceTree() {
  return useContext(WorkspaceTreeContext);
}
