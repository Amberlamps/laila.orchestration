# Implement API Key Generation

## Task Details

- **Title:** Implement API Key Generation
- **Status:** Complete
- **Assigned Agent:** security-engineer
- **Parent User Story:** [Implement API Key Authentication](./tasks.md)
- **Parent Epic:** [Authentication & Authorization](../../user-stories.md)
- **Dependencies:** None

## Description

Implement a secure API key generation system for execution agents (workers). API keys are the authentication mechanism for agent-to-server communication. Each key is generated with a recognizable prefix, cryptographically random body, and stored as a SHA-256 hash to prevent exposure in the event of a database breach.

### Key Format

The API key format is: `lw_` + 48 hexadecimal characters (from `crypto.randomBytes(24)`).

- **Prefix:** `lw_` (stands for "laila works") — makes keys visually identifiable and enables O(1) lookup
- **Body:** 48 hex characters from 24 bytes of cryptographic randomness — provides 192 bits of entropy
- **Total length:** 51 characters (3 prefix + 48 hex)
- **Example:** `lw_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4`

### Storage Strategy

- **Hash:** SHA-256 hash of the full key (prefix + body) is stored in the `hashed_key` column
- **Prefix:** The first 8 characters of the hex body are stored in the `prefix` column for O(1) lookup
- **One-time reveal:** The full plaintext key is returned exactly once in the API response when created. It is never stored or retrievable again.

```typescript
// packages/web/src/lib/api-keys.ts
// API key generation utilities for execution agent authentication.
// Keys use the format: lw_ + 48 hex chars (192 bits of entropy).
// Only the SHA-256 hash is persisted; plaintext is revealed once.
import { randomBytes, createHash } from 'node:crypto';

// Prefix that identifies all laila.works API keys.
// Used for visual identification and lookup optimization.
const API_KEY_PREFIX = 'lw_';

// Number of random bytes to generate (24 bytes = 48 hex chars).
// Provides 192 bits of entropy, sufficient for API key security.
const KEY_BYTES = 24;

// Length of the prefix substring stored for O(1) key lookup.
// 8 hex chars from the body portion, used as a database index.
const LOOKUP_PREFIX_LENGTH = 8;

export interface GeneratedApiKey {
  // The full plaintext key (returned once, never stored).
  plaintextKey: string;
  // SHA-256 hash of the full key (stored in database).
  hashedKey: string;
  // First 8 hex chars of the body (stored for O(1) lookup).
  prefix: string;
}

/**
 * Generate a new API key with cryptographic randomness.
 * Returns the plaintext key (for one-time reveal), its SHA-256 hash
 * (for database storage), and the lookup prefix (for O(1) resolution).
 */
export function generateApiKey(): GeneratedApiKey {
  // Generate 24 cryptographically random bytes.
  const randomHex = randomBytes(KEY_BYTES).toString('hex');

  // Construct the full key: lw_ + 48 hex characters.
  const plaintextKey = `${API_KEY_PREFIX}${randomHex}`;

  // Hash the full key with SHA-256 for secure storage.
  // The hash is what gets stored in the database.
  const hashedKey = createHash('sha256').update(plaintextKey).digest('hex');

  // Extract the lookup prefix from the hex body (not the lw_ prefix).
  // This is stored alongside the hash for O(1) key resolution.
  const prefix = randomHex.substring(0, LOOKUP_PREFIX_LENGTH);

  return { plaintextKey, hashedKey, prefix };
}

/**
 * Hash a plaintext API key for comparison against stored hashes.
 * Used during key validation to compare against the database.
 */
export function hashApiKey(plaintextKey: string): string {
  return createHash('sha256').update(plaintextKey).digest('hex');
}

/**
 * Extract the lookup prefix from a plaintext API key.
 * Used during validation to find the key record in the database.
 */
export function extractPrefix(plaintextKey: string): string {
  // Strip the "lw_" prefix, then take the first 8 hex chars.
  const body = plaintextKey.slice(API_KEY_PREFIX.length);
  return body.substring(0, LOOKUP_PREFIX_LENGTH);
}

/**
 * Validate the format of a plaintext API key.
 * Returns true if the key matches the expected format.
 */
export function isValidKeyFormat(key: string): boolean {
  // Must start with "lw_" followed by exactly 48 hex characters.
  return /^lw_[0-9a-f]{48}$/.test(key);
}
```

### API Endpoint

Create a POST endpoint (e.g., `POST /api/workers/:workerId/api-keys`) that:

1. Validates the requesting user owns the worker (authorization check)
2. Calls `generateApiKey()` to produce the key material
3. Stores `hashedKey` and `prefix` in the `api_keys` table linked to the worker
4. Returns the `plaintextKey` in the response (one-time reveal)
5. Includes a warning header or response field indicating the key cannot be retrieved again

## Acceptance Criteria

- [ ] `generateApiKey()` function produces keys matching the format `lw_` + 48 hex characters
- [ ] Key body uses `crypto.randomBytes(24)` for 192 bits of entropy
- [ ] `hashApiKey()` produces a consistent SHA-256 hex digest for a given input
- [ ] `extractPrefix()` correctly extracts the first 8 hex characters of the body
- [ ] `isValidKeyFormat()` accepts valid keys and rejects malformed keys
- [ ] The plaintext key is returned exactly once in the creation response
- [ ] Only the SHA-256 hash and lookup prefix are stored in the database
- [ ] The database record links the API key to the correct worker ID
- [ ] The API endpoint requires authentication (human user who owns the worker)
- [ ] Response includes a clear indication that the key cannot be retrieved again
- [ ] All functions are properly typed with TypeScript (no `any` types)

## Technical Notes

- Use Node.js built-in `crypto` module — do not add external cryptography libraries for basic hashing.
- SHA-256 is appropriate here because API keys have high entropy (192 bits). Unlike passwords, API keys do not need bcrypt/scrypt because they are not low-entropy human-chosen secrets.
- The prefix column should have a database index for O(1) lookups. While prefix collisions are theoretically possible (1 in ~4 billion for 8 hex chars), the full hash comparison eliminates false positives.
- Consider adding a `name` or `description` field to API keys so users can label them (e.g., "Production Agent Key").
- Consider adding `created_at`, `last_used_at`, and `expires_at` columns for key lifecycle management.
- The one-time reveal pattern is standard practice (GitHub, Stripe, AWS all use this approach). Make the UI experience clear that the key must be copied immediately.

## References

- **Functional Requirements:** FR-AUTH-010 (API key generation), FR-AUTH-011 (key format specification)
- **Design Specification:** Section 4.2 (API Key Authentication), Section 4.2.1 (Key Generation)
- **Project Setup:** Crypto module usage, database schema for api_keys table

## Estimated Complexity

Medium — The cryptographic operations are straightforward using Node.js built-ins, but the complete implementation includes the generation functions, database storage, API endpoint, and one-time reveal response pattern. Security considerations require careful attention.
