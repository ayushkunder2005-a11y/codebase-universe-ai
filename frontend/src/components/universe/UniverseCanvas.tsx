import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { CodeGraph, GraphNode, NodeType } from '../../types';
import { Sliders, RotateCcw, ZoomIn, ZoomOut, Check, Sparkles } from 'lucide-react';

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

export const UniverseCanvas: React.FC<UniverseCanvasProps> = ({
  graph,
  selectedNode,
  blastRadiusIds = new Set(),
  onSelectNode
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Size & Scale Adjustment state
  const [nodeSizeScale, setNodeSizeScale] = useState(1.0);
  const [spreadScale, setSpreadScale] = useState(1.0);
  const [showSizeControls, setShowSizeControls] = useState(false);

  // Three.js References (Persistent across renders)
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const graphGroupRef = useRef<THREE.Group | null>(null);
  const nodeMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const edgesLineRef = useRef<THREE.LineSegments | null>(null);
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
      cameraSphericalRef.current.radius = 85;
      updateCameraPosition();
    }
  }, [selectedNode, spreadScale, updateCameraPosition]);

  // 1. Initialize Three.js Scene, Camera, Renderer ONCE on mount
  useEffect(() => {
    if (!mountRef.current) return;

    const width = Math.max(10, mountRef.current.clientWidth || 800);
    const height = Math.max(10, mountRef.current.clientHeight || 600);

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

    mountRef.current.innerHTML = '';
    mountRef.current.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x38bdf8, 2.5, 900);
    pointLight.position.set(0, 120, 0);
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
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      if (w <= 0 || h <= 0 || isNaN(w) || isNaN(h)) return;

      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h, false);
    };

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(mountRef.current);
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
        starFieldRef.current.rotation.y = elapsedTime * 0.008;
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
      renderer.dispose();
    };
  }, []); // Run once on mount

  // 2. Build or Rebuild Graph Objects when graph or spread changes
  useEffect(() => {
    const graphGroup = graphGroupRef.current;
    if (!graphGroup || !graph) return;

    // Clear previous graph objects from group
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

    if (graph.nodes.length === 0) return;

    // Shared sphere geometry
    const sphereGeo = new THREE.SphereGeometry(1, 16, 16);

    // Create Nodes
    graph.nodes.forEach(node => {
      let color = NODE_COLORS[node.type] || 0x38bdf8;
      if (blastRadiusIds.has(node.id)) {
        color = 0xf43f5e; // Rose for blast radius
      } else if (selectedNode && selectedNode.id === node.id) {
        color = 0xfacc15; // Golden yellow for selected
      }

      const riskBoost = node.metrics.risk_score > 50 ? 1.3 : 1.0;
      const size = (BASE_NODE_SIZES[node.type] || 2.0) * riskBoost * nodeSizeScale;

      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.3,
        metalness: 0.2,
        emissive: color,
        emissiveIntensity: selectedNode?.id === node.id || blastRadiusIds.has(node.id) ? 0.85 : 0.25
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

    // Create Constellation Edges
    const edgePositions: number[] = [];
    const edgeColors: number[] = [];

    graph.edges.forEach(edge => {
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
          edgeColor = new THREE.Color(0xfacc15); // Highlight connected edges
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
    }
  }, [graph, spreadScale]); // Rebuild meshes when graph structure or spread changes

  // 3. Fast reactive scale update (WITHOUT recreating meshes or WebGL context)
  useEffect(() => {
    if (!graph) return;
    const meshes = nodeMeshesRef.current;
    graph.nodes.forEach(node => {
      const mesh = meshes.get(node.id);
      if (mesh) {
        const riskBoost = node.metrics.risk_score > 50 ? 1.3 : 1.0;
        const size = (BASE_NODE_SIZES[node.type] || 2.0) * riskBoost * nodeSizeScale;
        mesh.scale.set(size, size, size);
      }
    });
  }, [nodeSizeScale, graph]);

  // 4. Fast reactive color & emissive update for selection and blast radius
  useEffect(() => {
    const meshes = nodeMeshesRef.current;
    meshes.forEach((mesh, id) => {
      const node = nodeMap.get(id);
      if (!node) return;

      let colorHex = NODE_COLORS[node.type] || 0x38bdf8;
      const isBlast = blastRadiusIds.has(id);
      const isSelected = selectedNode?.id === id;

      if (isBlast) colorHex = 0xf43f5e;
      else if (isSelected) colorHex = 0xfacc15;

      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat) {
        mat.color.setHex(colorHex);
        mat.emissive.setHex(colorHex);
        mat.emissiveIntensity = isSelected || isBlast ? 0.85 : 0.25;
      }
    });
  }, [selectedNode, blastRadiusIds, nodeMap]);

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
    if (!mountRef.current || !cameraRef.current || !sceneRef.current) return;
    const rect = mountRef.current.getBoundingClientRect();
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
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
    isRightDraggingRef.current = false;
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mountRef.current || !cameraRef.current || !sceneRef.current) return;
    const rect = mountRef.current.getBoundingClientRect();
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
      if (hitNode) onSelectNode(hitNode);
    } else {
      // Clicked on empty space
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
      ref={mountRef}
      className="relative w-full h-full cursor-grab active:cursor-grabbing overflow-hidden select-none bg-[#07090e]"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      onWheel={handleWheel}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Floating Hover Tooltip */}
      {hoveredNode && (
        <div
          className="fixed pointer-events-none z-50 glass-panel px-3 py-2 rounded-lg text-xs border border-sky-500/30 shadow-xl"
          style={{
            left: `${mousePos.x + 16}px`,
            top: `${mousePos.y + 16}px`
          }}
        >
          <div className="flex items-center space-x-2 font-medium">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: `#${NODE_COLORS[hoveredNode.type].toString(16).padStart(6, '0')}`
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
          <div className="flex items-center space-x-3 mt-1.5 pt-1.5 border-t border-slate-700/50 text-[11px]">
            <span>LOC: <strong className="text-sky-300">{hoveredNode.metrics.loc}</strong></span>
            <span>Complexity: <strong className="text-amber-300">{hoveredNode.metrics.complexity}</strong></span>
            {hoveredNode.metrics.risk_score > 0 && (
              <span>Risk: <strong className={hoveredNode.metrics.risk_score > 50 ? 'text-rose-400' : 'text-slate-300'}>
                {hoveredNode.metrics.risk_score}
              </strong></span>
            )}
          </div>
        </div>
      )}

      {/* On-screen Universe HUD Controls */}
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
        <span className="text-[11px] text-slate-400">Left-click: Rotate • Right-click: Pan • Scroll: Zoom</span>
      </div>
    </div>
  );
};
