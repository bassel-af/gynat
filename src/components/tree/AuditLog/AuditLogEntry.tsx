'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { AuditLogDiff } from './AuditLogDiff';
import styles from './AuditLog.module.css';

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  description: string | null;
  snapshotBefore: Record<string, unknown> | null;
  snapshotAfter: Record<string, unknown> | null;
  payload: unknown;
  timestamp: string;
  user: { displayName: string | null; avatarUrl: string | null };
}

const ACTION_LABELS: Record<string, string> = {
  create: 'إضافة',
  update: 'تعديل',
  delete: 'حذف',
  cascade_delete: 'حذف متسلسل',
  MOVE_SUBTREE: 'نقل فرع',
  import: 'استيراد',
  redeem_pointer: 'ربط فرع',
  break_pointer: 'فصل ربط',
  copy_pointer: 'نسخ فرع',
  deep_copy: 'نسخ فرع',
  revoke_token: 'إلغاء رمز',
};

const ACTION_COLORS: Record<string, string> = {
  create: 'green',
  update: 'blue',
  delete: 'red',
  cascade_delete: 'red',
  MOVE_SUBTREE: 'amber',
  import: 'blue',
  redeem_pointer: 'blue',
  break_pointer: 'amber',
  copy_pointer: 'blue',
  deep_copy: 'blue',
  revoke_token: 'red',
};

const ENTITY_LABELS: Record<string, string> = {
  individual: 'شخص',
  family: 'عائلة',
  family_child: 'ابن/ابنة',
  rada_family: 'عائلة رضاعة',
  rada_family_child: 'ابن/ابنة رضاعة',
  branch_pointer: 'ربط فرع',
  share_token: 'رمز مشاركة',
  tree: 'شجرة',
  ancestry_jump: 'قفزة نسب',
  source_entry: 'مصدر',
};

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'الآن';
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays < 7) return `منذ ${diffDays} يوم`;

  return date.toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface AuditLogEntryProps {
  entry: AuditEntry;
}

export function AuditLogEntry({ entry }: AuditLogEntryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const actionLabel = ACTION_LABELS[entry.action] ?? entry.action;
  const actionColor = ACTION_COLORS[entry.action] ?? 'blue';
  const entityLabel = ENTITY_LABELS[entry.entityType] ?? entry.entityType;
  const hasDiff = entry.snapshotBefore !== null || entry.snapshotAfter !== null;
  const userInitial = (entry.user.displayName ?? '?')[0];

  return (
    <div className={styles.entry}>
      <div className={styles.entryHeader} role={hasDiff ? 'button' : undefined} tabIndex={hasDiff ? 0 : undefined} onClick={() => hasDiff && setIsExpanded(!isExpanded)} onKeyDown={(e) => { if (hasDiff && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setIsExpanded(!isExpanded); } }}>
        {/* User avatar */}
        <div className={styles.entryAvatar} title={entry.user.displayName ?? undefined}>
          {entry.user.avatarUrl ? (
            <img src={entry.user.avatarUrl} alt="" className={styles.entryAvatarImg} />
          ) : (
            <span className={styles.entryAvatarInitial}>{userInitial}</span>
          )}
        </div>

        {/* Content */}
        <div className={styles.entryContent}>
          <div className={styles.entryTopRow}>
            <span className={clsx(styles.actionBadge, styles[`action_${actionColor}`])}>
              {actionLabel}
            </span>
            <span className={styles.entityBadge}>{entityLabel}</span>
          </div>
          <p className={styles.entryDescription}>
            {entry.description ?? `${actionLabel} ${entityLabel}`}
          </p>
          <div className={styles.entryMeta}>
            <span className={styles.entryUser}>{entry.user.displayName ?? 'مستخدم'}</span>
            <span className={styles.entryDot} aria-hidden="true" />
            <time className={styles.entryTime} dateTime={entry.timestamp}>
              {formatRelativeTime(entry.timestamp)}
            </time>
          </div>
        </div>

        {/* Expand chevron */}
        {hasDiff && (
          <svg
            className={clsx(styles.entryChevron, { [styles.isExpanded]: isExpanded })}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {/* Expanded diff section */}
      {isExpanded && hasDiff && (
        <div className={styles.entryDiff}>
          <AuditLogDiff
            before={entry.snapshotBefore}
            after={entry.snapshotAfter}
          />
        </div>
      )}
    </div>
  );
}
