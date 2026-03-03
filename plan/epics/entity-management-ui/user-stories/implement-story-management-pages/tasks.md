# Implement User Story Management Pages — Tasks

## User Story Summary

- **Title:** Implement User Story Management Pages
- **Description:** Build the user story detail page with tabbed interface (Overview, Tasks, Attempt History), create/edit modal with priority and epic selection, and action flows (publish with validation, reset failed stories, unassign workers, delete with guards).
- **Status:** Complete
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Total Tasks:** 5
- **Dependencies:** Implement Epic Management Pages

## Tasks

| Task                                                                            | Description                                                                                     | Status   | Assigned Agent      | Dependencies                                           |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------- | ------------------- | ------------------------------------------------------ |
| [Implement Story Detail Page](./implement-story-detail-page.md)                 | Build story detail page with header, status badges, action buttons, and tabbed Overview section | Complete | frontend-developer  | None                                                   |
| [Implement Story Tasks Tab](./implement-story-tasks-tab.md)                     | Build Tasks sub-tab with task table, execution order visual, and read-only banner               | Complete | frontend-developer  | Implement Story Detail Page                            |
| [Implement Story Attempt History Tab](./implement-story-attempt-history-tab.md) | Build Attempt History tab with timeline of worker assignment/unassignment events                | Complete | frontend-developer  | Implement Story Detail Page                            |
| [Implement Create Edit Story Modal](./implement-create-edit-story-modal.md)     | Build create/edit modal with title, description, priority, and epic selection                   | Complete | fullstack-developer | None                                                   |
| [Implement Story Action Flows](./implement-story-action-flows.md)               | Build publish, reset, unassign, and delete action flows with validation and guards              | Complete | fullstack-developer | Implement Story Detail Page, Implement Story Tasks Tab |

## Dependency Graph

```
Implement Story Detail Page ---+--> Implement Story Tasks Tab ------+
                               |                                    |
                               +--> Implement Story Attempt History  +--> Implement Story Action Flows
                                                                    |
Implement Create Edit Story Modal (independent) -------------------+
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** Implement Story Detail Page + Implement Create Edit Story Modal — detail page is the primary view, modal is independent
2. **Phase 2 (parallel):** Implement Story Tasks Tab + Implement Story Attempt History Tab — both extend the detail page with tab content
3. **Phase 3:** Implement Story Action Flows — requires the detail page and tasks tab for complete context
