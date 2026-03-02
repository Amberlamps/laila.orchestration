# Create E2E Test Utilities

## Task Details

- **Title:** Create E2E Test Utilities
- **Status:** Not Started
- **Assigned Agent:** test-automator
- **Parent User Story:** [Set Up Playwright Infrastructure](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** Create Page Object Models, Set Up MSW and Auth Mocking

## Description

Create shared E2E test utilities that combine page object models and MSW fixtures into reusable helpers. These utilities include test data setup helpers for common scenarios, navigation helpers for multi-step flows, a wait-for-polling helper that handles TanStack Query's 15-second polling interval, and assertion helpers for status badges, toast notifications, and confirmation modals. All utilities must use strict TypeScript typing with no `any` types.

### Navigation Helpers

Navigation helpers encapsulate multi-step navigation flows that are shared across multiple tests.

```typescript
// apps/web/e2e/utils/navigation.helpers.ts
// Navigation helpers for common multi-step flows across E2E tests.
// These helpers abstract away the navigation details so tests can
// focus on the behavior being tested.
import { type Page } from "@playwright/test";
import {
  ProjectListPage,
  ProjectDetailPage,
  EpicDetailPage,
  StoryDetailPage,
  DashboardPage,
} from "../page-objects";

/**
 * Navigate from the dashboard to a specific project's detail page.
 * Handles the navigation chain: Dashboard → Projects → Project Detail.
 */
export async function navigateToProject(
  page: Page,
  projectName: string
): Promise<ProjectDetailPage> {
  const dashboard = new DashboardPage(page);
  await dashboard.navigateTo("Projects");
  const projectList = new ProjectListPage(page);
  await projectList.openProject(projectName);
  return new ProjectDetailPage(page);
}

/**
 * Navigate from a project detail page to a specific epic's detail page.
 * Assumes the user is already on the project detail page.
 */
export async function navigateToEpic(
  page: Page,
  epicTitle: string
): Promise<EpicDetailPage> {
  const projectDetail = new ProjectDetailPage(page);
  await projectDetail.openEpic(epicTitle);
  return new EpicDetailPage(page);
}

/**
 * Navigate from an epic detail page to a specific story's detail page.
 * Assumes the user is already on the epic detail page.
 */
export async function navigateToStory(
  page: Page,
  storyTitle: string
): Promise<StoryDetailPage> {
  const epicDetail = new EpicDetailPage(page);
  await epicDetail.openStory(storyTitle);
  return new StoryDetailPage(page);
}

/**
 * Navigate through the complete entity hierarchy:
 * Dashboard → Project → Epic → Story.
 * Returns the StoryDetailPage for further interaction.
 */
export async function navigateToStoryFromDashboard(
  page: Page,
  projectName: string,
  epicTitle: string,
  storyTitle: string
): Promise<StoryDetailPage> {
  await navigateToProject(page, projectName);
  await navigateToEpic(page, epicTitle);
  return navigateToStory(page, storyTitle);
}
```

### Polling Helpers

TanStack Query polls the API every 15 seconds. These helpers wait for the next polling cycle to ensure the UI reflects server-side changes made via MSW.

```typescript
// apps/web/e2e/utils/polling.helpers.ts
// Helpers for waiting on TanStack Query polling refresh cycles.
// TanStack Query is configured with a 15-second refetch interval.
// After mutating data via MSW, tests must wait for the next poll
// before asserting on UI updates.
import { type Page, expect } from "@playwright/test";

/**
 * Wait for the next TanStack Query polling cycle to complete.
 * Monitors network requests matching the API pattern and waits
 * for a successful response. Timeout is set to 20s to accommodate
 * the 15s polling interval plus network latency.
 */
export async function waitForPollingRefresh(
  page: Page,
  urlPattern: string | RegExp = /\/api\/v1\//
): Promise<void> {
  const pattern =
    typeof urlPattern === "string" ? new RegExp(urlPattern) : urlPattern;

  await page.waitForResponse(
    (response) => pattern.test(response.url()) && response.status() === 200,
    { timeout: 20_000 }
  );
}

/**
 * Wait for a specific API endpoint to return data matching a predicate.
 * Useful when waiting for a specific status change after a mutation.
 *
 * Example: wait for a project's status to change to "ready" after publishing.
 */
export async function waitForApiCondition<T>(
  page: Page,
  urlPattern: string | RegExp,
  predicate: (data: T) => boolean,
  options: { timeout?: number; pollInterval?: number } = {}
): Promise<T> {
  const { timeout = 30_000, pollInterval = 1_000 } = options;
  const startTime = Date.now();
  const pattern =
    typeof urlPattern === "string" ? new RegExp(urlPattern) : urlPattern;

  // Poll by intercepting responses until the predicate is satisfied.
  // This avoids relying solely on the 15s TanStack Query interval
  // by checking every response that matches the pattern.
  return new Promise<T>((resolve, reject) => {
    const checkTimeout = () => {
      if (Date.now() - startTime > timeout) {
        reject(new Error(`waitForApiCondition timed out after ${timeout}ms`));
      }
    };

    page.on("response", async (response) => {
      if (pattern.test(response.url()) && response.status() === 200) {
        try {
          const json = await response.json();
          const data = json.data as T;
          if (predicate(data)) {
            resolve(data);
          }
        } catch {
          // Response parsing failed, continue waiting.
        }
      }
      checkTimeout();
    });
  });
}

/**
 * Force a TanStack Query refetch by triggering a window focus event.
 * TanStack Query is configured to refetch on window focus, which
 * provides an immediate refresh without waiting for the polling interval.
 */
export async function triggerQueryRefetch(page: Page): Promise<void> {
  // Dispatch a focus event to trigger TanStack Query's refetchOnWindowFocus.
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
  });

  // Wait briefly for the refetch to complete.
  await page.waitForTimeout(500);
}
```

### Assertion Helpers

Custom assertion helpers for common UI patterns: status badges, toast notifications, confirmation modals, and form validation errors.

```typescript
// apps/web/e2e/utils/assertion.helpers.ts
// Custom assertion helpers for common UI patterns in E2E tests.
// These helpers provide semantic, reusable assertions that make
// tests more readable and maintainable.
import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Assert that a status badge displays the expected status text and
 * optionally has the expected visual variant (color class).
 */
export async function expectStatusBadge(
  page: Page,
  expectedStatus: string,
  options: { testId?: string; variant?: string } = {}
): Promise<void> {
  const { testId = "status-badge", variant } = options;
  const badge = page.getByTestId(testId);
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText(expectedStatus, { ignoreCase: true });

  if (variant) {
    await expect(badge).toHaveAttribute("data-variant", variant);
  }
}

/**
 * Assert that a success toast notification appears and auto-dismisses.
 */
export async function expectSuccessToast(
  page: Page,
  messagePattern: string | RegExp
): Promise<void> {
  const pattern =
    typeof messagePattern === "string"
      ? new RegExp(messagePattern, "i")
      : messagePattern;
  const toast = page.getByRole("status").filter({ hasText: pattern });
  await expect(toast).toBeVisible({ timeout: 5_000 });
}

/**
 * Assert that an error toast notification appears.
 */
export async function expectErrorToast(
  page: Page,
  messagePattern: string | RegExp
): Promise<void> {
  const pattern =
    typeof messagePattern === "string"
      ? new RegExp(messagePattern, "i")
      : messagePattern;
  const toast = page.getByRole("alert").filter({ hasText: pattern });
  await expect(toast).toBeVisible({ timeout: 5_000 });
}

/**
 * Assert that a confirmation modal is displayed with the expected
 * title and content, then interact with it (confirm or cancel).
 */
export async function handleConfirmationModal(
  page: Page,
  options: {
    expectedTitle?: string | RegExp;
    expectedContent?: string | RegExp;
    action: "confirm" | "cancel";
  }
): Promise<void> {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  if (options.expectedTitle) {
    const heading = dialog.getByRole("heading");
    await expect(heading).toHaveText(options.expectedTitle);
  }

  if (options.expectedContent) {
    await expect(dialog).toContainText(options.expectedContent);
  }

  if (options.action === "confirm") {
    await dialog.getByRole("button", { name: /confirm|delete|yes/i }).click();
  } else {
    await dialog.getByRole("button", { name: /cancel|no/i }).click();
  }
}

/**
 * Assert that a form field displays a validation error message.
 */
export async function expectFieldError(
  page: Page,
  fieldLabel: string,
  errorMessage: string | RegExp
): Promise<void> {
  const field = page.getByLabel(fieldLabel);
  // Zod + React Hook Form renders validation errors in an
  // element associated via aria-describedby.
  const errorId = await field.getAttribute("aria-describedby");
  if (errorId) {
    const errorElement = page.locator(`#${errorId}`);
    await expect(errorElement).toHaveText(errorMessage);
  }
}

/**
 * Assert that a table contains exactly the expected number of data rows.
 * Excludes the header row from the count.
 */
export async function expectTableRowCount(
  table: Locator,
  expectedCount: number
): Promise<void> {
  const rows = table.getByRole("row");
  // Subtract 1 for the header row.
  await expect(rows).toHaveCount(expectedCount + 1);
}

/**
 * Assert that a button is disabled and optionally has a tooltip
 * explaining why it is disabled.
 */
export async function expectButtonDisabledWithTooltip(
  page: Page,
  buttonName: string | RegExp,
  tooltipText?: string | RegExp
): Promise<void> {
  const button = page.getByRole("button", { name: buttonName });
  await expect(button).toBeDisabled();

  if (tooltipText) {
    await button.hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText(tooltipText);
  }
}
```

### Barrel File

```typescript
// apps/web/e2e/utils/index.ts
// Re-exports all shared E2E test utilities for convenient importing.
export {
  navigateToProject,
  navigateToEpic,
  navigateToStory,
  navigateToStoryFromDashboard,
} from "./navigation.helpers";

export {
  waitForPollingRefresh,
  waitForApiCondition,
  triggerQueryRefetch,
} from "./polling.helpers";

export {
  expectStatusBadge,
  expectSuccessToast,
  expectErrorToast,
  handleConfirmationModal,
  expectFieldError,
  expectTableRowCount,
  expectButtonDisabledWithTooltip,
} from "./assertion.helpers";
```

## Acceptance Criteria

- [ ] Navigation helpers abstract multi-step navigation flows (Dashboard → Project → Epic → Story)
- [ ] `waitForPollingRefresh()` waits for the next TanStack Query polling cycle (up to 20s timeout)
- [ ] `waitForApiCondition()` waits for a specific API response predicate to be satisfied
- [ ] `triggerQueryRefetch()` forces an immediate TanStack Query refetch via window focus event
- [ ] `expectStatusBadge()` asserts status badge text and optional variant
- [ ] `expectSuccessToast()` and `expectErrorToast()` assert toast notifications with pattern matching
- [ ] `handleConfirmationModal()` asserts modal content and clicks confirm or cancel
- [ ] `expectFieldError()` asserts Zod/React Hook Form validation errors via `aria-describedby`
- [ ] `expectTableRowCount()` asserts table data row count (excluding header)
- [ ] `expectButtonDisabledWithTooltip()` asserts disabled button state with optional tooltip text
- [ ] Barrel file (`index.ts`) re-exports all utilities
- [ ] All utilities use strict TypeScript typing with no `any` types
- [ ] All utilities use accessible selectors where possible

## Technical Notes

- TanStack Query's default polling interval is 15 seconds. The `waitForPollingRefresh` helper accounts for this by setting a 20-second timeout. For faster tests, consider using `triggerQueryRefetch` which dispatches a window focus event to trigger `refetchOnWindowFocus`.
- The `waitForApiCondition` helper is useful for tests that need to wait for a specific state transition (e.g., status change from "draft" to "ready") that may take multiple polling cycles.
- Confirmation modals in the app use shadcn/ui `AlertDialog`, which renders with `role="dialog"`. The assertion helpers match this ARIA role.
- Form validation errors are rendered by React Hook Form with Zod validation. The error element is associated via `aria-describedby` on the input field.
- Navigation helpers return POM instances so tests can chain further actions on the destination page.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — test utilities)
- **Project Setup Specification:** Section G.7 (Mocking & Fixtures — never use `any` type)
- **Project Setup Specification:** Section G.8 (Testing Utilities — custom wrappers)
- **Design Specification:** Toast notification patterns, confirmation modal flows, status badge variants

## Estimated Complexity

Medium — The individual utility functions are straightforward, but designing them to be composable, type-safe, and resilient to timing issues (polling, network delays) requires careful consideration of the TanStack Query polling model and Playwright's async testing patterns.
