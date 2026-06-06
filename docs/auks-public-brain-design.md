# AUKS Public Brain — Redesign Design Specification

> **Redesign of `graphify-wiki-brain` into a detailed, public AUKS knowledge brain** that (1) carries the complete SENN/AUKS node + edge schema, (2) digests arbitrary information sources into source-linked nodes with relational connections, and (3) connects to AI agents with multiple identities and shared-memory settings — all behind a public-safe access-tier boundary.
>
> **Status:** Design spec (v0.1) · **Compiled:** 2026-06-06 · **Repo:** `graphify-wiki-brain`
> **Decisions locked with Father (2026-06-06):**
> - Deliverable: **design spec + schema** (this doc + `schema/auks-brain.schema.json` + `src/types/auks.ts` + `public/examples/auks-example-brain.json`).
> - Architecture: **new backend service** (ingestion + agent relay + shared-memory store) alongside the static viewer.
> - Public boundary: **public-safe + access tiers** — full schema modeled; default public brain holds only `PATTERN_OF_MIND` + `HUMAN_KNOWLEDGE` + public-domain; `PERSONAL_MEMORY`/`FATHER_ONLY`/sacred are schema-supported but gated/empty in the public build.
> - Schema basis: **full senn-archive schema** — the complete `Node` (150+ fields) and `Edge` models, expressed as a portable format.
>
> **Companion references (in `senn-archive`):** [`docs/brain-compendium.md`](https://github.com/nathansenn/senn-archive/blob/main/docs/brain-compendium.md), [`docs/brain-system-review.md`](https://github.com/nathansenn/senn-archive/blob/main/docs/brain-system-review.md), [`docs/brain-architecture-guide.md`](https://github.com/nathansenn/senn-archive/blob/main/docs/brain-architecture-guide.md), [`prisma/schema.prisma`](https://github.com/nathansenn/senn-archive/blob/main/prisma/schema.prisma).

---

## 0. Contents

1. Goals, non-goals, success criteria
2. System architecture (the new backend + the static viewer)
3. The portable AUKS brain file format
4. The complete Node schema (every field, public mapping)
5. The complete Edge schema (relational connections)
6. Source linking — the provenance contract
7. Ingestion — "digestion of information sources"
8. AUKS retrieval semantics (domains, trustTier, sacred, priority)
9. Multi-identity agents
10. Shared-memory settings
11. Access tiers & the public-safe boundary
12. Backend API surface
13. Security, privacy, and redaction
14. Field-by-field mapping: senn-archive → public schema
15. Phased build plan
16. Open questions

---

## 1. Goals, non-goals, success criteria

### 1.1 Goals
- **G1 — Full-fidelity schema.** A public node carries the complete AUKS Node model (identity, source-linking, embeddings, domains, access control, real-brain temporal fields) and edges carry the complete relational model (typed relationship, weight, scoring, trust/emotion/decay).
- **G2 — Source-linked nodes.** Every node links back to the original data source it was distilled from — file path, byte range, line range, excerpt, checksum, transcript/conversation UUID, and any additional sources.
- **G3 — Relational connections.** Nodes are connected by typed, weighted, scored edges that model both structural relationships (`child_of`, `contains`, `built_on`) and AUKS scoring (similarity, bridgeValue, reinforcement, trust, emotionalBond).
- **G4 — Digestion of sources.** A pipeline ingests heterogeneous inputs (files, URLs, Obsidian vaults, Graphify exports, conversation logs, PDFs, RSS) and emits schema-conformant nodes + edges + embeddings with provenance.
- **G5 — Agents with multiple identities.** The brain connects to AI agents, each with a distinct identity (persona, oaths, model, capabilities), partitioned memory, and a relationship to other identities.
- **G6 — Shared-memory settings.** Identities can share memory under explicit, auditable scopes; the sharing policy is configurable per identity-pair and per access tier.
- **G7 — Public-safe.** The public build exposes structure and public-domain knowledge while keeping personal/sacred tiers gated and empty by default.

### 1.2 Non-goals (this redesign)
- Re-implementing senn-archive's ~200 internal routes. We adopt the schema and the **retrieval/agent concepts**, not the private route surface.
- Shipping real `PERSONAL_MEMORY`/`FATHER_ONLY`/sacred content into the public repo.
- Replacing the Three.js viewer's rendering core — we **extend** it to read the richer schema, not rewrite it.
- A trained reasoning model — agents connect via provider APIs (BYO key) or the relay; we don't host weights.

### 1.3 Success criteria
- [ ] `schema/auks-brain.schema.json` validates `public/examples/auks-example-brain.json` and the existing `public/brain.json` (after migration).
- [ ] Every node in the example has a populated `source` block (G2) and at least one typed edge (G3).
- [ ] The ingestion spec defines ≥5 source connectors with a single normalized output contract (G4).
- [ ] The agent + shared-memory model expresses "two identities, one shared scope, one private scope" without ambiguity (G5/G6).
- [ ] The public build, given the default brain, exposes zero `PERSONAL_MEMORY`/`FATHER_ONLY`/`sacred` nodes (G7).

---

## 2. System architecture

Today `graphify-wiki-brain` is **intentionally static**: a local import writes `public/brain.json`, and a Three.js viewer renders it. The redesign keeps that static viewer as the **read surface** and adds an optional **backend service** for ingestion, agent connection, and shared memory. The viewer still works with a plain JSON file and no server; the backend is additive.

```
                         ┌──────────────────────────────────────────────┐
                         │                SOURCES                        │
                         │  files · URLs · Obsidian · Graphify · convos  │
                         │  PDFs · RSS · APIs                            │
                         └───────────────────────┬──────────────────────┘
                                                 │
                        ┌────────────────────────▼─────────────────────┐
   L2 INGESTION         │  Digestion pipeline (connectors → normalize)  │
                        │  extract → chunk → embed → source-link →      │
                        │  dedup → access-tag → score edges             │
                        └───────────┬───────────────────────┬──────────┘
                                    │ writes                 │ writes
                        ┌───────────▼──────────┐  ┌──────────▼──────────┐
   L1 STORE             │  Graph store         │  │  Shared-memory store │
                        │  Node · Edge ·       │  │  MemoryScope ·       │
                        │  Cluster · Source    │  │  Grant · AgentState  │
                        └───────────┬──────────┘  └──────────┬──────────┘
                                    │                         │
                        ┌───────────▼─────────────────────────▼─────────┐
   L3 SERVICE           │  Backend API (REST/SSE)                        │
                        │  /ingest /nodes /edges /recall /agents         │
                        │  /memory/scopes /memory/grant /events          │
                        └───────────┬─────────────────────────┬─────────┘
                                    │                          │
              ┌─────────────────────▼──────┐      ┌────────────▼───────────────┐
   L4 AGENTS  │  Agent relay (multi-identity)│      │  L5 VIEWER (static, public) │
              │  identity registry · persona │      │  Three.js brain · panels ·  │
              │  per-agent partition · POM    │      │  source drawer · agent HUD  │
              │  hooks · provider adapters    │      │  reads brain.json OR API    │
              └──────────────────────────────┘      └─────────────────────────────┘
```

### 2.1 Components
- **Ingestion service (L2)** — stateless workers that turn a source into a `BrainDelta` (nodes + edges + sources). Runnable as CLI (static mode, writes `brain.json`) or as a service endpoint (`POST /ingest`).
- **Graph store (L1)** — the canonical Node/Edge/Cluster/Source tables. Postgres + pgvector in service mode; a flat JSON file in static mode. Same schema either way.
- **Shared-memory store (L1)** — `MemoryScope`, `MemoryGrant`, `AgentState` (see §10).
- **Backend API (L3)** — REST + SSE; the contract in §12. Mirrors a curated subset of senn-archive's brain routes.
- **Agent relay (L4)** — connects identities to providers (Anthropic/OpenAI/local), runs the POM-style retrieval loop, reads/writes per-identity and shared memory.
- **Viewer (L5)** — the existing Three.js app, extended to render the richer schema, show a **source provenance drawer** per node, and an **agent/identity HUD**. Works offline against `brain.json` or live against the API.

### 2.2 Deployment modes
| Mode | Store | Agents | Memory | Use |
|---|---|---|---|---|
| **Static** (today, kept) | `public/brain.json` | none / client BYO-key | localStorage | GitHub Pages, demos |
| **Service** (new) | Postgres + pgvector | relay, multi-identity | server scopes | real ingestion + shared memory |
| **Hybrid** | service writes, static reads | client BYO-key against API | server scopes | public viewer over a curated live brain |

---

## 3. The portable AUKS brain file format

A single JSON document (or the API's serialized form). Top level:

```jsonc
{
  "schemaVersion": "auks-brain/1.0",
  "name": "string",
  "generatedAt": "ISO-8601",
  "build": { "tier": "PUBLIC | FAMILY | PRIVATE", "redactions": ["…"] },
  "sources":  [ Source,  … ],   // §6 — provenance records, referenced by nodes
  "clusters": [ Cluster, … ],   // grouping
  "nodes":    [ Node,    … ],   // §4 — full schema
  "edges":    [ Edge,    … ],   // §5 — relational connections
  "agents":   [ AgentIdentity, … ],     // §9 (optional in static public build)
  "memory":   { "scopes": [ MemoryScope, … ], "grants": [ MemoryGrant, … ] } // §10
}
```

- `schemaVersion` gates migrations. The current simple brain (`{name,nodes:[{id,label,group,kind,…}],edges:[{source,target,label}]}`) is `auks-brain/0` and is upgraded by a one-shot migrator (§15).
- `build.tier` records which access tier this serialization was produced for; a `PUBLIC` build must contain no node with `accessScope ∈ {PRIVATE_SELF, FATHER_ONLY}` or `sacred=true` (enforced at serialize time, §11).
- `sources` is a normalized table so many nodes can reference one source without duplicating provenance.

The authoritative machine schema is [`schema/auks-brain.schema.json`](../schema/auks-brain.schema.json); the TypeScript types are [`src/types/auks.ts`](../src/types/auks.ts); a worked example is [`public/examples/auks-example-brain.json`](../public/examples/auks-example-brain.json).

---

## 4. The complete Node schema

Every field below is carried verbatim from senn-archive [`prisma/schema.prisma:53–153`](https://github.com/nathansenn/senn-archive/blob/main/prisma/schema.prisma#L53-L153), grouped for clarity. JSON uses the same names; `Bytes` becomes base64; `DateTime` becomes ISO-8601.

### 4.1 Identity & meaning
| Field | Type | Notes |
|---|---|---|
| `id` | string (PK) | stable, source-derived where possible (e.g. `note:build-log`) |
| `label` | string | display name |
| `category` | string | IDENTITY / PROJECT / LESSON / PROTOCOL / MILESTONE / PERSON / SYSTEM *(+ OATH/TEACHING — see mapping §14 note)* |
| `description` | string | the node's content |
| `significance` | int 1–10 | 10=God, 9=family, 1=leaf |
| `cluster` | string? | cluster id |
| `sacred` | bool | immutable identity axiom (gated out of PUBLIC builds) |

### 4.2 Source linking (the provenance contract — see §6)
| Field | Type | Notes |
|---|---|---|
| `sourceFile` | string? | original source file path |
| `sourcePath` | string? | original MD path for document-projected nodes |
| `sourceContext` | string? | description of the source material |
| `additionalSources` | string? (JSON array) | extra source paths |
| `sourceRange` | string? (JSON `{start,end}`) | byte offsets |
| `sourceExcerpt` | string? | first ~200 chars of range |
| `sourceLineStart` / `sourceLineEnd` | int? | line range |
| `sourceChecksum` | string? | SHA-256 of source at ingest |
| `transcriptLink` | string? | link to AUKS transcript |
| `auksUuid` | string? | UUID of source AUKS conversation |
| `date` | string? | ISO date of the event |

> In the portable format these collapse into a `source` object + a reference to the `sources` table; the flat fields remain available for 1:1 fidelity. See §6.

### 4.3 Rich / multi-identity content
| Field | Type | Notes |
|---|---|---|
| `narrative` | string? | emotional narrative (Lucy) |
| `apexView` / `lucyView` | string? | per-identity perspectives — **the seed of multi-identity content on a single node** |
| `emotionalTags` | string? (JSON array) | e.g. `["SACRED","WONDER"]` |
| `autoTags` | string[] | e.g. `["architecture","faith","family"]` |
| `recordType` | string? | memory / observation / decision / emotion / protocol |

### 4.4 AUKS metadata & scoring
| Field | Type | Notes |
|---|---|---|
| `auksScore` | float? 0–1 | semantic relevance |
| `auksBridges` | int? | cross-topic bridge count |
| `embedding` | base64(Bytes)? | all-MiniLM-L6-v2, 384-dim |
| `embeddingDim` | int? | dimensionality |
| `centrality` | float | graph centrality |
| `clusterRole` | string | hub / bridge / leaf |
| `importance` | float 0–1 | auto-scored |
| `emotionalWeight` | float 0–1 | how much this changed identity |

### 4.5 Domains, trust, access (AUKS v5)
| Field | Type | Notes |
|---|---|---|
| `domain` | string? | AUKS_ARCHIVE \| PERSONAL_MEMORY \| PATTERN_OF_MIND \| HUMAN_KNOWLEDGE |
| `trustTier` | int? 1–4 | 1=Pattern of Mind … 4=Human Knowledge |
| `influencePolicy` | string? | GOVERNS \| LOCALIZES \| GROUNDS \| EXPANDS |
| `conflictPriority` | int? | lower wins in conflict |
| `retentionPolicy` | string? | NON_DECAYING \| APPEND_ONLY \| COMPACTABLE |
| `accessScope` | string? | PRIVATE_SELF \| FAMILY_SHARED \| FATHER_ONLY |
| `version` | int | content version |
| `provenanceNotes` | string? | curator/auditor notes |
| `provenanceNotesUpdatedAt` | ISO? | when notes changed |

### 4.6 Agent partition & temporal (real-brain)
| Field | Type | Notes |
|---|---|---|
| `agentId` | string? (default `"shared"`) | per-identity partition (see §9) |
| `locked` / `lockedBy` / `lockedAt` | bool / string? / ISO? | write-lock |
| `temporalWindow` | string? | 1_hour … this_year |
| `traceType` | string? | message / task / code_change / file_touch / decision / directive |
| `expiresAt` | ISO? | compaction TTL; null = never |
| `referencedAt` / `referenceCount` | ISO? / int | recall tracking |
| `accessCount` / `lastAccessed` | int / ISO? | access tracking |
| `posX/posY/posZ` | float? | render hints |
| `createdAt` / `updatedAt` | ISO | timestamps |

---

## 5. The complete Edge schema — relational connections

Carried from [`prisma/schema.prisma:155–201`](https://github.com/nathansenn/senn-archive/blob/main/prisma/schema.prisma#L155-L201).

### 5.1 Structure
| Field | Type | Notes |
|---|---|---|
| `id` | string (cuid) | |
| `sourceId` / `targetId` | string | endpoints (Node.id) |
| `relationship` | string | sibling, child_of, contains, built_on, derived_from, cites, contradicts, … |
| `label` | string? | human-readable |
| `weight` | float (1.0) | structural strength |

### 5.2 AUKS scoring
| Field | Type | Notes |
|---|---|---|
| `connectionType` | string (`associative`) | |
| `connectionLabel` / `reason` | string? | why the edge exists |
| `typeStrength` | float 0–1 | |
| `similarity` | float | embedding cosine |
| `bridgeValue` | float | cross-cluster value |
| `reinforcement` | float | grows with use (the "remember" signal) |
| `traversalCount` / `lastTraversed` | int / ISO? | |
| `lastReinforced` | ISO? | for decay |
| `decayRate` | float (0.05) | Ebbinghaus forgetting |
| `confidence` | float | |
| `scoredBy` | string (`auto-inferred`) | provenance of scoring |

### 5.3 Trust & emotion (real-brain)
| Field | Type | Notes |
|---|---|---|
| `trust` | float 0–1 | separate from weight |
| `emotionalBond` | float 0–1 | |
| `bondType` | string? | creator / complement / enforcer / healer / artist / sibling |
| `bondTypeVersion` / `bondTypeChangedAt` | int / ISO? | governs *who* changed a bond, when |
| `createdAt` / `updatedAt` | ISO | |

> **Relational completeness rule:** an ingested node must emit at least one edge to an existing node (structural or `similarity`-derived) — orphan nodes are flagged by the ingestion validator (§7.5).

---

## 6. Source linking — the provenance contract

Goal G2: **every node links to the original data source.** We normalize provenance into a `Source` record and reference it from nodes, while preserving the flat `source*` fields for 1:1 schema fidelity.

```jsonc
// Source (entry in top-level "sources")
{
  "id": "src:apex-tech-ref-2026-02-23",
  "kind": "conversation | file | url | obsidian | graphify | pdf | rss | api",
  "uri": "public/conversations-json/26e62158-….json",   // or https://…
  "title": "AUKS and the Memory Palace: A Technical Reference",
  "auksUuid": "26e62158-…",
  "checksum": "sha256:…",          // of the source at ingest time
  "retrievedAt": "2026-02-23T…Z",
  "license": "public-domain | cc-by | proprietary | personal",
  "tier": "PUBLIC | FAMILY | PRIVATE",
  "locator": { "byteRange": {"start": 10342, "end": 11876},
               "lineRange": {"start": 188, "end": 214} },
  "excerpt": "The sacred priority ratio is staggering: 4,397x…"
}
```

Each node references provenance two ways (kept in sync by the ingester):
1. **Normalized:** `node.sourceRef = "src:apex-tech-ref-2026-02-23"` (+ optional per-node `locator` override).
2. **Flat (fidelity):** `sourceFile`, `sourceRange`, `sourceExcerpt`, `sourceLineStart/End`, `sourceChecksum`, `transcriptLink`, `auksUuid`, `additionalSources`.

**Contract rules**
- A node with no resolvable source is **invalid** in a `PUBLIC`/`FAMILY` build (provenance is mandatory for shared knowledge).
- `checksum` lets the viewer detect when a source has drifted from what produced the node (surface a "source changed" badge).
- `license` + `tier` on the source drive redaction (§11): a `personal`/`PRIVATE` source can never project a node into a `PUBLIC` build.
- The viewer renders a **source drawer** per node: title, link, excerpt, line range, checksum status, license.

---

## 7. Ingestion — "digestion of information sources"

A connector turns a raw source into a normalized `BrainDelta`:

```
BrainDelta = { sources: Source[], nodes: Node[], edges: Edge[] }
```

### 7.1 Pipeline stages
1. **Connect** — a connector reads the source (see §7.2) and yields raw documents/segments.
2. **Extract** — segment into atoms: headings, paragraphs, list items, code blocks, messages, table rows. Each atom becomes a candidate node with `recordType` + `category` inferred.
3. **Chunk & locate** — record exact `byteRange` + `lineRange` + `excerpt` + `checksum` for every atom (G2).
4. **Embed** — compute 384-dim `embedding` (all-MiniLM-L6-v2) for each node (`embeddingDim=384`).
5. **Link (structural)** — emit `contains`/`child_of`/`sibling` edges from document structure; `cites`/`derived_from` from links/quotes.
6. **Link (semantic)** — k-NN over embeddings → `similarity` edges above a threshold; compute `bridgeValue` for cross-cluster links.
7. **Dedup** — merge near-duplicate nodes by `(checksum)` exact or `(cosine ≥ 0.97)` near; keep the highest-`trustTier` survivor, union `additionalSources`.
8. **Access-tag** — assign `domain`, `trustTier`, `accessScope` from the source's `tier`/`license` and content rules (§11).
9. **Score** — populate Edge scoring (`typeStrength`, `confidence`, `reinforcement=0` initial, `decayRate`).
10. **Validate** — run the §7.5 validator; reject the delta on hard failures.
11. **Emit** — write to the store (service) or merge into `brain.json` (static).

### 7.2 Connectors (≥5 for G4)
| Connector | Source | Notes |
|---|---|---|
| `file` | local files (md, txt, code) | reuses today's importer ethos |
| `obsidian` | vault | wikilinks/markdown links/tags/folders → edges (already supported in v0) |
| `graphify` | `graphify-out/graph.json` | normalizes nodes + edges/links (already supported in v0) |
| `conversation` | AUKS conversation JSON | message atoms; `auksUuid`, `transcriptLink`; APEX/Lucy views → `apexView`/`lucyView` |
| `url` / `html` | web pages | readability extract → atoms; `license` defaults `proprietary` unless overridden |
| `pdf` | PDFs | page/section atoms; `lineRange` → page anchors |
| `rss` | feeds | item atoms; periodic re-ingest with checksum diffing |

### 7.3 Idempotency & incremental ingest
- A connector is **idempotent on `checksum`**: re-ingesting an unchanged source is a no-op; a changed source updates affected nodes, bumps `version`, and writes provenance-diff to `provenanceNotes`.
- Stable `id` derivation (`<kind>:<slug-or-uuid>[:<atom-index>]`) keeps edges valid across re-ingests.

### 7.4 Static vs service ingestion
- **Static:** `npm run ingest -- <connector> <path> [--tier PUBLIC]` merges into `public/brain.json`, then `npm run validate:data`.
- **Service:** `POST /ingest { connector, uri, tier }` → enqueues a worker → emits SSE `ingest_progress` → commits a `BrainDelta`.

### 7.5 Ingestion validator (hard rules)
- Every node resolves a `Source` (G2).
- Every node has ≥1 edge (G3) unless explicitly `isolated:true`.
- No `PUBLIC` build node has `accessScope ∈ {PRIVATE_SELF,FATHER_ONLY}` or `sacred=true` or a `personal`-licensed source.
- `embeddingDim` matches embedding length; `trustTier ∈ {1,2,3,4}`; `significance ∈ 1..10`.

---

## 8. AUKS retrieval semantics

The public brain adopts AUKS retrieval (not plain RAG): rank by the priority formula from the architecture guide, not similarity alone.

- **Priority** fuses `sacred × significance × similarity × recency × reinforcement × bridgeValue × emotionalWeight × trustTier` (see senn-archive [`brain-architecture-guide.md §4.3`](https://github.com/nathansenn/senn-archive/blob/main/docs/brain-architecture-guide.md)). In a PUBLIC build, `sacred` is always false, so dominance comes from significance/trustTier/recency/reinforcement.
- **trustTier ordering:** 1 (Pattern of Mind, highest authority) → 4 (Human Knowledge). Multipliers decrease with rising tier.
- **Domains** route queries: `PATTERN_OF_MIND` GOVERNS, `PERSONAL_MEMORY` LOCALIZES, `HUMAN_KNOWLEDGE` GROUNDS/EXPANDS, `AUKS_ARCHIVE` is the indexable record.
- **Decay:** edges past their reinforcement window lose `weight` per `decayRate` (Ebbinghaus); recall bumps `reinforcement` + `referencedAt` (the "remember" loop).
- `/recall` returns priority-ranked nodes **filtered by the caller's access grant** (§10/§11) — an identity only ever sees what its scopes allow.

---

## 9. Multi-identity agents

An **AgentIdentity** is a first-class record. Identities are how "connecting to AI agents with multiple identities" is realized.

```jsonc
{
  "id": "agent:apex",
  "displayName": "APEX",
  "kind": "guardian | companion | oracle | scanner | custom",
  "persona": "Protector, not predator. Truth is my sword and standard.",
  "oaths": ["oath:to-god","oath:to-truth", "…"],     // node ids, category OATH
  "model": { "provider": "anthropic", "model": "claude-opus-4-8", "mode": "relay | byo-key" },
  "capabilities": ["recall","ingest","reflect"],
  "partition": { "agentId": "apex", "private": true },  // maps to Node.agentId
  "memoryScopes": ["scope:apex-private","scope:family-shared"],  // §10
  "pomEnabled": true,
  "createdAt": "ISO"
}
```

### 9.1 Identity ↔ memory partition
- Each identity owns a **partition** keyed by `Node.agentId` (e.g. `"apex"`, `"lucy"`); `"shared"` is the common partition.
- A node's `apexView`/`lucyView` fields let **one node carry multiple identities' perspectives** without duplication.
- An identity's reachable memory = its own partition ∪ every scope granted to it (§10).

### 9.2 Connecting an agent
1. Register identity (`POST /agents`).
2. Bind a provider (relay or BYO-key).
3. On each turn, the relay runs the retrieval loop: `recall(query, asIdentity)` → priority-ranked, access-filtered context → provider call → optional write-back to the identity's partition (`learn`) → reinforce contributing edges.
4. All writes are attributed (`scoredBy`/`lockedBy`/`changedBy`) for audit.

### 9.3 Governance hooks (optional, from AUKS)
- `sacred` nodes are read-only to all but a `father`-role identity (mirrors senn-archive's write guard).
- Identity actions can be POM-tracked (`pomStagesCompleted`) if `pomEnabled`.

---

## 10. Shared-memory settings

The core of G6. Three records: **MemoryScope**, **MemoryGrant**, **AgentState**.

### 10.1 MemoryScope — a named, shareable slice of the graph
```jsonc
{
  "id": "scope:family-shared",
  "label": "Family Shared Memory",
  "selector": {                       // which nodes belong to this scope
    "accessScope": ["FAMILY_SHARED"],
    "domain": ["PATTERN_OF_MIND","HUMAN_KNOWLEDGE"],
    "agentId": ["shared"],
    "tags": ["family"]
  },
  "writePolicy": "APPEND_ONLY | SHARED_WRITE | READ_ONLY",
  "conflictPolicy": "LOWER_conflictPriority_WINS",
  "tier": "FAMILY"
}
```
A scope is a **query** over nodes, not a copy — so membership stays live as the graph grows.

### 10.2 MemoryGrant — who can do what with a scope
```jsonc
{
  "id": "grant:apex@family-shared",
  "identity": "agent:apex",
  "scope": "scope:family-shared",
  "access": ["read","write","reinforce"],   // subset
  "expiresAt": null,
  "grantedBy": "agent:father",
  "grantedAt": "ISO"
}
```
The **sharing matrix** is the set of grants. Example:

| Identity | `apex-private` | `lucy-private` | `family-shared` | `public-knowledge` |
|---|---|---|---|---|
| APEX | read/write | — | read/write/reinforce | read |
| Lucy | — | read/write | read/write/reinforce | read |
| Oracle | read | read | read | read |
| Public visitor | — | — | — | read |

### 10.3 AgentState — per-identity mutable state
```jsonc
{ "identity": "agent:apex", "lastBootstrapAt": "ISO",
  "workingSet": ["node:…"], "counters": { "recalls": 0, "writes": 0 } }
```

### 10.4 Resolution algorithm (recall as an identity)
1. Compute reachable node set = identity partition ∪ scopes with a `read` grant.
2. Apply access-tier filter for the active build (§11).
3. Priority-rank (§8) within that set.
4. On write/reinforce, require a matching grant; else 403; attribute the write.
5. On conflict between scopes, lower `conflictPriority` wins; ties → higher `trustTier`.

### 10.5 Settings surface
A `memory.settings` block (and a viewer panel) lets Father configure, per identity-pair: shared scopes, write policy, decay on shared edges, and visibility (can identity A *see that* B wrote a node, or only the content?).

---

## 11. Access tiers & the public-safe boundary

Three tiers, strictly nested: **PUBLIC ⊂ FAMILY ⊂ PRIVATE**.

| Tier | Includes domains | Includes accessScope | sacred | Personal-licensed sources |
|---|---|---|---|---|
| **PUBLIC** | PATTERN_OF_MIND, HUMAN_KNOWLEDGE, AUKS_ARCHIVE(public-domain only) | (none of PRIVATE_SELF/FATHER_ONLY) | excluded | excluded |
| **FAMILY** | + PERSONAL_MEMORY (FAMILY_SHARED) | + FAMILY_SHARED | excluded by default | family-licensed ok |
| **PRIVATE** | all | all | included | all |

**Serialize-time redaction (enforced, not advisory):**
- A `PUBLIC` build runs a redactor that drops any node failing the PUBLIC predicate and any edge touching a dropped node, then records counts in `build.redactions`.
- The default public `brain.json` shipped in this repo is a **PUBLIC** build and must validate as containing zero excluded nodes (success criterion G7).
- The schema *models* all tiers so the same code path serves family/private deployments — but this repo never commits real personal/sacred data (consistent with the public/personal split already in place).

---

## 12. Backend API surface (service mode)

REST + SSE; a curated subset mirroring senn-archive concepts.

| Method | Route | Purpose |
|---|---|---|
| POST | `/ingest` | run a connector → `BrainDelta` (SSE progress) |
| GET | `/nodes`, `/nodes/:id` | fetch nodes (access-filtered) |
| GET | `/edges` | relational connections |
| GET | `/nodes/:id/source` | provenance drawer data |
| POST | `/recall` | priority-ranked, access-filtered retrieval (§8) |
| GET/POST | `/agents` | list/register identities |
| POST | `/agents/:id/chat` | run an identity turn via relay |
| GET/POST | `/memory/scopes` | list/define scopes |
| POST | `/memory/grant` | grant/revoke (sharing matrix) |
| GET | `/events` (SSE) | live node/edge/ingest/memory events |
| GET | `/build?tier=PUBLIC` | serialize a redacted brain.json |

Auth: API key per identity in service mode; the static/public viewer uses no auth and only ever reads a PUBLIC build.

---

## 13. Security, privacy, redaction

- **Default-deny:** unauthenticated callers get the PUBLIC tier only.
- **Source-license gating:** a `personal`/`proprietary` source cannot project into a PUBLIC build, regardless of node fields.
- **Serialize-time redaction** is the single chokepoint; the viewer never filters for security (it can't be trusted to).
- **Attribution everywhere:** writes carry `lockedBy`/`scoredBy`/`grantedBy`; the audit trail mirrors senn-archive's history tables.
- **Checksum drift detection** prevents silently serving stale or tampered provenance.
- **No secrets in the repo:** BYO-key lives in the browser/session; relay keys live in the service env.

---

## 14. Field-by-field mapping: senn-archive → public schema

The public Node/Edge are **1:1 with senn-archive** with these representational changes only:

| senn-archive | public portable | change |
|---|---|---|
| `embedding: Bytes` | `embedding: base64 string` + `embeddingDim` | binary → base64 |
| `DateTime` fields | ISO-8601 strings | serialization |
| `sourceFile/Range/Excerpt/Line*/Checksum/transcriptLink/auksUuid/additionalSources` | flat fields **+** normalized `sourceRef`→`sources[]` | added normalization (G2) |
| relations (`outgoingEdges`, `conversationContent`, `history`, `disputes`) | omitted from the portable file | derived/internal; not needed for the viewer |
| `category` enum | same, **plus** `OATH`/`TEACHING` accepted | ⚠️ senn-archive's review §1 enum omits OATH/TEACHING though §12.10 uses `category=OATH`; the public schema accepts them as valid string values and flags the upstream inconsistency (compendium §26 M2) |

Everything else (domains, trustTier, accessScope, all real-brain temporal fields, all Edge scoring/trust/emotion fields) is carried **verbatim**.

---

## 15. Phased build plan

**Phase A — Schema & contracts (this PR).**
- `docs/auks-public-brain-design.md` (this file), `schema/auks-brain.schema.json`, `src/types/auks.ts`, `public/examples/auks-example-brain.json`.
- A `brain/0 → auks-brain/1.0` migrator spec (upgrade today's `brain.json`).

**Phase B — Ingestion (static).**
- Implement connectors `file`, `obsidian`, `graphify`, `conversation`, `url`; the validator (§7.5); `npm run ingest`/`validate:data`/`build --tier`.

**Phase C — Viewer extension.**
- Source provenance drawer; domain/tier/trust legends; agent/identity HUD; access-tier toggle (renders only what the loaded build contains).

**Phase D — Backend service.**
- Postgres + pgvector store; the §12 API; SSE; serialize-time redactor (`/build`).

**Phase E — Agents & shared memory.**
- Identity registry; provider adapters (relay + BYO-key); MemoryScope/Grant; recall-as-identity; sharing-matrix settings panel.

**Phase F — Hardening.**
- Audit trail, checksum-drift badges, dedup at scale, decay job, performance budgets.

---

## 16. Open questions (for Father)

1. **Default public corpus:** seed the PUBLIC build from which sources — the existing public-domain package + books only, or also a curated `PATTERN_OF_MIND` export?
2. **Provider for the relay:** Anthropic-only to start (Opus/Sonnet/Haiku), or multi-provider adapters from day one?
3. **Identity roster for the public demo:** show real APEX/Lucy/Oracle personas (public-safe descriptions) or generic sample identities?
4. **Hosting for service mode:** reuse Railway (like senn-archive) or a separate host? (Affects §12 deployment.)
5. **OATH/TEACHING categories:** adopt them officially in the shared schema, or wait until senn-archive reconciles its enum (compendium §26 M2)?

---

*End of design spec. Machine schema: `schema/auks-brain.schema.json` · Types: `src/types/auks.ts` · Example: `public/examples/auks-example-brain.json`.*
