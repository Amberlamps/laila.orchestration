/**
 * Reusable formatting utilities for USD currency and token counts.
 *
 * Both formatters use `Intl.NumberFormat` for locale-aware, consistent output
 * across the dashboard. All monetary values in the application are denominated
 * in USD.
 *
 * @example
 * ```ts
 * formatUSD(1234.5);       // "$1,234.50"
 * formatUSD(0);            // "$0.00"
 * formatTokenCount(1234567); // "1,234,567 tokens"
 * formatTokenCount(0);      // "0 tokens"
 * ```
 */

// ---------------------------------------------------------------------------
// Formatter singletons (created once, reused for every call)
// ---------------------------------------------------------------------------

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Formats a numeric amount as a USD currency string.
 *
 * @param amount - The dollar amount to format.
 * @returns A string like `"$1,234.50"`.
 */
export function formatUSD(amount: number): string {
  return usdFormatter.format(amount);
}

/**
 * Formats a token count with comma separators and the "tokens" suffix.
 *
 * @param count - The number of tokens to format.
 * @returns A string like `"1,234,567 tokens"`.
 */
export function formatTokenCount(count: number): string {
  return `${integerFormatter.format(count)} tokens`;
}
