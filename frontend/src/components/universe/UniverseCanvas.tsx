import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { CodeGraph, GraphNode, NodeType, GraphEdge } from '../../types';
import { Sliders, RotateCcw, Sparkles, Eye, EyeOff, Layers, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface UniverseCanvasProps {
  graph: CodeGraph | null;
  selectedNode: GraphNode | null;
  blastRadiusIds?: Set<string>;
  onSelectNode: (node: GraphNode | null) => void;
  showLabels?: boolean;
}

const NODE_COLORS: Record<NodeType, number> = {
  directory: 0x818cf8, // Indigo / violet core
  file: 0x38bdf8,      // Bright cyan star
  class: 0xc084fc,     // Purple planet
  function: 0x34d399   // Emerald satellite
};

const BASE_NODE_SIZES: Record<NodeType, number> = {
  directory: 5.5,
  file: 3.2,
  class: 2.4,
  function: 1.6
};

type ViewFilter = 'all' | 'files_only';

export const UniverseCanvas: React.FC<UniverseCanvasProps> = ({
  graph,
  selectedNode,
  blastRadiusIds = new Set(),
  onSelectNode
}) => {
  // DOM References
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasMountRef = useRef<HTMLDivElement>(null);

  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Size & Scale Adjustment state
  const [nodeSizeScale, setNodeSizeScale] = useState(1.0);
  const [spreadScale, setSpreadScale] = useState(1.0);
  const [showSizeControls, setShowSizeControls] = useState(false);

  // View Options
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [showContainment, setShowContainment] = useState(false); // Default false to prevent hairball!

  // Three.js References (Persistent across renders)
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const graphGroupRef = useRef<THREE.Group | null>(null);
  const nodeMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const edgesLineRef = useRef<THREE.LineSegments | null>(null);
  const activeEdgesRef = useRef<GraphEdge[]>([]);
  const starFieldRef = useRef<THREE.Points | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Camera & Interaction state
  const isDraggingRef = useRef(false);
  const isRightDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const cameraTargetRef = useRef(new THREE.Vector3(0, 0, 0));
  const cameraSphericalRef = useRef({ radius: 350, theta: Math.PI / 4, phi: Math.PI / 3 });

  // Map for fast node lookups
  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>();
    if (graph) {
      graph.nodes.forEach(n => map.set(n.id, n));
    }
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

  // Active Focus Node: Hovered or Selected
  const activeFocusNode = hoveredNode || selectedNode;

  // Precompute neighborhood for active focus
  const neighborhood = useMemo(() => {
    if (!graph || !activeFocusNode) return null;
    const focusId = activeFocusNode.id;

    const outgoingNeighbors = new Set<string>();
    const incomingNeighbors = new Set<string>();
    const connectedEdgeIds = new Set<string>();

    graph.edges.forEach(e => {
      if (e.source === focusId && visibleNodeIdSet.has(e.target)) {
        outgoingNeighbors.add(e.target);
        connectedEdgeIds.add(e.id);
      }
      if (e.target === focusId && visibleNodeIdSet.has(e.source)) {
        incomingNeighbors.add(e.source);
        connectedEdgeIds.add(e.id);
      }
    });

    return {
      focusId,
      outgoingNeighbors,
      incomingNeighbors,
      connectedEdgeIds,
      allNeighbors: new Set([...outgoingNeighbors, ...incomingNeighbors, focusId])
    };
  }, [graph, activeFocusNode, visibleNodeIdSet]);

  // Update camera position from spherical coordinates
  const updateCameraPosition = useCallback(() => {
    if (!cameraRef.current) return;
    const { radius, theta, phi } = cameraSphericalRef.current;
    const target = cameraTargetRef.current;

    cameraRef.current.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
    cameraRef.current.position.y = target.y + radius * Math.cos(phi);
    cameraRef.current.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
    cameraRef.current.lookAt(target);
  }, []);

  // Smoothly fly camera to selected node without destroying scene
  useEffect(() => {
    if (selectedNode && cameraRef.current) {
      const px = (selectedNode.position?.x ?? 0) * spreadScale;
      const py = (selectedNode.position?.y ?? 0) * spreadScale;
      const pz = (selectedNode.position?.z ?? 0) * spreadScale;

      cameraTargetRef.current.set(px, py, pz);
      cameraSphericalRef.current.radius = 90;
      updateCameraPosition();
    }
  }, [selectedNode, spreadScale, updateCameraPosition]);

  // 1. Initialize Three.js Scene, Camera, Renderer ONCE on mount
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const width = Math.max(10, mountEl.clientWidth || 800);
    const height = Math.max(10, mountEl.clientHeight || 600);

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x07090e, 0.0012);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 4000);
    cameraRef.current = camera;
    updateCameraPosition();

    // Renderer (Re-used cleanly without context loss)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;

    // Mount canvas into dedicated mount container without touching React children
    while (mountEl.firstChild) {
      mountEl.removeChild(mountEl.firstChild);
    }
    mountEl.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x38bdf8, 2.8, 1000);
    pointLight.position.set(0, 150, 0);
    scene.add(pointLight);

    // Deep Space Stars Background
    const starsGeo = new THREE.BufferGeometry();
    const starCount = 3000;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starPositions[i] = (Math.random() - 0.5) * 2200;
      starPositions[i + 1] = (Math.random() - 0.5) * 2200;
      starPositions[i + 2] = (Math.random() - 0.5) * 2200;
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starsMat = new THREE.PointsMaterial({
      color: 0x94a3b8,
      size: 1.5,
      transparent: true,
      opacity: 0.65
    });
    const starField = new THREE.Points(starsGeo, starsMat);
    scene.add(starField);
    starFieldRef.current = starField;

    // Graph Root Group (holds nodes and edges)
    const graphGroup = new THREE.Group();
    scene.add(graphGroup);
    graphGroupRef.current = graphGroup;

    // Robust ResizeObserver with zero/NaN guards
    const handleResize = () => {
      const container = containerRef.current;
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0 || isNaN(w) || isNaN(h)) return;

      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h, false);
    };

    const resizeObserver = new ResizeObserver(() => handleResize());
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    window.addEventListener('resize', handleResize);

    // Handle WebGL context recovery
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.warn('Codebase Universe: WebGL context lost.');
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    // Animation Loop
    let clock = new THREE.Clock();
    const animate = () => {
      const elapsedTime = clock.getElapsedTime();

      // Subtle celestial rotation
      if (starFieldRef.current) {
        starFieldRef.current.rotation.y = elapsedTime * 0.006;
      }

      // Smooth pulsing on selected / blast radius nodes
      const meshes = nodeMeshesRef.current;
      meshes.forEach((mesh, id) => {
        const isPulse = id === selectedNode?.id || blastRadiusIds.has(id);
        if (isPulse) {
          const node = nodeMap.get(id);
          const baseSize = (BASE_NODE_SIZES[node?.type || 'file'] || 2.0) * nodeSizeScale;
          const pulseFactor = 1 + 0.18 * Math.sin(elapsedTime * 6);
          mesh.scale.set(baseSize * pulseFactor, baseSize * pulseFactor, baseSize * pulseFactor);
        }
      });

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (mountEl.contains(renderer.domElement)) {
        mountEl.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []); // Run once on mount

  // 2. Build or Rebuild Graph Meshes & Edges when graph, filter, containment or spread changes
  useEffect(() => {
    const graphGroup = graphGroupRef.current;
    if (!graphGroup || !graph) return;

    // Clear previous graph objects from group safely
    while (graphGroup.children.length > 0) {
      const child = graphGroup.children[0];
      graphGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      } else if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    }

    const nodeMeshMap = new Map<string, THREE.Mesh>();
    nodeMeshesRef.current = nodeMeshMap;

    if (visibleNodes.length === 0) return;

    // Shared sphere geometry
    const sphereGeo = new THREE.SphereGeometry(1, 16, 16);

    // Create Nodes
    visibleNodes.forEach(node => {
      let color = NODE_COLORS[node.type] || 0x38bdf8;
      if (blastRadiusIds.has(node.id)) {
        color = 0xf43f5e; // Rose for blast radius
      } else if (selectedNode && selectedNode.id === node.id) {
        color = 0xfacc15; // Golden yellow for selected
      }

      const riskScore = node.metrics?.risk_score ?? 0;
      const riskBoost = riskScore > 50 ? 1.3 : 1.0;
      const size = (BASE_NODE_SIZES[node.type] || 2.0) * riskBoost * nodeSizeScale;

      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.3,
        metalness: 0.2,
        emissive: color,
        emissiveIntensity: selectedNode?.id === node.id || blastRadiusIds.has(node.id) ? 0.85 : 0.25,
        transparent: false,
        opacity: 1.0
      });

      const mesh = new THREE.Mesh(sphereGeo, material);
      mesh.scale.set(size, size, size);

      const px = (node.position?.x ?? 0) * spreadScale;
      const py = (node.position?.y ?? 0) * spreadScale;
      const pz = (node.position?.z ?? 0) * spreadScale;
      mesh.position.set(px, py, pz);
      mesh.userData = { nodeId: node.id };

      graphGroup.add(mesh);
      nodeMeshMap.set(node.id, mesh);
    });

    // Filter Edges: only include edges between visible nodes, exclude contains by default
    const filteredEdges: GraphEdge[] = [];
    graph.edges.forEach(edge => {
      if (!visibleNodeIdSet.has(edge.source) || !visibleNodeIdSet.has(edge.target)) return;
      if (edge.type === 'contains' && !showContainment) return;
      filteredEdges.push(edge);
    });
    activeEdgesRef.current = filteredEdges;

    // Create Constellation Edges
    const edgePositions: number[] = [];
    const edgeColors: number[] = [];

    filteredEdges.forEach(edge => {
      const srcNode = nodeMap.get(edge.source);
      const tgtNode = nodeMap.get(edge.target);
      if (srcNode && tgtNode) {
        const sx = (srcNode.position?.x ?? 0) * spreadScale;
        const sy = (srcNode.position?.y ?? 0) * spreadScale;
        const sz = (srcNode.position?.z ?? 0) * spreadScale;

        const tx = (tgtNode.position?.x ?? 0) * spreadScale;
        const ty = (tgtNode.position?.y ?? 0) * spreadScale;
        const tz = (tgtNode.position?.z ?? 0) * spreadScale;

        edgePositions.push(sx, sy, sz);
        edgePositions.push(tx, ty, tz);

        let edgeColor = new THREE.Color(0x334155);
        if (edge.type === 'imports') edgeColor = new THREE.Color(0x38bdf8);
        else if (edge.type === 'calls') edgeColor = new THREE.Color(0x34d399);
        else if (edge.type === 'inherits_from') edgeColor = new THREE.Color(0xc084fc);

        if (selectedNode && (edge.source === selectedNode.id || edge.target === selectedNode.id)) {
          edgeColor = new THREE.Color(0xfacc15);
        }

        edgeColors.push(edgeColor.r, edgeColor.g, edgeColor.b);
        edgeColors.push(edgeColor.r, edgeColor.g, edgeColor.b);
      }
    });

    if (edgePositions.length > 0) {
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
      lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(edgeColors, 3));

      const lineMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.45
      });

      const lineSegments = new THREE.LineSegments(lineGeo, lineMat);
      graphGroup.add(lineSegments);
      edgesLineRef.current = lineSegments;
    } else {
      edgesLineRef.current = null;
    }
  }, [graph, visibleNodes, visibleNodeIdSet, spreadScale, showContainment]);

  // 3. Fast reactive scale update (WITHOUT recreating meshes or WebGL context)
  useEffect(() => {
    if (!graph) return;
    const meshes = nodeMeshesRef.current;
    visibleNodes.forEach(node => {
      const mesh = meshes.get(node.id);
      if (mesh) {
        const riskScore = node.metrics?.risk_score ?? 0;
        const riskBoost = riskScore > 50 ? 1.3 : 1.0;
        const size = (BASE_NODE_SIZES[node.type] || 2.0) * riskBoost * nodeSizeScale;
        mesh.scale.set(size, size, size);
      }
    });
  }, [nodeSizeScale, graph, visibleNodes]);

  // 4. Reactive Neighborhood Highlight & Dimming (Instant, zero FPS lag)
  useEffect(() => {
    const meshes = nodeMeshesRef.current;
    if (!graph || meshes.size === 0) return;

    const focusId = neighborhood?.focusId;

    // Update node meshes opacity & emissive
    meshes.forEach((mesh, id) => {
      const node = nodeMap.get(id);
      if (!node) return;

      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat) return;

      const isBlast = blastRadiusIds.has(id);
      const isFocus = id === focusId;
      const isOutgoing = neighborhood?.outgoingNeighbors.has(id);
      const isIncoming = neighborhood?.incomingNeighbors.has(id);
      const isNeighbor = neighborhood?.allNeighbors.has(id);

      let colorHex = NODE_COLORS[node.type] || 0x38bdf8;
      if (isBlast) colorHex = 0xf43f5e;
      else if (isFocus) colorHex = 0xfacc15; // Golden yellow
      else if (isOutgoing) colorHex = 0x38bdf8; // Outgoing dependency: bright sky cyan
      else if (isIncoming) colorHex = 0x34d399; // Incoming caller: bright emerald green

      mat.color.setHex(colorHex);
      mat.emissive.setHex(colorHex);

      if (focusId) {
        if (isFocus || isNeighbor || isBlast) {
          mat.transparent = false;
          mat.opacity = 1.0;
          mat.emissiveIntensity = isFocus ? 0.95 : 0.65;
        } else {
          mat.transparent = true;
          mat.opacity = 0.12; // Dim unrelated nodes
          mat.emissiveIntensity = 0.04;
        }
      } else {
        mat.transparent = false;
        mat.opacity = 1.0;
        mat.emissiveIntensity = isBlast ? 0.85 : 0.25;
      }
    });

    // Update line colors & opacity
    if (edgesLineRef.current) {
      const lineGeo = edgesLineRef.current.geometry;
      const colors = lineGeo.attributes.color as THREE.BufferAttribute;

      const lineMat = edgesLineRef.current.material as THREE.LineBasicMaterial;
      if (lineMat) {
        lineMat.opacity = focusId ? 0.75 : 0.45;
      }

      let colorIdx = 0;
      activeEdgesRef.current.forEach(edge => {
        let edgeColor = new THREE.Color(0x334155);
        if (edge.type === 'imports') edgeColor = new THREE.Color(0x38bdf8);
        else if (edge.type === 'calls') edgeColor = new THREE.Color(0x34d399);
        else if (edge.type === 'inherits_from') edgeColor = new THREE.Color(0xc084fc);

        if (focusId) {
          if (edge.source === focusId) {
            edgeColor = new THREE.Color(0x38bdf8); // Outgoing: sky cyan
          } else if (edge.target === focusId) {
            edgeColor = new THREE.Color(0x34d399); // Incoming: emerald green
          } else {
            edgeColor = new THREE.Color(0x0a0f1d); // Dimmed to almost invisible dark
          }
        }

        if (colors && colorIdx + 5 < colors.array.length) {
          colors.array[colorIdx] = edgeColor.r;
          colors.array[colorIdx + 1] = edgeColor.g;
          colors.array[colorIdx + 2] = edgeColor.b;
          colors.array[colorIdx + 3] = edgeColor.r;
          colors.array[colorIdx + 4] = edgeColor.g;
          colors.array[colorIdx + 5] = edgeColor.b;
          colorIdx += 6;
        }
      });
      if (colors) colors.needsUpdate = true;
    }
  }, [neighborhood, blastRadiusIds, nodeMap, graph]);

  // Raycasting for Mouse Interaction & Selection
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 0) {
      isDraggingRef.current = true;
    } else if (e.button === 2) {
      isRightDraggingRef.current = true;
    }
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    setMousePos({ x: e.clientX, y: e.clientY });

    // Handle Drag Orbit & Pan
    if (isDraggingRef.current) {
      const deltaX = e.clientX - previousMousePositionRef.current.x;
      const deltaY = e.clientY - previousMousePositionRef.current.y;

      cameraSphericalRef.current.theta -= deltaX * 0.006;
      cameraSphericalRef.current.phi = Math.max(
        0.1,
        Math.min(Math.PI - 0.1, cameraSphericalRef.current.phi - deltaY * 0.006)
      );
      updateCameraPosition();
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (isRightDraggingRef.current) {
      const deltaX = e.clientX - previousMousePositionRef.current.x;
      const deltaY = e.clientY - previousMousePositionRef.current.y;

      const panSpeed = 0.35;
      cameraTargetRef.current.x -= deltaX * panSpeed;
      cameraTargetRef.current.y += deltaY * panSpeed;
      updateCameraPosition();
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // Raycast hover detection when not dragging
    try {
      const container = containerRef.current;
      if (!container || !cameraRef.current || !sceneRef.current) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);

      const meshes = Array.from(nodeMeshesRef.current.values());
      const intersects = raycaster.intersectObjects(meshes);

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object as THREE.Mesh;
        const nodeId = hitMesh.userData.nodeId;
        const hitNode = nodeMap.get(nodeId);
        setHoveredNode(hitNode || null);
      } else {
        setHoveredNode(null);
      }
    } catch {
      // Ignore raycasting exceptions
    }
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
    isRightDraggingRef.current = false;
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    try {
      const container = containerRef.current;
      if (!container || !cameraRef.current || !sceneRef.current) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);

      const meshes = Array.from(nodeMeshesRef.current.values());
      const intersects = raycaster.intersectObjects(meshes);

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object as THREE.Mesh;
        const nodeId = hitMesh.userData.nodeId;
        const hitNode = nodeMap.get(nodeId);
        if (hitNode) {
          onSelectNode(hitNode);
          return;
        }
      }
      onSelectNode(null);
    } catch {
      onSelectNode(null);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    cameraSphericalRef.current.radius = Math.max(
      20,
      Math.min(900, cameraSphericalRef.current.radius + e.deltaY * 0.4)
    );
    updateCameraPosition();
  };

  const handleResetView = () => {
    cameraTargetRef.current.set(0, 0, 0);
    cameraSphericalRef.current = { radius: 350, theta: Math.PI / 4, phi: Math.PI / 3 };
    setNodeSizeScale(1.0);
    setSpreadScale(1.0);
    updateCameraPosition();
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full cursor-grab active:cursor-grabbing overflow-hidden select-none bg-[#07090e]"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      onWheel={handleWheel}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Dedicated Canvas Mount Container - Holds ONLY the WebGL Canvas, ZERO React children */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full pointer-events-none" />

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
              style={{
                backgroundColor: `#${(NODE_COLORS[hoveredNode.type] || 0x38bdf8).toString(16).padStart(6, '0')}`
              }}
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
              Connected: {neighborhood.outgoingNeighbors.size} dependencies, {neighborhood.incomingNeighbors.size} callers
            </div>
          )}
        </div>
      )}

      {/* Top Right Navigation & Filter Toolbar */}
      <div className="absolute top-4 right-4 z-20 flex items-center space-x-2 glass-panel p-1.5 rounded-xl text-xs text-slate-300 shadow-xl border border-slate-700/50">
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

        {/* Reset View */}
        <button
          onClick={handleResetView}
          className="p-1 hover:text-white hover:bg-slate-800 rounded transition-colors"
          title="Reset Camera & Sizing"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* On-screen Universe HUD Controls (Bottom Left) */}
      <div className="absolute bottom-4 left-4 z-20 flex flex-wrap items-center gap-2 glass-panel px-3.5 py-2 rounded-xl text-xs text-slate-300 shadow-lg border border-slate-800/80">
        <span className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-sky-400 inline-block"></span>
          <span>Files</span>
        </span>
        <span className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block"></span>
          <span>Folders</span>
        </span>
        <span className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-purple-400 inline-block"></span>
          <span>Classes</span>
        </span>
        <span className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
          <span>Functions</span>
        </span>

        <div className="border-l border-slate-700 h-4 mx-1"></div>

        {/* Adjust Size Button with Popover */}
        <div className="relative">
          <button
            onClick={e => {
              e.stopPropagation();
              setShowSizeControls(prev => !prev);
            }}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border transition-all ${
              showSizeControls
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-sm'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700'
            }`}
            title="Adjust Celestial Sizes & Scale"
          >
            <Sliders className="w-3.5 h-3.5 text-sky-400" />
            <span className="font-medium">Adjust Size</span>
            <span className="text-[10px] text-sky-400 font-mono font-bold">({nodeSizeScale.toFixed(1)}x)</span>
          </button>

          {/* Sizing Controller Card */}
          {showSizeControls && (
            <div
              onClick={e => e.stopPropagation()}
              className="absolute bottom-10 left-0 w-64 glass-panel p-3.5 rounded-xl border border-slate-700 shadow-2xl space-y-3 z-30 bg-slate-950/95"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-semibold text-xs text-white flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                  <span>3D Layout & Size Scaling</span>
                </span>
                <button
                  onClick={handleResetView}
                  className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                  title="Reset Scale & Orbit"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>

              {/* Node Size Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">Node / Star Size</span>
                  <span className="text-sky-400 font-mono font-bold">{nodeSizeScale.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.1"
                  value={nodeSizeScale}
                  onChange={e => setNodeSizeScale(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
                />
              </div>

              {/* Cluster Spread Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">Galaxy Spread</span>
                  <span className="text-emerald-400 font-mono font-bold">{spreadScale.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="2.0"
                  step="0.1"
                  value={spreadScale}
                  onChange={e => setSpreadScale(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                />
              </div>

              {/* Presets */}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-1">
                {[
                  { label: 'Compact', size: 0.7, spread: 0.8 },
                  { label: 'Normal', size: 1.0, spread: 1.0 },
                  { label: 'Sprawling', size: 1.5, spread: 1.4 }
                ].map(p => (
                  <button
                    key={p.label}
                    onClick={() => {
                      setNodeSizeScale(p.size);
                      setSpreadScale(p.spread);
                    }}
                    className={`flex-1 py-1 rounded text-[10px] font-medium border transition-colors ${
                      nodeSizeScale === p.size && spreadScale === p.spread
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/60 font-bold'
                        : 'bg-slate-900 hover:bg-slate-850 text-slate-400 border-slate-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-l border-slate-700 h-4 mx-1"></div>
        <span className="text-[11px] text-slate-400">Left-drag: Orbit • Right-drag: Pan • Scroll: Zoom • Hover: Isolate</span>
      </div>
    </div>
  );
};
