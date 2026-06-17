'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { CollectionsPageShell } from '@/components/collections/CollectionsPageShell/CollectionsPageShell';
import { VisibilityChip } from '@/components/collections/CollectionBadges/CollectionBadges';
import {
  listExtraTrees,
  createExtraTree,
  renameExtraTree,
  deleteExtraTree,
  duplicateTree,
  type WorkspaceTree,
} from '@/lib/collections/api';
import modal from '../shared-modal.module.css';
import styles from './TreesArea.module.css';

interface TreesAreaProps {
  slug: string;
  workspaceId: string;
  workspaceName: string;
  canEdit: boolean;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'rename'; tree: WorkspaceTree }
  | { kind: 'delete'; tree: WorkspaceTree };

/**
 * Screen 2 — the workspace's trees (§0, §2.5, §2.6): one fixed main family tree
 * plus optional lightweight extra trees that exist only inside collections.
 * Create / rename / delete an extra tree. The main tree is locked.
 *
 * The main family tree lives at /tree and is managed there; this area lists and
 * manages only the extra trees via /api/workspaces/[id]/extra-trees.
 */
export function TreesArea({
  slug,
  workspaceId,
  workspaceName,
  canEdit,
}: TreesAreaProps) {
  const [extraTrees, setExtraTrees] = useState<WorkspaceTree[]>([]);
  const [mainTreeId, setMainTreeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [draftName, setDraftName] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  // Per-card duplicate state: the tree id being copied (so its button spins).
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // The endpoint returns the main tree too — it has its own dedicated card,
      // so this section lists only the extra trees but keeps the main tree id
      // around so it can be duplicated.
      const trees = await listExtraTrees(workspaceId);
      setExtraTrees(trees.filter((t) => t.kind === 'extra'));
      setMainTreeId(trees.find((t) => t.kind === 'main')?.id ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'تعذّر تحميل الأشجار');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openCreate() {
    setDraftName('');
    setActionError('');
    setDialog({ kind: 'create' });
  }
  function openRename(tree: WorkspaceTree) {
    setDraftName(tree.nameAr);
    setActionError('');
    setDialog({ kind: 'rename', tree });
  }
  function close() {
    if (busy) return;
    setDialog({ kind: 'none' });
  }

  async function commitCreate() {
    if (!draftName.trim()) return;
    setBusy(true);
    setActionError('');
    try {
      const created = await createExtraTree(workspaceId, draftName.trim());
      setExtraTrees((prev) => [created, ...prev]);
      setDialog({ kind: 'none' });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'تعذّر إنشاء الشجرة');
    } finally {
      setBusy(false);
    }
  }

  async function commitRename() {
    if (dialog.kind !== 'rename' || !draftName.trim()) return;
    const id = dialog.tree.id;
    const name = draftName.trim();
    setBusy(true);
    setActionError('');
    try {
      await renameExtraTree(workspaceId, id, name);
      setExtraTrees((prev) =>
        prev.map((t) => (t.id === id ? { ...t, nameAr: name } : t)),
      );
      setDialog({ kind: 'none' });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'تعذّر حفظ الاسم');
    } finally {
      setBusy(false);
    }
  }

  async function commitDelete() {
    if (dialog.kind !== 'delete') return;
    const id = dialog.tree.id;
    setBusy(true);
    setActionError('');
    try {
      await deleteExtraTree(workspaceId, id);
      setExtraTrees((prev) => prev.filter((t) => t.id !== id));
      setDialog({ kind: 'none' });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'تعذّر حذف الشجرة');
    } finally {
      setBusy(false);
    }
  }

  // Duplicate any tree (main or extra) into a new frozen extra tree, then
  // prepend the returned copy to the list.
  async function duplicate(treeId: string) {
    if (duplicatingId) return;
    setDuplicatingId(treeId);
    setActionError('');
    try {
      const created = await duplicateTree(workspaceId, treeId);
      setExtraTrees((prev) => [created, ...prev]);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'تعذّر تكرار الشجرة');
    } finally {
      setDuplicatingId(null);
    }
  }

  return (
    <CollectionsPageShell
      workspaceName={workspaceName}
      crumbs={[
        { label: 'المساحة', href: `/workspaces/${slug}` },
        { label: 'الأشجار' },
      ]}
    >
      <div className={styles.intro}>
        <div className={styles.introText}>
          <span className={styles.kicker}>الأشجار</span>
          <h2 className={styles.title}>شجرةٌ رئيسية وأشجارٌ إضافية</h2>
          <p className={styles.hint}>
            لكلّ مساحةٍ شجرةٌ رئيسية واحدة. يمكنك إنشاء أشجارٍ إضافيةٍ
            أخرى لاستخدامها داخل المجموعات.
          </p>
        </div>
        {canEdit && (
          <button type="button" className={styles.createButton} onClick={openCreate}>
            <span className={styles.plus}>+</span>
            شجرة إضافية
          </button>
        )}
      </div>

      {/* Main tree — fixed, locked; managed at /tree. Duplicable into a frozen
          extra-tree snapshot. The card body navigates to /tree; the duplicate
          action sits beside it so the anchor never wraps a button. */}
      <section className={styles.group}>
        <h3 className={styles.groupLabel}>الشجرة الرئيسية</h3>
        <div className={`${styles.treeCard} ${styles.mainCard}`}>
          <Link
            href={`/workspaces/${slug}/tree`}
            className={styles.cardLink}
          >
            <span className={styles.treeIcon}>
              <iconify-icon
                icon="material-symbols:account-tree"
                width="24"
                height="24"
              />
            </span>
            <div className={styles.treeBody}>
              <div className={styles.treeNameRow}>
                <span className={styles.treeName}>{workspaceName}</span>
                <span className={styles.mainBadge}>
                  <iconify-icon
                    icon="material-symbols:lock"
                    width="11"
                    height="11"
                    aria-hidden="true"
                  />
                  ثابتة
                </span>
              </div>
              <div className={styles.treeMeta}>
                <span>شجرة العائلة الرئيسية</span>
              </div>
            </div>
          </Link>
          {canEdit && mainTreeId && (
            <div className={styles.treeActions}>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => void duplicate(mainTreeId)}
                disabled={duplicatingId === mainTreeId}
                title="تكرار"
                aria-label="تكرار"
              >
                {duplicatingId === mainTreeId ? (
                  <Spinner size="sm" />
                ) : (
                  <iconify-icon icon="material-symbols:content-copy-outline" width="18" height="18" />
                )}
              </button>
            </div>
          )}
        </div>
        <p className={styles.mainNote}>
          الشجرة الرئيسية وحدها تحمل أخبار العائلة والألبومات والمناسبات.
        </p>
      </section>

      {/* Extra trees — lightweight, manageable */}
      <section className={styles.group}>
        <h3 className={styles.groupLabel}>أشجار إضافية</h3>

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
        ) : extraTrees.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <iconify-icon icon="material-symbols:forest" width="34" height="34" />
            </span>
            <p className={styles.emptyTitle}>لا توجد أشجار إضافية بعد</p>
            <p className={styles.emptyText}>
              أضف شجرةً إضافيةً لتنظيمها داخل مجموعاتك.
            </p>
            {canEdit && (
              <button
                type="button"
                className={styles.createButton}
                onClick={openCreate}
              >
                <span className={styles.plus}>+</span>
                شجرة إضافية
              </button>
            )}
          </div>
        ) : (
          <div className={styles.treeList}>
            {extraTrees.map((tree) => (
              <div key={tree.id} className={styles.treeCard}>
                {/* The title/body opens the family-tree editor on this extra
                    tree — no separate "edit content" button needed. */}
                <Link
                  href={`/workspaces/${slug}/tree?treeId=${tree.id}`}
                  className={styles.cardLink}
                >
                  <span className={styles.treeIcon}>
                    <iconify-icon
                      icon="material-symbols:nest-eco-leaf"
                      width="22"
                      height="22"
                    />
                  </span>
                  <div className={styles.treeBody}>
                    <div className={styles.treeNameRow}>
                      <span className={styles.treeName}>{tree.nameAr}</span>
                    </div>
                    <div className={styles.treeMeta}>
                      <span>{tree.peopleCount} فرداً</span>
                      <span className={styles.metaDot} aria-hidden="true">
                        ·
                      </span>
                      <VisibilityChip level={tree.visibility} />
                    </div>
                  </div>
                </Link>
                {canEdit && (
                  <div className={styles.treeActions}>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() => void duplicate(tree.id)}
                      disabled={duplicatingId === tree.id}
                      title="تكرار"
                      aria-label="تكرار"
                    >
                      {duplicatingId === tree.id ? (
                        <Spinner size="sm" />
                      ) : (
                        <iconify-icon icon="material-symbols:content-copy-outline" width="18" height="18" />
                      )}
                    </button>
                    {/* Text affordance (not a pen) so it reads clearly as
                        "rename", not "edit the tree". */}
                    <button
                      type="button"
                      className={styles.renameBtn}
                      onClick={() => openRename(tree)}
                    >
                      إعادة التسمية
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                      onClick={() => {
                        setActionError('');
                        setDialog({ kind: 'delete', tree });
                      }}
                      title="حذف"
                      aria-label="حذف"
                    >
                      <iconify-icon icon="material-symbols:delete-outline" width="18" height="18" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Create / Rename dialog */}
      {(dialog.kind === 'create' || dialog.kind === 'rename') && (
        <Modal
          isOpen
          onClose={close}
          title={dialog.kind === 'create' ? 'شجرة إضافية جديدة' : 'تعديل الاسم'}
          actions={
            <>
              <Button variant="ghost" size="md" onClick={close}>
                إلغاء
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={dialog.kind === 'create' ? commitCreate : commitRename}
                disabled={!draftName.trim() || busy}
                loading={busy}
              >
                {dialog.kind === 'create' ? 'إنشاء' : 'حفظ'}
              </Button>
            </>
          }
        >
          <div>
            <label className={modal.fieldLabel}>اسم الشجرة</label>
            <input
              type="text"
              className={modal.input}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="مثال: قبيلة بني تميم"
              autoFocus
            />
            {dialog.kind === 'create' && (
              <p className={modal.hint}>
                ستكون شجرةً إضافية تظهر فقط داخل المجموعات.
              </p>
            )}
            {actionError && <p className={modal.errorText}>{actionError}</p>}
          </div>
        </Modal>
      )}

      {/* Delete dialog */}
      {dialog.kind === 'delete' && (
        <Modal
          isOpen
          onClose={close}
          title="حذف الشجرة"
          actions={
            <>
              <Button variant="ghost" size="md" onClick={close}>
                إلغاء
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={commitDelete}
                disabled={busy}
                loading={busy}
              >
                حذف
              </Button>
            </>
          }
        >
          <p className={modal.confirmText}>
            هل أنت متأكد من حذف <strong>{dialog.tree.nameAr}</strong>؟ ستُزال أيضاً
            من أي مجموعةٍ تضمّها.
          </p>
          {actionError && <p className={modal.errorText}>{actionError}</p>}
        </Modal>
      )}
    </CollectionsPageShell>
  );
}
