import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { CodeGraph, GraphNode, NodeType, GraphEdge } from '../../types';
import { ZoomIn, ZoomOut, Maximize2, Layers, Eye, EyeOff, Filter } from 'lucide-react';

interface Graph2DViewProps {
  graph: CodeGraph | null;
  selectedNode: GraphNode | null;
  blastRadiusIds?: Set<string>;
  onSelectNode: (node: GraphNode | null) => void;
}

const TYPE_COLORS: Record<NodeType, string> = {
  directory: '#818cf8', // Indigo
  file: '#38bdf8',      // Bright cyan
  class: '#c084fc',     // Purple
  function: '#34d399'   // Emerald
};

type ViewFilter = 'all' | 'files_only';

export const Graph2DView: React.FC<Graph2DViewProps> = ({
  graph,
  selectedNode,
  blastRadiusIds = new Set(),
  onSelectNode
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(0.85);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Interactive Hover & Inspection
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // View Options
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [showContainment, setShowContainment] = useState(false); // Default false to prevent spiderweb clutter!

  // Lookup Maps
  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>();
    if (graph) graph.nodes.forEach(n => map.set(n.id, n));
    return map;
  }, [graph]);

  // Filtered Nodes based on current View Filter
  const visibleNodes = useMemo(() => {
    if (!graph) return [];
    if (viewFilter === 'files_only') {
      return graph.nodes.filter(n => n.type === 'directory' || n.type === 'file');
    }
    return graph.nodes;
  }, [graph, viewFilter]);

  const visibleNodeIdSet = useMemo(() => {
    return new Set(visibleNodes.map(n => n.id));
  }, [visibleNodes]);

  // Active Focus: Either actively hovered node or selected node
  const activeFocusNode = hoveredNode || selectedNode;

  // Compute Neighborhood for Active Focus Node (direct incoming & outgoing)
  const neighborhood = useMemo(() => {
    if (!graph || !activeFocusNode) return null;
    const focusId = activeFocusNode.id;

    const outgoingEdges: GraphEdge[] = [];
    const incomingEdges: GraphEdge[] = [];
    const outgoingNeighbors = new Set<string>();
    const incomingNeighbors = new Set<string>();
    const connectedEdges = new Set<string>();

    graph.edges.forEach(e => {
      if (e.source === focusId && visibleNodeIdSet.has(e.target)) {
        outgoingEdges.push(e);
        outgoingNeighbors.add(e.target);
        connectedEdges.add(e.id);
      }
      if (e.target === focusId && visibleNodeIdSet.has(e.source)) {
        incomingEdges.push(e);
        incomingNeighbors.add(e.source);
        connectedEdges.add(e.id);
      }
    });

    return {
      focusId,
      outgoingEdges,
      incomingEdges,
      outgoingNeighbors,
      incomingNeighbors,
      connectedEdges,
      allNeighbors: new Set([...outgoingNeighbors, ...incomingNeighbors, focusId])
    };
  }, [graph, activeFocusNode, visibleNodeIdSet]);

  // Center Graph on mount / load
  const resetView = useCallback(() => {
    if (canvasRef.current && graph) {
      const w = canvasRef.current.clientWidth;
      const h = canvasRef.current.clientHeight;
      setOffset({ x: w / 2, y: h / 2 });
      setScale(0.85);
    }
  }, [graph]);

  useEffect(() => {
    resetView();
  }, [resetView]);

  // Helper to draw clean rounded pill badges
  const drawPillBadge = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string,
    isFocus: boolean,
    isDimmed: boolean
  ) => {
    ctx.font = isFocus ? 'bold 11px Inter, sans-serif' : '10px Inter, sans-serif';
    const textWidth = ctx.measureText(text).width;
    const paddingX = 6;
    const badgeHeight = 18;
    const badgeWidth = textWidth + paddingX * 2;
    const radius = 4;

    const badgeX = x - 2;
    const badgeY = y - badgeHeight / 2;

    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, radius);
    } else {
      ctx.rect(badgeX, badgeY, badgeWidth, badgeHeight);
    }

    ctx.fillStyle = isFocus
      ? 'rgba(15, 23, 42, 0.95)'
      : isDimmed
      ? 'rgba(15, 23, 42, 0.25)'
      : 'rgba(15, 23, 42, 0.85)';
    ctx.fill();

    ctx.lineWidth = 1;
    ctx.strokeStyle = isFocus ? color : isDimmed ? 'rgba(51, 65, 85, 0.2)' : 'rgba(71, 85, 105, 0.5)';
    ctx.stroke();

    ctx.fillStyle = isFocus ? '#ffffff' : isDimmed ? 'rgba(148, 163, 184, 0.25)' : '#e2e8f0';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, badgeX + paddingX, y);
    ctx.restore();
  };

  // Main Canvas Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graph) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // 1. High-Contrast Pitch Black Cosmic Space
    ctx.fillStyle = '#07090e';
    ctx.fillRect(0, 0, width, height);

    // Subtle Celestial Grid Coordinates
    ctx.save();
    ctx.translate(offset.x % (60 * scale), offset.y % (60 * scale));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    for (let gx = -60; gx < width + 60; gx += 60 * scale) {
      for (let gy = -60; gy < height + 60; gy += 60 * scale) {
        ctx.fillRect(gx, gy, 1.5, 1.5);
      }
    }
    ctx.restore();

    // Pan & Zoom
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    const isNeighborhoodActive = !!neighborhood;

    // 2. Draw Edges
    graph.edges.forEach(edge => {
      // Skip if connected nodes are hidden by filter
      if (!visibleNodeIdSet.has(edge.source) || !visibleNodeIdSet.has(edge.target)) return;

      // Filter containment edges unless explicitly toggled on
      if (edge.type === 'contains' && !showContainment) return;

      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      if (!src || !tgt) return;

      const isConnectedToFocus = neighborhood?.connectedEdges.has(edge.id);
      const isOutgoing = neighborhood?.focusId === edge.source;
      const isIncoming = neighborhood?.focusId === edge.target;

      // Dim unrelated edges when a neighborhood is active
      const isDimmed = isNeighborhoodActive && !isConnectedToFocus;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(src.position.x, src.position.z);
      ctx.lineTo(tgt.position.x, tgt.position.z);

      if (isConnectedToFocus) {
        // High-contrast highlighted neighborhood edges
        if (isOutgoing) {
          ctx.strokeStyle = '#38bdf8'; // Outgoing: Sky Cyan
          ctx.shadowColor = '#38bdf8';
        } else if (isIncoming) {
          ctx.strokeStyle = '#34d399'; // Incoming: Emerald Green
          ctx.shadowColor = '#34d399';
        } else {
          ctx.strokeStyle = '#facc15';
          ctx.shadowColor = '#facc15';
        }
        ctx.lineWidth = 2.4;
        ctx.shadowBlur = 6;
      } else if (isDimmed) {
        ctx.strokeStyle = 'rgba(51, 65, 85, 0.06)';
        ctx.lineWidth = 0.8;
      } else {
        // Normal state
        if (edge.type === 'imports') ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        else if (edge.type === 'calls') ctx.strokeStyle = 'rgba(52, 211, 153, 0.35)';
        else if (edge.type === 'inherits_from') ctx.strokeStyle = 'rgba(192, 132, 252, 0.4)';
        else ctx.strokeStyle = 'rgba(100, 116, 139, 0.18)';
        ctx.lineWidth = 1.1;
      }
      ctx.stroke();

      // Draw arrow head for dependency edges or highlighted edges
      if (isConnectedToFocus || (!isDimmed && (edge.type === 'imports' || edge.type === 'calls'))) {
        const angle = Math.atan2(tgt.position.z - src.position.z, tgt.position.x - src.position.x);
        const headLen = isConnectedToFocus ? 8 : 5.5;

        // Position arrow slightly before target node circle
        const tgtRadius = tgt.type === 'directory' ? 7 : (tgt.type === 'file' ? 6 : 4);
        const arrowX = tgt.position.x - tgtRadius * Math.cos(angle);
        const arrowZ = tgt.position.z - tgtRadius * Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(arrowX, arrowZ);
        ctx.lineTo(
          arrowX - headLen * Math.cos(angle - Math.PI / 6),
          arrowZ - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          arrowX - headLen * Math.cos(angle + Math.PI / 6),
          arrowZ - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
      }
      ctx.restore();
    });

    // 3. Draw Orbit Rings for Files containing symbols
    if (viewFilter === 'all') {
      const fileNodes = visibleNodes.filter(n => n.type === 'file');
      fileNodes.forEach(f => {
        const isDimmed = isNeighborhoodActive && !neighborhood?.allNeighbors.has(f.id);
        if (!isDimmed) {
          ctx.beginPath();
          ctx.arc(f.position.x, f.position.z, 36, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });
    }

    // 4. Draw Nodes
    visibleNodes.forEach(node => {
      const isSelected = selectedNode?.id === node.id;
      const isHovered = hoveredNode?.id === node.id;
      const isFocus = isSelected || isHovered;
      const isBlast = blastRadiusIds.has(node.id);
      const isNeighbor = neighborhood?.allNeighbors.has(node.id);
      const isOutgoingNeighbor = neighborhood?.outgoingNeighbors.has(node.id);
      const isIncomingNeighbor = neighborhood?.incomingNeighbors.has(node.id);

      const isDimmed = isNeighborhoodActive && !isFocus && !isNeighbor;

      const baseColor = TYPE_COLORS[node.type] || '#38bdf8';
      let nodeColor = baseColor;
      if (isBlast) nodeColor = '#f43f5e';
      else if (isFocus) nodeColor = '#facc15';
      else if (isOutgoingNeighbor) nodeColor = '#38bdf8';
      else if (isIncomingNeighbor) nodeColor = '#34d399';

      const radius = isFocus ? 9.5 : (isBlast ? 8 : (node.type === 'directory' ? 7.5 : (node.type === 'file' ? 6 : 4.5)));

      ctx.save();

      // Node Outer Glow / Halo for focus or neighbor
      if (isFocus) {
        ctx.beginPath();
        ctx.arc(node.position.x, node.position.z, radius + 4.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(250, 204, 21, 0.25)';
        ctx.fill();
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (isOutgoingNeighbor || isIncomingNeighbor) {
        ctx.beginPath();
        ctx.arc(node.position.x, node.position.z, radius + 3, 0, Math.PI * 2);
        ctx.fillStyle = isOutgoingNeighbor ? 'rgba(56, 189, 248, 0.2)' : 'rgba(52, 211, 153, 0.2)';
        ctx.fill();
      }

      // Main Node Circle
      ctx.beginPath();
      ctx.arc(node.position.x, node.position.z, radius, 0, Math.PI * 2);
      ctx.fillStyle = isDimmed ? 'rgba(71, 85, 105, 0.25)' : nodeColor;
      ctx.fill();

      if (!isDimmed) {
        ctx.lineWidth = isFocus ? 2.5 : 1.5;
        ctx.strokeStyle = isFocus ? '#ffffff' : (isNeighbor ? '#ffffff' : 'rgba(255, 255, 255, 0.4)');
        ctx.stroke();
      }

      // Draw Badge Label
      const shouldDrawLabel = isFocus || isNeighbor || isBlast || (scale > 0.7 && (node.type === 'file' || node.type === 'directory'));
      if (shouldDrawLabel && !isDimmed) {
        let labelText = node.name;
        if (isOutgoingNeighbor) labelText += ' (Dependency)';
        if (isIncomingNeighbor) labelText += ' (Caller)';
        drawPillBadge(ctx, labelText, node.position.x + radius + 6, node.position.z, nodeColor, isFocus, isDimmed);
      }

      ctx.restore();
    });

    ctx.restore();
  }, [graph, visibleNodes, visibleNodeIdSet, selectedNode, hoveredNode, neighborhood, blastRadiusIds, offset, scale, nodeMap, showContainment, viewFilter]);

  // Click & Drag Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setMousePos({ x: e.clientX, y: e.clientY });

    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
      return;
    }

    // Raycast hover detection on 2D plane
    if (canvasRef.current && graph) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - offset.x) / scale;
      const mouseY = (e.clientY - rect.top - offset.y) / scale;

      let found: GraphNode | null = null;
      for (const node of visibleNodes) {
        const d = Math.hypot(node.position.x - mouseX, node.position.z - mouseY);
        const hitRadius = node.type === 'directory' ? 14 : (node.type === 'file' ? 12 : 9);
        if (d <= hitRadius) {
          found = node;
          break;
        }
      }
      setHoveredNode(found);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    setIsDragging(false);

    // If mouse didn't drag far, treat as click
    const dist = Math.hypot(e.clientX - (dragStart.x + offset.x), e.clientY - (dragStart.y + offset.y));
    if (dist < 5 && canvasRef.current && graph) {
      const rect = canvasRef.current.getBoundingClientRect();
      const clickX = (e.clientX - rect.left - offset.x) / scale;
      const clickY = (e.clientY - rect.top - offset.y) / scale;

      let found: GraphNode | null = null;
      for (const node of visibleNodes) {
        const d = Math.hypot(node.position.x - clickX, node.position.z - clickY);
        const hitRadius = node.type === 'directory' ? 16 : (node.type === 'file' ? 14 : 10);
        if (d <= hitRadius) {
          found = node;
          break;
        }
      }
      onSelectNode(found);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.88;
    setScale(s => Math.min(3.5, Math.max(0.15, s * zoomFactor)));
  };

  return (
    <div className="relative w-full h-full bg-[#07090e] overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing block"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* Floating Hover Tooltip */}
      {hoveredNode && (
        <div
          className="fixed pointer-events-none z-50 glass-panel px-3 py-2.5 rounded-lg text-xs border border-sky-500/40 shadow-2xl backdrop-blur-md bg-slate-950/90"
          style={{
            left: `${mousePos.x + 16}px`,
            top: `${mousePos.y + 16}px`
          }}
        >
          <div className="flex items-center space-x-2 font-medium">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: TYPE_COLORS[hoveredNode.type] || '#38bdf8' }}
            />
            <span className="text-white font-semibold">{hoveredNode.name}</span>
            <span className="text-slate-400 uppercase text-[10px] px-1.5 py-0.5 bg-slate-800 rounded">
              {hoveredNode.type}
            </span>
          </div>
          {hoveredNode.file_path && (
            <div className="text-slate-400 mt-1 truncate max-w-xs">{hoveredNode.file_path}</div>
          )}
          <div className="flex items-center space-x-3 mt-2 pt-1.5 border-t border-slate-800 text-[11px]">
            <span>In-Degree: <strong className="text-emerald-400">{hoveredNode.metrics?.in_degree ?? 0}</strong></span>
            <span>Out-Degree: <strong className="text-sky-400">{hoveredNode.metrics?.out_degree ?? 0}</strong></span>
            <span>Risk: <strong className="text-amber-400">{hoveredNode.metrics?.risk_score ?? 0}</strong></span>
          </div>
          {neighborhood?.focusId === hoveredNode.id && (
            <div className="mt-1 text-[10px] text-sky-300 font-medium">
              Connected: {neighborhood.outgoingNeighbors.size} outgoing, {neighborhood.incomingNeighbors.size} callers
            </div>
          )}
        </div>
      )}

      {/* Top Right Navigation & Filter Toolbar */}
      <div className="absolute top-4 right-4 flex items-center space-x-2 glass-panel p-1.5 rounded-xl text-xs text-slate-300 shadow-xl border border-slate-700/50">
        {/* Level of Detail Filter */}
        <div className="flex bg-slate-900/80 rounded-lg p-0.5 border border-slate-800">
          <button
            onClick={() => setViewFilter('all')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
              viewFilter === 'all'
                ? 'bg-sky-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Show All Nodes (Directories, Files, Functions, Classes)"
          >
            All Universe
          </button>
          <button
            onClick={() => setViewFilter('files_only')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
              viewFilter === 'files_only'
                ? 'bg-sky-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Clean Architectural View: Files & Folders only"
          >
            Files Only
          </button>
        </div>

        {/* Toggle Containment Lines */}
        <button
          onClick={() => setShowContainment(v => !v)}
          className={`flex items-center space-x-1.5 px-2 py-1 rounded-lg text-[11px] font-medium transition-all ${
            showContainment
              ? 'bg-indigo-600/60 text-indigo-200 border border-indigo-400/40'
              : 'bg-slate-800/80 text-slate-400 hover:text-white border border-slate-700/50'
          }`}
          title="Toggle parent-child directory containment lines"
        >
          {showContainment ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span>Hierarchy Lines</span>
        </button>

        {/* Zoom Controls */}
        <div className="flex items-center space-x-1 pl-1 border-l border-slate-700/60">
          <button
            onClick={() => setScale(s => Math.min(3.5, s * 1.25))}
            className="p-1 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setScale(s => Math.max(0.15, s * 0.8))}
            className="p-1 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={resetView}
            className="p-1 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Reset View"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom Left Legend & Instruction */}
      <div className="absolute bottom-4 left-4 glass-panel px-3.5 py-2 rounded-xl text-[11px] text-slate-300 shadow-xl border border-slate-700/50 flex flex-col space-y-1.5">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#818cf8]" />
            <span className="text-slate-400">Folder</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#38bdf8]" />
            <span className="text-slate-400">File</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#c084fc]" />
            <span className="text-slate-400">Class</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#34d399]" />
            <span className="text-slate-400">Function</span>
          </div>
        </div>
        <div className="flex items-center space-x-4 pt-1 border-t border-slate-800/80 text-[10px]">
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-0.5 bg-[#38bdf8]" />
            <span className="text-sky-300 font-medium">Imports (Outgoing)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-0.5 bg-[#34d399]" />
            <span className="text-emerald-300 font-medium">Called By (Incoming)</span>
          </div>
          <span className="text-slate-500 italic">Hover any node to isolate relationships</span>
        </div>
      </div>
    </div>
  );
};
