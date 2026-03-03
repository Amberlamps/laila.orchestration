import Link from 'next/link';

import { Button } from '@/components/ui/button';

import type { LucideIcon } from 'lucide-react';

interface ErrorPageAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface ErrorPageProps {
  /** Lucide icon component for the error illustration */
  icon: LucideIcon;
  /** HTTP status code displayed as large faded text (e.g. "404") */
  code?: string;
  /** Error title (e.g. "Page Not Found") */
  title: string;
  /** Error description */
  description: string;
  /** Primary CTA button */
  primaryAction: ErrorPageAction;
  /** Optional secondary action */
  secondaryAction?: ErrorPageAction;
}

const ActionButton = ({
  action,
  variant = 'default',
}: {
  action: ErrorPageAction;
  variant?: 'default' | 'ghost';
}) => {
  if (action.href) {
    return (
      <Button variant={variant} asChild>
        <Link href={action.href}>{action.label}</Link>
      </Button>
    );
  }

  return (
    <Button variant={variant} onClick={action.onClick}>
      {action.label}
    </Button>
  );
};

export const ErrorPage = ({
  icon: Icon,
  code,
  title,
  description,
  primaryAction,
  secondaryAction,
}: ErrorPageProps) => (
  <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
    <div className="max-w-[480px] text-center">
      <Icon className="mx-auto mb-4 h-16 w-16 text-zinc-300" />
      {code && <p className="text-display mb-2 text-zinc-300">{code}</p>}
      <h1 className="text-h1 mb-3 text-zinc-900">{title}</h1>
      <p className="text-body mx-auto mb-8 max-w-[400px] text-zinc-500">{description}</p>
      <div className="flex flex-col items-center gap-2">
        <ActionButton action={primaryAction} />
        {secondaryAction && <ActionButton action={secondaryAction} variant="ghost" />}
      </div>
    </div>
  </div>
);
