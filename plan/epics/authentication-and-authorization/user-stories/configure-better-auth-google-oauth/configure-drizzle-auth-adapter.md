# Configure Drizzle Auth Adapter

## Task Details

- **Title:** Configure Drizzle Auth Adapter
- **Status:** Not Started
- **Assigned Agent:** security-engineer
- **Parent User Story:** [Configure Better Auth with Google OAuth](./tasks.md)
- **Parent Epic:** [Authentication & Authorization](../../user-stories.md)
- **Dependencies:** Set Up Better Auth Server

## Description

Set up the Better Auth Drizzle adapter to persist authentication data (users, sessions, accounts, verification tokens) in the PostgreSQL/Neon database. This connects the Better Auth server instance to the existing Drizzle ORM database layer from Epic 3.

The Drizzle adapter enables Better Auth to use the application's PostgreSQL database for storing user records, OAuth account links, active sessions, and verification tokens. The auth tables (users, sessions, accounts) should already be defined in the database schema from Epic 3's database layer.

Key configuration steps:

1. **Install the Drizzle adapter package** for Better Auth.

2. **Configure the adapter** in the auth server instance to use the existing Drizzle database client and reference the auth schema tables.

3. **Verify table compatibility** between Better Auth's expected schema and the Drizzle schema defined in Epic 3. Better Auth expects specific columns on users, sessions, and accounts tables.

4. **Configure user field mapping** if the application's user schema has custom fields beyond Better Auth's defaults (e.g., `tenant_id` which equals `user_id` in this system).

```typescript
// packages/web/src/lib/auth.ts — updated with Drizzle adapter
// Connect Better Auth to PostgreSQL via the Drizzle ORM adapter.
// This persists users, sessions, and OAuth account links in the database.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@laila/database";
import * as schema from "@laila/database/schema";

export const auth = betterAuth({
  // ... existing config from setup-better-auth-server ...
  database: drizzleAdapter(db, {
    // Provide the full schema so Better Auth can reference
    // the users, sessions, and accounts tables directly.
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
    },
  }),
});
```

The Drizzle adapter should use the same database connection pool configured in the database package to avoid creating duplicate connections.

## Acceptance Criteria

- [ ] Better Auth Drizzle adapter is installed and configured in the auth server instance
- [ ] Adapter references the existing Drizzle database client from `@laila/database`
- [ ] Auth tables (users, sessions, accounts) are correctly mapped from the database schema
- [ ] PostgreSQL provider is specified for the adapter (`provider: "pg"`)
- [ ] Better Auth can create user records through the adapter (verified via test)
- [ ] Better Auth can create and retrieve session records through the adapter
- [ ] Better Auth can link OAuth accounts to user records through the adapter
- [ ] No duplicate database connection pools are created — reuses the existing Drizzle client
- [ ] TypeScript compilation succeeds with no type errors in the adapter configuration

## Technical Notes

- The Drizzle adapter for Better Auth is included in the `better-auth` package itself (`better-auth/adapters/drizzle`), so no additional package installation may be needed. Verify the import path based on the installed version.
- Better Auth expects specific columns on its tables. The database schema from Epic 3 should have been designed to match these requirements. If there are mismatches, schema adjustments may be needed.
- The `provider: "pg"` setting tells the adapter to use PostgreSQL-specific query patterns (e.g., `RETURNING` clauses).
- The database client from `@laila/database` should already handle connection pooling via Neon's serverless driver. The adapter should reuse this, not create its own pool.
- If Better Auth requires columns that don't exist in the current schema, use `@better-auth/cli generate` to see the expected schema and reconcile differences.
- Consider adding a health check that verifies the adapter can connect and query the auth tables on application startup.

## References

- **Functional Requirements:** FR-AUTH-003 (session persistence in PostgreSQL)
- **Design Specification:** Section 4.1.2 (Drizzle Auth Adapter), Section 3.2 (Database Schema — auth tables)
- **Project Setup:** Database package configuration, Drizzle client export

## Estimated Complexity

Small — The Drizzle adapter configuration is straightforward if the database schema already matches Better Auth's expectations. The main risk is schema compatibility, which should have been addressed in Epic 3.
