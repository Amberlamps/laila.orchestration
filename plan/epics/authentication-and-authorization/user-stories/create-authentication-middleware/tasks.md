# Create Authentication Middleware — Tasks

## User Story Summary

- **Title:** Create Authentication Middleware
- **Description:** Create a unified authentication middleware layer that supports dual auth (session cookies for humans, API keys for agents), authorization scoping, protected page HOC, and comprehensive rejection of unauthorized access.
- **Status:** Complete
- **Parent Epic:** [Authentication & Authorization](../../user-stories.md)
- **Total Tasks:** 4
- **Dependencies:** Configure Better Auth with Google OAuth, Implement API Key Authentication

## Tasks

| Task                                                                     | Description                                                                                                                                    | Status   | Assigned Agent      | Dependencies                                                                                           |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| [Implement withAuth Higher-Order Function](./implement-with-auth-hof.md) | Create withAuth HOF for API routes that detects auth type, resolves context, and enforces declared auth type requirements                      | Complete | backend-developer   | None                                                                                                   |
| [Implement Authorization Model](./implement-authorization-model.md)      | Implement owner-scoped access for humans and project-scoped access for workers via worker_project_access table                                 | Complete | backend-developer   | Implement withAuth Higher-Order Function                                                               |
| [Implement Protected Route HOC](./implement-protected-route-hoc.md)      | Create withProtectedPage HOC for Next.js pages with session check, redirect to /sign-in, and return URL preservation                           | Complete | fullstack-developer | Implement withAuth Higher-Order Function                                                               |
| [Write Middleware Tests](./write-middleware-tests.md)                    | Write integration tests for all auth paths: human success, worker success, wrong type rejection, unauthorized access, expired session redirect | Complete | qa-expert           | Implement withAuth Higher-Order Function, Implement Authorization Model, Implement Protected Route HOC |

## Dependency Graph

```
Implement withAuth Higher-Order Function
    |
    +---> Implement Authorization Model --------+
    |                                            |
    +---> Implement Protected Route HOC --------+--> Write Middleware Tests
```

## Suggested Implementation Order

1. **Phase 1:** Implement withAuth Higher-Order Function — core abstraction all other tasks build on
2. **Phase 2 (parallel):** Implement Authorization Model + Implement Protected Route HOC — independent from each other, both depend on withAuth
3. **Phase 3:** Write Middleware Tests — validates all middleware components together
