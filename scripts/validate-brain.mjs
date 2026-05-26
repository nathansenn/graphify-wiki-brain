#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

const file = path.resolve(process.argv[2] || "public/brain.json");
const graph = JSON.parse(await readFile(file, "utf8"));
const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
const edges = Array.isArray(graph.edges) ? graph.edges : [];
const ids = new Set();
const errors = [];

if (!nodes.length) errors.push("nodes must be a non-empty array");

for (const [index, node] of nodes.entries()) {
  if (!node.id) errors.push(`node ${index} is missing id`);
  if (!node.label) errors.push(`node ${node.id || index} is missing label`);
  if (ids.has(node.id)) errors.push(`duplicate node id: ${node.id}`);
  ids.add(node.id);
}

for (const [index, edge] of edges.entries()) {
  if (!edge.source || !edge.target) {
    errors.push(`edge ${index} must include source and target`);
    continue;
  }
  if (!ids.has(edge.source)) errors.push(`edge ${index} source missing node: ${edge.source}`);
  if (!ids.has(edge.target)) errors.push(`edge ${index} target missing node: ${edge.target}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`valid brain graph: ${nodes.length} nodes, ${edges.length} edges`);
