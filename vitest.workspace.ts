import { defineConfig } from 'vitest/config';

/**
 * Vitest workspace configuration for the monorepo.
 *
 * Defines test projects for each workspace package so that
 * `vitest --config vitest.workspace.ts` discovers and runs
 * tests across all packages, apps, and functions.
 *
 * Each project references its own `vitest.config.ts` which
 * specifies environment, path aliases, and other overrides.
 */
export default defineConfig({
  test: {
    projects: [
      'packages/*/vitest.config.ts',
      'apps/*/vitest.config.ts',
      'functions/*/vitest.config.ts',
    ],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
});
