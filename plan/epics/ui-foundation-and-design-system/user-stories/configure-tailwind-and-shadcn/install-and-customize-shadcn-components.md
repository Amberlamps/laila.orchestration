# Install and Customize shadcn Components

## Task Details

- **Title:** Install and Customize shadcn Components
- **Status:** Complete
- **Assigned Agent:** ui-designer
- **Parent User Story:** [Configure Tailwind CSS & shadcn/ui](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** Configure Tailwind Design Tokens

## Description

Install the shadcn/ui component library and add all required base components into `apps/web/src/components/ui/`. Each component must be customized to match the laila.works design specification, including the indigo primary color, zinc neutrals, 8px card radius, and consistent focus ring styles.

### Components to Install and Customize

1. **Button** — 5 variants (default/primary with indigo-500 bg, secondary with zinc-100 bg, outline with zinc-200 border, ghost transparent, destructive with red-500 bg), 3 sizes (sm: 32px h, md: 36px h, lg: 40px h), all interactive states (hover, focus with indigo-500 focus ring, active, disabled with 50% opacity + cursor-not-allowed, loading with inline spinner).

2. **Input** — zinc-200 border, zinc-50 bg on focus, indigo-500 focus ring, error state with red-500 border + error message below, disabled state.

3. **Textarea** — Same styling as Input, min-height configurable.

4. **Select** — Custom dropdown with zinc-200 border, indigo-500 focus ring, chevron icon from Lucide.

5. **Checkbox** — Indigo-500 checked state, rounded-sm, focus ring.

6. **Radio** — Indigo-500 selected state, focus ring.

7. **Switch** — Indigo-500 active track, zinc-200 inactive track.

8. **Card** — 8px border radius (rounded-md), zinc-200 border, white bg, shadow-sm. Header/Content/Footer sections.

9. **Badge** — 4px radius, sm font size, multiple color variants matching status and priority palettes.

10. **Table** — Sticky header with FAFAFA bg, zinc-200 border-bottom, alternating row hover state.

11. **Dialog** — Backdrop blur-sm, centered modal, 8px radius, max-width variants (sm: 400px, md: 640px, lg: 800px), close button.

12. **Tabs** — Underline style, indigo-500 active tab indicator, zinc-500 inactive text.

13. **Tooltip** — Zinc-900 bg, white text, 4px radius, 8px padding, max-width 200px.

14. **Popover** — White bg, zinc-200 border, shadow-lg, 8px radius.

15. **DropdownMenu** — White bg, zinc-200 border, hover state indigo-50 bg, destructive items in red-500.

16. **Command** — For command palette / search interfaces.

```typescript
// apps/web/src/components/ui/button.tsx
// Button component with 5 variants (default, secondary, outline, ghost, destructive),
// 3 sizes (sm, md, lg), loading state with spinner, and full accessibility support.
// Uses class-variance-authority (cva) for variant composition.
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  // Base styles: inline-flex centering, focus ring, disabled state, transition
  'inline-flex items-center justify-center rounded-md text-sm font-medium ' +
    'ring-offset-white transition-colors focus-visible:outline-none ' +
    'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ' +
    'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-indigo-500 text-white hover:bg-indigo-600 active:bg-indigo-700',
        secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
        outline: 'border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700',
        ghost: 'hover:bg-zinc-100 text-zinc-700',
        destructive: 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4 text-sm',
        lg: 'h-10 px-6 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);
```

## Acceptance Criteria

- [ ] shadcn/ui CLI is initialized in the `apps/web` workspace with proper configuration
- [ ] All 16 components are installed into `apps/web/src/components/ui/`
- [ ] Button has 5 variants (default, secondary, outline, ghost, destructive) and 3 sizes (sm, md, lg)
- [ ] Button supports loading state with inline spinner replacing content
- [ ] All interactive components have indigo-500 focus rings (2px ring, 2px offset)
- [ ] Card component uses 8px border radius (rounded-md) and zinc-200 border
- [ ] Dialog component has backdrop blur and supports sm/md/lg max-width variants
- [ ] Badge component supports all status colors (Draft, Not Started, Ready, Blocked, In Progress, Complete, Failed)
- [ ] All components meet WCAG 2.1 AA contrast requirements
- [ ] All components have proper TypeScript types exported
- [ ] Components are tree-shakeable (individual imports, no barrel file that forces loading all)
- [ ] Disabled states consistently show 50% opacity and cursor-not-allowed
- [ ] All components pass build without TypeScript errors

## Technical Notes

- Use `npx shadcn@latest init` to set up the shadcn/ui configuration, then `npx shadcn@latest add <component>` for each component. shadcn/ui copies source code into the project, so customization is done by editing the generated files directly.
- shadcn/ui uses Radix UI primitives under the hood, which provide built-in keyboard navigation, focus management, and ARIA attributes. Do not remove or override these accessibility features.
- The `class-variance-authority` (cva) library is used by shadcn/ui for variant composition. Ensure it is installed as a dependency.
- The `cn()` utility function (using `clsx` + `tailwind-merge`) should be set up at `apps/web/src/lib/utils.ts` for conditional class composition.
- Lucide React icons should be installed for use in components (e.g., ChevronDown in Select, X in Dialog close).

## References

- **Design Specification:** Section 2.4 (Component Library), Section 3 (Component Specifications)
- **Functional Requirements:** NFR-UI-001 (WCAG 2.1 AA), NFR-UI-003 (consistent component styling)
- **shadcn/ui Docs:** Component installation, theming, customization
- **Radix UI Docs:** Accessibility primitives, keyboard interactions

## Estimated Complexity

High — Installing 16 components is straightforward with the shadcn CLI, but customizing each one to match the specific design spec (color variants, sizes, states) and verifying WCAG compliance across all interactive states requires significant attention to detail.
