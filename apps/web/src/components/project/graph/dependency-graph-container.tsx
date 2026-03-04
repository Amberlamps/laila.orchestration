/**
 * DependencyGraphContainer — main container for the dependency graph visualization.
 *
 * Responsibilities:
 * 1. Fetches task dependency data from GET /api/v1/projects/:id/graph
 * 2. Transforms API data into ReactFlow format via transformToGraphData
 * 3. Computes layout using Dagre (TB direction, 180px width, 60px height)
 * 4. Renders ReactFlow with dots background and fitView
 *
 * Must be wrapped in ReactFlowProvider at the page level.
 */
import { ReactFlow, Background, BackgroundVariant } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useMemo, useState } from 'react';

import { useEdgeHighlight } from '@/hooks/use-edge-highlight';
import { computeDagreLayout } from '@/lib/graph/dagre-layout';
import { transformToGraphData } from '@/lib/graph/transform-graph-data';
import { useProjectGraph } from '@/lib/query-hooks';

import { GraphCanvasControls } from './graph-canvas-controls';
import { NODE_TYPES } from './node-types';

import type { Node, Edge, OnSelectionChangeFunc } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Fit view options
// ---------------------------------------------------------------------------

const FIT_VIEW_OPTIONS = { padding: 0.2 } as const;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Centered spinner displayed while graph data is loading. */
const GraphLoadingState = () => (
  <div
    className="flex min-h-[600px] items-center justify-center"
    role="status"
    aria-label="Loading dependency graph"
  >
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-500">
      <span className="sr-only">Loading graph...</span>
    </div>
  </div>
);

/** Error message displayed when the graph data request fails. */
const GraphErrorState = ({ message }: { message: string }) => (
  <div className="flex min-h-[600px] items-center justify-center">
    <div className="text-center">
      <p className="text-sm font-medium text-red-600">Failed to load dependency graph</p>
      <p className="mt-1 text-xs text-zinc-500">{message}</p>
    </div>
  </div>
);

/** Empty state when there are no nodes to visualize. */
const GraphEmptyState = () => (
  <div className="flex min-h-[600px] items-center justify-center">
    <p className="text-sm text-zinc-500">No dependencies to visualize</p>
  </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface DependencyGraphContainerProps {
  /** Project ID to fetch the dependency graph for. */
  projectId: string;
}

/**
 * Renders the interactive dependency graph for a project.
 *
 * Fetches graph data, transforms it into ReactFlow format, computes
 * Dagre layout, and renders an interactive graph with dots background.
 */
export const DependencyGraphContainer = ({ projectId }: DependencyGraphContainerProps) => {
  const { data: graphData, isLoading, isError, error } = useProjectGraph(projectId);

  // Transform API data and compute layout — memoized to avoid recomputation
  const { layoutNodes, layoutEdges } = useMemo(() => {
    if (!graphData || graphData.nodes.length === 0) {
      return { layoutNodes: [] as Node[], layoutEdges: [] as Edge[] };
    }

    const { nodes: transformedNodes, edges: transformedEdges } = transformToGraphData(graphData);
    const { nodes: positioned, edges: finalEdges } = computeDagreLayout(
      transformedNodes,
      transformedEdges,
    );

    return { layoutNodes: positioned, layoutEdges: finalEdges };
  }, [graphData]);

  // --- Edge highlight state ---
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const handleNodeMouseEnter = useCallback((_event: React.MouseEvent, node: Node) => {
    setHoveredNodeId(node.id);
  }, []);

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  const handleSelectionChange = useCallback<OnSelectionChangeFunc>(({ nodes: selectedNodes }) => {
    const firstSelected = selectedNodes[0];
    setSelectedNodeId(firstSelected ? firstSelected.id : null);
  }, []);

  const handleReset = useCallback(() => {
    setHoveredNodeId(null);
    setSelectedNodeId(null);
  }, []);

  // Compute highlighted edges based on hover/selection state
  const highlightedEdges = useEdgeHighlight(layoutEdges, hoveredNodeId, selectedNodeId);

  // --- Loading state ---
  if (isLoading) {
    return <GraphLoadingState />;
  }

  // --- Error state ---
  if (isError) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return <GraphErrorState message={errorMessage} />;
  }

  // --- Empty state ---
  if (!graphData || graphData.nodes.length === 0) {
    return <GraphEmptyState />;
  }

  return (
    <div className="h-full min-h-[600px] w-full">
      <ReactFlow
        nodes={layoutNodes}
        edges={highlightedEdges}
        nodeTypes={NODE_TYPES}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onSelectionChange={handleSelectionChange}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.1}
        maxZoom={2.0}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} />
        <GraphCanvasControls onReset={handleReset} />
      </ReactFlow>
    </div>
  );
};
