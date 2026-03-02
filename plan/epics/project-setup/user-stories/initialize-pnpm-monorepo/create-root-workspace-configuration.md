# Create Root Workspace Configuration

## Task Details

- **Title:** Create Root Workspace Configuration
- **Status:** Not Started
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Initialize pnpm Monorepo Workspace](./tasks.md)
- **Parent Epic:** [Project Setup & Monorepo Scaffold](../../user-stories.md)
- **Dependencies:** None

## Description

Create the foundational root-level configuration files for the pnpm monorepo. This includes the root `package.json` that defines the workspace, the `pnpm-workspace.yaml` that declares workspace package locations, and the `.nvmrc` file that pins the Node.js version.

The root `package.json` should be marked as `private: true` (monorepo root is never published) and include workspace-level scripts for common operations like `dev`, `build`, `lint`, `format`, `test`, and `typecheck`. These scripts should use pnpm's recursive (`-r`) or filter (`--filter`) commands to operate across all workspace packages.

The `pnpm-workspace.yaml` must define three workspace directories:
- `apps/*` — deployable applications (Next.js web app)
- `packages/*` — shared libraries (shared, domain, database, api-spec)
- `functions/*` — AWS Lambda functions (timeout-checker, dag-reconciler, audit-archiver)

## Acceptance Criteria

- [ ] Root `package.json` exists with `"private": true` and `"packageManager": "pnpm@9.x.x"`
- [ ] Root `package.json` includes workspace scripts: `dev`, `build`, `lint`, `lint:fix`, `format`, `format:check`, `test`, `test:coverage`, `typecheck`
- [ ] `.nvmrc` exists with Node.js 22.x LTS version pinned (e.g., `22`)
- [ ] `pnpm-workspace.yaml` exists and defines `apps/*`, `packages/*`, `functions/*` as workspace directories
- [ ] Running `pnpm install` at the root succeeds without errors
- [ ] The `engines` field in `package.json` specifies `"node": ">=22.0.0"` and `"pnpm": ">=9.0.0"`

## Technical Notes

- Use pnpm v9.x — the `packageManager` field enables Corepack automatic version management
- The `scripts` section should leverage `pnpm -r run` for recursive operations and `pnpm --filter` for targeted builds
- Consider adding a `clean` script that removes all `node_modules` and `dist` directories across the workspace
- The `.nvmrc` file should contain just the major version (`22`) to allow minor/patch flexibility while ensuring the correct major version

## References

- **Functional Requirements:** Monorepo structure with pnpm workspaces
- **Design Specification:** pnpm v9.x, Node.js 22.x LTS
- **Project Setup:** Root workspace initialization

## Estimated Complexity

Small — Standard pnpm monorepo configuration with well-documented patterns. Minimal decision-making required; primarily file creation with known content.
