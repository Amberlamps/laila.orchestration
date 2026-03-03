import * as React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps extends React.ComponentProps<'input'> {
  error?: string | boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    const hasError = Boolean(error);
    const errorMessage = typeof error === 'string' ? error : undefined;

    return (
      <div className="w-full">
        <input
          type={type}
          className={cn(
            'file:text-foreground placeholder:text-muted-foreground flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
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
Input.displayName = 'Input';

export { Input };
