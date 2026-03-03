# Implement Markdown Renderer Component

## Task Details

- **Title:** Implement Markdown Renderer Component
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Shared Domain UI Components](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** None

## Description

Build a `MarkdownRenderer` component using `react-markdown` with `remark-gfm` (GitHub Flavored Markdown) and `rehype-highlight` (syntax highlighting) plugins. The renderer uses Tailwind CSS Typography (`@tailwindcss/typography`) for consistent prose styling and is used throughout the application to display entity descriptions, acceptance criteria, and technical notes.

### Dependencies to Install

- `react-markdown` — Markdown to React component renderer
- `remark-gfm` — GitHub Flavored Markdown support (tables, strikethrough, task lists, autolinks)
- `rehype-highlight` — Syntax highlighting for code blocks
- `@tailwindcss/typography` — Tailwind Typography plugin for prose styles

### Visual Specification

- **Max Width:** 720px (prose width)
- **Text Color:** neutral-700 (zinc-700)
- **Link Color:** indigo-600, underline on hover
- **Heading Color:** zinc-900
- **Code Blocks:** JetBrains Mono font, zinc-100 bg, zinc-800 text, 8px radius, 16px padding
- **Inline Code:** JetBrains Mono, zinc-100 bg, zinc-700 text, 4px radius, 2px horizontal padding
- **Blockquotes:** zinc-200 left border (3px), zinc-500 text, zinc-50 bg
- **Tables:** zinc-200 borders, zinc-50 header bg, left-aligned text
- **Lists:** indigo-500 bullets/numbers
- **Task Lists:** Checkbox styling matching shadcn Checkbox component
- **Horizontal Rules:** zinc-200

```tsx
// apps/web/src/components/ui/markdown-renderer.tsx
// Renders Markdown content as styled HTML using react-markdown.
// Supports GFM (tables, task lists) and syntax-highlighted code blocks.
// Uses Tailwind Typography for consistent prose styling.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface MarkdownRendererProps {
  /** Raw Markdown string to render */
  content: string;
  /** Additional CSS classes for the prose container */
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        // Tailwind Typography prose styling with custom overrides.
        // prose-sm for compact body text matching our 14px Body default.
        'prose prose-sm max-w-[720px]',
        // Text colors — neutral-700 body, zinc-900 headings
        'prose-neutral prose-headings:text-zinc-900',
        // Links — indigo-600, underline on hover
        'prose-a:text-indigo-600 prose-a:no-underline hover:prose-a:underline',
        // Code blocks — JetBrains Mono, zinc-100 bg
        'prose-code:font-mono prose-code:bg-zinc-100 prose-code:rounded',
        'prose-code:px-1 prose-code:py-0.5 prose-code:text-zinc-700',
        // Pre blocks (code fences) — rounded-md, 16px padding
        'prose-pre:bg-zinc-100 prose-pre:rounded-md',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
```

## Acceptance Criteria

- [ ] `react-markdown`, `remark-gfm`, `rehype-highlight`, and `@tailwindcss/typography` are installed
- [ ] MarkdownRenderer renders raw Markdown strings as styled HTML
- [ ] GitHub Flavored Markdown is supported (tables, strikethrough, task lists, autolinks)
- [ ] Code blocks have syntax highlighting via rehype-highlight
- [ ] Code blocks use JetBrains Mono font, zinc-100 bg, 8px radius
- [ ] Inline code uses JetBrains Mono font, zinc-100 bg, 4px radius
- [ ] Body text is neutral-700 (zinc-700) with prose-sm sizing
- [ ] Links are indigo-600 with underline on hover
- [ ] Headings use zinc-900 color
- [ ] Max prose width is 720px
- [ ] Blockquotes have zinc-200 left border and zinc-50 background
- [ ] Tables render with zinc-200 borders and zinc-50 header background
- [ ] Component accepts `content` (Markdown string) and `className` props
- [ ] Empty or undefined content renders an empty container without errors
- [ ] Component sanitizes HTML in Markdown to prevent XSS (react-markdown does this by default)
- [ ] Component is used in entity description rendering throughout the app

## Technical Notes

- `react-markdown` uses a custom parser (not `dangerouslySetInnerHTML`) and is safe against XSS by default. It only renders allowed HTML elements.
- `remark-gfm` adds support for GitHub Flavored Markdown extensions. Without it, tables, strikethrough, and task lists are not rendered.
- `rehype-highlight` requires a highlight.js CSS theme for syntax highlighting colors. Include a minimal theme (e.g., `highlight.js/styles/github.css`) that matches the zinc-100 bg design.
- The `@tailwindcss/typography` plugin provides the `prose` class which styles all nested HTML elements (headings, paragraphs, lists, etc.) with consistent typography. Customize via `prose-*` modifier classes.
- The `font-mono` class in Tailwind should be configured to use JetBrains Mono (via the CSS variable `--font-jetbrains-mono` set up in the fonts task).

## References

- **Design Specification:** Section 3.6 (Markdown Rendering), Section 2.5 (Typography)
- **Functional Requirements:** FR-UI-002 (Markdown content display), FR-UI-003 (code syntax highlighting)
- **react-markdown Docs:** Plugin configuration, custom components
- **Tailwind Typography Docs:** Prose customization, modifier classes

## Estimated Complexity

Medium — Setting up react-markdown with plugins is straightforward, but customizing Tailwind Typography prose styles to exactly match the design spec and ensuring proper code block styling with JetBrains Mono requires attention to detail.
