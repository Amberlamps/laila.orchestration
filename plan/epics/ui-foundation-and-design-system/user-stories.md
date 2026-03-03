# UI Foundation & Design System — User Stories

## Epic Summary

- **Title:** UI Foundation & Design System
- **Description:** Next.js app shell, Tailwind CSS v4 design tokens, shadcn/ui component library, sidebar and mobile navigation, authentication UI, error pages, and type-safe API client setup with TanStack Query integration.
- **Status:** In Progress (laila-agent-3)
- **Total User Stories:** 6
- **Dependencies:** Epic 1 (Project Setup), Epic 4 (Authentication & Authorization)

## User Stories

| User Story                                                                                          | Description                                                                                                                                                                 | Status      | Tasks   | Dependencies                                                                 |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------- | ---------------------------------------------------------------------------- |
| [Configure Tailwind CSS & shadcn/ui](./user-stories/configure-tailwind-and-shadcn/tasks.md)         | Configure Tailwind CSS v4 with tokenized design theme, install and customize shadcn/ui components, set up fonts and typography, and configure TanStack Query provider       | Complete    | 4 tasks | None                                                                         |
| [Implement Application Shell & Navigation](./user-stories/implement-application-shell/tasks.md)     | Build sidebar navigation, mobile bottom tab bar, breadcrumb component, and responsive page layout wrapper                                                                   | Complete    | 4 tasks | Configure Tailwind CSS & shadcn/ui                                           |
| [Implement Shared Domain UI Components](./user-stories/implement-shared-domain-components/tasks.md) | Build reusable domain components: StatusBadge, KPICard, MarkdownRenderer, MarkdownEditor, EntityTable, ConfirmDialog, Toast notifications, Skeleton loaders, and EmptyState | Complete    | 9 tasks | Configure Tailwind CSS & shadcn/ui                                           |
| [Implement Authentication UI](./user-stories/implement-authentication-ui/tasks.md)                  | Build sign-in page with Google OAuth, protected route wrapper with auth hook, and session handling with TanStack Query                                                      | Not Started | 3 tasks | Configure Tailwind CSS & shadcn/ui, Implement Application Shell & Navigation |
| [Implement Error Pages](./user-stories/implement-error-pages/tasks.md)                              | Create 404, 403, 500, and OAuth error pages with consistent design system styling                                                                                           | Not Started | 1 task  | Configure Tailwind CSS & shadcn/ui                                           |
| [Set Up API Client Layer](./user-stories/setup-api-client-layer/tasks.md)                           | Configure openapi-fetch client, create TanStack Query hooks factory, and implement query key factory for cache invalidation                                                 | Not Started | 3 tasks | Configure Tailwind CSS & shadcn/ui                                           |

## Dependency Graph

```
Configure Tailwind CSS & shadcn/ui
    |
    +---> Implement Application Shell & Navigation ---+
    |                                                 |
    +---> Implement Shared Domain Components          +--> Implement Authentication UI
    |                                                 |
    +---> Implement Error Pages                       |
    |                                                 |
    +---> Set Up API Client Layer                     |
    |                                                 |
    +-------------------------------------------------+
```

## Suggested Implementation Order

1. **Phase 1:** Configure Tailwind CSS & shadcn/ui — foundational design tokens, component library, fonts, and query provider that everything else depends on
2. **Phase 2 (parallel):** Implement Application Shell & Navigation + Implement Shared Domain Components + Implement Error Pages + Set Up API Client Layer — these can all be built in parallel once the design system foundation is in place
3. **Phase 3:** Implement Authentication UI — depends on the application shell for layout and navigation context
