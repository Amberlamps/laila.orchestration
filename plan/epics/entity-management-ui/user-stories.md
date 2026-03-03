# Entity Management UI — User Stories

## Epic Summary

- **Title:** Entity Management UI
- **Description:** CRUD pages, modals, and flows for managing all core entities: projects, epics, user stories, tasks, workers, and personas. Includes list pages, detail pages, create/edit modals, publish/delete lifecycle flows, and entity-specific features like task dependency picking and worker API key management.
- **Status:** In Progress (laila-agent-3)
- **Total User Stories:** 6
- **Dependencies:** Epic 6 (Core CRUD API), Epic 8 (UI Foundation & Design System)

## User Stories

| User Story                                                                                        | Description                                                                                             | Status                      | Tasks   | Dependencies                          |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------- | ------- | ------------------------------------- |
| [Implement Project Management Pages](./user-stories/implement-project-management-pages/tasks.md)  | Project list page, create modal, detail page with tabs, settings tab, and publish/delete flows          | Complete                    | 5 tasks | None                                  |
| [Implement Epic Management Pages](./user-stories/implement-epic-management-pages/tasks.md)        | Epic detail page, create/edit modal, and publish/delete lifecycle flows                                 | Complete                    | 3 tasks | Implement Project Management Pages    |
| [Implement User Story Management Pages](./user-stories/implement-story-management-pages/tasks.md) | Story detail page with tabs, tasks sub-tab, attempt history, create/edit modal, and action flows        | In Progress (laila-agent-3) | 5 tasks | Implement Epic Management Pages       |
| [Implement Task Management Pages](./user-stories/implement-task-management-pages/tasks.md)        | Task detail page, create/edit modal, and dependency picker component                                    | Not Started                 | 3 tasks | Implement User Story Management Pages |
| [Implement Worker Management Pages](./user-stories/implement-worker-management-pages/tasks.md)    | Worker list page, detail page, two-step create modal with API key reveal, and project access management | Not Started                 | 4 tasks | None                                  |
| [Implement Persona Management Pages](./user-stories/implement-persona-management-pages/tasks.md)  | Persona list page, create/edit modal, and detail page with active task assignments                      | Not Started                 | 3 tasks | None                                  |

## Dependency Graph

```
Implement Project Management Pages
    |
    v
Implement Epic Management Pages
    |
    v
Implement User Story Management Pages
    |
    v
Implement Task Management Pages

Implement Worker Management Pages (independent)

Implement Persona Management Pages (independent)
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** Implement Project Management Pages + Implement Worker Management Pages + Implement Persona Management Pages — Projects is the root entity and must be built first in the hierarchy; Workers and Personas are independent entity types that can be built in parallel
2. **Phase 2:** Implement Epic Management Pages — requires Project pages for navigation context and parent entity UI patterns
3. **Phase 3:** Implement User Story Management Pages — requires Epic pages for hierarchy and shares UI patterns
4. **Phase 4:** Implement Task Management Pages — the leaf entity in the hierarchy, requires Story pages for parent context and the dependency picker is unique to tasks
