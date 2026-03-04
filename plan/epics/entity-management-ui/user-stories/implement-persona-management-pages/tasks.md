# Implement Persona Management Pages — Tasks

## User Story Summary

- **Title:** Implement Persona Management Pages
- **Description:** Build persona list page with usage counts, create/edit persona modal with Markdown editor, and persona detail page with active task assignments list and deletion guards.
- **Status:** Complete
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Total Tasks:** 3
- **Dependencies:** None

## Tasks

| Task                                                                            | Description                                                                                       | Status   | Assigned Agent      | Dependencies                |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------- | ------------------- | --------------------------- |
| [Implement Persona List Page](./implement-persona-list-page.md)                 | Build persona list page with card grid/table showing title, description preview, and usage count  | Complete | frontend-developer  | None                        |
| [Implement Create Edit Persona Modal](./implement-create-edit-persona-modal.md) | Build create/edit persona modal with title input and Markdown description editor                  | Complete | fullstack-developer | Implement Persona List Page |
| [Implement Persona Detail Page](./implement-persona-detail-page.md)             | Build persona detail page with rendered description, active task assignments, and deletion guards | Complete | frontend-developer  | Implement Persona List Page |

## Dependency Graph

```
Implement Persona List Page ---+--> Implement Create Edit Persona Modal
                               |
                               +--> Implement Persona Detail Page
```

## Suggested Implementation Order

1. **Phase 1:** Implement Persona List Page — entry point for persona management
2. **Phase 2 (parallel):** Implement Create Edit Persona Modal + Implement Persona Detail Page — both branch from the list page
