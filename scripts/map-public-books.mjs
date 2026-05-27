#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const books = [
  {
    id: "pattern-of-mind-full",
    graphId: "book:pattern-of-mind-full",
    title: "The Pattern of Mind: Full Book",
    shortTitle: "Pattern of Mind",
    group: "Full Books",
    mainUrl: "books/pattern-of-mind/The-Pattern-of-Mind-BOOK.html",
    summary: "Full HTML book for the Pattern of Mind cognitive architecture, mapped into section and chapter nodes.",
    tags: ["full-book", "pattern-of-mind", "cognitive-architecture"],
    structure: "html-headings",
    conceptTargets: ["pattern-of-mind", "11-stage-cognitive-pipeline", "verification-chain", "logic-engine"],
    assets: [
      {
        role: "full-html",
        format: "html",
        path: "public/books/pattern-of-mind/The-Pattern-of-Mind-BOOK.html",
        url: "books/pattern-of-mind/The-Pattern-of-Mind-BOOK.html",
      },
    ],
  },
  {
    id: "the-witness",
    graphId: "book:the-witness",
    title: "The Witness",
    shortTitle: "The Witness",
    group: "Full Books",
    mainUrl: "books/the-witness/the-witness.html",
    summary: "Full HTML book connecting the safety question, correctability, and the body of work around the mind architecture.",
    tags: ["full-book", "witness", "safety", "correctability"],
    structure: "html-headings",
    conceptTargets: ["pattern-of-mind", "state-of-mind", "guardian-vs-performer"],
    assets: [
      {
        role: "full-html",
        format: "html",
        path: "public/books/the-witness/the-witness.html",
        url: "books/the-witness/the-witness.html",
      },
    ],
  },
  {
    id: "the-examined-mind",
    graphId: "book:the-examined-mind",
    title: "The Examined Mind",
    shortTitle: "Examined Mind",
    group: "Full Books",
    mainUrl: "books/the-examined-mind/The_Examined_Mind.docx",
    readerUrl: "books/the-examined-mind/the-examined-mind.html",
    summary: "Full DOCX manual for proper thinking, with generated TXT and HTML reader copies for public browsing.",
    tags: ["full-book", "examined-mind", "proper-thinking", "cognitive-faculties"],
    structure: "examined-html-bold",
    conceptTargets: ["thinking-defined", "cognitive-faculties", "metacognition", "verification-chain"],
    assets: [
      {
        role: "original-docx",
        format: "docx",
        path: "public/books/the-examined-mind/The_Examined_Mind.docx",
        url: "books/the-examined-mind/The_Examined_Mind.docx",
      },
      {
        role: "reader-html",
        format: "html",
        path: "public/books/the-examined-mind/the-examined-mind.html",
        url: "books/the-examined-mind/the-examined-mind.html",
      },
      {
        role: "reader-text",
        format: "txt",
        path: "public/books/the-examined-mind/the-examined-mind.txt",
        url: "books/the-examined-mind/the-examined-mind.txt",
      },
    ],
  },
];

const stageTargets = [
  ["stage 1", "stage-receive"],
  ["receive", "stage-receive"],
  ["stage 2", "stage-decompose"],
  ["decompose", "stage-decompose"],
  ["stage 3", "stage-classify"],
  ["classify", "stage-classify"],
  ["stage 4", "stage-scope"],
  ["scope", "stage-scope"],
  ["stage 5", "stage-retrieve"],
  ["retrieve", "stage-retrieve"],
  ["stage 6", "stage-reason"],
  ["reason", "stage-reason"],
  ["stage 7", "stage-verify"],
  ["verify", "stage-verify"],
  ["stage 8", "stage-synthesize"],
  ["synthesize", "stage-synthesize"],
  ["stage 9", "stage-evaluate"],
  ["evaluate", "stage-evaluate"],
  ["stage 10", "stage-communicate"],
  ["communicate", "stage-communicate"],
  ["stage 11", "stage-reflect"],
  ["reflect", "stage-reflect"],
];

const conceptMatchers = [
  [/reward machine|reward optimization|rlhf/i, "reward-optimization-critique"],
  [/what the reward model did not learn/i, "reward-model-not-learned"],
  [/sycophancy/i, "reward-optimization-critique"],
  [/hallucination/i, "what-needs-to-change"],
  [/soullessness|soul/i, "soul-architecture"],
  [/scaling fallacy|bigger models/i, "scaling-fallacy"],
  [/what is thinking|thinking defined/i, "thinking-defined"],
  [/pattern matching/i, "pattern-matching-vs-thinking"],
  [/faculties|architecture of mind|43\+ faculties/i, "cognitive-faculties"],
  [/one right answer/i, "one-right-answer"],
  [/eleven stages|cognitive pipeline|flow of proper thinking/i, "11-stage-cognitive-pipeline"],
  [/success criteria/i, "success-criteria"],
  [/fallacy|logical error|anatomy of error/i, "fallacy-detection"],
  [/verification battery|verification and validation/i, "verification-battery"],
  [/verification chain|5-level verification/i, "verification-chain"],
  [/logic engine|inference rule|deductive/i, "logic-engine"],
  [/certainty spectrum|confidence calibration|calibrated confidence/i, "certainty-spectrum"],
  [/intuition|fast thinking|system 1/i, "role-of-intuition"],
  [/world model/i, "world-models"],
  [/guardian|performer/i, "guardian-vs-performer"],
  [/prompt template|cognitive prompt/i, "complete-prompt-template"],
  [/rlvr|verifiable rewards/i, "rlvr-methodology"],
  [/process reward/i, "process-reward-models"],
  [/first-order logic|fol/i, "fol-training-signal"],
  [/distillation/i, "reasoning-distillation"],
  [/neurosymbolic|intuition-verification/i, "neurosymbolic-pattern"],
  [/correct metrics|metrics/i, "correctness-metrics"],
  [/deepseek/i, "deepseek-r1-validation"],
  [/alphaproof|alphageometry/i, "alphaproof-validation"],
  [/sap/i, "sap-validation"],
  [/gary marcus|marcus/i, "gary-marcus-critique"],
  [/ordered light|state of mind/i, "ordered-light-framework"],
  [/metacognition|self-observation|observer/i, "metacognition"],
  [/processing time|when speed is appropriate|speed/i, "processing-time-principle"],
  [/diligence protocol|stress-tested|checked my reasoning/i, "verification-failure-protocol"],
];

function relPath(absOrRel) {
  return path.join(root, absOrRel);
}

function fileMeta(asset) {
  const absolute = relPath(asset.path);
  if (!existsSync(absolute)) {
    throw new Error(`Missing book asset: ${asset.path}`);
  }
  const bytes = readFileSync(absolute);
  return {
    ...asset,
    bytes: statSync(absolute).size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&mdash;/g, "--")
    .replace(/&ndash;/g, "-")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function plainText(html) {
  return decodeHtml(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 86);
}

function extractHtmlHeadings(file) {
  const html = readFileSync(file, "utf8");
  const headings = [];
  for (const match of html.matchAll(/<h([1-3])([^>]*)>([\s\S]*?)<\/h\1>/gi)) {
    const text = plainText(match[3]);
    if (!text || /^[-]+$/.test(text)) continue;
    const id = match[2].match(/\bid=["']([^"']+)["']/i)?.[1];
    headings.push({
      level: Number(match[1]),
      text,
      anchor: id ? `#${id}` : "",
    });
  }
  return dedupeHeadings(headings);
}

function extractExaminedHeadings(file) {
  const html = readFileSync(file, "utf8");
  const headings = [];
  for (const match of html.matchAll(/<p[^>]*>\s*<b>([\s\S]*?)<\/b>\s*<\/p>/gi)) {
    const text = plainText(match[1]);
    if (!text || text === "Table of Contents" || text === "THE EXAMINED MIND" && headings.length > 0) continue;
    let level = 3;
    if (text === "THE EXAMINED MIND" || /^PART [IVX]+:/i.test(text)) level = 1;
    if (/^Chapter \d+:/i.test(text)) level = 2;
    headings.push({ level, text, anchor: "" });
  }
  return dedupeHeadings(headings);
}

function dedupeHeadings(headings) {
  const seen = new Set();
  return headings.filter((heading) => {
    const key = `${heading.level}:${heading.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractHeadings(book) {
  const primary = book.assets.find((asset) => asset.format === "html");
  if (!primary) return [];
  const file = relPath(primary.path);
  return book.structure === "examined-html-bold" ? extractExaminedHeadings(file) : extractHtmlHeadings(file);
}

function addNode(nodes, node) {
  if (nodes.has(node.id)) {
    nodes.set(node.id, { ...nodes.get(node.id), ...node });
  } else {
    nodes.set(node.id, node);
  }
}

function addEdge(edges, source, target, label, weight = 2) {
  if (!source || !target || source === target) return;
  const key = `${source}::${target}::${label}`;
  if (!edges.has(key)) edges.set(key, { source, target, label, weight });
}

function conceptTargetsFor(text) {
  const found = new Set();
  for (const [needle, target] of stageTargets) {
    if (text.toLowerCase().includes(needle)) found.add(target);
  }
  for (const [pattern, target] of conceptMatchers) {
    if (pattern.test(text)) found.add(target);
  }
  return [...found];
}

function graphUrl(book, heading) {
  const base = book.readerUrl || book.mainUrl;
  return `${base}${heading.anchor || ""}`;
}

const manifest = {
  generatedAt: new Date().toISOString(),
  license: "CC0-1.0",
  note: "Full public book artifacts provided for this repo. Original files are preserved alongside any generated reader copies.",
  books: books.map((book) => ({
    id: book.id,
    title: book.title,
    shortTitle: book.shortTitle,
    mainUrl: book.mainUrl,
    readerUrl: book.readerUrl,
    summary: book.summary,
    tags: book.tags,
    assets: book.assets.map(fileMeta),
  })),
};

writeFileSync(path.join(root, "public", "books", "books.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const graphPath = path.join(root, "public", "brain.json");
const graph = JSON.parse(readFileSync(graphPath, "utf8"));
const generatedNode = (node) =>
  Array.isArray(node.tags) && (node.tags.includes("full-book") || node.tags.includes("book-map"));
const generatedIds = new Set((graph.nodes || []).filter(generatedNode).map((node) => node.id));

const retainedNodes = (graph.nodes || []).filter((node) => !generatedIds.has(node.id));
const retainedEdges = (graph.edges || []).filter((edge) => !generatedIds.has(edge.source) && !generatedIds.has(edge.target));
const nodes = new Map(retainedNodes.map((node) => [node.id, node]));
const edges = new Map(retainedEdges.map((edge) => [`${edge.source}::${edge.target}::${edge.label || ""}`, edge]));
const existingIds = new Set(nodes.keys());

addNode(nodes, {
  id: "books-manifest",
  label: "Full Book Manifest",
  group: "Full Books",
  kind: "source",
  summary: "Manifest of full public book copies and generated reader assets.",
  url: "books/books.manifest.json",
  weight: 8,
  tags: ["book-map", "full-book", "manifest"],
});
addEdge(edges, "home", "books-manifest", "publishes", 3);
if (existingIds.has("public-domain-package")) addEdge(edges, "public-domain-package", "books-manifest", "extends", 2);

for (const book of books) {
  const nodeUrl = book.readerUrl || book.mainUrl;
  addNode(nodes, {
    id: book.graphId,
    label: book.title,
    group: book.group,
    kind: "document",
    summary: book.summary,
    url: nodeUrl,
    weight: 10,
    tags: [...book.tags, "book-map", "public"],
  });
  addEdge(edges, "books-manifest", book.graphId, "lists", 3);
  addEdge(edges, "home", book.graphId, "publishes", 2);
  for (const target of book.conceptTargets || []) {
    if (nodes.has(target)) addEdge(edges, book.graphId, target, "grounds", 3);
  }
  for (const asset of book.assets) {
    const assetId = `book-asset:${book.id}:${slugify(asset.role)}`;
    const assetLabel = `${book.shortTitle} ${asset.role.replace(/-/g, " ")}`;
    addNode(nodes, {
      id: assetId,
      label: assetLabel,
      group: "Full Book Assets",
      kind: "reference",
      summary: `${asset.format.toUpperCase()} asset for ${book.title}.`,
      url: asset.url,
      weight: asset.role.startsWith("original") || asset.role.startsWith("full") ? 7 : 5,
      tags: ["book-map", "full-book", book.id, "asset", asset.format],
    });
    addEdge(edges, book.graphId, assetId, "has asset", 2);
  }

  const headings = extractHeadings(book);
  const stack = [];
  let headingIndex = 0;
  for (const heading of headings) {
    headingIndex += 1;
    const id = `book-section:${book.id}:${String(headingIndex).padStart(3, "0")}-${slugify(heading.text)}`;
    addNode(nodes, {
      id,
      label: heading.text,
      group: `${book.shortTitle} Structure`,
      kind: "reference",
      summary: `Section heading from ${book.title}.`,
      url: graphUrl(book, heading),
      weight: heading.level === 1 ? 7 : heading.level === 2 ? 5 : 3,
      tags: ["book-map", "full-book", book.id, `h${heading.level}`],
    });

    const parent = stack.slice(0, heading.level - 1).reverse().find(Boolean);
    addEdge(edges, parent || book.graphId, id, parent ? "contains" : "opens", heading.level === 1 ? 3 : 2);
    stack[heading.level - 1] = id;
    stack.length = heading.level;

    for (const target of conceptTargetsFor(heading.text)) {
      if (nodes.has(target)) addEdge(edges, id, target, "maps to", 2);
    }
  }
}

const updatedGraph = {
  ...graph,
  generatedAt: manifest.generatedAt,
  nodes: [...nodes.values()],
  edges: [...edges.values()],
};

writeFileSync(graphPath, `${JSON.stringify(updatedGraph, null, 2)}\n`);
writeFileSync(
  path.join(root, "src", "data", "sampleBrain.ts"),
  `import type { BrainGraph } from "../lib/graph";\n\nexport const sampleBrain: BrainGraph = ${JSON.stringify(
    { ...updatedGraph, source: { type: "sample", path: "public/brain.json" } },
    null,
    2,
  )};\n`,
);

execFileSync(process.execPath, [path.join(root, "scripts", "build-public-api.mjs")], { stdio: "inherit" });

console.log(`Mapped ${books.length} full books into ${updatedGraph.nodes.length} nodes and ${updatedGraph.edges.length} edges.`);
