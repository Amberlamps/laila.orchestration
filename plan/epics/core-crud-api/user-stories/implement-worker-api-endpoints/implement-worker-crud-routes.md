# Implement Worker CRUD Routes

## Task Details

- **Title:** Implement Worker CRUD Routes
- **Status:** Not Started
- **Assigned Agent:** security-engineer
- **Parent User Story:** [Implement Worker API Endpoints](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** None

## Description

Implement CRUD API routes for the Worker entity. Workers are AI agents that authenticate via API keys and execute user stories. Worker creation generates a cryptographically secure API key that is shown only once (one-time reveal). Worker deletion invalidates the API key and includes safety guards for in-progress work.

### Route Definitions

```typescript
// pages/api/v1/workers/index.ts
// Handles POST (create) and GET (list) for workers.
// Requires human auth (only humans can manage workers).

/**
 * POST /api/v1/workers
 * Create a new worker and generate an API key.
 * Body: { name: string, description?: string }
 * Returns: 201 with worker data INCLUDING the plain-text API key.
 *
 * SECURITY: The API key is returned in plain text ONLY in the creation response.
 * It is stored as a hashed value in the database. There is no way to retrieve
 * the plain-text key after this response.
 *
 * Response shape:
 * {
 *   data: {
 *     id: string,
 *     name: string,
 *     description: string | null,
 *     api_key: string,  // ONLY included in creation response
 *     api_key_prefix: string,  // First 8 chars for identification (always included)
 *     created_at: string,
 *   }
 * }
 */

/**
 * GET /api/v1/workers
 * List all workers.
 * Returns: 200 with worker list (api_key_prefix only, never the full key)
 */
```

```typescript
// pages/api/v1/workers/[id].ts
// Handles GET (detail), PATCH (update name), DELETE (with guards) for a single worker.

/**
 * GET /api/v1/workers/:id
 * Get a single worker with activity summary:
 * - Number of assigned stories (current)
 * - Number of completed stories (historical)
 * - Project access list
 * Returns: 200 with worker data (api_key_prefix only)
 */

/**
 * PATCH /api/v1/workers/:id
 * Update worker name or description.
 * Body: { name?: string, description?: string }
 * Returns: 200 with updated worker
 */

/**
 * DELETE /api/v1/workers/:id
 * Delete a worker and invalidate its API key.
 * If the worker has in-progress story assignments:
 *   - Returns 409 with DELETION_BLOCKED and list of in-progress stories
 *   - Include force=true query param to override (unassigns all stories first)
 * Returns: 204 No Content
 */
```

### API Key Generation

```typescript
// apps/web/src/lib/api/api-key.ts
// Cryptographically secure API key generation and hashing.
// Keys are generated as random hex strings, stored as SHA-256 hashes.

import { randomBytes, createHash } from "crypto";

/**
 * Generate a new API key for a worker.
 * Returns both the plain-text key (for one-time reveal)
 * and the hashed key (for database storage).
 *
 * Key format: "lw_" prefix + 48 random hex characters.
 * Example: "lw_a1b2c3d4e5f6..."
 *
 * The prefix makes keys identifiable in logs and configs.
 * The hash is SHA-256 for O(1) lookup during authentication.
 */
export function generateApiKey(): { plainText: string; hash: string; prefix: string } {
  const randomPart = randomBytes(24).toString("hex"); // 48 hex chars
  const plainText = `lw_${randomPart}`;
  const hash = createHash("sha256").update(plainText).digest("hex");
  const prefix = plainText.substring(0, 11); // "lw_" + first 8 hex chars

  return { plainText, hash, prefix };
}

/**
 * Hash an API key for database lookup during authentication.
 */
export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}
```

## Acceptance Criteria

- [ ] `POST /api/v1/workers` creates a worker and generates a cryptographically secure API key
- [ ] The API key is returned in plain text only in the creation response (one-time reveal)
- [ ] The API key is stored as a SHA-256 hash in the database (never plain text)
- [ ] The API key prefix (first 11 chars including `lw_` prefix) is stored for identification
- [ ] `GET /api/v1/workers` returns workers with `api_key_prefix` only (never full key)
- [ ] `GET /api/v1/workers/:id` returns worker with activity summary
- [ ] `PATCH /api/v1/workers/:id` updates name and description only
- [ ] `DELETE /api/v1/workers/:id` returns 409 with `DELETION_BLOCKED` if worker has in-progress stories
- [ ] `DELETE` with `?force=true` unassigns all stories and deletes the worker
- [ ] `DELETE` invalidates the API key (subsequent auth attempts fail)
- [ ] All routes require human authentication (workers cannot manage other workers)
- [ ] API key generation uses `crypto.randomBytes` for cryptographic security
- [ ] No `any` types are used in the implementation

## Technical Notes

- The one-time API key reveal is a security best practice. After creation, the plain-text key cannot be recovered. If a user loses the key, they must create a new worker (or add a key rotation endpoint in a future version).
- The `lw_` prefix on API keys serves multiple purposes: (1) it makes keys identifiable in logs and error messages, (2) it allows automated secret scanning tools to detect leaked keys, (3) it provides a namespace for key format versioning.
- SHA-256 hashing is used instead of bcrypt because API keys need O(1) lookup during authentication (every API request). Bcrypt's deliberate slowness would be a bottleneck.
- The deletion guard with force override follows a "warn then allow" pattern. The default behavior (no force) is safe; the override (force=true) is available for emergency situations.
- Consider adding a `POST /api/v1/workers/:id/rotate-key` endpoint in a future version for key rotation without recreating the worker.

## References

- **Functional Requirements:** FR-WORKER-001 (worker CRUD), FR-WORKER-002 (API key generation), FR-AUTH-003 (API key authentication)
- **Design Specification:** Section 7.5 (Worker API), Section 4.2 (API Key Authentication)
- **Database Schema:** workers table, api_keys table in `@laila/database`

## Estimated Complexity

High — The API key generation, one-time reveal pattern, hash-based storage, and deletion guards with force override all add security-sensitive complexity. This code handles secrets and must be implemented carefully.
