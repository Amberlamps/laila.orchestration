# Scaffold Lambda Functions

## Task Details

- **Title:** Scaffold Lambda Functions
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Scaffold Workspace Packages](./tasks.md)
- **Parent Epic:** [Project Setup & Monorepo Scaffold](../../user-stories.md)
- **Dependencies:** None (within this user story)

## Description

Create stub workspace packages for the three AWS Lambda functions that run as background processes in the orchestration service:

1. **`functions/timeout-checker`** — Periodically checks for stale work assignments that have exceeded their timeout threshold and transitions them back to an assignable state.
2. **`functions/dag-reconciler`** — Periodically validates the DAG consistency, reconciles derived statuses, and unblocks tasks whose dependencies have been completed.
3. **`functions/audit-archiver`** — Periodically archives old audit log entries from DynamoDB to S3 for long-term storage and cost optimization.

Each function follows the same structure: a `src/handler.ts` with the Lambda handler signature, a `package.json` with workspace dependencies, and a `tsconfig.json` extending the root base.

## Acceptance Criteria

- [ ] `functions/timeout-checker/package.json` exists with name `@laila/timeout-checker`
- [ ] `functions/dag-reconciler/package.json` exists with name `@laila/dag-reconciler`
- [ ] `functions/audit-archiver/package.json` exists with name `@laila/audit-archiver`
- [ ] Each function has `@laila/shared` and `@laila/database` as workspace dependencies
- [ ] Each function has `@types/aws-lambda` as a dev dependency
- [ ] Each function has `tsconfig.json` extending `../../tsconfig.base.json` with Lambda-appropriate settings
- [ ] Each function has `src/handler.ts` with a typed Lambda handler stub:
  - Exports a `handler` function with proper AWS Lambda typing (`ScheduledEvent` for EventBridge triggers)
  - Includes a descriptive code comment explaining the function's purpose
  - Returns a success response placeholder
- [ ] Each function compiles with `tsc --noEmit` without errors
- [ ] Each function's `package.json` includes a `build` script for bundling (esbuild or similar)

## Technical Notes

- All three functions are triggered by Amazon EventBridge scheduled rules (cron-like), so they receive `ScheduledEvent` payloads
- Lambda handler signature pattern:

  ```typescript
  // src/handler.ts
  // Lambda handler for the timeout-checker function
  // Triggered by EventBridge on a schedule to detect stale work assignments
  import type { ScheduledEvent, Context } from 'aws-lambda';

  export const handler = async (event: ScheduledEvent, context: Context): Promise<void> => {
    // Implementation placeholder
    // Will query for work assignments exceeding timeout thresholds
    console.log('timeout-checker invoked', { requestId: context.awsRequestId });
  };
  ```

- Each function should be independently deployable — they have their own `package.json` and build process
- For Lambda bundling, prefer `esbuild` for fast builds and small bundle sizes; the build script should output to a `dist/` directory
- Lambda functions will use the `@neondatabase/serverless` driver (via `@laila/database`) for database access, which is optimized for short-lived serverless connections
- The `tsconfig.json` for Lambda functions should set `target: "ES2022"` and `module: "ESNext"` (esbuild handles the final module format)
- Consider adding a shared `functions/tsconfig.functions.json` that all Lambda tsconfigs extend, to avoid duplication

## References

- **Functional Requirements:** Background processing (timeout detection, DAG reconciliation, audit archiving)
- **Design Specification:** AWS Lambda, EventBridge scheduled triggers
- **Project Setup:** Lambda function scaffolding

## Estimated Complexity

Small — Three nearly identical stub packages with minor naming differences. The pattern is repeated, and the actual handler logic is implemented in later epics.
