# Implement Epic Management Pages — Tasks

## User Story Summary

- **Title:** Implement Epic Management Pages
- **Description:** Build the epic detail page with breadcrumb, progress stat cards, user stories table, and action buttons. Create the create/edit epic modal and implement publish/delete lifecycle flows with validation guards.
- **Status:** Complete
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Total Tasks:** 3
- **Dependencies:** Implement Project Management Pages

## Tasks

| Task                                                                            | Description                                                                                            | Status   | Assigned Agent      | Dependencies                                                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------- | ------------------- | ------------------------------------------------------------ |
| [Implement Epic Detail Page](./implement-epic-detail-page.md)                   | Build epic detail page with breadcrumb, status badges, progress cards, dependencies, and stories table | Complete | frontend-developer  | None                                                         |
| [Implement Create Edit Epic Modal](./implement-create-edit-epic-modal.md)       | Build create/edit epic modal with title, Markdown description, and project context                     | Complete | fullstack-developer | Implement Epic Detail Page                                   |
| [Implement Epic Publish Delete Flows](./implement-epic-publish-delete-flows.md) | Build publish (Draft to Ready) and delete flows with validation and confirmation guards                | Complete | fullstack-developer | Implement Epic Detail Page, Implement Create Edit Epic Modal |

## Dependency Graph

```
Implement Epic Detail Page ---+--> Implement Create Edit Epic Modal ---+
                              |                                        |
                              +----------------------------------------+--> Implement Epic Publish Delete Flows
```

## Suggested Implementation Order

1. **Phase 1:** Implement Epic Detail Page — the primary view for epic management
2. **Phase 2:** Implement Create Edit Epic Modal — requires detail page for context
3. **Phase 3:** Implement Epic Publish Delete Flows — requires both detail page and modal for the complete lifecycle
