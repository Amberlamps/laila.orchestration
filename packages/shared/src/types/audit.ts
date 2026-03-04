/**
 * @module @laila/shared/types/audit
 *
 * TypeScript types for audit events used across the application.
 *
 * All types are inferred from the Zod schemas in `@laila/shared/schemas/audit`
 * to maintain a single source of truth. This file re-exports the schema-derived
 * types for consumers that only need the types (not the runtime validators).
 */

export type {
  AuditAction,
  AuditActorType,
  AuditChangeDiff,
  AuditEvent,
  AuditEntityType,
  AuditEventActor,
  AuditEventTarget,
  CreateAuditEventInput,
} from '../schemas/audit';
