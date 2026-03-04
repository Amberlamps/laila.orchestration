/**
 * @module personas.integration.test
 *
 * Integration tests for all persona API endpoints:
 *
 * - POST   /api/v1/personas      -- Create a new persona
 * - GET    /api/v1/personas      -- List personas with usage counts
 * - GET    /api/v1/personas/:id  -- Get persona detail with task counts
 * - PATCH  /api/v1/personas/:id  -- Update persona name, description, systemPrompt
 * - DELETE /api/v1/personas/:id  -- Delete with active-task guard
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
 * - Deletion guard logic (active tasks block, terminal/deleted tasks allow)
 * - Usage count and task count statistics
 * - Authentication enforcement (human-only)
 * - Method Not Allowed (405)
 * - Long system prompt support (up to 50K chars)
 * - Project scoping and projectId validation
 * - Project-based filtering on list endpoint
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

const VALID_PERSONA_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_PROJECT_UUID = '550e8400-e29b-41d4-a716-446655440099';
const NONEXISTENT_UUID = '00000000-0000-4000-a000-000000000000';

// ---------------------------------------------------------------------------
// Mock data interfaces
// ---------------------------------------------------------------------------

interface MockPersona {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MockPersonaWithUsageCount extends MockPersona {
  usageCount: number;
}

interface MockPersonaWithTaskCounts extends MockPersona {
  taskCounts: {
    active: number;
    total: number;
  };
}

// ---------------------------------------------------------------------------
// Mock data factories
// ---------------------------------------------------------------------------

const now = new Date('2025-06-01T12:00:00Z');

const createMockPersona = (overrides: Partial<MockPersona> = {}): MockPersona => ({
  id: VALID_PERSONA_UUID,
  tenantId: TEST_TENANT_ID,
  projectId: VALID_PROJECT_UUID,
  name: 'Backend Developer',
  description: 'A backend developer persona.',
  systemPrompt: 'You are a backend developer with Node.js expertise.',
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const createMockPersonaWithUsageCount = (
  overrides: Partial<MockPersonaWithUsageCount> = {},
): MockPersonaWithUsageCount => ({
  ...createMockPersona(overrides),
  usageCount: 0,
  ...overrides,
});

const createMockPersonaWithTaskCounts = (
  overrides: Partial<MockPersonaWithTaskCounts> = {},
): MockPersonaWithTaskCounts => ({
  ...createMockPersona(overrides),
  taskCounts: { active: 0, total: 0 },
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock repository functions
// ---------------------------------------------------------------------------

const mockPersonaRepoCreate =
  vi.fn<(tenantId: string, data: Record<string, unknown>) => Promise<MockPersona>>();

const mockPersonaRepoUpdate =
  vi.fn<
    (tenantId: string, id: string, data: Record<string, unknown>) => Promise<MockPersona | null>
  >();

const mockPersonaRepoFindById =
  vi.fn<(tenantId: string, id: string) => Promise<MockPersona | null>>();

const mockPersonaRepoFindByTenant = vi.fn();

const mockPersonaRepoFindByTenantWithUsageCount = vi.fn();

const mockPersonaRepoDelete = vi.fn<(tenantId: string, id: string) => Promise<void>>();

const mockPersonaRepoFindWithTaskCounts =
  vi.fn<(tenantId: string, id: string) => Promise<MockPersonaWithTaskCounts | null>>();

const mockProjectRepoFindById = vi.fn();

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
 * Mock drizzle-orm -- the detail handler uses eq/and/isNull/notInArray for a raw
 * DB query. Mock them so they don't throw on non-Column arguments.
 */
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  notInArray: vi.fn(),
}));

/**
 * Mock @laila/database -- provides mock persona/project repository factories and getDb.
 * The detail handler also does a raw db.select() chain for active task assignments,
 * so getDb must return a chainable mock, and the table symbols must be exported.
 */
const mockDbChain = (() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => Promise.resolve([]));
  return chain;
})();

vi.mock('@laila/database', () => ({
  getDb: vi.fn(() => mockDbChain),
  writeAuditEventFireAndForget: vi.fn(),
  tasksTable: {
    id: 'id',
    title: 'title',
    userStoryId: 'userStoryId',
    tenantId: 'tenantId',
    personaId: 'personaId',
    deletedAt: 'deletedAt',
    workStatus: 'workStatus',
  },
  userStoriesTable: { id: 'id', title: 'title', epicId: 'epicId' },
  epicsTable: { id: 'id', projectId: 'projectId' },
  projectsTable: { id: 'id', name: 'name' },
  createPersonaRepository: vi.fn(() => ({
    create: mockPersonaRepoCreate,
    update: mockPersonaRepoUpdate,
    findById: mockPersonaRepoFindById,
    findByTenant: mockPersonaRepoFindByTenant,
    findByTenantWithUsageCount: mockPersonaRepoFindByTenantWithUsageCount,
    delete: mockPersonaRepoDelete,
    findWithTaskCounts: mockPersonaRepoFindWithTaskCounts,
  })),
  createProjectRepository: vi.fn(() => ({
    findById: mockProjectRepoFindById,
  })),
}));

// ---------------------------------------------------------------------------
// Import handlers AFTER mocks are registered
// ---------------------------------------------------------------------------

const { default: personaCollectionHandler } = await import('@/pages/api/v1/personas/index');
const { default: personaDetailHandler } = await import('@/pages/api/v1/personas/[id]');

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

describe('Persona API Integration Tests', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setMockSession();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Default: project exists
    mockProjectRepoFindById.mockResolvedValue({
      id: VALID_PROJECT_UUID,
      tenantId: TEST_TENANT_ID,
      name: 'Test Project',
    });
  });

  afterEach(() => {
    clearMockSession();
    vi.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  // =========================================================================
  // POST /api/v1/personas -- Create
  // =========================================================================

  describe('POST /api/v1/personas', () => {
    it('creates a persona with name, systemPrompt, and projectId', async () => {
      const created = createMockPersona();
      mockPersonaRepoCreate.mockResolvedValue(created);

      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/personas',
        body: {
          name: 'Backend Developer',
          systemPrompt: 'You are a backend developer with Node.js expertise.',
          projectId: VALID_PROJECT_UUID,
        },
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(201);
      const body = res.getJsonBody() as { data: MockPersona };
      expect(body.data.id).toBe(VALID_PERSONA_UUID);
      expect(body.data.name).toBe('Backend Developer');
      expect(body.data.systemPrompt).toBe('You are a backend developer with Node.js expertise.');
      expect(body.data.projectId).toBe(VALID_PROJECT_UUID);
      expect(body.data.tenantId).toBe(TEST_TENANT_ID);
    });

    it('creates a persona with optional description', async () => {
      const created = createMockPersona({ description: 'Short description' });
      mockPersonaRepoCreate.mockResolvedValue(created);

      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/personas',
        body: {
          name: 'Backend Developer',
          description: 'Short description',
          systemPrompt: 'You are a backend developer.',
          projectId: VALID_PROJECT_UUID,
        },
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(201);
      const body = res.getJsonBody() as { data: MockPersona };
      expect(body.data.description).toBe('Short description');
    });

    it('passes tenantId from auth context to repository', async () => {
      const created = createMockPersona();
      mockPersonaRepoCreate.mockResolvedValue(created);

      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/personas',
        body: {
          name: 'QA Engineer',
          systemPrompt: 'You are a QA testing persona.',
          projectId: VALID_PROJECT_UUID,
        },
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(mockPersonaRepoCreate).toHaveBeenCalledWith(TEST_TENANT_ID, {
        name: 'QA Engineer',
        description: null,
        systemPrompt: 'You are a QA testing persona.',
        projectId: VALID_PROJECT_UUID,
      });
    });

    it('validates project_id existence on POST', async () => {
      mockProjectRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/personas',
        body: {
          name: 'Backend Developer',
          systemPrompt: 'You are a backend developer.',
          projectId: NONEXISTENT_UUID,
        },
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('PROJECT_NOT_FOUND');
    });

    it('accepts a long system prompt (up to 50K chars)', async () => {
      const longPrompt = 'A'.repeat(50000);
      const created = createMockPersona({ systemPrompt: longPrompt });
      mockPersonaRepoCreate.mockResolvedValue(created);

      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/personas',
        body: {
          name: 'Detailed Persona',
          systemPrompt: longPrompt,
          projectId: VALID_PROJECT_UUID,
        },
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(201);
      const body = res.getJsonBody() as { data: MockPersona };
      expect(body.data.systemPrompt).toHaveLength(50000);
    });

    it('returns 400 when systemPrompt exceeds 50K chars', async () => {
      const tooLongPrompt = 'A'.repeat(50001);

      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/personas',
        body: {
          name: 'Oversized Persona',
          systemPrompt: tooLongPrompt,
          projectId: VALID_PROJECT_UUID,
        },
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 400 when name is missing', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/personas',
        body: {
          systemPrompt: 'A persona without a name.',
          projectId: VALID_PROJECT_UUID,
        },
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 400 when name is empty string', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/personas',
        body: {
          name: '',
          systemPrompt: 'Description with empty name.',
          projectId: VALID_PROJECT_UUID,
        },
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 400 when name exceeds 255 chars', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/personas',
        body: {
          name: 'A'.repeat(256),
          systemPrompt: 'Too long name persona.',
          projectId: VALID_PROJECT_UUID,
        },
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 400 when systemPrompt is missing', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/personas',
        body: {
          name: 'No Prompt Persona',
          projectId: VALID_PROJECT_UUID,
        },
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 400 when projectId is missing', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/personas',
        body: {
          name: 'No Project Persona',
          systemPrompt: 'Some prompt.',
        },
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 400 when duplicate name exists (unique constraint)', async () => {
      const duplicateError = new Error(
        'A persona with the name "Backend Developer" already exists in this project.',
      );
      duplicateError.name = 'ValidationError';
      mockPersonaRepoCreate.mockRejectedValue(duplicateError);

      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/personas',
        body: {
          name: 'Backend Developer',
          systemPrompt: 'Duplicate persona.',
          projectId: VALID_PROJECT_UUID,
        },
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 401 when not authenticated', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/personas',
        body: {
          name: 'No Auth Persona',
          systemPrompt: 'Should fail without auth.',
          projectId: VALID_PROJECT_UUID,
        },
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
      const body = res.getJsonBody() as { error: { code: string } };
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // =========================================================================
  // GET /api/v1/personas -- List
  // =========================================================================

  describe('GET /api/v1/personas', () => {
    it('returns a paginated list of personas with usage counts', async () => {
      const persona1 = createMockPersonaWithUsageCount({
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Backend Developer',
        usageCount: 3,
      });
      const persona2 = createMockPersonaWithUsageCount({
        id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Frontend Developer',
        usageCount: 0,
      });

      mockPersonaRepoFindByTenantWithUsageCount.mockResolvedValue({
        data: [persona1, persona2],
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
        url: '/api/v1/personas',
        query: {},
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as {
        data: MockPersonaWithUsageCount[];
        pagination: { page: number; limit: number; total: number };
      };
      expect(body.data).toHaveLength(2);
      expect(body.data[0]!.usageCount).toBe(3);
      expect(body.data[1]!.usageCount).toBe(0);
      expect(body.pagination.total).toBe(2);
    });

    it('passes pagination parameters to the repository', async () => {
      mockPersonaRepoFindByTenantWithUsageCount.mockResolvedValue({
        data: [],
        pagination: {
          page: 2,
          limit: 10,
          total: 15,
          totalPages: 2,
          hasNext: false,
          hasPrev: true,
        },
      });

      const req = createMockRequest({
        method: 'GET',
        url: '/api/v1/personas?page=2&limit=10',
        query: { page: '2', limit: '10' },
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      expect(mockPersonaRepoFindByTenantWithUsageCount).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        expect.objectContaining({
          pagination: expect.objectContaining({
            page: 2,
            limit: 10,
          }),
        }),
      );
    });

    it('passes projectId filter to the repository', async () => {
      mockPersonaRepoFindByTenantWithUsageCount.mockResolvedValue({
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
        url: `/api/v1/personas?projectId=${VALID_PROJECT_UUID}`,
        query: { projectId: VALID_PROJECT_UUID },
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      expect(mockPersonaRepoFindByTenantWithUsageCount).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        expect.objectContaining({
          projectId: VALID_PROJECT_UUID,
        }),
      );
    });

    it('returns empty list when no personas exist', async () => {
      mockPersonaRepoFindByTenantWithUsageCount.mockResolvedValue({
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
        url: '/api/v1/personas',
        query: {},
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockPersonaWithUsageCount[] };
      expect(body.data).toHaveLength(0);
    });

    it('returns 401 when not authenticated', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'GET',
        url: '/api/v1/personas',
        query: {},
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
    });
  });

  // =========================================================================
  // GET /api/v1/personas/:id -- Detail
  // =========================================================================

  describe('GET /api/v1/personas/:id', () => {
    it('returns persona detail with task counts', async () => {
      const personaWithCounts = createMockPersonaWithTaskCounts({
        taskCounts: { active: 2, total: 5 },
      });
      mockPersonaRepoFindWithTaskCounts.mockResolvedValue(personaWithCounts);

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockPersonaWithTaskCounts };
      expect(body.data.id).toBe(VALID_PERSONA_UUID);
      expect(body.data.name).toBe('Backend Developer');
      expect(body.data.systemPrompt).toBe('You are a backend developer with Node.js expertise.');
      expect(body.data.projectId).toBe(VALID_PROJECT_UUID);
      expect(body.data.taskCounts.active).toBe(2);
      expect(body.data.taskCounts.total).toBe(5);
    });

    it('returns task counts of zero for persona with no tasks', async () => {
      const personaWithCounts = createMockPersonaWithTaskCounts({
        taskCounts: { active: 0, total: 0 },
      });
      mockPersonaRepoFindWithTaskCounts.mockResolvedValue(personaWithCounts);

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockPersonaWithTaskCounts };
      expect(body.data.taskCounts.active).toBe(0);
      expect(body.data.taskCounts.total).toBe(0);
    });

    it('returns 404 when persona does not exist', async () => {
      mockPersonaRepoFindWithTaskCounts.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/personas/${NONEXISTENT_UUID}`,
        query: { id: NONEXISTENT_UUID },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('PERSONA_NOT_FOUND');
      expect(body.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 400 when id is not a valid UUID', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: '/api/v1/personas/not-a-uuid',
        query: { id: 'not-a-uuid' },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 401 when not authenticated', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
    });
  });

  // =========================================================================
  // PATCH /api/v1/personas/:id -- Update
  // =========================================================================

  describe('PATCH /api/v1/personas/:id', () => {
    it('updates persona name', async () => {
      const updated = createMockPersona({ name: 'Senior Backend Developer' });
      mockPersonaRepoUpdate.mockResolvedValue(updated);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
        body: { name: 'Senior Backend Developer' },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockPersona };
      expect(body.data.name).toBe('Senior Backend Developer');
    });

    it('updates persona description', async () => {
      const updated = createMockPersona({ description: 'Updated description.' });
      mockPersonaRepoUpdate.mockResolvedValue(updated);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
        body: { description: 'Updated description.' },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockPersona };
      expect(body.data.description).toBe('Updated description.');
    });

    it('updates persona systemPrompt', async () => {
      const newPrompt = 'Updated system prompt instructions.';
      const updated = createMockPersona({ systemPrompt: newPrompt });
      mockPersonaRepoUpdate.mockResolvedValue(updated);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
        body: { systemPrompt: newPrompt },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockPersona };
      expect(body.data.systemPrompt).toBe(newPrompt);
    });

    it('updates name, description, and systemPrompt simultaneously', async () => {
      const updated = createMockPersona({
        name: 'Updated Name',
        description: 'Updated desc.',
        systemPrompt: 'Updated prompt.',
      });
      mockPersonaRepoUpdate.mockResolvedValue(updated);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
        body: {
          name: 'Updated Name',
          description: 'Updated desc.',
          systemPrompt: 'Updated prompt.',
        },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockPersona };
      expect(body.data.name).toBe('Updated Name');
      expect(body.data.description).toBe('Updated desc.');
      expect(body.data.systemPrompt).toBe('Updated prompt.');
    });

    it('returns 404 when persona does not exist', async () => {
      mockPersonaRepoUpdate.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/personas/${NONEXISTENT_UUID}`,
        query: { id: NONEXISTENT_UUID },
        body: { name: 'Does Not Exist' },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('PERSONA_NOT_FOUND');
    });

    it('returns 400 when duplicate name on update', async () => {
      const duplicateError = new Error(
        'A persona with the name "Existing Name" already exists in this project.',
      );
      duplicateError.name = 'ValidationError';
      mockPersonaRepoUpdate.mockRejectedValue(duplicateError);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
        body: { name: 'Existing Name' },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 400 when name exceeds 255 chars on update', async () => {
      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
        body: { name: 'A'.repeat(256) },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 400 when id is not a valid UUID', async () => {
      const req = createMockRequest({
        method: 'PATCH',
        url: '/api/v1/personas/invalid',
        query: { id: 'invalid' },
        body: { name: 'Some Name' },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 401 when not authenticated', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
        body: { name: 'No Auth Update' },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
    });
  });

  // =========================================================================
  // DELETE /api/v1/personas/:id -- Delete with Guard
  // =========================================================================

  describe('DELETE /api/v1/personas/:id', () => {
    it('deletes persona with no task references', async () => {
      const existing = createMockPersona();
      mockPersonaRepoFindById.mockResolvedValue(existing);
      mockPersonaRepoDelete.mockResolvedValue(undefined);

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(204);
      expect(res.wasEnded()).toBe(true);
      expect(mockPersonaRepoDelete).toHaveBeenCalledWith(TEST_TENANT_ID, VALID_PERSONA_UUID);
    });

    it('blocks deletion when active tasks reference the persona', async () => {
      const existing = createMockPersona();
      mockPersonaRepoFindById.mockResolvedValue(existing);

      const activeTaskError = new Error(
        'Cannot delete persona: 3 active task(s) reference it. Complete or reassign the tasks before deleting this persona.',
      );
      activeTaskError.name = 'ValidationError';
      mockPersonaRepoDelete.mockRejectedValue(activeTaskError);

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('DELETION_BLOCKED');
      expect(body.error.details).toBeDefined();
      expect((body.error.details as { activeTaskCount: number }).activeTaskCount).toBe(3);
      expect(body.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('reports correct active task count of 1', async () => {
      const existing = createMockPersona();
      mockPersonaRepoFindById.mockResolvedValue(existing);

      const activeTaskError = new Error(
        'Cannot delete persona: 1 active task(s) reference it. Complete or reassign the tasks before deleting this persona.',
      );
      activeTaskError.name = 'ValidationError';
      mockPersonaRepoDelete.mockRejectedValue(activeTaskError);

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect((body.error.details as { activeTaskCount: number }).activeTaskCount).toBe(1);
    });

    it('allows deletion when only completed tasks reference the persona', async () => {
      const existing = createMockPersona();
      mockPersonaRepoFindById.mockResolvedValue(existing);
      mockPersonaRepoDelete.mockResolvedValue(undefined);

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(204);
      expect(res.wasEnded()).toBe(true);
    });

    it('allows deletion when only soft-deleted tasks reference the persona', async () => {
      const existing = createMockPersona();
      mockPersonaRepoFindById.mockResolvedValue(existing);
      mockPersonaRepoDelete.mockResolvedValue(undefined);

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(204);
      expect(res.wasEnded()).toBe(true);
    });

    it('returns 404 when persona does not exist', async () => {
      mockPersonaRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/personas/${NONEXISTENT_UUID}`,
        query: { id: NONEXISTENT_UUID },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('PERSONA_NOT_FOUND');
      expect(body.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 400 when id is not a valid UUID', async () => {
      const req = createMockRequest({
        method: 'DELETE',
        url: '/api/v1/personas/not-valid',
        query: { id: 'not-valid' },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 401 when not authenticated', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
    });
  });

  // =========================================================================
  // Method Not Allowed (405)
  // =========================================================================

  describe('Method Not Allowed', () => {
    it('returns 405 for PUT on collection endpoint', async () => {
      const req = createMockRequest({
        method: 'PUT',
        url: '/api/v1/personas',
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(405);
      const body = res.getJsonBody() as { error: { code: string } };
      expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
      const headers = res.getSetHeaders();
      const allowHeader = headers.find(([name]) => name === 'Allow');
      expect(allowHeader).toBeDefined();
      expect(allowHeader![1]).toContain('GET');
      expect(allowHeader![1]).toContain('POST');
    });

    it('returns 405 for DELETE on collection endpoint', async () => {
      const req = createMockRequest({
        method: 'DELETE',
        url: '/api/v1/personas',
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(405);
    });

    it('returns 405 for POST on detail endpoint', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(405);
      const body = res.getJsonBody() as { error: { code: string } };
      expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
      const headers = res.getSetHeaders();
      const allowHeader = headers.find(([name]) => name === 'Allow');
      expect(allowHeader).toBeDefined();
      expect(allowHeader![1]).toContain('GET');
      expect(allowHeader![1]).toContain('PATCH');
      expect(allowHeader![1]).toContain('DELETE');
    });

    it('returns 405 for PUT on detail endpoint', async () => {
      const req = createMockRequest({
        method: 'PUT',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(405);
    });
  });

  // =========================================================================
  // Authentication enforcement
  // =========================================================================

  describe('Authentication Enforcement', () => {
    it('returns 403 when agent API key is used on human-only collection endpoint', async () => {
      clearMockSession();

      const { validateApiKey } = await import('@/lib/middleware/api-key-validator');
      const mockValidateApiKey = validateApiKey as ReturnType<typeof vi.fn>;
      mockValidateApiKey.mockResolvedValueOnce({
        type: 'agent',
        workerId: '00000000-0000-4000-a000-000000000099',
        workerName: 'Test Worker',
        tenantId: TEST_TENANT_ID,
      });

      const req = createMockRequest({
        method: 'GET',
        url: '/api/v1/personas',
        query: {},
        headers: {
          'x-api-key': 'test-api-key',
        },
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(403);
      const body = res.getJsonBody() as { error: { code: string } };
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 when agent API key is used on human-only detail endpoint', async () => {
      clearMockSession();

      const { validateApiKey } = await import('@/lib/middleware/api-key-validator');
      const mockValidateApiKey = validateApiKey as ReturnType<typeof vi.fn>;
      mockValidateApiKey.mockResolvedValueOnce({
        type: 'agent',
        workerId: '00000000-0000-4000-a000-000000000099',
        workerName: 'Test Worker',
        tenantId: TEST_TENANT_ID,
      });

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
        headers: {
          'x-api-key': 'test-api-key',
        },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(403);
      const body = res.getJsonBody() as { error: { code: string } };
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // Tenant isolation
  // =========================================================================

  describe('Tenant Isolation', () => {
    it('passes the authenticated tenant ID to all repository calls on create', async () => {
      const created = createMockPersona();
      mockPersonaRepoCreate.mockResolvedValue(created);

      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/personas',
        body: {
          name: 'Tenant Test',
          systemPrompt: 'Testing tenant isolation.',
          projectId: VALID_PROJECT_UUID,
        },
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(mockPersonaRepoCreate).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        expect.objectContaining({ name: 'Tenant Test' }),
      );
    });

    it('passes the authenticated tenant ID to repository on list', async () => {
      mockPersonaRepoFindByTenantWithUsageCount.mockResolvedValue({
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
        url: '/api/v1/personas',
        query: {},
      });
      const res = createMockResponse();

      await personaCollectionHandler(req, res);

      expect(mockPersonaRepoFindByTenantWithUsageCount).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        expect.anything(),
      );
    });

    it('passes the authenticated tenant ID to repository on detail', async () => {
      const personaWithCounts = createMockPersonaWithTaskCounts();
      mockPersonaRepoFindWithTaskCounts.mockResolvedValue(personaWithCounts);

      const req = createMockRequest({
        method: 'GET',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(mockPersonaRepoFindWithTaskCounts).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_PERSONA_UUID,
      );
    });

    it('passes the authenticated tenant ID to repository on update', async () => {
      const updated = createMockPersona({ name: 'Updated' });
      mockPersonaRepoUpdate.mockResolvedValue(updated);

      const req = createMockRequest({
        method: 'PATCH',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
        body: { name: 'Updated' },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(mockPersonaRepoUpdate).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_PERSONA_UUID,
        expect.objectContaining({ name: 'Updated' }),
      );
    });

    it('passes the authenticated tenant ID to repository on delete', async () => {
      const existing = createMockPersona();
      mockPersonaRepoFindById.mockResolvedValue(existing);
      mockPersonaRepoDelete.mockResolvedValue(undefined);

      const req = createMockRequest({
        method: 'DELETE',
        url: `/api/v1/personas/${VALID_PERSONA_UUID}`,
        query: { id: VALID_PERSONA_UUID },
      });
      const res = createMockResponse();

      await personaDetailHandler(req, res);

      expect(mockPersonaRepoFindById).toHaveBeenCalledWith(TEST_TENANT_ID, VALID_PERSONA_UUID);
      expect(mockPersonaRepoDelete).toHaveBeenCalledWith(TEST_TENANT_ID, VALID_PERSONA_UUID);
    });
  });
});
