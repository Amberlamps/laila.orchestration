/**
 * TanStack Query key factory.
 *
 * Centralises all query keys used across the application to ensure
 * consistent cache invalidation and type-safe key references.
 *
 * @example
 * ```ts
 * import { queryKeys } from "@/lib/query-keys";
 *
 * // Use in a query
 * useQuery({ queryKey: queryKeys.session(), ... });
 *
 * // Invalidate session cache on sign-out
 * queryClient.invalidateQueries({ queryKey: queryKeys.session() });
 * ```
 */
export const queryKeys = {
  /** Key for the current user session query. */
  session: () => ['session'] as const,
} as const;
