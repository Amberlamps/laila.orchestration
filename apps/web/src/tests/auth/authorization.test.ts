/**
 * Unit tests for the authorization helpers: project access, tenant scoping,
 * query scope building, and auth type assertion functions.
 *
 * These are pure functions that operate on typed AuthContext objects without
 * any external dependencies (no database, no HTTP, no mocking required).
 *
 * Test groups:
 * - authorizeProjectAccess: human own-tenant granted, cross-tenant denied,
 *   worker authorized project granted, unauthorized project denied,
 *   cross-tenant worker denied
 * - authorizeTenantAccess: matching tenant granted, different tenant denied
 * - buildQueryScope: human scope (null projectIds), worker scope (project list)
 * - assertHumanAuth / assertAgentAuth: correct type passes, wrong type throws
 */

import { describe, it, expect } from 'vitest';

import {
  authorizeProjectAccess,
  authorizeTenantAccess,
  buildQueryScope,
  assertHumanAuth,
  assertAgentAuth,
  AuthorizationError,
} from '@/lib/middleware/authorization';

import type { WorkerAuthContext } from '@/lib/middleware/api-key-validator';
import type { AuthorizationResult } from '@/lib/middleware/authorization';
import type { HumanAuthContext } from '@/lib/middleware/with-auth';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/** Factory for a HumanAuthContext. */
const createHumanContext = (overrides: Partial<HumanAuthContext> = {}): HumanAuthContext => ({
  type: 'human',
  userId: 'user-uuid-001',
  email: 'jane@example.com',
  name: 'Jane Doe',
  image: 'https://example.com/avatar.jpg',
  tenantId: 'user-uuid-001',
  ...overrides,
});

/** Factory for a WorkerAuthContext. */
const createWorkerContext = (overrides: Partial<WorkerAuthContext> = {}): WorkerAuthContext => ({
  type: 'agent',
  workerId: 'worker-uuid-001',
  workerName: 'Test Worker',
  tenantId: 'tenant-uuid-001',
  projectAccess: ['project-uuid-001', 'project-uuid-002'],
  ...overrides,
});

// ---------------------------------------------------------------------------
// authorizeProjectAccess
// ---------------------------------------------------------------------------

describe('authorizeProjectAccess', () => {
  it('should grant human access to own tenant project', () => {
    const humanContext = createHumanContext({ tenantId: 'user-uuid-001' });

    const result: AuthorizationResult = authorizeProjectAccess(
      humanContext,
      'user-uuid-001', // projectTenantId matches
      'project-uuid-123',
    );

    expect(result.authorized).toBe(true);
    if (result.authorized) {
      expect(result.scope.tenantId).toBe('user-uuid-001');
      expect(result.scope.projectIds).toBeNull();
    }
  });

  it("should deny human access to another tenant's project", () => {
    const humanContext = createHumanContext({ tenantId: 'user-uuid-001' });

    const result: AuthorizationResult = authorizeProjectAccess(
      humanContext,
      'user-uuid-002', // different tenant
      'project-uuid-123',
    );

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.reason).toBe('You do not have access to this project');
    }
  });

  it('should grant worker access to authorized project', () => {
    const workerContext = createWorkerContext({
      tenantId: 'tenant-uuid-001',
      projectAccess: ['project-uuid-001', 'project-uuid-002'],
    });

    const result: AuthorizationResult = authorizeProjectAccess(
      workerContext,
      'tenant-uuid-001', // same tenant
      'project-uuid-001', // in access list
    );

    expect(result.authorized).toBe(true);
    if (result.authorized) {
      expect(result.scope.tenantId).toBe('tenant-uuid-001');
      expect(result.scope.projectIds).toEqual(['project-uuid-001', 'project-uuid-002']);
    }
  });

  it('should deny worker access to unauthorized project', () => {
    const workerContext = createWorkerContext({
      tenantId: 'tenant-uuid-001',
      projectAccess: ['project-uuid-001'],
    });

    const result: AuthorizationResult = authorizeProjectAccess(
      workerContext,
      'tenant-uuid-001', // same tenant
      'project-uuid-003', // NOT in access list
    );

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.reason).toBe('Worker does not have access to this project');
    }
  });

  it('should deny worker access to project in different tenant', () => {
    const workerContext = createWorkerContext({
      tenantId: 'tenant-uuid-001',
      projectAccess: ['project-uuid-001'],
    });

    const result: AuthorizationResult = authorizeProjectAccess(
      workerContext,
      'tenant-uuid-002', // different tenant
      'project-uuid-001', // even though it's in the access list
    );

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.reason).toBe('Worker does not belong to this tenant');
    }
  });

  it('should deny worker access when project access list is empty', () => {
    const workerContext = createWorkerContext({
      tenantId: 'tenant-uuid-001',
      projectAccess: [],
    });

    const result: AuthorizationResult = authorizeProjectAccess(
      workerContext,
      'tenant-uuid-001',
      'project-uuid-001',
    );

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.reason).toBe('Worker does not have access to this project');
    }
  });
});

// ---------------------------------------------------------------------------
// authorizeTenantAccess
// ---------------------------------------------------------------------------

describe('authorizeTenantAccess', () => {
  it('should grant human access to matching tenant resource', () => {
    const humanContext = createHumanContext({ tenantId: 'user-uuid-001' });

    const result: AuthorizationResult = authorizeTenantAccess(
      humanContext,
      'user-uuid-001', // matching tenant
    );

    expect(result.authorized).toBe(true);
    if (result.authorized) {
      expect(result.scope.tenantId).toBe('user-uuid-001');
      expect(result.scope.projectIds).toBeNull();
    }
  });

  it('should deny human access to different tenant resource', () => {
    const humanContext = createHumanContext({ tenantId: 'user-uuid-001' });

    const result: AuthorizationResult = authorizeTenantAccess(
      humanContext,
      'user-uuid-002', // different tenant
    );

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.reason).toBe('You do not have access to this resource');
    }
  });

  it('should grant worker access to matching tenant resource', () => {
    const workerContext = createWorkerContext({ tenantId: 'tenant-uuid-001' });

    const result: AuthorizationResult = authorizeTenantAccess(
      workerContext,
      'tenant-uuid-001', // matching tenant
    );

    expect(result.authorized).toBe(true);
    if (result.authorized) {
      expect(result.scope.tenantId).toBe('tenant-uuid-001');
      expect(result.scope.projectIds).toEqual(workerContext.projectAccess);
    }
  });

  it('should deny worker access to different tenant resource', () => {
    const workerContext = createWorkerContext({ tenantId: 'tenant-uuid-001' });

    const result: AuthorizationResult = authorizeTenantAccess(
      workerContext,
      'tenant-uuid-999', // different tenant
    );

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.reason).toBe('You do not have access to this resource');
    }
  });
});

// ---------------------------------------------------------------------------
// buildQueryScope
// ---------------------------------------------------------------------------

describe('buildQueryScope', () => {
  it('should return human scope with null projectIds', () => {
    const humanContext = createHumanContext({ tenantId: 'user-uuid-001' });

    const scope = buildQueryScope(humanContext);

    expect(scope.tenantId).toBe('user-uuid-001');
    expect(scope.projectIds).toBeNull();
  });

  it('should return worker scope with project access list', () => {
    const workerContext = createWorkerContext({
      tenantId: 'tenant-uuid-001',
      projectAccess: ['proj-a', 'proj-b', 'proj-c'],
    });

    const scope = buildQueryScope(workerContext);

    expect(scope.tenantId).toBe('tenant-uuid-001');
    expect(scope.projectIds).toEqual(['proj-a', 'proj-b', 'proj-c']);
  });

  it('should return worker scope with empty project access list', () => {
    const workerContext = createWorkerContext({
      tenantId: 'tenant-uuid-001',
      projectAccess: [],
    });

    const scope = buildQueryScope(workerContext);

    expect(scope.tenantId).toBe('tenant-uuid-001');
    expect(scope.projectIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// assertHumanAuth / assertAgentAuth
// ---------------------------------------------------------------------------

describe('assertHumanAuth / assertAgentAuth', () => {
  describe('assertHumanAuth', () => {
    it('should not throw for human auth context', () => {
      const humanContext = createHumanContext();

      expect(() => assertHumanAuth(humanContext)).not.toThrow();
    });

    it('should throw AuthorizationError for agent auth context', () => {
      const workerContext = createWorkerContext();

      expect(() => assertHumanAuth(workerContext)).toThrow(AuthorizationError);
      expect(() => assertHumanAuth(workerContext)).toThrow(
        'This action requires human authentication',
      );
    });

    it('should throw an error with code FORBIDDEN', () => {
      const workerContext = createWorkerContext();

      let thrownError: unknown;
      try {
        const fn: (ctx: Parameters<typeof assertHumanAuth>[0]) => void = assertHumanAuth;
        fn(workerContext);
        // Should not reach here
        expect.fail('assertHumanAuth should have thrown');
      } catch (error: unknown) {
        thrownError = error;
      }
      expect(thrownError).toBeInstanceOf(AuthorizationError);
      expect((thrownError as AuthorizationError).code).toBe('FORBIDDEN');
      expect((thrownError as AuthorizationError).name).toBe('AuthorizationError');
    });
  });

  describe('assertAgentAuth', () => {
    it('should not throw for agent auth context', () => {
      const workerContext = createWorkerContext();

      expect(() => assertAgentAuth(workerContext)).not.toThrow();
    });

    it('should throw AuthorizationError for human auth context', () => {
      const humanContext = createHumanContext();

      expect(() => assertAgentAuth(humanContext)).toThrow(AuthorizationError);
      expect(() => assertAgentAuth(humanContext)).toThrow(
        'This action requires agent authentication',
      );
    });

    it('should throw an error with code FORBIDDEN', () => {
      const humanContext = createHumanContext();

      let thrownError: unknown;
      try {
        const fn: (ctx: Parameters<typeof assertAgentAuth>[0]) => void = assertAgentAuth;
        fn(humanContext);
        expect.fail('assertAgentAuth should have thrown');
      } catch (error: unknown) {
        thrownError = error;
      }
      expect(thrownError).toBeInstanceOf(AuthorizationError);
      expect((thrownError as AuthorizationError).code).toBe('FORBIDDEN');
      expect((thrownError as AuthorizationError).name).toBe('AuthorizationError');
    });
  });
});
