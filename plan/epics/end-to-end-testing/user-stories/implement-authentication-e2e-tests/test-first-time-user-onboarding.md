# Test First-Time User Onboarding

## Task Details

- **Title:** Test First-Time User Onboarding
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Authentication E2E Tests](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** None (depends on User Story: Set Up Playwright Infrastructure)

## Description

Implement E2E tests for the first-time user onboarding experience. When a new user signs in for the first time and has no projects, the Dashboard should display an empty state with a "Create your first project" call-to-action button. Clicking this CTA should open the Create Project modal, guiding the user toward their first action.

### Test: First-Time User Onboarding Empty State

```typescript
// apps/web/e2e/auth/onboarding.spec.ts
// E2E tests for the first-time user onboarding flow.
// Verifies that new users see an empty state dashboard with a
// clear CTA to create their first project.
import { test, expect } from "../fixtures";
import { DashboardPage, ProjectListPage } from "../page-objects";

test.describe("First-Time User Onboarding", () => {
  test("new user sees empty state dashboard with create project CTA", async ({
    authenticatedPage: page,
  }) => {
    // The authenticated page starts with an empty data store (no projects).
    // Navigate to the dashboard to see the empty state.
    await page.goto("/dashboard");

    const dashboard = new DashboardPage(page);
    await expect(dashboard.heading).toBeVisible();

    // Verify the empty state is displayed.
    // The dashboard should show a prominent CTA when there are no projects.
    await dashboard.expectEmptyState();
    await expect(dashboard.createFirstProjectCta).toBeVisible();
    await expect(dashboard.createFirstProjectCta).toBeEnabled();

    // Verify the summary widgets show zero counts.
    await dashboard.expectWidgetValue("active-projects", "0");
  });

  test("clicking create first project CTA opens create project modal", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/dashboard");

    const dashboard = new DashboardPage(page);
    await dashboard.expectEmptyState();

    // Click the "Create your first project" CTA.
    await dashboard.clickCreateFirstProject();

    // Verify the Create Project modal opens.
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    // Verify the modal has the expected form fields.
    await expect(modal.getByLabel(/name/i)).toBeVisible();
    await expect(modal.getByLabel(/description/i)).toBeVisible();
    await expect(
      modal.getByRole("button", { name: /create/i })
    ).toBeVisible();
  });

  test("creating first project transitions dashboard from empty to populated state", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/dashboard");

    const dashboard = new DashboardPage(page);
    await dashboard.expectEmptyState();

    // Click the CTA and fill in the create project form.
    await dashboard.clickCreateFirstProject();
    const modal = page.getByRole("dialog");
    await modal.getByLabel(/name/i).fill("My First Project");
    await modal.getByLabel(/description/i).fill("Getting started with laila.works");
    await modal.getByRole("button", { name: /create/i }).click();

    // Verify the success toast appears.
    await dashboard.expectSuccessToast("Project created");

    // Verify the dashboard transitions from empty state to populated state.
    // The empty state CTA should no longer be visible.
    await expect(dashboard.createFirstProjectCta).not.toBeVisible();

    // Verify the active projects widget now shows 1.
    await dashboard.expectWidgetValue("active-projects", "1");
  });

  test("projects page also shows empty state for new users", async ({
    authenticatedPage: page,
  }) => {
    // Navigate to the projects list page (not the dashboard).
    await page.goto("/projects");

    const projectList = new ProjectListPage(page);
    await expect(projectList.heading).toBeVisible();

    // Verify the projects table is empty or shows an empty state message.
    const emptyMessage = page.getByText(/no projects/i);
    await expect(emptyMessage).toBeVisible();
  });
});
```

## Acceptance Criteria

- [ ] Test verifies new user sees Dashboard with empty state (no projects, zero widget counts)
- [ ] Test verifies "Create your first project" CTA button is visible and enabled on empty dashboard
- [ ] Test verifies clicking the CTA opens the Create Project modal with name and description fields
- [ ] Test verifies creating the first project shows a success toast and transitions the dashboard from empty to populated state
- [ ] Test verifies the active projects widget updates from "0" to "1" after first project creation
- [ ] Test verifies the CTA disappears after the first project is created
- [ ] Test verifies the Projects list page also shows an empty state for new users
- [ ] All tests pass in Chromium, Firefox, and WebKit browsers
- [ ] No `any` types used in test code

## Technical Notes

- The empty state is driven by the MSW data store being empty at test start. No seeding is needed -- the `resetTestData()` call in the fixture ensures a clean slate.
- The "Create your first project" CTA may be implemented as a shadcn/ui Button or a custom empty state component. The POM uses `getByRole("button")` for accessibility.
- After creating the first project, the dashboard should transition in real-time (TanStack Query invalidation on mutation) without needing a manual refresh.
- The Projects list page empty state is tested separately to verify consistency between the dashboard and the dedicated projects page.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — critical user journeys)
- **Functional Requirements:** FR-DASH-001 (dashboard empty state), FR-PROJ-001 (project creation)
- **Design Specification:** Dashboard empty state wireframe, Create Project modal layout

## Estimated Complexity

Small — The empty state and CTA interaction are straightforward. The main complexity is verifying the transition from empty to populated state happens in real-time after project creation.
