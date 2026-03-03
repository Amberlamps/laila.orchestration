/**
 * Helper utilities for optimistic updates with automatic rollback on error.
 *
 * Optimistic updates provide instant UI feedback while the API call is in
 * flight. The helper snapshots the current cache state before applying the
 * update, then returns a rollback function that restores the snapshot if the
 * mutation fails.
 *
 * @example
 * ```ts
 * const queryClient = useQueryClient();
 *
 * useMutation({
 *   mutationFn: updateProject,
 *   onMutate: async (newData) => {
 *     await queryClient.cancelQueries({ queryKey: queryKeys.projects.detail(id) });
 *     const { rollback } = createOptimisticUpdate(
 *       queryClient,
 *       queryKeys.projects.detail(id),
 *       (old) => ({ ...old, ...newData }),
 *     );
 *     return { rollback };
 *   },
 *   onError: (_err, _vars, context) => context?.rollback(),
 *   onSettled: () => {
 *     queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(id) });
 *   },
 * });
 * ```
 */
import type { QueryClient } from '@tanstack/react-query';

/**
 * Snapshots the current cache for the given query key, applies an optimistic
 * update via `updater`, and returns the previous data along with a `rollback`
 * function for use in `onError`.
 *
 * @param queryClient - The TanStack Query client instance.
 * @param queryKey   - The query key whose cached data should be updated.
 * @param updater    - A function that receives the current cached data (or
 *                     `undefined` if no cache entry exists) and returns the
 *                     optimistically updated data.
 * @returns An object with `previousData` (the snapshot) and `rollback` (a
 *          function that restores the snapshot).
 */
export const createOptimisticUpdate = <TData>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  updater: (oldData: TData | undefined) => TData,
): { previousData: TData | undefined; rollback: () => void } => {
  const previousData = queryClient.getQueryData<TData>(queryKey);

  queryClient.setQueryData<TData>(queryKey, updater);

  return {
    previousData,
    rollback: () => {
      queryClient.setQueryData<TData>(queryKey, previousData);
    },
  };
};
