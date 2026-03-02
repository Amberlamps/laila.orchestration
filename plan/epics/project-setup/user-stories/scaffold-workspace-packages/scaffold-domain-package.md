# Scaffold Domain Package

## Task Details

- **Title:** Scaffold Domain Package
- **Status:** Complete
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Scaffold Workspace Packages](./tasks.md)
- **Parent Epic:** [Project Setup & Monorepo Scaffold](../../user-stories.md)
- **Dependencies:** None (within this user story)

## Description

Create the `packages/domain` workspace package that contains the core business logic for the orchestration service. This package encapsulates orchestration workflows, DAG (Directed Acyclic Graph) operations, status management, and validation rules — all independent of any specific framework or infrastructure.

The domain package follows a clean architecture principle: it depends only on `@laila/shared` for types and schemas, and never on framework-specific code (no Next.js, no HTTP, no database drivers). This ensures business logic is testable in isolation and portable across different execution contexts (API routes, Lambda functions, background jobs).

Directory structure:

- `src/orchestration/` — Work assignment logic, project lifecycle management
- `src/dag/` — DAG construction, topological sort, cycle detection, dependency resolution
- `src/status/` — Status transition state machines, derived status computation
- `src/validation/` — Business rule validation (e.g., can a task be assigned, is a dependency valid)

## Acceptance Criteria

- [ ] `packages/domain/package.json` exists with name `@laila/domain` and `@laila/shared` as a workspace dependency
- [ ] `packages/domain/tsconfig.json` extends `../../tsconfig.base.json` with package-specific settings
- [ ] Directory structure exists: `src/orchestration/`, `src/dag/`, `src/status/`, `src/validation/`
- [ ] `src/index.ts` barrel export file exists with placeholder exports
- [ ] `src/orchestration/index.ts` exists with a placeholder module comment describing its purpose
- [ ] `src/dag/index.ts` exists with a placeholder module comment describing its purpose
- [ ] `src/status/index.ts` exists with a placeholder module comment describing its purpose
- [ ] `src/validation/index.ts` exists with a placeholder module comment describing its purpose
- [ ] Package compiles with `tsc --noEmit` without errors
- [ ] Package is importable from other workspace packages using `@laila/domain`
- [ ] Package has zero framework-specific dependencies (no next, no express, no aws-sdk)

## Technical Notes

- The domain package is the heart of the system — invest in clean interfaces and thorough documentation of each module's responsibility
- `src/dag/` will implement graph algorithms for task dependency resolution; consider defining clear interfaces for the graph data structure early
- `src/status/` will contain finite state machines for project lifecycle and work status transitions; placeholder should hint at the state machine pattern
- `src/orchestration/` will implement the work assignment algorithm that selects the next available task for a worker, respecting dependencies, priorities, and worker capabilities
- This package should have no side effects — all functions should be pure or accept dependencies via injection
- Consider defining interfaces (TypeScript abstract contracts) that the repository layer will implement, enabling the domain to specify what data access it needs without depending on Drizzle

## References

- **Functional Requirements:** Orchestration logic, DAG management, status transitions
- **Design Specification:** Domain-driven design, clean architecture separation
- **Project Setup:** Domain package scaffold

## Estimated Complexity

Small — Scaffold is straightforward (directory creation and config). The actual business logic is implemented in later epics.
