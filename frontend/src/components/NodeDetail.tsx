// ============================================================================
// LexNet Frontend — NodeDetail Component
// ============================================================================
//
// Side panel that shows details of a clicked graph node:
//   - Node label with colour indicator
//   - Display name
//   - All properties in a key-value list
//   - Connected neighbours with relationship types
// ============================================================================

import { X, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { GraphNode, GraphLink } from '../hooks/useGraph';
import {
  GRAPH_NODE_COLOURS,
  GRAPH_NODE_DEFAULT_COLOUR,
} from '../utils/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Neighbour {
  node: GraphNode;
  relationship: string;
  direction: 'outgoing' | 'incoming';
}

interface NodeDetailProps {
  node: GraphNode;
  links: GraphLink[];
  allNodes: GraphNode[];
  onClose: () => void;
  onNodeClick: (nodeId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NodeDetail({
  node,
  links,
  allNodes,
  onClose,
  onNodeClick,
}: NodeDetailProps) {
  // Build neighbour list
  const neighbours = getNeighbours(node, links, allNodes);

  // Determine link for this node type
  const nodeLink = getNodeLink(node);

  return (
    <div
      className="w-80 flex-shrink-0 glass-card border-l border-surface-700/50 overflow-y-auto animate-slide-left"
      id="node-detail-panel"
    >
      {/* ---- Header ---- */}
      <div className="sticky top-0 z-10 bg-surface-800/90 backdrop-blur-sm px-4 py-3 border-b border-surface-700/30 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: node.colour }}
          />
          <span className="text-xs font-medium text-surface-200/50 uppercase tracking-wider truncate">
            {node.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-surface-200/30 hover:text-surface-200/70 hover:bg-surface-700/40 transition-all"
          aria-label="Close details"
          id="node-detail-close"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* ---- Display name ---- */}
        <div>
          <h3 className="text-lg font-semibold text-white" id="node-detail-name">
            {node.displayName}
          </h3>
          <p className="text-xs text-surface-200/30 font-mono mt-0.5 break-all">
            {node.id}
          </p>
          {nodeLink && (
            <Link
              to={nodeLink}
              className="inline-flex items-center gap-1 text-xs text-lexnet-400 hover:text-lexnet-300 mt-1 transition-colors"
            >
              View Details <ExternalLink size={11} />
            </Link>
          )}
        </div>

        {/* ---- Properties ---- */}
        {Object.keys(node.properties).length > 0 && (
          <div>
            <h4 className="text-xs text-surface-200/30 uppercase tracking-wider font-medium mb-2">
              Properties
            </h4>
            <div className="space-y-1">
              {Object.entries(node.properties)
                .filter(([key]) => key !== '__typename')
                .map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-start gap-2 px-3 py-2 rounded-lg bg-surface-800/40 border border-surface-700/20"
                  >
                    <span className="text-[10px] text-surface-200/30 uppercase tracking-wider min-w-[60px] pt-0.5 flex-shrink-0">
                      {formatKey(key)}
                    </span>
                    <span className="text-sm text-surface-200/70 break-all">
                      {formatValue(value)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ---- Neighbours ---- */}
        {neighbours.length > 0 && (
          <div>
            <h4 className="text-xs text-surface-200/30 uppercase tracking-wider font-medium mb-2">
              Connections ({neighbours.length})
            </h4>
            <div className="space-y-1.5">
              {neighbours.map((neighbour, i) => (
                <button
                  key={`${neighbour.node.id}-${i}`}
                  onClick={() => onNodeClick(neighbour.node.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-surface-800/30
                             border border-surface-700/20 hover:border-lexnet-600/30 hover:bg-surface-700/30
                             transition-all duration-200 text-left group"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: neighbour.node.colour }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-surface-200/70 group-hover:text-white truncate transition-colors">
                      {neighbour.node.displayName}
                    </p>
                    <p className="text-[10px] text-surface-200/25">
                      <span className={neighbour.direction === 'outgoing' ? 'text-accent-500/60' : 'text-lexnet-400/60'}>
                        {neighbour.direction === 'outgoing' ? '→' : '←'}
                      </span>{' '}
                      {neighbour.relationship}
                    </p>
                  </div>
                  <span className="text-[9px] text-surface-200/20 uppercase tracking-wider">
                    {neighbour.node.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {neighbours.length === 0 && (
          <p className="text-xs text-surface-200/25 text-center py-4">
            No connected nodes found.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNeighbours(
  node: GraphNode,
  links: GraphLink[],
  allNodes: GraphNode[],
): Neighbour[] {
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const result: Neighbour[] = [];

  for (const link of links) {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;

    if (sourceId === node.id) {
      const target = nodeMap.get(targetId);
      if (target) {
        result.push({ node: target, relationship: link.type, direction: 'outgoing' });
      }
    } else if (targetId === node.id) {
      const source = nodeMap.get(sourceId);
      if (source) {
        result.push({ node: source, relationship: link.type, direction: 'incoming' });
      }
    }
  }

  return result;
}

function getNodeLink(node: GraphNode): string | null {
  if (node.label === 'Document') {
    const hash = (node.properties.hash as string) ?? node.id;
    return `/document/${hash}`;
  }
  if (node.label === 'Property') {
    const propId = (node.properties.id as string) ?? node.id;
    return `/timeline/${propId}`;
  }
  return null;
}

function formatKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
