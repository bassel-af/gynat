'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AuditLogList } from '@/components/tree/AuditLog';
import { UserNav } from '@/components/ui/UserNav';
import { Spinner } from '@/components/ui/Spinner';
import { apiFetch } from '@/lib/api/client';
import styles from '@/components/tree/AuditLog/AuditLog.module.css';

interface WorkspaceInfo {
  id: string;
  slug: string;
  nameAr: string;
  currentUserRole: string;
  enableAuditLog?: boolean;
}

export default function AuditLogPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

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
      <main className={styles.pageContainer}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>
          <Spinner size="lg" label="جاري التحميل..." />
        </div>
      </main>
    );
  }

  if (error || !workspace) {
    return (
      <main className={styles.pageContainer}>
        <div className={styles.pageHeader}>
          <Link href={`/workspaces/${slug}/tree`} className={styles.pageBackLink}>
            &rarr; العودة للشجرة
          </Link>
        </div>
        <div className={styles.pageContent}>
          <div className={styles.errorState}>
            <p>{error || 'لم يتم العثور على المساحة'}</p>
          </div>
        </div>
      </main>
    );
  }

  const isAdmin = workspace.currentUserRole === 'workspace_admin';

  if (!isAdmin) {
    return (
      <main className={styles.pageContainer}>
        <div className={styles.pageHeader}>
          <Link href={`/workspaces/${slug}/tree`} className={styles.pageBackLink}>
            &rarr; العودة للشجرة
          </Link>
        </div>
        <div className={styles.pageContent}>
          <div className={styles.errorState}>
            <p>ليس لديك صلاحية الوصول لسجل التعديلات</p>
          </div>
        </div>
      </main>
    );
  }

  if (!workspace.enableAuditLog) {
    return (
      <main className={styles.pageContainer}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>سجل التعديلات</h1>
          <div className={styles.pageHeaderRight}>
            <UserNav />
            <Link href={`/workspaces/${slug}/tree`} className={styles.pageBackLink}>
              &rarr; العودة للشجرة
            </Link>
          </div>
        </div>
        <div className={styles.pageContent}>
          <div className={styles.emptyState}>
            <svg className={styles.emptyIcon} width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p className={styles.emptyText}>سجل التعديلات غير مفعّل</p>
            <p className={styles.emptyHint}>
              يمكنك تفعيله من{' '}
              <Link href={`/workspaces/${slug}`} style={{ color: 'var(--heritage-gold-bright)', textDecoration: 'none' }}>
                إعدادات المساحة
              </Link>
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>سجل التعديلات — {workspace.nameAr}</h1>
        <div className={styles.pageHeaderRight}>
          <UserNav />
          <Link href={`/workspaces/${slug}/tree`} className={styles.pageBackLink}>
            &rarr; العودة للشجرة
          </Link>
        </div>
      </div>
      <div className={styles.pageContent}>
        <p className={styles.pageDescription}>
          جميع التعديلات على شجرة العائلة مع تفاصيل التغييرات والمستخدم والوقت
        </p>
        <AuditLogList workspaceId={workspace.id} />
      </div>
    </main>
  );
}
