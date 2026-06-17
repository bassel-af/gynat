'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { CollectionsPageShell } from '@/components/collections/CollectionsPageShell/CollectionsPageShell';
import { VisibilityChip } from '@/components/collections/CollectionBadges/CollectionBadges';
import {
  listCollections,
  createCollection,
  itemCount,
  type Collection,
} from '@/lib/collections/api';
import modal from '../shared-modal.module.css';
import styles from './CollectionsList.module.css';

interface CollectionsListProps {
  slug: string;
  workspaceId: string;
  workspaceName: string;
  canEdit: boolean;
}

/**
 * Screen 3 — every top-level collection in the workspace, a create action, and
 * per-card title / item count / visibility. The list endpoint already returns
 * only top-level collections (nested ones live inside their parent's detail).
 */
export function CollectionsList({
  slug,
  workspaceId,
  workspaceName,
  canEdit,
}: CollectionsListProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setCollections(await listCollections(workspaceId));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'تعذّر تحميل المجموعات');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openCreate() {
    setDraftTitle('');
    setDraftDesc('');
    setCreateError('');
    setShowCreate(true);
  }

  async function commitCreate() {
    if (!draftTitle.trim()) return;
    setBusy(true);
    setCreateError('');
    try {
      const created = await createCollection(workspaceId, {
        titleAr: draftTitle.trim(),
        descriptionAr: draftDesc.trim() || undefined,
      });
      setCollections((prev) => [created, ...prev]);
      setShowCreate(false);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'تعذّر إنشاء المجموعة');
    } finally {
      setBusy(false);
    }
  }

  return (
    <CollectionsPageShell
      workspaceName={workspaceName}
      crumbs={[
        { label: 'المساحة', href: `/workspaces/${slug}` },
        { label: 'المجموعات' },
      ]}
    >
      <div className={styles.intro}>
        <div className={styles.introText}>
          <span className={styles.kicker}>المجموعات</span>
          <h2 className={styles.title}>اجمع أشجارك في وحدةٍ واحدة</h2>
          <p className={styles.hint}>
            نظّم الأشجار والفروع في مجموعاتٍ تُشارَك برابطٍ واحد بدل عدّة روابط
            متفرّقة.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            className={styles.createButton}
            onClick={openCreate}
          >
            <span className={styles.plus}>+</span>
            مجموعة جديدة
          </button>
        )}
      </div>

      {loading ? (
        <div className={styles.empty}>
          <Spinner size="md" label="جاري التحميل..." />
        </div>
      ) : loadError ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{loadError}</p>
          <button
            type="button"
            className={styles.createButton}
            onClick={() => void refresh()}
          >
            إعادة المحاولة
          </button>
        </div>
      ) : collections.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <iconify-icon
              icon="material-symbols:collections-bookmark-outline"
              width="36"
              height="36"
            />
          </span>
          <p className={styles.emptyTitle}>لا توجد مجموعات بعد</p>
          <p className={styles.emptyText}>
            أنشئ أوّل مجموعةٍ وابدأ بإضافة الأشجار والفروع إليها.
          </p>
          {canEdit && (
            <button
              type="button"
              className={styles.createButton}
              onClick={openCreate}
            >
              <span className={styles.plus}>+</span>
              مجموعة جديدة
            </button>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {collections.map((collection) => (
            <Link
              key={collection.id}
              href={`/workspaces/${slug}/collections/${collection.id}`}
              className={styles.card}
            >
              <div className={styles.cardTop}>
                <span className={styles.cardIcon}>
                  <iconify-icon
                    icon="material-symbols:collections-bookmark"
                    width="22"
                    height="22"
                  />
                </span>
                <VisibilityChip level={collection.visibility} />
              </div>
              <h3 className={styles.cardTitle}>{collection.titleAr}</h3>
              {collection.descriptionAr ? (
                <p className={styles.cardDesc}>{collection.descriptionAr}</p>
              ) : (
                <p className={styles.cardDescEmpty}>بلا وصف</p>
              )}
              <div className={styles.cardFooter}>
                <span className={styles.cardCount}>
                  <iconify-icon
                    icon="material-symbols:format-list-bulleted"
                    width="15"
                    height="15"
                    aria-hidden="true"
                  />
                  {itemCount(collection)} عنصراً
                </span>
                <span className={styles.cardEnter}>
                  فتح
                  <span aria-hidden="true">←</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal
          isOpen
          onClose={() => !busy && setShowCreate(false)}
          title="مجموعة جديدة"
          actions={
            <>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setShowCreate(false)}
              >
                إلغاء
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={commitCreate}
                disabled={!draftTitle.trim() || busy}
                loading={busy}
              >
                إنشاء
              </Button>
            </>
          }
        >
          <div>
            <label className={modal.fieldLabel}>عنوان المجموعة</label>
            <input
              type="text"
              className={modal.input}
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="مثال: مقرر أنساب الجزيرة"
              autoFocus
            />
          </div>
          <div>
            <label className={modal.fieldLabel}>الوصف (اختياري)</label>
            <textarea
              className={modal.textarea}
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              placeholder="نبذة قصيرة عمّا تجمعه هذه المجموعة"
              rows={3}
            />
            <p className={modal.hint}>
              تبدأ المجموعة خاصةً — يمكنك نشرها لاحقاً من داخلها.
            </p>
            {createError && <p className={modal.errorText}>{createError}</p>}
          </div>
        </Modal>
      )}
    </CollectionsPageShell>
  );
}
