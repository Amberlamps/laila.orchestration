/**
 * @module audit/audit-entry
 *
 * Shared component for rendering a single audit event row.
 *
 * Used across multiple pages and sections for consistent audit display:
 * - Cross-project audit log page
 * - Project activity tab
 * - Dashboard recent activity snapshot
 * - Project overview activity feed
 *
 * Supports two rendering modes:
 * - **Full** (default): Standard row with timestamp, actor, action, and
 *   optional project column.
 * - **Compact**: Condensed variant for dashboard snapshots with smaller
 *   padding and text.
 */

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { memo } from 'react';

import { AuditActor } from '@/components/audit/audit-actor';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getEntityLink } from '@/lib/audit/entity-links';
import { formatAbsoluteTime, formatRelativeTime } from '@/lib/format-relative-time';
import { cn } from '@/lib/utils';

import type { AuditActorType } from '@laila/shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of characters for entity name display. */
const MAX_ENTITY_NAME_LENGTH = 40;

/** Maximum number of characters for project name display. */
const MAX_PROJECT_NAME_LENGTH = 25;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape of an audit event as consumed by this component.
 *
 * Matches the `DashboardAuditEvent` shape returned by the API endpoints
 * (`/api/v1/audit-events` and `/api/v1/projects/:id/audit-events`).
 */
export interface AuditEntryEvent {
  eventId: string;
  entityType: string;
  entityId: string;
  entityName: string;
  action: string;
  actorType: AuditActorType;
  actorId: string;
  actorName: string;
  projectId: string;
  projectName: string;
  timestamp: string;
  changes?: Record<string, { before?: unknown; after?: unknown }>;
  metadata?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AuditEntryProps {
  /** The audit event data to render. */
  event: AuditEntryEvent;
  /** When true, displays the project column (cross-project view). */
  showProject?: boolean;
  /** When true, enables the condensed variant for dashboard snapshots. */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Truncates a string to the given length, appending an ellipsis if truncated.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + '\u2026';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * AuditEntry renders a single audit event as a horizontal row.
 *
 * Layout (full mode):
 * 1. **Timestamp** (w-[100px]): relative time with absolute datetime tooltip
 * 2. **Actor** (w-[120px]): icon + name based on actor type
 * 3. **Action + Target** (flex-1): action verb + entity type prefix + linked entity name
 * 4. **Project** (optional): project name linked to `/projects/:id`
 *
 * Layout (compact mode):
 * - Reduced padding (py-1.5 vs py-2.5)
 * - All text uses text-xs
 * - No project column
 */
function AuditEntryInner({ event, showProject = false, compact = false }: AuditEntryProps) {
  const relativeTime = formatRelativeTime(event.timestamp);
  const absoluteTime = formatAbsoluteTime(event.timestamp);

  const entityLink = getEntityLink({ type: event.entityType, id: event.entityId }, event.projectId);

  const entityDisplayName = truncate(event.entityName, MAX_ENTITY_NAME_LENGTH);
  const isEntityNameTruncated = event.entityName.length > MAX_ENTITY_NAME_LENGTH;

  const textSize = compact ? 'text-xs' : 'text-sm';

  return (
    <div
      className={cn(
        'flex items-start gap-3 border-b border-zinc-100 transition-colors hover:bg-zinc-50',
        compact ? 'py-1.5' : 'py-2.5',
      )}
    >
      {/* 1. Timestamp column */}
      <div className="w-[100px] flex-shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <time dateTime={event.timestamp} className="text-xs text-zinc-400">
              {relativeTime}
            </time>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{absoluteTime}</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* 2. Actor column */}
      <div className="w-[120px] flex-shrink-0">
        <AuditActor actorType={event.actorType} actorName={event.actorName} compact={compact} />
      </div>

      {/* 3. Action + Target column */}
      <div className="min-w-0 flex-1">
        <span className={cn(textSize, 'text-zinc-600')}>{event.action}</span>{' '}
        <span className={cn(textSize, 'text-zinc-400')}>{event.entityType}</span>{' '}
        {entityLink ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={entityLink}
                className={cn(
                  textSize,
                  'inline-flex items-center gap-0.5 font-medium text-indigo-600 hover:text-indigo-700 hover:underline',
                )}
              >
                {entityDisplayName}
                <ExternalLink className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
              </Link>
            </TooltipTrigger>
            {isEntityNameTruncated && (
              <TooltipContent side="top">
                <p>{event.entityName}</p>
              </TooltipContent>
            )}
          </Tooltip>
        ) : (
          <span className={cn(textSize, 'font-medium text-zinc-700')}>
            {isEntityNameTruncated ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>{entityDisplayName}</span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{event.entityName}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              entityDisplayName
            )}
          </span>
        )}
      </div>

      {/* 4. Project column (optional, cross-project view only) */}
      {showProject && !compact && (
        <div className="w-[140px] flex-shrink-0 text-right">
          <Link
            href={`/projects/${event.projectId}`}
            className="text-xs text-zinc-500 hover:text-indigo-600 hover:underline"
            title={
              event.projectName.length > MAX_PROJECT_NAME_LENGTH ? event.projectName : undefined
            }
          >
            {truncate(event.projectName, MAX_PROJECT_NAME_LENGTH)}
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * Memoized AuditEntry component.
 *
 * Wrapped with `memo()` because this component is rendered in long lists
 * (50+ items). Memoization prevents unnecessary re-renders when the list
 * scrolls or sibling items update.
 */
export const AuditEntry = memo(AuditEntryInner);

AuditEntry.displayName = 'AuditEntry';
