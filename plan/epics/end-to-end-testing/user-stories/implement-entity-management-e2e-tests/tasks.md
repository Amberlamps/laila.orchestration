# Implement Entity Management E2E Tests — Tasks

## User Story Summary

- **Title:** Implement Entity Management E2E Tests
- **Description:** E2E tests covering worker creation with API key reveal and copy-to-clipboard, worker project access management, persona CRUD with deletion guard enforcement, and audit log chronological ordering with entity linking and export functionality.
- **Status:** Complete
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Total Tasks:** 4
- **Dependencies:** Set Up Playwright Infrastructure

## Tasks

| Task                                                                                    | Description                                                                                                                                                                                                        | Status   | Assigned Agent | Dependencies |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------------- | ------------ |
| [Test Worker Creation and API Key Reveal](./test-worker-creation-and-api-key-reveal.md) | E2E test: navigate to Workers, click "+ Create Worker", enter name, create, verify API key displayed in monospace with copy button, "Done" closes modal, key never shown again on detail page                      | Complete | qa-expert      | None         |
| [Test Worker Project Access Management](./test-worker-project-access-management.md)     | E2E test: create worker, navigate to detail, add project access, verify project in table, remove project access, verify removed, test multiple project assignments                                                 | Complete | qa-expert      | None         |
| [Test Persona CRUD and Deletion Guard](./test-persona-crud-and-deletion-guard.md)       | E2E test: create persona, verify in list, edit title/description, verify changes, attempt delete with active task references, verify blocked with tooltip, remove references, delete succeeds                      | Complete | qa-expert      | None         |
| [Test Audit Log and Activity Feed](./test-audit-log-and-activity-feed.md)               | E2E test: perform actions (create project, epic, publish), navigate to Audit Log, verify chronological entries with actor/action/entity links, check project Activity tab for scoped entries, test JSON/CSV export | Complete | qa-expert      | None         |

## Dependency Graph

```
Test Worker Creation and API Key Reveal     (independent)
Test Worker Project Access Management       (independent)
Test Persona CRUD and Deletion Guard        (independent)
Test Audit Log and Activity Feed            (independent)
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** All four tasks are independent and test distinct entity management areas. They can be implemented simultaneously, each using shared MSW fixtures and page object models from the infrastructure story.
