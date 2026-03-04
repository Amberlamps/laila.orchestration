/**
 * @module projects.integration.test
 *
 * Integration tests for all project API endpoints:
 *
 * - POST   /api/v1/projects        -- Create a project
 * - GET    /api/v1/projects        -- List projects (paginated)
 * - GET    /api/v1/projects/:id    -- Get project detail with stats
 * - PATCH  /api/v1/projects/:id    -- Update project fields
 * - DELETE /api/v1/projects/:id    -- Hard-delete project (cascade)
 * - POST   /api/v1/projects/:id/publish -- Transition Draft -> Ready
 * - POST   /api/v1/projects/:id/revert  -- Transition Ready -> Draft
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
 * - Cascade delete behavior
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

import type { MockApiResponse } from '@/__tests__/helpers/mock-api';

// ---------------------------------------------------------------------------
// UUID for tests
// ---------------------------------------------------------------------------

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const NONEXISTENT_UUID = '00000000-0000-4000-a000-000000000000';

// ---------------------------------------------------------------------------
// Mock project data
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

interface MockProjectWithStats extends MockProject {
  epicCounts: Array<{ status: string; count: number }>;
  storyCounts: Array<{ status: string; count: number }>;
  totalEpics: number;
  totalStories: number;
  completionPercentage: number;
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

const now = new Date('2025-06-01T12:00:00Z');

const createMockProject = (overrides: Partial<MockProject> = {}): MockProject => ({
  id: VALID_UUID,
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

const createMockProjectWithStats = (
  overrides: Partial<MockProjectWithStats> = {},
): MockProjectWithStats => ({
  ...createMockProject(overrides),
  epicCounts: [],
  storyCounts: [],
  totalEpics: 0,
  totalStories: 0,
  completionPercentage: 0,
  ...overrides,
});

const createMockEpic = (overrides: Partial<MockEpic> = {}): MockEpic => ({
  id: '660e8400-e29b-41d4-a716-446655440001',
  tenantId: TEST_TENANT_ID,
  projectId: VALID_UUID,
  name: 'Test Epic',
  description: null,
  workStatus: 'ready',
  sortOrder: 0,
  version: 0,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  ...overrides,
});

const createMockStory = (overrides: Partial<MockStory> = {}): MockStory => ({
  id: '770e8400-e29b-41d4-a716-446655440002',
  tenantId: TEST_TENANT_ID,
  epicId: '660e8400-e29b-41d4-a716-446655440001',
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

const mockProjectRepoCreate =
  vi.fn<
    (tenantId: string, data: { name: string; description?: string | null }) => Promise<MockProject>
  >();
const mockProjectRepoFindById =
  vi.fn<(tenantId: string, id: string) => Promise<MockProject | null>>();
const mockProjectRepoFindByTenant = vi.fn();
const mockProjectRepoFindWithStats =
  vi.fn<(tenantId: string, id: string) => Promise<MockProjectWithStats>>();
const mockProjectRepoUpdate =
  vi.fn<
    (
      tenantId: string,
      id: string,
      data: Record<string, string | null>,
      version: number,
    ) => Promise<MockProject>
  >();
const mockProjectRepoHardDeleteCascade =
  vi.fn<(tenantId: string, id: string) => Promise<MockProject>>();

const mockEpicRepoFindAllByProject =
  vi.fn<(tenantId: string, projectId: string) => Promise<MockEpic[]>>();

const mockStoryRepoFindActiveByProject =
  vi.fn<(tenantId: string, projectId: string) => Promise<MockStory[]>>();

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
 * (no API key auth in project tests; these are human-only routes).
 */
vi.mock('@/lib/middleware/api-key-validator', () => ({
  validateApiKey: vi.fn(async () => null),
}));

/**
 * Mock @laila/database -- provides mock repository factories and getDb.
 */
vi.mock('@laila/database', () => ({
  getDb: vi.fn(() => ({})),
  writeAuditEventFireAndForget: vi.fn(),
  createProjectRepository: vi.fn(() => ({
    create: mockProjectRepoCreate,
    findById: mockProjectRepoFindById,
    findByTenant: mockProjectRepoFindByTenant,
    findWithStats: mockProjectRepoFindWithStats,
    update: mockProjectRepoUpdate,
    hardDeleteCascade: mockProjectRepoHardDeleteCascade,
  })),
  createEpicRepository: vi.fn(() => ({
    findAllByProject: mockEpicRepoFindAllByProject,
  })),
  createStoryRepository: vi.fn(() => ({
    findActiveByProject: mockStoryRepoFindActiveByProject,
  })),
}));

/**
 * Mock @laila/domain -- provides transition validation.
 * The real implementation is pure (no side effects) so we can use a
 * simplified mock that returns valid/invalid based on test setup.
 */
const mockValidateTransition = vi.fn();
vi.mock('@laila/domain', () => ({
  validateTransition: (...args: unknown[]) => mockValidateTransition(...args),
  PROJECT_TRANSITIONS: {
    draft: ['ready'] as const,
    ready: ['draft', 'in-progress'] as const,
    'in-progress': ['complete'] as const,
    complete: [] as const,
  },
}));

// ---------------------------------------------------------------------------
// Import handlers AFTER mocks are registered
// ---------------------------------------------------------------------------

const { default: projectCollectionHandler } = await import('@/pages/api/v1/projects/index');
const { default: projectDetailHandler } = await import('@/pages/api/v1/projects/[id]');
const { default: publishHandler } = await import('@/pages/api/v1/projects/[id]/publish');
const { default: revertHandler } = await import('@/pages/api/v1/projects/[id]/revert');

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Project API Integration Tests', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Set up authenticated session by default
    setMockSession();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    clearMockSession();
    vi.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  // =========================================================================
  // POST /api/v1/projects -- Create project
  // =========================================================================

  describe('POST /api/v1/projects', () => {
    it('creates a project in Draft status and returns 201', async () => {
      const newProject = createMockProject({ name: 'New Project', description: 'Description' });
      mockProjectRepoCreate.mockResolvedValue(newProject);

      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/projects',
        body: {
          name: 'New Project',
          description: 'Description',
          lifecycleStatus: 'draft',
          workerInactivityTimeoutMinutes: 30,
        },
      });
      const res = createMockResponse();

      await projectCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(201);
      const body = res.getJsonBody() as { data: MockProject } | undefined;
      expect(body).toBeDefined();
      expect(body!.data.name).toBe('New Project');
      expect(body!.data.description).toBe('Description');
      expect(body!.data.lifecycleStatus).toBe('draft');
      expect(mockProjectRepoCreate).toHaveBeenCalledWith(TEST_TENANT_ID, {
        name: 'New Project',
        description: 'Description',
        workerInactivityTimeoutMinutes: 30,
      });
    });

    it('creates a project with name and null description', async () => {
      const newProject = createMockProject({ name: 'Minimal Project', description: null });
      mockProjectRepoCreate.mockResolvedValue(newProject);

      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/projects',
        body: {
          name: 'Minimal Project',
          description: null,
          lifecycleStatus: 'draft',
          workerInactivityTimeoutMinutes: 30,
        },
      });
      const res = createMockResponse();

      await projectCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(201);
      const body = res.getJsonBody() as { data: MockProject } | undefined;
      expect(body).toBeDefined();
      expect(body!.data.name).toBe('Minimal Project');
      expect(body!.data.description).toBeNull();
    });

    it('returns 400 with VALIDATION_FAILED for missing name', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/projects',
        body: {},
      });
      const res = createMockResponse();

      await projectCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as
        | {
            error: {
              code: string;
              message: string;
              details?: Record<string, unknown>;
              requestId: string;
            };
          }
        | undefined;
      expect(body).toBeDefined();
      expect(body!.error.code).toBe('VALIDATION_FAILED');
      expect(body!.error.message).toBe('Request validation failed');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
      // Verify field-level error details
      expect(body!.error.details).toBeDefined();
      const fieldErrors = body!.error.details!.fieldErrors as Record<string, string[]>;
      expect(fieldErrors).toHaveProperty('body.name');
    });

    it('returns 400 for empty name string', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/projects',
        body: { name: '' },
      });
      const res = createMockResponse();

      await projectCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as
        | {
            error: { code: string; details?: Record<string, unknown> };
          }
        | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
      const fieldErrors = body!.error.details?.fieldErrors as Record<string, string[]> | undefined;
      expect(fieldErrors).toBeDefined();
      expect(fieldErrors!['body.name']).toBeDefined();
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/projects',
        body: { name: 'Unauthorized Project' },
      });
      const res = createMockResponse();

      await projectCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
      const body = res.getJsonBody() as
        | {
            error: { code: string; message: string };
          }
        | undefined;
      expect(body!.error.code).toBe('UNAUTHORIZED');
      expect(body!.error.message).toBe('Authentication required');
    });

    it('returns 405 for unsupported HTTP methods', async () => {
      const req = createMockRequest({
        method: 'PUT',
        url: '/api/v1/projects',
      });
      const res = createMockResponse();

      await projectCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(405);
      const body = res.getJsonBody() as
        | {
            error: { code: string; message: string };
          }
        | undefined;
      expect(body!.error.code).toBe('METHOD_NOT_ALLOWED');
    });
  });

  // =========================================================================
  // GET /api/v1/projects -- List projects (paginated)
  // =========================================================================

  describe('GET /api/v1/projects', () => {
    it('returns paginated projects with default pagination', async () => {
      const projects = [
        createMockProject({ id: '11111111-1111-4111-a111-111111111111', name: 'Project A' }),
        createMockProject({ id: '22222222-2222-4222-a222-222222222222', name: 'Project B' }),
      ];
      mockProjectRepoFindByTenant.mockResolvedValue({
        data: projects,
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
        url: '/api/v1/projects',
        query: {},
      });
      const res = createMockResponse();

      await projectCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as
        | {
            data: MockProject[];
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

    it('passes pagination parameters to repository', async () => {
      mockProjectRepoFindByTenant.mockResolvedValue({
        data: [],
        pagination: {
          page: 2,
          limit: 10,
          total: 25,
          totalPages: 3,
          hasNext: true,
          hasPrev: true,
        },
      });

      const req = createMockRequest({
        method: 'GET',
        url: '/api/v1/projects?page=2&limit=10',
        query: { page: '2', limit: '10' },
      });
      const res = createMockResponse();

      await projectCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      expect(mockProjectRepoFindByTenant).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        expect.objectContaining({
          pagination: expect.objectContaining({
            page: 2,
            limit: 10,
          }),
        }),
      );
    });

    it('filters by status when provided', async () => {
      mockProjectRepoFindByTenant.mockResolvedValue({
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
        url: '/api/v1/projects?status=draft',
        query: { status: 'draft' },
      });
      const res = createMockResponse();

      await projectCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      expect(mockProjectRepoFindByTenant).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        expect.objectContaining({
          lifecycleStatus: 'draft',
        }),
      );
    });

    it('returns correct pagination metadata for hasNext and hasPrev', async () => {
      mockProjectRepoFindByTenant.mockResolvedValue({
        data: [createMockProject()],
        pagination: {
          page: 2,
          limit: 1,
          total: 3,
          totalPages: 3,
          hasNext: true,
          hasPrev: true,
        },
      });

      const req = createMockRequest({
        method: 'GET',
        url: '/api/v1/projects?page=2&limit=1',
        query: { page: '2', limit: '1' },
      });
      const res = createMockResponse();

      await projectCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as
        | {
            data: MockProject[];
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
      expect(body!.pagination.hasNext).toBe(true);
      expect(body!.pagination.hasPrev).toBe(true);
      expect(body!.pagination.totalPages).toBe(3);
    });

    it('sorts by createdAt desc by default', async () => {
      mockProjectRepoFindByTenant.mockResolvedValue({
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
        url: '/api/v1/projects',
        query: {},
      });
      const res = createMockResponse();

      await projectCollectionHandler(req, res);

      expect(mockProjectRepoFindByTenant).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        expect.objectContaining({
          pagination: expect.objectContaining({
            sortBy: 'createdAt',
            sortOrder: 'desc',
          }),
        }),
      );
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'GET',
        url: '/api/v1/projects',
        query: {},
      });
      const res = createMockResponse();

      await projectCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
      const body = res.getJsonBody() as
        | {
            error: { code: string; message: string };
          }
        | undefined;
      expect(body!.error.code).toBe('UNAUTHORIZED');
    });
  });

  // =========================================================================
  // GET /api/v1/projects/:id -- Get project detail
  // =========================================================================

  describe('GET /api/v1/projects/:id', () => {
    it('returns project with summary stats', async () => {
      const projectWithStats = createMockProjectWithStats({
        epicCounts: [
          { status: 'pending', count: 2 },
          { status: 'ready', count: 1 },
        ],
        storyCounts: [
          { status: 'pending', count: 5 },
          { status: 'done', count: 3 },
        ],
        totalEpics: 3,
        totalStories: 8,
        completionPercentage: 37.5,
      });
      mockProjectRepoFindWithStats.mockResolvedValue(projectWithStats);

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_UUID}`,
        query: { id: VALID_UUID },
      });
      const res = createMockResponse();

      await projectDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockProjectWithStats } | undefined;
      expect(body).toBeDefined();
      expect(body!.data.id).toBe(VALID_UUID);
      expect(body!.data.epicCounts).toHaveLength(2);
      expect(body!.data.storyCounts).toHaveLength(2);
      expect(body!.data.totalEpics).toBe(3);
      expect(body!.data.totalStories).toBe(8);
      expect(body!.data.completionPercentage).toBe(37.5);
    });

    it('returns 404 with PROJECT_NOT_FOUND for non-existent project', async () => {
      mockProjectRepoFindWithStats.mockRejectedValue(
        (() => {
          const err = new Error('Not found');
          err.name = 'NotFoundError';
          return err;
        })(),
      );

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${NONEXISTENT_UUID}`,
        query: { id: NONEXISTENT_UUID },
      });
      const res = createMockResponse();

      await projectDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as
        | {
            error: { code: string; message: string; requestId: string };
          }
        | undefined;
      expect(body!.error.code).toBe('PROJECT_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 400 for invalid UUID format in id parameter', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: '/api/v1/projects/not-a-uuid',
        query: { id: 'not-a-uuid' },
      });
      const res = createMockResponse();

      await projectDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as
        | {
            error: { code: string; details?: Record<string, unknown> };
          }
        | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
      const fieldErrors = body!.error.details?.fieldErrors as Record<string, string[]> | undefined;
      expect(fieldErrors).toBeDefined();
      expect(fieldErrors!['params.id']).toBeDefined();
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_UUID}`,
        query: { id: VALID_UUID },
      });
      const res = createMockResponse();

      await projectDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
      const body = res.getJsonBody() as
        | {
            error: { code: string; message: string };
          }
        | undefined;
      expect(body!.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 405 for unsupported methods', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_UUID}`,
        query: { id: VALID_UUID },
      });
      const res = createMockResponse();

      await projectDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(405);
    });
  });

  // =========================================================================
  // PATCH /api/v1/projects/:id -- Update project
  // =========================================================================

  describe('PATCH /api/v1/projects/:id', () => {
    it('updates project name and returns 200', async () => {
      const existingProject = createMockProject({ version: 1 });
      const updatedProject = createMockProject({
        name: 'Updated Name',
        version: 2,
      });

      mockProjectRepoFindById.mockResolvedValue(existingProject);
      mockProjectRepoUpdate.mockResolvedValue(updatedProject);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_UUID}`,
        query: { id: VALID_UUID },
        body: { name: 'Updated Name', version: 1 },
      });
      const res = createMockResponse();

      await projectDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockProject } | undefined;
      expect(body!.data.name).toBe('Updated Name');
    });

    it('updates project description to null', async () => {
      const existingProject = createMockProject({ description: 'Old desc', version: 0 });
      const updatedProject = createMockProject({ description: null, version: 1 });

      mockProjectRepoFindById.mockResolvedValue(existingProject);
      mockProjectRepoUpdate.mockResolvedValue(updatedProject);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_UUID}`,
        query: { id: VALID_UUID },
        body: { description: null, version: 0 },
      });
      const res = createMockResponse();

      await projectDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockProject } | undefined;
      expect(body!.data.description).toBeNull();
    });

    it('returns 400 for missing version field', async () => {
      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_UUID}`,
        query: { id: VALID_UUID },
        body: { name: 'No Version' },
      });
      const res = createMockResponse();

      await projectDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as
        | {
            error: {
              code: string;
              message: string;
              details?: Record<string, unknown>;
              requestId: string;
            };
          }
        | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
      const fieldErrors = body!.error.details?.fieldErrors as Record<string, string[]> | undefined;
      expect(fieldErrors).toBeDefined();
      expect(fieldErrors!['body.version']).toBeDefined();
    });

    it('returns 404 when project does not exist', async () => {
      mockProjectRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${NONEXISTENT_UUID}`,
        query: { id: NONEXISTENT_UUID },
        body: { name: 'Does Not Exist', version: 0 },
      });
      const res = createMockResponse();

      await projectDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as
        | {
            error: { code: string; message: string; requestId: string };
          }
        | undefined;
      expect(body!.error.code).toBe('PROJECT_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 409 READ_ONLY_VIOLATION when project is not in Draft status', async () => {
      const readyProject = createMockProject({
        lifecycleStatus: 'ready',
        version: 1,
      });
      mockProjectRepoFindById.mockResolvedValue(readyProject);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_UUID}`,
        query: { id: VALID_UUID },
        body: { name: 'Cannot Update', version: 1 },
      });
      const res = createMockResponse();

      await projectDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as
        | {
            error: { code: string; message: string; requestId: string };
          }
        | undefined;
      expect(body!.error.code).toBe('READ_ONLY_VIOLATION');
      expect(body!.error.message).toContain('ready');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 409 OPTIMISTIC_LOCK_CONFLICT on version mismatch', async () => {
      const existingProject = createMockProject({ version: 5 });
      mockProjectRepoFindById.mockResolvedValue(existingProject);

      // Simulate version mismatch error from repository
      const conflictError = new Error('Conflict');
      conflictError.name = 'ConflictError';
      mockProjectRepoUpdate.mockRejectedValue(conflictError);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_UUID}`,
        query: { id: VALID_UUID },
        body: { name: 'Stale Update', version: 5 },
      });
      const res = createMockResponse();

      await projectDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as
        | {
            error: { code: string; message: string; requestId: string };
          }
        | undefined;
      expect(body!.error.code).toBe('OPTIMISTIC_LOCK_CONFLICT');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_UUID}`,
        query: { id: VALID_UUID },
        body: { name: 'Unauth', version: 0 },
      });
      const res = createMockResponse();

      await projectDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
    });
  });

  // =========================================================================
  // DELETE /api/v1/projects/:id -- Hard-delete project
  // =========================================================================

  describe('DELETE /api/v1/projects/:id', () => {
    it('hard-deletes project and returns 204 No Content', async () => {
      const deletedProject = createMockProject();
      mockProjectRepoHardDeleteCascade.mockResolvedValue(deletedProject);

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/projects/${VALID_UUID}`,
        query: { id: VALID_UUID },
      });
      const res = createMockResponse();

      await projectDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(204);
      expect(res.wasEnded()).toBe(true);
      expect(mockProjectRepoHardDeleteCascade).toHaveBeenCalledWith(TEST_TENANT_ID, VALID_UUID);
    });

    it('cascades delete to all child entities via repository', async () => {
      // The cascade is handled inside the repository, but we verify the
      // correct repository method is called (hardDeleteCascade, not hardDelete)
      const deletedProject = createMockProject();
      mockProjectRepoHardDeleteCascade.mockResolvedValue(deletedProject);

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/projects/${VALID_UUID}`,
        query: { id: VALID_UUID },
      });
      const res = createMockResponse();

      await projectDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(204);
      // Verify hardDeleteCascade (not just hardDelete) was called
      expect(mockProjectRepoHardDeleteCascade).toHaveBeenCalledTimes(1);
      expect(mockProjectRepoHardDeleteCascade).toHaveBeenCalledWith(TEST_TENANT_ID, VALID_UUID);
    });

    it('returns 404 for non-existent project', async () => {
      const notFoundError = new Error('Not found');
      notFoundError.name = 'NotFoundError';
      mockProjectRepoHardDeleteCascade.mockRejectedValue(notFoundError);

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/projects/${NONEXISTENT_UUID}`,
        query: { id: NONEXISTENT_UUID },
      });
      const res = createMockResponse();

      await projectDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as
        | {
            error: { code: string; message: string; requestId: string };
          }
        | undefined;
      expect(body!.error.code).toBe('PROJECT_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 400 for invalid UUID', async () => {
      const req = createMockRequest({
        method: 'DELETE',
        url: '/api/v1/projects/invalid-id',
        query: { id: 'invalid-id' },
      });
      const res = createMockResponse();

      await projectDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as
        | {
            error: { code: string };
          }
        | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/projects/${VALID_UUID}`,
        query: { id: VALID_UUID },
      });
      const res = createMockResponse();

      await projectDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
    });
  });

  // =========================================================================
  // POST /api/v1/projects/:id/publish -- Transition Draft -> Ready
  // =========================================================================

  describe('POST /api/v1/projects/:id/publish', () => {
    it('transitions Draft to Ready when all epics are Ready', async () => {
      const draftProject = createMockProject({ lifecycleStatus: 'draft', version: 1 });
      const readyProject = createMockProject({ lifecycleStatus: 'ready', version: 2 });
      const readyEpic = createMockEpic({ workStatus: 'ready' });

      mockProjectRepoFindById.mockResolvedValue(draftProject);
      mockValidateTransition.mockReturnValue({ valid: true, from: 'draft', to: 'ready' });
      mockEpicRepoFindAllByProject.mockResolvedValue([readyEpic]);
      mockProjectRepoUpdate.mockResolvedValue(readyProject);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_UUID}/publish`,
        query: { id: VALID_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockProject } | undefined;
      expect(body!.data.lifecycleStatus).toBe('ready');
      expect(mockProjectRepoUpdate).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_UUID,
        { lifecycleStatus: 'ready' },
        1, // current version
      );
    });

    it('returns 404 when project does not exist', async () => {
      mockProjectRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${NONEXISTENT_UUID}/publish`,
        query: { id: NONEXISTENT_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as
        | {
            error: { code: string; message: string; requestId: string };
          }
        | undefined;
      expect(body!.error.code).toBe('PROJECT_NOT_FOUND');
    });

    it('returns 409 INVALID_STATUS_TRANSITION when project is not in Draft', async () => {
      const readyProject = createMockProject({ lifecycleStatus: 'ready' });
      mockProjectRepoFindById.mockResolvedValue(readyProject);
      mockValidateTransition.mockReturnValue({
        valid: false,
        from: 'ready',
        to: 'ready',
        reason:
          'Transition from "ready" to "ready" is not allowed. Valid targets: [draft, in-progress]',
      });

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_UUID}/publish`,
        query: { id: VALID_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as
        | {
            error: { code: string; message: string; requestId: string };
          }
        | undefined;
      expect(body!.error.code).toBe('INVALID_STATUS_TRANSITION');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 400 VALIDATION_FAILED when project has no epics', async () => {
      const draftProject = createMockProject({ lifecycleStatus: 'draft' });
      mockProjectRepoFindById.mockResolvedValue(draftProject);
      mockValidateTransition.mockReturnValue({ valid: true, from: 'draft', to: 'ready' });
      mockEpicRepoFindAllByProject.mockResolvedValue([]);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_UUID}/publish`,
        query: { id: VALID_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as
        | {
            error: {
              code: string;
              message: string;
              details?: Record<string, unknown>;
              requestId: string;
            };
          }
        | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
      expect(body!.error.message).toContain('epic');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 400 when epics are not all in Ready status', async () => {
      const draftProject = createMockProject({ lifecycleStatus: 'draft' });
      const readyEpic = createMockEpic({
        id: '111e8400-e29b-41d4-a716-446655440001',
        workStatus: 'ready',
        name: 'Ready Epic',
      });
      const pendingEpic = createMockEpic({
        id: '222e8400-e29b-41d4-a716-446655440002',
        workStatus: 'pending',
        name: 'Pending Epic',
      });

      mockProjectRepoFindById.mockResolvedValue(draftProject);
      mockValidateTransition.mockReturnValue({ valid: true, from: 'draft', to: 'ready' });
      mockEpicRepoFindAllByProject.mockResolvedValue([readyEpic, pendingEpic]);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_UUID}/publish`,
        query: { id: VALID_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as
        | {
            error: {
              code: string;
              message: string;
              details?: { nonReadyEpics?: Array<{ id: string; name: string; workStatus: string }> };
              requestId: string;
            };
          }
        | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
      expect(body!.error.message).toContain('not in Ready status');
      // Verify non-ready epic details are included
      expect(body!.error.details).toBeDefined();
      const details = body!.error.details as {
        nonReadyEpics: Array<{ workStatus: string; name: string }>;
      };
      expect(details.nonReadyEpics).toBeDefined();
      expect(details.nonReadyEpics).toHaveLength(1);
      const firstEpic = details.nonReadyEpics[0]!;
      expect(firstEpic.workStatus).toBe('pending');
      expect(firstEpic.name).toBe('Pending Epic');
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_UUID}/publish`,
        query: { id: VALID_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
    });

    it('returns 405 for non-POST methods', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_UUID}/publish`,
        query: { id: VALID_UUID },
      });
      const res = createMockResponse();

      await publishHandler(req, res);

      expect(res.getStatusCode()).toBe(405);
    });
  });

  // =========================================================================
  // POST /api/v1/projects/:id/revert -- Transition Ready -> Draft
  // =========================================================================

  describe('POST /api/v1/projects/:id/revert', () => {
    it('transitions Ready to Draft when no work has started', async () => {
      const readyProject = createMockProject({ lifecycleStatus: 'ready', version: 3 });
      const draftProject = createMockProject({ lifecycleStatus: 'draft', version: 4 });

      mockProjectRepoFindById.mockResolvedValue(readyProject);
      mockValidateTransition.mockReturnValue({ valid: true, from: 'ready', to: 'draft' });
      mockStoryRepoFindActiveByProject.mockResolvedValue([]);
      mockProjectRepoUpdate.mockResolvedValue(draftProject);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_UUID}/revert`,
        query: { id: VALID_UUID },
      });
      const res = createMockResponse();

      await revertHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockProject } | undefined;
      expect(body!.data.lifecycleStatus).toBe('draft');
      expect(mockProjectRepoUpdate).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_UUID,
        { lifecycleStatus: 'draft' },
        3, // current version
      );
    });

    it('returns 404 when project does not exist', async () => {
      mockProjectRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${NONEXISTENT_UUID}/revert`,
        query: { id: NONEXISTENT_UUID },
      });
      const res = createMockResponse();

      await revertHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as
        | {
            error: { code: string; message: string; requestId: string };
          }
        | undefined;
      expect(body!.error.code).toBe('PROJECT_NOT_FOUND');
    });

    it('returns 409 INVALID_STATUS_TRANSITION when project is not in Ready status', async () => {
      const draftProject = createMockProject({ lifecycleStatus: 'draft' });
      mockProjectRepoFindById.mockResolvedValue(draftProject);
      mockValidateTransition.mockReturnValue({
        valid: false,
        from: 'draft',
        to: 'draft',
        reason: 'Transition from "draft" to "draft" is not allowed. Valid targets: [ready]',
      });

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_UUID}/revert`,
        query: { id: VALID_UUID },
      });
      const res = createMockResponse();

      await revertHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as
        | {
            error: { code: string; message: string; requestId: string };
          }
        | undefined;
      expect(body!.error.code).toBe('INVALID_STATUS_TRANSITION');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 409 STORY_IN_PROGRESS when stories have started work', async () => {
      const readyProject = createMockProject({ lifecycleStatus: 'ready' });
      const activeStory = createMockStory({
        title: 'Active Story',
        workStatus: 'in_progress',
      });

      mockProjectRepoFindById.mockResolvedValue(readyProject);
      mockValidateTransition.mockReturnValue({ valid: true, from: 'ready', to: 'draft' });
      mockStoryRepoFindActiveByProject.mockResolvedValue([activeStory]);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_UUID}/revert`,
        query: { id: VALID_UUID },
      });
      const res = createMockResponse();

      await revertHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as
        | {
            error: {
              code: string;
              message: string;
              details?: {
                activeStories?: Array<{ id: string; title: string; workStatus: string }>;
              };
              requestId: string;
            };
          }
        | undefined;
      expect(body!.error.code).toBe('STORY_IN_PROGRESS');
      expect(body!.error.message).toContain('story');
      expect(body!.error.details).toBeDefined();
      const details = body!.error.details as {
        activeStories: Array<{ workStatus: string; title: string }>;
      };
      expect(details.activeStories).toBeDefined();
      expect(details.activeStories).toHaveLength(1);
      const firstStory = details.activeStories[0]!;
      expect(firstStory.workStatus).toBe('in_progress');
      expect(firstStory.title).toBe('Active Story');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 409 when stories are in done status', async () => {
      const readyProject = createMockProject({ lifecycleStatus: 'ready' });
      const doneStory = createMockStory({
        title: 'Done Story',
        workStatus: 'done',
      });

      mockProjectRepoFindById.mockResolvedValue(readyProject);
      mockValidateTransition.mockReturnValue({ valid: true, from: 'ready', to: 'draft' });
      mockStoryRepoFindActiveByProject.mockResolvedValue([doneStory]);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_UUID}/revert`,
        query: { id: VALID_UUID },
      });
      const res = createMockResponse();

      await revertHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as
        | {
            error: { code: string; message: string; requestId: string };
          }
        | undefined;
      expect(body!.error.code).toBe('STORY_IN_PROGRESS');
    });

    it('returns 409 when stories are in failed status', async () => {
      const readyProject = createMockProject({ lifecycleStatus: 'ready' });
      const failedStory = createMockStory({
        title: 'Failed Story',
        workStatus: 'failed',
      });

      mockProjectRepoFindById.mockResolvedValue(readyProject);
      mockValidateTransition.mockReturnValue({ valid: true, from: 'ready', to: 'draft' });
      mockStoryRepoFindActiveByProject.mockResolvedValue([failedStory]);

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_UUID}/revert`,
        query: { id: VALID_UUID },
      });
      const res = createMockResponse();

      await revertHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/projects/${VALID_UUID}/revert`,
        query: { id: VALID_UUID },
      });
      const res = createMockResponse();

      await revertHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
    });

    it('returns 405 for non-POST methods', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/projects/${VALID_UUID}/revert`,
        query: { id: VALID_UUID },
      });
      const res = createMockResponse();

      await revertHandler(req, res);

      expect(res.getStatusCode()).toBe(405);
    });
  });

  // =========================================================================
  // Error envelope format verification
  // =========================================================================

  describe('Error envelope format', () => {
    it('all error responses include the standard envelope fields', async () => {
      // Test with a validation error (400)
      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/projects',
        body: {},
      });
      const res = createMockResponse();

      await projectCollectionHandler(req, res);

      const body = res.getJsonBody() as
        | {
            error: {
              code: string;
              message: string;
              details?: Record<string, unknown>;
              requestId: string;
            };
          }
        | undefined;
      expect(body).toBeDefined();
      expect(body!.error).toBeDefined();
      expect(typeof body!.error.code).toBe('string');
      expect(typeof body!.error.message).toBe('string');
      expect(typeof body!.error.requestId).toBe('string');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('404 errors include PROJECT_NOT_FOUND code and requestId', async () => {
      mockProjectRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${NONEXISTENT_UUID}`,
        query: { id: NONEXISTENT_UUID },
        body: { name: 'X', version: 0 },
      });
      const res = createMockResponse();

      await projectDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as
        | {
            error: { code: string; message: string; requestId: string };
          }
        | undefined;
      expect(body!.error.code).toBe('PROJECT_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
      expect(body!.error.message).toContain(NONEXISTENT_UUID);
    });

    it('409 errors include domain-specific error code and requestId', async () => {
      const readyProject = createMockProject({ lifecycleStatus: 'ready', version: 1 });
      mockProjectRepoFindById.mockResolvedValue(readyProject);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/projects/${VALID_UUID}`,
        query: { id: VALID_UUID },
        body: { name: 'Read Only', version: 1 },
      });
      const res = createMockResponse();

      await projectDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as
        | {
            error: { code: string; message: string; requestId: string };
          }
        | undefined;
      expect(body!.error.code).toBe('READ_ONLY_VIOLATION');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('validation errors include field-level details', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/projects',
        body: { name: '' },
      });
      const res = createMockResponse();

      await projectCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as
        | {
            error: {
              code: string;
              details?: { fieldErrors?: Record<string, string[]> };
            };
          }
        | undefined;
      expect(body!.error.details).toBeDefined();
      expect(body!.error.details!.fieldErrors).toBeDefined();
    });
  });

  // =========================================================================
  // Authentication enforcement
  // =========================================================================

  describe('Authentication enforcement', () => {
    beforeEach(() => {
      clearMockSession();
    });

    const runAuthTest = async (
      handlerFn: (
        req: Parameters<typeof projectCollectionHandler>[0],
        res: Parameters<typeof projectCollectionHandler>[1],
      ) => Promise<void>,
      config: Parameters<typeof createMockRequest>[0],
    ): Promise<MockApiResponse> => {
      const req = createMockRequest(config);
      const res = createMockResponse();
      await handlerFn(req, res);
      return res;
    };

    it('POST /api/v1/projects requires authentication', async () => {
      const res = await runAuthTest(projectCollectionHandler, {
        method: 'POST',
        body: { name: 'Test' },
      });
      expect(res.getStatusCode()).toBe(401);
    });

    it('GET /api/v1/projects requires authentication', async () => {
      const res = await runAuthTest(projectCollectionHandler, {
        method: 'GET',
      });
      expect(res.getStatusCode()).toBe(401);
    });

    it('GET /api/v1/projects/:id requires authentication', async () => {
      const res = await runAuthTest(projectDetailHandler, {
        method: 'GET',
        query: { id: VALID_UUID },
      });
      expect(res.getStatusCode()).toBe(401);
    });

    it('PATCH /api/v1/projects/:id requires authentication', async () => {
      const res = await runAuthTest(projectDetailHandler, {
        method: 'PATCH',
        query: { id: VALID_UUID },
        body: { name: 'Test', version: 0 },
      });
      expect(res.getStatusCode()).toBe(401);
    });

    it('DELETE /api/v1/projects/:id requires authentication', async () => {
      const res = await runAuthTest(projectDetailHandler, {
        method: 'DELETE',
        query: { id: VALID_UUID },
      });
      expect(res.getStatusCode()).toBe(401);
    });

    it('POST /api/v1/projects/:id/publish requires authentication', async () => {
      const res = await runAuthTest(publishHandler, {
        method: 'POST',
        query: { id: VALID_UUID },
      });
      expect(res.getStatusCode()).toBe(401);
    });

    it('POST /api/v1/projects/:id/revert requires authentication', async () => {
      const res = await runAuthTest(revertHandler, {
        method: 'POST',
        query: { id: VALID_UUID },
      });
      expect(res.getStatusCode()).toBe(401);
    });

    it('unauthenticated responses include UNAUTHORIZED code', async () => {
      const res = await runAuthTest(projectCollectionHandler, {
        method: 'POST',
        body: { name: 'Test' },
      });
      const body = res.getJsonBody() as
        | {
            error: { code: string; message: string };
          }
        | undefined;
      expect(body!.error.code).toBe('UNAUTHORIZED');
      expect(body!.error.message).toBe('Authentication required');
    });
  });

  // =========================================================================
  // Test isolation verification
  // =========================================================================

  describe('Test isolation', () => {
    it('each test starts with clean mock state (first)', async () => {
      const newProject = createMockProject({ name: 'Isolation Test 1' });
      mockProjectRepoCreate.mockResolvedValue(newProject);

      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/projects',
        body: {
          name: 'Isolation Test 1',
          description: null,
          lifecycleStatus: 'draft',
          workerInactivityTimeoutMinutes: 30,
        },
      });
      const res = createMockResponse();

      await projectCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(201);
      expect(mockProjectRepoCreate).toHaveBeenCalledTimes(1);
    });

    it('each test starts with clean mock state (second)', async () => {
      const newProject = createMockProject({ name: 'Isolation Test 2' });
      mockProjectRepoCreate.mockResolvedValue(newProject);

      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/projects',
        body: {
          name: 'Isolation Test 2',
          description: null,
          lifecycleStatus: 'draft',
          workerInactivityTimeoutMinutes: 30,
        },
      });
      const res = createMockResponse();

      await projectCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(201);
      // Because of vi.clearAllMocks() in afterEach, this should be 1, not 2
      expect(mockProjectRepoCreate).toHaveBeenCalledTimes(1);
    });
  });
});
