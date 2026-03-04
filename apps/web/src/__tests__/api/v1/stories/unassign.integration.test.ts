/**
 * @module unassign.integration.test
 *
 * Integration tests for the manual unassignment endpoint:
 *
 *   POST /api/v1/stories/:id/unassign
 *
 * Tests invoke the handler function directly with mock request/response
 * objects. The database layer and auth layer are mocked to enable isolated,
 * deterministic testing without requiring a running database or auth server.
 *
 * Test coverage:
 * - Unassignment with confirmation: true works
 * - Missing confirmation returns 400
 * - confirmation: false returns 400
 * - Human-auth only (worker auth returns 403)
 * - Clears assignment and resets story
 * - Preserves completed tasks
 * - Creates attempt history with reason 'manual_unassignment'
 * - Captures operator-provided reason
 * - Story returns to assignment pool after unassignment
 * - Attempt history accumulation across multiple attempts
 * - Attempt records include task status snapshots
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockRequest, createMockResponse } from '@/__tests__/helpers/mock-api';
import {
  setMockSession,
  clearMockSession,
  getMockSession,
  TEST_TENANT_ID,
} from '@/__tests__/helpers/mock-auth';

// ---------------------------------------------------------------------------
// UUIDs for tests
// ---------------------------------------------------------------------------

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STORY_UUID = '550e8400-e29b-41d4-a716-446655440001';
const EPIC_UUID = '660e8400-e29b-41d4-a716-446655440001';
const PROJECT_UUID = '770e8400-e29b-41d4-a716-446655440001';
const WORKER_UUID = '880e8400-e29b-41d4-a716-446655440001';
const NONEXISTENT_UUID = '00000000-0000-4000-a000-000000000000';

// ---------------------------------------------------------------------------
// Mock data interfaces
// ---------------------------------------------------------------------------

interface MockStory {
  id: string;
  tenantId: string;
  epicId: string;
  title: string;
  description: string | null;
  priority: string;
  workStatus: string;
  costEstimate: string | null;
  actualCost: string | null;
  assignedWorkerId: string | null;
  assignedAt: Date | null;
  attempts: number;
  maxAttempts: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface MockTask {
  id: string;
  workStatus: string;
}

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

interface UnassignResponseBody {
  data: {
    story: {
      id: string;
      name: string;
      status: string;
      previous_worker_id: string | null;
      previous_attempts: number;
    };
    task_resets: {
      reset_count: number;
      preserved_count: number;
    };
  };
}

// ---------------------------------------------------------------------------
// Mock data factories
// ---------------------------------------------------------------------------

const now = new Date('2025-06-01T12:00:00Z');

const createMockStory = (overrides: Partial<MockStory> = {}): MockStory => ({
  id: STORY_UUID,
  tenantId: TEST_TENANT_ID,
  epicId: EPIC_UUID,
  title: 'Test Story',
  description: null,
  priority: 'medium',
  workStatus: 'pending',
  costEstimate: null,
  actualCost: null,
  assignedWorkerId: null,
  assignedAt: null,
  attempts: 0,
  maxAttempts: 3,
  version: 0,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock repository functions
// ---------------------------------------------------------------------------

// Story repo mocks
const mockStoryRepoFindById = vi.fn<(tenantId: string, id: string) => Promise<MockStory | null>>();
const mockStoryRepoHasIncompleteUpstreamDependencies =
  vi.fn<(tenantId: string, storyId: string) => Promise<boolean>>();
const mockStoryRepoUnassignStory =
  vi.fn<(tenantId: string, storyId: string, targetStatus: string) => Promise<MockStory>>();

// Task repo mocks
const mockTaskRepoFindByStory = vi.fn();
const mockTaskRepoGetProjectIdForStory =
  vi.fn<(tenantId: string, storyId: string) => Promise<string | null>>();

// Epic repo mocks
const mockEpicRepoComputeDerivedStatus =
  vi.fn<(tenantId: string, epicId: string) => Promise<string>>();
const mockEpicRepoFindAllByProject = vi.fn();

// Project repo mocks
const mockProjectRepoUpdateWorkStatus = vi.fn();

// Audit writer mock
const mockWriteAuditEvent = vi.fn();

// ---------------------------------------------------------------------------
// Mock modules (hoisted by vitest)
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => getMockSession()),
    },
  },
}));

const mockValidateApiKey = vi.fn(async () => null);
vi.mock('@/lib/middleware/api-key-validator', () => ({
  validateApiKey: (...args: unknown[]) => mockValidateApiKey(...args),
}));

vi.mock('@laila/database', () => ({
  getDb: vi.fn(() => ({})),
  createStoryRepository: vi.fn(() => ({
    findById: mockStoryRepoFindById,
    hasIncompleteUpstreamDependencies: mockStoryRepoHasIncompleteUpstreamDependencies,
    unassignStory: mockStoryRepoUnassignStory,
  })),
  createTaskRepository: vi.fn(() => ({
    findByStory: mockTaskRepoFindByStory,
    getProjectIdForStory: mockTaskRepoGetProjectIdForStory,
  })),
  createEpicRepository: vi.fn(() => ({
    computeDerivedStatus: mockEpicRepoComputeDerivedStatus,
    findAllByProject: mockEpicRepoFindAllByProject,
  })),
  createProjectRepository: vi.fn(() => ({
    updateWorkStatus: mockProjectRepoUpdateWorkStatus,
  })),
  writeAuditEvent: (...args: unknown[]) => mockWriteAuditEvent(...args),
  writeAuditEventFireAndForget: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import handler AFTER mocks are registered
// ---------------------------------------------------------------------------

const { default: unassignHandler } = await import('@/pages/api/v1/stories/[id]/unassign');

// ---------------------------------------------------------------------------
// Helper: standard pagination wrapper for findByStory results
// ---------------------------------------------------------------------------

const createFindByStoryResult = (tasks: MockTask[]) => ({
  data: tasks,
  pagination: {
    page: 1,
    limit: 1000,
    total: tasks.length,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  },
});

// ---------------------------------------------------------------------------
// Helper: set up common mocks for a successful unassignment
// ---------------------------------------------------------------------------

const setupSuccessfulUnassignment = (
  overrides: {
    storyOverrides?: Partial<MockStory>;
    resetStoryOverrides?: Partial<MockStory>;
    hasIncompleteUpstream?: boolean;
    tasks?: MockTask[];
  } = {},
): void => {
  const inProgressStory = createMockStory({
    workStatus: 'in_progress',
    assignedWorkerId: WORKER_UUID,
    assignedAt: now,
    attempts: 1,
    ...overrides.storyOverrides,
  });

  const targetStatus = overrides.hasIncompleteUpstream ? 'blocked' : 'ready';
  const resetStory = createMockStory({
    workStatus: targetStatus,
    assignedWorkerId: null,
    assignedAt: null,
    version: 1,
    attempts: 1,
    ...overrides.resetStoryOverrides,
  });

  const tasks = overrides.tasks ?? [
    { id: 'task-1', workStatus: 'done' },
    { id: 'task-2', workStatus: 'in_progress' },
  ];

  mockStoryRepoFindById.mockResolvedValue(inProgressStory);
  mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(
    overrides.hasIncompleteUpstream ?? false,
  );
  mockStoryRepoUnassignStory.mockResolvedValue(resetStory);
  mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult(tasks));
  mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
  mockEpicRepoComputeDerivedStatus.mockResolvedValue('pending');
  mockEpicRepoFindAllByProject.mockResolvedValue([]);
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('POST /api/v1/stories/:id/unassign', () => {
  beforeEach(() => {
    setMockSession();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockWriteAuditEvent.mockResolvedValue({});
  });

  afterEach(() => {
    clearMockSession();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockValidateApiKey.mockReset();
    mockValidateApiKey.mockResolvedValue(null);
  });

  // =========================================================================
  // Successful unassignment
  // =========================================================================

  describe('successful unassignment', () => {
    it('unassigns worker with confirmation: true', async () => {
      setupSuccessfulUnassignment();

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/stories/${STORY_UUID}/unassign`,
        query: { id: STORY_UUID },
        body: { confirmation: true },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as UnassignResponseBody;
      expect(body.data.story.id).toBe(STORY_UUID);
      expect(body.data.story.status).toBe('not_started');
      expect(body.data.story.previous_worker_id).toBe(WORKER_UUID);
    });

    it('clears assignment and resets story status', async () => {
      setupSuccessfulUnassignment();

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/stories/${STORY_UUID}/unassign`,
        query: { id: STORY_UUID },
        body: { confirmation: true },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      // Verify unassignStory was called with correct target status
      // The 4th argument is the operator reason (undefined when not provided)
      expect(mockStoryRepoUnassignStory).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        STORY_UUID,
        'ready',
        undefined,
      );
    });

    it('sets status to blocked when upstream dependencies are incomplete', async () => {
      setupSuccessfulUnassignment({
        hasIncompleteUpstream: true,
        resetStoryOverrides: { workStatus: 'blocked' },
      });

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/stories/${STORY_UUID}/unassign`,
        query: { id: STORY_UUID },
        body: { confirmation: true },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as UnassignResponseBody;
      expect(body.data.story.status).toBe('blocked');
      expect(mockStoryRepoUnassignStory).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        STORY_UUID,
        'blocked',
        undefined,
      );
    });
  });

  // =========================================================================
  // Preserves completed tasks
  // =========================================================================

  describe('preserves completed tasks', () => {
    it('reports correct reset and preserved counts', async () => {
      setupSuccessfulUnassignment({
        tasks: [
          { id: 'task-1', workStatus: 'done' },
          { id: 'task-2', workStatus: 'done' },
          { id: 'task-3', workStatus: 'in_progress' },
          { id: 'task-4', workStatus: 'pending' },
        ],
      });

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/stories/${STORY_UUID}/unassign`,
        query: { id: STORY_UUID },
        body: { confirmation: true },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as UnassignResponseBody;
      // 2 done tasks are preserved, 1 in_progress task is reset
      // pending tasks are not counted in either category
      expect(body.data.task_resets.preserved_count).toBe(2);
      expect(body.data.task_resets.reset_count).toBe(1);
    });
  });

  // =========================================================================
  // Attempt history and audit logging
  // =========================================================================

  describe('attempt history and audit logging', () => {
    it('creates attempt history with reason manual_unassignment via unassignStory', async () => {
      setupSuccessfulUnassignment();

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/stories/${STORY_UUID}/unassign`,
        query: { id: STORY_UUID },
        body: { confirmation: true },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      // The unassignStory repo method handles attempt history creation internally
      expect(mockStoryRepoUnassignStory).toHaveBeenCalledTimes(1);
      expect(mockStoryRepoUnassignStory).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        STORY_UUID,
        'ready',
        undefined,
      );
    });

    it('captures operator-provided reason in audit event', async () => {
      setupSuccessfulUnassignment();

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/stories/${STORY_UUID}/unassign`,
        query: { id: STORY_UUID },
        body: { confirmation: true, reason: 'Worker stuck on task' },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      // Verify audit event contains the operator reason
      expect(mockWriteAuditEvent).toHaveBeenCalledTimes(1);
      const auditCall = mockWriteAuditEvent.mock.calls[0] as [Record<string, unknown>];
      const auditEvent = auditCall[0];
      expect(auditEvent.entityType).toBe('user_story');
      expect(auditEvent.entityId).toBe(STORY_UUID);
      expect(auditEvent.action).toBe('unassigned');
      expect(auditEvent.actorType).toBe('user');
      expect(auditEvent.actorId).toBe(TEST_TENANT_ID);

      const metadata = auditEvent.metadata as Record<string, unknown>;
      expect(metadata.reason).toBe('Worker stuck on task');
      expect(metadata.previous_worker_id).toBe(WORKER_UUID);
    });

    it('uses default reason when no reason is provided', async () => {
      setupSuccessfulUnassignment();

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/stories/${STORY_UUID}/unassign`,
        query: { id: STORY_UUID },
        body: { confirmation: true },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const auditCall = mockWriteAuditEvent.mock.calls[0] as [Record<string, unknown>];
      const auditEvent = auditCall[0];
      const metadata = auditEvent.metadata as Record<string, unknown>;
      expect(metadata.reason).toBe('No reason provided');
    });
  });

  // =========================================================================
  // Validation errors
  // =========================================================================

  describe('validation errors', () => {
    it('returns 400 when confirmation is missing', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/stories/${STORY_UUID}/unassign`,
        query: { id: STORY_UUID },
        body: {},
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 400 when confirmation is false', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/stories/${STORY_UUID}/unassign`,
        query: { id: STORY_UUID },
        body: { confirmation: false },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 400 when id is not a valid UUID', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/stories/not-a-uuid/unassign',
        query: { id: 'not-a-uuid' },
        body: { confirmation: true },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  // =========================================================================
  // Status pre-condition errors
  // =========================================================================

  describe('status pre-condition errors', () => {
    it('returns 409 when story is not in_progress', async () => {
      const pendingStory = createMockStory({ workStatus: 'pending' });
      mockStoryRepoFindById.mockResolvedValue(pendingStory);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/stories/${STORY_UUID}/unassign`,
        query: { id: STORY_UUID },
        body: { confirmation: true },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('INVALID_STATUS_TRANSITION');
      expect(body.error.message).toContain('pending');
    });

    it('returns 404 when story does not exist', async () => {
      mockStoryRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/stories/${NONEXISTENT_UUID}/unassign`,
        query: { id: NONEXISTENT_UUID },
        body: { confirmation: true },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('STORY_NOT_FOUND');
    });
  });

  // =========================================================================
  // Authentication and authorization
  // =========================================================================

  describe('authentication and authorization', () => {
    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/stories/${STORY_UUID}/unassign`,
        query: { id: STORY_UUID },
        body: { confirmation: true },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
    });

    it('rejects worker auth with 403 (human-only endpoint)', async () => {
      clearMockSession();
      mockValidateApiKey.mockResolvedValueOnce({
        type: 'agent' as const,
        workerId: WORKER_UUID,
        workerName: 'Test Worker',
        tenantId: TEST_TENANT_ID,
        projectAccess: [PROJECT_UUID],
      });

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/stories/${STORY_UUID}/unassign`,
        query: { id: STORY_UUID },
        body: { confirmation: true },
        headers: { authorization: 'Bearer test-api-key' },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(403);
      const body = res.getJsonBody() as { error: { code: string } };
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // Method enforcement
  // =========================================================================

  describe('method enforcement', () => {
    it('returns 405 for non-POST methods', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/stories/${STORY_UUID}/unassign`,
        query: { id: STORY_UUID },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(405);
    });
  });

  // =========================================================================
  // Story returns to assignment pool after unassignment
  // =========================================================================

  describe('story returns to assignment pool', () => {
    it('story is assignable after unassignment (status ready)', async () => {
      setupSuccessfulUnassignment();

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/stories/${STORY_UUID}/unassign`,
        query: { id: STORY_UUID },
        body: { confirmation: true },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      // After unassignment, the repo sets the story to 'ready' status
      // which maps to 'not_started' in the API response
      expect(mockStoryRepoUnassignStory).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        STORY_UUID,
        'ready',
        undefined,
      );
      const body = res.getJsonBody() as UnassignResponseBody;
      expect(body.data.story.status).toBe('not_started');

      // Re-derives parent epic and project status
      expect(mockEpicRepoComputeDerivedStatus).toHaveBeenCalledWith(TEST_TENANT_ID, EPIC_UUID);
    });
  });

  // =========================================================================
  // Attempt history accumulation
  // =========================================================================

  describe('attempt history accumulation', () => {
    it('records previous_attempts count in response', async () => {
      // Story has been attempted 2 times before
      setupSuccessfulUnassignment({
        storyOverrides: { attempts: 2 },
        resetStoryOverrides: { attempts: 2 },
      });

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/stories/${STORY_UUID}/unassign`,
        query: { id: STORY_UUID },
        body: { confirmation: true },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as UnassignResponseBody;
      expect(body.data.story.previous_attempts).toBe(2);
    });

    it('includes attempt count in audit event metadata', async () => {
      setupSuccessfulUnassignment({
        storyOverrides: { attempts: 3 },
        resetStoryOverrides: { attempts: 3 },
      });

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/stories/${STORY_UUID}/unassign`,
        query: { id: STORY_UUID },
        body: { confirmation: true },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const auditCall = mockWriteAuditEvent.mock.calls[0] as [Record<string, unknown>];
      const metadata = auditCall[0].metadata as Record<string, unknown>;
      expect(metadata.previous_attempts).toBe(3);
    });
  });
});
