/**
 * Spent-wait witness for the migration owner: an exhausted partition
 * operation retry logs exactly one wait_bound_spent ERROR naming the last
 * failure, none when a retry succeeds, and still throws the last error.
 */

import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';
import {test} from '../../src/test-helpers/tap.js';
import {
  MIGRATION_DEFAULT,
  MIGRATION_STATUS,
  MIGRATION_TYPE,
} from '../../src/migration/migration-constants.js';
import {WAIT_BOUND_SPENT_EVENT} from '../../src/logging/wait-bound-spent.js';
import {
  createAlterSpec,
  createCoordinatorHarness,
} from './migration-coordinator-core-harness.js';


async function runWithFailures(failureCount) {
  const harness = createCoordinatorHarness();
  harness.coordinator.buildExponentialBackoffDelay = () => 0;
  const capture = captureLogger();
  harness.coordinator.logger = capture.logger;
  const migrationId = await harness.coordinator.initiateMigration(
    harness.tableId,
    createAlterSpec(MIGRATION_TYPE.ADD_COLUMN, 1),
  );
  const partitionId = harness.state.partitions[0].partition_id;
  let attempt = 0;
  const operation = async () => {
    attempt += 1;
    if (attempt <= failureCount) {
      throw new Error(`simulated failure ${attempt}`);
    }
    return {success: true};
  };
  let thrown = null;
  let result = null;
  try {
    result = await harness.coordinator.runPartitionOperationWithRetry({
      migrationId,
      partitionId,
      statusOnFailure: MIGRATION_STATUS.DUAL_WRITE,
      timeoutBudget: null,
      operation,
    });
  } catch (error) {
    thrown = error;
  }
  return {capture, thrown, result, migrationId, partitionId, attempt};
}

test('exhausted partition retry logs one wait_bound_spent ERROR and still ' +
  'throws the last failure', async (t) => {
  const attempts = MIGRATION_DEFAULT.MAX_RETRY_COUNT + 1;
  const run = await runWithFailures(attempts + 5);

  t.ok(run.thrown, 'the retry still throws');
  t.equal(run.thrown.message, `simulated failure ${attempts}`);
  t.equal(run.attempt, attempts, 'retry count unchanged');
  t.equal(run.capture.errors().length, 1, 'exactly one ERROR');
  const context = run.capture.errors()[0].context;
  t.equal(context.event, WAIT_BOUND_SPENT_EVENT);
  t.equal(context.wait, 'MIGRATION_DEFAULT.MAX_RETRY_COUNT');
  t.equal(context.lastObserved.attempts, attempts);
  t.equal(context.lastObserved.lastError, `simulated failure ${attempts}`);
  t.same(context.scope, {
    migrationId: run.migrationId,
    partitionId: run.partitionId,
  });
  t.end();
});

test('a partition retry that succeeds logs no wait_bound_spent ERROR',
  async (t) => {
    const run = await runWithFailures(1);

    t.equal(run.thrown, null);
    t.same(run.result, {success: true});
    t.equal(run.capture.errors().length, 0);
    t.end();
  });
