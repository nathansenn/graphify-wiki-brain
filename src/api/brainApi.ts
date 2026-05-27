import type { BrainGraph } from "../lib/graph";
import { sanitizeGraph } from "../lib/graph";

export interface BookAsset {
  role: string;
  format: string;
  path: string;
  url: string;
  bytes: number;
  sha256: string;
}

export interface BookRecord {
  id: string;
  title: string;
  shortTitle: string;
  mainUrl: string;
  readerUrl?: string;
  summary: string;
  tags: string[];
  graphNodeId: string;
  graphUrl: string;
  sectionCount: number;
  assetNodeIds: string[];
  assets: BookAsset[];
}

export interface BooksResponse {
  generatedAt: string;
  source: string;
  count: number;
  books: BookRecord[];
}

export interface BrainApiResponse {
  graph: BrainGraph;
  sourcePath: string;
}

const API_BRAIN_PATH = "api/brain.json";
const API_BOOKS_PATH = "api/books.json";
const FALLBACK_BRAIN_PATH = "brain.json";
const FALLBACK_BOOKS_PATH = "books/books.manifest.json";

function publicUrl(path: string) {
  return `${import.meta.env.BASE_URL}${path}`;
}

async function fetchJson(path: string) {
  const response = await fetch(publicUrl(path), { cache: "no-cache" });
  if (!response.ok) throw new Error(`GET ${path} failed with HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

export async function fetchBrainGraph(): Promise<BrainApiResponse> {
  try {
    const graph = sanitizeGraph(await fetchJson(API_BRAIN_PATH), API_BRAIN_PATH);
    return { graph, sourcePath: graph.source?.path || API_BRAIN_PATH };
  } catch {
    const graph = sanitizeGraph(await fetchJson(FALLBACK_BRAIN_PATH), FALLBACK_BRAIN_PATH);
    return { graph, sourcePath: graph.source?.path || FALLBACK_BRAIN_PATH };
  }
}

export async function fetchBooks(): Promise<BooksResponse> {
  try {
    return (await fetchJson(API_BOOKS_PATH)) as BooksResponse;
  } catch {
    const manifest = (await fetchJson(FALLBACK_BOOKS_PATH)) as Omit<BooksResponse, "count" | "source">;
    return {
      ...manifest,
      source: FALLBACK_BOOKS_PATH,
      count: manifest.books?.length || 0,
      books: (manifest.books || []).map((book) => ({
        ...book,
        graphNodeId: `book:${book.id}`,
        graphUrl: FALLBACK_BRAIN_PATH,
        sectionCount: 0,
        assetNodeIds: [],
      })),
    };
  }
}
