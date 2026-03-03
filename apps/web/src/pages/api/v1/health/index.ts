/**
 * Shallow health check endpoint.
 *
 * GET /api/v1/health
 *
 * Returns basic health information for load balancer probes and
 * uptime monitoring. This endpoint is public (no authentication)
 * and must respond quickly (< 100ms).
 *
 * The handler never returns 500 — even database connectivity
 * failures are reported as a field value (`database: "disconnected"`)
 * rather than an error status code.
 */

import { getDb } from '@laila/database';
import { sql } from 'drizzle-orm';

import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HealthResponse {
  status: 'healthy';
  timestamp: string;
  version: string;
  database: 'connected' | 'disconnected';
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

// ---------------------------------------------------------------------------
// Database check
// ---------------------------------------------------------------------------

/**
 * Performs a lightweight database reachability check (`SELECT 1`).
 *
 * Returns `"connected"` when the query succeeds, `"disconnected"` when
 * any error occurs. Never throws — failures are captured and reported
 * as a status string.
 */
const checkDatabase = async (): Promise<'connected' | 'disconnected'> => {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return 'connected';
  } catch {
    return 'disconnected';
  }
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse<HealthResponse | ErrorResponse>,
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

  const databaseStatus = await checkDatabase();

  res.setHeader('Cache-Control', 'no-cache');
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION ?? 'unknown',
    database: databaseStatus,
  });
};

export default handler;
