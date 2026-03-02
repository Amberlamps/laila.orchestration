# Implement Worker Repository

## Task Details

- **Title:** Implement Worker Repository
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Repository Layer](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** Create Base Repository

## Description

Implement the worker repository providing CRUD operations for worker (AI agent) management. The critical functionality is API key management: creating workers with hashed API keys, authenticating workers by API key prefix + hash verification, and regenerating API keys.

Workers also have project access management through the `worker_project_access` junction table, controlling which projects a worker is authorized to request work from.

## Acceptance Criteria

- [ ] `packages/database/src/repositories/worker-repository.ts` exists
- [ ] Extends or uses the base repository for standard CRUD with tenant scoping
- [ ] `create(tenantId, data)` creates a worker and generates an API key:
  - Generates a cryptographically secure random API key with the `lw_` prefix
  - Stores the SHA-256 hash of the key in `api_key_hash`
  - Stores the prefix (first 12 characters) in `api_key_prefix`
  - Returns the worker record AND the raw API key (only time the raw key is available)
- [ ] `authenticateByApiKey(rawApiKey)` performs the two-step authentication:
  - Extracts prefix from the raw key
  - Queries by prefix (efficient index lookup)
  - Verifies the full hash matches
  - Updates `last_seen_at` timestamp
  - Returns the authenticated worker or null
- [ ] `regenerateApiKey(tenantId, workerId, expectedVersion)` replaces the API key:
  - Generates a new API key
  - Updates hash and prefix
  - Returns the new raw key (one-time)
  - Uses optimistic locking
- [ ] `deactivate(tenantId, workerId, expectedVersion)` sets `is_active = false`
- [ ] `activate(tenantId, workerId, expectedVersion)` sets `is_active = true`
- [ ] `grantProjectAccess(tenantId, workerId, projectId)` creates a worker_project_access record
- [ ] `revokeProjectAccess(tenantId, workerId, projectId)` removes a worker_project_access record
- [ ] `getProjectAccess(tenantId, workerId)` returns all projects a worker has access to
- [ ] `hasProjectAccess(tenantId, workerId, projectId)` checks if a worker has access to a specific project
- [ ] `findByTenant(tenantId, options)` returns paginated workers with optional `isActive` filter
- [ ] All methods enforce tenant scoping (except `authenticateByApiKey` which looks up by prefix globally, then validates tenant access at the caller level)
- [ ] The repository is exported from `packages/database/src/repositories/index.ts`

## Technical Notes

- API key generation and hashing:
  ```typescript
  // packages/database/src/repositories/worker-repository.ts
  // Worker repository with secure API key management
  // Uses prefix+hash pattern for efficient and secure API key authentication
  import { createHash, randomBytes } from 'node:crypto';

  const API_KEY_PREFIX = 'lw_';
  const API_KEY_RANDOM_BYTES = 32; // 256 bits of entropy
  const PREFIX_LENGTH = 12; // Characters stored for prefix lookup

  /**
   * Generates a new API key with the lw_ prefix
   * Returns both the raw key (for the user) and the hash (for storage)
   */
  function generateApiKey(): { rawKey: string; hash: string; prefix: string } {
    const randomPart = randomBytes(API_KEY_RANDOM_BYTES).toString('base64url');
    const rawKey = `${API_KEY_PREFIX}${randomPart}`;
    const hash = createHash('sha256').update(rawKey).digest('hex');
    const prefix = rawKey.substring(0, PREFIX_LENGTH);
    return { rawKey, hash, prefix };
  }

  /**
   * Hashes a raw API key for comparison with stored hash
   */
  function hashApiKey(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex');
  }
  ```
- SHA-256 is appropriate for API key hashing (not bcrypt) because:
  - API keys have high entropy (256 bits), making brute force infeasible
  - SHA-256 is fast, which matters for per-request authentication
  - No salt is needed for high-entropy secrets
- The `authenticateByApiKey` method does NOT require tenant_id since authentication happens before tenant context is established:
  ```typescript
  async authenticateByApiKey(rawApiKey: string) {
    const prefix = rawApiKey.substring(0, PREFIX_LENGTH);
    const expectedHash = hashApiKey(rawApiKey);

    // Step 1: Find worker by prefix (fast index lookup)
    const worker = await db.query.workers.findFirst({
      where: and(
        eq(workersTable.apiKeyPrefix, prefix),
        eq(workersTable.isActive, true),
      ),
    });

    if (!worker) return null;

    // Step 2: Verify full hash (timing-safe comparison)
    const hashMatches = timingSafeEqual(
      Buffer.from(worker.apiKeyHash),
      Buffer.from(expectedHash),
    );

    if (!hashMatches) return null;

    // Step 3: Update last_seen_at
    await db.update(workersTable)
      .set({ lastSeenAt: new Date() })
      .where(eq(workersTable.id, worker.id));

    return worker;
  }
  ```
- Use `crypto.timingSafeEqual` for hash comparison to prevent timing attacks
- The `regenerateApiKey` method should invalidate the old key immediately (update hash and prefix in a single operation)

## References

- **Functional Requirements:** Worker authentication, API key management, project access control
- **Design Specification:** API key prefix+hash pattern, timing-safe comparison
- **Project Setup:** packages/database repositories module

## Estimated Complexity

Large — API key management with cryptographic hashing, timing-safe comparison, and a two-step authentication flow. Project access junction table management adds additional complexity.
