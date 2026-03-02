# Scaffold Next.js Web App

## Task Details

- **Title:** Scaffold Next.js Web App
- **Status:** Complete
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Scaffold Workspace Packages](./tasks.md)
- **Parent Epic:** [Project Setup & Monorepo Scaffold](../../user-stories.md)
- **Dependencies:** None (within this user story)

## Description

Create the `apps/web` workspace package containing a Next.js 14 application using the Pages Router. This is the primary web application for the AI Agent Orchestration Service, providing the human-facing dashboard for project management, work orchestration, and monitoring.

The scaffold should include:

- Next.js 14 with Pages Router (not App Router) configuration
- Tailwind CSS v4 setup with the project's design tokens
- shadcn/ui initialization for the component library
- A `tsconfig.json` extending the root `tsconfig.base.json`
- A basic `pages/index.tsx` and `pages/_app.tsx` as starting points
- `next.config.mjs` configured for the monorepo (transpilePackages for workspace dependencies)

## Acceptance Criteria

- [ ] `apps/web/package.json` exists with name `@laila/web` and required dependencies (next, react, react-dom)
- [ ] `apps/web/tsconfig.json` extends `../../tsconfig.base.json` with Next.js-specific overrides
- [ ] `apps/web/next.config.mjs` exists with `transpilePackages` for `@laila/shared`, `@laila/domain`, `@laila/database`
- [ ] Tailwind CSS v4 is configured with `apps/web/tailwind.config.ts` and content paths covering workspace packages
- [ ] `apps/web/postcss.config.mjs` is set up for Tailwind CSS processing
- [ ] shadcn/ui is initialized with `components.json` and the `components/ui/` directory structure
- [ ] `apps/web/src/pages/_app.tsx` exists with global styles import and basic layout wrapper
- [ ] `apps/web/src/pages/index.tsx` exists with a placeholder landing page
- [ ] `apps/web/src/styles/globals.css` exists with Tailwind directives (`@tailwind base`, `@tailwind components`, `@tailwind utilities`)
- [ ] `pnpm --filter @laila/web dev` starts the development server without errors
- [ ] `pnpm --filter @laila/web build` completes without type errors

## Technical Notes

- Use Next.js 14 Pages Router explicitly — the project specification requires Pages Router, not App Router
- Configure `next.config.mjs` with `transpilePackages` to handle workspace package imports (since they use TypeScript source directly)
- For Tailwind CSS v4, note that the configuration approach may differ from v3 — verify the latest v4 setup pattern (CSS-based config vs. JS config)
- shadcn/ui components should be installed into `apps/web/src/components/ui/` with the CLI
- Set `reactStrictMode: true` in Next.js config
- The `src/` directory layout is preferred over root-level `pages/` for better organization
- Add `@laila/shared`, `@laila/domain` as workspace dependencies using `"workspace:*"` protocol

## References

- **Functional Requirements:** Web dashboard for project and orchestration management
- **Design Specification:** Next.js 14 Pages Router, Tailwind CSS v4, shadcn/ui
- **Project Setup:** Web application scaffold

## Estimated Complexity

Medium — Next.js scaffold is straightforward, but integrating Tailwind CSS v4 (which has significant API changes from v3), shadcn/ui, and monorepo transpilation requires careful configuration alignment.
