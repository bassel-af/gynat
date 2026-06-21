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
  /** Multi-wife only: per-wife card left-offset (relative to the husband card
   *  left), computed by the layout so each mother sits over her own children.
   *  Indexed by spouse index. Absent → render wives in the default tight row. */
  spouseOffsets?: number[];
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
    selectable: false,
    focusable: false,
    zIndex: 1000,
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

interface SisterWifeCluster {
  husbandId: string;
  sisterIds: string[]; // eldest-first (by birth year, F.children-order tiebreak)
  anchorBirthYear: number; // birth year of eldest sister, used for surrogate slot
}

function detectSisterWifeClusters(
  parentFamilies: import('@/lib/gedcom').Family[],
  data: GedcomData,
  claimedDescendants: Set<string>,
): SisterWifeCluster[] {
  const childIds: string[] = [];
  const seen = new Set<string>();
  for (const fam of parentFamilies) {
    for (const cid of fam.children) {
      if (seen.has(cid)) continue;
      const c = data.individuals[cid];
      if (!c || c.isPrivate) continue;
      seen.add(cid);
      childIds.push(cid);
    }
  }
  if (childIds.length < 2) return [];

  // Group children by their outsider spouses.
  const spouseToSiblings = new Map<string, string[]>();
  for (const cid of childIds) {
    const c = data.individuals[cid];
    if (!c) continue;
    for (const fid of c.familiesAsSpouse) {
      const fam = data.families[fid];
      if (!fam) continue;
      const spouseId = fam.husband === cid ? fam.wife : fam.husband;
      if (!spouseId) continue;
      const list = spouseToSiblings.get(spouseId) ?? [];
      list.push(cid);
      spouseToSiblings.set(spouseId, list);
    }
  }

  const birthYear = (id: string): number => {
    const ind = data.individuals[id];
    if (!ind?.birth) return Number.POSITIVE_INFINITY;
    const m = ind.birth.match(/\d{4}/);
    return m ? parseInt(m[0]) : Number.POSITIVE_INFINITY;
  };

  const clusters: SisterWifeCluster[] = [];
  for (const [husbandId, siblings] of spouseToSiblings) {
    if (siblings.length < 2) continue;
    const husband = data.individuals[husbandId];
    if (!husband || husband.isPrivate) continue;
    // Bail when H is already a blood descendant claimed via another path —
    // sisters render as his normal spouse-cards under that path's claim.
    if (claimedDescendants.has(husbandId)) continue;

    const sortedSisters = [...siblings].sort((a, b) => {
      const ya = birthYear(a);
      const yb = birthYear(b);
      if (ya !== yb) return ya - yb;
      return childIds.indexOf(a) - childIds.indexOf(b);
    });

    clusters.push({
      husbandId,
      sisterIds: sortedSisters,
      anchorBirthYear: birthYear(sortedSisters[0]),
    });
  }
  return clusters;
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

  // Sister-wives clustering (A.2): when a man H marries multiple sisters, H
  // is promoted to a main BFS node (surrogate child of their shared parent
  // F). The sisters become spouse-cards on H's node. F→H parent-edges are
  // deferred until H's spouses[] is finalized so we can target the right
  // spouse-target handles.
  //
  //   clusterSurrogates: parent id → husband ids inserted as surrogate
  //     children at this parent. Used to suppress the natural single F→H
  //     edge during BFS — replaced by the deferred edges in pass 2.
  //   clusterBirthYearOverride: husband id → effective birth year (eldest
  //     sister's), consulted by allChildren.sort to slot H correctly.
  //   pendingClusterParentEdges: deferred F→H edges keyed by ordering.
  const clusterSurrogates = new Map<string, Set<string>>();
  const clusterBirthYearOverride = new Map<string, number>();
  const pendingClusterParentEdges: Array<{
    parentId: string;
    husbandId: string;
    sisterIds: string[];
    /** The parent's spouse (the sisters' mother) so the F→H link draws from
     *  HER handle, not the father's — keeps the cluster under its mother. */
    motherSpouseId: string | null;
  }> = [];

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

    // Detect sister-wife clusters at this parent. For each cluster, register
    // a surrogate H child (in lieu of S1, S2…) and queue H's BFS visit.
    const clusters = detectSisterWifeClusters(personFamilies, data, claimedDescendants);
    const sisterIdsToSkipAsChildren = new Set<string>();
    // Surrogate husband id → the sisters' mother (this parent's spouse), so the
    // cluster groups under HER handle in the layout and its edge draws from her.
    const clusterMotherSpouseId = new Map<string, string | null>();
    for (const cluster of clusters) {
      for (const sid of cluster.sisterIds) {
        claimedDescendants.add(sid);
        sisterIdsToSkipAsChildren.add(sid);
      }
      claimedDescendants.add(cluster.husbandId);
      clusterBirthYearOverride.set(cluster.husbandId, cluster.anchorBirthYear);
      const surrogates = clusterSurrogates.get(personId) ?? new Set<string>();
      surrogates.add(cluster.husbandId);
      clusterSurrogates.set(personId, surrogates);
      // The sisters are children of this parent; their mother is the spouse of
      // the parent's family that lists them as children.
      const sisterSet = new Set(cluster.sisterIds);
      let motherSpouseId: string | null = null;
      for (const fam of personFamilies) {
        if (fam.children.some((c) => sisterSet.has(c))) {
          motherSpouseId = fam.husband === personId ? fam.wife : fam.husband;
          break;
        }
      }
      clusterMotherSpouseId.set(cluster.husbandId, motherSpouseId);
      pendingClusterParentEdges.push({
        parentId: personId,
        husbandId: cluster.husbandId,
        sisterIds: cluster.sisterIds,
        motherSpouseId,
      });
    }

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

        // Sister-wives: skip cluster sisters here (they're rendered as
        // spouse-cards on the surrogate husband, not as F's main-node children).
        if (sisterIdsToSkipAsChildren.has(childId)) continue;

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

    // Insert sister-wife husband surrogates as children of F. They render as
    // their own main node with the sisters as spouse-cards. The natural
    // F→surrogate edge is emitted with sourceHandle 'default'; pass 2
    // replaces it with N spouse-target edges, one per sister.
    const surrogatesAtThisParent = clusterSurrogates.get(personId);
    if (surrogatesAtThisParent && surrogatesAtThisParent.size > 0) {
      for (const husbandId of surrogatesAtThisParent) {
        // Group the cluster under its mother's handle (so the layout places it
        // with her other children), falling back to the father when unknown.
        const motherSpouseId = clusterMotherSpouseId.get(husbandId) ?? null;
        const motherIdx = motherSpouseId ? spouseIds.indexOf(motherSpouseId) : -1;
        allChildren.push({
          childId: husbandId,
          spouseIndex: motherIdx,
          edgeColor: SPOUSE_EDGE_COLORS[Math.max(0, motherIdx) % SPOUSE_EDGE_COLORS.length],
          sourceHandle: motherIdx >= 0 ? `spouse-${motherIdx}` : 'default',
        });
      }
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

    // Sort children by spouse index first, then by birth year. Cluster
    // surrogate husbands use their eldest sister's birth year as their
    // ordering key (clusterBirthYearOverride) so they slot into F's siblings
    // in the place a sister would have occupied.
    allChildren.sort((a, b) => {
      if (a.spouseIndex !== b.spouseIndex) return a.spouseIndex - b.spouseIndex;
      const yearA = clusterBirthYearOverride.has(a.childId)
        ? clusterBirthYearOverride.get(a.childId)!
        : (() => {
            const childA = data.individuals[a.childId];
            return childA?.birth ? parseInt(childA.birth.match(/\d{4}/)?.[0] || '9999') : 9999;
          })();
      const yearB = clusterBirthYearOverride.has(b.childId)
        ? clusterBirthYearOverride.get(b.childId)!
        : (() => {
            const childB = data.individuals[b.childId];
            return childB?.birth ? parseInt(childB.birth.match(/\d{4}/)?.[0] || '9999') : 9999;
          })();
      return yearA - yearB;
    });

    // Create edges and add children to queue (BFS)
    const surrogatesHere = clusterSurrogates.get(personId);
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

      // For sister-wife surrogates, emit a placeholder F→H edge here so the
      // edge appears in the correct sibling order. Pass 2 swaps it for N
      // spouse-target edges (one per sister).
      const isSurrogate = surrogatesHere?.has(childId) === true;
      edges.push({
        id: isSurrogate
          ? `cluster-placeholder-${personId}-${childId}`
          : `${personId}-${childId}`,
        source: personId,
        sourceHandle,
        target: childId,
        type: 'bezier',
        style: { stroke: edgeColor, strokeWidth: 1.6, opacity: 0.78 },
        className: isSurrogate ? 'cluster-placeholder' : edgeClassName,
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

  // Deferred F→H parent-edges for sister-wife clusters: replace each
  // placeholder F→H edge with N spouse-target edges (one per sister), each
  // targeting that sister's spouse-target handle on H. Splice in place so
  // the resulting edges keep F's sibling-order position.
  for (const pending of pendingClusterParentEdges) {
    const placeholderIdx = edges.findIndex(
      (e) => e.id === `cluster-placeholder-${pending.parentId}-${pending.husbandId}`,
    );
    const husbandNode = nodes.find((n) => n.id === pending.husbandId);
    if (!husbandNode) {
      if (placeholderIdx >= 0) edges.splice(placeholderIdx, 1);
      continue;
    }
    const husbandData = husbandNode.data as PersonNodeData;
    // Draw the F→H link from the sisters' MOTHER's handle on F (not F's own),
    // so it visibly connects to her now that wives are spread over their kids.
    const parentNode = nodes.find((n) => n.id === pending.parentId);
    const parentSpouses = parentNode ? (parentNode.data as PersonNodeData).spouses : [];
    const motherIdx = pending.motherSpouseId
      ? parentSpouses.findIndex((s) => s.spouse.id === pending.motherSpouseId)
      : -1;
    const parentSourceHandle = motherIdx >= 0 ? `spouse-${motherIdx}` : 'default';
    const replacements: Edge[] = [];
    for (const sisterId of pending.sisterIds) {
      const sisterIdx = husbandData.spouses.findIndex((s) => s.spouse.id === sisterId);
      if (sisterIdx < 0) continue;
      const color = SPOUSE_EDGE_COLORS[sisterIdx % SPOUSE_EDGE_COLORS.length];
      replacements.push({
        id: `${pending.parentId}-${pending.husbandId}-via-${sisterId}`,
        source: pending.parentId,
        sourceHandle: parentSourceHandle,
        target: pending.husbandId,
        targetHandle: `spouse-target-${sisterIdx}`,
        type: 'bezier',
        style: { stroke: color, strokeWidth: 1.6, opacity: 0.78 },
        pathOptions: { offset: 20 + sisterIdx * 15, borderRadius: 8 },
      } as Edge);
    }
    if (placeholderIdx >= 0) {
      edges.splice(placeholderIdx, 1, ...replacements);
    } else {
      edges.push(...replacements);
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
