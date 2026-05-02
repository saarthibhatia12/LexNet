// ============================================================================
// LexNet Frontend — useGraph Hook
// ============================================================================
//
// Fetches the knowledge graph from the GraphQL API and transforms
// the response into a D3-compatible node/link format.
//
// Also exposes a searchNodes function for the search bar.
// ============================================================================

import { useCallback, useMemo } from 'react';
import { useLazyQuery } from '@apollo/client';
import { GET_KNOWLEDGE_GRAPH, SEARCH_NODES } from '../graphql/queries';
import {
  GRAPH_NODE_COLOURS,
  GRAPH_NODE_DEFAULT_COLOUR,
} from '../utils/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw GraphQL node */
interface GqlNode {
  id: string;
  label: string;
  properties: Record<string, unknown> | null;
}

/** Raw GraphQL edge */
interface GqlEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown> | null;
}

/** D3-compatible simulation node */
export interface GraphNode {
  id: string;
  label: string;
  colour: string;
  displayName: string;
  properties: Record<string, unknown>;
  // D3 simulation will add these
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  vx?: number;
  vy?: number;
  index?: number;
}

/** D3-compatible simulation link */
export interface GraphLink {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
  properties: Record<string, unknown>;
}

/** Transformed graph data for D3 */
export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** Search result */
export interface NodeSearchResult {
  id: string;
  label: string;
  name: string;
  score: number;
}

// ---------------------------------------------------------------------------
// GQL response types
// ---------------------------------------------------------------------------

interface KnowledgeGraphData {
  getKnowledgeGraph: {
    nodes: GqlNode[];
    edges: GqlEdge[];
  };
}

interface KnowledgeGraphVars {
  docHash: string;
  depth?: number;
}

interface SearchNodesData {
  searchNodes: NodeSearchResult[];
}

interface SearchNodesVars {
  query: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a human-readable display name from node properties.
 */
function getDisplayName(node: GqlNode): string {
  const props = node.properties ?? {};
  return (
    (props.name as string) ??
    (props.title as string) ??
    (props.id as string) ??
    (props.hash as string)?.substring(0, 12) ??
    node.id.substring(0, 12)
  );
}

/**
 * Get node colour from the label-based palette.
 */
function getNodeColour(label: string): string {
  return GRAPH_NODE_COLOURS[label] ?? GRAPH_NODE_DEFAULT_COLOUR;
}

/**
 * Transform raw GQL response into D3-compatible format.
 */
function transformGraphData(
  nodes: GqlNode[],
  edges: GqlEdge[],
): GraphData {
  const graphNodes: GraphNode[] = nodes.map((n) => ({
    id: n.id,
    label: n.label,
    colour: getNodeColour(n.label),
    displayName: getDisplayName(n),
    properties: n.properties ?? {},
  }));

  // Only include edges whose source and target exist in the node set
  const nodeIds = new Set(graphNodes.map((n) => n.id));

  const graphLinks: GraphLink[] = edges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type,
      properties: e.properties ?? {},
    }));

  return { nodes: graphNodes, links: graphLinks };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGraph() {
  // ---- Knowledge graph query ----
  const [
    fetchGraph,
    { data: graphRaw, loading: graphLoading, error: graphError },
  ] = useLazyQuery<KnowledgeGraphData, KnowledgeGraphVars>(GET_KNOWLEDGE_GRAPH, {
    fetchPolicy: 'network-only',
  });

  // ---- Node search query ----
  const [
    fetchSearch,
    { data: searchRaw, loading: searchLoading },
  ] = useLazyQuery<SearchNodesData, SearchNodesVars>(SEARCH_NODES, {
    fetchPolicy: 'network-only',
  });

  // ---- Transformed graph data ----
  const graphData = useMemo<GraphData | null>(() => {
    if (!graphRaw?.getKnowledgeGraph) return null;
    const { nodes, edges } = graphRaw.getKnowledgeGraph;
    return transformGraphData(nodes, edges);
  }, [graphRaw]);

  // ---- Search results ----
  const searchResults = useMemo<NodeSearchResult[]>(
    () => searchRaw?.searchNodes ?? [],
    [searchRaw],
  );

  // ---- Fetch graph by document hash ----
  const loadGraph = useCallback(
    (docHash: string, depth = 2) => {
      fetchGraph({ variables: { docHash, depth } });
    },
    [fetchGraph],
  );

  // ---- Search nodes by query ----
  const searchNodes = useCallback(
    (query: string) => {
      if (query.trim().length < 2) return;
      fetchSearch({ variables: { query: query.trim() } });
    },
    [fetchSearch],
  );

  return {
    graphData,
    graphLoading,
    graphError: graphError?.message ?? null,
    loadGraph,
    searchNodes,
    searchResults,
    searchLoading,
  };
}
