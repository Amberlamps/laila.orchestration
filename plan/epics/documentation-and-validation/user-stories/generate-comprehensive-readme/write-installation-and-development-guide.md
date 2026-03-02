# Write Installation and Development Guide

## Task Details

- **Title:** Write Installation and Development Guide
- **Status:** Not Started
- **Assigned Agent:** technical-writer
- **Parent User Story:** [Generate Comprehensive README.md](./tasks.md)
- **Parent Epic:** [Documentation & Validation](../../user-stories.md)
- **Dependencies:** None

## Description

Write the README sections covering installation, local development workflow, and building the project for production. Instructions must be copy-paste friendly with clear success indicators (what the developer should see when each step works correctly).

### Section: Installation

```markdown
## Installation

### 1. Clone the Repository

git clone https://github.com/your-org/laila.works.git
cd laila.works

### 2. Install Dependencies

pnpm install --frozen-lockfile

### 3. Configure Environment Variables

Copy the example environment file and fill in your credentials:

cp .env.example .env.local

Required variables in `.env.local`:

DATABASE_URL=postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require
BETTER_AUTH_SECRET=your-generated-secret-here
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000

### 4. Set Up the Database

Run database migrations to create the schema:

pnpm drizzle-kit push

Verify the migration succeeded by checking the Neon dashboard for the created tables.
```

### Section: Local Development

```markdown
## Local Development

### Start the Development Server

pnpm dev

The application will be available at http://localhost:3000.

### Database Development with Neon Branching

For feature development, create a Neon branch to avoid modifying the shared database:

1. Go to the Neon dashboard
2. Create a new branch from `main`
3. Copy the branch connection string
4. Update `DATABASE_URL` in `.env.local`

### Hot Reload

Next.js provides automatic hot reload for:
- Page components (`pages/`)
- API routes (`pages/api/`)
- Shared packages (`packages/`) — via workspace linking

Changes to Lambda functions (`functions/`) require a rebuild: `pnpm --filter @laila/timeout-checker build`
```

### Section: Building

```markdown
## Building

### Build Everything

pnpm build:all

This runs in sequence:
1. `pnpm build:next` — Builds the Next.js application
2. `pnpm build:open-next` — Transforms Next.js output for Lambda deployment
3. `pnpm build:lambdas` — Builds all Lambda function bundles

### Build Individual Packages

# Build just the Next.js application
pnpm build:next

# Build a specific Lambda function
pnpm --filter @laila/timeout-checker build

# Build all shared packages
pnpm --filter './packages/*' build

### Verify Build Output

After building, verify the expected artifacts exist:

ls -la .open-next/           # OpenNext output
ls -la functions/*/dist/     # Lambda function bundles
```

## Acceptance Criteria

- [ ] Installation section has numbered steps: clone, install, env setup, database
- [ ] `pnpm install --frozen-lockfile` is used (not `pnpm install`)
- [ ] `.env.example` is referenced for environment variable template
- [ ] All required environment variables are listed with example values
- [ ] Database migration command is documented (`pnpm drizzle-kit push`)
- [ ] Local development section documents `pnpm dev` and the dev server URL
- [ ] Neon branching workflow is explained for safe feature development
- [ ] Hot reload behavior is documented (what hot-reloads, what requires rebuild)
- [ ] Build section documents full build (`pnpm build:all`) and individual builds
- [ ] Build verification commands are provided to confirm success
- [ ] All commands are copy-paste ready

## Technical Notes

- `--frozen-lockfile` ensures exact dependency versions from the lockfile are installed, preventing accidental version drift in development.
- The `.env.example` file should contain all variable names with placeholder values (not real secrets). This file is committed to Git.
- Neon branching is highlighted because modifying the shared development database can disrupt other developers. Branches provide isolation.

## References

- **pnpm Workspaces:** https://pnpm.io/workspaces
- **Next.js Development:** https://nextjs.org/docs/getting-started
- **Drizzle Kit:** https://orm.drizzle.team/docs/kit-overview
- **Neon Branching:** https://neon.tech/docs/manage/branches

## Estimated Complexity

Low — Writing task that documents the standard development workflow.
