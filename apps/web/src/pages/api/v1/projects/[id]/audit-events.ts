/**
 * API route for querying audit events scoped to a specific project.
 *
 * GET /api/v1/projects/:id/audit-events
 *
 * Query parameters:
 * - limit: number (default 50, max 100) -- page size
 * - cursor: string (optional) -- opaque pagination cursor from a prior response
 *
 * Returns: { events: NormalizedAuditEvent[], lastEvaluatedKey?: string }
 *
 * - Queries all entity types within the project via CrossProjectIndex GSI filtered by projectId
 * - Returns events sorted by timestamp descending (newest first)
 * - cursor is the encoded lastEvaluatedKey from the previous page
 * - Requires human auth (Google OAuth session)
 * - Returns 404 if the project does not exist
 */

import {
  createProjectRepository,
  getDb,
  queryByProject,
  type AuditEventItem,
} from '@laila/database';
import { DomainErrorCode, NotFoundError } from '@laila/shared';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/api/error-handler';
import { withValidation } from '@/lib/api/validation';
import { withAuth } from '@/lib/middleware/with-auth';

import type { AuthenticatedRequest } from '@/lib/middleware/with-auth';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Normalized audit event shape matching the cross-project endpoint.
 *
 * Maps raw DynamoDB `AuditEventItem` to the frontend-friendly shape
 * consumed by the `AuditEntry` component.
 */
interface NormalizedAuditEvent {
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * Maps a raw DynamoDB audit event item to the normalized frontend shape.
 * Derives projectName from metadata or the looked-up project entity.
 */
function mapEventItem(item: AuditEventItem, projectName: string): NormalizedAuditEvent {
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
    projectName: (item.metadata?.['projectName'] as string | undefined) ?? projectName,
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
// Validation schemas
// ---------------------------------------------------------------------------

/**
 * Validates the `id` route parameter as a UUID.
 * Next.js Pages Router puts dynamic route params into `req.query`.
 */
const paramsSchema = z.object({
  id: z.string().uuid(),
});

/**
 * Validates query string parameters for pagination.
 * limit defaults to 50, coerced from string to number.
 * cursor is optional (first page has no cursor).
 */
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

const handleGet = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: paramsSchema, query: querySchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id: projectId } = data.params;
        // Verify the project exists
        const db = getDb();
        const projectRepo = createProjectRepository(db);
        const project = await projectRepo.findById(tenantId, projectId);

        if (!project) {
          throw new NotFoundError(
            DomainErrorCode.PROJECT_NOT_FOUND,
            `Project with id ${projectId} not found`,
          );
        }

        // Build DynamoDB query options, only including defined values
        // to satisfy exactOptionalPropertyTypes
        const queryOpts: {
          tenantId: string;
          order: 'desc';
          limit?: number;
          cursor?: string;
        } = {
          tenantId,
          order: 'desc',
        };
        if (data.query.limit != null) {
          queryOpts.limit = data.query.limit;
        }
        if (data.query.cursor != null) {
          queryOpts.cursor = data.query.cursor;
        }

        // Query all audit events for this project (all entity types) via queryByProject
        const result = await queryByProject(projectId, queryOpts);

        res.status(200).json({
          events: result.events.map((item) => mapEventItem(item, project.name)),
          ...(result.cursor !== null ? { lastEvaluatedKey: result.cursor } : {}),
        });
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// Method dispatcher
// ---------------------------------------------------------------------------

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
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
