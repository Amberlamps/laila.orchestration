# Configure Timeout Checker Build

## Task Details

- **Title:** Configure Timeout Checker Build
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Timeout Checker Lambda](./tasks.md)
- **Parent Epic:** [Background Jobs & Scheduled Tasks](../../user-stories.md)
- **Dependencies:** Create Timeout Checker Handler

## Description

Configure the tsup build for the timeout checker Lambda function. The build must produce a self-contained bundle targeting ARM64 (Graviton2) Lambda runtime, with all dependencies bundled and tree-shaken for optimal cold start performance.

### Package Configuration

```json
// functions/timeout-checker/package.json
// Package definition for the timeout checker Lambda function.
// Uses tsup for bundling with esbuild under the hood.
{
  "name": "@laila/timeout-checker",
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
// functions/timeout-checker/tsup.config.ts
// tsup build configuration for Lambda deployment.
// Produces a single ESM bundle with all dependencies inlined.
// Target: Node.js 22.x on ARM64 (Graviton2).

import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/handler.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  // Bundle all dependencies into a single file for Lambda deployment.
  // This eliminates the need for node_modules in the deployment package.
  bundle: true,
  // Tree-shake unused code for smaller bundle size and faster cold starts.
  treeshake: true,
  // Source maps for debugging in CloudWatch/X-Ray.
  sourcemap: true,
  // Minify for smaller deployment package.
  minify: true,
  // External: aws-sdk v3 is available in Lambda runtime,
  // but we bundle it anyway for version consistency.
  external: [],
});
```

### TypeScript Configuration

```json
// functions/timeout-checker/tsconfig.json
// TypeScript configuration for the timeout checker Lambda.
// Extends the monorepo base config with Lambda-specific settings.
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

- [ ] `functions/timeout-checker/package.json` exists with correct dependencies and scripts
- [ ] `functions/timeout-checker/tsup.config.ts` is configured for ESM, Node.js 22, bundled output
- [ ] `functions/timeout-checker/tsconfig.json` extends the monorepo base TypeScript config
- [ ] `pnpm build` in the function directory produces a `dist/handler.js` bundle
- [ ] The bundle is self-contained (no external `node_modules` required at runtime)
- [ ] Source maps are generated alongside the bundle
- [ ] The bundle is tree-shaken and minified for optimal Lambda cold start
- [ ] The function is registered in the pnpm workspace (`pnpm-workspace.yaml`)
- [ ] TypeScript strict mode is enabled with `noUncheckedIndexedAccess`

## Technical Notes

- The AWS SDK v3 is available in the Lambda runtime, but bundling it ensures version consistency and avoids surprises from Lambda runtime updates. The trade-off is a slightly larger bundle (~2-3MB) but guaranteed behavior.
- The `node22` target in tsup corresponds to the Node.js 22.x Lambda runtime. This allows using modern JS features (top-level await, structured clone, etc.) without transpilation.
- Source maps are critical for debugging Lambda errors in CloudWatch. Without them, stack traces reference minified code positions.
- The `clean: true` option ensures the dist directory is wiped before each build, preventing stale artifacts.

## References

- **Build Tool:** tsup (https://tsup.egoist.dev/) — esbuild-based TypeScript bundler
- **Lambda Runtime:** Node.js 22.x on ARM64 (Graviton2)
- **Monorepo:** pnpm workspace configuration

## Estimated Complexity

Low — Standard tsup configuration following established patterns. The main consideration is ensuring all dependencies are correctly bundled and the output is compatible with the Lambda runtime.
