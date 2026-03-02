# Configure Git Hooks

## Task Details

- **Title:** Configure Git Hooks
- **Status:** Not Started
- **Assigned Agent:** tooling-engineer
- **Parent User Story:** [Initialize pnpm Monorepo Workspace](./tasks.md)
- **Parent Epic:** [Project Setup & Monorepo Scaffold](../../user-stories.md)
- **Dependencies:** Configure ESLint Flat Config, Configure Prettier

## Description

Set up Husky v9 for Git hook management and lint-staged for running linters on staged files during pre-commit. This ensures that all code committed to the repository meets formatting, linting, and type-checking standards before it reaches the remote.

Husky v9 uses a simplified setup with a `.husky/` directory containing shell scripts for each hook. The `prepare` script in `package.json` runs `husky` to install hooks when `pnpm install` is executed.

lint-staged runs configured commands only on files that are staged for commit, making pre-commit checks fast even in a large monorepo. Each file pattern maps to an array of commands that run sequentially.

## Acceptance Criteria

- [ ] Husky v9 is installed as a root devDependency
- [ ] `prepare` script in root `package.json` runs `husky` for automatic hook installation
- [ ] `.husky/pre-commit` exists and runs lint-staged
- [ ] lint-staged is installed as a root devDependency
- [ ] lint-staged configuration exists (in `package.json` or `.lintstagedrc.mjs`)
- [ ] Staged `*.ts` and `*.tsx` files run through `prettier --write` then `eslint --fix`
- [ ] Staged `*.json`, `*.md`, `*.yaml`, `*.yml` files run through `prettier --write`
- [ ] A `tsc --noEmit` check runs as part of the pre-commit hook (either via lint-staged or as a separate hook step)
- [ ] The pre-commit hook exits with a non-zero code if any check fails, preventing the commit
- [ ] The hooks work correctly after a fresh `pnpm install` (Husky auto-setup via `prepare` script)

## Technical Notes

- Husky v9 setup: `pnpm add -D -w husky` then `pnpm exec husky init`
- The `prepare` script should be: `"prepare": "husky"`
- lint-staged config example for the pre-commit pipeline:
  ```javascript
  // .lintstagedrc.mjs
  // Run prettier first to format, then eslint to catch remaining issues
  export default {
    '*.{ts,tsx}': ['prettier --write', 'eslint --fix'],
    '*.{json,md,yaml,yml}': ['prettier --write'],
  };
  ```
- For `tsc --noEmit`, consider running it as a separate step in the pre-commit hook rather than through lint-staged, since TypeScript type-checking is project-wide and cannot run on individual files
- The `.husky/pre-commit` script should contain:
  ```sh
  pnpm exec lint-staged
  pnpm typecheck
  ```
- Be aware that `tsc --noEmit` in the pre-commit can be slow in large monorepos; teams may choose to move this to a pre-push hook or CI-only check later
- Ensure `.husky/` directory is committed to the repository

## References

- **Functional Requirements:** Code quality gates before commit
- **Design Specification:** Husky v9, lint-staged
- **Project Setup:** Git hooks configuration

## Estimated Complexity

Small — Standard Husky + lint-staged setup with well-documented patterns. The only nuance is deciding whether `tsc --noEmit` belongs in pre-commit or pre-push.
