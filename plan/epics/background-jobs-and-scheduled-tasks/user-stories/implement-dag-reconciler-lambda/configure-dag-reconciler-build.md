# Configure DAG Reconciler Build

## Task Details

- **Title:** Configure DAG Reconciler Build
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement DAG Reconciler Lambda](./tasks.md)
- **Parent Epic:** [Background Jobs & Scheduled Tasks](../../user-stories.md)
- **Dependencies:** Create DAG Reconciler Handler

## Description

Configure the tsup build for the DAG reconciler Lambda function. The build must produce a self-contained bundle targeting ARM64 (Graviton2) Lambda runtime, following the same patterns established by the timeout checker function.

### Package Configuration

```json
// functions/dag-reconciler/package.json
// Package definition for the DAG reconciler Lambda function.
{
  "name": "@laila/dag-reconciler",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@neondatabase/serverless": "^0.10.0",
    "drizzle-orm": "^0.35.0",
    "@aws-sdk/client-dynamodb": "^3.600.0",
    "@aws-sdk/lib-dynamodb": "^3.600.0",
    "pino": "^9.0.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@types/aws-lambda": "^8.10.0"
  }
}
```

### tsup Configuration

```typescript
// functions/dag-reconciler/tsup.config.ts
// tsup build configuration for Lambda deployment.
// Same pattern as timeout-checker: single ESM bundle, Node.js 22, ARM64.

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/handler.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  bundle: true,
  treeshake: true,
  sourcemap: true,
  minify: true,
  external: [],
});
```

### TypeScript Configuration

```json
// functions/dag-reconciler/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

## Acceptance Criteria

- [ ] `functions/dag-reconciler/package.json` exists with correct dependencies and scripts
- [ ] `functions/dag-reconciler/tsup.config.ts` is configured for ESM, Node.js 22, bundled output
- [ ] `functions/dag-reconciler/tsconfig.json` extends the monorepo base TypeScript config
- [ ] `pnpm build` in the function directory produces a `dist/handler.js` bundle
- [ ] The bundle is self-contained (no external `node_modules` required at runtime)
- [ ] Source maps are generated alongside the bundle
- [ ] The bundle is tree-shaken and minified
- [ ] The function is registered in the pnpm workspace

## Technical Notes

- The DAG reconciler may produce a larger bundle than the timeout checker due to the graph traversal logic, but should still be well under the Lambda 50MB deployment limit.
- Build configuration is intentionally identical to the timeout checker to maintain consistency across all Lambda functions in the monorepo.

## References

- **Build Tool:** tsup (https://tsup.egoist.dev/)
- **Lambda Runtime:** Node.js 22.x on ARM64 (Graviton2)
- **Pattern Reference:** [Configure Timeout Checker Build](../../implement-timeout-checker-lambda/configure-timeout-checker-build.md)

## Estimated Complexity

Low — Follows the established build pattern from the timeout checker function.
