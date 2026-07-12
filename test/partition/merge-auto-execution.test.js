/**
 * Guard tests for merge-candidate auto-execution in
 * PartitionSplitMergeManager: eligible adjacent under-threshold pairs now
 * EXECUTE through the wired executeMergeCandidate owner (they are no
 * longer computed and discarded), execution is bounded per evaluation
 * exactly like splits, deferred/error outcomes land in their canonical
 * buckets, and the loop stays inert when no owner is wired.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  DEFAULT_MAX_AUTO_EXECUTE_MERGES_PER_EVALUATION,
  PartitionSplitMergeManager,
} from '../../src/partition/partition-split-merge-manager.js';
import {
  PARTITION_TRANSITION_STATE,
  SPLIT_MERGE_REASON,
} from '../../src/partition/partition-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function buildPartitionRow(partitionId, startKey, endKey) {
  return {
    partition_id: partitionId,
    table_id: 'tbl-users',
    partition_key_start: startKey,
    partition_key_end: endKey,
    size_bytes: 64,
  };
}

function buildManager(options = {}) {
  const executedCandidates = options.executedCandidates || [];
  const manager = new PartitionSplitMergeManager({
    listPartitions: options.listPartitions || (() => [
      buildPartitionRow('users-p1', null, 'm'),
      buildPartitionRow('users-p2', 'm', null),
    ]),
    getPartitionMetrics: options.getPartitionMetrics ||
      (() => ({sizeBytes: 64, queriesPerMinute: 0})),
    executeMergeCandidate: Object.hasOwn(options, 'executeMergeCandidate') ?
      options.executeMergeCandidate :
      (async (candidate) => {
        executedCandidates.push(candidate);
        return {success: true, workflowId: 'merge-wf'};
      }),
    ...options.managerOptions,
  });
  return {manager, executedCandidates};
}

test('merge auto-execution - eligible adjacent pair executes through the ' +
    'wired owner', async (t) => {
  const {manager, executedCandidates} = buildManager();

  const results = await manager.evaluateAllPartitions();
  t.equal(results.evaluated, true);
  t.same(results.mergeCandidates, [
    {leftId: 'users-p1', rightId: 'users-p2'},
  ]);
  t.equal(results.executedMerges.length, 1);
  t.equal(results.mergeErrors.length, 0);
  t.same(executedCandidates, [{leftId: 'users-p1', rightId: 'users-p2'}]);

  manager.shutdown();
});

test('merge auto-execution - bounded per evaluation; overflow candidates ' +
    'are deferred with backpressure', async (t) => {
  const {manager, executedCandidates} = buildManager({
    listPartitions: () => [
      buildPartitionRow('users-p1', null, 'g'),
      buildPartitionRow('users-p2', 'g', 'm'),
      buildPartitionRow('users-p3', 'm', 't'),
      buildPartitionRow('users-p4', 't', null),
    ],
  });
  t.equal(
    manager.getThresholds().maxAutoExecuteMergesPerEvaluation,
    DEFAULT_MAX_AUTO_EXECUTE_MERGES_PER_EVALUATION,
  );

  const results = await manager.evaluateAllPartitions();
  t.equal(results.mergeCandidates.length, 3);
  t.equal(executedCandidates.length,
    DEFAULT_MAX_AUTO_EXECUTE_MERGES_PER_EVALUATION);
  t.equal(results.executedMerges.length,
    DEFAULT_MAX_AUTO_EXECUTE_MERGES_PER_EVALUATION);
  t.equal(results.mergeDeferred.length, 2);
  for (const deferred of results.mergeDeferred) {
    t.equal(deferred.reason, SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE);
  }

  manager.shutdown();
});

test('merge auto-execution - deferred workflow outcomes land in the ' +
    'deferred bucket, errors in the error bucket', async (t) => {
  const deferredExecution = {
    success: false,
    state: PARTITION_TRANSITION_STATE.DEFERRED,
    retryScheduled: true,
  };
  const {manager} = buildManager({
    executeMergeCandidate: async () => deferredExecution,
  });
  const results = await manager.evaluateAllPartitions();
  t.equal(results.mergeDeferred.length, 1);
  t.equal(results.executedMerges.length, 0);
  manager.shutdown();

  const {manager: failingManager} = buildManager({
    executeMergeCandidate: async () => {
      throw new Error('merge start exploded');
    },
  });
  const failingResults = await failingManager.evaluateAllPartitions();
  t.equal(failingResults.mergeErrors.length, 1);
  t.equal(failingResults.mergeErrors[0].error, 'merge start exploded');
  t.equal(failingResults.executedMerges.length, 0);
  failingManager.shutdown();
});

test('merge auto-execution - stays inert when no owner is wired: ' +
    'candidates are still reported', async (t) => {
  const {manager} = buildManager({executeMergeCandidate: null});

  const results = await manager.evaluateAllPartitions();
  t.same(results.mergeCandidates, [
    {leftId: 'users-p1', rightId: 'users-p2'},
  ]);
  t.equal(results.executedMerges.length, 0);
  t.equal(results.mergeErrors.length, 0);
  t.equal(results.mergeDeferred.length, 0);

  manager.shutdown();
});

test('merge auto-execution - over-threshold pairs are not candidates and ' +
    'never execute', async (t) => {
  const {manager, executedCandidates} = buildManager({
    getPartitionMetrics: () => ({
      sizeBytes: 3 * 1024 * 1024 * 1024,
      queriesPerMinute: 0,
    }),
  });

  const results = await manager.evaluateAllPartitions();
  t.equal(results.mergeCandidates.length, 0);
  t.equal(executedCandidates.length, 0);

  manager.shutdown();
});

test('merge auto-execution - non-adjacent partitions are not candidates',
  async (t) => {
    const {manager, executedCandidates} = buildManager({
      listPartitions: () => [
        buildPartitionRow('users-p1', null, 'g'),
        buildPartitionRow('users-p2', 'm', null),
      ],
    });

    const results = await manager.evaluateAllPartitions();
    t.equal(results.mergeCandidates.length, 0);
    t.equal(executedCandidates.length, 0);

    manager.shutdown();
  });

test('merge auto-execution - evaluation summary diagnostics count merge ' +
    'executions', async (t) => {
  const {manager} = buildManager();
  await manager.evaluateAllPartitions();
  const diagnostics = manager.getEvaluationDiagnostics();
  t.equal(diagnostics.lastSummary.mergeCandidateCount, 1);
  t.equal(diagnostics.lastSummary.executedMergeCount, 1);
  t.equal(diagnostics.lastSummary.mergeErrorCount, 0);
  manager.shutdown();
});
