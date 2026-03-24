'use client';

import clsx from 'clsx';
import { useMemo, useState, useCallback } from 'react';
import { useTree } from '@/context/TreeContext';
import { useWorkspaceTree } from '@/context/WorkspaceTreeContext';
import { getDisplayName, getPersonRelationships } from '@/lib/gedcom';
import type { Individual } from '@/lib/gedcom';
import { IndividualForm, type IndividualFormData } from '@/components/tree/IndividualForm/IndividualForm';
import { FamilyPickerModal } from '@/components/tree/FamilyPickerModal/FamilyPickerModal';
import { apiFetch } from '@/lib/api/client';
import {
  formatDateWithPlace,
  getDeceasedLabel,
  needsFamilyPickerForAddChild,
  validateAddParent,
  canMoveChild,
  getAlternativeFamilies,
  buildEditInitialData,
  getFamiliesForPicker,
} from '@/lib/person-detail-helpers';
import type { AddParentResult } from '@/lib/person-detail-helpers';
import styles from './PersonDetail.module.css';

// ---------------------------------------------------------------------------
// Optional context hook — returns null when WorkspaceTreeContext is absent
// (e.g. legacy static GEDCOM tree view)
// ---------------------------------------------------------------------------

function useOptionalWorkspaceTree() {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useWorkspaceTree();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Types for the form modal state machine
// ---------------------------------------------------------------------------

type FormMode =
  | { kind: 'edit' }
  | { kind: 'addChild'; targetFamilyId?: string }
  | { kind: 'addSpouse' }
  | { kind: 'addParent'; lockedSex?: 'M' | 'F' };

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DateInfo({ person, className, compact }: { person: Individual; className?: string; compact?: boolean }) {
  const birthDisplay = compact ? person.birth : formatDateWithPlace(person.birth, person.birthPlace);
  const deathDisplay = compact ? person.death : formatDateWithPlace(person.death, person.deathPlace);
  const deceasedLabel = getDeceasedLabel(person);

  if (!birthDisplay && !deathDisplay && !deceasedLabel) return null;

  return (
    <span className={className}>
      {birthDisplay && (
        <span>
          الميلاد: {birthDisplay}
        </span>
      )}
      {!compact && person.birthNotes && (
        <span className={styles.eventNote}>{person.birthNotes}</span>
      )}
      {deathDisplay && (
        <span>
          الوفاة: {deathDisplay}
        </span>
      )}
      {!compact && person.deathNotes && (
        <span className={styles.eventNote}>{person.deathNotes}</span>
      )}
      {deceasedLabel && !deathDisplay && (
        <span className={styles.deceasedLabel}>{deceasedLabel}</span>
      )}
    </span>
  );
}

interface RelationshipSectionProps {
  title: string;
  people: Individual[];
  visiblePersonIds: Set<string>;
  onPersonClick: (id: string) => void;
  /** If true, non-visible people are hidden and replaced with a single "خارج النطاق" label */
  hideNonVisible?: boolean;
}

function RelationshipSection({ title, people, visiblePersonIds, onPersonClick, hideNonVisible }: RelationshipSectionProps) {
  if (people.length === 0) return null;

  const visiblePeople = hideNonVisible
    ? people.filter((p) => visiblePersonIds.has(p.id))
    : people;
  const hasHiddenPeople = hideNonVisible && visiblePeople.length < people.length;

  return (
    <div>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {visiblePeople.map((person) => {
        const isVisible = visiblePersonIds.has(person.id);
        const name = getDisplayName(person);

        if (isVisible) {
          return (
            <button
              key={person.id}
              className={clsx(styles.relPersonClickable, {
                [styles.male]: person.sex === 'M',
                [styles.female]: person.sex === 'F',
                [styles.deceased]: person.isDeceased,
              })}
              onClick={() => onPersonClick(person.id)}
            >
              <div className={styles.relPersonInfo}>
                <span className={styles.relPersonName}>{name}</span>
                <DateInfo person={person} className={styles.relPersonDates} compact />
              </div>
              <svg className={styles.relChevron} width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          );
        }

        return (
          <span
            key={person.id}
            className={clsx(styles.relPersonStatic, {
              [styles.male]: person.sex === 'M',
              [styles.female]: person.sex === 'F',
              [styles.deceased]: person.isDeceased,
            })}
          >
            <div className={styles.relPersonInfo}>
              <span className={styles.relPersonName}>{name}</span>
              <DateInfo person={person} className={styles.relPersonDates} compact />
            </div>
          </span>
        );
      })}
      {hasHiddenPeople && (
        <div className={styles.outOfScope}>خارج النطاق</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PersonDetail
// ---------------------------------------------------------------------------

interface PersonDetailProps {
  personId: string;
}

export function PersonDetail({ personId }: PersonDetailProps) {
  const {
    data,
    visiblePersonIds,
    setSelectedPersonId,
    setFocusPersonId,
    setHighlightedPersonId,
  } = useTree();

  const workspace = useOptionalWorkspaceTree();
  const canEdit = workspace?.canEdit ?? false;

  // Form modal state
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Family picker state
  const [familyPickerMode, setFamilyPickerMode] = useState<'addChild' | 'moveChild' | null>(null);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const person = data?.individuals[personId];
  const relationships = useMemo(() => {
    if (!data) return null;
    return getPersonRelationships(data, personId);
  }, [data, personId]);

  // -------------------------------------------------------------------------
  // Navigation handlers
  // -------------------------------------------------------------------------

  const handleBack = useCallback(() => {
    setSelectedPersonId(null);
  }, [setSelectedPersonId]);

  const handlePersonClick = useCallback((id: string) => {
    setSelectedPersonId(id);
    setFocusPersonId(id);
    setHighlightedPersonId(id);
  }, [setSelectedPersonId, setFocusPersonId, setHighlightedPersonId]);

  const handleFocusInTree = useCallback(() => {
    setFocusPersonId(personId);
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      setSelectedPersonId(null);
    }
  }, [personId, setFocusPersonId, setSelectedPersonId]);

  // -------------------------------------------------------------------------
  // API helpers
  // -------------------------------------------------------------------------

  const createIndividual = useCallback(async (formData: IndividualFormData) => {
    if (!workspace) throw new Error('No workspace context');
    const res = await apiFetch(`/api/workspaces/${workspace.workspaceId}/tree/individuals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        givenName: formData.givenName || undefined,
        surname: formData.surname || undefined,
        sex: formData.sex || undefined,
        birthDate: formData.birthDate || undefined,
        birthPlace: formData.birthPlace || undefined,
        birthNotes: formData.birthNotes || undefined,
        deathDate: formData.deathDate || undefined,
        deathPlace: formData.deathPlace || undefined,
        deathNotes: formData.deathNotes || undefined,
        isDeceased: formData.isDeceased,
        isPrivate: formData.isPrivate,
        notes: formData.notes || undefined,
      }),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error ?? 'حدث خطأ');
    }
    const json = await res.json();
    return json.data as { id: string };
  }, [workspace]);

  const createFamily = useCallback(async (opts: { husbandId?: string; wifeId?: string; childrenIds?: string[] }) => {
    if (!workspace) throw new Error('No workspace context');
    const res = await apiFetch(`/api/workspaces/${workspace.workspaceId}/tree/families`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error ?? 'حدث خطأ');
    }
    const json = await res.json();
    return json.data as { id: string };
  }, [workspace]);

  const addChildToFamily = useCallback(async (familyId: string, individualId: string) => {
    if (!workspace) throw new Error('No workspace context');
    const res = await apiFetch(`/api/workspaces/${workspace.workspaceId}/tree/families/${familyId}/children`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ individualId }),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error ?? 'حدث خطأ');
    }
  }, [workspace]);

  const patchFamily = useCallback(async (familyId: string, patch: { husbandId?: string | null; wifeId?: string | null }) => {
    if (!workspace) throw new Error('No workspace context');
    const res = await apiFetch(`/api/workspaces/${workspace.workspaceId}/tree/families/${familyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error ?? 'حدث خطأ');
    }
  }, [workspace]);

  const moveChild = useCallback(async (targetFamilyId: string) => {
    if (!workspace || !person?.familyAsChild) return;
    setFormLoading(true);
    try {
      const res = await apiFetch(
        `/api/workspaces/${workspace.workspaceId}/tree/families/${person.familyAsChild}/children/${personId}/move`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetFamilyId }),
        },
      );
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'حدث خطأ');
      }
      setFamilyPickerMode(null);
      await workspace.refreshTree();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setFormLoading(false);
    }
  }, [workspace, person, personId]);

  // -------------------------------------------------------------------------
  // Form submit handlers
  // -------------------------------------------------------------------------

  const handleEditSubmit = useCallback(async (formData: IndividualFormData) => {
    if (!workspace) return;
    setFormLoading(true);
    setFormError('');
    try {
      const res = await apiFetch(`/api/workspaces/${workspace.workspaceId}/tree/individuals/${personId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          givenName: formData.givenName || undefined,
          surname: formData.surname || undefined,
          sex: formData.sex || undefined,
          birthDate: formData.birthDate || undefined,
          birthPlace: formData.birthPlace || undefined,
          birthNotes: formData.birthNotes || undefined,
          deathDate: formData.deathDate || undefined,
          deathPlace: formData.deathPlace || undefined,
          deathNotes: formData.deathNotes || undefined,
          isDeceased: formData.isDeceased,
          isPrivate: formData.isPrivate,
          notes: formData.notes || undefined,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'حدث خطأ');
      }
      setFormMode(null);
      await workspace.refreshTree();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setFormLoading(false);
    }
  }, [workspace, personId]);

  const handleAddChildSubmit = useCallback(async (formData: IndividualFormData) => {
    if (!workspace || !person || !data) return;
    setFormLoading(true);
    setFormError('');
    try {
      const newPerson = await createIndividual(formData);

      // Use the target family from the form mode, or the first family
      const targetFamilyId = formMode?.kind === 'addChild' ? formMode.targetFamilyId : undefined;

      if (targetFamilyId) {
        await addChildToFamily(targetFamilyId, newPerson.id);
      } else if (person.familiesAsSpouse.length > 0) {
        const familyId = person.familiesAsSpouse[0];
        await addChildToFamily(familyId, newPerson.id);
      } else {
        // No family exists — create one with current person as spouse and new person as child
        const familyOpts: { husbandId?: string; wifeId?: string; childrenIds: string[] } = {
          childrenIds: [newPerson.id],
        };
        if (person.sex === 'F') {
          familyOpts.wifeId = personId;
        } else {
          familyOpts.husbandId = personId;
        }
        await createFamily(familyOpts);
      }

      setFormMode(null);
      await workspace.refreshTree();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setFormLoading(false);
    }
  }, [workspace, person, data, personId, formMode, createIndividual, addChildToFamily, createFamily]);

  const handleAddSpouseSubmit = useCallback(async (formData: IndividualFormData) => {
    if (!workspace || !person) return;
    setFormLoading(true);
    setFormError('');
    try {
      const newPerson = await createIndividual(formData);

      // Create family with both spouses
      const familyOpts: { husbandId?: string; wifeId?: string } = {};
      if (person.sex === 'F') {
        familyOpts.wifeId = personId;
        familyOpts.husbandId = newPerson.id;
      } else {
        familyOpts.husbandId = personId;
        familyOpts.wifeId = newPerson.id;
      }
      await createFamily(familyOpts);

      setFormMode(null);
      await workspace.refreshTree();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setFormLoading(false);
    }
  }, [workspace, person, personId, createIndividual, createFamily]);

  const handleAddParentSubmit = useCallback(async (formData: IndividualFormData) => {
    if (!workspace || !person || !data) return;
    setFormLoading(true);
    setFormError('');
    try {
      const newPerson = await createIndividual(formData);
      const newSex = formData.sex;

      if (person.familyAsChild) {
        // Update existing family — set husband or wife
        const patch: { husbandId?: string; wifeId?: string } = {};
        if (newSex === 'F') {
          patch.wifeId = newPerson.id;
        } else {
          patch.husbandId = newPerson.id;
        }
        await patchFamily(person.familyAsChild, patch);
      } else {
        // Create a new family with the new person as parent and current person as child
        const familyOpts: { husbandId?: string; wifeId?: string; childrenIds: string[] } = {
          childrenIds: [personId],
        };
        if (newSex === 'F') {
          familyOpts.wifeId = newPerson.id;
        } else {
          familyOpts.husbandId = newPerson.id;
        }
        await createFamily(familyOpts);
      }

      setFormMode(null);
      await workspace.refreshTree();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setFormLoading(false);
    }
  }, [workspace, person, data, personId, createIndividual, patchFamily, createFamily]);

  // -------------------------------------------------------------------------
  // Action handlers with validation
  // -------------------------------------------------------------------------

  const handleAddChildClick = useCallback(() => {
    setFormError('');
    if (!person || !data) return;

    if (needsFamilyPickerForAddChild(person)) {
      setFamilyPickerMode('addChild');
    } else {
      setFormMode({ kind: 'addChild' });
    }
  }, [person, data]);

  const handleAddChildFamilySelect = useCallback((familyId: string) => {
    setFamilyPickerMode(null);
    setFormMode({ kind: 'addChild', targetFamilyId: familyId });
    setFormError('');
  }, []);

  const handleAddParentClick = useCallback(() => {
    setFormError('');
    if (!person || !data) return;

    const result: AddParentResult = validateAddParent(person, data);
    if (!result.allowed) return;
    setFormMode({ kind: 'addParent', lockedSex: result.lockedSex });
  }, [person, data]);

  const handleMoveChildClick = useCallback(() => {
    setFormError('');
    setFamilyPickerMode('moveChild');
  }, []);

  const handleMoveChildSelect = useCallback((targetFamilyId: string) => {
    moveChild(targetFamilyId);
  }, [moveChild]);

  // -------------------------------------------------------------------------
  // Delete handler
  // -------------------------------------------------------------------------

  const handleDelete = useCallback(async () => {
    if (!workspace) return;
    setDeleteLoading(true);
    try {
      const res = await apiFetch(`/api/workspaces/${workspace.workspaceId}/tree/individuals/${personId}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        const json = await res.json();
        throw new Error(json.error ?? 'حدث خطأ');
      }
      setSelectedPersonId(null);
      await workspace.refreshTree();
    } catch {
      // Reset confirm state on error so the user can try again
      setDeleteConfirm(false);
    } finally {
      setDeleteLoading(false);
    }
  }, [workspace, personId, setSelectedPersonId]);

  // -------------------------------------------------------------------------
  // Derived: form submit dispatcher + initial data
  // -------------------------------------------------------------------------

  const formSubmitHandler = formMode
    ? formMode.kind === 'edit'
      ? handleEditSubmit
      : formMode.kind === 'addChild'
        ? handleAddChildSubmit
        : formMode.kind === 'addSpouse'
          ? handleAddSpouseSubmit
          : handleAddParentSubmit
    : undefined;

  const formInitialData: Partial<IndividualFormData> | undefined = formMode?.kind === 'edit' && person
    ? buildEditInitialData(person) as Partial<IndividualFormData>
    : undefined;

  const formLockedSex = formMode?.kind === 'addParent' ? formMode.lockedSex : undefined;

  // -------------------------------------------------------------------------
  // Derived: move child and family picker data
  // -------------------------------------------------------------------------

  const showMoveChild = canEdit && person && data && canMoveChild(person, data);
  const alternativeFamilies = person && data ? getAlternativeFamilies(person, data) : [];
  const familiesForPicker = person && data ? getFamiliesForPicker(person, data) : [];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!person || !data || !relationships) return null;

  const name = getDisplayName(person);

  return (
    <div className={styles.container}>
      <button className={styles.backButton} onClick={handleBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        العودة للقائمة
      </button>

      <div className={styles.hero}>
        <h2 className={styles.heroName}>{name}</h2>
        <DateInfo person={person} className={styles.heroDates} />
        <div className={styles.heroActions}>
          {person.sex && (
            <span className={clsx(styles.heroSexBadge, {
              [styles.male]: person.sex === 'M',
              [styles.female]: person.sex === 'F',
            })}>
              {person.sex === 'M' ? 'ذكر' : 'أنثى'}
            </span>
          )}
          <button
            className={styles.focusButton}
            onClick={handleFocusInTree}
            aria-label="التركيز في الشجرة"
            title="التركيز في الشجرة"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 2V5M12 19V22M2 12H5M19 12H22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          {canEdit && (
            <button
              className={styles.focusButton}
              onClick={() => { setFormMode({ kind: 'edit' }); setFormError(''); }}
              aria-label="تعديل البيانات"
              title="تعديل البيانات"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {canEdit && (
        <div className={styles.actionBar}>
          <button
            className={styles.actionButton}
            onClick={handleAddChildClick}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            إضافة ابن/ابنة
          </button>
          <button
            className={styles.actionButton}
            onClick={() => { setFormMode({ kind: 'addSpouse' }); setFormError(''); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            إضافة زوج/زوجة
          </button>
          {person && data && validateAddParent(person, data).allowed && (
            <button
              className={styles.actionButton}
              onClick={handleAddParentClick}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              إضافة والد/والدة
            </button>
          )}
          {showMoveChild && (
            <button
              className={styles.actionButtonMove}
              onClick={handleMoveChildClick}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              نقل إلى عائلة أخرى
            </button>
          )}
        </div>
      )}

      <div className={styles.sections}>
        <RelationshipSection
          title="الوالدان"
          people={relationships.parents}
          visiblePersonIds={visiblePersonIds}
          onPersonClick={handlePersonClick}
        />
        <RelationshipSection
          title="الإخوة والأخوات"
          people={relationships.siblings}
          visiblePersonIds={visiblePersonIds}
          onPersonClick={handlePersonClick}
          hideNonVisible
        />
        <RelationshipSection
          title={person.sex === 'F' ? 'الزوج' : 'الزوجة'}
          people={relationships.spouses}
          visiblePersonIds={visiblePersonIds}
          onPersonClick={handlePersonClick}
        />
        <RelationshipSection
          title="الأبناء"
          people={relationships.children}
          visiblePersonIds={visiblePersonIds}
          onPersonClick={handlePersonClick}
        />
        <RelationshipSection
          title="الأعمام والعمات"
          people={relationships.paternalUncles}
          visiblePersonIds={visiblePersonIds}
          onPersonClick={handlePersonClick}
          hideNonVisible
        />
      </div>

      {person.notes && (
        <div className={styles.notesSection}>
          <h3 className={styles.sectionTitle}>ملاحظات</h3>
          <div className={styles.notesContent}>{person.notes}</div>
        </div>
      )}

      {canEdit && (
        <div className={styles.deleteSection}>
          {!deleteConfirm ? (
            <button
              className={styles.deleteButton}
              onClick={() => setDeleteConfirm(true)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              حذف الشخص
            </button>
          ) : (
            <div className={styles.deleteConfirm}>
              <span className={styles.deleteConfirmText}>هل أنت متأكد؟</span>
              <div className={styles.deleteConfirmActions}>
                <button
                  className={styles.deleteConfirmYes}
                  onClick={handleDelete}
                  disabled={deleteLoading}
                >
                  {deleteLoading ? 'جارٍ الحذف...' : 'نعم، احذف'}
                </button>
                <button
                  className={styles.deleteConfirmNo}
                  onClick={() => setDeleteConfirm(false)}
                  disabled={deleteLoading}
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {formMode && formSubmitHandler && (
        <IndividualForm
          mode={formMode.kind === 'edit' ? 'edit' : 'create'}
          initialData={formInitialData}
          onSubmit={formSubmitHandler}
          onClose={() => { setFormMode(null); setFormError(''); }}
          isLoading={formLoading}
          error={formError}
          lockedSex={formLockedSex}
        />
      )}

      {familyPickerMode === 'addChild' && (
        <FamilyPickerModal
          isOpen
          onClose={() => setFamilyPickerMode(null)}
          onSelect={handleAddChildFamilySelect}
          families={familiesForPicker}
          title="اختر العائلة"
        />
      )}

      {familyPickerMode === 'moveChild' && (
        <FamilyPickerModal
          isOpen
          onClose={() => setFamilyPickerMode(null)}
          onSelect={handleMoveChildSelect}
          families={alternativeFamilies}
          title="نقل إلى عائلة أخرى"
        />
      )}
    </div>
  );
}
