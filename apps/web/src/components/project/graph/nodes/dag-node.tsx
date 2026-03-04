/**
 * DagNode — custom ReactFlow node component for all entity types in the DAG.
 *
 * Renders a rounded rectangle (~180px x 60px) with:
 *  - White background and 1px zinc-200 border
 *  - 3px colored left border reflecting entity status
 *  - Entity type icon + truncated title (30 chars) with hover tooltip
 *  - Compact StatusBadge below the title
 *  - Top (target) and bottom (source) handles for edge connections
 *  - Selected state: indigo-500 ring + shadow-lg
 *  - Hover: shadow-md transition, cursor pointer
 *
 * Memoized with memo() for ReactFlow rendering performance.
 */
import { Handle, Position } from '@xyflow/react';
import { memo } from 'react';

import { StatusBadge } from '@/components/ui/status-badge';
import { statusBorderColors } from '@/lib/graph/status-colors';
import { cn } from '@/lib/utils';

import { EntityTypeIcon } from './entity-type-icon';

import type { WorkStatus } from '@/components/ui/status-badge';
import type { DependencyNodeData } from '@/lib/graph/types';
import type { Node, NodeProps } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** ReactFlow node type parameterized with DependencyNodeData. */
export type DagNodeType = Node<DependencyNodeData>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum characters to display in the node title before truncation. */
const MAX_TITLE_LENGTH = 30;

/** Style applied to handles to keep them near-invisible (8px, opacity 0). */
const HANDLE_STYLE: React.CSSProperties = {
  width: 8,
  height: 8,
  opacity: 0,
};

/**
 * Maps graph status strings to StatusBadge WorkStatus values.
 * The graph API may use "completed" whereas the StatusBadge expects "complete".
 */
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Truncate text to a maximum length, appending an ellipsis if trimmed. */
const truncateTitle = (text: string, max: number): string =>
  text.length > max ? text.slice(0, max) + '...' : text;

/** Resolve a raw status string to a valid WorkStatus for the StatusBadge. */
const resolveWorkStatus = (status: string): WorkStatus =>
  STATUS_TO_WORK_STATUS[status] ?? DEFAULT_WORK_STATUS;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * DagNode is the shared custom node renderer for epics, stories, and tasks.
 * It is registered once as "dagNode" in the node types map and differentiates
 * entity types by data.entityType.
 */
const DagNodeComponent = ({ data, selected }: NodeProps<DagNodeType>) => {
  const borderColor = statusBorderColors[data.status] ?? 'border-l-zinc-400';
  const displayTitle = truncateTitle(data.label, MAX_TITLE_LENGTH);
  const workStatus = resolveWorkStatus(data.status);

  return (
    <>
      {/* Target handle (incoming edges) at the top */}
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />

      {/* Node body */}
      <div
        className={cn(
          // Dimensions and shape
          'min-h-[60px] w-[180px] rounded-lg',
          // Background and border
          'border border-zinc-200 bg-white',
          // Left accent border (3px, status color)
          'border-l-[3px]',
          borderColor,
          // Shadow and transitions
          'shadow-sm transition-shadow duration-150 hover:shadow-md',
          // Cursor
          'cursor-pointer',
          // Selected state
          selected && 'shadow-lg ring-2 ring-indigo-500 ring-offset-2',
        )}
      >
        {/* Content */}
        <div className="flex flex-col gap-1 px-3 py-2">
          {/* Top row: icon + title */}
          <div className="flex items-center gap-1.5">
            <EntityTypeIcon entityType={data.entityType} />
            <span className="truncate text-sm font-medium text-zinc-900" title={data.label}>
              {displayTitle}
            </span>
          </div>

          {/* Bottom row: compact status badge */}
          <StatusBadge status={workStatus} className="h-[18px] self-start text-[10px]" />
        </div>
      </div>

      {/* Source handle (outgoing edges) at the bottom */}
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
    </>
  );
};

/** Memoized DagNode for ReactFlow rendering performance. */
export const DagNode = memo(DagNodeComponent);
DagNode.displayName = 'DagNode';
