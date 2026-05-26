# Graphify Wiki Brain

Public Three.js brain viewer for Graphify wiki exports and Obsidian vaults.

The repo is intentionally static: import runs locally, writes `public/brain.json`, and the site renders that graph as a full-screen interactive brain.

## Run

```bash
npm install
npm run dev
```

## Connect Obsidian

```bash
npm run import:obsidian -- /path/to/ObsidianVault
npm run validate:data
npm run dev
```

The importer reads markdown files, wikilinks, markdown links, tags, and top-level folders. It writes a portable graph to `public/brain.json`.

## Connect Graphify

```bash
npm run import:graphify -- /path/to/graph.json
npm run validate:data
npm run dev
```

The Graphify importer accepts common `nodes` plus `edges` or `links` JSON shapes and normalizes them into the same brain schema.

## Brain Schema

```json
{
  "name": "My Brain",
  "nodes": [
    {
      "id": "note:build-log",
      "label": "Build Log",
      "group": "Projects",
      "kind": "note",
      "summary": "Short preview",
      "path": "Projects/Build Log.md",
      "tags": ["build"]
    }
  ],
  "edges": [
    {
      "source": "note:build-log",
      "target": "tag:build",
      "label": "tagged"
    }
  ]
}
```

Optional node fields include `url`, `weight`, `color`, `x`, `y`, and `z`.

## Publish

Push to `main`; the included GitHub Actions workflow builds the app and deploys it to GitHub Pages.
