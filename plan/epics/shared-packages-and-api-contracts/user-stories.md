# Shared Packages & API Contracts — User Stories

## Epic Summary

- **Title:** Shared Packages & API Contracts
- **Description:** Implement @laila/shared Zod schemas, types, constants, and contract-first OpenAPI specification.
- **Status:** Not Started
- **Total User Stories:** 2
- **Dependencies:** Epic 1 (Project Setup & Monorepo Scaffold)

## User Stories

| User Story | Description | Status | Tasks | Dependencies |
| --- | --- | --- | --- | --- |
| [Implement @laila/shared Zod Schemas and Types](./user-stories/implement-shared-zod-schemas/tasks.md) | Define all Zod schemas, TypeScript types, status enums, constants, and utility types in @laila/shared | Not Started | 5 tasks | None |
| [Create OpenAPI Specification](./user-stories/create-openapi-specification/tasks.md) | Write the OpenAPI 3.1 spec, configure type generation, Spectral linting, and freshness checks | Not Started | 4 tasks | Implement @laila/shared Zod Schemas and Types |

## Dependency Graph

```
Implement @laila/shared Zod Schemas and Types
    |
    v
Create OpenAPI Specification
    (references shared schemas for consistent naming and structure)
```

## Suggested Implementation Order

1. **Phase 1:** Implement @laila/shared Zod Schemas and Types — the OpenAPI spec should align with these schemas
2. **Phase 2:** Create OpenAPI Specification — references the shared types for consistent API contract definitions
