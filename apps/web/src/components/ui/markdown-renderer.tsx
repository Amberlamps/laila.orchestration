'use client';

import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import 'highlight.js/styles/github.css';

import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  /** Raw Markdown string to render */
  content?: string;
  /** Additional CSS classes for the prose container */
  className?: string;
}

/**
 * Renders raw Markdown content as styled HTML.
 *
 * Uses react-markdown with remark-gfm (GitHub Flavored Markdown) and
 * rehype-highlight (syntax highlighting). Tailwind Typography (`prose`)
 * provides consistent base styles, with custom overrides for the design system.
 *
 * XSS-safe by default — react-markdown builds a virtual DOM from a syntax tree
 * rather than using dangerouslySetInnerHTML.
 */
export const MarkdownRenderer = ({ content, className }: MarkdownRendererProps) => {
  if (!content) {
    return <div className={cn('max-w-[720px]', className)} />;
  }

  return (
    <div
      className={cn(
        // Tailwind Typography prose base — prose-sm for compact 14px body text
        'prose prose-sm max-w-[720px]',

        // Body text color — zinc-700
        'text-zinc-700',

        // Headings — zinc-900
        'prose-headings:text-zinc-900',

        // Links — indigo-600, no underline by default, underline on hover
        'prose-a:text-indigo-600 prose-a:no-underline hover:prose-a:underline',

        // Code blocks (pre) — zinc-100 bg, 8px radius (rounded-md), 16px padding
        'prose-pre:bg-zinc-100 prose-pre:rounded-[8px] prose-pre:p-4',

        // Inline code — JetBrains Mono, zinc-100 bg, zinc-700 text, 4px radius, horizontal padding
        'prose-code:font-mono prose-code:bg-zinc-100 prose-code:text-zinc-700',
        'prose-code:rounded-[4px] prose-code:px-1 prose-code:py-0.5',
        // Remove the backtick-style quotes that Tailwind Typography adds by default
        'prose-code:before:content-none prose-code:after:content-none',

        // Blockquotes — zinc-200 left border (3px), zinc-50 bg, zinc-500 text
        'prose-blockquote:border-l-[3px] prose-blockquote:border-zinc-200',
        'prose-blockquote:bg-zinc-50 prose-blockquote:text-zinc-500',
        'prose-blockquote:rounded-r-[4px] prose-blockquote:py-1 prose-blockquote:pr-4',

        // Tables — zinc-200 borders
        'prose-th:border-zinc-200 prose-td:border-zinc-200',

        // Table header — zinc-50 background
        'prose-thead:bg-zinc-50',

        // Lists — indigo-500 markers
        'marker:text-indigo-500',

        // Horizontal rules — zinc-200
        'prose-hr:border-zinc-200',

        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Ensure code blocks inside <pre> use JetBrains Mono and proper styling
          pre: ({ children, ...props }) => (
            <pre {...props} className="font-mono">
              {children}
            </pre>
          ),
          // Override code to apply font-mono (JetBrains Mono) for both inline and block code
          code: ({ children, className: codeClassName, ...props }) => (
            <code {...props} className={cn('font-mono', codeClassName)}>
              {children}
            </code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
