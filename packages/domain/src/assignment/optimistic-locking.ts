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
  strategy: 'refetch-and-retry' | 'abort';
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
  actualVersion: number,
): ConflictCheckResult {
  if (expectedVersion === actualVersion) {
    return { conflict: false };
  }

  // Version mismatch — someone else modified the resource.
  return {
    conflict: true,
    expectedVersion,
    actualVersion,
    message: `Version conflict: expected version ${String(expectedVersion)}, but current version is ${String(actualVersion)}`,
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
  actualVersion: number,
): RetryGuidance {
  const versionGap = actualVersion - expectedVersion;

  if (versionGap <= 0) {
    // This shouldn't happen in normal operation (actual < expected).
    // Could indicate a bug or data corruption.
    return {
      shouldRetry: false,
      strategy: 'abort',
      explanation:
        'Unexpected version state: actual version is less than or equal to expected. ' +
        'This may indicate data corruption. Please contact support.',
    };
  }

  if (versionGap <= 2) {
    // Small gap — likely a simple concurrent edit.
    // Safe to refetch and retry.
    return {
      shouldRetry: true,
      strategy: 'refetch-and-retry',
      explanation:
        `Resource was modified ${String(versionGap)} time(s) since you last read it. ` +
        'Please refetch the resource and retry your operation.',
    };
  }

  // Large gap — the client's data is significantly stale.
  // Still safe to retry, but the client should re-evaluate.
  return {
    shouldRetry: true,
    strategy: 'refetch-and-retry',
    explanation:
      `Resource was modified ${String(versionGap)} times since you last read it. ` +
      'Your data may be significantly out of date. ' +
      'Please refetch the resource and verify your changes are still appropriate.',
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
  conflictResult: Extract<ConflictCheckResult, { conflict: true }>,
): {
  error: {
    code: 'VERSION_CONFLICT';
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
      code: 'VERSION_CONFLICT',
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
  return typeof version === 'number' && Number.isInteger(version) && version > 0;
}
