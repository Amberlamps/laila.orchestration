/**
 * Web Worker that computes Dagre layout positions for large graphs.
 *
 * Receives serialized nodes and edges via the typed message protocol,
 * computes the Dagre layout in a background thread, and returns
 * the computed positions back to the main thread.
 *
 * This keeps the main thread responsive for graphs with >200 nodes
 * where layout computation can take hundreds of milliseconds.
 *
 * @module dagre-layout.worker
 */
import Dagre from '@dagrejs/dagre';

import type { LayoutWorkerRequest, LayoutWorkerResponse } from '@/lib/graph/types';

/**
 * Handles incoming layout computation requests.
 *
 * 1. Creates a new Dagre directed graph
 * 2. Configures graph with provided direction and spacing options
 * 3. Adds all nodes and edges
 * 4. Runs Dagre.layout() to compute positions
 * 5. Collects computed positions into a record
 * 6. Posts the result (or error) back to the main thread
 */
self.onmessage = (event: MessageEvent<LayoutWorkerRequest>) => {
  const { payload } = event.data;

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

    const response: LayoutWorkerResponse = {
      type: 'layout-complete',
      payload: { positions, duration },
    };
    self.postMessage(response);
  } catch (error) {
    const response: LayoutWorkerResponse = {
      type: 'layout-error',
      payload: {
        message: error instanceof Error ? error.message : 'Unknown layout error',
      },
    };
    self.postMessage(response);
  }
};
