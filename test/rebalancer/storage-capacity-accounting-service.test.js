/**
 * Tests for StorageCapacityAccountingService.
 * Requirements: 2.2, 2.3, 2.4, 8.1
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';
import {
  COLUMN,
  NUM,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  PRESSURE_STATE,
  RESERVATION_STATUS,
  STORAGE_CAPACITY_DEFAULT,
  STORAGE_CAPACITY_ERROR_MSG,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  StorageCapacityAccountingService,
} from '../../src/rebalancer/storage-capacity-accounting-service.js';

function initializeConfig(overrides = {}) {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    rebalancer: {
      minimumReplicaBytes: NUM.TEN,
      partitionReplicaOverheadBytes: NUM.FIVE,
      messageGroupReplicaOverheadBytes: 2,
      serviceReplicaOverheadBytes: 1,
      ...overrides,
    },
  });
}

function insertRow(cache, tableName, row) {
  cache.applySystemTableChange(
    tableName,
    CDC_OPERATION.INSERT,
    row,
  );
}

// --- estimateReplicaBytes ---

test('estimateReplicaBytes - applies minimum, overhead, and amplification',
  async (t) => {
    initializeConfig();
    const service = new StorageCapacityAccountingService();

    const estimate = service.estimateReplicaBytes({
      entityType: SERVICE_TYPE.PARTITION,
      sizeBytes: 1,
      amplificationFactor: 2,
    });

    // min(1, 10) = 10, + overhead 5 = 15, * 2 = 30
    const expected = Math.ceil(
      (Math.max(1, NUM.TEN) + NUM.FIVE) * 2,
    );
    t.equal(estimate, expected);
    t.end();
  });

test('estimateReplicaBytes - uses payload when larger than minimum',
  async (t) => {
    initializeConfig();
    const service = new StorageCapacityAccountingService();

    const estimate = service.estimateReplicaBytes({
      entityType: SERVICE_TYPE.PARTITION,
      sizeBytes: NUM.HUNDRED,
    });

    // max(100, 10) = 100, + overhead 5 = 105, * 1 = 105
    t.equal(estimate, NUM.HUNDRED + NUM.FIVE);
    t.end();
  });

test('estimateReplicaBytes - message group overhead',
  async (t) => {
    initializeConfig();
    const service = new StorageCapacityAccountingService();

    const estimate = service.estimateReplicaBytes({
      entityType: SERVICE_TYPE.MESSAGE_GROUP,
      sizeBytes: 0,
    });

    // max(0, 10) = 10, + overhead 2 = 12
    t.equal(estimate, NUM.TEN + 2);
    t.end();
  });

test('estimateReplicaBytes - wasm service overhead',
  async (t) => {
    initializeConfig();
    const service = new StorageCapacityAccountingService();

    const estimate = service.estimateReplicaBytes({
      entityType: SERVICE_TYPE.WASM_SERVICE,
      sizeBytes: 0,
    });

    // max(0, 10) = 10, + overhead 1 = 11
    t.equal(estimate, NUM.TEN + 1);
    t.end();
  });

test('estimateReplicaBytes - invalid sizeBytes defaults to zero',
  async (t) => {
    initializeConfig();
    const service = new StorageCapacityAccountingService();

    const estimate = service.estimateReplicaBytes({
      entityType: SERVICE_TYPE.PARTITION,
      sizeBytes: NaN,
    });

    // max(0, 10) = 10, + overhead 5 = 15
    t.equal(estimate, NUM.TEN + NUM.FIVE);
    t.end();
  });

test('getCapacitySnapshotForNodeSync derives capacity from cache-backed tables',
  async (t) => {
    initializeConfig();
    const cache = new SystemTableCache();
    insertRow(cache, TABLES.NODES, {
      [COLUMN.NODE_ID]: 'node-sync',
      [COLUMN.STORAGE_BUDGET_BYTES]: 1000,
      [COLUMN.STATUS]: 'active',
    });
    insertRow(cache, TABLES.PARTITIONS, {
      [COLUMN.PARTITION_ID]: 'part-1',
      [COLUMN.SIZE_BYTES]: 100,
    });
    insertRow(cache, TABLES.SERVICES, {
      [COLUMN.SERVICE_ID]: 'svc-sync',
      [COLUMN.NODE_ID]: 'node-sync',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: 'part-1',
      [COLUMN.STATUS]: 'active',
    });

    const service = new StorageCapacityAccountingService({
      systemTableCache: cache,
    });

    const snapshot = service.getCapacitySnapshotForNodeSync('node-sync');

    t.equal(snapshot.nodeId, 'node-sync');
    t.equal(snapshot.budgetBytes, 1000);
    t.equal(snapshot.pressureState, PRESSURE_STATE.NORMAL);
    t.ok(snapshot.budgetBytes > 0,
      'sync capacity snapshot should derive a positive budget from cached capacity');
    t.end();
  });

test('estimateReplicaBytes - negative sizeBytes defaults to zero',
  async (t) => {
    initializeConfig();
    const service = new StorageCapacityAccountingService();

    const estimate = service.estimateReplicaBytes({
      entityType: SERVICE_TYPE.PARTITION,
      sizeBytes: -1,
    });

    // max(0, 10) = 10, + overhead 5 = 15
    t.equal(estimate, NUM.TEN + NUM.FIVE);
    t.end();
  });

test('estimateReplicaBytes - invalid amplification defaults to 1',
  async (t) => {
    initializeConfig();
    const service = new StorageCapacityAccountingService();

    const estimate = service.estimateReplicaBytes({
      entityType: SERVICE_TYPE.PARTITION,
      sizeBytes: NUM.TEN,
      amplificationFactor: -1,
    });

    // max(10, 10) = 10, + overhead 5 = 15, * 1 = 15
    t.equal(estimate, NUM.TEN + NUM.FIVE);
    t.end();
  });

// --- getPressureState ---

test('getPressureState - normal when utilization below soft threshold',
  async (t) => {
    initializeConfig();
    const service = new StorageCapacityAccountingService();

    // Default soft = 70%, so 50/100 = 50% -> normal
    const state = service.getPressureState(NUM.FIVE * NUM.TEN, NUM.HUNDRED);
    t.equal(state, PRESSURE_STATE.NORMAL);
    t.end();
  });

test('getPressureState - soft when at soft threshold',
  async (t) => {
    initializeConfig();
    const service = new StorageCapacityAccountingService();

    // 70/100 = 70% = soft threshold
    const allocated = STORAGE_CAPACITY_DEFAULT.SOFT_PRESSURE_PERCENT;
    const state = service.getPressureState(allocated, NUM.HUNDRED);
    t.equal(state, PRESSURE_STATE.SOFT);
    t.end();
  });

test('getPressureState - hard when at hard threshold',
  async (t) => {
    initializeConfig();
    const service = new StorageCapacityAccountingService();

    // 85/100 = 85% = hard threshold
    const allocated = STORAGE_CAPACITY_DEFAULT.HARD_PRESSURE_PERCENT;
    const state = service.getPressureState(allocated, NUM.HUNDRED);
    t.equal(state, PRESSURE_STATE.HARD);
    t.end();
  });

test('getPressureState - exhausted at 100%',
  async (t) => {
    initializeConfig();
    const service = new StorageCapacityAccountingService();

    const state = service.getPressureState(NUM.HUNDRED, NUM.HUNDRED);
    t.equal(state, PRESSURE_STATE.EXHAUSTED);
    t.end();
  });

test('getPressureState - exhausted when budget is null',
  async (t) => {
    initializeConfig();
    const service = new StorageCapacityAccountingService();

    const state = service.getPressureState(NUM.TEN, null);
    t.equal(state, PRESSURE_STATE.EXHAUSTED);
    t.end();
  });

test('getPressureState - exhausted when budget is zero',
  async (t) => {
    initializeConfig();
    const service = new StorageCapacityAccountingService();

    const state = service.getPressureState(0, 0);
    t.equal(state, PRESSURE_STATE.EXHAUSTED);
    t.end();
  });

// --- getCapacitySnapshots ---

test('getCapacitySnapshots - returns empty for no nodes',
  async (t) => {
    initializeConfig();
    const cache = new SystemTableCache();
    const service = new StorageCapacityAccountingService({
      systemTableCache: cache,
    });
    service.initialize({systemTableCache: cache});

    const snapshots = await service.getCapacitySnapshots();
    t.equal(snapshots.length, 0);
    t.end();
  });

test('getCapacitySnapshots - computes full snapshot with all entity types',
  async (t) => {
    initializeConfig();
    const cache = new SystemTableCache();
    const service = new StorageCapacityAccountingService({
      systemTableCache: cache,
    });
    service.initialize({systemTableCache: cache});

    const nodeId = 'node-1';
    const partitionId = 'partition-1';
    const now = Date.now();

    insertRow(cache, TABLES.NODES, {
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STORAGE_BUDGET_BYTES]: NUM.HUNDRED,
    });
    insertRow(cache, TABLES.PARTITIONS, {
      [COLUMN.PARTITION_ID]: partitionId,
      [COLUMN.SIZE_BYTES]: NUM.FOUR * NUM.TEN,
    });
    insertRow(cache, TABLES.SERVICES, {
      [COLUMN.SERVICE_ID]: 'svc-1',
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: partitionId,
      [COLUMN.STATUS]: ReplicaStatus.ACTIVE,
    });
    insertRow(cache, TABLES.SERVICES, {
      [COLUMN.SERVICE_ID]: 'svc-2',
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      [COLUMN.STATUS]: ReplicaStatus.ACTIVE,
    });
    insertRow(cache, TABLES.SERVICES, {
      [COLUMN.SERVICE_ID]: 'svc-3',
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.WASM_SERVICE,
      [COLUMN.STATUS]: ReplicaStatus.ACTIVE,
    });
    insertRow(cache, TABLES.STORAGE_RESERVATIONS, {
      [COLUMN.RESERVATION_ID]: 'res-1',
      [COLUMN.TARGET_NODE_ID]: nodeId,
      [COLUMN.ESTIMATED_BYTES]: NUM.TEN,
      [COLUMN.AMPLIFICATION_FACTOR]: 2,
      [COLUMN.STATUS]: RESERVATION_STATUS.ACTIVE,
      [COLUMN.EXPIRES_AT]: now + NUM.THOUSAND,
    });

    const snapshots = await service.getCapacitySnapshots();
    t.equal(snapshots.length, 1);

    const snapshot = snapshots[0];
    // partition: max(40, 10) + 5 = 45
    // message_group: max(0, 10) + 2 = 12
    // wasm_service: max(0, 10) + 1 = 11
    const expectedUsed = 45 + 12 + 11;
    const expectedReserved = Math.ceil(NUM.TEN * 2);
    const expectedAvailable = NUM.HUNDRED - (expectedUsed + expectedReserved);

    t.equal(snapshot.usedBytes, expectedUsed);
    t.equal(snapshot.reservedBytes, expectedReserved);
    t.equal(snapshot.availableBytes, expectedAvailable);
    t.equal(snapshot.pressureState, PRESSURE_STATE.HARD);
    t.end();
  });

test('getCapacitySnapshots - excludes removed services from used bytes',
  async (t) => {
    initializeConfig();
    const cache = new SystemTableCache();
    const service = new StorageCapacityAccountingService({
      systemTableCache: cache,
    });
    service.initialize({systemTableCache: cache});

    insertRow(cache, TABLES.NODES, {
      [COLUMN.NODE_ID]: 'node-1',
      [COLUMN.STORAGE_BUDGET_BYTES]: NUM.THOUSAND,
    });
    insertRow(cache, TABLES.PARTITIONS, {
      [COLUMN.PARTITION_ID]: 'p-1',
      [COLUMN.SIZE_BYTES]: NUM.HUNDRED,
    });
    insertRow(cache, TABLES.SERVICES, {
      [COLUMN.SERVICE_ID]: 'svc-removed',
      [COLUMN.NODE_ID]: 'node-1',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: 'p-1',
      [COLUMN.STATUS]: ReplicaStatus.REMOVED,
    });

    const snapshots = await service.getCapacitySnapshots();
    t.equal(snapshots[0].usedBytes, 0);
    t.end();
  });

test('getCapacitySnapshots - excludes expired reservations',
  async (t) => {
    initializeConfig();
    const cache = new SystemTableCache();
    const service = new StorageCapacityAccountingService({
      systemTableCache: cache,
    });
    service.initialize({systemTableCache: cache});

    insertRow(cache, TABLES.NODES, {
      [COLUMN.NODE_ID]: 'node-1',
      [COLUMN.STORAGE_BUDGET_BYTES]: NUM.THOUSAND,
    });
    insertRow(cache, TABLES.STORAGE_RESERVATIONS, {
      [COLUMN.RESERVATION_ID]: 'res-expired',
      [COLUMN.TARGET_NODE_ID]: 'node-1',
      [COLUMN.ESTIMATED_BYTES]: NUM.HUNDRED,
      [COLUMN.AMPLIFICATION_FACTOR]: 1,
      [COLUMN.STATUS]: RESERVATION_STATUS.ACTIVE,
      [COLUMN.EXPIRES_AT]: 1,
    });

    const snapshots = await service.getCapacitySnapshots();
    t.equal(snapshots[0].reservedBytes, 0);
    t.end();
  });

test('getCapacitySnapshots - excludes released reservations',
  async (t) => {
    initializeConfig();
    const cache = new SystemTableCache();
    const service = new StorageCapacityAccountingService({
      systemTableCache: cache,
    });
    service.initialize({systemTableCache: cache});

    insertRow(cache, TABLES.NODES, {
      [COLUMN.NODE_ID]: 'node-1',
      [COLUMN.STORAGE_BUDGET_BYTES]: NUM.THOUSAND,
    });
    insertRow(cache, TABLES.STORAGE_RESERVATIONS, {
      [COLUMN.RESERVATION_ID]: 'res-released',
      [COLUMN.TARGET_NODE_ID]: 'node-1',
      [COLUMN.ESTIMATED_BYTES]: NUM.HUNDRED,
      [COLUMN.AMPLIFICATION_FACTOR]: 1,
      [COLUMN.STATUS]: RESERVATION_STATUS.RELEASED,
      [COLUMN.EXPIRES_AT]: Date.now() + NUM.THOUSAND,
    });

    const snapshots = await service.getCapacitySnapshots();
    t.equal(snapshots[0].reservedBytes, 0);
    t.end();
  });

// --- getCapacitySnapshotForNode ---

test('getCapacitySnapshotForNode - returns null for missing nodeId',
  async (t) => {
    initializeConfig();
    const cache = new SystemTableCache();
    const service = new StorageCapacityAccountingService({
      systemTableCache: cache,
    });
    service.initialize({systemTableCache: cache});

    const snapshot = await service.getCapacitySnapshotForNode(null);
    t.equal(snapshot, null);
    t.end();
  });

test('getCapacitySnapshotForNode - returns null for unknown node',
  async (t) => {
    initializeConfig();
    const cache = new SystemTableCache();
    const service = new StorageCapacityAccountingService({
      systemTableCache: cache,
    });
    service.initialize({systemTableCache: cache});

    const snapshot = await service.getCapacitySnapshotForNode('no-such-node');
    t.equal(snapshot, null);
    t.end();
  });

test('getCapacitySnapshotForNode - returns snapshot for known node',
  async (t) => {
    initializeConfig();
    const cache = new SystemTableCache();
    const service = new StorageCapacityAccountingService({
      systemTableCache: cache,
    });
    service.initialize({systemTableCache: cache});

    insertRow(cache, TABLES.NODES, {
      [COLUMN.NODE_ID]: 'node-1',
      [COLUMN.STORAGE_BUDGET_BYTES]: NUM.THOUSAND,
    });

    const snapshot = await service.getCapacitySnapshotForNode('node-1');
    t.equal(snapshot.nodeId, 'node-1');
    t.equal(snapshot.budgetBytes, NUM.THOUSAND);
    t.equal(snapshot.usedBytes, 0);
    t.equal(snapshot.reservedBytes, 0);
    t.equal(snapshot.availableBytes, NUM.THOUSAND);
    t.equal(snapshot.pressureState, PRESSURE_STATE.NORMAL);
    t.end();
  });

// --- buildSnapshot edge cases ---

test('buildSnapshot - node without budget returns exhausted',
  async (t) => {
    initializeConfig();
    const cache = new SystemTableCache();
    const service = new StorageCapacityAccountingService({
      systemTableCache: cache,
    });
    service.initialize({systemTableCache: cache});

    insertRow(cache, TABLES.NODES, {
      [COLUMN.NODE_ID]: 'node-no-budget',
    });

    const snapshots = await service.getCapacitySnapshots();
    const snapshot = snapshots[0];
    t.equal(snapshot.budgetBytes, null);
    t.equal(snapshot.availableBytes, 0);
    t.equal(snapshot.pressureState, PRESSURE_STATE.EXHAUSTED);
    t.end();
  });

// --- ensureDataSource ---

test('ensureDataSource - throws when no data source provided',
  async (t) => {
    initializeConfig();
    const service = new StorageCapacityAccountingService();

    t.throws(
      () => service.initialize({}),
      {message: STORAGE_CAPACITY_ERROR_MSG.ACCOUNTING_SOURCE_REQUIRED},
    );
    t.end();
  });

// --- configurable thresholds ---

test('getPressureState - respects custom thresholds',
  async (t) => {
    initializeConfig({
      storageSoftPressurePercent: 50,
      storageHardPressurePercent: 60,
    });

    const service = new StorageCapacityAccountingService();

    // 55% should be soft with custom thresholds (50 soft, 60 hard)
    const state = service.getPressureState(55, NUM.HUNDRED);
    t.equal(state, PRESSURE_STATE.SOFT);
    t.end();
  });

// --- Property-based tests ---

test('PBT: available = budget - used - reserved (accounting invariant)',
  async (t) => {
    /**
     * Validates: Requirements 2.3
     *
     * The accounting invariant: available bytes must equal
     * budget minus used minus reserved, clamped to zero.
     */
    initializeConfig();
    const service = new StorageCapacityAccountingService();

    fc.assert(
      fc.property(
        fc.nat({max: 10000}),
        fc.nat({max: 5000}),
        fc.nat({max: 5000}),
        (budget, used, reserved) => {
          const snapshot = service.buildSnapshot(
            {[COLUMN.NODE_ID]: 'n', [COLUMN.STORAGE_BUDGET_BYTES]: budget},
            used,
            reserved,
          );

          if (budget <= 0) {
            return snapshot.availableBytes === 0;
          }

          const expectedAvailable = Math.max(
            0,
            Math.floor(budget) - (used + reserved),
          );
          return snapshot.availableBytes === expectedAvailable;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Accounting invariant holds');
    t.end();
  });

test('PBT: pressure state is monotonic with utilization',
  async (t) => {
    /**
     * Validates: Requirements 8.1
     *
     * As utilization increases, pressure state must not decrease.
     * Order: normal < soft < hard < exhausted.
     */
    initializeConfig();
    const service = new StorageCapacityAccountingService();

    const stateOrder = {
      [PRESSURE_STATE.NORMAL]: 0,
      [PRESSURE_STATE.SOFT]: 1,
      [PRESSURE_STATE.HARD]: 2,
      [PRESSURE_STATE.EXHAUSTED]: NUM.THREE,
    };

    fc.assert(
      fc.property(
        fc.nat({max: 10000}),
        fc.nat({max: 10000}),
        (allocLow, delta) => {
          const budget = NUM.THOUSAND * NUM.TEN;
          const allocHigh = allocLow + delta;

          const stateLow = service.getPressureState(allocLow, budget);
          const stateHigh = service.getPressureState(allocHigh, budget);

          return stateOrder[stateHigh] >= stateOrder[stateLow];
        },
      ),
      {numRuns: 10},
    );
    t.pass('Pressure state monotonicity holds');
    t.end();
  });

test('PBT: estimateReplicaBytes always >= minimumReplicaBytes + overhead',
  async (t) => {
    /**
     * Validates: Requirements 2.4
     *
     * Estimation must always include at least the minimum replica
     * bytes plus entity-type overhead.
     */
    initializeConfig();
    const service = new StorageCapacityAccountingService();

    const entityTypes = [
      SERVICE_TYPE.PARTITION,
      SERVICE_TYPE.MESSAGE_GROUP,
      SERVICE_TYPE.WASM_SERVICE,
    ];

    fc.assert(
      fc.property(
        fc.nat({max: 100000}),
        fc.constantFrom(...entityTypes),
        (sizeBytes, entityType) => {
          const estimate = service.estimateReplicaBytes({
            entityType,
            sizeBytes,
          });
          const minPayload = service.minimumReplicaBytes;
          const overhead = service.getOverheadBytes(entityType);
          return estimate >= minPayload + overhead;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Estimation floor invariant holds');
    t.end();
  });

test('getCapacitySnapshots - SQL fallback uses injected control-plane ' +
  'system-table gateway', async (t) => {
  initializeConfig();

  const gatewayCalls = [];
  const gatewayRows = {
    [TABLES.NODES]: [{
      [COLUMN.NODE_ID]: 'node-gateway',
      [COLUMN.STORAGE_BUDGET_BYTES]: NUM.HUNDRED,
    }],
    [TABLES.PARTITIONS]: [],
    [TABLES.SERVICES]: [],
    [TABLES.STORAGE_RESERVATIONS]: [],
  };
  const service = new StorageCapacityAccountingService({
    controlPlaneSystemTableGateway: {
      async readRows(tableName, sql) {
        gatewayCalls.push({tableName, sql});
        return {
          success: true,
          rows: gatewayRows[tableName] || [],
        };
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        throw new Error('raw SQL path should not be used');
      },
    },
  });
  service.initialize();

  const snapshots = await service.getCapacitySnapshots();

  t.equal(snapshots.length, 1, 'gateway rows should build a snapshot');
  t.same(
    gatewayCalls.map((call) => call.tableName),
    [
      TABLES.NODES,
      TABLES.PARTITIONS,
      TABLES.SERVICES,
      TABLES.STORAGE_RESERVATIONS,
      // Live-operation consult (finding 4): expiry-aware accounting reads
      // replica_operations to keep a live operation's reservation counted.
      TABLES.REPLICA_OPERATIONS,
    ],
    'gateway should own fallback reads for storage accounting',
  );
});
