/**
 * Core reconciliation logic for the dag-reconciler Lambda function.
 *
 * Orchestrates the full reconciliation flow:
 * 1. Query all active projects (lifecycleStatus in 'ready', 'in_progress')
 * 2. For each project, load the full DAG (epics, stories, tasks, edges)
 * 3. Run all consistency rules to detect inconsistencies
 * 4. If corrections found, apply them in a single transaction per project
 * 5. After transaction commits, write audit events for each correction
 * 6. Return a summary of the reconciliation run
 *
 * Errors during individual project processing are caught, logged, and
 * counted. Processing continues to the next project -- one bad project
 * does not block the entire reconciliation.
 */

import { writeAllAuditEvents } from './audit';
import { findActiveProjects, loadProjectDAG, applyCorrections } from './db';
import { runAllRules } from './rules';

import type { ReconcilerLogger } from './logger';
import type { ReconciliationResult, CorrectionDetail } from './types';
import type { Database, PoolDatabase } from '@laila/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Console-based fallback logger matching the ReconcilerLogger interface. */
const consoleLogger: ReconcilerLogger = {
  info: (obj, msg) => {
    console.log(msg ?? '', obj);
  },
  warn: (obj, msg) => {
    console.warn(msg ?? '', obj);
  },
  error: (obj, msg) => {
    console.error(msg ?? '', obj);
  },
  debug: (obj, msg) => {
    console.debug(msg ?? '', obj);
  },
};

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Perform a full DAG reconciliation across all active projects.
 *
 * For each project:
 * 1. Load the complete DAG into memory (4 batch queries)
 * 2. Run all 5 consistency rules
 * 3. Apply corrections in a single transaction (if any found)
 * 4. Write audit events after transaction commits
 *
 * @param db     - A Drizzle database client (pool mode required for transactions)
 * @param logger - Optional structured logger (defaults to console)
 * @returns Summary of projects checked, inconsistencies found, corrections made
 */
export const reconcileAllProjects = async (
  db: Database | PoolDatabase,
  logger: ReconcilerLogger = consoleLogger,
): Promise<ReconciliationResult> => {
  // Step 1: Find all active projects
  const activeProjects = await findActiveProjects(db);

  logger.info({ projectCount: activeProjects.length }, 'Found active projects for reconciliation');

  let totalInconsistencies = 0;
  let totalCorrections = 0;
  let totalErrors = 0;

  // Step 2: Process each project independently
  for (const project of activeProjects) {
    try {
      const result = await reconcileProject(db, project.id, project.tenantId, project.name, logger);
      totalInconsistencies += result.inconsistencies;
      totalCorrections += result.corrections;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        { projectId: project.id, projectName: project.name, error: message },
        'Failed to reconcile project',
      );
      totalErrors += 1;
    }
  }

  return {
    projectsChecked: activeProjects.length,
    inconsistenciesFound: totalInconsistencies,
    correctionsMade: totalCorrections,
    errors: totalErrors,
  } satisfies ReconciliationResult;
};

// ---------------------------------------------------------------------------
// Per-project reconciliation
// ---------------------------------------------------------------------------

/** Result of reconciling a single project. */
interface ProjectReconciliationResult {
  inconsistencies: number;
  corrections: number;
}

/**
 * Reconcile a single project by loading its DAG, running rules, applying
 * corrections, and writing audit events.
 */
const reconcileProject = async (
  db: Database | PoolDatabase,
  projectId: string,
  tenantId: string,
  projectName: string,
  logger: ReconcilerLogger,
): Promise<ProjectReconciliationResult> => {
  // Load the complete DAG
  const project = {
    id: projectId,
    tenantId,
    name: projectName,
    lifecycleStatus: '',
    workStatus: '',
  };
  const dag = await loadProjectDAG(db, project);

  logger.debug(
    {
      projectId,
      epics: dag.epics.length,
      stories: dag.stories.length,
      tasks: dag.tasks.length,
      edges: dag.edges.length,
    },
    'Loaded project DAG',
  );

  // Run all consistency rules
  const corrections: CorrectionDetail[] = runAllRules(dag);

  if (corrections.length === 0) {
    return { inconsistencies: 0, corrections: 0 };
  }

  // Log each correction at warn level (unexpected state that was auto-corrected)
  for (const correction of corrections) {
    logger.warn(
      {
        projectId,
        entityType: correction.entityType,
        entityId: correction.entityId,
        entityName: correction.entityName,
        previousStatus: correction.previousStatus,
        correctedStatus: correction.correctedStatus,
        rule: correction.rule,
        reason: correction.reason,
      },
      'Detected inconsistency, applying correction',
    );
  }

  // Apply all corrections in a single transaction
  await applyCorrections(db, corrections);

  logger.info(
    { projectId, projectName, correctionCount: corrections.length },
    'Applied corrections for project',
  );

  // Write audit events AFTER the transaction commits
  await writeAllAuditEvents(corrections, tenantId, logger);

  return {
    inconsistencies: corrections.length,
    corrections: corrections.length,
  };
};
