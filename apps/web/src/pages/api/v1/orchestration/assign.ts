/**
 * API route for work assignment orchestration.
 *
 * POST /api/v1/orchestration/assign
 *
 * This is the primary endpoint that AI workers call to request work. It
 * authenticates via API key, evaluates eligibility rules from the domain
 * logic engine, selects the best available story, and returns a typed
 * discriminated union response.
 *
 * SAFETY-CRITICAL: This endpoint is the heart of the orchestration system.
 * Every design decision prioritizes correctness over performance.
 *
 * Orchestration flow:
 *   1. Authenticate worker via API key (withAuth middleware)
 *   2. Validate request body (withValidation middleware)
 *   3. Verify project exists and worker has access
 *   4. Open a single database transaction for the entire assignment flow
 *   5. Check if worker already has an assigned story in this project
 *   6. Load project state (epics, stories, task graph)
 *   7. Call domain eligibility rules to find eligible stories
 *   8. If no eligible stories and all complete: return "all_complete"
 *   9. If no eligible stories but some blocked: return "blocked"
 *  10. Select the best story (highest priority, topological order, oldest)
 *  11. Atomically assign the story (optimistic locking — within same tx)
 *  12. Build the full response with tasks and recommended order (within same tx)
 *  13. Return "assigned" response
 *
 * Steps 5-12 run inside a single database transaction so the eligibility
 * reads, assignment writes, and response-building reads all see a
 * consistent snapshot of the data.
 *
 * Uses the standard middleware composition:
 *   withErrorHandler > withAuth > withValidation > handler
 */

import {
  getDb,
  createProjectRepository,
  createStoryRepository,
  createEpicRepository,
  writeAuditEventFireAndForget,
  type DrizzleDb,
  type Database,
} from '@laila/database';
import { evaluateEligibility, selectStoryForAssignment } from '@laila/domain';
import { recordCount, flushMetrics } from '@laila/metrics';
import {
  assignRequestSchema,
  NotFoundError,
  AuthorizationError,
  ConflictError,
  DomainErrorCode,
} from '@laila/shared';

import { withErrorHandler } from '@/lib/api/error-handler';
import { withLogging } from '@/lib/api/logging-middleware';
import { withValidation } from '@/lib/api/validation';
import { withAuth } from '@/lib/middleware/with-auth';
import { atomicAssignStory } from '@/lib/orchestration/atomic-assignment';
import {
  buildAssignedResponse,
  buildBlockedResponse,
  buildAllCompleteResponse,
  mapStoryStatusToDomain,
  mapEpicStatusToDomain,
  DEFAULT_RETRY_AFTER_SECONDS,
} from '@/lib/orchestration/response-builder';

import type { AuthenticatedRequest } from '@/lib/middleware/with-auth';
import type { StoryRecord } from '@/lib/orchestration/response-builder';
import type { StoryEligibilityInfo, EpicInfo, ProjectInfo } from '@laila/domain';
import type { AssignResponse, BlockingStoryInfo } from '@laila/shared';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Suggested minimum polling interval (seconds).
 * Set as the Retry-After header on all responses.
 */
const MIN_POLLING_INTERVAL_SECONDS = 5;

// ---------------------------------------------------------------------------
// Transaction result type
// ---------------------------------------------------------------------------

/**
 * The result returned from the transactional assignment flow.
 * The handler uses this to send the HTTP response after the
 * transaction commits.
 */
interface AssignmentFlowResult {
  response: AssignResponse;
  retryAfterSeconds: number;
}

// ---------------------------------------------------------------------------
// POST /api/v1/orchestration/assign -- Work assignment endpoint
// ---------------------------------------------------------------------------

/**
 * Handles the work assignment request for a worker.
 *
 * Orchestrates the full assignment flow: project verification, access check,
 * then wraps eligibility evaluation, story selection, atomic assignment, and
 * response building in a single database transaction.
 */
const handleAssign = withErrorHandler(
  withAuth(
    'agent',
    withValidation({ body: assignRequestSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const auth = (req as AuthenticatedRequest).auth;

        if (auth.type !== 'agent') {
          throw new AuthorizationError(
            DomainErrorCode.INSUFFICIENT_PERMISSIONS,
            'This endpoint requires worker authentication',
          );
        }

        const { tenantId, workerId, workerName, projectAccess } = auth;
        const { project_id: projectId } = data.body;

        const db = getDb();
        const projectRepo = createProjectRepository(db);

        // -----------------------------------------------------------------
        // Pre-transaction guards (fast checks that don't need tx isolation)
        // -----------------------------------------------------------------

        // Step 1: Verify the project exists
        const projectRecord = await projectRepo.findById(tenantId, projectId);
        if (!projectRecord) {
          throw new NotFoundError(
            DomainErrorCode.PROJECT_NOT_FOUND,
            `Project with id ${projectId} not found`,
          );
        }

        // Step 2: Verify worker has access to the project
        if (!projectAccess.includes(projectId)) {
          throw new AuthorizationError(
            DomainErrorCode.PROJECT_ACCESS_DENIED,
            `Worker ${workerId} does not have access to project ${projectId}`,
          );
        }

        // Step 3: Verify project lifecycle status allows assignment
        if (
          projectRecord.lifecycleStatus !== 'ready' &&
          projectRecord.lifecycleStatus !== 'in-progress'
        ) {
          throw new ConflictError(
            DomainErrorCode.INVALID_STATUS_TRANSITION,
            `Project is in "${String(projectRecord.lifecycleStatus)}" status. ` +
              'Work assignment requires the project to be in "ready" or "in-progress" status.',
          );
        }

        // -----------------------------------------------------------------
        // Single transaction: eligibility reads → assignment → response reads
        // -----------------------------------------------------------------
        const typedDb = db as unknown as DrizzleDb;

        const result: AssignmentFlowResult = await typedDb.transaction(async (tx: DrizzleDb) => {
          // Create repositories bound to this transaction so all queries
          // see a consistent snapshot.
          const txDb = tx as unknown as Database;
          const txStoryRepo = createStoryRepository(txDb);
          const txEpicRepo = createEpicRepository(txDb);

          // -------------------------------------------------------------
          // Step 4: Check if worker already has an assigned story
          // (one-story-per-worker-per-project constraint)
          // -------------------------------------------------------------
          const activeStories = await txStoryRepo.findActiveByProject(tenantId, projectId);
          const existingAssignment = activeStories.find(
            (s) => s.assignedWorkerId === workerId && s.workStatus === 'in_progress',
          );

          if (existingAssignment) {
            const existingStory = existingAssignment as unknown as StoryRecord;
            const storyDetail = await buildAssignedResponse(
              txDb,
              tenantId,
              existingStory.id,
              projectId,
            );

            return {
              response: { type: 'assigned' as const, story: storyDetail },
              retryAfterSeconds: MIN_POLLING_INTERVAL_SECONDS,
            };
          }

          // -------------------------------------------------------------
          // Step 5: Load project state for eligibility evaluation
          // -------------------------------------------------------------
          const epics = await txEpicRepo.findAllByProject(tenantId, projectId);

          const allStories: StoryRecord[] = [];
          for (const epic of epics) {
            const epicStories = await txStoryRepo.findAllByEpic(tenantId, epic.id);
            for (const storyRow of epicStories) {
              allStories.push(storyRow as unknown as StoryRecord);
            }
          }

          // -------------------------------------------------------------
          // Step 6: Check cross-story dependencies for each story
          // -------------------------------------------------------------
          const crossStoryDepsSatisfied = new Map<string, boolean>();
          for (const story of allStories) {
            if (mapStoryStatusToDomain(story.workStatus) === 'not-started') {
              const hasIncompleteDeps = await txStoryRepo.hasIncompleteUpstreamDependencies(
                tenantId,
                story.id,
              );
              crossStoryDepsSatisfied.set(story.id, !hasIncompleteDeps);
            } else {
              crossStoryDepsSatisfied.set(story.id, true);
            }
          }

          // -------------------------------------------------------------
          // Step 7: Build domain model inputs and evaluate eligibility
          // -------------------------------------------------------------
          const projectInfo: ProjectInfo = {
            id: projectId,
            status: projectRecord.lifecycleStatus as 'draft' | 'ready' | 'in-progress' | 'complete',
          };

          const epicInfoMap = new Map<string, EpicInfo>();
          for (const epic of epics) {
            epicInfoMap.set(epic.id, {
              id: epic.id,
              status: mapEpicStatusToDomain(epic.workStatus),
            });
          }

          const storyEligibilityInfos: StoryEligibilityInfo[] = allStories.map((story) => ({
            id: story.id,
            status: mapStoryStatusToDomain(story.workStatus),
            epicId: story.epicId,
            crossStoryDepsSatisfied: crossStoryDepsSatisfied.get(story.id) ?? false,
          }));

          const eligibilityResults = evaluateEligibility(
            storyEligibilityInfos,
            epicInfoMap,
            projectInfo,
          );

          const eligibleResults = eligibilityResults.filter((r) => r.eligible);
          const eligibleStoryIds = eligibleResults.map((r) => r.storyId);

          // -------------------------------------------------------------
          // Step 8: Handle no eligible stories
          // -------------------------------------------------------------
          if (eligibleStoryIds.length === 0) {
            const terminalStatuses = new Set(['done', 'skipped']);
            const completedStories = allStories.filter((s) => terminalStatuses.has(s.workStatus));
            const totalStories = allStories.length;

            // Return all_complete when every story is done (including
            // the zero-story case: a project with no stories has nothing
            // left to assign, so it is trivially complete).
            if (completedStories.length === totalStories) {
              return {
                response: buildAllCompleteResponse(
                  { id: projectId, name: projectRecord.name as string },
                  completedStories.length,
                  totalStories,
                ),
                retryAfterSeconds: MIN_POLLING_INTERVAL_SECONDS,
              };
            }

            // Some stories are blocked — build blocking info
            const ineligibleResults = eligibilityResults.filter((r) => !r.eligible);
            const blockingInfos: BlockingStoryInfo[] = ineligibleResults
              .filter((r) => {
                const story = allStories.find((s) => s.id === r.storyId);
                return story && !terminalStatuses.has(story.workStatus);
              })
              .slice(0, 10)
              .map((r) => {
                const story = allStories.find((s) => s.id === r.storyId);
                return {
                  id: r.storyId,
                  name: story?.title ?? 'Unknown',
                  assigned_worker: story?.assignedWorkerId ?? null,
                  blocking_reason: r.disqualificationReasons.join('; '),
                };
              });

            return {
              response: buildBlockedResponse(blockingInfos),
              retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS,
            };
          }

          // -------------------------------------------------------------
          // Step 9: Select the best story for assignment
          // -------------------------------------------------------------
          const storySelectionMap = new Map<
            string,
            { id: string; priority: 'high' | 'medium' | 'low'; createdAt: Date }
          >();
          for (const story of allStories) {
            storySelectionMap.set(story.id, {
              id: story.id,
              priority: story.priority as 'high' | 'medium' | 'low',
              createdAt: story.createdAt,
            });
          }

          const storyTopologicalOrder: string[] = [];

          const selectionResult = selectStoryForAssignment(
            eligibleStoryIds,
            storySelectionMap,
            storyTopologicalOrder,
          );

          if (!selectionResult.selected) {
            return {
              response: buildBlockedResponse([]),
              retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS,
            };
          }

          const selectedStoryId = selectionResult.storyId;

          // -------------------------------------------------------------
          // Step 10: Atomically assign the story to the worker
          // -------------------------------------------------------------
          const selectedStory = allStories.find((s) => s.id === selectedStoryId);
          if (!selectedStory) {
            throw new ConflictError(
              DomainErrorCode.ASSIGNMENT_CONFLICT,
              `Selected story ${selectedStoryId} disappeared during assignment`,
            );
          }

          await atomicAssignStory(
            tx,
            tenantId,
            selectedStoryId,
            workerId,
            selectedStory.version,
            projectId,
          );

          // Fire-and-forget audit event for the successful assignment
          writeAuditEventFireAndForget({
            entityType: 'user_story',
            entityId: selectedStoryId,
            action: 'assigned',
            actorType: 'worker',
            actorId: workerId,
            tenantId,
            projectId,
            details: `Story "${selectedStory.title}" assigned to worker "${workerName}"`,
            metadata: {
              workerId,
              storyTitle: selectedStory.title,
            },
          });

          // -------------------------------------------------------------
          // Step 11: Build the full assigned response (within same tx)
          // -------------------------------------------------------------
          const storyDetail = await buildAssignedResponse(
            txDb,
            tenantId,
            selectedStoryId,
            projectId,
          );

          return {
            response: { type: 'assigned' as const, story: storyDetail },
            retryAfterSeconds: MIN_POLLING_INTERVAL_SECONDS,
          };
        });

        // -----------------------------------------------------------------
        // Publish custom metrics for the assignment outcome
        // -----------------------------------------------------------------
        recordCount('WorkAssignments', 1, { projectId });
        recordCount('AssignmentType', 1, {
          projectId,
          type: result.response.type,
        });
        await flushMetrics();

        // -----------------------------------------------------------------
        // Send HTTP response after transaction commits
        // -----------------------------------------------------------------
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        res.status(200).json({ data: result.response });
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// Method dispatcher
// ---------------------------------------------------------------------------

/**
 * Next.js Pages Router API handler that dispatches to the correct handler
 * based on the HTTP method. Only POST is allowed for this endpoint.
 *
 * Wrapped with withLogging to add request ID, X-Ray trace ID, and
 * request duration logging to every invocation.
 */
export default withLogging(async (req, res): Promise<void> => {
  switch (req.method) {
    case 'POST':
      return handleAssign(req, res);
    default:
      res.setHeader('Allow', 'POST');
      res.status(405).json({
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: `Method ${req.method ?? 'UNKNOWN'} not allowed`,
        },
      });
  }
});
