# Scaffold Workspace Packages — Tasks

## User Story Summary

- **Title:** Scaffold Workspace Packages
- **Description:** Create all workspace packages including the Next.js web app, shared library, domain logic, database layer, API spec, and Lambda function stubs.
- **Status:** Complete
- **Parent Epic:** [Project Setup & Monorepo Scaffold](../../user-stories.md)
- **Total Tasks:** 6
- **Dependencies:** Initialize pnpm Monorepo Workspace

## Tasks

| Task                                                        | Description                                                                    | Status   | Assigned Agent      | Dependencies |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ | -------- | ------------------- | ------------ |
| [Scaffold Next.js Web App](./scaffold-nextjs-web-app.md)    | Create apps/web with Next.js 14 Pages Router, Tailwind CSS v4, shadcn/ui       | Complete | fullstack-developer | None         |
| [Scaffold Shared Package](./scaffold-shared-package.md)     | Create packages/shared with schemas, types, constants, utils directories       | Complete | fullstack-developer | None         |
| [Scaffold Domain Package](./scaffold-domain-package.md)     | Create packages/domain with orchestration, DAG, status, validation directories | Complete | fullstack-developer | None         |
| [Scaffold Database Package](./scaffold-database-package.md) | Create packages/database with schema, repositories, DynamoDB, Drizzle config   | Complete | backend-developer   | None         |
| [Scaffold API Spec Package](./scaffold-api-spec-package.md) | Create packages/api-spec with OpenAPI placeholder, generated types, scripts    | Complete | api-designer        | None         |
| [Scaffold Lambda Functions](./scaffold-lambda-functions.md) | Create function stubs for timeout-checker, dag-reconciler, audit-archiver      | Complete | backend-developer   | None         |

## Dependency Graph

```
(All tasks can run in parallel — no inter-task dependencies)

Scaffold Next.js Web App       (apps/web)
Scaffold Shared Package        (packages/shared)
Scaffold Domain Package        (packages/domain)
Scaffold Database Package      (packages/database)
Scaffold API Spec Package      (packages/api-spec)
Scaffold Lambda Functions      (functions/*)
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** All 6 tasks can be executed simultaneously since they create independent workspace packages with no cross-dependencies at the scaffold level. Each package only depends on the root workspace configuration established in the previous user story.
