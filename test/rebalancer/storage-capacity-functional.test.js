/**
 * Functional test coverage for storage capacity-aware placement.
 *
 * Fills gaps not covered by existing per-component test files.
 * Requirements: 13.1, 13.2, 13.3, 13.4
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
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  ADMISSION_DECISION,
  ADMISSION_MODE,
  ADMISSION_REASON,
  MOVE_CRITICALITY,
  PRESSURE_BEHAVIOR_DECISION,
  PRESSURE_STATE,
  RESERVATION_STATUS,
  STORAGE_CAPACITY_DEFAULT,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {
  StorageCapacityAccountingService,
} from '../../src/rebalancer/storage-capacity-accounting-service.js';
import {
  StorageAdmissionService,
} from '../../src/rebalancer/storage-admission-service.js';
import {
  StoragePressureBehavior,
} from '../../src/rebalancer/storage-pressure-behavior.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

// --- Helpers ---

function initConfig(overrides = {}) {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
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
      storageAdmissionMode: ADMISSION_MODE.ENFORCE,
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

function createAccountingWithCache(cache) {
  const accounting = new StorageCapacityAccountingService({
    systemTableCache: cache,
  });
  accounting.initialize({systemTableCache: cache});
  return accounting;
}

function createAlwaysReadyReadinessService(cache) {
  return {
    getNodeRow(nodeId) {
      return cache.get(TABLES.NODES, nodeId) || null;
    },
    getNodeReadinessSync(nodeId) {
      return {
        nodeId,
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
        },
      };
    },
    async getNodeReadiness(nodeId) {
      return this.getNodeReadinessSync(nodeId);
    },
  };
}

function createAdmissionService(accounting, cache) {
  return new StorageAdmissionService({
    accountingService: accounting,
    systemTableCache: cache,
    controlPlaneReadinessService: createAlwaysReadyReadinessService(cache),
  });
}

function setupNode(cache, nodeId, budgetBytes) {
  insertRow(cache, TABLES.NODES, {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STORAGE_BUDGET_BYTES]: budgetBytes,
  });
}

function addPartitionService(cache, serviceId, nodeId, partId) {
  insertRow(cache, TABLES.SERVICES, {
    [COLUMN.SERVICE_ID]: serviceId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: partId,
    [COLUMN.STATUS]: ReplicaStatus.ACTIVE,
  });
}

function addPartitionSize(cache, partId, sizeBytes) {
  insertRow(cache, TABLES.PARTITIONS, {
    [COLUMN.PARTITION_ID]: partId,
    [COLUMN.SIZE_BYTES]: sizeBytes,
  });
}

function addReservation(cache, resId, nodeId, bytes, opts = {}) {
  insertRow(cache, TABLES.STORAGE_RESERVATIONS, {
    [COLUMN.RESERVATION_ID]: resId,
    [COLUMN.TARGET_NODE_ID]: nodeId,
    [COLUMN.ESTIMATED_BYTES]: bytes,
    [COLUMN.AMPLIFICATION_FACTOR]: opts.amplification || NUM.ONE,
    [COLUMN.STATUS]: opts.status || RESERVATION_STATUS.ACTIVE,
    [COLUMN.EXPIRES_AT]: opts.expiresAt || Date.now() + NUM.THIRTY_THOUSAND,
  });
}

// ============================================================
// Req 13.1: Size estimation edge cases
// ============================================================

test('estimation - zero-size partition uses minimum replica bytes',
  async (t) => {
    initConfig();
    const svc = new StorageCapacityAccountingService();

    const estimate = svc.estimateReplicaBytes({
      entityType: SERVICE_TYPE.PARTITION,
      sizeBytes: NUM.ZERO,
    });

    // max(0, 10) = 10, + overhead 5 = 15
    t.equal(estimate, NUM.TEN + NUM.FIVE);
    t.end();
  });

test('estimation - message_group_replica uses message group overhead',
  async (t) => {
    initConfig();
    const svc = new StorageCapacityAccountingService();

    const estimate = svc.estimateReplicaBytes({
      entityType: SERVICE_TYPE.MESSAGE_GROUP_REPLICA,
      sizeBytes: NUM.ZERO,
    });

    // max(0, 10) = 10, + mg overhead 2 = 12
    t.equal(estimate, NUM.TEN + NUM.TWO);
    t.end();
  });

test('estimation - custom overhead config values are respected',
  async (t) => {
    initConfig({
      partitionReplicaOverheadBytes: NUM.HUNDRED,
      minimumReplicaBytes: NUM.FIVE,
    });
    const svc = new StorageCapacityAccountingService();

    const estimate = svc.estimateReplicaBytes({
      entityType: SERVICE_TYPE.PARTITION,
      sizeBytes: NUM.ONE,
    });

    // max(1, 5) = 5, + overhead 100 = 105
    const expected = NUM.FIVE + NUM.HUNDRED;
    t.equal(estimate, expected);
    t.end();
  });

test('estimation - split amplification factor doubles estimate',
  async (t) => {
    initConfig();
    const svc = new StorageCapacityAccountingService();

    const withoutAmp = svc.estimateReplicaBytes({
      entityType: SERVICE_TYPE.PARTITION,
      sizeBytes: NUM.HUNDRED,
    });
    const withAmp = svc.estimateReplicaBytes({
      entityType: SERVICE_TYPE.PARTITION,
      sizeBytes: NUM.HUNDRED,
      amplificationFactor: STORAGE_CAPACITY_DEFAULT
        .SPLIT_AMPLIFICATION_FACTOR,
    });

    t.equal(withAmp, withoutAmp *
      STORAGE_CAPACITY_DEFAULT.SPLIT_AMPLIFICATION_FACTOR);
    t.end();
  });

test('estimation - unknown entity type uses service overhead',
  async (t) => {
    initConfig();
    const svc = new StorageCapacityAccountingService();

    const estimate = svc.estimateReplicaBytes({
      entityType: 'unknown_type',
      sizeBytes: NUM.HUNDRED,
    });

    // max(100, 10) = 100, + service overhead 1 = 101
    t.equal(estimate, NUM.HUNDRED + NUM.ONE);
    t.end();
  });

// ============================================================
// Req 13.1: Pressure state classification at exact boundaries
// ============================================================

test('pressure - 0% utilization is normal', async (t) => {
  initConfig();
  const svc = new StorageCapacityAccountingService();

  const state = svc.getPressureState(NUM.ZERO, NUM.THOUSAND);
  t.equal(state, PRESSURE_STATE.NORMAL);
  t.end();
});

test('pressure - one byte below soft threshold is normal',
  async (t) => {
    initConfig();
    const svc = new StorageCapacityAccountingService();

    // soft = 70%, budget = 1000 -> threshold at 700
    const allocated =
      STORAGE_CAPACITY_DEFAULT.SOFT_PRESSURE_PERCENT *
      NUM.TEN - NUM.ONE;
    const state = svc.getPressureState(allocated, NUM.THOUSAND);
    t.equal(state, PRESSURE_STATE.NORMAL);
    t.end();
  });

test('pressure - exactly at soft threshold is soft', async (t) => {
  initConfig();
  const svc = new StorageCapacityAccountingService();

  // 70% of 1000 = 700
  const allocated =
    STORAGE_CAPACITY_DEFAULT.SOFT_PRESSURE_PERCENT * NUM.TEN;
  const state = svc.getPressureState(allocated, NUM.THOUSAND);
  t.equal(state, PRESSURE_STATE.SOFT);
  t.end();
});

test('pressure - between soft and hard is soft', async (t) => {
  initConfig();
  const svc = new StorageCapacityAccountingService();

  // 80% of 1000 = 800 (between 70% soft and 85% hard)
  const allocated = 800;
  const state = svc.getPressureState(allocated, NUM.THOUSAND);
  t.equal(state, PRESSURE_STATE.SOFT);
  t.end();
});

test('pressure - one byte below hard threshold is soft',
  async (t) => {
    initConfig();
    const svc = new StorageCapacityAccountingService();

    // hard = 85%, budget = 1000 -> threshold at 850
    const allocated =
      STORAGE_CAPACITY_DEFAULT.HARD_PRESSURE_PERCENT *
      NUM.TEN - NUM.ONE;
    const state = svc.getPressureState(allocated, NUM.THOUSAND);
    t.equal(state, PRESSURE_STATE.SOFT);
    t.end();
  });

test('pressure - exactly at hard threshold is hard', async (t) => {
  initConfig();
  const svc = new StorageCapacityAccountingService();

  // 85% of 1000 = 850
  const allocated =
    STORAGE_CAPACITY_DEFAULT.HARD_PRESSURE_PERCENT * NUM.TEN;
  const state = svc.getPressureState(allocated, NUM.THOUSAND);
  t.equal(state, PRESSURE_STATE.HARD);
  t.end();
});

test('pressure - between hard and 100% is hard', async (t) => {
  initConfig();
  const svc = new StorageCapacityAccountingService();

  // 95% of 1000 = 950
  const allocated = 950;
  const state = svc.getPressureState(allocated, NUM.THOUSAND);
  t.equal(state, PRESSURE_STATE.HARD);
  t.end();
});

test('pressure - exactly 100% utilization is exhausted',
  async (t) => {
    initConfig();
    const svc = new StorageCapacityAccountingService();

    const state = svc.getPressureState(
      NUM.THOUSAND, NUM.THOUSAND,
    );
    t.equal(state, PRESSURE_STATE.EXHAUSTED);
    t.end();
  });

test('pressure - over 100% utilization is exhausted', async (t) => {
  initConfig();
  const svc = new StorageCapacityAccountingService();

  const state = svc.getPressureState(
    NUM.THOUSAND + NUM.ONE, NUM.THOUSAND,
  );
  t.equal(state, PRESSURE_STATE.EXHAUSTED);
  t.end();
});

// ============================================================
// Req 13.2: Property tests for capacity invariants
// ============================================================

test('PBT: available = budget - used - reserved clamped to zero',
  async (t) => {
    /**
     * Validates: Req 13.2 — accounting invariant
     *
     * For any valid budget, used, and reserved values the snapshot
     * available bytes must equal max(0, budget - used - reserved).
     */
    initConfig();

    fc.assert(
      fc.property(
        fc.integer({min: NUM.ONE, max: NUM.TEN_THOUSAND}),
        fc.nat({max: NUM.FIVE_THOUSAND}),
        fc.nat({max: NUM.FIVE_THOUSAND}),
        (budget, used, reserved) => {
          const cache = new SystemTableCache();
          const svc = createAccountingWithCache(cache);
          setupNode(cache, 'pbt-n', budget);

          const snapshot = svc.buildSnapshot(
            {
              [COLUMN.NODE_ID]: 'pbt-n',
              [COLUMN.STORAGE_BUDGET_BYTES]: budget,
            },
            used,
            reserved,
          );

          const expected = Math.max(
            NUM.ZERO,
            Math.floor(budget) - (used + reserved),
          );
          return snapshot.availableBytes === expected;
        },
      ),
      {numRuns: NUM.TEN},
    );
    t.pass('Accounting invariant holds');
    t.end();
  });

test('PBT: non-critical admission never allows at or above hard ' +
    'threshold', async (t) => {
  /**
   * Validates: Req 13.2 — no over-commit for non-critical ops
   *
   * When admission allows a non-critical ADD, the projected
   * utilization must be strictly below the hard pressure percent.
   */
  initConfig();

  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: NUM.ONE, max: NUM.TEN_THOUSAND}),
      fc.integer({min: NUM.ONE, max: NUM.FIVE_THOUSAND}),
      async (budget, estimated) => {
        const cache = new SystemTableCache();
        const accounting = createAccountingWithCache(cache);
        setupNode(cache, 'pbt-nc', budget);

        const admission = createAdmissionService(accounting, cache);

        const result = await admission.checkAdd({
          targetNodeId: 'pbt-nc',
          estimatedBytes: estimated,
        });

        if (result.decision === ADMISSION_DECISION.ALLOW) {
          return result.projectedUtilization
            .projectedUtilizationPercent <
            STORAGE_CAPACITY_DEFAULT.HARD_PRESSURE_PERCENT;
        }
        return true;
      },
    ),
    {numRuns: NUM.TEN},
  );
  t.pass('Non-critical never allowed at/above hard threshold');
  t.end();
});

test('PBT: critical replace allows up to emergency headroom limit',
  async (t) => {
    /**
     * Validates: Req 13.2 — emergency headroom invariant
     *
     * When a critical replace is allowed via emergency headroom,
     * projected utilization must be at most
     * (100 - emergencyHeadroomPercent)%.
     */
    initConfig();

    const maxAllowed = NUM.HUNDRED -
      STORAGE_CAPACITY_DEFAULT.EMERGENCY_HEADROOM_PERCENT;

    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: NUM.HUNDRED, max: NUM.TEN_THOUSAND}),
        fc.integer({min: NUM.ONE, max: NUM.FIVE_THOUSAND}),
        async (budget, estimated) => {
          const cache = new SystemTableCache();
          const accounting = createAccountingWithCache(cache);
          setupNode(cache, 'pbt-cr', budget);

          const admission = createAdmissionService(accounting, cache);

          const result = await admission.checkReplace({
            targetNodeId: 'pbt-cr',
            estimatedBytes: estimated,
            isCritical: true,
          });

          if (result.decision === ADMISSION_DECISION.ALLOW &&
              result.reason ===
                ADMISSION_REASON.EMERGENCY_HEADROOM_AVAILABLE) {
            return result.projectedUtilization
              .projectedUtilizationPercent <= maxAllowed;
          }
          return true;
        },
      ),
      {numRuns: NUM.TEN},
    );
    t.pass('Critical replace respects emergency headroom limit');
    t.end();
  });

// ============================================================
// Req 13.3: Integration-style end-to-end flows
// ============================================================

test('e2e: node registers budget, snapshot shows capacity, ' +
    'admission allows placement', async (t) => {
  initConfig();
  const cache = new SystemTableCache();
  const accounting = createAccountingWithCache(cache);

  // Step 1: register node with budget
  setupNode(cache, 'node-e2e', NUM.THOUSAND);

  // Step 2: verify snapshot
  const snapshot = await accounting
    .getCapacitySnapshotForNode('node-e2e');
  t.equal(snapshot.budgetBytes, NUM.THOUSAND);
  t.equal(snapshot.usedBytes, NUM.ZERO);
  t.equal(snapshot.reservedBytes, NUM.ZERO);
  t.equal(snapshot.availableBytes, NUM.THOUSAND);
  t.equal(snapshot.pressureState, PRESSURE_STATE.NORMAL);

  // Step 3: admission allows placement
  const admission = createAdmissionService(accounting, cache);
  const result = await admission.checkAdd({
    targetNodeId: 'node-e2e',
    estimatedBytes: NUM.HUNDRED,
  });
  t.equal(result.decision, ADMISSION_DECISION.ALLOW);
  t.equal(result.reason, ADMISSION_REASON.CAPACITY_AVAILABLE);
  t.end();
});

test('e2e: node at hard pressure denies non-critical, allows ' +
    'critical with emergency headroom', async (t) => {
  initConfig();
  const cache = new SystemTableCache();
  const accounting = createAccountingWithCache(cache);

  // Budget 1000, hard = 85% = 850
  setupNode(cache, 'node-hp', NUM.THOUSAND);

  // Add existing usage to push near hard threshold
  addPartitionSize(cache, 'p-big', 800);
  addPartitionService(cache, 'svc-big', 'node-hp', 'p-big');
  // used: max(800, 10) + 5 = 805

  const admission = createAdmissionService(accounting, cache);

  // Non-critical: 805 + 100 = 905 -> 90.5% > 85% -> deny
  const nonCritical = await admission.checkAdd({
    targetNodeId: 'node-hp',
    estimatedBytes: NUM.HUNDRED,
  });
  t.equal(nonCritical.decision, ADMISSION_DECISION.DENY);
  t.equal(
    nonCritical.reason,
    ADMISSION_REASON.HARD_PRESSURE_EXCEEDED,
  );

  // Critical: 805 + 100 = 905 -> 90.5% <= 95% headroom -> allow
  const critical = await admission.checkReplace({
    targetNodeId: 'node-hp',
    estimatedBytes: NUM.HUNDRED,
    isCritical: true,
  });
  t.equal(critical.decision, ADMISSION_DECISION.ALLOW);
  t.equal(
    critical.reason,
    ADMISSION_REASON.EMERGENCY_HEADROOM_AVAILABLE,
  );
  t.end();
});

test('e2e: split deferred when capacity insufficient, succeeds ' +
    'after capacity freed', async (t) => {
  initConfig();
  const cache = new SystemTableCache();
  const accounting = createAccountingWithCache(cache);

  // Tiny budget: split will exceed
  setupNode(cache, 'node-split', NUM.THIRTY);

  const admission = createAdmissionService(accounting, cache);

  // Split estimate: max(20, 10) + 5 = 25, * default amp 2 = 50
  // 50 / 30 = 166% -> deny
  const splitDenied = await admission.checkSplit({
    targetNodeId: 'node-split',
    estimatedBytes: accounting.estimateReplicaBytes({
      entityType: SERVICE_TYPE.PARTITION,
      sizeBytes: NUM.TEN * NUM.TWO,
      amplificationFactor:
        STORAGE_CAPACITY_DEFAULT.SPLIT_AMPLIFICATION_FACTOR,
    }),
  });
  t.equal(splitDenied.decision, ADMISSION_DECISION.DENY);

  // Increase budget (simulating freed capacity via CDC update)
  cache.applySystemTableChange(
    TABLES.NODES,
    CDC_OPERATION.UPDATE,
    {
      [COLUMN.NODE_ID]: 'node-split',
      [COLUMN.STORAGE_BUDGET_BYTES]: NUM.THOUSAND,
    },
  );

  // Now split should succeed: 50 / 1000 = 5% -> allow
  const splitAllowed = await admission.checkSplit({
    targetNodeId: 'node-split',
    estimatedBytes: accounting.estimateReplicaBytes({
      entityType: SERVICE_TYPE.PARTITION,
      sizeBytes: NUM.TEN * NUM.TWO,
      amplificationFactor:
        STORAGE_CAPACITY_DEFAULT.SPLIT_AMPLIFICATION_FACTOR,
    }),
  });
  t.equal(splitAllowed.decision, ADMISSION_DECISION.ALLOW);
  t.equal(
    splitAllowed.reason, ADMISSION_REASON.CAPACITY_AVAILABLE,
  );
  t.end();
});

test('e2e: reservation counts toward used capacity in admission',
  async (t) => {
    initConfig();
    const cache = new SystemTableCache();
    const accounting = createAccountingWithCache(cache);

    // Budget 100, hard = 85%
    setupNode(cache, 'node-res', NUM.HUNDRED);

    // Add active reservation for 50 bytes
    addReservation(cache, 'res-1', 'node-res', NUM.FIVE * NUM.TEN);

    const admission = createAdmissionService(accounting, cache);

    // reserved=50, request=40 -> total 90% > 85% -> deny
    const result = await admission.checkAdd({
      targetNodeId: 'node-res',
      estimatedBytes: NUM.FOUR * NUM.TEN,
    });
    t.equal(result.decision, ADMISSION_DECISION.DENY);
    t.equal(
      result.projectedUtilization.currentReservedBytes,
      NUM.FIVE * NUM.TEN,
    );

    // Smaller request: reserved=50, request=30 -> 80% < 85% -> allow
    const smaller = await admission.checkAdd({
      targetNodeId: 'node-res',
      estimatedBytes: NUM.THIRTY,
    });
    t.equal(smaller.decision, ADMISSION_DECISION.ALLOW);
    t.end();
  });

test('e2e: expired reservation does not count toward capacity',
  async (t) => {
    initConfig();
    const cache = new SystemTableCache();
    const accounting = createAccountingWithCache(cache);

    setupNode(cache, 'node-exp', NUM.HUNDRED);

    // Add expired reservation (expiresAt in the past)
    addReservation(
      cache, 'res-exp', 'node-exp', NUM.FIVE * NUM.TEN,
      {expiresAt: NUM.ONE},
    );

    const admission = createAdmissionService(accounting, cache);

    // Expired reservation ignored: request=90 -> 90% > 85% -> deny
    const large = await admission.checkAdd({
      targetNodeId: 'node-exp',
      estimatedBytes: NUM.NINE * NUM.TEN,
    });
    t.equal(large.decision, ADMISSION_DECISION.DENY);

    // But 80 bytes -> 80% < 85% -> allow (proves reservation ignored)
    const fits = await admission.checkAdd({
      targetNodeId: 'node-exp',
      estimatedBytes: NUM.EIGHT * NUM.TEN,
    });
    t.equal(fits.decision, ADMISSION_DECISION.ALLOW);
    t.end();
  });

// ============================================================
// Req 13.4: Pressure transitions and critical replacement
// ============================================================

test('e2e: pressure transitions tracked across multiple state ' +
    'changes', async (t) => {
  initConfig();
  let pressureState = PRESSURE_STATE.NORMAL;
  const mockAccounting = {
    getCapacitySnapshotForNode: async () => ({
      nodeId: 'n1',
      pressureState,
    }),
  };

  const behavior = new StoragePressureBehavior({
    accountingService: mockAccounting,
  });

  // Initial observation
  await behavior.shouldAllowMove(
    'n1', MOVE_CRITICALITY.NON_CRITICAL,
  );
  t.equal(behavior.getMetricEvents().length, NUM.ZERO);

  // normal -> soft
  pressureState = PRESSURE_STATE.SOFT;
  const softResult = await behavior.shouldAllowMove(
    'n1', MOVE_CRITICALITY.NON_CRITICAL,
  );
  t.equal(
    softResult.decision,
    PRESSURE_BEHAVIOR_DECISION.ALLOW_REDUCED_PRIORITY,
  );
  t.equal(behavior.getMetricEvents().length, NUM.ONE);

  // soft -> hard
  pressureState = PRESSURE_STATE.HARD;
  const hardResult = await behavior.shouldAllowMove(
    'n1', MOVE_CRITICALITY.NON_CRITICAL,
  );
  t.equal(hardResult.decision, PRESSURE_BEHAVIOR_DECISION.DENY);
  t.equal(behavior.getMetricEvents().length, NUM.TWO);

  // hard -> exhausted
  pressureState = PRESSURE_STATE.EXHAUSTED;
  const exhaustedResult = await behavior.shouldAllowMove(
    'n1', MOVE_CRITICALITY.NON_CRITICAL,
  );
  t.equal(
    exhaustedResult.decision, PRESSURE_BEHAVIOR_DECISION.DENY,
  );
  t.equal(behavior.getMetricEvents().length, NUM.THREE);

  // Critical moves still allowed at exhausted
  const critResult = await behavior.shouldAllowMove(
    'n1', MOVE_CRITICALITY.CRITICAL,
  );
  t.equal(critResult.decision, PRESSURE_BEHAVIOR_DECISION.ALLOW);

  // Verify transition chain
  const events = behavior.getMetricEvents();
  t.equal(events[NUM.ZERO].previousState, PRESSURE_STATE.NORMAL);
  t.equal(events[NUM.ZERO].currentState, PRESSURE_STATE.SOFT);
  t.equal(events[NUM.ONE].previousState, PRESSURE_STATE.SOFT);
  t.equal(events[NUM.ONE].currentState, PRESSURE_STATE.HARD);
  t.equal(events[NUM.TWO].previousState, PRESSURE_STATE.HARD);
  t.equal(events[NUM.TWO].currentState, PRESSURE_STATE.EXHAUSTED);
  t.end();
});

test('e2e: observe mode overrides denial to allow', async (t) => {
  initConfig({storageAdmissionMode: ADMISSION_MODE.OBSERVE});
  const cache = new SystemTableCache();
  const accounting = createAccountingWithCache(cache);

  setupNode(cache, 'node-obs', NUM.HUNDRED);

  const admission = createAdmissionService(accounting, cache);

  // Request 90 bytes -> 90% > 85% hard -> would deny in enforce
  const result = await admission.checkAdd({
    targetNodeId: 'node-obs',
    estimatedBytes: NUM.NINE * NUM.TEN,
  });

  // Observe mode overrides deny to allow
  t.equal(result.decision, ADMISSION_DECISION.ALLOW);
  // Reason preserved from original denial
  t.equal(
    result.reason, ADMISSION_REASON.HARD_PRESSURE_EXCEEDED,
  );
  t.end();
});

test('e2e: multi-node capacity snapshots with mixed pressure',
  async (t) => {
    initConfig();
    const cache = new SystemTableCache();
    const accounting = createAccountingWithCache(cache);

    // Node 1: normal (no usage)
    setupNode(cache, 'n1', NUM.THOUSAND);

    // Node 2: soft pressure (75% used)
    setupNode(cache, 'n2', NUM.THOUSAND);
    addPartitionSize(cache, 'p2', 740);
    addPartitionService(cache, 'svc-2', 'n2', 'p2');
    // used: max(740, 10) + 5 = 745 -> 74.5% -> soft

    // Node 3: hard pressure (90% used)
    setupNode(cache, 'n3', NUM.THOUSAND);
    addPartitionSize(cache, 'p3', 890);
    addPartitionService(cache, 'svc-3', 'n3', 'p3');
    // used: max(890, 10) + 5 = 895 -> 89.5% -> hard

    const snapshots = await accounting.getCapacitySnapshots();
    t.equal(snapshots.length, NUM.THREE);

    const byId = new Map(
      snapshots.map((s) => [s.nodeId, s]),
    );
    t.equal(byId.get('n1').pressureState, PRESSURE_STATE.NORMAL);
    t.equal(byId.get('n2').pressureState, PRESSURE_STATE.SOFT);
    t.equal(byId.get('n3').pressureState, PRESSURE_STATE.HARD);
    t.end();
  });

test('e2e: admission with multiple service types on same node',
  async (t) => {
    initConfig();
    const cache = new SystemTableCache();
    const accounting = createAccountingWithCache(cache);

    // Budget 200
    setupNode(cache, 'node-multi', 200);

    // Partition: max(50, 10) + 5 = 55
    addPartitionSize(cache, 'p-m', NUM.FIVE * NUM.TEN);
    addPartitionService(cache, 'svc-p', 'node-multi', 'p-m');

    // Message group: max(0, 10) + 2 = 12
    insertRow(cache, TABLES.SERVICES, {
      [COLUMN.SERVICE_ID]: 'svc-mg',
      [COLUMN.NODE_ID]: 'node-multi',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      [COLUMN.STATUS]: ReplicaStatus.ACTIVE,
    });

    // WASM service: max(0, 10) + 1 = 11
    insertRow(cache, TABLES.SERVICES, {
      [COLUMN.SERVICE_ID]: 'svc-ws',
      [COLUMN.NODE_ID]: 'node-multi',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.WASM_SERVICE,
      [COLUMN.STATUS]: ReplicaStatus.ACTIVE,
    });

    // Total used: 55 + 12 + 11 = 78
    const snapshot = await accounting
      .getCapacitySnapshotForNode('node-multi');
    t.equal(snapshot.usedBytes, 78);

    const admission = createAdmissionService(accounting, cache);

    // 78 + 100 = 178 -> 89% > 85% -> deny
    const denied = await admission.checkAdd({
      targetNodeId: 'node-multi',
      estimatedBytes: NUM.HUNDRED,
    });
    t.equal(denied.decision, ADMISSION_DECISION.DENY);

    // 78 + 50 = 128 -> 64% < 85% -> allow
    const allowed = await admission.checkAdd({
      targetNodeId: 'node-multi',
      estimatedBytes: NUM.FIVE * NUM.TEN,
    });
    t.equal(allowed.decision, ADMISSION_DECISION.ALLOW);
    t.end();
  });
