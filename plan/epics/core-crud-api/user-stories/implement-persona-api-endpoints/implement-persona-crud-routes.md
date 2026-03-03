# Implement Persona CRUD Routes

## Task Details

- **Title:** Implement Persona CRUD Routes
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Persona API Endpoints](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** None

## Description

Implement CRUD API routes for the Persona entity. Personas define the role, system prompt context, and behavioral instructions for AI workers executing tasks. Each task references a persona that tells the worker how to approach the work. Persona deletion is blocked when active tasks reference the persona.

### Route Definitions

```typescript
// pages/api/v1/personas/index.ts
// Handles POST (create) and GET (list) for personas.
// Requires human auth.

/**
 * POST /api/v1/personas
 * Create a new persona.
 * Body: {
 *   name: string,
 *   description?: string,
 *   system_prompt: string,
 *   project_id: string (UUID — personas are scoped to a project)
 * }
 * Returns: 201 with created persona
 */

/**
 * GET /api/v1/personas
 * List personas, optionally filtered by project.
 * Query: { project_id?, page, limit }
 * Returns: 200 with paginated persona list including usage count (active task references)
 */
```

```typescript
// pages/api/v1/personas/[id].ts
// Handles GET (detail), PATCH (update), DELETE (with guard) for a single persona.

/**
 * GET /api/v1/personas/:id
 * Get a single persona with usage statistics:
 * - Total tasks referencing this persona
 * - Active (non-completed) tasks referencing this persona
 * Returns: 200 with persona data
 */

/**
 * PATCH /api/v1/personas/:id
 * Update persona fields (name, description, system_prompt).
 * Returns: 200 with updated persona
 */

/**
 * DELETE /api/v1/personas/:id
 * Delete a persona.
 * GUARD: If active (non-completed, non-deleted) tasks reference this persona,
 * return 409 with DELETION_BLOCKED and the count of active tasks.
 * Returns: 204 No Content
 * Throws: ConflictError with DELETION_BLOCKED if active tasks reference the persona
 */
```

### Request Schemas

```typescript
// packages/shared/src/schemas/persona.ts
// Zod schemas for persona API request validation.

import { z } from 'zod';

export const createPersonaSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  system_prompt: z.string().min(1).max(50000),
  project_id: z.string().uuid(),
});

export const updatePersonaSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  system_prompt: z.string().min(1).max(50000).optional(),
});
```

## Acceptance Criteria

- [ ] `POST /api/v1/personas` creates a persona and returns 201
- [ ] `POST` validates the request body including project_id existence
- [ ] `GET /api/v1/personas` returns paginated personas with usage count
- [ ] `GET` supports filtering by `project_id`
- [ ] `GET /api/v1/personas/:id` returns persona with usage statistics
- [ ] `PATCH /api/v1/personas/:id` updates name, description, and system_prompt
- [ ] `DELETE /api/v1/personas/:id` returns 204 when no active tasks reference the persona
- [ ] `DELETE` returns 409 with `DELETION_BLOCKED` when active tasks reference the persona
- [ ] `DELETE` error includes the count of active tasks for user feedback
- [ ] Completed and deleted tasks do not block persona deletion
- [ ] All routes require human authentication
- [ ] Persona `system_prompt` allows up to 50,000 characters (for detailed instructions)
- [ ] No `any` types are used in the implementation

## Technical Notes

- The deletion guard query counts tasks where `persona_id = :personaId AND status NOT IN ('complete') AND deleted_at IS NULL`. This ensures that only active tasks block deletion.
- The `system_prompt` field is the key content of a persona — it contains the instructions that are injected into the AI worker's context when executing tasks. It must support long content (up to 50K chars) for detailed technical instructions.
- Personas are scoped to a project to prevent confusion between different project contexts. A persona's system prompt may reference project-specific patterns, technologies, and conventions.
- The usage count in the list endpoint is computed as a subquery count, not loaded as a separate query per persona (N+1 prevention).

## References

- **Functional Requirements:** FR-PERSONA-001 (persona CRUD), FR-PERSONA-002 (deletion guard)
- **Design Specification:** Section 7.6 (Persona API)
- **Database Schema:** personas table in `@laila/database`

## Estimated Complexity

Low-Medium — Standard CRUD with a deletion guard. The system_prompt field and usage statistics add minor complexity.
