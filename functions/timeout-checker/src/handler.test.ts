/**
 * Unit tests for the timeout-checker Lambda handler.
 *
 * The handler is a thin wrapper that:
 * 1. Creates a pino logger scoped to the Lambda invocation
 * 2. Validates the DATABASE_URL environment variable
 * 3. Creates a Drizzle database client in pool mode
 * 4. Delegates to checkAndReclaimTimedOutStories
 * 5. Logs the result with structured pino output
 *
 * The orchestration logic is tested separately in __tests__/handler.test.ts;
 * here we verify the handler's wiring, error handling, and logging.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { ScheduledEvent, Context } from 'aws-lambda';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCreatePoolClient = vi.fn().mockReturnValue({});

vi.mock('./db', () => ({
  createPoolClient: mockCreatePoolClient,
}));

const mockCheckAndReclaim: ReturnType<typeof vi.fn> = vi.fn();

vi.mock('./orchestration', () => ({
  checkAndReclaimTimedOutStories: mockCheckAndReclaim,
}));

// Mock pino to capture structured log output
const mockChildLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
};

const mockCreateInvocationLogger = vi.fn().mockReturnValue(mockChildLogger);

vi.mock('./logger', () => ({
  createInvocationLogger: mockCreateInvocationLogger,
}));

vi.mock('@laila/metrics', () => ({
  recordCount: vi.fn(),
  recordDuration: vi.fn(),
  recordBytes: vi.fn(),
  flushMetrics: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const createScheduledEvent = (overrides: Partial<ScheduledEvent> = {}): ScheduledEvent => ({
  'detail-type': 'Scheduled Event',
  source: 'aws.events',
  time: '2026-03-04T12:00:00Z',
  region: 'us-east-1',
  resources: ['arn:aws:events:us-east-1:123456789:rule/timeout-checker'],
  detail: {},
  version: '0',
  id: 'event-id-001',
  account: '123456789',
  ...overrides,
});

const createContext = (overrides: Partial<Context> = {}): Context => ({
  awsRequestId: 'req-id-001',
  callbackWaitsForEmptyEventLoop: true,
  functionName: 'timeout-checker',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789:function:timeout-checker',
  logGroupName: '/aws/lambda/timeout-checker',
  logStreamName: '2026/03/04/[$LATEST]abc123',
  memoryLimitInMB: '256',
  getRemainingTimeInMillis: () => 30000,
  done: vi.fn(),
  fail: vi.fn(),
  succeed: vi.fn(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('timeout-checker handler', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, DATABASE_URL: 'postgres://localhost/test' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('creates a pino logger with the Lambda request ID', async () => {
    const { handler } = await import('./handler');
    const context = createContext({ awsRequestId: 'my-req-id' });

    mockCheckAndReclaim.mockResolvedValueOnce({
      checked: 0,
      reclaimed: [],
      errors: 0,
    });

    await handler(createScheduledEvent(), context);

    expect(mockCreateInvocationLogger).toHaveBeenCalledWith('my-req-id');
  });

  it('throws when DATABASE_URL is not set', async () => {
    const { handler } = await import('./handler');
    delete process.env['DATABASE_URL'];

    await expect(handler(createScheduledEvent(), createContext())).rejects.toThrow(
      'DATABASE_URL is not set',
    );
    expect(mockChildLogger.error).toHaveBeenCalledWith('DATABASE_URL is not set');
  });

  it('creates a pool-mode database client', async () => {
    const { handler } = await import('./handler');
    process.env['DATABASE_URL'] = 'postgres://myhost/mydb';

    mockCheckAndReclaim.mockResolvedValueOnce({
      checked: 0,
      reclaimed: [],
      errors: 0,
    });

    await handler(createScheduledEvent(), createContext());

    expect(mockCreatePoolClient).toHaveBeenCalledWith('postgres://myhost/mydb');
  });

  it('passes the logger to the orchestration function', async () => {
    const { handler } = await import('./handler');

    mockCheckAndReclaim.mockResolvedValueOnce({
      checked: 0,
      reclaimed: [],
      errors: 0,
    });

    await handler(createScheduledEvent(), createContext());

    expect(mockCheckAndReclaim).toHaveBeenCalledWith(expect.anything(), mockChildLogger);
  });

  it('returns a summary when zero stories are in-progress', async () => {
    const { handler } = await import('./handler');

    mockCheckAndReclaim.mockResolvedValueOnce({
      checked: 0,
      reclaimed: [],
      errors: 0,
    });

    const result = await handler(createScheduledEvent(), createContext());

    expect(result).toEqual({
      checked: 0,
      reclaimed: 0,
      errors: 0,
    });
  });

  it('returns a summary with reclaimed story count', async () => {
    const { handler } = await import('./handler');

    mockCheckAndReclaim.mockResolvedValueOnce({
      checked: 5,
      reclaimed: [
        {
          storyId: 'story-1',
          storyName: 'Story One',
          workerId: 'worker-1',
          newStatus: 'not_started',
          timedOutAfterMinutes: 45,
        },
        {
          storyId: 'story-2',
          storyName: 'Story Two',
          workerId: 'worker-2',
          newStatus: 'blocked',
          timedOutAfterMinutes: 120,
        },
      ],
      errors: 0,
    });

    const result = await handler(createScheduledEvent(), createContext());

    expect(result).toEqual({
      checked: 5,
      reclaimed: 2,
      errors: 0,
    });
  });

  it('logs the invocation and completion with structured fields', async () => {
    const { handler } = await import('./handler');
    const event = createScheduledEvent({
      time: '2026-03-04T15:30:00Z',
      resources: ['arn:aws:events:us-east-1:123:rule/checker'],
    });

    mockCheckAndReclaim.mockResolvedValueOnce({
      checked: 3,
      reclaimed: [
        {
          storyId: 'story-1',
          storyName: 'Story One',
          workerId: 'worker-1',
          newStatus: 'not_started',
          timedOutAfterMinutes: 60,
        },
      ],
      errors: 1,
    });

    await handler(event, createContext());

    // Verify invocation log
    expect(mockChildLogger.info).toHaveBeenCalledWith(
      {
        time: '2026-03-04T15:30:00Z',
        resources: ['arn:aws:events:us-east-1:123:rule/checker'],
      },
      'Timeout checker invoked',
    );

    // Verify completion log
    expect(mockChildLogger.info).toHaveBeenCalledWith(
      {
        checked: 3,
        reclaimed: 1,
        errors: 1,
      },
      'Timeout checker completed',
    );

    // Verify reclaimed stories log
    expect(mockChildLogger.info).toHaveBeenCalledWith(
      {
        stories: [
          {
            storyId: 'story-1',
            storyName: 'Story One',
            workerId: 'worker-1',
            newStatus: 'not_started',
            timedOutAfterMinutes: 60,
          },
        ],
      },
      'Reclaimed timed-out stories',
    );
  });

  it('does not log reclaimed stories when none were reclaimed', async () => {
    const { handler } = await import('./handler');

    mockCheckAndReclaim.mockResolvedValueOnce({
      checked: 10,
      reclaimed: [],
      errors: 0,
    });

    await handler(createScheduledEvent(), createContext());

    // Should only have invocation and completion logs, not "Reclaimed timed-out stories"
    const infoCalls = mockChildLogger.info.mock.calls as unknown[][];
    const infoCallMessages = infoCalls.map(
      (call) => (call as [Record<string, unknown>, string | undefined])[1],
    );
    expect(infoCallMessages).not.toContain('Reclaimed timed-out stories');
  });

  it('includes errors count in the summary', async () => {
    const { handler } = await import('./handler');

    mockCheckAndReclaim.mockResolvedValueOnce({
      checked: 4,
      reclaimed: [],
      errors: 2,
    });

    const result = await handler(createScheduledEvent(), createContext());

    expect(result).toEqual({
      checked: 4,
      reclaimed: 0,
      errors: 2,
    });
  });
});
