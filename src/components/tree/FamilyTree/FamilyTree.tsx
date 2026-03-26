'use client';

import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  ConnectionLineType,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  Controls,
  MiniMap,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { GedcomData, Individual } from '@/lib/gedcom';
import { getDisplayName, getAllAncestors, getAllDescendants, findTopmostAncestor, hasExternalFamily } from '@/lib/gedcom';
import { useTree } from '@/context/TreeContext';
import { RootBackChip } from '@/components/tree/RootBackChip/RootBackChip';

// Highlight state for lineage tracing
interface HighlightState {
  ancestors: Set<string>;
  descendants: Set<string>;
  highlightedId: string | null;
}

// Custom node component for a person (with spouses)
interface SpouseWithColor {
  spouse: Individual;
  color: string;
  highlightClass: string;
  hasExternalFamily: boolean;
  topAncestorId: string | null;
}

interface PersonNodeData {
  person: Individual;
  spouses: SpouseWithColor[];
  isRoot: boolean;
  searchQuery: string;
  isHighlightedPerson: boolean;
  isAncestor: boolean;
  isDescendant: boolean;
  hasHighlight: boolean;
  selectedPersonId: string | null;
  onPersonClick: (personId: string) => void;
  onOpenSidebar: () => void;
  onRerootToAncestor: (ancestorId: string) => void;
  [key: string]: unknown;
}

function PersonNode({ data }: { data: PersonNodeData }) {
  const { person, spouses, isRoot, searchQuery, isHighlightedPerson, isAncestor, isDescendant, hasHighlight, selectedPersonId, onPersonClick, onOpenSidebar, onRerootToAncestor } = data;

  const getHighlightClass = (_personId: string, isMainPerson: boolean) => {
    if (!hasHighlight) return '';

    // Check if this specific person (main or spouse) is highlighted
    if (isMainPerson && isHighlightedPerson) return 'lineage-selected';
    if (isMainPerson && isAncestor) return 'lineage-ancestor';
    if (isMainPerson && isDescendant) return 'lineage-descendant';

    // For spouses, we need to check their individual status
    // This will be passed through the data
    return 'lineage-dimmed';
  };

  const renderPersonCard = (p: Individual, isMainPerson: boolean, spouseHighlightClass?: string) => {
    const displayName = getDisplayName(p);
    const sexClass = p.sex === 'M' ? 'male' : p.sex === 'F' ? 'female' : '';
    const rootClass = isMainPerson && isRoot ? 'root' : '';
    const deceasedClass = p.isDeceased ? 'deceased' : '';
    const isMatch =
      searchQuery && displayName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchClass = isMatch ? 'search-match' : '';

    // Highlight class
    const highlightClass = isMainPerson
      ? getHighlightClass(p.id, true)
      : (spouseHighlightClass || (hasHighlight ? 'lineage-dimmed' : ''));

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onPersonClick(p.id);
    };

    const isSelected = selectedPersonId === p.id;

    return (
      <div className="person-card-wrapper">
        <div
          className={`person person-clickable ${sexClass} ${rootClass} ${deceasedClass} ${matchClass} ${highlightClass}`.trim()}
          onClick={handleClick}
        >
          <div className="person-name">{displayName}</div>
          {(p.birth || p.death || p.isDeceased) && (
            <div className="person-dates-container">
              {p.birth && (
                <div className="person-date-row">
                  <iconify-icon icon="lucide:calendar" width="14" />
                  <span>{p.birth}</span>
                </div>
              )}
              {p.death && (
                <div className="person-date-row death">
                  <iconify-icon icon="mdi:star-crescent" width="14" />
                  <span>{p.death}</span>
                </div>
              )}
            </div>
          )}
        </div>
        {isSelected && (
          <button
            className="person-detail-fab"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSidebar();
            }}
            aria-label="عرض تفاصيل الشخص"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M20 21V19C20 16.79 18.21 15 16 15H8C5.79 15 4 16.79 4 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
            </svg>
            <span>التفاصيل</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      {spouses.length === 0 ? (
        <>
          {renderPersonCard(person, true)}
          <Handle type="source" position={Position.Bottom} id="default" style={{ opacity: 0 }} />
        </>
      ) : (
        <div className="couple" style={{ position: 'relative' }}>
          {renderPersonCard(person, true)}
          {/* Connector lines from husband to each wife */}
          {spouses.map(({ color }, index) => {
            const lineWidth = 20 + index * 160;
            return (
              <div
                key={`line-${index}`}
                className="spouse-line"
                style={{
                  position: 'absolute',
                  left: 140,
                  top: `calc(50% + ${index * 4}px)`,
                  width: lineWidth,
                  height: 2,
                  backgroundColor: color,
                }}
              />
            );
          })}
          {/* Wife cards */}
          {spouses.map(({ spouse, highlightClass, hasExternalFamily: hasExtFam, topAncestorId }) => (
            <div key={spouse.id} className="spouse-card-wrapper" style={{ marginLeft: 20 }}>
              {hasExtFam && topAncestorId && (
                <div
                  className="spouse-family-badge"
                  role="button"
                  tabIndex={0}
                  aria-label={`عرض عائلة ${getDisplayName(spouse)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRerootToAncestor(topAncestorId);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onRerootToAncestor(topAncestorId);
                    }
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M18 9a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2"/>
                    <path d="M6 21a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2"/>
                    <path d="M15 6h-4a2 2 0 00-2 2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
              )}
              {renderPersonCard(spouse, false, highlightClass)}
            </div>
          ))}
          {/* If only one spouse: centered handle between couple */}
          {/* If multiple spouses: handles under each wife */}
          {spouses.length === 1 ? (
            <Handle
              type="source"
              position={Position.Bottom}
              id="spouse-0"
              style={{ opacity: 0 }}
            />
          ) : (
            <>
              {spouses.map((_, index) => (
                <Handle
                  key={`handle-${index}`}
                  type="source"
                  position={Position.Bottom}
                  id={`spouse-${index}`}
                  style={{
                    opacity: 0,
                    // Position under each wife: husband(140) + gap(20) + index*160 + halfCard(70)
                    left: 140 + 20 + index * 160 + 70,
                    // Offset vertically so edges don't overlap when going down
                    bottom: -(index * 8),
                  }}
                />
              ))}
              <Handle
                type="source"
                position={Position.Bottom}
                id="default"
                style={{ opacity: 0, left: 70 }}
              />
            </>
          )}
        </div>
      )}
    </>
  );
}

const nodeTypes = {
  person: PersonNode,
};

// Layout configuration
const NODE_WIDTH = 140;
const NODE_HEIGHT = 75;
const SPOUSE_WIDTH = 160; // Additional width per spouse (card + gap)

// Colors for different spouse edges (to distinguish children by mother)
const SPOUSE_EDGE_COLORS = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#10b981', // emerald
];

// Custom tree layout that keeps siblings together
// Uses bottom-up width calculation + top-down positioning
function getLayoutedElements(
  nodes: Node[],
  edges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes: [], edges };

  const HORIZONTAL_GAP = 40; // Gap between siblings
  const VERTICAL_GAP = 120; // Gap between generations

  // Build node width map
  const nodeWidths = new Map<string, number>();
  const nodeMap = new Map<string, Node>();
  nodes.forEach((node) => {
    const spouseCount = (node.data as PersonNodeData).spouses?.length || 0;
    const width = NODE_WIDTH + spouseCount * SPOUSE_WIDTH;
    nodeWidths.set(node.id, width);
    nodeMap.set(node.id, node);
  });

  // Build parent -> children map (preserving edge order for consistent sibling order)
  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();
  edges.forEach((edge) => {
    const children = childrenOf.get(edge.source) || [];
    children.push(edge.target);
    childrenOf.set(edge.source, children);
    hasParent.add(edge.target);
  });

  // Find root (node with no parent)
  const rootId = nodes.find((n) => !hasParent.has(n.id))?.id;
  if (!rootId) return { nodes, edges };

  // Calculate subtree widths bottom-up (post-order traversal)
  const subtreeWidths = new Map<string, number>();

  function calculateSubtreeWidth(nodeId: string): number {
    const children = childrenOf.get(nodeId) || [];
    const nodeWidth = nodeWidths.get(nodeId) || NODE_WIDTH;

    if (children.length === 0) {
      // Leaf node - subtree width is just the node width
      subtreeWidths.set(nodeId, nodeWidth);
      return nodeWidth;
    }

    // Sum of all children's subtree widths + gaps between them
    let childrenTotalWidth = 0;
    children.forEach((childId, index) => {
      childrenTotalWidth += calculateSubtreeWidth(childId);
      if (index < children.length - 1) {
        childrenTotalWidth += HORIZONTAL_GAP;
      }
    });

    // Subtree width is the larger of: node width or children total width
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

    // Center the node within its allocated subtree space
    const nodeX = x + (subtreeWidth - nodeWidth) / 2;
    positions.set(nodeId, { x: nodeX, y });

    // Position children
    const children = childrenOf.get(nodeId) || [];
    if (children.length === 0) return;

    // Calculate total children width
    let childrenTotalWidth = 0;
    children.forEach((childId, index) => {
      childrenTotalWidth += subtreeWidths.get(childId) || NODE_WIDTH;
      if (index < children.length - 1) {
        childrenTotalWidth += HORIZONTAL_GAP;
      }
    });

    // Start position for children (centered under this subtree's space)
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
  const layoutedNodes = nodes.map((node) => {
    const pos = positions.get(node.id) || { x: 0, y: 0 };
    return {
      ...node,
      position: pos,
    };
  });

  return { nodes: layoutedNodes, edges };
}

// Convert GEDCOM tree data to React Flow nodes and edges
// Uses breadth-first traversal to keep siblings together in the layout
function buildTreeData(
  data: GedcomData,
  rootId: string,
  maxDepth: number,
  searchQuery: string,
  highlightState: HighlightState,
  selectedPersonId: string | null,
  onPersonClick: (personId: string) => void,
  onOpenSidebar: () => void,
  onRerootToAncestor: (ancestorId: string) => void
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const visited = new Set<string>();

  // Compute root descendants once for badge detection
  const rootDescendants = getAllDescendants(data, rootId);
  rootDescendants.add(rootId);

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
          topAncestorId: hasExtFam ? findTopmostAncestor(data, id) : null,
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
        onPersonClick,
        onOpenSidebar,
        onRerootToAncestor,
      } as PersonNodeData,
    });

    // Collect all children with their family info
    const allChildren: Array<{
      childId: string;
      spouseIndex: number;
      edgeColor: string;
      sourceHandle: string;
    }> = [];

    const visitedChildren = new Set<string>();
    for (let i = 0; i < personFamilies.length; i++) {
      const fam = personFamilies[i];
      const spouseId = fam.husband === personId ? fam.wife : fam.husband;
      const spouseIndex = spouseId ? spouseIds.indexOf(spouseId) : -1;
      const edgeColor = SPOUSE_EDGE_COLORS[Math.max(0, spouseIndex) % SPOUSE_EDGE_COLORS.length];
      const sourceHandle = spouseIndex >= 0 ? `spouse-${spouseIndex}` : 'default';

      for (const childId of fam.children) {
        const child = data.individuals[childId];
        if (!child || child.isPrivate) continue;

        if (!visitedChildren.has(childId)) {
          visitedChildren.add(childId);
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
      const edgeOffset = 20 + spouseIndex * 15;

      // Determine edge highlight class
      let edgeClassName = '';
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
        type: 'smoothstep',
        style: { stroke: edgeColor, strokeWidth: 2 },
        className: edgeClassName,
        pathOptions: { offset: edgeOffset, borderRadius: 8 },
      } as Edge);
      // Add to queue for BFS traversal
      queue.push([childId, depth + 1]);
    }
  }

  return getLayoutedElements(nodes, edges);
}

function FamilyTreeInner({ hideMiniMap, hideControls }: FamilyTreeProps) {
  const { data, selectedRootId, config, searchQuery, focusPersonId, selectedPersonId, highlightedPersonId, setHighlightedPersonId, setSelectedPersonId, setSelectedRootId, setFocusPersonId, setMobileSidebarOpen } = useTree();
  const { setViewport, setCenter, getZoom } = useReactFlow();
  const [isReady, setIsReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevRootIdRef = useRef<string | null>(null);

  // Compute highlight state (ancestors and descendants of highlighted person)
  const highlightState = useMemo<HighlightState>(() => {
    if (!highlightedPersonId || !data) {
      return { ancestors: new Set(), descendants: new Set(), highlightedId: null };
    }
    return {
      ancestors: getAllAncestors(data, highlightedPersonId),
      descendants: getAllDescendants(data, highlightedPersonId),
      highlightedId: highlightedPersonId,
    };
  }, [highlightedPersonId, data]);

  // Click handler for person cards (toggle behavior)
  const handlePersonClick = useCallback((personId: string) => {
    setHighlightedPersonId(highlightedPersonId === personId ? null : personId);
    setSelectedPersonId(personId);
  }, [highlightedPersonId, setHighlightedPersonId, setSelectedPersonId]);

  // Open sidebar on mobile (triggered from node FAB)
  const handleOpenSidebar = useCallback(() => {
    setMobileSidebarOpen(true);
  }, [setMobileSidebarOpen]);

  // Re-root to a spouse's topmost ancestor
  const handleRerootToAncestor = useCallback((ancestorId: string) => {
    setSelectedRootId(ancestorId);
    setSelectedPersonId(null);
  }, [setSelectedRootId, setSelectedPersonId]);

  // Clear highlight when root changes
  useEffect(() => {
    if (highlightedPersonId) {
      setHighlightedPersonId(null);
    }
    // Only run when selectedRootId changes, not when highlightedPersonId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRootId]);

  // Reusable function to center viewport on a node (at top or centered)
  const scrollToNode = useCallback(
    (nodeId: string, nodes: Node[], position: 'top' | 'center' = 'center', animate = true) => {
      const targetNode = nodes.find((n) => n.id === nodeId);
      if (!targetNode || !containerRef.current) return;

      const nodeData = targetNode.data as PersonNodeData;
      const spouseCount = nodeData.spouses?.length || 0;
      const nodeWidth = NODE_WIDTH + spouseCount * SPOUSE_WIDTH;

      if (position === 'top') {
        // Position node at top, centered horizontally
        const { width } = containerRef.current.getBoundingClientRect();
        const zoom = 0.85;
        const topPadding = 40;

        const nodeCenterX = targetNode.position.x + nodeWidth / 2;
        const nodeTopY = targetNode.position.y;

        const x = width / 2 - nodeCenterX * zoom;
        const y = topPadding - nodeTopY * zoom;

        setViewport({ x, y, zoom }, { duration: animate ? 500 : 0 });
      } else {
        // Center node in viewport
        const centerX = targetNode.position.x + nodeWidth / 2;
        const centerY = targetNode.position.y + NODE_HEIGHT / 2;

        const currentZoom = getZoom();
        const zoom = currentZoom > 0.5 ? currentZoom : 0.85;

        setCenter(centerX, centerY, { zoom, duration: animate ? 500 : 0 });
      }
    },
    [setViewport, setCenter, getZoom]
  );

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!data || !selectedRootId) {
      return { initialNodes: [], initialEdges: [] };
    }

    const { nodes, edges } = buildTreeData(
      data,
      selectedRootId,
      config.maxDepth,
      searchQuery,
      highlightState,
      selectedPersonId,
      handlePersonClick,
      handleOpenSidebar,
      handleRerootToAncestor
    );

    return { initialNodes: nodes, initialEdges: edges };
  }, [data, selectedRootId, config.maxDepth, searchQuery, highlightState, selectedPersonId, handlePersonClick, handleOpenSidebar, handleRerootToAncestor]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when data changes
  useMemo(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Center viewport on focused person (including spouses who are part of another node)
  // Clear focusPersonId after centering so the effect only fires once per focus request.
  useEffect(() => {
    if (!focusPersonId || !isReady) return;

    // First try to find a node with this ID directly
    let targetNodeId = focusPersonId;
    const directNode = nodes.find((n) => n.id === focusPersonId);

    // If not found, search for a node that contains this person as a spouse
    if (!directNode) {
      const nodeWithSpouse = nodes.find((n) => {
        const nodeData = n.data as PersonNodeData;
        return nodeData.spouses?.some((s) => s.spouse.id === focusPersonId);
      });
      if (nodeWithSpouse) {
        targetNodeId = nodeWithSpouse.id;
      }
    }

    scrollToNode(targetNodeId, nodes, 'center', true);
    // Clear focus target so subsequent node changes don't re-trigger centering
    setFocusPersonId(null);
  }, [focusPersonId, nodes, isReady, scrollToNode, setFocusPersonId]);

  // Scroll to root when selectedRootId changes (not on initial load)
  useEffect(() => {
    if (!selectedRootId || !isReady) return;

    // Skip initial load (handled by onInit)
    if (prevRootIdRef.current === null) {
      prevRootIdRef.current = selectedRootId;
      return;
    }

    // Only scroll if root actually changed
    if (prevRootIdRef.current !== selectedRootId) {
      prevRootIdRef.current = selectedRootId;
      scrollToNode(selectedRootId, nodes, 'top', true);
    }
  }, [selectedRootId, nodes, isReady, scrollToNode]);

  // Position root at top, centered horizontally
  const onInit = useCallback(() => {
    const rootNode = initialNodes.find((n) => (n.data as PersonNodeData).isRoot);
    if (rootNode) {
      scrollToNode(rootNode.id, initialNodes, 'top', false);
    }
    requestAnimationFrame(() => setIsReady(true));
  }, [initialNodes, scrollToNode]);

  if (!data || !selectedRootId) {
    return (
      <div id="tree-container">
        <p style={{ textAlign: 'center', color: '#666' }}>
          اختر الجد الأعلى لعرض الشجرة
        </p>
      </div>
    );
  }

  return (
    <div id="tree-container" ref={containerRef} style={{ opacity: isReady ? 1 : 0 }}>
      <RootBackChip />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={onInit}
        onNodeClick={(_event, node) => handlePersonClick(node.id)}
        onPaneClick={() => { setHighlightedPersonId(null); setSelectedPersonId(null); }}
        nodeTypes={nodeTypes}
        connectionLineType={ConnectionLineType.SmoothStep}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
      >
        {!hideControls && <Controls />}
        {!hideMiniMap && <MiniMap nodeStrokeWidth={3} zoomable pannable />}
      </ReactFlow>
    </div>
  );
}

export interface FamilyTreeProps {
  hideMiniMap?: boolean;
  hideControls?: boolean;
}

export function FamilyTree({ hideMiniMap = false, hideControls = false }: FamilyTreeProps) {
  return (
    <ReactFlowProvider>
      <FamilyTreeInner hideMiniMap={hideMiniMap} hideControls={hideControls} />
    </ReactFlowProvider>
  );
}
