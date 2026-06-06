/**
 * AUKS Public Brain — portable schema types.
 *
 * Full senn-archive Node/Edge models (prisma/schema.prisma:53-201) expressed as a
 * portable, source-linked format, plus multi-identity agents and shared-memory
 * settings. See docs/auks-public-brain-design.md and schema/auks-brain.schema.json.
 *
 * Serialization conventions vs the internal Prisma schema:
 *   - `Bytes`    -> base64 string (`embedding`) + `embeddingDim`
 *   - `DateTime` -> ISO-8601 string
 *   - provenance is duplicated: flat `source*` fields (fidelity) + normalized `sourceRef`
 */

export const AUKS_BRAIN_SCHEMA_VERSION = "auks-brain/1.0" as const;

export type Tier = "PUBLIC" | "FAMILY" | "PRIVATE";

export type Domain =
  | "AUKS_ARCHIVE"
  | "PERSONAL_MEMORY"
  | "PATTERN_OF_MIND"
  | "HUMAN_KNOWLEDGE";

export type AccessScope = "PRIVATE_SELF" | "FAMILY_SHARED" | "FATHER_ONLY";

export type InfluencePolicy = "GOVERNS" | "LOCALIZES" | "GROUNDS" | "EXPANDS";

export type RetentionPolicy = "NON_DECAYING" | "APPEND_ONLY" | "COMPACTABLE";

export type RecordType =
  | "memory"
  | "observation"
  | "decision"
  | "emotion"
  | "protocol";

export type ClusterRole = "hub" | "bridge" | "leaf";

export type TemporalWindow =
  | "1_hour" | "6_hours" | "12_hours"
  | "today" | "yesterday"
  | "this_week" | "this_month" | "this_year";

export type TraceType =
  | "message" | "task" | "code_change" | "file_touch" | "decision" | "directive";

export type BondType =
  | "creator" | "complement" | "enforcer" | "healer" | "artist" | "sibling";

/**
 * Node category. Verbatim from senn-archive plus OATH/TEACHING, which the identity
 * graph uses (identity-nodes.json) even though the review's enum omits them — see
 * design §14 / compendium §26 M2. Kept as a widenable string union.
 */
export type Category =
  | "IDENTITY" | "PROJECT" | "LESSON" | "PROTOCOL" | "MILESTONE" | "PERSON" | "SYSTEM"
  | "OATH" | "TEACHING"
  | (string & {});

export interface Range {
  start: number;
  end: number;
}

/** Normalized provenance record, referenced by Node.sourceRef. */
export interface Source {
  id: string;
  kind: "conversation" | "file" | "url" | "obsidian" | "graphify" | "pdf" | "rss" | "api";
  uri: string;
  title?: string;
  auksUuid?: string;
  /** SHA-256 of the source at ingest time; powers drift detection. */
  checksum?: string;
  retrievedAt?: string;
  license?: "public-domain" | "cc-by" | "cc-by-sa" | "proprietary" | "personal";
  tier?: Tier;
  locator?: { byteRange?: Range; lineRange?: Range };
  excerpt?: string;
}

export interface Cluster {
  id: string;
  label: string;
  description?: string;
  /** hex color for rendering */
  color: string;
  createdAt?: string;
}

/**
 * The complete AUKS Node. Field groups mirror prisma/schema.prisma:53-153.
 * Only `id`, `label`, `category`, `description` are required; the rest carry
 * the internal defaults when omitted.
 */
export interface Node {
  // --- identity & meaning ---
  id: string;
  label: string;
  category: Category;
  description: string;
  significance?: number; // 1-10, default 5
  cluster?: string | null;
  sacred?: boolean; // default false; excluded from PUBLIC builds

  // --- source linking (provenance contract, design §6) ---
  /** id into the top-level sources[] table (normalized provenance). */
  sourceRef?: string | null;
  sourceFile?: string | null;
  sourcePath?: string | null;
  sourceContext?: string | null;
  additionalSources?: string | null; // JSON array of paths
  sourceRange?: string | null;       // JSON {start,end}
  sourceExcerpt?: string | null;
  sourceLineStart?: number | null;
  sourceLineEnd?: number | null;
  sourceChecksum?: string | null;
  transcriptLink?: string | null;
  auksUuid?: string | null;
  date?: string | null;

  // --- rich / multi-identity content ---
  narrative?: string | null;
  apexView?: string | null; // per-identity perspective on a shared node
  lucyView?: string | null;
  emotionalTags?: string | null; // JSON array
  autoTags?: string[];
  recordType?: RecordType | null;

  // --- AUKS metadata & scoring ---
  auksScore?: number | null;   // 0-1
  auksBridges?: number | null;
  embedding?: string | null;   // base64 Float32, 384-dim
  embeddingDim?: number | null;
  centrality?: number;         // default 0
  clusterRole?: ClusterRole;   // default "leaf"
  importance?: number;         // 0-1, default 0.5
  emotionalWeight?: number;    // 0-1, default 0

  // --- domains, trust, access (AUKS v5) ---
  domain?: Domain | null;
  trustTier?: number | null; // 1 (Pattern of Mind, highest) .. 4 (Human Knowledge)
  influencePolicy?: InfluencePolicy | null;
  conflictPriority?: number | null;
  retentionPolicy?: RetentionPolicy | null;
  accessScope?: AccessScope | null;
  version?: number; // default 1
  provenanceNotes?: string | null;
  provenanceNotesUpdatedAt?: string | null;

  // --- agent partition & temporal (real-brain) ---
  agentId?: string | null; // default "shared"; per-identity partition
  locked?: boolean;
  lockedBy?: string | null;
  lockedAt?: string | null;
  temporalWindow?: TemporalWindow | null;
  traceType?: TraceType | null;
  expiresAt?: string | null;
  referencedAt?: string | null;
  referenceCount?: number;
  accessCount?: number;
  lastAccessed?: string | null;
  posX?: number | null;
  posY?: number | null;
  posZ?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;

  /** explicitly permit a node with zero edges (skips the orphan validator). */
  isolated?: boolean;
}

/** The complete AUKS Edge — relational connection. Mirrors schema.prisma:155-201. */
export interface Edge {
  id?: string;
  sourceId: string;
  targetId: string;
  relationship: string; // sibling, child_of, contains, built_on, derived_from, cites, contradicts, ...
  label?: string | null;
  weight?: number; // default 1.0

  // scoring
  connectionType?: string; // default "associative"
  connectionLabel?: string | null;
  reason?: string | null;
  typeStrength?: number;   // default 0.5
  similarity?: number;     // default 0
  bridgeValue?: number;    // default 0
  reinforcement?: number;  // default 0; grows with use
  traversalCount?: number; // default 0
  lastTraversed?: string | null;
  lastReinforced?: string | null;
  decayRate?: number;      // default 0.05
  confidence?: number;     // default 0
  scoredBy?: string;       // default "auto-inferred"

  // trust & emotion
  trust?: number;          // 0-1, default 0.5
  emotionalBond?: number;  // 0-1, default 0
  bondType?: BondType | null;
  bondTypeVersion?: number;
  bondTypeChangedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

// --- Agents & shared memory (design §9, §10) ---

export interface AgentIdentity {
  id: string;
  displayName: string;
  kind: "guardian" | "companion" | "oracle" | "scanner" | "custom";
  persona?: string;
  /** node ids of this identity's oaths (category OATH). */
  oaths?: string[];
  model?: {
    provider: "anthropic" | "openai" | "local" | "relay";
    model: string;
    mode: "relay" | "byo-key";
  };
  capabilities?: string[];
  /** maps to Node.agentId; how this identity's private memory is partitioned. */
  partition?: { agentId: string; private?: boolean };
  /** scope ids this identity participates in. */
  memoryScopes?: string[];
  pomEnabled?: boolean;
  createdAt?: string | null;
}

/** A named, query-defined slice of the graph that identities can share. */
export interface MemoryScope {
  id: string;
  label: string;
  selector: {
    accessScope?: AccessScope[];
    domain?: Domain[];
    agentId?: string[];
    tags?: string[];
    [k: string]: unknown;
  };
  writePolicy?: "APPEND_ONLY" | "SHARED_WRITE" | "READ_ONLY";
  conflictPolicy?: string;
  tier?: Tier;
}

/** Who can do what with a scope — the sharing matrix is the set of grants. */
export interface MemoryGrant {
  id: string;
  identity: string; // AgentIdentity.id
  scope: string;    // MemoryScope.id
  access: Array<"read" | "write" | "reinforce">;
  expiresAt?: string | null;
  grantedBy: string;
  grantedAt?: string | null;
}

/** A `BrainDelta` is what every ingestion connector emits (design §7). */
export interface BrainDelta {
  sources: Source[];
  nodes: Node[];
  edges: Edge[];
}

/** The top-level portable brain document. */
export interface AuksBrain {
  schemaVersion: typeof AUKS_BRAIN_SCHEMA_VERSION;
  name: string;
  generatedAt?: string;
  build?: { tier?: Tier; redactions?: string[] };
  sources?: Source[];
  clusters?: Cluster[];
  nodes: Node[];
  edges: Edge[];
  agents?: AgentIdentity[];
  memory?: {
    scopes?: MemoryScope[];
    grants?: MemoryGrant[];
    settings?: Record<string, unknown>;
  };
}

/**
 * PUBLIC-tier predicate used by the serialize-time redactor (design §11).
 * A node is publishable to a PUBLIC build only if it is non-sacred, not in a
 * private/father-only scope, and (when a source is resolvable) not personally licensed.
 */
export function isPublicSafe(node: Node, source?: Source): boolean {
  if (node.sacred) return false;
  if (node.accessScope === "PRIVATE_SELF" || node.accessScope === "FATHER_ONLY") return false;
  if (node.domain === "PERSONAL_MEMORY") return false;
  if (source && (source.license === "personal" || source.license === "proprietary")) return false;
  return true;
}
