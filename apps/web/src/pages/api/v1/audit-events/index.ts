/**
 * API route for querying audit events across all projects.
 *
 * GET /api/v1/audit-events
 * Query: { limit?: number, cursor?: string }
 * Returns: { events: AuditEntryEvent[], lastEvaluatedKey?: string }
 *
 * - Queries the CrossProjectIndex GSI on the DynamoDB audit table
 * - Returns events sorted by timestamp descending (newest first)
 * - cursor is the base64url-encoded lastEvaluatedKey from the previous page
 * - Requires human auth (Google OAuth session)
 */

import { queryAll, type AuditEventItem } from '@laila/database';

import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/middleware/with-auth';

import type { AuthenticatedRequest } from '@/lib/middleware/with-auth';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape of an audit event returned by this API endpoint.
 *
 * Maps the raw DynamoDB `AuditEventItem` to the shape consumed by the
 * `AuditEntry` component on the frontend.
 */
interface AuditEntryEvent {
  eventId: string;
  entityType: string;
  entityId: string;
  entityName: string;
  action: string;
  actorType: string;
  actorId: string;
  actorName: string;
  projectId: string;
  projectName: string;
  timestamp: string;
  changes?: Record<string, { before?: unknown; after?: unknown }>;
  metadata?: Record<string, string>;
}

/** Response shape for the audit events list endpoint. */
interface AuditEventsResponse {
  events: AuditEntryEvent[];
  lastEvaluatedKey?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Parse and clamp the limit query parameter.
 */
function parseLimit(raw: string | string[] | undefined): number {
  if (typeof raw !== 'string') return DEFAULT_LIMIT;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

/**
 * Parse the cursor query parameter (must be a non-empty string).
 */
function parseCursor(raw: string | string[] | undefined): string | undefined {
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return undefined;
}

/**
 * Extracts the raw entity ID from the composite "entityType:entityId"
 * partition key format used in DynamoDB.
 */
function extractEntityId(compositeId: string): string {
  const colonIndex = compositeId.indexOf(':');
  if (colonIndex === -1) return compositeId;
  return compositeId.slice(colonIndex + 1);
}

/**
 * Maps a raw DynamoDB audit event item to the frontend-friendly shape.
 */
function mapEventItem(item: AuditEventItem): AuditEntryEvent {
  return {
    eventId: item.eventId,
    entityType: item.entityType,
    entityId: extractEntityId(item.entityId),
    entityName: item.entityName ?? '',
    action: item.action,
    actorType: item.actorType,
    actorId: item.actorId,
    actorName: item.actorName ?? '',
    projectId: item.projectId ?? '',
    projectName: (item.metadata?.['projectName'] as string | undefined) ?? '',
    timestamp: item.timestamp,
    ...(item.changes !== undefined && {
      changes: item.changes as Record<string, { before?: unknown; after?: unknown }>,
    }),
    ...(item.metadata !== undefined && {
      metadata: item.metadata as Record<string, string>,
    }),
  };
}

// ---------------------------------------------------------------------------
// GET /api/v1/audit-events
// ---------------------------------------------------------------------------

const handleList = withErrorHandler(
  withAuth('human', async (req: NextApiRequest, res: NextApiResponse) => {
    const { tenantId } = (req as AuthenticatedRequest).auth;

    const limit = parseLimit(req.query['limit']);
    const cursor = parseCursor(req.query['cursor']);

    const result = await queryAll({
      tenantId,
      limit,
      ...(cursor !== undefined && { cursor }),
      order: 'desc',
    });

    const response: AuditEventsResponse = {
      events: result.events.map(mapEventItem),
      ...(result.cursor !== null && { lastEvaluatedKey: result.cursor }),
    };

    res.status(200).json(response);
  }),
);

// ---------------------------------------------------------------------------
// Method dispatcher
// ---------------------------------------------------------------------------

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  switch (req.method) {
    case 'GET':
      return handleList(req, res);
    default:
      res.setHeader('Allow', 'GET');
      res.status(405).json({
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: `Method ${req.method ?? 'UNKNOWN'} not allowed`,
        },
      });
  }
};

export default handler;
