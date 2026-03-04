/**
 * GraphNodeTooltip — tooltip displayed when hovering over a graph node.
 *
 * Shows detailed entity information: full title, status badge, parent info,
 * dependency counts, and assigned worker. Rendered as a fixed-position
 * overlay with pointer-events: none so it does not interfere with mouse
 * interaction on the graph canvas.
 */
import { ArrowDown, ArrowUp, BookOpen, Bot, Layers } from 'lucide-react';

import { StatusBadge } from '@/components/ui/status-badge';

import type { WorkStatus } from '@/components/ui/status-badge';
import type { TooltipPosition } from '@/hooks/use-graph-tooltip';
import type { DependencyNodeData, GraphEntityType } from '@/lib/graph/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maps graph status strings to StatusBadge WorkStatus values. */
const STATUS_TO_WORK_STATUS: Record<string, WorkStatus> = {
  draft: 'draft',
  not_started: 'not_started',
  ready: 'ready',
  blocked: 'blocked',
  in_progress: 'in_progress',
  completed: 'complete',
  complete: 'complete',
  failed: 'failed',
};

/** Default fallback WorkStatus when the status string is unknown. */
const DEFAULT_WORK_STATUS: WorkStatus = 'not_started';

/** Human-readable labels for entity types. */
const ENTITY_TYPE_LABELS: Record<GraphEntityType, string> = {
  epic: 'Epic',
  story: 'Story',
  task: 'Task',
};

/** Icon size in pixels for tooltip section icons. */
const ICON_SIZE = 14;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a raw status string to a valid WorkStatus for the StatusBadge. */
const resolveWorkStatus = (status: string): WorkStatus =>
  STATUS_TO_WORK_STATUS[status] ?? DEFAULT_WORK_STATUS;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GraphNodeTooltipProps {
  /** Node data to display in the tooltip. */
  data: DependencyNodeData;
  /** Screen-space position for the tooltip. */
  position: TooltipPosition;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Title section: full entity title (not truncated) + entity type label. */
const TooltipTitle = ({ label, entityType }: { label: string; entityType: GraphEntityType }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[10px] font-medium tracking-wide text-zinc-400 uppercase">
      {ENTITY_TYPE_LABELS[entityType]}
    </span>
    <span className="text-sm font-semibold break-words text-zinc-900">{label}</span>
  </div>
);

/** Parent info section: shows epic and/or story parent names when available. */
const TooltipParentInfo = ({
  epicName,
  storyName,
  entityType,
}: {
  epicName: string | undefined;
  storyName: string | undefined;
  entityType: GraphEntityType;
}) => {
  // Epics have no parent to show
  if (entityType === 'epic') {
    return null;
  }

  const hasEpic = epicName !== undefined && epicName !== '';
  const hasStory = storyName !== undefined && storyName !== '' && entityType === 'task';

  if (!hasEpic && !hasStory) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 border-t border-zinc-100 pt-1.5">
      {hasEpic && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Layers size={ICON_SIZE} className="shrink-0 text-zinc-400" aria-hidden="true" />
          <span className="truncate">Epic: {epicName}</span>
        </div>
      )}
      {hasStory && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <BookOpen size={ICON_SIZE} className="shrink-0 text-zinc-400" aria-hidden="true" />
          <span className="truncate">Story: {storyName}</span>
        </div>
      )}
    </div>
  );
};

/** Dependency counts section: upstream and downstream counts. */
const TooltipDependencyCounts = ({
  upstreamCount,
  downstreamCount,
}: {
  upstreamCount: number;
  downstreamCount: number;
}) => (
  <div className="flex flex-col gap-1 border-t border-zinc-100 pt-1.5">
    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
      <ArrowUp size={ICON_SIZE} className="shrink-0 text-zinc-400" aria-hidden="true" />
      <span>
        {String(upstreamCount)} {upstreamCount === 1 ? 'dependency' : 'dependencies'}
      </span>
    </div>
    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
      <ArrowDown size={ICON_SIZE} className="shrink-0 text-zinc-400" aria-hidden="true" />
      <span>
        {String(downstreamCount)} {downstreamCount === 1 ? 'dependent' : 'dependents'}
      </span>
    </div>
  </div>
);

/** Worker assignment section: shown only for in-progress entities with a worker. */
const TooltipWorkerInfo = ({ workerName }: { workerName: string }) => (
  <div className="flex items-center gap-1.5 border-t border-zinc-100 pt-1.5 text-xs text-zinc-600">
    <Bot size={ICON_SIZE} className="shrink-0 text-zinc-400" aria-hidden="true" />
    <span className="truncate">Worker: {workerName}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Tooltip displayed when hovering over a dependency graph node.
 *
 * Renders as a fixed-position overlay outside the ReactFlow canvas
 * coordinate space. Uses pointer-events: none to avoid intercepting
 * mouse events on the graph.
 */
export const GraphNodeTooltip = ({ data, position }: GraphNodeTooltipProps) => {
  const workStatus = resolveWorkStatus(data.status);
  const upstreamCount = data.upstreamCount ?? 0;
  const downstreamCount = data.downstreamCount ?? 0;

  const isInProgress = data.status === 'in_progress';
  const showWorker = isInProgress && data.workerName !== undefined && data.workerName !== '';

  return (
    <div
      className="pointer-events-none fixed z-50 max-w-xs rounded-lg border border-zinc-200 bg-white p-3 shadow-lg"
      style={{ left: position.x, top: position.y }}
      role="tooltip"
    >
      {/* Title section */}
      <TooltipTitle label={data.label} entityType={data.entityType} />

      {/* Status badge */}
      <div className="mt-1.5 border-t border-zinc-100 pt-1.5">
        <StatusBadge status={workStatus} />
      </div>

      {/* Parent info */}
      <TooltipParentInfo
        epicName={data.epicName}
        storyName={data.storyName}
        entityType={data.entityType}
      />

      {/* Dependency counts */}
      <TooltipDependencyCounts upstreamCount={upstreamCount} downstreamCount={downstreamCount} />

      {/* Worker info (only for in-progress with assigned worker) */}
      {showWorker && <TooltipWorkerInfo workerName={data.workerName as string} />}
    </div>
  );
};
