// apps/web/e2e/auth/onboarding.spec.ts
// E2E tests for the first-time user onboarding flow.
// Verifies that new users see an empty state dashboard with a
// clear CTA to create their first project.
import { test, expect } from '../fixtures';
import { DashboardPage, ProjectListPage } from '../page-objects';

test.describe('First-Time User Onboarding', () => {
  test('new user sees empty state dashboard with create project CTA', async ({
    authenticatedPage: page,
  }) => {
    // The authenticated page starts with an empty data store (no projects).
    // Navigate to the dashboard to see the empty state.
    await page.goto('/dashboard');

    const dashboard = new DashboardPage(page);
    await expect(dashboard.heading).toBeVisible();

    // Verify the empty state is displayed.
    // The dashboard should show a prominent CTA when there are no projects.
    await dashboard.expectEmptyState();
    await expect(dashboard.createFirstProjectCta).toBeVisible();
    await expect(dashboard.createFirstProjectCta).toBeEnabled();

    // Verify the summary widgets show zero counts.
    await dashboard.expectWidgetValue('active-projects', '0');
  });

  test('clicking create first project CTA opens create project modal', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');

    const dashboard = new DashboardPage(page);
    await dashboard.expectEmptyState();

    // Click the "Create your first project" CTA.
    await dashboard.clickCreateFirstProject();

    // Verify the Create Project modal opens.
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // Verify the modal has the expected form fields.
    await expect(modal.getByLabel(/name/i)).toBeVisible();
    await expect(modal.getByLabel(/description/i)).toBeVisible();
    await expect(modal.getByRole('button', { name: /create/i })).toBeVisible();
  });

  test('creating first project transitions dashboard from empty to populated state', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');

    const dashboard = new DashboardPage(page);
    await dashboard.expectEmptyState();

    // Click the CTA and fill in the create project form.
    await dashboard.clickCreateFirstProject();
    const modal = page.getByRole('dialog');
    await modal.getByLabel(/name/i).fill('My First Project');
    await modal.getByLabel(/description/i).fill('Getting started with laila.works');
    await modal.getByRole('button', { name: /create/i }).click();

    // Verify the success toast appears.
    await dashboard.expectSuccessToast('Project created');

    // Verify the dashboard transitions from empty state to populated state.
    // The empty state CTA should no longer be visible.
    await expect(dashboard.createFirstProjectCta).not.toBeVisible();

    // Verify the active projects widget now shows 1.
    await dashboard.expectWidgetValue('active-projects', '1');
  });

  test('projects page also shows empty state for new users', async ({
    authenticatedPage: page,
  }) => {
    // Navigate to the projects list page (not the dashboard).
    await page.goto('/projects');

    const projectList = new ProjectListPage(page);
    await expect(projectList.heading).toBeVisible();

    // Verify the projects table is empty or shows an empty state message.
    const emptyMessage = page.getByText(/no projects/i);
    await expect(emptyMessage).toBeVisible();
  });
});
