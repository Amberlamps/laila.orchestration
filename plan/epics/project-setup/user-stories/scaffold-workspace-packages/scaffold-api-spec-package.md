# Scaffold API Spec Package

## Task Details

- **Title:** Scaffold API Spec Package
- **Status:** Not Started
- **Assigned Agent:** api-designer
- **Parent User Story:** [Scaffold Workspace Packages](./tasks.md)
- **Parent Epic:** [Project Setup & Monorepo Scaffold](../../user-stories.md)
- **Dependencies:** None (within this user story)

## Description

Create the `packages/api-spec` workspace package that holds the OpenAPI 3.1 specification and tooling for generating TypeScript types from the spec. This package is the single source of truth for the REST API contract — both the server-side route handlers and client-side API consumers derive their types from this specification.

The contract-first approach means the OpenAPI spec is written first, then TypeScript types are generated from it. This ensures the API documentation, server implementation, and client SDK always stay in sync.

Directory structure:
- `openapi.yaml` — The OpenAPI 3.1 specification document
- `generated/` — Auto-generated TypeScript types from the spec
- `scripts/` — Scripts for type generation, validation, and freshness checks
- `.spectral.yaml` — Spectral linting rules for the OpenAPI spec

## Acceptance Criteria

- [ ] `packages/api-spec/package.json` exists with name `@laila/api-spec`
- [ ] Dev dependencies include `openapi-typescript`, `@stoplight/spectral-cli`
- [ ] `packages/api-spec/tsconfig.json` extends `../../tsconfig.base.json`
- [ ] `openapi.yaml` exists with a valid OpenAPI 3.1 skeleton (info, paths placeholder, components placeholder)
- [ ] `generated/` directory exists with `.gitkeep` (generated files are committed for CI validation)
- [ ] `scripts/` directory exists with placeholder `generate.ts` script
- [ ] `.spectral.yaml` exists with a placeholder ruleset configuration
- [ ] `package.json` scripts include `generate` (run type generation), `lint:spec` (Spectral linting), `check:freshness` (verify generated types are up-to-date)
- [ ] `src/index.ts` barrel export exists that re-exports from `generated/`
- [ ] Package is importable from other workspace packages using `@laila/api-spec`

## Technical Notes

- `openapi-typescript` generates TypeScript types from OpenAPI 3.1 specs — these are pure type definitions with zero runtime overhead
- The generated types integrate with `openapi-fetch` for a fully type-safe API client
- The OpenAPI skeleton should include:
  ```yaml
  # openapi.yaml
  # Contract-first API specification for the laila.works Orchestration Service
  # All REST endpoints are defined here before implementation
  openapi: '3.1.0'
  info:
    title: laila.works Orchestration Service API
    version: 0.1.0
  paths: {}
  components:
    schemas: {}
    securitySchemes: {}
  ```
- Spectral linting enforces API design standards (consistent naming, required error responses, pagination patterns)
- The freshness check script should compare the hash of the generated output with the committed version to detect drift
- Consider using `openapi-typescript` CLI in the generate script: `npx openapi-typescript openapi.yaml -o generated/api.ts`

## References

- **Functional Requirements:** Contract-first REST API design
- **Design Specification:** OpenAPI 3.1, openapi-typescript, Spectral
- **Project Setup:** API specification package scaffold

## Estimated Complexity

Small — Creating the scaffold with placeholder files. The actual OpenAPI specification content is implemented in Epic 2.
