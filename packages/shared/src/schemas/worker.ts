/**
 * @module @laila/shared/schemas/worker
 *
 * Zod schema for the Worker entity -- an AI agent that requests and
 * executes work assignments.
 *
 * Workers poll the orchestration service for available user stories,
 * execute tasks within those stories, and report results back. The
 * `isActive` flag and `lastSeenAt` timestamp enable the service to
 * track worker health and availability.
 *
 * Workers do not use soft-delete or optimistic locking -- they are
 * either active or inactive, and can be hard-deleted when decommissioned.
 *
 * This schema defines the API representation of a worker.
 * Database-level details (column types, indexes) belong in the Drizzle schema.
 */

import { z } from 'zod';

export const workerSchema = z.object({
  /** Unique identifier (UUID v4) */
  id: z.string().uuid(),

  /** Tenant ID -- equals the owning user's ID for single-tenant isolation */
  tenantId: z.string().uuid(),

  /** Human-readable worker name (e.g., "agent-backend-01") */
  name: z.string().min(1).max(255),

  /** Optional description of the worker's purpose or capabilities */
  description: z.string().max(2000).nullable(),

  /** Whether the worker is currently active and available for assignments */
  isActive: z.boolean(),

  /** Timestamp of the worker's last heartbeat; null if never seen */
  lastSeenAt: z.string().datetime().nullable(),

  /** Timestamp when the worker was created (ISO 8601) */
  createdAt: z.string().datetime(),

  /** Timestamp when the worker was last updated (ISO 8601) */
  updatedAt: z.string().datetime(),
});

/** TypeScript type for the Worker entity, inferred from the Zod schema */
export type Worker = z.infer<typeof workerSchema>;
