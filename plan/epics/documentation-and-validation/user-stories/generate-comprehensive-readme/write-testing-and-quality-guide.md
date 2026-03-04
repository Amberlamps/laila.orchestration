# Write Testing and Quality Guide

## Task Details

- **Title:** Write Testing and Quality Guide
- **Status:** Complete
- **Assigned Agent:** technical-writer
- **Parent User Story:** [Generate Comprehensive README.md](./tasks.md)
- **Parent Epic:** [Documentation & Validation](../../user-stories.md)
- **Dependencies:** None

## Description

Write the README sections covering testing, type checking, linting, and formatting. Document the test runner, coverage requirements, type checking across the monorepo, and the linting/formatting toolchain including pre-commit hooks.

### Section: Testing

```markdown
## Testing

### Run All Tests

pnpm test

### Run Tests with Coverage

pnpm test:coverage

Coverage threshold: 90% for lines, branches, functions, and statements.

### Run Tests for a Specific Package

# Run tests for a specific Lambda function

pnpm --filter @laila/timeout-checker test

# Run tests for the domain logic package

pnpm --filter @laila/domain test

# Run tests for the shared package

pnpm --filter @laila/shared test

### Watch Mode

For development, run tests in watch mode (re-runs on file changes):

pnpm --filter @laila/timeout-checker test:watch

### Test Configuration

Tests use [vitest](https://vitest.dev/) as the test runner. Configuration is in
`vitest.config.ts` at the root and in each package.

Key testing conventions:

- Test files are co-located with source: `src/__tests__/handler.test.ts`
- Use `vi.mock()` for module mocking
- Use `vi.fn()` with proper TypeScript types (never use `any` for mock types)
- Use `vi.useFakeTimers()` for time-dependent tests
```

### Section: Type Checking

```markdown
## Type Checking

### Run Type Check Across All Packages

pnpm typecheck

This runs `tsc --noEmit` in every package in the monorepo. All packages must
pass with zero type errors.

### Type Check a Specific Package

pnpm --filter @laila/timeout-checker typecheck

### TypeScript Configuration

- Strict mode is enabled in all packages
- `noUncheckedIndexedAccess` is enabled (array/object indexing returns `T | undefined`)
- The `any` type is prohibited — use `unknown` with type narrowing instead
```

### Section: Linting and Formatting

```markdown
## Linting & Formatting

### Run Linter

pnpm lint

Linting uses ESLint with the project configuration. Zero warnings and zero
errors are required.

### Run Formatter

pnpm format

Formatting uses Prettier. The `format` command fixes formatting issues in place.

### Check Formatting (Without Fixing)

pnpm format:check

Returns a non-zero exit code if any files are not formatted correctly.
Used in CI to verify formatting.

### Pre-Commit Hooks

The project uses pre-commit hooks to enforce quality:

- **Lint:** ESLint runs on staged `.ts` and `.tsx` files
- **Format:** Prettier runs on all staged files
- **Type check:** `tsc --noEmit` runs on the entire project

Hooks are managed by [husky](https://typicode.github.io/husky/) and
[lint-staged](https://github.com/lint-staged/lint-staged).
```

## Acceptance Criteria

- [ ] Testing section documents `pnpm test` and `pnpm test:coverage`
- [ ] Coverage threshold (90%) is documented
- [ ] Per-package test commands are shown with filter syntax
- [ ] Watch mode is documented for development workflow
- [ ] Test conventions are listed (co-located tests, vitest, no `any` types)
- [ ] Type checking section documents `pnpm typecheck` and per-package command
- [ ] TypeScript strict mode and key compiler options are noted
- [ ] Linting section documents `pnpm lint`
- [ ] Formatting section documents `pnpm format` and `pnpm format:check`
- [ ] Pre-commit hook behavior is documented (lint, format, typecheck)
- [ ] All commands are copy-paste ready

## Technical Notes

- The 90% coverage threshold is a minimum. Critical modules (orchestration, domain logic) should aim for higher coverage.
- The `any` type prohibition is a project convention enforced via ESLint (`@typescript-eslint/no-explicit-any`) and in code reviews. This also applies to test code.
- Pre-commit hooks are configured via husky (`.husky/pre-commit`) and lint-staged (`.lintstagedrc`).
- `pnpm typecheck` runs `tsc --noEmit` which type-checks without emitting output files. This is faster than a full build.

## References

- **vitest:** https://vitest.dev/
- **ESLint:** https://eslint.org/
- **Prettier:** https://prettier.io/
- **husky:** https://typicode.github.io/husky/
- **lint-staged:** https://github.com/lint-staged/lint-staged

## Estimated Complexity

Low — Documenting standard quality tooling commands and conventions.
