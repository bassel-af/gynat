'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { CollectionsPageShell } from '@/components/collections/CollectionsPageShell/CollectionsPageShell';
import {
  VisibilityChip,
  LinkModeBadge,
  WithheldBadge,
} from '@/components/collections/CollectionBadges/CollectionBadges';
import { AddItemFlow } from '@/components/collections/AddItemFlow/AddItemFlow';
import { CollectionVisibilityModal } from '@/components/collections/CollectionVisibilityModal/CollectionVisibilityModal';
import {
  getCollection,
  updateCollection,
  deleteCollection,
  removeItem as removeItemApi,
  updateItem as updateItemApi,
  SOURCE_LABEL,
  isWithheldWhenPublic,
  type Collection,
  type CollectionItem,
} from '@/lib/collections/api';
import modal from '../shared-modal.module.css';
import styles from './CollectionDetail.module.css';

interface CollectionDetailProps {
  slug: string;
  workspaceId: string;
  workspaceName: string;
  canEdit: boolean;
  collectionId: string;
}

/**
 * Screen 4 — collection detail (§2.3, §2.4). Hosts the items list (trees/
 * branches + nested collections), the per-item title/description, the
 * linked-vs-copied indicator, the add-item flow (Screen 5), rename/delete of
 * the collection, and the visibility control (Chunk 3, shown as coming-soon).
 */
export function CollectionDetail({
  slug,
  workspaceId,
  workspaceName,
  canEdit,
  collectionId,
}: CollectionDetailProps) {
  const router = useRouter();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [showVisibility, setShowVisibility] = useState(false);
  const [removing, setRemoving] = useState<CollectionItem | null>(null);
  const [editingItem, setEditingItem] = useState<CollectionItem | null>(null);
  const [showRename, setShowRename] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  // Rename collection draft
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  // Edit item draft
  const [itemTitle, setItemTitle] = useState('');
  const [itemDesc, setItemDesc] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getCollection(workspaceId, collectionId);
      setCollection(data.collection);
      setItems(data.items);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'تعذّر تحميل المجموعة');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, collectionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function removeItem() {
    if (!removing) return;
    const id = removing.id;
    setBusy(true);
    setActionError('');
    try {
      await removeItemApi(workspaceId, collectionId, id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      setRemoving(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'تعذّر إزالة العنصر');
    } finally {
      setBusy(false);
    }
  }

  function openEditItem(item: CollectionItem) {
    setEditingItem(item);
    setItemTitle(item.titleAr);
    setItemDesc(item.descriptionAr ?? '');
    setActionError('');
  }

  async function commitEditItem() {
    if (!editingItem || !itemTitle.trim()) return;
    const id = editingItem.id;
    const title = itemTitle.trim();
    const desc = itemDesc.trim() || null;
    setBusy(true);
    setActionError('');
    try {
      await updateItemApi(workspaceId, collectionId, id, {
        titleAr: title,
        descriptionAr: desc,
      });
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, titleAr: title, descriptionAr: desc } : i,
        ),
      );
      setEditingItem(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'تعذّر حفظ التعديل');
    } finally {
      setBusy(false);
    }
  }

  function openRename() {
    if (!collection) return;
    setDraftTitle(collection.titleAr);
    setDraftDesc(collection.descriptionAr ?? '');
    setActionError('');
    setShowRename(true);
  }

  async function commitRename() {
    if (!draftTitle.trim()) return;
    const title = draftTitle.trim();
    const desc = draftDesc.trim() || null;
    setBusy(true);
    setActionError('');
    try {
      await updateCollection(workspaceId, collectionId, {
        titleAr: title,
        descriptionAr: desc,
      });
      setCollection((prev) =>
        prev ? { ...prev, titleAr: title, descriptionAr: desc } : prev,
      );
      setShowRename(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'تعذّر حفظ التعديل');
    } finally {
      setBusy(false);
    }
  }

  async function commitDeleteCollection() {
    setBusy(true);
    setActionError('');
    try {
      await deleteCollection(workspaceId, collectionId);
      router.push(`/workspaces/${slug}/collections`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'تعذّر حذف المجموعة');
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <CollectionsPageShell
        workspaceName={workspaceName}
        crumbs={[
          { label: 'المساحة', href: `/workspaces/${slug}` },
          { label: 'المجموعات', href: `/workspaces/${slug}/collections` },
          { label: '...' },
        ]}
      >
        <div style={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}>
          <Spinner size="lg" label="جاري التحميل..." />
        </div>
      </CollectionsPageShell>
    );
  }

  if (loadError || !collection) {
    return (
      <CollectionsPageShell
        workspaceName={workspaceName}
        crumbs={[
          { label: 'المساحة', href: `/workspaces/${slug}` },
          { label: 'المجموعات', href: `/workspaces/${slug}/collections` },
          { label: 'غير موجودة' },
        ]}
      >
        <div className={styles.notFound}>
          <p>{loadError || 'لم يتم العثور على هذه المجموعة.'}</p>
          <Link
            href={`/workspaces/${slug}/collections`}
            className={styles.notFoundLink}
          >
            العودة إلى المجموعات
          </Link>
        </div>
      </CollectionsPageShell>
    );
  }

  const isPublic = collection.visibility !== 'private';
  const withheldCount = items.filter(isWithheldWhenPublic).length;

  return (
    <CollectionsPageShell
      workspaceName={workspaceName}
      crumbs={[
        { label: 'المساحة', href: `/workspaces/${slug}` },
        { label: 'المجموعات', href: `/workspaces/${slug}/collections` },
        { label: collection.titleAr },
      ]}
    >
      {/* Header card */}
      <div className={styles.headCard}>
        <div className={styles.headTop}>
          <div className={styles.headText}>
            <div className={styles.headTitleRow}>
              <h2 className={styles.headTitle}>{collection.titleAr}</h2>
              <VisibilityChip level={collection.visibility} />
            </div>
            {collection.descriptionAr ? (
              <p className={styles.headDesc}>{collection.descriptionAr}</p>
            ) : (
              <p className={styles.headDescEmpty}>بلا وصف</p>
            )}
          </div>
          {canEdit && (
            <div className={styles.headActions}>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={openRename}
                title="تعديل الاسم"
                aria-label="تعديل الاسم"
              >
                <iconify-icon icon="material-symbols:edit-outline" width="18" height="18" />
              </button>
              <button
                type="button"
                className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                onClick={() => {
                  setActionError('');
                  setShowDelete(true);
                }}
                title="حذف المجموعة"
                aria-label="حذف المجموعة"
              >
                <iconify-icon icon="material-symbols:delete-outline" width="18" height="18" />
              </button>
              <button
                type="button"
                className={styles.visibilityBtn}
                onClick={() => setShowVisibility(true)}
              >
                <iconify-icon
                  icon={isPublic ? 'material-symbols:public' : 'material-symbols:lock'}
                  width="16"
                  height="16"
                  aria-hidden="true"
                />
                {isPublic ? 'إدارة العرض' : 'نشر المجموعة'}
              </button>
            </div>
          )}
        </div>

        {/* Public link surfaced when public */}
        {isPublic && collection.publicCode && (
          <div className={styles.linkRow}>
            <span className={styles.linkLabel}>الرابط العام</span>
            <code className={styles.linkValue} dir="ltr">
              gynat.com/c/{collection.publicCode}
            </code>
          </div>
        )}

        {/* Withheld banner when public (§3 surfaced on the detail too) */}
        {isPublic && withheldCount > 0 && (
          <div className={styles.withheldBanner} role="note">
            <iconify-icon
              icon="material-symbols:visibility-off"
              width="16"
              height="16"
              aria-hidden="true"
            />
            {withheldCount}{' '}
            {withheldCount === 1 ? 'عنصرٌ خاصّ محجوب' : 'عناصر خاصّة محجوبة'} عن
            العرض العام.
          </div>
        )}
      </div>

      {/* Items toolbar */}
      <div className={styles.itemsHead}>
        <h3 className={styles.itemsTitle}>
          العناصر
          <span className={styles.itemsCount}>{items.length}</span>
        </h3>
        {canEdit && (
          <button
            type="button"
            className={styles.addButton}
            onClick={() => setShowAdd(true)}
          >
            <span className={styles.plus}>+</span>
            إضافة عنصر
          </button>
        )}
      </div>

      {/* Items list */}
      {items.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <iconify-icon
              icon="material-symbols:playlist-add"
              width="34"
              height="34"
            />
          </span>
          <p className={styles.emptyTitle}>المجموعة فارغة</p>
          <p className={styles.emptyText}>
            أضف شجرةً أو فرعاً أو مجموعةً أخرى لتبدأ.
          </p>
          {canEdit && (
            <button
              type="button"
              className={styles.addButton}
              onClick={() => setShowAdd(true)}
            >
              <span className={styles.plus}>+</span>
              إضافة عنصر
            </button>
          )}
        </div>
      ) : (
        <ul className={styles.itemsList}>
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              slug={slug}
              canEdit={canEdit}
              showWithheld={isPublic && isWithheldWhenPublic(item)}
              onEdit={() => openEditItem(item)}
              onRemove={() => {
                setActionError('');
                setRemoving(item);
              }}
            />
          ))}
        </ul>
      )}

      {/* Add-item flow (Screen 5) */}
      {showAdd && (
        <AddItemFlow
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          collectionId={collectionId}
          currentCollectionId={collection.id}
          existingItems={items}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false);
            void refresh();
          }}
        />
      )}

      {/* Visibility + publish (Chunk 3 — shown as coming-soon) */}
      {showVisibility && (
        <CollectionVisibilityModal
          collection={collection}
          items={items}
          onClose={() => setShowVisibility(false)}
        />
      )}

      {/* Remove item confirm */}
      {removing && (
        <Modal
          isOpen
          onClose={() => !busy && setRemoving(null)}
          title="إزالة العنصر"
          actions={
            <>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setRemoving(null)}
              >
                إلغاء
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={removeItem}
                disabled={busy}
                loading={busy}
              >
                إزالة
              </Button>
            </>
          }
        >
          <p className={modal.confirmText}>
            إزالة <strong>{removing.titleAr}</strong> من هذه المجموعة؟
            {removing.linkMode === 'copied'
              ? ' هذه نسخةٌ مثبّتة — ستُحذف نهائياً.'
              : removing.kind === 'tree'
                ? ' هذا ربطٌ مباشر — يبقى المصدر كما هو.'
                : ''}
          </p>
          {actionError && <p className={modal.errorText}>{actionError}</p>}
        </Modal>
      )}

      {/* Edit item title/description */}
      {editingItem && (
        <Modal
          isOpen
          onClose={() => !busy && setEditingItem(null)}
          title="تعديل العنصر"
          actions={
            <>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setEditingItem(null)}
              >
                إلغاء
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={commitEditItem}
                disabled={!itemTitle.trim() || busy}
                loading={busy}
              >
                حفظ
              </Button>
            </>
          }
        >
          <div>
            <label className={modal.fieldLabel}>عنوان العنصر</label>
            <input
              type="text"
              className={modal.input}
              value={itemTitle}
              onChange={(e) => setItemTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className={modal.fieldLabel}>الوصف (اختياري)</label>
            <textarea
              className={modal.textarea}
              value={itemDesc}
              onChange={(e) => setItemDesc(e.target.value)}
              rows={3}
            />
          </div>
          {actionError && <p className={modal.errorText}>{actionError}</p>}
        </Modal>
      )}

      {/* Rename collection */}
      {showRename && (
        <Modal
          isOpen
          onClose={() => !busy && setShowRename(false)}
          title="تعديل الاسم"
          actions={
            <>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setShowRename(false)}
              >
                إلغاء
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={commitRename}
                disabled={!draftTitle.trim() || busy}
                loading={busy}
              >
                حفظ
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
              autoFocus
            />
          </div>
          <div>
            <label className={modal.fieldLabel}>الوصف (اختياري)</label>
            <textarea
              className={modal.textarea}
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              rows={3}
            />
          </div>
          {actionError && <p className={modal.errorText}>{actionError}</p>}
        </Modal>
      )}

      {/* Delete collection */}
      {showDelete && (
        <Modal
          isOpen
          onClose={() => !busy && setShowDelete(false)}
          title="حذف المجموعة"
          actions={
            <>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setShowDelete(false)}
              >
                إلغاء
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={commitDeleteCollection}
                disabled={busy}
                loading={busy}
              >
                حذف
              </Button>
            </>
          }
        >
          <p className={modal.confirmText}>
            هل أنت متأكد من حذف <strong>{collection.titleAr}</strong>؟ ستُحذف
            المجموعة وكل عناصرها. لا يُحذف أيُّ شجرةٍ أو مصدرٍ أصلي.
          </p>
          {actionError && <p className={modal.errorText}>{actionError}</p>}
        </Modal>
      )}
    </CollectionsPageShell>
  );
}

// ---------------------------------------------------------------------------
// Item row — a tree/branch OR a nested collection
// ---------------------------------------------------------------------------

function ItemRow({
  item,
  slug,
  canEdit,
  showWithheld,
  onEdit,
  onRemove,
}: {
  item: CollectionItem;
  slug: string;
  canEdit: boolean;
  showWithheld: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const isNested = item.kind === 'collection';
  const inner = (
    <>
      <span className={`${styles.itemIcon} ${isNested ? styles.itemIconNested : ''}`}>
        <iconify-icon
          icon={
            isNested
              ? 'material-symbols:collections-bookmark'
              : 'material-symbols:account-tree'
          }
          width="20"
          height="20"
        />
      </span>
      <span className={styles.itemBody}>
        <span className={styles.itemTitleRow}>
          <span className={styles.itemTitle}>{item.titleAr}</span>
          {isNested ? (
            <span className={styles.nestedTag}>مجموعة متداخلة</span>
          ) : (
            <>
              {item.linkMode && <LinkModeBadge mode={item.linkMode} />}
              {showWithheld && <WithheldBadge />}
            </>
          )}
        </span>
        {item.descriptionAr && (
          <span className={styles.itemDesc}>{item.descriptionAr}</span>
        )}
        {!isNested && (
          <span className={styles.itemMeta}>
            {item.sourceLabel && <span>{SOURCE_LABEL[item.sourceLabel]}</span>}
            {item.sourceNameAr && (
              <>
                <span className={styles.metaDot} aria-hidden="true">
                  ·
                </span>
                <span>{item.sourceNameAr}</span>
              </>
            )}
            {item.peopleCount != null && item.peopleCount > 0 && (
              <>
                <span className={styles.metaDot} aria-hidden="true">
                  ·
                </span>
                <span>{item.peopleCount} فرداً</span>
              </>
            )}
            {item.treeVisibility && (
              <>
                <span className={styles.metaDot} aria-hidden="true">
                  ·
                </span>
                <VisibilityChip level={item.treeVisibility} />
              </>
            )}
          </span>
        )}
      </span>
    </>
  );

  // A nested collection links to its detail page; a tree item opens that tree.
  // Anything else (e.g. an unresolved source) renders as a non-link row.
  const href =
    isNested && item.childCollectionId
      ? `/workspaces/${slug}/collections/${item.childCollectionId}`
      : item.kind === 'tree' && item.treeId
        ? `/workspaces/${slug}/tree?treeId=${item.treeId}`
        : null;

  return (
    <li className={styles.itemRow}>
      {href ? (
        <Link href={href} className={styles.itemMain}>
          {inner}
          <span className={styles.openChild} aria-hidden="true">
            ←
          </span>
        </Link>
      ) : (
        <div className={styles.itemMain}>{inner}</div>
      )}
      {canEdit && (
        <div className={styles.itemActions}>
          <button
            type="button"
            className={styles.itemEdit}
            onClick={onEdit}
            title="تعديل"
            aria-label="تعديل العنصر"
          >
            <iconify-icon icon="material-symbols:edit-outline" width="17" height="17" />
          </button>
          <button
            type="button"
            className={styles.itemRemove}
            onClick={onRemove}
            title="إزالة من المجموعة"
            aria-label="إزالة من المجموعة"
          >
            <iconify-icon icon="material-symbols:close" width="18" height="18" />
          </button>
        </div>
      )}
    </li>
  );
}
