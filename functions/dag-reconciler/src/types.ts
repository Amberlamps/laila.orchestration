/**
 * Shared type definitions for the dag-reconciler Lambda function.
 *
 * Defines the shapes used across handler, reconciliation, rules, and audit
 * modules. All types use strict typing (no `any`).
 */

import type { WorkStatus } from '@laila/shared';

// ---------------------------------------------------------------------------
// Correction types
// ---------------------------------------------------------------------------

/** Detail of a single status correction applied by the reconciler. */
export interface CorrectionDetail {
  projectId: string;
  entityType: 'task' | 'story' | 'epic';
  entityId: string;
  entityName: string;
  previousStatus: WorkStatus;
  correctedStatus: WorkStatus;
  rule: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Summary returned by the handler to the caller (EventBridge). */
export interface ReconciliationResult {
  projectsChecked: number;
  inconsistenciesFound: number;
  correctionsMade: number;
  errors: number;
}

// ---------------------------------------------------------------------------
// DAG graph types
// ---------------------------------------------------------------------------

/** Minimal project record for reconciliation queries. */
export interface ProjectRecord {
  id: string;
  tenantId: string;
  name: string;
  lifecycleStatus: string;
  workStatus: string;
}

/** Minimal epic record within the loaded DAG. */
export interface EpicNode {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  workStatus: string;
}

/** Minimal story record within the loaded DAG. */
export interface StoryNode {
  id: string;
  tenantId: string;
  epicId: string;
  title: string;
  workStatus: string;
  assignedWorkerId: string | null;
}

/** Minimal task record within the loaded DAG. */
export interface TaskNode {
  id: string;
  tenantId: string;
  userStoryId: string;
  title: string;
  workStatus: string;
}

/** A single dependency edge in the task DAG. */
export interface DependencyEdge {
  dependentTaskId: string;
  prerequisiteTaskId: string;
}

/** The complete project DAG loaded into memory for reconciliation. */
export interface ProjectDAG {
  project: ProjectRecord;
  epics: EpicNode[];
  stories: StoryNode[];
  tasks: TaskNode[];
  edges: DependencyEdge[];
}
