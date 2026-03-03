import Link from 'next/link';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  /** Display text for the breadcrumb segment */
  label: string;
  /** Link target — omit for current page (last item) */
  href?: string;
}

export interface BreadcrumbProps {
  /** Ordered list of breadcrumb segments from root to current page */
  items: BreadcrumbItem[];
  /** Maximum visible segments before truncation (default: 5) */
  maxVisible?: number;
  /** Additional class names for layout customization */
  className?: string;
}

const DEFAULT_MAX_VISIBLE = 5;

const Separator = () => (
  <span aria-hidden="true" className="text-zinc-400 select-none">
    /
  </span>
);

const BreadcrumbLink = ({ href, label }: { href: string; label: string }) => (
  <Link href={href} className="text-zinc-500 hover:underline">
    {label}
  </Link>
);

const TruncationPopover = ({ hiddenItems }: { hiddenItems: BreadcrumbItem[] }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        className="cursor-pointer text-zinc-500 hover:underline"
        aria-label="Show hidden breadcrumb items"
      >
        &hellip;
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-auto max-w-64 p-2">
      {/* role="list" restores VoiceOver semantics lost when list-style is removed */}
      {/* eslint-disable-next-line jsx-a11y/no-redundant-roles */}
      <ol role="list" className="flex flex-col gap-1">
        {hiddenItems.map((item, index) => (
          <li key={index}>
            {item.href ? (
              <Link
                href={item.href}
                className="text-body-sm block rounded-sm px-2 py-1 text-zinc-500 hover:bg-zinc-100 hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-body-sm block px-2 py-1 text-zinc-950">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </PopoverContent>
  </Popover>
);

const computeVisibleSegments = (
  items: BreadcrumbItem[],
  maxVisible: number,
): { visibleItems: BreadcrumbItem[]; hiddenItems: BreadcrumbItem[]; needsTruncation: boolean } => {
  // Clamp to minimum 3 so first + ellipsis + last is always valid
  const effectiveMax = Math.max(maxVisible, 3);

  if (items.length <= effectiveMax) {
    return { visibleItems: items, hiddenItems: [], needsTruncation: false };
  }

  const first = items[0];
  if (!first) {
    return { visibleItems: items, hiddenItems: [], needsTruncation: false };
  }
  // Show last (effectiveMax - 2) items to account for the first item and the "..." trigger
  const tailCount = effectiveMax - 2;
  const tail = items.slice(items.length - tailCount);
  const hidden = items.slice(1, items.length - tailCount);

  return {
    visibleItems: [first, ...tail],
    hiddenItems: hidden,
    needsTruncation: true,
  };
};

export const Breadcrumb = ({
  items,
  maxVisible = DEFAULT_MAX_VISIBLE,
  className,
}: BreadcrumbProps) => {
  if (items.length === 0) {
    return null;
  }

  const { visibleItems, hiddenItems, needsTruncation } = computeVisibleSegments(items, maxVisible);
  const lastIndex = visibleItems.length - 1;

  const renderItem = (item: BreadcrumbItem, index: number) => {
    const isLast = index === lastIndex;
    const isCurrentPage = isLast && !item.href;

    if (isCurrentPage) {
      return (
        <span className="text-zinc-950" aria-current="page">
          {item.label}
        </span>
      );
    }

    if (item.href) {
      return <BreadcrumbLink href={item.href} label={item.label} />;
    }

    return <span className="text-zinc-950">{item.label}</span>;
  };

  return (
    <nav aria-label="Breadcrumb" className={cn('text-body-sm', className)}>
      {/* role="list" restores VoiceOver semantics lost when list-style is removed */}
      {/* eslint-disable-next-line jsx-a11y/no-redundant-roles */}
      <ol role="list" className="flex items-center gap-1.5">
        {visibleItems.map((item, index) => (
          <li key={index} className="flex items-center gap-1.5">
            {index === 1 && needsTruncation && (
              <>
                <Separator />
                <TruncationPopover hiddenItems={hiddenItems} />
              </>
            )}
            {index > 0 && <Separator />}
            {renderItem(item, index)}
          </li>
        ))}
      </ol>
    </nav>
  );
};
