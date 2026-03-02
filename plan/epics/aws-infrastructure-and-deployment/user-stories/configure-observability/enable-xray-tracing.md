# Enable X-Ray Tracing

## Task Details

- **Title:** Enable X-Ray Tracing
- **Status:** Not Started
- **Assigned Agent:** sre-engineer
- **Parent User Story:** [Configure Observability](./tasks.md)
- **Parent Epic:** [AWS Infrastructure & Deployment](../../user-stories.md)
- **Dependencies:** Setup Pino Structured Logging

## Description

Enable AWS X-Ray tracing on all Lambda functions for distributed request tracing. The Lambda function module already enables X-Ray at the infrastructure level (`tracing_config.mode = "Active"`). This task covers the minimal application-level instrumentation needed to propagate trace context through the AWS SDK calls and correlate traces with structured logs.

### X-Ray Instrumentation

```typescript
// packages/logger/src/xray.ts
// Minimal X-Ray instrumentation for Lambda functions.
// Leverages the AWS SDK v3 built-in X-Ray support.
// No need for the full aws-xray-sdk — the SDK auto-instruments when
// X-Ray is active on the Lambda function.

/**
 * Extract the X-Ray trace ID from the Lambda environment.
 * Lambda sets _X_AMZN_TRACE_ID on each invocation when X-Ray is active.
 *
 * Format: "Root=1-abc123-def456;Parent=ghi789;Sampled=1"
 * We extract just the Root segment for log correlation.
 */
export function extractTraceId(): string | undefined {
  const traceHeader = process.env._X_AMZN_TRACE_ID;
  if (!traceHeader) return undefined;

  // Parse the trace header to extract the Root trace ID
  const rootMatch = traceHeader.match(/Root=([^;]+)/);
  return rootMatch?.[1] ?? undefined;
}

/**
 * Get the full trace header for downstream propagation.
 * Used when making HTTP calls to other services that support X-Ray.
 */
export function getTraceHeader(): string | undefined {
  return process.env._X_AMZN_TRACE_ID ?? undefined;
}
```

### AWS SDK Auto-Instrumentation Notes

```typescript
// Note: AWS SDK v3 automatically adds X-Ray trace segments for
// DynamoDB, S3, and SQS calls when running inside a Lambda function
// with X-Ray active. No additional instrumentation code is needed.
//
// The following calls are automatically traced:
// - DynamoDB: PutItem, GetItem, Query, Scan
// - S3: PutObject, GetObject
// - SQS: SendMessage, ReceiveMessage
//
// Each SDK call appears as a subsegment in the X-Ray trace,
// showing latency, errors, and throttles for each AWS service call.

// To add custom subsegments for application logic (optional):
// import { captureFunc } from "aws-xray-sdk-core";
// This is NOT required for v1 — built-in SDK instrumentation is sufficient.
```

### Terraform Configuration

```hcl
# The Lambda function module already configures X-Ray tracing.
# This is included in infra/modules/lambda-function/main.tf:
#
# resource "aws_lambda_function" "this" {
#   ...
#   tracing_config {
#     mode = "Active"
#   }
# }
#
# And the IAM policy:
# resource "aws_iam_role_policy_attachment" "xray" {
#   role       = aws_iam_role.lambda_execution.name
#   policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
# }
#
# No additional Terraform configuration is needed for X-Ray.
# X-Ray service map and trace analysis are available in the AWS Console.
```

## Acceptance Criteria

- [ ] X-Ray trace ID extraction utility exists in `packages/logger/src/xray.ts`
- [ ] `extractTraceId()` correctly parses the Root segment from the Lambda trace header
- [ ] `getTraceHeader()` returns the full trace header for downstream propagation
- [ ] Trace ID is included in pino log entries (via `createLambdaLogger` from the logging task)
- [ ] Lambda function module has `tracing_config.mode = "Active"` (verified, already configured)
- [ ] Lambda execution role has `AWSXRayDaemonWriteAccess` policy (verified, already configured)
- [ ] AWS SDK v3 calls (DynamoDB, S3, SQS) appear as X-Ray subsegments automatically
- [ ] X-Ray service map shows connections between Lambda functions and AWS services
- [ ] No `any` types are used

## Technical Notes

- **Minimal instrumentation:** AWS SDK v3 running inside a Lambda function with X-Ray active automatically adds trace segments for all AWS API calls. This means DynamoDB queries, S3 uploads, and SQS message sends all appear in the X-Ray trace without any code changes.
- **Log correlation:** By including the X-Ray trace ID in pino log entries, operators can jump from a CloudWatch Logs entry to the corresponding X-Ray trace for end-to-end request analysis.
- **Cost:** X-Ray has a free tier of 100,000 traces per month. Beyond that, each additional trace costs $0.000005. For the expected load of laila.works, this should stay within the free tier initially.
- **Sampling:** X-Ray samples traces by default (first request each second + 5% of additional requests). This is configurable but the default is appropriate for development/initial production.

## References

- **AWS X-Ray:** https://docs.aws.amazon.com/xray/latest/devguide/
- **Lambda X-Ray Integration:** https://docs.aws.amazon.com/lambda/latest/dg/services-xray.html
- **AWS SDK v3 X-Ray:** Automatic instrumentation in Lambda runtime
- **Lambda Function Module:** [Create Lambda Function Module](../create-terraform-modules/create-lambda-function-module.md)

## Estimated Complexity

Low — X-Ray is primarily infrastructure-level (already handled by the Lambda module). The application-level work is minimal: extracting the trace ID for log correlation. AWS SDK v3 handles all the heavy lifting automatically.
