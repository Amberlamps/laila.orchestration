/**
 * @module @laila/shared/schemas/persona
 *
 * Zod schema for the Persona entity -- a role definition that tasks
 * reference for assignment matching.
 *
 * Personas describe specific skill sets or roles (e.g., "backend-developer",
 * "frontend-developer", "qa-engineer") that inform which worker agent is
 * best suited to execute a given task. The description field uses Markdown
 * to provide rich role documentation.
 *
 * Personas are tenant-scoped global entities (not project-scoped) and do
 * not use soft-delete or optimistic locking.
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

  /** Human-readable persona title (e.g., "Backend Developer") */
  title: z.string().min(1).max(255),

  /** Rich description of the persona's role and capabilities (Markdown) */
  description: z.string().max(10000),

  /** Timestamp when the persona was created (ISO 8601) */
  createdAt: z.string().datetime(),

  /** Timestamp when the persona was last updated (ISO 8601) */
  updatedAt: z.string().datetime(),
});

/** TypeScript type for the Persona entity, inferred from the Zod schema */
export type Persona = z.infer<typeof personaSchema>;
