/**
 * Utility for formatting elapsed time from an assignment timestamp.
 *
 * Formats a duration between an assignment ISO timestamp and the current time
 * into a human-readable short form:
 * - Less than 60 minutes: "Xm Ys" (e.g., "12m 34s")
 * - Less than 24 hours: "Xh Ym" (e.g., "3h 45m")
 * - 24 hours or more: "Xd Yh" (e.g., "2d 5h")
 *
 * Also provides a timeout risk level based on elapsed time vs. project timeout.
 */

/** Timeout risk levels for visual styling. */
export type TimeoutRisk = 'normal' | 'warning' | 'critical';

export interface ElapsedTimeResult {
  /** Formatted elapsed time string (e.g., "3h 45m") */
  formatted: string;
  /** Timeout risk level based on percentage of timeout consumed */
  risk: TimeoutRisk;
}

/**
 * Calculates elapsed time from `assignedAt` to now and determines timeout risk.
 *
 * @param assignedAt - ISO 8601 timestamp of when the worker was assigned
 * @param timeoutMinutes - The project's timeout threshold in minutes
 * @returns Formatted elapsed time string and risk level
 */
export function formatElapsedTime(assignedAt: string, timeoutMinutes: number): ElapsedTimeResult {
  const now = Date.now();
  const assignedTime = new Date(assignedAt).getTime();
  const elapsedMs = Math.max(0, now - assignedTime);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  const formatted = formatDuration(elapsedSeconds);
  const risk = calculateRisk(elapsedMs, timeoutMinutes);

  return { formatted, risk };
}

/**
 * Formats a duration in seconds into a short human-readable string.
 *
 * @param totalSeconds - Total elapsed seconds
 * @returns Formatted string: "Xm Ys", "Xh Ym", or "Xd Yh"
 */
function formatDuration(totalSeconds: number): string {
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);

  if (totalMinutes < 60) {
    const seconds = totalSeconds % 60;
    return `${String(totalMinutes)}m ${String(seconds)}s`;
  }

  if (totalHours < 24) {
    const remainingMinutes = totalMinutes % 60;
    return `${String(totalHours)}h ${String(remainingMinutes)}m`;
  }

  const remainingHours = totalHours % 24;
  return `${String(totalDays)}d ${String(remainingHours)}h`;
}

/**
 * Calculates the timeout risk level based on elapsed time and project timeout.
 *
 * @param elapsedMs - Elapsed time in milliseconds
 * @param timeoutMinutes - Project timeout threshold in minutes
 * @returns Risk level: normal (<75%), warning (75%-90%), critical (>90%)
 */
function calculateRisk(elapsedMs: number, timeoutMinutes: number): TimeoutRisk {
  if (timeoutMinutes <= 0) {
    return 'normal';
  }

  const timeoutMs = timeoutMinutes * 60 * 1000;
  const percentage = elapsedMs / timeoutMs;

  if (percentage > 0.9) {
    return 'critical';
  }

  if (percentage > 0.75) {
    return 'warning';
  }

  return 'normal';
}
