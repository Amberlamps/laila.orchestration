/**
 * GraphFullscreenToggle — button that toggles fullscreen mode for the
 * graph container.
 *
 * Displays a Maximize icon when not in fullscreen and a Minimize icon
 * when in fullscreen, with an appropriate tooltip for each state.
 *
 * Uses the ghost variant and sm size to stay consistent with the other
 * buttons in the canvas controls toolbar.
 */
import { Maximize, Minimize } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GraphFullscreenToggleProps {
  /** Whether the graph container is currently in fullscreen mode. */
  isFullscreen: boolean;
  /** Callback to toggle fullscreen on/off. */
  onToggle: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
