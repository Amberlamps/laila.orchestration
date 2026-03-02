/**
 * @module api-key-validator
 *
 * Validates API keys from the Authorization header for execution agent requests.
 *
 * Uses prefix-based O(1) lookup against the api_keys table followed by
 * timing-safe SHA-256 hash comparison. All failure cases return `null`
 * without leaking details about the failure reason, preventing enumeration
 * attacks and timing side-channels.
 *
 * Validation flow:
 * 1. Extract Bearer token from Authorization header
 * 2. Reject malformed keys before any database query
 * 3. Extract prefix for O(1) indexed lookup
 * 4. Query api_keys table by prefix (unique index)
 * 5. Compare SHA-256 hashes with timing-safe equality
 * 6. Check key is not revoked
 * 7. Check key expiry (expires_at)
 * 8. Check worker is active
 * 9. Update last_used_at on the API key record asynchronously
 * 10. Load worker project access permissions
 * 11. Inject authenticated worker context onto the request object
 * 12. Return authenticated worker context or null
 */

import { timingSafeEqual } from 'node:crypto';

import { getDb, apiKeysTable, workersTable, workerProjectAccessTable } from '@laila/database';
import { eq } from 'drizzle-orm';

import { hashApiKey, extractPrefix, isValidKeyFormat } from '@/lib/api-keys';

import type { NextApiRequest } from 'next';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The authenticated worker context injected into the request
 * after successful API key validation.
 *
 * Downstream handlers use this to enforce project-level authorization
 * and audit trail attribution.
 */
export interface WorkerAuthContext {
  /** Discriminator for distinguishing agent auth from user auth. */
  type: 'agent';
  /** The worker's UUID (primary key). */
  workerId: string;
  /** The worker's human-readable name. */
  workerName: string;
  /** The tenant UUID that owns this worker. */
  tenantId: string;
  /** Project UUIDs this worker has been granted access to. */
  projectAccess: string[];
}

/**
 * Extended NextApiRequest with the authenticated worker context injected
 * by the API key validation middleware.
 */
export interface AuthenticatedApiRequest extends NextApiRequest {
  /** The authenticated worker context, set by validateApiKey. */
  workerAuth: WorkerAuthContext;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The expected prefix in the Authorization header value. */
const BEARER_PREFIX = 'Bearer ';

/** SHA-256 digest length in bytes. */
const SHA256_BYTE_LENGTH = 32;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compares two hex-encoded SHA-256 hashes using timing-safe equality.
 *
 * Both inputs must be valid 64-character hex strings (SHA-256 output).
 * Returns `false` if either input is not the expected length, preventing
 * `timingSafeEqual` from throwing on length mismatch.
 */
const safeHashComparison = (providedHashHex: string, storedHashHex: string): boolean => {
  const providedBuffer = Buffer.from(providedHashHex, 'hex');
  const storedBuffer = Buffer.from(storedHashHex, 'hex');

  // SHA-256 produces 32 bytes. Guard against malformed stored data.
  if (providedBuffer.length !== SHA256_BYTE_LENGTH || storedBuffer.length !== SHA256_BYTE_LENGTH) {
    return false;
  }

  return timingSafeEqual(providedBuffer, storedBuffer);
};

/**
 * Loads the project IDs that a worker has been granted access to.
 *
 * Queries the worker_project_access junction table to determine which
 * projects the worker can operate on, enabling project-level authorization.
 */
const loadWorkerProjectAccess = async (workerId: string): Promise<string[]> => {
  const db = getDb();

  const accessRecords = await db
    .select({ projectId: workerProjectAccessTable.projectId })
    .from(workerProjectAccessTable)
    .where(eq(workerProjectAccessTable.workerId, workerId));

  return accessRecords.map((record) => record.projectId);
};

/**
 * Fires an asynchronous update to the API key record's last_used_at timestamp.
 *
 * Uses fire-and-forget to avoid adding latency to the request path.
 * Failures are logged but do not affect the authentication result.
 */
const updateLastUsedAt = (apiKeyId: string): void => {
  const db = getDb();

  void db
    .update(apiKeysTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeysTable.id, apiKeyId))
    .then(undefined, (error: unknown) => {
      // Log but do not propagate — this is a best-effort update.
      console.error(
        '[api-key-validator] Failed to update last_used_at for api key',
        apiKeyId,
        error,
      );
    });
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate an API key from the request and return the worker context.
 *
 * On success, the authenticated worker context is also injected onto the
 * request object as `req.workerAuth` so downstream handlers can access
 * the worker identity and project access list directly.
 *
 * Returns `null` if the key is invalid, not found, revoked, expired, or
 * if the hash does not match. All failure paths return `null` without
 * leaking details about the specific reason for rejection.
 *
 * Security properties:
 * - Malformed keys are rejected before any database query (early rejection)
 * - Prefix-based indexed lookup provides O(1) database resolution
 * - SHA-256 hash comparison uses `crypto.timingSafeEqual()` to prevent
 *   timing side-channel attacks
 * - Revoked keys are rejected
 * - Expired keys (past `expires_at`) are rejected
 * - Inactive workers (deactivated) are rejected
 * - `last_used_at` is updated asynchronously on the API key record
 *
 * @param req - The incoming Next.js API request
 * @returns The authenticated worker context, or `null` if authentication fails
 */
export const validateApiKey = async (req: NextApiRequest): Promise<WorkerAuthContext | null> => {
  // Step 1: Extract the Bearer token from the Authorization header.
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith(BEARER_PREFIX)) {
    return null;
  }
  const token = authHeader.slice(BEARER_PREFIX.length);

  // Step 2: Validate the key format (lw_ + 48 hex chars).
  // Early rejection of malformed keys avoids unnecessary database queries.
  if (!isValidKeyFormat(token)) {
    return null;
  }

  // Step 3: Extract the 8-char lookup prefix for O(1) database lookup.
  const prefix = extractPrefix(token);

  // Step 4: Query the api_keys table for the key record by prefix.
  // The prefix column has a unique index for fast lookups.
  const db = getDb();
  const keyResults = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.prefix, prefix))
    .limit(1);

  const keyRecord = keyResults[0];
  if (!keyRecord) {
    return null;
  }

  // Step 5: Compare SHA-256 hashes using timing-safe comparison.
  // This prevents timing attacks that could leak hash information.
  const providedHash = hashApiKey(token);
  if (!safeHashComparison(providedHash, keyRecord.hashedKey)) {
    return null;
  }

  // Step 6: Check key is not revoked.
  if (keyRecord.isRevoked) {
    return null;
  }

  // Step 7: Check key expiry if an expiration date is set.
  if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
    return null;
  }

  // Step 8: Load the associated worker and verify it is active.
  const workerResults = await db
    .select()
    .from(workersTable)
    .where(eq(workersTable.id, keyRecord.workerId))
    .limit(1);

  const worker = workerResults[0];
  if (!worker || !worker.isActive) {
    return null;
  }

  // Step 9: Update last_used_at on the API key record asynchronously.
  // This does not block the request path.
  updateLastUsedAt(keyRecord.id);

  // Step 10: Load project access permissions for the worker.
  const projectAccess = await loadWorkerProjectAccess(worker.id);

  // Step 11: Build the authenticated worker context.
  const workerAuth: WorkerAuthContext = {
    type: 'agent',
    workerId: worker.id,
    workerName: worker.name,
    tenantId: worker.tenantId,
    projectAccess,
  };

  // Step 12: Inject the worker context onto the request object
  // so downstream handlers can access it directly.
  (req as AuthenticatedApiRequest).workerAuth = workerAuth;

  return workerAuth;
};
