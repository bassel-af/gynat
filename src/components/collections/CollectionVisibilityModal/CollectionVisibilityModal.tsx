'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { WithheldBadge } from '@/components/collections/CollectionBadges/CollectionBadges';
import {
  VISIBILITY_LABEL,
  isWithheldWhenPublic,
  setCollectionVisibility,
  type Collection,
  type CollectionItem,
  type Visibility,
} from '@/lib/collections/api';
import styles from './CollectionVisibilityModal.module.css';

interface CollectionVisibilityModalProps {
  workspaceId: string;
  collection: Collection;
  items: CollectionItem[];
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
    desc: 'يستطيع من يملك الرابط مشاهدتها، ولا تظهر في نتائج البحث.',
    icon: 'material-symbols:link',
  },
  {
    level: 'search',
    label: 'عامة وتظهر في البحث',
    desc: 'قد تظهر المجموعة في نتائج Google. قرارٌ يصعب التراجع عنه تماماً.',
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
  items,
  onClose,
  onPublished,
}: CollectionVisibilityModalProps) {
  // Start from the collection's current level; the user re-picks to change it.
  const [selected, setSelected] = useState<Visibility>(collection.visibility);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const withheld = items.filter(isWithheldWhenPublic);
  const goingPublic = selected !== 'private';
  const changed = selected !== collection.visibility;

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await setCollectionVisibility(workspaceId, collection.id, selected);
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
              {withheld.map((item) => (
                <li
                  key={item.id}
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
