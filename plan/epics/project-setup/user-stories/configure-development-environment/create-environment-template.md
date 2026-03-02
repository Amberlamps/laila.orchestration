# Create Environment Template

## Task Details

- **Title:** Create Environment Template
- **Status:** Complete
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Configure Development Environment](./tasks.md)
- **Parent Epic:** [Project Setup & Monorepo Scaffold](../../user-stories.md)
- **Dependencies:** None

## Description

Create a `.env.example` file at the monorepo root that documents all required and optional environment variables used across the application. This file serves as a template for developers to create their local `.env` file and as documentation for deployment configuration.

Each variable should include a descriptive comment explaining its purpose, expected format, and whether it is required or optional. Group variables by category (database, authentication, AWS, application settings).

## Acceptance Criteria

- [ ] `.env.example` exists at the monorepo root
- [ ] All database variables are documented: `DATABASE_URL` (Neon PostgreSQL connection string), `DATABASE_DIRECT_URL` (direct connection for migrations)
- [ ] All authentication variables are documented: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_URL`
- [ ] All AWS variables are documented: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `DYNAMODB_AUDIT_TABLE_NAME`
- [ ] Application variables are documented: `NEXT_PUBLIC_APP_URL`, `NODE_ENV`, `API_KEY_HASH_ROUNDS`
- [ ] Each variable has a descriptive comment explaining its purpose and format
- [ ] Variables are grouped by category with section headers
- [ ] Placeholder values demonstrate the expected format (e.g., `postgresql://user:pass@host/db` for DATABASE_URL)
- [ ] No actual secrets or credentials are present in the file
- [ ] `.env.example` is NOT in `.gitignore` (it must be committed)

## Technical Notes

- The `.env.example` file should follow this pattern:

  ```bash
  # .env.example
  # Environment variable template for the laila.works Orchestration Service
  # Copy this file to .env and fill in the values

  # ============================================
  # Database (Neon PostgreSQL)
  # ============================================
  # Primary connection string — uses HTTP for serverless, WebSocket for long-running
  DATABASE_URL=postgresql://user:password@ep-example.us-east-2.aws.neon.tech/dbname?sslmode=require
  # Direct connection for running migrations (bypasses connection pooler)
  DATABASE_DIRECT_URL=postgresql://user:password@ep-example.us-east-2.aws.neon.tech/dbname?sslmode=require

  # ============================================
  # Authentication (Better Auth + Google OAuth)
  # ============================================
  # Secret key for signing sessions and tokens (generate with: openssl rand -base64 32)
  BETTER_AUTH_SECRET=your-secret-key-here
  # ...
  ```

- Neon PostgreSQL uses different connection strings for pooled (serverless) vs. direct (migration) connections
- Better Auth requires a secret for session management — document the generation command
- AWS credentials may be provided via environment variables in local dev, but via IAM roles in production (document both approaches)
- Consider adding a `NEXT_PUBLIC_` prefix section explaining that these are exposed to the browser

## References

- **Functional Requirements:** Environment configuration for all services
- **Design Specification:** Neon PostgreSQL, Better Auth, AWS DynamoDB, Next.js
- **Project Setup:** Environment variable documentation

## Estimated Complexity

Small — Documentation file with known variable requirements. No code logic. The main effort is comprehensively documenting all variables.
