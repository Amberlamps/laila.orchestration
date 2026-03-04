# Set Up MSW and Auth Mocking

## Task Details

- **Title:** Set Up MSW and Auth Mocking
- **Status:** Complete
- **Assigned Agent:** test-automator
- **Parent User Story:** [Set Up Playwright Infrastructure](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** Configure Playwright Multi-Browser

## Description

Configure MSW (Mock Service Worker) v2 for E2E test API mocking, create a mocked Google OAuth flow that bypasses real Google servers and creates a test session via Better Auth fixtures, and build factory functions for generating test entities (projects, epics, stories, tasks, workers, personas) with valid inter-entity relationships.

### MSW v2 Configuration for E2E Tests

Install MSW and configure it to intercept API requests during Playwright tests. MSW runs in the browser via a service worker, intercepting `fetch` calls to `/api/v1/*` endpoints and returning mocked responses.

```bash
# Install MSW in the web workspace
pnpm --filter web add -D msw
# Generate the service worker file for browser interception
pnpm --filter web exec msw init public/ --save
```

### MSW Request Handlers

Create request handlers that mock all `/api/v1/*` REST endpoints. These handlers use factory functions to generate realistic response data.

```typescript
// apps/web/e2e/fixtures/msw-handlers.ts
// MSW v2 request handlers for mocking the REST API during E2E tests.
// Each handler returns factory-generated data with correct relationships.
import { http, HttpResponse, type HttpHandler } from 'msw';
import {
  createMockProject,
  createMockEpic,
  createMockStory,
  createMockTask,
  createMockWorker,
  createMockPersona,
  createMockAuditLogEntry,
  type MockProject,
  type MockStory,
} from './entity-factories';

// In-memory data store for stateful E2E test scenarios.
// MSW handlers read from and write to this store, enabling
// tests to create entities and verify their persistence.
interface TestDataStore {
  projects: Map<string, MockProject>;
  epics: Map<string, ReturnType<typeof createMockEpic>>;
  stories: Map<string, MockStory>;
  tasks: Map<string, ReturnType<typeof createMockTask>>;
  workers: Map<string, ReturnType<typeof createMockWorker>>;
  personas: Map<string, ReturnType<typeof createMockPersona>>;
  auditLog: ReturnType<typeof createMockAuditLogEntry>[];
}

// Singleton data store. Reset between tests via resetTestData().
let dataStore: TestDataStore = createEmptyStore();

function createEmptyStore(): TestDataStore {
  return {
    projects: new Map(),
    epics: new Map(),
    stories: new Map(),
    tasks: new Map(),
    workers: new Map(),
    personas: new Map(),
    auditLog: [],
  };
}

/** Reset all test data between test runs. */
export function resetTestData(): void {
  dataStore = createEmptyStore();
}

/** Seed the data store with pre-built entities for a test scenario. */
export function seedTestData(seed: Partial<TestDataStore>): void {
  if (seed.projects) {
    seed.projects.forEach((p, id) => dataStore.projects.set(id, p));
  }
  if (seed.workers) {
    seed.workers.forEach((w, id) => dataStore.workers.set(id, w));
  }
  // ... repeat for other entity types
}

/** All MSW handlers for the /api/v1 REST API. */
export const apiHandlers: HttpHandler[] = [
  // --- Projects ---
  http.get('/api/v1/projects', () => {
    return HttpResponse.json({
      data: Array.from(dataStore.projects.values()),
    });
  }),

  http.get('/api/v1/projects/:id', ({ params }) => {
    const project = dataStore.projects.get(params.id as string);
    if (!project) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: project });
  }),

  http.post('/api/v1/projects', async ({ request }) => {
    const body = (await request.json()) as Record<string, string>;
    const project = createMockProject({
      name: body.name,
      description: body.description,
    });
    dataStore.projects.set(project.id, project);
    dataStore.auditLog.push(
      createMockAuditLogEntry({
        action: 'project.created',
        entityId: project.id,
        entityName: project.name,
      }),
    );
    return HttpResponse.json({ data: project }, { status: 201 });
  }),

  http.delete('/api/v1/projects/:id', ({ params }) => {
    const id = params.id as string;
    const project = dataStore.projects.get(id);
    if (!project) return new HttpResponse(null, { status: 404 });
    dataStore.projects.delete(id);
    return HttpResponse.json({ data: { deleted: true } });
  }),

  // --- Epics ---
  http.get('/api/v1/projects/:projectId/epics', ({ params }) => {
    const projectId = params.projectId as string;
    const epics = Array.from(dataStore.epics.values()).filter((e) => e.projectId === projectId);
    return HttpResponse.json({ data: epics });
  }),

  http.post('/api/v1/projects/:projectId/epics', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, string>;
    const epic = createMockEpic({
      projectId: params.projectId as string,
      title: body.title,
      description: body.description,
    });
    dataStore.epics.set(epic.id, epic);
    return HttpResponse.json({ data: epic }, { status: 201 });
  }),

  // --- Stories ---
  http.get('/api/v1/epics/:epicId/stories', ({ params }) => {
    const epicId = params.epicId as string;
    const stories = Array.from(dataStore.stories.values()).filter((s) => s.epicId === epicId);
    return HttpResponse.json({ data: stories });
  }),

  // --- Work Assignment (Orchestration) ---
  http.post('/api/v1/work/request', async ({ request }) => {
    // Simulate worker requesting work. Find the first story
    // in "not-started" status and assign it to the requesting worker.
    const body = (await request.json()) as { workerId: string };
    const availableStory = Array.from(dataStore.stories.values()).find(
      (s) => s.status === 'not-started',
    );
    if (!availableStory) {
      return HttpResponse.json({ data: null, message: 'No work available' });
    }
    availableStory.status = 'in-progress';
    availableStory.assignedWorkerId = body.workerId;
    return HttpResponse.json({ data: availableStory });
  }),

  // --- Audit Log ---
  http.get('/api/v1/audit-log', () => {
    return HttpResponse.json({
      data: dataStore.auditLog.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    });
  }),
];
```

### Mocked Google OAuth Flow

Create a mocked OAuth flow that bypasses real Google servers. The mock intercepts Better Auth's OAuth initiation and callback endpoints, returning a valid test session without network access to Google.

```typescript
// apps/web/e2e/fixtures/auth.fixture.ts
// Mocked Google OAuth flow for E2E tests. Intercepts Better Auth's
// OAuth endpoints and creates a test session without hitting Google.
import { http, HttpResponse, type HttpHandler } from 'msw';

/** Test user profile used across all authenticated E2E tests. */
export const TEST_USER = {
  id: 'test-user-001',
  name: 'E2E Test User',
  email: 'e2e-test@laila.works',
  image: 'https://example.com/avatar.png',
} as const;

/** Test session returned by the mocked auth endpoints. */
export const TEST_SESSION = {
  user: TEST_USER,
  session: {
    id: 'test-session-001',
    userId: TEST_USER.id,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    token: 'mock-jwt-token-for-e2e-tests',
  },
} as const;

/**
 * MSW handlers that mock the Better Auth Google OAuth flow.
 * These handlers intercept:
 * 1. The OAuth initiation redirect (GET /api/auth/signin/google)
 * 2. The OAuth callback (GET /api/auth/callback/google)
 * 3. The session endpoint (GET /api/auth/get-session)
 * 4. The sign-out endpoint (POST /api/auth/sign-out)
 */
export const authHandlers: HttpHandler[] = [
  // Intercept the OAuth initiation. Instead of redirecting to Google,
  // immediately redirect to the callback with a mock code.
  http.get('/api/auth/signin/google', () => {
    return HttpResponse.redirect(
      '/api/auth/callback/google?code=mock-auth-code&state=mock-state',
      302,
    );
  }),

  // Intercept the OAuth callback. Instead of exchanging the code with
  // Google, create a test session directly and redirect to dashboard.
  http.get('/api/auth/callback/google', () => {
    return HttpResponse.redirect('/dashboard', 302, {
      headers: {
        // Set session cookies that Better Auth would normally set.
        'Set-Cookie': [
          `better-auth.session_token=${TEST_SESSION.session.token}; Path=/; HttpOnly; SameSite=Lax`,
          `better-auth.session_data=${encodeURIComponent(JSON.stringify(TEST_SESSION))}; Path=/; HttpOnly; SameSite=Lax`,
        ].join(', '),
      },
    });
  }),

  // Return the current test session for session checks.
  http.get('/api/auth/get-session', () => {
    return HttpResponse.json(TEST_SESSION);
  }),

  // Handle sign-out by clearing the session.
  http.post('/api/auth/sign-out', () => {
    return HttpResponse.json(
      { success: true },
      {
        headers: {
          'Set-Cookie': 'better-auth.session_token=; Path=/; HttpOnly; Max-Age=0',
        },
      },
    );
  }),
];

/** Handler that simulates an expired session (returns 401). */
export const expiredSessionHandler: HttpHandler = http.get('/api/auth/get-session', () => {
  return new HttpResponse(null, { status: 401 });
});

/** Handler that simulates an OAuth failure (error redirect). */
export const oauthFailureHandler: HttpHandler = http.get('/api/auth/callback/google', () => {
  return HttpResponse.redirect(
    '/sign-in?error=OAuthCallbackError&error_description=Authentication+failed',
    302,
  );
});
```

### Entity Factory Functions

Create type-safe factory functions for generating test entities with valid defaults and inter-entity relationships.

```typescript
// apps/web/e2e/fixtures/entity-factories.ts
// Factory functions for generating type-safe test entities.
// Each factory produces a complete entity with sensible defaults
// that can be overridden via partial input.
import { randomUUID } from 'crypto';

// ---- Entity Types ----
// These mirror the domain types from @laila/shared but are defined
// locally to avoid importing application code into test fixtures.

type EntityStatus =
  | 'draft'
  | 'not-started'
  | 'blocked'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'ready';

export interface MockProject {
  id: string;
  name: string;
  description: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
}

export interface MockEpic {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MockStory {
  id: string;
  epicId: string;
  title: string;
  description: string;
  status: EntityStatus;
  assignedWorkerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MockTask {
  id: string;
  storyId: string;
  title: string;
  description: string;
  status: EntityStatus;
  personaId: string;
  acceptanceCriteria: string[];
  dependsOn: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MockWorker {
  id: string;
  name: string;
  apiKeyPrefix: string;
  status: 'active' | 'inactive';
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MockPersona {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface MockAuditLogEntry {
  id: string;
  action: string;
  actorId: string;
  actorName: string;
  entityId: string;
  entityName: string;
  entityType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ---- Factory Functions ----

const now = () => new Date().toISOString();

/** Create a mock project with sensible defaults. */
export function createMockProject(overrides: Partial<MockProject> = {}): MockProject {
  return {
    id: randomUUID(),
    name: 'Test Project',
    description: 'A test project for E2E testing',
    status: 'draft',
    createdAt: now(),
    updatedAt: now(),
    ownerId: 'test-user-001',
    ...overrides,
  };
}

/** Create a mock epic with sensible defaults. */
export function createMockEpic(overrides: Partial<MockEpic> = {}): MockEpic {
  return {
    id: randomUUID(),
    projectId: 'default-project-id',
    title: 'Test Epic',
    description: 'A test epic for E2E testing',
    status: 'draft',
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

/** Create a mock story with sensible defaults. */
export function createMockStory(overrides: Partial<MockStory> = {}): MockStory {
  return {
    id: randomUUID(),
    epicId: 'default-epic-id',
    title: 'Test Story',
    description: 'A test story for E2E testing',
    status: 'draft',
    assignedWorkerId: null,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

/** Create a mock task with sensible defaults. */
export function createMockTask(overrides: Partial<MockTask> = {}): MockTask {
  return {
    id: randomUUID(),
    storyId: 'default-story-id',
    title: 'Test Task',
    description: 'A test task for E2E testing',
    status: 'draft',
    personaId: 'default-persona-id',
    acceptanceCriteria: ['Task output is verified'],
    dependsOn: [],
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

/** Create a mock worker with sensible defaults. */
export function createMockWorker(overrides: Partial<MockWorker> = {}): MockWorker {
  return {
    id: randomUUID(),
    name: 'Test Worker',
    apiKeyPrefix: 'lw_test',
    status: 'active',
    projectIds: [],
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

/** Create a mock persona with sensible defaults. */
export function createMockPersona(overrides: Partial<MockPersona> = {}): MockPersona {
  return {
    id: randomUUID(),
    title: 'Test Persona',
    description: 'A test persona for E2E testing',
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

/** Create a mock audit log entry with sensible defaults. */
export function createMockAuditLogEntry(
  overrides: Partial<MockAuditLogEntry> = {},
): MockAuditLogEntry {
  return {
    id: randomUUID(),
    action: 'entity.created',
    actorId: 'test-user-001',
    actorName: 'E2E Test User',
    entityId: 'default-entity-id',
    entityName: 'Test Entity',
    entityType: 'project',
    metadata: {},
    createdAt: now(),
    ...overrides,
  };
}

// ---- Composite Factories ----

/** Create a complete project plan with epic, story, tasks, and dependencies. */
export function createMockProjectPlan() {
  const persona = createMockPersona({ title: 'Backend Developer' });
  const project = createMockProject({ name: 'E2E Test Plan', status: 'ready' });
  const epic = createMockEpic({
    projectId: project.id,
    title: 'Core Feature Epic',
    status: 'ready',
  });
  const story = createMockStory({
    epicId: epic.id,
    title: 'Implement Feature',
    status: 'not-started',
  });

  // Create 3 tasks with a linear dependency chain: task1 -> task2 -> task3
  const task1 = createMockTask({
    storyId: story.id,
    title: 'Setup Database Schema',
    personaId: persona.id,
    status: 'not-started',
    dependsOn: [],
  });
  const task2 = createMockTask({
    storyId: story.id,
    title: 'Implement API Endpoint',
    personaId: persona.id,
    status: 'blocked',
    dependsOn: [task1.id],
  });
  const task3 = createMockTask({
    storyId: story.id,
    title: 'Write Integration Tests',
    personaId: persona.id,
    status: 'blocked',
    dependsOn: [task2.id],
  });

  return { project, epic, story, tasks: [task1, task2, task3], persona };
}
```

### MSW Service Worker Setup in E2E Tests

Create a Playwright fixture that integrates MSW into the browser context for each test.

```typescript
// apps/web/e2e/fixtures/index.ts
// Custom Playwright test fixture that sets up MSW in the browser
// context, providing mocked API responses for all E2E tests.
import { test as base, type Page } from '@playwright/test';
import { authHandlers, TEST_SESSION } from './auth.fixture';
import { apiHandlers, resetTestData, seedTestData } from './msw-handlers';
import type { TestDataStore } from './msw-handlers';

// Extended Playwright test fixture with MSW integration.
// Every test using this fixture gets a browser with MSW active,
// intercepting all API and auth requests.
interface TestFixtures {
  /** Page with MSW already configured and auth session active. */
  authenticatedPage: Page;
  /** Seed test data into the MSW in-memory store before test runs. */
  seedData: (data: Partial<TestDataStore>) => void;
}

export const test = base.extend<TestFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Install MSW service worker and configure handlers.
    // This runs before each test to ensure a clean state.
    await page.addInitScript(() => {
      // MSW service worker is initialized via the public/mockServiceWorker.js
      // file generated during setup. The handlers are registered client-side.
      window.__MSW_ENABLED__ = true;
    });

    // Navigate to the app to activate the service worker.
    await page.goto('/');

    // Set the authenticated storage state (cookies).
    await page.context().addCookies([
      {
        name: 'better-auth.session_token',
        value: TEST_SESSION.session.token,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    await use(page);

    // Clean up MSW data store after each test.
    resetTestData();
  },

  seedData: async ({}, use) => {
    await use((data) => {
      seedTestData(data);
    });
  },
});

export { expect } from '@playwright/test';
export { TEST_USER, TEST_SESSION } from './auth.fixture';
```

## Acceptance Criteria

- [ ] MSW v2 is installed as a dev dependency in the web workspace
- [ ] Service worker file (`mockServiceWorker.js`) is generated in the `public/` directory
- [ ] MSW request handlers mock all `/api/v1/*` REST endpoints (projects, epics, stories, tasks, workers, personas, audit log, work assignment)
- [ ] In-memory data store enables stateful test scenarios (create → read → update → delete)
- [ ] `resetTestData()` function clears all test data between test runs
- [ ] `seedTestData()` function pre-populates the data store for specific test scenarios
- [ ] Mocked Google OAuth flow intercepts Better Auth endpoints (`/api/auth/signin/google`, `/api/auth/callback/google`, `/api/auth/get-session`, `/api/auth/sign-out`)
- [ ] OAuth mock creates a valid test session without hitting real Google servers
- [ ] `expiredSessionHandler` simulates an expired session returning 401
- [ ] `oauthFailureHandler` simulates an OAuth callback error
- [ ] Entity factory functions are type-safe with no `any` types
- [ ] Each factory function accepts partial overrides for customization
- [ ] `createMockProjectPlan()` composite factory generates a complete project with epic, story, 3 tasks with linear dependencies, and a persona
- [ ] Custom Playwright fixture (`test`) provides `authenticatedPage` with MSW active and auth session set
- [ ] All factory-generated entities have valid UUIDs, timestamps, and inter-entity relationship IDs

## Technical Notes

- MSW v2 uses the `http` namespace for REST handlers (replacing `rest` from v1). Ensure the v2 API is used consistently.
- The in-memory data store approach is preferred over static fixtures because E2E tests often need to create entities during the test and verify their persistence. The store enables this stateful behavior.
- The mocked OAuth flow uses HTTP redirects to simulate the real OAuth flow's redirect chain. Better Auth expects specific cookie names and formats -- the mock must match these exactly.
- Factory functions use `randomUUID()` for entity IDs to avoid collisions when multiple entities are created in a single test.
- The composite factory `createMockProjectPlan()` creates entities with real inter-entity relationships (task.storyId matches story.id, etc.), which is critical for testing the DAG graph and status cascades.
- MSW's service worker approach runs in the browser, intercepting actual `fetch` calls. This is more realistic than mocking at the Node.js level because it exercises the full TanStack Query pipeline.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — mocked OAuth provider)
- **Project Setup Specification:** Section G.7 (Mocking & Fixtures — MSW v2 for API mocking, factory functions, no `any` type)
- **Functional Requirements:** FR-AUTH-001 (Google OAuth), FR-WORK-001 (work assignment), all CRUD endpoints
- **Design Specification:** API response shapes, entity relationship model

## Estimated Complexity

Large — Configuring MSW v2 for browser-based E2E interception, mocking the complete Better Auth OAuth flow with correct cookie handling, building a stateful in-memory data store with full CRUD handlers, and creating type-safe factory functions with composite builders is a substantial infrastructure investment.
