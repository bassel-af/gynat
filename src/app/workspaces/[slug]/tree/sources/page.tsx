'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { UserNav } from '@/components/ui/UserNav';
import { Spinner } from '@/components/ui/Spinner';
import { SourcesManager } from '@/components/sources/SourcesManager';
import { TreeSourceCard } from '@/components/sources/TreeSourceCard';
import { apiFetch } from '@/lib/api/client';
import auditStyles from '@/components/tree/AuditLog/AuditLog.module.css';
import styles from '@/components/sources/SourcesAdmin.module.css';

interface WorkspaceInfo {
  id: string;
  slug: string;
  nameAr: string;
  currentUserRole: string;
  hideBirthDateForFemale?: boolean;
  hideBirthDateForMale?: boolean;
}

/**
 * «المصادر» — admins-only page listing every source of the tree (one row per
 * source, with who it is «مصدر لـ»), with the tree-wide source card on top.
 * `?treeId=` targets an `extra` tree, like
 * the editor. Non-admins get the same no-access treatment as the audit page
 * (the API is admin-only regardless).
 */
function SourcesPageInner() {
  const { slug } = useParams<{ slug: string }>();
  const treeId = useSearchParams().get('treeId') ?? undefined;
  const treeHref = `/workspaces/${slug}/tree${treeId ? `?treeId=${encodeURIComponent(treeId)}` : ''}`;

  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiFetch(`/api/workspaces/by-slug/${slug}`);
        const body = await res.json();
        if (!active) return;
        if (!res.ok) setError(body.error || 'فشل في تحميل مساحة العمل');
        else setWorkspace(body.data);
      } catch {
        if (active) setError('فشل في تحميل مساحة العمل');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [slug]);

  const backLink = (
    <Link href={treeHref} className={auditStyles.pageBackLink}>
      &rarr; العودة للشجرة
    </Link>
  );

  if (loading) {
    return (
      <main className={auditStyles.pageContainer}>
        <div className={styles.centered}>
          <Spinner size="lg" label="جاري التحميل..." />
        </div>
      </main>
    );
  }

  const isAdmin = workspace?.currentUserRole === 'workspace_admin';
  if (error || !workspace || !isAdmin) {
    return (
      <main className={auditStyles.pageContainer}>
        <div className={auditStyles.pageHeader}>{backLink}</div>
        <div className={auditStyles.pageContent}>
          <div className={auditStyles.errorState}>
            <p>{error || (!workspace ? 'لم يتم العثور على المساحة' : 'ليس لديك صلاحية الوصول للمصادر')}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={auditStyles.pageContainer}>
      <div className={`${auditStyles.pageHeader} ${styles.pageHeader}`}>
        <h1 className={auditStyles.pageTitle}>المصادر</h1>
        <div className={auditStyles.pageHeaderRight}>
          <UserNav />
          {backLink}
        </div>
      </div>
      <div className={`${auditStyles.pageContent} ${styles.pageContent}`}>
        <p className={auditStyles.pageDescription}>
          كل مصادر الشجرة في مكان واحد: ابحث، وحدّد، وغيّر من يرى المصادر أو احذفها دفعة واحدة.
        </p>
        <TreeSourceCard workspaceId={workspace.id} treeId={treeId} />
        <SourcesManager
          workspaceId={workspace.id}
          slug={slug}
          treeId={treeId}
          birthPrivacy={{
            hideBirthDateForFemale: workspace.hideBirthDateForFemale,
            hideBirthDateForMale: workspace.hideBirthDateForMale,
          }}
        />
      </div>
    </main>
  );
}

export default function SourcesPage() {
  return (
    <Suspense fallback={null}>
      <SourcesPageInner />
    </Suspense>
  );
}
