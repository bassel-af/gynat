'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/client';
import { roleLabel } from '@/lib/workspace/labels';
import { Spinner } from '@/components/ui/Spinner';
import { UserNav } from '@/components/ui/UserNav';
import { FigureCluster } from '@/components/heritage/FigureCluster';
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
    <main className={styles.root}>
      <header className={styles.header}>
        <Link href="/workspaces" className={styles.wordmark}>صُلالَة</Link>
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
          <div className={styles.empty}>
            <div className={styles.emptyMedallion}>
              <FigureCluster variant="medallion" />
            </div>
            <h2 className={styles.emptyTitle}>ابدأ أوّل مساحةٍ لعائلتك</h2>
            <p className={styles.emptyText}>
              أنشئ بيتاً رقميّاً يجمع أفراد عائلتك ويحفظ أسماء الأجداد وحكاياتهم عبر الأجيال.
            </p>
            <Link href="/workspaces/create" className={styles.createButton}>
              <span className={styles.createPlusIcon}>+</span>
              إنشاء مساحة عائلية
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.sectionHead}>
              <div className={styles.sectionHeadText}>
                <span className={styles.kicker}>مساحات العائلة</span>
                <h2 className={styles.sectionTitle}>بيوتٌ يجتمع فيها الأحبّة</h2>
                <p className={styles.sectionHint}>
                  اختَر مساحةً للدخول إليها، أو أنشِئ مساحةً جديدة لفرعٍ آخر.
                </p>
              </div>
              <Link href="/workspaces/create" className={styles.createButton}>
                <span className={styles.createPlusIcon}>+</span>
                مساحة جديدة
              </Link>
            </div>

            <div className={styles.grid}>
              {workspaces.map((m) => (
                <Link
                  key={m.workspace.id}
                  href={`/workspaces/${m.workspace.slug}`}
                  className={styles.card}
                >
                  <h3 className={styles.cardName}>عائلة {m.workspace.nameAr}</h3>
                  <div className={styles.cardSlug}>/{m.workspace.slug}</div>

                  <div className={styles.cardFooter}>
                    <span className={styles.cardRole}>{roleLabel(m.role)}</span>
                    <span className={styles.cardEnter}>
                      ادخُل
                      <span aria-hidden>←</span>
                    </span>
                  </div>

                  <div className={styles.cardFigures}>
                    <FigureCluster variant="corner" />
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
