# Database Layer — User Stories

## Epic Summary

- **Title:** Database Layer
- **Description:** Configure Drizzle ORM with Neon, define PostgreSQL schema, implement repository layer, set up DynamoDB access.
- **Status:** Complete
- **Total User Stories:** 5
- **Dependencies:** Epic 2 (Shared Packages & API Contracts)

## User Stories

| User Story                                                                            | Description                                                                                                               | Status   | Tasks   | Dependencies                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | ------------------------------- |
| [Configure Drizzle ORM with Neon](./user-stories/configure-drizzle-and-neon/tasks.md) | Set up Neon serverless driver, Drizzle Kit migrations, and database client factory                                        | Complete | 3 tasks | None                            |
| [Define PostgreSQL Schema](./user-stories/define-postgresql-schema/tasks.md)          | Define all Drizzle table schemas: auth, projects, epics, stories, tasks, dependencies, workers, personas, attempt history | Complete | 8 tasks | Configure Drizzle ORM with Neon |
| [Implement Repository Layer](./user-stories/implement-repository-layer/tasks.md)      | Create base repository and entity-specific repositories with tenant scoping                                               | Complete | 8 tasks | Define PostgreSQL Schema        |
| [Set Up DynamoDB Access Layer](./user-stories/setup-dynamodb-access-layer/tasks.md)   | Define DynamoDB audit table schema and implement read/write operations                                                    | Complete | 3 tasks | None                            |
| [Create Seed Scripts](./user-stories/create-seed-scripts/tasks.md)                    | Create development and testing seed profiles with realistic sample data                                                   | Complete | 2 tasks | Implement Repository Layer      |

## Dependency Graph

```
Configure Drizzle ORM with Neon
    |
    v
Define PostgreSQL Schema
    |
    v
Implement Repository Layer -------> Create Seed Scripts
                                       ^
Set Up DynamoDB Access Layer           |
    (independent)                      |
                                       +--- (depends on repositories being complete)
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** Configure Drizzle ORM with Neon + Set Up DynamoDB Access Layer — independent of each other
2. **Phase 2:** Define PostgreSQL Schema — requires Drizzle configuration
3. **Phase 3:** Implement Repository Layer — requires schema definitions
4. **Phase 4:** Create Seed Scripts — requires repositories to be functional
