#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const apiDir = path.join(root, "public", "api");

mkdirSync(apiDir, { recursive: true });

function readJson(rel) {
  return JSON.parse(readFileSync(path.join(root, rel), "utf8"));
}

function writeJson(rel, value) {
  writeFileSync(path.join(root, rel), `${JSON.stringify(value, null, 2)}\n`);
}

const generatedAt = new Date().toISOString();
const graph = readJson("public/brain.json");
const books = readJson("public/books/books.manifest.json");
const bookNodeIds = new Set((books.books || []).map((book) => `book:${book.id}`));
const bookNodes = (graph.nodes || []).filter((node) => bookNodeIds.has(node.id));
const bookSectionNodes = (graph.nodes || []).filter(
  (node) => Array.isArray(node.tags) && node.tags.includes("book-map") && node.id.startsWith("book-section:"),
);
const assetNodes = (graph.nodes || []).filter(
  (node) => Array.isArray(node.tags) && node.tags.includes("asset") && node.id.startsWith("book-asset:"),
);

const bookApi = {
  generatedAt,
  source: "public/books/books.manifest.json",
  count: books.books.length,
  books: books.books.map((book) => ({
    ...book,
    graphNodeId: `book:${book.id}`,
    graphUrl: "api/brain.json",
    sectionCount: bookSectionNodes.filter((node) => node.id.startsWith(`book-section:${book.id}:`)).length,
    assetNodeIds: assetNodes.filter((node) => node.id.startsWith(`book-asset:${book.id}:`)).map((node) => node.id),
  })),
};

const summary = {
  generatedAt,
  graph: {
    name: graph.name,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    groups: [...new Set(graph.nodes.map((node) => node.group || "Knowledge"))].sort(),
  },
  books: {
    count: bookApi.count,
    nodeIds: bookNodes.map((node) => node.id),
    sectionNodeCount: bookSectionNodes.length,
    assetNodeCount: assetNodes.length,
  },
};

const index = {
  generatedAt,
  version: "1",
  license: "CC0-1.0",
  name: "Graphify Wiki Brain API",
  description: "Static JSON API for the public brain graph, full book manifest, and graph summary.",
  endpoints: [
    {
      path: "api/index.json",
      method: "GET",
      description: "API discovery document.",
    },
    {
      path: "api/brain.json",
      method: "GET",
      description: "Complete brain graph with nodes and edges.",
    },
    {
      path: "api/books.json",
      method: "GET",
      description: "Full public book manifest with asset metadata and graph node ids.",
    },
    {
      path: "api/summary.json",
      method: "GET",
      description: "Compact counts for graph and book resources.",
    },
  ],
};

writeJson("public/api/brain.json", { ...graph, source: { type: "json", path: "api/brain.json" } });
writeJson("public/api/books.json", bookApi);
writeJson("public/api/summary.json", summary);
writeJson("public/api/index.json", index);

console.log(`Built public API: ${summary.graph.nodeCount} nodes, ${summary.graph.edgeCount} edges, ${bookApi.count} books.`);
