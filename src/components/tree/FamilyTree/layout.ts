import type { Node, Edge } from '@xyflow/react';
import type { GraftDescriptor } from '@/lib/gedcom/graph';

// Layout configuration
export const NODE_WIDTH = 170;
export const NODE_HEIGHT = 140;
export const SPOUSE_WIDTH = 190; // Additional width per spouse (card + gap)
export const HORIZONTAL_GAP = 48; // Gap between siblings (used between leaves and as the minimum elsewhere)
export const BRANCH_GAP = 96; // Wider gap between sibling subtrees so different branches stand out
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

export interface GraftNodeBuilder {
  buildPersonNode: (personId: string) => Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Contour-based subtree layout (Walker / Reingold-Tilford-style)
// ---------------------------------------------------------------------------

interface ContourLevel {
  left: number;
  right: number;
}

interface SubtreeLayout {
  // Card's left edge X position relative to subtree origin (origin = leftmost extent of any descendant).
  cardX: number;
  // Visual width of the card itself (NODE_WIDTH + spouseCount * SPOUSE_WIDTH, plus graft padding).
  cardWidth: number;
  // Per-level extent (level 0 = card's row). All values relative to subtree origin.
  contour: ContourLevel[];
  // For each direct child: the X offset where the child's own subtree origin sits within this subtree.
  childOffsets: Map<string, number>;
}

/**
 * Pack a sequence of child subtrees left-to-right with contour-aware minimum gap.
 * Returns child offsets (relative to packing origin = 0) and the merged contour
 * of the whole sequence.
 */
function packSiblings(
  childIds: string[],
  childLayouts: Map<string, SubtreeLayout>
): { childOffsets: Map<string, number>; cumulative: ContourLevel[] } {
  const childOffsets = new Map<string, number>();
  const cumulative: ContourLevel[] = [];

  // If any sibling in this batch has descendants, treat them as branches and
  // give them more breathing room. A row of pure leaves stays compact.
  const hasBranch = childIds.some((id) => {
    const c = childLayouts.get(id);
    return c !== undefined && c.contour.length > 1;
  });
  const gap = hasBranch ? BRANCH_GAP : HORIZONTAL_GAP;

  for (let i = 0; i < childIds.length; i++) {
    const childId = childIds[i];
    const child = childLayouts.get(childId);
    if (!child) continue;

    let offset: number;
    if (i === 0 || cumulative.length === 0) {
      offset = 0;
    } else {
      // Find the minimum offset such that child's contour clears cumulative
      // contour by `gap` at every overlapping level.
      let required = -Infinity;
      const minLevels = Math.min(cumulative.length, child.contour.length);
      for (let k = 0; k < minLevels; k++) {
        const sep = cumulative[k].right + gap - child.contour[k].left;
        if (sep > required) required = sep;
      }
      offset = required === -Infinity ? 0 : Math.max(0, required);
    }

    childOffsets.set(childId, offset);

    // Merge child's contour into cumulative, shifted by offset.
    for (let k = 0; k < child.contour.length; k++) {
      const shifted = {
        left: child.contour[k].left + offset,
        right: child.contour[k].right + offset,
      };
      if (k < cumulative.length) {
        cumulative[k] = {
          left: Math.min(cumulative[k].left, shifted.left),
          right: Math.max(cumulative[k].right, shifted.right),
        };
      } else {
        cumulative.push(shifted);
      }
    }
  }

  return { childOffsets, cumulative };
}

/**
 * Custom tree layout that keeps siblings together using contour-aware packing.
 *
 * Each subtree carries its left/right contour at every level. Adjacent subtrees
 * are packed using the minimum offset that keeps every level non-overlapping —
 * so a leaf sibling tucks in close to a wider sibling's card instead of being
 * pushed past the entire wide subtree.
 *
 * When grafts are provided, the layout accounts for in-law family expansions
 * by computing wider envelopes for nodes with grafted spouses.
 */
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

    const nodeGrafts = graftMap.get(node.id);
    if (nodeGrafts && nodeGrafts.length > 0) {
      let graftExtra = 0;
      for (const graft of nodeGrafts) {
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
    const parentMap = childHandleMap.get(edge.source) || new Map<string, string>();
    if (!parentMap.has(edge.target)) {
      parentMap.set(edge.target, edge.sourceHandle || 'default');
    }
    childHandleMap.set(edge.source, parentMap);
  });

  // Find root (node with no parent)
  const rootId = nodes.find((n) => !hasParent.has(n.id))?.id;
  if (!rootId) return { nodes, edges };

  // Bottom-up: compute SubtreeLayout for every node.
  const subtreeLayouts = new Map<string, SubtreeLayout>();

  function layoutSubtree(nodeId: string): SubtreeLayout {
    const cardWidth = nodeWidths.get(nodeId) || NODE_WIDTH;
    const children = childrenOf.get(nodeId) || [];

    if (children.length === 0) {
      const layout: SubtreeLayout = {
        cardX: 0,
        cardWidth,
        contour: [{ left: 0, right: cardWidth }],
        childOffsets: new Map(),
      };
      subtreeLayouts.set(nodeId, layout);
      return layout;
    }

    // Layout every child's subtree first (post-order).
    const childLayouts = new Map<string, SubtreeLayout>();
    for (const childId of children) {
      childLayouts.set(childId, layoutSubtree(childId));
    }

    const node = nodeMap.get(nodeId);
    const spouseCount = (node?.data as PersonNodeDataForLayout)?.spouses?.length || 0;
    const handleMap = childHandleMap.get(nodeId);

    if (spouseCount > 1 && handleMap) {
      const layout = layoutMultiWifeSubtree(nodeId, cardWidth, children, handleMap, childLayouts);
      subtreeLayouts.set(nodeId, layout);
      return layout;
    }

    // Standard branch: pack children left-to-right, center parent above the children block.
    const { childOffsets, cumulative } = packSiblings(children, childLayouts);

    // Children block extent at level 0 (the children's row).
    const top = cumulative[0];
    const childrenLeft = top.left;
    const childrenRight = top.right;
    const childrenMid = (childrenLeft + childrenRight) / 2;

    // Card centered horizontally above children block.
    const cardLeftRaw = childrenMid - cardWidth / 2;
    const cardRightRaw = cardLeftRaw + cardWidth;

    // Subtree's overall horizontal extent (across all levels, including card row).
    let overallLeft = cardLeftRaw;
    let overallRight = cardRightRaw;
    for (const lvl of cumulative) {
      if (lvl.left < overallLeft) overallLeft = lvl.left;
      if (lvl.right > overallRight) overallRight = lvl.right;
    }

    // Normalize so the subtree origin sits at x=0.
    const shift = -overallLeft;
    const cardX = cardLeftRaw + shift;

    const shiftedChildOffsets = new Map<string, number>();
    for (const [id, off] of childOffsets) {
      shiftedChildOffsets.set(id, off + shift);
    }

    // Build final contour: level 0 is the card row; subsequent levels come from
    // the children's merged contour, shifted by `shift`.
    const finalContour: ContourLevel[] = [{ left: cardX, right: cardX + cardWidth }];
    for (const lvl of cumulative) {
      finalContour.push({
        left: lvl.left + shift,
        right: lvl.right + shift,
      });
    }

    const layout: SubtreeLayout = {
      cardX,
      cardWidth,
      contour: finalContour,
      childOffsets: shiftedChildOffsets,
    };
    subtreeLayouts.set(nodeId, layout);
    return layout;
  }

  function layoutMultiWifeSubtree(
    _nodeId: string,
    cardWidth: number,
    children: string[],
    handleMap: Map<string, string>,
    childLayouts: Map<string, SubtreeLayout>
  ): SubtreeLayout {
    // Group children by spouse handle.
    const groupMap = new Map<string, string[]>();
    for (const childId of children) {
      const handle = handleMap.get(childId) || 'default';
      const group = groupMap.get(handle) || [];
      group.push(childId);
      groupMap.set(handle, group);
    }

    // For each group: pack its children, compute group's contour and ideal anchor X.
    interface MultiWifeGroup {
      handleX: number;
      childIds: string[];
      childOffsets: Map<string, number>; // relative to group origin
      contour: ContourLevel[]; // relative to group origin
      ideal: number; // group origin X relative to parent card so group center sits under handle
    }

    const groups: MultiWifeGroup[] = [];
    for (const [handle, groupChildren] of groupMap) {
      const { childOffsets, cumulative } = packSiblings(groupChildren, childLayouts);

      const top = cumulative[0];
      const groupLeft = top.left;
      const groupRight = top.right;
      const groupCenter = (groupLeft + groupRight) / 2;

      const match = handle.match(/spouse-(\d+)/);
      const handleX = match
        ? NODE_WIDTH + SPOUSE_GAP + parseInt(match[1]) * SPOUSE_WIDTH + NODE_WIDTH / 2
        : NODE_WIDTH / 2;

      groups.push({
        handleX,
        childIds: groupChildren,
        childOffsets,
        contour: cumulative,
        ideal: handleX - groupCenter,
      });
    }

    // Sort by handle X (left-to-right placement order).
    groups.sort((a, b) => a.handleX - b.handleX);

    // Place groups left-to-right, allowing each at its ideal anchor unless it
    // collides with the cumulative right contour of previous groups.
    const groupOffsets: number[] = [];
    const cumGroup: ContourLevel[] = [];

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      let groupOffset: number;

      if (i === 0 || cumGroup.length === 0) {
        groupOffset = g.ideal;
      } else {
        // Different wives' children are different branches — use the wider gap.
        let required = -Infinity;
        const minLevels = Math.min(cumGroup.length, g.contour.length);
        for (let k = 0; k < minLevels; k++) {
          const sep = cumGroup[k].right + BRANCH_GAP - g.contour[k].left;
          if (sep > required) required = sep;
        }
        const minOffset = required === -Infinity ? -Infinity : required;
        groupOffset = Math.max(g.ideal, minOffset);
      }

      groupOffsets.push(groupOffset);

      for (let k = 0; k < g.contour.length; k++) {
        const shifted = {
          left: g.contour[k].left + groupOffset,
          right: g.contour[k].right + groupOffset,
        };
        if (k < cumGroup.length) {
          cumGroup[k] = {
            left: Math.min(cumGroup[k].left, shifted.left),
            right: Math.max(cumGroup[k].right, shifted.right),
          };
        } else {
          cumGroup.push(shifted);
        }
      }
    }

    // Combined child offsets relative to parent card's left edge (= 0 pre-shift).
    const childOffsets = new Map<string, number>();
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const groupOffset = groupOffsets[i];
      for (const id of g.childIds) {
        const within = g.childOffsets.get(id) ?? 0;
        childOffsets.set(id, groupOffset + within);
      }
    }

    // Subtree extent: parent card occupies [0, cardWidth] pre-shift, children
    // occupy cumGroup. Take the union to find overall bounds.
    let overallLeft = 0;
    let overallRight = cardWidth;
    for (const lvl of cumGroup) {
      if (lvl.left < overallLeft) overallLeft = lvl.left;
      if (lvl.right > overallRight) overallRight = lvl.right;
    }

    const shift = -overallLeft;
    const cardX = 0 + shift;

    const shiftedChildOffsets = new Map<string, number>();
    for (const [id, off] of childOffsets) {
      shiftedChildOffsets.set(id, off + shift);
    }

    const finalContour: ContourLevel[] = [{ left: cardX, right: cardX + cardWidth }];
    for (const lvl of cumGroup) {
      finalContour.push({
        left: lvl.left + shift,
        right: lvl.right + shift,
      });
    }

    return {
      cardX,
      cardWidth,
      contour: finalContour,
      childOffsets: shiftedChildOffsets,
    };
  }

  layoutSubtree(rootId);

  // Top-down pass: assign absolute positions starting from root at (0, 0).
  const positions = new Map<string, { x: number; y: number }>();

  function assignPositions(nodeId: string, originX: number, y: number) {
    const layout = subtreeLayouts.get(nodeId);
    if (!layout) return;

    positions.set(nodeId, { x: originX + layout.cardX, y });
    const childY = y + NODE_HEIGHT + VERTICAL_GAP;
    for (const [childId, childOffset] of layout.childOffsets) {
      assignPositions(childId, originX + childOffset, childY);
    }
  }

  assignPositions(rootId, 0, 0);

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
        if (graftParentLeft < occupied.right + HORIZONTAL_GAP && graftParentRight > occupied.left - HORIZONTAL_GAP) {
          parentStartX = occupied.right + HORIZONTAL_GAP;
        }
      }

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

      if (parentIds.length === 2) {
        graftEdges.push({
          id: `graft-edge-${parentIds[0]}-${parentIds[1]}`,
          source: `graft-parent-${parentIds[0]}`,
          target: `graft-parent-${parentIds[1]}`,
          type: 'smoothstep',
          className: 'in-law-edge',
        });
      }

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

      // Graft label nodes
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

      const envelopeW = graftEnvelopeWidth(graft);
      graftOffsetX += envelopeW - SPOUSE_WIDTH;
    }
  }

  return {
    nodes: [...layoutedNodes, ...graftNodes],
    edges: [...edges, ...graftEdges],
  };
}
