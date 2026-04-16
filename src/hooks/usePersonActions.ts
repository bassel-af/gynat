import { useState, useCallback } from 'react';
import type { Individual, GedcomData } from '@/lib/gedcom/types';
import type { IndividualFormData } from '@/components/tree/IndividualForm/IndividualForm';
import type { FamilyEventFormData } from '@/components/tree/FamilyEventForm/FamilyEventForm';
import { apiFetch } from '@/lib/api/client';
import { serializeIndividualForm } from '@/lib/person-detail-helpers';
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
} from '@/lib/tree/undo-builders';

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
  | { kind: 'addParent'; lockedSex?: 'M' | 'F' }
  | { kind: 'addSibling'; targetFamilyId: string }
  | { kind: 'editFamilyEvent'; familyId: string; isUmmWalad?: boolean }
  | { kind: 'addRadaa' }
  | { kind: 'editRadaa'; radaFamilyId: string };

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
  refreshTree: () => Promise<void>;
}

export interface UsePersonActionsParams {
  personId: string;
  workspace: WorkspaceContext | null;
  person: Individual | undefined;
  data: GedcomData | null | undefined;
  setSelectedPersonId: (id: string | null) => void;
  /** Phase 15a: called with an undo entry after each successful mutation + refresh. */
  onPushUndo?: (entry: UndoEntry) => void;
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
  handleEditSubmit: (formData: IndividualFormData) => Promise<void>;
  handleAddChildSubmit: (formData: IndividualFormData) => Promise<void>;
  handleAddSpouseSubmit: (formData: IndividualFormData) => Promise<void>;
  handleAddParentSubmit: (formData: IndividualFormData) => Promise<void>;
  handleAddSiblingSubmit: (formData: IndividualFormData) => Promise<void>;
  handleFamilyEventSubmit: (eventData: FamilyEventFormData) => Promise<void>;
  handleLinkExistingSpouse: (existingPersonId: string) => Promise<void>;
  handleRadaaSubmit: (data: RadaaFormData) => Promise<void>;
  handleRadaaDelete: (radaFamilyId: string) => Promise<void>;
  handleDeleteClick: () => Promise<void>;
  handleCascadeConfirm: (confirmationName?: string) => Promise<void>;
  unlinkSpouse: (familyId: string) => Promise<void>;
  moveSubtree: (targetFamilyId: string) => Promise<void>;
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
}: UsePersonActionsParams): UsePersonActionsReturn {
  // Pointed individuals are read-only — block all mutations
  const isPointed = person?._pointed === true;

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
      body: JSON.stringify(serializeIndividualForm(formData)),
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
  // Form submit handlers
  // -------------------------------------------------------------------------

  const handleEditSubmit = useCallback(async (formData: IndividualFormData) => {
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
    let succeeded = false;
    await withFormAction(async () => {
      const res = await apiFetch(`/api/workspaces/${workspace.workspaceId}/tree/individuals/${personId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(afterSnapshot),
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
              body: JSON.stringify({ isUmmWalad: newVal }),
            },
          );
          if (!famRes.ok) {
            const json = await famRes.json();
            throw new Error(json.error ?? 'حدث خطأ');
          }
        }
      }
      succeeded = true;
      setFormMode(null);
    });
    if (succeeded && onPushUndo && beforeSnapshot) {
      const inverse = buildUpdateIndividualInverse({
        workspaceId: workspace.workspaceId,
        individualId: personId,
        before: beforeSnapshot,
        after: afterSnapshot,
      });
      onPushUndo({
        label: buildUndoLabel({ kind: 'updateIndividual', name: personName }),
        workspaceId: workspace.workspaceId,
        undo: inverse.undo,
        redo: inverse.redo,
      });
    }
  }, [workspace, personId, isPointed, formMode, withFormAction, person, onPushUndo]);

  const handleAddChildSubmit = useCallback(async (formData: IndividualFormData) => {
    if (!workspace || !person || !data || isPointed) return;
    let succeeded = false;
    let newIndividualId: string | null = null;
    const childName = formData.givenName;
    const createPayload = serializeIndividualForm(formData);
    await withFormAction(async () => {
      const newPerson = await createIndividual(formData);
      newIndividualId = newPerson.id;

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

      succeeded = true;
      setFormMode(null);
    });
    if (succeeded && onPushUndo && newIndividualId) {
      const inverse = buildCreateIndividualInverse({
        workspaceId: workspace.workspaceId,
        createdId: newIndividualId,
        createPayload,
      });
      onPushUndo({
        label: buildUndoLabel({ kind: 'addChild', name: childName }),
        workspaceId: workspace.workspaceId,
        undo: inverse.undo,
        redo: inverse.redo,
      });
    }
  }, [workspace, person, data, personId, formMode, createIndividual, addChildToFamily, createFamily, isPointed, withFormAction, onPushUndo]);

  const handleAddSpouseSubmit = useCallback(async (formData: IndividualFormData) => {
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
    if (succeeded && onPushUndo && newIndividualId && newFamilyId) {
      const capturedIndividualId = newIndividualId;
      const capturedFamilyId = newFamilyId;
      const wsId = workspace.workspaceId;
      onPushUndo({
        label: buildUndoLabel({ kind: 'addSpouse', sex: spouseSex, name: spouseName }),
        workspaceId: wsId,
        undo: async () => {
          // Delete family first (it refers to both individuals), then the new individual.
          const famRes = await apiFetch(`/api/workspaces/${wsId}/tree/families/${capturedFamilyId}`, {
            method: 'DELETE',
            isUndo: true,
          });
          if (!famRes.ok && famRes.status !== 204) {
            const json = await famRes.json();
            throw new Error(json.error ?? `undo API error: ${famRes.status}`);
          }
          const indRes = await apiFetch(`/api/workspaces/${wsId}/tree/individuals/${capturedIndividualId}`, {
            method: 'DELETE',
            isUndo: true,
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
            body: JSON.stringify(serializeIndividualForm(formData)),
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
            body: JSON.stringify(famOpts),
            isUndo: true,
          });
          if (!famRes.ok) throw new Error(`undo API error: ${famRes.status}`);
        },
      });
    }
  }, [workspace, person, personId, createIndividual, createFamily, isPointed, withFormAction, onPushUndo]);

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
      });
      onPushUndo({
        label: buildUndoLabel({ kind: 'linkExistingSpouse', sex: spouseSex, name: spouseName }),
        workspaceId: workspace.workspaceId,
        undo: inverse.undo,
        redo: inverse.redo,
      });
    }
  }, [workspace, person, personId, createFamily, isPointed, withFormAction, data, onPushUndo]);

  const handleAddParentSubmit = useCallback(async (formData: IndividualFormData) => {
    if (!workspace || !person || !data || isPointed) return;
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
    if (succeeded && onPushUndo && newIndividualId) {
      const wsId = workspace.workspaceId;
      const capturedInd = newIndividualId;
      const capturedPatchedFam = patchedFamilyId;
      const capturedCreatedFam = createdFamilyId;
      onPushUndo({
        label: buildUndoLabel({ kind: 'addParent', sex: parentSex, name: parentName }),
        workspaceId: wsId,
        undo: async () => {
          // Reverse the structural op first, then delete the new individual.
          if (capturedPatchedFam) {
            const patch = parentSex === 'F' ? { wifeId: null } : { husbandId: null };
            const r = await apiFetch(`/api/workspaces/${wsId}/tree/families/${capturedPatchedFam}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(patch),
              isUndo: true,
            });
            if (!r.ok) throw new Error(`undo API error: ${r.status}`);
          } else if (capturedCreatedFam) {
            const r = await apiFetch(`/api/workspaces/${wsId}/tree/families/${capturedCreatedFam}`, {
              method: 'DELETE',
              isUndo: true,
            });
            if (!r.ok && r.status !== 204) throw new Error(`undo API error: ${r.status}`);
          }
          const indRes = await apiFetch(`/api/workspaces/${wsId}/tree/individuals/${capturedInd}`, {
            method: 'DELETE',
            isUndo: true,
          });
          if (!indRes.ok && indRes.status !== 204) throw new Error(`undo API error: ${indRes.status}`);
        },
        redo: async () => {
          const indRes = await apiFetch(`/api/workspaces/${wsId}/tree/individuals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(serializeIndividualForm(formData)),
            isUndo: true,
          });
          if (!indRes.ok) throw new Error(`undo API error: ${indRes.status}`);
          const newInd = (await indRes.json()).data as { id: string };
          if (capturedPatchedFam) {
            const patch = parentSex === 'F' ? { wifeId: newInd.id } : { husbandId: newInd.id };
            const r = await apiFetch(`/api/workspaces/${wsId}/tree/families/${capturedPatchedFam}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(patch),
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
              body: JSON.stringify(famOpts),
              isUndo: true,
            });
            if (!r.ok) throw new Error(`undo API error: ${r.status}`);
          }
        },
      });
    }
  }, [workspace, person, data, personId, createIndividual, patchFamily, createFamily, isPointed, withFormAction, onPushUndo]);

  const handleAddSiblingSubmit = useCallback(async (formData: IndividualFormData) => {
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
    if (succeeded && onPushUndo && newIndividualId) {
      const inverse = buildCreateIndividualInverse({
        workspaceId: workspace.workspaceId,
        createdId: newIndividualId,
        createPayload,
      });
      onPushUndo({
        label: buildUndoLabel({ kind: 'addChild', name: childName }),
        workspaceId: workspace.workspaceId,
        undo: inverse.undo,
        redo: inverse.redo,
      });
    }
  }, [workspace, formMode, createIndividual, addChildToFamily, isPointed, withFormAction, onPushUndo]);

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
        body: JSON.stringify(afterPayload),
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
      });
      onPushUndo({
        label: buildUndoLabel({ kind: 'editMarriageEvent', eventType }),
        workspaceId: workspace.workspaceId,
        undo: inverse.undo,
        redo: inverse.redo,
      });
    }
  }, [workspace, formMode, isPointed, withFormAction, data, onPushUndo]);

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
        body: JSON.stringify(body),
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
        });
        onPushUndo({
          label: buildUndoLabel({ kind: 'createRadaFamily' }),
          workspaceId: workspace.workspaceId,
          undo: inverse.undo,
          redo: inverse.redo,
        });
      }
    }
  }, [workspace, isPointed, formMode, withFormAction, data, onPushUndo]);

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
        { method: 'DELETE' },
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
      });
      onPushUndo({
        label: buildUndoLabel({ kind: 'deleteRadaFamily' }),
        workspaceId: workspace.workspaceId,
        undo: inverse.undo,
        redo: inverse.redo,
      });
    }
  }, [workspace, isPointed, withFormAction, data, onPushUndo]);

  // -------------------------------------------------------------------------
  // Move subtree
  // -------------------------------------------------------------------------

  const moveSubtree = useCallback(async (targetFamilyId: string) => {
    if (!workspace || !person?.familyAsChild || isPointed) return;
    const fromFamilyId = person.familyAsChild;
    const personName = person.name;
    let succeeded = false;
    await withFormAction(async () => {
      const res = await apiFetch(
        `/api/workspaces/${workspace.workspaceId}/tree/families/${fromFamilyId}/children/${personId}/move`,
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
      succeeded = true;
    });
    if (succeeded && onPushUndo) {
      const inverse = buildMoveChildInverse({
        workspaceId: workspace.workspaceId,
        fromFamilyId,
        toFamilyId: targetFamilyId,
        individualId: personId,
      });
      onPushUndo({
        label: buildUndoLabel({ kind: 'moveChild', name: personName }),
        workspaceId: workspace.workspaceId,
        undo: inverse.undo,
        redo: inverse.redo,
      });
    }
  }, [workspace, person, personId, isPointed, withFormAction, onPushUndo]);

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
            body: JSON.stringify(patch),
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
          { method: 'DELETE' },
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
              body: JSON.stringify(restorePatch),
              isUndo: true,
            });
            if (!r.ok) throw new Error(`undo API error: ${r.status}`);
          },
          redo: async () => {
            const r = await apiFetch(`/api/workspaces/${wsId}/tree/families/${familyId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(clearPatch),
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
        });
        onPushUndo({
          label: buildUndoLabel({ kind: 'unlinkSpouse', sex: removedSpouseSex }),
          workspaceId: wsId,
          undo: inverse.undo,
          redo: inverse.redo,
        });
      }
    }
  }, [workspace, person, data, personId, isPointed, withFormAction, onPushUndo]);

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
    try {
      const body: Record<string, string> = {};
      if (currentState.kind === 'cascadeWarning') {
        body.versionHash = currentState.impact.versionHash;
        if (confirmationName) body.confirmationName = confirmationName;
      }

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
  }, [workspace, personId, setSelectedPersonId, isPointed, deleteState, person, onPushUndo]);

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
    handleDeleteClick,
    handleCascadeConfirm,
    unlinkSpouse,
    moveSubtree,
  };
}
