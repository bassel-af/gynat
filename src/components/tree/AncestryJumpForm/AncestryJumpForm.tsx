'use client';

import { useCallback, useMemo, useState, type FormEvent } from 'react';
import type { GedcomData, Individual } from '@/lib/gedcom/types';
import { getDisplayNameWithNasab, JUMP_CONNECTOR, DEFAULT_NASAB_DEPTH } from '@/lib/gedcom/display';
import { getAllDescendants } from '@/lib/gedcom/graph';
import { getFamiliesForPicker } from '@/lib/person-detail-helpers';
import type { AncestryJumpFields, AncestryJumpSubmitPayload } from '@/hooks/usePersonActions';
import { IndividualForm, type IndividualFormData } from '@/components/tree/IndividualForm/IndividualForm';
import { FamilyPickerModal } from '@/components/tree/FamilyPickerModal/FamilyPickerModal';
import { IndividualPicker } from '@/components/ui/IndividualPicker';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import styles from './AncestryJumpForm.module.css';

// ---------------------------------------------------------------------------
// «قفزة نسب» — the two-path sheet (spec §10.4).
//
// The link always lands on a FAMILY, so the sheet's whole job is to produce one
// of three sources — a brand-new ancestor, an existing person (whose couple is
// picked, or minted for him when he has none), or an existing couple outright —
// and then the optional generation range and notes.
//
// The range is genuinely optional in both bounds: "we do not know" is the
// honest default, and the label never claims the skipped names are unknown —
// a user may simply not want them in his tree.
// ---------------------------------------------------------------------------

export interface AncestryJumpInitialData {
  generationsMin: number | null;
  generationsMax: number | null;
  notes: string;
}

export interface AncestryJumpFormProps {
  mode: 'create' | 'edit';
  person: Individual;
  data: GedcomData;
  initialData?: AncestryJumpInitialData;
  /** Create mode: the source the user chose, plus the range and notes. */
  onSubmit: (payload: AncestryJumpSubmitPayload) => Promise<void>;
  /**
   * Edit mode: the range and notes only. Neither endpoint of an existing jump
   * can move — re-pointing is delete + create, which keeps the one-per-person
   * and no-cycle invariants trivially checkable.
   */
  onUpdate?: (fields: AncestryJumpFields) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string;
  workspaceId?: string;
  enableKunya?: boolean;
  defaultDeceased?: boolean;
}

/** What the details step will submit once the user confirms. */
type ChosenSource =
  | { kind: 'newPerson'; individual: IndividualFormData; name: string }
  | { kind: 'existingPerson'; ancestorPersonId: string; name: string }
  | { kind: 'existingFamily'; ancestorFamilyId: string; name: string };

type Step = 'path' | 'newPerson' | 'existingPerson' | 'familyPicker' | 'details';

/** Empty string ⇒ unstated (null). Never coerce a blank box to 0. */
function parseBound(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function AncestryJumpForm({
  mode,
  person,
  data,
  initialData,
  onSubmit,
  onUpdate,
  onDelete,
  onCancel,
  isLoading = false,
  error,
  workspaceId,
  enableKunya,
  defaultDeceased,
}: AncestryJumpFormProps) {
  const [step, setStep] = useState<Step>(mode === 'edit' ? 'details' : 'path');
  const [chosen, setChosen] = useState<ChosenSource | null>(null);
  const [pendingPersonId, setPendingPersonId] = useState<string | null>(null);
  const [min, setMin] = useState(initialData?.generationsMin != null ? String(initialData.generationsMin) : '');
  const [max, setMax] = useState(initialData?.generationsMax != null ? String(initialData.generationsMax) : '');
  const [notes, setNotes] = useState(initialData?.notes ?? '');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  /**
   * Anyone reachable DOWNWARD from this person can never be his distant
   * ancestor — that is validator rule J8 (cycle), applied here so the picker
   * simply does not offer an impossible choice. Himself included (J7).
   */
  const excluded = useMemo(() => {
    const set = getAllDescendants(data, person.id, { includeJumps: true });
    set.add(person.id);
    return set;
  }, [data, person.id]);

  const pendingFamilies = useMemo(() => {
    if (!pendingPersonId) return [];
    const candidate = data.individuals[pendingPersonId];
    return candidate ? getFamiliesForPicker(candidate, data) : [];
  }, [pendingPersonId, data]);

  const handlePickPerson = useCallback((id: string | null) => {
    if (!id) return;
    const candidate = data.individuals[id];
    if (!candidate) return;
    const name = candidate.givenName || candidate.name;
    setPendingPersonId(id);
    // Ask which couple only when there IS a choice to make; an ancestor with no
    // family at all gets a one-spouse couple minted for him, silently.
    if (getFamiliesForPicker(candidate, data).length > 0) {
      setStep('familyPicker');
    } else {
      setChosen({ kind: 'existingPerson', ancestorPersonId: id, name });
      setStep('details');
    }
  }, [data]);

  const handlePickFamily = useCallback((familyId: string) => {
    const candidate = pendingPersonId ? data.individuals[pendingPersonId] : undefined;
    setChosen({
      kind: 'existingFamily',
      ancestorFamilyId: familyId,
      name: candidate?.givenName || candidate?.name || '',
    });
    setStep('details');
  }, [pendingPersonId, data]);

  const handleNewPerson = useCallback(async (formData: IndividualFormData) => {
    setChosen({ kind: 'newPerson', individual: formData, name: formData.givenName });
    setStep('details');
  }, []);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    const fields = {
      generationsMin: parseBound(min),
      generationsMax: parseBound(max),
      notes,
    };
    if (mode === 'edit') {
      await onUpdate?.(fields);
      return;
    }
    if (!chosen) return;
    if (chosen.kind === 'newPerson') {
      await onSubmit({ source: 'newPerson', individual: chosen.individual, ...fields });
    } else if (chosen.kind === 'existingPerson') {
      await onSubmit({ source: 'existingPerson', ancestorPersonId: chosen.ancestorPersonId, ...fields });
    } else {
      await onSubmit({ source: 'existingFamily', ancestorFamilyId: chosen.ancestorFamilyId, ...fields });
    }
  }, [mode, chosen, min, max, notes, onSubmit, onUpdate]);

  const title = mode === 'edit' ? 'تعديل قفزة النسب' : 'قفزة نسب';

  // -------------------------------------------------------------------------
  // Step: pick the ancestor by creating him
  // -------------------------------------------------------------------------
  if (step === 'newPerson') {
    // NO surname prefill, deliberately. Every other create mode seeds the
    // patrilineal family name, but a «قفزة نسب» ancestor belongs to a DIFFERENT
    // house — that is the whole point of the surname freeze in the nasab walk
    // (spec §5.3): عدنان's line must never be stamped with إسماعيل's family
    // name, nor إسماعيل with عدنان's. The field starts blank.
    return (
      <IndividualForm
        mode="create"
        onSubmit={handleNewPerson}
        onClose={() => setStep('path')}
        relationshipType="parent"
        anchorSex={person.sex || ''}
        anchorName={getDisplayNameWithNasab(data, person, DEFAULT_NASAB_DEPTH)}
        workspaceId={workspaceId}
        enableKunya={enableKunya}
        defaultDeceased={defaultDeceased}
      />
    );
  }

  // -------------------------------------------------------------------------
  // Step: which of this ancestor's couples?
  // -------------------------------------------------------------------------
  if (step === 'familyPicker') {
    return (
      <FamilyPickerModal
        isOpen
        onClose={() => { setPendingPersonId(null); setStep('existingPerson'); }}
        onSelect={handlePickFamily}
        families={pendingFamilies}
      />
    );
  }

  // -------------------------------------------------------------------------
  // Step: choose a path
  // -------------------------------------------------------------------------
  if (step === 'path') {
    return (
      <Modal isOpen onClose={onCancel} title={title} className={styles.modal}>
        <p className={styles.lead}>
          اربط {getDisplayNameWithNasab(data, person, DEFAULT_NASAB_DEPTH)} بجدٍّ أعلى تفصل بينهما أجيال غير مسجّلة.
        </p>
        <div className={styles.paths}>
          <button
            type="button"
            className={styles.pathButton}
            aria-label="شخص جديد"
            aria-describedby="ancestry-jump-path-new-hint"
            onClick={() => setStep('newPerson')}
          >
            <span className={styles.pathTitle}>شخص جديد</span>
            <span id="ancestry-jump-path-new-hint" className={styles.pathHint}>
              أضف الجدّ الأعلى إلى الشجرة
            </span>
          </button>
          <button
            type="button"
            className={styles.pathButton}
            aria-label="شخص موجود في الشجرة"
            aria-describedby="ancestry-jump-path-existing-hint"
            onClick={() => setStep('existingPerson')}
          >
            <span className={styles.pathTitle}>شخص موجود في الشجرة</span>
            <span id="ancestry-jump-path-existing-hint" className={styles.pathHint}>
              اختر الجدّ الأعلى من بين أفراد الشجرة
            </span>
          </button>
        </div>
      </Modal>
    );
  }

  // -------------------------------------------------------------------------
  // Step: pick an existing ancestor
  // -------------------------------------------------------------------------
  if (step === 'existingPerson') {
    return (
      <Modal
        isOpen
        onClose={onCancel}
        title={title}
        className={styles.modal}
        actions={<Button variant="ghost" size="md" onClick={() => setStep('path')}>رجوع</Button>}
      >
        <IndividualPicker
          value={null}
          onChange={handlePickPerson}
          data={data}
          label="الجدّ الأعلى"
          exclude={excluded}
        />
      </Modal>
    );
  }

  // -------------------------------------------------------------------------
  // Step: the range, the notes, and what the نسب will read
  // -------------------------------------------------------------------------
  const ancestorName = chosen?.name ?? ancestorNameOfExistingJump(data, person);
  const preview = ancestorName
    ? `${getDisplayNameWithNasab(data, person, DEFAULT_NASAB_DEPTH)}، ${JUMP_CONNECTOR} ${ancestorName}`
    : null;

  const actions = (
    <>
      <Button variant="ghost" size="md" onClick={onCancel} disabled={isLoading}>إلغاء</Button>
      <Button variant="primary" size="md" type="submit" form="ancestry-jump-form" loading={isLoading}>
        حفظ
      </Button>
    </>
  );

  return (
    <Modal isOpen onClose={onCancel} title={title} actions={actions} className={styles.modal}>
      <form id="ancestry-jump-form" className={styles.form} onSubmit={handleSubmit}>
        {error && <div className={styles.error}>{error}</div>}

        {preview && (
          <div className={styles.preview}>
            <span className={styles.previewLabel}>سيصير النسب</span>
            <span className={styles.previewText}>{preview}</span>
          </div>
        )}

        <fieldset className={styles.rangeGroup}>
          <legend className={styles.rangeLegend}>عدد الأجيال بينهما (اختياري)</legend>
          <div className={styles.rangeRow}>
            <div className={styles.rangeField}>
              <label htmlFor="ancestry-jump-min" className={styles.fieldLabel}>من</label>
              <input
                id="ancestry-jump-min"
                className={styles.numberInput}
                type="number"
                inputMode="numeric"
                min={1}
                max={200}
                value={min}
                onChange={(e) => setMin(e.target.value)}
              />
            </div>
            <div className={styles.rangeField}>
              <label htmlFor="ancestry-jump-max" className={styles.fieldLabel}>إلى</label>
              <input
                id="ancestry-jump-max"
                className={styles.numberInput}
                type="number"
                inputMode="numeric"
                min={1}
                max={200}
                value={max}
                onChange={(e) => setMax(e.target.value)}
              />
            </div>
          </div>
          <p className={styles.rangeHint}>اتركه فارغاً إن لم يكن العدد معروفاً.</p>
        </fieldset>

        <div className={styles.fieldGroup}>
          <label htmlFor="ancestry-jump-notes" className={styles.fieldLabel}>ملاحظات</label>
          <textarea
            id="ancestry-jump-notes"
            className={styles.textarea}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="مثال: قيل سبعة، وقيل ثلاثون، وقيل أربعون."
            maxLength={5000}
            rows={3}
          />
        </div>

        {mode === 'edit' && onDelete && (
          <div className={styles.deleteSection}>
            {!deleteConfirm ? (
              <button type="button" className={styles.deleteButton} onClick={() => setDeleteConfirm(true)}>
                حذف قفزة النسب
              </button>
            ) : (
              <div className={styles.deleteConfirm}>
                <span className={styles.deleteConfirmText}>
                  يُحذف الرابط وحده؛ يبقى الجدّ وأسرته في الشجرة كما هما.
                </span>
                <div className={styles.deleteConfirmActions}>
                  <Button variant="danger" size="sm" loading={isLoading} onClick={onDelete}>
                    نعم، احذف
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(false)} disabled={isLoading}>
                    إلغاء
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}

/** In edit mode the ancestor is whoever the existing jump already names. */
function ancestorNameOfExistingJump(data: GedcomData, person: Individual): string | null {
  const jumpId = person.ancestryJumpAsDescendant;
  const jump = jumpId ? data.ancestryJumps?.[jumpId] : undefined;
  if (!jump) return null;
  const family = data.families[jump.ancestorFamily];
  const spouseId = family?.husband ?? family?.wife ?? null;
  const spouse = spouseId ? data.individuals[spouseId] : undefined;
  return spouse ? spouse.givenName || spouse.name : null;
}
