// Page object for the main Dashboard page with summary widgets,
// recent activity, and project health overview.
import { type Page, type Locator, expect } from '@playwright/test';

import { BasePage } from './base.page';

export class DashboardPage extends BasePage {
  /** Locator for the dashboard heading. */
  readonly heading: Locator;

  /** Locator for the "Create your first project" CTA (empty state). */
  readonly createFirstProjectCta: Locator;

  /** Locator for the active projects count widget. */
  readonly activeProjectsWidget: Locator;

  /** Locator for the in-progress stories widget. */
  readonly inProgressStoriesWidget: Locator;

  /** Locator for the available workers widget. */
  readonly availableWorkersWidget: Locator;

  /** Locator for the recent activity feed section. */
  readonly activityFeed: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: /dashboard/i });
    this.createFirstProjectCta = page.getByRole('button', {
      name: /create your first project/i,
    });
    this.activeProjectsWidget = page.getByTestId('widget-active-projects');
    this.inProgressStoriesWidget = page.getByTestId('widget-in-progress-stories');
    this.availableWorkersWidget = page.getByTestId('widget-available-workers');
    this.activityFeed = page.getByTestId('recent-activity-feed');
  }

  async goto(): Promise<this> {
    await this.page.goto('/dashboard');
    await this.waitForPageLoad();
    return this;
  }

  /** Assert the dashboard is in its empty state (no projects yet). */
  async expectEmptyState(): Promise<void> {
    await expect(this.createFirstProjectCta).toBeVisible();
  }

  /** Click the "Create your first project" CTA to open the create modal. */
  async clickCreateFirstProject(): Promise<this> {
    await this.createFirstProjectCta.click();
    return this;
  }

  /** Assert the widget value for a specific metric. */
  async expectWidgetValue(
    widget: 'active-projects' | 'in-progress-stories' | 'available-workers',
    expectedValue: string,
  ): Promise<void> {
    const locator = this.page.getByTestId(`widget-${widget}`);
    await expect(locator.getByTestId('widget-value')).toHaveText(expectedValue);
  }
}
