/**
 * AuditEntryRow -- Reusable row component for displaying a single audit event.
 *
 * Renders:
 * - Relative timestamp (e.g. "3 minutes ago") with absolute datetime tooltip
 * - Actor with contextual icon: Bot for workers, User for humans, italic gray for "System"
 * - Human-readable action description
 * - Target entity name as a link to its detail page
 *
 * @example
 * ```tsx
 * <AuditEntryRow
 *   event={auditEvent}
 *   projectId="proj-123"
 * />
 * ```
 */
import { formatDistanceToNow } from 'date-fns';
import { Bot, User } from 'lucide-react';
import Link from 'next/link';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Actor type for an audit event entry. */
export type AuditActorType = 'worker' | 'user' | 'system';

/** Entity types that can appear as targets of audit events. */
export type AuditEntityType = 'project' | 'epic' | 'story' | 'task' | 'worker' | 'persona';

/** Shape of a single audit event as returned by the API. */
export interface AuditEvent {
  id: string;
  timestamp: string;
  actor_type: AuditActorType;
  actor_name: string | null;
  action: string;
  entity_type: AuditEntityType;
  entity_name: string | null;
  entity_id: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AuditEntryRowProps {
  /** The audit event data to render. */
  event: AuditEvent;
  /** The project ID used to construct entity detail links. */
  projectId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const absoluteDateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * Builds the detail page URL for a given entity type and ID.
 * Returns null for entity types that do not have a dedicated detail page
 * or when the entity is the project itself.
 */
function buildEntityHref(
  projectId: string,
  entityType: AuditEntityType,
  entityId: string,
): string | null {
  switch (entityType) {
    case 'project':
      return `/projects/${projectId}`;
    case 'epic':
      return `/projects/${projectId}/epics/${entityId}`;
    case 'story':
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
 * Renders an icon and label for the actor of an audit event.
 */
function ActorDisplay({
  actorType,
  actorName,
}: {
  actorType: AuditActorType;
  actorName: string | null;
}) {
  if (actorType === 'system') {
    return <span className="text-sm text-zinc-500 italic">System</span>;
  }

  const displayName = actorName ?? (actorType === 'worker' ? 'Worker' : 'User');
  const Icon = actorType === 'worker' ? Bot : User;

  return (
    <span className="flex items-center gap-1 text-sm text-zinc-700">
      <Icon className="h-3.5 w-3.5 flex-shrink-0 text-zinc-500" />
      <span className="truncate">{displayName}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AuditEntryRow({ event, projectId }: AuditEntryRowProps) {
  const eventDate = new Date(event.timestamp);
  const relativeTime = formatDistanceToNow(eventDate, { addSuffix: true });
  const absoluteTime = absoluteDateFormatter.format(eventDate);

  const entityHref = buildEntityHref(projectId, event.entity_type, event.entity_id);
  const entityLabel = event.entity_name ?? event.entity_type;

  return (
    <div className="flex items-start gap-3 border-b border-zinc-100 px-1 py-2.5 last:border-b-0">
      {/* Timestamp */}
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <time dateTime={event.timestamp} className="w-24 flex-shrink-0 text-xs text-zinc-500">
              {relativeTime}
            </time>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{absoluteTime}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Event details */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <ActorDisplay actorType={event.actor_type} actorName={event.actor_name} />
          <span className="text-sm text-zinc-600">{event.action}</span>
        </div>

        {/* Target entity */}
        <div className="text-sm">
          <span className="text-zinc-500">{event.entity_type}: </span>
          {entityHref ? (
            <Link
              href={entityHref}
              className="font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
            >
              {entityLabel}
            </Link>
          ) : (
            <span className="font-medium text-zinc-700">{entityLabel}</span>
          )}
        </div>
      </div>
    </div>
  );
}
