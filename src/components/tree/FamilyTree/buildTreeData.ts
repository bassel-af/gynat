import type { Node, Edge } from '@xyflow/react';

import type { GedcomData, Individual } from '@/lib/gedcom';
import {
  getDisplayName,
  getAllDescendants,
  findTopmostAncestor,
  hasExternalFamily,
  computeGraftDescriptors,
} from '@/lib/gedcom';
import { getLayoutedElements, type GraftNodeBuilder } from './layout';

// Highlight state for lineage tracing
export interface HighlightState {
  ancestors: Set<string>;
  descendants: Set<string>;
  highlightedId: string | null;
}

// Per-spouse metadata attached to a node
export interface SpouseWithColor {
  spouse: Individual;
  color: string;
  highlightClass: string;
  hasExternalFamily: boolean;
  topAncestorId: string | null;
  /** When set: this spouse-card's underlying person ALSO appears as a main
   *  card elsewhere in the tree (cousin marriage). The string is the OTHER
   *  node id where they render — used to pan when the link badge is clicked.
   *  Presence implies "linked"; no separate boolean flag. */
  linkedTo?: string;
}

// Marker placed on a non-canonical co-parent who lost their children to the
// canonical parent under claim-once placement. Tells the user "your shared
// children are placed under your spouse — click to jump there".
export interface ChildrenElsewhere {
  spouseId: string;
  spouseName: string;
  count: number;
  canonicalNodeId: string;
}

export interface PersonNodeData {
  person: Individual;
  spouses: SpouseWithColor[];
  isRoot: boolean;
  searchQuery: string;
  isHighlightedPerson: boolean;
  isAncestor: boolean;
  isDescendant: boolean;
  hasHighlight: boolean;
  selectedPersonId: string | null;
  isInLawExpansion?: boolean;
  hideSpouseBadge?: boolean;
  /** When set: this person also appears as a spouse-card on another node
   *  (cousin marriage). The string is the OTHER node id where they appear
   *  as a spouse — used to pan on link badge click. Presence implies
   *  "linked"; no separate boolean flag. */
  linkedTo?: string;
  /** Populated when one or more shared families with a spouse have all
   *  children claimed by the spouse's canonical placement. */
  childrenElsewhere?: ChildrenElsewhere[];
  onPersonClick: (personId: string) => void;
  onOpenSidebar: () => void;
  onRerootToAncestor: (ancestorId: string, focusId?: string) => void;
  onJumpToNode?: (nodeId: string) => void;
  onSetHoveredOccurrence?: (id: string | null) => void;
  [key: string]: unknown;
}

/**
 * Build the dashed gold "same person" connector edge between the two
 * occurrences of a hovered linked-occurrence person (cousin marriage).
 *
 * Returns null when the hovered person isn't a linked occurrence — i.e.
 * doesn't appear as both a main-node AND a spouse-card on another node.
 *
 * Source: bottom-center of the hovered person's main-node card.
 * Target: top of the spouse-card on the OTHER node where this person
 *         appears as a spouse.
 */
export function computeOccurrenceLinkEdge(
  nodes: Node[],
  hoveredOccurrenceId: string | null,
): Edge | null {
  if (!hoveredOccurrenceId) return null;

  const mainNode = nodes.find((n) => n.id === hoveredOccurrenceId);
  if (!mainNode) return null;

  const spouseHostNode = nodes.find((n) => {
    const d = n.data as PersonNodeData;
    return d.spouses?.some((s) => s.spouse.id === hoveredOccurrenceId);
  });
  if (!spouseHostNode) return null;

  const spouseIdx = (spouseHostNode.data as PersonNodeData).spouses.findIndex(
    (s) => s.spouse.id === hoveredOccurrenceId,
  );
  if (spouseIdx < 0) return null;

  return {
    id: `occurrence-link-${hoveredOccurrenceId}`,
    source: mainNode.id,
    sourceHandle: 'default',
    target: spouseHostNode.id,
    targetHandle: `spouse-target-${spouseIdx}`,
    type: 'straight',
    className: 'occurrence-link',
    label: 'نفس الشخص',
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 8,
    selectable: false,
    focusable: false,
  };
}

// Heritage-palette colors for distinguishing children of different mothers
// in polygamous families. Warm, readable against the obsidian canvas.
export const SPOUSE_EDGE_COLORS = [
  '#c8a865', // gold (primary)
  '#2e9876', // emerald
  '#d28b8b', // dusty rose
  '#e6cf9e', // gold bright
  '#7fa891', // sage
  '#b59b73', // bronze
];

export interface BuildTreeDataCallbacks {
  onPersonClick: (personId: string) => void;
  onOpenSidebar: () => void;
  onRerootToAncestor: (ancestorId: string, focusId?: string) => void;
  onJumpToNode?: (nodeId: string) => void;
  onSetHoveredOccurrence?: (id: string | null) => void;
}

/**
 * Convert GEDCOM tree data to React Flow nodes and edges.
 *
 * Uses breadth-first traversal to keep siblings together in the layout.
 *
 * Cousin-marriage handling: when two blood descendants of the root marry
 * each other, their shared children are placed under exactly ONE parent —
 * the first one BFS dequeues. The other parent gets a `childrenElsewhere`
 * marker so the user can navigate to the canonical placement.
 *
 * Tiebreaker rule: first BFS dequeue wins. Documented intentionally — do
 * NOT replace with husband-preference or any other heuristic. Determinism
 * matters more than a "correct" parent.
 */
export function buildTreeData(
  data: GedcomData,
  rootId: string,
  maxDepth: number,
  searchQuery: string,
  highlightState: HighlightState,
  selectedPersonId: string | null,
  callbacks: BuildTreeDataCallbacks,
  useGrafts = false
): { nodes: Node[]; edges: Edge[] } {
  const { onPersonClick, onOpenSidebar, onRerootToAncestor, onJumpToNode, onSetHoveredOccurrence } = callbacks;
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const visited = new Set<string>();

  // Compute root descendants once for badge detection
  const rootDescendants = getAllDescendants(data, rootId);
  rootDescendants.add(rootId);

  // Tree-wide claim set for descendants. When a child is claimed by the
  // first parent that BFS reaches, no other parent may add an edge to it
  // or push it onto the queue. This single change kills the double
  // parent-edge, double subtree-width allocation, and position overwrite
  // that drove the cousin-marriage explosion.
  const claimedDescendants = new Set<string>();

  // Buffer of "your children are over there" markers — gathered during BFS,
  // attached to nodes in the second pass once we know which spouses actually
  // have a main-node id in this rendering.
  const childrenElsewhereByPerson = new Map<string, ChildrenElsewhere[]>();

  // Queue for breadth-first traversal: [personId, depth]
  const queue: Array<[string, number]> = [[rootId, 0]];

  while (queue.length > 0) {
    const [personId, depth] = queue.shift()!;

    if (depth > maxDepth || visited.has(personId)) continue;

    const person = data.individuals[personId];
    if (!person || person.isPrivate) continue;

    visited.add(personId);

    // Get all families where this person is a spouse
    const personFamilies = person.familiesAsSpouse
      .map((fid) => data.families[fid])
      .filter(Boolean);


    // Collect all unique non-private spouses
    const spouseIds: string[] = [];
    for (const fam of personFamilies) {
      const spouseId = fam.husband === personId ? fam.wife : fam.husband;
      if (spouseId && !spouseIds.includes(spouseId)) {
        const spouse = data.individuals[spouseId];
        if (spouse && !spouse.isPrivate) {
          spouseIds.push(spouseId);
        }
      }
    }

    // Determine highlight class for a person
    const getPersonHighlightClass = (id: string): string => {
      if (!highlightState.highlightedId) return '';
      if (id === highlightState.highlightedId) return 'lineage-selected';
      if (highlightState.ancestors.has(id)) return 'lineage-ancestor';
      if (highlightState.descendants.has(id)) return 'lineage-descendant';
      return 'lineage-dimmed';
    };

    // Create spouses array with colors, highlight classes, and external family info
    const spousesWithColors: SpouseWithColor[] = spouseIds
      .map((id, index) => {
        const spouse = data.individuals[id];
        if (!spouse) return null;
        const hasExtFam = hasExternalFamily(data, id, rootDescendants);
        return {
          spouse,
          color: SPOUSE_EDGE_COLORS[index % SPOUSE_EDGE_COLORS.length],
          highlightClass: getPersonHighlightClass(id),
          hasExternalFamily: hasExtFam,
          topAncestorId: hasExtFam ? (findTopmostAncestor(data, id) ?? id) : null,
        };
      })
      .filter((s): s is SpouseWithColor => s !== null);

    // Create node for this person with highlight flags
    const isHighlightedPerson = personId === highlightState.highlightedId;
    const isAncestor = highlightState.ancestors.has(personId);
    const isDescendant = highlightState.descendants.has(personId);
    const hasHighlight = highlightState.highlightedId !== null;

    nodes.push({
      id: personId,
      type: 'person',
      position: { x: 0, y: 0 }, // Will be set by layout
      data: {
        person,
        spouses: spousesWithColors,
        isRoot: depth === 0,
        searchQuery,
        isHighlightedPerson,
        isAncestor,
        isDescendant,
        hasHighlight,
        selectedPersonId,
        hideSpouseBadge: useGrafts,
        onPersonClick,
        onOpenSidebar,
        onRerootToAncestor,
        onJumpToNode,
        onSetHoveredOccurrence,
      } as PersonNodeData,
    });

    // Collect all children with their family info
    const allChildren: Array<{
      childId: string;
      spouseIndex: number;
      edgeColor: string;
      sourceHandle: string;
    }> = [];

    // Per-family bookkeeping: total non-private children vs how many we
    // actually claim here. If `total > 0 && claimedHere === 0`, every shared
    // child belongs to the spouse — emit a childrenElsewhere marker.
    interface FamilyChildBucket {
      familyId: string;
      spouseId: string | null;
      spouseIndex: number;
      total: number;
      claimedHere: number;
    }
    const familyBuckets: FamilyChildBucket[] = [];

    for (let i = 0; i < personFamilies.length; i++) {
      const fam = personFamilies[i];
      const spouseId = fam.husband === personId ? fam.wife : fam.husband;
      const spouseIndex = spouseId ? spouseIds.indexOf(spouseId) : -1;
      const edgeColor = SPOUSE_EDGE_COLORS[Math.max(0, spouseIndex) % SPOUSE_EDGE_COLORS.length];
      const sourceHandle = spouseIndex >= 0 ? `spouse-${spouseIndex}` : 'default';

      const bucket: FamilyChildBucket = {
        familyId: fam.id,
        spouseId,
        spouseIndex,
        total: 0,
        claimedHere: 0,
      };

      for (const childId of fam.children) {
        const child = data.individuals[childId];
        if (!child || child.isPrivate) continue;

        bucket.total += 1;

        // First BFS dequeue wins. If another parent has already claimed
        // this child, skip entirely — no edge, no queue entry. Document
        // the rule deliberately: determinism > "correct" parent choice.
        if (claimedDescendants.has(childId)) continue;

        claimedDescendants.add(childId);
        bucket.claimedHere += 1;
        allChildren.push({ childId, spouseIndex, edgeColor, sourceHandle });
      }

      familyBuckets.push(bucket);
    }

    // Pointed spouse source families: discover children from the pointed spouse's
    // own families in the source workspace (not reachable through the current person)
    const personFamilyIds = new Set(person.familiesAsSpouse);
    for (const spouseId of spouseIds) {
      const spouse = data.individuals[spouseId];
      if (!spouse?._pointed) continue;
      const spouseIndex = spouseIds.indexOf(spouseId);
      const edgeColor = SPOUSE_EDGE_COLORS[Math.max(0, spouseIndex) % SPOUSE_EDGE_COLORS.length];
      const sourceHandle = `spouse-${spouseIndex}`;
      for (const famId of spouse.familiesAsSpouse) {
        if (personFamilyIds.has(famId)) continue; // already traversed
        const fam = data.families[famId];
        if (!fam) continue;
        for (const childId of fam.children) {
          const child = data.individuals[childId];
          if (!child || child.isPrivate) continue;
          if (claimedDescendants.has(childId)) continue;
          claimedDescendants.add(childId);
          allChildren.push({ childId, spouseIndex, edgeColor, sourceHandle });
        }
      }
    }

    // Sort children by spouse index first, then by birth year
    allChildren.sort((a, b) => {
      if (a.spouseIndex !== b.spouseIndex) return a.spouseIndex - b.spouseIndex;
      const childA = data.individuals[a.childId];
      const childB = data.individuals[b.childId];
      const yearA = childA?.birth ? parseInt(childA.birth.match(/\d{4}/)?.[0] || '9999') : 9999;
      const yearB = childB?.birth ? parseInt(childB.birth.match(/\d{4}/)?.[0] || '9999') : 9999;
      return yearA - yearB;
    });

    // Create edges and add children to queue (BFS)
    for (const { childId, spouseIndex, edgeColor, sourceHandle } of allChildren) {
      // Cap offset to avoid exceeding the vertical gap between generations
      const edgeOffset = Math.min(20 + spouseIndex * 15, 50);

      // Determine edge highlight class
      let edgeClassName = '';

      // Pointed edge: both parent and child are from a branch pointer
      const child = data.individuals[childId];
      if (person._pointed && child?._pointed) {
        edgeClassName = 'pointed-edge';
      }

      if (highlightState.highlightedId) {
        const sourceInLineage = personId === highlightState.highlightedId ||
          highlightState.ancestors.has(personId) ||
          highlightState.descendants.has(personId);
        const targetInLineage = childId === highlightState.highlightedId ||
          highlightState.ancestors.has(childId) ||
          highlightState.descendants.has(childId);

        if (sourceInLineage && targetInLineage) {
          // Edge connects two lineage members - determine direction
          if (highlightState.descendants.has(childId) ||
              (personId === highlightState.highlightedId && highlightState.descendants.has(childId)) ||
              (highlightState.descendants.has(personId) && highlightState.descendants.has(childId))) {
            edgeClassName = 'lineage-descendant-edge';
          } else {
            edgeClassName = 'lineage-ancestor-edge';
          }
        } else {
          edgeClassName = 'lineage-dimmed';
        }
      }

      edges.push({
        id: `${personId}-${childId}`,
        source: personId,
        sourceHandle,
        target: childId,
        type: 'bezier',
        style: { stroke: edgeColor, strokeWidth: 1.6, opacity: 0.78 },
        className: edgeClassName,
        pathOptions: { offset: edgeOffset, borderRadius: 8 },
      } as Edge);
      // Add to queue for BFS traversal
      queue.push([childId, depth + 1]);
    }

    // Stash childrenElsewhere markers for any family whose entire shared-child
    // set was claimed by another parent. We resolve canonical ids in the
    // second pass — at this point we don't yet know which spouses become
    // main-nodes in the final node list.
    for (const bucket of familyBuckets) {
      if (bucket.total === 0) continue;
      if (bucket.claimedHere > 0) continue;
      if (!bucket.spouseId) continue;
      const spouse = data.individuals[bucket.spouseId];
      if (!spouse || spouse.isPrivate) continue;
      const list = childrenElsewhereByPerson.get(personId) ?? [];
      list.push({
        spouseId: bucket.spouseId,
        spouseName: getDisplayName(spouse),
        count: bucket.total,
        canonicalNodeId: bucket.spouseId, // resolved (and filtered) below
      });
      childrenElsewhereByPerson.set(personId, list);
    }
  }

  // Second pass: paired-occurrence detection.
  //
  // A person whose id appears as both (a) a main-node `node.id` AND (b)
  // inside another node's `spouses[]` array is a "linked occurrence". Both
  // sides get a `linkedTo` pointing at the OTHER node id, so the dot-click
  // handler can pan to it.
  //
  // First appearance only for spouse-card mapping — in cousin marriage each
  // cousin appears as a spouse exactly once (on the other cousin's row), so
  // first-write wins is well-defined.
  const mainNodeIds = new Set<string>();
  const spouseAppearances = new Map<string, string>();
  for (const node of nodes) {
    mainNodeIds.add(node.id);
    const nodeData = node.data as PersonNodeData;
    for (const sp of nodeData.spouses) {
      if (!spouseAppearances.has(sp.spouse.id)) {
        spouseAppearances.set(sp.spouse.id, node.id);
      }
    }
  }

  for (const node of nodes) {
    const nodeData = node.data as PersonNodeData;
    const personId = node.id;

    // Mark main-card if this person also appears as a spouse-card elsewhere.
    const spouseHostId = spouseAppearances.get(personId);
    if (spouseHostId && spouseHostId !== personId) {
      nodeData.linkedTo = spouseHostId;
    }

    // Mark spouse-cards whose underlying person also has a main-node.
    for (const sp of nodeData.spouses) {
      if (mainNodeIds.has(sp.spouse.id) && sp.spouse.id !== personId) {
        sp.linkedTo = sp.spouse.id;
      }
    }

    // Attach childrenElsewhere markers, filtering down to spouses whose
    // canonical placement actually exists as a main-node in this rendering.
    const elsewhere = childrenElsewhereByPerson.get(personId);
    if (elsewhere && elsewhere.length > 0) {
      const filtered = elsewhere
        .filter((entry) => mainNodeIds.has(entry.spouseId))
        .map((entry) => ({
          ...entry,
          canonicalNodeId: entry.spouseId,
        }));
      if (filtered.length > 0) {
        nodeData.childrenElsewhere = filtered;
      }
    }
  }

  const grafts = useGrafts ? computeGraftDescriptors(data, rootId) : undefined;
  const graftNodeBuilder: GraftNodeBuilder | undefined = grafts ? {
    buildPersonNode: (personId: string) => {
      const person = data.individuals[personId];
      return {
        person: person || { id: personId, name: personId, familiesAsSpouse: [], sex: '' as const },
        spouses: [],
        isRoot: false,
        searchQuery,
        isHighlightedPerson: highlightState.highlightedId === personId,
        isAncestor: highlightState.ancestors.has(personId),
        isDescendant: highlightState.descendants.has(personId),
        hasHighlight: !!highlightState.highlightedId,
        selectedPersonId,
        hideSpouseBadge: true,
        onPersonClick,
        onOpenSidebar,
        onRerootToAncestor,
      };
    },
  } : undefined;
  return getLayoutedElements(nodes, edges, grafts, graftNodeBuilder);
}
