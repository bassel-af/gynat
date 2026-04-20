import type { Node, Edge } from '@xyflow/react';
import type { GraftDescriptor } from '@/lib/gedcom/graph';

// Layout configuration
export const NODE_WIDTH = 170;
export const NODE_HEIGHT = 140;
export const SPOUSE_WIDTH = 190; // Additional width per spouse (card + gap)
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
    children.push(edge.target);
    childrenOf.set(edge.source, children);
    hasParent.add(edge.target);
    // Track which source handle connects to each child
    const parentMap = childHandleMap.get(edge.source) || new Map<string, string>();
    parentMap.set(edge.target, edge.sourceHandle || 'default');
    childHandleMap.set(edge.source, parentMap);
  });

  // Find root (node with no parent)
  const rootId = nodes.find((n) => !hasParent.has(n.id))?.id;
  if (!rootId) return { nodes, edges };

  // Multi-wife layout info: groups of children positioned under each wife's handle
  interface WifeGroup {
    handleX: number; // handle X relative to node left edge
    children: string[];
    width: number; // total width of children subtrees with gaps
  }
  const multiWifeLayout = new Map<string, {
    groups: WifeGroup[];
    nodeOffset: number; // offset of node left edge from subtree start
  }>();

  // Calculate subtree widths bottom-up (post-order traversal)
  const subtreeWidths = new Map<string, number>();

  function calculateSubtreeWidth(nodeId: string): number {
    const children = childrenOf.get(nodeId) || [];
    const nodeWidth = nodeWidths.get(nodeId) || NODE_WIDTH;

    if (children.length === 0) {
      subtreeWidths.set(nodeId, nodeWidth);
      return nodeWidth;
    }

    // Multi-wife parents (>1 spouse) get per-wife child grouping.
    // Single-spouse parents use standard centered layout — their spouse-0
    // handle is at (NODE_WIDTH + SPOUSE_WIDTH) / 2 which aligns with centered children.
    const node = nodeMap.get(nodeId);
    const spouseCount = (node?.data as PersonNodeDataForLayout)?.spouses?.length || 0;
    const handleMap = childHandleMap.get(nodeId);

    if (spouseCount > 1 && handleMap) {
      // Group children by source handle
      const groupMap = new Map<string, string[]>();
      for (const childId of children) {
        const handle = handleMap.get(childId) || 'default';
        const group = groupMap.get(handle) || [];
        group.push(childId);
        groupMap.set(handle, group);
      }

      // Build wife groups with handle X positions and widths
      const groups: WifeGroup[] = [];
      for (const [handle, groupChildren] of groupMap) {
        let groupWidth = 0;
        groupChildren.forEach((childId, i) => {
          groupWidth += calculateSubtreeWidth(childId);
          if (i < groupChildren.length - 1) groupWidth += HORIZONTAL_GAP;
        });

        const match = handle.match(/spouse-(\d+)/);
        const handleX = match
          ? NODE_WIDTH + SPOUSE_GAP + parseInt(match[1]) * SPOUSE_WIDTH + NODE_WIDTH / 2
          : NODE_WIDTH / 2;

        groups.push({ handleX, children: groupChildren, width: groupWidth });
      }

      // Sort by handle X
      groups.sort((a, b) => a.handleX - b.handleX);

      // Resolve overlaps: push groups right if they collide
      for (let i = 1; i < groups.length; i++) {
        const prevRight = groups[i - 1].handleX + groups[i - 1].width / 2;
        const currLeft = groups[i].handleX - groups[i].width / 2;
        if (currLeft < prevRight + HORIZONTAL_GAP) {
          groups[i].handleX = prevRight + HORIZONTAL_GAP + groups[i].width / 2;
        }
      }

      // Calculate subtree extent (relative to node left edge)
      let leftmost = 0;
      let rightmost = nodeWidth;
      for (const g of groups) {
        leftmost = Math.min(leftmost, g.handleX - g.width / 2);
        rightmost = Math.max(rightmost, g.handleX + g.width / 2);
      }

      const subtreeWidth = rightmost - leftmost;
      const nodeOffset = -leftmost;

      multiWifeLayout.set(nodeId, { groups, nodeOffset });
      subtreeWidths.set(nodeId, subtreeWidth);
      return subtreeWidth;
    }

    // Standard: sum of all children's subtree widths + gaps between them
    let childrenTotalWidth = 0;
    children.forEach((childId, index) => {
      childrenTotalWidth += calculateSubtreeWidth(childId);
      if (index < children.length - 1) {
        childrenTotalWidth += HORIZONTAL_GAP;
      }
    });

    const subtreeWidth = Math.max(nodeWidth, childrenTotalWidth);
    subtreeWidths.set(nodeId, subtreeWidth);
    return subtreeWidth;
  }

  calculateSubtreeWidth(rootId);

  // Assign positions top-down (pre-order traversal)
  const positions = new Map<string, { x: number; y: number }>();

  function assignPositions(nodeId: string, x: number, y: number) {
    const nodeWidth = nodeWidths.get(nodeId) || NODE_WIDTH;
    const subtreeWidth = subtreeWidths.get(nodeId) || nodeWidth;

    const multiWife = multiWifeLayout.get(nodeId);

    if (multiWife) {
      // Multi-wife: position node using stored offset
      const nodeX = x + multiWife.nodeOffset;
      positions.set(nodeId, { x: nodeX, y });

      const childY = y + NODE_HEIGHT + VERTICAL_GAP;

      // Position each group centered at its wife handle X
      for (const group of multiWife.groups) {
        let childX = nodeX + group.handleX - group.width / 2;

        for (const childId of group.children) {
          const childSubtreeWidth = subtreeWidths.get(childId) || NODE_WIDTH;
          assignPositions(childId, childX, childY);
          childX += childSubtreeWidth + HORIZONTAL_GAP;
        }
      }
      return;
    }

    // Standard: center the node within its allocated subtree space
    const nodeX = x + (subtreeWidth - nodeWidth) / 2;
    positions.set(nodeId, { x: nodeX, y });

    const children = childrenOf.get(nodeId) || [];
    if (children.length === 0) return;

    let childrenTotalWidth = 0;
    children.forEach((childId, index) => {
      childrenTotalWidth += subtreeWidths.get(childId) || NODE_WIDTH;
      if (index < children.length - 1) {
        childrenTotalWidth += HORIZONTAL_GAP;
      }
    });

    let childX = x + (subtreeWidth - childrenTotalWidth) / 2;
    const childY = y + NODE_HEIGHT + VERTICAL_GAP;

    children.forEach((childId) => {
      const childSubtreeWidth = subtreeWidths.get(childId) || NODE_WIDTH;
      assignPositions(childId, childX, childY);
      childX += childSubtreeWidth + HORIZONTAL_GAP;
    });
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
