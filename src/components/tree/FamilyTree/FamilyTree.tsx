'use client';

import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Node,
  useNodesState,
  useEdgesState,
  ConnectionLineType,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { Individual } from '@/lib/gedcom';
import { getDisplayName, getAllAncestors, getAllDescendants } from '@/lib/gedcom';
import { useTree } from '@/context/TreeContext';
import { useOptionalWorkspaceTree } from '@/context/WorkspaceTreeContext';
import { shouldHideBirthDate } from '@/lib/tree/birth-date-privacy';
import { NodeSilhouette } from '@/components/heritage/NodeSilhouette';
import { NODE_WIDTH, NODE_HEIGHT, SPOUSE_WIDTH, SPOUSE_GAP } from './layout';
import { buildTreeData, computeOccurrenceLinkEdge, type HighlightState, type PersonNodeData } from './buildTreeData';

function PersonNode({ data }: { data: PersonNodeData }) {
  const {
    person,
    spouses,
    isRoot,
    searchQuery,
    isHighlightedPerson,
    isAncestor,
    isDescendant,
    hasHighlight,
    selectedPersonId,
    isInLawExpansion,
    hideSpouseBadge,
    linkedTo: mainLinkedTo,
    childrenElsewhere,
    onPersonClick,
    onOpenSidebar,
    onRerootToAncestor,
    onJumpToNode,
    onSetHoveredOccurrence,
  } = data;
  const wsContext = useOptionalWorkspaceTree();

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

  const renderPersonCard = (
    p: Individual,
    isMainPerson: boolean,
    spouseHighlightClass?: string,
    linkedTo?: string,
  ) => {
    const displayName = getDisplayName(p);
    const sexClass = p.sex === 'M' ? 'male' : p.sex === 'F' ? 'female' : '';
    const rootClass = isMainPerson && isRoot ? 'root' : '';
    const deceasedClass = p.isDeceased ? 'deceased' : '';
    const inLawClass = isInLawExpansion ? 'in-law-expansion' : '';
    const pointedClass = p._pointed ? 'pointed' : '';
    const hideBirth = shouldHideBirthDate(p, {
      hideBirthDateForFemale: wsContext?.hideBirthDateForFemale,
      hideBirthDateForMale: wsContext?.hideBirthDateForMale,
    });
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

    const handleHoverEnter = linkedTo && onSetHoveredOccurrence
      ? () => onSetHoveredOccurrence(p.id)
      : undefined;
    const handleHoverLeave = linkedTo && onSetHoveredOccurrence
      ? () => onSetHoveredOccurrence(null)
      : undefined;

    const handleJumpToOccurrence = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (linkedTo && onJumpToNode) onJumpToNode(linkedTo);
    };

    const isSelected = selectedPersonId === p.id;

    return (
      <div
        className="person-card-wrapper"
        onMouseEnter={handleHoverEnter}
        onMouseLeave={handleHoverLeave}
      >
        <div
          className={`person person-clickable ${sexClass} ${rootClass} ${deceasedClass} ${matchClass} ${highlightClass} ${inLawClass} ${pointedClass}`.trim()}
          onClick={handleClick}
        >
          <div className="person-avatar">
            <NodeSilhouette sex={p.sex} size={48} />
          </div>
          <div className="person-name">{displayName}</div>
          {((!hideBirth && p.birth) || p.death || p.isDeceased) && (
            <div className="person-dates-container">
              {!hideBirth && p.birth && (
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
        {p._pointed && (
          <div className="pointed-badge" title="فرع مرتبط — للقراءة فقط">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
        {linkedTo && (
          <button
            type="button"
            className="linked-occurrence-badge"
            title="نفس الشخص — يظهر في موضعين"
            aria-label="انتقل إلى الموضع الآخر لهذا الشخص"
            onClick={handleJumpToOccurrence}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="9" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
              <circle cx="15" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        )}
        {p._sharedRoot && (
          <div className="shared-root-badge" title="فرع مُشارَك">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="16 6 12 2 8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="12" y1="2" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
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
      <Handle type="target" position={Position.Top} style={{ opacity: 0, left: NODE_WIDTH / 2 }} />
      {spouses.length === 0 ? (
        <>
          {renderPersonCard(person, true, undefined, mainLinkedTo)}
          <Handle type="source" position={Position.Bottom} id="default" style={{ opacity: 0 }} />
        </>
      ) : (
        <div className="couple" style={{ position: 'relative' }}>
          {renderPersonCard(person, true, undefined, mainLinkedTo)}
          {/* Connector lines from husband to each wife */}
          {spouses.map(({ color }, index) => {
            const lineWidth = SPOUSE_GAP + index * SPOUSE_WIDTH;
            return (
              <div
                key={`line-${index}`}
                className="spouse-line"
                style={{
                  position: 'absolute',
                  left: NODE_WIDTH,
                  top: `calc(50% + ${index * 4}px)`,
                  width: lineWidth,
                  height: 2,
                  backgroundColor: color,
                }}
              />
            );
          })}
          {/* Wife cards */}
          {spouses.map(({ spouse, highlightClass, hasExternalFamily: hasExtFam, topAncestorId, linkedTo: spouseLinkedTo }, spouseIdx) => (
            <div key={spouse.id} className="spouse-card-wrapper" style={{ marginLeft: SPOUSE_GAP, position: 'relative' }}>
              {/* Target handle for graft parent edges */}
              <Handle
                type="target"
                position={Position.Top}
                id={`spouse-target-${spouseIdx}`}
                style={{
                  opacity: 0,
                  left: 70,
                  top: 0,
                }}
              />
              {!hideSpouseBadge && hasExtFam && topAncestorId && (
                <div
                  className="spouse-family-badge"
                  role="button"
                  tabIndex={0}
                  aria-label={`عرض عائلة ${getDisplayName(spouse)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRerootToAncestor(topAncestorId, spouse.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onRerootToAncestor(topAncestorId, spouse.id);
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
              {renderPersonCard(spouse, false, highlightClass, spouseLinkedTo)}
            </div>
          ))}
          {/* "Children placed under your spouse" markers — appear when this
              person's shared children with a spouse were claimed by the
              spouse's canonical placement (cousin marriage). */}
          {childrenElsewhere && childrenElsewhere.length > 0 && (
            <div className="children-elsewhere-row">
              {childrenElsewhere.map((entry) => (
                <button
                  key={entry.canonicalNodeId}
                  type="button"
                  className="children-elsewhere-pill"
                  title={`${entry.count} أبناء ظاهرون مع ${entry.spouseName}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onJumpToNode) onJumpToNode(entry.canonicalNodeId);
                  }}
                >
                  <span className="children-elsewhere-arrow" aria-hidden="true">↗</span>
                  <span>{entry.count} أبناء مع {entry.spouseName}</span>
                </button>
              ))}
            </div>
          )}
          {/* If only one spouse: centered handle between couple */}
          {/* If multiple spouses: handles under each wife */}
          {spouses.length === 1 ? (
            <>
              <Handle
                type="source"
                position={Position.Bottom}
                id="spouse-0"
                style={{ opacity: 0, left: (NODE_WIDTH + SPOUSE_WIDTH) / 2 }}
              />
              <Handle
                type="source"
                position={Position.Bottom}
                id="default"
                style={{ opacity: 0, left: 70 }}
              />
            </>
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
                    left: NODE_WIDTH + SPOUSE_GAP + index * SPOUSE_WIDTH + NODE_WIDTH / 2,
                  }}
                />
              ))}
              <Handle
                type="source"
                position={Position.Bottom}
                id="default"
                style={{ opacity: 0, left: NODE_WIDTH / 2 }}
              />
            </>
          )}
        </div>
      )}
    </>
  );
}

// Graft label node: small floating pill label for in-law family groups
function GraftLabelNode({ data }: { data: { spouseSex?: string; [key: string]: unknown } }) {
  const label = data.spouseSex === 'F' ? 'عائلة الزوجة' : 'عائلة الزوج';
  return (
    <div className="graft-label">{label}</div>
  );
}

// Graft overflow node: "+N" card showing count of hidden siblings
function GraftOverflowNode({ data }: { data: { overflowCount: number; [key: string]: unknown } }) {
  return (
    <div className="graft-overflow person in-law-expansion">
      +{data.overflowCount}
    </div>
  );
}

const nodeTypes = {
  person: PersonNode,
  graftLabel: GraftLabelNode,
  graftOverflow: GraftOverflowNode,
};


function FamilyTreeInner({ hideMiniMap, hideControls }: FamilyTreeProps) {
  const { data, selectedRootId, initialRootId, config, searchQuery, focusPersonId, selectedPersonId, highlightedPersonId, setHighlightedPersonId, setSelectedPersonId, setSelectedRootId, setFocusPersonId, setMobileSidebarOpen, viewMode } = useTree();
  // Hover state for the cousin-marriage occurrence-link edge — kept local
  // so its high-frequency updates don't ripple through every TreeContext
  // consumer (Sidebar, every PersonNode...).
  const [hoveredOccurrenceId, setHoveredOccurrenceIdState] = useState<string | null>(null);
  const setHoveredOccurrenceId = useCallback((id: string | null) => {
    setHoveredOccurrenceIdState(id);
  }, []);
  const { setViewport, setCenter, getZoom, getViewport, fitView } = useReactFlow();
  const [isReady, setIsReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevRootIdRef = useRef<string | null>(null);
  const savedViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

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
  const handleRerootToAncestor = useCallback((ancestorId: string, focusId?: string) => {
    setSelectedRootId(ancestorId);
    setSelectedPersonId(null);
    if (focusId) {
      setFocusPersonId(focusId);
    }
  }, [setSelectedRootId, setSelectedPersonId, setFocusPersonId]);

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

  // Ref to the latest layouted nodes, so the jump-to-occurrence /
  // jump-to-canonical callbacks captured inside React Flow node data can
  // resolve a node's screen position without us re-creating buildTreeData.
  const nodesRef = useRef<Node[]>([]);

  const handleJumpToNode = useCallback(
    (nodeId: string) => {
      scrollToNode(nodeId, nodesRef.current, 'center', true);
    },
    [scrollToNode],
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
      {
        onPersonClick: handlePersonClick,
        onOpenSidebar: handleOpenSidebar,
        onRerootToAncestor: handleRerootToAncestor,
        onJumpToNode: handleJumpToNode,
        onSetHoveredOccurrence: setHoveredOccurrenceId,
      },
      viewMode === 'multi'
    );

    return { initialNodes: nodes, initialEdges: edges };
  }, [data, selectedRootId, config.maxDepth, searchQuery, highlightState, selectedPersonId, handlePersonClick, handleOpenSidebar, handleRerootToAncestor, handleJumpToNode, setHoveredOccurrenceId, viewMode]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Keep nodesRef in sync so the in-data jump callbacks can resolve
  // positions for `scrollToNode` without going through React state.
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Update nodes when data changes
  useMemo(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Dashed gold connector between two occurrences of the same person
  // (cousin marriage). Recomputed on hover state change — does NOT touch
  // the underlying edges state, so the family tree edges stay stable.
  const occurrenceLinkEdge = useMemo(
    () => computeOccurrenceLinkEdge(nodes, hoveredOccurrenceId),
    [nodes, hoveredOccurrenceId],
  );

  const displayEdges = useMemo(
    () => (occurrenceLinkEdge ? [...edges, occurrenceLinkEdge] : edges),
    [edges, occurrenceLinkEdge],
  );

  // Center viewport on focused person (including spouses who are part of another node)
  // Clear focusPersonId after centering so the effect only fires once per focus request.
  useEffect(() => {
    if (!focusPersonId || !isReady) return;

    // Find the node id that renders this person — either directly, or the hub
    // node that renders them as a merged spouse. Returns null if absent.
    const findTargetIn = (list: typeof nodes): string | null => {
      const direct = list.find((n) => n.id === focusPersonId);
      if (direct) return direct.id;
      const hub = list.find((n) =>
        (n.data as PersonNodeData).spouses?.some((s) => s.spouse.id === focusPersonId),
      );
      return hub ? hub.id : null;
    };

    const targetInNodes = findTargetIn(nodes);
    if (targetInNodes) {
      scrollToNode(targetInNodes, nodes, 'center', true);
      // Clear focus target so subsequent node changes don't re-trigger centering
      setFocusPersonId(null);
      return;
    }

    // Not in the live (lagging) `nodes` yet. `initialNodes` is the layout for the
    // CURRENT root, computed synchronously. If the person is there, `nodes` is
    // just mid-rebuild (e.g. a side-panel click that re-rooted onto their family)
    // — wait for the `setNodes(initialNodes)` sync. If they're not in
    // `initialNodes` either, they aren't on this canvas at all (e.g. a private/
    // redacted relative or one beyond maxDepth) — clear the request so it can't
    // strand and permanently disable scroll-to-root.
    if (!findTargetIn(initialNodes)) {
      setFocusPersonId(null);
    }
    return;
  }, [focusPersonId, nodes, initialNodes, isReady, scrollToNode, setFocusPersonId]);

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
      const prevRootId = prevRootIdRef.current;
      prevRootIdRef.current = selectedRootId;

      // Save viewport when navigating away from initial root
      if (prevRootId === initialRootId && selectedRootId !== initialRootId) {
        savedViewportRef.current = getViewport();
      }

      // If returning to initial root and we have a saved viewport, restore it
      if (selectedRootId === initialRootId && savedViewportRef.current) {
        const saved = savedViewportRef.current;
        savedViewportRef.current = null;
        setViewport(saved, { duration: 500 });
      } else if (!focusPersonId) {
        // Only scroll to root if no focusPersonId is pending (the focus effect handles that case)
        scrollToNode(selectedRootId, nodes, 'top', true);
      }
    }
  }, [selectedRootId, initialRootId, nodes, isReady, scrollToNode, setViewport, getViewport, focusPersonId]);

  // Position root at top, centered horizontally
  const onInit = useCallback(() => {
    if (viewMode === 'multi') {
      // In multi mode, fit the entire view to show all trees
      fitView({ duration: 0, padding: 0.1 });
    } else {
      const rootNode = initialNodes.find((n) => (n.data as PersonNodeData).isRoot);
      if (rootNode) {
        scrollToNode(rootNode.id, initialNodes, 'top', false);
      }
    }
    requestAnimationFrame(() => setIsReady(true));
  }, [initialNodes, scrollToNode, viewMode, fitView]);

  const momentumRafRef = useRef<number | null>(null);

  // Mobile-only momentum pan: native touch has no inertia by default, so after
  // the user flicks, we continue panning with exponential velocity decay until
  // it falls below a threshold or the user touches again.
  useEffect(() => {
    if (!isMobile) return;
    const container = containerRef.current;
    if (!container) return;

    type Sample = { x: number; y: number; t: number };
    const samples: Sample[] = [];
    let isPinch = false;

    const cancelMomentum = () => {
      if (momentumRafRef.current !== null) {
        cancelAnimationFrame(momentumRafRef.current);
        momentumRafRef.current = null;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      cancelMomentum();
      samples.length = 0;
      isPinch = e.touches.length > 1;
      if (e.touches.length === 1) {
        const t = e.touches[0];
        samples.push({ x: t.clientX, y: t.clientY, t: performance.now() });
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) { isPinch = true; return; }
      const t = e.touches[0];
      const now = performance.now();
      samples.push({ x: t.clientX, y: t.clientY, t: now });
      while (samples.length > 2 && now - samples[0].t > 120) samples.shift();
    };

    const onTouchEnd = () => {
      if (isPinch || samples.length < 2) return;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dt = last.t - first.t;
      if (dt < 16) return;
      let vx = (last.x - first.x) / dt; // px/ms
      let vy = (last.y - first.y) / dt;
      const speed = Math.hypot(vx, vy);
      if (speed < 0.2) return; // below this it's a tap, not a flick
      const maxV = 3.5;
      if (speed > maxV) {
        vx *= maxV / speed;
        vy *= maxV / speed;
      }

      let lastFrame = performance.now();
      const step = (now: number) => {
        const frameDt = Math.min(now - lastFrame, 32);
        lastFrame = now;
        const vp = getViewport();
        setViewport({ x: vp.x + vx * frameDt, y: vp.y + vy * frameDt, zoom: vp.zoom });
        // ~7% friction per 16ms frame
        const decay = Math.pow(0.93, frameDt / 16);
        vx *= decay;
        vy *= decay;
        if (Math.hypot(vx, vy) > 0.02) {
          momentumRafRef.current = requestAnimationFrame(step);
        } else {
          momentumRafRef.current = null;
        }
      };
      momentumRafRef.current = requestAnimationFrame(step);
    };

    // Capture phase so React Flow / @use-gesture can't stopPropagation on us
    const opts = { passive: true, capture: true } as const;
    container.addEventListener('touchstart', onTouchStart, opts);
    container.addEventListener('touchmove', onTouchMove, opts);
    container.addEventListener('touchend', onTouchEnd, opts);
    container.addEventListener('touchcancel', onTouchEnd, opts);

    return () => {
      cancelMomentum();
      container.removeEventListener('touchstart', onTouchStart, opts);
      container.removeEventListener('touchmove', onTouchMove, opts);
      container.removeEventListener('touchend', onTouchEnd, opts);
      container.removeEventListener('touchcancel', onTouchEnd, opts);
    };
  }, [isMobile, getViewport, setViewport]);

  // Placeholder when no tree/root is selected. Rendered only AFTER every hook
  // above has run unconditionally — keeping the early return below all hooks
  // satisfies the rules of hooks (was previously mid-hooks; see public-tree §10).
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
      {/* DISABLED: multi-root mode disabled for now — may re-enable in future */}
      {/* {selectedRootId === initialRootId && <ViewModeToggle />} */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <linearGradient id="treeEdgeGold" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#e6cf9e" stopOpacity="0.25" />
            <stop offset="50%" stopColor="#c8a865" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#8c7441" stopOpacity="0.35" />
          </linearGradient>
        </defs>
      </svg>
      <ReactFlow
        nodes={nodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={onInit}
        onNodeClick={(_event, node) => {
          // Strip graft prefix to get the real person ID
          const personId = node.id.replace(/^graft-(parent|sibling)-/, '');
          handlePersonClick(personId);
        }}
        onPaneClick={() => { setHighlightedPersonId(null); setSelectedPersonId(null); }}
        nodeTypes={nodeTypes}
        connectionLineType={ConnectionLineType.Bezier}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        panOnScroll={!isMobile}
        zoomOnScroll={false}
        zoomOnPinch
      >
        <Background
          variant={isMobile ? BackgroundVariant.Dots : BackgroundVariant.Lines}
          gap={isMobile ? 32 : 48}
          size={isMobile ? 1 : undefined}
          lineWidth={1}
          color="rgba(200, 168, 101, 0.08)"
        />
        {!hideControls && !isMobile && <Controls />}
        {!hideMiniMap && !isMobile && <MiniMap nodeStrokeWidth={3} zoomable pannable />}
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
