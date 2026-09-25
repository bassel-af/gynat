'use client';

import { forwardRef, useId } from 'react';
import clsx from 'clsx';
import type { SourceEntryDto, SourceSummaryDto } from '@/lib/tree/source-entries-api';
import { rowState, stagedCount, stagedSharedCount, type StagedSource } from '@/lib/tree/source-staging';
import { SourceRow } from './SourceRow';
import { FamilySourceHints } from './FamilySourceHints';
import { SourceFileThumbs } from './SourceFileThumbs';
import { toArabicDigits } from './arabicDigits';
import { BookIcon, DocumentIcon, PencilIcon, PlusIcon, TrashIcon } from './SourceIcons';
import sectionStyles from './PersonSourcesSection.module.css';
import styles from './StagedSourcesList.module.css';

export interface StagedSourcesListProps {
  workspaceId: string;
  treeId?: string;
  /** Create modes save added rows with the new person («يُحفظ مع الشخص»). */
  mode: 'create' | 'edit';
  items: readonly StagedSource[];
  /** The tree-wide entry this person inherits — muted, read-only. */
  inherited?: SourceEntryDto | null;
  /** «مصادر أسرته» (edit mode, a person with no sources): «إضافة» stages a link. */
  familyHints?: readonly SourceSummaryDto[];
  /** The person's sex (the hints' title). */
  sex?: string;
  onAddHint?: (hint: SourceSummaryDto) => void;
  onAdd: () => void;
  onEdit: (key: string) => void;
  /** Remove a row from this person (or restore a removed one). */
  onRemove: (key: string) => void;
  /** Polite announcement («أُضيف المصدر إلى القائمة»). */
  announcement?: string;
}

/**
 * «المصادر (N)» inside the person form: the person's entries plus what this
 * form has staged. Nothing here saves — the person form's «حفظ» does.
 */
export const StagedSourcesList = forwardRef<HTMLButtonElement, StagedSourcesListProps>(function StagedSourcesList(
  { workspaceId, treeId, mode, items, inherited, familyHints = [], sex, onAddHint, onAdd, onEdit, onRemove, announcement },
  addButtonRef,
) {
  const titleId = useId();
  const count = stagedCount(items) + (inherited ? 1 : 0);

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h4 id={titleId} className={styles.title}>
        <BookIcon size={14} />
        {count > 0 ? `المصادر (${toArabicDigits(count)})` : 'المصادر'}
      </h4>

      {items.length === 0 && !inherited && <span className={sectionStyles.empty}>لا مصدر لهذا الشخص</span>}

      {items.length > 0 && (
        <ul className={sectionStyles.list}>
          {items.map((item) => {
            const state = rowState(item);
            const draft = item.draft;
            const entry = item.entry;
            const linked = draft?.linkSource;
            const text = (linked ? linked.text : draft ? draft.text.trim() : entry?.text) || null;
            const visibility = linked?.visibility ?? draft?.visibility ?? entry?.visibility;
            const gone = state === 'deleted' || state === 'unlinked';
            const shared = (entry?.sharedCount ?? 0) > 0;
            const removed = new Set(draft?.removeFileIds ?? []);
            const savedFiles = (entry?.files ?? []).filter((f) => !removed.has(f.id));
            const newFiles = draft?.addFiles ?? [];
            const hasFiles = (entry?.files.length ?? 0) > 0;

            const tags: string[] = [];
            if (state === 'added') tags.push(mode === 'create' ? 'يُحفظ مع الشخص' : 'جديد');
            if (state === 'edited') tags.push('مُعدَّل');
            if (state === 'deleted') tags.push(hasFiles ? 'سيُحذف مع ملفاته' : 'سيُحذف');
            if (state === 'unlinked') tags.push('سيُزال عن هذا الشخص');
            if (item.failed) tags.push('تعذّر الحفظ');

            return (
              <SourceRow
                key={item.key}
                className={clsx(styles.row, {
                  [styles.rowAdded]: state === 'added',
                  [styles.rowEdited]: state === 'edited',
                  [styles.rowDeleted]: gone,
                  [styles.rowFailed]: item.failed,
                })}
                textClassName={gone ? styles.struck : undefined}
                text={text}
                locked={visibility === 'admins'}
                sharedCount={gone ? 0 : stagedSharedCount(item)}
                thumbs={
                  <>
                    {entry && savedFiles.length > 0 && (
                      <SourceFileThumbs workspaceId={workspaceId} treeId={treeId} entryId={entry.id} files={savedFiles} />
                    )}
                    {newFiles.map((f) => (
                      <span key={f.id} className={styles.localThumb} title={f.name}>
                        {f.isImage && f.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- local object URL
                          <img src={f.previewUrl} alt={f.name} />
                        ) : (
                          <DocumentIcon size={14} />
                        )}
                      </span>
                    ))}
                  </>
                }
                tag={tags.map((t) => (
                  <span key={t} className={clsx(styles.tag, { [styles.tagDanger]: t === 'تعذّر الحفظ' || gone })}>
                    {t}
                  </span>
                ))}
                actions={
                  gone ? (
                    <button
                      type="button"
                      className={styles.restoreButton}
                      aria-label={state === 'deleted' ? 'تراجع عن حذف المصدر' : 'تراجع عن إزالة المصدر'}
                      onClick={() => onRemove(item.key)}
                    >
                      تراجع
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={clsx(sectionStyles.iconButton, styles.iconButton)}
                        aria-label="تعديل المصدر"
                        onClick={() => onEdit(item.key)}
                      >
                        <PencilIcon size={13} />
                      </button>
                      <button
                        type="button"
                        className={clsx(sectionStyles.iconButton, sectionStyles.iconButtonDanger, styles.iconButton)}
                        aria-label={shared ? 'إزالة المصدر عن هذا الشخص' : 'حذف المصدر'}
                        onClick={() => onRemove(item.key)}
                      >
                        <TrashIcon size={13} />
                      </button>
                    </>
                  )
                }
              />
            );
          })}
        </ul>
      )}

      {inherited && (
        <div className={sectionStyles.inherited}>
          <p className={sectionStyles.inheritedText}>
            {inherited.text && <span>{inherited.text}</span>}
            <span className={sectionStyles.inheritedTag}>— من مصدر الشجرة</span>
          </p>
          <SourceFileThumbs workspaceId={workspaceId} treeId={treeId} entryId={inherited.id} files={inherited.files} />
        </div>
      )}

      {onAddHint && items.length === 0 && (
        <FamilySourceHints workspaceId={workspaceId} treeId={treeId} hints={familyHints} sex={sex} onAdd={onAddHint} />
      )}

      <button ref={addButtonRef} type="button" className={sectionStyles.addButton} onClick={onAdd}>
        <PlusIcon size={14} />
        إضافة مصدر
      </button>

      <span className={styles.srOnly} aria-live="polite">
        {announcement}
      </span>
    </section>
  );
});
