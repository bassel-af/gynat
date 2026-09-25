'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { deleteSourceEntry, type SourceEntryDto } from '@/lib/tree/source-entries-api';
import { sourceDeleteUndoEntry } from '@/lib/tree/source-entry-undo';
import type { UndoEntry } from '@/lib/undo/types';
import { notifySourcesChanged, type PersonSourcesState } from '@/hooks/usePersonSources';
import { SourceEntryForm } from './SourceEntryForm';
import { SourceFileThumbs } from './SourceFileThumbs';
import { toArabicDigits } from './arabicDigits';
import { BookIcon, ChevronIcon, LockIcon, PencilIcon, PlusIcon, TrashIcon } from './SourceIcons';
import styles from './PersonSourcesSection.module.css';

export interface PersonSourcesSectionProps {
  workspaceId: string;
  treeId?: string;
  individualId: string;
  canEdit: boolean;
  isAdmin: boolean;
  /** From `usePersonSources` (owned by the panel, which also reads it for the delete dialog). */
  sources: PersonSourcesState;
  onPushUndo?: (entry: UndoEntry) => void;
  /** A short confirmation for the user (a toast). */
  onNotice?: (message: string) => void;
}

type FormState = { mode: 'create' } | { mode: 'edit'; entry: SourceEntryDto } | null;

/**
 * «المصادر (N)» in the sidebar person panel. What the viewer may see was
 * decided on the server; this renders exactly that — a hidden entry leaves no
 * count and no hint. Viewers with nothing to see get no section at all.
 */
export function PersonSourcesSection({
  workspaceId,
  treeId,
  individualId,
  canEdit,
  isAdmin,
  sources,
  onPushUndo,
  onNotice,
}: PersonSourcesSectionProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [form, setForm] = useState<FormState>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  const { entries, inherited, loaded } = sources;
  if (!loaded) return null;
  const count = entries.length + (inherited ? 1 : 0);
  if (count === 0 && !canEdit) return null;

  const handleDelete = async (entry: SourceEntryDto) => {
    setDeleting(true);
    setDeleteError(false);
    try {
      await deleteSourceEntry(workspaceId, entry.id, treeId);
      const undo = sourceDeleteUndoEntry({ workspaceId, deleted: entry, isAdmin, treeId });
      if (undo) onPushUndo?.(undo);
      setConfirmDeleteId(null);
      // Every mounted list of this person (sidebar + person page) refetches.
      notifySourcesChanged();
    } catch {
      setDeleteError(true);
    } finally {
      setDeleting(false);
    }
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
                <li key={entry.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    {entry.text && <p className={styles.text}>{entry.text}</p>}
                    <div className={styles.meta}>
                      <SourceFileThumbs
                        workspaceId={workspaceId}
                        treeId={treeId}
                        entryId={entry.id}
                        files={entry.files}
                      />
                      {entry.visibility === 'admins' && (
                        <span className={styles.lockBadge}>
                          <LockIcon size={11} />
                          للمشرفين
                        </span>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label="تعديل المصدر"
                        onClick={() => setForm({ mode: 'edit', entry })}
                      >
                        <PencilIcon size={13} />
                      </button>
                      <button
                        type="button"
                        className={clsx(styles.iconButton, styles.iconButtonDanger)}
                        aria-label="حذف المصدر"
                        onClick={() => {
                          setDeleteError(false);
                          setConfirmDeleteId(entry.id);
                        }}
                      >
                        <TrashIcon size={13} />
                      </button>
                    </div>
                  )}
                  {confirmDeleteId === entry.id && (
                    <div className={styles.confirm}>
                      <span className={styles.confirmText}>
                        {entry.files.length > 0
                          ? 'يُحذف المصدر وملفاته، ولا يمكن التراجع عن ذلك.'
                          : 'حذف هذا المصدر؟'}
                      </span>
                      {deleteError && <span className={styles.confirmText}>تعذّر حذف المصدر</span>}
                      <div className={styles.confirmActions}>
                        <button
                          type="button"
                          className={styles.confirmYes}
                          disabled={deleting}
                          onClick={() => void handleDelete(entry)}
                        >
                          نعم، احذف
                        </button>
                        <button
                          type="button"
                          className={styles.confirmNo}
                          disabled={deleting}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}
                </li>
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

          {canEdit && (
            <button type="button" className={styles.addButton} onClick={() => setForm({ mode: 'create' })}>
              <PlusIcon size={14} />
              إضافة مصدر
            </button>
          )}
        </div>
      )}

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
