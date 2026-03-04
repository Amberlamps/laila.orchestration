/**
 * @module audit/audit-actor
 *
 * Sub-component for rendering the actor (who performed the action) within
 * an audit event row.
 *
 * Actor types:
 * - Worker: Bot icon (indigo-500), regular font weight
 * - User: User icon (zinc-600), regular font weight
 * - System: Settings icon (zinc-400), italic "System" text in zinc-500
 */

import { Bot, Settings, User } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import type { AuditActorType } from '@laila/shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of characters for actor name display. */
const MAX_ACTOR_NAME_LENGTH = 18;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AuditActorProps {
  /** The type of actor: "user", "worker", or "system". */
  actorType: AuditActorType;
  /** Display name of the actor. */
  actorName: string;
  /** When true, uses text-xs instead of text-sm. */
  compact: boolean;
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
 * AuditActor renders the actor with type-specific styling:
 *
 * - **Worker**: Bot icon in indigo-500, name in regular weight
 * - **User**: User icon in zinc-600, name in regular weight
 * - **System**: Settings icon in zinc-400, italic "System" text in zinc-500
 *
 * Actor names longer than 18 characters are truncated with an ellipsis,
 * and the full name is shown in a tooltip on hover.
 */
export function AuditActor({ actorType, actorName, compact }: AuditActorProps) {
  const textSize = compact ? 'text-xs' : 'text-sm';
  const iconSize = 'h-3.5 w-3.5 flex-shrink-0';

  if (actorType === 'system') {
    return (
      <span className={cn('flex items-center gap-1', textSize)}>
        <Settings className={cn(iconSize, 'text-zinc-400')} aria-hidden="true" />
        <span className="text-zinc-500 italic">System</span>
      </span>
    );
  }

  const isWorker = actorType === 'worker';
  const Icon = isWorker ? Bot : User;
  const iconColor = isWorker ? 'text-indigo-500' : 'text-zinc-600';
  const displayName = truncate(actorName, MAX_ACTOR_NAME_LENGTH);
  const isTruncated = actorName.length > MAX_ACTOR_NAME_LENGTH;

  const nameElement = (
    <span className={cn('flex items-center gap-1', textSize)}>
      <Icon className={cn(iconSize, iconColor)} aria-hidden="true" />
      <span className="truncate font-medium text-zinc-800">{displayName}</span>
    </span>
  );

  if (isTruncated) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{nameElement}</TooltipTrigger>
        <TooltipContent side="top">
          <p>{actorName}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return nameElement;
}
