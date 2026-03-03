# Set Up API Client Layer — Tasks

## User Story Summary

- **Title:** Set Up API Client Layer
- **Description:** Configure the openapi-fetch client for type-safe API communication, create TanStack Query hooks factory for consistent data fetching patterns, and implement a query key factory for cache invalidation across related entities.
- **Status:** Complete
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Total Tasks:** 3
- **Dependencies:** Configure Tailwind CSS & shadcn/ui

## Tasks

| Task                                                                            | Description                                                                                                       | Status   | Assigned Agent      | Dependencies                   |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------- | ------------------- | ------------------------------ |
| [Configure openapi-fetch Client](./configure-openapi-fetch-client.md)           | Configure type-safe API client wrapping generated types from @laila/api-spec with auth headers and error handling | Complete | fullstack-developer | None                           |
| [Create TanStack Query Hooks Factory](./create-tanstack-query-hooks-factory.md) | Create query hook factory for all API endpoints with consistent patterns and optimistic mutation helpers          | Complete | fullstack-developer | Configure openapi-fetch Client |
| [Implement Query Key Factory](./implement-query-key-factory.md)                 | Create query key factory for consistent cache invalidation across related entities                                | Complete | fullstack-developer | Configure openapi-fetch Client |

## Dependency Graph

```
Configure openapi-fetch Client ---+--> Create TanStack Query Hooks Factory
                                  |
                                  +--> Implement Query Key Factory
```

## Suggested Implementation Order

1. **Phase 1:** Configure openapi-fetch Client — foundational API communication layer
2. **Phase 2 (parallel):** Create TanStack Query Hooks Factory + Implement Query Key Factory — both depend on the API client and can be built in parallel
