# Epics Overview

## Summary

This breakdown covers **16 epics** spanning the full implementation of **laila.works** — an AI Agent Orchestration Service. The system enables human users to plan hierarchical projects (projects → epics → user stories → tasks) with a project-wide DAG dependency graph, and coordinate fleets of AI execution agents that pull work via REST API.

The architecture is a TypeScript monorepo (pnpm workspaces) with Next.js 14 (Pages Router), Drizzle ORM on PostgreSQL (Neon), DynamoDB for audit logs, and AWS serverless deployment via Terraform/OpenNext.

**Total:** 16 epics, ~61 user stories, ~230 tasks.

## Epics

| Epic                                                                                                 | Description                                                                                                                                | Status                      | User Stories | Dependencies               |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ------------ | -------------------------- |
| [1. Project Setup & Monorepo Scaffold](./epics/project-setup/user-stories.md)                        | Initialize pnpm monorepo, TypeScript config, linting, formatting, CI pipeline, and dev environment                                         | Complete                    | 4 stories    | None                       |
| [2. Shared Packages & API Contracts](./epics/shared-packages-and-api-contracts/user-stories.md)      | Implement @laila/shared Zod schemas, types, constants, and contract-first OpenAPI specification                                            | Complete                    | 2 stories    | Epic 1                     |
| [3. Database Layer](./epics/database-layer/user-stories.md)                                          | Configure Drizzle ORM with Neon, define PostgreSQL schema, implement repository layer, set up DynamoDB access                              | Complete                    | 5 stories    | Epic 2                     |
| [4. Authentication & Authorization](./epics/authentication-and-authorization/user-stories.md)        | Better Auth with Google OAuth, API key authentication, auth middleware, protected routes                                                   | Complete                    | 3 stories    | Epic 3                     |
| [5. Domain Logic Engine](./epics/domain-logic-engine/user-stories.md)                                | Pure domain logic: DAG operations, status transition engine, work assignment engine (no DB dependency)                                     | Complete                    | 3 stories    | Epic 2                     |
| [6. Core CRUD API](./epics/core-crud-api/user-stories.md)                                            | REST API endpoints for all entities with validation, error handling, and integration tests                                                 | Complete                    | 8 stories    | Epics 3, 4, 5              |
| [7. Orchestration & Work Assignment API](./epics/orchestration-and-work-assignment/user-stories.md)  | Work assignment endpoint, task/story completion, timeout/reclamation logic, manual unassignment                                            | Complete                    | 3 stories    | Epics 5, 6                 |
| [8. UI Foundation & Design System](./epics/ui-foundation-and-design-system/user-stories.md)          | Next.js app shell, Tailwind design tokens, shadcn/ui components, navigation, auth UI, API client setup                                     | Complete                    | 6 stories    | Epics 1, 4                 |
| [9. Entity Management UI](./epics/entity-management-ui/user-stories.md)                              | CRUD pages/modals for projects, epics, stories, tasks, workers, and personas                                                               | Complete                    | 6 stories    | Epics 6, 8                 |
| [10. Dashboard & Monitoring UI](./epics/dashboard-and-monitoring-ui/user-stories.md)                 | Global dashboard, project overview tab, charts, KPI widgets, auto-refresh polling                                                          | Complete                    | 3 stories    | Epics 8, 9                 |
| [11. Dependency Graph Visualization](./epics/dependency-graph-visualization/user-stories.md)         | ReactFlow interactive DAG with Dagre layout, custom nodes, filtering, Web Worker performance                                               | Complete                    | 3 stories    | Epics 6, 8                 |
| [12. Audit Log & Activity Feed](./epics/audit-log-and-activity-feed/user-stories.md)                 | DynamoDB audit event writing, cross-project audit log page, project activity tab, export                                                   | In Progress (laila-agent-2) | 2 stories    | Epics 6, 8                 |
| [13. Background Jobs & Scheduled Tasks](./epics/background-jobs-and-scheduled-tasks/user-stories.md) | Lambda functions for timeout checking, DAG reconciliation, audit archival, SQS status propagation                                          | Not Started                 | 4 stories    | Epic 7                     |
| [14. AWS Infrastructure & Deployment](./epics/aws-infrastructure-and-deployment/user-stories.md)     | Terraform modules, production environment, OpenNext deployment, observability, CI/CD deploy pipeline                                       | Not Started                 | 4 stories    | Epics 3, 7, 13             |
| [15. End-to-End Testing](./epics/end-to-end-testing/user-stories.md)                                 | Playwright E2E tests for all critical user journeys: auth, plan creation, work execution, entity management, DAG graph, responsive layouts | Not Started                 | 6 stories    | Epics 7, 9, 10, 11, 12, 13 |
| [16. Documentation & Validation](./epics/documentation-and-validation/user-stories.md)               | Comprehensive README.md generation and validation of all documented instructions                                                           | Not Started                 | 2 stories    | All epics (1–15)           |

## Dependency Graph

```
Epic 1 (Project Setup)
  │
  ├──► Epic 2 (Shared Packages & API Contracts)
  │      │
  │      ├──► Epic 3 (Database Layer)
  │      │      │
  │      │      ├──► Epic 4 (Authentication)
  │      │      │      │
  │      │      │      ├──► Epic 6 (Core CRUD API) ◄── Epic 5
  │      │      │      │      │
  │      │      │      │      ├──► Epic 7 (Orchestration API) ◄── Epic 5
  │      │      │      │      │      │
  │      │      │      │      │      ├──► Epic 13 (Background Jobs)
  │      │      │      │      │      │
  │      │      │      │      │      └──► Epic 14 (AWS Infra) ◄── Epic 3, Epic 13
  │      │      │      │      │
  │      │      │      │      ├──► Epic 9 (Entity Mgmt UI) ◄── Epic 8
  │      │      │      │      │      │
  │      │      │      │      │      └──► Epic 10 (Dashboard UI) ◄── Epic 8
  │      │      │      │      │
  │      │      │      │      ├──► Epic 11 (Graph Viz) ◄── Epic 8
  │      │      │      │      │
  │      │      │      │      └──► Epic 12 (Audit Log) ◄── Epic 8
  │      │      │      │
  │      │      │      └──► Epic 8 (UI Foundation) ◄── Epic 1
  │      │      │
  │      │      └──► Epic 14 (AWS Infra)
  │      │
  │      └──► Epic 5 (Domain Logic Engine)
  │
  └──► Epic 8 (UI Foundation)

All Epics (1–15) ──► Epic 16 (Documentation & Validation)
```

## Suggested Implementation Order

1. **Phase 1 (No Dependencies):** Epic 1 (Project Setup)
2. **Phase 2 (Depends on Phase 1):** Epic 2 (Shared Packages) — sequential, foundational
3. **Phase 3 (Depends on Phase 2):** Epic 3 (Database Layer), Epic 5 (Domain Logic Engine) — can be developed in parallel
4. **Phase 4 (Depends on Phase 3):** Epic 4 (Authentication) — depends on Epic 3
5. **Phase 5 (Depends on Phase 4):** Epic 6 (Core CRUD API), Epic 8 (UI Foundation) — can be developed in parallel
6. **Phase 6 (Depends on Phase 5):** Epic 7 (Orchestration API), Epic 9 (Entity Mgmt UI), Epic 11 (Graph Viz), Epic 12 (Audit Log) — can be developed in parallel
7. **Phase 7 (Depends on Phase 6):** Epic 10 (Dashboard UI), Epic 13 (Background Jobs) — can be developed in parallel
8. **Phase 8 (Depends on Phase 7):** Epic 14 (AWS Infrastructure & Deployment)
9. **Phase 9 (Depends on Phase 8):** Epic 15 (End-to-End Testing) — requires full system functional for E2E validation
10. **Phase 10 (Depends on all):** Epic 16 (Documentation & Validation)

## Notes

- **Safety-critical:** The orchestration engine (Epics 5, 7, 13) and DAG operations are safety-critical. These require exhaustive testing including property-based tests with fast-check.
- **Parallel tracks:** After Phase 2, the backend (Epics 3→4→6→7) and domain logic (Epic 5) can proceed in parallel. After Phase 5, the UI track (Epics 8→9→10→11→12) and API track (Epic 7) can proceed in parallel.
- **Testing strategy:** Unit and integration tests are embedded within each epic's tasks. Epic 15 (End-to-End Testing) covers Playwright-based E2E tests for all critical user journeys across the full system. 90% coverage is enforced in CI.
- **E2E testing scope (per project setup spec G.4):** Google OAuth sign-in, plan creation & publish, work assignment & status progression, worker creation & API key reveal, failure recovery, DAG graph interaction, destructive action confirmations, and responsive layout verification. Multi-browser (Chromium, Firefox, WebKit), page object models, MSW for API mocking.
- **Infrastructure can start early:** While Epic 14 formally depends on backend epics, basic Terraform module scaffolding can begin alongside Phase 3.
