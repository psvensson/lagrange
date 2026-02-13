/**
 * Tests for split/merge capacity preflight integration.
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  PartitionSplitMergeManager,
} from '../../src/partition/partition-split-merge-manager.js';
import {
  KeyRange,
  KeyRangeManager,
} from '../../src/partition/key-range-manager.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';
import {
  COLUMN,
  NUM,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  ADMISSION_DECISION,
  ADMISSION_MODE,
  ADMISSION_REASON,
  STORAGE_CAPACITY_DEFAULT,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {
  StorageCapacityAccountingService,
} from '../../src/rebalancer/storage-capacity-accounting-service.js';
import {
  StorageAdmissionService,
} from '../../src/rebalancer/storage-admission-service.js';
import {
  SPLIT_MERGE_EVENT,
  SPLIT_MERGE_REASON,
} from '../../src/partition/partition-constants.js';

function insertRow(cache, tableName, row) {
  cache.applySystemTableChange(
    tableName,
    CDC_OPERATION.INSERT,
    row,
  );
}

function initConfig(overrides = {}) {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    rebalancer: {
      minimumReplicaBytes: NUM.TEN,
      partitionReplicaOverheadBytes: NUM.FIVE,
      messageGroupReplicaOverheadBytes: NUM.TWO,
      serviceReplicaOverheadBytes: NUM.ONE,
      storageSoftPressurePercent:
        STORAGE_CAPACITY_DEFAULT.SOFT_PRESSURE_PERCENT,
      storageHardPressurePercent:
        STORAGE_CAPACITY_DEFAULT.HARD_PRESSURE_PERCENT,
      storageEmergencyHeadroomPercent:
        STORAGE_CAPACITY_DEFAULT.EMERGENCY_HEADROOM_PERCENT,
      splitAmplificationFactor:
        STORAGE_CAPACITY_DEFAULT.SPLIT_AMPLIFICATION_FACTOR,
      storageAdmissionMode: ADMISSION_MODE.ENFORCE,
      ...overrides,
    },
  });
}

function buildServices(nodeId, budgetBytes) {
  const cache = new SystemTableCache();
  const accounting = new StorageCapacityAccountingService({
    systemTableCache: cache,
  });
  accounting.initialize({systemTableCache: cache});

  insertRow(cache, TABLES.NODES, {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STORAGE_BUDGET_BYTES]: budgetBytes,
  });

  const admission = new StorageAdmissionService({
    accountingService: accounting,
  });

  return {cache, accounting, admission};
}

function buildManager(options = {}) {
  const keyRangeManager = new KeyRangeManager('test-table');
  keyRangeManager.addPartition(
    'partition-1', KeyRange.fullRange());

  const metricsMap = options.metricsMap || {
    'partition-1': {
      sizeBytes: 11 * 1024 * 1024 * 1024,
      queriesPerMinute: 100,
    },
  };

  const manager = new PartitionSplitMergeManager({
    keyRangeManager,
    getPartitionMetrics: async (id) => metricsMap[id] || {},
    tablePolicyService: {
      getPolicyForPartition: async () => ({}),
    },
    storageAdmissionService: options.admission || null,
    storageAccountingService: options.accounting || null,
  });

  return {manager, keyRangeManager};
}

beforeEach(() => {
  initConfig();
  const logger = LoggingService.getInstance();
  if (!logger.isInitialized()) {
    logger.initialize({level: 'error'});
  }
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

// --- checkSplitCapacityPreflight ---

test('checkSplitCapacityPreflight - returns feasible when no ' +
    'admission service wired', async (t) => {
  const {manager} = buildManager();

  const result = await manager.checkSplitCapacityPreflight(
    'partition-1', {sizeBytes: 100}, 'node-1',
  );

  t.equal(result.feasible, true);
  t.equal(result.reason, SPLIT_MERGE_REASON.CAPACITY_AVAILABLE);
  t.equal(result.admissionResult, null);
  manager.shutdown();
});

test('checkSplitCapacityPreflight - allows when node has ' +
    'sufficient capacity', async (t) => {
  const {accounting, admission} =
    buildServices('node-1', NUM.THOUSAND * NUM.THOUSAND);
  const {manager} = buildManager({accounting, admission});

  const result = await manager.checkSplitCapacityPreflight(
    'partition-1', {sizeBytes: 100}, 'node-1',
  );

  t.equal(result.feasible, true);
  t.equal(result.reason, SPLIT_MERGE_REASON.CAPACITY_AVAILABLE);
  t.equal(
    result.admissionResult.decision, ADMISSION_DECISION.ALLOW);
  manager.shutdown();
});

test('checkSplitCapacityPreflight - denies when node budget ' +
    'would be exceeded', async (t) => {
  // Budget is tiny; split with amplification will exceed it.
  const {accounting, admission} =
    buildServices('node-1', NUM.TEN);
  const {manager} = buildManager({accounting, admission});

  const result = await manager.checkSplitCapacityPreflight(
    'partition-1', {sizeBytes: 100}, 'node-1',
  );

  t.equal(result.feasible, false);
  t.equal(
    result.reason, SPLIT_MERGE_REASON.INSUFFICIENT_CAPACITY);
  t.equal(
    result.admissionResult.decision, ADMISSION_DECISION.DENY);
  manager.shutdown();
});

test('checkSplitCapacityPreflight - applies amplification ' +
    'factor to estimate', async (t) => {
  // Default amplification = 2. Minimum replica = 10, overhead = 5.
  // estimate = (max(sizeBytes, 10) + 5) * 2
  // For sizeBytes=100: (100 + 5) * 2 = 210
  // Budget 300 -> 210/300 = 70% -> below hard (85%) -> allow
  const {accounting, admission} =
    buildServices('node-1', 300);
  const {manager} = buildManager({accounting, admission});

  const result = await manager.checkSplitCapacityPreflight(
    'partition-1', {sizeBytes: 100}, 'node-1',
  );

  t.equal(result.feasible, true);
  t.equal(
    result.admissionResult.projectedUtilization.estimatedBytes,
    210,
  );
  manager.shutdown();
});

test('checkSplitCapacityPreflight - uses configurable ' +
    'amplification factor', async (t) => {
  initConfig({splitAmplificationFactor: 3});
  // estimate = (max(100, 10) + 5) * 3 = 315
  // Budget 300 -> 315/300 = 105% -> exceeds budget -> deny
  const {accounting, admission} =
    buildServices('node-1', 300);
  const {manager} = buildManager({accounting, admission});

  const result = await manager.checkSplitCapacityPreflight(
    'partition-1', {sizeBytes: 100}, 'node-1',
  );

  t.equal(result.feasible, false);
  t.equal(
    result.reason, SPLIT_MERGE_REASON.INSUFFICIENT_CAPACITY);
  manager.shutdown();
});

// --- evaluateAllPartitions with capacity preflight ---

test('evaluateAllPartitions - defers split when capacity ' +
    'insufficient', async (t) => {
  const {accounting, admission} =
    buildServices('node-1', NUM.TEN);
  const {manager} = buildManager({accounting, admission});

  const results = await manager.evaluateAllPartitions({
    targetNodeId: 'node-1',
  });

  t.equal(results.evaluated, true);
  t.equal(results.splitCandidates.length, NUM.ZERO);
  t.equal(results.splitDeferred.length, NUM.ONE);
  t.equal(results.splitDeferred[0].partitionId, 'partition-1');
  t.equal(
    results.splitDeferred[0].reason,
    SPLIT_MERGE_REASON.INSUFFICIENT_CAPACITY,
  );
  manager.shutdown();
});

test('evaluateAllPartitions - allows split when capacity ' +
    'available', async (t) => {
  // 11GB partition * amplification 2 + overhead = ~22GB needed.
  // Budget must be large enough to stay below hard pressure.
  const largeBudget = 100 * 1024 * 1024 * 1024;
  const {accounting, admission} =
    buildServices('node-1', largeBudget);
  const {manager} = buildManager({accounting, admission});

  const results = await manager.evaluateAllPartitions({
    targetNodeId: 'node-1',
  });

  t.equal(results.splitCandidates.length, NUM.ONE);
  t.equal(results.splitDeferred.length, NUM.ZERO);
  t.equal(results.splitCandidates[0], 'partition-1');
  manager.shutdown();
});

test('evaluateAllPartitions - skips preflight when no ' +
    'targetNodeId provided', async (t) => {
  const {accounting, admission} =
    buildServices('node-1', NUM.TEN);
  const {manager} = buildManager({accounting, admission});

  // Without targetNodeId, preflight is skipped
  const results = await manager.evaluateAllPartitions();

  t.equal(results.splitCandidates.length, NUM.ONE);
  t.equal(results.splitDeferred.length, NUM.ZERO);
  manager.shutdown();
});

test('evaluateAllPartitions - emits splitDeferred event on ' +
    'deferral', async (t) => {
  const {accounting, admission} =
    buildServices('node-1', NUM.TEN);
  const {manager} = buildManager({accounting, admission});

  const events = [];
  manager.on(SPLIT_MERGE_EVENT.SPLIT_DEFERRED, (data) => {
    events.push(data);
  });

  await manager.evaluateAllPartitions({
    targetNodeId: 'node-1',
  });

  t.equal(events.length, NUM.ONE);
  t.equal(events[0].partitionId, 'partition-1');
  t.equal(
    events[0].reason,
    SPLIT_MERGE_REASON.INSUFFICIENT_CAPACITY,
  );
  manager.shutdown();
});

// --- Merge eligibility under pressure (Req 7.3) ---

test('evaluateAllPartitions - merge candidates remain eligible ' +
    'under capacity pressure', async (t) => {
  // Use tiny budget to simulate hard pressure
  const {accounting, admission} =
    buildServices('node-1', NUM.TEN);

  const keyRangeManager = new KeyRangeManager('test-table');
  keyRangeManager.addPartition(
    'partition-left', new KeyRange(null, 50));
  keyRangeManager.addPartition(
    'partition-right', new KeyRange(50, null));

  const metricsMap = {
    'partition-left': {
      sizeBytes: 500 * 1024 * 1024,
      queriesPerMinute: 50,
    },
    'partition-right': {
      sizeBytes: 500 * 1024 * 1024,
      queriesPerMinute: 50,
    },
  };

  const manager = new PartitionSplitMergeManager({
    keyRangeManager,
    getPartitionMetrics: async (id) => metricsMap[id] || {},
    tablePolicyService: {
      getPolicyForPartition: async () => ({}),
    },
    storageAdmissionService: admission,
    storageAccountingService: accounting,
  });

  const results = await manager.evaluateAllPartitions({
    targetNodeId: 'node-1',
  });

  // Merges are never blocked by capacity pressure
  t.equal(results.mergeCandidates.length, NUM.ONE);
  t.equal(results.mergeCandidates[0].leftId, 'partition-left');
  t.equal(
    results.mergeCandidates[0].rightId, 'partition-right');
  manager.shutdown();
});

// --- Property-based tests ---

test('PBT: split preflight never allows when budget would be ' +
    'exceeded', async (t) => {
  /**
   * Validates: Requirements 7.1, 7.2
   *
   * When split capacity preflight returns feasible=true, the
   * projected utilization must be below the hard pressure
   * threshold. Splits that would exceed budget are always
   * deferred.
   */
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 10000}),
      fc.integer({min: 1, max: 5000}),
      async (budget, sizeBytes) => {
        initConfig();
        const {accounting, admission} =
          buildServices('pbt-node', budget);
        const {manager} = buildManager({accounting, admission});

        const result =
          await manager.checkSplitCapacityPreflight(
            'partition-1', {sizeBytes}, 'pbt-node',
          );

        if (result.feasible) {
          const proj = result.admissionResult
            .projectedUtilization;
          const withinBudget =
            proj.projectedUtilizationPercent <
            STORAGE_CAPACITY_DEFAULT.HARD_PRESSURE_PERCENT;
          manager.shutdown();
          return withinBudget;
        }
        manager.shutdown();
        return true;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Split preflight never allows over-budget');
});

test('PBT: split preflight is deterministic for identical ' +
    'inputs', async (t) => {
  /**
   * Validates: Requirements 7.4
   *
   * Given the same budget, sizeBytes, and amplification factor,
   * split preflight must return the same feasibility decision.
   */
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 10000}),
      fc.integer({min: 1, max: 5000}),
      async (budget, sizeBytes) => {
        initConfig();
        const {accounting, admission} =
          buildServices('det-node', budget);
        const {manager} = buildManager({accounting, admission});

        const r1 =
          await manager.checkSplitCapacityPreflight(
            'partition-1', {sizeBytes}, 'det-node',
          );
        const r2 =
          await manager.checkSplitCapacityPreflight(
            'partition-1', {sizeBytes}, 'det-node',
          );

        manager.shutdown();
        return r1.feasible === r2.feasible &&
               r1.reason === r2.reason;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Split preflight is deterministic');
});
