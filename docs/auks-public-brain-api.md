# AUKS Public Brain — API Design

> **The full backend API** for the AUKS Public Brain (service mode). Companion to [`auks-public-brain-design.md`](auks-public-brain-design.md) (architecture + data model) and the machine spec [`schema/auks-brain-api.openapi.yaml`](../schema/auks-brain-api.openapi.yaml). Data objects conform to [`schema/auks-brain.schema.json`](../schema/auks-brain.schema.json).
>
> **Version:** v1 (`/v1`) · **Status:** design · **Compiled:** 2026-06-06
> **Realizes design goals** G1–G7: full schema, source-linked nodes, relational edges, source digestion, multi-identity agents, shared memory, public-safe tiers.

---

## 0. Contents

1. Conventions (base URL, versioning, content types)
2. Authentication, identities & roles
3. Access tiers & redaction (how every response is filtered)
4. Errors (RFC 9457 problem+json)
5. Pagination, filtering, sorting
6. Idempotency, concurrency, rate limits
7. Resource map (all endpoints at a glance)
8. Sources API
9. Nodes API
10. Edges API
11. Clusters API
12. Ingestion API ("digest a source")
13. Recall API (AUKS retrieval)
14. Agents / identities API
15. Agent chat (relay turn) API
16. Memory API (scopes, grants, sharing matrix, resolve)
17. Build / export API (tiered serialization)
18. Events API (SSE)
19. Audit & history API
20. Health, stats, capabilities
21. Webhooks (outbound)
22. End-to-end flows (curl)
23. Versioning & deprecation policy

---

## 1. Conventions

- **Base URL:** `https://{host}/v1`. The static viewer needs no API; service mode adds this surface.
- **Media types:** requests/responses are `application/json; charset=utf-8` unless noted. SSE streams are `text/event-stream`. Errors are `application/problem+json`.
- **Timestamps:** ISO-8601 UTC (`2026-06-06T10:00:00Z`).
- **IDs:** opaque strings; node/source ids are caller-meaningful (`node:…`, `src:…`), edge/job ids are server-issued.
- **Casing:** JSON fields are `camelCase`, matching `auks-brain.schema.json`.
- **Determinism:** all list endpoints are cursor-paginated and stably ordered.
- **No ambient state:** every request is independently authorized; there is no session beyond the bearer credential.

---

## 2. Authentication, identities & roles

Authentication binds a request to a **principal**. A principal is one of:

| Principal | Credential | Typical use |
|---|---|---|
| **Public** | none | read-only PUBLIC tier (the open viewer) |
| **Identity** | `Authorization: Bearer <api-key>` mapped to an `AgentIdentity` | an agent (APEX/Lucy/Oracle/custom) acting on its memory |
| **Father** (role) | identity with `role=father` | sacred writes, grants, tier overrides |

- Keys are issued out-of-band (service env / admin) and mapped to exactly one identity. Rotate by reissue; revoke by deletion.
- The resolved identity determines **memory reachability** (its partition ∪ granted scopes, design §10) and **role**.
- `X-Identity` MAY be sent by a trusted relay to act *as* an identity it owns (delegation); the relay key must itself be `role=father` or hold a delegation grant. Misuse → `403 delegation_denied`.
- BYO-key for chat (caller supplies their own provider key) travels only in the chat request body's `providerKey` and is **never stored** (design §13).

**Auth headers**
```
Authorization: Bearer sk_live_…           # principal credential
X-Identity: agent:lucy                     # optional delegation (trusted relays only)
Idempotency-Key: 9f1c…                     # optional, on unsafe methods (§6)
```

---

## 3. Access tiers & redaction

Every read is filtered to the principal's **maximum tier** before serialization — the single security chokepoint (design §11, §13):

| Principal | Max tier |
|---|---|
| Public | PUBLIC |
| Identity (non-father) | FAMILY (and only scopes it's granted) |
| Father | PRIVATE |

Rules enforced server-side on **every** node/edge response:
- Drop nodes failing the tier predicate (`sacred`, `PRIVATE_SELF`/`FATHER_ONLY`, `PERSONAL_MEMORY`, personal/proprietary-licensed source) for sub-tier principals.
- Drop edges that reference a dropped node.
- Field-level redaction: even within tier, fields like `embedding` are omitted unless `?include=embedding`.
- Responses carry `X-Brain-Tier: PUBLIC|FAMILY|PRIVATE` and, when anything was withheld, `X-Brain-Redactions: <count>`.

A response **never** depends on the client to filter.

---

## 4. Errors — RFC 9457 `application/problem+json`

```json
{
  "type": "https://docs.auks.dev/errors/access_denied",
  "title": "Access denied",
  "status": 403,
  "detail": "Identity agent:lucy lacks write grant on scope:apex-private.",
  "instance": "/v1/nodes/node:foo",
  "code": "grant_required",
  "requestId": "req_01HZX…"
}
```

| HTTP | `code` examples |
|---|---|
| 400 | `validation_failed`, `bad_cursor`, `unsupported_connector` |
| 401 | `unauthenticated` |
| 403 | `access_denied`, `grant_required`, `sacred_write_blocked`, `delegation_denied`, `tier_exceeded` |
| 404 | `not_found` |
| 409 | `conflict`, `version_conflict`, `duplicate_idempotency_key` |
| 413 | `payload_too_large` |
| 422 | `provenance_required`, `orphan_node`, `embedding_dim_mismatch` |
| 429 | `rate_limited` (+ `Retry-After`) |
| 500 / 503 | `internal`, `store_unavailable` |

All errors include `requestId` (also returned as `X-Request-Id`) for tracing against audit logs.

---

## 5. Pagination, filtering, sorting

- **Cursor pagination:** `?limit=` (default 50, max 500) + `?cursor=`. Responses:
  ```json
  { "data": [ … ], "page": { "nextCursor": "eyJ…", "hasMore": true, "count": 50 } }
  ```
- **Filtering** (list endpoints): `domain`, `trustTier`, `accessScope`, `cluster`, `agentId`, `category`, `tag`, `sacred`, `since`/`until` (on `updatedAt`), `q` (text/semantic). Repeatable params are OR within a key, AND across keys.
- **Sorting:** `?sort=` with `-` prefix for desc, e.g. `?sort=-importance`, `?sort=-updatedAt`. Recall uses its own priority ordering (§13).
- **Field selection:** `?fields=id,label,domain` (sparse) and `?include=embedding,source,edges` (expansions, opt-in for heavy fields).

---

## 6. Idempotency, concurrency, rate limits

- **Idempotency:** unsafe methods accept `Idempotency-Key`; replays within 24h return the original result (`409 duplicate_idempotency_key` if the body differs).
- **Optimistic concurrency:** `Node`/`Edge` carry `version`; `PATCH` may send `If-Match: "<version>"`; mismatch → `409 version_conflict`. Ingestion bumps `version` and records a provenance diff.
- **Rate limits:** per-principal token bucket; headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. `429` includes `Retry-After`. Suggested defaults: public 60/min read-only; identity 600/min; ingestion 10 concurrent jobs/identity.

---

## 7. Resource map

| Group | Method · Path |
|---|---|
| Sources | `GET /sources` · `POST /sources` · `GET /sources/{id}` |
| Nodes | `GET /nodes` · `POST /nodes` · `GET /nodes/{id}` · `PATCH /nodes/{id}` · `DELETE /nodes/{id}` · `GET /nodes/{id}/source` · `GET /nodes/{id}/edges` · `GET /nodes/{id}/neighbors` · `GET /nodes/{id}/history` |
| Edges | `GET /edges` · `POST /edges` · `GET /edges/{id}` · `PATCH /edges/{id}` · `DELETE /edges/{id}` · `POST /edges/{id}/reinforce` |
| Clusters | `GET /clusters` · `POST /clusters` · `GET /clusters/{id}` |
| Ingestion | `GET /connectors` · `POST /ingest` · `GET /ingest/jobs/{id}` · `GET /ingest/jobs/{id}/events` (SSE) |
| Recall | `POST /recall` · `GET /search` |
| Agents | `GET /agents` · `POST /agents` · `GET /agents/{id}` · `PATCH /agents/{id}` · `DELETE /agents/{id}` · `GET /agents/{id}/state` |
| Chat | `POST /agents/{id}/chat` (SSE-capable) |
| Memory | `GET /memory/scopes` · `POST /memory/scopes` · `GET\|PATCH\|DELETE /memory/scopes/{id}` · `GET /memory/grants` · `POST /memory/grants` · `DELETE /memory/grants/{id}` · `GET /memory/matrix` · `POST /memory/resolve` |
| Build | `POST /build` · `GET /build/jobs/{id}` · `GET /build/jobs/{id}/artifact` |
| Events | `GET /events` (SSE) |
| Audit | `GET /audit` |
| Ops | `GET /health` · `GET /stats` · `GET /capabilities` |

---

## 8. Sources API

The provenance table (design §6). Every node must resolve a source in FAMILY/PUBLIC builds.

### `GET /sources`
List sources. Filters: `kind`, `license`, `tier`, `q`. → `data: Source[]`.

### `POST /sources`
Register a source (usually done implicitly by ingestion, but allowed directly).
```json
{ "id":"src:my-doc", "kind":"file", "uri":"notes/build.md",
  "title":"Build log", "license":"public-domain", "tier":"PUBLIC" }
```
→ `201 Source`. `checksum` is computed server-side if the `uri` is fetchable.

### `GET /sources/{id}`
→ `Source`, including `locator` and `excerpt`. Used by the viewer's source drawer.

---

## 9. Nodes API

### `GET /nodes`
List/query nodes (tier-filtered, §3). Common params: `domain`, `trustTier`, `cluster`, `agentId`, `category`, `tag`, `q`, `sort`, `fields`, `include`.
```
GET /v1/nodes?domain=PATTERN_OF_MIND&sort=-importance&include=source&limit=100
```
→ `{ data: Node[], page }`. With `include=source`, each node embeds its resolved `Source`.

### `POST /nodes`
Create a node. **Provenance is mandatory** for FAMILY/PUBLIC (`422 provenance_required` otherwise). Writes are attributed to the principal identity (`lockedBy`/audit). Sacred creation requires `role=father` (`403 sacred_write_blocked`).
```json
{ "id":"note:build-log","label":"Build Log","category":"PROJECT",
  "description":"…","domain":"HUMAN_KNOWLEDGE","trustTier":4,
  "accessScope":"FAMILY_SHARED","sourceRef":"src:my-doc",
  "sourceLineStart":1,"sourceLineEnd":20,"agentId":"lucy" }
```
→ `201 Node`. Server may schedule embedding-on-write (design §8); poll the node until `embedding` populates, or subscribe to `/events`.

### `GET /nodes/{id}`
→ `Node` (tier-filtered). `?include=edges,source,embedding`.

### `PATCH /nodes/{id}`
Partial update. `If-Match: "<version>"` for optimistic concurrency. Sacred/locked nodes reject non-father writes. Field changes are recorded to history.

### `DELETE /nodes/{id}`
Soft-delete (tombstone) by default; `?hard=true` (father only) purges. Cascades edge removal.

### `GET /nodes/{id}/source`
Provenance drawer payload: resolved `Source` + per-node `locator` override + checksum-drift status (`fresh|drifted|unknown`).

### `GET /nodes/{id}/edges` · `GET /nodes/{id}/neighbors`
Edges incident to the node / the 1-hop neighborhood (nodes + edges), tier-filtered. `?relationship=`, `?direction=in|out|both`, `?minWeight=`.

### `GET /nodes/{id}/history`
Field-level change log (audit, §19).

---

## 10. Edges API — relational connections

### `GET /edges`
List edges. Filters: `sourceId`, `targetId`, `relationship`, `bondType`, `minWeight`, `minTrust`. Tier-filtered (an edge is visible only if both endpoints are).

### `POST /edges`
Create a typed relation. `422 orphan_node` if an endpoint doesn't exist (unless the node is `isolated`).
```json
{ "sourceId":"note:a","targetId":"note:b","relationship":"derived_from",
  "label":"built on","weight":0.8,"similarity":0.7,"bridgeValue":0.4,
  "bondType":"sibling","trust":0.6,"scoredBy":"agent:lucy" }
```
→ `201 Edge` (server issues `id`).

### `PATCH /edges/{id}` · `DELETE /edges/{id}`
Update scoring/labels; delete. `bondType` changes bump `bondTypeVersion` + `bondTypeChangedAt` and are audited (who changed a bond, when — design §5.3).

### `POST /edges/{id}/reinforce`
The "remember" signal (design §8). Body: `{ "amount": 1.0, "reason": "recall-contribution" }`. Increments `reinforcement`, sets `lastReinforced=now`, optionally `traversalCount++`. Requires a `reinforce` grant on a scope covering both endpoints.

---

## 11. Clusters API
`GET /clusters` → `Cluster[]`; `POST /clusters` (label, color, description); `GET /clusters/{id}` → cluster + member summary (counts by domain/role).

---

## 12. Ingestion API — "digest a source"

Realizes G4 (design §7). Ingestion is **async**: a job runs the pipeline and emits a `BrainDelta`.

### `GET /connectors`
→ available connectors with their option schemas:
```json
{ "data":[
  {"name":"file","options":{"path":"string","tier":"PUBLIC|FAMILY|PRIVATE"}},
  {"name":"obsidian","options":{"vault":"string"}},
  {"name":"graphify","options":{"graphPath":"string"}},
  {"name":"conversation","options":{"path":"string","auksUuid":"string?"}},
  {"name":"url","options":{"url":"string","license":"string?"}},
  {"name":"pdf","options":{"path":"string"}},
  {"name":"rss","options":{"feed":"string","since":"ISO?"}}
]}
```

### `POST /ingest`
Start a digestion job.
```json
{ "connector":"conversation",
  "options":{ "path":"public/conversations-json/26e62158.json", "auksUuid":"26e62158-…" },
  "tier":"PUBLIC",
  "dryRun":false }
```
→ `202 { "jobId":"job_01HZ…", "status":"queued", "links":{ "self":"/v1/ingest/jobs/job_01HZ…","events":"/v1/ingest/jobs/job_01HZ…/events" } }`.

- `dryRun:true` runs the pipeline + validator (design §7.5) and returns the `BrainDelta` **without committing** — use for review.
- The validator's hard rules apply: provenance required, ≥1 edge per node, no tier violations, `embeddingDim` matches. Failures → job `status:"failed"` with a `problems[]` array.

### `GET /ingest/jobs/{id}`
→ job record:
```json
{ "jobId":"job_01HZ…","status":"running|succeeded|failed",
  "connector":"conversation","tier":"PUBLIC",
  "progress":{"stage":"embed","done":120,"total":300},
  "result":{"nodes":300,"edges":540,"sources":1,"deduped":12},
  "problems":[] }
```

### `GET /ingest/jobs/{id}/events` (SSE)
Streams `ingest_progress` events per stage (connect → extract → chunk → embed → link → dedup → access-tag → score → validate → commit) and a terminal `ingest_complete`/`ingest_failed`.

---

## 13. Recall API — AUKS retrieval

The heart of "retrieve the right memory, not the similar one" (design §8). Ranks by the priority formula, filtered to the caller identity's reachable memory.

### `POST /recall`
```json
{ "query":"what is the sacred priority thesis?",
  "asIdentity":"agent:apex",
  "topK":10,
  "filters":{ "domain":["PATTERN_OF_MIND","HUMAN_KNOWLEDGE"], "minTrustTier":1 },
  "include":["source","why"] }
```
→
```json
{ "data":[
  { "node": Node,
    "priority": 543.0,
    "scores": { "sacred":1.0,"significance":3.0,"similarity":1.85,
                "recency":1.0,"reinforcement":3.4,"bridge":2.0,
                "emotional":2.0,"trustTier":1.8 },
    "why": "sacred=false; high significance + tier-1 authority + recent reinforcement",
    "source": Source }
  ],
  "ranking": { "formula":"auks-priority/1.0", "tier":"FAMILY" } }
```
- `asIdentity` is honored only if the principal owns/was delegated it; otherwise the principal's own identity is used.
- Reachable set = identity partition ∪ read-granted scopes (design §10.4), then tier filter (§3), then priority rank.
- Side effect (opt-out via `?reinforce=false`): contributing edges are reinforced and nodes' `referencedAt`/`referenceCount` updated — the loop that makes the brain improve with use.

### `GET /search`
Lightweight similarity-only search (`?q=`, `?limit=`) for autocomplete/typeahead — **not** priority-ranked; use `/recall` for retrieval that respects AUKS semantics.

---

## 14. Agents / identities API

Realizes G5 (design §9).

### `GET /agents` · `GET /agents/{id}`
List/fetch identities. Public principals see public-safe persona fields only (no keys, no private scope membership).

### `POST /agents`
Register an identity (father only).
```json
{ "id":"agent:selah","displayName":"Selah","kind":"custom",
  "persona":"…","oaths":["oath:…"],
  "model":{"provider":"anthropic","model":"claude-opus-4-8","mode":"relay"},
  "capabilities":["recall","ingest","reflect"],
  "partition":{"agentId":"selah","private":true},
  "pomEnabled":true }
```
→ `201 AgentIdentity`. Creating an identity provisions its private partition (`agentId`) and an empty private scope.

### `PATCH /agents/{id}` · `DELETE /agents/{id}`
Update persona/model/capabilities; delete (father only; deletion does not delete the identity's nodes, only its access — those revert to `agentId="shared"` or are archived per policy).

### `GET /agents/{id}/state`
→ `AgentState`: `lastBootstrapAt`, `workingSet`, counters (recalls/writes/reinforcements).

---

## 15. Agent chat (relay turn) API

### `POST /agents/{id}/chat`
Run one identity turn through the relay: recall-as-identity → provider call → optional write-back.
```json
{ "message":"How should I scope this task?",
  "stream":true,
  "recall":{ "topK":8, "filters":{ "domain":["PATTERN_OF_MIND"] } },
  "writeBack":true,
  "providerKey":"sk-ant-…"   // optional BYO-key; never stored
}
```
- **Non-stream:** → `{ "reply":"…","usedNodes":["node:…"],"rounds":1,"verifierScore":92,"wrote":["node:…"] }`.
- **Stream (`stream:true`):** `text/event-stream` with events `recall_done` (the context node ids), `token` (incremental text), `tool` (if the relay runs the POM/inference loop), and `done` (final usage + write-back summary).
- **Memory effects:** reads honor the identity's grants; `writeBack:true` appends a `traceType:"message"` node to the identity's partition and reinforces contributing edges. Writes to shared scopes require a `write` grant.
- **Multiple identities:** call `/agents/{a}/chat` and `/agents/{b}/chat` independently; what each sees is governed entirely by its grants — this is how two identities collaborate over `scope:family-shared` while keeping private partitions separate.

---

## 16. Memory API — scopes, grants, sharing matrix

Realizes G6 (design §10).

### `GET /memory/scopes` · `POST /memory/scopes`
List/define scopes. A scope is a live **selector** over nodes, not a copy.
```json
{ "id":"scope:family-shared","label":"Family Shared Memory",
  "selector":{ "accessScope":["FAMILY_SHARED"],"agentId":["shared"] },
  "writePolicy":"APPEND_ONLY","tier":"FAMILY" }
```

### `GET|PATCH|DELETE /memory/scopes/{id}`
Manage a scope (father only for write).

### `GET /memory/grants` · `POST /memory/grants` · `DELETE /memory/grants/{id}`
The **sharing matrix** is the set of grants. Grant/revoke (father only):
```json
{ "identity":"agent:lucy","scope":"scope:family-shared",
  "access":["read","write","reinforce"] }
```
→ `201 MemoryGrant`. Revoke via `DELETE`.

### `GET /memory/matrix`
Rendered sharing matrix for the viewer settings panel:
```json
{ "identities":["agent:apex","agent:lucy","agent:oracle"],
  "scopes":["scope:apex-private","scope:lucy-private","scope:family-shared","scope:public-knowledge"],
  "cells":{ "agent:apex":{"scope:family-shared":["read","write","reinforce"], … } } }
```

### `POST /memory/resolve`
"What can identity X actually see/do?" — debugging + UI.
```json
{ "identity":"agent:lucy", "action":"read" }
```
→ `{ "reachableScopes":[…], "nodeCount":1234, "deniedScopes":["scope:apex-private"], "effectiveTier":"FAMILY" }`.

---

## 17. Build / export API — tiered serialization

The redaction chokepoint (design §11) exposed as an endpoint. Produces a portable `AuksBrain` document (the format the static viewer reads).

### `POST /build`
```json
{ "tier":"PUBLIC", "include":["agents","memory"], "name":"Public Brain" }
```
→ `202 { "jobId":"build_01HZ…" }`. The builder runs `isPublicSafe()` over every node, drops failures + dangling edges, and records counts.

### `GET /build/jobs/{id}` · `GET /build/jobs/{id}/artifact`
Job status, then the artifact:
```json
{ "schemaVersion":"auks-brain/1.0","name":"Public Brain",
  "build":{"tier":"PUBLIC","redactions":["482 nodes dropped (sacred/personal)","31 edges dropped"]},
  "sources":[…],"nodes":[…],"edges":[…],"agents":[…],"memory":{…} }
```
A PUBLIC artifact is guaranteed to contain zero `sacred`/`PRIVATE_SELF`/`FATHER_ONLY`/`PERSONAL_MEMORY` nodes (G7). This is what gets committed to `public/brain.json`.

---

## 18. Events API (SSE)

### `GET /events`
`text/event-stream` of brain mutations, tier-filtered to the principal. Supports `Last-Event-ID` replay (server keeps a ring buffer, mirroring senn-archive's bus).

Event types: `node_created`, `node_updated`, `node_deleted`, `edge_created`, `edge_deleted`, `edge_reinforced`, `cluster_updated`, `ingest_progress`, `ingest_complete`, `memory_granted`, `memory_revoked`, `build_complete`, `sync_complete`.

Frame:
```
id: 10231
event: edge_reinforced
data: {"edgeId":"e3","reinforcement":4.0,"by":"agent:apex","ts":1780000000.5}
```
Query `?types=node_created,edge_reinforced` to subscribe to a subset. 30s heartbeat comments keep the connection alive.

---

## 19. Audit & history API

### `GET /audit`
High-level audit log (mirrors senn-archive `BrainAuditLog`): `entityType`, `entityId`, `action`, `actor`, `summary`, `ts`. Filters: `actor`, `entityType`, `action`, `since`. Father-only beyond PUBLIC-safe entries.

### `GET /nodes/{id}/history`
Field-level `NodeHistory` for one node (`field`, `oldValue`, `newValue`, `changedBy`, `reason`, `ts`). Every write attributes its principal.

---

## 20. Health, stats, capabilities

- `GET /health` → `{ "status":"ok","store":"ok","embedder":"ok" }` (`503` if degraded).
- `GET /stats` → counts (nodes/edges/sources by domain/tier), embedding coverage, last ingest, decay backlog.
- `GET /capabilities` → server feature flags + limits: connectors, providers available for relay, max upload, rate limits, schema version. Lets clients adapt without trial-and-error.

---

## 21. Webhooks (outbound, optional)

Register a URL to receive mutation events server-to-server (alternative to holding an SSE connection):
- `POST /webhooks` `{ "url":"https://…","types":["build_complete","ingest_complete"],"secret":"…" }`.
- Deliveries are signed `X-AUKS-Signature: sha256=…` (HMAC of body with the secret), retried with backoff, and idempotent on `X-AUKS-Delivery`.

---

## 22. End-to-end flows (curl)

**Digest a conversation into the brain (dry run, then commit):**
```bash
curl -sX POST $API/ingest -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"connector":"conversation","options":{"path":"…26e62158.json"},"tier":"PUBLIC","dryRun":true}'
# review the returned BrainDelta, then:
curl -sX POST $API/ingest -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"connector":"conversation","options":{"path":"…26e62158.json"},"tier":"PUBLIC"}'
```

**Recall as APEX:**
```bash
curl -sX POST $API/recall -H "Authorization: Bearer $APEX_KEY" -H 'content-type: application/json' \
  -d '{"query":"sacred priority thesis","asIdentity":"agent:apex","topK":5,"include":["source","why"]}'
```

**Share a scope with Lucy, then chat:**
```bash
curl -sX POST $API/memory/grants -H "Authorization: Bearer $FATHER_KEY" -H 'content-type: application/json' \
  -d '{"identity":"agent:lucy","scope":"scope:family-shared","access":["read","write","reinforce"]}'

curl -N -X POST $API/agents/agent:lucy/chat -H "Authorization: Bearer $LUCY_KEY" -H 'content-type: application/json' \
  -d '{"message":"what did APEX learn about scoping?","stream":true,"recall":{"topK":8}}'
```

**Build & export the public brain:**
```bash
JOB=$(curl -sX POST $API/build -H "Authorization: Bearer $FATHER_KEY" -d '{"tier":"PUBLIC"}' | jq -r .jobId)
curl -s $API/build/jobs/$JOB/artifact -H "Authorization: Bearer $FATHER_KEY" > public/brain.json
```

---

## 23. Versioning & deprecation

- **URL-versioned** (`/v1`). Additive changes (new fields/endpoints) are non-breaking and ship within `v1`.
- Breaking changes → `/v2`; `v1` is supported ≥6 months after `v2` GA, with `Deprecation` + `Sunset` headers on `v1` during the window.
- `schemaVersion` (`auks-brain/1.0`) and `ranking.formula` (`auks-priority/1.0`) are versioned independently so data/format and retrieval-math evolution don't force an API bump.

---

*Machine spec: [`schema/auks-brain-api.openapi.yaml`](../schema/auks-brain-api.openapi.yaml). Data schema: [`schema/auks-brain.schema.json`](../schema/auks-brain.schema.json). Architecture: [`auks-public-brain-design.md`](auks-public-brain-design.md).*
