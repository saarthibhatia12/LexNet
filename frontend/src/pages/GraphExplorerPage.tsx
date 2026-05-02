// ============================================================================
// LexNet Frontend — Graph Explorer Page
// ============================================================================
//
// Interactive knowledge graph exploration page:
//   - Search bar (searches nodes by name/text)
//   - Document hash input to load a graph neighbourhood
//   - D3 force-directed graph canvas
//   - Node detail side panel
//   - Responsive layout
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { useGraph } from '../hooks/useGraph';
import type { GraphNode } from '../hooks/useGraph';
import GraphCanvas from '../components/GraphCanvas';
import NodeDetail from '../components/NodeDetail';
import {
  Search,
  Network,
  Loader2,
  AlertTriangle,
  Hash,
  X,
  Maximize2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GraphExplorerPage() {
  const {
    graphData,
    graphLoading,
    graphError,
    loadGraph,
    searchNodes,
    searchResults,
    searchLoading,
  } = useGraph();

  const [hashInput, setHashInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 500 });

  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<number | null>(null);

  // ---- Responsive canvas sizing ----
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCanvasSize({
          width: Math.max(rect.width, 400),
          height: Math.max(window.innerHeight - 260, 400),
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // ---- Load graph from hash ----
  const handleLoadGraph = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = hashInput.trim().toLowerCase();
      if (!trimmed) return;
      setSelectedNode(null);
      loadGraph(trimmed);
    },
    [hashInput, loadGraph],
  );

  // ---- Search with debounce ----
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      if (value.trim().length >= 2) {
        searchTimeoutRef.current = window.setTimeout(() => {
          searchNodes(value.trim());
        }, 300);
      }
    },
    [searchNodes],
  );

  // ---- Node click ----
  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
  }, []);

  // ---- Navigate to node from search or neighbour click ----
  const handleSelectNodeById = useCallback(
    (nodeId: string) => {
      if (!graphData) return;
      const node = graphData.nodes.find((n) => n.id === nodeId);
      if (node) {
        setSelectedNode(node);
      }
    },
    [graphData],
  );

  // ---- Select search result ----
  const handleSearchResultClick = useCallback(
    (resultId: string) => {
      setShowSearch(false);
      setSearchQuery('');

      // If we have graph data and the node is in it, select it
      if (graphData) {
        const node = graphData.nodes.find((n) => n.id === resultId);
        if (node) {
          setSelectedNode(node);
          return;
        }
      }

      // Otherwise, load the graph for that node's hash
      loadGraph(resultId);
    },
    [graphData, loadGraph],
  );

  return (
    <div className="max-w-full mx-auto px-4 py-6 page-section">
      {/* ---- Header row ---- */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2" id="graph-heading">
            <Network className="text-violet-400" size={24} />
            Knowledge Graph Explorer
          </h1>
          <p className="text-sm text-surface-200/40 mt-1">
            Explore legal entity relationships with an interactive force-directed graph.
          </p>
        </div>

        {/* Toggle search */}
        <button
          onClick={() => setShowSearch(!showSearch)}
          className={`btn-secondary text-sm ${showSearch ? 'bg-lexnet-900/50 border-lexnet-500/40' : ''}`}
          id="graph-toggle-search"
        >
          <Search size={15} />
          Search
        </button>
      </div>

      {/* ---- Search bar ---- */}
      {showSearch && (
        <div className="glass-card p-4 mb-4 animate-slide-down relative" id="graph-search-panel">
          <div className="relative">
            <input
              type="text"
              className="input-field pl-10 text-sm"
              placeholder="Search nodes by name (e.g. Ram Kumar, PROP_001)…"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              autoFocus
              id="graph-search-input"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-200/30" size={16} />
            {searchLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-lexnet-400 animate-spin" size={16} />
            )}
          </div>

          {/* Search results dropdown */}
          {searchResults.length > 0 && searchQuery.length >= 2 && (
            <div className="absolute left-4 right-4 top-[calc(100%-4px)] z-20 glass-card border border-surface-700/40 max-h-60 overflow-y-auto">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleSearchResultClick(result.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-700/30 transition-colors"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: getSearchResultColour(result.label),
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-surface-200/80 truncate">{result.name}</p>
                    <p className="text-[10px] text-surface-200/30">{result.label}</p>
                  </div>
                  <span className="text-[10px] text-surface-200/20">
                    {(result.score * 100).toFixed(0)}%
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- Hash input ---- */}
      <form onSubmit={handleLoadGraph} className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <input
            type="text"
            className="input-field pl-10 font-mono text-sm"
            placeholder="Enter document hash to explore its knowledge graph…"
            value={hashInput}
            onChange={(e) => setHashInput(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            id="graph-hash-input"
          />
          <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-200/30" size={16} />
          {hashInput && (
            <button
              type="button"
              onClick={() => setHashInput('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-200/30 hover:text-surface-200/60 transition-colors"
              aria-label="Clear"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="submit"
          className="btn-primary text-sm"
          disabled={!hashInput.trim() || graphLoading}
          id="graph-load-btn"
        >
          {graphLoading ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <Maximize2 size={16} />
          )}
          Explore
        </button>
      </form>

      {/* ---- Error ---- */}
      {graphError && (
        <div
          className="flex items-start gap-2.5 p-3 rounded-lg bg-risk-high/10 border border-risk-high/20 mb-4 animate-slide-down"
          role="alert"
          id="graph-error"
        >
          <AlertTriangle className="text-risk-high flex-shrink-0 mt-0.5" size={16} />
          <p className="text-sm text-risk-high">{graphError}</p>
        </div>
      )}

      {/* ---- Graph + Detail Panel ---- */}
      <div className="flex gap-0 overflow-hidden rounded-xl" ref={containerRef}>
        {/* Canvas */}
        <div className="flex-1 min-w-0">
          <GraphCanvas
            data={graphData ?? { nodes: [], links: [] }}
            selectedNodeId={selectedNode?.id ?? null}
            onNodeClick={handleNodeClick}
            width={selectedNode ? canvasSize.width - 320 : canvasSize.width}
            height={canvasSize.height}
          />
        </div>

        {/* Node detail panel */}
        {selectedNode && graphData && (
          <NodeDetail
            node={selectedNode}
            links={graphData.links}
            allNodes={graphData.nodes}
            onClose={() => setSelectedNode(null)}
            onNodeClick={handleSelectNodeById}
          />
        )}
      </div>

      {/* ---- Stats bar ---- */}
      {graphData && graphData.nodes.length > 0 && (
        <div className="flex items-center gap-4 mt-3 px-1">
          <span className="text-xs text-surface-200/25">
            {graphData.nodes.length} nodes · {graphData.links.length} edges
          </span>
          <span className="text-xs text-surface-200/15">
            Drag nodes to reposition · Scroll to zoom · Click for details
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { GRAPH_NODE_COLOURS, GRAPH_NODE_DEFAULT_COLOUR } from '../utils/constants';

function getSearchResultColour(label: string): string {
  return GRAPH_NODE_COLOURS[label] ?? GRAPH_NODE_DEFAULT_COLOUR;
}
