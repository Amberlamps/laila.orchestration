/**
 * @module epics.integration.test
 *
 * Integration tests for all epic API endpoints:
 *
 * - POST   /api/v1/projects/:projectId/epics           -- Create an epic
 * - GET    /api/v1/projects/:projectId/epics           -- List epics (paginated)
 * - GET    /api/v1/projects/:projectId/epics/:epicId   -- Get epic detail with stats
 * - PATCH  /api/v1/projects/:projectId/epics/:epicId   -- Update epic fields
 * - DELETE /api/v1/projects/:projectId/epics/:epicId   -- Soft-delete epic (cascade)
 * - POST   /api/v1/projects/:projectId/epics/:epicId/publish -- Transition Draft -> Ready
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
 * - Authentication enforcement
 * - Pagination metadata
 * - Soft-delete cascade behavior
 * - Lifecycle transition pre-conditions
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

interface MockEpicWithStoryCounts extends MockEpic {
  storyCounts: Record<string, number>;
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

const createMockEpicWithStoryCounts = (
  overrides: Partial<MockEpicWithStoryCounts> = {},
): MockEpicWithStoryCounts => ({
  ...createMockEpic(overrides),
  storyCounts: {},
  ...overrides,
});

const createMockStory = (overrides: Partial<MockStory> = {}): MockStory => ({
  id: '770e8400-e29b-41d4-a716-446655440002',
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

// ---------------------------------------------------------------------------
// Mock repository functions
// ---------------------------------------------------------------------------

const mockProjectRepoFindById =
  vi.fn<(tenantId: string, id: string) => Promise<MockProject | null>>();

const mockEpicRepoCreate =
  vi.fn<
    (
      tenantId: string,
      projectId: string,
      data: { name: string; description?: string | null },
    ) => Promise<MockEpic>
  >();
const mockEpicRepoFindByProject = vi.fn();
const mockEpicRepoFindById = vi.fn<(tenantId: string, id: string) => Promise<MockEpic | null>>();
const mockEpicRepoFindWithStoryCounts =
  vi.fn<(tenantId: string, epicId: string) => Promise<MockEpicWithStoryCounts | null>>();
const mockEpicRepoUpdate =
  vi.fn<
    (
      tenantId: string,
      id: string,
      data: Record<string, unknown>,
      version: number,
    ) => Promise<MockEpic>
  >();
const mockEpicRepoSoftDelete = vi.fn<(tenantId: string, id: string) => Promise<MockEpic | null>>();

const mockStoryRepoFindAllByEpic =
  vi.fn<(tenantId: string, epicId: string) => Promise<MockStory[]>>();

const mockValidateTransition = vi.fn();

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
 * Mock @/lib/middleware/api-key-validator -- always returns null
 * (no API key auth in epic tests; these are human-only routes).
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
    create: mockEpicRepoCreate,
    findByProject: mockEpicRepoFindByProject,
    findById: mockEpicRepoFindById,
    findWithStoryCounts: mockEpicRepoFindWithStoryCounts,
    update: mockEpicRepoUpdate,
    softDelete: mockEpicRepoSoftDelete,
  })),
  createStoryRepository: vi.fn(() => ({
    findAllByEpic: mockStoryRepoFindAllByEpic,
  })),
}));

/**
 * Mock @laila/domain -- provides transition validation.
 * The real implementation is pure (no side effects) so we can use a
 * simplified mock that returns valid/invalid based on test setup.
 */
vi.mock('@laila/domain', () => ({
  validateTransition: (...args: unknown[]) => mockValidateTransition(...args),
  EPIC_LIFECYCLE_TRANSITIONS: {
    pending: ['ready'] as const,
    ready: [] as const,
  },
}));

// ---------------------------------------------------------------------------
// Import handlers AFTER mocks are registered
// ---------------------------------------------------------------------------

const { default: epicCollectionHandler } = await import('@/pages/api/v1/projects/[id]/epics/index');
const { default: epicDetailHandler } = await import('@/pages/api/v1/projects/[id]/epics/[epicId]');
const { default: publishHandler } =
  await import('@/pages/api/v1/projects/[id]/epics/[epicId]/publish');

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

describe('Epic API Integration Tests', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setMockSession();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    clearMockSession();
    vi.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/epics -- Create epic
  // =========================================================================

  describe('POST /api/v1/projects/:projectId/epics', () => {
    it('creates an epic in Draft status and returns 201', async () => {
      const project = createMockProject();
      const newEpic = createMockEpic({ name: 'New Epic', description: 'Epic description' });

      mockProjectRepoFindById.mockResolvedValue(project);
      mockEpicRepoCreate.mockResolvedValue(newEpic);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics`,
        query: { id: VALID_PROJECT_UUID },
        body: {
          name: 'New Epic',
          description: 'Epic description',
        },
      });
      const res = createMockResponse();

      await epicCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(201);
      const body = res.getJsonBody() as { data: MockEpic } | undefined;
      expect(body).toBeDefined();
      expect(body!.data.name).toBe('New Epic');
      expect(body!.data.description).toBe('Epic description');
      expect(body!.data.workStatus).toBe('pending');
      expect(mockEpicRepoCreate).toHaveBeenCalledWith(TEST_TENANT_ID, VALID_PROJECT_UUID, {
        name: 'New Epic',
        description: 'Epic description',
      });
    });

    it('returns 404 when parent project does not exist', async () => {
      mockProjectRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${NONEXISTENT_UUID}/epics`,
        query: { id: NONEXISTENT_UUID },
        body: {
          name: 'Orphan Epic',
        },
      });
      const res = createMockResponse();

      await epicCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body).toBeDefined();
      expect(body!.error.code).toBe('PROJECT_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 400 with VALIDATION_FAILED for missing name', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics`,
        query: { id: VALID_PROJECT_UUID },
        body: {},
      });
      const res = createMockResponse();

      await epicCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body).toBeDefined();
      expect(body!.error.code).toBe('VALIDATION_FAILED');
      expect(body!.error.message).toBe('Request validation failed');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
      expect(body!.error.details).toBeDefined();
      const fieldErrors = body!.error.details!.fieldErrors as Record<string, string[]>;
      expect(fieldErrors).toHaveProperty('body.name');
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics`,
        query: { id: VALID_PROJECT_UUID },
        body: {
          name: 'Unauthorized Epic',
        },
      });
      const res = createMockResponse();

      await epicCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
      const body = res.getJsonBody() as { error: { code: string; message: string } } | undefined;
      expect(body!.error.code).toBe('UNAUTHORIZED');
      expect(body!.error.message).toBe('Authentication required');
    });

    it('returns 405 for unsupported HTTP methods', async () => {
      const req = createMockRequest({
        method: 'PUT',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics`,
        query: { id: VALID_PROJECT_UUID },
      });
      const res = createMockResponse();

      await epicCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(405);
      const body = res.getJsonBody() as { error: { code: string; message: string } } | undefined;
      expect(body!.error.code).toBe('METHOD_NOT_ALLOWED');
    });
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/epics -- List epics (paginated)
  // =========================================================================

  describe('GET /api/v1/projects/:projectId/epics', () => {
    it('returns paginated list of epics with 200', async () => {
      const epics = [
        createMockEpic({
          id: '11111111-1111-4111-a111-111111111111',
          name: 'Epic A',
        }),
        createMockEpic({
          id: '22222222-2222-4222-a222-222222222222',
          name: 'Epic B',
        }),
      ];
      mockEpicRepoFindByProject.mockResolvedValue({
        data: epics,
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
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics`,
        query: { id: VALID_PROJECT_UUID },
      });
      const res = createMockResponse();

      await epicCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as
        | {
            data: MockEpic[];
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
      expect(body!.pagination.page).toBe(1);
      expect(body!.pagination.limit).toBe(20);
      expect(body!.pagination.total).toBe(2);
      expect(body!.pagination.totalPages).toBe(1);
      expect(body!.pagination.hasNext).toBe(false);
      expect(body!.pagination.hasPrev).toBe(false);
    });

    it('returns only non-deleted epics', async () => {
      const activeEpic = createMockEpic({ name: 'Active Epic', deletedAt: null });
      mockEpicRepoFindByProject.mockResolvedValue({
        data: [activeEpic],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics`,
        query: { id: VALID_PROJECT_UUID },
      });
      const res = createMockResponse();

      await epicCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockEpic[] } | undefined;
      expect(body).toBeDefined();
      expect(body!.data).toHaveLength(1);
      expect(body!.data[0]!.deletedAt).toBeNull();
    });

    it('includes derived work status for each epic', async () => {
      const epicWithStatus = createMockEpic({
        name: 'Epic With Status',
        workStatus: 'in_progress',
      });
      mockEpicRepoFindByProject.mockResolvedValue({
        data: [epicWithStatus],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics`,
        query: { id: VALID_PROJECT_UUID },
      });
      const res = createMockResponse();

      await epicCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockEpic[] } | undefined;
      expect(body).toBeDefined();
      expect(body!.data[0]!.workStatus).toBe('in_progress');
    });

    it('supports status filter query parameter', async () => {
      mockEpicRepoFindByProject.mockResolvedValue({
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
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics?status=pending`,
        query: { id: VALID_PROJECT_UUID, status: 'pending' },
      });
      const res = createMockResponse();

      await epicCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      expect(mockEpicRepoFindByProject).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_PROJECT_UUID,
        expect.objectContaining({
          status: 'pending',
        }),
      );
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics`,
        query: { id: VALID_PROJECT_UUID },
      });
      const res = createMockResponse();

      await epicCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
      const body = res.getJsonBody() as { error: { code: string; message: string } } | undefined;
      expect(body!.error.code).toBe('UNAUTHORIZED');
    });
  });

  // =========================================================================
  // GET /api/v1/projects/:projectId/epics/:epicId -- Get epic detail
  // =========================================================================

  describe('GET /api/v1/projects/:projectId/epics/:epicId', () => {
    it('returns epic with summary statistics and 200', async () => {
      const epicWithStats = createMockEpicWithStoryCounts({
        storyCounts: { pending: 3, ready: 2, done: 1 },
      });
      mockEpicRepoFindWithStoryCounts.mockResolvedValue(epicWithStats);

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await epicDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockEpicWithStoryCounts } | undefined;
      expect(body).toBeDefined();
      expect(body!.data.id).toBe(VALID_EPIC_UUID);
      expect(body!.data.storyCounts).toEqual({ pending: 3, ready: 2, done: 1 });
    });

    it('returns 404 for non-existent epic', async () => {
      mockEpicRepoFindWithStoryCounts.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${NONEXISTENT_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: NONEXISTENT_UUID },
      });
      const res = createMockResponse();

      await epicDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('EPIC_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 404 for soft-deleted epic (repo returns null)', async () => {
      mockEpicRepoFindWithStoryCounts.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await epicDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('EPIC_NOT_FOUND');
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await epicDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
      const body = res.getJsonBody() as { error: { code: string; message: string } } | undefined;
      expect(body!.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 404 when epic belongs to a different project', async () => {
      const OTHER_PROJECT_UUID = '990e8400-e29b-41d4-a716-446655440099';
      const epicInOtherProject = createMockEpicWithStoryCounts({
        projectId: OTHER_PROJECT_UUID,
      });
      mockEpicRepoFindWithStoryCounts.mockResolvedValue(epicInOtherProject);

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await epicDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('EPIC_NOT_FOUND');
    });

    it('returns 400 for invalid epicId UUID format', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/not-a-uuid`,
        query: { id: VALID_PROJECT_UUID, epicId: 'not-a-uuid' },
      });
      const res = createMockResponse();

      await epicDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
      const fieldErrors = body!.error.details?.fieldErrors as Record<string, string[]> | undefined;
      expect(fieldErrors).toBeDefined();
      expect(fieldErrors!['params.epicId']).toBeDefined();
    });
  });

  // =========================================================================
  // PATCH /api/v1/projects/:projectId/epics/:epicId -- Update epic
  // =========================================================================

  describe('PATCH /api/v1/projects/:projectId/epics/:epicId', () => {
    it('updates epic fields and returns 200', async () => {
      const project = createMockProject({ lifecycleStatus: 'draft' });
      const existingEpic = createMockEpic({ version: 1 });
      const updatedEpic = createMockEpic({
        name: 'Updated Epic',
        version: 2,
      });

      mockProjectRepoFindById.mockResolvedValue(project);
      mockEpicRepoFindById.mockResolvedValue(existingEpic);
      mockEpicRepoUpdate.mockResolvedValue(updatedEpic);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
        body: { name: 'Updated Epic', version: 1 },
      });
      const res = createMockResponse();

      await epicDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockEpic } | undefined;
      expect(body!.data.name).toBe('Updated Epic');
      expect(body!.data.version).toBe(2);
    });

    it('returns 404 when parent project does not exist', async () => {
      mockProjectRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${NONEXISTENT_UUID}/epics/${VALID_EPIC_UUID}`,
        query: { id: NONEXISTENT_UUID, epicId: VALID_EPIC_UUID },
        body: { name: 'No Project', version: 0 },
      });
      const res = createMockResponse();

      await epicDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('PROJECT_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 409 READ_ONLY_VIOLATION when parent project is not in Draft', async () => {
      const readyProject = createMockProject({
        lifecycleStatus: 'ready',
        version: 1,
      });
      mockProjectRepoFindById.mockResolvedValue(readyProject);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
        body: { name: 'Cannot Update', version: 0 },
      });
      const res = createMockResponse();

      await epicDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('READ_ONLY_VIOLATION');
      expect(body!.error.message).toContain('ready');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 404 when epic does not exist', async () => {
      const project = createMockProject({ lifecycleStatus: 'draft' });
      mockProjectRepoFindById.mockResolvedValue(project);
      mockEpicRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${NONEXISTENT_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: NONEXISTENT_UUID },
        body: { name: 'Missing Epic', version: 0 },
      });
      const res = createMockResponse();

      await epicDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('EPIC_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 409 OPTIMISTIC_LOCK_CONFLICT on version mismatch', async () => {
      const project = createMockProject({ lifecycleStatus: 'draft' });
      const existingEpic = createMockEpic({ version: 5 });

      mockProjectRepoFindById.mockResolvedValue(project);
      mockEpicRepoFindById.mockResolvedValue(existingEpic);

      const conflictError = new Error('Conflict');
      conflictError.name = 'ConflictError';
      mockEpicRepoUpdate.mockRejectedValue(conflictError);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
        body: { name: 'Stale Update', version: 5 },
      });
      const res = createMockResponse();

      await epicDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('OPTIMISTIC_LOCK_CONFLICT');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('updates sortOrder and returns 200', async () => {
      const project = createMockProject({ lifecycleStatus: 'draft' });
      const existingEpic = createMockEpic({ version: 1, sortOrder: 0 });
      const updatedEpic = createMockEpic({ sortOrder: 5, version: 2 });

      mockProjectRepoFindById.mockResolvedValue(project);
      mockEpicRepoFindById.mockResolvedValue(existingEpic);
      mockEpicRepoUpdate.mockResolvedValue(updatedEpic);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
        body: { sortOrder: 5, version: 1 },
      });
      const res = createMockResponse();

      await epicDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockEpic } | undefined;
      expect(body!.data.sortOrder).toBe(5);
      expect(mockEpicRepoUpdate).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_EPIC_UUID,
        { sortOrder: 5 },
        1,
      );
    });

    it('returns 400 for missing version field', async () => {
      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
        body: { name: 'No Version' },
      });
      const res = createMockResponse();

      await epicDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
      const fieldErrors = body!.error.details?.fieldErrors as Record<string, string[]> | undefined;
      expect(fieldErrors).toBeDefined();
      expect(fieldErrors!['body.version']).toBeDefined();
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
        body: { name: 'Unauth', version: 0 },
      });
      const res = createMockResponse();

      await epicDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
    });
  });

  // =========================================================================
  // DELETE /api/v1/projects/:projectId/epics/:epicId -- Soft-delete epic
  // =========================================================================

  describe('DELETE /api/v1/projects/:projectId/epics/:epicId', () => {
    it('soft-deletes epic and returns 204', async () => {
      const existingEpic = createMockEpic();
      const deletedEpic = createMockEpic({ deletedAt: now });
      mockEpicRepoFindById.mockResolvedValue(existingEpic);
      mockEpicRepoSoftDelete.mockResolvedValue(deletedEpic);

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await epicDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(204);
      expect(res.wasEnded()).toBe(true);
      expect(mockEpicRepoSoftDelete).toHaveBeenCalledWith(TEST_TENANT_ID, VALID_EPIC_UUID);
    });

    it('returns 404 when epic does not exist', async () => {
      mockEpicRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${NONEXISTENT_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: NONEXISTENT_UUID },
      });
      const res = createMockResponse();

      await epicDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('EPIC_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 404 when epic belongs to a different project', async () => {
      const OTHER_PROJECT_UUID = '990e8400-e29b-41d4-a716-446655440099';
      const epicInOtherProject = createMockEpic({ projectId: OTHER_PROJECT_UUID });
      mockEpicRepoFindById.mockResolvedValue(epicInOtherProject);

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await epicDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('EPIC_NOT_FOUND');
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await epicDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
    });

    it('cascades soft-delete to child stories via repository', async () => {
      const existingEpic = createMockEpic();
      const deletedEpic = createMockEpic({ deletedAt: now });
      mockEpicRepoFindById.mockResolvedValue(existingEpic);
      mockEpicRepoSoftDelete.mockResolvedValue(deletedEpic);

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await epicDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(204);
      // Verify softDelete (which handles cascade internally) was called
      expect(mockEpicRepoSoftDelete).toHaveBeenCalledTimes(1);
      expect(mockEpicRepoSoftDelete).toHaveBeenCalledWith(TEST_TENANT_ID, VALID_EPIC_UUID);
    });
  });

  // =========================================================================
  // POST /api/v1/projects/:projectId/epics/:epicId/publish -- Publish epic
  // =========================================================================

  describe('POST /api/v1/projects/:projectId/epics/:epicId/publish', () => {
    it('publishes when all stories are Ready and returns 200', async () => {
      const draftEpic = createMockEpic({ workStatus: 'pending', version: 1 });
      const readyEpic = createMockEpic({ workStatus: 'ready', version: 2 });
      const project = createMockProject({ lifecycleStatus: 'draft' });
      const readyStory = createMockStory({ workStatus: 'ready' });

      mockEpicRepoFindById.mockResolvedValue(draftEpic);
      mockValidateTransition.mockReturnValue({ valid: true, from: 'pending', to: 'ready' });
      mockProjectRepoFindById.mockResolvedValue(project);
      mockStoryRepoFindAllByEpic.mockResolvedValue([readyStory]);
      mockEpicRepoUpdate.mockResolvedValue(readyEpic);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/publish`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockEpic } | undefined;
      expect(body!.data.workStatus).toBe('ready');
      // Publish bumps version/updatedAt without setting workStatus directly
      // (workStatus is derived at read time from child story statuses)
      expect(mockEpicRepoUpdate).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_EPIC_UUID,
        {},
        1, // current version
      );
    });

    it('returns 404 when epic does not exist', async () => {
      mockEpicRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${NONEXISTENT_UUID}/publish`,
        query: { id: VALID_PROJECT_UUID, epicId: NONEXISTENT_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('EPIC_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 404 when epic belongs to a different project', async () => {
      const OTHER_PROJECT_UUID = '990e8400-e29b-41d4-a716-446655440099';
      const epicInOtherProject = createMockEpic({
        workStatus: 'pending',
        projectId: OTHER_PROJECT_UUID,
      });
      mockEpicRepoFindById.mockResolvedValue(epicInOtherProject);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/publish`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('EPIC_NOT_FOUND');
    });

    it('returns 409 INVALID_STATUS_TRANSITION when epic is not in Draft', async () => {
      const readyEpic = createMockEpic({ workStatus: 'ready' });
      mockEpicRepoFindById.mockResolvedValue(readyEpic);
      mockValidateTransition.mockReturnValue({
        valid: false,
        from: 'ready',
        to: 'ready',
        reason:
          'Transition from "ready" to "ready" is not allowed. Valid targets: [none (terminal state)]',
      });

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/publish`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('INVALID_STATUS_TRANSITION');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 404 when parent project does not exist', async () => {
      // Epic must match route projectId to pass project scoping check
      const draftEpic = createMockEpic({
        workStatus: 'pending',
        projectId: VALID_PROJECT_UUID,
      });
      mockEpicRepoFindById.mockResolvedValue(draftEpic);
      mockValidateTransition.mockReturnValue({ valid: true, from: 'pending', to: 'ready' });
      mockProjectRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/publish`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('PROJECT_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 409 when parent project is not in Draft', async () => {
      const draftEpic = createMockEpic({ workStatus: 'pending' });
      const readyProject = createMockProject({ lifecycleStatus: 'ready' });

      mockEpicRepoFindById.mockResolvedValue(draftEpic);
      mockValidateTransition.mockReturnValue({ valid: true, from: 'pending', to: 'ready' });
      mockProjectRepoFindById.mockResolvedValue(readyProject);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/publish`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('INVALID_STATUS_TRANSITION');
      expect(body!.error.message).toContain('ready');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 400 when epic has no stories', async () => {
      const draftEpic = createMockEpic({ workStatus: 'pending' });
      const project = createMockProject({ lifecycleStatus: 'draft' });

      mockEpicRepoFindById.mockResolvedValue(draftEpic);
      mockValidateTransition.mockReturnValue({ valid: true, from: 'pending', to: 'ready' });
      mockProjectRepoFindById.mockResolvedValue(project);
      mockStoryRepoFindAllByEpic.mockResolvedValue([]);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/publish`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
      expect(body!.error.message).toContain('story');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 400 when stories are not all Ready', async () => {
      const draftEpic = createMockEpic({ workStatus: 'pending' });
      const project = createMockProject({ lifecycleStatus: 'draft' });
      const readyStory = createMockStory({
        id: '111e8400-e29b-41d4-a716-446655440001',
        title: 'Ready Story',
        workStatus: 'ready',
      });
      const pendingStory = createMockStory({
        id: '222e8400-e29b-41d4-a716-446655440002',
        title: 'Pending Story',
        workStatus: 'pending',
      });

      mockEpicRepoFindById.mockResolvedValue(draftEpic);
      mockValidateTransition.mockReturnValue({ valid: true, from: 'pending', to: 'ready' });
      mockProjectRepoFindById.mockResolvedValue(project);
      mockStoryRepoFindAllByEpic.mockResolvedValue([readyStory, pendingStory]);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/publish`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
      expect(body!.error.message).toContain('not in Ready status');
      // Verify non-ready story details are included
      expect(body!.error.details).toBeDefined();
      const details = body!.error.details as {
        nonReadyStories: Array<{ id: string; title: string; workStatus: string }>;
      };
      expect(details.nonReadyStories).toBeDefined();
      expect(details.nonReadyStories).toHaveLength(1);
      const firstStory = details.nonReadyStories[0]!;
      expect(firstStory.workStatus).toBe('pending');
      expect(firstStory.title).toBe('Pending Story');
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/publish`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
    });

    it('returns 405 for non-POST methods', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_PROJECT_UUID}/epics/${VALID_EPIC_UUID}/publish`,
        query: { id: VALID_PROJECT_UUID, epicId: VALID_EPIC_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(405);
    });
  });
});
