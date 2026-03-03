# Implement Worker Management Pages — Tasks

## User Story Summary

- **Title:** Implement Worker Management Pages
- **Description:** Build the worker list page with status indicators, worker detail page with API key section and work history, two-step create worker modal with API key reveal, and project access management with add/remove capabilities.
- **Status:** Complete
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Total Tasks:** 4
- **Dependencies:** None

## Tasks

| Task                                                                                          | Description                                                                           | Status   | Assigned Agent      | Dependencies                 |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------- | ------------------- | ---------------------------- |
| [Implement Worker List Page](./implement-worker-list-page.md)                                 | Build worker list page with table showing name, projects, current status, and actions | Complete | frontend-developer  | None                         |
| [Implement Worker Detail Page](./implement-worker-detail-page.md)                             | Build worker detail page with API key section, project access table, and work history | Complete | frontend-developer  | Implement Worker List Page   |
| [Implement Create Worker Modal](./implement-create-worker-modal.md)                           | Build two-step create modal: name input, then API key reveal with copy button         | Complete | fullstack-developer | Implement Worker List Page   |
| [Implement Worker Project Access Management](./implement-worker-project-access-management.md) | Build project access add/remove UI with active work guards                            | Complete | fullstack-developer | Implement Worker Detail Page |

## Dependency Graph

```
Implement Worker List Page ---+--> Implement Worker Detail Page ---+--> Implement Worker Project Access Management
                              |
                              +--> Implement Create Worker Modal
```

## Suggested Implementation Order

1. **Phase 1:** Implement Worker List Page — the entry point for worker management
2. **Phase 2 (parallel):** Implement Worker Detail Page + Implement Create Worker Modal — detail page and create modal branch from the list
3. **Phase 3:** Implement Worker Project Access Management — requires the detail page's project table for context
