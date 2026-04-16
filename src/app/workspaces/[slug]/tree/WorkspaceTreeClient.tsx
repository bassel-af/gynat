'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { TreeProvider, useTree } from '@/context/TreeContext';
import { WorkspaceTreeProvider, useWorkspaceTree } from '@/context/WorkspaceTreeContext';
import { UndoStackProvider, useUndoStack } from '@/context/UndoStackContext';
import { useWorkspaceTreeData } from '@/hooks/useWorkspaceTreeData';
import { useTreeColorOverrides } from '@/hooks/useTreeColorOverrides';
import { useKeyboardUndoRedo } from '@/hooks/useKeyboardUndoRedo';
import { FamilyTree, EmptyTreeState, IndividualForm } from '@/components/tree';
import type { IndividualFormData } from '@/components/tree';
import { CanvasToolbar } from '@/components/tree/CanvasToolbar';
import { ConflictDialog } from '@/components/tree/ConflictDialog';
import { Sidebar } from '@/components/ui';
import { Spinner } from '@/components/ui/Spinner';
import { apiFetch } from '@/lib/api/client';
import { useToast } from '@/context/ToastContext';
import Link from 'next/link';

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
  hideBirthDateForFemale?: boolean;
  hideBirthDateForMale?: boolean;
}

interface WorkspaceTreeClientProps {
  slug: string;
}

export function WorkspaceTreeClient({ slug }: WorkspaceTreeClientProps) {
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
      <TreeContent workspace={workspace} canEdit={canEdit} isAdmin={isAdmin} />
    </TreeProvider>
  );
}

function TreeContent({
  workspace,
  canEdit,
  isAdmin,
}: {
  workspace: WorkspaceInfo;
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const { isLoading, error, data } = useTree();
  const { refreshTree, pointers } = useWorkspaceTreeData(workspace.id);
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

  const isEmpty =
    !data ||
    Object.keys(data.individuals).length === 0;

  if (isEmpty) {
    return (
      <WorkspaceTreeProvider
        workspaceId={workspace.id}
        canEdit={canEdit}
        isAdmin={isAdmin}
        refreshTree={refreshTree}
        pointers={pointers}
        enableUmmWalad={workspace.enableUmmWalad}
        enableRadaa={workspace.enableRadaa}
        enableKunya={workspace.enableKunya}
        enableAuditLog={workspace.enableAuditLog}
        hideBirthDateForFemale={workspace.hideBirthDateForFemale}
        hideBirthDateForMale={workspace.hideBirthDateForMale}
        description={workspace.description}
      >
        <EmptyTreeWithForm canEdit={canEdit} />
      </WorkspaceTreeProvider>
    );
  }

  return (
    <WorkspaceTreeProvider
      workspaceId={workspace.id}
      canEdit={canEdit}
      isAdmin={isAdmin}
      refreshTree={refreshTree}
      pointers={pointers}
      enableUmmWalad={workspace.enableUmmWalad}
      enableRadaa={workspace.enableRadaa}
      enableKunya={workspace.enableKunya}
      enableAuditLog={workspace.enableAuditLog}
      hideBirthDateForFemale={workspace.hideBirthDateForFemale}
      hideBirthDateForMale={workspace.hideBirthDateForMale}
      description={workspace.description}
    >
      <UndoStackProvider workspaceId={workspace.id} refreshTree={refreshTree} key={workspace.id}>
        <TreeShell workspaceSlug={workspace.slug} workspaceId={workspace.id} />
      </UndoStackProvider>
    </WorkspaceTreeProvider>
  );
}

function TreeShell({ workspaceSlug, workspaceId }: { workspaceSlug: string; workspaceId: string }) {
  const { canEdit } = useWorkspaceTree();
  const undoStack = useUndoStack();
  const { showToast } = useToast();

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
        />
        <FamilyTree hideMiniMap />
      </main>
      <ConflictDialog
        isOpen={undoStack.conflict !== null}
        variant={undoStack.conflict?.kind ?? 'stale'}
        onRefresh={() => {
          if (typeof window !== 'undefined') window.location.reload();
        }}
      />
    </div>
  );
}

function EmptyTreeWithForm({ canEdit }: { canEdit: boolean }) {
  const { workspaceId, refreshTree } = useWorkspaceTree();
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
            body: JSON.stringify(data),
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
    [workspaceId, refreshTree],
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
    [workspaceId, refreshTree, showToast],
  );

  return (
    <>
      <EmptyTreeState
        canEdit={canEdit}
        onAddFirst={handleAddFirst}
        onImport={handleImport}
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
        />
      )}
    </>
  );
}
