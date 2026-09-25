'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import {
  createSourceEntry,
  updateSourceEntry,
  putTreeEntry,
  uploadSourceFile,
  deleteSourceFile,
  fetchSourceSuggestions,
  type SourceEntryDto,
  type SourceFileDto,
} from '@/lib/tree/source-entries-api';
import type { SourceVisibilityLevel } from '@/lib/tree/source-visibility';
import { MAX_SOURCE_TEXT, MAX_SOURCE_SUGGESTIONS, MAX_FILES_PER_ENTRY } from '@/lib/tree/source-entry-schemas';
import { MAX_SOURCE_FILE_BYTES } from '@/lib/tree/source-file-types';
import {
  sourceCreateUndoEntry,
  sourceUpdateUndoEntry,
  type SourceEntryPatch,
} from '@/lib/tree/source-entry-undo';
import type { UndoEntry } from '@/lib/undo/types';
import { useTreePublishLevel } from '@/hooks/useTreePublishLevel';
import { useSourceFileUrls } from '@/hooks/useSourceFileUrls';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SourceVisibilityPicker } from './SourceVisibilityPicker';
import { CloseIcon, DocumentIcon, PaperclipIcon } from './SourceIcons';
import styles from './SourceEntryForm.module.css';

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const NEEDS_TEXT_OR_FILE = 'أضف نصًا أو ملفًا';
const FILE_TOO_BIG = 'الملف أكبر من ٨ م.ب';
const SAVE_FAILED = 'تعذّر حفظ المصدر';
const UPLOAD_FAILED = 'تعذّر رفع الملف';
const SUGGEST_DELAY_MS = 300;
const SUGGEST_MIN_CHARS = 2;

export interface SourceEntryFormProps {
  mode: 'create' | 'edit';
  workspaceId: string;
  /** Target tree; absent ⇒ the workspace main tree. */
  treeId?: string;
  /** The person the entry is on (unused for the tree-wide entry). */
  individualId?: string;
  /**
   * The tree-wide entry («مصدر الشجرة», admins only): saved through PUT
   * tree-entry (an upsert — create and edit alike), not undoable.
   */
  treeWide?: boolean;
  /** Edit mode: the entry being edited. */
  entry?: SourceEntryDto;
  isAdmin: boolean;
  onClose: () => void;
  /** After a successful save (or after the last file of a text-less entry is deleted). */
  onSaved: (entry: SourceEntryDto | null) => void;
  onPushUndo?: (entry: UndoEntry) => void;
}

/** A file picked in this form: uploading, or staged on the server. */
interface StagedFile {
  key: string;
  name: string;
  isImage: boolean;
  previewUrl: string | null;
  status: 'uploading' | 'done';
  id?: string;
}

let stagedCounter = 0;

/**
 * «إضافة مصدر» / «تعديل المصدر» — one small form: the «المصدر» text (with
 * suggestions from texts already used in this family space), files (each
 * uploaded at once and attached on save), and «من يرى هذا المصدر؟».
 */
export function SourceEntryForm({
  mode,
  workspaceId,
  treeId,
  individualId,
  treeWide = false,
  entry,
  isAdmin,
  onClose,
  onSaved,
  onPushUndo,
}: SourceEntryFormProps) {
  const [text, setText] = useState(entry?.text ?? '');
  const [visibility, setVisibility] = useState<SourceVisibilityLevel>(entry?.visibility ?? 'admins');
  const [existingFiles, setExistingFiles] = useState<SourceFileDto[]>(entry?.files ?? []);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteFileId, setConfirmDeleteFileId] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Only a user keystroke asks for suggestions (never a picked suggestion).
  const typedRef = useRef(false);
  const suggestTicketRef = useRef(0);

  const treeVisibility = useTreePublishLevel(workspaceId, treeId, isAdmin);
  const existingUrls = useSourceFileUrls(workspaceId, treeId, entry?.id ?? '', mode === 'edit' ? existingFiles : []);

  // Revoke every local preview on close.
  const stagedRef = useRef(staged);
  stagedRef.current = staged;
  useEffect(
    () => () => {
      for (const s of stagedRef.current) if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
    },
    [],
  );

  // Typing help: debounced, workspace-scoped, capped.
  useEffect(() => {
    if (!typedRef.current) return;
    const q = text.trim();
    if (q.length < SUGGEST_MIN_CHARS) {
      setSuggestions([]);
      return;
    }
    const ticket = ++suggestTicketRef.current;
    const timer = setTimeout(() => {
      fetchSourceSuggestions(workspaceId, q)
        .then((list) => {
          if (ticket !== suggestTicketRef.current) return;
          setSuggestions(list.filter((s) => s !== q).slice(0, MAX_SOURCE_SUGGESTIONS));
        })
        .catch(() => {
          if (ticket === suggestTicketRef.current) setSuggestions([]);
        });
    }, SUGGEST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, workspaceId]);

  const pickSuggestion = (value: string) => {
    typedRef.current = false;
    suggestTicketRef.current++;
    setSuggestions([]);
    setText(value);
  };

  const addFiles = useCallback(
    (files: File[]) => {
      setError('');
      for (const file of files) {
        if (file.size > MAX_SOURCE_FILE_BYTES) {
          setError(FILE_TOO_BIG);
          continue;
        }
        const key = `staged-${++stagedCounter}`;
        const isImage = file.type.startsWith('image/');
        const previewUrl = isImage ? URL.createObjectURL(file) : null;
        setStaged((prev) => [...prev, { key, name: file.name, isImage, previewUrl, status: 'uploading' }]);
        uploadSourceFile(workspaceId, file, treeId)
          .then((dto) => {
            setStaged((prev) => prev.map((s) => (s.key === key ? { ...s, status: 'done', id: dto.id } : s)));
          })
          .catch((err: unknown) => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setStaged((prev) => prev.filter((s) => s.key !== key));
            setError(err instanceof Error && /[؀-ۿ]/.test(err.message) ? err.message : UPLOAD_FAILED);
          });
      }
    },
    [workspaceId, treeId],
  );

  const removeStaged = (key: string) => {
    setStaged((prev) => {
      const gone = prev.find((s) => s.key === key);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((s) => s.key !== key);
    });
  };

  const handleDeleteExisting = async (fileId: string) => {
    if (!entry) return;
    setDeletingFile(true);
    setError('');
    try {
      const { entryDeleted } = await deleteSourceFile(workspaceId, entry.id, fileId, treeId);
      setConfirmDeleteFileId(null);
      if (entryDeleted) {
        onSaved(null);
        onClose();
        return;
      }
      setExistingFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch {
      setError('تعذّر حذف الملف');
    } finally {
      setDeletingFile(false);
    }
  };

  const uploading = staged.some((s) => s.status === 'uploading');
  const stagedIds = staged.filter((s) => s.status === 'done' && s.id).map((s) => s.id as string);
  const hasFiles = existingFiles.length + staged.length > 0;
  const fileSlotsLeft = MAX_FILES_PER_ENTRY - existingFiles.length - staged.length;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || uploading) return;
    const trimmed = text.trim();
    if (!trimmed && existingFiles.length + stagedIds.length === 0) {
      setError(NEEDS_TEXT_OR_FILE);
      return;
    }
    setError('');
    setSaving(true);
    try {
      if (treeWide) {
        const saved = await putTreeEntry(
          workspaceId,
          { text: trimmed || null, ...(stagedIds.length > 0 ? { fileIds: stagedIds } : {}), visibility },
          treeId,
        );
        onSaved(saved);
      } else if (mode === 'create' && individualId) {
        const body = {
          text: trimmed || null,
          ...(stagedIds.length > 0 ? { fileIds: stagedIds } : {}),
          visibility,
        };
        const created = await createSourceEntry(workspaceId, individualId, body, treeId);
        onPushUndo?.(sourceCreateUndoEntry({ workspaceId, individualId, created, treeId }));
        onSaved(created);
      } else if (entry) {
        const patch: SourceEntryPatch = {};
        const nextText = trimmed || null;
        if (nextText !== (entry.text ?? null)) patch.text = nextText;
        if (visibility !== entry.visibility) patch.visibility = visibility;
        if (stagedIds.length > 0) patch.fileIds = stagedIds;
        if (Object.keys(patch).length === 0) {
          onClose();
          return;
        }
        const updated = await updateSourceEntry(workspaceId, entry.id, patch, treeId);
        const undo = sourceUpdateUndoEntry({ workspaceId, before: entry, patch, treeId });
        if (undo) onPushUndo?.(undo);
        onSaved(updated);
      }
      // The staged previews now belong to a saved entry; drop them.
      for (const s of staged) if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      stagedRef.current = [];
      onClose();
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setSaving(false);
    }
  };

  const title = treeWide ? 'مصدر الشجرة' : mode === 'create' ? 'إضافة مصدر' : 'تعديل المصدر';
  const actions = (
    <>
      <Button variant="ghost" size="md" onClick={onClose} disabled={saving}>
        إلغاء
      </Button>
      <Button variant="primary" size="md" type="submit" form="source-entry-form" loading={saving} disabled={uploading}>
        حفظ
      </Button>
    </>
  );

  return (
    <Modal isOpen onClose={onClose} title={title} actions={actions} className={styles.modal}>
      <form id="source-entry-form" className={styles.form} onSubmit={handleSubmit} noValidate>
        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        <div className={styles.field}>
          <label htmlFor="source-entry-text" className={styles.label}>
            المصدر
          </label>
          <div className={styles.suggestWrap}>
            <textarea
              id="source-entry-text"
              className={styles.textarea}
              value={text}
              onChange={(e) => {
                typedRef.current = true;
                setText(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && suggestions.length > 0) {
                  e.stopPropagation();
                  setSuggestions([]);
                }
              }}
              placeholder="مثال: طبقات ابن سعد، ص ٩٠"
              maxLength={MAX_SOURCE_TEXT}
              rows={3}
              autoComplete="off"
              aria-autocomplete="list"
              aria-controls={suggestions.length > 0 ? 'source-entry-suggestions' : undefined}
            />
            {suggestions.length > 0 && (
              <ul id="source-entry-suggestions" className={styles.suggestions} role="listbox" aria-label="مصادر مستعملة">
                {suggestions.map((s) => (
                  <li
                    key={s}
                    role="option"
                    aria-selected={false}
                    tabIndex={0}
                    className={styles.suggestion}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickSuggestion(s)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        pickSuggestion(s);
                      }
                    }}
                  >
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>ملفات</span>
          {(existingFiles.length > 0 || staged.length > 0) && (
            <ul className={styles.fileList}>
              {existingFiles.map((f) => {
                const isImage = f.mimeType.startsWith('image/');
                const url = existingUrls[f.id];
                return (
                  <li key={f.id} className={styles.fileItem}>
                    <span className={clsx(styles.fileThumb, { [styles.fileThumbLoading]: isImage && !url })}>
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element -- object URL
                        url && <img src={url} alt="" />
                      ) : (
                        <DocumentIcon size={16} />
                      )}
                    </span>
                    <span className={styles.fileName} dir="auto">
                      {f.fileName}
                    </span>
                    {confirmDeleteFileId === f.id ? (
                      <span className={styles.fileConfirm}>
                        <span className={styles.fileConfirmText}>لا يمكن التراجع عن حذف الملف.</span>
                        <Button
                          variant="danger"
                          size="sm"
                          loading={deletingFile}
                          onClick={() => void handleDeleteExisting(f.id)}
                        >
                          نعم، احذف الملف
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteFileId(null)} disabled={deletingFile}>
                          إلغاء
                        </Button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={styles.fileRemove}
                        aria-label={`حذف ${f.fileName}`}
                        onClick={() => setConfirmDeleteFileId(f.id)}
                      >
                        <CloseIcon size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
              {staged.map((s) => (
                <li key={s.key} className={clsx(styles.fileItem, { [styles.fileUploading]: s.status === 'uploading' })}>
                  <span className={styles.fileThumb}>
                    {s.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- local object URL
                      <img src={s.previewUrl} alt="" />
                    ) : (
                      <DocumentIcon size={16} />
                    )}
                  </span>
                  <span className={styles.fileName} dir="auto">
                    {s.name}
                  </span>
                  {s.status === 'uploading' ? (
                    <span className={styles.spinner} role="status" aria-label={`جاري رفع ${s.name}`} />
                  ) : (
                    <button
                      type="button"
                      className={styles.fileRemove}
                      aria-label={`إزالة ${s.name}`}
                      onClick={() => removeStaged(s.key)}
                    >
                      <CloseIcon size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className={styles.hiddenInput}
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []).slice(0, Math.max(fileSlotsLeft, 0));
              e.target.value = '';
              addFiles(files);
            }}
          />
          <button
            type="button"
            className={styles.addFileButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={fileSlotsLeft <= 0}
          >
            <PaperclipIcon size={15} />
            إرفاق صورة أو PDF
          </button>
        </div>

        <SourceVisibilityPicker
          value={visibility}
          onChange={setVisibility}
          isAdmin={isAdmin}
          treeVisibility={treeVisibility}
          hasFiles={hasFiles}
        />
      </form>
    </Modal>
  );
}
