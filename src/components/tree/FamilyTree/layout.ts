import type { Node, Edge } from '@xyflow/react';
import type { GraftDescriptor } from '@/lib/gedcom/graph';

// Layout configuration
export const NODE_WIDTH = 170;
export const NODE_HEIGHT = 140;
export const SPOUSE_WIDTH = 194; // Additional rendered width per spouse = card (NODE_WIDTH 170) + SPOUSE_GAP (24). Must match the DOM exactly, else tight sibling packing leaves near-zero gaps after wide multi-spouse nodes.
export const HORIZONTAL_GAP = 48; // Gap between siblings
export const VERTICAL_GAP = 150; // Gap between generations
export const SPOUSE_GAP = 24; // Gap between person card and first spouse card
export const GRAFT_HORIZONTAL_PADDING = 20; // Extra padding around graft envelopes

interface PersonNodeDataForLayout {
  spouses?: { spouse: { id: string } }[];
  [key: string]: unknown;
}

/**
 * Compute the graft envelope width for a single spouse.
 * If the spouse has no graft, returns regular SPOUSE_WIDTH.
 * If the spouse HAS a graft, returns the wider envelope.
 */
function graftEnvelopeWidth(graft: GraftDescriptor): number {
  const parentCount = graft.parentIds.length;
  const visibleSiblingCount = graft.siblingIds.length;
  const hasOverflow = graft.totalSiblingCount > visibleSiblingCount;
  const overflowCards = hasOverflow ? 1 : 0;

  const parentRowWidth = parentCount * NODE_WIDTH + Math.max(0, parentCount - 1) * HORIZONTAL_GAP;
  const siblingRowWidth = (visibleSiblingCount + overflowCards) * (NODE_WIDTH + HORIZONTAL_GAP);

  // The envelope must fit: the parent row above AND the spouse + siblings row below
  const spouseAndSiblingsWidth = SPOUSE_WIDTH + siblingRowWidth;
  return Math.max(parentRowWidth, spouseAndSiblingsWidth) + GRAFT_HORIZONTAL_PADDING;
}

/**
 * Custom tree layout that keeps siblings together.
 * Uses bottom-up width calculation + top-down positioning.
 *
 * When grafts are provided, the layout accounts for in-law family expansions
 * by computing wider envelopes for nodes with grafted spouses, ensuring
 * zero overlap between graft nodes and the rest of the tree.
 */
export interface GraftNodeBuilder {
  buildPersonNode: (personId: string) => Record<string, unknown>;
}

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  grafts?: Map<string, GraftDescriptor[]>,
  graftNodeBuilder?: GraftNodeBuilder
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes: [], edges };

  const graftMap = grafts || new Map<string, GraftDescriptor[]>();

  // Build node width map, accounting for graft envelopes
  const nodeWidths = new Map<string, number>();
  const nodeMap = new Map<string, Node>();
  nodes.forEach((node) => {
    const spouseCount = (node.data as PersonNodeDataForLayout).spouses?.length || 0;
    let width = NODE_WIDTH + spouseCount * SPOUSE_WIDTH;

    // If this node has grafts, compute the wider envelope
    const nodeGrafts = graftMap.get(node.id);
    if (nodeGrafts && nodeGrafts.length > 0) {
      // Replace the SPOUSE_WIDTH for each grafted spouse with the envelope width
      let graftExtra = 0;
      for (const graft of nodeGrafts) {
        // Remove one SPOUSE_WIDTH (already counted) and add the envelope
        graftExtra += graftEnvelopeWidth(graft) - SPOUSE_WIDTH;
      }
      width += graftExtra;
    }

    nodeWidths.set(node.id, width);
    nodeMap.set(node.id, node);
  });

  // Build parent -> children map (preserving edge order for consistent sibling order)
  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();
  // Map: parentId -> childId -> sourceHandle
  const childHandleMap = new Map<string, Map<string, string>>();
  edges.forEach((edge) => {
    const children = childrenOf.get(edge.source) || [];
    // Dedupe: a child can have multiple incoming edges from the same parent
    // (e.g. sister-wife husband H gets one F→H edge per sister, each targeting
    // a different spouse-target handle). Layout treats H as a single child.
    if (!children.includes(edge.target)) {
      children.push(edge.target);
    }
    childrenOf.set(edge.source, children);
    hasParent.add(edge.target);
    // Track which source handle connects to each child (first edge wins).
    const parentMap = childHandleMap.get(edge.source) || new Map<string, string>();
    if (!parentMap.has(edge.target)) {
      parentMap.set(edge.target, edge.sourceHandle || 'default');
    }
    childHandleMap.set(edge.source, parentMap);
  });

  // Find root (node with no parent)
  const rootId = nodes.find((n) => !hasParent.has(n.id))?.id;
  if (!rootId) return { nodes, edges };

  // ---------------------------------------------------------------------------
  // Contour-based layout (Reingold–Tilford style).
  //
  // The previous layout reserved each subtree's full bounding-box width and
  // centered every node over that whole box, so a shallow sibling was banished
  // to the far edge of a wide sibling's box — a wide branch pushed its small
  // brother far away with a big empty gap between them. Instead we now pack
  // sibling subtrees by their CONTOURS (the closest-facing silhouette at each
  // depth), sliding each one only until it clears the previous siblings by
  // HORIZONTAL_GAP at every shared depth. A shallow sibling therefore tucks
  // right beside a wide one and is pushed apart only at the depths where the
  // wide subtree actually encroaches. Each parent is centered over the midpoint
  // of its immediate children's cards.
  // ---------------------------------------------------------------------------

  type Contour = { left: number[]; right: number[] }; // by depth (0 = own row)
  interface SubtreeLayout {
    offsets: Map<string, number>; // nodeId -> left-edge X in this subtree's local frame
    left: number[];
    right: number[];
  }

  // Merge `child` (slid right by `shift`, one level down) into the accumulated
  // child-block contour (indexed by the child row = depth 0 of the block).
  function mergeContour(acc: Contour, child: SubtreeLayout, shift: number) {
    for (let d = 0; d < child.left.length; d++) {
      const l = child.left[d] + shift;
      const r = child.right[d] + shift;
      if (d >= acc.left.length) {
        acc.left[d] = l;
        acc.right[d] = r;
      } else {
        if (l < acc.left[d]) acc.left[d] = l;
        if (r > acc.right[d]) acc.right[d] = r;
      }
    }
  }

  // Smallest shift so `child` clears `acc` by HORIZONTAL_GAP at every shared depth.
  function requiredShift(acc: Contour, child: SubtreeLayout): number {
    const maxD = Math.min(acc.right.length, child.left.length);
    let shift = -Infinity;
    for (let d = 0; d < maxD; d++) {
      const need = acc.right[d] + HORIZONTAL_GAP - child.left[d];
      if (need > shift) shift = need;
    }
    return shift === -Infinity ? 0 : shift;
  }

  // Pack already-laid-out child subtrees left-to-right by contour.
  function packByContour(childLayouts: SubtreeLayout[]): { shifts: number[]; acc: Contour } {
    const acc: Contour = { left: [], right: [] };
    const shifts: number[] = [];
    for (let i = 0; i < childLayouts.length; i++) {
      const shift = i === 0 ? 0 : requiredShift(acc, childLayouts[i]);
      shifts.push(shift);
      mergeContour(acc, childLayouts[i], shift);
    }
    return { shifts, acc };
  }

  // Standard parent: contour-pack the children and center the parent over the
  // midpoint of the first and last child cards.
  function layoutStandard(
    nodeId: string,
    w: number,
    children: string[],
    childLayouts: SubtreeLayout[],
  ): SubtreeLayout {
    const { shifts, acc } = packByContour(childLayouts);

    const lastIdx = children.length - 1;
    const firstLeft = shifts[0] + (childLayouts[0].offsets.get(children[0]) ?? 0);
    const lastLeft = shifts[lastIdx] + (childLayouts[lastIdx].offsets.get(children[lastIdx]) ?? 0);
    const nodeCenter = (firstLeft + lastLeft + NODE_WIDTH) / 2; // midpoint of first/last card centers
    const nodeLeft = nodeCenter - w / 2;

    const offsets = new Map<string, number>();
    offsets.set(nodeId, nodeLeft);
    for (let i = 0; i < childLayouts.length; i++) {
      for (const [id, off] of childLayouts[i].offsets) offsets.set(id, off + shifts[i]);
    }

    const left = [nodeLeft];
    const right = [nodeLeft + w];
    for (let d = 0; d < acc.left.length; d++) {
      left[d + 1] = acc.left[d];
      right[d + 1] = acc.right[d];
    }
    return { offsets, left, right };
  }

  // Multi-wife parent (>1 spouse): each wife's children hang under her spouse
  // handle. Children within a wife-group are contour-packed; groups are centered
  // under their handle and pushed apart if they collide (preserves polygamy).
  function layoutMultiWife(
    nodeId: string,
    w: number,
    children: string[],
    childLayouts: SubtreeLayout[],
    handleMap: Map<string, string>,
  ): SubtreeLayout {
    const order: string[] = [];
    const groupIdxs = new Map<string, number[]>();
    children.forEach((childId, i) => {
      const handle = handleMap.get(childId) || 'default';
      if (!groupIdxs.has(handle)) {
        groupIdxs.set(handle, []);
        order.push(handle);
      }
      groupIdxs.get(handle)!.push(i);
    });

    interface Grp {
      handleX: number;
      width: number;
      gLeft: number;
      idxs: number[];
      shifts: number[];
      acc: Contour;
    }
    const groups: Grp[] = [];
    for (const handle of order) {
      const idxs = groupIdxs.get(handle)!;
      const { shifts, acc } = packByContour(idxs.map((i) => childLayouts[i]));
      let gLeft = Infinity;
      let gRight = -Infinity;
      for (let d = 0; d < acc.left.length; d++) {
        if (acc.left[d] < gLeft) gLeft = acc.left[d];
        if (acc.right[d] > gRight) gRight = acc.right[d];
      }
      if (!isFinite(gLeft)) {
        gLeft = 0;
        gRight = 0;
      }
      const match = handle.match(/spouse-(\d+)/);
      const handleX = match
        ? NODE_WIDTH + SPOUSE_GAP + parseInt(match[1]) * SPOUSE_WIDTH + NODE_WIDTH / 2
        : NODE_WIDTH / 2;
      groups.push({ handleX, width: gRight - gLeft, gLeft, idxs, shifts, acc });
    }

    // Order by handle X and push colliding groups to the right.
    groups.sort((a, b) => a.handleX - b.handleX);
    for (let i = 1; i < groups.length; i++) {
      const prevRight = groups[i - 1].handleX + groups[i - 1].width / 2;
      const currLeft = groups[i].handleX - groups[i].width / 2;
      if (currLeft < prevRight + HORIZONTAL_GAP) {
        groups[i].handleX = prevRight + HORIZONTAL_GAP + groups[i].width / 2;
      }
    }

    const offsets = new Map<string, number>();
    offsets.set(nodeId, 0);
    const left = [0];
    const right = [w];

    for (const g of groups) {
      const originAbs = g.handleX - g.width / 2 - g.gLeft;
      g.idxs.forEach((childIdx, k) => {
        const base = originAbs + g.shifts[k];
        for (const [id, off] of childLayouts[childIdx].offsets) offsets.set(id, off + base);
      });
      for (let d = 0; d < g.acc.left.length; d++) {
        const l = g.acc.left[d] + originAbs;
        const r = g.acc.right[d] + originAbs;
        const dd = d + 1;
        if (dd >= left.length) {
          left[dd] = l;
          right[dd] = r;
        } else {
          if (l < left[dd]) left[dd] = l;
          if (r > right[dd]) right[dd] = r;
        }
      }
    }

    return { offsets, left, right };
  }

  function layoutSubtree(nodeId: string): SubtreeLayout {
    const w = nodeWidths.get(nodeId) || NODE_WIDTH;
    const children = childrenOf.get(nodeId) || [];

    if (children.length === 0) {
      return { offsets: new Map([[nodeId, 0]]), left: [0], right: [w] };
    }

    const childLayouts = children.map(layoutSubtree);

    const node = nodeMap.get(nodeId);
    // Multi-wife parents (>1 spouse) get per-wife child grouping. Single-spouse
    // parents use the standard centered layout — their spouse-0 handle is at
    // (NODE_WIDTH + SPOUSE_WIDTH) / 2, which aligns with centered children.
    const spouseCount = (node?.data as PersonNodeDataForLayout)?.spouses?.length || 0;
    const handleMap = childHandleMap.get(nodeId);

    return spouseCount > 1 && handleMap
      ? layoutMultiWife(nodeId, w, children, childLayouts, handleMap)
      : layoutStandard(nodeId, w, children, childLayouts);
  }

  const rootLayout = layoutSubtree(rootId);

  // Vertical position is purely depth-based.
  const depthOf = new Map<string, number>();
  (function setDepth(id: string, d: number) {
    depthOf.set(id, d);
    for (const c of childrenOf.get(id) || []) setDepth(c, d + 1);
  })(rootId, 0);

  // Normalize so the leftmost card sits at x = 0.
  let minX = Infinity;
  for (const x of rootLayout.offsets.values()) if (x < minX) minX = x;
  if (!isFinite(minX)) minX = 0;

  const positions = new Map<string, { x: number; y: number }>();
  for (const [id, x] of rootLayout.offsets) {
    positions.set(id, {
      x: x - minX,
      y: (depthOf.get(id) ?? 0) * (NODE_HEIGHT + VERTICAL_GAP),
    });
  }

  // Create final positioned nodes
  const layoutedNodes: Node[] = nodes.map((node) => {
    const pos = positions.get(node.id) || { x: 0, y: 0 };
    return {
      ...node,
      position: pos,
    };
  });

  // Build a map of occupied X ranges per Y level (for collision detection with graft parents)
  const occupiedByY = new Map<number, Array<{ left: number; right: number }>>();
  for (const node of layoutedNodes) {
    const { x, y } = node.position;
    const nodeData = node.data as PersonNodeDataForLayout;
    const spouseCount = nodeData.spouses?.length || 0;
    const totalWidth = NODE_WIDTH + spouseCount * SPOUSE_WIDTH;
    const level = occupiedByY.get(y) || [];
    level.push({ left: x, right: x + totalWidth });
    occupiedByY.set(y, level);
  }

  // Collect graft nodes and edges
  const graftNodes: Node[] = [];
  const graftEdges: Edge[] = [];

  for (const [hubId, descriptors] of graftMap) {
    const hubPos = positions.get(hubId);
    if (!hubPos) continue;

    const hubNode = nodeMap.get(hubId);
    if (!hubNode) continue;

    // Base spouse count without grafts
    const spouseCount = (hubNode.data as PersonNodeDataForLayout).spouses?.length || 0;
    // Start X for graft zone: after the hub card + regular spouse cards
    const baseSpouseWidth = NODE_WIDTH + spouseCount * SPOUSE_WIDTH;

    // Track cumulative offset for multiple grafts on the same hub
    let graftOffsetX = 0;

    const hubSpouses = (hubNode.data as PersonNodeDataForLayout).spouses || [];

    for (const graft of descriptors) {
      const { spouseId, parentIds, siblingIds, totalSiblingCount, spouseSex } = graft;
      const spouseIndex = hubSpouses.findIndex(s => s.spouse.id === spouseId);
      const hasOverflow = totalSiblingCount > siblingIds.length;

      // Graft siblings: same Y as hub node, X extending outward from the spouse card
      const siblingStartX = hubPos.x + baseSpouseWidth + graftOffsetX + GRAFT_HORIZONTAL_PADDING / 2;

      for (let i = 0; i < siblingIds.length; i++) {
        const sibId = siblingIds[i];
        const sibX = siblingStartX + i * (NODE_WIDTH + HORIZONTAL_GAP);
        const sibNodeId = `graft-sibling-${sibId}`;

        graftNodes.push({
          id: sibNodeId,
          type: 'person',
          position: { x: sibX, y: hubPos.y },
          data: graftNodeBuilder
            ? { ...graftNodeBuilder.buildPersonNode(sibId), isInLawExpansion: true }
            : { isInLawExpansion: true, graftPersonId: sibId },
        });

        // Edge from graft parents to sibling (connect to first parent)
        if (parentIds.length > 0) {
          graftEdges.push({
            id: `graft-edge-${parentIds[0]}-${sibId}`,
            source: `graft-parent-${parentIds[0]}`,
            target: sibNodeId,
            type: 'smoothstep',
            className: 'in-law-edge',
          });
        }
      }

      // Overflow card "+N"
      if (hasOverflow) {
        const overflowCount = totalSiblingCount - siblingIds.length;
        const overflowX = siblingStartX + siblingIds.length * (NODE_WIDTH + HORIZONTAL_GAP);
        const overflowNodeId = `graft-overflow-${spouseId}`;

        graftNodes.push({
          id: overflowNodeId,
          type: 'graftOverflow',
          position: { x: overflowX, y: hubPos.y },
          data: { isInLawExpansion: true, overflowCount },
        });
      }

      // Compute the span of the spouse + siblings row for centering parents
      const visibleSibCount = siblingIds.length + (hasOverflow ? 1 : 0);
      const siblingRowEndX = visibleSibCount > 0
        ? siblingStartX + visibleSibCount * (NODE_WIDTH + HORIZONTAL_GAP) - HORIZONTAL_GAP
        : siblingStartX;

      const spouseX = hubPos.x + NODE_WIDTH + SPOUSE_GAP + (spouseIndex >= 0 ? spouseIndex : 0) * SPOUSE_WIDTH;
      const graftSpanLeft = Math.min(spouseX, siblingStartX);
      const graftSpanRight = Math.max(spouseX + NODE_WIDTH, siblingRowEndX);
      const graftSpanCenter = (graftSpanLeft + graftSpanRight) / 2;

      // Graft parents: Y = hubNodeY - NODE_HEIGHT - VERTICAL_GAP
      const parentY = hubPos.y - NODE_HEIGHT - VERTICAL_GAP;
      const parentRowWidth = parentIds.length * NODE_WIDTH + Math.max(0, parentIds.length - 1) * HORIZONTAL_GAP;
      let parentStartX = graftSpanCenter - parentRowWidth / 2;

      // Collision avoidance: shift graft parents right if they overlap with main tree nodes at that Y level
      const occupiedAtParentY = occupiedByY.get(parentY) || [];
      const graftParentLeft = parentStartX;
      const graftParentRight = parentStartX + parentRowWidth;

      for (const occupied of occupiedAtParentY) {
        // Check overlap (with padding)
        if (graftParentLeft < occupied.right + HORIZONTAL_GAP && graftParentRight > occupied.left - HORIZONTAL_GAP) {
          // Shift graft parents to the right of the occupied node
          parentStartX = occupied.right + HORIZONTAL_GAP;
        }
      }

      // Also register graft parents as occupied so subsequent grafts don't overlap
      const parentLevel = occupiedByY.get(parentY) || [];
      parentLevel.push({ left: parentStartX, right: parentStartX + parentRowWidth });
      occupiedByY.set(parentY, parentLevel);

      for (let i = 0; i < parentIds.length; i++) {
        const parentId = parentIds[i];
        const parentX = parentStartX + i * (NODE_WIDTH + HORIZONTAL_GAP);
        const parentNodeId = `graft-parent-${parentId}`;

        graftNodes.push({
          id: parentNodeId,
          type: 'person',
          position: { x: parentX, y: parentY },
          data: graftNodeBuilder
            ? { ...graftNodeBuilder.buildPersonNode(parentId), isInLawExpansion: true }
            : { isInLawExpansion: true, graftPersonId: parentId },
        });
      }

      // Edge from first parent to spouse (the married-in person)
      // Since the spouse is rendered inside the hub node (as a spouse card),
      // we create edges from parents to siblings and to the spouse card.
      // For parent-to-parent connector (if 2 parents):
      if (parentIds.length === 2) {
        graftEdges.push({
          id: `graft-edge-${parentIds[0]}-${parentIds[1]}`,
          source: `graft-parent-${parentIds[0]}`,
          target: `graft-parent-${parentIds[1]}`,
          type: 'smoothstep',
          className: 'in-law-edge',
        });
      }

      // Edge from graft parent to the spouse's target handle on the hub node
      if (parentIds.length > 0 && spouseIndex >= 0) {
        graftEdges.push({
          id: `graft-edge-parent-${parentIds[0]}-to-spouse-${spouseId}`,
          source: `graft-parent-${parentIds[0]}`,
          target: hubId,
          targetHandle: `spouse-target-${spouseIndex}`,
          type: 'smoothstep',
          className: 'in-law-edge',
        });
      }

      // Graft label node above each graft parent
      for (let i = 0; i < parentIds.length; i++) {
        const parentX = parentStartX + i * (NODE_WIDTH + HORIZONTAL_GAP);
        graftNodes.push({
          id: `graft-label-parent-${parentIds[i]}`,
          type: 'graftLabel',
          position: { x: parentX + NODE_WIDTH / 2 - 60, y: parentY - 30 },
          data: { isInLawExpansion: true, spouseId, spouseSex },
          draggable: false,
          selectable: false,
        });
      }

      // Label above each sibling
      for (let i = 0; i < siblingIds.length; i++) {
        const sibX = siblingStartX + i * (NODE_WIDTH + HORIZONTAL_GAP);
        graftNodes.push({
          id: `graft-label-sibling-${siblingIds[i]}`,
          type: 'graftLabel',
          position: { x: sibX + NODE_WIDTH / 2 - 60, y: hubPos.y - 30 },
          data: { isInLawExpansion: true, spouseId, spouseSex },
          draggable: false,
          selectable: false,
        });
      }

      // Update graft offset for next graft on same hub
      const envelopeW = graftEnvelopeWidth(graft);
      graftOffsetX += envelopeW - SPOUSE_WIDTH;
    }
  }

  return {
    nodes: [...layoutedNodes, ...graftNodes],
    edges: [...edges, ...graftEdges],
  };
}
