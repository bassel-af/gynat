'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/client';
import { roleLabel } from '@/lib/workspace/labels';
import { Spinner } from '@/components/ui/Spinner';
import { UserNav } from '@/components/ui/UserNav';
import styles from './workspaces.module.css';

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

export default function WorkspacesPage() {
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

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>سلالة</h1>
        <div className={styles.headerActions}>
          <UserNav />
        </div>
      </header>

      <div className={styles.content}>
        {error && <div className={styles.error}>{error}</div>}

        {loading ? (
          <div className={styles.loading}>
            <Spinner size="lg" label="جاري التحميل..." />
          </div>
        ) : workspaces.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <iconify-icon icon="material-symbols:home-work" width="64" height="64" />
            </div>
            <h2 className={styles.emptyTitle}>لا توجد مساحات عائلية</h2>
            <p className={styles.emptyText}>
              أنشئ مساحة عائلية جديدة لبدء التعاون مع عائلتك
            </p>
            <Link href="/workspaces/create" className={styles.emptyCreateButton}>
              إنشاء مساحة عائلية جديدة
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>مساحات العائلة</h2>
              <Link href="/workspaces/create" className={styles.createButton}>
                + إنشاء مساحة عائلية جديدة
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
