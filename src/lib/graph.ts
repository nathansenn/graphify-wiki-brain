export type BrainNodeKind = "note" | "tag" | "cluster" | "source" | "concept" | "reference";

export interface BrainNode {
  id: string;
  label: string;
  group?: string;
  kind?: BrainNodeKind | string;
  path?: string;
  url?: string;
  summary?: string;
  tags?: string[];
  size?: number;
  weight?: number;
  color?: string;
  x?: number;
  y?: number;
  z?: number;
}

export interface BrainEdge {
  id?: string;
  source: string;
  target: string;
  label?: string;
  kind?: string;
  weight?: number;
}

export interface BrainGraph {
  name: string;
  generatedAt?: string;
  source?: {
    type: "sample" | "obsidian" | "graphify" | "json";
    path?: string;
  };
  nodes: BrainNode[];
  edges: BrainEdge[];
}

export interface PositionedBrainNode extends BrainNode {
  degree: number;
  radius: number;
  color: string;
  position: [number, number, number];
}

export interface PositionedBrainGraph {
  nodes: PositionedBrainNode[];
  edges: BrainEdge[];
  groups: string[];
}

const PALETTE = [
  "#f7b84b",
  "#40c9a2",
  "#5db7ff",
  "#ff6f91",
  "#b8f35a",
  "#f06bdc",
  "#6ee7f9",
  "#ff8a4c",
  "#a78bfa",
  "#f2e85c",
];

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function groupColor(group: string): string {
  return PALETTE[hashString(group) % PALETTE.length];
}

export function normalizeId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._:/#-]/g, "")
    .slice(0, 180);
}

export function sanitizeGraph(input: unknown, sourceName = "brain.json"): BrainGraph {
  const raw = input as Partial<BrainGraph> & {
    graph?: Partial<BrainGraph>;
    links?: BrainEdge[];
  };
  const candidate = raw.graph && Array.isArray(raw.graph.nodes) ? raw.graph : raw;
  const nodes = Array.isArray(candidate.nodes) ? candidate.nodes : [];
  const edges = Array.isArray(candidate.edges)
    ? candidate.edges
    : Array.isArray((candidate as { links?: BrainEdge[] }).links)
      ? (candidate as { links: BrainEdge[] }).links
      : [];

  const cleanNodes: BrainNode[] = [];
  const seen = new Set<string>();

  for (const rawNode of nodes as BrainNode[]) {
    const id = normalizeId(rawNode.id || rawNode.label || rawNode.path);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    cleanNodes.push({
      ...rawNode,
      id,
      label: String(rawNode.label || rawNode.id || "Untitled"),
      group: rawNode.group || rawNode.kind || "Knowledge",
      kind: rawNode.kind || "concept",
    });
  }

  const cleanEdges: BrainEdge[] = [];
  for (const rawEdge of edges as BrainEdge[]) {
    const source = normalizeId(rawEdge.source);
    const target = normalizeId(rawEdge.target);
    if (!source || !target || source === target) continue;
    cleanEdges.push({
      ...rawEdge,
      source,
      target,
      weight: Number.isFinite(rawEdge.weight) ? rawEdge.weight : 1,
    });
  }

  const nodeIds = new Set(cleanNodes.map((node) => node.id));
  const missingIds = new Set<string>();
  for (const edge of cleanEdges) {
    if (!nodeIds.has(edge.source)) missingIds.add(edge.source);
    if (!nodeIds.has(edge.target)) missingIds.add(edge.target);
  }

  for (const id of missingIds) {
    cleanNodes.push({
      id,
      label: id.replace(/^.*[:/]/, ""),
      group: "References",
      kind: "reference",
      summary: "Referenced by an edge but not present as a full node.",
    });
  }

  return {
    name: candidate.name || sourceName.replace(/\.[^.]+$/, ""),
    generatedAt: candidate.generatedAt,
    source: candidate.source || { type: "json", path: sourceName },
    nodes: cleanNodes,
    edges: cleanEdges,
  };
}

export function computeDegrees(graph: Pick<BrainGraph, "nodes" | "edges">): Map<string, number> {
  const degrees = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
  }
  return degrees;
}

export function layoutBrainGraph(graph: BrainGraph, visibleGroup = "all"): PositionedBrainGraph {
  const degrees = computeDegrees(graph);
  const groups = Array.from(new Set(graph.nodes.map((node) => node.group || "Knowledge"))).sort();
  const groupIndex = new Map(groups.map((group, index) => [group, index]));
  const groupCounts = new Map<string, number>();
  const filteredNodes =
    visibleGroup === "all"
      ? graph.nodes
      : graph.nodes.filter((node) => (node.group || "Knowledge") === visibleGroup);
  const filteredIds = new Set(filteredNodes.map((node) => node.id));

  const positionedNodes = filteredNodes
    .map((node): PositionedBrainNode => {
      const group = node.group || "Knowledge";
      const idx = groupIndex.get(group) ?? 0;
      const count = groupCounts.get(group) ?? 0;
      groupCounts.set(group, count + 1);

      const groupTheta = idx * GOLDEN_ANGLE;
      const groupPhi = Math.acos(1 - (2 * (idx + 0.5)) / Math.max(groups.length, 1));
      const anchorRadius = 18 + Math.min(groups.length, 10) * 1.35;
      const anchor: [number, number, number] = [
        anchorRadius * Math.sin(groupPhi) * Math.cos(groupTheta),
        anchorRadius * Math.cos(groupPhi),
        anchorRadius * Math.sin(groupPhi) * Math.sin(groupTheta),
      ];

      const localTheta = (count + 1) * GOLDEN_ANGLE;
      const localRadius = 2.4 + Math.sqrt(count + 1) * 1.7;
      const localZ = ((count % 9) - 4) * 0.8;
      const hasPosition = [node.x, node.y, node.z].every((coord) => Number.isFinite(coord));
      const degree = degrees.get(node.id) ?? 0;
      const weight = Math.max(Number(node.weight ?? node.size ?? 1), 1);
      const radius = Math.min(1.95, 0.34 + Math.sqrt(degree + weight) * 0.16);

      const position: [number, number, number] = hasPosition
        ? [Number(node.x) * 0.18, Number(node.y) * 0.18, Number(node.z) * 0.18]
        : [
            anchor[0] + Math.cos(localTheta) * localRadius,
            anchor[1] + Math.sin(localTheta * 0.7) * localRadius * 0.45 + localZ,
            anchor[2] + Math.sin(localTheta) * localRadius,
          ];

      return {
        ...node,
        degree,
        radius,
        color: node.color || groupColor(group),
        position,
        label: node.label || node.id,
        group,
      };
    })
    .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label));

  return {
    nodes: positionedNodes,
    edges: graph.edges.filter((edge) => filteredIds.has(edge.source) && filteredIds.has(edge.target)),
    groups,
  };
}

export function describeNumber(value: number): string {
  return new Intl.NumberFormat("en", { notation: value > 9999 ? "compact" : "standard" }).format(value);
}
