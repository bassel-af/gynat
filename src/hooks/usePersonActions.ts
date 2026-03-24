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
  | { kind: 'edit' }
  | { kind: 'addChild'; targetFamilyId?: string }
  | { kind: 'addSpouse'; lockedSex?: 'M' | 'F' }
  | { kind: 'addParent'; lockedSex?: 'M' | 'F' }
  | { kind: 'editFamilyEvent'; familyId: string };

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
  handleFamilyEventSubmit: (eventData: FamilyEventFormData) => Promise<void>;
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
  // Form modal state
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

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
        body: JSON.stringify(serializeIndividualForm(formData)),
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
      const newFamily = await createFamily(familyOpts);

      await workspace.refreshTree();
      // Auto-open family event form so user can fill marriage info in the same flow
      setFormMode({ kind: 'editFamilyEvent', familyId: newFamily.id });
      setFormError('');
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

  const handleFamilyEventSubmit = useCallback(async (eventData: FamilyEventFormData) => {
    if (!workspace || formMode?.kind !== 'editFamilyEvent') return;
    setFormLoading(true);
    setFormError('');
    try {
      const res = await apiFetch(`/api/workspaces/${workspace.workspaceId}/tree/families/${formMode.familyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marriageContractDate: eventData.marriageContractDate || null,
          marriageContractHijriDate: eventData.marriageContractHijriDate || null,
          marriageContractPlace: eventData.marriageContractPlace || null,
          marriageContractDescription: eventData.marriageContractDescription || null,
          marriageContractNotes: eventData.marriageContractNotes || null,
          marriageDate: eventData.marriageDate || null,
          marriageHijriDate: eventData.marriageHijriDate || null,
          marriagePlace: eventData.marriagePlace || null,
          marriageDescription: eventData.marriageDescription || null,
          marriageNotes: eventData.marriageNotes || null,
          isDivorced: eventData.isDivorced,
          divorceDate: eventData.divorceDate || null,
          divorceHijriDate: eventData.divorceHijriDate || null,
          divorcePlace: eventData.divorcePlace || null,
          divorceDescription: eventData.divorceDescription || null,
          divorceNotes: eventData.divorceNotes || null,
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
  }, [workspace, formMode]);

  // -------------------------------------------------------------------------
  // Move child
  // -------------------------------------------------------------------------

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
      await workspace.refreshTree();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setFormLoading(false);
    }
  }, [workspace, person, personId]);

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
    handleFamilyEventSubmit,
    handleDelete,
    moveChild,
  };
}
