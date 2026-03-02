# Set Up Playwright Infrastructure — Tasks

## User Story Summary

- **Title:** Set Up Playwright Infrastructure
- **Description:** Install Playwright, configure multi-browser support (Chromium, Firefox, WebKit) with parallel execution, create page object models for all major pages, set up MSW v2 mocking with Better Auth fixtures, and build shared E2E test utilities including polling helpers and strict typing.
- **Status:** Not Started
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Total Tasks:** 4
- **Dependencies:** None

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Configure Playwright Multi-Browser](./configure-playwright-multi-browser.md) | Install Playwright, configure playwright.config.ts for Chromium/Firefox/WebKit, parallel execution, base URL, screenshot/video on failure, HTML reporter, and set up test directory structure | Not Started | test-automator | None |
| [Create Page Object Models](./create-page-object-models.md) | Create page object model classes for all major pages: SignInPage, DashboardPage, ProjectListPage, ProjectDetailPage, EpicDetailPage, StoryDetailPage, TaskDetailPage, WorkerListPage, WorkerDetailPage, PersonaListPage, AuditLogPage, GraphPage | Not Started | test-automator | Configure Playwright Multi-Browser |
| [Set Up MSW and Auth Mocking](./setup-msw-and-auth-mocking.md) | Configure MSW v2 for E2E test API mocking, create mocked Google OAuth flow bypassing real Google, and build test fixtures/factories for generating test entities with valid relationships | Not Started | test-automator | Configure Playwright Multi-Browser |
| [Create E2E Test Utilities](./create-e2e-test-utilities.md) | Create shared E2E test utilities: test data setup helpers, navigation helpers, wait-for-polling helper for 15s TanStack Query cycles, assertion helpers for status badges/toasts/modals, with strict no-any typing | Not Started | test-automator | Create Page Object Models, Set Up MSW and Auth Mocking |

## Dependency Graph

```
Configure Playwright Multi-Browser
    |
    +---> Create Page Object Models --------+
    |                                        |
    +---> Set Up MSW and Auth Mocking ------+--> Create E2E Test Utilities
```

## Suggested Implementation Order

1. **Phase 1:** Configure Playwright Multi-Browser — installs Playwright and establishes the test directory structure all other tasks depend on
2. **Phase 2 (parallel):** Create Page Object Models + Set Up MSW and Auth Mocking — these two tasks are independent of each other but both depend on the Playwright config
3. **Phase 3:** Create E2E Test Utilities — combines page objects and MSW mocking into reusable test helpers
