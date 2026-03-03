/**
 * @module stories.integration.test
 *
 * Integration tests for all user story API endpoints:
 *
 * - POST   /api/v1/projects/:id/epics/:epicId/stories              -- Create a new story
 * - GET    /api/v1/projects/:id/epics/:epicId/stories              -- List stories (paginated)
 * - GET    /api/v1/projects/:id/epics/:epicId/stories/:storyId     -- Get story detail
 * - PATCH  /api/v1/projects/:id/epics/:epicId/stories/:storyId     -- Update story fields
 * - DELETE /api/v1/projects/:id/epics/:epicId/stories/:storyId     -- Soft-delete with cascade
 * - POST   /api/v1/projects/:id/epics/:epicId/stories/:storyId/publish  -- Publish story
 * - POST   /api/v1/projects/:id/epics/:epicId/stories/:storyId/reset    -- Reset failed story
 * - POST   /api/v1/projects/:id/epics/:epicId/stories/:storyId/unassign -- Unassign worker
 *
 * Tests invoke the handler functions directly with mock request/response
 * objects. The database layer and auth layer are mocked to enable isolated,
 * deterministic testing without requiring a running database or auth server.
 *
 * Each test verifies:
 * - Correct HTTP status codes
 * - Response body structure (data envelope, error envelope)
 * - Error codes (DomainErrorCode values)
 * - Field-level validation errors
 * - Read-only enforcement (in_progress, done)
 * - Lifecycle transition pre-conditions
 * - Authentication enforcement (human-only for reset/unassign)
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

const VALID_PROJECT_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_EPIC_UUID = '660e8400-e29b-41d4-a716-446655440001';
const VALID_STORY_UUID = '770e8400-e29b-41d4-a716-446655440002';
const VALID_WORKER_UUID = '880e8400-e29b-41d4-a716-446655440003';
const NONEXISTENT_UUID = '00000000-0000-4000-a000-000000000000';

// ---------------------------------------------------------------------------
// Mock data interfaces
// ---------------------------------------------------------------------------

interface MockProject {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  lifecycleStatus: string;
  workStatus: string;
  workerInactivityTimeoutMinutes: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface MockEpic {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  description: string | null;
  workStatus: string;
  sortOrder: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

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

interface MockStoryWithTaskCount extends MockStory {
  taskCount: number;
}

interface MockTaskForValidation {
  id: string;
  title: string;
  personaId: string | null;
  acceptanceCriteria: string[];
}

// ---------------------------------------------------------------------------
// Mock data factories
// ---------------------------------------------------------------------------

const now = new Date('2025-06-01T12:00:00Z');

const createMockProject = (overrides: Partial<MockProject> = {}): MockProject => ({
  id: VALID_PROJECT_UUID,
  tenantId: TEST_TENANT_ID,
  name: 'Test Project',
  description: 'A test project description',
  lifecycleStatus: 'draft',
  workStatus: 'pending',
  workerInactivityTimeoutMinutes: 30,
  version: 0,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  ...overrides,
});

const createMockEpic = (overrides: Partial<MockEpic> = {}): MockEpic => ({
  id: VALID_EPIC_UUID,
  tenantId: TEST_TENANT_ID,
  projectId: VALID_PROJECT_UUID,
  name: 'Test Epic',
  description: null,
  workStatus: 'pending',
  sortOrder: 0,
  version: 0,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  ...overrides,
});

const createMockStory = (overrides: Partial<MockStory> = {}): MockStory => ({
  id: VALID_STORY_UUID,
  tenantId: TEST_TENANT_ID,
  epicId: VALID_EPIC_UUID,
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

const createMockStoryWithTaskCount = (
  overrides: Partial<MockStoryWithTaskCount> = {},
): MockStoryWithTaskCount => ({
  ...createMockStory(overrides),
  taskCount: 0,
  ...overrides,
});

const createMockTask = (overrides: Partial<MockTaskForValidation> = {}): MockTaskForValidation => ({
  id: '990e8400-e29b-41d4-a716-446655440010',
  title: 'Test Task',
  personaId: 'aa0e8400-e29b-41d4-a716-446655440020',
  acceptanceCriteria: ['Given X, When Y, Then Z'],
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock repository functions
// ---------------------------------------------------------------------------

const mockProjectRepoFindById =
  vi.fn<(tenantId: string, id: string) => Promise<MockProject | null>>();

const mockEpicRepoFindById = vi.fn<(tenantId: string, id: string) => Promise<MockEpic | null>>();

const mockStoryRepoCreate =
  vi.fn<(tenantId: string, epicId: string, data: Record<string, unknown>) => Promise<MockStory>>();

const mockStoryRepoFindByEpicWithTaskCount = vi.fn();

const mockStoryRepoFindWithTaskCount =
  vi.fn<(tenantId: string, storyId: string) => Promise<MockStoryWithTaskCount | null>>();

const mockStoryRepoFindById = vi.fn<(tenantId: string, id: string) => Promise<MockStory | null>>();

const mockStoryRepoUpdate =
  vi.fn<
    (
      tenantId: string,
      id: string,
      data: Record<string, unknown>,
      version: number,
    ) => Promise<MockStory>
  >();

const mockStoryRepoSoftDeleteWithCascade =
  vi.fn<(tenantId: string, id: string) => Promise<MockStory | null>>();

const mockStoryRepoFindTasksForValidation =
  vi.fn<(tenantId: string, storyId: string) => Promise<MockTaskForValidation[]>>();

const mockStoryRepoPublishStory =
  vi.fn<(tenantId: string, storyId: string) => Promise<MockStory>>();

const mockStoryRepoHasIncompleteUpstreamDependencies =
  vi.fn<(tenantId: string, storyId: string) => Promise<boolean>>();

const mockStoryRepoResetStory =
  vi.fn<(tenantId: string, storyId: string, targetStatus: string) => Promise<MockStory>>();

const mockStoryRepoUnassignStory =
  vi.fn<(tenantId: string, storyId: string, targetStatus: string) => Promise<MockStory>>();

// ---------------------------------------------------------------------------
// Mock modules (hoisted by vitest)
// ---------------------------------------------------------------------------

/**
 * Mock @/lib/auth -- the Better Auth instance.
 * Returns a controlled session based on `getMockSession()` state.
 */
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => getMockSession()),
    },
  },
}));

/**
 * Mock @/lib/middleware/api-key-validator -- defaults to null (no API key auth).
 * Override per-test to simulate worker auth for testing human-only enforcement.
 */
vi.mock('@/lib/middleware/api-key-validator', () => ({
  validateApiKey: vi.fn(async () => null),
}));

/**
 * Mock @laila/database -- provides mock repository factories and getDb.
 */
vi.mock('@laila/database', () => ({
  getDb: vi.fn(() => ({})),
  createProjectRepository: vi.fn(() => ({
    findById: mockProjectRepoFindById,
  })),
  createEpicRepository: vi.fn(() => ({
    findById: mockEpicRepoFindById,
  })),
  createStoryRepository: vi.fn(() => ({
    create: mockStoryRepoCreate,
    findByEpicWithTaskCount: mockStoryRepoFindByEpicWithTaskCount,
    findWithTaskCount: mockStoryRepoFindWithTaskCount,
    findById: mockStoryRepoFindById,
    update: mockStoryRepoUpdate,
    softDeleteWithCascade: mockStoryRepoSoftDeleteWithCascade,
    findTasksForValidation: mockStoryRepoFindTasksForValidation,
    publishStory: mockStoryRepoPublishStory,
    hasIncompleteUpstreamDependencies: mockStoryRepoHasIncompleteUpstreamDependencies,
    resetStory: mockStoryRepoResetStory,
    unassignStory: mockStoryRepoUnassignStory,
  })),
}));

/**
 * Mock @laila/domain -- story tests don't use validateTransition directly.
 */
vi.mock('@laila/domain', () => ({
  validateTransition: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import handlers AFTER mocks are registered
// ---------------------------------------------------------------------------

const { default: storyCollectionHandler } =
  await import('@/pages/api/v1/projects/[id]/epics/[epicId]/stories/index');
const { default: storyDetailHandler } =
  await import('@/pages/api/v1/projects/[id]/epics/[epicId]/stories/[storyId]');
const { default: publishHandler } =
  await import('@/pages/api/v1/projects/[id]/epics/[epicId]/stories/[storyId]/publish');
const { default: resetHandler } =
  await import('@/pages/api/v1/projects/[id]/epics/[epicId]/stories/[storyId]/reset');
const { default: unassignHandler } =
  await import('@/pages/api/v1/projects/[id]/epics/[epicId]/stories/[storyId]/unassign');

// ---------------------------------------------------------------------------
// Error envelope type for assertions
// ---------------------------------------------------------------------------

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Story API Integration Tests', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setMockSession();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Default: epic exists and belongs to the project (needed for path scoping checks)
    mockEpicRepoFindById.mockResolvedValue(createMockEpic());
  });

  afterEach(() => {
    clearMockSession();
    vi.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  // =========================================================================
  // Read-Only Enforcement (most important tests)
  // =========================================================================

  describe('Read-Only Enforcement', () => {
    it('allows PATCH when story is in pending (draft) status', async () => {
      const existing = createMockStory({ workStatus: 'pending', version: 1 });
      const updated = createMockStory({ workStatus: 'pending', title: 'Updated', version: 2 });

      mockStoryRepoFindById.mockResolvedValue(existing);
      mockStoryRepoUpdate.mockResolvedValue(updated);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
        body: { title: 'Updated', version: 1 },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockStory } | undefined;
      expect(body!.data.title).toBe('Updated');
    });

    it('allows PATCH when story is in not_started status', async () => {
      const existing = createMockStory({ workStatus: 'not_started', version: 1 });
      const updated = createMockStory({ workStatus: 'not_started', title: 'Updated', version: 2 });

      mockStoryRepoFindById.mockResolvedValue(existing);
      mockStoryRepoUpdate.mockResolvedValue(updated);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
        body: { title: 'Updated', version: 1 },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
    });

    it('allows PATCH when story is in blocked status', async () => {
      const existing = createMockStory({ workStatus: 'blocked', version: 1 });
      const updated = createMockStory({ workStatus: 'blocked', title: 'Updated', version: 2 });

      mockStoryRepoFindById.mockResolvedValue(existing);
      mockStoryRepoUpdate.mockResolvedValue(updated);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
        body: { title: 'Updated', version: 1 },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
    });

    it('returns 409 READ_ONLY_VIOLATION when PATCH on in_progress story', async () => {
      const existing = createMockStory({ workStatus: 'in_progress', version: 1 });

      mockStoryRepoFindById.mockResolvedValue(existing);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
        body: { title: 'Cannot Update', version: 1 },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('READ_ONLY_VIOLATION');
      expect(body!.error.message).toContain('in_progress');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 409 READ_ONLY_VIOLATION when PATCH on done/completed story', async () => {
      const existing = createMockStory({ workStatus: 'done', version: 1 });

      mockStoryRepoFindById.mockResolvedValue(existing);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
        body: { title: 'Cannot Update', version: 1 },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('READ_ONLY_VIOLATION');
      expect(body!.error.message).toContain('done');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 409 READ_ONLY_VIOLATION when DELETE on in_progress story', async () => {
      const existing = createMockStory({ workStatus: 'in_progress' });

      mockStoryRepoFindById.mockResolvedValue(existing);

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('READ_ONLY_VIOLATION');
      expect(body!.error.message).toContain('in_progress');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('allows DELETE when story is in done status (completed stories CAN be deleted)', async () => {
      const existing = createMockStory({ workStatus: 'done' });
      const deleted = createMockStory({ workStatus: 'done', deletedAt: now });

      mockStoryRepoFindById.mockResolvedValue(existing);
      mockStoryRepoSoftDeleteWithCascade.mockResolvedValue(deleted);

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(204);
      expect(res.wasEnded()).toBe(true);
      expect(mockStoryRepoSoftDeleteWithCascade).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_STORY_UUID,
      );
    });
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/epics/:epicId/stories -- Create story
  // =========================================================================

  describe('POST /api/v1/projects/:projectId/epics/:epicId/stories', () => {
    it('creates a story in pending status with specified priority', async () => {
      const project = createMockProject();
      const epic = createMockEpic();
      const newStory = createMockStory({
        title: 'New Story',
        priority: 'high',
        workStatus: 'pending',
      });

      mockProjectRepoFindById.mockResolvedValue(project);
      mockEpicRepoFindById.mockResolvedValue(epic);
      mockStoryRepoCreate.mockResolvedValue(newStory);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
        body: {
          title: 'New Story',
          priority: 'high',
        },
      });
      const res = createMockResponse();

      await storyCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(201);
      const body = res.getJsonBody() as { data: MockStory } | undefined;
      expect(body).toBeDefined();
      expect(body!.data.title).toBe('New Story');
      expect(body!.data.priority).toBe('high');
      expect(body!.data.workStatus).toBe('pending');
      expect(mockStoryRepoCreate).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_EPIC_UUID,
        expect.objectContaining({
          title: 'New Story',
          priority: 'high',
        }),
      );
    });

    it('returns 404 when parent project does not exist', async () => {
      mockProjectRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${NONEXISTENT_UUID}/epics/${VALID_EPIC_UUID}/stories`,
        query: { id: NONEXISTENT_UUID, epicId: VALID_EPIC_UUID },
        body: { title: 'Orphan Story' },
      });
      const res = createMockResponse();

      await storyCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('PROJECT_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 404 when parent epic does not exist', async () => {
      const project = createMockProject();
      mockProjectRepoFindById.mockResolvedValue(project);
      mockEpicRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${NONEXISTENT_UUID}/stories`,
        query: { id: VALID_PROJECT_UUID, epicId: NONEXISTENT_UUID },
        body: { title: 'Orphan Story' },
      });
      const res = createMockResponse();

      await storyCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('EPIC_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 400 with VALIDATION_FAILED for missing title', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
        body: {},
      });
      const res = createMockResponse();

      await storyCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
      expect(body!.error.message).toBe('Request validation failed');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
      const fieldErrors = body!.error.details!.fieldErrors as Record<string, string[]>;
      expect(fieldErrors).toHaveProperty('body.title');
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
        body: { title: 'Unauth Story' },
      });
      const res = createMockResponse();

      await storyCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
      const body = res.getJsonBody() as { error: { code: string; message: string } } | undefined;
      expect(body!.error.code).toBe('UNAUTHORIZED');
      expect(body!.error.message).toBe('Authentication required');
    });

    it('returns 405 for unsupported HTTP methods', async () => {
      const req = createMockRequest({
        method: 'PUT',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await storyCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(405);
      const body = res.getJsonBody() as { error: { code: string; message: string } } | undefined;
      expect(body!.error.code).toBe('METHOD_NOT_ALLOWED');
    });
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/epics/:epicId/stories -- List stories
  // =========================================================================

  describe('GET /api/v1/projects/:projectId/epics/:epicId/stories', () => {
    it('returns paginated list of stories with task count', async () => {
      const stories = [
        createMockStoryWithTaskCount({
          id: '11111111-1111-4111-a111-111111111111',
          title: 'Story A',
          taskCount: 3,
        }),
        createMockStoryWithTaskCount({
          id: '22222222-2222-4222-a222-222222222222',
          title: 'Story B',
          taskCount: 1,
        }),
      ];
      mockStoryRepoFindByEpicWithTaskCount.mockResolvedValue({
        data: stories,
        pagination: {
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await storyCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as
        | {
            data: MockStoryWithTaskCount[];
            pagination: {
              page: number;
              limit: number;
              total: number;
              totalPages: number;
              hasNext: boolean;
              hasPrev: boolean;
            };
          }
        | undefined;
      expect(body).toBeDefined();
      expect(body!.data).toHaveLength(2);
      expect(body!.data[0]!.taskCount).toBe(3);
      expect(body!.data[1]!.taskCount).toBe(1);
      expect(body!.pagination.page).toBe(1);
      expect(body!.pagination.limit).toBe(20);
      expect(body!.pagination.total).toBe(2);
      expect(body!.pagination.totalPages).toBe(1);
      expect(body!.pagination.hasNext).toBe(false);
      expect(body!.pagination.hasPrev).toBe(false);
    });

    it('filters by status', async () => {
      mockStoryRepoFindByEpicWithTaskCount.mockResolvedValue({
        data: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      });

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories?status=in_progress`,
        query: {
          id: VALID_PROJECT_UUID,
          epicId: VALID_EPIC_UUID,
          status: 'in_progress',
        },
      });
      const res = createMockResponse();

      await storyCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      expect(mockStoryRepoFindByEpicWithTaskCount).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_EPIC_UUID,
        expect.objectContaining({
          status: 'in_progress',
        }),
      );
    });

    it('filters by assigned_worker_id', async () => {
      mockStoryRepoFindByEpicWithTaskCount.mockResolvedValue({
        data: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      });

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories?assigned_worker_id=${VALID_WORKER_UUID}`,
        query: {
          id: VALID_PROJECT_UUID,
          epicId: VALID_EPIC_UUID,
          assigned_worker_id: VALID_WORKER_UUID,
        },
      });
      const res = createMockResponse();

      await storyCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      expect(mockStoryRepoFindByEpicWithTaskCount).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_EPIC_UUID,
        expect.objectContaining({
          assignedWorkerId: VALID_WORKER_UUID,
        }),
      );
    });

    it('defaults to sorting by priority descending', async () => {
      mockStoryRepoFindByEpicWithTaskCount.mockResolvedValue({
        data: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      });

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await storyCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      expect(mockStoryRepoFindByEpicWithTaskCount).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_EPIC_UUID,
        expect.objectContaining({
          pagination: expect.objectContaining({
            sortBy: 'priority',
            sortOrder: 'desc',
          }),
        }),
      );
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await storyCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
      const body = res.getJsonBody() as { error: { code: string; message: string } } | undefined;
      expect(body!.error.code).toBe('UNAUTHORIZED');
    });
  });

  // =========================================================================
  // GET /api/v1/.../stories/:id -- Get story detail
  // =========================================================================

  describe('GET /api/v1/projects/:projectId/epics/:epicId/stories/:id', () => {
    it('returns story with task count and all fields', async () => {
      const storyWithCount = createMockStoryWithTaskCount({
        taskCount: 5,
        costEstimate: '150.00',
        actualCost: '120.50',
        assignedWorkerId: VALID_WORKER_UUID,
        assignedAt: now,
      });
      mockStoryRepoFindWithTaskCount.mockResolvedValue(storyWithCount);

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockStoryWithTaskCount } | undefined;
      expect(body).toBeDefined();
      expect(body!.data.id).toBe(VALID_STORY_UUID);
      expect(body!.data.taskCount).toBe(5);
      expect(body!.data.costEstimate).toBe('150.00');
      expect(body!.data.actualCost).toBe('120.50');
      expect(body!.data.assignedWorkerId).toBe(VALID_WORKER_UUID);
      expect(body!.data.title).toBe('Test Story');
      expect(body!.data.priority).toBe('medium');
    });

    it('returns 404 for non-existent story', async () => {
      mockStoryRepoFindWithTaskCount.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${NONEXISTENT_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: NONEXISTENT_UUID },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('STORY_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 404 when story belongs to a different epic', async () => {
      const OTHER_EPIC_UUID = 'aa0e8400-e29b-41d4-a716-446655440099';
      const storyInOtherEpic = createMockStoryWithTaskCount({
        epicId: OTHER_EPIC_UUID,
        taskCount: 1,
      });
      mockStoryRepoFindWithTaskCount.mockResolvedValue(storyInOtherEpic);

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('STORY_NOT_FOUND');
    });

    it('returns 400 for invalid story UUID format', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/not-a-uuid`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: 'not-a-uuid' },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
      const fieldErrors = body!.error.details?.fieldErrors as Record<string, string[]> | undefined;
      expect(fieldErrors).toBeDefined();
      expect(fieldErrors!['params.storyId']).toBeDefined();
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
      const body = res.getJsonBody() as { error: { code: string; message: string } } | undefined;
      expect(body!.error.code).toBe('UNAUTHORIZED');
    });
  });

  // =========================================================================
  // PATCH /api/v1/.../stories/:id -- Update story
  // =========================================================================

  describe('PATCH /api/v1/projects/:projectId/epics/:epicId/stories/:id', () => {
    it('updates allowed fields (title, description, priority)', async () => {
      const existing = createMockStory({ version: 1 });
      const updated = createMockStory({
        title: 'Updated Title',
        description: 'New desc',
        priority: 'high',
        version: 2,
      });

      mockStoryRepoFindById.mockResolvedValue(existing);
      mockStoryRepoUpdate.mockResolvedValue(updated);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
        body: {
          title: 'Updated Title',
          description: 'New desc',
          priority: 'high',
          version: 1,
        },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockStory } | undefined;
      expect(body!.data.title).toBe('Updated Title');
      expect(body!.data.description).toBe('New desc');
      expect(body!.data.priority).toBe('high');
      expect(body!.data.version).toBe(2);
      expect(mockStoryRepoUpdate).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_STORY_UUID,
        { title: 'Updated Title', description: 'New desc', priority: 'high' },
        1,
      );
    });

    it('requires version for optimistic locking', async () => {
      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
        body: { title: 'No Version' },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
      const fieldErrors = body!.error.details?.fieldErrors as Record<string, string[]> | undefined;
      expect(fieldErrors).toBeDefined();
      expect(fieldErrors!['body.version']).toBeDefined();
    });

    it('returns 409 OPTIMISTIC_LOCK_CONFLICT on version mismatch', async () => {
      const existing = createMockStory({ version: 5 });

      mockStoryRepoFindById.mockResolvedValue(existing);

      const conflictError = new Error('Conflict');
      conflictError.name = 'ConflictError';
      mockStoryRepoUpdate.mockRejectedValue(conflictError);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
        body: { title: 'Stale Update', version: 5 },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('OPTIMISTIC_LOCK_CONFLICT');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 404 when story does not exist', async () => {
      mockStoryRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${NONEXISTENT_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: NONEXISTENT_UUID },
        body: { title: 'Missing Story', version: 0 },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('STORY_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
        body: { title: 'Unauth', version: 0 },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
    });
  });

  // =========================================================================
  // DELETE /api/v1/.../stories/:id -- Soft-delete story with cascade
  // =========================================================================

  describe('DELETE /api/v1/projects/:projectId/epics/:epicId/stories/:id', () => {
    it('soft-deletes story with cascade and returns 204', async () => {
      const existing = createMockStory();
      const deleted = createMockStory({ deletedAt: now });

      mockStoryRepoFindById.mockResolvedValue(existing);
      mockStoryRepoSoftDeleteWithCascade.mockResolvedValue(deleted);

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(204);
      expect(res.wasEnded()).toBe(true);
      expect(mockStoryRepoSoftDeleteWithCascade).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_STORY_UUID,
      );
    });

    it('returns 404 when story does not exist', async () => {
      mockStoryRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${NONEXISTENT_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: NONEXISTENT_UUID },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('STORY_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 404 when story belongs to a different epic', async () => {
      const OTHER_EPIC_UUID = 'aa0e8400-e29b-41d4-a716-446655440099';
      const storyInOtherEpic = createMockStory({ epicId: OTHER_EPIC_UUID });
      mockStoryRepoFindById.mockResolvedValue(storyInOtherEpic);

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('STORY_NOT_FOUND');
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
    });
  });

  // =========================================================================
  // POST .../publish -- Publish story (pending -> ready)
  // =========================================================================

  describe('POST .../stories/:id/publish', () => {
    it('transitions pending story to ready when all tasks are complete', async () => {
      const pendingStory = createMockStory({ workStatus: 'pending' });
      const readyStory = createMockStory({ workStatus: 'ready', version: 1 });
      const completeTask = createMockTask();

      mockStoryRepoFindById.mockResolvedValue(pendingStory);
      mockStoryRepoFindTasksForValidation.mockResolvedValue([completeTask]);
      mockStoryRepoPublishStory.mockResolvedValue(readyStory);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/publish`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockStory } | undefined;
      expect(body!.data.workStatus).toBe('ready');
      expect(mockStoryRepoPublishStory).toHaveBeenCalledWith(TEST_TENANT_ID, VALID_STORY_UUID);
    });

    it('returns 400 VALIDATION_FAILED when story has no tasks', async () => {
      const pendingStory = createMockStory({ workStatus: 'pending' });

      mockStoryRepoFindById.mockResolvedValue(pendingStory);
      mockStoryRepoFindTasksForValidation.mockResolvedValue([]);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/publish`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
      expect(body!.error.message).toContain('task');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 400 when tasks lack persona reference', async () => {
      const pendingStory = createMockStory({ workStatus: 'pending' });
      const taskWithoutPersona = createMockTask({
        id: 'bb0e8400-e29b-41d4-a716-446655440011',
        title: 'Task Without Persona',
        personaId: null,
      });

      mockStoryRepoFindById.mockResolvedValue(pendingStory);
      mockStoryRepoFindTasksForValidation.mockResolvedValue([taskWithoutPersona]);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/publish`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
      expect(body!.error.message).toContain('missing required fields');
      expect(body!.error.details).toBeDefined();
      const details = body!.error.details as {
        incompleteTasks: Array<{ id: string; title: string; missingFields: string[] }>;
      };
      expect(details.incompleteTasks).toBeDefined();
      expect(details.incompleteTasks).toHaveLength(1);
      expect(details.incompleteTasks[0]!.missingFields).toContain('personaId');
    });

    it('returns 400 when tasks lack acceptance criteria', async () => {
      const pendingStory = createMockStory({ workStatus: 'pending' });
      const taskWithoutCriteria = createMockTask({
        id: 'cc0e8400-e29b-41d4-a716-446655440012',
        title: 'Task Without Criteria',
        acceptanceCriteria: [],
      });

      mockStoryRepoFindById.mockResolvedValue(pendingStory);
      mockStoryRepoFindTasksForValidation.mockResolvedValue([taskWithoutCriteria]);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/publish`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
      expect(body!.error.details).toBeDefined();
      const details = body!.error.details as {
        incompleteTasks: Array<{ id: string; title: string; missingFields: string[] }>;
      };
      expect(details.incompleteTasks).toBeDefined();
      expect(details.incompleteTasks[0]!.missingFields).toContain('acceptanceCriteria');
    });

    it('returns 400 with incomplete task details for both missing fields', async () => {
      const pendingStory = createMockStory({ workStatus: 'pending' });
      const incompleteTask = createMockTask({
        id: 'dd0e8400-e29b-41d4-a716-446655440013',
        title: 'Incomplete Task',
        personaId: null,
        acceptanceCriteria: [],
      });

      mockStoryRepoFindById.mockResolvedValue(pendingStory);
      mockStoryRepoFindTasksForValidation.mockResolvedValue([incompleteTask]);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/publish`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
      const details = body!.error.details as {
        incompleteTasks: Array<{ id: string; title: string; missingFields: string[] }>;
      };
      expect(details.incompleteTasks[0]!.missingFields).toContain('personaId');
      expect(details.incompleteTasks[0]!.missingFields).toContain('acceptanceCriteria');
    });

    it('returns 409 INVALID_STATUS_TRANSITION when story is not in pending status', async () => {
      const readyStory = createMockStory({ workStatus: 'ready' });

      mockStoryRepoFindById.mockResolvedValue(readyStory);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/publish`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('INVALID_STATUS_TRANSITION');
      expect(body!.error.message).toContain('ready');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 404 when story does not exist', async () => {
      mockStoryRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${NONEXISTENT_UUID}/publish`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: NONEXISTENT_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('STORY_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/publish`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
    });

    it('returns 405 for non-POST methods', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/publish`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(405);
    });
  });

  // =========================================================================
  // POST .../reset -- Reset failed story
  // =========================================================================

  describe('POST .../stories/:id/reset', () => {
    it('resets failed story to not_started when no upstream deps are incomplete', async () => {
      const failedStory = createMockStory({
        workStatus: 'failed',
        assignedWorkerId: VALID_WORKER_UUID,
        assignedAt: now,
        attempts: 2,
      });
      const resetStory = createMockStory({
        workStatus: 'not_started',
        assignedWorkerId: null,
        assignedAt: null,
        attempts: 2,
        version: 1,
      });

      mockStoryRepoFindById.mockResolvedValue(failedStory);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      mockStoryRepoResetStory.mockResolvedValue(resetStory);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/reset`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await resetHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockStory } | undefined;
      expect(body!.data.workStatus).toBe('not_started');
      expect(body!.data.assignedWorkerId).toBeNull();
      expect(mockStoryRepoResetStory).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_STORY_UUID,
        'not_started',
      );
    });

    it('resets failed story to blocked when upstream deps are incomplete', async () => {
      const failedStory = createMockStory({
        workStatus: 'failed',
        assignedWorkerId: VALID_WORKER_UUID,
        assignedAt: now,
        attempts: 1,
      });
      const blockedStory = createMockStory({
        workStatus: 'blocked',
        assignedWorkerId: null,
        assignedAt: null,
        version: 1,
      });

      mockStoryRepoFindById.mockResolvedValue(failedStory);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(true);
      mockStoryRepoResetStory.mockResolvedValue(blockedStory);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/reset`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await resetHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockStory } | undefined;
      expect(body!.data.workStatus).toBe('blocked');
      expect(mockStoryRepoResetStory).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_STORY_UUID,
        'blocked',
      );
    });

    it('creates attempt history record on reset (via resetStory call)', async () => {
      const failedStory = createMockStory({
        workStatus: 'failed',
        assignedWorkerId: VALID_WORKER_UUID,
        assignedAt: now,
        attempts: 2,
      });
      const resetStory = createMockStory({
        workStatus: 'not_started',
        assignedWorkerId: null,
        assignedAt: null,
        version: 1,
      });

      mockStoryRepoFindById.mockResolvedValue(failedStory);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      mockStoryRepoResetStory.mockResolvedValue(resetStory);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/reset`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await resetHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      // The resetStory repo method handles attempt history atomically
      expect(mockStoryRepoResetStory).toHaveBeenCalledTimes(1);
      expect(mockStoryRepoResetStory).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_STORY_UUID,
        'not_started',
      );
    });

    it('clears assigned worker field on reset', async () => {
      const failedStory = createMockStory({
        workStatus: 'failed',
        assignedWorkerId: VALID_WORKER_UUID,
        assignedAt: now,
      });
      const resetStory = createMockStory({
        workStatus: 'not_started',
        assignedWorkerId: null,
        assignedAt: null,
        version: 1,
      });

      mockStoryRepoFindById.mockResolvedValue(failedStory);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      mockStoryRepoResetStory.mockResolvedValue(resetStory);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/reset`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await resetHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockStory } | undefined;
      expect(body!.data.assignedWorkerId).toBeNull();
      expect(body!.data.assignedAt).toBeNull();
    });

    it('returns 409 INVALID_STATUS_TRANSITION when story is not in failed status', async () => {
      const inProgressStory = createMockStory({ workStatus: 'in_progress' });

      mockStoryRepoFindById.mockResolvedValue(inProgressStory);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/reset`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await resetHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('INVALID_STATUS_TRANSITION');
      expect(body!.error.message).toContain('in_progress');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 404 when story does not exist', async () => {
      mockStoryRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${NONEXISTENT_UUID}/reset`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: NONEXISTENT_UUID },
      });
      const res = createMockResponse();

      await resetHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('STORY_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/reset`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await resetHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
    });

    it('rejects worker auth (human only) with 403', async () => {
      // Clear human session so it falls through to API key validation
      clearMockSession();

      // Configure validateApiKey to return a worker auth context
      const { validateApiKey } = await import('@/lib/middleware/api-key-validator');
      const mockedValidateApiKey = vi.mocked(validateApiKey);
      mockedValidateApiKey.mockResolvedValueOnce({
        type: 'agent',
        workerId: VALID_WORKER_UUID,
        workerName: 'Test Worker',
        tenantId: TEST_TENANT_ID,
        projectAccess: [VALID_PROJECT_UUID],
      });

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/reset`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
        headers: { authorization: 'Bearer test-api-key' },
      });
      const res = createMockResponse();

      await resetHandler(req, res);

      expect(res.getStatusCode()).toBe(403);
      const body = res.getJsonBody() as { error: { code: string; message: string } } | undefined;
      expect(body!.error.code).toBe('FORBIDDEN');
    });

    it('returns 405 for non-POST methods', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/reset`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await resetHandler(req, res);

      expect(res.getStatusCode()).toBe(405);
    });
  });

  // =========================================================================
  // POST .../unassign -- Unassign worker from in-progress story
  // =========================================================================

  describe('POST .../stories/:id/unassign', () => {
    it('unassigns worker and resets story status', async () => {
      const inProgressStory = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: VALID_WORKER_UUID,
        assignedAt: now,
        attempts: 1,
      });
      const resetStory = createMockStory({
        workStatus: 'not_started',
        assignedWorkerId: null,
        assignedAt: null,
        version: 1,
      });

      mockStoryRepoFindById.mockResolvedValue(inProgressStory);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      mockStoryRepoUnassignStory.mockResolvedValue(resetStory);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/unassign`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
        body: { confirmation: true },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockStory } | undefined;
      expect(body!.data.workStatus).toBe('not_started');
      expect(body!.data.assignedWorkerId).toBeNull();
      expect(mockStoryRepoUnassignStory).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_STORY_UUID,
        'not_started',
      );
    });

    it('requires confirmation in request body', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/unassign`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
        body: {},
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
      const fieldErrors = body!.error.details?.fieldErrors as Record<string, string[]> | undefined;
      expect(fieldErrors).toBeDefined();
      expect(fieldErrors!['body.confirmation']).toBeDefined();
    });

    it('returns 400 VALIDATION_FAILED when confirmation is false', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/unassign`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
        body: { confirmation: false },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
    });

    it('resets in-progress tasks to not_started (via unassignStory call)', async () => {
      const inProgressStory = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: VALID_WORKER_UUID,
        assignedAt: now,
      });
      const resetStory = createMockStory({
        workStatus: 'not_started',
        assignedWorkerId: null,
        assignedAt: null,
        version: 1,
      });

      mockStoryRepoFindById.mockResolvedValue(inProgressStory);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      mockStoryRepoUnassignStory.mockResolvedValue(resetStory);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/unassign`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
        body: { confirmation: true },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      // The unassignStory repo method handles in-progress task reset atomically
      expect(mockStoryRepoUnassignStory).toHaveBeenCalledTimes(1);
      expect(mockStoryRepoUnassignStory).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_STORY_UUID,
        'not_started',
      );
    });

    it('logs attempt with reason "manual_unassignment" (via unassignStory call)', async () => {
      const inProgressStory = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: VALID_WORKER_UUID,
        assignedAt: now,
        attempts: 1,
      });
      const resetStory = createMockStory({
        workStatus: 'not_started',
        assignedWorkerId: null,
        assignedAt: null,
        version: 1,
      });

      mockStoryRepoFindById.mockResolvedValue(inProgressStory);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      mockStoryRepoUnassignStory.mockResolvedValue(resetStory);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/unassign`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
        body: { confirmation: true },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      // The unassignStory repo method logs the attempt with reason "manual_unassignment"
      // We verify the method was called correctly; the repo handles the logging
      expect(mockStoryRepoUnassignStory).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_STORY_UUID,
        'not_started',
      );
    });

    it('returns 409 INVALID_STATUS_TRANSITION when story is not in_progress', async () => {
      const pendingStory = createMockStory({ workStatus: 'pending' });

      mockStoryRepoFindById.mockResolvedValue(pendingStory);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/unassign`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
        body: { confirmation: true },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('INVALID_STATUS_TRANSITION');
      expect(body!.error.message).toContain('pending');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 404 when story does not exist', async () => {
      mockStoryRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${NONEXISTENT_UUID}/unassign`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: NONEXISTENT_UUID },
        body: { confirmation: true },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('STORY_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/unassign`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
        body: { confirmation: true },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
    });

    it('rejects worker auth (human only) with 403', async () => {
      clearMockSession();

      const { validateApiKey } = await import('@/lib/middleware/api-key-validator');
      const mockedValidateApiKey = vi.mocked(validateApiKey);
      mockedValidateApiKey.mockResolvedValueOnce({
        type: 'agent',
        workerId: VALID_WORKER_UUID,
        workerName: 'Test Worker',
        tenantId: TEST_TENANT_ID,
        projectAccess: [VALID_PROJECT_UUID],
      });

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/unassign`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
        body: { confirmation: true },
        headers: { authorization: 'Bearer test-api-key' },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(403);
      const body = res.getJsonBody() as { error: { code: string; message: string } } | undefined;
      expect(body!.error.code).toBe('FORBIDDEN');
    });

    it('returns 405 for non-POST methods', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}/unassign`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await unassignHandler(req, res);

      expect(res.getStatusCode()).toBe(405);
    });
  });

  // =========================================================================
  // Cost Fields (read-only from CRUD)
  // =========================================================================

  describe('Cost Fields', () => {
    it('GET response includes cost fields (costEstimate, actualCost)', async () => {
      const storyWithCosts = createMockStoryWithTaskCount({
        costEstimate: '250.00',
        actualCost: '200.50',
        taskCount: 3,
      });
      mockStoryRepoFindWithTaskCount.mockResolvedValue(storyWithCosts);

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockStoryWithTaskCount } | undefined;
      expect(body!.data.costEstimate).toBe('250.00');
      expect(body!.data.actualCost).toBe('200.50');
    });

    it('PATCH does not allow setting cost fields (they are stripped by schema)', async () => {
      const existing = createMockStory({ version: 1 });
      const updated = createMockStory({ version: 2, title: 'Updated' });

      mockStoryRepoFindById.mockResolvedValue(existing);
      mockStoryRepoUpdate.mockResolvedValue(updated);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/stories/${VALID_STORY_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID, storyId: VALID_STORY_UUID },
        body: {
          title: 'Updated',
          costEstimate: '999.99',
          actualCost: '500.00',
          version: 1,
        },
      });
      const res = createMockResponse();

      await storyDetailHandler(req, res);

      // The update should succeed, but cost fields should NOT have been passed to the repo
      expect(res.getStatusCode()).toBe(200);
      expect(mockStoryRepoUpdate).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_STORY_UUID,
        { title: 'Updated' },
        1,
      );
      // Verify the repo was NOT called with cost fields
      const updateCall = mockStoryRepoUpdate.mock.calls[0];
      expect(updateCall).toBeDefined();
      const updateData = updateCall[2];
      expect(updateData).not.toHaveProperty('costEstimate');
      expect(updateData).not.toHaveProperty('actualCost');
    });
  });
});
