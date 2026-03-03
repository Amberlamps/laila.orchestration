# Implement Markdown Editor Component

## Task Details

- **Title:** Implement Markdown Editor Component
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Shared Domain UI Components](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** Implement Markdown Renderer Component

## Description

Build a `MarkdownEditor` component with a formatting toolbar and a live preview toggle. The editor is used throughout the application for editing entity descriptions, acceptance criteria, and technical notes. It uses the `MarkdownRenderer` component (from the previous task) for its preview mode.

### Visual Specification

- **Toolbar:** zinc-50 bg, zinc-200 bottom border, 36px height, flex row of icon buttons
- **Toolbar Buttons:** Bold, Italic, Heading (H2), Bulleted List, Numbered List, Code (inline), Code Block, Link
- **Edit/Preview Toggle:** Right side of toolbar, two tab-like buttons ("Write" / "Preview")
- **Textarea:** Full-width, `min-height: 80px`, auto-grows with content, zinc-200 border, indigo-500 focus ring
- **Preview Pane:** Renders the textarea content via `MarkdownRenderer`, same dimensions as textarea area

### Component API

````tsx
// apps/web/src/components/ui/markdown-editor.tsx
// Markdown editor with formatting toolbar and write/preview toggle.
// Integrates with React Hook Form via forwardRef + onChange/onBlur/value.
import { forwardRef, useState } from 'react';
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Code,
  FileCode,
  Link as LinkIcon,
} from 'lucide-react';
import { MarkdownRenderer } from './markdown-renderer';

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

// Toolbar button configuration — each button inserts Markdown syntax
// around the current selection or at the cursor position.
const TOOLBAR_ACTIONS = [
  { icon: Bold, label: 'Bold', prefix: '**', suffix: '**' },
  { icon: Italic, label: 'Italic', prefix: '_', suffix: '_' },
  { icon: Heading2, label: 'Heading', prefix: '## ', suffix: '' },
  { icon: List, label: 'Bulleted List', prefix: '- ', suffix: '' },
  { icon: ListOrdered, label: 'Numbered List', prefix: '1. ', suffix: '' },
  { icon: Code, label: 'Inline Code', prefix: '`', suffix: '`' },
  { icon: FileCode, label: 'Code Block', prefix: '```\n', suffix: '\n```' },
  { icon: LinkIcon, label: 'Link', prefix: '[', suffix: '](url)' },
];
````

### Toolbar Behavior

Each toolbar button inserts Markdown syntax around the currently selected text in the textarea. If no text is selected, the cursor is placed between the prefix and suffix markers. The toolbar actions use `document.execCommand` or direct textarea value manipulation to maintain undo/redo history.

## Acceptance Criteria

- [ ] MarkdownEditor renders a toolbar + textarea in "Write" mode and toolbar + MarkdownRenderer in "Preview" mode
- [ ] Toolbar has buttons for Bold, Italic, Heading, Bulleted List, Numbered List, Inline Code, Code Block, and Link
- [ ] Each toolbar button inserts the correct Markdown syntax around selected text
- [ ] If no text is selected, toolbar buttons insert syntax at cursor position with cursor placed between markers
- [ ] "Write" / "Preview" toggle switches between textarea input and rendered preview
- [ ] Preview mode uses the `MarkdownRenderer` component to render the current content
- [ ] Textarea has min-height of 80px (configurable via `minHeight` prop) and auto-grows with content
- [ ] Textarea has zinc-200 border and indigo-500 focus ring
- [ ] Component integrates with React Hook Form via `value`, `onChange`, `onBlur`, and `name` props
- [ ] Component supports `forwardRef` for React Hook Form `register`
- [ ] Disabled state grays out toolbar buttons and makes textarea read-only
- [ ] Error state shows red border and error message below the editor
- [ ] Toolbar buttons have Tooltip labels describing their function
- [ ] Toolbar buttons are keyboard accessible (Tab to navigate, Enter/Space to activate)
- [ ] Component does not lose cursor position after toolbar button click

## Technical Notes

- Use `forwardRef` to allow React Hook Form's `register` to attach a ref to the underlying textarea element. The component should also support controlled mode via `value`/`onChange` props.
- For text selection manipulation, use `textarea.selectionStart` and `textarea.selectionEnd` to get the current selection range, then use `textarea.setRangeText()` to insert Markdown syntax while preserving undo history.
- Auto-grow behavior can be implemented by setting `textarea.style.height = "auto"` then `textarea.style.height = textarea.scrollHeight + "px"` on every input event.
- The "Preview" mode replaces the textarea with a `MarkdownRenderer` instance. The container should maintain the same minimum height to avoid layout jumps during the switch.
- Consider using the shadcn `Tabs` component (with "Write" and "Preview" tabs) for the toggle, or a simpler custom button group.

## References

- **Design Specification:** Section 3.7 (Markdown Editor), Section 3.7.1 (Toolbar Actions)
- **Functional Requirements:** FR-UI-004 (Markdown editing), FR-UI-005 (preview toggle)
- **React Hook Form Docs:** forwardRef integration, controlled components
- **Lucide Icons Docs:** Formatting icons

## Estimated Complexity

High — Text selection manipulation for toolbar actions, auto-grow textarea behavior, React Hook Form integration via forwardRef, and the write/preview toggle all add up to significant complexity.
