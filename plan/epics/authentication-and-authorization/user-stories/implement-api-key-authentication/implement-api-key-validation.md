# Implement API Key Validation

## Task Details

- **Title:** Implement API Key Validation
- **Status:** Not Started
- **Assigned Agent:** security-engineer
- **Parent User Story:** [Implement API Key Authentication](./tasks.md)
- **Parent Epic:** [Authentication & Authorization](../../user-stories.md)
- **Dependencies:** Implement API Key Generation

## Description

Implement the API key validation middleware that authenticates incoming requests from execution agents. The middleware extracts the API key from the `Authorization` header, resolves the key record via the prefix column for O(1) lookup, compares the SHA-256 hash, and injects the authenticated worker context into the request for downstream handlers.

### Validation Flow

1. **Extract key** from the `Authorization: Bearer lw_...` header
2. **Validate format** using `isValidKeyFormat()` — reject immediately if malformed
3. **Extract prefix** using `extractPrefix()` — get the 8-char lookup prefix
4. **Query database** for the API key record matching the prefix
5. **Compare hashes** — compute SHA-256 of the provided key, compare with stored `hashed_key`
6. **Check expiry** — if `expires_at` is set, verify the key has not expired
7. **Load worker** — fetch the associated worker record and its project access permissions
8. **Inject context** — attach the authenticated worker context to the request object
9. **Update last_used_at** — asynchronously update the key's last usage timestamp

```typescript
// packages/web/src/lib/middleware/api-key-validator.ts
// Validates API keys from the Authorization header for agent requests.
// Uses prefix-based O(1) lookup followed by SHA-256 hash comparison.
import type { NextApiRequest } from "next";
import { hashApiKey, extractPrefix, isValidKeyFormat } from "@/lib/api-keys";
import { db } from "@laila/database";
import { apiKeys, workers } from "@laila/database/schema";
import { eq, and } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";

// The authenticated worker context injected into the request
// after successful API key validation.
export interface WorkerAuthContext {
  type: "agent";
  workerId: string;
  workerName: string;
  tenantId: string;
  // Project IDs this worker has been granted access to.
  projectAccess: string[];
}

/**
 * Validate an API key from the request and return the worker context.
 * Returns null if the key is invalid, expired, or not found.
 *
 * Security: Uses timing-safe comparison for the hash to prevent
 * timing attacks. Updates last_used_at asynchronously to avoid
 * adding latency to the request path.
 */
export async function validateApiKey(
  req: NextApiRequest
): Promise<WorkerAuthContext | null> {
  // Step 1: Extract the Bearer token from the Authorization header.
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice("Bearer ".length);

  // Step 2: Validate the key format (lw_ + 48 hex chars).
  // Early rejection of malformed keys avoids unnecessary database queries.
  if (!isValidKeyFormat(token)) {
    return null;
  }

  // Step 3: Extract the 8-char lookup prefix for O(1) database lookup.
  const prefix = extractPrefix(token);

  // Step 4: Query the database for the key record by prefix.
  // The prefix column is indexed for fast lookups.
  const keyRecord = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.prefix, prefix),
    with: { worker: true },
  });

  if (!keyRecord) {
    return null;
  }

  // Step 5: Compare SHA-256 hashes using timing-safe comparison.
  // This prevents timing attacks that could leak hash information.
  const providedHash = hashApiKey(token);
  const storedHash = keyRecord.hashedKey;
  const isMatch = timingSafeEqual(
    Buffer.from(providedHash, "hex"),
    Buffer.from(storedHash, "hex")
  );

  if (!isMatch) {
    return null;
  }

  // Step 6: Check key expiry if an expiration date is set.
  if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
    return null;
  }

  // Step 7: Update last_used_at asynchronously (fire-and-forget).
  // This does not block the request path.
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, keyRecord.id));

  // Step 8: Load project access permissions for the worker.
  const projectAccess = await loadWorkerProjectAccess(keyRecord.workerId);

  // Step 9: Return the authenticated worker context.
  return {
    type: "agent",
    workerId: keyRecord.workerId,
    workerName: keyRecord.worker.name,
    tenantId: keyRecord.worker.tenantId,
    projectAccess,
  };
}

/**
 * Load the project IDs that a worker has been granted access to.
 * Used to scope the worker's operations to authorized projects only.
 */
async function loadWorkerProjectAccess(
  workerId: string
): Promise<string[]> {
  // Query the worker_project_access junction table
  // to get all project IDs this worker can operate on.
  const accessRecords = await db.query.workerProjectAccess.findMany({
    where: eq(workerProjectAccess.workerId, workerId),
    columns: { projectId: true },
  });

  return accessRecords.map((record) => record.projectId);
}
```

### Security Considerations

- **Timing-safe comparison:** Use `crypto.timingSafeEqual()` for hash comparison to prevent timing side-channel attacks.
- **Early rejection:** Malformed keys are rejected before any database query to minimize attack surface.
- **No error detail leakage:** All failure cases return `null` (or a generic 401) without indicating whether the key format was wrong, the key was not found, or the hash didn't match.
- **Async last_used_at update:** The usage timestamp update is fire-and-forget to avoid adding latency. If it fails, the request still succeeds.

## Acceptance Criteria

- [ ] Middleware extracts API key from `Authorization: Bearer lw_...` header
- [ ] Malformed keys are rejected before any database query
- [ ] Prefix-based lookup uses the indexed `prefix` column for O(1) resolution
- [ ] SHA-256 hash comparison uses `crypto.timingSafeEqual()` for timing safety
- [ ] Expired keys (past `expires_at`) are rejected
- [ ] Authenticated worker context includes worker ID, name, tenant ID, and project access list
- [ ] `last_used_at` is updated asynchronously after successful validation
- [ ] All failure cases return null without leaking details about the failure reason
- [ ] Worker project access is loaded and included in the auth context
- [ ] No `any` types used in the implementation
- [ ] Function is properly typed with `WorkerAuthContext` return type

## Technical Notes

- `crypto.timingSafeEqual()` requires both buffers to be the same length. Since both are SHA-256 hex digests (64 characters), this is guaranteed. Convert to `Buffer` before comparison.
- The prefix lookup may return multiple records in the rare case of prefix collisions (probability ~1/4.3 billion per pair). The hash comparison step handles this — only the correct key will match. Consider querying for all matching prefixes and comparing each hash if collisions are a concern.
- The `last_used_at` update uses a fire-and-forget pattern (`void db.update(...)`) to avoid blocking the request. Consider adding error logging for failed updates.
- The worker project access query could be cached (e.g., 5-minute TTL) to reduce database queries on frequently used API keys. For the initial implementation, a direct query is acceptable.
- Import `workerProjectAccess` from the schema — ensure this table is defined in Epic 3's database schema.

## References

- **Functional Requirements:** FR-AUTH-012 (API key validation), FR-AUTH-013 (timing-safe comparison)
- **Design Specification:** Section 4.2.2 (Key Validation Flow), Section 4.2.3 (Worker Context Injection)
- **Project Setup:** Crypto module, Drizzle query builder, database schema

## Estimated Complexity

Medium — The validation flow involves multiple steps (extraction, format check, prefix lookup, hash comparison, expiry check, project access loading), each with security considerations. Timing-safe comparison and the fire-and-forget update pattern add nuance beyond a simple lookup.
