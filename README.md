# laila.works

## Overview

laila.works is an AI Agent Orchestration Service that manages and coordinates
multiple AI agents working on complex, multi-step projects. It provides:

- **Project Structure:** Hierarchical organization with Epics > User Stories > Tasks
- **DAG-Based Dependencies:** Directed Acyclic Graph for task dependency management
- **Automated Work Assignment:** Atomic, conflict-free assignment of stories to AI workers
- **Status Propagation:** Cascading status updates when tasks complete (via SQS)
- **Timeout & Reclamation:** Automatic recovery of timed-out assignments
- **Audit Trail:** Complete event history with DynamoDB + S3 archival

### Architecture

```
                   +-------------------------------+
                   |  Next.js 14 (Pages Router)    |
                   |  React 18 + TanStack Query    |
                   +---------------+---------------+
                                   |
                                   v
                   +-------------------------------+
                   |  AWS Lambda (ARM64/Graviton2)  |
                   |  OpenNext v3                   |
                   +-------+-----------+-----------+
                           |           |
              +------------+           +------------+
              v                                     v
   +--------------------+              +---------------------+
   | PostgreSQL (Neon)  |              | DynamoDB Audit Logs |
   | Drizzle ORM        |              | TTL + S3 Archival   |
   +--------------------+              +---------------------+
              |
   +----------+----------+----------+
   |          |          |          |
   v          v          v          v
 [SQS]     [S3]   [EventBridge] [CloudFront]
```

### Tech Stack

| Layer            | Technology                           | Purpose                                                             |
| ---------------- | ------------------------------------ | ------------------------------------------------------------------- |
| Frontend         | Next.js 14, React 18, Tailwind CSS 4 | Pages Router with SSR/SSG                                           |
| UI Components    | Radix UI, Recharts, React Flow       | Accessible primitives, charts, DAG visualization                    |
| State/Data       | TanStack Query 5, React Hook Form 7  | Server state caching, form management                               |
| API Spec         | OpenAPI 3.1, openapi-fetch           | Type-safe API client generation                                     |
| Auth             | Better Auth 1.x, Google OAuth 2.0    | Session management with JWT cookie cache                            |
| Database         | PostgreSQL (Neon), Drizzle ORM       | Serverless Postgres with type-safe queries                          |
| Audit            | DynamoDB, S3                         | Event logging with TTL-based archival                               |
| Lambda Functions | tsup, TypeScript                     | status-propagation, timeout-checker, dag-reconciler, audit-archiver |
| Observability    | pino, CloudWatch, X-Ray              | Structured logging, metrics, tracing                                |
| IaC              | Terraform                            | AWS infrastructure modules                                          |
| CI/CD            | GitHub Actions                       | Lint, typecheck, test on push/PR                                    |
| Monorepo         | pnpm workspaces                      | apps/\*, packages/\*, functions/\*                                  |

## Prerequisites

Before you begin, ensure you have the following installed and configured.

### Required Tools

| Tool    | Version   | Purpose                                                  |
| ------- | --------- | -------------------------------------------------------- |
| Node.js | >= 22.0.0 | JavaScript runtime (see `.nvmrc`)                        |
| pnpm    | >= 9.0.0  | Package manager (`packageManager` field enforces 9.15.9) |
| Git     | 2.x+      | Version control                                          |

### Required Accounts

| Service              | Purpose                                            | Setup Link                                                   |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| Neon                 | PostgreSQL database hosting                        | [neon.tech](https://neon.tech)                               |
| AWS                  | Lambda, DynamoDB, SQS, S3, EventBridge, CloudFront | [aws.amazon.com](https://aws.amazon.com)                     |
| Google Cloud Console | OAuth 2.0 credentials for login                    | [console.cloud.google.com](https://console.cloud.google.com) |
| GitHub               | Repository access and Actions CI/CD                | [github.com](https://github.com)                             |

### Required Credentials

Copy `.env.example` to `.env.local` and fill in the values below.

| Credential                  | Where to Obtain                                                             |
| --------------------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`              | Neon dashboard > Connection string (pooled)                                 |
| `DATABASE_DIRECT_URL`       | Neon dashboard > Connection string (direct, for migrations)                 |
| `BETTER_AUTH_SECRET`        | Generate locally: `openssl rand -base64 32`                                 |
| `BETTER_AUTH_URL`           | Your app URL (`http://localhost:3000` for local dev)                        |
| `GOOGLE_CLIENT_ID`          | Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client IDs |
| `GOOGLE_CLIENT_SECRET`      | Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client IDs |
| `AWS_REGION`                | Your AWS deployment region (e.g., `us-east-1`)                              |
| `AWS_ACCESS_KEY_ID`         | AWS IAM console (local dev only; use IAM roles in production)               |
| `AWS_SECRET_ACCESS_KEY`     | AWS IAM console (local dev only; use IAM roles in production)               |
| `DYNAMODB_AUDIT_TABLE_NAME` | Terraform output or manual creation (e.g., `laila-dev-audit`)               |

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/laila.works.git
cd laila.works
```

### 2. Install Dependencies

This project requires **Node.js >= 22** and **pnpm >= 9**.

```bash
pnpm install --frozen-lockfile
```

The `--frozen-lockfile` flag ensures exact dependency versions from the lockfile are installed, preventing accidental version drift across developer machines.

### 3. Configure Environment Variables

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env.local
```

The `.env.example` file is committed to the repository and contains all variable names with placeholder values. Open `.env.local` and provide real values for each entry.

#### Required Environment Variables

| Variable                    | Description                                               | Example Value                                                                      |
| --------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `DATABASE_URL`              | Neon PostgreSQL connection string (pooled)                | `postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require` |
| `DATABASE_DIRECT_URL`       | Neon direct connection for migrations (bypasses pooler)   | `postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require` |
| `BETTER_AUTH_SECRET`        | Secret key for signing sessions and tokens (min 32 chars) | Generate with `openssl rand -base64 32`                                            |
| `BETTER_AUTH_URL`           | Base URL for auth callbacks and redirects                 | `http://localhost:3000`                                                            |
| `GOOGLE_CLIENT_ID`          | Google OAuth 2.0 Client ID                                | `your-google-client-id.apps.googleusercontent.com`                                 |
| `GOOGLE_CLIENT_SECRET`      | Google OAuth 2.0 Client Secret                            | `your-google-client-secret`                                                        |
| `AWS_REGION`                | AWS region for DynamoDB and other services                | `us-east-1`                                                                        |
| `AWS_ACCESS_KEY_ID`         | AWS access key for local development                      | `your-aws-access-key-id`                                                           |
| `AWS_SECRET_ACCESS_KEY`     | AWS secret key for local development                      | `your-aws-secret-access-key`                                                       |
| `DYNAMODB_AUDIT_TABLE_NAME` | DynamoDB table name for audit log entries                 | `laila-dev-audit`                                                                  |
| `NEXT_PUBLIC_APP_URL`       | Public-facing application URL exposed to the browser      | `http://localhost:3000`                                                            |

#### Optional Environment Variables

| Variable              | Description                                            | Default       |
| --------------------- | ------------------------------------------------------ | ------------- |
| `NODE_ENV`            | Node environment (`development`, `production`, `test`) | `development` |
| `API_KEY_HASH_ROUNDS` | Number of bcrypt hash rounds for API key hashing       | `12`          |

> **Note:** Variables prefixed with `NEXT_PUBLIC_` are bundled into client-side JavaScript and visible to end users. Never place secrets in `NEXT_PUBLIC_` variables.

### 4. Set Up the Database

Run database migrations to create the schema. The `@laila/database` package uses [Drizzle Kit](https://orm.drizzle.team/docs/kit-overview) for migration management:

```bash
pnpm --filter @laila/database db:push
```

This command pushes the Drizzle schema definitions directly to your Neon database. It uses the `DATABASE_DIRECT_URL` (not the pooled `DATABASE_URL`) to perform DDL operations.

Verify the migration succeeded by checking the [Neon dashboard](https://console.neon.tech) for the created tables.

To generate migration SQL files without applying them (useful for review before production deployments):

```bash
pnpm --filter @laila/database db:generate
```

To apply generated migration files:

```bash
pnpm --filter @laila/database db:migrate
```

---

## Local Development

### Start the Development Server

From the repository root:

```bash
pnpm dev
```

This runs the `dev` script recursively across all workspace packages (`pnpm -r run dev`). The Next.js application will be available at **http://localhost:3000**.

Lambda functions that define a `dev` script (using `tsup --watch`) will also start in watch mode, rebuilding on file changes.

### Database Development with Neon Branching

For feature development, create a Neon database branch to avoid modifying the shared development database. Branches provide full isolation so that schema changes and test data do not disrupt other developers.

1. Open the [Neon dashboard](https://console.neon.tech)
2. Navigate to your project and select **Branches**
3. Create a new branch from `main`
4. Copy the branch connection string (both pooled and direct)
5. Update `DATABASE_URL` and `DATABASE_DIRECT_URL` in your `.env.local` with the branch values
6. Run `pnpm --filter @laila/database db:push` to apply the current schema to the branch

When the feature is complete, merge your code and delete the Neon branch.

### Database Studio

Drizzle Kit includes a visual database browser for inspecting and editing data during development:

```bash
pnpm --filter @laila/database db:studio
```

### Hot Reload Behavior

Next.js provides automatic hot module replacement (HMR) for changes within the `apps/web/` directory:

- **Page components and layouts** -- reflected in the browser immediately without a full page reload
- **API routes** -- the server picks up changes on the next request
- **Shared packages** (`packages/`) -- linked via pnpm workspace resolution; changes are picked up by the Next.js dev server through workspace symlinks

Changes to **Lambda functions** (`functions/`) are not part of the Next.js dev server and require a targeted rebuild:

```bash
pnpm --filter @laila/timeout-checker build
pnpm --filter @laila/audit-archiver build
pnpm --filter @laila/dag-reconciler build
pnpm --filter @laila/status-propagation build
```

Alternatively, run the function-specific `dev` script for continuous rebuilds during active development:

```bash
pnpm --filter @laila/timeout-checker dev
```

Changes to **shared package type declarations** (`packages/shared`, `packages/database`, `packages/logger`, `packages/metrics`) that use `exports` with `"types": "./dist/index.d.ts"` require a type rebuild before consuming packages can resolve them:

```bash
pnpm --filter @laila/shared build:types
pnpm --filter @laila/database build:types
pnpm --filter @laila/logger build:types
pnpm --filter @laila/metrics build:types
```

---

## Building

### Build Everything

```bash
pnpm build:all
```

This runs the following steps in sequence:

1. **`pnpm build:open-next`** -- Builds the Next.js application via `npx pnpm --filter @laila/web run build`, then transforms the output into AWS Lambda deployment artifacts using [OpenNext](https://opennext.js.org/aws/config). The output is written to `apps/web/.open-next/`.
2. **`pnpm build:lambdas`** -- Builds all Lambda function bundles in parallel (`pnpm --filter '@laila/*' --parallel run build`). Each function uses `tsup` to produce a bundled `dist/handler.js`.

### Build Individual Packages

```bash
# Build just the Next.js application (without OpenNext transform)
pnpm --filter @laila/web build

# Build the Next.js application with OpenNext transform
pnpm build:open-next

# Build a specific Lambda function
pnpm --filter @laila/timeout-checker build
pnpm --filter @laila/audit-archiver build
pnpm --filter @laila/dag-reconciler build
pnpm --filter @laila/status-propagation build

# Build type declarations for shared packages
pnpm --filter @laila/shared build:types
pnpm --filter @laila/database build:types
pnpm --filter @laila/logger build:types
pnpm --filter @laila/metrics build:types
```

### Build Verification

After building, verify the expected artifacts exist:

```bash
# Verify OpenNext output (server function + static assets)
ls apps/web/.open-next/server-functions/default/

# Verify Lambda function bundles
ls functions/timeout-checker/dist/
ls functions/audit-archiver/dist/
ls functions/dag-reconciler/dist/
ls functions/status-propagation/dist/

# Run the full lint and type-check suite to catch build issues
pnpm lint
pnpm typecheck

# Run the test suite
pnpm test
```

---

## Testing

The project uses [Vitest](https://vitest.dev/) as the test runner across all packages, apps, and Lambda functions. A workspace-level configuration (`vitest.workspace.ts`) discovers per-package `vitest.config.ts` files and runs every test suite in a single invocation.

### Run All Tests

```bash
pnpm test
```

This executes `vitest run --config vitest.workspace.ts`, which discovers and runs tests in `packages/*/vitest.config.ts`, `apps/*/vitest.config.ts`, and `functions/*/vitest.config.ts`.

### Run Tests with Coverage

```bash
pnpm test:coverage
```

Coverage is collected with the V8 provider and reported in both `text` (terminal) and `lcov` (CI-friendly) formats. Output is written to the `coverage/` directory at the project root.

**Coverage thresholds** -- the build fails if any metric falls below the minimum:

| Metric     | Threshold |
| ---------- | --------- |
| Lines      | 90%       |
| Branches   | 90%       |
| Functions  | 90%       |
| Statements | 90%       |

### Run Tests for a Specific Package

Use the `--filter` flag to target a single workspace package:

```bash
# Lambda functions
pnpm --filter @laila/timeout-checker test
pnpm --filter @laila/audit-archiver test
pnpm --filter @laila/dag-reconciler test
pnpm --filter @laila/status-propagation test

# Shared packages
pnpm --filter @laila/domain test
pnpm --filter @laila/database test
pnpm --filter @laila/shared test
```

### Watch Mode

For development, run tests in watch mode so they re-execute on every file change:

```bash
pnpm --filter @laila/timeout-checker test:watch
pnpm --filter @laila/dag-reconciler test:watch
pnpm --filter @laila/status-propagation test:watch
pnpm --filter @laila/audit-archiver test:watch
```

The `test:watch` script runs `vitest` without the `run` flag, which starts the interactive watcher.

### Test Conventions

- **Co-located tests.** Test files live alongside source code, typically in a `__tests__/` directory within `src/` (e.g., `src/__tests__/handler.test.ts`). Some packages use a `tests/` directory under `src/` for integration-style tests.
- **File naming.** Tests use `.test.ts` or `.spec.ts` extensions. Playwright end-to-end tests (in `apps/web/e2e/`) also use `.spec.ts` and are excluded from Vitest via the `exclude: ['**/e2e/**']` pattern in the web app's Vitest config.
- **Vitest APIs.** Use `vi.mock()` for module mocking and `vi.fn()` for function stubs. Use `vi.useFakeTimers()` for time-dependent tests.
- **No `any` types.** The `@typescript-eslint/no-explicit-any` rule is set to `"warn"` in test files (downgraded from `"error"` in production code). Use properly typed mocks with `unknown` and type narrowing instead of `any`.
- **Mock completeness.** When mocking a module, export every function the consuming code imports. Missing exports become `undefined` at runtime and cause failures. This applies especially to `@laila/database`, `@laila/metrics`, and domain repositories.
- **Environment per package.** Lambda functions and shared packages run tests with `environment: 'node'`. The web app uses `environment: 'jsdom'`.

---

## Type Checking

### Run Type Check Across All Packages

```bash
pnpm typecheck
```

This runs `tsc --noEmit` at the root, which type-checks the entire project without emitting output files. All packages must pass with zero type errors.

### Type Check a Specific Package

Packages that define their own `typecheck` script can be targeted individually:

```bash
pnpm --filter @laila/timeout-checker typecheck
pnpm --filter @laila/audit-archiver typecheck
pnpm --filter @laila/dag-reconciler typecheck
pnpm --filter @laila/status-propagation typecheck
pnpm --filter @laila/database typecheck
```

Each runs `tsc --noEmit` scoped to that package's `tsconfig.json`.

### TypeScript Configuration

All packages extend `tsconfig.base.json`, which enables the strictest type-checking settings:

| Option                             | Value  | Effect                                                                                 |
| ---------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| `strict`                           | `true` | Enables all strict-mode checks (`strictNullChecks`, `noImplicitAny`, etc.)             |
| `noUncheckedIndexedAccess`         | `true` | Array and object indexing returns `T \| undefined`, preventing silent `undefined` bugs |
| `exactOptionalPropertyTypes`       | `true` | Distinguishes between missing properties and properties set to `undefined`             |
| `noUnusedLocals`                   | `true` | Flags unused local variables as errors                                                 |
| `noUnusedParameters`               | `true` | Flags unused function parameters as errors                                             |
| `noFallthroughCasesInSwitch`       | `true` | Requires explicit `break` or `return` in switch cases                                  |
| `forceConsistentCasingInFileNames` | `true` | Prevents case-sensitivity bugs across operating systems                                |

The `any` type is prohibited project-wide. Use `unknown` with type narrowing instead.

---

## Linting & Formatting

### Run Linter

```bash
pnpm lint
```

Linting uses [ESLint](https://eslint.org/) v9 with a flat configuration (`eslint.config.mjs`). The configuration applies `typescript-eslint` strict type-checked rules, `eslint-plugin-import-x` for import ordering, `eslint-plugin-react` and `eslint-plugin-react-hooks` for React files, `eslint-plugin-jsx-a11y` for accessibility, and `eslint-plugin-drizzle` for database queries.

Zero warnings and zero errors are required. The lint script sets `NODE_OPTIONS='--max-old-space-size=4096'` to accommodate the memory demands of type-aware linting across the monorepo.

To auto-fix issues where possible:

```bash
pnpm lint:fix
```

### Run Formatter

```bash
pnpm format
```

Formatting uses [Prettier](https://prettier.io/) with the `prettier-plugin-tailwindcss` plugin. The `format` command fixes formatting issues in place across the entire project.

Key Prettier settings (from `.prettierrc`):

| Setting         | Value      |
| --------------- | ---------- |
| `printWidth`    | `100`      |
| `singleQuote`   | `true`     |
| `trailingComma` | `"all"`    |
| `semi`          | `true`     |
| `tabWidth`      | `2`        |
| `arrowParens`   | `"always"` |

### Check Formatting (Without Fixing)

```bash
pnpm format:check
```

Returns a non-zero exit code if any files are not formatted correctly. This is the command used in CI to verify formatting without modifying files.

### Pre-Commit Hooks

The project uses [husky](https://typicode.github.io/husky/) and [lint-staged](https://github.com/lint-staged/lint-staged) to enforce quality on every commit. The `.husky/pre-commit` hook runs two steps:

1. **lint-staged** -- processes only staged files:
   - `*.{ts,tsx}` files: runs Prettier (`--write`) then ESLint (`--fix`)
   - `*.{json,md,yaml,yml}` files: runs Prettier (`--write`)
2. **Type check** -- runs `pnpm typecheck` (`tsc --noEmit`) across the entire project

If any step fails, the commit is rejected. Fix the reported issues, re-stage the files, and commit again.

---

## Deployment

### Automated Deployment (Recommended)

Production deployments are triggered automatically when code is merged to the `main` branch. The GitHub Actions workflow (`.github/workflows/deploy-production.yml`) executes the following pipeline:

1. **Install dependencies** -- `pnpm install --frozen-lockfile`
2. **Quality checks** -- TypeScript type-checking (`pnpm typecheck`) and ESLint (`pnpm lint`)
3. **Build Next.js via OpenNext** -- `pnpm build:open-next` (produces Lambda server function + static assets in `apps/web/.open-next/`)
4. **Build Lambda functions** -- `pnpm build:lambdas` (bundles all functions in parallel via tsup)
5. **Package Lambda functions** -- `pnpm deploy:package` (creates zip archives in `deploy/functions/`)
6. **Run database migrations** -- `pnpm drizzle-kit push` (skippable via workflow dispatch input)
7. **Upload static assets to S3** -- `aws s3 sync` with immutable cache headers
8. **Terraform plan and apply** -- Infrastructure changes in `infra/environments/production/`
9. **Post-deploy health check** -- `npx tsx scripts/health-check.ts` (liveness + readiness endpoints)

The workflow uses OIDC authentication with AWS (no static credentials), and deployment concurrency is locked so that only one deployment runs at a time. A GitHub deployment record is created for status tracking.

Manual workflow dispatch is also available via the GitHub Actions UI, with an option to skip database migrations.

### Manual Deployment

For manual deployments or debugging the deployment pipeline:

```bash
# 1. Install dependencies
pnpm install --frozen-lockfile

# 2. Run quality checks
pnpm typecheck
pnpm lint

# 3. Build the Next.js application via OpenNext
pnpm build:open-next

# 4. Build all Lambda function bundles
pnpm build:lambdas

# 5. Package Lambda functions into zip archives
pnpm deploy:package

# 6. Run database migrations (requires direct, non-pooled database connection)
DATABASE_DIRECT_URL=$PROD_DATABASE_DIRECT_URL pnpm drizzle-kit push

# 7. Configure AWS credentials (if not already configured)
aws configure

# 8. Upload static assets to S3
aws s3 sync apps/web/.open-next/assets s3://laila-works-static-assets-eu-central-1 \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "*.html"

# 9. Terraform plan and apply
cd infra/environments/production
terraform init
terraform plan -out=tfplan
terraform apply tfplan

# 10. Verify deployment
npx tsx scripts/health-check.ts
```

The health check script verifies both the liveness endpoint (`/api/v1/health`) and the readiness endpoint (`/api/v1/health/ready`) with automatic retries (5 attempts, 10-second intervals by default). Configure retry behavior with the `HEALTH_CHECK_MAX_RETRIES` and `HEALTH_CHECK_RETRY_DELAY_MS` environment variables.

### Rollback

See [docs/runbooks/rollback-procedure.md](docs/runbooks/rollback-procedure.md) for detailed rollback procedures covering application rollback, database rollback, and infrastructure rollback.

---

## Environment Variables

All environment variables are documented below. Copy `.env.example` to `.env.local` and fill in the values for local development.

### Application Variables

| Variable                    | Required        | Default        | Description                                                                                                               |
| --------------------------- | --------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | Yes             | --             | Neon PostgreSQL connection string (pooled, for application queries)                                                       |
| `DATABASE_DIRECT_URL`       | Yes             | --             | Neon PostgreSQL direct connection string (bypasses pooler, for migrations)                                                |
| `BETTER_AUTH_SECRET`        | Yes             | --             | Secret key for session signing and token encryption (min 32 chars). Generate with `openssl rand -base64 32`               |
| `BETTER_AUTH_URL`           | Yes             | --             | Base URL for Better Auth callback and redirect handling (e.g., `http://localhost:3000`)                                   |
| `GOOGLE_CLIENT_ID`          | Yes             | --             | Google OAuth 2.0 client ID from Google Cloud Console                                                                      |
| `GOOGLE_CLIENT_SECRET`      | Yes             | --             | Google OAuth 2.0 client secret from Google Cloud Console                                                                  |
| `NEXT_PUBLIC_APP_URL`       | Yes             | --             | Public-facing application URL exposed to the browser. **Bundled into client-side JS -- never put secrets here.**          |
| `AWS_REGION`                | Yes (local dev) | `us-east-1`    | AWS region for DynamoDB, SQS, and other AWS services. In production, inherited from the Lambda execution environment      |
| `AWS_ACCESS_KEY_ID`         | Yes (local dev) | --             | AWS access key for programmatic access. In production, use IAM roles instead                                              |
| `AWS_SECRET_ACCESS_KEY`     | Yes (local dev) | --             | AWS secret key for programmatic access. In production, use IAM roles instead                                              |
| `DYNAMODB_AUDIT_TABLE_NAME` | Yes             | `audit-events` | DynamoDB table name for audit log entries                                                                                 |
| `NODE_ENV`                  | No              | `development`  | Environment mode: `development`, `production`, or `test`                                                                  |
| `LOG_LEVEL`                 | No              | `info`         | pino log level: `debug`, `info`, `warn`, `error`                                                                          |
| `API_KEY_HASH_ROUNDS`       | No              | `12`           | Number of bcrypt hash rounds for worker API key hashing                                                                   |
| `APP_VERSION`               | No              | `unknown`      | Application version string returned by the health check endpoint                                                          |
| `NEXT_PUBLIC_API_BASE_URL`  | No              | `/api/v1`      | Base URL for API client requests. Override in production if the API is served from a different origin                     |
| `NEXT_PUBLIC_API_MOCKING`   | No              | --             | Set to `enabled` to activate the MSW service worker for browser-based API mocking (used by Playwright e2e tests)          |
| `SQS_QUEUE_URL`             | No              | --             | SQS queue URL for the status propagation health check. When unset, the SQS readiness check is skipped (local development) |

### Lambda-Only Variables

These variables are set in the Lambda execution environment via Terraform and are not needed for local development.

| Variable                    | Lambda Function                                     | Description                                                                                  |
| --------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | timeout-checker, dag-reconciler, status-propagation | PostgreSQL connection string injected from SSM Parameter Store                               |
| `TABLE_NAME`                | audit-archiver                                      | DynamoDB audit events table name for scanning and archiving                                  |
| `BUCKET_NAME`               | audit-archiver                                      | S3 bucket name for storing archived audit event records                                      |
| `IDEMPOTENCY_TABLE_NAME`    | status-propagation                                  | DynamoDB table name for SQS message idempotency tracking                                     |
| `DYNAMODB_AUDIT_TABLE_NAME` | Next.js (via OpenNext)                              | DynamoDB table name for writing and reading audit events                                     |
| `_X_AMZN_TRACE_ID`          | All Lambda functions                                | AWS X-Ray trace header, set automatically by the Lambda runtime when X-Ray tracing is active |

### Deployment-Only Variables

These variables are used by CI/CD scripts and are not part of the application runtime.

| Variable                      | Used By                   | Description                                                                         |
| ----------------------------- | ------------------------- | ----------------------------------------------------------------------------------- |
| `HEALTH_CHECK_URL`            | `scripts/health-check.ts` | Production URL for post-deploy health verification (default: `https://laila.works`) |
| `PRODUCTION_URL`              | `scripts/health-check.ts` | Fallback production URL when `HEALTH_CHECK_URL` is not set                          |
| `HEALTH_CHECK_MAX_RETRIES`    | `scripts/health-check.ts` | Number of retry attempts for health check (default: `5`)                            |
| `HEALTH_CHECK_RETRY_DELAY_MS` | `scripts/health-check.ts` | Delay between retry attempts in milliseconds (default: `10000`)                     |
| `AWS_DEPLOY_ROLE_ARN`         | GitHub Actions            | IAM role ARN for OIDC-based AWS authentication during deployment                    |
| `TF_VAR_*`                    | Terraform                 | Terraform input variables for Lambda deployment package paths                       |

---

## Project Structure

```
laila.works/
  apps/
    web/                          # Next.js 14 application (Pages Router)
      e2e/                        # Playwright end-to-end tests
        auth/                     # Authentication e2e tests
        entity-management/        # CRUD entity management e2e tests
        fixtures/                 # Shared Playwright fixtures and MSW setup
        graph-and-responsive/     # DAG graph and responsive layout e2e tests
        page-objects/             # Page Object Model classes
        plan-creation/            # Plan creation workflow e2e tests
        work-execution/           # Work execution workflow e2e tests
      public/                     # Static files served at root
      src/
        __tests__/                # Unit and integration tests
        components/               # React components organized by feature
          audit/                  # Audit trail UI
          dashboard/              # Dashboard widgets
          epics/                  # Epic management components
          layout/                 # Layout shell and navigation
          personas/               # Persona management
          project/                # Project detail views
          stories/                # Story management components
          tasks/                  # Task management components
          ui/                     # Shared UI primitives (Radix-based)
          workers/                # Worker management components
        hooks/                    # Custom React hooks
        lib/                      # Shared application logic
          api/                    # API route handler utilities
          audit/                  # Audit event helpers
          export/                 # Data export utilities
          graph/                  # DAG graph utilities
          health/                 # Health check endpoint logic
          middleware/             # API middleware (auth, validation)
          orchestration/          # Work assignment and orchestration
          api-client.ts           # Type-safe API client (openapi-fetch)
          auth.ts                 # Better Auth configuration
          query-hooks.ts          # TanStack Query hooks for all endpoints
          query-keys.ts           # Query key factories
        mocks/                    # MSW request handlers for testing
        pages/                    # Next.js Pages Router
          api/
            auth/                 # Better Auth route handler
            v1/                   # Versioned API endpoints
              audit-events/       # Audit event queries
              health/             # Health check endpoints
              orchestration/      # Work assignment and completion
              personas/           # Persona CRUD
              projects/           # Project CRUD
              stories/            # Story CRUD + DAG operations
              tasks/              # Task CRUD
              workers/            # Worker CRUD + API key management
            workers/              # Worker-facing API routes
          personas/               # Persona management pages
          projects/               # Project management pages
          workers/                # Worker management pages
        styles/                   # Global CSS and Tailwind styles
        workers/                  # Web Worker scripts
  packages/
    api-spec/                     # OpenAPI 3.1 specification and generated types
      generated/                  # Auto-generated TypeScript types from openapi.yaml
      openapi.yaml                # OpenAPI specification (source of truth)
      scripts/                    # Code generation scripts
    database/                     # Drizzle ORM schema, migrations, and repositories
      src/
        dynamo/                   # DynamoDB audit event client (reader + writer)
        repositories/             # Repository pattern implementations
        schema/                   # Drizzle table definitions
        seed/                     # Test seed data factories
        client.ts                 # Drizzle client factory
        connection.ts             # Neon connection helpers (HTTP + Pool)
    domain/                       # Pure domain logic (no I/O dependencies)
      src/
        assignment/               # Work assignment algorithms
        dag/                      # Directed Acyclic Graph operations
        orchestration/            # Orchestration rules and state machines
        status/                   # Status transition logic
        validation/               # Entity validation rules
    logger/                       # pino structured logging for server-side code
      src/
        index.ts                  # Logger factory and request logger
        lambda.ts                 # Lambda-specific logger (extracts request ID)
        xray.ts                   # X-Ray trace ID extraction
    metrics/                      # CloudWatch custom metrics client
      src/
        index.ts                  # Batched PutMetricData for Lambda functions
    shared/                       # Shared types, schemas, constants, and utilities
      src/
        constants/                # Application-wide constants
        errors/                   # Custom error classes
        schemas/                  # Zod validation schemas
        types/                    # TypeScript type definitions
        utils/                    # Shared utility functions
  functions/
    timeout-checker/              # Lambda: detects timed-out worker assignments
      src/
        handler.ts                # EventBridge scheduled handler
    dag-reconciler/               # Lambda: verifies DAG consistency across projects
      src/
        handler.ts                # EventBridge scheduled handler
        reconciliation.ts         # Reconciliation logic and rules
    audit-archiver/               # Lambda: archives DynamoDB audit events to S3
      src/
        handler.ts                # EventBridge scheduled handler
        dynamo.ts                 # DynamoDB scan operations
        s3.ts                     # S3 upload operations
        partition.ts              # Date-based partition key generation
    status-propagation/           # Lambda: SQS consumer for cascading status updates
      src/
        handler.ts                # SQS event handler
        evaluator.ts              # Status evaluation logic
        propagator.ts             # Cascading status propagation
        idempotency.ts            # DynamoDB-based idempotency tracking
  infra/
    modules/                      # Reusable Terraform modules
      lambda-function/            # Lambda function with IAM role and log group
      dynamodb-table/             # DynamoDB table with optional TTL and GSIs
      cloudfront-distribution/    # CloudFront CDN with S3 + Lambda origins
      s3-bucket/                  # S3 bucket with encryption and lifecycle rules
      sqs-queue/                  # SQS queue with dead-letter queue
      eventbridge-schedule/       # EventBridge scheduled rule for Lambda triggers
    environments/
      production/                 # Production Terraform configuration
        backend.tf                # S3 backend for Terraform state
        cdn.tf                    # CloudFront distribution + Lambda Function URL
        dns.tf                    # Route 53 hosted zone + ACM certificate
        main.tf                   # Provider configuration
        metrics-iam.tf            # IAM policies for CloudWatch custom metrics
        monitoring.tf             # CloudWatch dashboard, alarms, and SNS alerts
        ssm.tf                    # SSM Parameter Store for secrets (KMS-encrypted)
        variables.tf              # Input variables
    scripts/
      bootstrap-backend.sh        # One-time script to create S3 + DynamoDB for Terraform state
  scripts/
    health-check.ts               # Post-deploy health verification (liveness + readiness)
    package-lambdas.ts            # Zip packaging for Lambda deployment artifacts
  docs/
    runbooks/
      rollback-procedure.md       # Production rollback procedures
  .github/
    workflows/
      ci.yml                      # CI pipeline: lint, typecheck, test on push/PR
      deploy-production.yml       # Production deployment pipeline
```

---

## Debugging

### Local API Debugging

Start the Next.js dev server with the Node.js inspector enabled to set breakpoints in API route handlers:

1. Start the dev server with the `--inspect` flag:

```bash
NODE_OPTIONS='--inspect' pnpm dev
```

2. Open Chrome and navigate to `chrome://inspect`
3. Click **Open dedicated DevTools for Node** under the Remote Target section
4. Set breakpoints in any API route file (e.g., `apps/web/src/pages/api/v1/stories/index.ts`)
5. Trigger the API endpoint from the browser or via `curl` to hit the breakpoint

API route handlers are in `apps/web/src/pages/api/` and follow the Next.js Pages Router convention. Each file exports a default handler function.

### Lambda Function Debugging

Lambda functions can be tested and debugged locally using their Vitest test suites:

```bash
# Run a specific function's tests in watch mode
pnpm --filter @laila/timeout-checker test:watch
pnpm --filter @laila/dag-reconciler test:watch
pnpm --filter @laila/audit-archiver test:watch
pnpm --filter @laila/status-propagation test:watch
```

Each function's test suite mocks AWS services and the database connection, allowing you to validate handler logic without deploying to AWS.

### Lambda Debugging in Production

For production Lambda debugging, use CloudWatch Logs and X-Ray tracing.

**CloudWatch Logs:**

All Lambda functions emit structured JSON logs via the `@laila/logger` package. Log groups follow the naming convention `/aws/lambda/laila-works-{function-name}`. Each log entry includes `requestId`, `traceId` (when X-Ray is active), `msg`, and `durationMs`.

The five Lambda log groups are:

- `/aws/lambda/laila-works-nextjs`
- `/aws/lambda/laila-works-timeout-checker`
- `/aws/lambda/laila-works-dag-reconciler`
- `/aws/lambda/laila-works-audit-archiver`
- `/aws/lambda/laila-works-status-propagation`

**CloudWatch Logs Insights:**

Use CloudWatch Logs Insights to query structured log data across invocations. Navigate to **CloudWatch > Logs > Logs Insights** in the AWS Console, select the relevant log group, and run a query.

Example: find all errors in the last hour with request context:

```
fields @timestamp, requestId, msg, durationMs, statusCode, err.message
| filter @message like /error/
| sort @timestamp desc
| limit 20
```

Example: find slow requests (duration > 5 seconds) in the Next.js Lambda:

```
fields @timestamp, requestId, path, method, durationMs, statusCode
| filter durationMs > 5000
| sort durationMs desc
| limit 50
```

Example: trace a specific request across log entries:

```
fields @timestamp, msg, statusCode, durationMs, err.message
| filter requestId = "your-request-id-here"
| sort @timestamp asc
```

**X-Ray Tracing:**

Lambda functions use AWS X-Ray for distributed tracing. The `@laila/logger` package automatically extracts the X-Ray trace ID (`_X_AMZN_TRACE_ID`) from the Lambda environment and includes it in every log entry as `traceId`.

To view traces:

1. Open the **AWS X-Ray Console** (or CloudWatch > X-Ray traces)
2. Filter by service name (`laila-works-*`) or trace ID
3. Select a trace to view the request flow, including downstream calls to Neon PostgreSQL, DynamoDB, and SQS

**CloudWatch Dashboard:**

A pre-configured CloudWatch dashboard (`laila-works-production`) provides real-time visibility into:

- Lambda invocations and error rates (per function)
- Lambda duration percentiles (P50/P90/P99) for the Next.js function
- DynamoDB read/write capacity consumption
- API 4xx/5xx error rates (custom metrics via `@laila/metrics`)
- SQS queue depth and dead-letter queue messages

---

## Troubleshooting

### `pnpm install` fails with lockfile mismatch

**Symptom:** `pnpm install --frozen-lockfile` exits with an error about mismatched packages.

**Solution:** Run `pnpm install` (without `--frozen-lockfile`) to regenerate the lockfile, then commit the updated `pnpm-lock.yaml`:

```bash
pnpm install
git add pnpm-lock.yaml
git commit -m "chore: update pnpm lockfile"
```

### Database connection refused

**Symptom:** API routes return 500 errors with `connection refused` or `ECONNREFUSED` in the logs.

**Solution:**

1. Verify `DATABASE_URL` in `.env.local` is correct and uses the pooled endpoint
2. Check that your IP is allowed in the Neon project settings (Settings > IP Allow List)
3. Ensure the Neon project is not suspended -- free tier projects suspend after 5 minutes of inactivity. Open the [Neon dashboard](https://console.neon.tech) to wake the project
4. For migrations, verify `DATABASE_DIRECT_URL` uses the direct (non-pooled) endpoint

### Google OAuth redirect error

**Symptom:** After clicking "Sign in with Google", the browser shows a redirect URI mismatch error.

**Solution:**

1. Verify `BETTER_AUTH_URL` matches the authorized redirect URI configured in the Google Cloud Console
2. The redirect URI must be `{BETTER_AUTH_URL}/api/auth/callback/google`
3. For local development, set `BETTER_AUTH_URL=http://localhost:3000` and add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI in Google Console
4. Ensure the Google OAuth consent screen is configured and the app is in "Testing" mode (or published)

### Lambda cold start timeout

**Symptom:** Lambda function invocations fail with timeout errors, especially after periods of inactivity.

**Solution:**

1. Check CloudWatch Logs for the affected function (`/aws/lambda/laila-works-{function-name}`) for initialization errors
2. Verify SSM parameters exist and are accessible:
   ```bash
   aws ssm get-parameter --name "/laila-works/production/DATABASE_URL" --with-decryption
   ```
3. Check IAM role permissions -- the Lambda execution role must have `ssm:GetParameter` and `kms:Decrypt` permissions
4. Verify the `DATABASE_URL` SSM parameter value contains a valid Neon connection string
5. Check the Lambda function's memory and timeout configuration in Terraform (`infra/modules/lambda-function/`)

### Terraform state lock

**Symptom:** `terraform plan` hangs indefinitely with the message "Acquiring state lock..."

**Solution:**

This occurs when a previous Terraform operation was interrupted without releasing the DynamoDB state lock. Only force-unlock if you are certain no other deployment is running:

```bash
cd infra/environments/production
terraform force-unlock LOCK_ID
```

The `LOCK_ID` is displayed in the lock acquisition message. Verify no active deployments exist by checking the GitHub Actions workflow runs before force-unlocking.

### SQS Dead Letter Queue has messages

**Symptom:** The CloudWatch alarm `laila-works-dlq-messages` fires, indicating failed message processing.

**Solution:**

1. Check the DLQ in the SQS console for message contents:
   ```bash
   aws sqs receive-message \
     --queue-url https://sqs.us-east-1.amazonaws.com/{account-id}/laila-works-status-propagation-dlq \
     --max-number-of-messages 10
   ```
2. Inspect the message body for the original event payload and error details
3. Common causes:
   - Malformed status propagation events (missing required fields)
   - Database connection failures in the status-propagation Lambda
   - Idempotency table (`IDEMPOTENCY_TABLE_NAME`) misconfiguration
4. After fixing the root cause, replay messages from the DLQ to the main queue:
   ```bash
   aws sqs start-message-move-task \
     --source-arn arn:aws:sqs:us-east-1:{account-id}:laila-works-status-propagation-dlq \
     --destination-arn arn:aws:sqs:us-east-1:{account-id}:laila-works-status-propagation
   ```

### ESLint runs out of memory

**Symptom:** `pnpm lint` fails with `FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory`.

**Solution:**

The lint script already sets `NODE_OPTIONS='--max-old-space-size=4096'` in the root `package.json`. If you still encounter OOM errors:

1. Verify you are running lint from the repository root (not from a subdirectory)
2. Ensure workspace package type declarations are built before linting:
   ```bash
   pnpm --filter @laila/shared build:types
   pnpm --filter @laila/database build:types
   pnpm --filter @laila/logger build:types
   pnpm --filter @laila/metrics build:types
   pnpm lint
   ```
3. If the issue persists, increase the heap size:
   ```bash
   NODE_OPTIONS='--max-old-space-size=8192' npx eslint .
   ```

### TypeScript type errors after pulling new changes

**Symptom:** `pnpm typecheck` fails with errors like `Cannot find module '@laila/shared'` or `import-x/no-unresolved` after pulling changes from `main`.

**Solution:**

Shared workspace packages that use `exports` with `"types": "./dist/index.d.ts"` require a type build before consuming packages can resolve them:

```bash
pnpm install --frozen-lockfile
pnpm --filter @laila/shared build:types
pnpm --filter @laila/database build:types
pnpm --filter @laila/logger build:types
pnpm --filter @laila/metrics build:types
pnpm typecheck
```

### Health check fails after deployment

**Symptom:** The post-deploy health check (`scripts/health-check.ts`) fails after all 5 retry attempts.

**Solution:**

1. CloudFront may take a few minutes to propagate the new Lambda version. Wait 2-3 minutes and run the health check manually:
   ```bash
   HEALTH_CHECK_URL=https://laila.works npx tsx scripts/health-check.ts
   ```
2. Check the readiness endpoint directly to identify which dependency is failing:
   ```bash
   curl -s https://laila.works/api/v1/health/ready | jq .
   ```
3. The readiness check verifies database connectivity, DynamoDB availability, and SQS queue access. A failure in any subsystem will be reported in the response body
4. Check CloudWatch Logs for the `laila-works-nextjs` Lambda function for initialization errors
