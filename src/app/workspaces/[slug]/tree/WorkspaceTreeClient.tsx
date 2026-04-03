'use client';

import { useEffect, useState, useCallback } from 'react';
import { TreeProvider, useTree } from '@/context/TreeContext';
import { WorkspaceTreeProvider, useWorkspaceTree } from '@/context/WorkspaceTreeContext';
import { useWorkspaceTreeData } from '@/hooks/useWorkspaceTreeData';
import { useTreeColorOverrides } from '@/hooks/useTreeColorOverrides';
import { FamilyTree, EmptyTreeState, IndividualForm } from '@/components/tree';
import type { IndividualFormData } from '@/components/tree';
import { CanvasToolbar } from '@/components/tree/CanvasToolbar';
import { Sidebar } from '@/components/ui';
import { Spinner } from '@/components/ui/Spinner';
import { apiFetch } from '@/lib/api/client';
import Link from 'next/link';

interface WorkspaceInfo {
  id: string;
  slug: string;
  nameAr: string;
  currentUserRole: string;
  currentUserPermissions: string[];
  enableUmmWalad?: boolean;
  enableRadaa?: boolean;
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
        <Link href="/dashboard">&rarr; العودة للوحة التحكم</Link>
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
    >
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <CanvasToolbar workspaceSlug={workspace.slug} />
          <FamilyTree hideMiniMap />
        </main>
      </div>
    </WorkspaceTreeProvider>
  );
}

function EmptyTreeWithForm({ canEdit }: { canEdit: boolean }) {
  const { workspaceId, refreshTree } = useWorkspaceTree();
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

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

  return (
    <>
      <EmptyTreeState canEdit={canEdit} onAddFirst={handleAddFirst} />
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
