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

// ---------------------------------------------------------------------------
// Web Worker message protocol
// ---------------------------------------------------------------------------

/** Serialized node data sent to the layout Web Worker. */
export interface WorkerNodeInput {
  id: string;
  width: number;
  height: number;
}

/** Serialized edge data sent to the layout Web Worker. */
export interface WorkerEdgeInput {
  source: string;
  target: string;
}

/** Layout options forwarded to the Web Worker. */
export interface WorkerLayoutOptions {
  direction: 'TB' | 'LR';
  rankSep: number;
  nodeSep: number;
}

/** Message sent from the main thread to the layout Web Worker. */
export interface LayoutWorkerRequest {
  type: 'compute-layout';
  payload: {
    nodes: WorkerNodeInput[];
    edges: WorkerEdgeInput[];
    options: WorkerLayoutOptions;
  };
}

/** Successful layout result returned from the Web Worker. */
export interface LayoutWorkerSuccessResponse {
  type: 'layout-complete';
  payload: {
    positions: Record<string, { x: number; y: number }>;
    duration: number;
  };
}

/** Error result returned from the Web Worker. */
export interface LayoutWorkerErrorResponse {
  type: 'layout-error';
  payload: {
    message: string;
  };
}

/** Union of all possible messages from the layout Web Worker. */
export type LayoutWorkerResponse = LayoutWorkerSuccessResponse | LayoutWorkerErrorResponse;
