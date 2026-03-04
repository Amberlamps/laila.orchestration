/**
 * Type definitions for the project dependency graph API response
 * and internal graph data structures.
 *
 * These types model the GET /api/v1/projects/:id/graph endpoint response,
 * which is not part of the OpenAPI spec and uses manual fetch.
 */

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

/** Entity type for graph nodes — maps to the hierarchy: epic > story > task. */
export type GraphEntityType = 'epic' | 'story' | 'task';

/** A single node in the dependency graph returned by the API. */
export interface GraphNode {
  /** Unique entity ID. */
  id: string;
  /** Display label (entity name/title). */
  label: string;
  /** The type of entity this node represents. */
  entityType: GraphEntityType;
  /** Current work status of the entity. */
  status: string;
  /** Optional parent entity name for context (e.g., epic name for a story). */
  parentName?: string;
}

/** A directed edge in the dependency graph returned by the API. */
export interface GraphEdge {
  /** Source node ID (the dependency — must be completed first). */
  source: string;
  /** Target node ID (the dependent — blocked until source completes). */
  target: string;
}

/** Response shape from GET /api/v1/projects/:id/graph. */
export interface ProjectGraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---------------------------------------------------------------------------
// Custom ReactFlow node data
// ---------------------------------------------------------------------------

/** Data payload attached to each ReactFlow node for rendering custom node components. */
export interface DependencyNodeData extends Record<string, unknown> {
  label: string;
  status: string;
  entityType: GraphEntityType;
  entityId: string;
  parentName?: string | undefined;
}
