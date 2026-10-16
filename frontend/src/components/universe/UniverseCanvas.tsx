import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { CodeGraph, GraphNode, GraphEdge, NodeType, EdgeType } from '../../types';

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

const NODE_SIZES: Record<NodeType, number> = {
  directory: 5.5,
  file: 3.2,
  class: 2.4,
  function: 1.6
};

export const UniverseCanvas: React.FC<UniverseCanvasProps> = ({
  graph,
  selectedNode,
  blastRadiusIds = new Set(),
  onSelectNode,
  showLabels = true
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const nodeMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const edgesLineRef = useRef<THREE.LineSegments | null>(null);
  const pulseParticlesRef = useRef<THREE.Points | null>(null);
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
  const updateCameraPosition = () => {
    if (!cameraRef.current) return;
    const { radius, theta, phi } = cameraSphericalRef.current;
    const target = cameraTargetRef.current;

    cameraRef.current.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
    cameraRef.current.position.y = target.y + radius * Math.cos(phi);
    cameraRef.current.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
    cameraRef.current.lookAt(target);
  };

  // Fly camera to target node
  useEffect(() => {
    if (selectedNode && cameraRef.current) {
      const targetPos = new THREE.Vector3(
        selectedNode.position.x,
        selectedNode.position.y,
        selectedNode.position.z
      );
      cameraTargetRef.current.copy(targetPos);
      cameraSphericalRef.current.radius = 80;
      updateCameraPosition();
    }
  }, [selectedNode]);

  // Main Three.js Scene Setup & Render Loop
  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x07090e, 0.0012);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 3000);
    cameraRef.current = camera;
    updateCameraPosition();

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;

    mountRef.current.innerHTML = '';
    mountRef.current.appendChild(renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x38bdf8, 2.5, 800);
    pointLight.position.set(0, 100, 0);
    scene.add(pointLight);

    // 5. Deep Space Stars Background
    const starsGeo = new THREE.BufferGeometry();
    const starCount = 3000;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starPositions[i] = (Math.random() - 0.5) * 2000;
      starPositions[i + 1] = (Math.random() - 0.5) * 2000;
      starPositions[i + 2] = (Math.random() - 0.5) * 2000;
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

    // 6. Build Graph Visuals
    const nodeMeshMap = new Map<string, THREE.Mesh>();
    nodeMeshesRef.current = nodeMeshMap;

    if (graph && graph.nodes.length > 0) {
      // Create Nodes
      const sphereGeo = new THREE.SphereGeometry(1, 16, 16);

      graph.nodes.forEach(node => {
        let color = NODE_COLORS[node.type] || 0x38bdf8;
        if (blastRadiusIds.has(node.id)) {
          color = 0xf43f5e; // Bright rose for blast radius
        } else if (selectedNode && selectedNode.id === node.id) {
          color = 0xfacc15; // Golden yellow for selected
        }

        const size = (NODE_SIZES[node.type] || 2.0) * (node.metrics.risk_score > 50 ? 1.3 : 1.0);
        const material = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.3,
          metalness: 0.2,
          emissive: color,
          emissiveIntensity: selectedNode?.id === node.id || blastRadiusIds.has(node.id) ? 0.8 : 0.25
        });

        const mesh = new THREE.Mesh(sphereGeo, material);
        mesh.scale.set(size, size, size);
        mesh.position.set(node.position.x, node.position.y, node.position.z);
        mesh.userData = { nodeId: node.id };

        scene.add(mesh);
        nodeMeshMap.set(node.id, mesh);
      });

      // Create Constellation Edges
      const edgePositions: number[] = [];
      const edgeColors: number[] = [];

      graph.edges.forEach(edge => {
        const srcNode = nodeMap.get(edge.source);
        const tgtNode = nodeMap.get(edge.target);
        if (srcNode && tgtNode) {
          edgePositions.push(srcNode.position.x, srcNode.position.y, srcNode.position.z);
          edgePositions.push(tgtNode.position.x, tgtNode.position.y, tgtNode.position.z);

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

      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
      lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(edgeColors, 3));

      const lineMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.45
      });

      const lineSegments = new THREE.LineSegments(lineGeo, lineMat);
      scene.add(lineSegments);
      edgesLineRef.current = lineSegments;
    }

    // 7. Animation Loop
    let clock = new THREE.Clock();
    const animate = () => {
      const elapsedTime = clock.getElapsedTime();

      // Subtle slow rotation of celestial stars
      starField.rotation.y = elapsedTime * 0.01;

      // Pulse selected or blast nodes
      nodeMeshMap.forEach((mesh, id) => {
        if (id === selectedNode?.id || blastRadiusIds.has(id)) {
          const s = (NODE_SIZES[nodeMap.get(id)?.type || 'file']) * (1 + 0.15 * Math.sin(elapsedTime * 6));
          mesh.scale.set(s, s, s);
        }
      });

      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    // 8. Resize Handler
    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      renderer.dispose();
    };
  }, [graph, selectedNode, blastRadiusIds, nodeMap]);

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
      <div className="absolute bottom-4 left-4 z-20 flex items-center space-x-2 glass-panel px-3 py-2 rounded-xl text-xs text-slate-300">
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
        <div className="border-l border-slate-700 h-4 mx-2"></div>
        <span className="text-[11px] text-slate-400">Left-click: Rotate • Right-click: Pan • Scroll: Zoom</span>
      </div>
    </div>
  );
};
