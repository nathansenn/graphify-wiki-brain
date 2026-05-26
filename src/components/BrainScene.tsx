import { Html, OrbitControls, Sparkles as SceneSparkles } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
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
const EDGE_CURVE_SEGMENTS = 24;

let glowTexture: THREE.CanvasTexture | null = null;

type VisibleEdge = { source: string; target: string; weight?: number };

function edgeKey(source: string, target: string): string {
  return source < target ? `${source}::${target}` : `${target}::${source}`;
}

function curveSign(key: string): number {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) hash = (hash + key.charCodeAt(index) * (index + 1)) % 97;
  return hash % 2 === 0 ? 1 : -1;
}

function seededNoise(index: number, salt = 0): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function createGlowTexture(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.15, "rgba(255,255,255,0.82)");
  gradient.addColorStop(0.42, "rgba(255,255,255,0.28)");
  gradient.addColorStop(0.72, "rgba(255,255,255,0.05)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

function buildCurvePoints(
  source: [number, number, number],
  target: [number, number, number],
  key: string,
  segments = EDGE_CURVE_SEGMENTS,
): THREE.Vector3[] {
  const from = new THREE.Vector3(...source);
  const to = new THREE.Vector3(...target);
  const distance = from.distanceTo(to);
  const sign = curveSign(key);
  const side = new THREE.Vector3().subVectors(to, from).cross(new THREE.Vector3(0, 1, 0));
  if (side.lengthSq() < 0.0001) side.set(1, 0, 0);
  side.normalize().multiplyScalar(sign * distance * 0.028);

  const points: THREE.Vector3[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const mid = Math.sin(t * Math.PI);
    const point = new THREE.Vector3().lerpVectors(from, to, t);
    point.y += mid * distance * 0.082;
    point.x += side.x * mid;
    point.z += side.z * mid;
    points.push(point);
  }
  return points;
}

function sampleCurve(points: THREE.Vector3[], progress: number): THREE.Vector3 {
  if (points.length === 0) return new THREE.Vector3();
  if (points.length === 1) return points[0].clone();
  const scaled = progress * (points.length - 1);
  const index = Math.min(Math.floor(scaled), points.length - 2);
  const local = scaled - index;
  return new THREE.Vector3().lerpVectors(points[index], points[index + 1], local);
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
      <SacredRadialWaves active={sacredMode} center={selectedNode?.position ?? [0, 0, 0]} />
      <EdgeField
        edges={visibleEdges}
        positionById={positionById}
        colorById={colorById}
        selectedId={selectedId}
        pathEdgeKeys={pathEdgeKeys}
        sacredMode={sacredMode}
      />
      <PathGlowField edges={visibleEdges} positionById={positionById} pathEdgeKeys={pathEdgeKeys} />
      <FlowParticles
        edges={visibleEdges}
        positionById={positionById}
        colorById={colorById}
        pathEdgeKeys={pathEdgeKeys}
        sacredMode={sacredMode}
      />
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

function SacredRadialWaves({ active, center }: { active: boolean; center: [number, number, number] }) {
  const ringsRef = useRef<Array<THREE.Mesh | null>>([]);

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    ringsRef.current.forEach((ring, index) => {
      if (!ring) return;
      const material = ring.material as THREE.MeshBasicMaterial;
      const cycle = (time * 0.12 + index / 4) % 1;
      const scale = 5 + cycle * 82;
      ring.scale.set(scale, scale, 1);
      ring.rotation.z += 0.0006 + index * 0.0003;
      material.opacity = active ? Math.max(0, (1 - cycle) * 0.075) : 0;
    });
  });

  return (
    <group position={center}>
      {Array.from({ length: 4 }).map((_, index) => (
        <mesh
          key={index}
          ref={(element) => {
            ringsRef.current[index] = element;
          }}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[1, 1.012, 160]} />
          <meshBasicMaterial
            color={index % 2 === 0 ? "#f7b84b" : "#fff8c8"}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
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
  edges: VisibleEdge[];
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
      const key = edgeKey(edge.source, edge.target);
      const points = buildCurvePoints(source, target, key);
      const isActive = selectedId && (edge.source === selectedId || edge.target === selectedId);
      const isPath = pathEdgeKeys.has(key);
      const sourceColor = new THREE.Color(colorById.get(edge.source) ?? "#5db7ff");
      const targetColor = new THREE.Color(colorById.get(edge.target) ?? "#40c9a2");
      let fromColor: THREE.Color;
      let toColor: THREE.Color;

      if (isPath) {
        fromColor = pathA;
        toColor = pathB;
      } else if (isActive) {
        fromColor = sourceColor.lerp(active, 0.62);
        toColor = targetColor.lerp(active, 0.62);
      } else {
        sourceColor.multiplyScalar(sacredMode ? 0.86 : 0.68);
        targetColor.multiplyScalar(sacredMode ? 0.86 : 0.68);
        fromColor = sourceColor;
        toColor = targetColor;
      }

      for (let index = 0; index < points.length - 1; index += 1) {
        const a = points[index];
        const b = points[index + 1];
        const tA = index / Math.max(points.length - 1, 1);
        const tB = (index + 1) / Math.max(points.length - 1, 1);
        const colorA = fromColor.clone().lerp(toColor, tA);
        const colorB = fromColor.clone().lerp(toColor, tB);
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        colors.push(colorA.r, colorA.g, colorA.b, colorB.r, colorB.g, colorB.b);
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
        opacity={selectedId || pathEdgeKeys.size > 0 ? 0.48 : sacredMode ? 0.3 : 0.2}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  );
}

function PathGlowField({
  edges,
  positionById,
  pathEdgeKeys,
}: {
  edges: VisibleEdge[];
  positionById: Map<string, [number, number, number]>;
  pathEdgeKeys: Set<string>;
}) {
  const { geometry, count, curves } = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const gold = new THREE.Color("#f7b84b");
    const white = new THREE.Color("#fff8d6");
    const curves: Array<{ key: string; curve: THREE.CatmullRomCurve3 }> = [];
    const offsets: [number, number, number][] = [
      [0, 0, 0],
      [0.055, 0.032, -0.04],
      [-0.04, 0.05, 0.055],
    ];

    for (const edge of edges) {
      const key = edgeKey(edge.source, edge.target);
      if (!pathEdgeKeys.has(key)) continue;
      const source = positionById.get(edge.source);
      const target = positionById.get(edge.target);
      if (!source || !target) continue;
      const points = buildCurvePoints(source, target, key, 44);
      curves.push({ key, curve: new THREE.CatmullRomCurve3(points) });

      for (const offset of offsets) {
        for (let index = 0; index < points.length - 1; index += 1) {
          const a = points[index];
          const b = points[index + 1];
          positions.push(a.x + offset[0], a.y + offset[1], a.z + offset[2], b.x + offset[0], b.y + offset[1], b.z + offset[2]);
          colors.push(gold.r, gold.g, gold.b, white.r, white.g, white.b);
        }
      }
    }

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    buffer.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return { geometry: buffer, count: positions.length / 6, curves };
  }, [edges, pathEdgeKeys, positionById]);

  if (count === 0) return null;

  return (
    <group>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial vertexColors transparent opacity={0.72} blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
      {curves.slice(0, 20).map(({ key, curve }, index) => (
        <mesh key={`${key}-${index}`} renderOrder={8}>
          <tubeGeometry args={[curve, 44, 0.04, 6, false]} />
          <meshBasicMaterial
            color={index % 2 === 0 ? "#f7b84b" : "#fff8c8"}
            transparent
            opacity={0.12}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function FlowParticles({
  edges,
  positionById,
  colorById,
  pathEdgeKeys,
  sacredMode,
}: {
  edges: VisibleEdge[];
  positionById: Map<string, [number, number, number]>;
  colorById: Map<string, string>;
  pathEdgeKeys: Set<string>;
  sacredMode: boolean;
}) {
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const particleState = useMemo(() => {
    const curveData = edges
      .slice(0, 420)
      .map((edge) => {
        const source = positionById.get(edge.source);
        const target = positionById.get(edge.target);
        if (!source || !target) return null;
        const key = edgeKey(edge.source, edge.target);
        const color = new THREE.Color(colorById.get(edge.source) ?? "#f7b84b").lerp(
          new THREE.Color(colorById.get(edge.target) ?? "#5db7ff"),
          0.45,
        );
        return { key, points: buildCurvePoints(source, target, key, 34), color, path: pathEdgeKeys.has(key) };
      })
      .filter((edge): edge is { key: string; points: THREE.Vector3[]; color: THREE.Color; path: boolean } => Boolean(edge));
    const particleCount = Math.min(1800, Math.max(0, curveData.length * (sacredMode ? 18 : 12)));
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const particles = Array.from({ length: particleCount }, (_, index) => {
      const curveIndex = index % Math.max(curveData.length, 1);
      const curve = curveData[curveIndex];
      const color = curve?.path ? new THREE.Color("#fff2b8") : curve?.color ?? new THREE.Color("#5db7ff");
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
      return {
        curveIndex,
        phase: seededNoise(index, 3),
        speed: 0.035 + seededNoise(index, 7) * 0.086,
        shimmer: seededNoise(index, 11) * Math.PI * 2,
      };
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return { geometry, particles, curves: curveData };
  }, [colorById, edges, pathEdgeKeys, positionById, sacredMode]);
  const stateRef = useRef(particleState);

  useEffect(() => {
    stateRef.current = particleState;
  }, [particleState]);

  useFrame(({ clock }) => {
    const state = stateRef.current;
    if (state.curves.length === 0 || state.particles.length === 0) return;
    const time = clock.getElapsedTime();
    const positions = state.geometry.attributes.position.array as Float32Array;
    state.particles.forEach((particle, index) => {
      const curve = state.curves[particle.curveIndex % state.curves.length];
      const progress = (particle.phase + time * particle.speed * (curve.path ? 1.65 : 1)) % 1;
      const point = sampleCurve(curve.points, progress);
      const shimmer = Math.sin(time * 2.4 + particle.shimmer) * (curve.path ? 0.16 : 0.08);
      positions[index * 3] = point.x + shimmer;
      positions[index * 3 + 1] = point.y + Math.cos(time * 1.7 + particle.shimmer) * (curve.path ? 0.22 : 0.1);
      positions[index * 3 + 2] = point.z + Math.sin(time * 1.9 + particle.shimmer) * (curve.path ? 0.22 : 0.1);
    });
    state.geometry.attributes.position.needsUpdate = true;
    if (materialRef.current) {
      materialRef.current.opacity = sacredMode ? 0.44 + Math.sin(time * 0.7) * 0.08 : 0.28;
    }
  });

  if (particleState.particles.length === 0) return null;

  return (
    <points geometry={particleState.geometry} renderOrder={7}>
      <pointsMaterial
        ref={materialRef}
        size={sacredMode ? 0.2 : 0.14}
        vertexColors
        transparent
        opacity={sacredMode ? 0.44 : 0.28}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
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
  const groupRef = useRef<THREE.Group>(null);
  const ringOneRef = useRef<THREE.Mesh>(null);
  const ringTwoRef = useRef<THREE.Mesh>(null);
  const materialColor = useMemo(() => new THREE.Color(node.color), [node.color]);
  const scale = selected ? 1.85 : hovered ? 1.42 : sacred ? 1.18 : 1;
  const glowOpacity = selected ? 0.68 : hovered ? 0.46 : sacred ? 0.38 : sacredMode ? 0.2 : 0.12;
  const emissiveIntensity = selected ? 1.65 : hovered ? 1.12 : sacred ? 0.92 : sacredMode ? 0.58 : 0.38;
  const glowMap = useMemo(() => createGlowTexture(), []);

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.position.set(node.position[0], node.position[1] + Math.sin(time * 0.55 + node.degree) * 0.18, node.position[2]);
    }
    if (ringOneRef.current) {
      ringOneRef.current.rotation.z += 0.006;
      ringOneRef.current.rotation.y += 0.002;
    }
    if (ringTwoRef.current) {
      ringTwoRef.current.rotation.z -= 0.004;
      ringTwoRef.current.rotation.x += 0.0025;
    }
  });

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
    <group ref={groupRef} position={node.position}>
      <sprite scale={[node.radius * (selected ? 14 : sacred ? 11 : sacredMode ? 6.6 : 4.8), node.radius * (selected ? 14 : sacred ? 11 : sacredMode ? 6.6 : 4.8), 1]}>
        <spriteMaterial
          map={glowMap}
          color={selected || sacred ? "#fff2b8" : materialColor}
          transparent
          opacity={dimmed ? 0.04 : glowOpacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
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
          <mesh ref={ringOneRef} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[node.radius * 1.75, 0.015, 8, 72]} />
            <meshBasicMaterial color={selected ? "#f7b84b" : materialColor} transparent opacity={selected ? 0.62 : 0.42} />
          </mesh>
          <mesh ref={ringTwoRef} rotation={[0.45, 0.85, 0.2]}>
            <torusGeometry args={[node.radius * 2.75, 0.01, 8, 96]} />
            <meshBasicMaterial color="#fff8c8" transparent opacity={selected ? 0.36 : 0.2} blending={THREE.AdditiveBlending} />
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

function PalaceStarField({ sacredMode }: { sacredMode: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const geometry = useMemo(() => {
    const count = 5200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let index = 0; index < count; index += 1) {
      const radius = 82 + seededNoise(index, 17) * 118;
      const theta = seededNoise(index, 19) * Math.PI * 2;
      const phi = Math.acos(2 * seededNoise(index, 23) - 1);
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[index * 3 + 2] = radius * Math.cos(phi);

      const warmth = seededNoise(index, 29) * 0.28;
      colors[index * 3] = 0.78 + warmth;
      colors[index * 3 + 1] = 0.8 + warmth * 0.5;
      colors[index * 3 + 2] = 0.92 - warmth * 0.28;
    }

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    buffer.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return buffer;
  }, []);

  useFrame(({ clock }, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.006;
      ref.current.rotation.x += delta * 0.0025;
    }
    if (materialRef.current) {
      materialRef.current.opacity = sacredMode ? 0.68 + Math.sin(clock.getElapsedTime() * 0.35) * 0.08 : 0.52;
    }
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        ref={materialRef}
        size={0.24}
        vertexColors
        transparent
        opacity={sacredMode ? 0.68 : 0.52}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
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
      camera={{ position: [0, 8, 90], fov: 50, near: 0.1, far: 1000 }}
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
      <PalaceStarField sacredMode={sacredMode} />
      <SceneSparkles
        count={sacredMode ? 360 : 130}
        scale={[96, 58, 96]}
        size={sacredMode ? 3.4 : 1.9}
        speed={0.24}
        color={sacredMode ? "#fff2b8" : "#6ee7f9"}
        opacity={sacredMode ? 0.48 : 0.28}
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
        minDistance={34}
        maxDistance={210}
        autoRotate={orbiting && !selectedId}
        autoRotateSpeed={0.28}
      />
    </Canvas>
  );
}
