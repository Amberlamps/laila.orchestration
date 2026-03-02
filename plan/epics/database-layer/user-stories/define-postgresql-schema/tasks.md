# Define PostgreSQL Schema — Tasks

## User Story Summary

- **Title:** Define PostgreSQL Schema
- **Description:** Define all Drizzle ORM table schemas for the application: authentication, projects, epics, user stories, tasks, dependency edges, workers, personas, and attempt history.
- **Status:** Complete
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Total Tasks:** 8
- **Dependencies:** Configure Drizzle ORM with Neon

## Tasks

| Task                                                                  | Description                                                                    | Status   | Assigned Agent         | Dependencies                                                                                                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Create Auth Tables](./create-auth-tables.md)                         | Define Better Auth tables (users, sessions, accounts) with tenant_id pattern   | Complete | database-administrator | None                                                                                                                                                                                     |
| [Create Project and Epic Tables](./create-project-and-epic-tables.md) | Define projects and epics tables with lifecycle state, versioning, soft-delete | Complete | database-administrator | Create Auth Tables                                                                                                                                                                       |
| [Create Story and Task Tables](./create-story-and-task-tables.md)     | Define user_stories and tasks tables with assignment and dependency fields     | Complete | database-administrator | Create Auth Tables                                                                                                                                                                       |
| [Create Dependency Edge Table](./create-dependency-edge-table.md)     | Define task_dependency_edges table for the DAG with indexes                    | Complete | database-administrator | Create Auth Tables                                                                                                                                                                       |
| [Create Worker Tables](./create-worker-tables.md)                     | Define workers and worker_project_access tables with hashed API key            | Complete | database-administrator | Create Auth Tables                                                                                                                                                                       |
| [Create Persona Table](./create-persona-table.md)                     | Define personas table with tenant scoping                                      | Complete | database-administrator | Create Auth Tables                                                                                                                                                                       |
| [Create Attempt History Table](./create-attempt-history-table.md)     | Define attempt_history table for tracking worker assignments                   | Complete | database-administrator | Create Auth Tables                                                                                                                                                                       |
| [Generate Initial Migration](./generate-initial-migration.md)         | Generate and verify the initial SQL migration from the complete schema         | Complete | database-administrator | Create Auth Tables, Create Project and Epic Tables, Create Story and Task Tables, Create Dependency Edge Table, Create Worker Tables, Create Persona Table, Create Attempt History Table |

## Dependency Graph

```
Create Auth Tables
    |
    +---> Create Project and Epic Tables ------+
    |                                           |
    +---> Create Story and Task Tables --------+
    |                                           |
    +---> Create Dependency Edge Table --------+
    |                                           |
    +---> Create Worker Tables ----------------+--> Generate Initial Migration
    |                                           |
    +---> Create Persona Table ----------------+
    |                                           |
    +---> Create Attempt History Table --------+
```

## Suggested Implementation Order

1. **Phase 1:** Create Auth Tables — all other tables reference the users table via tenant_id
2. **Phase 2 (parallel):** Create Project and Epic Tables + Create Story and Task Tables + Create Dependency Edge Table + Create Worker Tables + Create Persona Table + Create Attempt History Table
3. **Phase 3:** Generate Initial Migration — requires all table definitions to be complete
