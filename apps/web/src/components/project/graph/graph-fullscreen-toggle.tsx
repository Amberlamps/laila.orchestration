/**
 * GraphFullscreenToggle — button that toggles fullscreen mode for the graph container.
 *
 * Uses the browser Fullscreen API for native fullscreen behavior.
 * Rendered inside the graph canvas controls toolbar alongside zoom/pan buttons.
 *
 * - Icon: Maximize when not fullscreen, Minimize when fullscreen
 * - Tooltip: "Enter fullscreen" / "Exit fullscreen"
 * - Ghost variant, small size (consistent with other canvas controls)
 */
import { Maximize, Minimize } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface GraphFullscreenToggleProps {
  /** Whether the graph container is currently in fullscreen mode. */
  isFullscreen: boolean;
  /** Callback invoked when the toggle button is clicked. */
  onToggle: () => void;
}

export const GraphFullscreenToggle = ({ isFullscreen, onToggle }: GraphFullscreenToggleProps) => {
  const label = isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
  const Icon = isFullscreen ? Minimize : Maximize;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="sm" onClick={onToggle} aria-label={label}>
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
};
