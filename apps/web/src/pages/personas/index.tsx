/**
 * Persona list page -- `/personas`
 *
 * Displays all personas in a responsive card grid layout.
 * Personas are top-level entities scoped to the authenticated user.
 *
 * Layout: AppLayout with `variant="full"` for full-width card grid.
 * Auth: ProtectedRoute wraps via custom getLayout.
 * Data: TanStack Query `usePersonas` hook (15s polling via query client defaults).
 */
import { Edit, MoreVertical, Plus, Trash2, UserCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useState } from 'react';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppLayout } from '@/components/layout/app-layout';
import { PersonaFormModal } from '@/components/personas/persona-form-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDeletePersona, usePersonas } from '@/lib/query-hooks';

import type { NextPageWithLayout } from '../_app';
import type { ReactElement } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of a persona row as returned by the API list endpoint. */
interface PersonaRow {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  /** Number of active tasks currently referencing this persona (not in API spec yet). */
  activeTaskCount?: number | undefined;
  /** Optimistic locking version for updates (not in API spec yet). */
  version?: number | undefined;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKELETON_COUNT = 6;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strips basic Markdown formatting from a string for plain-text preview.
 * Removes headers, bold/italic markers, links, images, code blocks, and
 * list markers. Preserves the underlying text content.
 */
function stripMarkdown(text: string): string {
  return (
    text
      // Remove headings (# ... ######)
      .replace(/^#{1,6}\s+/gm, '')
      // Remove images ![alt](url)
      .replace(/!\[.*?\]\(.*?\)/g, '')
      // Convert links [text](url) to just text
      .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
      // Remove bold/italic markers (**, __, *, _)
      .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, '$2')
      // Remove inline code backticks
      .replace(/`([^`]*)`/g, '$1')
      // Remove code fences
      .replace(/```[\s\S]*?```/g, '')
      // Remove blockquotes
      .replace(/^>\s+/gm, '')
      // Remove horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, '')
      // Remove unordered list markers
      .replace(/^[\s]*[-*+]\s+/gm, '')
      // Remove ordered list markers
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // Collapse multiple newlines
      .replace(/\n{2,}/g, '\n')
      .trim()
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Actions dropdown menu for a persona card. */
function PersonaCardActions({
  persona,
  onEdit,
  onDelete,
}: {
  persona: PersonaRow;
  onEdit: (persona: PersonaRow) => void;
  onDelete: (persona: PersonaRow) => void;
}) {
  const activeCount = persona.activeTaskCount ?? 0;
  const hasActiveTasks = activeCount > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
          aria-label={`Actions for ${persona.title}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <MoreVertical className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onEdit(persona);
          }}
        >
          <Edit className="size-4" />
          Edit
        </DropdownMenuItem>
        {hasActiveTasks ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <DropdownMenuItem disabled destructive>
                    <Trash2 className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </div>
              </TooltipTrigger>
              <TooltipContent side="left">
                Cannot delete — {String(activeCount)} active{' '}
                {activeCount === 1 ? 'task uses' : 'tasks use'} this persona
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <DropdownMenuItem
            destructive
            onClick={(e) => {
              e.stopPropagation();
              onDelete(persona);
            }}
          >
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A single persona card in the grid. */
function PersonaCard({
  persona,
  onEdit,
  onDelete,
}: {
  persona: PersonaRow;
  onEdit: (persona: PersonaRow) => void;
  onDelete: (persona: PersonaRow) => void;
}) {
  const router = useRouter();
  const activeCount = persona.activeTaskCount ?? 0;
  const descriptionPreview = persona.description
    ? stripMarkdown(persona.description)
    : 'No description';

  const href = `/personas/${persona.id}`;

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't navigate if clicking inside the dropdown menu trigger/content
      const target = e.target as HTMLElement;
      if (target.closest('[data-persona-actions]')) return;
      void router.push(href);
    },
    [router, href],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const target = e.target as HTMLElement;
        if (target.closest('[data-persona-actions]')) return;
        e.preventDefault();
        void router.push(href);
      }
    },
    [router, href],
  );

  return (
    <Card
      className="flex cursor-pointer flex-col p-5 transition-shadow hover:shadow-md"
      role="link"
      tabIndex={0}
      aria-label={`View persona: ${persona.title}`}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
    >
      {/* Header: Title + three-dot menu */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base leading-tight font-semibold">
          <Link
            href={href}
            tabIndex={-1}
            className="text-zinc-900 transition-colors hover:text-indigo-600"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {persona.title}
          </Link>
        </h3>
        <div data-persona-actions>
          <PersonaCardActions persona={persona} onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>

      {/* Description preview (2 lines, truncated) */}
      <p className="mt-2 line-clamp-2 min-h-[2.5em] text-[13px] leading-snug text-zinc-500">
        {descriptionPreview}
      </p>

      {/* Usage count badge */}
      <div className="mt-3">
        <Badge variant="secondary">
          {String(activeCount)} active {activeCount === 1 ? 'task' : 'tasks'}
        </Badge>
      </div>
    </Card>
  );
}

/** Loading skeleton grid. */
function LoadingGrid() {
  return (
    <div
      className="grid gap-5"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))' }}
      role="status"
      aria-label="Loading personas"
    >
      {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const PersonasPage: NextPageWithLayout = () => {
  const [personaToDelete, setPersonaToDelete] = useState<PersonaRow | null>(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [personaToEdit, setPersonaToEdit] = useState<PersonaRow | null>(null);

  // Data fetching (15s polling configured via query client defaults)
  const { data, isLoading } = usePersonas();
  const deletePersona = useDeletePersona();

  const personas: PersonaRow[] = (data?.data ?? []) as PersonaRow[];

  // Handle create persona — open modal without persona data
  const handleCreatePersona = () => {
    setPersonaToEdit(null);
    setFormModalOpen(true);
  };

  // Handle edit persona — open modal with existing persona data
  const handleEditPersona = (persona: PersonaRow) => {
    setPersonaToEdit(persona);
    setFormModalOpen(true);
  };

  // Handle delete confirmation
  const handleDeleteConfirm = () => {
    if (!personaToDelete) return;
    deletePersona.mutate(personaToDelete.id, {
      onSuccess: () => {
        setPersonaToDelete(null);
      },
    });
  };

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Personas</h1>
        <Button onClick={handleCreatePersona}>
          <Plus className="size-4" aria-hidden="true" />+ Create Persona
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && <LoadingGrid />}

      {/* Empty state */}
      {!isLoading && personas.length === 0 && (
        <EmptyState
          icon={(props: { className?: string }) => <UserCircle {...props} />}
          title="No personas defined"
          description="Personas define the role a worker should adopt for each task. Create a persona before adding tasks."
          actionLabel="+ Create Persona"
          onAction={handleCreatePersona}
        />
      )}

      {/* Card grid */}
      {!isLoading && personas.length > 0 && (
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))' }}
        >
          {personas.map((persona) => (
            <PersonaCard
              key={persona.id}
              persona={persona}
              onEdit={handleEditPersona}
              onDelete={setPersonaToDelete}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={personaToDelete !== null}
        onClose={() => {
          setPersonaToDelete(null);
        }}
        title={`Delete Persona "${personaToDelete?.title ?? ''}"?`}
        description="This will permanently delete this persona. Tasks currently using this persona will need to be reassigned. This action cannot be undone."
        confirmLabel="Delete Persona"
        onConfirm={handleDeleteConfirm}
        loading={deletePersona.isPending}
        variant="destructive"
      />

      {/* Create / Edit Persona Modal */}
      <PersonaFormModal
        open={formModalOpen}
        onOpenChange={setFormModalOpen}
        {...(personaToEdit
          ? {
              persona: {
                id: personaToEdit.id,
                title: personaToEdit.title,
                description: personaToEdit.description,
                version: personaToEdit.version,
              },
            }
          : {})}
      />
    </>
  );
};

/**
 * Custom layout: wraps in ProtectedRoute + AppLayout with `variant="full"`
 * for full-width card grid layout.
 */
PersonasPage.getLayout = (page: ReactElement) => (
  <ProtectedRoute>
    <AppLayout variant="full">{page}</AppLayout>
  </ProtectedRoute>
);

export default PersonasPage;
