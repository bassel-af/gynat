'use client';

import clsx from 'clsx';
import { useMemo, useState, useCallback, useEffect } from 'react';
import { useTree } from '@/context/TreeContext';
import { useOptionalWorkspaceTree } from '@/context/WorkspaceTreeContext';
import { useOptionalUndoStack } from '@/context/UndoStackContext';
import { getDisplayName, getPersonRelationships, getRadaRelationships, getAllDescendants, findTopmostAncestor, hasExternalFamily } from '@/lib/gedcom';
import type { Individual } from '@/lib/gedcom';
import { IndividualForm, type IndividualFormData } from '@/components/tree/IndividualForm/IndividualForm';
import { FamilyPickerModal } from '@/components/tree/FamilyPickerModal/FamilyPickerModal';
import { FamilyEventForm } from '@/components/tree/FamilyEventForm/FamilyEventForm';
import { RadaaFamilyForm } from '@/components/tree/RadaaFamilyForm/RadaaFamilyForm';
import { IndividualPicker } from '@/components/ui/IndividualPicker/IndividualPicker';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { getPreferredDate, getSecondaryDate, getDateSuffix } from '@/lib/calendar-helpers';
import type { CalendarPreference } from '@/lib/calendar-helpers';
import { useCalendarPreference } from '@/hooks/useCalendarPreference';
import { usePersonActions } from '@/hooks/usePersonActions';
import { CascadeDeleteModal } from '@/components/tree/CascadeDeleteModal/CascadeDeleteModal';
import { usePointerActions } from '@/hooks/usePointerActions';
import {
  formatDateWithPlace,
  getDeceasedLabel,
  needsFamilyPickerForAddChild,
  validateAddParent,
  validateAddSibling,
  canMoveSubtree,
  getTargetFamiliesForMove,
  computeSubtreeIds,
  buildEditInitialData,
  buildFamilyEventInitialData,
  getFamiliesForPicker,
} from '@/lib/person-detail-helpers';
import { MoveSubtreeModal } from '@/components/tree/MoveSubtreeModal';
import type { AddParentResult } from '@/lib/person-detail-helpers';
import { apiFetch } from '@/lib/api/client';
import { shouldHideBirthDate } from '@/lib/tree/birth-date-privacy';
import styles from './PersonDetail.module.css';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DateInfo({
  person,
  className,
  compact,
  calendarPreference = 'hijri',
  hideBirthDate,
}: {
  person: Individual;
  className?: string;
  compact?: boolean;
  calendarPreference?: CalendarPreference;
  hideBirthDate?: boolean;
}) {
  const birthPrimary = hideBirthDate ? '' : getPreferredDate(person.birth, person.birthHijriDate, calendarPreference);
  const birthSecondary = hideBirthDate ? '' : getSecondaryDate(person.birth, person.birthHijriDate, calendarPreference);
  const birthSuffix = hideBirthDate ? '' : getDateSuffix(person.birth, person.birthHijriDate);
  const deathPrimary = getPreferredDate(person.death, person.deathHijriDate, calendarPreference);
  const deathSecondary = getSecondaryDate(person.death, person.deathHijriDate, calendarPreference);
  const deathSuffix = getDateSuffix(person.death, person.deathHijriDate);

  const birthDateWithSuffix = birthPrimary ? `${birthPrimary}${birthSuffix ? ` ${birthSuffix}` : ''}` : '';
  const birthDisplay = compact ? birthDateWithSuffix : formatDateWithPlace(birthDateWithSuffix, hideBirthDate ? '' : person.birthPlace);
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
      {!compact && !hideBirthDate && person.birthDescription && (
        <span className={styles.eventDescription}>{person.birthDescription}</span>
      )}
      {!compact && !hideBirthDate && person.birthNotes && (
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
  const wsCtx = useOptionalWorkspaceTree();
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
        const personHideBirth = shouldHideBirthDate(person, {
          hideBirthDateForFemale: wsCtx?.hideBirthDateForFemale,
          hideBirthDateForMale: wsCtx?.hideBirthDateForMale,
        });

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
                <DateInfo person={person} className={styles.relPersonDates} compact hideBirthDate={personHideBirth} />
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
              <DateInfo person={person} className={styles.relPersonDates} compact hideBirthDate={personHideBirth} />
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
// RadaPersonItem — renders a person in the rada'a section using the same
// pattern as RelationshipSection (relPersonClickable/relPersonStatic) but
// with a small role tag appended after the name.
// ---------------------------------------------------------------------------

function RadaPersonItem({
  person,
  roleTag,
  onClick,
}: {
  person: Individual;
  roleTag: string;
  onClick: (id: string) => void;
}) {
  const wsCtx = useOptionalWorkspaceTree();
  const name = getDisplayName(person);
  const personHideBirth = shouldHideBirthDate(person, {
    hideBirthDateForFemale: wsCtx?.hideBirthDateForFemale,
    hideBirthDateForMale: wsCtx?.hideBirthDateForMale,
  });

  // Rada-related persons are always clickable — they exist in the data and
  // their PersonDetail can be viewed even when they are not rendered on the
  // tree canvas (e.g. foster father's children from another wife).
  return (
    <button
      className={clsx(styles.relPersonClickable, {
        [styles.male]: person.sex === 'M',
        [styles.female]: person.sex === 'F',
        [styles.deceased]: person.isDeceased,
      })}
      onClick={() => onClick(person.id)}
    >
      <div className={styles.relPersonInfo}>
        <span className={styles.relPersonName}>
          {name}
          <span className={styles.radaRoleTag}>{roleTag}</span>
        </span>
        <DateInfo person={person} className={styles.relPersonDates} compact hideBirthDate={personHideBirth} />
      </div>
      <svg className={styles.relChevron} width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
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
// PersonAuditHistory — collapsible per-person edit history (last 5 entries)
// ---------------------------------------------------------------------------

interface AuditHistoryEntry {
  id: string;
  action: string;
  description: string | null;
  timestamp: string;
  user: { displayName: string | null };
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: 'إضافة',
  update: 'تعديل',
  delete: 'حذف',
  cascade_delete: 'حذف متسلسل',
  MOVE_SUBTREE: 'نقل فرع',
};

function formatShortTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'الآن';
  if (diffMins < 60) return `${diffMins}د`;
  if (diffHours < 24) return `${diffHours}س`;
  if (diffDays < 30) return `${diffDays}ي`;
  return date.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
}

function PersonAuditHistory({
  workspaceId,
  personId,
}: {
  workspaceId: string;
  personId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<AuditHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!isOpen || fetched) return;
    setLoading(true);
    const params = new URLSearchParams({
      page: '1',
      limit: '5',
      entityId: personId,
      entityType: 'individual',
    });
    apiFetch(`/api/workspaces/${workspaceId}/tree/audit-log?${params.toString()}`)
      .then(async (res) => {
        if (res.ok) {
          const body = await res.json();
          setEntries(body.data);
        }
      })
      .catch(() => {
        // silently fail
      })
      .finally(() => {
        setLoading(false);
        setFetched(true);
      });
  }, [isOpen, fetched, workspaceId, personId]);

  // Reset when person changes
  useEffect(() => {
    setFetched(false);
    setEntries([]);
    setIsOpen(false);
  }, [personId]);

  return (
    <div>
      <button
        className={styles.auditToggle}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="2" />
          <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className={styles.sectionTitle} style={{ margin: 0 }}>سجل التعديلات</span>
        <svg
          className={clsx(styles.auditChevron, { [styles.isOpen]: isOpen })}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {isOpen && (
        <div className={styles.auditContent}>
          {loading ? (
            <span className={styles.auditLoading}>جاري التحميل...</span>
          ) : entries.length === 0 ? (
            <span className={styles.auditEmpty}>لا توجد تعديلات مسجلة</span>
          ) : (
            <>
              {entries.map((entry) => (
                <div key={entry.id} className={styles.auditEntry}>
                  <div className={styles.auditEntryRow}>
                    <span className={styles.auditAction}>
                      {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                    </span>
                    <span className={styles.auditTime}>
                      {formatShortTime(entry.timestamp)}
                    </span>
                  </div>
                  <span className={styles.auditUser}>
                    {entry.user.displayName ?? 'مستخدم'}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
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
    selectedRootId,
    visiblePersonIds,
    graftPersonIds,
    setSelectedPersonId,
    setSelectedRootId,
    setFocusPersonId,
    setHighlightedPersonId,
    setMobileSidebarOpen,
  } = useTree();

  const workspace = useOptionalWorkspaceTree();
  const undoStack = useOptionalUndoStack();
  const canEdit = workspace?.canEdit ?? false;
  const enableRadaa = workspace?.enableRadaa ?? false;
  const { preference: calendarPreference, setPreference: setCalendarPreference } = useCalendarPreference();

  const person = data?.individuals[personId];
  const hideBirth = person ? shouldHideBirthDate(person, {
    hideBirthDateForFemale: workspace?.hideBirthDateForFemale,
    hideBirthDateForMale: workspace?.hideBirthDateForMale,
  }) : false;

  const {
    formMode, setFormMode,
    formLoading,
    formError, setFormError,
    deleteState, setDeleteState,
    handleEditSubmit,
    handleAddChildSubmit,
    handleAddSpouseSubmit,
    handleLinkExistingSpouse,
    handleAddParentSubmit,
    handleAddSiblingSubmit,
    handleFamilyEventSubmit,
    unlinkSpouse,
    handleRadaaSubmit,
    handleRadaaDelete,
    handleDeleteClick,
    handleCascadeConfirm,
    moveSubtree,
  } = usePersonActions({
    personId,
    workspace,
    person,
    data,
    setSelectedPersonId,
    onPushUndo: undoStack?.push,
  });

  // Family picker state (stays local — it controls which modal is open)
  const [familyPickerMode, setFamilyPickerMode] = useState<'addChild' | 'moveSubtree' | null>(null);

  // Link-existing-spouse state
  const [linkSpouseSelectedId, setLinkSpouseSelectedId] = useState<string | null>(null);

  // Unlink spouse confirmation state
  const [unlinkSpouseConfirm, setUnlinkSpouseConfirm] = useState<{ familyId: string; hasChildren: boolean } | null>(null);

  // Reset linkSpouseSelectedId when formMode changes
  useEffect(() => {
    setLinkSpouseSelectedId(null);
  }, [formMode]);

  // Exclude set for IndividualPicker: current person + existing spouses + pointed individuals
  const linkSpouseExcludeSet = useMemo(() => {
    const exclude = new Set<string>();
    if (!data || !person) return exclude;
    exclude.add(personId);
    for (const fId of person.familiesAsSpouse) {
      const family = data.families[fId];
      if (!family) continue;
      if (family.husband && family.husband !== personId) exclude.add(family.husband);
      if (family.wife && family.wife !== personId) exclude.add(family.wife);
    }
    // Exclude pointed individuals (read-only, from branch pointers)
    for (const ind of Object.values(data.individuals)) {
      if (ind._pointed) exclude.add(ind.id);
    }
    return exclude;
  }, [data, person, personId]);

  // Pointer actions (admin only)
  const isAdmin = workspace?.isAdmin ?? false;
  const { breakPointer, copyPointer, isLoading: pointerActionLoading } = usePointerActions(workspace?.workspaceId ?? '');
  const [breakConfirmPointerId, setBreakConfirmPointerId] = useState<string | null>(null);
  const [copyConfirmPointerId, setCopyConfirmPointerId] = useState<string | null>(null);
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
    const topAncestorId = findTopmostAncestor(data, personId) ?? personId;
    return { topAncestorId };
  }, [data, selectedRootId, person, personId]);

  // Compute umm walad edit context for single-family spouses
  const ummWaladEditContext = useMemo(() => {
    if (!workspace?.enableUmmWalad || !person || !data) return null;
    if (person.familiesAsSpouse.length !== 1) return null;
    const familyId = person.familiesAsSpouse[0];
    const family = data.families[familyId];
    if (!family || family._pointed) return null;
    const mc = family.marriageContract;
    const m = family.marriage;
    return {
      familyId,
      isUmmWalad: family.isUmmWalad ?? false,
      hasMarriageData: !!(
        mc.date || mc.hijriDate || mc.place || mc.description || mc.notes ||
        m.date || m.hijriDate || m.place || m.description || m.notes
      ),
    };
  }, [workspace?.enableUmmWalad, person, data]);

  // -------------------------------------------------------------------------
  // Navigation handlers
  // -------------------------------------------------------------------------

  const handleBack = useCallback(() => {
    setSelectedPersonId(null);
  }, [setSelectedPersonId]);

  const handlePersonClick = useCallback((id: string) => {
    if (graftPersonIds.has(id) && data) {
      const topAncestorId = findTopmostAncestor(data, id) ?? id;
      setSelectedRootId(topAncestorId);
      setSelectedPersonId(null);
      return;
    }
    setSelectedPersonId(id);
    setFocusPersonId(id);
    setHighlightedPersonId(id);
  }, [graftPersonIds, data, setSelectedPersonId, setFocusPersonId, setHighlightedPersonId, setSelectedRootId]);

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

  const handleMoveSubtreeClick = useCallback(() => {
    setFormError('');
    setFamilyPickerMode('moveSubtree');
  }, []);

  const handleMoveSubtreeConfirm = useCallback((targetFamilyId: string) => {
    setFamilyPickerMode(null);
    moveSubtree(targetFamilyId);
  }, [moveSubtree]);

  // Branch link handler — redeem a share token via the branch-pointers API
  const handleBranchLink = useCallback(async (token: string, selectedPersonId: string, linkChildrenToAnchor?: boolean) => {
    if (!person || !workspace?.workspaceId || !formMode) return;
    const relationshipMap: Record<string, string> = {
      addChild: 'child',
      addSibling: 'sibling',
      addSpouse: 'spouse',
      addParent: 'parent',
    };
    const relationship = relationshipMap[formMode.kind];
    if (!relationship) return;

    const res = await apiFetch(`/api/workspaces/${workspace.workspaceId}/branch-pointers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        anchorIndividualId: person.id,
        selectedPersonId,
        relationship,
        ...(linkChildrenToAnchor !== undefined && { linkChildrenToAnchor }),
      }),
    });
    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.error || 'فشل في ربط الفرع');
    }
    setFormMode(null);
    await workspace.refreshTree?.();
    setFocusPersonId(selectedPersonId);
  }, [person, workspace, formMode, setFormMode, setFocusPersonId]);

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
            : formMode.kind === 'addSibling'
              ? handleAddSiblingSubmit
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

  // Rada families where this person is a child or foster parent — enriched with per-family members
  // For the 'child' role, siblings are derived using getRadaRelationships() which applies all 3 rules:
  // 1. All children of the foster father (bio from all wives + rada from other _RADA_FAM) are siblings
  // 2. All children of the foster mother (bio from all husbands + rada from other _RADA_FAM) are siblings
  // 3. Only the wet nurse is the rada mother, only the milk-father is the rada father
  const personRadaFamilies = useMemo(() => {
    if (!data?.radaFamilies || !person) return [];
    const seenIds = new Set<string>();
    const result: {
      id: string;
      role: 'child' | 'fosterParent';
      fosterMother: Individual | null;
      fosterFather: Individual | null;
      siblings: Individual[];
      children: Individual[];
      notes: string;
    }[] = [];

    // Compute full derived siblings once (only needed if person is a child in any rada family)
    const derivedRadaSiblings = person.radaFamiliesAsChild?.length
      ? getRadaRelationships(data, person.id).radaSiblings
      : [];

    const addFamily = (rfId: string, role: 'child' | 'fosterParent') => {
      if (seenIds.has(rfId)) return;
      const rf = data.radaFamilies![rfId];
      if (!rf) return;
      seenIds.add(rfId);

      const fosterMother = rf.fosterMother && data.individuals[rf.fosterMother] && !data.individuals[rf.fosterMother].isPrivate
        ? data.individuals[rf.fosterMother] : null;
      const fosterFather = rf.fosterFather && data.individuals[rf.fosterFather] && !data.individuals[rf.fosterFather].isPrivate
        ? data.individuals[rf.fosterFather] : null;

      // Foster children for parent role
      const otherChildren = rf.children
        .filter((cId) => cId !== person.id && data.individuals[cId] && !data.individuals[cId].isPrivate)
        .map((cId) => data.individuals[cId]);

      result.push({
        id: rf.id,
        role,
        fosterMother,
        fosterFather,
        siblings: role === 'child' ? derivedRadaSiblings : [],
        children: role === 'fosterParent' ? otherChildren : [],
        notes: rf.notes,
      });
    };

    // Families where person is a child
    if (person.radaFamiliesAsChild) {
      for (const rfId of person.radaFamiliesAsChild) addFamily(rfId, 'child');
    }
    // Families where person is a foster parent
    for (const rf of Object.values(data.radaFamilies)) {
      if (rf.fosterFather === person.id || rf.fosterMother === person.id) {
        addFamily(rf.id, 'fosterParent');
      }
    }
    return result;
  }, [data, person]);

  // Rada'a: show section if feature enabled or person has data
  const hasRadaData = personRadaFamilies.length > 0;
  const showRadaaSection = enableRadaa || hasRadaData;

  const showMoveSubtree = canEdit && person && canMoveSubtree(person);

  const subtreeIds = useMemo(() => {
    if (!person || !data) return new Set<string>();
    return computeSubtreeIds(data, person.id);
  }, [person, data]);

  const descendantCount = subtreeIds.size > 0 ? subtreeIds.size - 1 : 0;

  const targetFamilies = useMemo(() => {
    if (!person || !data) return [];
    return getTargetFamiliesForMove(person, data, subtreeIds);
  }, [person, data, subtreeIds]);

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
        {person.kunya && <span className={styles.heroKunya}>{person.kunya}</span>}
        <DateInfo person={person} className={styles.heroDates} calendarPreference={calendarPreference} hideBirthDate={hideBirth} />
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
          {canEdit && !person._pointed && (
            <button
              className={styles.focusButton}
              onClick={() => {
                setFormMode({
                  kind: 'edit',
                  ...(ummWaladEditContext && {
                    ummWaladFamilyId: ummWaladEditContext.familyId,
                    ummWaladInitialValue: ummWaladEditContext.isUmmWalad,
                  }),
                });
                setFormError('');
              }}
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

      {person._pointed && (() => {
        const pointer = workspace?.pointers?.find(
          (p) => p.id === person._pointerId,
        );
        const currentPointerId = person._pointerId;
        return (
          <div className={styles.pointerBanner}>
            <div className={styles.pointerBannerInfo}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>
                {pointer?.sourceWorkspaceNameAr
                  ? `مرتبط من: ${pointer.sourceWorkspaceNameAr} — للقراءة فقط`
                  : 'فرع مرتبط — للقراءة فقط'}
              </span>
            </div>
            {isAdmin && currentPointerId && (
              <>
                {breakConfirmPointerId === currentPointerId ? (
                  <div className={styles.pointerBannerConfirm}>
                    <span className={styles.pointerBannerConfirmText}>
                      فصل الفرع؟ سيتم إزالة البيانات المرتبطة من الشجرة ولن يمكن استرجاعها.
                    </span>
                    <div className={styles.pointerBannerConfirmButtons}>
                      <button
                        className={styles.pointerBreakConfirmButton}
                        disabled={pointerActionLoading}
                        onClick={async () => {
                          const ok = await breakPointer(currentPointerId);
                          if (ok) {
                            setBreakConfirmPointerId(null);
                            setSelectedPersonId(null);
                            await workspace?.refreshTree();
                          }
                        }}
                      >
                        {pointerActionLoading ? '...' : 'نعم، فصل'}
                      </button>
                      <button
                        className={styles.pointerCancelButton}
                        disabled={pointerActionLoading}
                        onClick={() => setBreakConfirmPointerId(null)}
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                ) : copyConfirmPointerId === currentPointerId ? (
                  <div className={styles.pointerBannerConfirm}>
                    <span className={styles.pointerBannerConfirmCopyText}>
                      نسخ الفرع؟ سيتم تحويله لنسخة محلية قابلة للتعديل، ولن تتزامن مع المصدر بعد ذلك.
                    </span>
                    <div className={styles.pointerBannerConfirmButtons}>
                      <button
                        className={styles.pointerCopyConfirmButton}
                        disabled={pointerActionLoading}
                        onClick={async () => {
                          const ok = await copyPointer(currentPointerId);
                          if (ok) {
                            setCopyConfirmPointerId(null);
                            setSelectedPersonId(null);
                            await workspace?.refreshTree();
                          }
                        }}
                      >
                        {pointerActionLoading ? '...' : 'نعم، نسخ'}
                      </button>
                      <button
                        className={styles.pointerCancelButton}
                        disabled={pointerActionLoading}
                        onClick={() => setCopyConfirmPointerId(null)}
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.pointerBannerActions}>
                    <button
                      className={styles.pointerCopyButton}
                      disabled={pointerActionLoading}
                      onClick={() => setCopyConfirmPointerId(currentPointerId)}
                    >
                      نسخ
                    </button>
                    <button
                      className={styles.pointerBreakButton}
                      disabled={pointerActionLoading}
                      onClick={() => setBreakConfirmPointerId(currentPointerId)}
                    >
                      فصل
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {canEdit && !person._pointed && (
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
          {person && data && validateAddSibling(person, data).allowed && (
            <button
              className={styles.actionButton}
              onClick={() => {
                const result = validateAddSibling(person, data);
                if (result.allowed) {
                  setFormMode({ kind: 'addSibling', targetFamilyId: result.targetFamilyId });
                  setFormError('');
                }
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              إضافة أخ/أخت
            </button>
          )}
          <button
            className={styles.actionButton}
            onClick={() => { setFormMode({ kind: 'addSpouse', lockedSex: person.sex === 'M' ? 'F' : person.sex === 'F' ? 'M' : undefined }); setFormError(''); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            {person.sex === 'M' ? 'إضافة زوجة جديدة' : person.sex === 'F' ? 'إضافة زوج جديد' : 'إضافة زوج/زوجة'}
          </button>
          <button
            className={styles.actionButtonLink}
            onClick={() => { setFormMode({ kind: 'linkExistingSpouse' }); setFormError(''); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {person.sex === 'M' ? 'ربط زوجة موجودة' : person.sex === 'F' ? 'ربط زوج موجود' : 'ربط زوج/زوجة'}
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
          {showMoveSubtree && (
            <button
              className={styles.actionButtonMove}
              onClick={handleMoveSubtreeClick}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              نقل الفرع
            </button>
          )}
          {enableRadaa && (
            <button
              className={styles.actionButtonRadaa}
              onClick={() => { setFormMode({ kind: 'addRadaa' }); setFormError(''); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C8.5 2 5 5.5 5 9c0 2 .7 3.3 2 4.5V22h10v-8.5c1.3-1.2 2-2.5 2-4.5 0-3.5-3.5-7-7-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M9 14v4M15 14v4M9 18h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              إضافة رضاعة
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
          title={(() => {
            if (person.sex === 'M') return 'الزوجة';
            const allUmmWalad = person.familiesAsSpouse.length > 0 &&
              person.familiesAsSpouse.every((fid) => data.families[fid]?.isUmmWalad);
            return allUmmWalad ? 'السيّد' : 'الزوج';
          })()}
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

        {showRadaaSection && (
          <div>
            <div className={styles.sectionTitleRow}>
              <h3 className={styles.sectionTitle}>الرضاعة</h3>
              {enableRadaa && canEdit && !person._pointed && (
                <button
                  className={styles.sectionEditButton}
                  onClick={() => { setFormMode({ kind: 'addRadaa' }); setFormError(''); }}
                  aria-label="إضافة رضاعة"
                  title="إضافة رضاعة"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
            {personRadaFamilies.length > 0 ? personRadaFamilies.map((rf, rfIndex) => (
                <div key={rf.id}>
                  <div className={styles.radaBlockHeader}>
                    <span className={styles.radaBlockLabel}>
                      رضاعة {personRadaFamilies.length > 1 ? `(${rfIndex + 1})` : ''}
                    </span>
                    {canEdit && !person._pointed && enableRadaa && (
                      <button
                        className={styles.marriageEditButton}
                        onClick={() => { setFormMode({ kind: 'editRadaa', radaFamilyId: rf.id }); setFormError(''); }}
                        aria-label="تعديل الرضاعة"
                        title="تعديل الرضاعة"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {rf.notes && (
                    <div className={styles.radaNote}>{rf.notes}</div>
                  )}
                  {rf.role === 'child' && (
                    <>
                      {rf.fosterMother && (
                        <RadaPersonItem person={rf.fosterMother} roleTag="أم" onClick={handlePersonClick} />
                      )}
                      {rf.fosterFather && (
                        <RadaPersonItem person={rf.fosterFather} roleTag="أب" onClick={handlePersonClick} />
                      )}
                      {rf.siblings.map((sib) => (
                        <RadaPersonItem key={sib.id} person={sib} roleTag={sib.sex === 'F' ? 'أخت' : 'أخ'} onClick={handlePersonClick} />
                      ))}
                    </>
                  )}
                  {rf.role === 'fosterParent' && rf.children.map((child) => (
                    <RadaPersonItem key={child.id} person={child} roleTag={child.sex === 'F' ? 'ابنة' : 'ابن'} onClick={handlePersonClick} />
                  ))}
                </div>
              )) : (
              <div className={styles.radaEmpty}>لا توجد بيانات رضاعة</div>
            )}
          </div>
        )}

        {person.familiesAsSpouse.length > 0 && (() => {
          const nikahFamilies: string[] = [];
          const ummWaladFamilies: string[] = [];
          for (const familyId of person.familiesAsSpouse) {
            const family = data.families[familyId];
            if (!family) continue;
            if (family.isUmmWalad) ummWaladFamilies.push(familyId);
            else nikahFamilies.push(familyId);
          }

          const renderFamily = (familyId: string) => {
              const family = data.families[familyId];
              if (!family) return null;
              const spouseId = family.husband === personId ? family.wife : family.husband;
              const spouse = spouseId ? data.individuals[spouseId] : null;
              if (spouse?.isPrivate) return null;
              const spouseName = spouse ? getDisplayName(spouse) : null;
              const isUmmWaladFamily = family.isUmmWalad === true;
              const hasAnyEvent = !isUmmWaladFamily &&
                (family.marriageContract.date || family.marriageContract.hijriDate ||
                  family.marriage.date || family.marriage.hijriDate ||
                  family.isDivorced);

              return (
                <div key={familyId} className={styles.marriageBlock}>
                  <div className={styles.marriageBlockHeader}>
                    <span className={styles.marriageSpouseName}>
                      {spouseName ?? (isUmmWaladFamily ? 'غير محدد' : 'بدون زوج/زوجة')}
                      {isUmmWaladFamily && person.sex === 'M' && ' (أم ولد)'}
                    </span>
                    {canEdit && !person._pointed && !family._pointed && (
                      <div className={styles.marriageHeaderActions}>
                        <button
                          className={styles.marriageEditButton}
                          onClick={() => { setFormMode({ kind: 'editFamilyEvent', familyId }); setFormError(''); }}
                          aria-label={isUmmWaladFamily ? 'تعديل بيانات أم ولد' : 'تعديل أحداث الزواج'}
                          title={isUmmWaladFamily ? 'تعديل بيانات أم ولد' : 'تعديل أحداث الزواج'}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <button
                          className={styles.marriageUnlinkButton}
                          onClick={() => setUnlinkSpouseConfirm({ familyId, hasChildren: family.children.length > 0 })}
                          aria-label="فك ارتباط الزوج"
                          title="فك ارتباط الزوج"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M18.84 12.25l1.72-1.71a5 5 0 00-7.07-7.07l-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M5.16 11.75l-1.72 1.71a5 5 0 007.07 7.07l3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M2 2l20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                  {unlinkSpouseConfirm?.familyId === familyId && (
                    <div className={styles.unlinkConfirm}>
                      <span className={styles.unlinkConfirmText}>
                        {unlinkSpouseConfirm.hasChildren
                          ? 'سيتم فك ارتباط الزوج/الزوجة مع الاحتفاظ بالأبناء. هل تريد المتابعة؟'
                          : 'سيتم حذف سجل العائلة بالكامل. هل تريد المتابعة؟'}
                      </span>
                      <div className={styles.unlinkConfirmActions}>
                        <button
                          className={styles.unlinkConfirmYes}
                          onClick={async () => {
                            await unlinkSpouse(familyId);
                            setUnlinkSpouseConfirm(null);
                          }}
                          disabled={formLoading}
                        >
                          {formLoading ? 'جارٍ الحذف...' : 'نعم، فك الارتباط'}
                        </button>
                        <button
                          className={styles.unlinkConfirmNo}
                          onClick={() => setUnlinkSpouseConfirm(null)}
                          disabled={formLoading}
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}
                  {!isUmmWaladFamily && (family.marriageContract.date || family.marriageContract.hijriDate) && (
                    <MarriageEventDisplay
                      label="عقد القران"
                      event={family.marriageContract}
                      calendarPreference={calendarPreference}
                    />
                  )}
                  {!isUmmWaladFamily && (family.marriage.date || family.marriage.hijriDate) && (
                    <MarriageEventDisplay
                      label="الزفاف"
                      event={family.marriage}
                      calendarPreference={calendarPreference}
                    />
                  )}
                  {!isUmmWaladFamily && family.isDivorced && (family.divorce.date || family.divorce.hijriDate) && (
                    <MarriageEventDisplay
                      label="الانفصال"
                      event={family.divorce}
                      calendarPreference={calendarPreference}
                    />
                  )}
                  {!hasAnyEvent && !isUmmWaladFamily && (
                    <span className={styles.marriageEventPlace}>لا توجد بيانات</span>
                  )}
                </div>
              );
          };

          return (
            <>
              {nikahFamilies.length > 0 && (
                <div>
                  <h3 className={styles.sectionTitle}>معلومات الزواج</h3>
                  {nikahFamilies.map(renderFamily)}
                </div>
              )}
              {ummWaladFamilies.length > 0 && person.sex === 'M' && (
                <div>
                  <h3 className={styles.sectionTitle}>أمهات الأولاد</h3>
                  {ummWaladFamilies.map(renderFamily)}
                </div>
              )}
            </>
          );
        })()}

        {person.notes && (
          <div>
            <h3 className={styles.sectionTitle}>ملاحظات</h3>
            <div className={styles.notesContent}>{person.notes}</div>
          </div>
        )}

        {workspace?.enableAuditLog && workspace?.isAdmin && (
          <PersonAuditHistory
            workspaceId={workspace.workspaceId}
            personId={personId}
          />
        )}
      </div>

      {canEdit && !person._pointed && (
        <div className={styles.deleteSection}>
          {deleteState.kind === 'idle' ? (
            <button
              className={styles.deleteButton}
              onClick={handleDeleteClick}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              حذف الشخص
            </button>
          ) : deleteState.kind === 'loading' ? (
            <button className={styles.deleteButton} disabled>
              <span className={styles.deleteSpinner} />
              جارٍ التحقق...
            </button>
          ) : deleteState.kind === 'simpleConfirm' ? (
            <div className={styles.deleteConfirm}>
              <span className={styles.deleteConfirmText}>هل أنت متأكد؟</span>
              <div className={styles.deleteConfirmActions}>
                <button
                  className={styles.deleteConfirmYes}
                  onClick={() => handleCascadeConfirm()}
                >
                  نعم، احذف
                </button>
                <button
                  className={styles.deleteConfirmNo}
                  onClick={() => setDeleteState({ kind: 'idle' })}
                >
                  إلغاء
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {deleteState.kind === 'cascadeWarning' && (
        <CascadeDeleteModal
          isOpen
          onClose={() => setDeleteState({ kind: 'idle' })}
          onConfirm={(name) => handleCascadeConfirm(name)}
          personName={person.givenName || person.name}
          affectedCount={deleteState.impact.affectedCount}
          affectedNames={deleteState.impact.affectedNames}
          truncated={deleteState.impact.truncated}
          branchPointerCount={deleteState.impact.branchPointerCount}
        />
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
          allowBranchLink={formMode.kind !== 'edit' && !!workspace?.workspaceId}
          onBranchLink={handleBranchLink}
          relationshipType={
            formMode.kind === 'addChild' ? 'child'
              : formMode.kind === 'addSibling' ? 'sibling'
              : formMode.kind === 'addSpouse' ? 'spouse'
              : formMode.kind === 'addParent' ? 'parent'
              : undefined
          }
          anchorSex={person?.sex || ''}
          anchorName={person ? getDisplayName(person) : ''}
          enableUmmWalad={workspace?.enableUmmWalad}
          enableKunya={workspace?.enableKunya}
          isAddSpouse={formMode.kind === 'addSpouse'}
          ummWaladFamilyId={formMode.kind === 'edit' ? formMode.ummWaladFamilyId : undefined}
          ummWaladInitialValue={formMode.kind === 'edit' ? formMode.ummWaladInitialValue : undefined}
          ummWaladHasMarriageData={formMode.kind === 'edit' && ummWaladEditContext ? ummWaladEditContext.hasMarriageData : undefined}
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

      {familyPickerMode === 'moveSubtree' && person && (
        <MoveSubtreeModal
          isOpen
          onClose={() => setFamilyPickerMode(null)}
          onConfirm={handleMoveSubtreeConfirm}
          families={targetFamilies}
          personName={getDisplayName(person)}
          descendantCount={descendantCount}
          loading={formLoading}
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
          enableUmmWalad={workspace?.enableUmmWalad}
        />
      )}

      {(formMode?.kind === 'addRadaa' || formMode?.kind === 'editRadaa') && (
        <RadaaFamilyForm
          mode={formMode.kind === 'addRadaa' ? 'create' : 'edit'}
          initialData={
            formMode.kind === 'editRadaa' && data.radaFamilies?.[formMode.radaFamilyId]
              ? {
                  radaFamilyId: formMode.radaFamilyId,
                  fosterFatherId: data.radaFamilies[formMode.radaFamilyId].fosterFather,
                  fosterMotherId: data.radaFamilies[formMode.radaFamilyId].fosterMother,
                  childrenIds: data.radaFamilies[formMode.radaFamilyId].children,
                  notes: data.radaFamilies[formMode.radaFamilyId].notes,
                }
              : undefined
          }
          preselectedChildId={formMode.kind === 'addRadaa' ? personId : undefined}
          data={data}
          onSubmit={handleRadaaSubmit}
          onDelete={
            formMode.kind === 'editRadaa'
              ? () => handleRadaaDelete(formMode.radaFamilyId)
              : undefined
          }
          onCancel={() => { setFormMode(null); setFormError(''); }}
          isLoading={formLoading}
          error={formError}
        />
      )}

      {formMode?.kind === 'linkExistingSpouse' && data && (
        <Modal
          isOpen
          onClose={() => { setFormMode(null); setFormError(''); }}
          title={person.sex === 'M' ? 'ربط زوجة موجودة' : person.sex === 'F' ? 'ربط زوج موجود' : 'ربط زوج/زوجة'}
          contentClassName={styles.linkSpouseModalContent}
          actions={
            <>
              <Button variant="ghost" size="md" onClick={() => { setFormMode(null); setFormError(''); }}>
                إلغاء
              </Button>
              <Button
                variant="primary"
                size="md"
                disabled={!linkSpouseSelectedId || formLoading}
                onClick={() => {
                  if (linkSpouseSelectedId) {
                    handleLinkExistingSpouse(linkSpouseSelectedId);
                  }
                }}
              >
                {formLoading ? 'جارٍ الربط...' : 'ربط'}
              </Button>
            </>
          }
        >
          <IndividualPicker
            value={linkSpouseSelectedId}
            onChange={setLinkSpouseSelectedId}
            data={data}
            label={person.sex === 'M' ? 'اختر الزوجة' : person.sex === 'F' ? 'اختر الزوج' : 'اختر الشخص'}
            placeholder="ابحث عن شخص..."
            exclude={linkSpouseExcludeSet}
            sexFilter={person.sex === 'M' ? 'F' : person.sex === 'F' ? 'M' : undefined}
          />
          {formError && (
            <div className={styles.actionError}>{formError}</div>
          )}
        </Modal>
      )}
    </div>
  );
}
