/**
 * GraphCanvasControls — floating toolbar with zoom and navigation controls
 * for the dependency graph canvas.
 *
 * Uses ReactFlow's useReactFlow hook for programmatic zoom/pan and
 * useViewport for real-time zoom level display.
 */
import { useReactFlow, useViewport } from '@xyflow/react';
import { Maximize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { GraphFullscreenToggle } from './graph-fullscreen-toggle';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum allowed zoom level. */
const MIN_ZOOM = 0.1;

/** Maximum allowed zoom level. */
const MAX_ZOOM = 2.0;

/** Small epsilon for float comparison to handle rounding imprecision. */
const ZOOM_EPSILON = 0.001;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Floating toolbar rendered at the bottom-left of the graph canvas.
 *
 * Buttons:
 * 1. Zoom Out  — decreases zoom, disabled at min (0.1x)
 * 2. Zoom %    — read-only display in mono font
 * 3. Zoom In   — increases zoom, disabled at max (2.0x)
 * 4. Divider
 * 5. Fit View  — animates viewport to show all nodes
 * 6. Reset     — restores graph to initial viewport state
 * 7. Divider
 * 8. Fullscreen toggle — enters/exits fullscreen mode
 */
interface GraphCanvasControlsProps {
  /** Called after the reset action to clear external interaction state. */
  onReset?: () => void;
  /** Whether the graph container is currently in fullscreen mode. */
  isFullscreen: boolean;
  /** Callback to toggle fullscreen mode for the graph container. */
  onFullscreenToggle: () => void;
}

export const GraphCanvasControls = ({
  onReset,
  isFullscreen,
  onFullscreenToggle,
}: GraphCanvasControlsProps) => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();

  const zoomPercentage = Math.round(zoom * 100);
  const isAtMinZoom = zoom <= MIN_ZOOM + ZOOM_EPSILON;
  const isAtMaxZoom = zoom >= MAX_ZOOM - ZOOM_EPSILON;

  const handleZoomIn = useCallback(() => {
    void zoomIn({ duration: 200 });
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    void zoomOut({ duration: 200 });
  }, [zoomOut]);

  const handleFitView = useCallback(() => {
    void fitView({ padding: 0.2, duration: 300 });
  }, [fitView]);

  const handleReset = useCallback(() => {
    void fitView({ padding: 0.2, duration: 300 });
    onReset?.();
  }, [fitView, onReset]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-white px-1 py-1 shadow-md">
        {/* Zoom Out */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomOut}
              disabled={isAtMinZoom}
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Zoom Out</TooltipContent>
        </Tooltip>

        {/* Zoom Percentage Display */}
        <span className="inline-flex min-w-[3.5rem] items-center justify-center font-mono text-sm text-zinc-700">
          {String(zoomPercentage)}%
        </span>

        {/* Zoom In */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomIn}
              disabled={isAtMaxZoom}
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Zoom In</TooltipContent>
        </Tooltip>

        {/* Divider */}
        <div className="mx-1 h-6 border-l border-zinc-200" />

        {/* Fit to View */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={handleFitView} aria-label="Fit to view">
              <Maximize2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Fit to View</TooltipContent>
        </Tooltip>

        {/* Reset */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={handleReset} aria-label="Reset view">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Reset</TooltipContent>
        </Tooltip>

        {/* Divider */}
        <div className="mx-1 h-6 border-l border-zinc-200" />

        {/* Fullscreen Toggle */}
        <GraphFullscreenToggle isFullscreen={isFullscreen} onToggle={onFullscreenToggle} />
      </div>
    </TooltipProvider>
  );
};
