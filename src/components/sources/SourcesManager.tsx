'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  listTreeSources,
  bulkSources,
  patchSource,
  fetchSourcePreview,
  type SourceListItem,
  type SourceListPage,
} from '@/lib/tree/source-entries-api';
import type { SourceVisibilityLevel } from '@/lib/tree/source-visibility';
import { MAX_BULK_IDS } from '@/lib/tree/source-entry-schemas';
import type { BirthDatePrivacySettings } from '@/lib/tree/birth-date-privacy';
import type { GedcomData } from '@/lib/gedcom/types';
import { getViewMode } from '@/lib/tree/view-modes';
import { apiFetch } from '@/lib/api/client';
import { notifySourcesChanged } from '@/hooks/usePersonSources';
import { useTreePublishLevel } from '@/hooks/useTreePublishLevel';
import { useSourceUnlink } from '@/hooks/useSourceUnlink';
import { useToast } from '@/context/ToastContext';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SourceVisibilityPicker } from './SourceVisibilityPicker';
import { SourceFileThumbs } from './SourceFileThumbs';
import { SourcePeoplePicker } from './SourcePeoplePicker';
import { SourceLevelBadge, SOURCE_LEVEL_SHORT_LABELS } from './SourceLevelBadge';
import { CloseIcon } from './SourceIcons';
import { namesSummary, sourceCountLabel, toArabicDigits } from './arabicDigits';
import styles from './SourcesAdmin.module.css';

const SEARCH_DELAY_MS = 300;
const PAGE_SIZE = 20;
const LEVELS: SourceVisibilityLevel[] = ['admins', 'members', 'public'];
const PENDING_LEVELS: SourceVisibilityLevel[] = ['admins', 'members'];

type Tab = 'shared' | 'unlinked' | null;
type Person = { id: string; name: string };

export interface SourcesManagerProps {
  workspaceId: string;
  slug: string;
  /** Target tree; absent ⇒ the workspace main tree. */
  treeId?: string;
  /** The workspace's birth-date hiding, for the people picker's rows. */
  birthPrivacy?: BirthDatePrivacySettings;
  /**
   * Selection-only mode (the publish flow's «أختار بنفسي»): lists only the
   * sources visitors can't see yet, keeps ticks across searches, and has no
   * tabs, bulk bar, dialogs or people actions — the caller owns the selection.
   */
  selection?: {
    selected: ReadonlySet<string>;
    onChange: (next: Set<string>) => void;
  };
}

type ListState = Omit<SourceListPage, 'total'>;

const EMPTY: ListState = {
  entries: [],
  nextCursor: null,
  matchedIds: [],
  matchedIdsTruncated: false,
  scanTruncated: false,
  counts: { all: 0, shared: 0, unlinked: 0 },
};

/** «ملفاته» / «ملفاتهما» / «ملفاتها» after «سيُحذف N مصدر مع …». */
function theirFiles(n: number): string {
  return n === 1 ? 'ملفاته' : n === 2 ? 'ملفاتهما' : 'ملفاتها';
}

/**
 * «المصادر» page list (admins): ONE row per source — its text, who it is
 * «مصدر لـ», files and level. Tabs «الكل» / «مشترك» / «ليس مصدرًا لأحد»,
 * a level filter and a text search. The «مصدر لـ» cell expands to every
 * name (× removes one; the last one asks «هذا آخر شخص لهذا المصدر») plus
 * «＋ إضافة أشخاص» (the people picker, search only). Bulk «تغيير من يرى» and
 * «حذف» work per source; «تحديد الكل» selects every id the current
 * search/filter matched (the server's `matchedIds`, capped at 500).
 * Nothing on this page is undoable.
 */
export function SourcesManager({ workspaceId, slug, treeId, birthPrivacy, selection }: SourcesManagerProps) {
  const { showToast } = useToast();
  const selectOnly = !!selection;
  const treeVisibility = useTreePublishLevel(workspaceId, treeId, !selectOnly);
  const { unlink, dialog: lastLinkDialog } = useSourceUnlink({ workspaceId, treeId });

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [level, setLevel] = useState<SourceVisibilityLevel | null>(null);
  const [tab, setTab] = useState<Tab>(null);
  const [list, setList] = useState<ListState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [ownSelected, setOwnSelected] = useState<Set<string>>(new Set());
  const selected: ReadonlySet<string> = selection ? selection.selected : ownSelected;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const setSelected = useCallback((next: Set<string> | ((prev: ReadonlySet<string>) => Set<string>)) => {
    const current = selectionRef.current;
    if (current) current.onChange(typeof next === 'function' ? next(current.selected) : next);
    else setOwnSelected((prev) => (typeof next === 'function' ? next(prev) : next));
  }, []);
  const [dialog, setDialog] = useState<'visibility' | 'delete' | null>(null);
  /** An orphan row's own «حذف»; null ⇒ the dialog acts on the selection. */
  const [singleId, setSingleId] = useState<string | null>(null);
  const [targetLevel, setTargetLevel] = useState<SourceVisibilityLevel>('admins');
  const [applying, setApplying] = useState(false);
  const ticketRef = useRef(0);

  // «مصدر لـ» cells: which rows are open, and the full names of rows whose
  // list row carried only the first 20.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [fullPeople, setFullPeople] = useState<ReadonlyMap<string, Person[]>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ sourceId: string; linkedIds: string[] } | null>(null);
  const [treeData, setTreeData] = useState<GedcomData | null>(null);

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
        scope: selectOnly ? 'pending' : undefined,
        filter: tab ?? undefined,
        cursor,
        limit: PAGE_SIZE,
      }),
    [workspaceId, treeId, debouncedQuery, level, tab, selectOnly],
  );

  /** `quiet`: refresh in place (after a people change) without the loading state. */
  const reload = useCallback(
    async (quiet = false) => {
      const ticket = ++ticketRef.current;
      if (!quiet) setLoading(true);
      try {
        const { total: _total, ...data } = await fetchPage(0);
        if (ticket !== ticketRef.current) return;
        setList(data);
        setError(false);
      } catch {
        if (ticket !== ticketRef.current) return;
        setList(EMPTY);
        setError(true);
      } finally {
        if (ticket === ticketRef.current) setLoading(false);
      }
    },
    [fetchPage],
  );

  // A new search or filter starts over, selection included — except in
  // selection-only mode, where ticks survive a search (the caller owns them).
  useEffect(() => {
    if (!selectOnly) setSelected(new Set());
    void reload();
  }, [reload, selectOnly, setSelected]);

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
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of list.matchedIds) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Files warning: a selected source with files, or one not loaded yet (unknown ⇒ warn).
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
    setSingleId(null);
    setDialog('visibility');
  };

  const closeDialog = () => {
    setDialog(null);
    setSingleId(null);
  };

  const dialogIds = singleId ? [singleId] : [...selected];

  const apply = async () => {
    const ids = dialogIds;
    setApplying(true);
    try {
      if (dialog === 'delete') {
        const res = await bulkSources(workspaceId, { ids, action: 'delete' }, treeId);
        showToast(`تم حذف ${sourceCountLabel(res.deleted ?? ids.length)}`, 'success');
      } else {
        const res = await bulkSources(workspaceId, { ids, action: 'setVisibility', visibility: targetLevel }, treeId);
        showToast(`تم تحديث ${sourceCountLabel(res.updated ?? ids.length)}`, 'success');
      }
      closeDialog();
      setSelected(new Set());
      notifySourcesChanged();
      await reload();
    } catch {
      showToast('تعذّر تنفيذ العملية', 'error');
    } finally {
      setApplying(false);
    }
  };

  // ---- «مصدر لـ» ----

  const peopleOf = (e: SourceListItem): Person[] => fullPeople.get(e.id) ?? e.people;

  const loadFullPeople = async (id: string) => {
    try {
      const source = await fetchSourcePreview(workspaceId, id, treeId);
      setFullPeople((prev) => new Map(prev).set(id, source.people));
    } catch {
      showToast('تعذّر تحميل الأسماء', 'error');
    }
  };

  const toggleExpanded = (e: SourceListItem) => {
    const open = expanded.has(e.id);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open) next.delete(e.id);
      else next.add(e.id);
      return next;
    });
    if (!open && e.peopleCount > e.people.length && !fullPeople.has(e.id)) void loadFullPeople(e.id);
  };

  /** After a people change: refresh the list (tabs, counts) and any full names shown. */
  const afterPeopleChange = async (id: string) => {
    notifySourcesChanged();
    if (fullPeople.has(id)) void loadFullPeople(id);
    await reload(true);
  };

  const removePerson = async (sourceId: string, personId: string) => {
    setBusyId(sourceId);
    try {
      const result = await unlink(sourceId, [personId]);
      if (result.outcome !== 'cancelled') await afterPeopleChange(sourceId);
    } catch {
      showToast('تعذّر تنفيذ العملية', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const openPicker = async (e: SourceListItem) => {
    const linkedIds = peopleOf(e).map((p) => p.id);
    if (treeData) {
      setPicker({ sourceId: e.id, linkedIds });
      return;
    }
    setBusyId(e.id);
    try {
      const qs = treeId ? `?treeId=${encodeURIComponent(treeId)}` : '';
      const res = await apiFetch(`/api/workspaces/${workspaceId}/tree${qs}`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`tree API error: ${res.status}`);
      setTreeData(((await res.json()) as { data: GedcomData }).data);
      setPicker({ sourceId: e.id, linkedIds });
    } catch {
      showToast('تعذّر تحميل الشجرة', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const addPeople = async (ids: string[]) => {
    if (!picker) return;
    const { sourceId, linkedIds } = picker;
    setPicker(null);
    const linked = new Set(linkedIds);
    const add = ids.filter((id) => !linked.has(id));
    if (add.length === 0) return;
    setBusyId(sourceId);
    try {
      await patchSource(workspaceId, sourceId, { addPersonIds: add }, treeId);
      await afterPeopleChange(sourceId);
    } catch {
      showToast('تعذّر تنفيذ العملية', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const filtered = debouncedQuery !== '' || level !== null || tab !== null;
  const count = toArabicDigits(selected.size);
  const tabs: { value: Tab; label: string; n: number }[] = [
    { value: null, label: 'الكل', n: list.counts.all },
    { value: 'shared', label: 'مشترك', n: list.counts.shared },
    { value: 'unlinked', label: 'ليس مصدرًا لأحد', n: list.counts.unlinked },
  ];

  const renderPeople = (e: SourceListItem) => {
    const people = peopleOf(e);
    const busy = busyId === e.id;
    if (e.peopleCount === 0) {
      return (
        <div className={styles.orphan}>
          <span className={styles.orphanPill}>ليس مصدرًا لأحد</span>
          {!selectOnly && (
            <>
              <Button variant="secondary" size="sm" loading={busy} onClick={() => void openPicker(e)}>
                ربط بأشخاص
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setSingleId(e.id);
                  setDialog('delete');
                }}
              >
                حذف
              </Button>
            </>
          )}
        </div>
      );
    }
    const summary = namesSummary(
      e.people.map((p) => p.name),
      e.peopleCount,
    );
    if (selectOnly) return <span className={styles.peopleSummary}>{summary}</span>;
    const open = expanded.has(e.id);
    return (
      <div className={styles.people}>
        <button
          type="button"
          className={styles.peopleToggle}
          aria-expanded={open}
          onClick={() => toggleExpanded(e)}
        >
          {summary}
          <span aria-hidden="true" className={clsx(styles.caret, { [styles.caretOpen]: open })}>
            ▾
          </span>
        </button>
        {open && (
          <div className={styles.peopleList}>
            <ul className={styles.names}>
              {people.map((p) => (
                <li key={p.id} className={styles.nameChip}>
                  <Link className={styles.personLink} href={getViewMode('tree').href({ slug, individualId: p.id, treeId })}>
                    {p.name}
                  </Link>
                  <button
                    type="button"
                    className={styles.removeName}
                    aria-label={`إزالة ${p.name}`}
                    disabled={busy}
                    onClick={() => void removePerson(e.id, p.id)}
                  >
                    <CloseIcon size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className={styles.addPeople} disabled={busy} onClick={() => void openPicker(e)}>
              ＋ إضافة أشخاص
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className={styles.manager} aria-label="قائمة المصادر">
      <div className={styles.controls}>
        {!selectOnly && (
          <div className={styles.tabs} role="group" aria-label="المصادر حسب الأشخاص">
            {tabs.map((t) => (
              <button
                key={t.label}
                type="button"
                className={clsx(styles.tab, { [styles.tabActive]: tab === t.value })}
                aria-pressed={tab === t.value}
                onClick={() => setTab(t.value)}
              >
                {t.label} ({toArabicDigits(t.n)})
              </button>
            ))}
          </div>
        )}
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
          {(selectOnly ? PENDING_LEVELS : LEVELS).map((l) => (
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
        <>
          <div className={styles.tableHead} aria-hidden="true">
            <span />
            <span>المصدر</span>
            <span>مصدر لـ</span>
            <span>ملفات</span>
            <span>من يراه</span>
          </div>
          <ul className={styles.rows}>
            {list.entries.map((e) => {
              const label = e.text || namesSummary(e.people.map((p) => p.name), e.peopleCount) || 'مصدر';
              return (
                <li key={e.id} className={clsx(styles.row, { [styles.rowSelected]: selected.has(e.id) })}>
                  <label className={styles.rowCheck}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={selected.has(e.id)}
                      onChange={() => toggleOne(e.id)}
                      aria-label={`تحديد ${label}`}
                    />
                  </label>
                  <div className={styles.cellSource}>
                    {e.text && (
                      <p className={styles.rowText} dir="auto">
                        {e.text}
                      </p>
                    )}
                  </div>
                  <div className={styles.cellPeople}>
                    <span className={styles.cellLabel}>مصدر لـ:</span>
                    {renderPeople(e)}
                  </div>
                  <div className={styles.cellFiles}>
                    {e.files.length > 0 ? (
                      <SourceFileThumbs workspaceId={workspaceId} treeId={treeId} entryId={e.id} files={e.files} size={36} />
                    ) : (
                      <span className={styles.noFiles} aria-hidden="true">
                        —
                      </span>
                    )}
                  </div>
                  <div className={styles.cellLevel}>
                    <SourceLevelBadge level={e.visibility} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {!loading && list.nextCursor !== null && (
        <div className={styles.loadMore}>
          <Button variant="secondary" size="md" loading={loadingMore} onClick={() => void loadMore()}>
            عرض المزيد
          </Button>
        </div>
      )}

      {!selectOnly && selected.size > 0 && (
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
            <Button
              variant="danger"
              size="md"
              onClick={() => {
                setSingleId(null);
                setDialog('delete');
              }}
            >
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
        onClose={() => (applying ? undefined : closeDialog())}
        title={`تغيير من يرى ${sourceCountLabel(selected.size)}`}
        className={styles.dialog}
        actions={
          <>
            <Button variant="ghost" size="md" onClick={closeDialog} disabled={applying}>
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
        onClose={() => (applying ? undefined : closeDialog())}
        title={singleId ? 'حذف المصدر' : 'حذف المصادر المحددة'}
        className={styles.dialog}
        actions={
          <>
            <Button variant="ghost" size="md" onClick={closeDialog} disabled={applying}>
              إلغاء
            </Button>
            <Button variant="danger" size="md" loading={applying} onClick={() => void apply()}>
              حذف
            </Button>
          </>
        }
      >
        <p className={styles.confirmText}>
          سيُحذف {sourceCountLabel(dialogIds.length)} مع {theirFiles(dialogIds.length)}، ولا يمكن التراجع
        </p>
      </Modal>

      {picker && treeData && (
        <SourcePeoplePicker
          data={treeData}
          initialIds={[]}
          birthPrivacy={birthPrivacy}
          onDone={(ids) => void addPeople(ids)}
          onClose={() => setPicker(null)}
        />
      )}
      {lastLinkDialog}
    </section>
  );
}
