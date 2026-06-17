'use client';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  VISIBILITY_LABEL,
  type Collection,
  type CollectionItem,
} from '@/lib/collections/api';
import styles from './CollectionVisibilityModal.module.css';

interface CollectionVisibilityModalProps {
  collection: Collection;
  items: CollectionItem[];
  onClose: () => void;
}

const LEVELS: {
  level: 'private' | 'link' | 'search';
  label: string;
  desc: string;
  icon: string;
  further?: boolean;
}[] = [
  {
    level: 'private',
    label: 'خاصة — للأعضاء فقط',
    desc: 'لا يراها إلا أعضاء المساحة. هذا هو الوضع الحالي.',
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
 * Screens 6 + 7 — the collection visibility ladder (§2.2) AND the publish step
 * (§2.10). Publishing collections is Chunk 3; in Chunk 1 collections stay
 * private, so this modal previews the ladder in a calm coming-soon state rather
 * than offering a dead/broken publish path.
 */
export function CollectionVisibilityModal({
  collection,
  onClose,
}: CollectionVisibilityModalProps) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="ظهور المجموعة"
      className={styles.wide}
      actions={
        <Button variant="ghost" size="md" onClick={onClose}>
          إغلاق
        </Button>
      }
    >
      <div className={styles.comingSoonBanner} role="note">
        <iconify-icon
          icon="material-symbols:schedule-outline"
          width="18"
          height="18"
          aria-hidden="true"
        />
        <span>
          نشر المجموعات قريباً. حتى ذلك الحين تبقى كل المجموعات خاصةً للأعضاء.
        </span>
      </div>

      <div className={styles.ladder} aria-label="مستوى الظهور">
        {LEVELS.map((def) => {
          const active = def.level === collection.visibility;
          return (
            <div
              key={def.level}
              className={`${styles.levelCard} ${active ? styles.levelActive : ''} ${
                def.further ? styles.levelFurther : ''
              } ${def.level !== 'private' ? styles.levelDisabled : ''}`}
              aria-disabled={def.level !== 'private'}
            >
              <span className={styles.levelIcon}>
                <iconify-icon icon={def.icon} width="20" height="20" />
              </span>
              <span className={styles.levelText}>
                <span className={styles.levelLabel}>
                  {def.label}
                  {def.level !== 'private' && (
                    <span className={styles.levelSoon}>قريباً</span>
                  )}
                </span>
                <span className={styles.levelDesc}>{def.desc}</span>
              </span>
              {active && (
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
            </div>
          );
        })}
      </div>

      <p className={styles.nestedNote}>
        {VISIBILITY_LABEL[collection.visibility]}
      </p>
    </Modal>
  );
}
