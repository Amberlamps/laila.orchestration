# Define Entity Schemas

## Task Details

- **Title:** Define Entity Schemas
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement @laila/shared Zod Schemas and Types](./tasks.md)
- **Parent Epic:** [Shared Packages & API Contracts](../../user-stories.md)
- **Dependencies:** Define Status Enums and Constants

## Description

Define Zod schemas for all core domain entities in `@laila/shared/schemas`. These schemas serve as the single source of truth for entity shapes — they are used for runtime validation at API boundaries, database result parsing, and TypeScript type inference throughout the application.

Each entity schema should define the full shape of the entity as it would be represented in API responses (not the database column layout — that is handled by Drizzle schema in Epic 3). The schemas should reference the status and priority enums defined in the constants module.

Entities to define:

- **Project** — The top-level organizational unit containing epics
- **Epic** — A large body of work within a project, containing user stories
- **User Story** — A unit of work within an epic, containing tasks and assignable to workers
- **Task** — The smallest unit of work, with dependency edges and persona references
- **Worker** — An AI agent that requests and executes work assignments
- **Persona** — A role definition (e.g., "backend-developer") that tasks reference for assignment matching

## Acceptance Criteria

- [ ] `packages/shared/src/schemas/project.ts` exports `projectSchema` with fields: id, tenantId, name, description, lifecycleStatus, workStatus, version, createdAt, updatedAt, deletedAt (nullable)
- [ ] `packages/shared/src/schemas/epic.ts` exports `epicSchema` with fields: id, tenantId, projectId, name, description, workStatus, sortOrder, version, createdAt, updatedAt, deletedAt (nullable)
- [ ] `packages/shared/src/schemas/user-story.ts` exports `userStorySchema` with fields: id, tenantId, epicId, title, description, priority, workStatus, costEstimate (nullable), actualCost (nullable), assignedWorkerId (nullable), assignedAt (nullable), attempts, maxAttempts, version, createdAt, updatedAt, deletedAt (nullable)
- [ ] `packages/shared/src/schemas/task.ts` exports `taskSchema` with fields: id, tenantId, userStoryId, title, description, acceptanceCriteria (array of strings), technicalNotes (nullable), personaId (nullable), workStatus, references (array), version, createdAt, updatedAt, deletedAt (nullable)
- [ ] `packages/shared/src/schemas/worker.ts` exports `workerSchema` with fields: id, tenantId, name, description (nullable), isActive, lastSeenAt (nullable), createdAt, updatedAt
- [ ] `packages/shared/src/schemas/persona.ts` exports `personaSchema` with fields: id, tenantId, title, description (Markdown string), createdAt, updatedAt
- [ ] Each schema file exports a TypeScript type inferred from the Zod schema (e.g., `export type Project = z.infer<typeof projectSchema>`)
- [ ] All schemas use the status/priority enums from the constants module
- [ ] `packages/shared/src/schemas/index.ts` re-exports all entity schemas and types
- [ ] All ID fields use `z.string().uuid()` for UUID validation
- [ ] All timestamp fields use `z.string().datetime()` or `z.coerce.date()` as appropriate
- [ ] Schemas include descriptive JSDoc comments on each field explaining its purpose

## Technical Notes

- Schema pattern for entities:

  ```typescript
  // packages/shared/src/schemas/project.ts
  // Zod schema for the Project entity — the top-level organizational unit
  // Contains epics and tracks both lifecycle (planning phase) and work (execution) status
  import { z } from 'zod';
  import { projectLifecycleStatusSchema, workStatusSchema } from '../constants/status';

  export const projectSchema = z.object({
    /** Unique identifier (UUID v4) */
    id: z.string().uuid(),
    /** Tenant ID — equals the owning user's ID for single-tenant isolation */
    tenantId: z.string().uuid(),
    /** Human-readable project name */
    name: z.string().min(1).max(255),
    /** Detailed project description (Markdown supported) */
    description: z.string().max(10000).nullable(),
    /** Current planning phase of the project */
    lifecycleStatus: projectLifecycleStatusSchema,
    /** Derived execution status computed from child epics */
    workStatus: workStatusSchema,
    /** Optimistic locking version — incremented on each update */
    version: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    /** Null means not deleted; ISO timestamp means soft-deleted */
    deletedAt: z.string().datetime().nullable(),
  });

  export type Project = z.infer<typeof projectSchema>;
  ```

- Use `.nullable()` for optional database fields that can be NULL, not `.optional()` — the field should always be present in the response, just potentially null
- The `version` field on entities supports optimistic locking — clients must send the current version on updates, and the server rejects updates with stale versions
- Consider defining "create" and "update" variants of schemas (e.g., `createProjectSchema` that omits auto-generated fields like id, createdAt) — but these may belong in the API request schemas task instead
- Keep entity schemas focused on the API representation; database-level details (like column types, indexes) belong in the Drizzle schema

## References

- **Functional Requirements:** Entity definitions for project, epic, story, task, worker, persona
- **Design Specification:** Entity relationships, status model, optimistic locking
- **Project Setup:** @laila/shared schemas module

## Estimated Complexity

Medium — Six entity schemas with careful field definitions, validation rules, and enum references. Requires understanding of the full domain model to get field shapes right.
