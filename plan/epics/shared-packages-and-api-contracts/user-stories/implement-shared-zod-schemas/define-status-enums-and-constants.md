# Define Status Enums and Constants

## Task Details

- **Title:** Define Status Enums and Constants
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement @laila/shared Zod Schemas and Types](./tasks.md)
- **Parent Epic:** [Shared Packages & API Contracts](../../user-stories.md)
- **Dependencies:** None

## Description

Define all status enumerations, priority levels, error codes, and system constants in `@laila/shared/constants`. These constants are the foundation for all entity schemas, API contracts, and business logic throughout the system.

The orchestration service uses a two-dimensional status model:
1. **Project Lifecycle Status** — Tracks the overall planning state of a project (e.g., draft, planning, ready, active, completed, archived)
2. **Work Status** — Tracks the execution state of individual work items: epics, user stories, and tasks (e.g., pending, blocked, ready, in_progress, review, done, failed)

All enums should be defined as Zod enums (`z.enum([...])`) so they can be used both for runtime validation and TypeScript type inference.

## Acceptance Criteria

- [ ] `packages/shared/src/constants/status.ts` exports project lifecycle status enum with values: `draft`, `planning`, `ready`, `active`, `completed`, `archived`
- [ ] `packages/shared/src/constants/status.ts` exports work status enum with values: `pending`, `blocked`, `ready`, `in_progress`, `review`, `done`, `failed`, `skipped`
- [ ] `packages/shared/src/constants/priority.ts` exports priority level enum with values: `critical`, `high`, `medium`, `low`
- [ ] `packages/shared/src/constants/error-codes.ts` exports a comprehensive error code enum covering: validation errors, authentication errors, authorization errors, not-found errors, conflict errors (optimistic locking), dependency errors (cycle detection, unresolved dependencies)
- [ ] `packages/shared/src/constants/api.ts` exports API-related constants: API key prefix (`lw_`), API version (`v1`), default pagination limit, max pagination limit
- [ ] `packages/shared/src/constants/index.ts` re-exports all constants
- [ ] All enums are defined as `z.enum()` for runtime validation support
- [ ] TypeScript types are inferred from Zod enums using `z.infer<typeof ...>`
- [ ] Each constant file includes descriptive code comments explaining the purpose and usage of each enum value

## Technical Notes

- Use Zod enums rather than TypeScript `enum` keyword — Zod enums provide runtime validation and TypeScript inference in one definition:
  ```typescript
  // packages/shared/src/constants/status.ts
  // Project lifecycle statuses track the overall planning phase of a project
  // Work statuses track execution state of individual work items (epics, stories, tasks)
  import { z } from 'zod';

  // Project lifecycle: draft -> planning -> ready -> active -> completed -> archived
  export const projectLifecycleStatusSchema = z.enum([
    'draft',      // Initial state, project is being defined
    'planning',   // Work breakdown is in progress
    'ready',      // Planning complete, ready for execution
    'active',     // Workers are actively executing tasks
    'completed',  // All work items are done
    'archived',   // Project is archived (soft-deleted from active view)
  ]);
  export type ProjectLifecycleStatus = z.infer<typeof projectLifecycleStatusSchema>;

  // Work item status: tracks individual epic/story/task execution
  export const workStatusSchema = z.enum([
    'pending',      // Created but not yet actionable
    'blocked',      // Waiting on dependency resolution
    'ready',        // All dependencies met, available for assignment
    'in_progress',  // Assigned to a worker, being executed
    'review',       // Work submitted, pending review
    'done',         // Successfully completed
    'failed',       // Failed after max attempts
    'skipped',      // Intentionally skipped (e.g., no longer needed)
  ]);
  export type WorkStatus = z.infer<typeof workStatusSchema>;
  ```
- Error codes should follow a structured naming convention: `{CATEGORY}_{SPECIFIC_ERROR}` (e.g., `VALIDATION_INVALID_STATUS_TRANSITION`, `AUTH_INVALID_API_KEY`, `CONFLICT_VERSION_MISMATCH`)
- The API key prefix (`lw_`) is used for quick identification of API keys belonging to this service and for efficient database lookups via the prefix column
- Keep constants in separate files by category for tree-shaking and organizational clarity

## References

- **Functional Requirements:** Status transition rules, priority system, error handling
- **Design Specification:** Two-dimensional status model, API key format
- **Project Setup:** @laila/shared constants module

## Estimated Complexity

Medium — Requires careful enumeration of all possible statuses, error codes, and constants based on the full system design. Getting the enum values right at this stage prevents breaking changes later.
