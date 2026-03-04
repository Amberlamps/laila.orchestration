# Test Audit Log and Activity Feed

## Task Details

- **Title:** Test Audit Log and Activity Feed
- **Status:** Complete
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Entity Management E2E Tests](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** None (depends on User Story: Set Up Playwright Infrastructure)

## Description

Implement E2E tests for the audit log and activity feed. Perform various actions (create project, create epic, publish), navigate to the Audit Log page, verify entries appear in chronological order with correct actor, action, and entity links. Navigate to a project's Activity tab and verify project-scoped entries. Test the JSON and CSV export functionality.

### Test: Audit Log and Activity Feed

```typescript
// apps/web/e2e/entity-management/audit-log.spec.ts
// E2E tests for the audit log and per-project activity feed.
// Verifies chronological ordering, actor/action/entity display,
// project-scoped filtering, and export functionality.
import { test, expect } from '../fixtures';
import { AuditLogPage, ProjectListPage, ProjectDetailPage } from '../page-objects';

test.describe('Audit Log and Activity Feed', () => {
  test('actions appear in audit log in chronological order', async ({
    authenticatedPage: page,
  }) => {
    // Perform a series of actions that generate audit log entries.
    const projectList = new ProjectListPage(page);
    await projectList.goto();
    await projectList.createProject('Audit Test Project', 'Testing audit log');
    await projectList.openProject('Audit Test Project');

    const projectDetail = new ProjectDetailPage(page);
    await projectDetail.createEpic('Audit Test Epic', 'Testing audit log entries');

    // Navigate to the audit log page.
    const auditLog = new AuditLogPage(page);
    await auditLog.goto();

    // Verify the entries exist in reverse chronological order
    // (most recent first).
    await auditLog.expectEntry('epic.created', 'Audit Test Epic');
    await auditLog.expectEntry('project.created', 'Audit Test Project');

    // Verify the most recent entry is at the top.
    const firstRow = auditLog.entriesTable.getByRole('row').nth(1); // Skip header
    await expect(firstRow).toContainText('epic.created');
  });

  test('audit log entries include actor name and entity links', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed audit log entries with known actor and entity data.
    seedData({});

    const auditLog = new AuditLogPage(page);
    await auditLog.goto();

    // Verify entries show the actor name.
    const firstRow = auditLog.entriesTable.getByRole('row').nth(1);
    await expect(firstRow).toContainText('E2E Test User');

    // Verify entity names are rendered as clickable links.
    const entityLink = firstRow.getByRole('link');
    await expect(entityLink).toBeVisible();

    // Click the entity link and verify navigation to the entity detail.
    await entityLink.click();
    await expect(page).toHaveURL(/\/projects\/|\/epics\/|\/stories\//);
  });

  test('project Activity tab shows project-scoped entries', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed a project with several audit log entries.
    seedData({});

    const projectDetail = new ProjectDetailPage(page);
    await projectDetail.goto('seeded-project-id');

    // Click the Activity tab.
    await projectDetail.activityTab.click();

    // Verify the activity feed shows entries scoped to this project.
    const activityFeed = page.getByTestId('activity-feed');
    await expect(activityFeed).toBeVisible();

    // Verify project-related entries are present.
    await expect(activityFeed).toContainText('project.created');
    await expect(activityFeed).toContainText('epic.created');

    // Verify entries from other projects are NOT present.
    await expect(activityFeed).not.toContainText('Other Project');
  });

  test('export audit log as JSON', async ({ authenticatedPage: page, seedData }) => {
    seedData({});

    const auditLog = new AuditLogPage(page);
    await auditLog.goto();

    // Click export JSON and verify a download is triggered.
    const filename = await auditLog.exportJson();
    expect(filename).toMatch(/audit.*\.json$/i);
  });

  test('export audit log as CSV', async ({ authenticatedPage: page, seedData }) => {
    seedData({});

    const auditLog = new AuditLogPage(page);
    await auditLog.goto();

    // Click export CSV and verify a download is triggered.
    const filename = await auditLog.exportCsv();
    expect(filename).toMatch(/audit.*\.csv$/i);
  });

  test('audit log tracks publish actions', async ({ authenticatedPage: page, seedData }) => {
    // Seed a project and publish it to generate publish audit entries.
    seedData({});

    // Simulate publishing a story.
    const projectDetail = new ProjectDetailPage(page);
    await projectDetail.goto('seeded-project-id');
    await projectDetail.publish();

    // Navigate to audit log and verify publish entry.
    const auditLog = new AuditLogPage(page);
    await auditLog.goto();

    await auditLog.expectEntry('project.published', 'E2E Test Plan');
  });
});
```

## Acceptance Criteria

- [ ] Test verifies actions (create project, create epic) appear in the audit log in reverse chronological order
- [ ] Test verifies audit log entries include the actor name ("E2E Test User")
- [ ] Test verifies entity names in audit log entries are rendered as clickable links
- [ ] Test verifies clicking an entity link navigates to the entity detail page
- [ ] Test verifies the project Activity tab shows only project-scoped entries (no entries from other projects)
- [ ] Test verifies exporting the audit log as JSON triggers a download with a `.json` filename
- [ ] Test verifies exporting the audit log as CSV triggers a download with a `.csv` filename
- [ ] Test verifies publish actions are tracked in the audit log
- [ ] All tests pass in Chromium, Firefox, and WebKit browsers
- [ ] No `any` types used in test code

## Technical Notes

- The audit log is append-only and sorted by `createdAt` in descending order (most recent first). The MSW handler sorts entries by timestamp.
- Entity links in the audit log use the entity type and ID to construct the navigation URL (e.g., `/projects/123`, `/epics/456`).
- The project Activity tab filters the global audit log by `entityId` matching the project or any of its descendants (epics, stories, tasks).
- Export functionality uses the browser's download API. Playwright's `page.waitForEvent("download")` captures the download event and verifies the filename.
- The CSV export should include columns: timestamp, actor, action, entity type, entity name, entity ID.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — audit log verification)
- **Functional Requirements:** FR-AUDIT-001 (audit log entries), FR-AUDIT-002 (per-project activity feed), FR-AUDIT-003 (JSON/CSV export)
- **Design Specification:** Audit log page layout, activity feed component, export button placement

## Estimated Complexity

Medium — The audit log tests require creating actions that generate entries, then navigating to verify them. The export tests add complexity with download event handling. The project-scoped Activity tab test requires careful seed data to verify filtering.
