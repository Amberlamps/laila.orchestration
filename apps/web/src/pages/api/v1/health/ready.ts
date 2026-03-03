/**
 * Deep readiness check endpoint.
 *
 * GET /api/v1/health/ready
 *
 * Verifies all external dependencies are reachable and functional before
 * the service accepts traffic. Used by Kubernetes-style readiness probes
 * and ALB target group health checks.
 *
 * No authentication required (public endpoint).
 *
 * Checks:
 * 1. PostgreSQL (Neon): Executes `SELECT 1` to verify the connection pool
 * 2. DynamoDB: DescribeTable on the audit log table
 * 3. SQS: GetQueueAttributes on the task queue (skipped if not configured)
 *
 * Response:
 * - 200 OK when all checks pass
 * - 503 Service Unavailable when any check fails
 * - 405 Method Not Allowed for non-GET requests
 */

import { checkDynamoDB, checkPostgresql, checkSQS, formatCheckResult } from '@/lib/health/checks';

import type { CheckResult } from '@/lib/health/checks';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    postgresql: CheckResult;
    dynamodb: CheckResult;
    sqs: CheckResult;
  };
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse<ReadinessResponse | ErrorResponse>,
): Promise<void> => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: `Method ${req.method ?? 'UNKNOWN'} not allowed`,
      },
    });
    return;
  }

  // Run all checks in parallel so a slow dependency does not block the others
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

  const allHealthy = Object.values(checks).every((check) => check.status === 'healthy');

  const statusCode = allHealthy ? 200 : 503;
  const status = allHealthy ? 'ready' : 'not_ready';

  res.setHeader('Cache-Control', 'no-cache');
  res.status(statusCode).json({
    status,
    timestamp: new Date().toISOString(),
    checks,
  });
};

export default handler;
