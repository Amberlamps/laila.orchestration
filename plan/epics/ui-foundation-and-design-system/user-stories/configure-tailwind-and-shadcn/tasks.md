# Configure Tailwind CSS & shadcn/ui — Tasks

## User Story Summary

- **Title:** Configure Tailwind CSS & shadcn/ui
- **Description:** Configure Tailwind CSS v4 with a tokenized design theme matching the full design specification, install and customize shadcn/ui base components, set up Inter and JetBrains Mono fonts via next/font/google, and configure TanStack Query v5 provider with appropriate defaults.
- **Status:** Not Started
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Total Tasks:** 4
- **Dependencies:** None

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Configure Tailwind Design Tokens](./configure-tailwind-design-tokens.md) | Configure Tailwind CSS v4 with tokenized theme: color palette, spacing scale, typography, shadows, border radii, and CSS custom properties | Not Started | ui-designer | None |
| [Install and Customize shadcn Components](./install-and-customize-shadcn-components.md) | Install shadcn/ui base components and customize to match design spec colors and radii | Not Started | ui-designer | Configure Tailwind Design Tokens |
| [Configure Fonts and Typography](./configure-fonts-and-typography.md) | Set up Inter and JetBrains Mono via next/font/google with type scale as Tailwind utilities | Not Started | ui-designer | Configure Tailwind Design Tokens |
| [Set Up TanStack Query Provider](./setup-tanstack-query-provider.md) | Configure TanStack Query v5 provider in _app.tsx with default options for polling and refetch | Not Started | fullstack-developer | None |

## Dependency Graph

```
Configure Tailwind Design Tokens ---+--> Install and Customize shadcn Components
                                    |
                                    +--> Configure Fonts and Typography

Set Up TanStack Query Provider (independent)
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** Configure Tailwind Design Tokens + Set Up TanStack Query Provider — these are independent foundations
2. **Phase 2 (parallel):** Install and Customize shadcn Components + Configure Fonts and Typography — both depend on design tokens being in place
