# Create Custom CloudWatch Metrics

## Task Details

- **Title:** Create Custom CloudWatch Metrics
- **Status:** Complete
- **Assigned Agent:** sre-engineer
- **Parent User Story:** [Configure Observability](./tasks.md)
- **Parent Epic:** [AWS Infrastructure & Deployment](../../user-stories.md)
- **Dependencies:** Setup Pino Structured Logging

## Description

Create custom CloudWatch metrics for business-level monitoring that goes beyond the standard AWS infrastructure metrics. Custom metrics track: work assignments per minute, timeout reclamations per hour, DAG reconciliation corrections and duration, and audit archival volume. These metrics are published from Lambda functions using the CloudWatch PutMetricData API.

### Metrics Client

```typescript
// packages/metrics/src/index.ts
// Custom CloudWatch metrics client for business-level monitoring.
// Provides a typed, batched interface for publishing custom metrics.

import {
  CloudWatchClient,
  PutMetricDataCommand,
  type MetricDatum,
} from '@aws-sdk/client-cloudwatch';

const client = new CloudWatchClient({});
const NAMESPACE = 'laila-works';

/**
 * Metric buffer for batching PutMetricData calls.
 * CloudWatch supports up to 1000 metric values per PutMetricData call.
 * We buffer metrics and flush at the end of each Lambda invocation.
 */
const metricBuffer: MetricDatum[] = [];

/**
 * Record a count metric.
 * Accumulates in buffer and is flushed at the end of the Lambda invocation.
 */
export function recordCount(
  metricName: string,
  value: number,
  dimensions?: Record<string, string>,
): void {
  metricBuffer.push({
    MetricName: metricName,
    Value: value,
    Unit: 'Count',
    Timestamp: new Date(),
    Dimensions: dimensions
      ? Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value }))
      : undefined,
  });
}

/**
 * Record a duration metric in milliseconds.
 */
export function recordDuration(
  metricName: string,
  durationMs: number,
  dimensions?: Record<string, string>,
): void {
  metricBuffer.push({
    MetricName: metricName,
    Value: durationMs,
    Unit: 'Milliseconds',
    Timestamp: new Date(),
    Dimensions: dimensions
      ? Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value }))
      : undefined,
  });
}

/**
 * Record a size metric in bytes.
 */
export function recordBytes(
  metricName: string,
  bytes: number,
  dimensions?: Record<string, string>,
): void {
  metricBuffer.push({
    MetricName: metricName,
    Value: bytes,
    Unit: 'Bytes',
    Timestamp: new Date(),
    Dimensions: dimensions
      ? Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value }))
      : undefined,
  });
}

/**
 * Flush all buffered metrics to CloudWatch.
 * Called at the end of each Lambda invocation.
 * Batches metrics into groups of 1000 (CloudWatch API limit).
 */
export async function flushMetrics(): Promise<void> {
  if (metricBuffer.length === 0) return;

  // Batch into groups of 1000 (max per PutMetricData call)
  const batches: MetricDatum[][] = [];
  for (let i = 0; i < metricBuffer.length; i += 1000) {
    batches.push(metricBuffer.slice(i, i + 1000));
  }

  await Promise.all(
    batches.map((batch) =>
      client.send(
        new PutMetricDataCommand({
          Namespace: NAMESPACE,
          MetricData: batch,
        }),
      ),
    ),
  );

  // Clear the buffer
  metricBuffer.length = 0;
}
```

### Custom Metrics Published

```typescript
// Usage examples in Lambda handlers:

// --- Timeout Checker ---
// After checking for timeouts:
import { recordCount, flushMetrics } from '@laila/metrics';

recordCount('TimeoutReclamations', reclaimedCount);
recordCount('StoriesChecked', checkedCount);
await flushMetrics();

// --- DAG Reconciler ---
// After reconciliation:
recordCount('ReconciliationCorrections', correctionsMade);
recordDuration('ReconciliationDuration', durationMs);
recordCount('ProjectsReconciled', projectsChecked);
await flushMetrics();

// --- Audit Archiver ---
// After archival:
recordCount('EventsArchived', eventsArchived);
recordBytes('ArchiveSize', totalSizeBytes);
recordCount('ArchivePartitions', partitions.length);
await flushMetrics();

// --- Next.js API (Work Assignment) ---
// After assignment:
recordCount('WorkAssignments', 1, { projectId: projectId });
recordCount('AssignmentType', 1, { type: response.type }); // "assigned", "blocked", "all_complete"
await flushMetrics();
```

### IAM Policy for Custom Metrics

```hcl
# Additional IAM policy for Lambda functions that publish custom metrics.
# Add to the Lambda function module's additional_policies.

resource "aws_iam_role_policy" "cloudwatch_metrics" {
  name = "${var.function_name}-cloudwatch-metrics"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "cloudwatch:PutMetricData"
      Resource = "*"
      Condition = {
        StringEquals = {
          "cloudwatch:namespace" = "laila-works"
        }
      }
    }]
  })
}
```

## Acceptance Criteria

- [ ] Metrics client package exists at `packages/metrics/`
- [ ] `recordCount()`, `recordDuration()`, and `recordBytes()` functions are available
- [ ] Metrics are buffered and flushed in a single `PutMetricData` call per invocation
- [ ] Custom namespace is `laila-works` for all custom metrics
- [ ] Dimensions are supported for per-project or per-type breakdowns
- [ ] Timeout checker publishes: TimeoutReclamations, StoriesChecked
- [ ] DAG reconciler publishes: ReconciliationCorrections, ReconciliationDuration, ProjectsReconciled
- [ ] Audit archiver publishes: EventsArchived, ArchiveSize, ArchivePartitions
- [ ] Work assignment publishes: WorkAssignments (with projectId dimension), AssignmentType
- [ ] IAM policy allows `cloudwatch:PutMetricData` only to the `laila-works` namespace
- [ ] Metrics appear in the CloudWatch console under the `laila-works` namespace
- [ ] Batching handles > 1000 metrics per invocation (split into multiple API calls)
- [ ] No `any` types are used

## Technical Notes

- **Buffering:** Metrics are buffered in memory during the Lambda invocation and flushed once at the end. This minimizes API calls (and cost). Each `PutMetricData` call supports up to 1000 metric values.
- **Cost:** CloudWatch custom metrics cost $0.30 per metric per month. With ~10 custom metrics, the monthly cost is ~$3. Dimensions create new metric streams, so be judicious with dimension cardinality (do not use user IDs or UUIDs as dimensions).
- **Namespace restriction:** The IAM policy uses a condition to restrict the function to only publish metrics in the `laila-works` namespace. This prevents accidental writes to other namespaces.
- **Dashboard integration:** The custom metrics (e.g., 4xxErrors, 5xxErrors, WorkAssignments) are referenced in the CloudWatch dashboard created in the dashboards/alarms task.

## References

- **CloudWatch Custom Metrics:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/publishingMetrics.html
- **PutMetricData API:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_PutMetricData.html
- **Cost:** https://aws.amazon.com/cloudwatch/pricing/ — $0.30 per custom metric per month

## Estimated Complexity

Medium — The metrics client is straightforward, but integrating it into all Lambda handlers and API routes requires touching multiple files across the codebase. The IAM policy condition for namespace restriction adds a nice security detail.
