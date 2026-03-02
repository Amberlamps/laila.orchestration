# Test Full Plan Creation Flow

## Task Details

- **Title:** Test Full Plan Creation Flow
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Plan Creation & Publish E2E Tests](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** None (depends on User Story: Set Up Playwright Infrastructure)

## Description

Implement E2E tests for the complete plan creation flow: create a project, create an epic within it, create a user story within the epic, create tasks with personas assigned, and add dependencies between tasks. Verify the DAG validates successfully with no cycles. This tests the complete happy path from an empty project to a fully defined plan.

### Test: Full Plan Creation Flow

```typescript
// apps/web/e2e/plan-creation/full-plan-creation.spec.ts
// E2E tests for the complete plan creation journey.
// Covers: project creation → epic → story → tasks with personas → dependencies.
// Verifies the entire entity hierarchy can be built through the UI.
import { test, expect } from "../fixtures";
import {
  ProjectListPage,
  ProjectDetailPage,
  EpicDetailPage,
  StoryDetailPage,
  TaskDetailPage,
} from "../page-objects";
import { navigateToProject } from "../utils";

test.describe("Full Plan Creation Flow", () => {
  test("create complete plan: project → epic → story → tasks → dependencies", async ({
    authenticatedPage: page,
  }) => {
    // Step 1: Create a project.
    const projectList = new ProjectListPage(page);
    await projectList.goto();
    await projectList.createProject(
      "E2E Integration Project",
      "A project created end-to-end via Playwright"
    );
    await projectList.expectProjectInList("E2E Integration Project");

    // Step 2: Open the project and create an epic.
    await projectList.openProject("E2E Integration Project");
    const projectDetail = new ProjectDetailPage(page);
    await projectDetail.expectStatus("Draft");
    await projectDetail.createEpic(
      "User Authentication Epic",
      "Implement the complete authentication system"
    );

    // Step 3: Open the epic and create a user story.
    await projectDetail.openEpic("User Authentication Epic");
    const epicDetail = new EpicDetailPage(page);
    await epicDetail.expectStatus("Draft");
    await epicDetail.createStory(
      "Implement Login Flow",
      "Users should be able to sign in with Google OAuth"
    );

    // Step 4: Open the story and create tasks with persona assignments.
    await epicDetail.openStory("Implement Login Flow");
    const storyDetail = new StoryDetailPage(page);
    await storyDetail.expectStatus("Draft");

    // Create three tasks that form a dependency chain.
    await storyDetail.createTask(
      "Configure Auth Provider",
      "Set up Better Auth with Google OAuth",
      "Backend Developer"
    );
    await storyDetail.createTask(
      "Build Login Page UI",
      "Create the sign-in page with Google button",
      "Frontend Developer"
    );
    await storyDetail.createTask(
      "Write Auth Integration Tests",
      "Test the complete OAuth flow",
      "QA Engineer"
    );

    // Step 5: Navigate to task detail and add dependencies.
    // "Build Login Page UI" depends on "Configure Auth Provider"
    await storyDetail.openTask("Build Login Page UI");
    const taskDetail = new TaskDetailPage(page);
    await taskDetail.addDependency("Configure Auth Provider");
    await taskDetail.expectDependency("Configure Auth Provider");

    // Navigate back and add dependency for the test task.
    await page.goBack();
    await storyDetail.openTask("Write Auth Integration Tests");
    await taskDetail.addDependency("Build Login Page UI");
    await taskDetail.expectDependency("Build Login Page UI");

    // Step 6: Verify the DAG is valid (no cycles).
    // Navigate to the project graph view to visually confirm.
    await page.goto("/projects");
    await navigateToProject(page, "E2E Integration Project");
    const projectDetailPage = new ProjectDetailPage(page);
    await projectDetailPage.graphTab.click();

    // The graph should render without errors if DAG is valid.
    const graphCanvas = page.locator(".react-flow");
    await expect(graphCanvas).toBeVisible();
  });

  test("create multiple epics and stories within a project", async ({
    authenticatedPage: page,
  }) => {
    // Create a project with multiple epics, each containing stories.
    // Verifies the UI supports complex plan structures.
    const projectList = new ProjectListPage(page);
    await projectList.goto();
    await projectList.createProject(
      "Multi-Epic Project",
      "Project with multiple epics for testing"
    );
    await projectList.openProject("Multi-Epic Project");

    const projectDetail = new ProjectDetailPage(page);

    // Create two epics.
    await projectDetail.createEpic("Epic Alpha", "First epic");
    await projectDetail.createEpic("Epic Beta", "Second epic");

    // Verify both epics appear in the epics table.
    await projectDetail.epicsTab.click();
    await expect(
      projectDetail.epicsTable.getByRole("row", { name: /Epic Alpha/ })
    ).toBeVisible();
    await expect(
      projectDetail.epicsTable.getByRole("row", { name: /Epic Beta/ })
    ).toBeVisible();

    // Create stories in each epic.
    await projectDetail.openEpic("Epic Alpha");
    const epicDetail = new EpicDetailPage(page);
    await epicDetail.createStory("Alpha Story 1", "First story in Alpha");
    await epicDetail.createStory("Alpha Story 2", "Second story in Alpha");

    // Verify both stories appear.
    await epicDetail.storiesTab.click();
    await expect(
      epicDetail.storiesTable.getByRole("row", { name: /Alpha Story 1/ })
    ).toBeVisible();
    await expect(
      epicDetail.storiesTable.getByRole("row", { name: /Alpha Story 2/ })
    ).toBeVisible();
  });

  test("task creation requires persona assignment", async ({
    authenticatedPage: page,
  }) => {
    // Attempt to create a task without selecting a persona.
    // The form should show a validation error.
    const projectList = new ProjectListPage(page);
    await projectList.goto();
    await projectList.createProject("Validation Test Project", "Testing form validation");
    await projectList.openProject("Validation Test Project");

    const projectDetail = new ProjectDetailPage(page);
    await projectDetail.createEpic("Validation Epic", "Testing validation");
    await projectDetail.openEpic("Validation Epic");

    const epicDetail = new EpicDetailPage(page);
    await epicDetail.createStory("Validation Story", "Testing task validation");
    await epicDetail.openStory("Validation Story");

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.tasksTab.click();
    await storyDetail.createTaskButton.click();

    // Fill title and description but skip persona selection.
    const modal = page.getByRole("dialog");
    await modal.getByLabel(/title/i).fill("Task Without Persona");
    await modal.getByLabel(/description/i).fill("Missing persona");
    await modal.getByRole("button", { name: /create/i }).click();

    // Verify the form shows a validation error for the persona field.
    const personaError = modal.getByText(/persona.*required/i);
    await expect(personaError).toBeVisible();
  });
});
```

## Acceptance Criteria

- [ ] Test verifies complete plan creation: project → epic → story → 3 tasks with personas → dependencies between tasks
- [ ] Test verifies each entity appears in its parent's list after creation (project in projects table, epic in epics table, etc.)
- [ ] Test verifies status badges show "Draft" for all newly created entities
- [ ] Test verifies dependencies can be added between tasks via the task detail page
- [ ] Test verifies the DAG graph renders without errors after adding valid dependencies
- [ ] Test verifies multiple epics and stories can be created within a single project
- [ ] Test verifies task creation requires persona assignment (form validation)
- [ ] All tests pass in Chromium, Firefox, and WebKit browsers
- [ ] No `any` types used in test code

## Technical Notes

- The test creates entities top-down (project → epic → story → task) which mirrors the natural user flow. The MSW handlers must correctly store each entity and associate it with its parent.
- Dependencies are added after all tasks exist to ensure the dependency dropdown shows all available tasks.
- The DAG graph test navigates to the Graph tab and verifies ReactFlow renders. The actual node layout is tested in more detail in the graph-specific E2E tests.
- Form validation for persona assignment is enforced by React Hook Form + Zod on the client side. The `required` validation error message is expected to match the pattern `/persona.*required/i`.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — Project creation → Epic → Story → Task → Dependency flow)
- **Functional Requirements:** FR-PROJ-001 (create project), FR-EPIC-001 (create epic), FR-STORY-001 (create story), FR-TASK-001 (create task with persona), FR-DEP-001 (add dependency)
- **Design Specification:** Create entity modals, entity detail pages, dependency management UI

## Estimated Complexity

Large — This is a multi-step flow that creates entities across 4 levels of hierarchy and adds dependencies. Each step depends on the previous step succeeding, making it sensitive to timing, navigation, and state management. The test must handle multiple modal interactions and page navigations.
