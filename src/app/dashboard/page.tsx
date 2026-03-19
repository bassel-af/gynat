'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/client';
import { createClient } from '@/lib/supabase/client';
import styles from './dashboard.module.css';

interface Workspace {
  id: string;
  slug: string;
  nameAr: string;
  description: string | null;
}

interface WorkspaceMembership {
  role: string;
  workspace: Workspace;
}

function roleLabel(role: string): string {
  switch (role) {
    case 'workspace_admin':
      return 'مدير';
    case 'workspace_member':
      return 'عضو';
    default:
      return role;
  }
}

export default function DashboardPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchWorkspaces() {
      try {
        const res = await apiFetch('/api/workspaces');
        if (!res.ok) {
          const body = await res.json();
          setError(body.error || 'فشل في تحميل مساحات العائلة');
          return;
        }
        const body = await res.json();
        setWorkspaces(body.data);
      } catch {
        setError('فشل في تحميل مساحات العائلة');
      } finally {
        setLoading(false);
      }
    }
    fetchWorkspaces();
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  }

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>صلة</h1>
        <button onClick={handleLogout} className={styles.logoutButton}>
          تسجيل الخروج
        </button>
      </header>

      <div className={styles.content}>
        {error && <div className={styles.error}>{error}</div>}

        {loading ? (
          <div className={styles.loading}>جاري التحميل...</div>
        ) : workspaces.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🏠</div>
            <h2 className={styles.emptyTitle}>لا توجد مساحات عائلة</h2>
            <p className={styles.emptyText}>
              أنشئ مساحة عائلة جديدة لبدء التعاون مع عائلتك
            </p>
            <Link href="/dashboard/create" className={styles.emptyCreateButton}>
              إنشاء مساحة عائلة جديدة
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>مساحات العائلة</h2>
              <Link href="/dashboard/create" className={styles.createButton}>
                + إنشاء مساحة عائلة جديدة
              </Link>
            </div>
            <div className={styles.workspaceGrid}>
              {workspaces.map((m) => (
                <Link
                  key={m.workspace.id}
                  href={`/workspaces/${m.workspace.slug}`}
                  className={styles.workspaceCard}
                >
                  <h3 className={styles.workspaceName}>عائلة {m.workspace.nameAr}</h3>
                  <div className={styles.workspaceMeta}>
                    <span className={styles.workspaceSlug}>/{m.workspace.slug}</span>
                    <span className={styles.workspaceRole}>{roleLabel(m.role)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
