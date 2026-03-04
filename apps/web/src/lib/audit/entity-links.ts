/**
 * @module audit/entity-links
 *
 * Constructs navigation links for audit event target entities.
 *
 * Maps entity type and ID to a detail page URL. Workers and personas are
 * not project-scoped, so they use top-level routes. All other entities
 * are nested under projects.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal entity shape needed to construct a link. */
interface EntityLinkTarget {
  type: string;
  id: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the detail page URL for a given entity type and ID.
 *
 * Route mapping:
 * - project:  `/projects/{id}`
 * - epic:     `/projects/{projectId}/epics/{id}`
 * - story:    `/projects/{projectId}/stories/{id}`
 * - task:     `/projects/{projectId}/tasks/{id}`
 * - worker:   `/workers/{id}`
 * - persona:  `/personas/{id}`
 *
 * Returns `null` for unknown entity types.
 */
export function getEntityLink(entity: EntityLinkTarget, projectId: string): string | null {
  switch (entity.type) {
    case 'project':
      return `/projects/${entity.id}`;
    case 'epic':
      return `/projects/${projectId}/epics/${entity.id}`;
    case 'story':
      return `/projects/${projectId}/stories/${entity.id}`;
    case 'task':
      return `/projects/${projectId}/tasks/${entity.id}`;
    case 'worker':
      return `/workers/${entity.id}`;
    case 'persona':
      return `/personas/${entity.id}`;
    default:
      return null;
  }
}
