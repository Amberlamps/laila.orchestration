/**
 * @module @laila/shared/constants/priority
 *
 * Priority level enumeration used across work items (epics, user stories,
 * and tasks) to indicate urgency and scheduling importance.
 *
 * Priority values are ordered from highest to lowest urgency:
 *   critical > high > medium > low
 *
 * The orchestration service uses priority to determine task scheduling
 * order when multiple work items are in the `ready` state.
 *
 * Defined as a Zod schema for runtime validation support.
 * TypeScript type is inferred directly from the schema.
 */

import { z } from 'zod';

/**
 * Priority levels for work items.
 *
 * - `critical` -- Must be addressed immediately; blocks project progress
 * - `high`     -- Important and should be scheduled before medium/low items
 * - `medium`   -- Standard priority; the default for most work items
 * - `low`      -- Can be deferred; addressed when higher-priority work is done
 */
export const prioritySchema = z.enum(['critical', 'high', 'medium', 'low']);

/** TypeScript union type for priority level values */
export type Priority = z.infer<typeof prioritySchema>;

/** Tuple of all valid priority values, ordered from highest to lowest urgency */
export const PRIORITIES = prioritySchema.options;
