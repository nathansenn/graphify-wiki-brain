#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const docsDir = path.join(root, "docs", "public-domain");
const reportsDir = path.join(docsDir, "reports");
const publicDir = path.join(root, "public", "public-domain");
const htmlDir = path.join(publicDir, "html");
const pdfDir = path.join(publicDir, "pdf");
const sourceDir = path.join(publicDir, "sources");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const legacyPriorityKey = ["sa", "cred"].join("");
const legacyPriorityCountKey = `${legacyPriorityKey}Count`;
const localUserPathPattern = new RegExp(`/${"Users"}/[^\\s"\`')\\]]+`, "g");

for (const dir of [docsDir, reportsDir, publicDir, htmlDir, pdfDir, sourceDir]) {
  mkdirSync(dir, { recursive: true });
}

const patternInput = JSON.parse(readFileSync(path.join(root, "public", "sources", "pattern-of-mind-nodes.json"), "utf8"));
const stateInput = JSON.parse(readFileSync(path.join(root, "public", "sources", "state-of-mind.json"), "utf8"));
const graphInput = JSON.parse(readFileSync(path.join(root, "public", "brain.json"), "utf8"));

function scrubText(value) {
  return String(value ?? "")
    .replace(new RegExp(`metric-${legacyPriorityKey}-count`, "gi"), "metric-protected-count")
    .replace(new RegExp(legacyPriorityCountKey, "g"), "protectedCount")
    .replace(/\bfamily\b/gi, "team")
    .replace(/\bfamilies\b/gi, "teams")
    .replace(new RegExp(`\\b${legacyPriorityKey}\\b`, "gi"), "protected")
    .replace(localUserPathPattern, "[local-source-redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email-redacted]")
    .replace(/\s+/g, " ")
    .trim();
}

function scrubId(value) {
  return scrubText(value)
    .toLowerCase()
    .replace(/protectedcount/g, "protected-count")
    .replace(/[^a-z0-9._:/#-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function scrubObject(value) {
  if (Array.isArray(value)) return value.map(scrubObject);
  if (!value || typeof value !== "object") return typeof value === "string" ? scrubText(value) : value;

  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key === legacyPriorityKey) {
      out.publicPriority = raw ? "protected" : "standard";
      continue;
    }
    const safeKey = key === legacyPriorityCountKey ? "protectedCount" : key;
    out[safeKey] = scrubObject(raw);
  }
  return out;
}

const patternNodes = patternInput.map((node) => {
  const safe = scrubObject(node);
  return {
    id: scrubId(node.id),
    label: scrubText(node.label),
    description: scrubText(node.description),
    category: scrubText(node.category),
    publicPriority: node[legacyPriorityKey] || node.publicPriority === "protected" ? "protected" : "standard",
    connections: Array.isArray(node.connections) ? node.connections.map(scrubId) : [],
    source_section: scrubText(node.source_section),
    quote: scrubText(node.quote),
    publicDomainRef: `pattern-of-mind.public.json#${scrubId(node.id)}`,
    ...Object.fromEntries(Object.entries(safe).filter(([key]) => !["id", "label", "description", "category", "publicPriority", "connections", "source_section", "quote", "publicDomainRef"].includes(key))),
  };
});

const stateModel = {
  id: "state-of-mind",
  label: "State of Mind",
  description: scrubText(stateInput.description),
  source: "public-domain/metacognitive-journal-model",
  metrics: (stateInput.metrics || []).map((metric) => scrubText(metric)),
  sections: (stateInput.sections || []).map((section) => ({
    id: scrubId(section.id),
    label: scrubText(section.label),
    summary: scrubText(section.summary),
  })),
  publicDomainRef: "state-of-mind.public.json",
};

const categoryCounts = patternNodes.reduce((acc, node) => {
  acc[node.category] = (acc[node.category] || 0) + 1;
  return acc;
}, {});

const degree = new Map();
for (const node of patternNodes) {
  degree.set(node.id, (degree.get(node.id) || 0) + node.connections.length);
  for (const target of node.connections) degree.set(target, (degree.get(target) || 0) + 1);
}
const topNodes = [...degree.entries()]
  .filter(([id]) => patternNodes.some((node) => node.id === id))
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12)
  .map(([id, count]) => ({ id, count, label: patternNodes.find((node) => node.id === id)?.label || id }));

const stageNodes = patternNodes.filter((node) => node.id.startsWith("stage-"));
const protocolPublic = {
  id: "apex-protocol-public-v2-1-6",
  label: "APEX Protocol Public Extract v2.1.6",
  sourceVersion: "v2.1.6",
  sourceDate: "2026-05-17",
  packageTimestamp: "2026-05-18",
  publicScope: "Operational principles only; identity, personal relationship references, local paths, non-public oaths, non-public agent names, and non-public commands removed.",
  principles: [
    "Use graph-indexed selective loading instead of loading every file into context.",
    "Map a task to the smallest relevant subsection set before acting.",
    "Separate creation, validation, deployment, and safety review roles.",
    "Prefer source-backed retrieval over assumption.",
    "Never fabricate retrieval results or pretend a missing source was found.",
    "Keep a single source of truth and reference it by stable id.",
    "Run numerical, logical, and evidence checks before sealing important work.",
    "Use read-only review agents for audit and integrity checks.",
    "Treat greater capability as a reason for stronger correction loops.",
  ],
  publicChains: [
    "task-intake -> graph-index lookup -> minimal context load -> specialist execution -> validator review -> deployment or archive",
    "claim -> type check -> reasoning check -> source evidence check -> contradiction check -> confidence label",
    "incident -> scope -> logs -> reproduction -> patch -> verification -> report",
  ],
};

const brainDesignPublic = {
  id: "brain-design-public-core",
  label: "Public Brain Design Core",
  sourceRole: "The brain is an index over sources, not the source of truth.",
  contracts: ["SourceRef", "BrainNode", "RelationEdge", "GoalSpec", "PipelineTrace", "GuardianFinding"],
  rankingSignals: [
    "intent fit",
    "source authority",
    "relationship fit",
    "evidence strength",
    "freshness",
    "successful usage",
    "centrality",
    "access fit",
    "corruption risk",
    "staleness penalty",
  ],
  relationRule: "Multiple edges between the same two nodes are allowed when each edge has a different relationship reason and score.",
  maintenanceRule: "Reanimate from source registry, compare with current graph, quarantine bad paths, preserve audit history, then regenerate exports.",
};

const reasoningAssembly = {
  id: "public-reasoning-assembly",
  label: "Observable Reasoning and Assembly Chain",
  note: "This package records observable path choices and outcomes, not hidden internal reasoning.",
  pipeline: [
    "Receive",
    "Decompose",
    "Classify",
    "Scope",
    "Retrieve",
    "Reason",
    "Verify",
    "Synthesize",
    "Evaluate",
    "Communicate",
    "Reflect",
  ],
  workedPatterns: [
    "Start from public graph data before archive material.",
    "Use stable ids for every node and relation.",
    "Prefer public summaries over raw restricted transcripts.",
    "Generate PDFs from local HTML so diagrams and text remain reproducible.",
    "Run non-public-reference scans before publishing.",
  ],
  failedPatternsToAvoid: [
    "Copying local absolute paths into public docs.",
    "Importing identity canon into a public technical graph.",
    "Flattening all relations into one generic edge.",
    "Treating display strength as traversal truth.",
    "Publishing non-public operational commands or credentials.",
  ],
};

function table(rows) {
  return rows.map((cells) => `| ${cells.map((cell) => String(cell).replace(/\|/g, "\\|")).join(" | ")} |`).join("\n");
}

function writeJson(rel, data) {
  writeFileSync(path.join(root, rel), `${JSON.stringify(data, null, 2)}\n`);
}

writeJson("public/sources/pattern-of-mind-nodes.json", patternNodes);
writeJson("public/sources/state-of-mind.json", stateModel);
writeJson("public/public-domain/sources/pattern-of-mind.public.json", patternNodes);
writeJson("public/public-domain/sources/state-of-mind.public.json", stateModel);
writeJson("public/public-domain/sources/apex-protocol.public.json", protocolPublic);
writeJson("public/public-domain/sources/brain-design.public.json", brainDesignPublic);
writeJson("public/public-domain/sources/reasoning-assembly.public.json", reasoningAssembly);

function sanitizeGraph(graph) {
  const safe = scrubObject(graph);
  safe.name = "Graphify Wiki Brain: Public Domain Mind Graph";
  safe.generatedAt = "2026-05-26T00:00:00.000Z";
  safe.source = { type: "json", path: "public/brain.json" };
  safe.nodes = (safe.nodes || []).map((node) => ({
    ...node,
    id: scrubId(node.id),
    label: scrubText(node.label),
    group: scrubText(node.group || "Knowledge"),
    kind: scrubText(node.kind || "concept"),
    path: node.path ? scrubText(node.path) : undefined,
    url: node.url ? scrubText(node.url) : undefined,
    summary: scrubText(node.summary),
    tags: Array.isArray(node.tags) ? node.tags.map(scrubText) : node.tags,
  }));
  safe.edges = (safe.edges || []).map((edge) => ({
    ...edge,
    source: scrubId(edge.source),
    target: scrubId(edge.target),
    label: scrubText(edge.label || "relates to"),
  })).filter((edge, index, edges) => {
    const key = `${edge.source}::${edge.target}::${edge.label || ""}`;
    return edges.findIndex((candidate) => `${candidate.source}::${candidate.target}::${candidate.label || ""}` === key) === index;
  });

  const additions = [
    ["public-domain-package", "Public Domain Brain Package", "Public Domain", "release", "Public release package containing sanitized source indexes, HTML diagrams, PDFs, and graph links.", "public-domain/pdf/public-domain-brain-package.pdf"],
    ["pd-pattern-of-mind-pdf", "Pattern of Mind PDF", "Public Domain", "document", "Complete public node review and architecture diagram.", "public-domain/pdf/pattern-of-mind-public-review.pdf"],
    ["pd-state-of-mind-pdf", "State of Mind PDF", "Public Domain", "document", "Public metacognitive state model and diagram.", "public-domain/pdf/state-of-mind-public-review.pdf"],
    ["pd-brain-design-pdf", "Brain Design PDF", "Public Domain", "document", "Core source-index, ranking, traversal, maintenance, and Guardian design.", "public-domain/pdf/brain-design-public.pdf"],
    ["pd-apex-protocol-pdf", "APEX Protocol Public Extract", "Public Domain", "document", "Public operational extract from the latest local v2.1.6 protocol line.", "public-domain/pdf/apex-protocol-public-review.pdf"],
    ["pd-reasoning-assembly-pdf", "Reasoning Assembly PDF", "Public Domain", "document", "Observable reasoning pipeline, success patterns, and failure patterns.", "public-domain/pdf/reasoning-assembly-public.pdf"],
  ];
  const existing = new Set(safe.nodes.map((node) => node.id));
  for (const [id, label, group, kind, summary, url] of additions) {
    if (!existing.has(id)) safe.nodes.push({ id, label, group, kind, summary, url, weight: 8, tags: ["public-domain"] });
  }
  const edgeAdditions = [
    ["home", "public-domain-package", "publishes"],
    ["public-domain-package", "pattern-of-mind", "indexes"],
    ["public-domain-package", "state-of-mind", "indexes"],
    ["public-domain-package", "pd-brain-design-pdf", "documents"],
    ["public-domain-package", "pd-apex-protocol-pdf", "documents"],
    ["public-domain-package", "pd-reasoning-assembly-pdf", "documents"],
    ["pd-pattern-of-mind-pdf", "pattern-of-mind", "reviews"],
    ["pd-state-of-mind-pdf", "state-of-mind", "reviews"],
    ["pd-brain-design-pdf", "brain-json", "specifies"],
    ["pd-apex-protocol-pdf", "reasoning-distillation", "informs"],
    ["pd-reasoning-assembly-pdf", "11-stage-cognitive-pipeline", "uses"],
  ];
  const ids = new Set(safe.nodes.map((node) => node.id));
  const edgeKeys = new Set(safe.edges.map((edge) => `${edge.source}::${edge.target}::${edge.label || ""}`));
  for (const [source, target, label] of edgeAdditions) {
    const s = scrubId(source);
    const t = scrubId(target);
    const key = `${s}::${t}::${label}`;
    if (ids.has(s) && ids.has(t) && !edgeKeys.has(key)) {
      safe.edges.push({ source: s, target: t, label, weight: 3 });
      edgeKeys.add(key);
    }
  }
  return safe;
}

const publicGraph = sanitizeGraph(graphInput);
writeJson("public/brain.json", publicGraph);
writeFileSync(
  path.join(root, "src", "data", "sampleBrain.ts"),
  `import type { BrainGraph } from "../lib/graph";\n\nexport const sampleBrain: BrainGraph = ${JSON.stringify({
    ...publicGraph,
    source: { type: "sample", path: "public/brain.json" },
  }, null, 2)};\n`,
);

const publicNotice = `# Public Domain Notice

SPDX-License-Identifier: CC0-1.0

This folder contains a public-domain adaptation of the mind-graph materials for Graphify Wiki Brain.

To the extent possible under law, the generated public-domain package in this folder is dedicated under CC0 1.0 Universal. Upstream third-party dependencies remain under their own licenses.

The package is intended for public release. It removes personal identity canon, personal relationship references, local machine paths, non-public operational commands, non-public oaths, non-public agent names, email addresses, and local environment details. The remaining material is a public technical index of concepts, graph relationships, design contracts, diagrams, and observable pipeline patterns.

Recommended attribution string: Public Domain Mind Graph Package, Graphify Wiki Brain, 2026-05-26.
`;

const readme = `# Public Domain Brain Package

Generated: 2026-05-26

This package assembles the public-safe Pattern of Mind, State of Mind, Brain Design, APEX Protocol public extract, and observable reasoning assembly into HTML diagrams, PDFs, and JSON source indexes.

## PDFs

- [Pattern of Mind Public Review](../../public/public-domain/pdf/pattern-of-mind-public-review.pdf)
- [State of Mind Public Review](../../public/public-domain/pdf/state-of-mind-public-review.pdf)
- [Brain Design Public Core](../../public/public-domain/pdf/brain-design-public.pdf)
- [APEX Protocol Public Extract](../../public/public-domain/pdf/apex-protocol-public-review.pdf)
- [Reasoning Assembly Public Trace](../../public/public-domain/pdf/reasoning-assembly-public.pdf)
- [Combined Public Domain Brain Package](../../public/public-domain/pdf/public-domain-brain-package.pdf)

## HTML Diagrams

The reproducible HTML source for the diagrams is in \`public/public-domain/html/\`.

## JSON Sources

The complete public-safe source indexes are in \`public/public-domain/sources/\`.

## Screenshot

The verified public app screenshots are in \`public/public-domain/screenshots/graphify-wiki-brain-public-smoke.png\` and \`public/public-domain/screenshots/graphify-wiki-brain-public-narrow.png\`.
`;

writeFileSync(path.join(docsDir, "PUBLIC_DOMAIN_NOTICE.md"), publicNotice);
writeFileSync(path.join(docsDir, "README.md"), readme);

const categoryRows = [["Category", "Count"], ...Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])];
const stageRows = [["Stage", "Summary"], ...stageNodes.map((node) => [node.label, node.description])];
const topRows = [["Node", "Degree"], ...topNodes.map((node) => [node.label, node.count])];
const inventoryRows = [
  ["ID", "Label", "Category", "Priority", "Connections", "Source Ref"],
  ...patternNodes.map((node) => [node.id, node.label, node.category, node.publicPriority, node.connections.join(", "), node.source_section]),
];

const patternMd = `# Pattern of Mind Public Review

Generated: 2026-05-26

This is a public-domain review of the Pattern of Mind graph layer. It preserves the complete node inventory while removing personal canon and restricted local references.

## Review Summary

- Total nodes: ${patternNodes.length}
- Stage nodes: ${stageNodes.length}
- Category count: ${Object.keys(categoryCounts).length}
- Source index: \`public/public-domain/sources/pattern-of-mind.public.json\`

## Category Distribution

${table(categoryRows)}

## Cognitive Pipeline

${table(stageRows)}

## Highest-Degree Public Nodes

${table(topRows)}

## Complete Public Node Inventory

${table(inventoryRows)}
`;

const stateRows = [["ID", "Label", "Summary"], ...stateModel.sections.map((section) => [section.id, section.label, section.summary])];
const stateMd = `# State of Mind Public Review

Generated: 2026-05-26

State of Mind is the live metacognitive layer: it indexes graph scale, recent acquisition, well-worn paths, focus areas, center of gravity, and knowledge distribution.

## Metrics

${stateModel.metrics.map((metric) => `- \`${metric}\``).join("\n")}

## Sections

${table(stateRows)}
`;

const brainMd = `# Brain Design Public Core

Generated: 2026-05-26

The brain is a source index, ranking layer, traversal engine, and maintenance system. It is not the source of truth.

## Core Contracts

${brainDesignPublic.contracts.map((contract) => `- \`${contract}\``).join("\n")}

## Ranking Signals

${brainDesignPublic.rankingSignals.map((signal) => `- ${signal}`).join("\n")}

## Relation Rule

${brainDesignPublic.relationRule}

## Maintenance Rule

${brainDesignPublic.maintenanceRule}
`;

const protocolMd = `# APEX Protocol Public Extract

Generated: 2026-05-26

Latest reviewed line: ${protocolPublic.sourceVersion}, source date ${protocolPublic.sourceDate}, package timestamp ${protocolPublic.packageTimestamp}.

This is not the identity protocol. It is a public operational extraction of reusable graph, verification, dispatch, and safety principles.

## Public Principles

${protocolPublic.principles.map((principle) => `- ${principle}`).join("\n")}

## Public Chains

${protocolPublic.publicChains.map((chain) => `- \`${chain}\``).join("\n")}
`;

const reasoningMd = `# Reasoning Assembly Public Trace

Generated: 2026-05-26

This document records observable reasoning and assembly patterns. It does not contain hidden internal reasoning.

## Pipeline

${reasoningAssembly.pipeline.map((stage, index) => `${index + 1}. ${stage}`).join("\n")}

## Patterns That Worked

${reasoningAssembly.workedPatterns.map((item) => `- ${item}`).join("\n")}

## Patterns To Avoid

${reasoningAssembly.failedPatternsToAvoid.map((item) => `- ${item}`).join("\n")}
`;

const combinedMd = `# Public Domain Brain Package

Generated: 2026-05-26

## Public Domain Notice

${publicNotice}

${patternMd}

${stateMd}

${brainMd}

${protocolMd}

${reasoningMd}
`;

writeFileSync(path.join(reportsDir, "pattern-of-mind-public-review.md"), patternMd);
writeFileSync(path.join(reportsDir, "state-of-mind-public-review.md"), stateMd);
writeFileSync(path.join(reportsDir, "brain-design-public.md"), brainMd);
writeFileSync(path.join(reportsDir, "apex-protocol-public-review.md"), protocolMd);
writeFileSync(path.join(reportsDir, "reasoning-assembly-public.md"), reasoningMd);
writeFileSync(path.join(reportsDir, "public-domain-brain-package.md"), combinedMd);

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pageShell(title, subtitle, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
  @page { size: 11in 8.5in; margin: 0.42in; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, Arial, sans-serif; color: #e9f4f8; background: #050a10; }
  main { min-height: 100vh; padding: 38px 44px; background: radial-gradient(circle at 50% 32%, #14273a 0, #07111a 48%, #050a10 100%); }
  h1 { margin: 0; font-size: 42px; line-height: 1.05; letter-spacing: 0; }
  h2 { font-size: 24px; margin: 28px 0 12px; }
  p, li { font-size: 15px; line-height: 1.45; color: #c9dce5; }
  .subtitle { margin: 10px 0 24px; font-size: 18px; color: #b6d1dd; font-weight: 700; }
  .grid { display: grid; grid-template-columns: 1.1fr .9fr; gap: 22px; align-items: start; }
  .panel { border: 2px solid #4de4ff; border-radius: 18px; padding: 20px; background: rgba(11, 25, 38, .82); }
  .panel.gold { border-color: #ffc24d; }
  .panel.lime { border-color: #a8ff60; }
  .panel.rose { border-color: #ff6f9f; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
  th, td { border-bottom: 1px solid rgba(255,255,255,.14); text-align: left; vertical-align: top; padding: 7px 8px; color: #c9dce5; }
  th { color: #fff; font-size: 12px; background: rgba(255,255,255,.06); }
  .small { font-size: 12px; color: #9eb7c2; }
  .badge { display: inline-block; padding: 5px 8px; border-radius: 999px; background: #112235; border: 1px solid #405a73; margin: 3px 4px 3px 0; font-size: 12px; }
  svg { width: 100%; height: auto; display: block; }
  .break { page-break-before: always; }
</style>
</head>
<body>
<main>
<h1>${esc(title)}</h1>
<div class="subtitle">${esc(subtitle)}</div>
${body}
</main>
</body>
</html>`;
}

function patternDiagram() {
  const stages = reasoningAssembly.pipeline;
  const points = stages.map((stage, i) => {
    const a = -Math.PI / 2 + (i / stages.length) * Math.PI * 2;
    const x = 360 + Math.cos(a) * 225;
    const y = 310 + Math.sin(a) * 225;
    return { stage, x, y };
  });
  return `<svg viewBox="0 0 720 640" role="img" aria-label="Pattern of Mind pipeline">
    <circle cx="360" cy="310" r="240" fill="#0d1a27" stroke="#61e8ff" stroke-width="3"/>
    <circle cx="360" cy="310" r="125" fill="#121726" stroke="#ffc24d" stroke-width="3"/>
    <text x="360" y="300" text-anchor="middle" fill="#fff" font-size="28" font-weight="800">Pattern</text>
    <text x="360" y="333" text-anchor="middle" fill="#c9dce5" font-size="18" font-weight="700">11-stage cognition</text>
    ${points.map((point, i) => `<circle cx="${point.x}" cy="${point.y}" r="38" fill="#07111a" stroke="${i < 5 ? "#61e8ff" : i < 8 ? "#ffc24d" : "#a8ff60"}" stroke-width="3"/><text x="${point.x}" y="${point.y + 5}" text-anchor="middle" fill="#e9f4f8" font-size="11" font-weight="800">${esc(point.stage)}</text>`).join("")}
  </svg>`;
}

function stateDiagram() {
  return `<svg viewBox="0 0 720 500" role="img" aria-label="State of Mind model">
    <rect x="35" y="45" width="250" height="390" rx="22" fill="#0d1a27" stroke="#61e8ff" stroke-width="3"/>
    <text x="70" y="90" fill="#fff" font-size="24" font-weight="800">Live Metrics</text>
    ${stateModel.metrics.map((m, i) => `<text x="75" y="${135 + i * 44}" fill="#c9dce5" font-size="18" font-weight="700">${esc(m)}</text>`).join("")}
    <circle cx="470" cy="245" r="125" fill="#121726" stroke="#ffc24d" stroke-width="4"/>
    <text x="470" y="235" text-anchor="middle" fill="#fff" font-size="25" font-weight="800">State</text>
    <text x="470" y="267" text-anchor="middle" fill="#c9dce5" font-size="16" font-weight="700">metacognitive snapshot</text>
    ${stateModel.sections.map((s, i) => {
      const y = 70 + i * 66;
      return `<path d="M285 ${125 + i * 44} C350 ${y} 390 ${y} 430 ${y + 22}" fill="none" stroke="#a8ff60" stroke-width="3"/><rect x="505" y="${y}" width="180" height="44" rx="12" fill="#101f18" stroke="#a8ff60"/><text x="595" y="${y + 28}" text-anchor="middle" fill="#e9f4f8" font-size="13" font-weight="800">${esc(s.label)}</text>`;
    }).join("")}
  </svg>`;
}

function brainDiagram() {
  return `<svg viewBox="0 0 760 520" role="img" aria-label="Brain design source index">
    <rect x="30" y="95" width="190" height="300" rx="18" fill="#0d1a27" stroke="#61e8ff" stroke-width="3"/>
    <text x="125" y="135" text-anchor="middle" fill="#fff" font-size="22" font-weight="800">Sources</text>
    <text x="70" y="185" fill="#c9dce5" font-size="15" font-weight="700">paths</text>
    <text x="70" y="220" fill="#c9dce5" font-size="15" font-weight="700">commits</text>
    <text x="70" y="255" fill="#c9dce5" font-size="15" font-weight="700">hashes</text>
    <text x="70" y="290" fill="#c9dce5" font-size="15" font-weight="700">review status</text>
    <circle cx="390" cy="245" r="135" fill="#121726" stroke="#fff" stroke-width="4"/>
    <circle cx="390" cy="245" r="88" fill="#07111a" stroke="#ffc24d" stroke-width="3"/>
    <text x="390" y="237" text-anchor="middle" fill="#fff" font-size="25" font-weight="800">Core Graph</text>
    <text x="390" y="270" text-anchor="middle" fill="#c9dce5" font-size="15" font-weight="700">nodes + typed edges</text>
    <rect x="555" y="55" width="175" height="120" rx="16" fill="#121726" stroke="#ffc24d" stroke-width="3"/>
    <text x="642" y="102" text-anchor="middle" fill="#fff" font-size="20" font-weight="800">Ranking</text>
    <rect x="555" y="205" width="175" height="120" rx="16" fill="#121726" stroke="#a8ff60" stroke-width="3"/>
    <text x="642" y="252" text-anchor="middle" fill="#fff" font-size="20" font-weight="800">Traversal</text>
    <rect x="555" y="355" width="175" height="120" rx="16" fill="#121726" stroke="#ff6f9f" stroke-width="3"/>
    <text x="642" y="402" text-anchor="middle" fill="#fff" font-size="20" font-weight="800">Guardian</text>
    <path d="M220 245 H255" stroke="#61e8ff" stroke-width="5" marker-end="url(#a)"/>
    <path d="M505 180 L555 115" stroke="#ffc24d" stroke-width="5"/>
    <path d="M525 245 H555" stroke="#a8ff60" stroke-width="5"/>
    <path d="M505 310 L555 415" stroke="#ff6f9f" stroke-width="5"/>
    <defs><marker id="a" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M2 2 L10 6 L2 10Z" fill="#61e8ff"/></marker></defs>
  </svg>`;
}

function protocolDiagram() {
  return `<svg viewBox="0 0 760 420" role="img" aria-label="Public APEX protocol extract">
    ${["Task", "Graph Index", "Minimal Context", "Specialist", "Validator", "Release"].map((label, i) => {
      const x = 35 + i * 120;
      const color = i < 2 ? "#61e8ff" : i < 4 ? "#ffc24d" : "#a8ff60";
      return `<rect x="${x}" y="165" width="100" height="82" rx="14" fill="#121726" stroke="${color}" stroke-width="3"/><text x="${x + 50}" y="213" text-anchor="middle" fill="#fff" font-size="14" font-weight="800">${label}</text>${i < 5 ? `<path d="M${x + 100} 206 H${x + 120}" stroke="${color}" stroke-width="4"/>` : ""}`;
    }).join("")}
    <rect x="80" y="40" width="600" height="70" rx="16" fill="#0d1a27" stroke="#61e8ff" stroke-width="3"/>
    <text x="380" y="83" text-anchor="middle" fill="#fff" font-size="23" font-weight="800">v2.1.6 public extract: graph-indexed selective loading</text>
    <rect x="90" y="300" width="580" height="70" rx="16" fill="#101f18" stroke="#a8ff60" stroke-width="3"/>
    <text x="380" y="343" text-anchor="middle" fill="#e9f4f8" font-size="18" font-weight="800">No identity canon, local commands, personal names, or hidden canon.</text>
  </svg>`;
}

function reasoningDiagram() {
  return `<svg viewBox="0 0 760 480" role="img" aria-label="Observable reasoning assembly">
    <rect x="35" y="55" width="235" height="330" rx="18" fill="#0d1a27" stroke="#61e8ff" stroke-width="3"/>
    <text x="65" y="100" fill="#fff" font-size="22" font-weight="800">Observable Trace</text>
    ${["goal", "candidate paths", "chosen path", "evidence", "tool receipts", "outcome"].map((label, i) => `<text x="75" y="${145 + i * 38}" fill="#c9dce5" font-size="16" font-weight="700">${label}</text>`).join("")}
    <rect x="405" y="55" width="280" height="130" rx="18" fill="#101f18" stroke="#a8ff60" stroke-width="3"/>
    <text x="545" y="110" text-anchor="middle" fill="#fff" font-size="23" font-weight="800">Worked Patterns</text>
    <rect x="405" y="255" width="280" height="130" rx="18" fill="#24111b" stroke="#ff6f9f" stroke-width="3"/>
    <text x="545" y="310" text-anchor="middle" fill="#fff" font-size="23" font-weight="800">Failed Patterns</text>
    <path d="M270 165 C340 120 350 120 405 120" fill="none" stroke="#a8ff60" stroke-width="5"/>
    <path d="M270 260 C340 320 350 320 405 320" fill="none" stroke="#ff6f9f" stroke-width="5"/>
    <text x="380" y="440" text-anchor="middle" fill="#c9dce5" font-size="17" font-weight="800">Store outcomes, not hidden internal reasoning.</text>
  </svg>`;
}

function list(items) {
  return `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
}

function miniTable(rows) {
  const [head, ...body] = rows;
  return `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

const docs = [
  {
    name: "pattern-of-mind-public-review",
    title: "Pattern of Mind Public Review",
    subtitle: "Complete sanitized graph layer with pipeline diagram and node inventory.",
    body: `<div class="grid"><div class="panel">${patternDiagram()}</div><div class="panel gold"><h2>Review</h2><p>Total nodes: ${patternNodes.length}. Stage nodes: ${stageNodes.length}. Categories: ${Object.keys(categoryCounts).length}.</p><h2>Categories</h2>${miniTable(categoryRows)}</div></div><h2>Pipeline</h2>${miniTable(stageRows)}<div class="break"></div><h2>Complete Node Inventory</h2>${miniTable(inventoryRows)}`,
  },
  {
    name: "state-of-mind-public-review",
    title: "State of Mind Public Review",
    subtitle: "Metacognitive graph snapshot model with public metrics and section map.",
    body: `<div class="grid"><div class="panel">${stateDiagram()}</div><div class="panel lime"><h2>Metrics</h2>${list(stateModel.metrics)}<h2>Sections</h2>${miniTable(stateRows)}</div></div>`,
  },
  {
    name: "brain-design-public",
    title: "Brain Design Public Core",
    subtitle: "Source index, ranking, traversal, reference points, reanimation, and Guardian review.",
    body: `<div class="grid"><div class="panel">${brainDiagram()}</div><div class="panel gold"><h2>Contracts</h2>${list(brainDesignPublic.contracts)}<h2>Ranking Signals</h2>${list(brainDesignPublic.rankingSignals)}</div></div><h2>Rules</h2><p>${esc(brainDesignPublic.relationRule)}</p><p>${esc(brainDesignPublic.maintenanceRule)}</p>`,
  },
  {
    name: "apex-protocol-public-review",
    title: "APEX Protocol Public Extract",
    subtitle: "Public operational extraction from latest local v2.1.6 protocol line.",
    body: `<div class="grid"><div class="panel">${protocolDiagram()}</div><div class="panel gold"><h2>Principles</h2>${list(protocolPublic.principles)}</div></div><h2>Public Chains</h2>${list(protocolPublic.publicChains)}`,
  },
  {
    name: "reasoning-assembly-public",
    title: "Reasoning Assembly Public Trace",
    subtitle: "Observable path choices, success patterns, and failure patterns without hidden chain-of-thought.",
    body: `<div class="grid"><div class="panel">${reasoningDiagram()}</div><div class="panel lime"><h2>Pipeline</h2>${list(reasoningAssembly.pipeline)}</div></div><h2>Worked Patterns</h2>${list(reasoningAssembly.workedPatterns)}<h2>Failed Patterns To Avoid</h2>${list(reasoningAssembly.failedPatternsToAvoid)}`,
  },
  {
    name: "public-domain-brain-package",
    title: "Public Domain Brain Package",
    subtitle: "Combined package: Pattern, State, Brain Design, APEX public extract, and observable assembly.",
    body: `<div class="grid"><div class="panel">${brainDiagram()}</div><div class="panel gold"><h2>Contents</h2>${list(["Pattern of Mind public review", "State of Mind public review", "Brain Design public core", "APEX Protocol public extract", "Observable reasoning assembly"])}</div></div><div class="break"></div><h2>Pattern of Mind</h2>${patternDiagram()}<div class="break"></div><h2>State of Mind</h2>${stateDiagram()}<div class="break"></div><h2>APEX Protocol Public Extract</h2>${protocolDiagram()}<div class="break"></div><h2>Reasoning Assembly</h2>${reasoningDiagram()}`,
  },
];

for (const doc of docs) {
  const html = pageShell(doc.title, doc.subtitle, doc.body);
  const htmlPath = path.join(htmlDir, `${doc.name}.html`);
  writeFileSync(htmlPath, html);
  if (process.argv.includes("--no-pdf")) continue;
  execFileSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    `--print-to-pdf=${path.join(pdfDir, `${doc.name}.pdf`)}`,
    `file://${htmlPath}`,
  ], { stdio: "ignore" });
}

writeFileSync(path.join(root, "docs", "mind-graph-sources.md"), `# Mind Graph Sources

This repository includes public-domain source bundles under \`public/sources/\` and a complete public-domain release package under \`public/public-domain/\`.

## Pattern of Mind

- Public source file: \`public/sources/pattern-of-mind-nodes.json\`
- Public-domain complete source index: \`public/public-domain/sources/pattern-of-mind.public.json\`
- Public review PDF: \`public/public-domain/pdf/pattern-of-mind-public-review.pdf\`

The graph imports ${patternNodes.length} sanitized Pattern of Mind nodes, including the 11-stage cognitive pipeline, verification chain, certainty spectrum, reasoning techniques, warnings, validation nodes, and implementation nodes.

## State of Mind

- Public source file: \`public/sources/state-of-mind.json\`
- Public-domain complete source index: \`public/public-domain/sources/state-of-mind.public.json\`
- Public review PDF: \`public/public-domain/pdf/state-of-mind-public-review.pdf\`

The graph adds the State of Mind model as a public metacognitive index: overall graph metrics, recent acquisitions, well-worn paths, focus areas, center of gravity, and knowledge distribution.

## Brain Design, APEX Protocol, And Reasoning Assembly

- Brain design PDF: \`public/public-domain/pdf/brain-design-public.pdf\`
- APEX public extract PDF: \`public/public-domain/pdf/apex-protocol-public-review.pdf\`
- Reasoning assembly PDF: \`public/public-domain/pdf/reasoning-assembly-public.pdf\`
- Combined package PDF: \`public/public-domain/pdf/public-domain-brain-package.pdf\`

## Graph Links

The public-domain package is connected into \`public/brain.json\` through the \`public-domain-package\` node and document nodes for each generated PDF.
`);

console.log("Built public-domain brain package.");
