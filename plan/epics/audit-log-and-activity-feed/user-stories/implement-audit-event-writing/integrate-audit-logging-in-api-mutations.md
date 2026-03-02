# Integrate Audit Logging in API Mutations

## Task Details

- **Title:** Integrate Audit Logging in API Mutations
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Audit Event Writing](./tasks.md)
- **Parent Epic:** [Audit Log & Activity Feed](../../user-stories.md)
- **Dependencies:** Create Audit Event Service

## Description

Add audit event writes to all CRUD API mutations (create, update, delete, status transitions) across all entity types: projects, epics, stories, tasks, workers, and personas. Each mutation should write a structured audit event after the operation succeeds, using the audit event service created in the previous task.

### Integration Pattern

```typescript
// apps/web/src/lib/api/audit-integration.ts
// Helper function for writing audit events from API route handlers.
// Provides a consistent interface for all entity mutations.

import { auditEventService } from "@laila/database";
import type { CreateAuditEventInput, AuditEventActor } from "@laila/shared";
import type { NextApiRequest } from "next";

/**
 * writeAuditEvent(input: CreateAuditEventInput): Promise<void>
 *
 * Fire-and-forget wrapper around the audit event service.
 * Catches and logs errors without throwing.
 *
 * Usage in API route handlers:
 *
 * // After a successful create operation:
 * writeAuditEvent({
 *   projectId: project.id,
 *   actor: getActorFromRequest(req),
 *   action: "created",
 *   targetEntity: {
 *     type: "project",
 *     id: project.id,
 *     name: project.name,
 *   },
 *   details: `Created project "${project.name}"`,
 * });
 *
 * // After a successful status transition:
 * writeAuditEvent({
 *   projectId: project.id,
 *   actor: getActorFromRequest(req),
 *   action: "status_changed",
 *   targetEntity: {
 *     type: "project",
 *     id: project.id,
 *     name: project.name,
 *   },
 *   details: `Changed project status from "${oldStatus}" to "${newStatus}"`,
 *   metadata: { oldStatus, newStatus },
 * });
 */
```

### Actor Resolution

```typescript
// apps/web/src/lib/api/resolve-actor.ts
// Resolves the actor (who performed the action) from the API request.
// Handles both human users (OAuth session) and API key (worker) auth.

/**
 * getActorFromRequest(req: NextApiRequest): AuditEventActor
 *
 * Resolution logic:
 * 1. If request has a session (OAuth user):
 *    - type: "user"
 *    - id: session.user.id
 *    - name: session.user.name || session.user.email
 *
 * 2. If request has an API key (worker auth):
 *    - type: "worker"
 *    - id: worker.id
 *    - name: worker.name
 *
 * 3. Fallback (should not happen in production):
 *    - type: "system"
 *    - id: "unknown"
 *    - name: "Unknown"
 */
```

### Entity-Specific Audit Events

```typescript
// List of all CRUD mutations that require audit logging:

/**
 * Projects:
 * - POST /api/v1/projects            → action: "created"
 * - PATCH /api/v1/projects/:id        → action: "updated"
 * - DELETE /api/v1/projects/:id       → action: "deleted"
 * - POST /api/v1/projects/:id/publish → action: "status_changed" (draft → ready)
 * - POST /api/v1/projects/:id/revert  → action: "status_changed" (ready → draft)
 *
 * Epics:
 * - POST /api/v1/projects/:id/epics           → action: "created"
 * - PATCH /api/v1/projects/:id/epics/:eid     → action: "updated"
 * - DELETE /api/v1/projects/:id/epics/:eid    → action: "deleted"
 * - Lifecycle transitions                     → action: "status_changed"
 *
 * Stories:
 * - POST /api/v1/projects/:id/stories         → action: "created"
 * - PATCH /api/v1/projects/:id/stories/:sid   → action: "updated"
 * - DELETE /api/v1/projects/:id/stories/:sid  → action: "deleted"
 * - Assignment                                → action: "assigned"
 * - Unassignment                              → action: "unassigned"
 * - Status transitions                        → action: "status_changed"
 *
 * Tasks:
 * - POST /api/v1/projects/:id/tasks           → action: "created"
 * - PATCH /api/v1/projects/:id/tasks/:tid     → action: "updated"
 * - DELETE /api/v1/projects/:id/tasks/:tid    → action: "deleted"
 * - Status transitions                        → action: "status_changed"
 *
 * Workers:
 * - POST /api/v1/workers                      → action: "created"
 * - PATCH /api/v1/workers/:id                 → action: "updated"
 * - DELETE /api/v1/workers/:id                → action: "deleted"
 *
 * Personas:
 * - POST /api/v1/personas                     → action: "created"
 * - PATCH /api/v1/personas/:id                → action: "updated"
 * - DELETE /api/v1/personas/:id               → action: "deleted"
 */
```

### Detail Message Templates

```typescript
// apps/web/src/lib/api/audit-messages.ts
// Template functions for generating human-readable audit event details.

/**
 * auditMessages = {
 *   created: (entityType: string, name: string) =>
 *     `Created ${entityType} "${name}"`,
 *
 *   updated: (entityType: string, name: string, fields: string[]) =>
 *     `Updated ${entityType} "${name}" (${fields.join(", ")})`,
 *
 *   deleted: (entityType: string, name: string) =>
 *     `Deleted ${entityType} "${name}"`,
 *
 *   statusChanged: (entityType: string, name: string, from: string, to: string) =>
 *     `Changed ${entityType} "${name}" status from ${from} to ${to}`,
 *
 *   assigned: (workerName: string, storyName: string) =>
 *     `Assigned worker "${workerName}" to story "${storyName}"`,
 *
 *   unassigned: (workerName: string, storyName: string) =>
 *     `Unassigned worker "${workerName}" from story "${storyName}"`,
 * }
 */
```

## Acceptance Criteria

- [ ] All project CRUD mutations (create, update, delete) write audit events
- [ ] All project lifecycle transitions (publish, revert) write audit events with old and new status
- [ ] All epic CRUD mutations and lifecycle transitions write audit events
- [ ] All story CRUD mutations, status transitions, and assignment/unassignment write audit events
- [ ] All task CRUD mutations and status transitions write audit events
- [ ] All worker CRUD mutations write audit events
- [ ] All persona CRUD mutations write audit events
- [ ] Audit events include the correct actor (user from session, worker from API key)
- [ ] Audit events include the target entity type, ID, and name
- [ ] Audit events include human-readable detail messages describing the change
- [ ] Update events include the list of modified fields in the details
- [ ] Status change events include the old and new status in metadata
- [ ] Audit event writes are fire-and-forget — they do not block API responses
- [ ] Audit event write failures are logged but do not cause API errors
- [ ] Audit event format is consistent across all entity types
- [ ] No `any` types are used in the implementation

## Technical Notes

- Audit events are written after the primary operation succeeds. If the audit write fails, the operation still returns success. Use `void auditEventService.writeEvent(input).catch(console.error)` or `Promise.allSettled()` to ensure non-blocking behavior.
- The `getActorFromRequest()` function should use the same auth context that the `withAuth` middleware provides. Access the session or API key identity from the enriched request object.
- For update operations, determine which fields changed by comparing the update payload with the existing entity. Include only the changed field names (not values) in the detail message for privacy/brevity.
- For delete operations with cascade (e.g., deleting a project deletes all children), write a single audit event for the top-level delete. Do not write individual events for each cascaded child deletion.
- The `metadata` field on audit events can store structured data like `{ oldStatus, newStatus }` for status changes, enabling structured queries in the future.

## References

- **Audit Event Service:** Created in the previous task (`create-audit-event-service`)
- **API Routes:** CRUD endpoints from Epic 6 (Core CRUD API)
- **Auth Context:** `withAuth` middleware from Epic 4 (Authentication & Authorization)
- **Type Definitions:** `AuditEvent`, `CreateAuditEventInput` from `@laila/shared`

## Estimated Complexity

Medium-High — Requires touching all API route handlers across 6 entity types to add audit logging. Each integration is straightforward, but the breadth of changes is significant. The actor resolution and detail message templates add moderate complexity.
