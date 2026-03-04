/**
 * Web Worker that computes Dagre layout positions for large graphs.
 *
 * Receives serialized nodes and edges from the main thread, runs the
 * Dagre layout algorithm, and returns computed positions. This keeps
 * the main thread responsive for graphs with many nodes.
 *
 * @module dagre-layout.worker
 */
import Dagre from '@dagrejs/dagre';

// ---------------------------------------------------------------------------
// Message protocol types
// ---------------------------------------------------------------------------

/** Serialized node data sent to the worker. */
interface WorkerNode {
  id: string;
  width: number;
  height: number;
}

/** Serialized edge data sent to the worker. */
interface WorkerEdge {
  source: string;
  target: string;
}

/** Layout options passed from the main thread. */
interface WorkerLayoutOptions {
  direction: 'TB' | 'LR';
  rankSep: number;
  nodeSep: number;
}

/** Input message requesting a layout computation. */
interface ComputeLayoutMessage {
  type: 'compute-layout';
  requestId: number;
  payload: {
    nodes: WorkerNode[];
    edges: WorkerEdge[];
    options: WorkerLayoutOptions;
  };
}

/** Successful layout result posted back to the main thread. */
interface LayoutCompleteMessage {
  type: 'layout-complete';
  requestId: number;
  payload: {
    positions: Record<string, { x: number; y: number }>;
    duration: number;
  };
}

/** Error result posted back to the main thread. */
interface LayoutErrorMessage {
  type: 'layout-error';
  requestId: number;
  payload: {
    message: string;
  };
}

type WorkerInputMessage = ComputeLayoutMessage;
type WorkerOutputMessage = LayoutCompleteMessage | LayoutErrorMessage;

// ---------------------------------------------------------------------------
// Worker message handler
// ---------------------------------------------------------------------------

self.onmessage = (event: MessageEvent<WorkerInputMessage>) => {
  const { requestId, payload } = event.data;

  try {
    const startTime = performance.now();

    const graph = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

    graph.setGraph({
      rankdir: payload.options.direction,
      ranksep: payload.options.rankSep,
      nodesep: payload.options.nodeSep,
    });

    for (const node of payload.nodes) {
      graph.setNode(node.id, {
        width: node.width,
        height: node.height,
      });
    }

    for (const edge of payload.edges) {
      graph.setEdge(edge.source, edge.target);
    }

    Dagre.layout(graph);

    const positions: Record<string, { x: number; y: number }> = {};
    for (const nodeId of graph.nodes()) {
      const nodeData = graph.node(nodeId) as { x: number; y: number };
      positions[nodeId] = { x: nodeData.x, y: nodeData.y };
    }

    const duration = performance.now() - startTime;

    const response: LayoutCompleteMessage = {
      type: 'layout-complete',
      requestId,
      payload: { positions, duration },
    };
    self.postMessage(response);
  } catch (error) {
    const response: LayoutErrorMessage = {
      type: 'layout-error',
      requestId,
      payload: {
        message: error instanceof Error ? error.message : 'Unknown layout error',
      },
    };
    self.postMessage(response);
  }
};

// Export types for use in the main thread hook
export type { WorkerInputMessage, WorkerOutputMessage, LayoutCompleteMessage, LayoutErrorMessage };
