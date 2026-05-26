#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [inputArg, outputArg = "public/brain.json"] = process.argv.slice(2);

if (!inputArg) {
  console.error("Usage: npm run import:graphify -- /path/to/graph.json [public/brain.json]");
  process.exit(1);
}

const inputPath = path.resolve(inputArg);
const outputPath = path.resolve(outputArg);
const input = JSON.parse(await readFile(inputPath, "utf8"));

function pickContainer(value) {
  if (Array.isArray(value?.nodes) || Array.isArray(value?.edges) || Array.isArray(value?.links)) return value;
  if (value?.graph) return pickContainer(value.graph);
  if (value?.data) return pickContainer(value.data);
  return value;
}

function values(collection) {
  if (Array.isArray(collection)) return collection;
  if (collection && typeof collection === "object") return Object.values(collection);
  return [];
}

function primitiveId(value) {
  if (value && typeof value === "object") return value.id || value.key || value.name || value.label || value.path;
  return value;
}

function normalizeId(value) {
  return String(primitiveId(value) ?? "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._:/#-]/g, "")
    .slice(0, 180);
}

function normalizeNode(raw, index) {
  const props = raw.properties && typeof raw.properties === "object" ? raw.properties : {};
  const id = normalizeId(raw.id || raw.key || raw.path || raw.name || raw.label || `node-${index}`);
  return {
    id,
    label: String(raw.label || raw.name || raw.title || props.label || props.name || id),
    group: String(raw.group || raw.cluster || raw.category || raw.type || props.group || props.cluster || "Graphify"),
    kind: String(raw.kind || raw.type || props.kind || "concept"),
    path: raw.path || raw.file || props.path || props.file,
    summary: raw.summary || raw.description || raw.text || props.summary || props.description,
    url: raw.url || props.url,
    weight: Number(raw.weight || raw.size || raw.degree || props.weight || 1),
    x: Number.isFinite(raw.x) ? raw.x : Number.isFinite(raw.posX) ? raw.posX : undefined,
    y: Number.isFinite(raw.y) ? raw.y : Number.isFinite(raw.posY) ? raw.posY : undefined,
    z: Number.isFinite(raw.z) ? raw.z : Number.isFinite(raw.posZ) ? raw.posZ : undefined,
  };
}

function normalizeEdge(raw, index) {
  const source = normalizeId(raw.source || raw.sourceId || raw.from || raw.start || raw.src);
  const target = normalizeId(raw.target || raw.targetId || raw.to || raw.end || raw.dst);
  if (!source || !target || source === target) return null;
  return {
    id: raw.id || `edge-${index}`,
    source,
    target,
    label: raw.label || raw.relationship || raw.type || raw.kind,
    kind: raw.kind || raw.type || raw.relationship,
    weight: Number(raw.weight || raw.value || raw.strength || 1),
  };
}

const container = pickContainer(input);
const rawNodes = values(container.nodes || container.vertices || container.items);
const rawEdges = values(container.edges || container.links || container.relationships);
const seen = new Set();
const nodes = [];

for (const [index, raw] of rawNodes.entries()) {
  const node = normalizeNode(raw, index);
  if (!node.id || seen.has(node.id)) continue;
  seen.add(node.id);
  nodes.push(node);
}

const edges = rawEdges.map(normalizeEdge).filter(Boolean);
for (const edge of edges) {
  for (const id of [edge.source, edge.target]) {
    if (seen.has(id)) continue;
    seen.add(id);
    nodes.push({
      id,
      label: id.replace(/^.*[:/]/, ""),
      group: "References",
      kind: "reference",
      summary: "Referenced by an edge but not present as a full graphify node.",
    });
  }
}

const graph = {
  name: input.name || input.title || `${path.basename(inputPath, path.extname(inputPath))} Brain`,
  generatedAt: new Date().toISOString(),
  source: { type: "graphify", path: inputPath },
  nodes,
  edges,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(graph, null, 2)}\n`);
console.log(`wrote ${outputPath}: ${nodes.length} nodes, ${edges.length} edges`);
