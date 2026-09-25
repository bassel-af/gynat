import clsx from 'clsx';
import type { SourceVisibilityLevel } from '@/lib/tree/source-visibility';
import { LockIcon } from './SourceIcons';
import styles from './SourcesAdmin.module.css';

/** Short level names for the «المصادر» page chips and badges. */
export const SOURCE_LEVEL_SHORT_LABELS: Record<SourceVisibilityLevel, string> = {
  admins: 'المشرفون فقط',
  members: 'أعضاء مساحة العائلة',
  public: 'زوار الشجرة المنشورة',
};

export function SourceLevelBadge({ level }: { level: SourceVisibilityLevel }) {
  return (
    <span className={clsx(styles.levelBadge, styles[`level_${level}`])}>
      {level === 'admins' && <LockIcon size={11} />}
      {SOURCE_LEVEL_SHORT_LABELS[level]}
    </span>
  );
}
