# Configure SQS Consumer Build

## Task Details

- **Title:** Configure SQS Consumer Build
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement SQS Status Propagation Consumer](./tasks.md)
- **Parent Epic:** [Background Jobs & Scheduled Tasks](../../user-stories.md)
- **Dependencies:** Create Status Propagation Handler

## Description

Configure the tsup build for the SQS status propagation consumer Lambda function. In addition to the standard build configuration, this task documents the SQS event source mapping requirements including DLQ configuration, retry policy, and batch settings that must be configured in Terraform (Epic 14).

### Package Configuration

```json
// functions/status-propagation/package.json
// Package definition for the SQS status propagation consumer.
{
  "name": "@laila/status-propagation",
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
// functions/status-propagation/tsup.config.ts
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
// functions/status-propagation/tsconfig.json
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

### SQS Event Source Configuration Notes

The following settings must be configured in the Terraform module (Epic 14) for the SQS event source mapping:

```hcl
# Terraform configuration reference (implemented in Epic 14).
# Documented here for the Lambda function developer's awareness.

# SQS Queue Configuration:
# - Standard queue (not FIFO — ordering is not required)
# - Visibility timeout: 6x Lambda timeout (e.g., 6 * 30s = 180s)
# - Message retention: 4 days (345600 seconds)
# - Receive message wait time: 20 seconds (long polling)

# Dead Letter Queue (DLQ):
# - maxReceiveCount: 3 (messages retried 3 times before DLQ)
# - DLQ message retention: 14 days (for investigation)

# Lambda Event Source Mapping:
# - batch_size: 10 (process up to 10 messages per invocation)
# - maximum_batching_window_in_seconds: 5
# - function_response_types: ["ReportBatchItemFailures"]
#   ^ Critical: enables partial batch failure reporting
```

## Acceptance Criteria

- [ ] `functions/status-propagation/package.json` exists with correct dependencies
- [ ] `functions/status-propagation/tsup.config.ts` is configured for ESM, Node.js 22, bundled output
- [ ] `functions/status-propagation/tsconfig.json` extends the monorepo base TypeScript config
- [ ] `pnpm build` produces a `dist/handler.js` bundle
- [ ] The bundle is self-contained
- [ ] Source maps are generated
- [ ] The function is registered in the pnpm workspace
- [ ] SQS event source configuration requirements are documented for Terraform (Epic 14)
- [ ] DLQ configuration (3 retries) is documented
- [ ] Message retention (4 days) is documented
- [ ] Partial batch failure response type is documented as a requirement

## Technical Notes

- The `@types/aws-lambda` package provides the `SQSEvent`, `SQSBatchResponse`, and `SQSBatchItemFailure` types used by the handler. These types are only needed at compile time (devDependency).
- The `function_response_types: ["ReportBatchItemFailures"]` setting in the Lambda event source mapping is critical. Without it, Lambda treats the entire batch as failed if the handler throws, causing all messages to be retried even if some were processed successfully.
- Visibility timeout must be set to at least 6x the Lambda function timeout to prevent messages from becoming visible again while still being processed.

## References

- **Build Tool:** tsup (https://tsup.egoist.dev/)
- **Lambda Runtime:** Node.js 22.x on ARM64 (Graviton2)
- **SQS Lambda Integration:** https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html
- **Partial Batch Response:** https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html#services-sqs-batchfailurereporting
- **Infrastructure:** [Create SQS Queue Module](../../../aws-infrastructure-and-deployment/user-stories/create-terraform-modules/create-sqs-queue-module.md) (Epic 14)

## Estimated Complexity

Low — Standard build configuration with additional documentation of SQS-specific requirements for the Terraform engineer.
