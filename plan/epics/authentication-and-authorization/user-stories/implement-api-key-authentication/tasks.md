# Implement API Key Authentication — Tasks

## User Story Summary

- **Title:** Implement API Key Authentication
- **Description:** Implement a secure API key system for execution agents: key generation with `lw_` prefix and SHA-256 hashing, prefix-based O(1) lookup, and validation middleware that injects worker context into requests.
- **Status:** Not Started
- **Parent Epic:** [Authentication & Authorization](../../user-stories.md)
- **Total Tasks:** 3
- **Dependencies:** None

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Implement API Key Generation](./implement-api-key-generation.md) | Implement key generation with `lw_` prefix + 48 hex chars, SHA-256 hashing, prefix-based storage, and one-time reveal | Not Started | security-engineer | None |
| [Implement API Key Validation](./implement-api-key-validation.md) | Implement validation middleware: extract from Authorization header, resolve via prefix, compare SHA-256 hash, inject worker context | Not Started | security-engineer | Implement API Key Generation |
| [Write API Key Tests](./write-api-key-tests.md) | Write unit tests for key format validation, hashing correctness, successful validation, and rejection of invalid keys | Not Started | qa-expert | Implement API Key Generation, Implement API Key Validation |

## Dependency Graph

```
Implement API Key Generation
    |
    v
Implement API Key Validation
    |
    v
Write API Key Tests
```

## Suggested Implementation Order

1. **Phase 1:** Implement API Key Generation — defines the key format and hashing strategy
2. **Phase 2:** Implement API Key Validation — builds on the generation format to validate incoming keys
3. **Phase 3:** Write API Key Tests — validates both generation and validation paths
