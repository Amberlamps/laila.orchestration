# Authentication & Authorization — User Stories

## Epic Summary

- **Title:** Authentication & Authorization
- **Description:** Better Auth with Google OAuth, API key authentication for execution agents, auth middleware, and protected routes.
- **Status:** In Progress (laila-agent-3)
- **Total User Stories:** 3
- **Dependencies:** Epic 3 (Database Layer)

## User Stories

| User Story                                                                                            | Description                                                                                                                          | Status                      | Tasks   | Dependencies                                                              |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ------- | ------------------------------------------------------------------------- |
| [Configure Better Auth with Google OAuth](./user-stories/configure-better-auth-google-oauth/tasks.md) | Install and configure Better Auth with Google OAuth provider, Drizzle adapter, session management, and catch-all API route           | In Progress (laila-agent-3) | 4 tasks | None                                                                      |
| [Implement API Key Authentication](./user-stories/implement-api-key-authentication/tasks.md)          | Implement API key generation with `lw_` prefix, SHA-256 hashing, prefix-based lookup, and validation middleware for execution agents | Complete                    | 3 tasks | None                                                                      |
| [Create Authentication Middleware](./user-stories/create-authentication-middleware/tasks.md)          | Create withAuth HOF for API routes supporting dual auth (session + API key), authorization model, and protected page HOC             | Not Started                 | 4 tasks | Configure Better Auth with Google OAuth, Implement API Key Authentication |

## Dependency Graph

```
Configure Better Auth with Google OAuth ----+
                                            |
                                            +--> Create Authentication Middleware
                                            |
Implement API Key Authentication -----------+
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** Configure Better Auth with Google OAuth + Implement API Key Authentication — these two are independent and can be built simultaneously
2. **Phase 2:** Create Authentication Middleware — requires both auth mechanisms to be in place before the unified middleware can be built
