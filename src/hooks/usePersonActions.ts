import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { Individual, GedcomData } from '@/lib/gedcom/types';
import type { IndividualFormData } from '@/components/tree/IndividualForm/IndividualForm';
import type { FamilyEventFormData } from '@/components/tree/FamilyEventForm/FamilyEventForm';
import type { MoveSubtreeOption } from '@/components/tree/MoveSubtreeModal';
import { apiFetch } from '@/lib/api/client';
import {
  serializeIndividualForm,
  getEditableSpouseFamilyIds,
  ancestorFamilyDisplayName,
  jumpBlocksParents,
} from '@/lib/person-detail-helpers';
import type { UndoEntry } from '@/lib/undo/types';
import { buildUndoLabel } from '@/lib/tree/undo-label';
import {
  buildUpdateIndividualInverse,
  buildCreateIndividualInverse,
  buildDeleteIndividualInverse,
  buildUpdateFamilyInverse,
  buildMoveChildInverse,
  buildCreateFamilyInverse,
  buildDeleteFamilyInverse,
  buildCreateRadaFamilyInverse,
  buildUpdateRadaFamilyInverse,
  buildDeleteRadaFamilyInverse,
  buildCreateAncestryJumpInverse,
  buildUpdateAncestryJumpInverse,
  buildDeleteAncestryJumpInverse,
  buildMoveJumpToNewFatherInverse,
  type Inverse,
} from '@/lib/tree/undo-builders';
import { fetchPersonSources } from '@/lib/tree/source-entries-api';
import { EMPTY_SOURCE_PLAN, isPlanEmpty, type SourcePlan, type SourcePlanResult } from '@/lib/tree/source-staging';
import { applySourcePlan, composeInverses, type AppliedSourcePlan } from '@/lib/tree/source-plan-apply';
import { notifySourcesChanged } from '@/hooks/usePersonSources';
import { toArabicDigits } from '@/components/sources/arabicDigits';
import {
  ANCESTRY_JUMP_ERROR_MESSAGES,
  JUMP_BLOCKS_PARENTS_MESSAGE,
  validateJumpDescendant,
} from '@/lib/tree/ancestry-jump-validators';

// ---------------------------------------------------------------------------
// Cascade delete impact data
// ---------------------------------------------------------------------------

export interface CascadeImpactData {
  affectedCount: number;
  affectedNames: string[];
  truncated: boolean;
  branchPointerCount: number;
  versionHash: string;
}

export type DeleteState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'simpleConfirm' }
  | { kind: 'cascadeWarning'; impact: CascadeImpactData };

// ---------------------------------------------------------------------------
// Types for the form modal state machine
// ---------------------------------------------------------------------------

export type FormMode =
  | { kind: 'edit'; ummWaladFamilyId?: string; ummWaladInitialValue?: boolean }
  | { kind: 'addChild'; targetFamilyId?: string }
  | { kind: 'addSpouse'; lockedSex?: 'M' | 'F' }
  | { kind: 'linkExistingSpouse' }
  /** `moveJumpId`: the person carries this «قفزة نسب»; the new father takes it over. */
  | { kind: 'addParent'; lockedSex?: 'M' | 'F'; moveJumpId?: string }
  | { kind: 'addSibling'; targetFamilyId: string }
  | { kind: 'editFamilyEvent'; familyId: string; isUmmWalad?: boolean }
  | { kind: 'addRadaa' }
  | { kind: 'editRadaa'; radaFamilyId: string }
  | { kind: 'ancestryJump' }
  | { kind: 'editAncestryJump'; jumpId: string };

// ---------------------------------------------------------------------------
// «قفزة نسب» (ancestry jump) form data
//
// The link always points at a FAMILY — a single known ancestor is a one-spouse
// family, exactly as `handleAddParentSubmit` already builds for a single known
// parent. The three sources differ only in how that family comes to exist:
//   newPerson      — create the ancestor, then his couple, then the jump;
//   existingPerson — the ancestor is already in the tree but has no family, so
//                    one is minted for him silently;
//   existingFamily — the couple already exists; one call, nothing else touched.
// ---------------------------------------------------------------------------

export interface AncestryJumpFields {
  generationsMin: number | null;
  generationsMax: number | null;
  notes: string;
}

export type AncestryJumpSubmitPayload =
  | ({ source: 'newPerson'; individual: IndividualFormData } & AncestryJumpFields)
  | ({ source: 'existingPerson'; ancestorPersonId: string } & AncestryJumpFields)
  | ({ source: 'existingFamily'; ancestorFamilyId: string } & AncestryJumpFields);

// ---------------------------------------------------------------------------
// Rada'a form data
// ---------------------------------------------------------------------------

export interface RadaaFormData {
  fosterFatherId: string | null;
  fosterMotherId: string | null;
  childrenIds: string[];
  notes: string;
}

// ---------------------------------------------------------------------------
// Hook params and return type
// ---------------------------------------------------------------------------

interface WorkspaceContext {
  workspaceId: string;
  canEdit: boolean;
  /** Workspace admin — decides the level a restored source entry keeps. */
  isAdmin?: boolean;
  refreshTree: () => Promise<void>;
  /** When set, mutations target this `extra` tree; absent ⇒ the main tree. */
  activeTreeId?: string;
}

export interface UsePersonActionsParams {
  personId: string;
  workspace: WorkspaceContext | null;
  person: Individual | undefined;
  data: GedcomData | null | undefined;
  setSelectedPersonId: (id: string | null) => void;
  /** Phase 15a: called with an undo entry after each successful mutation + refresh. */
  onPushUndo?: (entry: UndoEntry) => void;
  /** A short message for the user (a toast) — sources saved with the person form. */
  onNotice?: (message: string) => void;
}

/** A person-form submit: the form data plus the staged «المصادر» plan. */
export type PersonFormSubmit = (
  formData: IndividualFormData,
  sourcePlan?: SourcePlan,
) => Promise<SourcePlanResult | void>;

const SOURCES_PARTIAL_FAILURE = 'حُفظت بيانات الشخص، وتعذّر حفظ بعض المصادر. اضغط «حفظ» لإعادة المحاولة.';
const SOURCE_ADMINS_ONLY_NOTICE = 'أُضيف المصدر، ويراه المشرفون فقط.';
const sourcesCreateFailedNotice = (n: number) =>
  `أُضيف الشخص، وتعذّر حفظ ${toArabicDigits(n)} من المصادر. أضِفها من لوحة الشخص.`;

/**
 * A person-create undo when sources were saved with the person: take the
 * sources back off FIRST (a source outlives its people, so deleting the
 * person alone would leave «ليس مصدرًا لأحد» orphans), then the person.
 * A redo could not bring them back, so the entry is undo-only.
 */
function withQueuedSources(entry: UndoEntry, undoSources: Inverse['undo'] | null): UndoEntry {
  if (!undoSources) return entry;
  return {
    ...entry,
    undoOnly: true,
    undo: async () => {
      await undoSources();
      await entry.undo();
    },
  };
}

export interface UsePersonActionsReturn {
  formMode: FormMode | null;
  setFormMode: (mode: FormMode | null) => void;
  formLoading: boolean;
  setFormLoading: (loading: boolean) => void;
  formError: string;
  setFormError: (error: string) => void;
  deleteState: DeleteState;
  setDeleteState: (state: DeleteState) => void;
  handleEditSubmit: PersonFormSubmit;
  handleAddChildSubmit: PersonFormSubmit;
  handleAddSpouseSubmit: PersonFormSubmit;
  handleAddParentSubmit: PersonFormSubmit;
  handleAddSiblingSubmit: PersonFormSubmit;
  handleFamilyEventSubmit: (eventData: FamilyEventFormData) => Promise<void>;
  handleLinkExistingSpouse: (existingPersonId: string) => Promise<void>;
  handleRadaaSubmit: (data: RadaaFormData) => Promise<void>;
  handleRadaaDelete: (radaFamilyId: string) => Promise<void>;
  handleAncestryJumpSubmit: (payload: AncestryJumpSubmitPayload) => Promise<void>;
  handleAncestryJumpUpdate: (jumpId: string, fields: AncestryJumpFields) => Promise<void>;
  handleAncestryJumpDelete: (jumpId: string) => Promise<void>;
  handleDeleteClick: () => Promise<void>;
  handleCascadeConfirm: (confirmationName?: string) => Promise<void>;
  unlinkSpouse: (familyId: string) => Promise<void>;
  moveSubtree: (option: MoveSubtreeOption, options?: { orphanIds?: string[] }) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function usePersonActions({
  personId,
  workspace,
  person,
  data,
  setSelectedPersonId,
  onPushUndo,
  onNotice,
}: UsePersonActionsParams): UsePersonActionsReturn {
  // Pointed individuals are read-only — block all mutations
  const isPointed = person?._pointed === true;

  // When editing an `extra` tree, every mutation body must carry its `treeId`
  // so the API targets that tree instead of the workspace main tree. Absent
  // ⇒ no `treeId` field (the main-tree default is unchanged).
  const activeTreeId = workspace?.activeTreeId;
  const withTreeId = useCallback(
    <T extends Record<string, unknown>>(body: T): T & { treeId?: string } =>
      activeTreeId ? { ...body, treeId: activeTreeId } : body,
    [activeTreeId],
  );

  // DELETE requests carry no JSON body on the main tree, but when editing an
  // `extra` tree they must send `{ treeId }`. Spread this into an `apiFetch`
  // options object: `{ method: 'DELETE', ...deleteInit }`. Empty (no body) when
  // on the main tree, preserving the main-tree default.
  const deleteInit = useMemo(
    () =>
      activeTreeId
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ treeId: activeTreeId }) }
        : {},
    [activeTreeId],
  );

  // Form modal state
  const [formModeRaw, setFormModeRaw] = useState<FormMode | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete state machine
  const [deleteState, setDeleteState] = useState<DeleteState>({ kind: 'idle' });

  // Guarded setFormMode — no-op when person is pointed
  const formMode = formModeRaw;
  const setFormMode = useCallback((mode: FormMode | null) => {
    if (isPointed && mode !== null) return;
    setFormModeRaw(mode);
  }, [isPointed]);

  // -------------------------------------------------------------------------
  // Internal API helpers
  // -------------------------------------------------------------------------

  const createIndividual = useCallback(async (formData: IndividualFormData) => {
    if (!workspace) throw new Error('No workspace context');
    const res = await apiFetch(`/api/workspaces/${workspace.workspaceId}/tree/individuals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withTreeId(serializeIndividualForm(formData))),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error ?? 'حدث خطأ');
    }
    const json = await res.json();
    return json.data as { id: string };
  }, [workspace, withTreeId]);

  const createFamily = useCallback(async (opts: { husbandId?: string; wifeId?: string; childrenIds?: string[] }) => {
    if (!workspace) throw new Error('No workspace context');
    const res = await apiFetch(`/api/workspaces/${workspace.workspaceId}/tree/families`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withTreeId(opts)),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error ?? 'حدث خطأ');
    }
    const json = await res.json();
    return json.data as { id: string };
  }, [workspace, withTreeId]);

  const addChildToFamily = useCallback(async (familyId: string, individualId: string) => {
    if (!workspace) throw new Error('No workspace context');
    const res = await apiFetch(`/api/workspaces/${workspace.workspaceId}/tree/families/${familyId}/children`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withTreeId({ individualId })),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error ?? 'حدث خطأ');
    }
  }, [workspace, withTreeId]);

  const patchFamily = useCallback(async (familyId: string, patch: { husbandId?: string | null; wifeId?: string | null }) => {
    if (!workspace) throw new Error('No workspace context');
    const res = await apiFetch(`/api/workspaces/${workspace.workspaceId}/tree/families/${familyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withTreeId(patch)),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error ?? 'حدث خطأ');
    }
  }, [workspace, withTreeId]);

  // -------------------------------------------------------------------------
  // Shared form action wrapper — handles loading, error, and refresh
  // -------------------------------------------------------------------------

  const withFormAction = useCallback(async (action: () => Promise<void>) => {
    setFormLoading(true);
    setFormError('');
    try {
      await action();
      await workspace!.refreshTree();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setFormLoading(false);
    }
  }, [workspace]);

  // -------------------------------------------------------------------------
  // «المصادر» staged in the person form
  // -------------------------------------------------------------------------

  // After a partly-failed edit save the person is already stored; a retry with
  // the same person data sends only the sources that failed.
  const savedPersonKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (formModeRaw === null) savedPersonKeyRef.current = null;
  }, [formModeRaw]);

  const runSourcePlan = useCallback(
    async (individualId: string, plan: SourcePlan): Promise<AppliedSourcePlan> => {
      const applied = await applySourcePlan({
        workspaceId: workspace!.workspaceId,
        individualId,
        treeId: activeTreeId,
        isAdmin: workspace!.isAdmin === true,
        plan,
      });
      // A non-admin cannot see what they saved at «المشرفون فقط» — say so once.
      if (applied.createdAdminsOnly > 0 && workspace!.isAdmin !== true) onNotice?.(SOURCE_ADMINS_ONLY_NOTICE);
      if (applied.createdCount + applied.result.deleted.length + Object.keys(applied.result.updated).length > 0
        || Object.keys(applied.result.removedFileIds ?? {}).length > 0) {
        notifySourcesChanged();
      }
      return applied;
    },
    [workspace, activeTreeId, onNotice],
  );

  /**
   * Create modes: the queued sources (new ones and reused ones) go on the
   * person just created. The form has already closed; failures are a toast.
   * Returns what takes them back off (for the person-create undo), or null
   * when nothing was saved.
   */
  const saveQueuedSources = useCallback(
    async (individualId: string, plan: SourcePlan | undefined): Promise<Inverse['undo'] | null> => {
      if (!workspace || !plan || plan.creates.length + plan.links.length === 0) return null;
      const applied = await runSourcePlan(individualId, {
        ...EMPTY_SOURCE_PLAN,
        creates: plan.creates,
        links: plan.links,
      });
      if (applied.failedCount > 0) onNotice?.(sourcesCreateFailedNotice(applied.failedCount));
      if (applied.createdCount === 0) return null;
      const all = [...applied.inverses, ...applied.undoOnlyInverses];
      return async () => {
        // Best-effort, newest first: the person undo runs either way.
        for (const inverse of all.reverse()) await inverse.undo().catch(() => undefined);
        notifySourcesChanged();
      };
    },
    [workspace, runSourcePlan, onNotice],
  );

  // -------------------------------------------------------------------------
  // Form submit handlers
  // -------------------------------------------------------------------------

  const handleEditSubmit = useCallback(async (formData: IndividualFormData, sourcePlan?: SourcePlan) => {
    if (!workspace || isPointed) return;
    // Capture before-snapshot (for undo) from the current person BEFORE the API call.
    const beforeSnapshot = person ? serializeIndividualForm({
      givenName: person.givenName,
      surname: person.surname,
      sex: person.sex ?? '',
      birthDate: person.birth,
      birthPlace: person.birthPlace,
      birthPlaceId: person.birthPlaceId ?? null,
      birthDescription: person.birthDescription,
      birthNotes: person.birthNotes,
      birthHijriDate: person.birthHijriDate,
      deathDate: person.death,
      deathPlace: person.deathPlace,
      deathPlaceId: person.deathPlaceId ?? null,
      deathDescription: person.deathDescription,
      deathNotes: person.deathNotes,
      deathHijriDate: person.deathHijriDate,
      kunya: person.kunya,
      isDeceased: person.isDeceased,
      isPrivate: person.isPrivate,
      notes: person.notes,
    }) : null;
    const afterSnapshot = serializeIndividualForm(formData);
    const personName = person?.name;
    const personKey = JSON.stringify([afterSnapshot, formData.isUmmWalad ?? null]);
    // A retry after a partly-failed save: the person is already stored.
    const skipPerson = savedPersonKeyRef.current === personKey;
    let succeeded = false;
    let personSaved = false;
    let applied: AppliedSourcePlan | null = null;
    let retryResult: SourcePlanResult | undefined;
    await withFormAction(async () => {
      if (!skipPerson) {
      const res = await apiFetch(`/api/workspaces/${workspace.workspaceId}/tree/individuals/${personId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withTreeId(afterSnapshot)),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'حدث خطأ');
      }
      // Update family isUmmWalad if changed
      if (formMode?.kind === 'edit' && formMode.ummWaladFamilyId) {
        const newVal = formData.isUmmWalad ?? false;
        const oldVal = formMode.ummWaladInitialValue ?? false;
        if (newVal !== oldVal) {
          const famRes = await apiFetch(
            `/api/workspaces/${workspace.workspaceId}/tree/families/${formMode.ummWaladFamilyId}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(withTreeId({ isUmmWalad: newVal })),
            },
          );
          if (!famRes.ok) {
            const json = await famRes.json();
            throw new Error(json.error ?? 'حدث خطأ');
          }
        }
      }
      personSaved = true;
      }
      // Sources only after the person saved: creates → updates → deletes.
      if (sourcePlan && !isPlanEmpty(sourcePlan)) {
        applied = await runSourcePlan(personId, sourcePlan);
        if (applied.failedCount > 0) {
          // Keep the form open: the failed rows stay staged for a retry.
          savedPersonKeyRef.current = personKey;
          retryResult = applied.result;
          setFormError(SOURCES_PARTIAL_FAILURE);
          succeeded = true;
          return;
        }
      }
      succeeded = true;
      setFormMode(null);
    });
    if (!succeeded || !onPushUndo) return retryResult;
    // ONE undo step for this «حفظ»: the person edit plus the reversible source work.
    const parts = [];
    if (personSaved && beforeSnapshot) {
      parts.push(buildUpdateIndividualInverse({
        workspaceId: workspace.workspaceId,
        individualId: personId,
        before: beforeSnapshot,
        after: afterSnapshot,
        treeId: activeTreeId,
      }));
    }
    const sourceWork = applied as AppliedSourcePlan | null;
    if (sourceWork) parts.push(...sourceWork.inverses);
    if (parts.length > 0) {
      const inverse = sourceWork ? composeInverses(parts) : parts[0];
      onPushUndo({
        label: buildUndoLabel({ kind: 'updateIndividual', name: personName }),
        workspaceId: workspace.workspaceId,
        undo: sourceWork ? async () => { await inverse.undo(); notifySourcesChanged(); } : inverse.undo,
        redo: sourceWork ? async () => { await inverse.redo(); notifySourcesChanged(); } : inverse.redo,
        ...(sourceWork?.involvedFiles ? { undoOnly: true } : {}),
      });
    }
    return retryResult;
  }, [workspace, personId, isPointed, formMode, withFormAction, withTreeId, activeTreeId, person, onPushUndo, runSourcePlan]);

  const handleAddChildSubmit = useCallback(async (formData: IndividualFormData, sourcePlan?: SourcePlan) => {
    if (!workspace || !person || !data || isPointed) return;
    let succeeded = false;
    let newIndividualId: string | null = null;
    const childName = formData.givenName;
    const createPayload = serializeIndividualForm(formData);
    await withFormAction(async () => {
      const newPerson = await createIndividual(formData);
      newIndividualId = newPerson.id;

      // Use the target family from the form mode, or the first NATIVE family.
      // Synthetic branch-pointer stitch families (the anchor's grafted-children
      // family) are excluded — they're read-only and their id is not a UUID, so
      // adding a child to one crashes the DB. When the person's only family is
      // synthetic (e.g. a pointer anchor), fall through to create a native one.
      const targetFamilyId = formMode?.kind === 'addChild' ? formMode.targetFamilyId : undefined;
      const editableFamilyIds = getEditableSpouseFamilyIds(person, data);

      if (targetFamilyId) {
        await addChildToFamily(targetFamilyId, newPerson.id);
      } else if (editableFamilyIds.length > 0) {
        await addChildToFamily(editableFamilyIds[0], newPerson.id);
      } else {
        // No native family exists — create one with current person as spouse and new person as child
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

      succeeded = true;
      setFormMode(null);
    });
    const undoSources = succeeded && newIndividualId ? await saveQueuedSources(newIndividualId, sourcePlan) : null;
    if (succeeded && onPushUndo && newIndividualId) {
      const inverse = buildCreateIndividualInverse({
        workspaceId: workspace.workspaceId,
        createdId: newIndividualId,
        createPayload,
        treeId: activeTreeId,
      });
      onPushUndo(withQueuedSources({
        label: buildUndoLabel({ kind: 'addChild', name: childName }),
        workspaceId: workspace.workspaceId,
        undo: inverse.undo,
        redo: inverse.redo,
      }, undoSources));
    }
  }, [workspace, person, data, personId, formMode, createIndividual, addChildToFamily, createFamily, isPointed, withFormAction, activeTreeId, onPushUndo, saveQueuedSources]);

  const handleAddSpouseSubmit = useCallback(async (formData: IndividualFormData, sourcePlan?: SourcePlan) => {
    if (!workspace || !person || isPointed) return;
    let succeeded = false;
    let newIndividualId: string | null = null;
    let newFamilyId: string | null = null;
    const spouseName = formData.givenName;
    const spouseSex: 'M' | 'F' = formData.sex === 'F' ? 'F' : 'M';
    await withFormAction(async () => {
      const newPerson = await createIndividual(formData);
      newIndividualId = newPerson.id;

      // Create family with both spouses
      const familyOpts: { husbandId?: string; wifeId?: string; isUmmWalad?: boolean } = {};
      if (person.sex === 'F') {
        familyOpts.wifeId = personId;
        familyOpts.husbandId = newPerson.id;
      } else {
        familyOpts.husbandId = personId;
        familyOpts.wifeId = newPerson.id;
      }
      if (formData.isUmmWalad) {
        familyOpts.isUmmWalad = true;
      }
      const newFamily = await createFamily(familyOpts);
      newFamilyId = newFamily.id;

      if (formData.isUmmWalad) {
        // Umm walad has no marriage events — just close the form
        setFormMode(null);
      } else {
        // Auto-open family event form so user can fill marriage info in the same flow
        setFormMode({ kind: 'editFamilyEvent', familyId: newFamily.id });
      }
      setFormError('');
      succeeded = true;
    });
    const undoSources = succeeded && newIndividualId ? await saveQueuedSources(newIndividualId, sourcePlan) : null;
    if (succeeded && onPushUndo && newIndividualId && newFamilyId) {
      const capturedIndividualId = newIndividualId;
      const capturedFamilyId = newFamilyId;
      const wsId = workspace.workspaceId;
      onPushUndo(withQueuedSources({
        label: buildUndoLabel({ kind: 'addSpouse', sex: spouseSex, name: spouseName }),
        workspaceId: wsId,
        undo: async () => {
          // Delete family first (it refers to both individuals), then the new individual.
          const famRes = await apiFetch(`/api/workspaces/${wsId}/tree/families/${capturedFamilyId}`, {
            method: 'DELETE',
            isUndo: true,
            ...deleteInit,
          });
          if (!famRes.ok && famRes.status !== 204) {
            const json = await famRes.json();
            throw new Error(json.error ?? `undo API error: ${famRes.status}`);
          }
          const indRes = await apiFetch(`/api/workspaces/${wsId}/tree/individuals/${capturedIndividualId}`, {
            method: 'DELETE',
            isUndo: true,
            ...deleteInit,
          });
          if (!indRes.ok && indRes.status !== 204) {
            const json = await indRes.json();
            throw new Error(json.error ?? `undo API error: ${indRes.status}`);
          }
        },
        redo: async () => {
          // Re-create individual then family with new spouse slot.
          const indRes = await apiFetch(`/api/workspaces/${wsId}/tree/individuals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(withTreeId(serializeIndividualForm(formData))),
            isUndo: true,
          });
          if (!indRes.ok) throw new Error(`undo API error: ${indRes.status}`);
          const newInd = (await indRes.json()).data as { id: string };
          const famOpts: { husbandId?: string; wifeId?: string; isUmmWalad?: boolean } = {};
          if (person.sex === 'F') { famOpts.wifeId = personId; famOpts.husbandId = newInd.id; }
          else { famOpts.husbandId = personId; famOpts.wifeId = newInd.id; }
          if (formData.isUmmWalad) famOpts.isUmmWalad = true;
          const famRes = await apiFetch(`/api/workspaces/${wsId}/tree/families`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(withTreeId(famOpts)),
            isUndo: true,
          });
          if (!famRes.ok) throw new Error(`undo API error: ${famRes.status}`);
        },
      }, undoSources));
    }
  }, [workspace, person, personId, createIndividual, createFamily, isPointed, withFormAction, withTreeId, activeTreeId, deleteInit, onPushUndo, saveQueuedSources]);

  const handleLinkExistingSpouse = useCallback(async (existingPersonId: string) => {
    if (!workspace || !person || isPointed) return;
    let succeeded = false;
    let newFamilyId: string | null = null;
    let createPayload: { husbandId?: string; wifeId?: string } = {};
    const existingPerson = data?.individuals[existingPersonId];
    const spouseSex: 'M' | 'F' = existingPerson?.sex === 'F' ? 'F' : 'M';
    const spouseName = existingPerson?.name;
    await withFormAction(async () => {
      const familyOpts: { husbandId?: string; wifeId?: string } = {};
      if (person.sex === 'F') {
        familyOpts.wifeId = personId;
        familyOpts.husbandId = existingPersonId;
      } else {
        familyOpts.husbandId = personId;
        familyOpts.wifeId = existingPersonId;
      }
      createPayload = familyOpts;
      const newFamily = await createFamily(familyOpts);
      newFamilyId = newFamily.id;
      setFormMode({ kind: 'editFamilyEvent', familyId: newFamily.id });
      setFormError('');
      succeeded = true;
    });
    if (succeeded && onPushUndo && newFamilyId) {
      const inverse = buildCreateFamilyInverse({
        workspaceId: workspace.workspaceId,
        createdId: newFamilyId,
        createPayload: createPayload as Record<string, unknown>,
        treeId: activeTreeId,
      });
      onPushUndo({
        label: buildUndoLabel({ kind: 'linkExistingSpouse', sex: spouseSex, name: spouseName }),
        workspaceId: workspace.workspaceId,
        undo: inverse.undo,
        redo: inverse.redo,
      });
    }
  }, [workspace, person, personId, createFamily, isPointed, withFormAction, data, activeTreeId, onPushUndo]);

  /**
   * «إضافة أب» on a person who carries a «قفزة نسب»: ONE atomic server call
   * creates the father and his couple and re-points the jump to him (range
   * shrunk by one). ONE undo entry — undo is the server's move-back.
   */
  const handleMoveJumpToNewFather = useCallback(async (jumpId: string, formData: IndividualFormData, sourcePlan?: SourcePlan) => {
    if (!workspace || !person || !data || isPointed) return;
    const jump = data.ancestryJumps?.[jumpId];
    if (!jump) return;
    const wsId = workspace.workspaceId;
    // A mother never takes a jump over — the form is male-locked, and this is
    // the belt to that brace.
    const fatherPayload = { ...serializeIndividualForm(formData), sex: 'M' };
    const preMoveRange = { generationsMin: jump.generationsMin, generationsMax: jump.generationsMax };
    // Declared via `as` so TS does not narrow it to `null` — it is assigned
    // inside the `withFormAction` closure.
    let moved = null as { individual: { id: string }; family: { id: string } } | null;
    await withFormAction(async () => {
      const res = await apiFetch(`/api/workspaces/${wsId}/tree/ancestry-jumps/${jumpId}/move-to-new-father`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withTreeId({ father: fatherPayload })),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'حدث خطأ');
      }
      moved = (await res.json()).data;
      setFormMode(null);
    });
    if (!moved) return;
    const movedIds = moved as { individual: { id: string }; family: { id: string } };
    const undoSources = await saveQueuedSources(movedIds.individual.id, sourcePlan);
    if (!onPushUndo) return;
    const inverse = buildMoveJumpToNewFatherInverse({
      workspaceId: wsId,
      jumpId,
      fatherId: moved.individual.id,
      familyId: moved.family.id,
      childId: personId,
      fatherPayload,
      preMoveRange,
      treeId: activeTreeId,
    });
    onPushUndo(withQueuedSources({
      label: buildUndoLabel({ kind: 'moveAncestryJumpToFather', name: formData.givenName }),
      workspaceId: wsId,
      undo: inverse.undo,
      redo: inverse.redo,
    }, undoSources));
  }, [workspace, person, data, personId, isPointed, withFormAction, withTreeId, setFormMode, activeTreeId, onPushUndo, saveQueuedSources]);

  const handleAddParentSubmit = useCallback(async (formData: IndividualFormData, sourcePlan?: SourcePlan) => {
    if (!workspace || !person || !data || isPointed) return;
    if (formMode?.kind === 'addParent' && formMode.moveJumpId) {
      await handleMoveJumpToNewFather(formMode.moveJumpId, formData, sourcePlan);
      return;
    }
    let succeeded = false;
    let newIndividualId: string | null = null;
    let patchedFamilyId: string | null = null;
    let createdFamilyId: string | null = null;
    const parentName = formData.givenName;
    const parentSex: 'M' | 'F' = formData.sex === 'F' ? 'F' : 'M';
    const existingFamilyAsChild = person.familyAsChild;
    await withFormAction(async () => {
      const newPerson = await createIndividual(formData);
      newIndividualId = newPerson.id;
      const newSex = formData.sex;

      if (existingFamilyAsChild) {
        // Update existing family — set husband or wife
        const patch: { husbandId?: string; wifeId?: string } = {};
        if (newSex === 'F') {
          patch.wifeId = newPerson.id;
        } else {
          patch.husbandId = newPerson.id;
        }
        await patchFamily(existingFamilyAsChild, patch);
        patchedFamilyId = existingFamilyAsChild;
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
        const newFam = await createFamily(familyOpts);
        createdFamilyId = newFam.id;
      }

      setFormMode(null);
      succeeded = true;
    });
    const undoSources = succeeded && newIndividualId ? await saveQueuedSources(newIndividualId, sourcePlan) : null;
    if (succeeded && onPushUndo && newIndividualId) {
      const wsId = workspace.workspaceId;
      const capturedInd = newIndividualId;
      const capturedPatchedFam = patchedFamilyId;
      const capturedCreatedFam = createdFamilyId;
      onPushUndo(withQueuedSources({
        label: buildUndoLabel({ kind: 'addParent', sex: parentSex, name: parentName }),
        workspaceId: wsId,
        undo: async () => {
          // Reverse the structural op first, then delete the new individual.
          if (capturedPatchedFam) {
            const patch = parentSex === 'F' ? { wifeId: null } : { husbandId: null };
            const r = await apiFetch(`/api/workspaces/${wsId}/tree/families/${capturedPatchedFam}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(withTreeId(patch)),
              isUndo: true,
            });
            if (!r.ok) throw new Error(`undo API error: ${r.status}`);
          } else if (capturedCreatedFam) {
            const r = await apiFetch(`/api/workspaces/${wsId}/tree/families/${capturedCreatedFam}`, {
              method: 'DELETE',
              isUndo: true,
              ...deleteInit,
            });
            if (!r.ok && r.status !== 204) throw new Error(`undo API error: ${r.status}`);
          }
          const indRes = await apiFetch(`/api/workspaces/${wsId}/tree/individuals/${capturedInd}`, {
            method: 'DELETE',
            isUndo: true,
            ...deleteInit,
          });
          if (!indRes.ok && indRes.status !== 204) throw new Error(`undo API error: ${indRes.status}`);
        },
        redo: async () => {
          const indRes = await apiFetch(`/api/workspaces/${wsId}/tree/individuals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(withTreeId(serializeIndividualForm(formData))),
            isUndo: true,
          });
          if (!indRes.ok) throw new Error(`undo API error: ${indRes.status}`);
          const newInd = (await indRes.json()).data as { id: string };
          if (capturedPatchedFam) {
            const patch = parentSex === 'F' ? { wifeId: newInd.id } : { husbandId: newInd.id };
            const r = await apiFetch(`/api/workspaces/${wsId}/tree/families/${capturedPatchedFam}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(withTreeId(patch)),
              isUndo: true,
            });
            if (!r.ok) throw new Error(`undo API error: ${r.status}`);
          } else {
            const famOpts: { husbandId?: string; wifeId?: string; childrenIds: string[] } = {
              childrenIds: [personId],
            };
            if (parentSex === 'F') famOpts.wifeId = newInd.id;
            else famOpts.husbandId = newInd.id;
            const r = await apiFetch(`/api/workspaces/${wsId}/tree/families`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(withTreeId(famOpts)),
              isUndo: true,
            });
            if (!r.ok) throw new Error(`undo API error: ${r.status}`);
          }
        },
      }, undoSources));
    }
  }, [workspace, person, data, personId, formMode, handleMoveJumpToNewFather, createIndividual, patchFamily, createFamily, isPointed, withFormAction, withTreeId, activeTreeId, deleteInit, onPushUndo, saveQueuedSources]);

  const handleAddSiblingSubmit = useCallback(async (formData: IndividualFormData, sourcePlan?: SourcePlan) => {
    if (!workspace || formMode?.kind !== 'addSibling' || isPointed) return;
    let succeeded = false;
    let newIndividualId: string | null = null;
    const childName = formData.givenName;
    const createPayload = serializeIndividualForm(formData);
    await withFormAction(async () => {
      const newPerson = await createIndividual(formData);
      newIndividualId = newPerson.id;
      await addChildToFamily(formMode.targetFamilyId, newPerson.id);
      setFormMode(null);
      succeeded = true;
    });
    const undoSources = succeeded && newIndividualId ? await saveQueuedSources(newIndividualId, sourcePlan) : null;
    if (succeeded && onPushUndo && newIndividualId) {
      const inverse = buildCreateIndividualInverse({
        workspaceId: workspace.workspaceId,
        createdId: newIndividualId,
        createPayload,
        treeId: activeTreeId,
      });
      onPushUndo(withQueuedSources({
        label: buildUndoLabel({ kind: 'addChild', name: childName }),
        workspaceId: workspace.workspaceId,
        undo: inverse.undo,
        redo: inverse.redo,
      }, undoSources));
    }
  }, [workspace, formMode, createIndividual, addChildToFamily, isPointed, withFormAction, activeTreeId, onPushUndo, saveQueuedSources]);

  const handleFamilyEventSubmit = useCallback(async (eventData: FamilyEventFormData) => {
    if (!workspace || formMode?.kind !== 'editFamilyEvent' || isPointed) return;
    const familyId = formMode.familyId;
    const existingFamily = data?.families[familyId];
    const beforePayload: Record<string, unknown> | null = existingFamily ? {
      isUmmWalad: existingFamily.isUmmWalad ?? false,
      marriageContractDate: existingFamily.marriageContract.date || null,
      marriageContractHijriDate: existingFamily.marriageContract.hijriDate || null,
      marriageContractPlace: existingFamily.marriageContract.place || null,
      marriageContractPlaceId: existingFamily.marriageContract.placeId ?? null,
      marriageContractDescription: existingFamily.marriageContract.description || null,
      marriageContractNotes: existingFamily.marriageContract.notes || null,
      marriageDate: existingFamily.marriage.date || null,
      marriageHijriDate: existingFamily.marriage.hijriDate || null,
      marriagePlace: existingFamily.marriage.place || null,
      marriagePlaceId: existingFamily.marriage.placeId ?? null,
      marriageDescription: existingFamily.marriage.description || null,
      marriageNotes: existingFamily.marriage.notes || null,
      isDivorced: existingFamily.isDivorced,
      divorceDate: existingFamily.divorce.date || null,
      divorceHijriDate: existingFamily.divorce.hijriDate || null,
      divorcePlace: existingFamily.divorce.place || null,
      divorcePlaceId: existingFamily.divorce.placeId ?? null,
      divorceDescription: existingFamily.divorce.description || null,
      divorceNotes: existingFamily.divorce.notes || null,
    } : null;
    const afterPayload: Record<string, unknown> = {
      isUmmWalad: eventData.isUmmWalad ?? false,
      marriageContractDate: eventData.marriageContractDate || null,
      marriageContractHijriDate: eventData.marriageContractHijriDate || null,
      marriageContractPlace: eventData.marriageContractPlace || null,
      marriageContractPlaceId: eventData.marriageContractPlaceId ?? null,
      marriageContractDescription: eventData.marriageContractDescription || null,
      marriageContractNotes: eventData.marriageContractNotes || null,
      marriageDate: eventData.marriageDate || null,
      marriageHijriDate: eventData.marriageHijriDate || null,
      marriagePlace: eventData.marriagePlace || null,
      marriagePlaceId: eventData.marriagePlaceId ?? null,
      marriageDescription: eventData.marriageDescription || null,
      marriageNotes: eventData.marriageNotes || null,
      isDivorced: eventData.isDivorced,
      divorceDate: eventData.divorceDate || null,
      divorceHijriDate: eventData.divorceHijriDate || null,
      divorcePlace: eventData.divorcePlace || null,
      divorcePlaceId: eventData.divorcePlaceId ?? null,
      divorceDescription: eventData.divorceDescription || null,
      divorceNotes: eventData.divorceNotes || null,
    };
    let succeeded = false;
    await withFormAction(async () => {
      const res = await apiFetch(`/api/workspaces/${workspace.workspaceId}/tree/families/${familyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withTreeId(afterPayload)),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'حدث خطأ');
      }
      setFormMode(null);
      succeeded = true;
    });
    if (succeeded && onPushUndo && beforePayload) {
      // Pick the most meaningful event type for the label.
      let eventType: 'MARC' | 'MARR' | 'DIV' | undefined;
      if (eventData.isDivorced || eventData.divorceDate || eventData.divorceHijriDate) {
        eventType = 'DIV';
      } else if (eventData.marriageDate || eventData.marriageHijriDate) {
        eventType = 'MARR';
      } else if (eventData.marriageContractDate || eventData.marriageContractHijriDate) {
        eventType = 'MARC';
      }
      const inverse = buildUpdateFamilyInverse({
        workspaceId: workspace.workspaceId,
        familyId,
        before: beforePayload,
        after: afterPayload,
        treeId: activeTreeId,
      });
      onPushUndo({
        label: buildUndoLabel({ kind: 'editMarriageEvent', eventType }),
        workspaceId: workspace.workspaceId,
        undo: inverse.undo,
        redo: inverse.redo,
      });
    }
  }, [workspace, formMode, isPointed, withFormAction, withTreeId, data, activeTreeId, onPushUndo]);

  // -------------------------------------------------------------------------
  // Rada'a (foster nursing) handlers
  // -------------------------------------------------------------------------

  const handleRadaaSubmit = useCallback(async (radaData: RadaaFormData) => {
    if (!workspace || isPointed) return;
    const isEdit = formMode?.kind === 'editRadaa';
    const radaFamilyId = isEdit ? formMode.radaFamilyId : undefined;
    const existing = isEdit && radaFamilyId ? data?.radaFamilies?.[radaFamilyId] : undefined;
    const beforePayload: Record<string, unknown> | null = existing ? {
      fosterFatherId: existing.fosterFather,
      fosterMotherId: existing.fosterMother,
      notes: existing.notes || null,
    } : null;

    let succeeded = false;
    let newRadaId: string | null = null;

    const createPayload: Record<string, unknown> = {
      fosterFatherId: radaData.fosterFatherId || null,
      fosterMotherId: radaData.fosterMotherId || null,
      notes: radaData.notes || null,
      childrenIds: radaData.childrenIds,
    };
    const updatePayload: Record<string, unknown> = {
      fosterFatherId: radaData.fosterFatherId || null,
      fosterMotherId: radaData.fosterMotherId || null,
      notes: radaData.notes || null,
    };

    await withFormAction(async () => {
      const url = isEdit
        ? `/api/workspaces/${workspace.workspaceId}/tree/rada-families/${radaFamilyId}`
        : `/api/workspaces/${workspace.workspaceId}/tree/rada-families`;
      const method = isEdit ? 'PATCH' : 'POST';

      const body: Record<string, unknown> = isEdit ? updatePayload : createPayload;

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withTreeId(body)),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'حدث خطأ');
      }
      if (!isEdit) {
        try {
          const json = await res.json();
          newRadaId = json?.data?.id ?? null;
        } catch {
          // Response consumed already or no body; leave null.
        }
      }
      setFormMode(null);
      succeeded = true;
    });
    if (succeeded && onPushUndo) {
      if (isEdit && radaFamilyId && beforePayload) {
        const inverse = buildUpdateRadaFamilyInverse({
          workspaceId: workspace.workspaceId,
          radaFamilyId,
          before: beforePayload,
          after: updatePayload,
          treeId: activeTreeId,
        });
        onPushUndo({
          label: buildUndoLabel({ kind: 'updateRadaFamily' }),
          workspaceId: workspace.workspaceId,
          undo: inverse.undo,
          redo: inverse.redo,
        });
      } else if (!isEdit && newRadaId) {
        const inverse = buildCreateRadaFamilyInverse({
          workspaceId: workspace.workspaceId,
          createdId: newRadaId,
          createPayload,
          treeId: activeTreeId,
        });
        onPushUndo({
          label: buildUndoLabel({ kind: 'createRadaFamily' }),
          workspaceId: workspace.workspaceId,
          undo: inverse.undo,
          redo: inverse.redo,
        });
      }
    }
  }, [workspace, isPointed, formMode, withFormAction, withTreeId, data, activeTreeId, onPushUndo]);

  const handleRadaaDelete = useCallback(async (radaFamilyId: string) => {
    if (!workspace || isPointed) return;
    const existing = data?.radaFamilies?.[radaFamilyId];
    const snapshot: Record<string, unknown> | null = existing ? {
      fosterFatherId: existing.fosterFather,
      fosterMotherId: existing.fosterMother,
      childrenIds: existing.children,
      notes: existing.notes || null,
    } : null;
    let succeeded = false;
    await withFormAction(async () => {
      const res = await apiFetch(
        `/api/workspaces/${workspace.workspaceId}/tree/rada-families/${radaFamilyId}`,
        {
          method: 'DELETE',
          ...deleteInit,
        },
      );
      if (!res.ok && res.status !== 204) {
        const json = await res.json();
        throw new Error(json.error ?? 'حدث خطأ');
      }
      setFormMode(null);
      succeeded = true;
    });
    if (succeeded && onPushUndo && snapshot) {
      const inverse = buildDeleteRadaFamilyInverse({
        workspaceId: workspace.workspaceId,
        deletedId: radaFamilyId,
        snapshot,
        treeId: activeTreeId,
      });
      onPushUndo({
        label: buildUndoLabel({ kind: 'deleteRadaFamily' }),
        workspaceId: workspace.workspaceId,
        undo: inverse.undo,
        redo: inverse.redo,
      });
    }
  }, [workspace, isPointed, withFormAction, data, activeTreeId, deleteInit, onPushUndo]);

  // -------------------------------------------------------------------------
  // «قفزة نسب» (ancestry jump)
  // -------------------------------------------------------------------------

  const createAncestryJump = useCallback(async (body: Record<string, unknown>) => {
    if (!workspace) throw new Error('No workspace context');
    const res = await apiFetch(`/api/workspaces/${workspace.workspaceId}/tree/ancestry-jumps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withTreeId(body)),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error ?? 'حدث خطأ');
    }
    const json = await res.json();
    return json.data as { id: string };
  }, [workspace, withTreeId]);

  /**
   * Link this person to a distant ancestor couple.
   *
   * Two of the three sources are multi-call (individual → family → jump, or
   * family → jump). They push exactly ONE composite undo entry with a
   * hand-rolled inverse — the same shape `handleAddParentSubmit` uses — because
   * a partial undo would leave a stranded ancestor or an empty couple behind.
   */
  const handleAncestryJumpSubmit = useCallback(async (payload: AncestryJumpSubmitPayload) => {
    if (!workspace || !person || isPointed) return;
    const wsId = workspace.workspaceId;

    // Pre-flight: the descendant-side rules, judged before anything is written.
    // (The rest of the rule set needs the ancestor family, which on two of the
    // three paths does not exist yet — the server still runs it all.)
    const preflight = data ? validateJumpDescendant(data, person.id) : null;
    if (preflight) {
      setFormError(ANCESTRY_JUMP_ERROR_MESSAGES[preflight]);
      return;
    }

    let succeeded = false;
    let createdIndividualId: string | null = null;
    let createdFamilyId: string | null = null;
    let createdJumpId: string | null = null;
    let mintedFamilyOpts: { husbandId?: string; wifeId?: string } | null = null;
    let ancestorFamilyId: string | null =
      payload.source === 'existingFamily' ? payload.ancestorFamilyId : null;

    const jumpPayload = (familyId: string): Record<string, unknown> => ({
      descendantId: personId,
      ancestorFamilyId: familyId,
      generationsMin: payload.generationsMin,
      generationsMax: payload.generationsMax,
      notes: payload.notes || null,
    });

    // For the undo label: the ancestor the user is naming.
    let ancestorName: string | undefined;
    if (payload.source === 'newPerson') {
      ancestorName = payload.individual.givenName;
    } else if (payload.source === 'existingPerson') {
      const ancestor = data?.individuals[payload.ancestorPersonId];
      ancestorName = ancestor?.givenName || ancestor?.name;
    } else {
      ancestorName = (data && ancestorFamilyDisplayName(data, payload.ancestorFamilyId)) || undefined;
    }

    // The jump is the whole point of the action; without it a just-created
    // ancestor and his couple are debris the editor never asked for. Shared by
    // the forward submit and the composite redo. Best effort — the error the
    // user sees is the one that caused the rollback, not the rollback's own.
    const rollbackDebris = async (
      familyId: string | null,
      individualId: string | null,
      isUndo = false,
    ) => {
      const drop = (path: string) =>
        apiFetch(`/api/workspaces/${wsId}/tree/${path}`, {
          method: 'DELETE',
          isUndo,
          ...deleteInit,
        }).catch(() => { /* nothing left to try; the stranded row is the lesser evil */ });
      if (familyId) await drop(`families/${familyId}`);
      if (individualId) await drop(`individuals/${individualId}`);
    };

    await withFormAction(async () => {
      if (payload.source === 'newPerson') {
        const newPerson = await createIndividual(payload.individual);
        createdIndividualId = newPerson.id;
        mintedFamilyOpts = payload.individual.sex === 'F'
          ? { wifeId: newPerson.id }
          : { husbandId: newPerson.id };
        const fam = await createFamily(mintedFamilyOpts);
        createdFamilyId = fam.id;
        ancestorFamilyId = fam.id;
      } else if (payload.source === 'existingPerson') {
        const ancestor = data?.individuals[payload.ancestorPersonId];
        mintedFamilyOpts = ancestor?.sex === 'F'
          ? { wifeId: payload.ancestorPersonId }
          : { husbandId: payload.ancestorPersonId };
        const fam = await createFamily(mintedFamilyOpts);
        createdFamilyId = fam.id;
        ancestorFamilyId = fam.id;
      }
      if (!ancestorFamilyId) throw new Error('حدث خطأ');
      const created = await createAncestryJump(jumpPayload(ancestorFamilyId));
      createdJumpId = created.id;
      setFormMode(null);
      succeeded = true;
    });

    if (!succeeded) {
      // A failed sequence pushes no undo entry, so the debris could never be
      // Ctrl+Z'd away — remove it now.
      await rollbackDebris(createdFamilyId, createdIndividualId);
      return;
    }

    if (!onPushUndo || !createdJumpId || !ancestorFamilyId) return;
    const label = buildUndoLabel({ kind: 'addAncestryJump', name: ancestorName });

    // Single-call path: the couple already existed, so the jump row is the only
    // thing this action created.
    if (!createdFamilyId) {
      const inverse = buildCreateAncestryJumpInverse({
        workspaceId: wsId,
        createdId: createdJumpId,
        createPayload: jumpPayload(ancestorFamilyId),
        treeId: activeTreeId,
      });
      onPushUndo({ label, workspaceId: wsId, undo: inverse.undo, redo: inverse.redo });
      return;
    }

    // Composite path. Undo reverses jump → couple → person; redo replays them in
    // creation order, re-capturing the new ids each time.
    const individualForm = payload.source === 'newPerson' ? payload.individual : null;
    const famOpts: { husbandId?: string; wifeId?: string } = mintedFamilyOpts ?? {};
    let currentIndividualId: string | null = createdIndividualId;
    let currentFamilyId: string = createdFamilyId;
    let currentJumpId: string = createdJumpId;

    const undoDelete = async (path: string) => {
      const res = await apiFetch(`/api/workspaces/${wsId}/tree/${path}`, {
        method: 'DELETE',
        isUndo: true,
        ...deleteInit,
      });
      if (!res.ok && res.status !== 204) throw new Error(`undo API error: ${res.status}`);
    };
    const undoPost = async (path: string, body: Record<string, unknown>) => {
      const res = await apiFetch(`/api/workspaces/${wsId}/tree/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withTreeId(body)),
        isUndo: true,
      });
      if (!res.ok) throw new Error(`undo API error: ${res.status}`);
      return ((await res.json())?.data ?? {}) as { id?: string };
    };

    onPushUndo({
      label,
      workspaceId: wsId,
      undo: async () => {
        await undoDelete(`ancestry-jumps/${currentJumpId}`);
        await undoDelete(`families/${currentFamilyId}`);
        if (currentIndividualId) await undoDelete(`individuals/${currentIndividualId}`);
      },
      redo: async () => {
        const opts = { ...famOpts };
        // What THIS replay created — rolled back if a later step is refused
        // (e.g. the workspace turned «قفزة نسب» off since the undo).
        let redoIndividualId: string | null = null;
        let redoFamilyId: string | null = null;
        try {
          if (individualForm) {
            const ind = await undoPost('individuals', serializeIndividualForm(individualForm));
            if (ind.id) {
              redoIndividualId = ind.id;
              currentIndividualId = ind.id;
              if (individualForm.sex === 'F') opts.wifeId = ind.id;
              else opts.husbandId = ind.id;
            }
          }
          const fam = await undoPost('families', opts);
          if (fam.id) {
            redoFamilyId = fam.id;
            currentFamilyId = fam.id;
          }
          const jump = await undoPost('ancestry-jumps', jumpPayload(currentFamilyId));
          if (jump.id) currentJumpId = jump.id;
        } catch (err) {
          await rollbackDebris(redoFamilyId, redoIndividualId, true);
          throw err;
        }
      },
    });
  }, [
    workspace, person, personId, data, isPointed, withFormAction, withTreeId, deleteInit,
    createIndividual, createFamily, createAncestryJump, setFormMode, activeTreeId, onPushUndo,
  ]);

  const handleAncestryJumpUpdate = useCallback(async (jumpId: string, fields: AncestryJumpFields) => {
    if (!workspace || isPointed) return;
    const existing = data?.ancestryJumps?.[jumpId];
    const before: Record<string, unknown> | null = existing ? {
      generationsMin: existing.generationsMin,
      generationsMax: existing.generationsMax,
      notes: existing.notes || null,
    } : null;
    const after: Record<string, unknown> = {
      generationsMin: fields.generationsMin,
      generationsMax: fields.generationsMax,
      notes: fields.notes || null,
    };

    let succeeded = false;
    await withFormAction(async () => {
      const res = await apiFetch(
        `/api/workspaces/${workspace.workspaceId}/tree/ancestry-jumps/${jumpId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withTreeId(after)),
        },
      );
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'حدث خطأ');
      }
      setFormMode(null);
      succeeded = true;
    });

    if (succeeded && onPushUndo && before) {
      const inverse = buildUpdateAncestryJumpInverse({
        workspaceId: workspace.workspaceId,
        jumpId,
        before,
        after,
        treeId: activeTreeId,
      });
      onPushUndo({
        label: buildUndoLabel({ kind: 'updateAncestryJump' }),
        workspaceId: workspace.workspaceId,
        undo: inverse.undo,
        redo: inverse.redo,
      });
    }
  }, [workspace, isPointed, data, withFormAction, withTreeId, setFormMode, activeTreeId, onPushUndo]);

  /** Removes the jump ROW only — never the ancestor, never his couple. */
  const handleAncestryJumpDelete = useCallback(async (jumpId: string) => {
    if (!workspace || isPointed) return;
    const existing = data?.ancestryJumps?.[jumpId];
    const snapshot: Record<string, unknown> | null = existing ? {
      descendantId: existing.descendant,
      ancestorFamilyId: existing.ancestorFamily,
      generationsMin: existing.generationsMin,
      generationsMax: existing.generationsMax,
      notes: existing.notes || null,
    } : null;

    let succeeded = false;
    await withFormAction(async () => {
      const res = await apiFetch(
        `/api/workspaces/${workspace.workspaceId}/tree/ancestry-jumps/${jumpId}`,
        { method: 'DELETE', ...deleteInit },
      );
      if (!res.ok && res.status !== 204) {
        const json = await res.json();
        throw new Error(json.error ?? 'حدث خطأ');
      }
      setFormMode(null);
      succeeded = true;
    });

    if (succeeded && onPushUndo && snapshot) {
      const inverse = buildDeleteAncestryJumpInverse({
        workspaceId: workspace.workspaceId,
        deletedId: jumpId,
        snapshot,
        treeId: activeTreeId,
      });
      onPushUndo({
        label: buildUndoLabel({ kind: 'deleteAncestryJump' }),
        workspaceId: workspace.workspaceId,
        undo: inverse.undo,
        redo: inverse.redo,
      });
    }
  }, [workspace, isPointed, data, withFormAction, deleteInit, setFormMode, activeTreeId, onPushUndo]);

  // -------------------------------------------------------------------------
  // Move subtree
  // -------------------------------------------------------------------------

  const moveSubtree = useCallback(async (
    option: MoveSubtreeOption,
    options?: { orphanIds?: string[] },
  ) => {
    if (!workspace || !person || isPointed) return;
    const fromFamilyId = person.familyAsChild;
    // «تعيين والدين موجودين» on a person who carries a «قفزة نسب» would give
    // him parents beside the jump — refused before any call (the server's
    // `child_has_jump` 409 is the backstop).
    if (jumpBlocksParents(person)) {
      setFormError(JUMP_BLOCKS_PARENTS_MESSAGE);
      return;
    }
    const personName = person.name;
    const orphanIds = options?.orphanIds ?? [];
    let succeeded = false;
    let resolvedTargetFamilyId: string | null = null;

    await withFormAction(async () => {
      // Step 1: ensure we have a target FAM. If the picked option is a free-floating
      // individual, create a one-parent FAM (HUSB-only or WIFE-only) using their sex.
      if (option.kind === 'family') {
        resolvedTargetFamilyId = option.familyId;
      } else {
        const familyOpts: { husbandId?: string; wifeId?: string } = option.sex === 'F'
          ? { wifeId: option.individualId }
          : { husbandId: option.individualId };
        const r = await apiFetch(
          `/api/workspaces/${workspace.workspaceId}/tree/families`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(withTreeId(familyOpts)),
          },
        );
        if (!r.ok) {
          const json = await r.json();
          throw new Error(json.error ?? 'حدث خطأ');
        }
        const json = await r.json();
        resolvedTargetFamilyId = json.data.id as string;
      }

      // Step 2: place the target person into that family.
      if (fromFamilyId) {
        // "تغيير الوالدين" — move from one family to another.
        const res = await apiFetch(
          `/api/workspaces/${workspace.workspaceId}/tree/families/${fromFamilyId}/children/${personId}/move`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(withTreeId({ targetFamilyId: resolvedTargetFamilyId })),
          },
        );
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error ?? 'حدث خطأ');
        }
      } else {
        // "تعيين والدين موجودين" — attach a parentless person as a child.
        const res = await apiFetch(
          `/api/workspaces/${workspace.workspaceId}/tree/families/${resolvedTargetFamilyId}/children`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(withTreeId({ individualId: personId })),
          },
        );
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error ?? 'حدث خطأ');
        }
      }

      // Step 3: auto-delete previous parents who are now fully disconnected from the tree.
      // Best-effort: a failure here doesn't roll back the move; surface as form error.
      for (const orphanId of orphanIds) {
        const r = await apiFetch(
          `/api/workspaces/${workspace.workspaceId}/tree/individuals/${orphanId}`,
          {
            method: 'DELETE',
            ...deleteInit,
          },
        );
        if (!r.ok && r.status !== 204) {
          const json = await r.json().catch(() => ({}));
          throw new Error(json.error ?? 'تعذر حذف الوالد المنفصل');
        }
      }
      succeeded = true;
    });

    if (
      succeeded &&
      onPushUndo &&
      fromFamilyId &&
      orphanIds.length === 0 &&
      option.kind === 'family' &&
      resolvedTargetFamilyId
    ) {
      // Only the simple in-place move (no FAM creation, no orphan deletion) is undoable
      // today — restoring deleted individuals or rolling back a freshly-created FAM
      // isn't wired into the undo stack yet.
      const inverse = buildMoveChildInverse({
        workspaceId: workspace.workspaceId,
        fromFamilyId,
        toFamilyId: resolvedTargetFamilyId,
        individualId: personId,
        treeId: activeTreeId,
      });
      onPushUndo({
        label: buildUndoLabel({ kind: 'moveChild', name: personName }),
        workspaceId: workspace.workspaceId,
        undo: inverse.undo,
        redo: inverse.redo,
      });
    }
  }, [workspace, person, personId, isPointed, withFormAction, withTreeId, activeTreeId, deleteInit, onPushUndo]);

  // -------------------------------------------------------------------------
  // Unlink spouse
  // -------------------------------------------------------------------------

  const unlinkSpouse = useCallback(async (familyId: string) => {
    if (!workspace || !person || !data || isPointed) return;
    const family = data.families[familyId];
    if (!family) return;
    const hasChildren = family.children.length > 0;
    // Determine which slot we're clearing so we can build an accurate inverse.
    const clearingHusband = family.husband === personId;
    const oppositeSex: 'M' | 'F' = person.sex === 'F' ? 'M' : 'F';
    const removedSpouseSex: 'M' | 'F' = oppositeSex;
    // Snapshot for re-POST on delete path.
    const familySnapshot: Record<string, unknown> = {
      husbandId: family.husband,
      wifeId: family.wife,
      childrenIds: family.children,
      isUmmWalad: family.isUmmWalad ?? false,
      isDivorced: family.isDivorced,
      marriageContractDate: family.marriageContract.date || null,
      marriageContractHijriDate: family.marriageContract.hijriDate || null,
      marriageContractPlace: family.marriageContract.place || null,
      marriageContractDescription: family.marriageContract.description || null,
      marriageContractNotes: family.marriageContract.notes || null,
      marriageDate: family.marriage.date || null,
      marriageHijriDate: family.marriage.hijriDate || null,
      marriagePlace: family.marriage.place || null,
      marriageDescription: family.marriage.description || null,
      marriageNotes: family.marriage.notes || null,
      divorceDate: family.divorce.date || null,
      divorceHijriDate: family.divorce.hijriDate || null,
      divorcePlace: family.divorce.place || null,
      divorceDescription: family.divorce.description || null,
      divorceNotes: family.divorce.notes || null,
    };
    let succeeded = false;
    let tookPatchPath = false;
    await withFormAction(async () => {
      if (hasChildren) {
        tookPatchPath = true;
        // Clear the current person's spouse slot, preserve children
        const patch: { husbandId?: null; wifeId?: null } = {};
        if (clearingHusband) {
          patch.husbandId = null;
        } else {
          patch.wifeId = null;
        }
        const res = await apiFetch(
          `/api/workspaces/${workspace.workspaceId}/tree/families/${familyId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(withTreeId(patch)),
          },
        );
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error ?? 'حدث خطأ');
        }
      } else {
        // No children — delete the family record entirely
        const res = await apiFetch(
          `/api/workspaces/${workspace.workspaceId}/tree/families/${familyId}`,
          {
            method: 'DELETE',
            ...deleteInit,
          },
        );
        if (!res.ok && res.status !== 204) {
          const json = await res.json();
          throw new Error(json.error ?? 'حدث خطأ');
        }
      }
      succeeded = true;
    });
    if (succeeded && onPushUndo) {
      const wsId = workspace.workspaceId;
      if (tookPatchPath) {
        const restorePatch = clearingHusband
          ? { husbandId: personId }
          : { wifeId: personId };
        const clearPatch = clearingHusband ? { husbandId: null } : { wifeId: null };
        onPushUndo({
          label: buildUndoLabel({ kind: 'unlinkSpouse', sex: removedSpouseSex }),
          workspaceId: wsId,
          undo: async () => {
            const r = await apiFetch(`/api/workspaces/${wsId}/tree/families/${familyId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(withTreeId(restorePatch)),
              isUndo: true,
            });
            if (!r.ok) throw new Error(`undo API error: ${r.status}`);
          },
          redo: async () => {
            const r = await apiFetch(`/api/workspaces/${wsId}/tree/families/${familyId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(withTreeId(clearPatch)),
              isUndo: true,
            });
            if (!r.ok) throw new Error(`undo API error: ${r.status}`);
          },
        });
      } else {
        const inverse = buildDeleteFamilyInverse({
          workspaceId: wsId,
          deletedId: familyId,
          snapshot: familySnapshot,
          treeId: activeTreeId,
        });
        onPushUndo({
          label: buildUndoLabel({ kind: 'unlinkSpouse', sex: removedSpouseSex }),
          workspaceId: wsId,
          undo: inverse.undo,
          redo: inverse.redo,
        });
      }
    }
  }, [workspace, person, data, personId, isPointed, withFormAction, withTreeId, activeTreeId, deleteInit, onPushUndo]);

  // -------------------------------------------------------------------------
  // Delete handler
  // -------------------------------------------------------------------------

  // Fetch delete impact, then decide: simple confirm or cascade warning modal
  const handleDeleteClick = useCallback(async () => {
    if (!workspace || isPointed) return;
    setDeleteState({ kind: 'loading' });
    try {
      const res = await apiFetch(
        `/api/workspaces/${workspace.workspaceId}/tree/individuals/${personId}/delete-impact`,
      );
      if (!res.ok) {
        throw new Error('حدث خطأ');
      }
      const { data } = await res.json();
      if (data.hasImpact) {
        setDeleteState({ kind: 'cascadeWarning', impact: data });
      } else {
        setDeleteState({ kind: 'simpleConfirm' });
      }
    } catch {
      setDeleteState({ kind: 'idle' });
    }
  }, [workspace, personId, isPointed]);

  // Execute the delete (simple or cascade)
  const handleCascadeConfirm = useCallback(async (confirmationName?: string) => {
    if (!workspace || isPointed) return;
    const currentState = deleteState;
    const isSimple = currentState.kind === 'simpleConfirm';
    // Capture snapshot BEFORE delete fires so we can re-create on undo.
    const deleteSnapshot = person ? serializeIndividualForm({
      givenName: person.givenName,
      surname: person.surname,
      sex: person.sex ?? '',
      birthDate: person.birth,
      birthPlace: person.birthPlace,
      birthPlaceId: person.birthPlaceId ?? null,
      birthDescription: person.birthDescription,
      birthNotes: person.birthNotes,
      birthHijriDate: person.birthHijriDate,
      deathDate: person.death,
      deathPlace: person.deathPlace,
      deathPlaceId: person.deathPlaceId ?? null,
      deathDescription: person.deathDescription,
      deathNotes: person.deathNotes,
      deathHijriDate: person.deathHijriDate,
      kunya: person.kunya,
      isDeceased: person.isDeceased,
      isPrivate: person.isPrivate,
      notes: person.notes,
    }) : null;
    const personName = person?.name;
    setDeleteState({ kind: 'loading' });
    // Sources («المصادر»): sources outlive a person delete (only the links
    // go), so capture the ids of the person's sources for the undo to RE-LINK
    // them — text and files come back, nothing is duplicated. Only simple
    // deletes are undoable. Best-effort: a failed fetch never blocks the
    // delete, it just leaves nothing to re-link.
    let sourceIds: string[] = [];
    if (isSimple && onPushUndo) {
      try {
        const { entries } = await fetchPersonSources(workspace.workspaceId, personId, activeTreeId);
        sourceIds = entries.map((e) => e.id);
      } catch {
        sourceIds = [];
      }
    }
    try {
      const body: Record<string, string> = {};
      if (currentState.kind === 'cascadeWarning') {
        body.versionHash = currentState.impact.versionHash;
        if (confirmationName) body.confirmationName = confirmationName;
      }
      // Editing an extra tree: the delete must target that tree.
      if (activeTreeId) body.treeId = activeTreeId;

      const res = await apiFetch(
        `/api/workspaces/${workspace.workspaceId}/tree/individuals/${personId}`,
        {
          method: 'DELETE',
          ...(Object.keys(body).length > 0 ? { body: JSON.stringify(body) } : {}),
          headers: Object.keys(body).length > 0 ? { 'Content-Type': 'application/json' } : undefined,
        },
      );

      if (res.status === 409) {
        // Stale data — update impact with fresh data from response
        const { data } = await res.json();
        setDeleteState({ kind: 'cascadeWarning', impact: data });
        return;
      }

      if (!res.ok && res.status !== 204) {
        const json = await res.json();
        throw new Error(json.error ?? 'حدث خطأ');
      }

      setDeleteState({ kind: 'idle' });
      setSelectedPersonId(null);
      await workspace.refreshTree();

      // Only non-cascade (simple) deletes are undoable in 15a.
      // Cascade delete restore is 15b; its response lacks restoreSnapshot today.
      if (isSimple && onPushUndo && deleteSnapshot) {
        const inverse = buildDeleteIndividualInverse({
          workspaceId: workspace.workspaceId,
          deletedId: personId,
          snapshot: deleteSnapshot,
          sourceIds,
          treeId: activeTreeId,
        });
        onPushUndo({
          label: buildUndoLabel({ kind: 'deleteIndividual', name: personName }),
          workspaceId: workspace.workspaceId,
          undo: inverse.undo,
          redo: inverse.redo,
        });
      }
    } catch {
      // Reset to previous state on error so user can retry
      if (currentState.kind === 'cascadeWarning') {
        setDeleteState(currentState);
      } else {
        setDeleteState({ kind: 'idle' });
      }
    }
  }, [workspace, personId, setSelectedPersonId, isPointed, deleteState, person, activeTreeId, onPushUndo]);

  return {
    formMode,
    setFormMode,
    formLoading,
    setFormLoading,
    formError,
    setFormError,
    deleteState,
    setDeleteState,
    handleEditSubmit,
    handleAddChildSubmit,
    handleAddSpouseSubmit,
    handleLinkExistingSpouse,
    handleAddParentSubmit,
    handleAddSiblingSubmit,
    handleFamilyEventSubmit,
    handleRadaaSubmit,
    handleRadaaDelete,
    handleAncestryJumpSubmit,
    handleAncestryJumpUpdate,
    handleAncestryJumpDelete,
    handleDeleteClick,
    handleCascadeConfirm,
    unlinkSpouse,
    moveSubtree,
  };
}
