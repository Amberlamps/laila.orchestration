# Implement Assignment API Route

## Task Details

- **Title:** Implement Assignment API Route
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Work Assignment Endpoint](./tasks.md)
- **Parent Epic:** [Orchestration & Work Assignment API](../../user-stories.md)
- **Dependencies:** None

## Description

Implement the main orchestration endpoint `POST /api/v1/orchestration/assign`. This is the endpoint that AI workers call to request work. It accepts worker API key authentication and a project ID, evaluates eligibility rules from the domain logic engine, selects the best available story, and returns a typed discriminator response.

**SAFETY-CRITICAL:** This endpoint is the heart of the orchestration system. Every design decision must prioritize correctness over performance.

### Route Definition

```typescript
// pages/api/v1/orchestration/assign.ts
// Work assignment endpoint. Called by workers to request a story assignment.
// Uses worker API key authentication (not session auth).

import type { NextApiRequest, NextApiResponse } from "next";
import { withErrorHandler } from "@/lib/api/error-handler";
import { withAuth } from "@/lib/api/auth";
import { withValidation } from "@/lib/api/validation";
import {
  evaluateEligibility,
  selectBestStory,
  recommendTaskOrder,
} from "@laila/domain";

/**
 * POST /api/v1/orchestration/assign
 *
 * Auth: Worker API key (X-API-Key header)
 *
 * Body: {
 *   project_id: string (UUID)
 * }
 *
 * Response (typed discriminator union):
 *
 * Case 1 — Story assigned:
 * {
 *   type: "assigned",
 *   story: {
 *     id: string,
 *     name: string,
 *     description: string,
 *     priority: number,
 *     epic: { id: string, name: string },
 *     tasks: [{
 *       id: string,
 *       name: string,
 *       description: string,
 *       persona: { id: string, name: string, system_prompt: string },
 *       acceptance_criteria: string[],
 *       technical_notes: string | null,
 *       references: string[],
 *       dependencies: [{ id: string, name: string, status: string }],
 *       status: string,
 *     }],
 *     recommended_task_order: string[], // Task IDs in recommended execution order
 *   }
 * }
 *
 * Case 2 — All eligible stories are blocked:
 * {
 *   type: "blocked",
 *   blocking_stories: [{
 *     id: string,
 *     name: string,
 *     assigned_worker: string | null,
 *     blocking_reason: string,
 *   }],
 *   retry_after_seconds: number,
 * }
 *
 * Case 3 — All stories in the project are complete:
 * {
 *   type: "all_complete",
 *   project: { id: string, name: string },
 *   completed_stories: number,
 *   total_stories: number,
 * }
 */
```

### Request Schema

```typescript
// packages/shared/src/schemas/orchestration.ts
// Zod schemas for the orchestration assignment endpoint.

import { z } from "zod";

export const assignRequestSchema = z.object({
  project_id: z.string().uuid(),
});
```

### Response Types

```typescript
// packages/shared/src/types/orchestration.ts
// Typed discriminator union for assignment responses.
// The `type` field allows clients to switch on the response
// and get full type narrowing in TypeScript.

export type AssignmentResponse =
  | AssignedResponse
  | BlockedResponse
  | AllCompleteResponse;

export interface AssignedResponse {
  type: "assigned";
  story: AssignedStoryDetail;
}

export interface BlockedResponse {
  type: "blocked";
  blocking_stories: BlockingStoryInfo[];
  retry_after_seconds: number;
}

export interface AllCompleteResponse {
  type: "all_complete";
  project: { id: string; name: string };
  completed_stories: number;
  total_stories: number;
}
```

### Eligibility Flow

```typescript
// High-level flow inside the route handler:

// 1. Authenticate worker via API key
// 2. Verify worker has access to the requested project
// 3. Verify the project is in Ready or In-Progress status
// 4. Check if the worker already has an assigned story in this project
//    (one story per worker per project constraint)
// 5. Call domain eligibility rules to find eligible stories
// 6. If no eligible stories and all complete: return "all_complete"
// 7. If no eligible stories but some blocked: return "blocked"
// 8. Select the best story (highest priority, then oldest)
// 9. Atomically assign the story (optimistic locking — see next task)
// 10. Build the full response (see response builder task)
// 11. Return "assigned" response
```

## Acceptance Criteria

- [ ] `POST /api/v1/orchestration/assign` accepts worker API key authentication
- [ ] The endpoint validates the request body against `assignRequestSchema`
- [ ] Worker project access is verified before evaluating eligibility
- [ ] The one-story-per-worker-per-project constraint is enforced
- [ ] If the worker already has an assigned story, it is returned (re-assignment, not error)
- [ ] Domain eligibility rules (`evaluateEligibility`) are called to find eligible stories
- [ ] The response uses the typed discriminator pattern with `type` field
- [ ] `"assigned"` response includes full story details with tasks and recommended order
- [ ] `"blocked"` response includes blocking story details and a retry-after hint
- [ ] `"all_complete"` response includes project summary with completion counts
- [ ] The endpoint returns 403 with `PROJECT_ACCESS_DENIED` if the worker lacks project access
- [ ] The endpoint returns 404 with `PROJECT_NOT_FOUND` if the project does not exist
- [ ] The endpoint returns 409 with `INVALID_STATUS_TRANSITION` if the project is not Ready/In-Progress
- [ ] No `any` types are used in the implementation

## Technical Notes

- The "re-assignment" behavior (returning the already-assigned story) handles the case where a worker's previous request timed out or failed, and it is retrying. Rather than treating this as an error, the endpoint returns the already-assigned story so the worker can resume.
- The `retry_after_seconds` in the blocked response should be computed based on the expected completion time of blocking stories. A simple default (e.g., 60 seconds) is acceptable for v1.
- The eligibility evaluation uses pure domain functions from `@laila/domain` that take the project state as input and return eligible story IDs. The API layer is responsible for loading the state from the database and calling the domain functions.
- Consider rate limiting this endpoint to prevent workers from polling too aggressively. A simple approach: return `Retry-After: 5` header on all responses to suggest a minimum polling interval.

## References

- **Functional Requirements:** FR-ORCH-001 (work assignment), FR-ORCH-002 (eligibility rules), FR-ORCH-003 (typed response)
- **Design Specification:** Section 9.1 (Assignment Endpoint), Section 9.1.1 (Eligibility Flow)
- **Domain Logic:** `evaluateEligibility()`, `selectBestStory()` from `@laila/domain`
- **OpenAPI Specification:** POST /api/v1/orchestration/assign

## Estimated Complexity

Very High — This is the most complex endpoint in the system. It combines authentication, authorization, domain logic evaluation, atomic database operations, and multiple response types. The safety-critical nature demands exceptional care in implementation.
