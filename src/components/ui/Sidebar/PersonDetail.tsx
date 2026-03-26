'use client';

import clsx from 'clsx';
import { useMemo, useState, useCallback } from 'react';
import { useTree } from '@/context/TreeContext';
import { useWorkspaceTree } from '@/context/WorkspaceTreeContext';
import { getDisplayName, getPersonRelationships, getAllDescendants, findTopmostAncestor, hasExternalFamily } from '@/lib/gedcom';
import type { Individual } from '@/lib/gedcom';
import { IndividualForm, type IndividualFormData } from '@/components/tree/IndividualForm/IndividualForm';
import { FamilyPickerModal } from '@/components/tree/FamilyPickerModal/FamilyPickerModal';
import { FamilyEventForm } from '@/components/tree/FamilyEventForm/FamilyEventForm';
import { getPreferredDate, getSecondaryDate, getDateSuffix } from '@/lib/calendar-helpers';
import type { CalendarPreference } from '@/lib/calendar-helpers';
import { useCalendarPreference } from '@/hooks/useCalendarPreference';
import { usePersonActions } from '@/hooks/usePersonActions';
import {
  formatDateWithPlace,
  getDeceasedLabel,
  needsFamilyPickerForAddChild,
  validateAddParent,
  canMoveChild,
  getAlternativeFamilies,
  buildEditInitialData,
  buildFamilyEventInitialData,
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
// Sub-components
// ---------------------------------------------------------------------------

function DateInfo({
  person,
  className,
  compact,
  calendarPreference = 'hijri',
}: {
  person: Individual;
  className?: string;
  compact?: boolean;
  calendarPreference?: CalendarPreference;
}) {
  const birthPrimary = getPreferredDate(person.birth, person.birthHijriDate, calendarPreference);
  const birthSecondary = getSecondaryDate(person.birth, person.birthHijriDate, calendarPreference);
  const birthSuffix = getDateSuffix(person.birth, person.birthHijriDate);
  const deathPrimary = getPreferredDate(person.death, person.deathHijriDate, calendarPreference);
  const deathSecondary = getSecondaryDate(person.death, person.deathHijriDate, calendarPreference);
  const deathSuffix = getDateSuffix(person.death, person.deathHijriDate);

  const birthDateWithSuffix = birthPrimary ? `${birthPrimary}${birthSuffix ? ` ${birthSuffix}` : ''}` : '';
  const birthDisplay = compact ? birthDateWithSuffix : formatDateWithPlace(birthDateWithSuffix, person.birthPlace);
  const deathDateWithSuffix = deathPrimary ? `${deathPrimary}${deathSuffix ? ` ${deathSuffix}` : ''}` : '';
  const deathDisplay = compact ? deathDateWithSuffix : formatDateWithPlace(deathDateWithSuffix, person.deathPlace);
  const deceasedLabel = getDeceasedLabel(person);

  if (!birthDisplay && !deathDisplay && !deceasedLabel) return null;

  return (
    <span className={className}>
      {birthDisplay && (
        <span className={styles.dateGroup}>
          <span className={styles.datePrimary}>الميلاد: {birthDisplay}</span>
          {!compact && birthSecondary && (
            <span className={styles.dateSecondary}>{birthSecondary}</span>
          )}
        </span>
      )}
      {!compact && person.birthDescription && (
        <span className={styles.eventDescription}>{person.birthDescription}</span>
      )}
      {!compact && person.birthNotes && (
        <span className={styles.eventNote}>{person.birthNotes}</span>
      )}
      {deathDisplay && (
        <span className={styles.dateGroup}>
          <span className={styles.datePrimary}>الوفاة: {deathDisplay}</span>
          {!compact && deathSecondary && (
            <span className={styles.dateSecondary}>{deathSecondary}</span>
          )}
        </span>
      )}
      {!compact && person.deathDescription && (
        <span className={styles.eventDescription}>سبب الوفاة: {person.deathDescription}</span>
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
// MarriageEventDisplay sub-component
// ---------------------------------------------------------------------------

function MarriageEventDisplay({
  label,
  event,
  calendarPreference,
}: {
  label: string;
  event: { date: string; hijriDate: string; place: string; description: string; notes: string };
  calendarPreference: CalendarPreference;
}) {
  const primary = getPreferredDate(event.date, event.hijriDate, calendarPreference);
  const secondary = getSecondaryDate(event.date, event.hijriDate, calendarPreference);
  const suffix = getDateSuffix(event.date, event.hijriDate);

  return (
    <div className={styles.marriageEvent}>
      <span className={styles.marriageEventLabel}>{label}</span>
      {primary && <span className={styles.marriageEventDate}>{primary}{suffix ? ` ${suffix}` : ''}</span>}
      {secondary && <span className={styles.marriageEventDateSecondary}>{secondary}</span>}
      {event.place && <span className={styles.marriageEventPlace}>{event.place}</span>}
      {event.description && <span className={styles.eventDescription}>{event.description}</span>}
      {event.notes && <span className={styles.eventNote}>{event.notes}</span>}
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
    selectedRootId,
    visiblePersonIds,
    setSelectedPersonId,
    setSelectedRootId,
    setFocusPersonId,
    setHighlightedPersonId,
    setMobileSidebarOpen,
  } = useTree();

  const workspace = useOptionalWorkspaceTree();
  const canEdit = workspace?.canEdit ?? false;
  const { preference: calendarPreference, setPreference: setCalendarPreference } = useCalendarPreference();

  const person = data?.individuals[personId];

  const {
    formMode, setFormMode,
    formLoading,
    formError, setFormError,
    deleteConfirm, setDeleteConfirm, deleteLoading,
    handleEditSubmit,
    handleAddChildSubmit,
    handleAddSpouseSubmit,
    handleAddParentSubmit,
    handleFamilyEventSubmit,
    handleDelete,
    moveChild,
  } = usePersonActions({
    personId,
    workspace,
    person,
    data,
    setSelectedPersonId,
  });

  // Family picker state (stays local — it controls which modal is open)
  const [familyPickerMode, setFamilyPickerMode] = useState<'addChild' | 'moveChild' | null>(null);
  const relationships = useMemo(() => {
    if (!data) return null;
    return getPersonRelationships(data, personId);
  }, [data, personId]);

  // Compute whether this person has an external family tree to navigate to
  const externalFamilyInfo = useMemo(() => {
    if (!data || !selectedRootId || !person) return null;
    const rootDescendants = getAllDescendants(data, selectedRootId);
    rootDescendants.add(selectedRootId);
    if (!hasExternalFamily(data, personId, rootDescendants)) return null;
    const topAncestorId = findTopmostAncestor(data, personId);
    if (!topAncestorId) return null;
    return { topAncestorId };
  }, [data, selectedRootId, person, personId]);

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

  const handleViewFamilyTree = useCallback(() => {
    if (!externalFamilyInfo) return;
    setSelectedRootId(externalFamilyInfo.topAncestorId);
    setSelectedPersonId(null);
    // Close mobile sidebar so the new tree is visible
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      setMobileSidebarOpen(false);
    }
  }, [externalFamilyInfo, setSelectedRootId, setSelectedPersonId, setMobileSidebarOpen]);

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
    setFamilyPickerMode(null);
    moveChild(targetFamilyId);
  }, [moveChild]);

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
          : formMode.kind === 'addParent'
            ? handleAddParentSubmit
            : undefined
    : undefined;

  const formInitialData: Partial<IndividualFormData> | undefined = formMode?.kind === 'edit' && person
    ? buildEditInitialData(person) as Partial<IndividualFormData>
    : undefined;

  const formLockedSex = formMode?.kind === 'addParent' ? formMode.lockedSex
    : formMode?.kind === 'addSpouse' ? formMode.lockedSex
    : undefined;

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

  // Show calendar toggle only when this person (or their families) has both hijri + gregorian
  const hasDualDates = useMemo(() => {
    if (person.birth && person.birthHijriDate) return true;
    if (person.death && person.deathHijriDate) return true;
    for (const fId of person.familiesAsSpouse) {
      const f = data.families[fId];
      if (!f) continue;
      if (f.marriageContract.date && f.marriageContract.hijriDate) return true;
      if (f.marriage.date && f.marriage.hijriDate) return true;
      if (f.divorce.date && f.divorce.hijriDate) return true;
    }
    return false;
  }, [person, data]);

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
        <DateInfo person={person} className={styles.heroDates} calendarPreference={calendarPreference} />
        <div className={styles.heroActions}>
          {person.sex && (
            <span className={clsx(styles.heroSexBadge, {
              [styles.male]: person.sex === 'M',
              [styles.female]: person.sex === 'F',
            })}>
              {person.sex === 'M' ? 'ذكر' : 'أنثى'}
            </span>
          )}
          {hasDualDates && (
            <div className={styles.calendarToggle}>
              <button
                type="button"
                className={clsx(styles.calendarToggleOption, {
                  [styles.calendarToggleOptionActive]: calendarPreference === 'hijri',
                })}
                onClick={() => setCalendarPreference('hijri')}
              >
                هجري
              </button>
              <button
                type="button"
                className={clsx(styles.calendarToggleOption, {
                  [styles.calendarToggleOptionActive]: calendarPreference === 'gregorian',
                })}
                onClick={() => setCalendarPreference('gregorian')}
              >
                ميلادي
              </button>
            </div>
          )}
          {externalFamilyInfo && (
            <button
              className={styles.focusButton}
              onClick={handleViewFamilyTree}
              aria-label={person.sex === 'F' ? 'عرض شجرة عائلتها' : 'عرض شجرة عائلته'}
              title={person.sex === 'F' ? 'عرض شجرة عائلتها' : 'عرض شجرة عائلته'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M6 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M18 9a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2"/>
                <path d="M6 21a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2"/>
                <path d="M15 6h-4a2 2 0 00-2 2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
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
            onClick={() => { setFormMode({ kind: 'addSpouse', lockedSex: person.sex === 'M' ? 'F' : person.sex === 'F' ? 'M' : undefined }); setFormError(''); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            {person.sex === 'M' ? 'إضافة زوجة' : person.sex === 'F' ? 'إضافة زوج' : 'إضافة زوج/زوجة'}
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

        {person.familiesAsSpouse.length > 0 && (
          <div>
            <h3 className={styles.sectionTitle}>معلومات الزواج</h3>
            {person.familiesAsSpouse.map((familyId) => {
              const family = data.families[familyId];
              if (!family) return null;
              const spouseId = family.husband === personId ? family.wife : family.husband;
              const spouse = spouseId ? data.individuals[spouseId] : null;
              if (spouse?.isPrivate) return null;
              const spouseName = spouse ? getDisplayName(spouse) : null;
              const hasAnyEvent = family.marriageContract.date || family.marriageContract.hijriDate ||
                family.marriage.date || family.marriage.hijriDate ||
                family.isDivorced;

              return (
                <div key={familyId} className={styles.marriageBlock}>
                  <div className={styles.marriageBlockHeader}>
                    <span className={styles.marriageSpouseName}>
                      {spouseName ?? 'بدون زوج/زوجة'}
                    </span>
                    {canEdit && (
                      <button
                        className={styles.marriageEditButton}
                        onClick={() => { setFormMode({ kind: 'editFamilyEvent', familyId }); setFormError(''); }}
                        aria-label="تعديل أحداث الزواج"
                        title="تعديل أحداث الزواج"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                  {(family.marriageContract.date || family.marriageContract.hijriDate) && (
                    <MarriageEventDisplay
                      label="عقد القران"
                      event={family.marriageContract}
                      calendarPreference={calendarPreference}
                    />
                  )}
                  {(family.marriage.date || family.marriage.hijriDate) && (
                    <MarriageEventDisplay
                      label="الزفاف"
                      event={family.marriage}
                      calendarPreference={calendarPreference}
                    />
                  )}
                  {family.isDivorced && (family.divorce.date || family.divorce.hijriDate) && (
                    <MarriageEventDisplay
                      label="الانفصال"
                      event={family.divorce}
                      calendarPreference={calendarPreference}
                    />
                  )}
                  {!hasAnyEvent && (
                    <span className={styles.marriageEventPlace}>لا توجد بيانات</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {person.notes && (
          <div>
            <h3 className={styles.sectionTitle}>ملاحظات</h3>
            <div className={styles.notesContent}>{person.notes}</div>
          </div>
        )}
      </div>

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
          workspaceId={workspace?.workspaceId}
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

      {formMode?.kind === 'editFamilyEvent' && (
        <FamilyEventForm
          initialData={
            data.families[formMode.familyId]
              ? buildFamilyEventInitialData(data.families[formMode.familyId])
              : undefined
          }
          onSubmit={handleFamilyEventSubmit}
          onClose={() => { setFormMode(null); setFormError(''); }}
          isLoading={formLoading}
          error={formError}
          workspaceId={workspace?.workspaceId}
        />
      )}
    </div>
  );
}
