# Create Page Object Models

## Task Details

- **Title:** Create Page Object Models
- **Status:** Not Started
- **Assigned Agent:** test-automator
- **Parent User Story:** [Set Up Playwright Infrastructure](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** Configure Playwright Multi-Browser

## Description

Create Page Object Model (POM) classes for all major pages in the application. Each POM encapsulates element selectors, user actions, and assertions for a specific page, providing a maintainable abstraction layer between tests and the UI. When the UI changes, only the POM needs updating -- tests remain unchanged.

All POMs must use strict TypeScript typing (no `any`), rely on accessible selectors (`getByRole`, `getByLabel`, `getByText`) where possible, and expose chainable action methods that return the POM instance for fluent test authoring.

### Base Page Object

Create a base class with shared navigation and assertion behavior.

```typescript
// apps/web/e2e/page-objects/base.page.ts
// Base page object providing common navigation, waiting, and assertion
// methods. All page-specific POMs extend this class.
import { type Page, type Locator, expect } from "@playwright/test";

export abstract class BasePage {
  /** The Playwright Page instance this POM wraps. */
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Navigate to this page's canonical URL. Subclasses set the path. */
  abstract goto(): Promise<void>;

  /** Wait for the page to be fully loaded (network idle + main content visible). */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState("networkidle");
  }

  /** Assert that a success toast notification appears with the given message. */
  async expectSuccessToast(message: string): Promise<void> {
    const toast = this.page.getByRole("status").filter({ hasText: message });
    await expect(toast).toBeVisible({ timeout: 5_000 });
  }

  /** Assert that an error toast notification appears with the given message. */
  async expectErrorToast(message: string): Promise<void> {
    const toast = this.page.getByRole("alert").filter({ hasText: message });
    await expect(toast).toBeVisible({ timeout: 5_000 });
  }

  /** Assert the page URL matches the expected path pattern. */
  async expectUrl(pathPattern: string | RegExp): Promise<void> {
    if (typeof pathPattern === "string") {
      await expect(this.page).toHaveURL(new RegExp(pathPattern));
    } else {
      await expect(this.page).toHaveURL(pathPattern);
    }
  }

  /** Click a navigation link in the sidebar and wait for navigation. */
  async navigateTo(linkName: string): Promise<void> {
    await this.page.getByRole("navigation").getByRole("link", { name: linkName }).click();
    await this.waitForPageLoad();
  }

  /** Wait for TanStack Query polling to refresh data (up to 15s cycle). */
  async waitForPollingRefresh(): Promise<void> {
    // TanStack Query polls every 15 seconds. Wait for the next
    // network request matching the API pattern to complete.
    await this.page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/") && response.status() === 200,
      { timeout: 20_000 }
    );
  }
}
```

### SignInPage

```typescript
// apps/web/e2e/page-objects/sign-in.page.ts
// Page object for the sign-in page with Google OAuth button interaction.
import { type Page, expect } from "@playwright/test";
import { BasePage } from "./base.page";

export class SignInPage extends BasePage {
  /** Locator for the "Sign in with Google" OAuth button. */
  readonly googleSignInButton: Locator;

  /** Locator for the sign-in page heading. */
  readonly heading: Locator;

  /** Locator for an OAuth error message (displayed when OAuth fails). */
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.googleSignInButton = page.getByRole("button", {
      name: /sign in with google/i,
    });
    this.heading = page.getByRole("heading", { name: /sign in/i });
    this.errorMessage = page.getByRole("alert");
  }

  async goto(): Promise<void> {
    await this.page.goto("/sign-in");
    await this.waitForPageLoad();
  }

  /** Click the Google OAuth sign-in button and wait for redirect. */
  async signInWithGoogle(): Promise<void> {
    await this.googleSignInButton.click();
    // After mocked OAuth, expect redirect to dashboard.
    await this.page.waitForURL("/dashboard", { timeout: 10_000 });
  }

  /** Assert that the sign-in page is displayed correctly. */
  async expectSignInPageVisible(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.googleSignInButton).toBeVisible();
    await expect(this.googleSignInButton).toBeEnabled();
  }

  /** Assert that an OAuth error message is displayed. */
  async expectOAuthError(message?: string): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
    if (message) {
      await expect(this.errorMessage).toHaveText(message);
    }
  }
}
```

### DashboardPage

```typescript
// apps/web/e2e/page-objects/dashboard.page.ts
// Page object for the main Dashboard page with summary widgets,
// recent activity, and project health overview.
import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base.page";

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
    this.heading = page.getByRole("heading", { name: /dashboard/i });
    this.createFirstProjectCta = page.getByRole("button", {
      name: /create your first project/i,
    });
    this.activeProjectsWidget = page.getByTestId("widget-active-projects");
    this.inProgressStoriesWidget = page.getByTestId("widget-in-progress-stories");
    this.availableWorkersWidget = page.getByTestId("widget-available-workers");
    this.activityFeed = page.getByTestId("recent-activity-feed");
  }

  async goto(): Promise<void> {
    await this.page.goto("/dashboard");
    await this.waitForPageLoad();
  }

  /** Assert the dashboard is in its empty state (no projects yet). */
  async expectEmptyState(): Promise<void> {
    await expect(this.createFirstProjectCta).toBeVisible();
  }

  /** Click the "Create your first project" CTA to open the create modal. */
  async clickCreateFirstProject(): Promise<void> {
    await this.createFirstProjectCta.click();
  }

  /** Assert the widget value for a specific metric. */
  async expectWidgetValue(
    widget: "active-projects" | "in-progress-stories" | "available-workers",
    expectedValue: string
  ): Promise<void> {
    const locator = this.page.getByTestId(`widget-${widget}`);
    await expect(locator.getByTestId("widget-value")).toHaveText(expectedValue);
  }
}
```

### ProjectListPage

```typescript
// apps/web/e2e/page-objects/project-list.page.ts
// Page object for the Projects list page with table, filters, and
// create project modal trigger.
import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base.page";

export class ProjectListPage extends BasePage {
  readonly heading: Locator;
  readonly createProjectButton: Locator;
  readonly projectsTable: Locator;
  readonly searchInput: Locator;
  readonly statusFilter: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole("heading", { name: /projects/i });
    this.createProjectButton = page.getByRole("button", {
      name: /create project/i,
    });
    this.projectsTable = page.getByRole("table");
    this.searchInput = page.getByPlaceholder(/search projects/i);
    this.statusFilter = page.getByTestId("status-filter");
  }

  async goto(): Promise<void> {
    await this.page.goto("/projects");
    await this.waitForPageLoad();
  }

  /** Click "Create Project" and fill the modal form. */
  async createProject(name: string, description: string): Promise<void> {
    await this.createProjectButton.click();
    const modal = this.page.getByRole("dialog");
    await modal.getByLabel(/name/i).fill(name);
    await modal.getByLabel(/description/i).fill(description);
    await modal.getByRole("button", { name: /create/i }).click();
    await this.expectSuccessToast("Project created");
  }

  /** Assert a project row exists in the table by name. */
  async expectProjectInList(name: string): Promise<void> {
    const row = this.projectsTable.getByRole("row", { name });
    await expect(row).toBeVisible();
  }

  /** Click a project row to navigate to its detail page. */
  async openProject(name: string): Promise<void> {
    await this.projectsTable.getByRole("link", { name }).click();
    await this.waitForPageLoad();
  }
}
```

### ProjectDetailPage

```typescript
// apps/web/e2e/page-objects/project-detail.page.ts
// Page object for the Project Detail page with tabs (Overview, Epics,
// Graph, Activity) and publish/delete actions.
import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base.page";

export class ProjectDetailPage extends BasePage {
  readonly heading: Locator;
  readonly statusBadge: Locator;
  readonly publishButton: Locator;
  readonly deleteButton: Locator;
  readonly createEpicButton: Locator;
  readonly epicsTab: Locator;
  readonly graphTab: Locator;
  readonly activityTab: Locator;
  readonly overviewTab: Locator;
  readonly epicsTable: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByTestId("entity-heading");
    this.statusBadge = page.getByTestId("status-badge");
    this.publishButton = page.getByRole("button", { name: /publish/i });
    this.deleteButton = page.getByRole("button", { name: /delete/i });
    this.createEpicButton = page.getByRole("button", { name: /create epic/i });
    this.epicsTab = page.getByRole("tab", { name: /epics/i });
    this.graphTab = page.getByRole("tab", { name: /graph/i });
    this.activityTab = page.getByRole("tab", { name: /activity/i });
    this.overviewTab = page.getByRole("tab", { name: /overview/i });
    this.epicsTable = page.getByTestId("epics-table");
  }

  async goto(projectId?: string): Promise<void> {
    if (projectId) {
      await this.page.goto(`/projects/${projectId}`);
    }
    await this.waitForPageLoad();
  }

  /** Create an epic within this project. */
  async createEpic(title: string, description: string): Promise<void> {
    await this.epicsTab.click();
    await this.createEpicButton.click();
    const modal = this.page.getByRole("dialog");
    await modal.getByLabel(/title/i).fill(title);
    await modal.getByLabel(/description/i).fill(description);
    await modal.getByRole("button", { name: /create/i }).click();
    await this.expectSuccessToast("Epic created");
  }

  /** Assert the project status badge shows the expected status. */
  async expectStatus(status: string): Promise<void> {
    await expect(this.statusBadge).toHaveText(status);
  }

  /** Publish the project and confirm the action. */
  async publish(): Promise<void> {
    await this.publishButton.click();
    const dialog = this.page.getByRole("dialog");
    await dialog.getByRole("button", { name: /confirm/i }).click();
    await this.expectSuccessToast("published");
  }

  /** Delete the project via confirmation modal. */
  async deleteProject(): Promise<void> {
    await this.deleteButton.click();
    const dialog = this.page.getByRole("dialog");
    await dialog.getByRole("button", { name: /confirm/i }).click();
  }

  /** Open an epic by clicking its row in the epics table. */
  async openEpic(title: string): Promise<void> {
    await this.epicsTab.click();
    await this.epicsTable.getByRole("link", { name: title }).click();
    await this.waitForPageLoad();
  }
}
```

### EpicDetailPage

```typescript
// apps/web/e2e/page-objects/epic-detail.page.ts
// Page object for the Epic Detail page with story management and publish.
import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base.page";

export class EpicDetailPage extends BasePage {
  readonly heading: Locator;
  readonly statusBadge: Locator;
  readonly publishButton: Locator;
  readonly deleteButton: Locator;
  readonly createStoryButton: Locator;
  readonly storiesTab: Locator;
  readonly storiesTable: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByTestId("entity-heading");
    this.statusBadge = page.getByTestId("status-badge");
    this.publishButton = page.getByRole("button", { name: /publish/i });
    this.deleteButton = page.getByRole("button", { name: /delete/i });
    this.createStoryButton = page.getByRole("button", { name: /create (user )?story/i });
    this.storiesTab = page.getByRole("tab", { name: /stories/i });
    this.storiesTable = page.getByTestId("stories-table");
  }

  async goto(epicId?: string): Promise<void> {
    if (epicId) {
      await this.page.goto(`/epics/${epicId}`);
    }
    await this.waitForPageLoad();
  }

  /** Create a user story within this epic. */
  async createStory(title: string, description: string): Promise<void> {
    await this.storiesTab.click();
    await this.createStoryButton.click();
    const modal = this.page.getByRole("dialog");
    await modal.getByLabel(/title/i).fill(title);
    await modal.getByLabel(/description/i).fill(description);
    await modal.getByRole("button", { name: /create/i }).click();
    await this.expectSuccessToast("Story created");
  }

  async expectStatus(status: string): Promise<void> {
    await expect(this.statusBadge).toHaveText(status);
  }

  async publish(): Promise<void> {
    await this.publishButton.click();
    const dialog = this.page.getByRole("dialog");
    await dialog.getByRole("button", { name: /confirm/i }).click();
    await this.expectSuccessToast("published");
  }

  async openStory(title: string): Promise<void> {
    await this.storiesTab.click();
    await this.storiesTable.getByRole("link", { name: title }).click();
    await this.waitForPageLoad();
  }
}
```

### StoryDetailPage

```typescript
// apps/web/e2e/page-objects/story-detail.page.ts
// Page object for the Story Detail page with task management,
// assignment controls, failure recovery, and attempt history.
import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base.page";

export class StoryDetailPage extends BasePage {
  readonly heading: Locator;
  readonly statusBadge: Locator;
  readonly publishButton: Locator;
  readonly deleteButton: Locator;
  readonly createTaskButton: Locator;
  readonly tasksTab: Locator;
  readonly tasksTable: Locator;
  readonly attemptHistoryTab: Locator;
  readonly assignedWorkerBadge: Locator;
  readonly unassignWorkerButton: Locator;
  readonly resetButton: Locator;
  readonly failedErrorMessage: Locator;
  readonly readOnlyBanner: Locator;
  readonly timeoutBanner: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByTestId("entity-heading");
    this.statusBadge = page.getByTestId("status-badge");
    this.publishButton = page.getByRole("button", { name: /publish/i });
    this.deleteButton = page.getByRole("button", { name: /delete/i });
    this.createTaskButton = page.getByRole("button", { name: /create task/i });
    this.tasksTab = page.getByRole("tab", { name: /tasks/i });
    this.tasksTable = page.getByTestId("tasks-table");
    this.attemptHistoryTab = page.getByRole("tab", { name: /attempt history/i });
    this.assignedWorkerBadge = page.getByTestId("assigned-worker");
    this.unassignWorkerButton = page.getByRole("button", { name: /unassign worker/i });
    this.resetButton = page.getByRole("button", { name: /reset/i });
    this.failedErrorMessage = page.getByTestId("failed-error-message");
    this.readOnlyBanner = page.getByTestId("read-only-banner");
    this.timeoutBanner = page.getByTestId("timeout-reclamation-banner");
  }

  async goto(storyId?: string): Promise<void> {
    if (storyId) {
      await this.page.goto(`/stories/${storyId}`);
    }
    await this.waitForPageLoad();
  }

  /** Create a task within this story. */
  async createTask(
    title: string,
    description: string,
    personaName: string
  ): Promise<void> {
    await this.tasksTab.click();
    await this.createTaskButton.click();
    const modal = this.page.getByRole("dialog");
    await modal.getByLabel(/title/i).fill(title);
    await modal.getByLabel(/description/i).fill(description);
    // Select persona from dropdown.
    await modal.getByLabel(/persona/i).click();
    await modal.getByRole("option", { name: personaName }).click();
    await modal.getByRole("button", { name: /create/i }).click();
    await this.expectSuccessToast("Task created");
  }

  async expectStatus(status: string): Promise<void> {
    await expect(this.statusBadge).toHaveText(status);
  }

  async publish(): Promise<void> {
    await this.publishButton.click();
    const dialog = this.page.getByRole("dialog");
    await dialog.getByRole("button", { name: /confirm/i }).click();
    await this.expectSuccessToast("published");
  }

  /** Click the "Unassign Worker" button and confirm the dialog. */
  async unassignWorker(): Promise<void> {
    await this.unassignWorkerButton.click();
    const dialog = this.page.getByRole("dialog");
    await dialog.getByRole("button", { name: /confirm/i }).click();
    await this.expectSuccessToast("unassigned");
  }

  /** Click the "Reset" button to reset a failed story. */
  async resetStory(): Promise<void> {
    await this.resetButton.click();
    await this.expectSuccessToast("reset");
  }

  /** Assert the assigned worker name is displayed. */
  async expectAssignedWorker(workerName: string): Promise<void> {
    await expect(this.assignedWorkerBadge).toContainText(workerName);
  }

  /** Assert the read-only banner is visible. */
  async expectReadOnly(): Promise<void> {
    await expect(this.readOnlyBanner).toBeVisible();
  }

  /** Assert the failed error message is displayed. */
  async expectFailedWithError(errorMessage: string): Promise<void> {
    await expect(this.statusBadge).toHaveText(/failed/i);
    await expect(this.failedErrorMessage).toContainText(errorMessage);
  }

  /** Open the Attempt History tab and return attempt rows. */
  async getAttemptHistoryRows(): Promise<Locator> {
    await this.attemptHistoryTab.click();
    return this.page.getByTestId("attempt-history-row");
  }

  async openTask(title: string): Promise<void> {
    await this.tasksTab.click();
    await this.tasksTable.getByRole("link", { name: title }).click();
    await this.waitForPageLoad();
  }
}
```

### TaskDetailPage

```typescript
// apps/web/e2e/page-objects/task-detail.page.ts
// Page object for the Task Detail page with dependency management,
// status display, and edit controls.
import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base.page";

export class TaskDetailPage extends BasePage {
  readonly heading: Locator;
  readonly statusBadge: Locator;
  readonly editButton: Locator;
  readonly deleteButton: Locator;
  readonly personaBadge: Locator;
  readonly addDependencyButton: Locator;
  readonly dependenciesSection: Locator;
  readonly lockIcon: Locator;
  readonly cycleErrorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByTestId("entity-heading");
    this.statusBadge = page.getByTestId("status-badge");
    this.editButton = page.getByRole("button", { name: /edit/i });
    this.deleteButton = page.getByRole("button", { name: /delete/i });
    this.personaBadge = page.getByTestId("persona-badge");
    this.addDependencyButton = page.getByRole("button", { name: /add dependency/i });
    this.dependenciesSection = page.getByTestId("dependencies-section");
    this.lockIcon = page.getByTestId("lock-icon");
    this.cycleErrorMessage = page.getByTestId("cycle-error");
  }

  async goto(taskId?: string): Promise<void> {
    if (taskId) {
      await this.page.goto(`/tasks/${taskId}`);
    }
    await this.waitForPageLoad();
  }

  /** Add a dependency on another task by selecting it from the dropdown. */
  async addDependency(taskTitle: string): Promise<void> {
    await this.addDependencyButton.click();
    const dropdown = this.page.getByRole("listbox");
    await dropdown.getByRole("option", { name: taskTitle }).click();
  }

  /** Assert a dependency exists in the dependencies section. */
  async expectDependency(taskTitle: string): Promise<void> {
    const dep = this.dependenciesSection.getByText(taskTitle);
    await expect(dep).toBeVisible();
  }

  /** Assert that a cycle detection error is displayed. */
  async expectCycleError(): Promise<void> {
    await expect(this.cycleErrorMessage).toBeVisible();
  }

  async expectStatus(status: string): Promise<void> {
    await expect(this.statusBadge).toHaveText(status);
  }

  /** Assert the task is in read-only mode (lock icon visible). */
  async expectReadOnly(): Promise<void> {
    await expect(this.lockIcon).toBeVisible();
    await expect(this.editButton).toBeDisabled();
    await expect(this.deleteButton).toBeDisabled();
  }
}
```

### WorkerListPage and WorkerDetailPage

```typescript
// apps/web/e2e/page-objects/worker-list.page.ts
// Page object for the Workers list page.
import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base.page";

export class WorkerListPage extends BasePage {
  readonly heading: Locator;
  readonly createWorkerButton: Locator;
  readonly workersTable: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole("heading", { name: /workers/i });
    this.createWorkerButton = page.getByRole("button", {
      name: /create worker/i,
    });
    this.workersTable = page.getByRole("table");
  }

  async goto(): Promise<void> {
    await this.page.goto("/workers");
    await this.waitForPageLoad();
  }

  /** Create a worker and capture the displayed API key. */
  async createWorker(name: string): Promise<string> {
    await this.createWorkerButton.click();
    const modal = this.page.getByRole("dialog");
    await modal.getByLabel(/name/i).fill(name);
    await modal.getByRole("button", { name: /create/i }).click();

    // After creation, the API key is displayed in a monospace field.
    // Capture it before the user closes the modal.
    const apiKeyField = modal.getByTestId("api-key-display");
    const apiKey = await apiKeyField.textContent();
    if (!apiKey) throw new Error("API key was not displayed after worker creation");

    return apiKey;
  }

  /** Close the API key reveal modal after capturing the key. */
  async closeApiKeyModal(): Promise<void> {
    const modal = this.page.getByRole("dialog");
    await modal.getByRole("button", { name: /done/i }).click();
    await expect(modal).not.toBeVisible();
  }

  async openWorker(name: string): Promise<void> {
    await this.workersTable.getByRole("link", { name }).click();
    await this.waitForPageLoad();
  }
}
```

```typescript
// apps/web/e2e/page-objects/worker-detail.page.ts
// Page object for the Worker Detail page with project access management.
import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base.page";

export class WorkerDetailPage extends BasePage {
  readonly heading: Locator;
  readonly addProjectAccessButton: Locator;
  readonly projectAccessTable: Locator;
  readonly deleteButton: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByTestId("entity-heading");
    this.addProjectAccessButton = page.getByRole("button", {
      name: /add project access/i,
    });
    this.projectAccessTable = page.getByTestId("project-access-table");
    this.deleteButton = page.getByRole("button", { name: /delete/i });
  }

  async goto(workerId?: string): Promise<void> {
    if (workerId) {
      await this.page.goto(`/workers/${workerId}`);
    }
    await this.waitForPageLoad();
  }

  /** Add project access for this worker. */
  async addProjectAccess(projectName: string): Promise<void> {
    await this.addProjectAccessButton.click();
    const dropdown = this.page.getByRole("listbox");
    await dropdown.getByRole("option", { name: projectName }).click();
    await this.expectSuccessToast("access granted");
  }

  /** Remove project access from this worker. */
  async removeProjectAccess(projectName: string): Promise<void> {
    const row = this.projectAccessTable.getByRole("row", {
      name: new RegExp(projectName),
    });
    await row.getByRole("button", { name: /remove/i }).click();
    const dialog = this.page.getByRole("dialog");
    await dialog.getByRole("button", { name: /confirm/i }).click();
    await this.expectSuccessToast("access removed");
  }

  /** Assert a project appears in the access table. */
  async expectProjectAccess(projectName: string): Promise<void> {
    const row = this.projectAccessTable.getByRole("row", {
      name: new RegExp(projectName),
    });
    await expect(row).toBeVisible();
  }

  /** Assert a project does not appear in the access table. */
  async expectNoProjectAccess(projectName: string): Promise<void> {
    const row = this.projectAccessTable.getByRole("row", {
      name: new RegExp(projectName),
    });
    await expect(row).not.toBeVisible();
  }
}
```

### PersonaListPage

```typescript
// apps/web/e2e/page-objects/persona-list.page.ts
// Page object for the Personas list page with CRUD and deletion guard.
import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base.page";

export class PersonaListPage extends BasePage {
  readonly heading: Locator;
  readonly createPersonaButton: Locator;
  readonly personasTable: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole("heading", { name: /personas/i });
    this.createPersonaButton = page.getByRole("button", {
      name: /create persona/i,
    });
    this.personasTable = page.getByRole("table");
  }

  async goto(): Promise<void> {
    await this.page.goto("/personas");
    await this.waitForPageLoad();
  }

  /** Create a new persona with title and description. */
  async createPersona(title: string, description: string): Promise<void> {
    await this.createPersonaButton.click();
    const modal = this.page.getByRole("dialog");
    await modal.getByLabel(/title/i).fill(title);
    await modal.getByLabel(/description/i).fill(description);
    await modal.getByRole("button", { name: /create/i }).click();
    await this.expectSuccessToast("Persona created");
  }

  /** Edit an existing persona's title and description. */
  async editPersona(
    currentTitle: string,
    newTitle: string,
    newDescription: string
  ): Promise<void> {
    const row = this.personasTable.getByRole("row", { name: currentTitle });
    await row.getByRole("button", { name: /edit/i }).click();
    const modal = this.page.getByRole("dialog");
    await modal.getByLabel(/title/i).clear();
    await modal.getByLabel(/title/i).fill(newTitle);
    await modal.getByLabel(/description/i).clear();
    await modal.getByLabel(/description/i).fill(newDescription);
    await modal.getByRole("button", { name: /save/i }).click();
    await this.expectSuccessToast("Persona updated");
  }

  /** Attempt to delete a persona. Returns true if deletion succeeded. */
  async deletePersona(title: string): Promise<boolean> {
    const row = this.personasTable.getByRole("row", { name: title });
    await row.getByRole("button", { name: /delete/i }).click();

    // Check if a confirmation dialog or a blocked tooltip appears.
    const dialog = this.page.getByRole("dialog");
    const isDialogVisible = await dialog.isVisible().catch(() => false);

    if (isDialogVisible) {
      await dialog.getByRole("button", { name: /confirm/i }).click();
      return true;
    }
    return false;
  }

  /** Assert a persona exists in the table. */
  async expectPersonaInList(title: string): Promise<void> {
    const row = this.personasTable.getByRole("row", { name: title });
    await expect(row).toBeVisible();
  }

  /** Assert a persona does not exist in the table. */
  async expectPersonaNotInList(title: string): Promise<void> {
    const row = this.personasTable.getByRole("row", { name: title });
    await expect(row).not.toBeVisible();
  }

  /** Assert the deletion-blocked tooltip is visible for a persona row. */
  async expectDeletionBlocked(title: string): Promise<void> {
    const row = this.personasTable.getByRole("row", { name: title });
    const deleteButton = row.getByRole("button", { name: /delete/i });
    await deleteButton.hover();
    const tooltip = this.page.getByRole("tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(/referenced by/i);
  }
}
```

### AuditLogPage

```typescript
// apps/web/e2e/page-objects/audit-log.page.ts
// Page object for the Audit Log page with chronological entries
// and export functionality.
import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base.page";

export class AuditLogPage extends BasePage {
  readonly heading: Locator;
  readonly entriesTable: Locator;
  readonly exportJsonButton: Locator;
  readonly exportCsvButton: Locator;
  readonly filterByAction: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole("heading", { name: /audit log/i });
    this.entriesTable = page.getByTestId("audit-log-table");
    this.exportJsonButton = page.getByRole("button", { name: /export json/i });
    this.exportCsvButton = page.getByRole("button", { name: /export csv/i });
    this.filterByAction = page.getByTestId("action-filter");
  }

  async goto(): Promise<void> {
    await this.page.goto("/audit-log");
    await this.waitForPageLoad();
  }

  /** Assert an audit log entry exists with the given action and entity. */
  async expectEntry(action: string, entityName: string): Promise<void> {
    const row = this.entriesTable.getByRole("row").filter({
      hasText: action,
    }).filter({
      hasText: entityName,
    });
    await expect(row.first()).toBeVisible();
  }

  /** Get the total number of visible audit log entries. */
  async getEntryCount(): Promise<number> {
    const rows = this.entriesTable.getByRole("row");
    // Subtract 1 for the header row.
    return (await rows.count()) - 1;
  }

  /** Export audit log as JSON. Returns the download path. */
  async exportJson(): Promise<string> {
    const downloadPromise = this.page.waitForEvent("download");
    await this.exportJsonButton.click();
    const download = await downloadPromise;
    return download.suggestedFilename();
  }

  /** Export audit log as CSV. Returns the download path. */
  async exportCsv(): Promise<string> {
    const downloadPromise = this.page.waitForEvent("download");
    await this.exportCsvButton.click();
    const download = await downloadPromise;
    return download.suggestedFilename();
  }
}
```

### GraphPage

```typescript
// apps/web/e2e/page-objects/graph.page.ts
// Page object for the DAG Graph visualization page using ReactFlow.
// Provides interaction methods for zoom, pan, node clicks, and
// view level toggling.
import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base.page";

export class GraphPage extends BasePage {
  /** The ReactFlow canvas container. */
  readonly canvas: Locator;

  /** The minimap component in the graph. */
  readonly minimap: Locator;

  /** Zoom in button in the graph controls. */
  readonly zoomInButton: Locator;

  /** Zoom out button in the graph controls. */
  readonly zoomOutButton: Locator;

  /** Fit-to-view button in the graph controls. */
  readonly fitViewButton: Locator;

  /** View level toggle (Task / Story / Epic). */
  readonly viewLevelToggle: Locator;

  /** Status filter chips container. */
  readonly statusFilters: Locator;

  constructor(page: Page) {
    super(page);
    this.canvas = page.locator(".react-flow");
    this.minimap = page.locator(".react-flow__minimap");
    this.zoomInButton = page.getByRole("button", { name: /zoom in/i });
    this.zoomOutButton = page.getByRole("button", { name: /zoom out/i });
    this.fitViewButton = page.getByRole("button", { name: /fit view/i });
    this.viewLevelToggle = page.getByTestId("view-level-toggle");
    this.statusFilters = page.getByTestId("status-filters");
  }

  async goto(projectId?: string): Promise<void> {
    if (projectId) {
      await this.page.goto(`/projects/${projectId}?tab=graph`);
    }
    await this.waitForPageLoad();
  }

  /** Get all graph nodes. */
  async getNodes(): Promise<Locator> {
    return this.canvas.locator(".react-flow__node");
  }

  /** Click a specific graph node by its label text. */
  async clickNode(label: string): Promise<void> {
    const node = this.canvas.locator(".react-flow__node").filter({
      hasText: label,
    });
    await node.click();
  }

  /** Assert a node has the expected status color CSS class. */
  async expectNodeStatus(label: string, statusClass: string): Promise<void> {
    const node = this.canvas.locator(".react-flow__node").filter({
      hasText: label,
    });
    await expect(node).toHaveClass(new RegExp(statusClass));
  }

  /** Zoom in using the control button. */
  async zoomIn(clicks: number = 1): Promise<void> {
    for (let i = 0; i < clicks; i++) {
      await this.zoomInButton.click();
    }
  }

  /** Zoom out using the control button. */
  async zoomOut(clicks: number = 1): Promise<void> {
    for (let i = 0; i < clicks; i++) {
      await this.zoomOutButton.click();
    }
  }

  /** Fit the graph to the viewport. */
  async fitView(): Promise<void> {
    await this.fitViewButton.click();
  }

  /** Pan the graph canvas by dragging. */
  async pan(deltaX: number, deltaY: number): Promise<void> {
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error("Graph canvas not found");
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(startX + deltaX, startY + deltaY, { steps: 10 });
    await this.page.mouse.up();
  }

  /** Toggle the view level (Task, Story, Epic). */
  async setViewLevel(level: "task" | "story" | "epic"): Promise<void> {
    await this.viewLevelToggle.getByRole("radio", { name: new RegExp(level, "i") }).click();
  }

  /** Toggle a status filter chip on or off. */
  async toggleStatusFilter(status: string): Promise<void> {
    await this.statusFilters.getByRole("checkbox", { name: new RegExp(status, "i") }).click();
  }
}
```

### Re-export Barrel File

```typescript
// apps/web/e2e/page-objects/index.ts
// Barrel file re-exporting all page object models for convenient imports.
export { BasePage } from "./base.page";
export { SignInPage } from "./sign-in.page";
export { DashboardPage } from "./dashboard.page";
export { ProjectListPage } from "./project-list.page";
export { ProjectDetailPage } from "./project-detail.page";
export { EpicDetailPage } from "./epic-detail.page";
export { StoryDetailPage } from "./story-detail.page";
export { TaskDetailPage } from "./task-detail.page";
export { WorkerListPage } from "./worker-list.page";
export { WorkerDetailPage } from "./worker-detail.page";
export { PersonaListPage } from "./persona-list.page";
export { AuditLogPage } from "./audit-log.page";
export { GraphPage } from "./graph.page";
```

## Acceptance Criteria

- [ ] Base page object (`BasePage`) is implemented with shared navigation, toast assertion, URL assertion, and polling wait methods
- [ ] `SignInPage` POM encapsulates Google OAuth button interaction, sign-in page assertion, and error state display
- [ ] `DashboardPage` POM encapsulates empty state detection, CTA interaction, and widget value assertions
- [ ] `ProjectListPage` POM encapsulates project creation modal, table assertions, and project navigation
- [ ] `ProjectDetailPage` POM encapsulates epic creation, status badge assertions, publish/delete actions, and tab navigation
- [ ] `EpicDetailPage` POM encapsulates story creation, status assertions, and publish action
- [ ] `StoryDetailPage` POM encapsulates task creation, assignment controls (unassign, reset), read-only banner, timeout banner, attempt history, and failed error display
- [ ] `TaskDetailPage` POM encapsulates dependency management, cycle error detection, status badge, and read-only lock icon
- [ ] `WorkerListPage` POM encapsulates worker creation with API key capture and modal close
- [ ] `WorkerDetailPage` POM encapsulates project access add/remove with table assertions
- [ ] `PersonaListPage` POM encapsulates CRUD operations and deletion-guard tooltip assertion
- [ ] `AuditLogPage` POM encapsulates entry assertions, entry counting, and JSON/CSV export
- [ ] `GraphPage` POM encapsulates ReactFlow canvas interaction (zoom, pan, fit-to-view), node clicks, view level toggle, status filter chips, and minimap assertion
- [ ] All POMs use strict TypeScript typing with no `any` types
- [ ] All POMs use accessible selectors (`getByRole`, `getByLabel`, `getByText`) where possible
- [ ] Barrel file (`index.ts`) re-exports all POMs for convenient importing

## Technical Notes

- Page Object Models follow the Page Object pattern: each class wraps a single page and exposes methods for user interactions and assertions. Tests never directly use selectors -- they call POM methods.
- Prefer `getByRole` and `getByLabel` selectors over `getByTestId` for better accessibility alignment. Use `getByTestId` only when no semantic selector exists.
- The `BasePage.waitForPollingRefresh()` method handles TanStack Query's 15-second polling interval by waiting for the next API response. This is critical for tests that mutate state via MSW and need the UI to reflect the change.
- The `GraphPage` POM uses CSS class selectors (`.react-flow__node`) because ReactFlow renders nodes as generic divs without ARIA roles. This is the standard approach for ReactFlow testing.
- All POM constructors accept only a `Page` instance, keeping them stateless and reusable across test contexts.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — page object models for test maintainability)
- **Project Setup Specification:** Section G.7 (Mocking & Fixtures — never use `any` type in test code)
- **Design Specification:** Page layouts, navigation structure, component naming conventions
- **Functional Requirements:** All entity detail pages, graph visualization, audit log, worker management

## Estimated Complexity

Large — Creating 12+ page object models with comprehensive selectors, action methods, and assertion helpers requires deep understanding of every page's structure. Each POM must be carefully designed to be maintainable and resilient to UI changes while providing a fluent API for test authors.
