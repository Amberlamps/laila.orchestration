import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-indigo-500 text-white shadow hover:bg-indigo-600',
        secondary: 'border-transparent bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
        destructive: 'border-transparent bg-red-500 text-white shadow hover:bg-red-600',
        outline: 'text-foreground',
        // Status variants
        draft: 'border-transparent bg-zinc-100 text-zinc-600',
        notStarted: 'border-transparent bg-gray-100 text-gray-600',
        ready: 'border-transparent bg-teal-50 text-teal-700',
        blocked: 'border-transparent bg-amber-50 text-amber-700',
        inProgress: 'border-transparent bg-blue-50 text-blue-700',
        complete: 'border-transparent bg-green-50 text-green-700',
        failed: 'border-transparent bg-red-50 text-red-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
