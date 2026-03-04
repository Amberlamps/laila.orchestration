# Audit Log & Activity Feed — User Stories

## Epic Summary

- **Title:** Audit Log & Activity Feed
- **Description:** Structured audit event writing to DynamoDB for all entity mutations and system-initiated actions, a cross-project audit log page with chronological event display, a project-scoped activity tab, a shared AuditEntry component, and export functionality for audit data in JSON and CSV formats. Provides complete traceability of all changes across the orchestration platform.
- **Status:** Complete
- **Total User Stories:** 2
- **Dependencies:** Epic 6 (Core CRUD API), Epic 8 (UI Foundation & Design System)

## User Stories

| User Story                                                                             | Description                                                                                                                       | Status   | Tasks   | Dependencies                  |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | ----------------------------- |
| [Implement Audit Event Writing](./user-stories/implement-audit-event-writing/tasks.md) | Audit event service for writing structured events to DynamoDB, integration with API mutations, and system-initiated event logging | Complete | 3 tasks | None                          |
| [Implement Audit Log UI](./user-stories/implement-audit-log-ui/tasks.md)               | Cross-project audit log page, project activity tab, shared AuditEntry component, and export functionality                         | Complete | 4 tasks | Implement Audit Event Writing |

## Dependency Graph

```
Implement Audit Event Writing
    |
    v
Implement Audit Log UI
```

## Suggested Implementation Order

1. **Phase 1:** Implement Audit Event Writing — the backend service that writes audit events to DynamoDB must be in place before the UI can display events
2. **Phase 2:** Implement Audit Log UI — builds the frontend pages and components that read and display audit events from DynamoDB
