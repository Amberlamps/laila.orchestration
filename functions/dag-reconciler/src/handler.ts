/**
 * Lambda handler for the dag-reconciler function.
 *
 * Triggered by EventBridge Scheduler every 5 minutes to perform a
 * full-graph consistency check across all active projects. Detects
 * and corrects status inconsistencies in tasks, stories, and epics
 * that may arise from race conditions, partial failures, or bugs
 * in the orchestration logic.
 *
 * Creates a pool-mode database client (required for transactions) and
 * delegates to the `reconcileAllProjects` orchestration function.
 */

import { createPoolClient } from './db';
import { createInvocationLogger } from './logger';
import { reconcileAllProjects } from './reconciliation';

import type { ReconciliationResult } from './types';
import type { ScheduledEvent, Context } from 'aws-lambda';

export const handler = async (
  event: ScheduledEvent,
  context: Context,
): Promise<ReconciliationResult> => {
  const log = createInvocationLogger(context.awsRequestId);

  log.info(
    {
      time: event.time,
      resources: event.resources,
    },
    'DAG reconciler invoked',
  );

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    log.error('DATABASE_URL is not set');
    throw new Error('DATABASE_URL is not set');
  }

  // Pool mode is required for transaction support during corrections
  const db = createPoolClient(databaseUrl);

  const result = await reconcileAllProjects(db, log);

  log.info(
    {
      projectsChecked: result.projectsChecked,
      inconsistenciesFound: result.inconsistenciesFound,
      correctionsMade: result.correctionsMade,
      errors: result.errors,
    },
    'DAG reconciler completed',
  );

  if (result.inconsistenciesFound > 0) {
    log.warn(
      {
        inconsistenciesFound: result.inconsistenciesFound,
        correctionsMade: result.correctionsMade,
      },
      'Inconsistencies detected and corrected -- investigate if count is high',
    );
  }

  return result;
};
