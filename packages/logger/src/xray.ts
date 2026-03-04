/**
 * Minimal X-Ray instrumentation for Lambda functions.
 * Leverages the AWS SDK v3 built-in X-Ray support.
 * No need for the full aws-xray-sdk — the SDK auto-instruments when
 * X-Ray is active on the Lambda function.
 */

/**
 * Extract the X-Ray trace ID from the Lambda environment.
 * Lambda sets _X_AMZN_TRACE_ID on each invocation when X-Ray is active.
 *
 * Format: "Root=1-abc123-def456;Parent=ghi789;Sampled=1"
 * We extract just the Root segment for log correlation.
 */
export const extractTraceId = (): string | undefined => {
  const traceHeader = process.env['_X_AMZN_TRACE_ID'];
  if (!traceHeader) return undefined;

  // Parse the trace header to extract the Root trace ID
  const rootMatch = traceHeader.match(/Root=([^;]+)/);
  return rootMatch?.[1] ?? undefined;
};

/**
 * Get the full trace header for downstream propagation.
 * Used when making HTTP calls to other services that support X-Ray.
 */
export const getTraceHeader = (): string | undefined => {
  return process.env['_X_AMZN_TRACE_ID'] ?? undefined;
};
