# Define API Request/Response Schemas

## Task Details

- **Title:** Define API Request/Response Schemas
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement @laila/shared Zod Schemas and Types](./tasks.md)
- **Parent Epic:** [Shared Packages & API Contracts](../../user-stories.md)
- **Dependencies:** Define Status Enums and Constants

## Description

Define Zod schemas for all API request bodies, query parameters, and response payloads in `@laila/shared/schemas`. These schemas are used for request validation in API route handlers and for type-safe response construction.

The API follows REST conventions with:

- Create requests (POST bodies) that omit auto-generated fields
- Update requests (PATCH/PUT bodies) that include a `version` field for optimistic locking
- List requests (GET query params) with pagination, filtering, and sorting
- Typed work assignment responses that use a discriminated union (assigned/blocked/all_complete)

## Acceptance Criteria

- [ ] Create request schemas exist for: project, epic, user story, task, worker, persona
- [ ] Update request schemas exist for: project, epic, user story, task, worker, persona — each includes a `version` field for optimistic locking
- [ ] List query parameter schemas exist with: `page` (number), `limit` (number), `sortBy` (string), `sortOrder` (asc/desc), entity-specific filters (e.g., `status`, `projectId`, `epicId`)
- [ ] Work assignment response schema uses a Zod discriminated union with three variants:
  - `assigned` — contains the user story and its tasks for the worker to execute
  - `blocked` — indicates all remaining work is blocked on dependencies
  - `all_complete` — indicates the project has no remaining work
- [ ] Work completion request schema includes: `userStoryId`, `status` (done/failed), `cost` (number), `reason` (string, for failures)
- [ ] API key creation response schema includes the raw API key (only returned once at creation time)
- [ ] All request schemas have appropriate `.min()`, `.max()`, string length, and format validations
- [ ] Response schemas for lists include a `data` array and `pagination` object
- [ ] All schemas are exported from `packages/shared/src/schemas/api/index.ts`
- [ ] Descriptive code comments explain the purpose and context of each schema

## Technical Notes

- Work assignment discriminated union pattern:

  ```typescript
  // packages/shared/src/schemas/api/work-assignment.ts
  // Typed response for the work assignment endpoint (POST /api/v1/work/next)
  // Uses a discriminated union so consumers can narrow the response type by checking `type`
  import { z } from 'zod';
  import { userStorySchema } from '../user-story';
  import { taskSchema } from '../task';

  // When a work item is available and assigned to the requesting worker
  const workAssignedSchema = z.object({
    type: z.literal('assigned'),
    userStory: userStorySchema,
    tasks: z.array(taskSchema),
    assignedAt: z.string().datetime(),
  });

  // When all remaining work items are blocked by unresolved dependencies
  const workBlockedSchema = z.object({
    type: z.literal('blocked'),
    reason: z.string(),
    blockedCount: z.number().int(),
  });

  // When all work in the project is complete
  const workAllCompleteSchema = z.object({
    type: z.literal('all_complete'),
    completedAt: z.string().datetime(),
  });

  export const workAssignmentResponseSchema = z.discriminatedUnion('type', [
    workAssignedSchema,
    workBlockedSchema,
    workAllCompleteSchema,
  ]);

  export type WorkAssignmentResponse = z.infer<typeof workAssignmentResponseSchema>;
  ```

- Create request schemas should use `.pick()` or `.omit()` on entity schemas where possible to avoid duplication:
  ```typescript
  // Derive create schema from entity schema by omitting auto-generated fields
  export const createProjectSchema = projectSchema.omit({
    id: true,
    tenantId: true,
    workStatus: true,
    version: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  });
  ```
- Update schemas should use `.partial()` for optional fields but keep `version` required:
  ```typescript
  export const updateProjectSchema = createProjectSchema.partial().extend({
    version: z.number().int().nonnegative(), // Required for optimistic locking
  });
  ```
- Pagination query params should have sensible defaults and maximum limits to prevent abuse
- Consider organizing API schemas in a subdirectory: `packages/shared/src/schemas/api/`

## References

- **Functional Requirements:** REST API request/response contracts, work assignment protocol
- **Design Specification:** Optimistic locking, discriminated union responses, pagination
- **Project Setup:** @laila/shared API schemas

## Estimated Complexity

Medium — Multiple schemas with derivation from entity schemas, discriminated unions, and careful validation rules. The work assignment response requires understanding the orchestration protocol.
