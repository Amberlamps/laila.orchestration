/**
 * @module @laila/shared/schemas/audit
 *
 * Zod schemas for audit trail events. Every state-changing operation
 * in the system emits an audit event that is persisted to DynamoDB
 * for compliance and debugging.
 *
 * The schema is designed for DynamoDB compatibility:
 * - All fields use JSON-safe primitive types (strings, numbers, booleans)
 * - The `changes` field uses a record of `{ before, after }` diffs
 *   that map directly to DynamoDB Map attributes
 * - The `metadata` field is a flat string record for extensible context
 * - Timestamps are ISO 8601 strings (not Date objects) for safe serialization
 *
 * @example
 * ```typescript
 * const event = auditEventSchema.parse({
 *   eventId: '550e8400-e29b-41d4-a716-446655440000',
 *   entityType: 'project',
 *   entityId: '550e8400-e29b-41d4-a716-446655440001',
 *   action: 'updated',
 *   actorType: 'user',
 *   actorId: 'user-123',
 *   timestamp: '2026-03-02T12:00:00.000Z',
 *   changes: {
 *     name: { before: 'Old Name', after: 'New Name' },
 *     status: { before: 'active', after: 'completed' },
 *   },
 *   metadata: { source: 'api', ip: '192.168.1.1' },
 * });
 * ```
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Audit action enum
// ---------------------------------------------------------------------------

/**
 * The set of actions that can be recorded in an audit event.
 *
 * Covers the full lifecycle of domain entities plus orchestration events.
 */
export const auditActionSchema = z.enum([
  'created',
  'updated',
  'deleted',
  'status_changed',
  'assigned',
  'completed',
]);

/** Inferred TypeScript type for audit actions */
export type AuditAction = z.infer<typeof auditActionSchema>;

// ---------------------------------------------------------------------------
// Audit actor type enum
// ---------------------------------------------------------------------------

/**
 * The type of principal that triggered the audit event.
 *
 * - `user` — a human operator via the UI or API
 * - `worker` — an AI agent performing automated work
 * - `system` — an internal process (e.g., scheduler, migration)
 */
export const auditActorTypeSchema = z.enum(['user', 'worker', 'system']);

/** Inferred TypeScript type for audit actor types */
export type AuditActorType = z.infer<typeof auditActorTypeSchema>;

// ---------------------------------------------------------------------------
// Change diff entry
// ---------------------------------------------------------------------------

/**
 * A single field-level change showing the before and after values.
 *
 * Values are stored as JSON-compatible types to support DynamoDB
 * serialization without custom marshalling.
 */
export const auditChangeDiffSchema = z.object({
  /** The field value before the change (null for newly added fields) */
  before: z.unknown().optional(),

  /** The field value after the change (null for removed fields) */
  after: z.unknown().optional(),
});

/** Inferred TypeScript type for a single change diff entry */
export type AuditChangeDiff = z.infer<typeof auditChangeDiffSchema>;

// ---------------------------------------------------------------------------
// Audit event schema
// ---------------------------------------------------------------------------

/**
 * Schema for a complete audit trail event.
 *
 * Audit events are immutable once written. The `eventId` serves as the
 * DynamoDB partition key, and `entityType#entityId` is used as a GSI
 * for querying all events related to a specific entity.
 */
export const auditEventSchema = z.object({
  /** Unique identifier for this audit event (UUID v4) */
  eventId: z.string().uuid(),

  /** The type of entity that was acted upon (e.g., 'project', 'task') */
  entityType: z.string().min(1).max(100),

  /** The unique identifier of the entity that was acted upon */
  entityId: z.string().min(1).max(255),

  /** The action that was performed */
  action: auditActionSchema,

  /** The type of actor that performed the action */
  actorType: auditActorTypeSchema,

  /** The unique identifier of the actor (user ID, worker ID, or system identifier) */
  actorId: z.string().min(1).max(255),

  /** ISO 8601 timestamp of when the event occurred */
  timestamp: z.string().datetime(),

  /**
   * Record of field-level changes with before/after values.
   *
   * Keys are field names; values contain the previous and new values.
   * Empty for `created` and `deleted` actions where a full diff is
   * not meaningful.
   */
  changes: z.record(z.string(), auditChangeDiffSchema).optional(),

  /**
   * Extensible key-value metadata for additional context.
   *
   * Common entries: `source` (api/ui/worker), `ip`, `userAgent`,
   * `correlationId`, `tenantId`.
   */
  metadata: z.record(z.string(), z.string()).optional(),
});

/** Inferred TypeScript type for a complete audit event */
export type AuditEvent = z.infer<typeof auditEventSchema>;

// ---------------------------------------------------------------------------
// Audit entity type enum
// ---------------------------------------------------------------------------

/**
 * The set of entity types that can be the target of an audit event.
 *
 * Covers all first-class domain entities in the system.
 */
export const auditEntityTypeSchema = z.enum([
  'project',
  'epic',
  'story',
  'task',
  'worker',
  'persona',
]);

/** Inferred TypeScript type for audit entity types */
export type AuditEntityType = z.infer<typeof auditEntityTypeSchema>;

// ---------------------------------------------------------------------------
// Nested actor / target types for API layer
// ---------------------------------------------------------------------------

/**
 * Schema for the actor (who) in an audit event.
 *
 * Provides a structured representation grouping the actor's type,
 * identifier, and display name together for API responses.
 */
export const auditEventActorSchema = z.object({
  /** The type of principal that performed the action */
  type: auditActorTypeSchema,
  /** Unique identifier of the actor (user ID, worker ID, or "system") */
  id: z.string().min(1).max(255),
  /** Human-readable display name (user name, worker name, or "System") */
  name: z.string().min(1).max(255),
});

/** Structured actor type for audit events */
export type AuditEventActor = z.infer<typeof auditEventActorSchema>;

/**
 * Schema for the target entity (what) in an audit event.
 *
 * Provides a structured representation grouping the entity's type,
 * identifier, and display name together for API responses.
 */
export const auditEventTargetSchema = z.object({
  /** The type of entity that was acted upon */
  type: auditEntityTypeSchema,
  /** Unique identifier of the target entity */
  id: z.string().min(1).max(255),
  /** Human-readable display name of the target entity */
  name: z.string().min(1).max(255),
});

/** Structured target entity type for audit events */
export type AuditEventTarget = z.infer<typeof auditEventTargetSchema>;

// ---------------------------------------------------------------------------
// Create audit event input (API-facing)
// ---------------------------------------------------------------------------

/**
 * Input schema for creating an audit event via the service layer.
 *
 * This is the high-level input shape used by callers. The service
 * generates computed fields (eventId, timestamp, sort key, TTL).
 */
export const createAuditEventInputSchema = z.object({
  /** Project scope for the event */
  projectId: z.string().min(1).max(255),
  /** Who performed the action */
  actor: auditEventActorSchema,
  /** What action was performed */
  action: z.string().min(1).max(100),
  /** Which entity was acted upon */
  targetEntity: auditEventTargetSchema,
  /** Human-readable description of what changed */
  details: z.string().min(1).max(2000),
  /** Optional additional context metadata */
  metadata: z.record(z.string(), z.string()).optional(),
});

/** Input type for creating an audit event */
export type CreateAuditEventInput = z.infer<typeof createAuditEventInputSchema>;
