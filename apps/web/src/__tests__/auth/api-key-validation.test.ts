/**
 * Integration tests for the validateApiKey middleware.
 *
 * The middleware depends on `@laila/database` (getDb, apiKeysTable,
 * workersTable, workerProjectAccessTable). Since no test database is
 * available in this test environment, we mock the database layer and
 * verify the middleware's branching logic:
 *
 * - Missing Authorization header → null
 * - Malformed key format → null (no DB query)
 * - Valid format but unknown prefix (no DB match) → null
 * - Valid format, matching prefix, wrong hash → null
 * - Revoked key → null
 * - Expired key (past expires_at) → null
 * - Inactive worker → null
 * - Valid key with active worker → WorkerAuthContext
 * - WorkerAuthContext is injected onto req.workerAuth
 * - Project access loading populates context.projectAccess
 * - last_used_at is updated on the API key record (not the worker)
 *
 * All mocks use typed objects (no `any`) and each test is fully isolated.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { generateApiKey, hashApiKey } from '@/lib/api-keys';

import type { GeneratedApiKey } from '@/lib/api-keys';
import type {
  WorkerAuthContext,
  AuthenticatedApiRequest,
} from '@/lib/middleware/api-key-validator';
import type { NextApiRequest } from 'next';

// ---------------------------------------------------------------------------
// Types for mock data
// ---------------------------------------------------------------------------

/** Shape of an API key record returned by the mock DB select query. */
interface MockApiKeyRecord {
  id: string;
  tenantId: string;
  workerId: string;
  hashedKey: string;
  prefix: string;
  name: string | null;
  isRevoked: boolean;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

/** Shape of a worker record returned by the mock DB select query. */
interface MockWorkerRecord {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  apiKeyHash: string;
  apiKeyPrefix: string;
  isActive: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Shape of a project access record returned by the mock DB select query. */
interface MockProjectAccessRecord {
  projectId: string;
}

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

// Track calls to the update chain for last_used_at verification
const mockUpdateSet = vi.fn();
const mockUpdateWhere = vi.fn();
const mockUpdateThen = vi.fn();

/** The mock db object that simulates Drizzle ORM's query builder. */
const mockDb = {
  select: vi.fn(),
  update: vi.fn(),
};

// Wire up the fluent chaining for update().set().where().then()
mockDb.update.mockReturnValue({ set: mockUpdateSet });
mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
mockUpdateWhere.mockReturnValue({ then: mockUpdateThen });
mockUpdateThen.mockReturnValue(Promise.resolve());

/**
 * Mock the `@laila/database` module.
 *
 * - `getDb` returns our `mockDb` object
 * - Table objects are plain objects used as identifiers by Drizzle's
 *   `from()` and `eq()` calls; they don't need real column definitions.
 */
vi.mock('@laila/database', () => ({
  getDb: () => mockDb,
  apiKeysTable: {
    id: 'api_keys.id',
    prefix: 'api_keys.prefix',
    hashedKey: 'api_keys.hashed_key',
    isRevoked: 'api_keys.is_revoked',
    expiresAt: 'api_keys.expires_at',
    lastUsedAt: 'api_keys.last_used_at',
    workerId: 'api_keys.worker_id',
  },
  workersTable: {
    id: 'workers.id',
    tenantId: 'workers.tenant_id',
    name: 'workers.name',
    isActive: 'workers.is_active',
  },
  workerProjectAccessTable: {
    workerId: 'worker_project_access.worker_id',
    projectId: 'worker_project_access.project_id',
  },
}));

// Mock drizzle-orm's `eq` helper — the middleware imports it directly
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((column: string, value: string) => ({ column, value })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal NextApiRequest-like object with the given auth header. */
const createMockRequest = (authorizationHeader?: string): NextApiRequest => {
  const headers: Record<string, string | undefined> = {};
  if (authorizationHeader !== undefined) {
    headers.authorization = authorizationHeader;
  }

  return {
    headers,
  } as unknown as NextApiRequest;
};

/** Generate a mock API key record for a given GeneratedApiKey. */
const createMockApiKeyRecord = (
  apiKey: GeneratedApiKey,
  overrides: Partial<MockApiKeyRecord> = {},
): MockApiKeyRecord => ({
  id: 'api-key-uuid-001',
  tenantId: 'tenant-uuid-001',
  workerId: 'worker-uuid-001',
  hashedKey: apiKey.hashedKey,
  prefix: apiKey.prefix,
  name: null,
  isRevoked: false,
  expiresAt: null,
  lastUsedAt: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  ...overrides,
});

/** Generate a mock worker record. */
const createMockWorker = (overrides: Partial<MockWorkerRecord> = {}): MockWorkerRecord => ({
  id: 'worker-uuid-001',
  tenantId: 'tenant-uuid-001',
  name: 'Test Worker',
  description: 'A test execution agent',
  apiKeyHash: '',
  apiKeyPrefix: '',
  isActive: true,
  lastSeenAt: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
  ...overrides,
});

/**
 * Configure the mock DB to return specific results for the select chains.
 *
 * The validateApiKey function issues up to 3 select() calls:
 * 1. api_keys table by prefix → keyResult
 * 2. workers table by id → workerResult
 * 3. worker_project_access table → projectAccessResult
 */
const configureMockDb = (
  keyResult: MockApiKeyRecord[],
  workerResult: MockWorkerRecord[] = [],
  projectAccessResult: MockProjectAccessRecord[] = [],
): void => {
  // Reset all call tracking
  mockDb.select.mockReset();
  mockDb.update.mockReset();
  mockUpdateSet.mockReset();
  mockUpdateWhere.mockReset();
  mockUpdateThen.mockReset();

  // Re-wire update chain after reset
  mockDb.update.mockReturnValue({ set: mockUpdateSet });
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
  mockUpdateWhere.mockReturnValue({ then: mockUpdateThen });
  mockUpdateThen.mockReturnValue(Promise.resolve());

  // Track which select() call we're on
  let selectCallCount = 0;

  mockDb.select.mockImplementation(() => {
    selectCallCount += 1;

    if (selectCallCount === 1) {
      // API keys table select: select().from(apiKeysTable).where(...).limit(1)
      const mockFrom = vi.fn();
      const mockWhere = vi.fn();
      const mockLimit = vi.fn();
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });
      mockLimit.mockResolvedValue(keyResult);
      return { from: mockFrom };
    }

    if (selectCallCount === 2) {
      // Workers table select: select().from(workersTable).where(...).limit(1)
      const mockFrom = vi.fn();
      const mockWhere = vi.fn();
      const mockLimit = vi.fn();
      mockFrom.mockReturnValue({ where: mockWhere });
      mockWhere.mockReturnValue({ limit: mockLimit });
      mockLimit.mockResolvedValue(workerResult);
      return { from: mockFrom };
    }

    // Project access select: select({ projectId }).from(...).where(...)
    const mockFrom = vi.fn();
    const mockWhere = vi.fn();
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue(projectAccessResult);
    return { from: mockFrom };
  });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Import the function under test AFTER mocks are set up
// (vitest hoists vi.mock calls, so the import below will use the mocked module)
const { validateApiKey } = await import('@/lib/middleware/api-key-validator');

describe('validateApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Missing / malformed header
  // -------------------------------------------------------------------------

  it('should return null for a missing Authorization header', async () => {
    const req = createMockRequest();

    const result = await validateApiKey(req);

    expect(result).toBeNull();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('should return null for an empty Authorization header', async () => {
    const req = createMockRequest('');

    const result = await validateApiKey(req);

    expect(result).toBeNull();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('should return null for an Authorization header without Bearer prefix', async () => {
    const { plaintextKey }: GeneratedApiKey = generateApiKey();
    const req = createMockRequest(plaintextKey);

    const result = await validateApiKey(req);

    expect(result).toBeNull();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Malformed key format
  // -------------------------------------------------------------------------

  it('should return null for a malformed key format', async () => {
    const req = createMockRequest('Bearer not_a_valid_key');

    const result = await validateApiKey(req);

    expect(result).toBeNull();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('should return null for a key with wrong prefix format', async () => {
    const req = createMockRequest('Bearer xx_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4');

    const result = await validateApiKey(req);

    expect(result).toBeNull();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('should return null for a key that is too short', async () => {
    const req = createMockRequest('Bearer lw_a1b2c3d4');

    const result = await validateApiKey(req);

    expect(result).toBeNull();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Valid format, no matching prefix in DB
  // -------------------------------------------------------------------------

  it('should return null for a key with valid format but no matching prefix', async () => {
    const apiKey: GeneratedApiKey = generateApiKey();
    configureMockDb([]);

    const req = createMockRequest(`Bearer ${apiKey.plaintextKey}`);

    const result = await validateApiKey(req);

    expect(result).toBeNull();
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Matching prefix, wrong hash (prefix collision scenario)
  // -------------------------------------------------------------------------

  it('should return null for a key with matching prefix but wrong hash', async () => {
    const apiKey: GeneratedApiKey = generateApiKey();

    const differentHash = hashApiKey('lw_ffffffffffffffffffffffffffffffffffffffffffffffff');
    const keyRecord = createMockApiKeyRecord(apiKey, {
      hashedKey: differentHash,
    });

    configureMockDb([keyRecord]);

    const req = createMockRequest(`Bearer ${apiKey.plaintextKey}`);

    const result = await validateApiKey(req);

    expect(result).toBeNull();
    // Should have queried api_keys but not workers or project access
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Revoked key
  // -------------------------------------------------------------------------

  it('should return null for a revoked key', async () => {
    const apiKey: GeneratedApiKey = generateApiKey();
    const keyRecord = createMockApiKeyRecord(apiKey, { isRevoked: true });

    configureMockDb([keyRecord]);

    const req = createMockRequest(`Bearer ${apiKey.plaintextKey}`);

    const result = await validateApiKey(req);

    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Expired key (past expires_at)
  // -------------------------------------------------------------------------

  it('should return null for an expired key', async () => {
    const apiKey: GeneratedApiKey = generateApiKey();
    const keyRecord = createMockApiKeyRecord(apiKey, {
      expiresAt: new Date('2020-01-01T00:00:00Z'),
    });

    configureMockDb([keyRecord]);

    const req = createMockRequest(`Bearer ${apiKey.plaintextKey}`);

    const result = await validateApiKey(req);

    expect(result).toBeNull();
  });

  it('should accept a key with a future expires_at', async () => {
    const apiKey: GeneratedApiKey = generateApiKey();
    const keyRecord = createMockApiKeyRecord(apiKey, {
      expiresAt: new Date('2099-12-31T23:59:59Z'),
    });
    const worker = createMockWorker();

    configureMockDb([keyRecord], [worker], []);

    const req = createMockRequest(`Bearer ${apiKey.plaintextKey}`);

    const result = await validateApiKey(req);

    expect(result).not.toBeNull();
    expect(result!.workerId).toBe('worker-uuid-001');
  });

  it('should accept a key with null expires_at (never expires)', async () => {
    const apiKey: GeneratedApiKey = generateApiKey();
    const keyRecord = createMockApiKeyRecord(apiKey, { expiresAt: null });
    const worker = createMockWorker();

    configureMockDb([keyRecord], [worker], []);

    const req = createMockRequest(`Bearer ${apiKey.plaintextKey}`);

    const result = await validateApiKey(req);

    expect(result).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Valid hash, inactive worker
  // -------------------------------------------------------------------------

  it('should return null for an inactive worker', async () => {
    const apiKey: GeneratedApiKey = generateApiKey();
    const keyRecord = createMockApiKeyRecord(apiKey);
    const worker = createMockWorker({ isActive: false });

    configureMockDb([keyRecord], [worker]);

    const req = createMockRequest(`Bearer ${apiKey.plaintextKey}`);

    const result = await validateApiKey(req);

    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Valid key, active worker → success
  // -------------------------------------------------------------------------

  it('should return WorkerAuthContext for a valid API key', async () => {
    const apiKey: GeneratedApiKey = generateApiKey();
    const keyRecord = createMockApiKeyRecord(apiKey);
    const worker = createMockWorker();

    configureMockDb(
      [keyRecord],
      [worker],
      [{ projectId: 'project-uuid-001' }, { projectId: 'project-uuid-002' }],
    );

    const req = createMockRequest(`Bearer ${apiKey.plaintextKey}`);

    const result: WorkerAuthContext | null = await validateApiKey(req);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('agent');
    expect(result!.workerId).toBe('worker-uuid-001');
    expect(result!.workerName).toBe('Test Worker');
    expect(result!.tenantId).toBe('tenant-uuid-001');
    expect(result!.projectAccess).toEqual(['project-uuid-001', 'project-uuid-002']);
  });

  // -------------------------------------------------------------------------
  // Context injection onto request object
  // -------------------------------------------------------------------------

  it('should inject WorkerAuthContext onto req.workerAuth', async () => {
    const apiKey: GeneratedApiKey = generateApiKey();
    const keyRecord = createMockApiKeyRecord(apiKey);
    const worker = createMockWorker();

    configureMockDb([keyRecord], [worker], [{ projectId: 'project-uuid-aaa' }]);

    const req = createMockRequest(`Bearer ${apiKey.plaintextKey}`);

    await validateApiKey(req);

    // Verify the context was injected onto the request object
    const authReq = req as AuthenticatedApiRequest;
    expect(authReq.workerAuth).toBeDefined();
    expect(authReq.workerAuth.type).toBe('agent');
    expect(authReq.workerAuth.workerId).toBe('worker-uuid-001');
    expect(authReq.workerAuth.workerName).toBe('Test Worker');
    expect(authReq.workerAuth.tenantId).toBe('tenant-uuid-001');
    expect(authReq.workerAuth.projectAccess).toEqual(['project-uuid-aaa']);
  });

  it('should not inject workerAuth onto request for invalid key', async () => {
    configureMockDb([]);

    const apiKey: GeneratedApiKey = generateApiKey();
    const req = createMockRequest(`Bearer ${apiKey.plaintextKey}`);

    await validateApiKey(req);

    const authReq = req as AuthenticatedApiRequest;
    expect(authReq.workerAuth).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Project access loading
  // -------------------------------------------------------------------------

  it('should include project access list in worker context', async () => {
    const apiKey: GeneratedApiKey = generateApiKey();
    const keyRecord = createMockApiKeyRecord(apiKey);
    const worker = createMockWorker();

    const projectIds = ['project-uuid-aaa', 'project-uuid-bbb', 'project-uuid-ccc'];

    configureMockDb(
      [keyRecord],
      [worker],
      projectIds.map((projectId) => ({ projectId })),
    );

    const req = createMockRequest(`Bearer ${apiKey.plaintextKey}`);

    const result: WorkerAuthContext | null = await validateApiKey(req);

    expect(result).not.toBeNull();
    expect(result!.projectAccess).toHaveLength(3);
    expect(result!.projectAccess).toEqual(projectIds);
  });

  it('should return empty project access when worker has no projects', async () => {
    const apiKey: GeneratedApiKey = generateApiKey();
    const keyRecord = createMockApiKeyRecord(apiKey);
    const worker = createMockWorker();

    configureMockDb([keyRecord], [worker], []);

    const req = createMockRequest(`Bearer ${apiKey.plaintextKey}`);

    const result: WorkerAuthContext | null = await validateApiKey(req);

    expect(result).not.toBeNull();
    expect(result!.projectAccess).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // last_used_at update on API key record (fire-and-forget)
  // -------------------------------------------------------------------------

  it('should trigger last_used_at update on the API key record for a valid key', async () => {
    const apiKey: GeneratedApiKey = generateApiKey();
    const keyRecord = createMockApiKeyRecord(apiKey);
    const worker = createMockWorker();

    configureMockDb([keyRecord], [worker], []);

    const req = createMockRequest(`Bearer ${apiKey.plaintextKey}`);

    await validateApiKey(req);

    // The middleware calls db.update(apiKeysTable).set({ lastUsedAt }).where(...)
    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledTimes(1);

    // Verify the set call received a lastUsedAt Date
    const setArg = mockUpdateSet.mock.calls[0]![0] as { lastUsedAt: Date };
    expect(setArg.lastUsedAt).toBeInstanceOf(Date);
  });

  it('should not trigger last_used_at update for an invalid key', async () => {
    configureMockDb([]);

    const apiKey: GeneratedApiKey = generateApiKey();
    const req = createMockRequest(`Bearer ${apiKey.plaintextKey}`);

    await validateApiKey(req);

    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
