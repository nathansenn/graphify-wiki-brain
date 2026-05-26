#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const [vaultArg, outputArg = "public/brain.json"] = process.argv.slice(2);

if (!vaultArg) {
  console.error("Usage: npm run import:obsidian -- /path/to/vault [public/brain.json]");
  process.exit(1);
}

const vaultRoot = path.resolve(vaultArg);
const outputPath = path.resolve(outputArg);

function toId(prefix, value) {
  const clean = String(value)
    .trim()
    .replace(/\\/g, "/")
    .replace(/\.[^.]+$/, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._:/#-]/g, "")
    .toLowerCase();
  return `${prefix}:${clean || "untitled"}`;
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".obsidian") || entry.name === ".git" || entry.name === "node_modules") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(fullPath);
  }
  return files;
}

function stripCode(text) {
  return text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
}

function titleFor(relativePath, text) {
  const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || path.basename(relativePath, ".md");
}

function summaryFor(text) {
  const clean = stripCode(text)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, "$2$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(^|\s)#[A-Za-z0-9/_-]+/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("---") && !line.startsWith("!["))
    .join(" ");
  return clean.length > 220 ? `${clean.slice(0, 217)}...` : clean;
}

function firstFolder(relativePath) {
  const folder = path.dirname(relativePath).split(path.sep).filter(Boolean)[0];
  return folder || "Vault";
}

function extractTargets(text) {
  const clean = stripCode(text);
  const wikilinks = [...clean.matchAll(/\[\[([^\]#|]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)].map((match) => match[1]);
  const markdownLinks = [...clean.matchAll(/\[[^\]]+\]\(([^)]+?\.md)(?:#[^)]+)?\)/g)].map((match) => decodeURIComponent(match[1]));
  return [...new Set([...wikilinks, ...markdownLinks].map((target) => target.trim()).filter(Boolean))];
}

function extractTags(text) {
  return [
    ...new Set(
      [...stripCode(text).matchAll(/(^|\s)#([A-Za-z0-9][A-Za-z0-9/_-]*)/g)]
        .map((match) => match[2])
        .filter((tag) => !tag.includes("//")),
    ),
  ].sort();
}

function addLookup(lookup, key, id) {
  if (!key) return;
  lookup.set(
    key
      .replace(/\\/g, "/")
      .replace(/\.[^.]+$/, "")
      .toLowerCase(),
    id,
  );
}

const files = await walk(vaultRoot);
const notes = [];
const lookup = new Map();

for (const file of files) {
  const relativePath = path.relative(vaultRoot, file);
  const id = toId("note", relativePath);
  const text = await readFile(file, "utf8");
  const note = {
    id,
    label: titleFor(relativePath, text),
    group: firstFolder(relativePath),
    kind: "note",
    path: relativePath.replace(/\\/g, "/"),
    summary: summaryFor(text),
    tags: extractTags(text),
    targets: extractTargets(text),
  };
  notes.push(note);
  addLookup(lookup, relativePath, id);
  addLookup(lookup, path.basename(relativePath, ".md"), id);
  addLookup(lookup, relativePath.replace(/\\/g, "/"), id);
}

const nodes = notes.map(({ targets, ...node }) => node);
const edges = [];
const tagIds = new Set();
const referenceIds = new Set();

for (const note of notes) {
  for (const tag of note.tags) {
    const tagId = toId("tag", tag);
    if (!tagIds.has(tagId)) {
      tagIds.add(tagId);
      nodes.push({ id: tagId, label: `#${tag}`, group: "Tags", kind: "tag", summary: `Tag from ${path.basename(vaultRoot)}.` });
    }
    edges.push({ source: note.id, target: tagId, label: "tagged" });
  }

  for (const target of note.targets) {
    const key = target.replace(/\\/g, "/").replace(/\.[^.]+$/, "").toLowerCase();
    const targetId = lookup.get(key) || lookup.get(path.basename(key));
    if (targetId) {
      edges.push({ source: note.id, target: targetId, label: "links" });
      continue;
    }

    const referenceId = toId("ref", target);
    if (!referenceIds.has(referenceId)) {
      referenceIds.add(referenceId);
      nodes.push({
        id: referenceId,
        label: target.replace(/\\/g, "/").replace(/^.*\//, ""),
        group: "References",
        kind: "reference",
        summary: "Linked from the vault but not found as a markdown file.",
      });
    }
    edges.push({ source: note.id, target: referenceId, label: "references" });
  }
}

const graph = {
  name: `${path.basename(vaultRoot)} Brain`,
  generatedAt: new Date().toISOString(),
  source: { type: "obsidian", path: vaultRoot },
  nodes,
  edges,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(graph, null, 2)}\n`);
console.log(`wrote ${outputPath}: ${nodes.length} nodes, ${edges.length} edges`);
