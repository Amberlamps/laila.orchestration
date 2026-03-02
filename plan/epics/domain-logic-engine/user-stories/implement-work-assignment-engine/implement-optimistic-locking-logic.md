# Implement Optimistic Locking Logic

## Task Details

- **Title:** Implement Optimistic Locking Logic
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Work Assignment Engine](./tasks.md)
- **Parent Epic:** [Domain Logic Engine](../../user-stories.md)
- **Dependencies:** None

## Description

Implement pure utility functions for optimistic locking that the API layer will use to handle concurrent modifications. Optimistic locking prevents lost updates when two agents (or a human and an agent) try to modify the same resource simultaneously.

The strategy: every mutable resource has a `version` field (integer, starting at 1). When updating, the client sends the version they read. The server checks: if the stored version matches the sent version, the update proceeds and the version increments. If versions don't match, a conflict is detected.

These functions are pure — they perform version comparison and conflict detection logic. The actual database operations (SELECT FOR UPDATE, version comparison, conditional UPDATE) are handled by the API layer.

```typescript
// packages/domain/src/assignment/optimistic-locking.ts
// Pure utility functions for optimistic locking.
// Handles version comparison, conflict detection, and retry guidance.
// The API layer uses these with the actual database operations.

/**
 * Result of a version conflict check.
 */
export type ConflictCheckResult =
  | { conflict: false }
  | {
      conflict: true;
      expectedVersion: number;
      actualVersion: number;
      message: string;
      retryGuidance: RetryGuidance;
    };

/**
 * Guidance for the client on how to handle a version conflict.
 */
export interface RetryGuidance {
  /** Whether the client should retry the operation */
  shouldRetry: boolean;
  /** How the client should retry */
  strategy: "refetch-and-retry" | "abort";
  /** Human-readable explanation */
  explanation: string;
}

/**
 * Check if a version conflict exists between the expected version
 * (what the client thinks the resource version is) and the actual
 * version (what the database says the resource version is).
 *
 * @param expectedVersion - The version the client sent with the update request
 * @param actualVersion - The current version in the database
 * @returns Conflict check result with retry guidance if conflict detected
 */
export function checkVersionConflict(
  expectedVersion: number,
  actualVersion: number
): ConflictCheckResult {
  if (expectedVersion === actualVersion) {
    return { conflict: false };
  }

  // Version mismatch — someone else modified the resource.
  const versionGap = actualVersion - expectedVersion;

  return {
    conflict: true,
    expectedVersion,
    actualVersion,
    message: `Version conflict: expected version ${expectedVersion}, but current version is ${actualVersion}`,
    retryGuidance: generateRetryGuidance(expectedVersion, actualVersion),
  };
}

/**
 * Generate retry guidance based on the version gap.
 *
 * Small version gaps (1-2) suggest a simple concurrent edit.
 * The client should refetch the resource and retry with the new version.
 *
 * Large version gaps suggest the client's data is significantly stale.
 * The client should refetch and re-evaluate whether the operation
 * is still appropriate.
 *
 * @param expectedVersion - The version the client sent
 * @param actualVersion - The current version in the database
 * @returns Retry guidance for the client
 */
export function generateRetryGuidance(
  expectedVersion: number,
  actualVersion: number
): RetryGuidance {
  const versionGap = actualVersion - expectedVersion;

  if (versionGap <= 0) {
    // This shouldn't happen in normal operation (actual < expected).
    // Could indicate a bug or data corruption.
    return {
      shouldRetry: false,
      strategy: "abort",
      explanation:
        "Unexpected version state: actual version is less than or equal to expected. " +
        "This may indicate data corruption. Please contact support.",
    };
  }

  if (versionGap <= 2) {
    // Small gap — likely a simple concurrent edit.
    // Safe to refetch and retry.
    return {
      shouldRetry: true,
      strategy: "refetch-and-retry",
      explanation:
        `Resource was modified ${versionGap} time(s) since you last read it. ` +
        "Please refetch the resource and retry your operation.",
    };
  }

  // Large gap — the client's data is significantly stale.
  // Still safe to retry, but the client should re-evaluate.
  return {
    shouldRetry: true,
    strategy: "refetch-and-retry",
    explanation:
      `Resource was modified ${versionGap} times since you last read it. ` +
      "Your data may be significantly out of date. " +
      "Please refetch the resource and verify your changes are still appropriate.",
  };
}

/**
 * Compute the next version number after a successful update.
 * Simply increments the current version by 1.
 *
 * @param currentVersion - The current version of the resource
 * @returns The next version number
 */
export function nextVersion(currentVersion: number): number {
  return currentVersion + 1;
}

/**
 * Build the conflict error response body for a 409 Conflict HTTP response.
 * Used by the API layer to construct the standard error response.
 *
 * @param entityType - The type of entity that had the conflict (e.g., "user-story", "task")
 * @param entityId - The ID of the conflicting entity
 * @param conflictResult - The conflict check result
 * @returns A structured error body for the 409 response
 */
export function buildConflictResponse(
  entityType: string,
  entityId: string,
  conflictResult: Extract<ConflictCheckResult, { conflict: true }>
): {
  error: {
    code: "VERSION_CONFLICT";
    message: string;
    details: {
      entityType: string;
      entityId: string;
      expectedVersion: number;
      actualVersion: number;
      retryGuidance: RetryGuidance;
    };
  };
} {
  return {
    error: {
      code: "VERSION_CONFLICT",
      message: conflictResult.message,
      details: {
        entityType,
        entityId,
        expectedVersion: conflictResult.expectedVersion,
        actualVersion: conflictResult.actualVersion,
        retryGuidance: conflictResult.retryGuidance,
      },
    },
  };
}

/**
 * Validate that a version number is valid (positive integer).
 * Used to validate client-provided version numbers.
 *
 * @param version - The version number to validate
 * @returns Whether the version is valid
 */
export function isValidVersion(version: unknown): version is number {
  return (
    typeof version === "number" &&
    Number.isInteger(version) &&
    version > 0
  );
}
```

## Acceptance Criteria

- [ ] `checkVersionConflict()` returns `{ conflict: false }` when versions match
- [ ] `checkVersionConflict()` returns `{ conflict: true }` with details when versions differ
- [ ] Conflict result includes expected version, actual version, and human-readable message
- [ ] `generateRetryGuidance()` recommends "refetch-and-retry" for small version gaps (1-2)
- [ ] `generateRetryGuidance()` recommends "refetch-and-retry" with stale data warning for large gaps
- [ ] `generateRetryGuidance()` recommends "abort" for invalid version states (actual < expected)
- [ ] `nextVersion()` correctly increments the version by 1
- [ ] `buildConflictResponse()` produces a well-structured 409 error response body
- [ ] `isValidVersion()` accepts positive integers and rejects zero, negatives, floats, and non-numbers
- [ ] All retry guidance includes a human-readable explanation
- [ ] All functions are pure — no side effects, no database calls
- [ ] No `any` types used (note: `isValidVersion` uses `unknown`, not `any`, for the input)

## Technical Notes

- Optimistic locking is preferred over pessimistic locking (SELECT FOR UPDATE with row locks) because the system has relatively low contention — most resources are only modified by one agent at a time. Optimistic locking avoids holding database locks and is more scalable.
- The `version` field should be part of every mutable entity's database schema (tasks, user stories, epics). The database layer (Epic 3) should have included this field.
- The API layer will implement the actual pattern: `BEGIN`, read resource with version, compare versions using these functions, conditionally UPDATE with version increment, `COMMIT`.
- The `buildConflictResponse()` function ensures consistent 409 error responses across all API endpoints. The `VERSION_CONFLICT` error code can be handled programmatically by clients.
- For execution agents, the recommended retry strategy is always "refetch-and-retry" — agents should fetch the latest version, re-evaluate whether the operation is still appropriate, and retry.
- The `isValidVersion()` function uses `unknown` as the parameter type (not `any`) to enforce that callers must narrow the type before using the version number.

## References

- **Functional Requirements:** FR-ASSIGN-030 (optimistic locking), FR-ASSIGN-031 (conflict detection)
- **Design Specification:** Section 5.3.6 (Optimistic Locking), Section 5.3.7 (Conflict Resolution)
- **Project Setup:** Domain package structure, error response conventions

## Estimated Complexity

Small — The optimistic locking functions are simple comparisons and data transformations. The main value is in the consistent interface and retry guidance generation. The conflict response builder ensures API consistency.
