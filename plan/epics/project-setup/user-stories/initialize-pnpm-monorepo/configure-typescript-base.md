# Configure TypeScript Base

## Task Details

- **Title:** Configure TypeScript Base
- **Status:** Not Started
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Initialize pnpm Monorepo Workspace](./tasks.md)
- **Parent Epic:** [Project Setup & Monorepo Scaffold](../../user-stories.md)
- **Dependencies:** Create Root Workspace Configuration

## Description

Create a `tsconfig.base.json` at the monorepo root that serves as the shared TypeScript configuration extended by all workspace packages. This base config should enforce strict type-checking to catch errors early and establish consistent compiler options across the entire codebase.

The configuration must enable TypeScript's strictest settings including `strict: true`, `noUncheckedIndexedAccess` (prevents unsafe property access on index signatures), and `exactOptionalPropertyTypes` (distinguishes between `undefined` and missing properties). These settings align with the project's goal of maximum type safety.

Each workspace package will create its own `tsconfig.json` that extends this base config using relative path references, overriding only package-specific settings like `include`, `outDir`, and path aliases.

## Acceptance Criteria

- [ ] `tsconfig.base.json` exists at the monorepo root
- [ ] `strict: true` is enabled (encompasses strictNullChecks, strictFunctionTypes, strictBindCallApply, strictPropertyInitialization, noImplicitAny, noImplicitThis, alwaysStrict)
- [ ] `noUncheckedIndexedAccess: true` is set
- [ ] `exactOptionalPropertyTypes: true` is set
- [ ] `noUnusedLocals: true` and `noUnusedParameters: true` are set
- [ ] `noFallthroughCasesInSwitch: true` is set
- [ ] `forceConsistentCasingInFileNames: true` is set
- [ ] `moduleResolution: "bundler"` is set (compatible with Next.js 14 and modern bundlers)
- [ ] `module: "ESNext"` and `target: "ES2022"` are set
- [ ] `resolveJsonModule: true` and `isolatedModules: true` are enabled
- [ ] `declaration: true` and `declarationMap: true` are set for library packages
- [ ] `skipLibCheck: true` is set for build performance
- [ ] `jsx: "preserve"` is set (Next.js handles JSX transformation)
- [ ] Path aliases are defined for workspace packages (e.g., `@laila/shared`, `@laila/domain`, `@laila/database`)
- [ ] `lib` includes `["ES2022", "DOM", "DOM.Iterable"]`

## Technical Notes

- Use `moduleResolution: "bundler"` rather than `"node16"` — this aligns with Next.js 14's expected resolution strategy and avoids issues with `.js` extension requirements
- The `isolatedModules: true` setting is required for compatibility with tools like esbuild, SWC, and Vitest that perform single-file transpilation
- Path aliases defined here should match the workspace package names in `pnpm-workspace.yaml` for consistency
- Consider adding `"composite": false` explicitly at the base level, letting individual packages opt into project references if needed
- `verbatimModuleSyntax: true` can be considered as an alternative to `isolatedModules` for stricter ESM/CJS interop, but may conflict with some tooling

## References

- **Functional Requirements:** TypeScript strict mode, type-safe codebase
- **Design Specification:** TypeScript compiler configuration
- **Project Setup:** Monorepo TypeScript configuration strategy

## Estimated Complexity

Small — Well-defined configuration with clear requirements. The main consideration is ensuring compatibility between strict settings, Next.js, and the various build tools in the stack.
