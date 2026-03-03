import * as React from 'react';

import { cn } from '@/lib/utils';

export interface TextareaProps extends React.ComponentProps<'textarea'> {
  error?: string | boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    const hasError = Boolean(error);
    const errorMessage = typeof error === 'string' ? error : undefined;

    return (
      <div className="w-full">
        <textarea
          className={cn(
            'placeholder:text-muted-foreground flex min-h-[60px] w-full rounded-md border border-zinc-200 bg-transparent px-3 py-2 text-base shadow-sm focus-visible:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
            hasError && 'border-red-500 focus-visible:ring-red-500',
            className,
          )}
          ref={ref}
          aria-invalid={hasError || undefined}
          {...props}
        />
        {errorMessage && <p className="text-destructive mt-1.5 text-sm">{errorMessage}</p>}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
