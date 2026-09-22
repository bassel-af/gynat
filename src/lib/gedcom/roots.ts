import type { Individual, GedcomData } from './types';
import { getDisplayName } from './display';
import { buildChildrenGraph, calculateDescendantCounts, buildJumpIndex } from './graph';

export function findRootAncestors(data: GedcomData): Individual[] {
  const { individuals } = data;
  const roots: Individual[] = [];

  // Include all non-private individuals as potential roots
  for (const id in individuals) {
    const person = individuals[id];
    if (!person.isPrivate) {
      roots.push(person);
    }
  }

  roots.sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
  return roots;
}

export function findDefaultRoot(data: GedcomData): Individual | null {
  const { individuals } = data;

  // «قفزة نسب» is consulted UNCONDITIONALLY here (no `includeJumps` opt-in):
  // a person with a jump has someone above him — an ancestor couple an unknown
  // distance up — so he is not the top of the tree and must never be crowned
  // the default root.
  //
  // The ROW is the truth, never the bare `ancestryJumpAsDescendant` flag: a
  // borrowed branch carries the SOURCE workspace's jump id into a payload that
  // has no such row, and trusting the flag would disqualify a legitimate root
  // over an id that means nothing here.
  const jumpIndex = buildJumpIndex(data);
  const hasJump = (person: Individual) => jumpIndex.byDescendant.has(person.id);

  // Find all non-private individuals with no parents (true roots at top level)
  const trueRoots: Individual[] = [];
  for (const id in individuals) {
    const person = individuals[id];
    if (!person.familyAsChild && !hasJump(person) && !person.isPrivate) {
      trueRoots.push(person);
    }
  }

  if (trueRoots.length === 0) {
    const allIndividuals = Object.values(individuals).filter((p) => !p.isPrivate);
    allIndividuals.sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
    return allIndividuals[0] || null;
  }

  if (trueRoots.length === 1) {
    return trueRoots[0];
  }

  // Build graph and calculate descendants using topological sort + DP. The
  // count crosses «قفزة نسب» edges so the apex ancestor outranks everyone below
  // him; on jump-free data this is identical to the jump-blind graph.
  const childrenOf = buildChildrenGraph(data, { includeJumps: true });
  const descendantCount = calculateDescendantCounts(individuals, childrenOf);

  // Find the root with most descendants
  let maxCount = -1;
  let selectedRoot: Individual | null = null;

  for (const root of trueRoots) {
    const count = descendantCount.get(root.id) || 0;
    if (count > maxCount) {
      maxCount = count;
      selectedRoot = root;
    }
  }

  return selectedRoot;
}
