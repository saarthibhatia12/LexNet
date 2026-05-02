// ============================================================================
// LexNet Frontend — GraphCanvas Component
// ============================================================================
//
// D3.js force-directed graph rendered as React SVG.
// Pattern: "D3 for math, React for DOM"
//   - D3 computes positions via forceSimulation
//   - React renders SVG elements (nodes, links, labels)
//   - useRef for SVG container, useEffect for simulation lifecycle
//
// Features:
//   - Force simulation: charge(-300), link(120), center, collision(30)
//   - Node colours by label (Person=blue, Property=emerald, etc.)
//   - Zoom/pan via d3.zoom
//   - Click node to select
//   - Drag nodes to reposition
//   - Highlighted selected node
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import type { GraphNode, GraphLink, GraphData } from '../hooks/useGraph';
import { GRAPH_FORCE_CONFIG, GRAPH_NODE_COLOURS } from '../utils/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GraphCanvasProps {
  data: GraphData;
  selectedNodeId: string | null;
  onNodeClick: (node: GraphNode) => void;
  width: number;
  height: number;
}

// Internal simulation types (D3 mutates source/target to objects)
type SimNode = GraphNode & d3.SimulationNodeDatum;
type SimLink = d3.SimulationLinkDatum<SimNode> & {
  id: string;
  type: string;
  properties: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GraphCanvas({
  data,
  selectedNodeId,
  onNodeClick,
  width,
  height,
}: GraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simLinks, setSimLinks] = useState<SimLink[]>([]);
  const [transform, setTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity);
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const dragRef = useRef<{ nodeId: string | null }>({ nodeId: null });

  // ---- Initialize / update simulation when data changes ----
  useEffect(() => {
    if (!data.nodes.length) {
      setSimNodes([]);
      setSimLinks([]);
      return;
    }

    // Copy nodes/links for D3 mutation
    const nodes: SimNode[] = data.nodes.map((n) => ({ ...n }));
    const links: SimLink[] = data.links.map((l) => ({
      ...l,
      source: typeof l.source === 'string' ? l.source : l.source.id,
      target: typeof l.target === 'string' ? l.target : l.target.id,
    })) as SimLink[];

    // Stop any existing simulation
    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(GRAPH_FORCE_CONFIG.linkDistance),
      )
      .force(
        'charge',
        d3.forceManyBody<SimNode>().strength(GRAPH_FORCE_CONFIG.chargeStrength),
      )
      .force(
        'center',
        d3.forceCenter<SimNode>(width / 2, height / 2).strength(GRAPH_FORCE_CONFIG.centerStrength),
      )
      .force(
        'collision',
        d3.forceCollide<SimNode>().radius(GRAPH_FORCE_CONFIG.collisionRadius),
      )
      .alphaDecay(0.02)
      .velocityDecay(0.3)
      .on('tick', () => {
        setSimNodes([...nodes]);
        setSimLinks([...links]);
      });

    simulationRef.current = simulation;

    return () => {
      simulation.stop();
    };
  }, [data, width, height]);

  // ---- Zoom/pan ----
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        setTransform(event.transform);
      });

    svg.call(zoomBehavior);

    return () => {
      svg.on('.zoom', null);
    };
  }, []);

  // ---- Drag handlers ----
  const handleDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent, node: SimNode) => {
      e.stopPropagation();
      dragRef.current.nodeId = node.id;

      const sim = simulationRef.current;
      if (sim) {
        sim.alphaTarget(0.3).restart();
      }
      node.fx = node.x;
      node.fy = node.y;
    },
    [],
  );

  const handleDrag = useCallback(
    (e: React.MouseEvent) => {
      if (!dragRef.current.nodeId || !simulationRef.current) return;
      const node = simNodes.find((n) => n.id === dragRef.current.nodeId);
      if (!node) return;

      const svgRect = svgRef.current?.getBoundingClientRect();
      if (!svgRect) return;

      node.fx = (e.clientX - svgRect.left - transform.x) / transform.k;
      node.fy = (e.clientY - svgRect.top - transform.y) / transform.k;
    },
    [simNodes, transform],
  );

  const handleDragEnd = useCallback(() => {
    if (!dragRef.current.nodeId) return;
    const node = simNodes.find((n) => n.id === dragRef.current.nodeId);
    if (node) {
      node.fx = null;
      node.fy = null;
    }
    dragRef.current.nodeId = null;

    const sim = simulationRef.current;
    if (sim) {
      sim.alphaTarget(0);
    }
  }, [simNodes]);

  // ---- Node radius by type ----
  const getNodeRadius = (node: SimNode): number => {
    if (node.label === 'Document') return 18;
    if (node.label === 'Person') return 16;
    if (node.label === 'Property') return 17;
    return 14;
  };

  if (!simNodes.length) {
    return (
      <div
        className="w-full h-full flex items-center justify-center bg-surface-800/30 rounded-xl border border-surface-700/20"
        id="graph-canvas-empty"
      >
        <p className="text-surface-200/25 text-sm">
          Search for a document hash to load the knowledge graph.
        </p>
      </div>
    );
  }

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="bg-surface-800/30 rounded-xl border border-surface-700/20 cursor-grab active:cursor-grabbing"
      onMouseMove={handleDrag}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
      id="graph-canvas"
    >
      {/* Defs */}
      <defs>
        {/* Arrowhead marker */}
        <marker
          id="arrowhead"
          viewBox="0 0 10 7"
          refX="28"
          refY="3.5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill="rgba(148, 163, 184, 0.3)"
          />
        </marker>

        {/* Glow filter for selected node */}
        <filter id="glow">
          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
        {/* Links */}
        {simLinks.map((link) => {
          const source = link.source as SimNode;
          const target = link.target as SimNode;

          if (
            source.x == null || source.y == null ||
            target.x == null || target.y == null
          ) {
            return null;
          }

          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2;

          const isConnected =
            selectedNodeId === source.id || selectedNodeId === target.id;

          return (
            <g key={link.id}>
              <line
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={isConnected ? 'rgba(148, 163, 184, 0.5)' : 'rgba(148, 163, 184, 0.15)'}
                strokeWidth={isConnected ? 1.5 : 1}
                markerEnd="url(#arrowhead)"
                className="transition-all duration-200"
              />
              {/* Relationship type label */}
              <text
                x={midX}
                y={midY - 4}
                textAnchor="middle"
                fill="rgba(148, 163, 184, 0.2)"
                fontSize={8}
                fontFamily="Inter, sans-serif"
                className="select-none pointer-events-none"
              >
                {link.type}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {simNodes.map((node) => {
          if (node.x == null || node.y == null) return null;

          const radius = getNodeRadius(node);
          const isSelected = selectedNodeId === node.id;

          return (
            <g
              key={node.id}
              className="cursor-pointer"
              onClick={() => onNodeClick(node)}
              onMouseDown={(e) => handleDragStart(e, node)}
            >
              {/* Selection ring */}
              {isSelected && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={radius + 6}
                  fill="none"
                  stroke={node.colour}
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  opacity={0.6}
                  filter="url(#glow)"
                />
              )}

              {/* Outer glow */}
              <circle
                cx={node.x}
                cy={node.y}
                r={radius + 2}
                fill={node.colour}
                opacity={isSelected ? 0.2 : 0.08}
              />

              {/* Main circle */}
              <circle
                cx={node.x}
                cy={node.y}
                r={radius}
                fill={node.colour}
                opacity={selectedNodeId && !isSelected ? 0.4 : 0.85}
                stroke={isSelected ? '#ffffff' : node.colour}
                strokeWidth={isSelected ? 2 : 1}
                className="transition-opacity duration-200"
              />

              {/* Icon letter */}
              <text
                x={node.x}
                y={node.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#ffffff"
                fontSize={radius * 0.7}
                fontWeight="bold"
                fontFamily="Inter, sans-serif"
                className="select-none pointer-events-none"
              >
                {node.label.charAt(0)}
              </text>

              {/* Label below */}
              <text
                x={node.x}
                y={node.y + radius + 12}
                textAnchor="middle"
                fill={isSelected ? '#ffffff' : 'rgba(226, 232, 240, 0.5)'}
                fontSize={10}
                fontWeight={isSelected ? '600' : '400'}
                fontFamily="Inter, sans-serif"
                className="select-none pointer-events-none transition-all duration-200"
              >
                {node.displayName.length > 16
                  ? node.displayName.substring(0, 14) + '…'
                  : node.displayName}
              </text>
            </g>
          );
        })}
      </g>

      {/* ---- Legend ---- */}
      <g transform="translate(16, 16)">
        {Object.entries(GRAPH_NODE_COLOURS).map(([label, colour], i) => (
          <g key={label} transform={`translate(0, ${i * 20})`}>
            <circle cx={6} cy={6} r={5} fill={colour} opacity={0.85} />
            <text
              x={16}
              y={10}
              fill="rgba(226, 232, 240, 0.4)"
              fontSize={9}
              fontFamily="Inter, sans-serif"
            >
              {label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
