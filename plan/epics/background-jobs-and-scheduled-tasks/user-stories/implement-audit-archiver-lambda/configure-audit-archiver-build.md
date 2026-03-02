# Configure Audit Archiver Build

## Task Details

- **Title:** Configure Audit Archiver Build
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Audit Archiver Lambda](./tasks.md)
- **Parent Epic:** [Background Jobs & Scheduled Tasks](../../user-stories.md)
- **Dependencies:** Create Audit Archiver Handler

## Description

Configure the tsup build for the audit archiver Lambda function. The build produces a self-contained bundle targeting ARM64 (Graviton2) Lambda runtime, following the same patterns established by the other Lambda functions in the monorepo.

### Package Configuration

```json
// functions/audit-archiver/package.json
// Package definition for the audit archiver Lambda function.
{
  "name": "@laila/audit-archiver",
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
    "@aws-sdk/client-dynamodb": "^3.600.0",
    "@aws-sdk/lib-dynamodb": "^3.600.0",
    "@aws-sdk/client-s3": "^3.600.0",
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
// functions/audit-archiver/tsup.config.ts
// tsup build configuration for Lambda deployment.
// Same pattern as other Lambda functions.

import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/handler.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
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
// functions/audit-archiver/tsconfig.json
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

- [ ] `functions/audit-archiver/package.json` exists with correct dependencies (DynamoDB, S3, pino)
- [ ] `functions/audit-archiver/tsup.config.ts` is configured for ESM, Node.js 22, bundled output
- [ ] `functions/audit-archiver/tsconfig.json` extends the monorepo base TypeScript config
- [ ] `pnpm build` in the function directory produces a `dist/handler.js` bundle
- [ ] The bundle includes both `@aws-sdk/client-dynamodb` and `@aws-sdk/client-s3`
- [ ] Source maps are generated alongside the bundle
- [ ] The function is registered in the pnpm workspace

## Technical Notes

- This function has a slightly different dependency profile than the others: it uses `@aws-sdk/client-s3` instead of `@neondatabase/serverless` since it operates entirely on DynamoDB and S3 (no PostgreSQL access needed).
- The S3 client adds to the bundle size, but with tree-shaking enabled, only the PutObject command is included.

## References

- **Build Tool:** tsup (https://tsup.egoist.dev/)
- **Lambda Runtime:** Node.js 22.x on ARM64 (Graviton2)
- **Pattern Reference:** [Configure Timeout Checker Build](../../implement-timeout-checker-lambda/configure-timeout-checker-build.md)

## Estimated Complexity

Low — Standard tsup configuration following established patterns.
