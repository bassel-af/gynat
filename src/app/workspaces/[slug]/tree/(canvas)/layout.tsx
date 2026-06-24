'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams, usePathname } from 'next/navigation';
import { viewModeFromPathname } from '@/lib/tree/view-modes';
import { TreeProvider, useTree } from '@/context/TreeContext';
import { WorkspaceTreeProvider, useWorkspaceTree } from '@/context/WorkspaceTreeContext';
import { UndoStackProvider, useUndoStack } from '@/context/UndoStackContext';
import { useWorkspaceTreeData } from '@/hooks/useWorkspaceTreeData';
import { useTreeColorOverrides } from '@/hooks/useTreeColorOverrides';
import { useKeyboardUndoRedo } from '@/hooks/useKeyboardUndoRedo';
import { EmptyTreeState, IndividualForm } from '@/components/tree';
import type { IndividualFormData } from '@/components/tree';
import { CanvasToolbar } from '@/components/tree/CanvasToolbar';
import { ConflictDialog } from '@/components/tree/ConflictDialog';
import { PublishFlowContainer } from '@/components/public-tree';
import { Sidebar } from '@/components/ui';
import { Spinner } from '@/components/ui/Spinner';
import { apiFetch } from '@/lib/api/client';
import { useToast } from '@/context/ToastContext';
import Link from 'next/link';

// The member tree has two views — the spatial canvas (`tree/page.tsx`) and the
// focused person page (`tree/person/[individualId]/page.tsx`) — that share ONE
// shell: workspace fetch, providers, sidebar, toolbar and the undo stack all
// live here so toggling between the two views is a child-segment swap, not a
// remount. `{children}` renders inside <main> exactly where <FamilyTree/> used
// to live; each child reads the same providers (no refetch) and decides what
// fills the canvas area. The member surface is always noindex (no metadata,
// no JSON-LD) — that concern lives only on the public `/family/[slug]` route.

interface WorkspaceInfo {
  id: string;
  slug: string;
  nameAr: string;
  description?: string;
  currentUserRole: string;
  currentUserPermissions: string[];
  enableUmmWalad?: boolean;
  enableRadaa?: boolean;
  enableKunya?: boolean;
  enableAuditLog?: boolean;
  enableTreeExport?: boolean;
  allowMemberExport?: boolean;
  hideBirthDateForFemale?: boolean;
  hideBirthDateForMale?: boolean;
  defaultNewPersonDeceased?: boolean;
}

function TreeLayoutInner({ children }: { children: React.ReactNode }) {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  // `?treeId=<id>` opens the editor on an `extra` tree; absent ⇒ main tree.
  // Read once here and fed into WorkspaceTreeProvider; children re-read it from
  // the search params for their own href-building.
  const treeId = useSearchParams().get('treeId') ?? undefined;

  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchWorkspace() {
      try {
        const res = await apiFetch(`/api/workspaces/by-slug/${slug}`);
        if (!res.ok) {
          const body = await res.json();
          setError(body.error || 'فشل في تحميل مساحة العمل');
          return;
        }
        const body = await res.json();
        setWorkspace(body.data);
      } catch {
        setError('فشل في تحميل مساحة العمل');
      } finally {
        setLoading(false);
      }
    }
    fetchWorkspace();
  }, [slug]);

  if (loading) {
    return (
      <div className="loading">
        <Spinner size="lg" label="جاري التحميل..." />
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="error">
        <Link href="/workspaces">&rarr; العودة للمساحات</Link>
        <p>{error || 'لم يتم العثور على المساحة'}</p>
      </div>
    );
  }

  const isAdmin = workspace.currentUserRole === 'workspace_admin';
  const canEdit =
    isAdmin ||
    (workspace.currentUserPermissions ?? []).includes('tree_editor');

  return (
    <TreeProvider>
      <TreeShellGate
        workspace={workspace}
        canEdit={canEdit}
        isAdmin={isAdmin}
        treeId={treeId}
      >
        {children}
      </TreeShellGate>
    </TreeProvider>
  );
}

export default function TreeLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="loading">جاري التحميل...</div>}>
      <TreeLayoutInner>{children}</TreeLayoutInner>
    </Suspense>
  );
}

/**
 * Loads the tree data and gates on its state: the empty-tree first-run UI
 * (sidebar/toolbar deliberately absent, exactly as before), or the full shell
 * with the undo stack wrapping the sidebar + toolbar + {children}.
 */
function TreeShellGate({
  workspace,
  canEdit,
  isAdmin,
  treeId,
  children,
}: {
  workspace: WorkspaceInfo;
  canEdit: boolean;
  isAdmin: boolean;
  treeId?: string;
  children: React.ReactNode;
}) {
  const { isLoading, error, data } = useTree();
  const { refreshTree, pointers } = useWorkspaceTreeData(workspace.id, treeId);
  useTreeColorOverrides();

  if (error) {
    return <div className="error">خطأ في تحميل شجرة العائلة: {error}</div>;
  }

  if (isLoading) {
    return (
      <div className="loading">
        <Spinner size="lg" label="جاري تحميل شجرة العائلة..." />
      </div>
    );
  }

  const isEmpty = !data || Object.keys(data.individuals).length === 0;

  const providerProps = {
    workspaceId: workspace.id,
    canEdit,
    isAdmin,
    refreshTree,
    activeTreeId: treeId,
    pointers,
    enableUmmWalad: workspace.enableUmmWalad,
    enableRadaa: workspace.enableRadaa,
    enableKunya: workspace.enableKunya,
    enableAuditLog: workspace.enableAuditLog,
    enableTreeExport: workspace.enableTreeExport,
    allowMemberExport: workspace.allowMemberExport,
    hideBirthDateForFemale: workspace.hideBirthDateForFemale,
    hideBirthDateForMale: workspace.hideBirthDateForMale,
    description: workspace.description,
    familyName: workspace.nameAr,
    defaultNewPersonDeceased: workspace.defaultNewPersonDeceased,
  } as const;

  if (isEmpty) {
    return (
      <WorkspaceTreeProvider {...providerProps}>
        <EmptyTreeWithForm canEdit={canEdit} />
      </WorkspaceTreeProvider>
    );
  }

  return (
    <WorkspaceTreeProvider {...providerProps}>
      <UndoStackProvider workspaceId={workspace.id} refreshTree={refreshTree} key={workspace.id}>
        <TreeShell workspaceSlug={workspace.slug} workspaceId={workspace.id}>
          {children}
        </TreeShell>
      </UndoStackProvider>
    </WorkspaceTreeProvider>
  );
}

function TreeShell({
  workspaceSlug,
  workspaceId,
  children,
}: {
  workspaceSlug: string;
  workspaceId: string;
  children: React.ReactNode;
}) {
  const { canEdit, isAdmin, activeTreeId } = useWorkspaceTree();
  const { setMobileSidebarOpen } = useTree();
  const undoStack = useUndoStack();
  const { showToast } = useToast();
  const [publishOpen, setPublishOpen] = useState(false);

  // Close the mobile sidebar drawer whenever the member TOGGLES between the two
  // views (tree ↔ person) via the in-sidebar switcher. Keyed on the view mode
  // flipping — so a person→person navigation inside the drawer (mode stays
  // 'person') deliberately keeps it open, and canvas-internal navigation (mode
  // stays 'tree') is untouched. Runs AFTER the route commits, so it never races
  // the Sidebar's back-button history sentinel (closing during navigation would
  // trigger that effect's cleanup `history.back()` and strand the drawer open).
  const pathname = usePathname();
  const isPersonView = viewModeFromPathname(pathname) === 'person';
  const prevIsPersonView = useRef(isPersonView);
  useEffect(() => {
    if (prevIsPersonView.current !== isPersonView) {
      prevIsPersonView.current = isPersonView;
      setMobileSidebarOpen(false);
    }
  }, [isPersonView, setMobileSidebarOpen]);
  // Publishing is an admin-only capability.
  const canPublish = isAdmin;

  const handleUndo = useCallback(async () => {
    const label = undoStack.topUndoLabel;
    await undoStack.undo();
    if (label && !undoStack.conflict) {
      showToast(`تم التراجع عن: ${label}`, 'success');
    }
  }, [undoStack, showToast]);

  const handleRedo = useCallback(async () => {
    const label = undoStack.topRedoLabel;
    await undoStack.redo();
    if (label && !undoStack.conflict) {
      showToast(`تمت إعادة: ${label}`, 'success');
    }
  }, [undoStack, showToast]);

  useKeyboardUndoRedo({
    onUndo: handleUndo,
    onRedo: handleRedo,
    enabled: canEdit,
  });

  const undoRedoProps = canEdit
    ? {
        canUndo: undoStack.canUndo,
        canRedo: undoStack.canRedo,
        isInFlight: undoStack.isInFlight,
        onUndo: handleUndo,
        onRedo: handleRedo,
      }
    : undefined;

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <CanvasToolbar
          workspaceSlug={workspaceSlug}
          workspaceId={workspaceId}
          undoRedo={undoRedoProps}
          onPublish={canPublish ? () => setPublishOpen(true) : undefined}
        />
        {children}
      </main>
      <ConflictDialog
        isOpen={undoStack.conflict !== null}
        variant={undoStack.conflict?.kind ?? 'stale'}
        onRefresh={() => {
          if (typeof window !== 'undefined') window.location.reload();
        }}
      />
      {/* Real publish flow — fetches the live checkpoint and persists. */}
      {canPublish && publishOpen && (
        <PublishFlowContainer
          workspaceId={workspaceId}
          treeId={activeTreeId}
          onClose={() => setPublishOpen(false)}
        />
      )}
    </div>
  );
}

function EmptyTreeWithForm({ canEdit }: { canEdit: boolean }) {
  const { workspaceId, activeTreeId, refreshTree, enableKunya, defaultNewPersonDeceased } = useWorkspaceTree();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddFirst = useCallback(() => {
    setShowForm(true);
    setFormError('');
  }, []);

  const handleClose = useCallback(() => {
    setShowForm(false);
    setFormError('');
  }, []);

  const handleSubmit = useCallback(
    async (data: IndividualFormData) => {
      setFormLoading(true);
      setFormError('');
      try {
        const res = await apiFetch(
          `/api/workspaces/${workspaceId}/tree/individuals`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(activeTreeId ? { ...data, treeId: activeTreeId } : data),
          },
        );
        if (!res.ok) {
          const body = await res.json();
          setFormError(body.error || 'فشل في إضافة الشخص');
          return;
        }
        setShowForm(false);
        await refreshTree();
      } catch {
        setFormError('فشل في إضافة الشخص');
      } finally {
        setFormLoading(false);
      }
    },
    [workspaceId, activeTreeId, refreshTree],
  );

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset input so the same file can be re-selected
      e.target.value = '';

      setImportLoading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        if (activeTreeId) formData.append('treeId', activeTreeId);

        const res = await apiFetch(
          `/api/workspaces/${workspaceId}/tree/import`,
          { method: 'POST', body: formData },
        );
        const body = await res.json();
        if (!res.ok) {
          showToast(body.error || 'فشل في استيراد البيانات', 'error');
          return;
        }
        showToast('تم استيراد البيانات بنجاح', 'success');
        await refreshTree();
      } catch {
        showToast('فشل في استيراد البيانات', 'error');
      } finally {
        setImportLoading(false);
      }
    },
    [workspaceId, activeTreeId, refreshTree, showToast],
  );

  return (
    <>
      <EmptyTreeState
        canEdit={canEdit}
        onAddFirst={handleAddFirst}
        // GEDCOM import is main-tree only; extra trees have no import path.
        onImport={activeTreeId ? undefined : handleImport}
        importLoading={importLoading}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".ged"
        onChange={handleFileChange}
        tabIndex={-1}
        aria-label="استيراد ملف GEDCOM"
        style={{ display: 'none' }}
      />
      {showForm && (
        <IndividualForm
          mode="create"
          onSubmit={handleSubmit}
          onClose={handleClose}
          isLoading={formLoading}
          error={formError}
          enableKunya={enableKunya}
          workspaceId={workspaceId}
          defaultDeceased={defaultNewPersonDeceased}
        />
      )}
    </>
  );
}
