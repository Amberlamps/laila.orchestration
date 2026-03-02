# Core CRUD API — User Stories

## Epic Summary

- **Title:** Core CRUD API
- **Description:** REST API endpoints for all entities with validation, error handling, and integration tests. Implements the full CRUD surface area under `pages/api/v1/` using Next.js Pages Router API routes, Zod validation from `@laila/shared`, Drizzle ORM repositories from `@laila/database`, and domain logic from `@laila/domain`.
- **Status:** Not Started
- **Total User Stories:** 8
- **Dependencies:** Epic 3 (Database Layer), Epic 4 (Authentication & Authorization), Epic 5 (Domain Logic Engine)

## User Stories

| User Story | Description | Status | Tasks | Dependencies |
| --- | --- | --- | --- | --- |
| [Implement Error Handling Framework](./user-stories/implement-error-handling-framework/tasks.md) | Custom error classes, global error handler middleware, and request validation middleware | Not Started | 3 tasks | None |
| [Implement Project API Endpoints](./user-stories/implement-project-api-endpoints/tasks.md) | CRUD and lifecycle transitions for projects | Not Started | 3 tasks | Implement Error Handling Framework |
| [Implement Epic API Endpoints](./user-stories/implement-epic-api-endpoints/tasks.md) | CRUD and lifecycle transitions for epics | Not Started | 3 tasks | Implement Error Handling Framework |
| [Implement User Story API Endpoints](./user-stories/implement-story-api-endpoints/tasks.md) | CRUD, lifecycle transitions, and read-only enforcement for user stories | Not Started | 3 tasks | Implement Error Handling Framework |
| [Implement Task API Endpoints](./user-stories/implement-task-api-endpoints/tasks.md) | CRUD, DAG validation, status updates, and cascading re-evaluation for tasks | Not Started | 4 tasks | Implement Error Handling Framework, Implement User Story API Endpoints |
| [Implement Worker API Endpoints](./user-stories/implement-worker-api-endpoints/tasks.md) | CRUD for workers with API key generation and project access management | Not Started | 3 tasks | Implement Error Handling Framework |
| [Implement Persona API Endpoints](./user-stories/implement-persona-api-endpoints/tasks.md) | CRUD for personas with deletion guards | Not Started | 2 tasks | Implement Error Handling Framework |
| [Implement Health Check Endpoints](./user-stories/implement-health-check-endpoints/tasks.md) | Shallow health and deep readiness check endpoints | Not Started | 2 tasks | None |

## Dependency Graph

```
Implement Error Handling Framework
    |
    +---> Implement Project API Endpoints
    |
    +---> Implement Epic API Endpoints
    |
    +---> Implement User Story API Endpoints ---> Implement Task API Endpoints
    |
    +---> Implement Worker API Endpoints
    |
    +---> Implement Persona API Endpoints

Implement Health Check Endpoints (independent)
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** Implement Error Handling Framework + Implement Health Check Endpoints — error handling is the foundation for all other API work; health checks are independent and unblock SRE validation
2. **Phase 2 (parallel):** Implement Project API Endpoints + Implement Epic API Endpoints + Implement User Story API Endpoints + Implement Worker API Endpoints + Implement Persona API Endpoints — all depend on error handling framework, can be developed in parallel by different agents
3. **Phase 3:** Implement Task API Endpoints — depends on user story endpoints for parent-child relationship enforcement and read-only checks

## Architecture Notes

All API routes follow the pattern:
- Route file at `pages/api/v1/{resource}/[...params].ts` or `pages/api/v1/{resource}/index.ts`
- Wrapped with `withAuth()` HOF for authentication and authorization
- Wrapped with `withValidation()` for Zod schema-based request validation
- Uses repository layer from `@laila/database` for all database operations
- Uses domain logic from `@laila/domain` for business rule validation
- Returns standardized JSON envelope `{ data: T }` on success, `{ error: { code, message, details, requestId } }` on failure
- All responses include appropriate HTTP status codes and `Content-Type: application/json`
