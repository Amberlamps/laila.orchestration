# Implement @laila/shared Zod Schemas and Types — Tasks

## User Story Summary

- **Title:** Implement @laila/shared Zod Schemas and Types
- **Description:** Define all Zod validation schemas, TypeScript types, status enums, error codes, and utility types that are shared across the entire monorepo.
- **Status:** Complete
- **Parent Epic:** [Shared Packages & API Contracts](../../user-stories.md)
- **Total Tasks:** 5
- **Dependencies:** None (Epic 1 must be complete for the package scaffold to exist)

## Tasks

| Task                                                                            | Description                                                                      | Status   | Assigned Agent    | Dependencies                                                                            |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------- | ----------------- | --------------------------------------------------------------------------------------- |
| [Define Status Enums and Constants](./define-status-enums-and-constants.md)     | Define all status enums, priority levels, error codes, API key prefix            | Complete | backend-developer | None                                                                                    |
| [Define Entity Schemas](./define-entity-schemas.md)                             | Define Zod schemas for project, epic, user story, task, worker, persona entities | Complete | backend-developer | Define Status Enums and Constants                                                       |
| [Define API Request/Response Schemas](./define-api-request-response-schemas.md) | Define Zod schemas for all API request bodies, query params, response payloads   | Complete | backend-developer | Define Status Enums and Constants                                                       |
| [Define Shared Utility Types](./define-shared-utility-types.md)                 | Define pagination, error envelope, audit event, and utility types                | Complete | backend-developer | Define Entity Schemas, Define API Request/Response Schemas                              |
| [Write Shared Package Tests](./write-shared-package-tests.md)                   | Write unit tests for all Zod schemas                                             | Complete | qa-expert         | Define Entity Schemas, Define API Request/Response Schemas, Define Shared Utility Types |

## Dependency Graph

```
Define Status Enums and Constants
    |
    +---> Define Entity Schemas --------+
    |                                    |
    +---> Define API Request/Response ---+--> Define Shared Utility Types
              Schemas                    |         |
                                         |         v
                                         +---> Write Shared Package Tests
```

## Suggested Implementation Order

1. **Phase 1:** Define Status Enums and Constants — foundational for all schemas
2. **Phase 2 (parallel):** Define Entity Schemas + Define API Request/Response Schemas — both depend on constants
3. **Phase 3:** Define Shared Utility Types — composes entity and API schemas
4. **Phase 4:** Write Shared Package Tests — validates all schemas with comprehensive test cases
