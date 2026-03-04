/**
 * DependencyGraphContainer — main container for the dependency graph visualization.
 *
 * Responsibilities:
 * 1. Fetches task dependency data from GET /api/v1/projects/:id/graph
 * 2. Transforms API data into ReactFlow format via transformToGraphData
 * 3. Computes layout using Dagre via useDagreLayout hook
 *    - Sync for <=200 nodes, Web Worker for >200 nodes
 *    - Shows loading overlay during Web Worker computation
 * 4. Renders ReactFlow with dots background and fitView
 *
 * Must be wrapped in ReactFlowProvider at the page level.
 */
import { ReactFlow, Background, BackgroundVariant, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useDagreLayout } from '@/hooks/use-dagre-layout';
import { useEdgeHighlight } from '@/hooks/use-edge-highlight';
import { useFullscreen } from '@/hooks/use-fullscreen';
import { transformToGraphData } from '@/lib/graph/transform-graph-data';
import { useProjectGraph } from '@/lib/query-hooks';

import { GraphCanvasControls } from './graph-canvas-controls';
import { GraphLayoutLoading } from './graph-layout-loading';
import { GraphLegend } from './graph-legend';
import { GraphMinimap } from './graph-minimap';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggleFullscreen } = useFullscreen(containerRef);
  const { fitView } = useReactFlow();

  // Transform API data into ReactFlow format — memoized to avoid recomputation
  const { transformedNodes, transformedEdges } = useMemo(() => {
    if (!graphData || graphData.nodes.length === 0) {
      return { transformedNodes: [] as Node[], transformedEdges: [] as Edge[] };
    }

    const { nodes: tNodes, edges: tEdges } = transformToGraphData(graphData);
    return { transformedNodes: tNodes, transformedEdges: tEdges };
  }, [graphData]);

  // Compute layout — uses sync for <=200 nodes, Web Worker for larger graphs
  const { layoutNodes, layoutEdges, isComputing } = useDagreLayout(
    transformedNodes,
    transformedEdges,
  );

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

  // Re-fit the graph when entering or exiting fullscreen so it adjusts
  // to the new container dimensions. The requestAnimationFrame delay
  // ensures the browser has finished the fullscreen transition.
  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      void fitView({ padding: 0.2, duration: 300 });
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [isFullscreen, fitView]);

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
    <div
      ref={containerRef}
      className={`graph-container flex h-full min-h-[600px] w-full flex-col ${isFullscreen ? 'bg-white' : ''}`}
    >
      <div className="relative flex-1">
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
          <GraphMinimap />
          <GraphCanvasControls
            onReset={handleReset}
            isFullscreen={isFullscreen}
            onFullscreenToggle={toggleFullscreen}
          />
        </ReactFlow>
        {isComputing && <GraphLayoutLoading nodeCount={transformedNodes.length} />}
      </div>
      <GraphLegend />
    </div>
  );
};
