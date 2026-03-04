/**
 * DependencyGraphContainer — main container for the dependency graph visualization.
 *
 * Responsibilities:
 * 1. Fetches task dependency data from GET /api/v1/projects/:id/graph
 * 2. Transforms API data into ReactFlow format via transformToGraphData
 * 3. Applies view level derivation (tasks/stories/epics)
 * 4. Applies status + epic filters on the derived view
 * 5. Computes layout using Dagre (TB direction, 180px width, 60px height)
 * 6. Renders ReactFlow with dots background, fitView, and interactive features
 *
 * Must be wrapped in ReactFlowProvider at the page level.
 */
import { ReactFlow, Background, BackgroundVariant, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useDagreLayout } from '@/hooks/use-dagre-layout';
import { useEdgeHighlight } from '@/hooks/use-edge-highlight';
import { useFullscreen } from '@/hooks/use-fullscreen';
import { useGraphEpicFilter } from '@/hooks/use-graph-epic-filter';
import { useGraphStatusFilter } from '@/hooks/use-graph-status-filter';
import { useGraphTooltip } from '@/hooks/use-graph-tooltip';
import { useGraphViewLevel } from '@/hooks/use-graph-view-level';
import { transformToGraphData } from '@/lib/graph/transform-graph-data';
import { useProjectGraph } from '@/lib/query-hooks';

import { GraphCanvasControls } from './graph-canvas-controls';
import { GraphEpicFilter } from './graph-epic-filter';
import { GraphLayoutLoading } from './graph-layout-loading';
import { GraphLegend } from './graph-legend';
import { GraphMinimap } from './graph-minimap';
import { GraphNodeTooltip } from './graph-node-tooltip';
import { GraphStatusFilter } from './graph-status-filter';
import { GraphViewLevelToggle } from './graph-view-level-toggle';
import { useNodeNavigation } from './hooks/use-node-navigation';
import { NODE_TYPES } from './node-types';

import type { DependencyNodeData } from '@/lib/graph/types';
import type { Node, Edge, OnSelectionChangeFunc } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Fit view options
// ---------------------------------------------------------------------------

const FIT_VIEW_OPTIONS = { padding: 0.2 } as const;
const FIT_VIEW_ANIMATED = { padding: 0.2, duration: 300 } as const;

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
 * Data flow:
 *   API data → transform → view level derivation → status filter
 *   → epic filter → Dagre layout → edge highlight → ReactFlow
 */
export const DependencyGraphContainer = ({ projectId }: DependencyGraphContainerProps) => {
  const { data: graphData, isLoading, isError, error } = useProjectGraph(projectId);
  const reactFlowInstance = useReactFlow();

  // ---------------------------------------------------------------------------
  // Fullscreen
  // ---------------------------------------------------------------------------

  const containerRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggleFullscreen } = useFullscreen(containerRef);

  // Re-fit the graph when entering/exiting fullscreen so it adjusts to new dimensions
  const prevFullscreenRef = useRef(isFullscreen);

  useEffect(() => {
    if (prevFullscreenRef.current !== isFullscreen) {
      prevFullscreenRef.current = isFullscreen;
      requestAnimationFrame(() => {
        void reactFlowInstance.fitView(FIT_VIEW_ANIMATED);
      });
    }
  }, [isFullscreen, reactFlowInstance]);

  // ---------------------------------------------------------------------------
  // Step 1: Transform API data into ReactFlow format (no layout yet)
  // ---------------------------------------------------------------------------

  const { transformedNodes, transformedEdges } = useMemo(() => {
    if (!graphData || graphData.nodes.length === 0) {
      return {
        transformedNodes: [] as Node<DependencyNodeData>[],
        transformedEdges: [] as Edge[],
      };
    }

    const { nodes, edges } = transformToGraphData(graphData);
    return {
      transformedNodes: nodes as Node<DependencyNodeData>[],
      transformedEdges: edges,
    };
  }, [graphData]);

  // ---------------------------------------------------------------------------
  // Step 2: View level derivation (tasks → stories → epics)
  // ---------------------------------------------------------------------------

  const { viewLevel, setViewLevel, displayNodes, displayEdges } = useGraphViewLevel(
    transformedNodes,
    transformedEdges,
  );

  // ---------------------------------------------------------------------------
  // Step 3: Status filter
  // ---------------------------------------------------------------------------

  const {
    visibleNodes: statusFilteredNodes,
    visibleEdges: statusFilteredEdges,
    activeStatuses,
    toggleStatus,
    statusCounts,
    orderedStatuses,
    selectAll: selectAllStatuses,
    deselectAll: deselectAllStatuses,
  } = useGraphStatusFilter(displayNodes, displayEdges);

  // ---------------------------------------------------------------------------
  // Step 4: Epic filter
  // ---------------------------------------------------------------------------

  const {
    visibleNodes: filteredNodes,
    visibleEdges: filteredEdges,
    selectedEpicIds,
    epicOptions,
    toggleEpic,
    selectAll: selectAllEpics,
    clearAll: clearAllEpics,
  } = useGraphEpicFilter(statusFilteredNodes, statusFilteredEdges);

  // ---------------------------------------------------------------------------
  // Step 5: Dagre layout (on the final filtered set)
  // Uses Web Worker for graphs with > 200 nodes; sync for smaller graphs.
  // ---------------------------------------------------------------------------

  const { layoutNodes, layoutEdges, isComputing } = useDagreLayout(filteredNodes, filteredEdges);

  // ---------------------------------------------------------------------------
  // Step 6: Fit view after view level change
  // ---------------------------------------------------------------------------

  const prevViewLevelRef = useRef(viewLevel);

  useEffect(() => {
    if (prevViewLevelRef.current !== viewLevel && layoutNodes.length > 0) {
      const timer = setTimeout(() => {
        void reactFlowInstance.fitView(FIT_VIEW_ANIMATED);
      }, 50);
      prevViewLevelRef.current = viewLevel;
      return () => {
        clearTimeout(timer);
      };
    }
    prevViewLevelRef.current = viewLevel;
    return undefined;
  }, [viewLevel, layoutNodes, reactFlowInstance]);

  // ---------------------------------------------------------------------------
  // Edge highlight state
  // ---------------------------------------------------------------------------

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Tooltip state
  // ---------------------------------------------------------------------------

  const {
    tooltipData,
    tooltipPosition,
    onNodeMouseEnter: tooltipMouseEnter,
    onNodeMouseLeave: tooltipMouseLeave,
  } = useGraphTooltip();

  // Compose edge highlight + tooltip hover handlers
  const handleNodeMouseEnter = useCallback(
    (event: React.MouseEvent, node: Node) => {
      setHoveredNodeId(node.id);
      tooltipMouseEnter(event, node);
    },
    [tooltipMouseEnter],
  );

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
    tooltipMouseLeave();
  }, [tooltipMouseLeave]);

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

  // ---------------------------------------------------------------------------
  // Node click navigation
  // ---------------------------------------------------------------------------

  const { onNodeClick, onNodeDoubleClick } = useNodeNavigation(projectId);

  // ---------------------------------------------------------------------------
  // Loading / Error / Empty states
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return <GraphLoadingState />;
  }

  if (isError) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return <GraphErrorState message={errorMessage} />;
  }

  if (!graphData || graphData.nodes.length === 0) {
    return <GraphEmptyState />;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      ref={containerRef}
      className={`flex h-full min-h-[600px] w-full flex-col${isFullscreen ? 'bg-white' : ''}`}
    >
      {/* Toolbar: filters and view level toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-2 py-2">
        <GraphStatusFilter
          activeStatuses={activeStatuses}
          onToggle={toggleStatus}
          statusCounts={statusCounts}
          orderedStatuses={orderedStatuses}
          onSelectAll={selectAllStatuses}
          onDeselectAll={deselectAllStatuses}
        />
        <div className="flex items-center gap-2">
          <GraphViewLevelToggle viewLevel={viewLevel} onViewLevelChange={setViewLevel} />
          <GraphEpicFilter
            epics={epicOptions}
            selectedEpicIds={selectedEpicIds}
            onToggle={toggleEpic}
            onSelectAll={selectAllEpics}
            onClearAll={clearAllEpics}
          />
        </div>
      </div>

      {/* Graph canvas */}
      <div className="relative flex-1">
        <ReactFlow
          nodes={layoutNodes}
          edges={highlightedEdges}
          nodeTypes={NODE_TYPES}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
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
            onToggleFullscreen={toggleFullscreen}
          />
        </ReactFlow>
        {isComputing && <GraphLayoutLoading nodeCount={filteredNodes.length} />}
        {tooltipData !== null && <GraphNodeTooltip data={tooltipData} position={tooltipPosition} />}
      </div>

      {/* Status color legend */}
      <GraphLegend />
    </div>
  );
};
