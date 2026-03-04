/**
 * Unit tests for the DAG reconciler handler and reconciliation orchestration.
 *
 * Tests the Lambda entry point (`handler.ts`) and the orchestration logic
 * (`reconciliation.ts`). Database, audit, rules, and logger modules are
 * mocked so that tests focus on wiring, error handling, and summary
 * calculation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ReconcilerLogger } from '../logger';
import type { ReconciliationResult, ProjectRecord, ProjectDAG, CorrectionDetail } from '../types';
import type { ScheduledEvent, Context } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mock: db module
// ---------------------------------------------------------------------------

const mockFindActiveProjects = vi.fn();
const mockLoadProjectDAG = vi.fn();
const mockApplyCorrections = vi.fn();
const mockCreatePoolClient = vi.fn().mockReturnValue({});

vi.mock('../db', () => ({
  findActiveProjects: mockFindActiveProjects,
  loadProjectDAG: mockLoadProjectDAG,
  applyCorrections: mockApplyCorrections,
  createPoolClient: mockCreatePoolClient,
}));

// ---------------------------------------------------------------------------
// Mock: audit module
// ---------------------------------------------------------------------------

const mockWriteAllAuditEvents = vi.fn().mockResolvedValue(0);

vi.mock('../audit', () => ({
  writeAllAuditEvents: mockWriteAllAuditEvents,
  writeReconciliationAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mock: rules module (for handler/reconciliation tests only)
// ---------------------------------------------------------------------------

const mockRunAllRules = vi.fn();

vi.mock('../rules', () => ({
  runAllRules: mockRunAllRules,
}));

// ---------------------------------------------------------------------------
// Mock: logger module
// ---------------------------------------------------------------------------

const mockChildLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
};

vi.mock('../logger', () => ({
  createInvocationLogger: vi.fn().mockReturnValue(mockChildLogger),
  baseLogger: { child: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Mock: @laila/database
// ---------------------------------------------------------------------------

vi.mock('@laila/database', () => ({
  createDrizzleClient: vi.fn(),
  writeAuditEvent: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: @laila/metrics (CloudWatch client requires AWS_REGION at init)
// ---------------------------------------------------------------------------

vi.mock('@laila/metrics', () => ({
  recordCount: vi.fn(),
  recordDuration: vi.fn(),
  recordBytes: vi.fn(),
  flushMetrics: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeProject = (overrides: Partial<ProjectRecord> = {}): ProjectRecord => ({
  id: 'project-001',
  tenantId: 'tenant-001',
  name: 'Test Project',
  lifecycleStatus: 'active',
  workStatus: 'in_progress',
  ...overrides,
});

const makeEmptyDAG = (project: ProjectRecord): ProjectDAG => ({
  project,
  epics: [],
  stories: [],
  tasks: [],
  edges: [],
});

const makeCorrection = (overrides: Partial<CorrectionDetail> = {}): CorrectionDetail => ({
  projectId: 'project-001',
  entityType: 'task',
  entityId: 'task-001',
  entityName: 'Test Task',
  previousStatus: 'blocked',
  correctedStatus: 'pending',
  rule: 'rule-1',
  reason: 'All prerequisite tasks are done',
  ...overrides,
});

const createMockEvent = (): ScheduledEvent => ({
  version: '0',
  id: 'event-123',
  'detail-type': 'Scheduled Event',
  source: 'aws.events',
  account: '123456789012',
  time: '2026-03-04T12:00:00Z',
  region: 'us-east-1',
  resources: ['arn:aws:events:us-east-1:123456789012:rule/dag-reconciler'],
  detail: {},
});

const createMockContext = (): Context => ({
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'dag-reconciler',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:dag-reconciler',
  memoryLimitInMB: '256',
  awsRequestId: 'req-abc-123',
  logGroupName: '/aws/lambda/dag-reconciler',
  logStreamName: '2026/03/04/[$LATEST]abc123',
  getRemainingTimeInMillis: () => 30000,
  done: vi.fn(),
  fail: vi.fn(),
  succeed: vi.fn(),
});

const createMockLogger = (): ReconcilerLogger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('dag-reconciler', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: no active projects
    mockFindActiveProjects.mockResolvedValue([]);
    // Default: empty DAG
    mockLoadProjectDAG.mockImplementation((_db: unknown, project: ProjectRecord) =>
      Promise.resolve(makeEmptyDAG(project)),
    );
    // Default: no corrections
    mockRunAllRules.mockReturnValue([]);
    // Default: apply corrections succeeds
    mockApplyCorrections.mockResolvedValue(undefined);
    // Default: audit writes succeed
    mockWriteAllAuditEvents.mockResolvedValue(0);
  });

  // =========================================================================
  // Handler Tests
  // =========================================================================

  describe('handler', () => {
    it('should create a pool client with DATABASE_URL', async () => {
      const originalUrl = process.env['DATABASE_URL'];
      process.env['DATABASE_URL'] = 'postgres://test:test@localhost:5432/test';

      try {
        const { handler } = await import('../handler');
        await handler(createMockEvent(), createMockContext());

        expect(mockCreatePoolClient).toHaveBeenCalledWith(
          'postgres://test:test@localhost:5432/test',
        );
      } finally {
        if (originalUrl === undefined) {
          delete process.env['DATABASE_URL'];
        } else {
          process.env['DATABASE_URL'] = originalUrl;
        }
      }
    });

    it('should throw when DATABASE_URL is not set', async () => {
      const originalUrl = process.env['DATABASE_URL'];
      delete process.env['DATABASE_URL'];

      try {
        const { handler } = await import('../handler');
        await expect(handler(createMockEvent(), createMockContext())).rejects.toThrow(
          'DATABASE_URL is not set',
        );
      } finally {
        if (originalUrl !== undefined) {
          process.env['DATABASE_URL'] = originalUrl;
        }
      }
    });

    it('should return the correct summary shape', async () => {
      const originalUrl = process.env['DATABASE_URL'];
      process.env['DATABASE_URL'] = 'postgres://test:test@localhost:5432/test';

      try {
        const { handler } = await import('../handler');
        const result: ReconciliationResult = await handler(createMockEvent(), createMockContext());

        expect(result).toEqual({
          projectsChecked: 0,
          inconsistenciesFound: 0,
          correctionsMade: 0,
          errors: 0,
        });
      } finally {
        if (originalUrl === undefined) {
          delete process.env['DATABASE_URL'];
        } else {
          process.env['DATABASE_URL'] = originalUrl;
        }
      }
    });

    it('should log summary on completion', async () => {
      const originalUrl = process.env['DATABASE_URL'];
      process.env['DATABASE_URL'] = 'postgres://test:test@localhost:5432/test';

      try {
        const { handler } = await import('../handler');
        await handler(createMockEvent(), createMockContext());

        expect(mockChildLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            projectsChecked: 0,
            inconsistenciesFound: 0,
            correctionsMade: 0,
            errors: 0,
          }),
          'DAG reconciler completed',
        );
      } finally {
        if (originalUrl === undefined) {
          delete process.env['DATABASE_URL'];
        } else {
          process.env['DATABASE_URL'] = originalUrl;
        }
      }
    });

    it('should warn when inconsistencies are found', async () => {
      const originalUrl = process.env['DATABASE_URL'];
      process.env['DATABASE_URL'] = 'postgres://test:test@localhost:5432/test';

      const project = makeProject();
      mockFindActiveProjects.mockResolvedValue([project]);
      mockRunAllRules.mockReturnValue([makeCorrection()]);

      try {
        const { handler } = await import('../handler');
        await handler(createMockEvent(), createMockContext());

        expect(mockChildLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            inconsistenciesFound: 1,
            correctionsMade: 1,
          }),
          'Inconsistencies detected and corrected -- investigate if count is high',
        );
      } finally {
        if (originalUrl === undefined) {
          delete process.env['DATABASE_URL'];
        } else {
          process.env['DATABASE_URL'] = originalUrl;
        }
      }
    });

    it('should log invocation info with event time and resources', async () => {
      const originalUrl = process.env['DATABASE_URL'];
      process.env['DATABASE_URL'] = 'postgres://test:test@localhost:5432/test';

      try {
        const { handler } = await import('../handler');
        const event = createMockEvent();
        await handler(event, createMockContext());

        expect(mockChildLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            time: event.time,
            resources: event.resources,
          }),
          'DAG reconciler invoked',
        );
      } finally {
        if (originalUrl === undefined) {
          delete process.env['DATABASE_URL'];
        } else {
          process.env['DATABASE_URL'] = originalUrl;
        }
      }
    });
  });

  // =========================================================================
  // Reconciliation Tests
  // =========================================================================

  describe('reconcileAllProjects', () => {
    it('should process all active projects', async () => {
      const project1 = makeProject({ id: 'proj-1', name: 'Project 1' });
      const project2 = makeProject({ id: 'proj-2', name: 'Project 2' });
      mockFindActiveProjects.mockResolvedValue([project1, project2]);

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      await reconcileAllProjects({} as never, mockLogger);

      expect(mockLoadProjectDAG).toHaveBeenCalledTimes(2);
    });

    it('should load DAG for each project', async () => {
      const project = makeProject({ id: 'proj-1', name: 'Project 1' });
      mockFindActiveProjects.mockResolvedValue([project]);

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      await reconcileAllProjects({} as never, mockLogger);

      expect(mockLoadProjectDAG).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'proj-1', name: 'Project 1' }),
      );
    });

    it('should run rules and apply corrections when found', async () => {
      const project = makeProject();
      mockFindActiveProjects.mockResolvedValue([project]);

      const corrections = [
        makeCorrection({ entityId: 'task-1' }),
        makeCorrection({ entityId: 'task-2' }),
      ];
      mockRunAllRules.mockReturnValue(corrections);

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      await reconcileAllProjects({} as never, mockLogger);

      expect(mockApplyCorrections).toHaveBeenCalledTimes(1);
      expect(mockApplyCorrections).toHaveBeenCalledWith(expect.anything(), corrections);
    });

    it('should write audit events after corrections', async () => {
      const project = makeProject({ tenantId: 'tenant-audit' });
      mockFindActiveProjects.mockResolvedValue([project]);

      const corrections = [makeCorrection()];
      mockRunAllRules.mockReturnValue(corrections);

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      await reconcileAllProjects({} as never, mockLogger);

      expect(mockWriteAllAuditEvents).toHaveBeenCalledTimes(1);
      expect(mockWriteAllAuditEvents).toHaveBeenCalledWith(corrections, 'tenant-audit', mockLogger);
    });

    it('should handle per-project errors and continue to next project', async () => {
      const project1 = makeProject({ id: 'proj-err', name: 'Error Project' });
      const project2 = makeProject({ id: 'proj-ok', name: 'OK Project' });
      mockFindActiveProjects.mockResolvedValue([project1, project2]);

      let callCount = 0;
      mockLoadProjectDAG.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('DB connection lost'));
        }
        return Promise.resolve(makeEmptyDAG(project2));
      });

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      const result = await reconcileAllProjects({} as never, mockLogger);

      expect(result.projectsChecked).toBe(2);
      expect(result.errors).toBe(1);
      // Second project should still be processed
      expect(mockLoadProjectDAG).toHaveBeenCalledTimes(2);
    });

    it('should return accurate summary counts', async () => {
      const project1 = makeProject({ id: 'proj-1', name: 'Project 1' });
      const project2 = makeProject({ id: 'proj-2', name: 'Project 2' });
      const project3 = makeProject({ id: 'proj-3', name: 'Project 3' });
      mockFindActiveProjects.mockResolvedValue([project1, project2, project3]);

      let callIdx = 0;
      mockRunAllRules.mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) {
          return [makeCorrection({ entityId: 'c-1' }), makeCorrection({ entityId: 'c-2' })];
        }
        if (callIdx === 2) {
          return [makeCorrection({ entityId: 'c-3' })];
        }
        return [];
      });

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      const result = await reconcileAllProjects({} as never, mockLogger);

      expect(result.projectsChecked).toBe(3);
      expect(result.inconsistenciesFound).toBe(3);
      expect(result.correctionsMade).toBe(3);
      expect(result.errors).toBe(0);
    });

    it('should NOT call applyCorrections when no corrections found', async () => {
      const project = makeProject();
      mockFindActiveProjects.mockResolvedValue([project]);
      mockRunAllRules.mockReturnValue([]);

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      await reconcileAllProjects({} as never, mockLogger);

      expect(mockApplyCorrections).not.toHaveBeenCalled();
    });

    it('should handle empty projects list', async () => {
      mockFindActiveProjects.mockResolvedValue([]);

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      const result = await reconcileAllProjects({} as never, mockLogger);

      expect(result).toEqual({
        projectsChecked: 0,
        inconsistenciesFound: 0,
        correctionsMade: 0,
        errors: 0,
      });
      expect(mockLoadProjectDAG).not.toHaveBeenCalled();
    });

    it('should handle projects with no inconsistencies', async () => {
      const project = makeProject();
      mockFindActiveProjects.mockResolvedValue([project]);
      mockRunAllRules.mockReturnValue([]);

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      const result = await reconcileAllProjects({} as never, mockLogger);

      expect(result.inconsistenciesFound).toBe(0);
      expect(result.correctionsMade).toBe(0);
      expect(mockApplyCorrections).not.toHaveBeenCalled();
      expect(mockWriteAllAuditEvents).not.toHaveBeenCalled();
    });

    it('should log each correction at warn level', async () => {
      const project = makeProject();
      mockFindActiveProjects.mockResolvedValue([project]);

      const correction = makeCorrection({
        entityId: 'task-warned',
        entityName: 'Warned Task',
        rule: 'rule-1',
      });
      mockRunAllRules.mockReturnValue([correction]);

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      await reconcileAllProjects({} as never, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: 'task-warned',
          entityName: 'Warned Task',
          rule: 'rule-1',
        }),
        'Detected inconsistency, applying correction',
      );
    });

    it('should log project completion info after applying corrections', async () => {
      const project = makeProject({ id: 'proj-log', name: 'Logged Project' });
      mockFindActiveProjects.mockResolvedValue([project]);

      mockRunAllRules.mockReturnValue([makeCorrection()]);

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      await reconcileAllProjects({} as never, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-log',
          projectName: 'Logged Project',
          correctionCount: 1,
        }),
        'Applied corrections for project',
      );
    });

    it('should log DAG dimensions at debug level', async () => {
      const project = makeProject({ id: 'proj-debug' });
      mockFindActiveProjects.mockResolvedValue([project]);

      const dag = makeEmptyDAG(project);
      dag.epics = [
        {
          id: 'e1',
          tenantId: 'tenant-001',
          projectId: 'proj-debug',
          name: 'E1',
          workStatus: 'pending',
        },
      ];
      dag.stories = [
        {
          id: 's1',
          tenantId: 'tenant-001',
          epicId: 'e1',
          title: 'S1',
          workStatus: 'pending',
          assignedWorkerId: null,
        },
      ];
      dag.tasks = [
        { id: 't1', tenantId: 'tenant-001', userStoryId: 's1', title: 'T1', workStatus: 'pending' },
      ];
      mockLoadProjectDAG.mockResolvedValue(dag);

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      await reconcileAllProjects({} as never, mockLogger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-debug',
          epics: 1,
          stories: 1,
          tasks: 1,
          edges: 0,
        }),
        'Loaded project DAG',
      );
    });
  });

  // =========================================================================
  // Audit Integration Tests
  // =========================================================================

  describe('audit integration', () => {
    it('should call writeAllAuditEvents for each set of corrections', async () => {
      const project1 = makeProject({ id: 'proj-1', tenantId: 'tenant-1', name: 'P1' });
      const project2 = makeProject({ id: 'proj-2', tenantId: 'tenant-2', name: 'P2' });
      mockFindActiveProjects.mockResolvedValue([project1, project2]);

      let callIdx = 0;
      mockRunAllRules.mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) return [makeCorrection({ projectId: 'proj-1' })];
        if (callIdx === 2) return [makeCorrection({ projectId: 'proj-2' })];
        return [];
      });

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      await reconcileAllProjects({} as never, mockLogger);

      expect(mockWriteAllAuditEvents).toHaveBeenCalledTimes(2);
      expect(mockWriteAllAuditEvents).toHaveBeenNthCalledWith(
        1,
        expect.arrayContaining([expect.objectContaining({ projectId: 'proj-1' })]),
        'tenant-1',
        mockLogger,
      );
      expect(mockWriteAllAuditEvents).toHaveBeenNthCalledWith(
        2,
        expect.arrayContaining([expect.objectContaining({ projectId: 'proj-2' })]),
        'tenant-2',
        mockLogger,
      );
    });

    it('should not call writeAllAuditEvents when there are no corrections', async () => {
      const project = makeProject();
      mockFindActiveProjects.mockResolvedValue([project]);
      mockRunAllRules.mockReturnValue([]);

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      await reconcileAllProjects({} as never, mockLogger);

      expect(mockWriteAllAuditEvents).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('edge cases', () => {
    it('should return zeros when no active projects exist', async () => {
      mockFindActiveProjects.mockResolvedValue([]);

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      const result = await reconcileAllProjects({} as never, mockLogger);

      expect(result).toEqual({
        projectsChecked: 0,
        inconsistenciesFound: 0,
        correctionsMade: 0,
        errors: 0,
      });
    });

    it('should handle project with no epics/stories/tasks without errors', async () => {
      const project = makeProject({ id: 'empty-proj' });
      mockFindActiveProjects.mockResolvedValue([project]);
      mockLoadProjectDAG.mockResolvedValue(makeEmptyDAG(project));
      mockRunAllRules.mockReturnValue([]);

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      const result = await reconcileAllProjects({} as never, mockLogger);

      expect(result.errors).toBe(0);
      expect(result.inconsistenciesFound).toBe(0);
    });

    it('should handle large number of projects with correct totals', async () => {
      const projects = Array.from({ length: 20 }, (_, i) =>
        makeProject({ id: `proj-${String(i)}`, name: `Project ${String(i)}` }),
      );
      mockFindActiveProjects.mockResolvedValue(projects);

      // Each project has 2 corrections
      mockRunAllRules.mockReturnValue([
        makeCorrection({ entityId: 'c-1' }),
        makeCorrection({ entityId: 'c-2' }),
      ]);

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      const result = await reconcileAllProjects({} as never, mockLogger);

      expect(result.projectsChecked).toBe(20);
      expect(result.inconsistenciesFound).toBe(40);
      expect(result.correctionsMade).toBe(40);
      expect(result.errors).toBe(0);
    });

    it('should count errors for all failing projects without crashing', async () => {
      const projects = Array.from({ length: 3 }, (_, i) =>
        makeProject({ id: `proj-${String(i)}`, name: `Project ${String(i)}` }),
      );
      mockFindActiveProjects.mockResolvedValue(projects);
      mockLoadProjectDAG.mockRejectedValue(new Error('Connection refused'));

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      const result = await reconcileAllProjects({} as never, mockLogger);

      expect(result.projectsChecked).toBe(3);
      expect(result.errors).toBe(3);
      expect(result.inconsistenciesFound).toBe(0);
      expect(result.correctionsMade).toBe(0);
    });

    it('should log errors for each failing project with project info', async () => {
      const project = makeProject({ id: 'proj-fail', name: 'Failing Project' });
      mockFindActiveProjects.mockResolvedValue([project]);
      mockLoadProjectDAG.mockRejectedValue(new Error('Connection timeout'));

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      await reconcileAllProjects({} as never, mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-fail',
          projectName: 'Failing Project',
          error: 'Connection timeout',
        }),
        'Failed to reconcile project',
      );
    });

    it('should handle non-Error thrown objects in error logging', async () => {
      const project = makeProject({ id: 'proj-non-err', name: 'Non-Error Project' });
      mockFindActiveProjects.mockResolvedValue([project]);
      mockLoadProjectDAG.mockRejectedValue('string error');

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      await reconcileAllProjects({} as never, mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-non-err',
          error: 'Unknown error',
        }),
        'Failed to reconcile project',
      );
    });

    it('should use console logger when no logger is provided', async () => {
      mockFindActiveProjects.mockResolvedValue([]);

      const { reconcileAllProjects } = await import('../reconciliation');

      // Should not throw when called without logger argument
      const result = await reconcileAllProjects({} as never);

      expect(result).toEqual({
        projectsChecked: 0,
        inconsistenciesFound: 0,
        correctionsMade: 0,
        errors: 0,
      });
    });

    it('should log project count at info level', async () => {
      const projects = [makeProject({ id: 'p1' }), makeProject({ id: 'p2' })];
      mockFindActiveProjects.mockResolvedValue(projects);

      const { reconcileAllProjects } = await import('../reconciliation');
      const mockLogger = createMockLogger();

      await reconcileAllProjects({} as never, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { projectCount: 2 },
        'Found active projects for reconciliation',
      );
    });
  });
});
