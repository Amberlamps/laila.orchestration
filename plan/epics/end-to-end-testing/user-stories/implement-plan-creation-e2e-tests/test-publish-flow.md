# Test Publish Flow

## Task Details

- **Title:** Test Publish Flow
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Plan Creation & Publish E2E Tests](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** Test Full Plan Creation Flow

## Description

Implement E2E tests for the publish lifecycle: publish user stories (which validates tasks have persona and acceptance criteria), publish epics (validates all stories are Ready), and publish the project (validates all children are Ready). Verify status transitions on each entity at each stage. Also test rejection when required fields are missing.

### Test: Publish Flow

```typescript
// apps/web/e2e/plan-creation/publish-flow.spec.ts
// E2E tests for the publish lifecycle.
// Tests the bottom-up publish flow: stories → epics → project.
// Verifies validation gates at each level and status transitions.
import { test, expect } from "../fixtures";
import {
  ProjectListPage,
  ProjectDetailPage,
  EpicDetailPage,
  StoryDetailPage,
} from "../page-objects";
import { expectStatusBadge, expectErrorToast } from "../utils";

test.describe("Publish Flow", () => {
  // Before each test, create a complete plan structure.
  // This setup mirrors the full plan creation flow test.
  test.beforeEach(async ({ authenticatedPage: page, seedData }) => {
    // Seed a complete project plan with all required fields filled.
    // This avoids repeating the creation steps in every test.
    seedData({
      // Seeded via the MSW data store (see setup-msw-and-auth-mocking task).
      // Includes project, epic, story, tasks with personas and acceptance criteria.
    });
  });

  test("publish story validates tasks have persona and acceptance criteria", async ({
    authenticatedPage: page,
  }) => {
    // Navigate to a story with fully configured tasks.
    await page.goto("/dashboard");
    // (Navigation assumes seeded data is accessible via known IDs.)

    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto("seeded-story-id");

    // Verify the story is in Draft status before publishing.
    await storyDetail.expectStatus("Draft");

    // Publish the story — should succeed because all tasks
    // have persona assignments and acceptance criteria.
    await storyDetail.publish();

    // Verify the story status transitions to Ready.
    await storyDetail.expectStatus("Ready");
  });

  test("publish story rejected when task missing persona", async ({
    authenticatedPage: page,
  }) => {
    // Attempt to publish a story where one task is missing a persona.
    // The publish action should fail with a validation error.
    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto("story-with-incomplete-task-id");

    await storyDetail.publishButton.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /confirm/i }).click();

    // Verify the error toast explains the validation failure.
    await expectErrorToast(page, /task.*missing.*persona/i);

    // Verify the story remains in Draft status.
    await storyDetail.expectStatus("Draft");
  });

  test("publish story rejected when task missing acceptance criteria", async ({
    authenticatedPage: page,
  }) => {
    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto("story-with-no-acceptance-criteria-id");

    await storyDetail.publishButton.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /confirm/i }).click();

    // Verify the validation error references acceptance criteria.
    await expectErrorToast(page, /acceptance criteria/i);
    await storyDetail.expectStatus("Draft");
  });

  test("publish epic validates all stories are Ready", async ({
    authenticatedPage: page,
  }) => {
    // Navigate to the epic. All stories must be Ready before
    // the epic can be published.
    const epicDetail = new EpicDetailPage(page);
    await epicDetail.goto("seeded-epic-id");
    await epicDetail.expectStatus("Draft");

    // Publish the epic — should succeed because all stories are Ready.
    await epicDetail.publish();

    // Verify the epic status transitions to Ready.
    await epicDetail.expectStatus("Ready");
  });

  test("publish epic rejected when story still in Draft", async ({
    authenticatedPage: page,
  }) => {
    // Attempt to publish an epic where one story is still Draft.
    const epicDetail = new EpicDetailPage(page);
    await epicDetail.goto("epic-with-draft-story-id");

    await epicDetail.publishButton.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /confirm/i }).click();

    await expectErrorToast(page, /stories.*not ready/i);
    await epicDetail.expectStatus("Draft");
  });

  test("publish project validates all epics are Ready", async ({
    authenticatedPage: page,
  }) => {
    // Navigate to the project. All epics must be Ready.
    const projectDetail = new ProjectDetailPage(page);
    await projectDetail.goto("seeded-project-id");
    await projectDetail.expectStatus("Draft");

    // Publish the project.
    await projectDetail.publish();

    // Verify the project status transitions to Ready.
    await projectDetail.expectStatus("Ready");
  });

  test("complete bottom-up publish: stories → epic → project", async ({
    authenticatedPage: page,
  }) => {
    // This test verifies the full bottom-up publish sequence.
    // 1. Publish each story in the epic.
    // 2. Publish the epic.
    // 3. Publish the project.

    // Publish story.
    const storyDetail = new StoryDetailPage(page);
    await storyDetail.goto("seeded-story-id");
    await storyDetail.publish();
    await storyDetail.expectStatus("Ready");

    // Publish epic.
    const epicDetail = new EpicDetailPage(page);
    await epicDetail.goto("seeded-epic-id");
    await epicDetail.publish();
    await epicDetail.expectStatus("Ready");

    // Publish project.
    const projectDetail = new ProjectDetailPage(page);
    await projectDetail.goto("seeded-project-id");
    await projectDetail.publish();
    await projectDetail.expectStatus("Ready");

    // Verify status transitions are reflected on the project overview.
    // All children should show Ready status in their respective tables.
    await projectDetail.epicsTab.click();
    const epicRow = projectDetail.epicsTable.getByRole("row", {
      name: /Core Feature Epic/,
    });
    await expect(epicRow).toContainText("Ready");
  });
});
```

## Acceptance Criteria

- [ ] Test verifies publishing a story with valid tasks (persona + acceptance criteria) transitions it to "Ready" status
- [ ] Test verifies publishing a story is rejected when a task is missing a persona, with appropriate error toast
- [ ] Test verifies publishing a story is rejected when a task is missing acceptance criteria
- [ ] Test verifies publishing an epic with all Ready stories transitions it to "Ready" status
- [ ] Test verifies publishing an epic is rejected when a story is still in "Draft" status
- [ ] Test verifies publishing a project with all Ready epics transitions it to "Ready" status
- [ ] Test verifies the complete bottom-up publish sequence (stories → epic → project) works end-to-end
- [ ] Test verifies status badge transitions are visible on each entity detail page after publish
- [ ] All tests pass in Chromium, Firefox, and WebKit browsers
- [ ] No `any` types used in test code

## Technical Notes

- The publish flow is bottom-up: stories must be published before their parent epic, and all epics before the project. This mirrors the domain logic validation rules.
- Publish validation is server-side (MSW handler checks entity state). The error response includes a descriptive message that the UI displays in an error toast.
- The `seedData` fixture pre-populates the MSW data store with a complete plan structure. Tests that need specific invalid states (missing persona, draft story) use separate seed data or create entities inline.
- Status transitions are verified via the `expectStatus()` POM method, which checks the `data-testid="status-badge"` element's text content.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — Publish flow)
- **Functional Requirements:** FR-PUB-001 (publish story with validation), FR-PUB-002 (publish epic), FR-PUB-003 (publish project)
- **Design Specification:** Publish confirmation modal, status badge variants, error toast patterns

## Estimated Complexity

Medium — The publish flow has clear validation gates, but testing rejection scenarios requires precise seed data with known invalid states. The bottom-up sequence test involves navigating across multiple entity levels.
