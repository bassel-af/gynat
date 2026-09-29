/**
 * The ONE place that removes name features a workspace has switched off.
 *
 * - `stripDisabledNameFeatures` — read side: every surface that serves tree
 *   data (member tree, export, public page, cross-workspace public copy)
 *   passes its GedcomData through here with the owning workspace's toggles.
 * - `dropDisabledNameInput` — write side: a create/update body loses the
 *   fields of a disabled feature so they are never persisted.
 *
 * Both are pure; the input is never mutated.
 */
import type { GedcomData, Individual } from '@/lib/gedcom/types';

export interface NameFeatureFlags {
  enableKunya: boolean;
  enableFamousName: boolean;
}

/** Prisma `select` for a workspace's name-feature toggles. */
export const NAME_FEATURE_SELECT = { enableKunya: true, enableFamousName: true } as const;

/** The toggles of a loaded workspace row — fail-closed: a missing row turns every feature off. */
export function nameFeatureFlags(
  workspace: Partial<NameFeatureFlags> | null | undefined,
): NameFeatureFlags {
  return {
    enableKunya: !!workspace?.enableKunya,
    enableFamousName: !!workspace?.enableFamousName,
  };
}

/** Read side: the write-side drop, except `kunya` (a required string) blanks. */
function stripIndividual(ind: Individual, flags: NameFeatureFlags): Individual {
  const out = dropDisabledNameInput(ind, flags);
  if (!flags.enableKunya) out.kunya = '';
  return out;
}

export function stripDisabledNameFeatures(
  data: GedcomData,
  flags: NameFeatureFlags,
): GedcomData {
  if (flags.enableKunya && flags.enableFamousName) return data;
  const individuals: Record<string, Individual> = {};
  for (const [id, ind] of Object.entries(data.individuals)) {
    individuals[id] = stripIndividual(ind, flags);
  }
  return { ...data, individuals };
}

type NameFeatureInput = {
  kunya?: unknown;
  famousName?: unknown;
  famousNameInNasab?: unknown;
};

export function dropDisabledNameInput<T extends NameFeatureInput>(
  input: T,
  flags: NameFeatureFlags,
): T {
  const out = { ...input };
  if (!flags.enableKunya) delete out.kunya;
  if (!flags.enableFamousName) {
    delete out.famousName;
    delete out.famousNameInNasab;
  }
  return out;
}
