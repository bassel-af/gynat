'use client';

import { useState, useCallback, type FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { PlaceComboBox } from '@/components/ui/PlaceComboBox';
import { Button } from '@/components/ui/Button';
import { getDisplayNameWithNasab } from '@/lib/gedcom/display';
import type { GedcomData } from '@/lib/gedcom/types';
import styles from './IndividualForm.module.css';

export interface IndividualFormData {
  givenName: string;
  surname: string;
  sex: 'M' | 'F' | '';
  birthDate: string;
  birthPlace: string;
  birthPlaceId?: string | null;
  birthDescription: string;
  birthNotes: string;
  birthHijriDate: string;
  deathDate: string;
  deathPlace: string;
  deathPlaceId?: string | null;
  deathDescription: string;
  deathNotes: string;
  deathHijriDate: string;
  kunya: string;
  isDeceased: boolean;
  isPrivate: boolean;
  notes: string;
  /** Set when adding an umm walad spouse (family-level flag, not stored on individual) */
  isUmmWalad?: boolean;
}

interface IndividualFormProps {
  mode: 'create' | 'edit';
  initialData?: Partial<IndividualFormData>;
  onSubmit: (data: IndividualFormData) => Promise<void>;
  onClose: () => void;
  isLoading?: boolean;
  error?: string;
  lockedSex?: 'M' | 'F';
  workspaceId?: string;
  /** When true and mode is 'create', show "link from another workspace" toggle */
  allowBranchLink?: boolean;
  /** Called when user submits a branch link token with a selected person from the branch */
  onBranchLink?: (token: string, selectedPersonId: string, linkChildrenToAnchor?: boolean) => Promise<void>;
  /** The relationship type determined by the form mode (child/sibling/spouse/parent) */
  relationshipType?: 'child' | 'sibling' | 'spouse' | 'parent';
  /** The anchor person's sex (needed for Rule 3 orphaned children detection) */
  anchorSex?: 'M' | 'F' | '';
  /** The anchor person's display name (shown in Rule 3 prompt) */
  anchorName?: string;
  /** Whether the workspace has umm walad feature enabled */
  enableUmmWalad?: boolean;
  /** Whether the workspace has kunya feature enabled */
  enableKunya?: boolean;
  /**
   * When true and mode is 'create' and initialData.isDeceased is undefined,
   * pre-check the deceased checkbox. Workspace setting:
   * Workspace.defaultNewPersonDeceased. Ignored in edit mode and when the caller
   * explicitly seeds initialData.isDeceased.
   */
  defaultDeceased?: boolean;
  /** Whether this form is in addSpouse mode (shows umm walad checkbox) */
  isAddSpouse?: boolean;
  /** In edit mode: the family ID to update isUmmWalad on (signals checkbox should show) */
  ummWaladFamilyId?: string;
  /** In edit mode: the current isUmmWalad value */
  ummWaladInitialValue?: boolean;
  /** In edit mode: whether the family has existing MARC/MARR data (triggers confirmation) */
  ummWaladHasMarriageData?: boolean;
}

const EMPTY_FORM: IndividualFormData = {
  givenName: '',
  surname: '',
  sex: '',
  birthDate: '',
  birthPlace: '',
  birthDescription: '',
  birthNotes: '',
  birthHijriDate: '',
  deathDate: '',
  deathPlace: '',
  deathDescription: '',
  deathNotes: '',
  deathHijriDate: '',
  kunya: '',
  isDeceased: false,
  isPrivate: false,
  notes: '',
};

export function IndividualForm({
  mode,
  initialData,
  onSubmit,
  onClose,
  isLoading = false,
  error,
  lockedSex,
  workspaceId,
  allowBranchLink = false,
  onBranchLink,
  relationshipType,
  anchorSex,
  anchorName,
  enableUmmWalad = false,
  enableKunya = false,
  isAddSpouse = false,
  ummWaladFamilyId,
  ummWaladInitialValue,
  ummWaladHasMarriageData,
  defaultDeceased = false,
}: IndividualFormProps) {
  const [formData, setFormData] = useState<IndividualFormData>(() => {
    const base = { ...EMPTY_FORM, ...initialData };
    if (lockedSex) {
      base.sex = lockedSex;
    }
    // Workspace-level default: pre-check "deceased" for new people only.
    // Edit mode must be untouched, and an explicit initialData.isDeceased always wins.
    if (
      mode === 'create' &&
      defaultDeceased &&
      initialData?.isDeceased === undefined
    ) {
      base.isDeceased = true;
    }
    return base;
  });

  // Umm walad state (relevant in addSpouse mode and edit mode with single family)
  const [isUmmWalad, setIsUmmWalad] = useState(ummWaladInitialValue ?? false);

  // Branch link state
  const [branchLinkMode, setBranchLinkMode] = useState(false);
  const [branchToken, setBranchToken] = useState('');
  const [branchLinkLoading, setBranchLinkLoading] = useState(false);
  const [branchLinkError, setBranchLinkError] = useState('');
  const [branchPreview, setBranchPreview] = useState<{
    sourceWorkspaceNameAr: string;
    rootPersonName: string;
    people: Array<{ id: string; name: string; sex: string }>;
  } | null>(null);
  const [selectedBranchPersonId, setSelectedBranchPersonId] = useState<string | null>(null);
  // Rule 3: orphaned children prompt state
  const [orphanedChildNames, setOrphanedChildNames] = useState<string[]>([]);
  const [linkChildrenToAnchor, setLinkChildrenToAnchor] = useState<boolean | null>(null);
  // Store the full subtree from preview for client-side orphan detection
  const [branchSubtree, setBranchSubtree] = useState<Record<string, unknown> | null>(null);

  const showBranchToggle = allowBranchLink && mode === 'create' && !!onBranchLink;
  const showUmmWaladCheckbox = enableUmmWalad && (
    (isAddSpouse && mode === 'create' && !branchLinkMode) ||
    (mode === 'edit' && !!ummWaladFamilyId)
  );

  const title = branchLinkMode ? 'ربط فرع من مساحة أخرى' : (mode === 'create' ? 'إضافة شخص جديد' : 'تعديل بيانات الشخص');
  const submitLabel = branchLinkMode
    ? (orphanedChildNames.length > 0 ? 'تأكيد الربط' : 'ربط الفرع')
    : (mode === 'create' ? 'إضافة' : 'حفظ');

  const updateField = useCallback(
    <K extends keyof IndividualFormData>(key: K, value: IndividualFormData[K]) => {
      setFormData((prev) => {
        const next = { ...prev, [key]: value };
        // Auto-check isDeceased when a death date is entered
        if (key === 'deathDate' && typeof value === 'string' && value.trim()) {
          next.isDeceased = true;
        }
        return next;
      });
    },
    [],
  );

  // Client-side orphaned children detection from the preview subtree
  const detectOrphans = useCallback((personId: string) => {
    if (!branchSubtree || relationshipType !== 'spouse' || !anchorSex) {
      setOrphanedChildNames([]);
      setLinkChildrenToAnchor(null);
      return;
    }
    const individuals = (branchSubtree.individuals || {}) as Record<string, Record<string, unknown>>;
    const families = (branchSubtree.families || {}) as Record<string, Record<string, unknown>>;
    const person = individuals[personId];
    if (!person) { setOrphanedChildNames([]); setLinkChildrenToAnchor(null); return; }

    const parentRole = anchorSex === 'M' ? 'husband' : 'wife';
    const names: string[] = [];
    const spouseFamilies = (person.familiesAsSpouse || []) as string[];
    for (const famId of spouseFamilies) {
      const fam = families[famId];
      if (!fam || fam[parentRole] !== null) continue;
      const children = (fam.children || []) as string[];
      for (const childId of children) {
        const child = individuals[childId];
        if (child) {
          names.push(
            [child.givenName, child.surname].filter(Boolean).join(' ') as string || (child.name as string) || 'غير معروف'
          );
        }
      }
    }
    setOrphanedChildNames(names);
    if (names.length === 0) setLinkChildrenToAnchor(null);
  }, [branchSubtree, relationshipType, anchorSex]);

  const handleValidateToken = useCallback(async () => {
    if (!workspaceId || !branchToken.trim()) return;
    setBranchLinkLoading(true);
    setBranchLinkError('');
    try {
      const { apiFetch } = await import('@/lib/api/client');
      const res = await apiFetch(`/api/workspaces/${workspaceId}/share-tokens/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: branchToken.trim() }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'رمز غير صالح');
      }
      const body = await res.json();
      const subtree = body.data.subtree || {};
      const subtreeAsGedcom = subtree as GedcomData;
      const people = Object.values(subtreeAsGedcom.individuals || {}).map((ind) => ({
        id: ind.id,
        name: getDisplayNameWithNasab(subtreeAsGedcom, ind, 2),
        sex: ind.sex || '',
      }));
      setBranchPreview({
        sourceWorkspaceNameAr: body.data.sourceWorkspaceNameAr || '',
        rootPersonName: body.data.rootPersonName || '',
        people,
      });
      setBranchSubtree(subtree);
      setSelectedBranchPersonId(null);
      setOrphanedChildNames([]);
      setLinkChildrenToAnchor(null);
    } catch (err) {
      setBranchLinkError(err instanceof Error ? err.message : 'حدث خطأ');
      setBranchPreview(null);
    } finally {
      setBranchLinkLoading(false);
    }
  }, [workspaceId, branchToken]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (branchLinkMode && onBranchLink) {
        if (!selectedBranchPersonId) {
          setBranchLinkError('اختر الشخص المراد ربطه');
          return;
        }
        // Rule 3: require radio selection when orphaned children detected
        if (orphanedChildNames.length > 0 && linkChildrenToAnchor === null) {
          setBranchLinkError('يجب تحديد علاقة الأبناء قبل الربط');
          return;
        }
        setBranchLinkLoading(true);
        setBranchLinkError('');
        try {
          await onBranchLink(branchToken.trim(), selectedBranchPersonId, linkChildrenToAnchor === true ? true : undefined);
        } catch (err) {
          setBranchLinkError(err instanceof Error ? err.message : 'حدث خطأ');
        } finally {
          setBranchLinkLoading(false);
        }
        return;
      }
      const submitData = showUmmWaladCheckbox ? { ...formData, isUmmWalad } : formData;
      await onSubmit(submitData);
    },
    [formData, onSubmit, branchLinkMode, onBranchLink, branchToken, selectedBranchPersonId, orphanedChildNames, linkChildrenToAnchor, isUmmWalad, showUmmWaladCheckbox],
  );

  const effectiveLoading = branchLinkMode ? branchLinkLoading : isLoading;
  const branchLinkDisabled = branchLinkMode && (!branchToken.trim() || !selectedBranchPersonId);
  const sexMissing = !branchLinkMode && !formData.sex;
  const givenNameMissing = !branchLinkMode && mode === 'create' && !formData.givenName.trim();

  const actions = (
    <>
      <Button variant="ghost" size="md" onClick={onClose} disabled={effectiveLoading}>
        إلغاء
      </Button>
      <Button
        variant="primary"
        size="md"
        type="submit"
        form="individual-form"
        loading={effectiveLoading}
        disabled={effectiveLoading || (branchLinkMode ? branchLinkDisabled : (givenNameMissing || sexMissing))}
      >
        {submitLabel}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      actions={actions}
      className={styles.modal}
    >
      <form
        id="individual-form"
        className={styles.form}
        onSubmit={handleSubmit}
      >
        {error && <div className={styles.error}>{error}</div>}
        {branchLinkError && <div className={styles.error}>{branchLinkError}</div>}

        {showBranchToggle && (
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={branchLinkMode}
              onChange={(e) => {
                setBranchLinkMode(e.target.checked);
                setBranchLinkError('');
                setBranchPreview(null);
              }}
              className={styles.checkbox}
            />
            ربط من مساحة أخرى
          </label>
        )}

        {branchLinkMode ? (
          <>
            <div className={styles.fieldGroup}>
              <label htmlFor="branchToken" className={styles.label}>رمز المشاركة</label>
              <div className={styles.row}>
                <Input
                  id="branchToken"
                  label=""
                  value={branchToken}
                  onChange={(e) => { setBranchToken(e.target.value); setBranchPreview(null); }}
                  placeholder="brsh_..."
                  dir="ltr"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="md"
                  type="button"
                  onClick={handleValidateToken}
                  disabled={!branchToken.trim() || branchLinkLoading}
                  loading={branchLinkLoading && !branchPreview}
                >
                  تحقق
                </Button>
              </div>
            </div>
            {branchPreview && (
              <div className={styles.branchPreviewCard}>
                <div className={styles.branchPreviewLabel}>معلومات الفرع</div>
                {branchPreview.sourceWorkspaceNameAr && (
                  <div className={styles.branchPreviewRow}>
                    <span className={styles.branchPreviewKey}>المصدر:</span>
                    <span>{branchPreview.sourceWorkspaceNameAr}</span>
                  </div>
                )}
                <div className={styles.branchPreviewRow}>
                  <span className={styles.branchPreviewKey}>عدد الأشخاص:</span>
                  <span>{branchPreview.people.length}</span>
                </div>
                <div className={styles.fieldGroup} style={{ marginTop: 'var(--space-3)' }}>
                  <label className={styles.label}>اختر الشخص المراد ربطه</label>
                  <div className={styles.branchPersonList}>
                    {branchPreview.people.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`${styles.branchPersonItem} ${selectedBranchPersonId === p.id ? styles.branchPersonItemSelected : ''}`}
                        onClick={() => { setSelectedBranchPersonId(p.id); detectOrphans(p.id); }}
                      >
                        <span className={p.sex === 'M' ? styles.branchPersonMale : p.sex === 'F' ? styles.branchPersonFemale : ''}>{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Rule 3: orphaned children prompt */}
                {selectedBranchPersonId && orphanedChildNames.length > 0 && (
                  <div className={styles.childrenPromptCard}>
                    <div className={styles.branchPreviewLabel}>تأكيد علاقة الأبناء</div>
                    <div className={styles.childrenPromptText}>
                      الأبناء التالية أسماؤهم ليس لديهم {anchorSex === 'M' ? 'أب' : 'أم'} في الفرع المشارَك:
                    </div>
                    <ul className={styles.childrenList}>
                      {orphanedChildNames.slice(0, 5).map((name, i) => (
                        <li key={i}>{name}</li>
                      ))}
                      {orphanedChildNames.length > 5 && (
                        <li className={styles.childrenMore}>و{orphanedChildNames.length - 5} آخرون</li>
                      )}
                    </ul>
                    <div className={styles.childrenPromptText}>
                      هل {anchorName || ''} هو {anchorSex === 'M' ? 'أبوهم' : 'أمهم'}؟
                    </div>
                    <div className={styles.radioGroup} role="radiogroup" aria-label="علاقة الأبناء">
                      <label className={styles.radioLabel}>
                        <input
                          type="radio"
                          name="linkChildren"
                          checked={linkChildrenToAnchor === true}
                          onChange={() => setLinkChildrenToAnchor(true)}
                          className={styles.radioInput}
                        />
                        نعم، هو {anchorSex === 'M' ? 'أبوهم' : 'أمهم'}
                      </label>
                      <label className={styles.radioLabel}>
                        <input
                          type="radio"
                          name="linkChildren"
                          checked={linkChildrenToAnchor === false}
                          onChange={() => setLinkChildrenToAnchor(false)}
                          className={styles.radioInput}
                        />
                        لا، ليس {anchorSex === 'M' ? 'أبوهم' : 'أمهم'}
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
        <>

        {/* Name fields */}
        <div className={styles.row}>
          <Input
            id="givenName"
            label="الاسم الأول"
            value={formData.givenName}
            onChange={(e) => updateField('givenName', e.target.value)}
            placeholder="مثال: أحمد"
            required={mode === 'create'}
            autoFocus
          />
          <Input
            id="surname"
            label="اسم العائلة"
            value={formData.surname}
            onChange={(e) => updateField('surname', e.target.value)}
            placeholder="مثال: السعيّد"
          />
        </div>

        {/* Kunya */}
        {enableKunya && (
          <Input
            id="kunya"
            label="الكنية"
            value={formData.kunya}
            onChange={(e) => updateField('kunya', e.target.value)}
            placeholder="مثال: أبو أحمد"
          />
        )}

        {/* Sex */}
        <div className={styles.fieldGroup}>
          <span className={`${styles.label} ${styles.required}`}>الجنس</span>
          <div className={styles.radioGroup} role="radiogroup" aria-label="الجنس">
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="sex"
                value="M"
                checked={formData.sex === 'M'}
                onChange={() => updateField('sex', 'M')}
                className={styles.radioInput}
                disabled={!!lockedSex}
                aria-label="ذكر"
              />
              ذكر
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="sex"
                value="F"
                checked={formData.sex === 'F'}
                onChange={() => updateField('sex', 'F')}
                className={styles.radioInput}
                disabled={!!lockedSex}
                aria-label="أنثى"
              />
              أنثى
            </label>
          </div>
        </div>

        {showUmmWaladCheckbox && (
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={isUmmWalad}
              onChange={(e) => {
                const checked = e.target.checked;
                if (checked && ummWaladHasMarriageData) {
                  const ok = window.confirm('تفعيل أم ولد سيحذف بيانات عقد القران والزفاف. هل تريد المتابعة؟');
                  if (!ok) return;
                }
                setIsUmmWalad(checked);
              }}
              className={styles.checkbox}
              aria-label="أم ولد"
            />
            أم ولد
          </label>
        )}

        <hr className={styles.sectionDivider} />

        {/* Birth info */}
        <span className={styles.sectionLabel}>بيانات الميلاد</span>
        <div className={styles.row}>
          <Input
            id="birthDate"
            label="تاريخ الميلاد"
            value={formData.birthDate}
            onChange={(e) => updateField('birthDate', e.target.value)}
            placeholder="مثال: 1950 أو 15/3/1950"
          />
          {workspaceId ? (
            <PlaceComboBox
              id="birthPlace"
              label="مكان الميلاد"
              value={formData.birthPlace}

              onChange={(val, pid) => {
                updateField('birthPlace', val);
                updateField('birthPlaceId', pid);
              }}
              workspaceId={workspaceId}
              placeholder="مثال: مكة المكرمة"
            />
          ) : (
            <Input
              id="birthPlace"
              label="مكان الميلاد"
              value={formData.birthPlace}
              onChange={(e) => updateField('birthPlace', e.target.value)}
              placeholder="مثال: مكة المكرمة"
            />
          )}
        </div>
        <Input
          id="birthDescription"
          label="وصف الميلاد"
          value={formData.birthDescription}
          onChange={(e) => updateField('birthDescription', e.target.value)}
          placeholder="مثال: ولادة طبيعية في المنزل"
        />
        <div className={styles.fieldGroup}>
          <label htmlFor="birthNotes" className={styles.label}>ملاحظات الميلاد</label>
          <textarea
            id="birthNotes"
            className={styles.textarea}
            value={formData.birthNotes}
            onChange={(e) => updateField('birthNotes', e.target.value)}
            placeholder="مثال: ولد في عاصفة ثلجية"
            maxLength={2000}
            rows={2}
          />
        </div>
        <div className={styles.hijriFieldAccented}>
          <Input
            id="birthHijriDate"
            label="التاريخ الهجري للميلاد"
            value={formData.birthHijriDate}
            onChange={(e) => updateField('birthHijriDate', e.target.value)}
            placeholder="مثال: 5 رمضان 1370"
          />
        </div>

        {/* Death info */}
        <span className={styles.sectionLabel}>بيانات الوفاة</span>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={formData.isDeceased}
            onChange={(e) => updateField('isDeceased', e.target.checked)}
            className={styles.checkbox}
          />
          متوفى/متوفية
        </label>
        {formData.isDeceased && (
          <>
            <div className={styles.row}>
              <Input
                id="deathDate"
                label="تاريخ الوفاة"
                value={formData.deathDate}
                onChange={(e) => updateField('deathDate', e.target.value)}
                placeholder="مثال: 2020"
              />
              {workspaceId ? (
                <PlaceComboBox
                  id="deathPlace"
                  label="مكان الوفاة"
                  value={formData.deathPlace}

                  onChange={(val, pid) => {
                    updateField('deathPlace', val);
                    updateField('deathPlaceId', pid);
                  }}
                  workspaceId={workspaceId}
                  placeholder="مثال: المدينة المنورة"
                />
              ) : (
                <Input
                  id="deathPlace"
                  label="مكان الوفاة"
                  value={formData.deathPlace}
                  onChange={(e) => updateField('deathPlace', e.target.value)}
                  placeholder="مثال: المدينة المنورة"
                />
              )}
            </div>
            <Input
              id="deathDescription"
              label="سبب الوفاة"
              value={formData.deathDescription}
              onChange={(e) => updateField('deathDescription', e.target.value)}
              placeholder="مثال: نوبة قلبية"
            />
            <div className={styles.fieldGroup}>
              <label htmlFor="deathNotes" className={styles.label}>ملاحظات الوفاة</label>
              <textarea
                id="deathNotes"
                className={styles.textarea}
                value={formData.deathNotes}
                onChange={(e) => updateField('deathNotes', e.target.value)}
                placeholder="مثال: توفي بسلام في منزله"
                maxLength={2000}
                rows={2}
              />
            </div>
            <div className={styles.hijriFieldAccented}>
              <Input
                id="deathHijriDate"
                label="التاريخ الهجري للوفاة"
                value={formData.deathHijriDate}
                onChange={(e) => updateField('deathHijriDate', e.target.value)}
                placeholder="مثال: 15 محرم 1442"
              />
            </div>
          </>
        )}

        <hr className={styles.sectionDivider} />

        {/* Privacy */}
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={formData.isPrivate}
            onChange={(e) => updateField('isPrivate', e.target.checked)}
            className={styles.checkbox}
          />
          إخفاء المعلومات الشخصية
        </label>

        {/* Notes */}
        <div className={styles.fieldGroup}>
          <label htmlFor="notes" className={styles.label}>ملاحظات</label>
          <textarea
            id="notes"
            className={styles.textarea}
            value={formData.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder="أضف ملاحظات عن هذا الشخص..."
            maxLength={5000}
            rows={3}
          />
        </div>

        </>
        )}
      </form>
    </Modal>
  );
}
