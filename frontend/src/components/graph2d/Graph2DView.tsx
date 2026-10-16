import React, { useRef, useEffect, useState, useMemo } from 'react';
import { CodeGraph, GraphNode, NodeType } from '../../types';

interface Graph2DViewProps {
  graph: CodeGraph | null;
  selectedNode: GraphNode | null;
  blastRadiusIds?: Set<string>;
  onSelectNode: (node: GraphNode | null) => void;
}

const TYPE_COLORS: Record<NodeType, string> = {
  directory: '#818cf8',
  file: '#38bdf8',
  class: '#c084fc',
  function: '#34d399'
};

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

  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>();
    if (graph) graph.nodes.forEach(n => map.set(n.id, n));
    return map;
  }, [graph]);

  // Center the graph initially
  useEffect(() => {
    if (canvasRef.current && graph) {
      const w = canvasRef.current.clientWidth;
      const h = canvasRef.current.clientHeight;
      setOffset({ x: w / 2, y: h / 2 });
    }
  }, [graph]);

  // Render 2D canvas
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

    ctx.clearRect(0, 0, width, height);

    // Apply pan and zoom transform
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // 1. Draw Edges
    graph.edges.forEach(edge => {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      if (src && tgt) {
        ctx.beginPath();
        ctx.moveTo(src.position.x, src.position.z);
        ctx.lineTo(tgt.position.x, tgt.position.z);

        const isHighlighted = selectedNode && (edge.source === selectedNode.id || edge.target === selectedNode.id);
        ctx.strokeStyle = isHighlighted ? '#facc15' : 'rgba(148, 163, 184, 0.25)';
        ctx.lineWidth = isHighlighted ? 2.5 : 1.0;
        ctx.stroke();

        // Arrow head
        if (isHighlighted || edge.type === 'imports' || edge.type === 'calls') {
          const angle = Math.atan2(tgt.position.z - src.position.z, tgt.position.x - src.position.x);
          const headLen = 6;
          ctx.beginPath();
          ctx.moveTo(tgt.position.x, tgt.position.z);
          ctx.lineTo(tgt.position.x - headLen * Math.cos(angle - Math.PI / 6), tgt.position.z - headLen * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(tgt.position.x - headLen * Math.cos(angle + Math.PI / 6), tgt.position.z - headLen * Math.sin(angle + Math.PI / 6));
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fill();
        }
      }
    });

    // 2. Draw Nodes
    graph.nodes.forEach(node => {
      const isSelected = selectedNode?.id === node.id;
      const isBlast = blastRadiusIds.has(node.id);
      const baseColor = TYPE_COLORS[node.type] || '#38bdf8';
      const color = isBlast ? '#f43f5e' : (isSelected ? '#facc15' : baseColor);
      const radius = isSelected ? 9 : (isBlast ? 8 : (node.type === 'directory' ? 7 : (node.type === 'file' ? 6 : 4.5)));

      ctx.beginPath();
      ctx.arc(node.position.x, node.position.z, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (isSelected || isBlast) {
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }

      // Draw label for files, directories, or selected
      if (scale > 0.6 || isSelected || node.type === 'file' || node.type === 'directory') {
        ctx.font = isSelected ? 'bold 11px sans-serif' : '10px sans-serif';
        ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(226, 232, 240, 0.85)';
        ctx.fillText(node.name, node.position.x + radius + 4, node.position.z + 3);
      }
    });

    ctx.restore();
  }, [graph, selectedNode, blastRadiusIds, offset, scale, nodeMap]);

  // Click & Drag Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
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
      for (const node of graph.nodes) {
        const d = Math.hypot(node.position.x - clickX, node.position.z - clickY);
        if (d <= 14) {
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
    setScale(s => Math.min(3.5, Math.max(0.2, s * zoomFactor)));
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
      <div className="absolute top-4 right-4 flex space-x-2 glass-panel px-3 py-1.5 rounded-lg text-xs text-slate-300">
        <button
          onClick={() => setScale(s => Math.min(3.5, s * 1.2))}
          className="hover:text-white px-2 py-0.5 bg-slate-800/80 rounded"
        >
          +
        </button>
        <button
          onClick={() => setScale(s => Math.max(0.2, s * 0.8))}
          className="hover:text-white px-2 py-0.5 bg-slate-800/80 rounded"
        >
          -
        </button>
        <button
          onClick={() => {
            if (canvasRef.current) {
              setOffset({ x: canvasRef.current.clientWidth / 2, y: canvasRef.current.clientHeight / 2 });
              setScale(0.85);
            }
          }}
          className="hover:text-white px-2 py-0.5 bg-slate-800/80 rounded"
        >
          Reset View
        </button>
      </div>
    </div>
  );
};
