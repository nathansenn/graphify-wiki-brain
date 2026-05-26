import { Html, OrbitControls, Sparkles as SceneSparkles, Stars } from "@react-three/drei";
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
  sacredMode: boolean;
  pathMode: boolean;
  pathNodeIds: string[];
  onSelect: (nodeId: string | null) => void;
  onReady: () => void;
}

const NODE_LIMIT = 1600;
const EDGE_LIMIT = 5200;

function edgeKey(source: string, target: string): string {
  return source < target ? `${source}::${target}` : `${target}::${source}`;
}

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
  sacredMode: boolean;
  pathMode: boolean;
  pathNodeIds: string[];
  onSelect: (nodeId: string | null) => void;
}

function BrainField({
  graph,
  query,
  selectedId,
  orbiting,
  sacredMode,
  pathMode,
  pathNodeIds,
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
  const colorById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node.color] as const)),
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
  const sacredNodeIds = useMemo(() => {
    const ids = new Set(pathNodeIds.filter((id) => visibleIds.has(id)));
    if (selectedId && visibleIds.has(selectedId)) ids.add(selectedId);
    return ids;
  }, [pathNodeIds, selectedId, visibleIds]);
  const pathEdgeKeys = useMemo(() => {
    if (!pathMode) return new Set<string>();
    const ids = new Set(pathNodeIds.filter((id) => visibleIds.has(id)));
    if (selectedId && visibleIds.has(selectedId)) ids.add(selectedId);
    if (ids.size === 0) return new Set<string>();

    const keys = new Set<string>();
    const edgeLookup = new Map(visibleEdges.map((edge) => [edgeKey(edge.source, edge.target), edge]));
    const orderedIds = pathNodeIds.filter((id) => ids.has(id));

    for (let index = 0; index < orderedIds.length - 1; index += 1) {
      const key = edgeKey(orderedIds[index], orderedIds[index + 1]);
      if (edgeLookup.has(key)) keys.add(key);
    }

    for (const edge of visibleEdges) {
      if (keys.size >= 28) break;
      if (ids.has(edge.source) || ids.has(edge.target)) {
        keys.add(edgeKey(edge.source, edge.target));
      }
    }

    return keys;
  }, [pathMode, pathNodeIds, selectedId, visibleEdges, visibleIds]);

  useFrame((_, delta) => {
    if (!groupRef.current || !orbiting || selectedId) return;
    groupRef.current.rotation.y += delta * 0.035;
    groupRef.current.rotation.x = Math.sin(Date.now() * 0.00011) * 0.04;
  });

  return (
    <group ref={groupRef}>
      <BrainCore selectedNode={selectedNode} sacredMode={sacredMode} />
      <EdgeField
        edges={visibleEdges}
        positionById={positionById}
        colorById={colorById}
        selectedId={selectedId}
        pathEdgeKeys={pathEdgeKeys}
        sacredMode={sacredMode}
      />
      <PathGlowField edges={visibleEdges} positionById={positionById} pathEdgeKeys={pathEdgeKeys} />
      {visibleNodes.map((node) => {
        const isSelected = selectedId === node.id;
        const isHovered = hoveredId === node.id;
        const isQueryMatch = queryMatches.size === 0 || queryMatches.has(node.id);
        const isDimmed = queryMatches.size > 0 && !isQueryMatch && selectedId !== node.id;
        const isSacred = sacredMode && sacredNodeIds.has(node.id);
        const showLabel = isSelected || isHovered || isSacred || (node.degree > 3 && visibleNodes.length < 160);

        return (
          <BrainNodeMesh
            key={node.id}
            node={node}
            dimmed={isDimmed}
            selected={isSelected}
            hovered={isHovered}
            sacred={isSacred}
            sacredMode={sacredMode}
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

function BrainCore({ selectedNode, sacredMode }: { selectedNode: PositionedBrainNode | null; sacredMode: boolean }) {
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
          emissiveIntensity={sacredMode ? 1.45 : 0.9}
          roughness={0.28}
          metalness={0.35}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[3.1, 0.015, 8, 128]} />
        <meshBasicMaterial color={selectedNode?.color ?? "#6ee7f9"} transparent opacity={sacredMode ? 0.72 : 0.48} />
      </mesh>
      <mesh rotation={[0.4, 0.6, 0.2]}>
        <torusGeometry args={[4.7, 0.01, 8, 128]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={sacredMode ? 0.25 : 0.16} />
      </mesh>
      {sacredMode && (
        <>
          <mesh rotation={[0.9, 0.08, 0.8]}>
            <torusGeometry args={[6.2, 0.008, 8, 160]} />
            <meshBasicMaterial color="#f7b84b" transparent opacity={0.34} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh rotation={[1.2, 0.9, 0.1]}>
            <torusGeometry args={[7.6, 0.007, 8, 160]} />
            <meshBasicMaterial color="#5db7ff" transparent opacity={0.22} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh>
            <sphereGeometry args={[2.7, 24, 24]} />
            <meshBasicMaterial color="#f7b84b" transparent opacity={0.055} blending={THREE.AdditiveBlending} />
          </mesh>
        </>
      )}
    </group>
  );
}

function EdgeField({
  edges,
  positionById,
  colorById,
  selectedId,
  pathEdgeKeys,
  sacredMode,
}: {
  edges: { source: string; target: string; weight?: number }[];
  positionById: Map<string, [number, number, number]>;
  colorById: Map<string, string>;
  selectedId: string | null;
  pathEdgeKeys: Set<string>;
  sacredMode: boolean;
}) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const active = new THREE.Color("#f7b84b");
    const pathA = new THREE.Color("#fff2b8");
    const pathB = new THREE.Color("#5db7ff");

    for (const edge of edges) {
      const source = positionById.get(edge.source);
      const target = positionById.get(edge.target);
      if (!source || !target) continue;
      positions.push(...source, ...target);
      const isActive = selectedId && (edge.source === selectedId || edge.target === selectedId);
      const isPath = pathEdgeKeys.has(edgeKey(edge.source, edge.target));
      const sourceColor = new THREE.Color(colorById.get(edge.source) ?? "#5db7ff");
      const targetColor = new THREE.Color(colorById.get(edge.target) ?? "#40c9a2");

      if (isPath) {
        colors.push(pathA.r, pathA.g, pathA.b, pathB.r, pathB.g, pathB.b);
      } else if (isActive) {
        const sourceActive = sourceColor.lerp(active, 0.62);
        const targetActive = targetColor.lerp(active, 0.62);
        colors.push(sourceActive.r, sourceActive.g, sourceActive.b, targetActive.r, targetActive.g, targetActive.b);
      } else {
        sourceColor.multiplyScalar(sacredMode ? 0.86 : 0.68);
        targetColor.multiplyScalar(sacredMode ? 0.86 : 0.68);
        colors.push(sourceColor.r, sourceColor.g, sourceColor.b, targetColor.r, targetColor.g, targetColor.b);
      }
    }

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    buffer.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return buffer;
  }, [colorById, edges, pathEdgeKeys, positionById, sacredMode, selectedId]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={selectedId || pathEdgeKeys.size > 0 ? 0.38 : sacredMode ? 0.24 : 0.17}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  );
}

function PathGlowField({
  edges,
  positionById,
  pathEdgeKeys,
}: {
  edges: { source: string; target: string; weight?: number }[];
  positionById: Map<string, [number, number, number]>;
  pathEdgeKeys: Set<string>;
}) {
  const { geometry, count } = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const gold = new THREE.Color("#f7b84b");
    const white = new THREE.Color("#fff8d6");
    const offsets: [number, number, number][] = [
      [0, 0, 0],
      [0.035, 0.02, -0.025],
      [-0.025, 0.03, 0.035],
    ];

    for (const edge of edges) {
      if (!pathEdgeKeys.has(edgeKey(edge.source, edge.target))) continue;
      const source = positionById.get(edge.source);
      const target = positionById.get(edge.target);
      if (!source || !target) continue;

      for (const offset of offsets) {
        positions.push(
          source[0] + offset[0],
          source[1] + offset[1],
          source[2] + offset[2],
          target[0] + offset[0],
          target[1] + offset[1],
          target[2] + offset[2],
        );
        colors.push(gold.r, gold.g, gold.b, white.r, white.g, white.b);
      }
    }

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    buffer.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return { geometry: buffer, count: positions.length / 6 };
  }, [edges, pathEdgeKeys, positionById]);

  if (count === 0) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={0.66} blending={THREE.AdditiveBlending} depthWrite={false} />
    </lineSegments>
  );
}

function BrainNodeMesh({
  node,
  dimmed,
  selected,
  hovered,
  sacred,
  sacredMode,
  showLabel,
  onSelect,
  onHover,
}: {
  node: PositionedBrainNode;
  dimmed: boolean;
  selected: boolean;
  hovered: boolean;
  sacred: boolean;
  sacredMode: boolean;
  showLabel: boolean;
  onSelect: (nodeId: string | null) => void;
  onHover: (nodeId: string | null) => void;
}) {
  const materialColor = useMemo(() => new THREE.Color(node.color), [node.color]);
  const scale = selected ? 1.85 : hovered ? 1.42 : sacred ? 1.18 : 1;
  const glowOpacity = selected ? 0.22 : hovered ? 0.14 : sacred ? 0.12 : sacredMode ? 0.052 : 0.035;
  const emissiveIntensity = selected ? 1.35 : hovered ? 0.98 : sacred ? 0.76 : sacredMode ? 0.44 : 0.34;

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
          emissiveIntensity={emissiveIntensity}
          transparent
          opacity={dimmed ? 0.22 : selected ? 1 : sacred ? 0.96 : 0.88}
          roughness={0.38}
          metalness={0.18}
        />
      </mesh>
      <mesh scale={scale * 1.7}>
        <sphereGeometry args={[node.radius, 16, 16]} />
        <meshBasicMaterial color={materialColor} transparent opacity={glowOpacity} blending={THREE.AdditiveBlending} />
      </mesh>
      {(selected || hovered || sacred) && (
        <>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[node.radius * 1.75, 0.015, 8, 72]} />
            <meshBasicMaterial color={selected ? "#f7b84b" : materialColor} transparent opacity={selected ? 0.62 : 0.42} />
          </mesh>
          <mesh rotation={[0.45, 0.85, 0.2]}>
            <torusGeometry args={[node.radius * 2.22, 0.01, 8, 88]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={selected ? 0.24 : 0.16} blending={THREE.AdditiveBlending} />
          </mesh>
        </>
      )}
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

export default function BrainScene({
  graph,
  query,
  group,
  selectedId,
  orbiting,
  sacredMode,
  pathMode,
  pathNodeIds,
  onSelect,
  onReady,
}: BrainSceneProps) {
  const laidOutGraph = useMemo(() => layoutBrainGraph(graph, group), [graph, group]);

  return (
    <Canvas
      className="brain-canvas"
      camera={{ position: [0, 6, 72], fov: 52, near: 0.1, far: 1000 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.setClearColor("#050724", 1);
        onReady();
      }}
      onPointerMissed={() => onSelect(null)}
    >
      <fog attach="fog" args={["#050724", 52, 150]} />
      <ambientLight intensity={sacredMode ? 0.42 : 0.34} />
      <pointLight position={[16, 22, 20]} intensity={sacredMode ? 3.1 : 2.2} color="#f7b84b" />
      <pointLight position={[-24, -14, -16]} intensity={sacredMode ? 2.1 : 1.4} color="#40c9a2" />
      <pointLight position={[28, -8, -20]} intensity={sacredMode ? 1.75 : 1.1} color="#ff6f91" />
      <pointLight position={[0, 26, -28]} intensity={sacredMode ? 1.4 : 0.8} color="#5db7ff" />
      <Stars radius={128} depth={58} count={sacredMode ? 4300 : 2800} factor={sacredMode ? 5.2 : 4} saturation={0.7} fade speed={0.7} />
      <SceneSparkles
        count={sacredMode ? 240 : 90}
        scale={[76, 48, 76]}
        size={sacredMode ? 4.2 : 2.4}
        speed={0.36}
        color={sacredMode ? "#fff2b8" : "#6ee7f9"}
        opacity={sacredMode ? 0.72 : 0.38}
      />
      <BrainField
        graph={laidOutGraph}
        query={query}
        selectedId={selectedId}
        orbiting={orbiting}
        sacredMode={sacredMode}
        pathMode={pathMode}
        pathNodeIds={pathNodeIds}
        onSelect={onSelect}
      />
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
