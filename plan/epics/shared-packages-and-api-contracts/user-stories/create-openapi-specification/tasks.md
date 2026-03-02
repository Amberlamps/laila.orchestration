# Create OpenAPI Specification — Tasks

## User Story Summary

- **Title:** Create OpenAPI Specification
- **Description:** Write the complete OpenAPI 3.1 specification, configure TypeScript type generation, set up Spectral linting, and add spec freshness validation to CI.
- **Status:** Not Started
- **Parent Epic:** [Shared Packages & API Contracts](../../user-stories.md)
- **Total Tasks:** 4
- **Dependencies:** Implement @laila/shared Zod Schemas and Types

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Write OpenAPI Spec](./write-openapi-spec.md) | Write the full OpenAPI 3.1 specification covering all REST endpoints | Not Started | api-designer | None |
| [Configure Type Generation Pipeline](./configure-type-generation-pipeline.md) | Set up openapi-typescript generation and openapi-fetch client types | Not Started | build-engineer | Write OpenAPI Spec |
| [Configure Spectral Linting](./configure-spectral-linting.md) | Set up Spectral for OpenAPI spec linting with standard ruleset | Not Started | api-designer | Write OpenAPI Spec |
| [Add Spec Freshness CI Check](./add-spec-freshness-ci-check.md) | Create CI step validating generated types are up-to-date with the spec | Not Started | devops-engineer | Configure Type Generation Pipeline, Configure Spectral Linting |

## Dependency Graph

```
Write OpenAPI Spec
    |
    +---> Configure Type Generation Pipeline ---+
    |                                            |
    +---> Configure Spectral Linting -----------+--> Add Spec Freshness CI Check
```

## Suggested Implementation Order

1. **Phase 1:** Write OpenAPI Spec — the full API contract must exist before tooling can process it
2. **Phase 2 (parallel):** Configure Type Generation Pipeline + Configure Spectral Linting
3. **Phase 3:** Add Spec Freshness CI Check — requires both generation and linting to be configured
