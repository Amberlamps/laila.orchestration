# Configure Fonts and Typography

## Task Details

- **Title:** Configure Fonts and Typography
- **Status:** Complete
- **Assigned Agent:** ui-designer
- **Parent User Story:** [Configure Tailwind CSS & shadcn/ui](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** Configure Tailwind Design Tokens

## Description

Set up the Inter and JetBrains Mono font families via `next/font/google` for optimized loading, and configure the full type scale as Tailwind CSS utility classes. This establishes the typographic hierarchy used throughout the entire application.

### Font Setup

Use Next.js `next/font/google` for automatic font optimization (self-hosting, zero layout shift, privacy-preserving):

```typescript
// apps/web/src/lib/fonts.ts
// Font configuration using next/font/google for optimized loading.
// Inter is the primary UI font; JetBrains Mono is used for code and IDs.
import { Inter, JetBrains_Mono } from 'next/font/google';

// Inter — primary UI font for all body text, headings, and labels.
// Load variable font with latin subset for optimal performance.
export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// JetBrains Mono — monospace font for code blocks, IDs, and technical values.
// Used in MarkdownRenderer code blocks, entity IDs, API keys, and cost figures.
export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});
```

### Type Scale

Define the following type scale as Tailwind utilities or custom classes:

| Style      | Size | Weight         | Line Height | Letter Spacing | Font           | Usage                         |
| ---------- | ---- | -------------- | ----------- | -------------- | -------------- | ----------------------------- |
| Display    | 30px | 700 (Bold)     | 36px        | -0.5px         | Inter          | Page titles, hero headings    |
| H1         | 24px | 600 (Semibold) | 32px        | -0.25px        | Inter          | Section headings              |
| H2         | 20px | 600 (Semibold) | 28px        | 0              | Inter          | Sub-section headings          |
| H3         | 16px | 600 (Semibold) | 24px        | 0              | Inter          | Card titles, dialog titles    |
| Body Large | 16px | 400 (Regular)  | 24px        | 0              | Inter          | Primary content text          |
| Body       | 14px | 400 (Regular)  | 20px        | 0              | Inter          | Default body text             |
| Body Small | 13px | 400 (Regular)  | 18px        | 0              | Inter          | Secondary text, descriptions  |
| Caption    | 12px | 500 (Medium)   | 16px        | 0              | Inter          | Labels, metadata, timestamps  |
| Overline   | 11px | 600 (Semibold) | 16px        | 0.5px          | Inter          | Table headers, section labels |
| Mono       | 13px | 400 (Regular)  | 18px        | 0              | JetBrains Mono | Entity IDs, code              |
| Mono Small | 12px | 400 (Regular)  | 16px        | 0              | JetBrains Mono | Inline code, costs            |

```css
/* apps/web/src/app/globals.css */
/* Type scale utilities — each class encapsulates size, weight, line-height, */
/* and letter-spacing to enforce typographic consistency. */
@layer utilities {
  .text-display {
    font-size: 30px;
    font-weight: 700;
    line-height: 36px;
    letter-spacing: -0.5px;
    font-family: var(--font-inter);
  }
  .text-h1 {
    font-size: 24px;
    font-weight: 600;
    line-height: 32px;
    letter-spacing: -0.25px;
    font-family: var(--font-inter);
  }
  .text-overline {
    font-size: 11px;
    font-weight: 600;
    line-height: 16px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    font-family: var(--font-inter);
  }
  .text-mono {
    font-size: 13px;
    font-weight: 400;
    line-height: 18px;
    font-family: var(--font-jetbrains-mono);
  }
  /* ... additional type scale utilities */
}
```

### Application of Font CSS Variables

Apply the font CSS variables to the root HTML element in `_app.tsx` or `_document.tsx`:

```tsx
// apps/web/src/pages/_app.tsx
// Apply font CSS variables to the root element so Tailwind and
// CSS custom properties can reference them globally.
import { inter, jetbrainsMono } from '@/lib/fonts';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
      <Component {...pageProps} />
    </div>
  );
}
```

## Acceptance Criteria

- [ ] Inter font is loaded via `next/font/google` with `--font-inter` CSS variable
- [ ] JetBrains Mono font is loaded via `next/font/google` with `--font-jetbrains-mono` CSS variable
- [ ] Both fonts use `display: "swap"` for performance and `subsets: ["latin"]`
- [ ] Font CSS variables are applied to the root HTML element via `_app.tsx`
- [ ] Full type scale is defined (Display, H1, H2, H3, Body Large, Body, Body Small, Caption, Overline, Mono, Mono Small)
- [ ] Type scale utilities are available as Tailwind classes (e.g., `text-display`, `text-h1`, `text-overline`, `text-mono`)
- [ ] Overline style includes `text-transform: uppercase` and 0.5px letter-spacing
- [ ] Default body font is Inter (via `font-sans` Tailwind class)
- [ ] JetBrains Mono is used for monospace contexts (entity IDs, code blocks, cost figures)
- [ ] No layout shift occurs during font loading (CLS = 0)
- [ ] Fonts work correctly in both development and production builds

## Technical Notes

- `next/font/google` automatically self-hosts fonts at build time, eliminating external requests to Google Fonts and improving privacy and performance.
- The `variable` option creates a CSS custom property that can be referenced in Tailwind's `fontFamily` configuration.
- Using `display: "swap"` ensures text remains visible during font loading, preventing FOIT (Flash of Invisible Text).
- The type scale utilities use `@layer utilities` to ensure they can be overridden by other Tailwind utilities when needed.
- Consider creating a `Typography` component that wraps common patterns (e.g., `<Typography variant="h1">`) for convenience, but Tailwind utility classes should remain the primary approach.

## References

- **Design Specification:** Section 2.5 (Typography), Section 2.5.1 (Type Scale), Section 2.5.2 (Font Families)
- **Functional Requirements:** NFR-UI-004 (typography consistency), NFR-PERF-001 (no layout shift)
- **Next.js Docs:** next/font/google optimization, variable fonts
- **Tailwind CSS v4 Docs:** Custom utilities via `@layer utilities`

## Estimated Complexity

Low — Font setup with `next/font/google` is well-documented and straightforward. The type scale definition is a mapping exercise from the design spec to Tailwind utility classes.
