import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@laila/shared',
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    passWithNoTests: true,
  },
});
