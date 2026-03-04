// apps/web/e2e/entity-management/audit-log.spec.ts
// E2E tests for the audit log and per-project activity feed.
// Verifies chronological ordering, actor/action/entity display,
// project-scoped filtering, and export functionality.
import { test, expect } from '../fixtures';
import {
  createMockProject,
  createMockEpic,
  createMockAuditLogEntry,
} from '../fixtures/entity-factories';
import { AuditLogPage, ProjectListPage, ProjectDetailPage } from '../page-objects';

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

/** Helper to convert a typed entity to a [id, record] tuple for seedData. */
function toEntry(entity: { id: string }): [string, Record<string, unknown>] {
  return [entity.id, { ...entity }];
}

/** Helper to convert a typed audit log entry to a serializable record for seedData. */
function toAuditRecord(entry: { id: string }): Record<string, unknown> {
  return { ...entry };
}

/**
 * Builds seed data with a project, epic, and corresponding audit log entries.
 * The audit entries are timestamped so that epic.created is more recent
 * than project.created (reverse chronological order).
 */
function buildAuditLogSeed() {
  const project = createMockProject({
    id: 'audit-project-id',
    name: 'Audit Test Project',
    description: 'Testing audit log',
    status: 'draft',
  });

  const epic = createMockEpic({
    id: 'audit-epic-id',
    projectId: project.id,
    title: 'Audit Test Epic',
    description: 'Testing audit log entries',
    status: 'draft',
  });

  const projectCreatedEntry = createMockAuditLogEntry({
    id: 'audit-entry-1',
    action: 'project.created',
    entityId: project.id,
    entityName: project.name,
    entityType: 'project',
    actorName: 'E2E Test User',
    createdAt: '2026-03-04T10:00:00.000Z',
  });

  const epicCreatedEntry = createMockAuditLogEntry({
    id: 'audit-entry-2',
    action: 'epic.created',
    entityId: epic.id,
    entityName: epic.title,
    entityType: 'epic',
    actorName: 'E2E Test User',
    createdAt: '2026-03-04T10:01:00.000Z',
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(epic)],
    auditLog: [toAuditRecord(projectCreatedEntry), toAuditRecord(epicCreatedEntry)],
  };
}

/**
 * Builds seed data with two projects to verify project-scoped
 * activity filtering. Only entries from the target project should
 * appear in that project's Activity tab.
 */
function buildProjectScopedSeed() {
  const targetProject = createMockProject({
    id: 'scoped-project-id',
    name: 'Scoped Project',
    description: 'Project for activity tab test',
    status: 'draft',
  });

  const otherProject = createMockProject({
    id: 'other-project-id',
    name: 'Other Project',
    description: 'Should not appear in scoped activity',
    status: 'draft',
  });

  const targetEpic = createMockEpic({
    id: 'scoped-epic-id',
    projectId: targetProject.id,
    title: 'Scoped Epic',
    status: 'draft',
  });

  const otherEpic = createMockEpic({
    id: 'other-epic-id',
    projectId: otherProject.id,
    title: 'Other Epic',
    status: 'draft',
  });

  const targetProjectEntry = createMockAuditLogEntry({
    id: 'scoped-entry-1',
    action: 'project.created',
    entityId: targetProject.id,
    entityName: targetProject.name,
    entityType: 'project',
    actorName: 'E2E Test User',
    createdAt: '2026-03-04T09:00:00.000Z',
  });

  const targetEpicEntry = createMockAuditLogEntry({
    id: 'scoped-entry-2',
    action: 'epic.created',
    entityId: targetEpic.id,
    entityName: targetEpic.title,
    entityType: 'epic',
    actorName: 'E2E Test User',
    createdAt: '2026-03-04T09:01:00.000Z',
  });

  const otherProjectEntry = createMockAuditLogEntry({
    id: 'other-entry-1',
    action: 'project.created',
    entityId: otherProject.id,
    entityName: otherProject.name,
    entityType: 'project',
    actorName: 'E2E Test User',
    createdAt: '2026-03-04T09:02:00.000Z',
  });

  const otherEpicEntry = createMockAuditLogEntry({
    id: 'other-entry-2',
    action: 'epic.created',
    entityId: otherEpic.id,
    entityName: otherEpic.title,
    entityType: 'epic',
    actorName: 'E2E Test User',
    createdAt: '2026-03-04T09:03:00.000Z',
  });

  return {
    projects: [toEntry(targetProject), toEntry(otherProject)],
    epics: [toEntry(targetEpic), toEntry(otherEpic)],
    auditLog: [
      toAuditRecord(targetProjectEntry),
      toAuditRecord(targetEpicEntry),
      toAuditRecord(otherProjectEntry),
      toAuditRecord(otherEpicEntry),
    ],
  };
}

/**
 * Builds seed data for a project that is ready to be published.
 * All epics are in "ready" status so the project publish will succeed.
 */
function buildPublishReadySeed() {
  const project = createMockProject({
    id: 'publish-project-id',
    name: 'E2E Test Plan',
    description: 'Project ready for publishing',
    status: 'draft',
  });

  const readyEpic = createMockEpic({
    id: 'publish-epic-id',
    projectId: project.id,
    title: 'Ready Epic',
    status: 'ready',
  });

  return {
    projects: [toEntry(project)],
    epics: [toEntry(readyEpic)],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

    // Verify the most recent entry is at the top (0-indexed).
    const firstEntry = auditLog.getEntry(0);
    await expect(firstEntry).toContainText('epic.created');
  });

  test('audit log entries include actor name and entity links', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed audit log entries with known actor and entity data.
    await seedData(buildAuditLogSeed());

    const auditLog = new AuditLogPage(page);
    await auditLog.goto();

    // Verify entries show the actor name.
    // The most recent entry (epic.created) is first.
    const firstEntry = auditLog.getEntry(0);
    await expect(firstEntry).toContainText('E2E Test User');

    // Verify entity names are rendered as clickable links.
    // AuditEntry renders entity names as <a> (Next.js Link) elements.
    const entityLink = firstEntry.getByRole('link').first();
    await expect(entityLink).toBeVisible();

    // Click the entity link and verify navigation to an entity detail page.
    await entityLink.click();
    await expect(page).toHaveURL(/\/projects\/|\/epics\/|\/stories\//);
  });

  test('project Activity tab shows project-scoped entries', async ({
    authenticatedPage: page,
    seedData,
  }) => {
    // Seed two projects with audit log entries to verify scoping.
    await seedData(buildProjectScopedSeed());

    const projectDetail = new ProjectDetailPage(page);
    await projectDetail.goto('scoped-project-id');

    // Click the Activity tab.
    await projectDetail.activityTab.click();

    // The ProjectActivityTab renders with an "Activity" heading and
    // "Recent changes and events in this project" subtitle.
    const activityHeading = page.getByRole('heading', { name: 'Activity' });
    await expect(activityHeading).toBeVisible();

    // The activity feed section is the parent container of the heading.
    const activitySection = activityHeading.locator('..').locator('..');

    // Verify project-related entries are present.
    await expect(activitySection).toContainText('project.created');
    await expect(activitySection).toContainText('epic.created');

    // Verify entries from other projects are NOT present.
    await expect(activitySection).not.toContainText('Other Project');
  });

  test('export audit log as JSON', async ({ authenticatedPage: page, seedData }) => {
    await seedData(buildAuditLogSeed());

    const auditLog = new AuditLogPage(page);
    await auditLog.goto();

    // Click export JSON and verify a download is triggered.
    const filename = await auditLog.exportJson();
    expect(filename).toMatch(/audit.*\.json$/i);
  });

  test('export audit log as CSV', async ({ authenticatedPage: page, seedData }) => {
    await seedData(buildAuditLogSeed());

    const auditLog = new AuditLogPage(page);
    await auditLog.goto();

    // Click export CSV and verify a download is triggered.
    const filename = await auditLog.exportCsv();
    expect(filename).toMatch(/audit.*\.csv$/i);
  });

  test('audit log tracks publish actions', async ({ authenticatedPage: page, seedData }) => {
    // Seed a project ready for publishing to generate publish audit entries.
    await seedData(buildPublishReadySeed());

    // Navigate to the project and publish it.
    const projectDetail = new ProjectDetailPage(page);
    await projectDetail.goto('publish-project-id');
    await projectDetail.publish();

    // Navigate to audit log and verify publish entry.
    const auditLog = new AuditLogPage(page);
    await auditLog.goto();

    await auditLog.expectEntry('project.published', 'E2E Test Plan');
  });
});
