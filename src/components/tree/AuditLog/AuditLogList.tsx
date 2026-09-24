'use client';

import { useEffect, useState, useCallback } from 'react';
import { AuditLogEntry, type AuditEntry } from './AuditLogEntry';
import { Spinner } from '@/components/ui/Spinner';
import { apiFetch } from '@/lib/api/client';
import styles from './AuditLog.module.css';

const PAGE_SIZE = 20;

const ACTION_OPTIONS = [
  { value: '', label: 'الكل' },
  { value: 'create', label: 'إضافة' },
  { value: 'update', label: 'تعديل' },
  { value: 'delete', label: 'حذف' },
  { value: 'cascade_delete', label: 'حذف متسلسل' },
  { value: 'MOVE_SUBTREE', label: 'نقل فرع' },
  { value: 'import', label: 'استيراد' },
];

const ENTITY_TYPE_OPTIONS = [
  { value: '', label: 'الكل' },
  { value: 'individual', label: 'شخص' },
  { value: 'family', label: 'عائلة' },
  { value: 'family_child', label: 'ابن/ابنة' },
  { value: 'rada_family', label: 'عائلة رضاعة' },
  { value: 'branch_pointer', label: 'ربط فرع' },
  { value: 'source_entry', label: 'مصدر' },
];

interface AuditLogListProps {
  workspaceId: string;
  entityId?: string;
  entityType?: string;
  compact?: boolean;
}

export function AuditLogList({ workspaceId, entityId, entityType: fixedEntityType, compact }: AuditLogListProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState(fixedEntityType ?? '');

  const fetchEntries = useCallback(async (pageNum: number, append: boolean) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        limit: String(compact ? 5 : PAGE_SIZE),
      });
      if (actionFilter) params.set('action', actionFilter);
      if (entityTypeFilter) params.set('entityType', entityTypeFilter);
      if (entityId) params.set('entityId', entityId);

      const res = await apiFetch(
        `/api/workspaces/${workspaceId}/tree/audit-log?${params.toString()}`,
      );

      if (!res.ok) {
        const body = await res.json();
        setError(body.error || 'فشل في تحميل السجل');
        return;
      }

      const body = await res.json();
      setEntries(prev => append ? [...prev, ...body.data] : body.data);
      setTotal(body.total);
    } catch {
      setError('فشل في تحميل السجل');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, actionFilter, entityTypeFilter, entityId, compact]);

  // Reset and fetch when filters change
  useEffect(() => {
    setPage(1);
    fetchEntries(1, false);
  }, [fetchEntries]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchEntries(nextPage, true);
  };

  const hasMore = entries.length < total;

  if (error && entries.length === 0) {
    return (
      <div className={styles.errorState}>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className={styles.listContainer}>
      {/* Filters (hidden in compact mode) */}
      {!compact && !fixedEntityType && (
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>نوع العملية</label>
            <select
              className={styles.filterSelect}
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              {ACTION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>نوع العنصر</label>
            <select
              className={styles.filterSelect}
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value)}
            >
              {ENTITY_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {total > 0 && (
            <span className={styles.filterCount}>{total} سجل</span>
          )}
        </div>
      )}

      {/* Entry list */}
      {loading && entries.length === 0 ? (
        <div className={styles.loadingState}>
          <Spinner size="md" label="جاري تحميل السجل..." />
        </div>
      ) : entries.length === 0 ? (
        <div className={styles.emptyState}>
          <svg className={styles.emptyIcon} width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className={styles.emptyText}>لا توجد تعديلات مسجلة</p>
          <p className={styles.emptyHint}>ستظهر هنا جميع التعديلات على شجرة العائلة</p>
        </div>
      ) : (
        <>
          <div className={styles.entryList}>
            {entries.map(entry => (
              <AuditLogEntry key={entry.id} entry={entry} />
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className={styles.loadMore}>
              <button
                className={styles.loadMoreButton}
                onClick={handleLoadMore}
                disabled={loading}
              >
                {loading ? 'جاري التحميل...' : 'تحميل المزيد'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
