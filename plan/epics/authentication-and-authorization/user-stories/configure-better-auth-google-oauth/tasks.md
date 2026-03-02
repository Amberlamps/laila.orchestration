# Configure Better Auth with Google OAuth — Tasks

## User Story Summary

- **Title:** Configure Better Auth with Google OAuth
- **Description:** Install and configure Better Auth with Google OAuth as the identity provider, Drizzle adapter for session persistence, JWT-based sessions with refresh tokens, and a catch-all API route handler.
- **Status:** In Progress (laila-agent-3)
- **Parent Epic:** [Authentication & Authorization](../../user-stories.md)
- **Total Tasks:** 4
- **Dependencies:** None

## Tasks

| Task                                                                  | Description                                                                                                        | Status      | Assigned Agent      | Dependencies                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------- | ------------------- | --------------------------------------------------------- |
| [Set Up Better Auth Server](./setup-better-auth-server.md)            | Install Better Auth, configure server instance with Google OAuth provider, session options, and cookie settings    | Not Started | security-engineer   | None                                                      |
| [Configure Drizzle Auth Adapter](./configure-drizzle-auth-adapter.md) | Set up Better Auth Drizzle adapter to persist auth data (users, sessions, accounts) in PostgreSQL/Neon             | Not Started | security-engineer   | Set Up Better Auth Server                                 |
| [Implement Auth API Route](./implement-auth-api-route.md)             | Create pages/api/auth/[...betterauth].ts catch-all route handler for all Better Auth endpoints                     | Not Started | fullstack-developer | Set Up Better Auth Server, Configure Drizzle Auth Adapter |
| [Write Auth Integration Tests](./write-auth-integration-tests.md)     | Write integration tests for Google OAuth flow (mocked), session lifecycle, token refresh, and session invalidation | Not Started | qa-expert           | Implement Auth API Route                                  |

## Dependency Graph

```
Set Up Better Auth Server
    |
    v
Configure Drizzle Auth Adapter
    |
    v
Implement Auth API Route
    |
    v
Write Auth Integration Tests
```

## Suggested Implementation Order

1. **Phase 1:** Set Up Better Auth Server — foundational configuration that all other tasks depend on
2. **Phase 2:** Configure Drizzle Auth Adapter — connects Better Auth to the PostgreSQL database via Drizzle
3. **Phase 3:** Implement Auth API Route — exposes Better Auth endpoints through Next.js Pages Router
4. **Phase 4:** Write Auth Integration Tests — validates the complete auth flow end to end
