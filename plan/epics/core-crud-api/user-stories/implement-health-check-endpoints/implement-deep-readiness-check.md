# Implement Deep Readiness Check

## Task Details

- **Title:** Implement Deep Readiness Check
- **Status:** Not Started
- **Assigned Agent:** sre-engineer
- **Parent User Story:** [Implement Health Check Endpoints](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** None

## Description

Implement a deep readiness check endpoint that verifies all external dependencies are reachable and functional. This is used by Kubernetes-style readiness probes and load balancers to determine if the service is ready to accept traffic. Unlike the shallow health check, this endpoint returns 503 Service Unavailable if any critical dependency is failing.

### Route Definition

```typescript
// pages/api/v1/health/ready.ts
// Deep readiness check endpoint.
// No authentication required (public endpoint).
// Checks all external dependencies: PostgreSQL, DynamoDB, SQS.

import type { NextApiRequest, NextApiResponse } from "next";

/**
 * GET /api/v1/health/ready
 *
 * Checks:
 * 1. PostgreSQL (Neon): Execute a real query (SELECT count(*) FROM projects)
 * 2. DynamoDB: DescribeTable on the audit log table
 * 3. SQS: GetQueueAttributes on the task queue (if SQS is configured)
 *
 * Response: 200 OK (all checks pass) or 503 Service Unavailable (any check fails)
 *
 * Success response:
 * {
 *   status: "ready",
 *   timestamp: "2026-03-02T12:00:00.000Z",
 *   checks: {
 *     postgresql: { status: "healthy", latency_ms: 12 },
 *     dynamodb: { status: "healthy", latency_ms: 45 },
 *     sqs: { status: "healthy", latency_ms: 23 }
 *   }
 * }
 *
 * Failure response (503):
 * {
 *   status: "not_ready",
 *   timestamp: "2026-03-02T12:00:00.000Z",
 *   checks: {
 *     postgresql: { status: "healthy", latency_ms: 12 },
 *     dynamodb: { status: "unhealthy", error: "Connection timeout" },
 *     sqs: { status: "healthy", latency_ms: 23 }
 *   }
 * }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  // Run all checks in parallel for speed
  const [pgCheck, dynamoCheck, sqsCheck] = await Promise.allSettled([
    checkPostgresql(),
    checkDynamoDB(),
    checkSQS(),
  ]);

  const checks = {
    postgresql: formatCheckResult(pgCheck),
    dynamodb: formatCheckResult(dynamoCheck),
    sqs: formatCheckResult(sqsCheck),
  };

  const allHealthy = Object.values(checks).every(
    (check) => check.status === "healthy"
  );

  const statusCode = allHealthy ? 200 : 503;
  const status = allHealthy ? "ready" : "not_ready";

  res.setHeader("Cache-Control", "no-cache");
  return res.status(statusCode).json({
    status,
    timestamp: new Date().toISOString(),
    checks,
  });
}
```

### Check Functions

```typescript
// apps/web/src/lib/health/checks.ts
// Individual health check functions for each external dependency.
// Each function returns a latency measurement on success or throws on failure.

/**
 * Check PostgreSQL (Neon) connectivity.
 * Executes a lightweight query that touches a real table
 * to verify the connection pool and database are functional.
 */
async function checkPostgresql(): Promise<{ latency_ms: number }> {
  const start = performance.now();
  await db.execute(sql`SELECT 1`);
  return { latency_ms: Math.round(performance.now() - start) };
}

/**
 * Check DynamoDB connectivity.
 * Calls DescribeTable on the audit log table to verify
 * IAM credentials and table availability.
 */
async function checkDynamoDB(): Promise<{ latency_ms: number }> {
  const start = performance.now();
  await dynamoClient.send(
    new DescribeTableCommand({ TableName: AUDIT_TABLE_NAME })
  );
  return { latency_ms: Math.round(performance.now() - start) };
}

/**
 * Check SQS connectivity (if configured).
 * Calls GetQueueAttributes to verify queue availability.
 * Returns healthy with a note if SQS is not configured.
 */
async function checkSQS(): Promise<{ latency_ms: number }> {
  if (!process.env.SQS_QUEUE_URL) {
    return { latency_ms: 0 }; // SQS not configured (local dev)
  }
  const start = performance.now();
  await sqsClient.send(
    new GetQueueAttributesCommand({
      QueueUrl: process.env.SQS_QUEUE_URL,
      AttributeNames: ["ApproximateNumberOfMessages"],
    })
  );
  return { latency_ms: Math.round(performance.now() - start) };
}
```

## Acceptance Criteria

- [ ] `GET /api/v1/health/ready` returns 200 when all checks pass
- [ ] `GET /api/v1/health/ready` returns 503 when any check fails
- [ ] Response includes individual check results with status and latency
- [ ] Failed checks include an error message (but not stack traces)
- [ ] All checks run in parallel using `Promise.allSettled`
- [ ] PostgreSQL check executes a real query
- [ ] DynamoDB check uses DescribeTable API
- [ ] SQS check uses GetQueueAttributes API (or skipped if not configured)
- [ ] No authentication is required (public endpoint)
- [ ] Response includes `Cache-Control: no-cache` header
- [ ] Non-GET methods return 405 Method Not Allowed
- [ ] Individual check timeouts prevent the entire endpoint from hanging (max 5s per check)
- [ ] No `any` types are used in the implementation

## Technical Notes

- Use `Promise.allSettled` instead of `Promise.all` so that a failure in one check does not prevent reporting on the others. Each check result is independently processed.
- Each check function should have an internal timeout (5 seconds) to prevent a hanging dependency from blocking the readiness check indefinitely. Use `Promise.race` with a timeout promise.
- The DynamoDB check uses `DescribeTable` because it is a read-only API call that verifies both IAM credentials and table existence without reading any data.
- When SQS is not configured (e.g., local development), the SQS check should return healthy with a note that it was skipped, rather than failing.
- Consider adding a `GET /api/v1/health/live` endpoint (liveness probe) that just returns 200 without any checks, for Kubernetes liveness probes that should only restart the pod if the process is stuck.

## References

- **Functional Requirements:** FR-HEALTH-002 (deep readiness check)
- **Design Specification:** Section 8.2 (Readiness Check Endpoint)
- **Infrastructure:** AWS ALB target group health checks, SQS queue configuration, DynamoDB table configuration
- **AWS SDK:** @aws-sdk/client-dynamodb (DescribeTableCommand), @aws-sdk/client-sqs (GetQueueAttributesCommand)

## Estimated Complexity

Medium — The parallel check execution, per-check timeouts, and graceful degradation (SQS optional) add complexity beyond a simple endpoint. The AWS SDK integration for DynamoDB and SQS checks requires proper configuration.
