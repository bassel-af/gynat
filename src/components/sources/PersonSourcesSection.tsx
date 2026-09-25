'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  deleteSourceEntry,
  fetchSourcePreview,
  type PersonSourceDto,
  type SourceSummaryDto,
} from '@/lib/tree/source-entries-api';
import {
  sourceDeleteUndoEntry,
  sourceLinkUndoEntry,
  sourceUnlinkUndoEntry,
} from '@/lib/tree/source-entry-undo';
import { linkPeopleToSource } from '@/lib/tree/source-plan-apply';
import type { UndoEntry } from '@/lib/undo/types';
import { notifySourcesChanged, type PersonSourcesState } from '@/hooks/usePersonSources';
import { useSourceUnlink } from '@/hooks/useSourceUnlink';
import { SourceEntryForm } from './SourceEntryForm';
import { SourceFileThumbs } from './SourceFileThumbs';
import { FamilySourceHints } from './FamilySourceHints';
import { peopleCountLabel, toArabicDigits } from './arabicDigits';
import { SourceRow } from './SourceRow';
import { BookIcon, ChevronIcon, PlusIcon } from './SourceIcons';
import styles from './PersonSourcesSection.module.css';

export interface PersonSourcesSectionProps {
  workspaceId: string;
  treeId?: string;
  individualId: string;
  /** The person's name in «إزالته عن {الاسم} فقط» and its undo label. */
  personName: string;
  /** «مصادر أسرته» / «مصادر أسرتها». */
  personSex?: string;
  canEdit: boolean;
  isAdmin: boolean;
  /** From `usePersonSources` (owned by the panel, which also reads it for the delete dialog). */
  sources: PersonSourcesState;
  onPushUndo?: (entry: UndoEntry) => void;
  /** A short confirmation for the user (a toast). */
  onNotice?: (message: string) => void;
}

type FormState = { mode: 'create' } | { mode: 'edit'; entry: PersonSourceDto } | null;

const DELETE_FAILED = 'تعذّر حذف المصدر';
const UNLINK_FAILED = 'تعذّر إزالة المصدر';
const LINK_FAILED = 'تعذّر إضافة المصدر';

/** The «⋯» menu of one row. */
function RowMenu({
  items,
  onClose,
}: {
  items: { label: string; danger?: boolean; onSelect: () => void }[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    // The last row's menu can open below the panel's fold.
    ref.current?.scrollIntoView?.({ block: 'nearest' });
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [onClose]);
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="خيارات المصدر"
      className={styles.menu}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={clsx(styles.menuItem, { [styles.menuItemDanger]: item.danger })}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/**
 * «المصادر (N)» in the sidebar person panel. What the viewer may see was
 * decided on the server; this renders exactly that — a hidden source leaves
 * no count and no hint. Viewers with nothing to see get no section at all.
 * A shared source carries «مشترك مع …»; its «⋯» menu tells removing it from
 * this person apart from deleting it for everyone.
 */
export function PersonSourcesSection({
  workspaceId,
  treeId,
  individualId,
  personName,
  personSex,
  canEdit,
  isAdmin,
  sources,
  onPushUndo,
  onNotice,
}: PersonSourcesSectionProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [form, setForm] = useState<FormState>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [hintError, setHintError] = useState(false);
  const { unlink, dialog } = useSourceUnlink({ workspaceId, treeId });

  const { entries, inherited, familyHints, loaded } = sources;
  if (!loaded) return null;
  const count = entries.length + (inherited ? 1 : 0);
  if (count === 0 && !canEdit) return null;
  const hints = canEdit && entries.length === 0 ? familyHints : [];

  const handleDelete = async (entry: PersonSourceDto) => {
    setBusy(true);
    setRowError(null);
    try {
      // The undo re-creates a text-only source for everyone: the names are
      // capped, so read every id first.
      const undoable = entry.files.length === 0 && !!entry.text;
      let personIds = [individualId, ...entry.people.map((p) => p.id)];
      if (undoable && entry.sharedCount > entry.people.length) {
        const full = await fetchSourcePreview(workspaceId, entry.id, treeId).catch(() => null);
        if (full) personIds = [individualId, ...full.people.map((p) => p.id).filter((id) => id !== individualId)];
      }
      const { deleted } = await deleteSourceEntry(workspaceId, entry.id, treeId);
      const undo = sourceDeleteUndoEntry({ workspaceId, deleted: entry, personIds, deletedAll: deleted, isAdmin, treeId });
      if (undo) onPushUndo?.(undo);
      setConfirmDeleteId(null);
      // Every mounted list of this person (sidebar + person page) refetches.
      notifySourcesChanged();
    } catch {
      setRowError({ id: entry.id, message: DELETE_FAILED });
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async (entry: PersonSourceDto) => {
    setRowError(null);
    try {
      const result = await unlink(entry.id, [individualId]);
      if (result.outcome === 'cancelled') return;
      const undo = sourceUnlinkUndoEntry({
        workspaceId,
        before: entry,
        personId: individualId,
        personName,
        outcome: result.outcome,
        isAdmin,
        treeId,
      });
      if (undo) onPushUndo?.(undo);
      notifySourcesChanged();
    } catch {
      setRowError({ id: entry.id, message: UNLINK_FAILED });
    }
  };

  const handleLinkHint = async (hint: SourceSummaryDto) => {
    setLinkingId(hint.id);
    setHintError(false);
    try {
      const { added } = await linkPeopleToSource({ workspaceId, sourceId: hint.id, personIds: [individualId], treeId });
      if (added.length > 0) onPushUndo?.(sourceLinkUndoEntry({ workspaceId, sourceId: hint.id, personIds: added, treeId }));
      notifySourcesChanged();
    } catch {
      setHintError(true);
    } finally {
      setLinkingId(null);
    }
  };

  const menuItems = (entry: PersonSourceDto) => {
    const total = 1 + entry.sharedCount;
    return [
      { label: 'تعديل', onSelect: () => setForm({ mode: 'edit', entry }) },
      { label: `إزالته عن ${personName} فقط`, onSelect: () => void handleUnlink(entry) },
      {
        label: total > 1 ? `حذف المصدر من الجميع (${toArabicDigits(total)})` : 'حذف المصدر',
        danger: true,
        onSelect: () => {
          setRowError(null);
          setConfirmDeleteId(entry.id);
        },
      },
    ];
  };

  const confirmText = (entry: PersonSourceDto) => {
    const total = 1 + entry.sharedCount;
    if (total > 1) return `سيُحذف المصدر وملفاته من ${peopleCountLabel(total)}.`;
    return entry.files.length > 0 ? 'يُحذف المصدر وملفاته، ولا يمكن التراجع عن ذلك.' : 'حذف هذا المصدر؟';
  };

  return (
    <div className={styles.section}>
      <button className={styles.toggle} onClick={() => setIsOpen((o) => !o)} aria-expanded={isOpen}>
        <BookIcon size={14} />
        <span className={styles.title}>
          المصادر{count > 0 ? ` (${toArabicDigits(count)})` : ''}
        </span>
        <ChevronIcon direction="down" size={14} className={clsx(styles.chevron, { [styles.chevronOpen]: isOpen })} />
      </button>

      {isOpen && (
        <div className={styles.content}>
          {count === 0 && <span className={styles.empty}>لا مصدر لهذا الشخص</span>}

          {entries.length > 0 && (
            <ul className={styles.list}>
              {entries.map((entry) => (
                <SourceRow
                  key={entry.id}
                  text={entry.text}
                  thumbs={
                    <SourceFileThumbs
                      workspaceId={workspaceId}
                      treeId={treeId}
                      entryId={entry.id}
                      files={entry.files}
                    />
                  }
                  locked={entry.visibility === 'admins'}
                  sharedCount={entry.sharedCount}
                  actions={
                    canEdit && (
                      <button
                        type="button"
                        className={clsx(styles.iconButton, styles.moreButton)}
                        aria-label="خيارات المصدر"
                        aria-haspopup="menu"
                        aria-expanded={menuFor === entry.id}
                        onClick={() => setMenuFor((id) => (id === entry.id ? null : entry.id))}
                      >
                        ⋯
                      </button>
                    )
                  }
                >
                  {menuFor === entry.id && <RowMenu items={menuItems(entry)} onClose={() => setMenuFor(null)} />}
                  {rowError?.id === entry.id && confirmDeleteId !== entry.id && (
                    <span className={styles.rowError} role="alert">
                      {rowError.message}
                    </span>
                  )}
                  {confirmDeleteId === entry.id && (
                    <div className={styles.confirm}>
                      <span className={styles.confirmText}>{confirmText(entry)}</span>
                      {rowError?.id === entry.id && <span className={styles.confirmText}>{rowError.message}</span>}
                      <div className={styles.confirmActions}>
                        <button
                          type="button"
                          className={styles.confirmYes}
                          disabled={busy}
                          onClick={() => void handleDelete(entry)}
                        >
                          نعم، احذف
                        </button>
                        <button
                          type="button"
                          className={styles.confirmNo}
                          disabled={busy}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}
                </SourceRow>
              ))}
            </ul>
          )}

          {inherited && (
            <div className={styles.inherited}>
              <p className={styles.inheritedText}>
                {inherited.text && <span>{inherited.text}</span>}
                <span className={styles.inheritedTag}>— من مصدر الشجرة</span>
              </p>
              <SourceFileThumbs
                workspaceId={workspaceId}
                treeId={treeId}
                entryId={inherited.id}
                files={inherited.files}
              />
            </div>
          )}

          <FamilySourceHints
            workspaceId={workspaceId}
            treeId={treeId}
            hints={hints}
            sex={personSex}
            busyId={linkingId}
            onAdd={(hint) => void handleLinkHint(hint)}
          />
          {hintError && hints.length > 0 && (
            <span className={styles.rowError} role="alert">
              {LINK_FAILED}
            </span>
          )}

          {canEdit && (
            <button type="button" className={styles.addButton} onClick={() => setForm({ mode: 'create' })}>
              <PlusIcon size={14} />
              إضافة مصدر
            </button>
          )}
        </div>
      )}

      {dialog}

      {form && (
        <SourceEntryForm
          mode={form.mode}
          workspaceId={workspaceId}
          treeId={treeId}
          individualId={individualId}
          entry={form.mode === 'edit' ? form.entry : undefined}
          isAdmin={isAdmin}
          onClose={() => setForm(null)}
          onPushUndo={onPushUndo}
          onSaved={(saved) => {
            setIsOpen(true);
            notifySourcesChanged();
            // A non-admin creates at «المشرفون فقط», which they cannot see.
            if (form.mode === 'create' && saved?.visibility === 'admins' && !isAdmin) {
              onNotice?.('أُضيف المصدر، ويراه المشرفون فقط.');
            }
          }}
        />
      )}
    </div>
  );
}
