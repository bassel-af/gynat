import { useState, useCallback } from 'react';
import type { Individual, GedcomData } from '@/lib/gedcom/types';
import type { IndividualFormData } from '@/components/tree/IndividualForm/IndividualForm';
import type { FamilyEventFormData } from '@/components/tree/FamilyEventForm/FamilyEventForm';
import { apiFetch } from '@/lib/api/client';
import { serializeIndividualForm } from '@/lib/person-detail-helpers';

// ---------------------------------------------------------------------------
// Types for the form modal state machine
// ---------------------------------------------------------------------------

export type FormMode =
  | { kind: 'edit'; ummWaladFamilyId?: string; ummWaladInitialValue?: boolean }
  | { kind: 'addChild'; targetFamilyId?: string }
  | { kind: 'addSpouse'; lockedSex?: 'M' | 'F' }
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
}

export interface UsePersonActionsReturn {
  formMode: FormMode | null;
  setFormMode: (mode: FormMode | null) => void;
  formLoading: boolean;
  setFormLoading: (loading: boolean) => void;
  formError: string;
  setFormError: (error: string) => void;
  deleteConfirm: boolean;
  setDeleteConfirm: (confirm: boolean) => void;
  deleteLoading: boolean;
  handleEditSubmit: (formData: IndividualFormData) => Promise<void>;
  handleAddChildSubmit: (formData: IndividualFormData) => Promise<void>;
  handleAddSpouseSubmit: (formData: IndividualFormData) => Promise<void>;
  handleAddParentSubmit: (formData: IndividualFormData) => Promise<void>;
  handleAddSiblingSubmit: (formData: IndividualFormData) => Promise<void>;
  handleFamilyEventSubmit: (eventData: FamilyEventFormData) => Promise<void>;
  handleRadaaSubmit: (data: RadaaFormData) => Promise<void>;
  handleRadaaDelete: (radaFamilyId: string) => Promise<void>;
  handleDelete: () => Promise<void>;
  moveChild: (targetFamilyId: string) => Promise<void>;
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
}: UsePersonActionsParams): UsePersonActionsReturn {
  // Pointed individuals are read-only — block all mutations
  const isPointed = person?._pointed === true;

  // Form modal state
  const [formModeRaw, setFormModeRaw] = useState<FormMode | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

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
    await withFormAction(async () => {
      const res = await apiFetch(`/api/workspaces/${workspace.workspaceId}/tree/individuals/${personId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serializeIndividualForm(formData)),
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
      setFormMode(null);
    });
  }, [workspace, personId, isPointed, formMode, withFormAction]);

  const handleAddChildSubmit = useCallback(async (formData: IndividualFormData) => {
    if (!workspace || !person || !data || isPointed) return;
    await withFormAction(async () => {
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
    });
  }, [workspace, person, data, personId, formMode, createIndividual, addChildToFamily, createFamily, isPointed, withFormAction]);

  const handleAddSpouseSubmit = useCallback(async (formData: IndividualFormData) => {
    if (!workspace || !person || isPointed) return;
    await withFormAction(async () => {
      const newPerson = await createIndividual(formData);

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

      if (formData.isUmmWalad) {
        // Umm walad has no marriage events — just close the form
        setFormMode(null);
      } else {
        // Auto-open family event form so user can fill marriage info in the same flow
        setFormMode({ kind: 'editFamilyEvent', familyId: newFamily.id });
      }
      setFormError('');
    });
  }, [workspace, person, personId, createIndividual, createFamily, isPointed, withFormAction]);

  const handleAddParentSubmit = useCallback(async (formData: IndividualFormData) => {
    if (!workspace || !person || !data || isPointed) return;
    await withFormAction(async () => {
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
    });
  }, [workspace, person, data, personId, createIndividual, patchFamily, createFamily, isPointed, withFormAction]);

  const handleAddSiblingSubmit = useCallback(async (formData: IndividualFormData) => {
    if (!workspace || formMode?.kind !== 'addSibling' || isPointed) return;
    await withFormAction(async () => {
      const newPerson = await createIndividual(formData);
      await addChildToFamily(formMode.targetFamilyId, newPerson.id);
      setFormMode(null);
    });
  }, [workspace, formMode, createIndividual, addChildToFamily, isPointed, withFormAction]);

  const handleFamilyEventSubmit = useCallback(async (eventData: FamilyEventFormData) => {
    if (!workspace || formMode?.kind !== 'editFamilyEvent' || isPointed) return;
    await withFormAction(async () => {
      const res = await apiFetch(`/api/workspaces/${workspace.workspaceId}/tree/families/${formMode.familyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'حدث خطأ');
      }
      setFormMode(null);
    });
  }, [workspace, formMode, isPointed, withFormAction]);

  // -------------------------------------------------------------------------
  // Rada'a (foster nursing) handlers
  // -------------------------------------------------------------------------

  const handleRadaaSubmit = useCallback(async (data: RadaaFormData) => {
    if (!workspace || isPointed) return;
    const isEdit = formMode?.kind === 'editRadaa';
    const radaFamilyId = isEdit ? formMode.radaFamilyId : undefined;

    await withFormAction(async () => {
      const url = isEdit
        ? `/api/workspaces/${workspace.workspaceId}/tree/rada-families/${radaFamilyId}`
        : `/api/workspaces/${workspace.workspaceId}/tree/rada-families`;
      const method = isEdit ? 'PATCH' : 'POST';

      const body: Record<string, unknown> = {
        fosterFatherId: data.fosterFatherId || null,
        fosterMotherId: data.fosterMotherId || null,
        notes: data.notes || null,
      };
      // Only send childrenIds for create (edit uses separate add/remove child endpoints)
      if (!isEdit) {
        body.childrenIds = data.childrenIds;
      }

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'حدث خطأ');
      }
      setFormMode(null);
    });
  }, [workspace, isPointed, formMode, withFormAction]);

  const handleRadaaDelete = useCallback(async (radaFamilyId: string) => {
    if (!workspace || isPointed) return;
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
    });
  }, [workspace, isPointed, withFormAction]);

  // -------------------------------------------------------------------------
  // Move child
  // -------------------------------------------------------------------------

  const moveChild = useCallback(async (targetFamilyId: string) => {
    if (!workspace || !person?.familyAsChild || isPointed) return;
    await withFormAction(async () => {
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
    });
  }, [workspace, person, personId, isPointed, withFormAction]);

  // -------------------------------------------------------------------------
  // Delete handler
  // -------------------------------------------------------------------------

  const handleDelete = useCallback(async () => {
    if (!workspace || isPointed) return;
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
  }, [workspace, personId, setSelectedPersonId, isPointed]);

  return {
    formMode,
    setFormMode,
    formLoading,
    setFormLoading,
    formError,
    setFormError,
    deleteConfirm,
    setDeleteConfirm,
    deleteLoading,
    handleEditSubmit,
    handleAddChildSubmit,
    handleAddSpouseSubmit,
    handleAddParentSubmit,
    handleAddSiblingSubmit,
    handleFamilyEventSubmit,
    handleRadaaSubmit,
    handleRadaaDelete,
    handleDelete,
    moveChild,
  };
}
