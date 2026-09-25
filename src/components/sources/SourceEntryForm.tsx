'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import {
  createSource,
  patchSource,
  putTreeEntry,
  uploadSourceFile,
  deleteSourceFile,
  fetchSourceSuggestionSummaries,
  fetchSourcePreview,
  type PatchSourceBody,
  type SourceEntryDto,
  type SourceFileDto,
  type SourceSummaryDto,
} from '@/lib/tree/source-entries-api';
import type { GedcomData } from '@/lib/gedcom/types';
import { isShownOnPublicTree } from '@/lib/tree/public-shown';
import type { SourceVisibilityLevel } from '@/lib/tree/source-visibility';
import { MAX_SOURCE_TEXT, MAX_SOURCE_SUGGESTIONS, MAX_FILES_PER_ENTRY } from '@/lib/tree/source-entry-schemas';
import { MAX_SOURCE_FILE_BYTES } from '@/lib/tree/source-file-types';
import {
  sourceCreateUndoEntry,
  sourceUpdateUndoEntry,
  type SourceEntryPatch,
} from '@/lib/tree/source-entry-undo';
import type { UndoEntry } from '@/lib/undo/types';
import type { SourceDraft, SourceDraftPerson } from '@/lib/tree/source-staging';
import { useTreePublishLevel } from '@/hooks/useTreePublishLevel';
import { useSourceFileUrls } from '@/hooks/useSourceFileUrls';
import { useOptionalTree } from '@/context/TreeContext';
import { useOptionalWorkspaceTree } from '@/context/WorkspaceTreeContext';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SourceVisibilityPicker } from './SourceVisibilityPicker';
import { SourcePeoplePicker, NEW_PERSON_LABEL } from './SourcePeoplePicker';
import { SourcePreview } from './SourcePreview';
import { CloseIcon, DocumentIcon, EyeIcon, PaperclipIcon } from './SourceIcons';
import { fileCountLabel, othersMoreLabel, peopleCountLabel } from './arabicDigits';
import styles from './SourceEntryForm.module.css';

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const NEEDS_TEXT_OR_FILE = 'أضف نصًا أو ملفًا';
const FILE_TOO_BIG = 'الملف أكبر من ٨ م.ب';
const SAVE_FAILED = 'تعذّر حفظ المصدر';
const UPLOAD_FAILED = 'تعذّر رفع الملف';
const SUGGEST_DELAY_MS = 300;
const SUGGEST_MIN_CHARS = 2;
/** More chips than this collapse into «و{N} آخرون ▾». */
const MAX_CHIPS = 4;

/** An entry as the person routes send it: with the other people it is for. */
export type SourceFormEntry = SourceEntryDto & {
  /** The OTHER people this viewer may see (capped). */
  people?: SourceDraftPerson[];
  /** How many other people this viewer may see (uncapped). */
  sharedCount?: number;
};

export interface SourceEntryFormProps {
  mode: 'create' | 'edit';
  workspaceId: string;
  /** Target tree; absent ⇒ the workspace main tree. */
  treeId?: string;
  /** The starting person — whose page opened the form (unused for the tree-wide entry). */
  individualId?: string;
  /**
   * The starting person is being created in the person form (add child /
   * spouse / parent): the locked chip reads «هذا الشخص (جديد)». Deferred only.
   */
  newPerson?: boolean;
  /**
   * The loaded tree, for the «مصدر لـ» line and its picker. Absent ⇒ the
   * current `TreeProvider` tree; with neither, the line is not shown.
   */
  data?: GedcomData | null;
  /**
   * The tree-wide entry («مصدر الشجرة», admins only): saved through PUT
   * tree-entry (an upsert — create and edit alike), not undoable.
   */
  treeWide?: boolean;
  /** Edit mode: the entry being edited. */
  entry?: SourceFormEntry;
  isAdmin: boolean;
  onClose: () => void;
  /** After a successful save (or after the last file of a text-less entry is deleted). */
  onSaved: (entry: SourceEntryDto | null) => void;
  onPushUndo?: (entry: UndoEntry) => void;
  /**
   * DEFERRED mode (inside the person edit form): «حفظ» makes no entry API
   * call — it validates and hands the draft back; the person form saves it on
   * its own «حفظ». Uploads still go up at once (staged files). Removing a saved
   * file is only staged. The parent owns the previews: this form never
   * revokes a preview it handed back or was given.
   */
  onDraft?: (draft: SourceDraft) => void;
  /** Deferred mode: the row's staged draft, to reopen it as it was left. */
  initialDraft?: SourceDraft;
  /** Deferred mode opens on top of the person form. */
  stacked?: boolean;
}

/** A file picked in this form: uploading, or staged on the server. */
interface StagedFile {
  key: string;
  name: string;
  isImage: boolean;
  previewUrl: string | null;
  status: 'uploading' | 'done';
  id?: string;
  /** Came in with `initialDraft` — the parent owns its preview. */
  fromParent?: boolean;
}

let stagedCounter = 0;

/** A suggestion worth linking: shared by several people, or carrying files. */
function isReusable(s: SourceSummaryDto): boolean {
  return s.peopleCount >= 2 || s.fileCount > 0;
}

/** «· مصدر لـ ١٠ أشخاص · ٣ ملفات» / «· نص فقط». */
function suggestionMeta(s: SourceSummaryDto): string {
  const people = s.peopleCount > 0 ? `مصدر لـ ${peopleCountLabel(s.peopleCount)}` : 'ليس مصدرًا لأحد';
  const files = s.fileCount > 0 ? fileCountLabel(s.fileCount) : 'نص فقط';
  return `· ${people} · ${files}`;
}

const idsOf = (people: readonly SourceDraftPerson[]) => people.map((p) => p.id);

/**
 * «إضافة مصدر» / «تعديل المصدر» — the «المصدر» text (with suggestions from
 * this tree's sources: copy the text, or link the existing source), files
 * (each uploaded at once and attached on save), «مصدر لـ:» (the locked
 * starting person plus anyone picked) and «من يرى هذا المصدر؟». Nothing is
 * saved before «حفظ».
 */
export function SourceEntryForm({
  mode,
  workspaceId,
  treeId,
  individualId,
  newPerson = false,
  data: dataProp,
  treeWide = false,
  entry,
  isAdmin,
  onClose,
  onSaved,
  onPushUndo,
  onDraft,
  initialDraft,
  stacked = false,
}: SourceEntryFormProps) {
  const deferred = !!onDraft;
  const treeCtx = useOptionalTree();
  const wsCtx = useOptionalWorkspaceTree();
  const data = dataProp === undefined ? (treeCtx?.data ?? null) : dataProp;
  const start = individualId && data ? data.individuals[individualId] : undefined;
  const showPeople = !treeWide && !!data && (newPerson || !!start);
  const birthPrivacy = useMemo(
    () => ({
      hideBirthDateForFemale: wsCtx?.hideBirthDateForFemale,
      hideBirthDateForMale: wsCtx?.hideBirthDateForMale,
    }),
    [wsCtx?.hideBirthDateForFemale, wsCtx?.hideBirthDateForMale],
  );

  const [text, setText] = useState(initialDraft?.text ?? entry?.text ?? '');
  const [visibility, setVisibility] = useState<SourceVisibilityLevel>(
    initialDraft?.visibility ?? entry?.visibility ?? 'admins',
  );
  const [existingFiles, setExistingFiles] = useState<SourceFileDto[]>(entry?.files ?? []);
  const [staged, setStaged] = useState<StagedFile[]>(() =>
    (initialDraft?.addFiles ?? []).map((f) => ({
      key: `parent-${f.id}`,
      name: f.name,
      isImage: f.isImage,
      previewUrl: f.previewUrl,
      status: 'done' as const,
      id: f.id,
      fromParent: true,
    })),
  );
  // Deferred mode: saved files the user removed (crossed out until «حفظ»).
  const [removedIds, setRemovedIds] = useState<string[]>(initialDraft?.removeFileIds ?? []);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteFileId, setConfirmDeleteFileId] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState(false);
  const [suggestions, setSuggestions] = useState<SourceSummaryDto[]>([]);
  const [chosen, setChosen] = useState<SourceSummaryDto | null>(null);
  const [preview, setPreview] = useState<SourceSummaryDto | null>(null);
  const [linked, setLinked] = useState<SourceSummaryDto | null>(initialDraft?.linkSource ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Only a user keystroke asks for suggestions (never a picked suggestion).
  const typedRef = useRef(false);
  const suggestTicketRef = useRef(0);

  // «مصدر لـ»: the OTHER people (never the starting person).
  const selfFilter = useCallback(
    (people: readonly SourceDraftPerson[] | undefined) => (people ?? []).filter((p) => p.id !== individualId),
    [individualId],
  );
  const [savedOthers, setSavedOthers] = useState<SourceDraftPerson[]>(() => selfFilter(entry?.people));
  const [others, setOthers] = useState<SourceDraftPerson[]>(() => initialDraft?.people ?? selfFilter(entry?.people));
  const peopleTouchedRef = useRef(!!initialDraft?.people);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const treeVisibility = useTreePublishLevel(workspaceId, treeId, isAdmin);
  const existingUrls = useSourceFileUrls(workspaceId, treeId, entry?.id ?? '', mode === 'edit' ? existingFiles : []);

  // The entry carries only the first names: load everyone this viewer may see.
  const entryId = entry?.id;
  const needsAllPeople = showPeople && mode === 'edit' && (entry?.sharedCount ?? 0) > (entry?.people?.length ?? 0);
  useEffect(() => {
    if (!needsAllPeople || !entryId) return;
    let live = true;
    fetchSourcePreview(workspaceId, entryId, treeId)
      .then((full) => {
        if (!live) return;
        const all = selfFilter(full.people);
        setSavedOthers(all);
        if (!peopleTouchedRef.current) setOthers(all);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [needsAllPeople, entryId, workspaceId, treeId, selfFilter]);

  // Revoke every local preview this form still owns on close.
  const stagedRef = useRef(staged);
  stagedRef.current = staged;
  // Deferred mode: once the draft is handed back, its previews are the parent's.
  const handedOffRef = useRef(false);
  useEffect(
    () => () => {
      if (handedOffRef.current) return;
      for (const s of stagedRef.current) if (s.previewUrl && !s.fromParent) URL.revokeObjectURL(s.previewUrl);
    },
    [],
  );

  // Typing help: debounced, tree-scoped, capped.
  useEffect(() => {
    if (!typedRef.current) return;
    const q = text.trim();
    if (q.length < SUGGEST_MIN_CHARS) {
      setSuggestions([]);
      setChosen(null);
      return;
    }
    const ticket = ++suggestTicketRef.current;
    const timer = setTimeout(() => {
      fetchSourceSuggestionSummaries(workspaceId, q, treeId)
        .then((list) => {
          if (ticket !== suggestTicketRef.current) return;
          setSuggestions(
            list.filter((s) => isReusable(s) || (s.text ?? '') !== q).slice(0, MAX_SOURCE_SUGGESTIONS),
          );
          setChosen(null);
        })
        .catch(() => {
          if (ticket === suggestTicketRef.current) setSuggestions([]);
        });
    }, SUGGEST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, workspaceId, treeId]);

  const closeSuggestions = () => {
    typedRef.current = false;
    suggestTicketRef.current++;
    setSuggestions([]);
    setChosen(null);
  };

  const copyText = (s: SourceSummaryDto) => {
    closeSuggestions();
    setText(s.text ?? '');
  };

  // Linking is for a new source on a person; an edit or the tree-wide entry only copies.
  const canLink = mode === 'create' && !treeWide && (!!individualId || newPerson);

  const pickSuggestion = (s: SourceSummaryDto) => {
    if (canLink && isReusable(s)) setChosen((c) => (c?.id === s.id ? null : s));
    else copyText(s);
  };

  const linkSuggestion = (s: SourceSummaryDto) => {
    closeSuggestions();
    setPreview(null);
    setLinked(s);
    setError('');
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
      if (gone?.previewUrl && !gone.fromParent) URL.revokeObjectURL(gone.previewUrl);
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

  // --- «مصدر لـ» -------------------------------------------------------------
  const nameOf = (id: string, fallback: string): string => {
    const ind = data?.individuals[id];
    return ind ? ind.givenName || ind.name || fallback : fallback;
  };
  const pickPeople = (ids: string[]) => {
    const known = new Map(others.map((p) => [p.id, p.name]));
    peopleTouchedRef.current = true;
    setOthers(ids.map((id) => ({ id, name: known.get(id) ?? nameOf(id, '') })));
    setPickerOpen(false);
  };
  const removePerson = (id: string) => {
    peopleTouchedRef.current = true;
    setOthers((prev) => prev.filter((p) => p.id !== id));
  };
  const savedIds = new Set(idsOf(savedOthers));
  const currentIds = new Set(idsOf(others));
  const addPersonIds = idsOf(others).filter((id) => !savedIds.has(id));
  const removePersonIds = idsOf(savedOthers).filter((id) => !currentIds.has(id));

  const uploading = staged.some((s) => s.status === 'uploading');
  const stagedIds = staged.filter((s) => s.status === 'done' && s.id).map((s) => s.id as string);
  const keptExisting = existingFiles.length - removedIds.length;
  const hasFiles = keptExisting + staged.length > 0;
  const fileSlotsLeft = MAX_FILES_PER_ENTRY - existingFiles.length - staged.length;

  // Counts are the people this viewer may see (the starting person included).
  const savedTotal = 1 + (entry?.sharedCount ?? 0);
  const total = showPeople ? 1 + others.length : savedTotal;
  const contentChanged =
    mode === 'edit' &&
    !!entry &&
    ((text.trim() || null) !== (entry.text ?? null) ||
      visibility !== entry.visibility ||
      staged.length > 0 ||
      removedIds.length > 0);
  const saveLabel = contentChanged && total > 1 ? `حفظ عند ${peopleCountLabel(total)}` : 'حفظ';
  const publicShown = useMemo(() => {
    if (!data) return 0;
    const now = new Date();
    const ids = [...(individualId ? [individualId] : []), ...idsOf(others)];
    return ids.filter((id) => {
      const ind = data.individuals[id];
      return !!ind && isShownOnPublicTree(ind, now);
    }).length;
  }, [data, individualId, others]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (saving || uploading) return;
    const trimmed = text.trim();
    if (!linked && !trimmed && keptExisting + stagedIds.length === 0) {
      setError(NEEDS_TEXT_OR_FILE);
      return;
    }
    setError('');
    if (onDraft) {
      onDraft({
        text: trimmed,
        visibility,
        addFiles: staged
          .filter((s) => s.status === 'done' && s.id)
          .map((s) => ({ id: s.id as string, name: s.name, isImage: s.isImage, previewUrl: s.previewUrl })),
        removeFileIds: [...removedIds],
        ...(showPeople ? { people: [...others] } : {}),
        ...(showPeople && mode === 'edit' ? { addPersonIds, removePersonIds } : {}),
        ...(linked ? { linkSource: linked } : {}),
      });
      // The previews now belong to the parent's list.
      handedOffRef.current = true;
      onClose();
      return;
    }
    setSaving(true);
    try {
      if (treeWide) {
        const saved = await putTreeEntry(
          workspaceId,
          { text: trimmed || null, ...(stagedIds.length > 0 ? { fileIds: stagedIds } : {}), visibility },
          treeId,
        );
        onSaved(saved);
      } else if (mode === 'create' && individualId && linked) {
        // Reuse: the existing source gains these people; its content is untouched.
        const saved = await patchSource(
          workspaceId,
          linked.id,
          { addPersonIds: [individualId, ...idsOf(others)] },
          treeId,
        );
        onSaved(saved);
      } else if (mode === 'create' && individualId) {
        const created = await createSource(
          workspaceId,
          {
            text: trimmed || null,
            ...(stagedIds.length > 0 ? { fileIds: stagedIds } : {}),
            visibility,
            personIds: [individualId, ...idsOf(others)],
          },
          treeId,
        );
        onPushUndo?.(sourceCreateUndoEntry({ workspaceId, individualId, created, treeId }));
        onSaved(created);
      } else if (entry) {
        const patch: SourceEntryPatch = {};
        const nextText = trimmed || null;
        if (nextText !== (entry.text ?? null)) patch.text = nextText;
        if (visibility !== entry.visibility) patch.visibility = visibility;
        if (stagedIds.length > 0) patch.fileIds = stagedIds;
        const body: PatchSourceBody = {
          ...patch,
          ...(showPeople && addPersonIds.length > 0 ? { addPersonIds } : {}),
          ...(showPeople && removePersonIds.length > 0 ? { removePersonIds } : {}),
        };
        if (Object.keys(body).length === 0) {
          onClose();
          return;
        }
        // The starting person always stays, so this never removes the last one.
        const updated = await patchSource(workspaceId, entry.id, body, treeId);
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
      <Button type="button" variant="ghost" size="md" onClick={onClose} disabled={saving}>
        إلغاء
      </Button>
      <Button variant="primary" size="md" type="submit" form="source-entry-form" loading={saving} disabled={uploading}>
        {saveLabel}
      </Button>
    </>
  );

  const collapsed = !expanded && 1 + others.length > MAX_CHIPS;
  const shownOthers = collapsed ? others.slice(0, MAX_CHIPS - 1) : others;

  return (
    <Modal isOpen onClose={onClose} title={title} actions={actions} className={styles.modal} stacked={stacked}>
      <form id="source-entry-form" className={styles.form} onSubmit={handleSubmit} noValidate>
        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        {mode === 'edit' && savedTotal > 1 && (
          <p className={styles.banner}>هذا المصدر لـ {peopleCountLabel(savedTotal)}. أي تعديل هنا يظهر عندهم جميعًا.</p>
        )}

        {linked ? (
          <div className={styles.field}>
            <span className={styles.label}>المصدر</span>
            <div className={styles.linkedCard}>
              <p className={styles.linkedText} dir="auto">
                {linked.fileCount > 0 && <PaperclipIcon size={14} className={styles.linkedIcon} />}
                {linked.text}
              </p>
              <span className={styles.suggestionMeta}>{suggestionMeta(linked)}</span>
              <button type="button" className={styles.textButton} onClick={() => setLinked(null)}>
                إلغاء الربط
              </button>
            </div>
          </div>
        ) : (
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
                    closeSuggestions();
                  }
                }}
                placeholder="مثال: طبقات ابن سعد، ص ٩٠"
                autoFocus={deferred}
                maxLength={MAX_SOURCE_TEXT}
                rows={3}
                autoComplete="off"
                aria-controls={suggestions.length > 0 ? 'source-entry-suggestions' : undefined}
              />
              {suggestions.length > 0 && (
                <div className={styles.suggestions}>
                  <ul id="source-entry-suggestions" className={styles.suggestionList} aria-label="مصادر مستعملة">
                    {suggestions.map((s) => {
                      const rich = isReusable(s);
                      const label = rich ? (s.text ?? '') : s.firstPersonName ? `${s.firstPersonName}: ${s.text ?? ''}` : (s.text ?? '');
                      return (
                        <li key={s.id} className={clsx(styles.suggestion, { [styles.suggestionOn]: chosen?.id === s.id })}>
                          <button
                            type="button"
                            className={styles.suggestionPick}
                            aria-pressed={canLink && rich ? chosen?.id === s.id : undefined}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickSuggestion(s)}
                          >
                            {rich && s.fileCount > 0 && <PaperclipIcon size={13} className={styles.linkedIcon} />}
                            <span className={styles.suggestionText}>{label}</span>
                            {rich && <span className={styles.suggestionMeta}>{suggestionMeta(s)}</span>}
                          </button>
                          {rich && (
                            <button
                              type="button"
                              className={styles.viewButton}
                              aria-label={`عرض ${s.text ?? ''}`.trim()}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => setPreview(s)}
                            >
                              <EyeIcon size={14} />
                              عرض
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {chosen && (
                    <div className={styles.choice}>
                      <Button type="button" variant="primary" size="sm" onClick={() => linkSuggestion(chosen)}>
                        ربطه بهذا الشخص
                      </Button>
                      {chosen.text && (
                        <Button type="button" variant="secondary" size="sm" onClick={() => copyText(chosen)}>
                          نسخ النص فقط
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {!linked && (
          <div className={styles.field}>
            <span className={styles.label}>ملفات</span>
            {(existingFiles.length > 0 || staged.length > 0) && (
              <ul className={styles.fileList}>
                {existingFiles.map((f) => {
                  const isImage = f.mimeType.startsWith('image/');
                  const url = existingUrls[f.id];
                  const removed = deferred && removedIds.includes(f.id);
                  return (
                    <li key={f.id} className={clsx(styles.fileItem, { [styles.fileRemoved]: removed })}>
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
                      {deferred ? (
                        removed ? (
                          <button
                            type="button"
                            className={styles.fileRestore}
                            onClick={() => setRemovedIds((prev) => prev.filter((id) => id !== f.id))}
                          >
                            تراجع
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.fileRemove}
                            aria-label={`حذف ${f.fileName}`}
                            onClick={() => setRemovedIds((prev) => [...prev, f.id])}
                          >
                            <CloseIcon size={14} />
                          </button>
                        )
                      ) : confirmDeleteFileId === f.id ? (
                        <span className={styles.fileConfirm}>
                          <span className={styles.fileConfirmText}>لا يمكن التراجع عن حذف الملف.</span>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            loading={deletingFile}
                            onClick={() => void handleDeleteExisting(f.id)}
                          >
                            نعم، احذف الملف
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDeleteFileId(null)} disabled={deletingFile}>
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
        )}

        {showPeople && (
          <div className={styles.peopleLine} role="group" aria-label="مصدر لـ:">
            <span className={styles.label} aria-hidden="true">
              مصدر لـ:
            </span>
            <ul className={styles.chips}>
              <li className={clsx(styles.chip, styles.chipLocked)}>
                {newPerson ? (
                  <span>{NEW_PERSON_LABEL}</span>
                ) : (
                  <>
                    <span>{start ? nameOf(start.id, '') : ''}</span>
                    <span className={styles.chipNote}>· أضفته من صفحته</span>
                  </>
                )}
              </li>
              {shownOthers.map((p) => (
                <li key={p.id} className={styles.chip}>
                  <span>{p.name}</span>
                  <button
                    type="button"
                    className={styles.chipRemove}
                    aria-label={`إزالة ${p.name}`}
                    onClick={() => removePerson(p.id)}
                  >
                    <CloseIcon size={12} />
                  </button>
                </li>
              ))}
              {collapsed && (
                <li>
                  <button type="button" className={styles.textButton} onClick={() => setExpanded(true)}>
                    {othersMoreLabel(others.length - shownOthers.length)} ▾
                  </button>
                </li>
              )}
              <li>
                <button type="button" className={styles.textButton} onClick={() => setPickerOpen(true)}>
                  ＋ أشخاص آخرون
                </button>
              </li>
            </ul>
          </div>
        )}

        {!linked && (
          <SourceVisibilityPicker
            value={visibility}
            onChange={setVisibility}
            isAdmin={isAdmin}
            treeVisibility={treeVisibility}
            hasFiles={hasFiles}
            sharedPeople={{ total, shown: publicShown }}
          />
        )}
      </form>

      {pickerOpen && data && (
        <SourcePeoplePicker
          data={data}
          lockedId={newPerson ? null : (individualId ?? null)}
          newPerson={newPerson}
          initialIds={idsOf(others)}
          onDone={pickPeople}
          onClose={() => setPickerOpen(false)}
          birthPrivacy={birthPrivacy}
        />
      )}

      {preview && (
        <SourcePreview
          workspaceId={workspaceId}
          treeId={treeId}
          sourceId={preview.id}
          onLink={canLink ? () => linkSuggestion(preview) : undefined}
          onBack={() => setPreview(null)}
        />
      )}
    </Modal>
  );
}
