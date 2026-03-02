# Write API Key Tests

## Task Details

- **Title:** Write API Key Tests
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement API Key Authentication](./tasks.md)
- **Parent Epic:** [Authentication & Authorization](../../user-stories.md)
- **Dependencies:** Implement API Key Generation, Implement API Key Validation

## Description

Write comprehensive unit tests for the API key generation, hashing, format validation, and request validation flow. These tests ensure the security-critical API key system works correctly and rejects all invalid inputs.

The tests should be organized into three groups:

### 1. Key Generation Tests

Verify that `generateApiKey()` produces correctly formatted keys with sufficient randomness.

```typescript
// packages/web/src/tests/auth/api-key-generation.test.ts
// Unit tests for API key generation, format, and uniqueness.
import { describe, it, expect } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  extractPrefix,
  isValidKeyFormat,
} from "@/lib/api-keys";

describe("generateApiKey", () => {
  it("should produce a key with the lw_ prefix", () => {
    const { plaintextKey } = generateApiKey();
    expect(plaintextKey).toMatch(/^lw_/);
  });

  it("should produce a key with exactly 51 characters (3 prefix + 48 hex)", () => {
    const { plaintextKey } = generateApiKey();
    expect(plaintextKey).toHaveLength(51);
  });

  it("should produce a key body of only lowercase hex characters", () => {
    const { plaintextKey } = generateApiKey();
    const body = plaintextKey.slice(3);
    expect(body).toMatch(/^[0-9a-f]{48}$/);
  });

  it("should produce unique keys on successive calls", () => {
    const keys = Array.from({ length: 100 }, () => generateApiKey().plaintextKey);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(100);
  });

  it("should produce a valid SHA-256 hex hash (64 characters)", () => {
    const { hashedKey } = generateApiKey();
    expect(hashedKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("should produce an 8-character lookup prefix", () => {
    const { prefix } = generateApiKey();
    expect(prefix).toMatch(/^[0-9a-f]{8}$/);
  });

  it("should produce a prefix that matches the key body substring", () => {
    const { plaintextKey, prefix } = generateApiKey();
    // The prefix is the first 8 chars of the body (after "lw_")
    const bodyPrefix = plaintextKey.slice(3, 11);
    expect(prefix).toBe(bodyPrefix);
  });
});
```

### 2. Hashing and Format Validation Tests

Verify hash consistency, prefix extraction, and format validation.

```typescript
describe("hashApiKey", () => {
  it("should produce the same hash for the same input", () => {
    const key = "lw_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4";
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);
    expect(hash1).toBe(hash2);
  });

  it("should produce different hashes for different inputs", () => {
    const { plaintextKey: key1 } = generateApiKey();
    const { plaintextKey: key2 } = generateApiKey();
    expect(hashApiKey(key1)).not.toBe(hashApiKey(key2));
  });
});

describe("isValidKeyFormat", () => {
  it("should accept a correctly formatted key", () => {
    const { plaintextKey } = generateApiKey();
    expect(isValidKeyFormat(plaintextKey)).toBe(true);
  });

  it("should reject a key without the lw_ prefix", () => {
    expect(isValidKeyFormat("xx_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4")).toBe(false);
  });

  it("should reject a key that is too short", () => {
    expect(isValidKeyFormat("lw_a1b2c3")).toBe(false);
  });

  it("should reject a key that is too long", () => {
    expect(isValidKeyFormat("lw_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4ff")).toBe(false);
  });

  it("should reject a key with uppercase hex characters", () => {
    expect(isValidKeyFormat("lw_A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4")).toBe(false);
  });

  it("should reject a key with non-hex characters", () => {
    expect(isValidKeyFormat("lw_g1h2i3j4k5l6m7n8o9p0q1r2s3t4u5v6w7x8y9z0a1b2c3d4")).toBe(false);
  });

  it("should reject an empty string", () => {
    expect(isValidKeyFormat("")).toBe(false);
  });

  it("should reject the prefix alone", () => {
    expect(isValidKeyFormat("lw_")).toBe(false);
  });
});
```

### 3. Validation Middleware Tests

Integration tests for the `validateApiKey` function with database interaction.

```typescript
describe("validateApiKey", () => {
  // These tests require a test database with seeded API key records.

  it("should return worker context for a valid API key", async () => {
    // Seed a worker and API key in the test database
    // Call validateApiKey with a valid key in the Authorization header
    // Assert: returns WorkerAuthContext with correct worker details
  });

  it("should return null for a missing Authorization header", async () => {
    // Assert: returns null without querying the database
  });

  it("should return null for a malformed key format", async () => {
    // Assert: returns null before database lookup
  });

  it("should return null for a key with valid format but no matching prefix", async () => {
    // Assert: returns null after prefix lookup fails
  });

  it("should return null for a key with matching prefix but wrong hash", async () => {
    // Edge case: prefix collision scenario
    // Assert: returns null after hash comparison fails
  });

  it("should return null for an expired key", async () => {
    // Seed a key with expires_at in the past
    // Assert: returns null even though hash matches
  });

  it("should include project access list in worker context", async () => {
    // Seed worker with project access records
    // Assert: context.projectAccess contains the correct project IDs
  });
});
```

## Acceptance Criteria

- [ ] All `generateApiKey()` tests pass: format, length, hex-only body, uniqueness, hash format, prefix format
- [ ] All `hashApiKey()` tests pass: deterministic output, different outputs for different inputs
- [ ] All `isValidKeyFormat()` tests pass: accepts valid, rejects malformed, too short, too long, wrong prefix, non-hex
- [ ] All `extractPrefix()` tests pass: correct extraction from valid keys
- [ ] Integration tests for `validateApiKey()` cover: valid key, missing header, malformed key, unknown prefix, wrong hash, expired key, project access loading
- [ ] No use of `any` type anywhere in test files — all test data and assertions use specific types
- [ ] Tests are isolated and do not depend on execution order
- [ ] Database integration tests use test fixtures with proper setup/teardown
- [ ] All tests pass in CI

## Technical Notes

- For the validation middleware integration tests, use the test database infrastructure from Epic 3.
- The uniqueness test generates 100 keys and checks for duplicates. While not a formal randomness test, it catches obvious issues like using a static seed.
- Consider adding a performance benchmark: generating 10,000 keys should complete in under 1 second (crypto.randomBytes is fast).
- For the prefix collision test in `validateApiKey`, manually insert a key record with the same prefix but a different hash to verify the hash comparison step handles this correctly.
- Use `vi.spyOn()` to verify that the `last_used_at` update is called after successful validation.
- Ensure all test data uses proper TypeScript types — define test helper functions that return typed fixtures.

## References

- **Functional Requirements:** FR-AUTH-014 (API key test coverage), FR-TEST-001 (unit test standards)
- **Design Specification:** Section 4.2.4 (API Key Testing), Section 8.1 (Test Infrastructure)
- **Project Setup:** Vitest configuration, test database helpers

## Estimated Complexity

Medium — The generation and format tests are straightforward unit tests. The validation middleware tests require database setup/teardown and test fixtures, adding integration test complexity. The variety of rejection scenarios requires thorough test design.
