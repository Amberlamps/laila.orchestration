/**
 * Hook that manages Dagre layout computation, choosing between
 * synchronous (small graphs) and Web Worker (large graphs).
 *
 * Threshold: 200 nodes.
 * - <= 200 nodes: synchronous via computeDagreLayout()
 * - > 200 nodes: offloaded to a Web Worker
 *
 * Features:
 * - Layout caching via deterministic hash of node IDs + edge pairs
 * - Worker lifecycle: created lazily, terminated on unmount
 * - Stale response handling via monotonic request IDs
 * - Fallback to sync on Worker failure with console.warn
 *
 * @module use-dagre-layout
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

import { computeDagreLayout } from '@/lib/graph/dagre-layout';

import type { DagreLayoutOptions } from '@/lib/graph/dagre-layout';
import type { LayoutCompleteMessage, LayoutErrorMessage } from '@/workers/dagre-layout.worker';
import type { Node, Edge } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Node count threshold for offloading layout to Web Worker. */
const WORKER_THRESHOLD = 200;

/** Default node dimensions and spacing used by the layout algorithm. */
const DEFAULT_NODE_WIDTH = 180;
const DEFAULT_NODE_HEIGHT = 60;
const DEFAULT_RANK_SEP = 100;
const DEFAULT_NODE_SEP = 50;

// ---------------------------------------------------------------------------
// Cache key computation
// ---------------------------------------------------------------------------

/** Cached layout result stored in the ref. */
interface LayoutCache {
  key: string;
  nodes: Node[];
  edges: Edge[];
}

/**
 * Computes a deterministic cache key from node IDs and edge pairs.
 * Sorts both collections to ensure stability regardless of insertion order.
 */
const computeCacheKey = (nodes: Node[], edges: Edge[]): string => {
  const sortedNodeIds = nodes
    .map((n) => n.id)
    .sort()
    .join(',');
  const sortedEdgePairs = edges
    .map((e) => `${e.source}->${e.target}`)
    .sort()
    .join(',');
  return `${sortedNodeIds}|${sortedEdgePairs}`;
};

// ---------------------------------------------------------------------------
// Worker output message type guard
// ---------------------------------------------------------------------------

type WorkerOutputMessage = LayoutCompleteMessage | LayoutErrorMessage;

const isLayoutComplete = (msg: WorkerOutputMessage): msg is LayoutCompleteMessage =>
  msg.type === 'layout-complete';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseDagreLayoutResult {
  /** Nodes with computed positions. */
  layoutNodes: Node[];
  /** Edges (unchanged from input). */
  layoutEdges: Edge[];
  /** True while the Web Worker is computing layout. */
  isComputing: boolean;
}

/**
 * Manages Dagre layout computation with automatic sync/async selection.
 *
 * For graphs with <= 200 nodes, layout is computed synchronously.
 * For larger graphs, layout is offloaded to a Web Worker to keep
 * the main thread responsive.
 *
 * @param nodes - ReactFlow nodes to position.
 * @param edges - ReactFlow edges defining relationships.
 * @param options - Optional Dagre layout configuration.
 * @returns Layout result with positioned nodes, edges, and computing state.
 */
export const useDagreLayout = (
  nodes: Node[],
  edges: Edge[],
  options?: DagreLayoutOptions,
): UseDagreLayoutResult => {
  const [isComputing, setIsComputing] = useState(false);
  const [workerResult, setWorkerResult] = useState<{
    nodes: Node[];
    edges: Edge[];
  } | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const cacheRef = useRef<LayoutCache | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  // Compute the cache key for the current inputs
  const cacheKey = useMemo(() => computeCacheKey(nodes, edges), [nodes, edges]);

  // ---------------------------------------------------------------------------
  // Synchronous layout for small graphs
  // ---------------------------------------------------------------------------

  const syncResult = useMemo(() => {
    if (nodes.length === 0) {
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }

    if (nodes.length > WORKER_THRESHOLD) {
      return null;
    }

    // Check cache
    const cached = cacheRef.current;
    if (cached !== null && cached.key === cacheKey) {
      return { nodes: cached.nodes, edges: cached.edges };
    }

    const result = computeDagreLayout(nodes, edges, options);
    cacheRef.current = { key: cacheKey, nodes: result.nodes, edges: result.edges };
    return result;
  }, [nodes, edges, options, cacheKey]);

  // ---------------------------------------------------------------------------
  // Fallback sync computation (used when Worker fails)
  // ---------------------------------------------------------------------------

  const computeFallbackSync = useCallback(() => {
    const result = computeDagreLayout(nodes, edges, options);
    cacheRef.current = { key: cacheKey, nodes: result.nodes, edges: result.edges };
    setWorkerResult(result);
    setIsComputing(false);
  }, [nodes, edges, options, cacheKey]);

  // ---------------------------------------------------------------------------
  // Web Worker layout for large graphs
  // ---------------------------------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Only use worker path for large graphs
    if (nodes.length <= WORKER_THRESHOLD) {
      return undefined;
    }

    if (nodes.length === 0) {
      setWorkerResult({ nodes: [], edges: [] });
      setIsComputing(false);
      return undefined;
    }

    // Check cache
    const cached = cacheRef.current;
    if (cached !== null && cached.key === cacheKey) {
      setWorkerResult({ nodes: cached.nodes, edges: cached.edges });
      setIsComputing(false);
      return undefined;
    }

    // Increment request ID for stale response detection
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    setIsComputing(true);

    // Create worker lazily
    if (workerRef.current === null) {
      try {
        workerRef.current = new Worker(
          new URL('../workers/dagre-layout.worker.ts', import.meta.url),
        );
      } catch {
        console.warn('Failed to create Web Worker for layout computation, falling back to sync');
        computeFallbackSync();
        return undefined;
      }
    }

    const worker = workerRef.current;

    const direction = options?.direction ?? 'TB';
    const nodeWidth = options?.nodeWidth ?? DEFAULT_NODE_WIDTH;
    const nodeHeight = options?.nodeHeight ?? DEFAULT_NODE_HEIGHT;
    const rankSep = options?.rankSep ?? DEFAULT_RANK_SEP;
    const nodeSep = options?.nodeSep ?? DEFAULT_NODE_SEP;

    // Handle worker responses
    const handleMessage = (event: MessageEvent<WorkerOutputMessage>) => {
      const msg = event.data;

      // Ignore stale responses
      if (msg.requestId !== currentRequestId) {
        return;
      }

      if (!mountedRef.current) {
        return;
      }

      if (isLayoutComplete(msg)) {
        const { positions } = msg.payload;

        // Apply positions to the original nodes (Dagre centers; shift to top-left)
        const positionedNodes = nodes.map((node): Node => {
          const pos = positions[node.id];
          if (pos === undefined) {
            return node;
          }
          return {
            ...node,
            position: {
              x: pos.x - nodeWidth / 2,
              y: pos.y - nodeHeight / 2,
            },
          };
        });

        const result = { nodes: positionedNodes, edges };
        cacheRef.current = { key: cacheKey, nodes: positionedNodes, edges };
        setWorkerResult(result);
        setIsComputing(false);
      } else {
        // Layout error — fall back to synchronous computation
        console.warn(
          `Web Worker layout failed: ${msg.payload.message}. Falling back to synchronous computation.`,
        );
        computeFallbackSync();
      }
    };

    const handleError = () => {
      if (!mountedRef.current) {
        return;
      }
      console.warn('Web Worker encountered an error. Falling back to synchronous computation.');
      computeFallbackSync();
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    // Post computation request to worker
    worker.postMessage({
      type: 'compute-layout',
      requestId: currentRequestId,
      payload: {
        nodes: nodes.map((n) => ({ id: n.id, width: nodeWidth, height: nodeHeight })),
        edges: edges.map((e) => ({ source: e.source, target: e.target })),
        options: { direction, rankSep, nodeSep },
      },
    });

    return () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
    };
  }, [nodes, edges, options, cacheKey, computeFallbackSync]);

  // ---------------------------------------------------------------------------
  // Worker cleanup on unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (workerRef.current !== null) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Return result
  // ---------------------------------------------------------------------------

  // Small graph: use synchronous result
  if (syncResult !== null) {
    return {
      layoutNodes: syncResult.nodes,
      layoutEdges: syncResult.edges,
      isComputing: false,
    };
  }

  // Large graph: use worker result (or empty while computing)
  return {
    layoutNodes: workerResult?.nodes ?? [],
    layoutEdges: workerResult?.edges ?? [],
    isComputing,
  };
};
