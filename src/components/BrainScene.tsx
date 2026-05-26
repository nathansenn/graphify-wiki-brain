import { Html, OrbitControls, Stars } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { BrainGraph, PositionedBrainGraph, PositionedBrainNode } from "../lib/graph";
import { layoutBrainGraph } from "../lib/graph";

interface BrainSceneProps {
  graph: BrainGraph;
  query: string;
  group: string;
  selectedId: string | null;
  orbiting: boolean;
  onSelect: (nodeId: string | null) => void;
  onReady: () => void;
}

const NODE_LIMIT = 1600;
const EDGE_LIMIT = 5200;

function matchesQuery(node: PositionedBrainNode, query: string): boolean {
  if (!query) return true;
  const target = `${node.label} ${node.group} ${node.kind ?? ""} ${node.path ?? ""} ${node.summary ?? ""}`.toLowerCase();
  return target.includes(query.toLowerCase());
}

interface BrainFieldProps {
  graph: PositionedBrainGraph;
  query: string;
  selectedId: string | null;
  orbiting: boolean;
  onSelect: (nodeId: string | null) => void;
}

function BrainField({
  graph,
  query,
  selectedId,
  orbiting,
  onSelect,
}: BrainFieldProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const allNodeIds = useMemo(() => new Set(graph.nodes.map((node) => node.id)), [graph.nodes]);
  const selectedNode = selectedId ? graph.nodes.find((node) => node.id === selectedId) ?? null : null;
  const queryMatches = useMemo(() => {
    if (!query.trim()) return new Set<string>();
    return new Set(graph.nodes.filter((node) => matchesQuery(node, query)).map((node) => node.id));
  }, [graph.nodes, query]);

  const visibleNodes = useMemo(() => {
    const mustKeep = new Set<string>([selectedId, hoveredId].filter(Boolean) as string[]);
    for (const id of queryMatches) mustKeep.add(id);

    const sorted = [...graph.nodes].sort((a, b) => {
      if (mustKeep.has(a.id) && !mustKeep.has(b.id)) return -1;
      if (!mustKeep.has(a.id) && mustKeep.has(b.id)) return 1;
      return b.degree - a.degree || a.label.localeCompare(b.label);
    });

    return sorted.slice(0, NODE_LIMIT);
  }, [graph.nodes, hoveredId, queryMatches, selectedId]);

  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const positionById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node.position] as const)),
    [graph.nodes],
  );

  const visibleEdges = useMemo(
    () =>
      graph.edges
        .filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
        .sort((a, b) => Number(b.weight ?? 1) - Number(a.weight ?? 1))
        .slice(0, EDGE_LIMIT),
    [graph.edges, visibleIds],
  );

  useFrame((_, delta) => {
    if (!groupRef.current || !orbiting || selectedId) return;
    groupRef.current.rotation.y += delta * 0.035;
    groupRef.current.rotation.x = Math.sin(Date.now() * 0.00011) * 0.04;
  });

  return (
    <group ref={groupRef}>
      <BrainCore selectedNode={selectedNode} />
      <EdgeField edges={visibleEdges} positionById={positionById} selectedId={selectedId} />
      {visibleNodes.map((node) => {
        const isSelected = selectedId === node.id;
        const isHovered = hoveredId === node.id;
        const isQueryMatch = queryMatches.size === 0 || queryMatches.has(node.id);
        const isDimmed = queryMatches.size > 0 && !isQueryMatch && selectedId !== node.id;
        const showLabel = isSelected || isHovered || (node.degree > 3 && visibleNodes.length < 160);

        return (
          <BrainNodeMesh
            key={node.id}
            node={node}
            dimmed={isDimmed}
            selected={isSelected}
            hovered={isHovered}
            showLabel={showLabel}
            onSelect={onSelect}
            onHover={setHoveredId}
          />
        );
      })}
      {allNodeIds.size > NODE_LIMIT && (
        <Html position={[0, -34, 0]} center>
          <div className="scene-count">{NODE_LIMIT.toLocaleString()} / {allNodeIds.size.toLocaleString()}</div>
        </Html>
      )}
    </group>
  );
}

function BrainCore({ selectedNode }: { selectedNode: PositionedBrainNode | null }) {
  const ref = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y -= delta * 0.08;
    ref.current.rotation.z += delta * 0.035;
  });

  return (
    <group ref={ref}>
      <mesh>
        <icosahedronGeometry args={[1.2, 1]} />
        <meshStandardMaterial
          color={selectedNode?.color ?? "#f7b84b"}
          emissive={selectedNode?.color ?? "#f7b84b"}
          emissiveIntensity={0.9}
          roughness={0.28}
          metalness={0.35}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[3.1, 0.015, 8, 128]} />
        <meshBasicMaterial color={selectedNode?.color ?? "#6ee7f9"} transparent opacity={0.48} />
      </mesh>
      <mesh rotation={[0.4, 0.6, 0.2]}>
        <torusGeometry args={[4.7, 0.01, 8, 128]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.16} />
      </mesh>
    </group>
  );
}

function EdgeField({
  edges,
  positionById,
  selectedId,
}: {
  edges: { source: string; target: string; weight?: number }[];
  positionById: Map<string, [number, number, number]>;
  selectedId: string | null;
}) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const active = new THREE.Color("#f7b84b");
    const calm = new THREE.Color("#5db7ff");

    for (const edge of edges) {
      const source = positionById.get(edge.source);
      const target = positionById.get(edge.target);
      if (!source || !target) continue;
      positions.push(...source, ...target);
      const color = selectedId && (edge.source === selectedId || edge.target === selectedId) ? active : calm;
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    buffer.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return buffer;
  }, [edges, positionById, selectedId]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={selectedId ? 0.34 : 0.18} blending={THREE.AdditiveBlending} />
    </lineSegments>
  );
}

function BrainNodeMesh({
  node,
  dimmed,
  selected,
  hovered,
  showLabel,
  onSelect,
  onHover,
}: {
  node: PositionedBrainNode;
  dimmed: boolean;
  selected: boolean;
  hovered: boolean;
  showLabel: boolean;
  onSelect: (nodeId: string | null) => void;
  onHover: (nodeId: string | null) => void;
}) {
  const materialColor = useMemo(() => new THREE.Color(node.color), [node.color]);
  const scale = selected ? 1.7 : hovered ? 1.35 : 1;

  const handlePointer = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onHover(node.id);
    document.body.style.cursor = "pointer";
  };

  const handleLeave = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onHover(null);
    document.body.style.cursor = "";
  };

  return (
    <group position={node.position}>
      <mesh
        scale={scale}
        onPointerOver={handlePointer}
        onPointerOut={handleLeave}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(selected ? null : node.id);
        }}
      >
        <sphereGeometry args={[node.radius, 18, 18]} />
        <meshStandardMaterial
          color={materialColor}
          emissive={materialColor}
          emissiveIntensity={selected ? 1.1 : hovered ? 0.85 : 0.34}
          transparent
          opacity={dimmed ? 0.22 : selected ? 1 : 0.88}
          roughness={0.38}
          metalness={0.18}
        />
      </mesh>
      <mesh scale={scale * 1.7}>
        <sphereGeometry args={[node.radius, 16, 16]} />
        <meshBasicMaterial color={materialColor} transparent opacity={selected ? 0.16 : hovered ? 0.1 : 0.035} />
      </mesh>
      {showLabel && (
        <Html center distanceFactor={selected ? 9 : 12}>
          <button className={`node-label ${selected ? "selected" : ""}`} onClick={() => onSelect(node.id)}>
            <span>{node.label}</span>
            <small>{node.group}</small>
          </button>
        </Html>
      )}
    </group>
  );
}

export default function BrainScene({ graph, query, group, selectedId, orbiting, onSelect, onReady }: BrainSceneProps) {
  const laidOutGraph = useMemo(() => layoutBrainGraph(graph, group), [graph, group]);

  return (
    <Canvas
      className="brain-canvas"
      camera={{ position: [0, 6, 72], fov: 52, near: 0.1, far: 1000 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.setClearColor("#05060a", 1);
        onReady();
      }}
      onPointerMissed={() => onSelect(null)}
    >
      <fog attach="fog" args={["#05060a", 48, 136]} />
      <ambientLight intensity={0.34} />
      <pointLight position={[16, 22, 20]} intensity={2.2} color="#f7b84b" />
      <pointLight position={[-24, -14, -16]} intensity={1.4} color="#40c9a2" />
      <pointLight position={[28, -8, -20]} intensity={1.1} color="#ff6f91" />
      <Stars radius={118} depth={48} count={2600} factor={4} saturation={0.4} fade speed={0.6} />
      <BrainField graph={laidOutGraph} query={query} selectedId={selectedId} orbiting={orbiting} onSelect={onSelect} />
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        zoomSpeed={0.7}
        minDistance={18}
        maxDistance={150}
        autoRotate={orbiting && !selectedId}
        autoRotateSpeed={0.28}
      />
    </Canvas>
  );
}
