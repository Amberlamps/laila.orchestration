# Scaffold Shared Package

## Task Details

- **Title:** Scaffold Shared Package
- **Status:** Not Started
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Scaffold Workspace Packages](./tasks.md)
- **Parent Epic:** [Project Setup & Monorepo Scaffold](../../user-stories.md)
- **Dependencies:** None (within this user story)

## Description

Create the `packages/shared` workspace package that serves as the central location for shared Zod schemas, TypeScript types, constants, and utility functions used across all other packages and applications in the monorepo.

This package is the most widely depended-upon package in the workspace. It contains:
- `src/schemas/` — Zod validation schemas for all domain entities and API contracts
- `src/types/` — Inferred TypeScript types from Zod schemas and additional utility types
- `src/constants/` — Status enums, error codes, API key prefixes, and other constants
- `src/utils/` — Pure utility functions (pagination helpers, error formatting, ID generation)

The package should export everything through a clean barrel export structure with distinct entry points for tree-shaking.

## Acceptance Criteria

- [ ] `packages/shared/package.json` exists with name `@laila/shared` and `zod` as a dependency
- [ ] `packages/shared/tsconfig.json` extends `../../tsconfig.base.json` with package-specific settings
- [ ] Directory structure exists: `src/schemas/`, `src/types/`, `src/constants/`, `src/utils/`
- [ ] `src/index.ts` barrel export file exists with placeholder exports
- [ ] `src/schemas/index.ts` exists with placeholder module comment
- [ ] `src/types/index.ts` exists with placeholder module comment
- [ ] `src/constants/index.ts` exists with placeholder module comment
- [ ] `src/utils/index.ts` exists with placeholder module comment
- [ ] Package compiles with `tsc --noEmit` without errors
- [ ] Package is importable from other workspace packages using `@laila/shared`

## Technical Notes

- Zod is the single validation library — all runtime validation and type inference flows through Zod schemas
- Use `z.infer<typeof schema>` pattern to derive TypeScript types from Zod schemas, ensuring runtime validation and static types are always in sync
- The package should not have any runtime dependencies on Node.js-specific APIs — it must be usable in both server and browser contexts
- Consider defining multiple entry points in `package.json` exports field for better tree-shaking:
  ```json
  {
    "exports": {
      ".": "./src/index.ts",
      "./schemas": "./src/schemas/index.ts",
      "./constants": "./src/constants/index.ts",
      "./types": "./src/types/index.ts",
      "./utils": "./src/utils/index.ts"
    }
  }
  ```
- Use TypeScript source directly (no build step) — workspace consumers use `transpilePackages` or similar to compile at their own build step

## References

- **Functional Requirements:** Shared validation schemas, type definitions, constants
- **Design Specification:** Zod-based schema validation, centralized type definitions
- **Project Setup:** Shared package scaffold

## Estimated Complexity

Small — Creating the directory structure and package configuration is straightforward. The actual schema/type content is implemented in Epic 2.
