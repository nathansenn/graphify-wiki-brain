import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  FileJson,
  GitFork,
  LocateFixed,
  Pause,
  Play,
  Search,
  Upload,
  X,
} from "lucide-react";
import BrainScene from "./components/BrainScene";
import { sampleBrain } from "./data/sampleBrain";
import "./App.css";
import type { BrainGraph, BrainNode } from "./lib/graph";
import { computeDegrees, describeNumber, sanitizeGraph } from "./lib/graph";

const DATA_URL = `${import.meta.env.BASE_URL}brain.json`;

function App() {
  const [graph, setGraph] = useState<BrainGraph>(sampleBrain);
  const [sourceLabel, setSourceLabel] = useState("sample brain");
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [orbiting, setOrbiting] = useState(true);
  const [sceneReady, setSceneReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadGraph() {
      try {
        const response = await fetch(DATA_URL, { cache: "no-cache" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = sanitizeGraph(await response.json(), "brain.json");
        if (!cancelled && data.nodes.length > 0) {
          setGraph(data);
          setSourceLabel(data.source?.path || "brain.json");
        }
      } catch {
        if (!cancelled) {
          setGraph(sampleBrain);
          setSourceLabel("sample brain");
        }
      }
    }

    loadGraph();
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(
    () => Array.from(new Set(graph.nodes.map((node) => node.group || "Knowledge"))).sort(),
    [graph.nodes],
  );
  const degrees = useMemo(() => computeDegrees(graph), [graph]);
  const selectedNode = useMemo(
    () => (selectedId ? graph.nodes.find((node) => node.id === selectedId) ?? null : null),
    [graph.nodes, selectedId],
  );
  const topNodes = useMemo(
    () =>
      [...graph.nodes]
        .sort((a, b) => (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0))
        .slice(0, 8),
    [degrees, graph.nodes],
  );
  const stats = useMemo(
    () => ({
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      groups: groups.length,
      hubs: graph.nodes.filter((node) => (degrees.get(node.id) ?? 0) >= 4).length,
    }),
    [degrees, graph.edges.length, graph.nodes, groups.length],
  );

  async function handleFile(file: File) {
    const text = await file.text();
    const loaded = sanitizeGraph(JSON.parse(text), file.name);
    setGraph(loaded);
    setSourceLabel(file.name);
    setSelectedId(null);
    setActiveGroup("all");
    setQuery("");
  }

  return (
    <main className="app-shell">
      <BrainScene
        graph={graph}
        query={query}
        group={activeGroup}
        selectedId={selectedId}
        orbiting={orbiting}
        onSelect={setSelectedId}
        onReady={() => setSceneReady(true)}
      />

      {!sceneReady && (
        <div className="loading-layer">
          <Brain size={42} />
          <span>Graphify Wiki Brain</span>
        </div>
      )}

      <header className="topbar" aria-label="Brain controls">
        <div className="brand-lockup">
          <Brain size={20} aria-hidden />
          <div>
            <strong>Graphify Wiki Brain</strong>
            <span>{sourceLabel}</span>
          </div>
        </div>

        <label className="search-box">
          <Search size={16} aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search nodes"
            aria-label="Search nodes"
          />
          {query && (
            <button type="button" className="icon-button compact" onClick={() => setQuery("")} aria-label="Clear search">
              <X size={15} />
            </button>
          )}
        </label>

        <div className="toolbar-actions">
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            className="icon-button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Load graph JSON"
            title="Load graph JSON"
          >
            <Upload size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setSelectedId(null)}
            aria-label="Reset focus"
            title="Reset focus"
          >
            <LocateFixed size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setOrbiting((value) => !value)}
            aria-label={orbiting ? "Pause orbit" : "Play orbit"}
            title={orbiting ? "Pause orbit" : "Play orbit"}
          >
            {orbiting ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <a
            className="icon-button"
            href="https://github.com/nathansenn/graphify-wiki-brain"
            aria-label="Open GitHub repository"
            title="Open GitHub repository"
          >
            <GitFork size={18} />
          </a>
        </div>
      </header>

      <aside className="left-panel" aria-label="Graph groups">
        <div className="stat-grid">
          <Stat label="Nodes" value={describeNumber(stats.nodes)} />
          <Stat label="Edges" value={describeNumber(stats.edges)} />
          <Stat label="Groups" value={describeNumber(stats.groups)} />
          <Stat label="Hubs" value={describeNumber(stats.hubs)} />
        </div>

        <div className="group-list" role="list" aria-label="Group filter">
          <button
            type="button"
            className={activeGroup === "all" ? "group-pill active" : "group-pill"}
            onClick={() => setActiveGroup("all")}
          >
            <span className="swatch all" />
            All
          </button>
          {groups.map((group) => (
            <button
              key={group}
              type="button"
              className={activeGroup === group ? "group-pill active" : "group-pill"}
              onClick={() => {
                setActiveGroup(group);
                setSelectedId(null);
              }}
            >
              <span className="swatch" data-group={group} />
              {group}
            </button>
          ))}
        </div>
      </aside>

      <aside className="right-panel" aria-label="Node detail">
        {selectedNode ? (
          <NodeDetail node={selectedNode} degree={degrees.get(selectedNode.id) ?? 0} />
        ) : (
          <div className="empty-detail">
            <FileJson size={18} />
            <strong>{graph.name}</strong>
            <span>{graph.source?.type ?? "json"}</span>
          </div>
        )}

        <div className="hub-list" aria-label="Top hubs">
          {topNodes.map((node) => (
            <button key={node.id} type="button" className="hub-row" onClick={() => setSelectedId(node.id)}>
              <span>{node.label}</span>
              <small>{degrees.get(node.id) ?? 0}</small>
            </button>
          ))}
        </div>
      </aside>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function NodeDetail({ node, degree }: { node: BrainNode; degree: number }) {
  return (
    <section className="node-detail">
      <span className="detail-kind">{node.kind || "node"}</span>
      <h1>{node.label}</h1>
      <dl>
        <div>
          <dt>Group</dt>
          <dd>{node.group || "Knowledge"}</dd>
        </div>
        <div>
          <dt>Degree</dt>
          <dd>{degree}</dd>
        </div>
      </dl>
      {node.summary && <p>{node.summary}</p>}
      {node.path && <code>{node.path}</code>}
      {node.tags && node.tags.length > 0 && (
        <div className="tag-row">
          {node.tags.slice(0, 8).map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      )}
      {node.url && (
        <a href={node.url} target="_blank" rel="noreferrer" className="detail-link">
          Open source
        </a>
      )}
    </section>
  );
}

export default App;
