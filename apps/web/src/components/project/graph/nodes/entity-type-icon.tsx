/**
 * EntityTypeIcon — maps graph entity types to distinct Lucide icons.
 *
 * - Epic:  Layers icon   (top-level grouping)
 * - Story: BookOpen icon (user story within an epic)
 * - Task:  ListChecks icon (individual task within a story)
 *
 * Each icon is 14px with text-zinc-400 color by default.
 */
import { BookOpen, Layers, ListChecks } from 'lucide-react';

import type { GraphEntityType } from '@/lib/graph/types';
import type { LucideProps } from 'lucide-react';

/** Props for the EntityTypeIcon component. */
interface EntityTypeIconProps {
  /** The entity type to render an icon for. */
  entityType: GraphEntityType;
  /** Optional additional class names for the icon element. */
  className?: string;
}

/** Icon size in pixels used for the graph node icons. */
const ICON_SIZE = 14;

/** Map from entity type to the corresponding Lucide icon component. */
const ENTITY_ICON_MAP: Record<GraphEntityType, React.ComponentType<LucideProps>> = {
  epic: Layers,
  story: BookOpen,
  task: ListChecks,
};

/**
 * Renders the appropriate Lucide icon for a given entity type.
 *
 * Defaults to 14px size and text-zinc-400 color; both can be
 * overridden via the className prop.
 */
export const EntityTypeIcon = ({ entityType, className }: EntityTypeIconProps) => {
  const Icon = ENTITY_ICON_MAP[entityType];

  return <Icon size={ICON_SIZE} className={className ?? 'text-zinc-400'} aria-hidden="true" />;
};
