# Test Responsive Layout Mobile

## Task Details

- **Title:** Test Responsive Layout Mobile
- **Status:** Not Started
- **Assigned Agent:** accessibility-tester
- **Parent User Story:** [Implement DAG Graph & Responsive Layout E2E Tests](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** None (depends on User Story: Set Up Playwright Infrastructure)

## Description

Implement E2E tests for the mobile responsive layout at 375px viewport width. Verify the sidebar is replaced by a bottom tab bar navigation, the page uses a 4-column grid layout, project cards render in a single column, modals are full-width, and the DAG graph encourages fullscreen interaction.

### Test: Mobile Responsive Layout (375px)

```typescript
// apps/web/e2e/graph-and-responsive/responsive-mobile.spec.ts
// E2E tests for the mobile layout at 375px viewport.
// Verifies bottom tab bar, single-column cards, full-width modals,
// and fullscreen graph encouragement.
import { test, expect } from "../fixtures";
import { DashboardPage, ProjectListPage, GraphPage } from "../page-objects";

// Configure this test file to use a mobile viewport.
test.use({
  viewport: { width: 375, height: 812 }, // iPhone X dimensions
});

test.describe("Responsive Layout — Mobile (375px)", () => {
  test("bottom tab bar navigation replaces sidebar", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/dashboard");

    // Verify the sidebar is NOT visible at mobile width.
    const sidebar = page.getByRole("navigation", { name: /main/i });
    await expect(sidebar).not.toBeVisible();

    // Verify the bottom tab bar is visible.
    const bottomNav = page.getByTestId("bottom-tab-bar");
    await expect(bottomNav).toBeVisible();

    // Verify the bottom tab bar is at the bottom of the viewport.
    const navBox = await bottomNav.boundingBox();
    expect(navBox).toBeTruthy();
    // The bottom nav should be near the bottom of the 812px viewport.
    expect(navBox!.y + navBox!.height).toBeGreaterThan(750);

    // Verify the tab bar contains navigation items.
    const dashboardTab = bottomNav.getByRole("link", { name: /dashboard/i });
    const projectsTab = bottomNav.getByRole("link", { name: /projects/i });
    const workersTab = bottomNav.getByRole("link", { name: /workers/i });

    await expect(dashboardTab).toBeVisible();
    await expect(projectsTab).toBeVisible();
    await expect(workersTab).toBeVisible();
  });

  test("tab bar navigation works correctly", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/dashboard");

    const bottomNav = page.getByTestId("bottom-tab-bar");

    // Navigate using the bottom tab bar.
    await bottomNav.getByRole("link", { name: /projects/i }).click();
    await expect(page).toHaveURL(/\/projects/);

    await bottomNav.getByRole("link", { name: /workers/i }).click();
    await expect(page).toHaveURL(/\/workers/);

    await bottomNav.getByRole("link", { name: /dashboard/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("project cards render in single column", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    seedData({});

    const projectList = new ProjectListPage(page);
    await projectList.goto();

    const cardGrid = page.getByTestId("project-card-grid");
    await expect(cardGrid).toBeVisible();

    // Verify the grid has 1 column at mobile width.
    const gridColumns = await cardGrid.evaluate(
      (el) => window.getComputedStyle(el).gridTemplateColumns
    );
    const columnCount = gridColumns.split(" ").length;
    expect(columnCount).toBe(1);

    // Verify cards are full-width (spanning the viewport minus padding).
    const firstCard = cardGrid.locator("> *").first();
    const cardBox = await firstCard.boundingBox();
    expect(cardBox).toBeTruthy();
    // Card width should be close to viewport width (375px minus padding).
    expect(cardBox!.width).toBeGreaterThan(300);
  });

  test("modals render full-width on mobile", async ({
    authenticatedPage: page,
  }) => {
    const projectList = new ProjectListPage(page);
    await projectList.goto();

    // Open the create project modal.
    await projectList.createProjectButton.click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    // Verify the modal is full-width (or nearly full-width).
    const modalBox = await modal.boundingBox();
    expect(modalBox).toBeTruthy();
    // Modal width should be at least 90% of the 375px viewport.
    expect(modalBox!.width).toBeGreaterThan(337); // 375 * 0.9 = 337.5

    // Verify the modal is within the viewport (not clipped horizontally).
    expect(modalBox!.x).toBeGreaterThanOrEqual(0);
    expect(modalBox!.x + modalBox!.width).toBeLessThanOrEqual(375 + 1); // +1 for rounding
  });

  test("4-column grid layout on dashboard", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    seedData({});

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    const mainContent = page.getByRole("main");
    const gridColumns = await mainContent.evaluate(
      (el) => window.getComputedStyle(el).gridTemplateColumns
    );

    const columnCount = gridColumns.split(" ").length;
    // At mobile width, the grid should have 4 columns
    // (or a responsive equivalent like 2 or 1 for very narrow screens).
    expect(columnCount).toBeLessThanOrEqual(4);
  });

  test("DAG graph suggests fullscreen mode on mobile", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    seedData({});

    const graph = new GraphPage(page);
    await graph.goto("seeded-project-id");

    // On mobile, the graph should show a fullscreen prompt or button.
    const fullscreenPrompt = page.getByTestId("graph-fullscreen-prompt");
    const fullscreenButton = page.getByRole("button", {
      name: /fullscreen|expand/i,
    });

    // At least one of these should be visible.
    const promptVisible = await fullscreenPrompt.isVisible().catch(() => false);
    const buttonVisible = await fullscreenButton.isVisible().catch(() => false);
    expect(promptVisible || buttonVisible).toBe(true);
  });

  test("graph renders correctly in mobile viewport", async ({
    authenticatedPage: page,
    seedData,
  }) => {
    seedData({});

    const graph = new GraphPage(page);
    await graph.goto("seeded-project-id");

    // Verify the graph canvas is visible even on mobile.
    await expect(graph.canvas).toBeVisible();

    // Verify basic controls are accessible.
    // On mobile, some controls may be hidden behind a menu.
    const hasZoomIn = await graph.zoomInButton.isVisible().catch(() => false);
    const hasFitView = await graph.fitViewButton.isVisible().catch(() => false);

    // At minimum, fit-to-view should be accessible.
    expect(hasZoomIn || hasFitView).toBe(true);
  });

  test("touch-friendly interaction targets", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/dashboard");

    // Verify interactive elements have adequate touch target sizes.
    // WCAG 2.5.5 recommends 44x44 CSS pixels minimum.
    const bottomNav = page.getByTestId("bottom-tab-bar");
    const navLinks = bottomNav.getByRole("link");

    const linkCount = await navLinks.count();
    for (let i = 0; i < linkCount; i++) {
      const link = navLinks.nth(i);
      const box = await link.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  });
});
```

## Acceptance Criteria

- [ ] Test verifies the sidebar is NOT visible at 375px viewport width
- [ ] Test verifies a bottom tab bar navigation is displayed at the bottom of the viewport
- [ ] Test verifies the bottom tab bar contains links for Dashboard, Projects, and Workers
- [ ] Test verifies tab bar navigation correctly navigates between pages
- [ ] Test verifies project cards render in a single-column grid at 375px
- [ ] Test verifies project cards are full-width (spanning the viewport minus padding)
- [ ] Test verifies modals render full-width (at least 90% of 375px viewport) on mobile
- [ ] Test verifies the dashboard grid adapts to 4 or fewer columns at mobile width
- [ ] Test verifies the DAG graph suggests fullscreen mode or shows an expand button on mobile
- [ ] Test verifies the graph canvas is still visible and interactive on mobile
- [ ] Test verifies touch targets on the bottom tab bar meet WCAG 2.5.5 minimum (44x44px)
- [ ] All tests use the 375px x 812px viewport configuration (iPhone X)
- [ ] All tests pass in Chromium, Firefox, and WebKit browsers
- [ ] No `any` types used in test code

## Technical Notes

- Playwright's viewport configuration emulates the device screen size. The 375x812 dimensions match iPhone X/11/12/13 Mini.
- The bottom tab bar (`data-testid="bottom-tab-bar"`) replaces the sidebar on mobile. It uses fixed positioning at the bottom of the viewport.
- Full-width modals on mobile use CSS `max-width: 100vw` or Tailwind's responsive width classes. The test verifies the modal width is at least 90% of the viewport.
- The DAG graph on mobile may show a simplified view with fewer controls. The fullscreen prompt encourages users to enter fullscreen mode for better graph interaction.
- Touch target size verification follows WCAG 2.5.5 guidelines (44x44 CSS pixels minimum). This is especially important for the bottom tab bar links.
- The bottom tab bar position is verified using `boundingBox()` to ensure it is at the bottom of the viewport (y + height > 750 for an 812px viewport).

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — responsive layout verification: mobile)
- **Design Specification:** Mobile layout wireframes, bottom tab bar navigation, mobile modal patterns
- **Functional Requirements:** FR-UI-001 (responsive layout), FR-UI-004 (mobile breakpoint behavior)
- **WCAG 2.5.5:** Target Size (Enhanced) — minimum 44x44 CSS pixels for touch targets

## Estimated Complexity

Medium — Mobile layout testing involves verifying the complete navigation paradigm shift (sidebar to bottom tab bar), full-width modals, single-column grids, graph fullscreen encouragement, and touch target sizes. The variety of assertions across different page types adds breadth.
