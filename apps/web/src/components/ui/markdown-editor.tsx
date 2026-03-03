'use client';

import {
  Bold,
  Code,
  FileCode,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
} from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { MarkdownRenderer } from './markdown-renderer';

import type { LucideIcon } from 'lucide-react';

/* ---------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------- */

interface MarkdownEditorProps {
  /** Current Markdown content value */
  value?: string;
  /** Called when content changes */
  onChange?: (value: string) => void;
  /** Called when editor loses focus */
  onBlur?: () => void;
  /** Placeholder text for the textarea */
  placeholder?: string;
  /** Minimum height of the textarea in pixels (default: 80) */
  minHeight?: number;
  /** Whether the editor is disabled */
  disabled?: boolean;
  /** Error message to display below the editor */
  error?: string;
  /** HTML name attribute for form integration */
  name?: string;
  className?: string;
}

/* ---------------------------------------------------------------------------
 * Toolbar action definitions
 * --------------------------------------------------------------------------- */

interface ToolbarAction {
  icon: LucideIcon;
  label: string;
  prefix: string;
  suffix: string;
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { icon: Bold, label: 'Bold', prefix: '**', suffix: '**' },
  { icon: Italic, label: 'Italic', prefix: '_', suffix: '_' },
  { icon: Heading2, label: 'Heading', prefix: '## ', suffix: '' },
  { icon: List, label: 'Bulleted List', prefix: '- ', suffix: '' },
  { icon: ListOrdered, label: 'Numbered List', prefix: '1. ', suffix: '' },
  { icon: Code, label: 'Inline Code', prefix: '`', suffix: '`' },
  { icon: FileCode, label: 'Code Block', prefix: '```\n', suffix: '\n```' },
  { icon: LinkIcon, label: 'Link', prefix: '[', suffix: '](url)' },
];

/* ---------------------------------------------------------------------------
 * MarkdownEditor
 * --------------------------------------------------------------------------- */

/**
 * Markdown editor with a formatting toolbar and write/preview toggle.
 *
 * Integrates with React Hook Form via forwardRef + onChange/onBlur/value.
 * The underlying textarea is accessible through the forwarded ref, allowing
 * React Hook Form's `register` to attach directly.
 */
const MarkdownEditor = forwardRef<HTMLTextAreaElement, MarkdownEditorProps>(
  (
    {
      value = '',
      onChange,
      onBlur,
      placeholder = 'Write Markdown...',
      minHeight = 80,
      disabled = false,
      error,
      name,
      className,
    },
    ref,
  ) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [mode, setMode] = useState<'write' | 'preview'>('write');

    // Expose the internal textarea ref to the parent via forwardRef
    useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement);

    /* -----------------------------------------------------------------------
     * Auto-grow: adjust textarea height whenever the value changes
     * ----------------------------------------------------------------------- */
    const adjustHeight = useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      // Reset to auto so scrollHeight recalculates properly
      textarea.style.height = 'auto';
      textarea.style.height = `${String(Math.max(textarea.scrollHeight, minHeight))}px`;
    }, [minHeight]);

    useEffect(() => {
      adjustHeight();
    }, [value, adjustHeight]);

    /* -----------------------------------------------------------------------
     * Toolbar action handler — inserts Markdown syntax around selection
     * ----------------------------------------------------------------------- */
    const handleToolbarAction = useCallback(
      (action: ToolbarAction) => {
        const textarea = textareaRef.current;
        if (!textarea || disabled) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = textarea.value.substring(start, end);

        // Build the replacement text
        const replacement = `${action.prefix}${selectedText}${action.suffix}`;

        // Focus the textarea first so setRangeText works and undo history is preserved
        textarea.focus();

        // Use setRangeText to insert text — this preserves the browser's undo stack
        textarea.setRangeText(replacement, start, end, 'end');

        // If no text was selected, place cursor between prefix and suffix
        if (selectedText.length === 0 && action.suffix.length > 0) {
          const cursorPos = start + action.prefix.length;
          textarea.setSelectionRange(cursorPos, cursorPos);
        }

        // Fire onChange with the updated value
        onChange?.(textarea.value);

        // Re-adjust height after content change
        requestAnimationFrame(adjustHeight);
      },
      [disabled, onChange, adjustHeight],
    );

    /* -----------------------------------------------------------------------
     * Input handler
     * ----------------------------------------------------------------------- */
    const handleInput = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange?.(e.target.value);
        adjustHeight();
      },
      [onChange, adjustHeight],
    );

    /* -----------------------------------------------------------------------
     * Render
     * ----------------------------------------------------------------------- */
    const hasError = Boolean(error);

    return (
      <div className={cn('w-full', className)}>
        <div
          className={cn(
            'overflow-hidden rounded-md border border-zinc-200',
            hasError && 'border-red-500',
            disabled && 'opacity-50',
          )}
        >
          {/* Toolbar */}
          <div className="flex h-9 items-center justify-between border-b border-zinc-200 bg-zinc-50 px-1">
            {/* Formatting buttons */}
            <TooltipProvider delayDuration={300}>
              <div className="flex items-center gap-0.5">
                {TOOLBAR_ACTIONS.map((action) => (
                  <Tooltip key={action.label}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={action.label}
                        disabled={disabled}
                        className={cn(
                          'inline-flex h-7 w-7 items-center justify-center rounded text-zinc-500 transition-colors',
                          'hover:bg-zinc-200 hover:text-zinc-700',
                          'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:outline-none',
                          'disabled:pointer-events-none disabled:text-zinc-300',
                        )}
                        onClick={() => {
                          handleToolbarAction(action);
                        }}
                      >
                        <action.icon className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{action.label}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>

            {/* Write / Preview toggle */}
            <div className="flex items-center gap-0.5 pr-1">
              <button
                type="button"
                className={cn(
                  'rounded px-2 py-1 text-xs font-medium transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:outline-none',
                  mode === 'write'
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700',
                )}
                onClick={() => {
                  setMode('write');
                }}
                disabled={disabled}
              >
                Write
              </button>
              <button
                type="button"
                className={cn(
                  'rounded px-2 py-1 text-xs font-medium transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:outline-none',
                  mode === 'preview'
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700',
                )}
                onClick={() => {
                  setMode('preview');
                }}
                disabled={disabled}
              >
                Preview
              </button>
            </div>
          </div>

          {/* Content area */}
          {mode === 'write' ? (
            <textarea
              ref={textareaRef}
              name={name}
              value={value}
              onChange={handleInput}
              onBlur={onBlur}
              placeholder={placeholder}
              disabled={disabled}
              readOnly={disabled}
              aria-invalid={hasError || undefined}
              className={cn(
                'w-full resize-none bg-white px-3 py-2 text-sm text-zinc-900',
                'placeholder:text-zinc-400',
                'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none focus-visible:ring-inset',
                'disabled:cursor-not-allowed disabled:bg-zinc-50',
              )}
              style={{ minHeight: `${String(minHeight)}px` }}
            />
          ) : (
            <div className="bg-white px-3 py-2" style={{ minHeight: `${String(minHeight)}px` }}>
              {value ? (
                <MarkdownRenderer content={value} className="max-w-none" />
              ) : (
                <p className="text-sm text-zinc-400">{placeholder}</p>
              )}
            </div>
          )}
        </div>

        {/* Error message */}
        {error && <p className="mt-1.5 text-sm text-red-500">{error}</p>}
      </div>
    );
  },
);

MarkdownEditor.displayName = 'MarkdownEditor';

export { MarkdownEditor };
export type { MarkdownEditorProps };
