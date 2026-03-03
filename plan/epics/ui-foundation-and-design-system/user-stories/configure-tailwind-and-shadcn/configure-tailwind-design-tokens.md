# Configure Tailwind Design Tokens

## Task Details

- **Title:** Configure Tailwind Design Tokens
- **Status:** Complete
- **Assigned Agent:** ui-designer
- **Parent User Story:** [Configure Tailwind CSS & shadcn/ui](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** None

## Description

Configure Tailwind CSS v4 with a comprehensive tokenized theme that matches the laila.works design specification. This task establishes the visual foundation for the entire application by defining the complete design token system.

The Tailwind configuration must be set up in the Next.js web app at `apps/web/tailwind.config.ts` (or via Tailwind v4's CSS-based configuration in `apps/web/src/app/globals.css`) and must include:

1. **Color Palette:**
   - **Primary:** Indigo scale (indigo-50 through indigo-950) with indigo-500 as the primary action color
   - **Neutrals:** Zinc scale (zinc-50 through zinc-950) for backgrounds, text, borders
   - **Semantic Colors:** Success (green), Error/Destructive (red), Warning (amber), Info (blue)
   - **Work Status Colors:** Draft (zinc-400), Not Started (gray-400), Ready (teal-500), Blocked (amber-500), In Progress (blue-500), Complete (green-500), Failed (red-500)
   - **Priority Colors:** High (red-500), Medium (amber-500), Low (green-500)

2. **Spacing Scale:** 4px base unit with consistent scale (0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 56, 64)

3. **Shadows:** Four elevation levels matching design spec (sm, md, lg, xl)

4. **Border Radii:** Consistent radius tokens (none, sm: 4px, md: 8px, lg: 12px, xl: 16px, full)

5. **CSS Custom Properties:** Export all tokens as CSS custom properties (e.g., `--color-primary`, `--color-status-draft`) for use in non-Tailwind contexts such as ReactFlow nodes and Recharts components.

```css
/* apps/web/src/app/globals.css */
/* Tailwind CSS v4 theme configuration using CSS-based approach. */
/* All design tokens are defined as CSS custom properties for universal access. */
@import 'tailwindcss';

@theme {
  /* Primary color scale — indigo is the brand color for interactive elements */
  --color-primary-50: #eef2ff;
  --color-primary-100: #e0e7ff;
  --color-primary-500: #6366f1;
  --color-primary-600: #4f46e5;
  --color-primary-700: #4338ca;

  /* Work status colors — each status has a dedicated semantic color */
  --color-status-draft: #a1a1aa; /* zinc-400 */
  --color-status-not-started: #9ca3af; /* gray-400 */
  --color-status-ready: #14b8a6; /* teal-500 */
  --color-status-blocked: #f59e0b; /* amber-500 */
  --color-status-in-progress: #3b82f6; /* blue-500 */
  --color-status-complete: #22c55e; /* green-500 */
  --color-status-failed: #ef4444; /* red-500 */

  /* Priority colors */
  --color-priority-high: #ef4444; /* red-500 */
  --color-priority-medium: #f59e0b; /* amber-500 */
  --color-priority-low: #22c55e; /* green-500 */

  /* Shadows — four elevation levels for depth hierarchy */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);

  /* Border radii */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
}
```

## Acceptance Criteria

- [ ] Tailwind CSS v4 is configured in the `apps/web` workspace with the full design token system
- [ ] Color palette includes indigo primary scale, zinc neutrals, and all semantic colors
- [ ] Work status colors are defined: Draft (zinc-400), Not Started (gray-400), Ready (teal-500), Blocked (amber-500), In Progress (blue-500), Complete (green-500), Failed (red-500)
- [ ] Priority colors are defined: High (red-500), Medium (amber-500), Low (green-500)
- [ ] Spacing scale uses 4px base unit
- [ ] Four shadow levels (sm, md, lg, xl) are configured
- [ ] Border radii tokens are defined (sm: 4px, md: 8px, lg: 12px, xl: 16px)
- [ ] All tokens are exported as CSS custom properties (e.g., `--color-status-draft`)
- [ ] CSS custom properties are accessible in non-Tailwind contexts (ReactFlow, Recharts)
- [ ] Light mode only — no dark mode configuration
- [ ] Tailwind configuration passes build without errors

## Technical Notes

- Tailwind CSS v4 uses a CSS-first configuration approach via `@theme` directive instead of the JavaScript-based `tailwind.config.ts` used in v3. Ensure the team is using the v4 approach.
- CSS custom properties provide a bridge between Tailwind's utility classes and imperative style APIs used by ReactFlow and Recharts. These libraries cannot consume Tailwind classes directly.
- The `@theme` block in Tailwind v4 defines tokens that generate both utility classes and CSS custom properties simultaneously.
- Ensure the color palette is comprehensive enough for all component states (hover, focus, active, disabled) without needing arbitrary values.
- WCAG 2.1 AA compliance requires minimum 4.5:1 contrast ratio for normal text and 3:1 for large text. Verify contrast ratios between text colors and background colors.

## References

- **Design Specification:** Section 2 (Design System), Section 2.1 (Color Palette), Section 2.2 (Spacing), Section 2.3 (Shadows)
- **Functional Requirements:** NFR-UI-001 (WCAG 2.1 AA compliance), NFR-UI-002 (Light mode only)
- **Tailwind CSS v4 Docs:** CSS-based theme configuration, `@theme` directive

## Estimated Complexity

Medium — Tailwind v4 configuration is straightforward, but defining a comprehensive token system that covers all design spec requirements (status colors, priority colors, semantic colors) and exporting CSS custom properties for non-Tailwind contexts requires careful attention to completeness and consistency.
