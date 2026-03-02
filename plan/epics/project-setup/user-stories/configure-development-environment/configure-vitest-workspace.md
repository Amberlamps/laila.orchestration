# Configure Vitest Workspace

## Task Details

- **Title:** Configure Vitest Workspace
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Configure Development Environment](./tasks.md)
- **Parent Epic:** [Project Setup & Monorepo Scaffold](../../user-stories.md)
- **Dependencies:** None (within this user story; logically depends on Scaffold Workspace Packages)

## Description

Set up Vitest as the test runner for the entire monorepo using the workspace configuration feature. Vitest's workspace mode allows running tests across all packages from a single command while respecting each package's individual configuration needs (e.g., different environments for Node.js packages vs. React components).

The configuration should include:
- A root `vitest.workspace.ts` that discovers test configurations across all workspace packages
- Coverage reporting via `@vitest/coverage-v8` (V8-based code coverage, faster than Istanbul)
- Shared test utilities and setup files
- Proper TypeScript path resolution for workspace package imports in tests

## Acceptance Criteria

- [ ] `vitest` and `@vitest/coverage-v8` are installed as root devDependencies
- [ ] `vitest.workspace.ts` exists at the monorepo root defining test projects for each workspace package
- [ ] Each workspace package that will have tests has a `vitest.config.ts` (or is covered by the workspace config)
- [ ] `pnpm test` runs all tests across the monorepo
- [ ] `pnpm test:coverage` runs tests with V8 code coverage collection
- [ ] Coverage output directory is configured (e.g., `coverage/`) and added to `.gitignore`
- [ ] Coverage thresholds are configured (lines: 80%, branches: 80%, functions: 80%, statements: 80%)
- [ ] Test file patterns are configured: `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts`
- [ ] Node.js environment is the default for non-React packages
- [ ] React packages (apps/web) are configured with `jsdom` or `happy-dom` environment
- [ ] TypeScript path aliases resolve correctly in test files
- [ ] `@vitest/coverage-v8` generates reports in `lcov` and `text` formats

## Technical Notes

- Vitest workspace configuration:
  ```typescript
  // vitest.workspace.ts
  // Configures Vitest to discover and run tests across all monorepo packages
  // Each package can override settings via its own vitest.config.ts
  import { defineWorkspace } from 'vitest/config';

  export default defineWorkspace([
    'packages/*/vitest.config.ts',
    'apps/*/vitest.config.ts',
    'functions/*/vitest.config.ts',
  ]);
  ```
- For packages without their own `vitest.config.ts`, consider using a glob pattern or inline configuration in the workspace file
- Coverage configuration in the root `vitest.config.ts` (or individual configs):
  ```typescript
  // vitest.config.ts for a package
  // Configures test environment and coverage settings
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    test: {
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
        thresholds: {
          lines: 80,
          branches: 80,
          functions: 80,
          statements: 80,
        },
      },
    },
  });
  ```
- Use `resolve.alias` in Vitest config to map workspace package paths (e.g., `@laila/shared` to the actual source directory)
- Consider creating a `test/setup.ts` for global test setup (e.g., custom matchers, environment cleanup)
- Vitest supports `pool: 'forks'` for better isolation or `pool: 'threads'` for better performance — choose based on test characteristics
- Never use the `any` type in test files — leverage Vitest's built-in type utilities and proper typing

## References

- **Functional Requirements:** Automated testing across all packages
- **Design Specification:** Vitest, @vitest/coverage-v8
- **Project Setup:** Test runner configuration

## Estimated Complexity

Medium — Vitest workspace configuration requires understanding of how each package's tests should run (different environments, path resolution) and proper coverage configuration across a monorepo.
