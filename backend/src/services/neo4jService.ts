// ============================================================================
// LexNet Backend — Neo4j Service
// ============================================================================
//
// Provides parameterized Cypher query execution and domain-specific graph
// queries for the knowledge graph, node search, and property timeline.
//
// CRITICAL RULES (from AGENTS.md):
//   - ALWAYS use parameterized queries — NEVER concatenate user input
//   - Use MERGE (not CREATE) for all graph inserts to prevent duplicates
//   - 6 node labels: Person, Property, Document, Court, LegalAct, Organisation
//   - 7 relationships: OWNS, REFERENCES, INVOLVES, CONCERNS, ISSUED, DISPUTES, SUPERSEDES
// ============================================================================

import neo4j from 'neo4j-driver';
import type { Driver, Session, Record as Neo4jRecord } from 'neo4j-driver';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Neo4jError as LexNetNeo4jError, ValidationError } from '../types/index.js';
import type {
  GraphData,
  GraphNode,
  GraphEdge,
  NodeSearchResult,
  PropertyTimeline,
  TimelineEvent,
} from '../types/index.js';
import { DEFAULT_GRAPH_DEPTH, MAX_GRAPH_DEPTH } from '../utils/constants.js';

// ---------------------------------------------------------------------------
// Driver Management (Singleton)
// ---------------------------------------------------------------------------

/** Singleton Neo4j driver instance */
let driverInstance: Driver | null = null;

/**
 * Get or create the Neo4j driver singleton.
 * The driver manages connection pooling internally.
 */
function getDriver(): Driver {
  if (!driverInstance) {
    driverInstance = neo4j.driver(
      env.NEO4J_URI,
      neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASSWORD),
      {
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 10_000,
        logging: {
          level: 'warn',
          logger: (level: string, message: string) => {
            logger.log(level === 'error' ? 'error' : 'warn', `[neo4j] ${message}`);
          },
        },
      }
    );

    logger.info('Neo4j driver created', { uri: env.NEO4J_URI });
  }

  return driverInstance;
}

/**
 * Close the Neo4j driver and clean up resources.
 * Safe to call even if the driver is not initialised.
 */
export async function close(): Promise<void> {
  if (driverInstance) {
    await driverInstance.close();
    driverInstance = null;
    logger.info('Neo4j driver closed');
  }
}

// ---------------------------------------------------------------------------
// Generic Query Runner
// ---------------------------------------------------------------------------

/**
 * Run a parameterized Cypher query and return the results.
 *
 * CRITICAL: The `params` object is passed as query parameters — user input
 * is NEVER interpolated into the Cypher string.
 *
 * @typeParam T - The return type (caller is responsible for mapping records)
 * @param cypher - The Cypher query string (use $paramName for parameters)
 * @param params - Parameters to bind to the query
 * @param mapper - Function to map each Neo4j Record to the desired type
 * @returns Array of mapped results
 * @throws LexNetNeo4jError if the query fails
 */
export async function runCypher<T>(
  cypher: string,
  params: Record<string, unknown>,
  mapper: (record: Neo4jRecord) => T
): Promise<T[]> {
  const driver = getDriver();
  let session: Session | null = null;

  try {
    session = driver.session({ database: 'neo4j' });
    const result = await session.run(cypher, params);
    return result.records.map(mapper);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown Neo4j error';
    logger.error('Neo4j query failed', { error: message, cypher: cypher.substring(0, 200) });
    throw new LexNetNeo4jError(message);
  } finally {
    if (session) {
      await session.close();
    }
  }
}

// ---------------------------------------------------------------------------
// Knowledge Graph Queries
// ---------------------------------------------------------------------------

/**
 * Helper to extract a safe string or number from a Neo4j integer or value.
 */
function toSafeValue(val: unknown): string | number | boolean | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return val;
  // Handle Neo4j Integer objects
  if (neo4j.isInt(val)) return (val as { toNumber: () => number }).toNumber();
  return String(val);
}

/**
 * Convert a Neo4j node properties object to a safe Record.
 */
function toSafeProperties(props: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(props)) {
    safe[key] = toSafeValue(value);
  }
  return safe;
}

/**
 * Get the knowledge graph around a document hash, up to a specified depth.
 *
 * Traverses all relationship types from the Document node with the given hash
 * and returns connected nodes + edges for D3.js visualisation.
 *
 * @param docHash - The document hash to start traversal from
 * @param depth - Traversal depth (default: 2, max: 5)
 * @returns GraphData with nodes and edges
 */
export async function getKnowledgeGraph(
  docHash: string,
  depth: number = DEFAULT_GRAPH_DEPTH
): Promise<GraphData> {
  if (!docHash || docHash.trim().length === 0) {
    throw new ValidationError('docHash must not be empty');
  }

  const safeDepth = Math.min(Math.max(1, Math.floor(depth)), MAX_GRAPH_DEPTH);

  // Use apoc-free variable-length path query
  // This retrieves all nodes and relationships within `depth` hops of the document
  const cypher = `
    MATCH (d:Document {hash: $docHash})
    CALL {
      WITH d
      MATCH path = (d)-[*1..${safeDepth}]-(connected)
      RETURN nodes(path) AS pathNodes, relationships(path) AS pathRels
    }
    WITH d, collect(pathNodes) AS allPathNodes, collect(pathRels) AS allPathRels
    WITH d,
         reduce(acc = [], nodes IN allPathNodes | acc + nodes) AS flatNodes,
         reduce(acc = [], rels IN allPathRels | acc + rels) AS flatRels
    RETURN d, flatNodes, flatRels
  `;

  const driver = getDriver();
  let session: Session | null = null;

  try {
    session = driver.session({ database: 'neo4j' });
    const result = await session.run(cypher, { docHash });

    const nodesMap = new Map<string, GraphNode>();
    const edgesMap = new Map<string, GraphEdge>();

    for (const record of result.records) {
      // Add the root document node
      const rootNode = record.get('d');
      if (rootNode && rootNode.elementId) {
        nodesMap.set(rootNode.elementId, {
          id: rootNode.elementId,
          label: rootNode.labels[0] ?? 'Unknown',
          properties: toSafeProperties(rootNode.properties),
        });
      }

      // Add all path nodes
      const pathNodes = record.get('flatNodes') as Array<{
        elementId: string;
        labels: string[];
        properties: Record<string, unknown>;
      }> | null;

      if (pathNodes) {
        for (const node of pathNodes) {
          if (!nodesMap.has(node.elementId)) {
            nodesMap.set(node.elementId, {
              id: node.elementId,
              label: node.labels[0] ?? 'Unknown',
              properties: toSafeProperties(node.properties),
            });
          }
        }
      }

      // Add all path relationships
      const pathRels = record.get('flatRels') as Array<{
        elementId: string;
        type: string;
        startNodeElementId: string;
        endNodeElementId: string;
        properties: Record<string, unknown>;
      }> | null;

      if (pathRels) {
        for (const rel of pathRels) {
          if (!edgesMap.has(rel.elementId)) {
            edgesMap.set(rel.elementId, {
              id: rel.elementId,
              source: rel.startNodeElementId,
              target: rel.endNodeElementId,
              type: rel.type,
              properties: toSafeProperties(rel.properties),
            });
          }
        }
      }
    }

    const graphData: GraphData = {
      nodes: Array.from(nodesMap.values()),
      edges: Array.from(edgesMap.values()),
    };

    logger.debug('Knowledge graph retrieved', {
      docHash,
      depth: safeDepth,
      nodeCount: graphData.nodes.length,
      edgeCount: graphData.edges.length,
    });

    return graphData;
  } catch (error: unknown) {
    if (error instanceof ValidationError || error instanceof LexNetNeo4jError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Knowledge graph query failed', { docHash, error: message });
    throw new LexNetNeo4jError(message);
  } finally {
    if (session) {
      await session.close();
    }
  }
}

/**
 * Search for nodes by name using a case-insensitive CONTAINS match.
 *
 * Searches across all node labels (Person, Property, Document, Court,
 * LegalAct, Organisation) and returns matching nodes with a relevance score.
 *
 * @param query - The search string
 * @returns Array of matching nodes
 */
export async function searchNodes(query: string): Promise<NodeSearchResult[]> {
  if (!query || query.trim().length === 0) {
    return [];
  }

  // Search across all node types using UNION
  // Each subquery uses parameterized input — NEVER string concatenation
  const cypher = `
    CALL {
      MATCH (n:Person)
      WHERE toLower(n.name) CONTAINS toLower($query)
      RETURN elementId(n) AS id, labels(n)[0] AS label, n.name AS name, 1.0 AS score
      UNION ALL
      MATCH (n:Property)
      WHERE toLower(n.id) CONTAINS toLower($query)
         OR toLower(coalesce(n.address, '')) CONTAINS toLower($query)
      RETURN elementId(n) AS id, labels(n)[0] AS label, coalesce(n.id, '') AS name, 0.9 AS score
      UNION ALL
      MATCH (n:Document)
      WHERE toLower(n.hash) CONTAINS toLower($query)
         OR toLower(coalesce(n.docType, '')) CONTAINS toLower($query)
      RETURN elementId(n) AS id, labels(n)[0] AS label, coalesce(n.hash, '') AS name, 0.8 AS score
      UNION ALL
      MATCH (n:Court)
      WHERE toLower(n.name) CONTAINS toLower($query)
      RETURN elementId(n) AS id, labels(n)[0] AS label, n.name AS name, 0.7 AS score
      UNION ALL
      MATCH (n:LegalAct)
      WHERE toLower(n.name) CONTAINS toLower($query)
      RETURN elementId(n) AS id, labels(n)[0] AS label, n.name AS name, 0.7 AS score
      UNION ALL
      MATCH (n:Organisation)
      WHERE toLower(n.name) CONTAINS toLower($query)
      RETURN elementId(n) AS id, labels(n)[0] AS label, n.name AS name, 0.7 AS score
    }
    RETURN id, label, name, score
    ORDER BY score DESC, name ASC
    LIMIT 50
  `;

  const results = await runCypher<NodeSearchResult>(
    cypher,
    { query: query.trim() },
    (record: Neo4jRecord) => ({
      id: record.get('id') as string,
      label: record.get('label') as string,
      name: record.get('name') as string,
      score: record.get('score') as number,
    })
  );

  logger.debug('Node search completed', {
    query: query.trim(),
    resultCount: results.length,
  });

  return results;
}

/**
 * Get the timeline of events for a specific property.
 *
 * Traces all Documents and relationships connected to the property
 * and orders them chronologically.
 *
 * @param propertyId - The property identifier
 * @returns A PropertyTimeline with ordered events
 */
export async function getPropertyTimeline(propertyId: string): Promise<PropertyTimeline> {
  if (!propertyId || propertyId.trim().length === 0) {
    throw new ValidationError('propertyId must not be empty');
  }

  const cypher = `
    MATCH (p:Property {id: $propertyId})<-[:CONCERNS]-(d:Document)
    OPTIONAL MATCH (d)<-[:OWNS]-(owner:Person)
    RETURN
      elementId(d) AS eventId,
      d.docType AS eventType,
      coalesce(d.timestamp, d.createdAt, '') AS timestamp,
      d.hash AS docHash,
      coalesce(owner.name, 'Unknown') AS actor,
      d.docType + ' — ' + coalesce(d.hash, 'N/A') AS description
    ORDER BY timestamp ASC
  `;

  const events = await runCypher<TimelineEvent>(
    cypher,
    { propertyId: propertyId.trim() },
    (record: Neo4jRecord) => ({
      id: record.get('eventId') as string,
      eventType: (record.get('eventType') as string) ?? 'unknown',
      timestamp: record.get('timestamp') as string,
      description: record.get('description') as string,
      docHash: record.get('docHash') as string | undefined,
      actor: record.get('actor') as string | undefined,
    })
  );

  logger.debug('Property timeline retrieved', {
    propertyId,
    eventCount: events.length,
  });

  return {
    propertyId,
    events,
  };
}
