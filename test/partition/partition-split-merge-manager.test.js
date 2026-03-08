/**
 * Unit tests for PartitionSplitMergeManager.
 * Tests partition splitting and merging operations.
 * Requirements: 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 20.4, 20.8, 20.9
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  PartitionSplitMergeManager,
  OperationState,
  DEFAULT_SPLIT_STORAGE_THRESHOLD,
  DEFAULT_SPLIT_TRAFFIC_THRESHOLD,
  DEFAULT_MERGE_STORAGE_THRESHOLD,
  DEFAULT_MERGE_TRAFFIC_THRESHOLD,
  DEFAULT_MAX_AUTO_EXECUTE_SPLITS_PER_EVALUATION,
} from '../../src/partition/partition-split-merge-manager.js';
import {KeyRange, KeyRangeManager} from '../../src/partition/key-range-manager.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('PartitionSplitMergeManager - constructor initializes with defaults', async (t) => {
  const manager = new PartitionSplitMergeManager();

  t.equal(manager.getState(), OperationState.IDLE);
  const thresholds = manager.getThresholds();
  t.equal(thresholds.splitStorageThreshold, DEFAULT_SPLIT_STORAGE_THRESHOLD);
  t.equal(thresholds.splitTrafficThreshold, DEFAULT_SPLIT_TRAFFIC_THRESHOLD);
  t.equal(thresholds.mergeStorageThreshold, DEFAULT_MERGE_STORAGE_THRESHOLD);
  t.equal(thresholds.mergeTrafficThreshold, DEFAULT_MERGE_TRAFFIC_THRESHOLD);
  t.equal(
    thresholds.maxAutoExecuteSplitsPerEvaluation,
    DEFAULT_MAX_AUTO_EXECUTE_SPLITS_PER_EVALUATION,
  );

  manager.shutdown();
});

test('PartitionSplitMergeManager - evaluateSplitCriteria returns true when storage exceeds ' +
    'threshold', async (t) => {
  const manager = new PartitionSplitMergeManager();

  const metrics = {
    sizeBytes: 11 * 1024 * 1024 * 1024, // 11GB > 10GB threshold
    queriesPerMinute: 100,
  };

  const shouldSplit = manager.evaluateSplitCriteria('partition-1', metrics);
  t.equal(shouldSplit, true);

  manager.shutdown();
});

test('PartitionSplitMergeManager - evaluateSplitCriteria returns true when traffic exceeds ' +
    'threshold', async (t) => {
  const manager = new PartitionSplitMergeManager();

  const metrics = {
    sizeBytes: 1 * 1024 * 1024 * 1024, // 1GB < 10GB threshold
    queriesPerMinute: 1500, // > 1000 threshold
  };

  const shouldSplit = manager.evaluateSplitCriteria('partition-1', metrics);
  t.equal(shouldSplit, true);

  manager.shutdown();
});


test('PartitionSplitMergeManager - evaluateSplitCriteria returns false when below ' +
    'thresholds', async (t) => {
  const manager = new PartitionSplitMergeManager();

  const metrics = {
    sizeBytes: 5 * 1024 * 1024 * 1024, // 5GB < 10GB threshold
    queriesPerMinute: 500, // < 1000 threshold
  };

  const shouldSplit = manager.evaluateSplitCriteria('partition-1', metrics);
  t.equal(shouldSplit, false);

  manager.shutdown();
});

test('PartitionSplitMergeManager - evaluateSplitCriteria uses custom policy ' +
    'thresholds', async (t) => {
  const manager = new PartitionSplitMergeManager();

  const metrics = {
    sizeBytes: 3 * 1024 * 1024 * 1024, // 3GB
    queriesPerMinute: 100,
  };

  const policy = {
    splitStorageThreshold: 2 * 1024 * 1024 * 1024, // 2GB custom threshold
  };

  const shouldSplit = manager.evaluateSplitCriteria('partition-1', metrics, policy);
  t.equal(shouldSplit, true); // 3GB > 2GB custom threshold

  manager.shutdown();
});

test('PartitionSplitMergeManager - evaluateMergeCriteria returns true when both below ' +
    'thresholds', async (t) => {
  const manager = new PartitionSplitMergeManager();

  const leftMetrics = {
    sizeBytes: 500 * 1024 * 1024, // 500MB
    queriesPerMinute: 50,
  };

  const rightMetrics = {
    sizeBytes: 500 * 1024 * 1024, // 500MB
    queriesPerMinute: 50,
  };

  // Combined: 1GB storage, 100 qpm - both below thresholds
  const shouldMerge = manager.evaluateMergeCriteria(
    'partition-1', 'partition-2', leftMetrics, rightMetrics,
  );
  t.equal(shouldMerge, true);

  manager.shutdown();
});

test('PartitionSplitMergeManager - evaluateMergeCriteria returns false when storage exceeds ' +
    'threshold', async (t) => {
  const manager = new PartitionSplitMergeManager();

  const leftMetrics = {
    sizeBytes: 1.5 * 1024 * 1024 * 1024, // 1.5GB
    queriesPerMinute: 50,
  };

  const rightMetrics = {
    sizeBytes: 1 * 1024 * 1024 * 1024, // 1GB
    queriesPerMinute: 50,
  };

  // Combined: 2.5GB storage > 2GB threshold
  const shouldMerge = manager.evaluateMergeCriteria(
    'partition-1', 'partition-2', leftMetrics, rightMetrics,
  );
  t.equal(shouldMerge, false);

  manager.shutdown();
});

test('PartitionSplitMergeManager - evaluateMergeCriteria returns false when traffic exceeds ' +
    'threshold', async (t) => {
  const manager = new PartitionSplitMergeManager();

  const leftMetrics = {
    sizeBytes: 500 * 1024 * 1024, // 500MB
    queriesPerMinute: 150,
  };

  const rightMetrics = {
    sizeBytes: 500 * 1024 * 1024, // 500MB
    queriesPerMinute: 100,
  };

  // Combined: 1GB storage (OK), 250 qpm > 200 threshold
  const shouldMerge = manager.evaluateMergeCriteria(
    'partition-1', 'partition-2', leftMetrics, rightMetrics,
  );
  t.equal(shouldMerge, false);

  manager.shutdown();
});

test('PartitionSplitMergeManager - splitPartition creates two adjacent partitions', async (t) => {
  const keyRangeManager = new KeyRangeManager('test-table');
  keyRangeManager.addPartition('partition-1', KeyRange.fullRange());

  // Mock partition service
  const mockPartitionService = {
    executeQuery: async (sql) => {
      if (sql.includes('COUNT')) {
        return {rows: [{total: 100}]};
      }
      // Return median key
      return {rows: [{id: 50}]};
    },
    getKeyRange: () => ({start: null, end: null}),
  };

  const manager = new PartitionSplitMergeManager({
    keyRangeManager,
  });

  const result = await manager.splitPartition({
    partitionId: 'partition-1',
    partitionService: mockPartitionService,
    tableName: 'test_table',
    tableId: 'test-table',
    primaryKeyColumn: 'id',
  });

  t.equal(result.success, true);
  t.equal(result.originalPartitionId, 'partition-1');
  t.equal(result.medianKey, 50);
  t.ok(result.leftPartition.partitionId);
  t.ok(result.rightPartition.partitionId);
  t.equal(result.leftPartition.keyRange.start, null);
  t.equal(result.leftPartition.keyRange.end, 50);
  t.equal(result.rightPartition.keyRange.start, 50);
  t.equal(result.rightPartition.keyRange.end, null);

  // Verify key range manager was updated
  t.equal(keyRangeManager.getPartitionCount(), 2);
  t.equal(keyRangeManager.getRange('partition-1'), null);

  manager.shutdown();
});

test('PartitionSplitMergeManager - splitPartition normalizes undefined unbounded ' +
  'range edges', async (t) => {
  const mockPartitionService = {
    executeQuery: async (sql) => {
      if (sql.includes('COUNT')) {
        return {rows: [{total: 100}]};
      }
      return {rows: [{id: 50}]};
    },
    getKeyRange: () => ({start: undefined, end: undefined}),
  };

  const manager = new PartitionSplitMergeManager({
  });

  const result = await manager.splitPartition({
    partitionId: 'partition-1',
    partitionService: mockPartitionService,
    tableName: 'test_table',
    tableId: 'test-table',
    primaryKeyColumn: 'id',
  });

  t.equal(result.success, true);
  t.equal(result.leftPartition.keyRange.start, null);
  t.equal(result.rightPartition.keyRange.end, null);

  manager.shutdown();
});


test('PartitionSplitMergeManager - mergePartitions combines adjacent partitions', async (t) => {
  const keyRangeManager = new KeyRangeManager('test-table');
  keyRangeManager.addPartition('partition-1', new KeyRange(null, 50));
  keyRangeManager.addPartition('partition-2', new KeyRange(50, null));

  const manager = new PartitionSplitMergeManager({
    keyRangeManager,
  });

  const result = await manager.mergePartitions({
    leftPartitionId: 'partition-1',
    rightPartitionId: 'partition-2',
    tableId: 'test-table',
  });

  t.equal(result.success, true);
  t.equal(result.leftPartitionId, 'partition-1');
  t.equal(result.rightPartitionId, 'partition-2');
  t.ok(result.mergedPartition.partitionId);
  t.equal(result.mergedPartition.keyRange.start, null);
  t.equal(result.mergedPartition.keyRange.end, null);

  // Verify key range manager was updated
  t.equal(keyRangeManager.getPartitionCount(), 1);
  t.equal(keyRangeManager.getRange('partition-1'), null);
  t.equal(keyRangeManager.getRange('partition-2'), null);

  manager.shutdown();
});

test('PartitionSplitMergeManager - mergePartitions rejects non-adjacent partitions', async (t) => {
  const keyRangeManager = new KeyRangeManager('test-table');
  keyRangeManager.addPartition('partition-1', new KeyRange(null, 30));
  keyRangeManager.addPartition('partition-2', new KeyRange(30, 60));
  keyRangeManager.addPartition('partition-3', new KeyRange(60, null));

  const manager = new PartitionSplitMergeManager({
    keyRangeManager,
  });

  // Try to merge non-adjacent partitions
  await t.rejects(
    manager.mergePartitions({
      leftPartitionId: 'partition-1',
      rightPartitionId: 'partition-3', // Not adjacent to partition-1
      tableId: 'test-table',
    }),
    /not adjacent/,
  );

  manager.shutdown();
});

test('PartitionSplitMergeManager - setThresholds updates thresholds', async (t) => {
  const manager = new PartitionSplitMergeManager();

  manager.setThresholds({
    splitStorageThreshold: 5 * 1024 * 1024 * 1024,
    splitTrafficThreshold: 500,
    mergeStorageThreshold: 1 * 1024 * 1024 * 1024,
    mergeTrafficThreshold: 100,
  });

  const thresholds = manager.getThresholds();
  t.equal(thresholds.splitStorageThreshold, 5 * 1024 * 1024 * 1024);
  t.equal(thresholds.splitTrafficThreshold, 500);
  t.equal(thresholds.mergeStorageThreshold, 1 * 1024 * 1024 * 1024);
  t.equal(thresholds.mergeTrafficThreshold, 100);

  manager.shutdown();
});

test('PartitionSplitMergeManager - validateRangeIntegrity catches violations', async (t) => {
  const manager = new PartitionSplitMergeManager();

  const originalRange = new KeyRange(null, null);
  const leftRange = new KeyRange(null, 50);
  const rightRange = new KeyRange(50, null);

  // Valid split - should not throw
  manager.validateRangeIntegrity(leftRange, rightRange, originalRange);
  t.pass('Valid split passed validation');

  // Invalid: left start doesn't match original start
  const badLeftRange = new KeyRange(10, 50);
  t.throws(() => {
    manager.validateRangeIntegrity(badLeftRange, rightRange, originalRange);
  }, /left start/);

  // Invalid: right end doesn't match original end
  const badRightRange = new KeyRange(50, 100);
  t.throws(() => {
    manager.validateRangeIntegrity(leftRange, badRightRange, originalRange);
  }, /right end/);

  manager.shutdown();
});

test('PartitionSplitMergeManager - splitPartition fails with insufficient rows', async (t) => {
  const keyRangeManager = new KeyRangeManager('test-table');
  keyRangeManager.addPartition('partition-1', KeyRange.fullRange());

  const mockPartitionService = {
    executeQuery: async (sql) => {
      if (sql.includes('COUNT')) {
        return {rows: [{total: 1}]}; // Only 1 row
      }
      return {rows: []};
    },
    getKeyRange: () => ({start: null, end: null}),
  };

  const manager = new PartitionSplitMergeManager({
    keyRangeManager,
  });

  await t.rejects(
    manager.splitPartition({
      partitionId: 'partition-1',
      partitionService: mockPartitionService,
      tableName: 'test_table',
      tableId: 'test-table',
      primaryKeyColumn: 'id',
    }),
    /insufficient rows/,
  );

  manager.shutdown();
});

test('PartitionSplitMergeManager - emits events during split', async (t) => {
  const keyRangeManager = new KeyRangeManager('test-table');
  keyRangeManager.addPartition('partition-1', KeyRange.fullRange());

  const mockPartitionService = {
    executeQuery: async (sql) => {
      if (sql.includes('COUNT')) {
        return {rows: [{total: 100}]};
      }
      return {rows: [{id: 50}]};
    },
    getKeyRange: () => ({start: null, end: null}),
  };

  const manager = new PartitionSplitMergeManager({
    keyRangeManager,
  });

  const events = [];
  manager.on('splitStarted', (data) => events.push({type: 'started', data}));
  manager.on('splitCompleted', (data) => events.push({type: 'completed', data}));

  await manager.splitPartition({
    partitionId: 'partition-1',
    partitionService: mockPartitionService,
    tableName: 'test_table',
    tableId: 'test-table',
    primaryKeyColumn: 'id',
  });

  t.equal(events.length, 2);
  t.equal(events[0].type, 'started');
  t.equal(events[0].data.partitionId, 'partition-1');
  t.equal(events[1].type, 'completed');
  t.equal(events[1].data.success, true);

  manager.shutdown();
});

test('PartitionSplitMergeManager - emits events during merge', async (t) => {
  const keyRangeManager = new KeyRangeManager('test-table');
  keyRangeManager.addPartition('partition-1', new KeyRange(null, 50));
  keyRangeManager.addPartition('partition-2', new KeyRange(50, null));

  const manager = new PartitionSplitMergeManager({
    keyRangeManager,
  });

  const events = [];
  manager.on('mergeStarted', (data) => events.push({type: 'started', data}));
  manager.on('mergeCompleted', (data) => events.push({type: 'completed', data}));

  await manager.mergePartitions({
    leftPartitionId: 'partition-1',
    rightPartitionId: 'partition-2',
    tableId: 'test-table',
  });

  t.equal(events.length, 2);
  t.equal(events[0].type, 'started');
  t.equal(events[1].type, 'completed');
  t.equal(events[1].data.success, true);

  manager.shutdown();
});

test('PartitionSplitMergeManager - evaluates managed cache-backed partitions and executes splits',
  async (t) => {
    const executedPartitionIds = [];
    const manager = new PartitionSplitMergeManager({
      listPartitions: async () => ([
        {
          partition_id: 'users-p1',
          table_id: 'tbl-users',
          partition_key_start: null,
          partition_key_end: null,
          size_bytes: 128,
        },
      ]),
      getPartitionMetrics: async (_partitionId, partition) => ({
        sizeBytes: partition.size_bytes,
      }),
      executeSplitCandidate: async (partitionId) => {
        executedPartitionIds.push(partitionId);
        return {success: true, partitionId};
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {splitStorageThreshold: 64};
        },
      },
    });

    const results = await manager.evaluateAllPartitions();

    t.equal(results.partitionsEvaluated, 1);
    t.same(results.splitCandidates, ['users-p1']);
    t.same(executedPartitionIds, ['users-p1']);
    t.equal(results.executedSplits.length, 1);

    manager.shutdown();
  });

test('PartitionSplitMergeManager - allows managed execution callback to invoke split ' +
  'during evaluation', async (t) => {
  const keyRangeManager = new KeyRangeManager('tbl-users');
  keyRangeManager.addPartition('users-p1', KeyRange.fullRange());

  const mockPartitionService = {
    executeQuery: async (sql) => {
      if (sql.includes('COUNT')) {
        return {rows: [{total: 100}]};
      }
      return {rows: [{id: 50}]};
    },
    getKeyRange: () => ({start: null, end: null}),
  };

  let manager = null;
  manager = new PartitionSplitMergeManager({
    keyRangeManager,
    listPartitions: async () => ([
      {
        partition_id: 'users-p1',
        table_id: 'tbl-users',
        partition_key_start: null,
        partition_key_end: null,
        size_bytes: 128,
      },
    ]),
    getPartitionMetrics: async (_partitionId, partition) => ({
      sizeBytes: partition.size_bytes,
    }),
    executeSplitCandidate: async (partitionId) => manager.splitPartition({
      partitionId,
      partitionService: mockPartitionService,
      tableName: 'users',
      tableId: 'tbl-users',
      primaryKeyColumn: 'id',
    }),
    tablePolicyService: {
      async getPolicyForPartition() {
        return {splitStorageThreshold: 64};
      },
    },
  });

  const results = await manager.evaluateAllPartitions();

  t.same(results.splitErrors, []);
  t.equal(results.executedSplits.length, 1);
  t.equal(results.executedSplits[0].success, true);
  t.equal(keyRangeManager.getPartitionCount(), 2);
  t.equal(manager.getState(), OperationState.IDLE);

  manager.shutdown();
});

test('PartitionSplitMergeManager - records unsuccessful managed split executions as errors',
  async (t) => {
    const manager = new PartitionSplitMergeManager({
      listPartitions: async () => ([
        {
          partition_id: 'users-p1',
          table_id: 'tbl-users',
          partition_key_start: null,
          partition_key_end: null,
          size_bytes: 128,
        },
      ]),
      getPartitionMetrics: async (_partitionId, partition) => ({
        sizeBytes: partition.size_bytes,
      }),
      executeSplitCandidate: async (partitionId) => ({
        success: false,
        partitionId,
        error: 'timed out waiting for split quorum',
      }),
      tablePolicyService: {
        async getPolicyForPartition() {
          return {splitStorageThreshold: 64};
        },
      },
    });

    const results = await manager.evaluateAllPartitions();

    t.equal(
      results.executedSplits.length,
      0,
      'unsuccessful managed execution should not be reported as completed split',
    );
    t.equal(results.splitErrors.length, 1);
    t.equal(results.splitErrors[0]?.partitionId, 'users-p1');
    t.match(results.splitErrors[0]?.error || '', /timed out/);

    manager.shutdown();
  });

test('PartitionSplitMergeManager - records deferred managed split executions as deferred',
  async (t) => {
    const manager = new PartitionSplitMergeManager({
      listPartitions: async () => ([
        {
          partition_id: 'users-p1',
          table_id: 'tbl-users',
          partition_key_start: null,
          partition_key_end: null,
          size_bytes: 128,
        },
      ]),
      getPartitionMetrics: async (_partitionId, partition) => ({
        sizeBytes: partition.size_bytes,
      }),
      executeSplitCandidate: async (partitionId) => ({
        success: false,
        partitionId,
        state: 'deferred',
        workflowId: 'split-tbl-users-users-p1-v2',
      }),
      tablePolicyService: {
        async getPolicyForPartition() {
          return {splitStorageThreshold: 64};
        },
      },
    });

    const results = await manager.evaluateAllPartitions();

    t.equal(results.executedSplits.length, 0);
    t.equal(results.splitErrors.length, 0);
    t.equal(results.splitDeferred.length, 1);
    t.equal(results.splitDeferred[0]?.partitionId, 'users-p1');
    t.equal(results.splitDeferred[0]?.reason, 'deferred');

    manager.shutdown();
  });

test('PartitionSplitMergeManager - schedules deferred managed split retries ' +
  'from persisted retry windows', async (t) => {
  let executionCalls = 0;
  let evaluationCalls = 0;
  const retryDueAt = new Date(Date.now() + 15).toISOString();

  const manager = new PartitionSplitMergeManager({
    reactiveEvaluationDebounceMs: 0,
    listPartitions: async () => ([
      {
        partition_id: 'users-p1',
        table_id: 'tbl-users',
        partition_key_start: null,
        partition_key_end: null,
        size_bytes: 128,
      },
    ]),
    getPartitionMetrics: async (_partitionId, partition) => ({
      sizeBytes: partition.size_bytes,
    }),
    executeSplitCandidate: async (partitionId) => {
      executionCalls += 1;
      if (executionCalls === 1) {
        return {
          success: false,
          partitionId,
          state: 'deferred',
          retryScheduled: true,
          nextAttemptAt: retryDueAt,
        };
      }
      return {
        success: true,
        partitionId,
      };
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {splitStorageThreshold: 64};
      },
    },
  });
  const evaluateAllPartitions = manager.evaluateAllPartitions.bind(manager);
  manager.evaluateAllPartitions = async (...args) => {
    evaluationCalls += 1;
    return evaluateAllPartitions(...args);
  };

  const firstPass = await manager.evaluateAllPartitions();
  t.equal(firstPass.splitDeferred.length, 1);
  t.equal(firstPass.executedSplits.length, 0);

  await new Promise((resolve) => setTimeout(resolve, 50));
  await new Promise((resolve) => setImmediate(resolve));

  t.equal(executionCalls, 2, 'retry window should trigger one follow-up split attempt');
  t.ok(evaluationCalls >= 2, 'retry window should trigger a reactive re-evaluation');
  const diagnostics = manager.getEvaluationDiagnostics();
  t.equal(diagnostics.deferredRetryEvaluationPending, false);

  manager.shutdown();
});

test('PartitionSplitMergeManager - limits automatic split execution per ' +
  'evaluation to preserve one control-plane execution lane', async (t) => {
    const executedPartitionIds = [];
    const manager = new PartitionSplitMergeManager({
      listPartitions: async () => ([
        {
          partition_id: 'users-p1',
          table_id: 'tbl-users',
          partition_key_start: null,
          partition_key_end: 100,
          size_bytes: 128,
        },
        {
          partition_id: 'users-p2',
          table_id: 'tbl-users',
          partition_key_start: 100,
          partition_key_end: null,
          size_bytes: 128,
        },
      ]),
      getPartitionMetrics: async (_partitionId, partition) => ({
        sizeBytes: partition.size_bytes,
      }),
      maxAutoExecuteSplitsPerEvaluation: 1,
      executeSplitCandidate: async (partitionId) => {
        executedPartitionIds.push(partitionId);
        return {
          success: true,
          partitionId,
          workflowId: `wf-${partitionId}`,
        };
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {splitStorageThreshold: 64};
        },
      },
    });

    const results = await manager.evaluateAllPartitions();

    t.same(
      executedPartitionIds,
      ['users-p1'],
      'only the first candidate should be auto-executed in the current evaluation pass',
    );
    t.equal(results.executedSplits.length, 1);
    t.equal(results.splitDeferred.length, 1);
    t.equal(
      results.splitDeferred[0]?.partitionId,
      'users-p2',
      'overflow split candidates should be deferred rather than executed immediately',
    );
    t.equal(
      results.splitDeferred[0]?.reason,
      'control_plane_backpressure',
      'overflow split candidates should carry the stable control-plane backpressure reason',
    );

    manager.shutdown();
  });

test('PartitionSplitMergeManager - coalesces reactive evaluation requests',
  async (t) => {
    let evaluateCalls = 0;
    const manager = new PartitionSplitMergeManager({
      reactiveEvaluationDebounceMs: 0,
    });
    manager.evaluateAllPartitions = async () => {
      evaluateCalls += 1;
      return {evaluated: true};
    };

    manager.requestEvaluation({
      reasonCode: 'partition_size_changed',
      partitionId: 'users-p1',
    });
    manager.requestEvaluation({
      reasonCode: 'table_policy_changed',
      partitionId: 'users-p2',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(
      evaluateCalls,
      1,
      'bursty cache triggers should collapse into one evaluation',
    );

    manager.shutdown();
  });

test('PartitionSplitMergeManager - retries reactive evaluation once busy ' +
  'state clears', async (t) => {
    let evaluateCalls = 0;
    const manager = new PartitionSplitMergeManager({
      reactiveEvaluationDebounceMs: 0,
    });
    manager.evaluateAllPartitions = async () => {
      evaluateCalls += 1;
      return {evaluated: true};
    };

    manager.state = OperationState.EVALUATING;
    manager.requestEvaluation({
      reasonCode: 'partition_size_changed',
      partitionId: 'users-p1',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    manager.state = OperationState.IDLE;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(
      evaluateCalls,
      1,
      'requested evaluation should run once the manager returns to idle',
    );

    manager.shutdown();
  });

test('PartitionSplitMergeManager - exposes split evaluation diagnostics',
  async (t) => {
    const manager = new PartitionSplitMergeManager({
      reactiveEvaluationDebounceMs: 0,
    });

    manager.requestEvaluation({
      reasonCode: 'write_activity',
      partitionId: 'users-p1',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setImmediate(resolve));

    const diagnostics = manager.getEvaluationDiagnostics();
    t.equal(diagnostics.lastTrigger, 'reactive_request');
    t.equal(diagnostics.inFlight, false);
    t.equal(diagnostics.requestedEvaluationPending, false);
    t.equal(diagnostics.lastSummary.evaluated, true);
    t.equal(diagnostics.lastSummary.partitionsEvaluated, 0);
    t.equal(diagnostics.lastSummary.splitCandidateCount, 0);
    t.equal(diagnostics.lastSummary.executedSplitCount, 0);
    t.equal(diagnostics.lastSummary.splitDeferredCount, 0);
    t.equal(diagnostics.lastSummary.mergeCandidateCount, 0);
    t.same(diagnostics.requestedReasonCodes, []);
    t.same(diagnostics.requestedPartitionIds, []);

    manager.shutdown();
  });
