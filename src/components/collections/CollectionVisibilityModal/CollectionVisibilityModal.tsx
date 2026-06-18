'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { WithheldBadge } from '@/components/collections/CollectionBadges/CollectionBadges';
import {
  VISIBILITY_LABEL,
  getCollectionPublishPreview,
  setCollectionVisibility,
  type Collection,
  type Visibility,
  type NotListedBorrowedTree,
} from '@/lib/collections/api';
import styles from './CollectionVisibilityModal.module.css';

interface CollectionVisibilityModalProps {
  workspaceId: string;
  collection: Collection;
  onClose: () => void;
  /** Called after a successful publish/re-level/unpublish so the parent reloads. */
  onPublished: () => void;
}

const LEVELS: {
  level: Visibility;
  label: string;
  desc: string;
  icon: string;
  further?: boolean;
}[] = [
  {
    level: 'private',
    label: 'خاصة — للأعضاء فقط',
    desc: 'لا يراها إلا أعضاء المساحة.',
    icon: 'material-symbols:lock',
  },
  {
    level: 'link',
    label: 'عامة عبر الرابط',
    desc: 'يستطيع من يملك الرابط مشاهدتها، ولا تظهر في نتائج محركات البحث.',
    icon: 'material-symbols:link',
  },
  {
    level: 'search',
    label: 'عامة وتظهر في محركات البحث',
    desc: 'قد تظهر المجموعة في نتائج محركات البحث مثل Google. قرارٌ يصعب التراجع عنه تماماً.',
    icon: 'material-symbols:travel-explore',
    further: true,
  },
];

/**
 * Screens 6 + 7 — the collection visibility ladder (§2.2) + the publish step
 * (§2.10). Picking a public level (link/search) reveals the §3 withhold warning
 * (which member-private trees stay hidden from visitors) before the confirm
 * action publishes at the chosen level via `setCollectionVisibility`.
 */
export function CollectionVisibilityModal({
  workspaceId,
  collection,
  onClose,
  onPublished,
}: CollectionVisibilityModalProps) {
  // Start from the collection's current level; the user re-picks to change it.
  const [selected, setSelected] = useState<Visibility>(collection.visibility);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The §3 withhold list is computed SERVER-side (the publish-preview route via
  // countPublishableTrees) — it applies the cross-workspace allowReuse gate the
  // serve path uses, which the old client-side rule (private-only) under-reported.
  const [withheld, setWithheld] = useState<{ titleAr: string }[]>([]);
  // Slice C — the listing-readiness breakdown (authoritative, from the preview
  // route). Own public_link trees the owner can promote; borrowed not-listed
  // families that BLOCK search-listing (we can't change another workspace).
  const [notListedOwn, setNotListedOwn] = useState<
    { treeId: string; titleAr: string }[]
  >([]);
  const [notListedBorrowed, setNotListedBorrowed] = useState<
    NotListedBorrowedTree[]
  >([]);
  // The owner opts to promote their own trees to listed alongside the publish.
  const [promoteOwn, setPromoteOwn] = useState(false);
  // Set when a listed publish came back DOWNGRADED to by-link-only (borrowed
  // families still not listed). We show the outcome instead of closing clean.
  const [blockedBorrowed, setBlockedBorrowed] = useState<
    NotListedBorrowedTree[] | null
  >(null);

  const goingPublic = selected !== 'private';
  const goingListed = selected === 'search';
  const changed = selected !== collection.visibility;

  // Fetch the authoritative preview once (independent of the chosen level — it
  // describes what WOULD happen if published). The withhold list shows for any
  // public level; the listing-readiness groups show only for the search level.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const preview = await getCollectionPublishPreview(workspaceId, collection.id);
        if (cancelled) return;
        setWithheld(preview.withheldTrees);
        setNotListedOwn(preview.notListedOwnTrees ?? []);
        setNotListedBorrowed(preview.notListedBorrowedTrees ?? []);
      } catch {
        // Best-effort — a failed preview just hides the warning, never blocks publish.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, collection.id]);

  async function confirm() {
    setBusy(true);
    setError('');
    setBlockedBorrowed(null);
    try {
      // Only pass the promote flag at the search level when opted in — keep the
      // 3-arg call for every other case (the established publish contract).
      const result =
        goingListed && promoteOwn
          ? await setCollectionVisibility(workspaceId, collection.id, selected, true)
          : await setCollectionVisibility(workspaceId, collection.id, selected);
      // A listed publish can come back downgraded to by-link-only when a borrowed
      // family is still not listed. Surface that outcome rather than reporting a
      // clean success — the owner must ask the source family or remove the tree.
      if (result.listedBlocked) {
        setBlockedBorrowed(result.blockingBorrowed ?? []);
        return;
      }
      onPublished();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر تغيير مستوى الظهور');
    } finally {
      setBusy(false);
    }
  }

  const confirmLabel =
    selected === 'private'
      ? 'جعلها خاصة'
      : collection.visibility === 'private'
        ? 'نشر المجموعة'
        : 'حفظ مستوى الظهور';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="ظهور المجموعة"
      className={styles.wide}
      actions={
        <>
          <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>
            إغلاق
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={confirm}
            disabled={busy || !changed}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className={styles.ladder} aria-label="مستوى الظهور" role="radiogroup">
        {LEVELS.map((def) => {
          const active = def.level === selected;
          return (
            <button
              type="button"
              key={def.level}
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(def.level)}
              className={`${styles.levelCard} ${active ? styles.levelActive : ''} ${
                def.further ? styles.levelFurther : ''
              }`}
            >
              <span className={styles.radioDot} aria-hidden="true" />
              <span className={styles.levelIcon}>
                <iconify-icon icon={def.icon} width="20" height="20" />
              </span>
              <span className={styles.levelText}>
                <span className={styles.levelLabel}>{def.label}</span>
                <span className={styles.levelDesc}>{def.desc}</span>
              </span>
              {def.level === collection.visibility && (
                <span className={styles.currentTag}>
                  <iconify-icon
                    icon="material-symbols:check-circle"
                    width="16"
                    height="16"
                    aria-hidden="true"
                  />
                  الحالي
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* §3 withhold warning — only when a public level is chosen AND something
          would be hidden. Names only, never IDs. */}
      {goingPublic && withheld.length > 0 && (
        <div className={styles.publishPreview}>
          <div className={styles.withheldBox}>
            <p className={styles.withheldTitle}>
              <iconify-icon
                icon="material-symbols:visibility-off"
                width="18"
                height="18"
                aria-hidden="true"
              />
              هذه الأشجار خاصة ولن تظهر للزوار
            </p>
            <ul className={styles.previewList}>
              {withheld.map((item, i) => (
                <li
                  key={`${item.titleAr}-${i}`}
                  className={`${styles.previewRow} ${styles.previewRowWithheld}`}
                >
                  <span className={styles.previewName}>{item.titleAr}</span>
                  <WithheldBadge />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Slice C — listing readiness, only when the SEARCH level is chosen. */}
      {goingListed && (notListedOwn.length > 0 || notListedBorrowed.length > 0) && (
        <div className={styles.publishPreview}>
          {/* Your own not-yet-listed trees — promotable in one click. Listing
              them makes each tree's own public page search-discoverable too. */}
          {notListedOwn.length > 0 && (
            <div className={styles.ownTreesBox}>
              <p className={styles.ownTreesTitle}>
                <iconify-icon
                  icon="material-symbols:travel-explore"
                  width="18"
                  height="18"
                  aria-hidden="true"
                />
                أشجارك غير مُدرَجة في محركات البحث بعد
              </p>
              <p className={styles.readinessWhy}>
                لإظهار المجموعة في محركات البحث يجب أن تكون كل شجرة داخلها مُدرَجة. إدراج هذه
                الأشجار يجعل صفحة كلٍّ منها قابلة للظهور في نتائج محركات البحث أيضاً.
              </p>
              <ul className={styles.previewList}>
                {notListedOwn.map((t) => (
                  <li key={t.treeId} className={styles.previewRow}>
                    <span className={styles.previewName}>{t.titleAr}</span>
                  </li>
                ))}
              </ul>
              <div className={styles.listAllBtn}>
                <Button
                  variant={promoteOwn ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setPromoteOwn((v) => !v)}
                  disabled={busy}
                >
                  {promoteOwn
                    ? 'سيتم إدراجها جميعاً ✓'
                    : 'إدراجها جميعاً في محركات البحث'}
                </Button>
              </div>
            </div>
          )}

          {/* Borrowed (other families') link-only trees — BLOCKING. We can never
              change another workspace's tree, so the owner must ask or remove. */}
          {notListedBorrowed.length > 0 && (
            <div className={styles.withheldBox}>
              <p className={styles.withheldTitle}>
                <iconify-icon
                  icon="material-symbols:block"
                  width="18"
                  height="18"
                  aria-hidden="true"
                />
                عائلات معارة غير مُدرَجة — تمنع إدراج المجموعة
              </p>
              <p className={styles.readinessWhy}>
                هذه أشجار من عائلات أخرى، ظاهرة عبر الرابط فقط. لا يمكنك تغيير ظهورها —
                اطلب من العائلة المعنية إدراجها في محركات البحث، أو أزِلها من المجموعة. حتى
                ذلك الحين تُنشَر المجموعة عبر الرابط فقط.
              </p>
              <ul className={styles.previewList}>
                {notListedBorrowed.map((t, i) => (
                  <li key={`${t.titleAr}-${i}`} className={styles.previewRow}>
                    <span className={styles.previewName}>{t.titleAr}</span>
                    <span className={styles.borrowedSource}>
                      من: {t.sourceWorkspaceNameAr}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* The by-link-only outcome — a listed publish was downgraded because a
          borrowed family is still not listed. */}
      {blockedBorrowed && (
        <div className={styles.blockedBanner} role="status">
          <iconify-icon
            icon="material-symbols:link"
            width="20"
            height="20"
            aria-hidden="true"
          />
          <span>
            نُشِرت المجموعة عبر الرابط فقط — لم تُدرَج في محركات البحث لأن عائلات معارة ما زالت
            غير مُدرَجة. اطلب من أصحابها إدراجها، أو أزِلها من المجموعة.
          </span>
        </div>
      )}

      {error && (
        <p className={styles.allWithheld} role="alert">
          {error}
        </p>
      )}

      <p className={styles.nestedNote}>
        المستوى الحالي: {VISIBILITY_LABEL[collection.visibility]}
      </p>
    </Modal>
  );
}
