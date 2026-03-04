/**
 * @module AuditEntryRow
 *
 * Reusable row component for displaying a single audit event entry.
 * Used in the dashboard Recent Activity snapshot and will be reused
 * in the full Audit Log page (Epic 12).
 *
 * Each row displays:
 * - Relative timestamp with absolute datetime tooltip on hover
 * - Actor with type-appropriate icon (Bot/User/System)
 * - Project name linked to the project detail page
 * - Human-readable action description
 * - Target entity type and name linked to the entity detail page
 */

import { Bot, User } from 'lucide-react';
import Link from 'next/link';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatAbsoluteTime, formatRelativeTime } from '@/lib/format-relative-time';

import type { DashboardAuditEvent } from '@/lib/query-hooks';

// ---------------------------------------------------------------------------
// Human-readable action descriptions
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  status_changed: 'changed status of',
  assigned: 'assigned',
  completed: 'completed',
};

/**
 * Returns a human-readable action description for an audit event.
 *
 * If the action is "status_changed" and changes include a status field,
 * appends the new status value for clarity.
 */
function getActionLabel(event: DashboardAuditEvent): string {
  const base = ACTION_LABELS[event.action] ?? event.action;

  if (event.action === 'status_changed' && event.changes?.status) {
    const newStatus = event.changes.status.after;
    if (typeof newStatus === 'string') {
      return `${base} to ${newStatus.replace(/_/g, ' ')}`;
    }
  }

  if (event.action === 'updated' && event.changes) {
    const changedFields = Object.keys(event.changes);
    if (changedFields.length === 1 && changedFields[0]) {
      return `updated ${changedFields[0].replace(/_/g, ' ')} of`;
    }
  }

  return base;
}

// ---------------------------------------------------------------------------
// Entity link construction
// ---------------------------------------------------------------------------

/**
 * Constructs the URL path for a given entity based on its type and IDs.
 * Returns null if the entity type does not have a known detail page.
 */
function getEntityLink(event: DashboardAuditEvent): string | null {
  const { entityType, entityId, projectId } = event;

  switch (entityType) {
    case 'project':
      return `/projects/${entityId}`;
    case 'epic':
      return `/projects/${projectId}/epics/${entityId}`;
    case 'story':
    case 'user_story':
      return `/projects/${projectId}/stories/${entityId}`;
    case 'task':
      return `/projects/${projectId}/tasks/${entityId}`;
    case 'worker':
      return `/workers/${entityId}`;
    case 'persona':
      return `/personas/${entityId}`;
    default:
      return null;
  }
}

/**
 * Returns a display-friendly entity type label.
 */
function getEntityTypeLabel(entityType: string): string {
  switch (entityType) {
    case 'project':
      return 'project';
    case 'epic':
      return 'epic';
    case 'story':
    case 'user_story':
      return 'story';
    case 'task':
      return 'task';
    case 'worker':
      return 'worker';
    case 'persona':
      return 'persona';
    default:
      return entityType.replace(/_/g, ' ');
  }
}

// ---------------------------------------------------------------------------
// Actor display
// ---------------------------------------------------------------------------

interface ActorDisplayProps {
  actorType: 'user' | 'worker' | 'system';
  actorName: string;
}

function ActorDisplay({ actorType, actorName }: ActorDisplayProps) {
  if (actorType === 'system') {
    return <span className="text-sm text-zinc-500 italic">System</span>;
  }

  const Icon = actorType === 'worker' ? Bot : User;

  return (
    <span className="inline-flex items-center gap-1 text-sm text-zinc-700">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{actorName}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// AuditEntryRow component
// ---------------------------------------------------------------------------

interface AuditEntryRowProps {
  event: DashboardAuditEvent;
}

/**
 * Renders a single audit event as a compact row.
 *
 * Layout: [timestamp] [actor] [action] [entity type+name] in [project name]
 */
export function AuditEntryRow({ event }: AuditEntryRowProps) {
  const entityLink = getEntityLink(event);
  const entityTypeLabel = getEntityTypeLabel(event.entityType);
  const actionLabel = getActionLabel(event);

  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 py-2.5 text-sm">
      {/* Relative timestamp with absolute tooltip */}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <time dateTime={event.timestamp} className="shrink-0 text-xs text-zinc-400">
              {formatRelativeTime(event.timestamp)}
            </time>
          </TooltipTrigger>
          <TooltipContent side="top">{formatAbsoluteTime(event.timestamp)}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Actor */}
      <ActorDisplay actorType={event.actorType} actorName={event.actorName} />

      {/* Action */}
      <span className="text-zinc-600">{actionLabel}</span>

      {/* Target entity */}
      <span className="inline-flex items-baseline gap-1">
        <span className="text-zinc-500">{entityTypeLabel}</span>
        {entityLink ? (
          <Link
            href={entityLink}
            className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
          >
            {event.entityName}
          </Link>
        ) : (
          <span className="font-medium text-zinc-800">{event.entityName}</span>
        )}
      </span>

      {/* Project context (if entity is not the project itself) */}
      {event.entityType !== 'project' && (
        <span className="inline-flex items-baseline gap-1">
          <span className="text-zinc-500">in</span>
          <Link
            href={`/projects/${event.projectId}`}
            className="text-indigo-600 hover:text-indigo-800 hover:underline"
          >
            {event.projectName}
          </Link>
        </span>
      )}
    </div>
  );
}
