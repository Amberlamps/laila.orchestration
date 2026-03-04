/**
 * Dashboard empty state — displayed when the authenticated user has zero projects.
 *
 * This is the first screen new users see after signing in. It provides a
 * welcoming experience with clear guidance on how to get started:
 *
 * 1. Large FolderKanban icon as visual anchor
 * 2. Welcome heading and platform description
 * 3. Primary CTA linking to project creation
 * 4. Three contextual guidance hints explaining platform capabilities
 *
 * Built on top of the EmptyState design-system component for consistent
 * centered layout, with additional custom content below.
 */
import { Activity, BookOpen, FolderKanban, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

import type { LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Guidance hints configuration
// ---------------------------------------------------------------------------

interface GuidanceHint {
  icon: LucideIcon;
  text: string;
}

const GUIDANCE_HINTS: GuidanceHint[] = [
  {
    icon: BookOpen,
    text: 'Define epics, stories, and tasks',
  },
  {
    icon: Sparkles,
    text: 'Assign AI workers with personas',
  },
  {
    icon: Activity,
    text: 'Monitor progress in real-time',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Full-page empty state for the global dashboard when the user has no projects.
 *
 * Uses the EmptyState component from the design system as the foundation,
 * then adds a primary CTA button and contextual guidance hints below.
 *
 * The CTA links to `/projects/new` via Next.js Link for client-side navigation.
 * After project creation, TanStack Query cache invalidation on the projects list
 * key triggers a re-fetch, automatically transitioning the dashboard from the
 * empty state to the full dashboard view.
 */
export function DashboardEmptyState() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <EmptyState
        icon={(props: { className?: string }) => <FolderKanban {...props} />}
        title="Welcome to laila.works"
        description="laila.works orchestrates AI agents to break down and execute complex software projects. Create your first project to get started."
        className="min-h-0 gap-3 p-0"
      />

      {/* Primary CTA */}
      <div className="mt-6">
        <Button asChild size="lg">
          <Link href="/projects/new">
            <Plus className="size-4" aria-hidden="true" />
            Create your first project
          </Link>
        </Button>
      </div>

      {/* Contextual guidance hints */}
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
        {GUIDANCE_HINTS.map((hint) => {
          const HintIcon = hint.icon;
          return (
            <div key={hint.text} className="flex items-center gap-2 text-sm text-zinc-400">
              <HintIcon className="size-4 text-indigo-400" aria-hidden="true" />
              <span>{hint.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
