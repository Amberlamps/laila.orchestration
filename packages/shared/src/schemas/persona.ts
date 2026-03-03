/**
 * @module @laila/shared/schemas/persona
 *
 * Zod schema for the Persona entity -- a role definition that tasks
 * reference for assignment matching.
 *
 * Personas describe specific skill sets or roles (e.g., "backend-developer",
 * "frontend-developer", "qa-engineer") that inform which worker agent is
 * best suited to execute a given task.
 *
 * Personas are tenant-scoped and project-scoped. They do not use soft-delete
 * or optimistic locking.
 *
 * This schema defines the API representation of a persona.
 * Database-level details (column types, indexes) belong in the Drizzle schema.
 */

import { z } from 'zod';

export const personaSchema = z.object({
  /** Unique identifier (UUID v4) */
  id: z.string().uuid(),

  /** Tenant ID -- equals the owning user's ID for single-tenant isolation */
  tenantId: z.string().uuid(),

  /** Project ID -- personas are scoped to a specific project */
  projectId: z.string().uuid(),

  /** Human-readable persona name (e.g., "Backend Developer") */
  name: z.string().min(1).max(255),

  /** Optional short description of the persona's role (up to 2,000 chars) */
  description: z.string().max(2000).nullable().optional(),

  /**
   * System prompt instructions injected into the AI worker's context when
   * executing tasks. Supports up to 50,000 characters for detailed
   * technical instructions.
   */
  systemPrompt: z.string().min(1).max(50000),

  /** Timestamp when the persona was created (ISO 8601) */
  createdAt: z.string().datetime(),

  /** Timestamp when the persona was last updated (ISO 8601) */
  updatedAt: z.string().datetime(),
});

/** TypeScript type for the Persona entity, inferred from the Zod schema */
export type Persona = z.infer<typeof personaSchema>;
