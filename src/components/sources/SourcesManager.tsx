'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { listTreeSources, bulkSources, type SourceListItem } from '@/lib/tree/source-entries-api';
import type { SourceVisibilityLevel } from '@/lib/tree/source-visibility';
import { MAX_BULK_IDS } from '@/lib/tree/source-entry-schemas';
import { getViewMode } from '@/lib/tree/view-modes';
import { notifySourcesChanged } from '@/hooks/usePersonSources';
import { useTreePublishLevel } from '@/hooks/useTreePublishLevel';
import { useToast } from '@/context/ToastContext';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SourceVisibilityPicker } from './SourceVisibilityPicker';
import { SourceFileThumbs } from './SourceFileThumbs';
import { SourceLevelBadge, SOURCE_LEVEL_SHORT_LABELS } from './SourceLevelBadge';
import { toArabicDigits } from './arabicDigits';
import styles from './SourcesAdmin.module.css';

const SEARCH_DELAY_MS = 300;
const PAGE_SIZE = 20;
const LEVELS: SourceVisibilityLevel[] = ['admins', 'members', 'public'];

export interface SourcesManagerProps {
  workspaceId: string;
  slug: string;
  /** Target tree; absent ⇒ the workspace main tree. */
  treeId?: string;
}

interface ListState {
  entries: SourceListItem[];
  nextCursor: number | null;
  matchedIds: string[];
  matchedIdsTruncated: boolean;
  scanTruncated: boolean;
}

const EMPTY: ListState = {
  entries: [],
  nextCursor: null,
  matchedIds: [],
  matchedIdsTruncated: false,
  scanTruncated: false,
};

/**
 * «المصادر» page list (admins): every entry of the tree, searchable and
 * filterable by level, with bulk «تغيير من يرى» and «حذف» over the selection.
 * «تحديد الكل» selects every id the current search/filter matched (the
 * server's `matchedIds`, capped at 500), not only the loaded rows.
 * Bulk actions are not undoable.
 */
export function SourcesManager({ workspaceId, slug, treeId }: SourcesManagerProps) {
  const { showToast } = useToast();
  const treeVisibility = useTreePublishLevel(workspaceId, treeId, true);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [level, setLevel] = useState<SourceVisibilityLevel | null>(null);
  const [list, setList] = useState<ListState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<'visibility' | 'delete' | null>(null);
  const [targetLevel, setTargetLevel] = useState<SourceVisibilityLevel>('admins');
  const [applying, setApplying] = useState(false);
  const ticketRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const fetchPage = useCallback(
    (cursor: number) =>
      listTreeSources(workspaceId, {
        treeId,
        q: debouncedQuery || undefined,
        visibility: level ?? undefined,
        cursor,
        limit: PAGE_SIZE,
      }),
    [workspaceId, treeId, debouncedQuery, level],
  );

  const reload = useCallback(async () => {
    const ticket = ++ticketRef.current;
    setLoading(true);
    try {
      const data = await fetchPage(0);
      if (ticket !== ticketRef.current) return;
      setList({
        entries: data.entries,
        nextCursor: data.nextCursor,
        matchedIds: data.matchedIds,
        matchedIdsTruncated: data.matchedIdsTruncated,
        scanTruncated: data.scanTruncated,
      });
      setError(false);
    } catch {
      if (ticket !== ticketRef.current) return;
      setList(EMPTY);
      setError(true);
    } finally {
      if (ticket === ticketRef.current) setLoading(false);
    }
  }, [fetchPage]);

  // A new search or filter starts over, selection included.
  useEffect(() => {
    setSelected(new Set());
    void reload();
  }, [reload]);

  const loadMore = async () => {
    if (list.nextCursor === null) return;
    const ticket = ticketRef.current;
    setLoadingMore(true);
    try {
      const data = await fetchPage(list.nextCursor);
      if (ticket !== ticketRef.current) return;
      setList((prev) => ({ ...prev, entries: [...prev.entries, ...data.entries], nextCursor: data.nextCursor }));
    } catch {
      showToast('تعذّر تحميل المزيد', 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const allSelected = list.matchedIds.length > 0 && list.matchedIds.every((id) => selected.has(id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(list.matchedIds));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Files warning: a selected entry with files, or one not loaded yet (unknown ⇒ warn).
  const selectionMayHaveFiles = useMemo(() => {
    const loaded = new Map(list.entries.map((e) => [e.id, e.fileCount]));
    for (const id of selected) {
      const count = loaded.get(id);
      if (count === undefined || count > 0) return true;
    }
    return false;
  }, [list.entries, selected]);

  const openVisibility = () => {
    setTargetLevel('admins');
    setDialog('visibility');
  };

  const apply = async () => {
    const ids = [...selected];
    setApplying(true);
    try {
      if (dialog === 'delete') {
        const res = await bulkSources(workspaceId, { ids, action: 'delete' }, treeId);
        showToast(`تم حذف ${toArabicDigits(res.deleted ?? ids.length)} مصدرًا`, 'success');
      } else {
        const res = await bulkSources(workspaceId, { ids, action: 'setVisibility', visibility: targetLevel }, treeId);
        showToast(`تم تحديث ${toArabicDigits(res.updated ?? ids.length)} مصدرًا`, 'success');
      }
      setDialog(null);
      setSelected(new Set());
      notifySourcesChanged();
      await reload();
    } catch {
      showToast('تعذّر تنفيذ العملية', 'error');
    } finally {
      setApplying(false);
    }
  };

  const filtered = debouncedQuery !== '' || level !== null;
  const count = toArabicDigits(selected.size);

  return (
    <section className={styles.manager} aria-label="قائمة المصادر">
      <div className={styles.controls}>
        <input
          type="search"
          className={styles.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث في نص المصدر، مثل: ابن سعد"
          aria-label="بحث في المصادر"
          maxLength={200}
        />
        <div className={styles.chips} role="group" aria-label="من يرى">
          <button
            type="button"
            className={clsx(styles.chip, { [styles.chipActive]: level === null })}
            aria-pressed={level === null}
            onClick={() => setLevel(null)}
          >
            الكل
          </button>
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              className={clsx(styles.chip, { [styles.chipActive]: level === l })}
              aria-pressed={level === l}
              onClick={() => setLevel(l)}
            >
              {SOURCE_LEVEL_SHORT_LABELS[l]}
            </button>
          ))}
        </div>
      </div>

      {list.matchedIds.length > 0 && (
        <div className={styles.selectAllRow}>
          <label className={styles.selectAll}>
            <input type="checkbox" className={styles.checkbox} checked={allSelected} onChange={toggleAll} />
            <span>تحديد الكل</span>
          </label>
          {list.scanTruncated && <span className={styles.note}>البحث يشمل أحدث ٥٠٠٠ مصدر فقط</span>}
        </div>
      )}

      {loading ? (
        <p className={styles.status}>جاري التحميل...</p>
      ) : error ? (
        <p className={styles.errorText} role="alert">
          تعذّر تحميل المصادر
        </p>
      ) : list.entries.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>{filtered ? 'لا نتائج مطابقة' : 'لا توجد مصادر في هذه الشجرة'}</p>
        </div>
      ) : (
        <ul className={styles.rows}>
          {list.entries.map((e) => {
            const name = e.individualId ? (e.personName ?? '—') : 'مصدر الشجرة';
            return (
              <li key={e.id} className={clsx(styles.row, { [styles.rowSelected]: selected.has(e.id) })}>
                <label className={styles.rowCheck}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={selected.has(e.id)}
                    onChange={() => toggleOne(e.id)}
                    aria-label={`تحديد ${name}`}
                  />
                </label>
                <div className={styles.rowMain}>
                  <div className={styles.rowHead}>
                    {e.individualId ? (
                      <Link
                        className={styles.personLink}
                        href={getViewMode('tree').href({ slug, individualId: e.individualId, treeId })}
                      >
                        {name}
                      </Link>
                    ) : (
                      <span className={styles.treeRowName}>{name}</span>
                    )}
                    <SourceLevelBadge level={e.visibility} />
                  </div>
                  {e.text && (
                    <p className={styles.rowText} dir="auto">
                      {e.text}
                    </p>
                  )}
                  <SourceFileThumbs workspaceId={workspaceId} treeId={treeId} entryId={e.id} files={e.files} size={36} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && list.nextCursor !== null && (
        <div className={styles.loadMore}>
          <Button variant="secondary" size="md" loading={loadingMore} onClick={() => void loadMore()}>
            عرض المزيد
          </Button>
        </div>
      )}

      {selected.size > 0 && (
        <div className={styles.bulkBar} role="region" aria-label="إجراءات المصادر المحددة">
          <div className={styles.bulkInfo}>
            <span className={styles.bulkCount}>تم تحديد {count}</span>
            {allSelected && list.matchedIdsTruncated && (
              <span className={styles.note}>
                تم تحديد أول {toArabicDigits(MAX_BULK_IDS)} مصدر فقط؛ نفّذ الإجراء ثم حدّد الباقي
              </span>
            )}
          </div>
          <div className={styles.bulkActions}>
            <Button variant="primary" size="md" onClick={openVisibility}>
              تغيير من يرى
            </Button>
            <Button variant="danger" size="md" onClick={() => setDialog('delete')}>
              حذف
            </Button>
            <Button variant="ghost" size="md" onClick={() => setSelected(new Set())}>
              إلغاء التحديد
            </Button>
          </div>
        </div>
      )}

      <Modal
        isOpen={dialog === 'visibility'}
        onClose={() => (applying ? undefined : setDialog(null))}
        title={`تغيير من يرى ${count} مصدرًا`}
        className={styles.dialog}
        actions={
          <>
            <Button variant="ghost" size="md" onClick={() => setDialog(null)} disabled={applying}>
              إلغاء
            </Button>
            <Button variant="primary" size="md" loading={applying} onClick={() => void apply()}>
              تطبيق
            </Button>
          </>
        }
      >
        <SourceVisibilityPicker
          value={targetLevel}
          onChange={setTargetLevel}
          isAdmin
          treeVisibility={treeVisibility}
          hasFiles={selectionMayHaveFiles}
          disabled={applying}
        />
      </Modal>

      <Modal
        isOpen={dialog === 'delete'}
        onClose={() => (applying ? undefined : setDialog(null))}
        title="حذف المصادر المحددة"
        className={styles.dialog}
        actions={
          <>
            <Button variant="ghost" size="md" onClick={() => setDialog(null)} disabled={applying}>
              إلغاء
            </Button>
            <Button variant="danger" size="md" loading={applying} onClick={() => void apply()}>
              حذف
            </Button>
          </>
        }
      >
        <p className={styles.confirmText}>سيُحذف {count} مصدرًا مع ملفاتها، ولا يمكن التراجع</p>
      </Modal>
    </section>
  );
}
