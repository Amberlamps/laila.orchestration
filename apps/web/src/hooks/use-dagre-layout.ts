/**
 * Hook that manages Dagre layout computation, choosing between
 * synchronous (small graphs <= 200 nodes) and Web Worker (large graphs > 200 nodes).
 *
 * Features:
 * - Transparent to consumers: returns the same shape regardless of sync/async path
 * - Layout caching via deterministic hash of node IDs + edge pairs
 * - Worker cleanup on unmount
 * - Stale response handling (ignores responses from outdated computations)
 * - Automatic fallback to sync on worker error with console.warn
 *
 * @module use-dagre-layout
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

import { computeDagreLayout, DEFAULT_OPTIONS } from '@/lib/graph/dagre-layout';

import type { DagreLayoutOptions } from '@/lib/graph/dagre-layout';
import type {
  LayoutWorkerRequest,
  LayoutWorkerResponse,
  WorkerNodeInput,
  WorkerEdgeInput,
} from '@/lib/graph/types';
import type { Node, Edge } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Node count threshold above which layout is offloaded to a Web Worker. */
const WORKER_THRESHOLD = 200;

// ---------------------------------------------------------------------------
// Cache key computation
// ---------------------------------------------------------------------------

/**
 * Computes a deterministic hash string from the graph structure and layout
 * configuration. Includes sorted node IDs, sorted edge source-target pairs,
 * and all layout options (direction, rankSep, nodeSep, nodeWidth, nodeHeight)
 * so the cache is invalidated when any of these change.
 */
const computeCacheKey = (
  nodes: Node[],
  edges: Edge[],
  opts: Required<DagreLayoutOptions>,
): string => {
  const nodeIds = nodes
    .map((n) => n.id)
    .sort()
    .join(',');

  const edgePairs = edges
    .map((e) => `${e.source}->${e.target}`)
    .sort()
    .join(',');

  const optsPart = `${opts.direction}:${String(opts.rankSep)}:${String(opts.nodeSep)}:${String(opts.nodeWidth)}:${String(opts.nodeHeight)}`;

  return `${nodeIds}|${edgePairs}|${optsPart}`;
};

// ---------------------------------------------------------------------------
// Cached layout result
// ---------------------------------------------------------------------------

interface CachedLayout {
  key: string;
  nodes: Node[];
  edges: Edge[];
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

interface UseDagreLayoutResult {
  /** Nodes with computed layout positions. */
  layoutNodes: Node[];
  /** Edges (passed through unchanged). */
  layoutEdges: Edge[];
  /** Whether the Web Worker is currently computing the layout. */
  isComputing: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages Dagre layout computation with automatic sync/async selection.
 *
 * For graphs with <= 200 nodes, computes layout synchronously using
 * `computeDagreLayout()`. For larger graphs, offloads computation to
 * a Web Worker to keep the main thread responsive.
 *
 * @param nodes - ReactFlow nodes (unpositioned).
 * @param edges - ReactFlow edges.
 * @param options - Optional Dagre layout configuration overrides.
 * @returns Layout result with positioned nodes, edges, and computing state.
 */
export const useDagreLayout = (
  nodes: Node[],
  edges: Edge[],
  options?: DagreLayoutOptions,
): UseDagreLayoutResult => {
  const [isComputing, setIsComputing] = useState(false);
  const [workerResult, setWorkerResult] = useState<CachedLayout | null>(null);

  // Refs for lifecycle management
  const workerRef = useRef<Worker | null>(null);
  const cacheRef = useRef<CachedLayout | null>(null);
  const requestIdRef = useRef(0);

  // Merge options with defaults for consistent use
  const mergedOptions = useMemo(() => ({ ...DEFAULT_OPTIONS, ...options }), [options]);

  // Compute cache key from current graph structure and layout options
  const cacheKey = useMemo(
    () => computeCacheKey(nodes, edges, mergedOptions),
    [nodes, edges, mergedOptions],
  );

  // ---------------------------------------------------------------------------
  // Synchronous path (small graphs)
  // ---------------------------------------------------------------------------

  const syncResult = useMemo((): UseDagreLayoutResult | null => {
    if (nodes.length === 0) {
      return { layoutNodes: [], layoutEdges: edges, isComputing: false };
    }

    if (nodes.length > WORKER_THRESHOLD) {
      return null; // Will use worker path
    }

    const { nodes: positioned, edges: finalEdges } = computeDagreLayout(nodes, edges, options);

    return { layoutNodes: positioned, layoutEdges: finalEdges, isComputing: false };
  }, [nodes, edges, options]);

  // ---------------------------------------------------------------------------
  // Fallback to sync computation (used when worker fails)
  // ---------------------------------------------------------------------------

  const computeSyncFallback = useCallback((): CachedLayout => {
    const { nodes: positioned, edges: finalEdges } = computeDagreLayout(nodes, edges, options);

    const result: CachedLayout = {
      key: cacheKey,
      nodes: positioned,
      edges: finalEdges,
    };

    cacheRef.current = result;
    return result;
  }, [nodes, edges, options, cacheKey]);

  // ---------------------------------------------------------------------------
  // Worker path (large graphs)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Only use worker for large graphs
    if (nodes.length <= WORKER_THRESHOLD || nodes.length === 0) {
      return;
    }

    // Check cache first
    if (cacheRef.current !== null && cacheRef.current.key === cacheKey) {
      setWorkerResult(cacheRef.current);
      setIsComputing(false);
      return;
    }

    // Increment request ID for stale response detection
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    setIsComputing(true);

    // Create worker if it doesn't exist
    if (workerRef.current === null) {
      try {
        workerRef.current = new Worker(
          new URL('../workers/dagre-layout.worker.ts', import.meta.url),
        );
      } catch (workerCreationError) {
        console.warn(
          'Failed to create layout Web Worker, falling back to synchronous computation:',
          workerCreationError,
        );
        const fallback = computeSyncFallback();
        setWorkerResult(fallback);
        setIsComputing(false);
        return;
      }
    }

    const worker = workerRef.current;

    // Set up message handler
    const handleMessage = (event: MessageEvent<LayoutWorkerResponse>) => {
      // Ignore stale responses
      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      const response = event.data;

      if (response.type === 'layout-complete') {
        const { positions, duration } = response.payload;

        // Apply positions to nodes (convert from center to top-left)
        const positioned = nodes.map((node): Node => {
          const pos = positions[node.id];
          if (!pos) {
            return node;
          }

          return {
            ...node,
            position: {
              x: pos.x - mergedOptions.nodeWidth / 2,
              y: pos.y - mergedOptions.nodeHeight / 2,
            },
          };
        });

        const result: CachedLayout = {
          key: cacheKey,
          nodes: positioned,
          edges,
        };

        cacheRef.current = result;
        setWorkerResult(result);
        setIsComputing(false);

        console.debug(
          `[dagre-layout] Worker computed layout for ${String(nodes.length)} nodes in ${String(Math.round(duration))}ms`,
        );
      } else {
        console.warn(
          `[dagre-layout] Worker error: ${response.payload.message}. Falling back to synchronous computation.`,
        );

        const fallback = computeSyncFallback();
        setWorkerResult(fallback);
        setIsComputing(false);
      }
    };

    const handleError = (errorEvent: ErrorEvent) => {
      // Ignore stale errors
      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      console.warn(
        '[dagre-layout] Worker runtime error. Falling back to synchronous computation:',
        errorEvent.message,
      );

      const fallback = computeSyncFallback();
      setWorkerResult(fallback);
      setIsComputing(false);
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    // Serialize and send data to worker
    const workerNodes: WorkerNodeInput[] = nodes.map((n) => ({
      id: n.id,
      width: mergedOptions.nodeWidth,
      height: mergedOptions.nodeHeight,
    }));

    const workerEdges: WorkerEdgeInput[] = edges.map((e) => ({
      source: e.source,
      target: e.target,
    }));

    const message: LayoutWorkerRequest = {
      type: 'compute-layout',
      payload: {
        nodes: workerNodes,
        edges: workerEdges,
        options: {
          direction: mergedOptions.direction,
          rankSep: mergedOptions.rankSep,
          nodeSep: mergedOptions.nodeSep,
        },
      },
    };

    worker.postMessage(message);

    // Cleanup listeners when effect re-runs or unmounts
    return () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
    };
  }, [nodes, edges, cacheKey, mergedOptions, computeSyncFallback]);

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

  // Small graph: use sync result directly
  if (syncResult !== null) {
    return syncResult;
  }

  // Large graph: use worker result if available, otherwise return empty with computing state
  if (workerResult !== null && workerResult.key === cacheKey) {
    return {
      layoutNodes: workerResult.nodes,
      layoutEdges: workerResult.edges,
      isComputing,
    };
  }

  // Worker is computing or hasn't returned yet
  return {
    layoutNodes: [],
    layoutEdges: [],
    isComputing: true,
  };
};
