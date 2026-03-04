/**
 * Utility for consistent USD currency and token count formatting.
 *
 * Uses `Intl.NumberFormat` for locale-aware formatting with comma separators.
 */

/** Singleton formatter for USD currency values. */
const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Singleton formatter for integer token counts with comma separators. */
const integerFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

/**
 * Formats a numeric amount as a USD string with two decimal places.
 *
 * @param amount - The dollar amount to format
 * @returns Formatted string, e.g. "$1,234.50"
 *
 * @example
 * ```ts
 * formatUSD(1234.5)  // "$1,234.50"
 * formatUSD(0)       // "$0.00"
 * ```
 */
export function formatUSD(amount: number): string {
  return usdFormatter.format(amount);
}

/**
 * Formats a token count as a comma-separated integer with " tokens" suffix.
 *
 * @param count - The number of tokens
 * @returns Formatted string, e.g. "1,234,567 tokens"
 *
 * @example
 * ```ts
 * formatTokenCount(1234567)  // "1,234,567 tokens"
 * formatTokenCount(0)        // "0 tokens"
 * ```
 */
export function formatTokenCount(count: number): string {
  return `${integerFormatter.format(count)} tokens`;
}
