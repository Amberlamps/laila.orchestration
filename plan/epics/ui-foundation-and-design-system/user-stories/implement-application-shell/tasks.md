# Implement Application Shell & Navigation — Tasks

## User Story Summary

- **Title:** Implement Application Shell & Navigation
- **Description:** Build the primary application shell including a collapsible sidebar navigation for desktop/tablet, a bottom tab bar for mobile, a breadcrumb component for page context, and a responsive page layout wrapper that ties everything together.
- **Status:** Not Started
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Total Tasks:** 4
- **Dependencies:** Configure Tailwind CSS & shadcn/ui

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Implement Sidebar Navigation](./implement-sidebar-navigation.md) | Build collapsible sidebar with logo, nav sections, active item styling, and user avatar | Not Started | frontend-developer | None |
| [Implement Mobile Bottom Tab Bar](./implement-mobile-bottom-tab-bar.md) | Build mobile bottom tab bar with 5 tabs visible on screens below 768px | Not Started | frontend-developer | None |
| [Implement Breadcrumb Component](./implement-breadcrumb-component.md) | Build breadcrumb navigation with truncation, clickable ancestors, and current page display | Not Started | frontend-developer | None |
| [Implement Page Layout Wrapper](./implement-page-layout-wrapper.md) | Create AppLayout component wrapping sidebar, mobile nav, and main content area with responsive grid | Not Started | frontend-developer | Implement Sidebar Navigation, Implement Mobile Bottom Tab Bar |

## Dependency Graph

```
Implement Sidebar Navigation ------+
                                   |
                                   +--> Implement Page Layout Wrapper
                                   |
Implement Mobile Bottom Tab Bar ---+

Implement Breadcrumb Component (independent, used within page content)
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** Implement Sidebar Navigation + Implement Mobile Bottom Tab Bar + Implement Breadcrumb Component — all three can be built independently
2. **Phase 2:** Implement Page Layout Wrapper — composes the sidebar and mobile nav into a unified responsive shell
