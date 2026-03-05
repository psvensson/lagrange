/**
 * Tests for StorageAdmissionService.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 8.4, 11.2
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
  ADMISSION_DECISION,
  ADMISSION_MODE,
  ADMISSION_REASON,
  RESERVATION_STATUS,
  STORAGE_CAPACITY_DEFAULT,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
  STORAGE_ADMISSION_OPERATION_TYPE,
  STORAGE_ADMISSION_REASON,
} from '../../src/rebalancer/storage-admission-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  StorageCapacityAccountingService,
} from '../../src/rebalancer/storage-capacity-accounting-service.js';
import {
  StorageAdmissionService,
  ADMISSION_ERROR_MSG,
} from '../../src/rebalancer/storage-admission-service.js';

function initializeConfig(overrides = {}) {
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

function createServices(cache, accounting) {
  const service = new StorageAdmissionService({
    accountingService: accounting,
  });
  return service;
}

function createReadiness(nodeId, overrides = {}) {
  return Object.freeze({
    nodeId,
    dimensions: {
      processAlive: true,
      clusterMemberHealthy: true,
      routingReady: true,
      loadReady: true,
      placementEligible: true,
      controlPlaneWritable: true,
      metadataPublicationHealthy: true,
      ...(overrides.dimensions || {}),
    },
    reasons: Object.freeze(overrides.reasons || []),
  });
}

function createReadinessService(readinessByNodeId) {
  return {
    async getNodeReadiness(nodeId) {
      return readinessByNodeId[nodeId] || createReadiness(nodeId);
    },
  };
}

function setupWithNode(nodeId, budgetBytes) {
  const cache = new SystemTableCache();
  const accounting = new StorageCapacityAccountingService({
    systemTableCache: cache,
  });
  accounting.initialize({systemTableCache: cache});

  insertRow(cache, TABLES.NODES, {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STORAGE_BUDGET_BYTES]: budgetBytes,
  });

  const admission = createServices(cache, accounting);
  return {cache, accounting, admission};
}

// --- Constructor validation ---

test('constructor - throws when accountingService is missing', async (t) => {
  initializeConfig();
  t.throws(
    () => new StorageAdmissionService({}),
    {message: ADMISSION_ERROR_MSG.ACCOUNTING_SERVICE_REQUIRED},
  );
  t.end();
});

// --- checkAdd ---

test('checkAdd - allows when capacity is available', async (t) => {
  initializeConfig();
  const {admission} = setupWithNode('node-1', NUM.THOUSAND);

  const result = await admission.checkAdd({
    targetNodeId: 'node-1',
    estimatedBytes: NUM.TEN,
  });

  t.equal(result.decision, ADMISSION_DECISION.ALLOW);
  t.equal(result.reason, ADMISSION_REASON.CAPACITY_AVAILABLE);
  t.equal(result.projectedUtilization.estimatedBytes, NUM.TEN);
  t.equal(result.projectedUtilization.budgetBytes, NUM.THOUSAND);
  t.end();
});

test('checkAdd - denies when node has no budget', async (t) => {
  initializeConfig();
  const cache = new SystemTableCache();
  const accounting = new StorageCapacityAccountingService({
    systemTableCache: cache,
  });
  accounting.initialize({systemTableCache: cache});

  insertRow(cache, TABLES.NODES, {
    [COLUMN.NODE_ID]: 'node-no-budget',
  });

  const admission = createServices(cache, accounting);
  const result = await admission.checkAdd({
    targetNodeId: 'node-no-budget',
    estimatedBytes: NUM.TEN,
  });

  t.equal(result.decision, ADMISSION_DECISION.DENY);
  t.equal(result.reason, ADMISSION_REASON.NO_BUDGET_REGISTERED);
  t.equal(result.projectedUtilization.budgetBytes, null);
  t.end();
});

test('checkAdd - denies when node does not exist', async (t) => {
  initializeConfig();
  const cache = new SystemTableCache();
  const accounting = new StorageCapacityAccountingService({
    systemTableCache: cache,
  });
  accounting.initialize({systemTableCache: cache});

  const admission = createServices(cache, accounting);
  const result = await admission.checkAdd({
    targetNodeId: 'nonexistent',
    estimatedBytes: NUM.TEN,
  });

  t.equal(result.decision, ADMISSION_DECISION.DENY);
  t.equal(result.reason, ADMISSION_REASON.NO_BUDGET_REGISTERED);
  t.end();
});

test('checkAdd - denies when budget would be exceeded', async (t) => {
  initializeConfig();
  const {admission} = setupWithNode('node-1', NUM.HUNDRED);

  const result = await admission.checkAdd({
    targetNodeId: 'node-1',
    estimatedBytes: NUM.HUNDRED + NUM.ONE,
  });

  t.equal(result.decision, ADMISSION_DECISION.DENY);
  t.equal(result.reason, ADMISSION_REASON.BUDGET_EXCEEDED);
  t.end();
});

test('checkAdd - denies at hard pressure threshold', async (t) => {
  initializeConfig();
  // Budget 100, hard threshold 85%. Request 86 bytes -> 86% utilization.
  const {admission} = setupWithNode('node-1', NUM.HUNDRED);

  const result = await admission.checkAdd({
    targetNodeId: 'node-1',
    estimatedBytes: STORAGE_CAPACITY_DEFAULT.HARD_PRESSURE_PERCENT + NUM.ONE,
  });

  t.equal(result.decision, ADMISSION_DECISION.DENY);
  t.equal(result.reason, ADMISSION_REASON.HARD_PRESSURE_EXCEEDED);
  t.end();
});

test('checkAdd - allows below hard pressure threshold', async (t) => {
  initializeConfig();
  // Budget 100, hard threshold 85%. Request 84 bytes -> 84% utilization.
  const {admission} = setupWithNode('node-1', NUM.HUNDRED);

  const result = await admission.checkAdd({
    targetNodeId: 'node-1',
    estimatedBytes: STORAGE_CAPACITY_DEFAULT.HARD_PRESSURE_PERCENT - NUM.ONE,
  });

  t.equal(result.decision, ADMISSION_DECISION.ALLOW);
  t.equal(result.reason, ADMISSION_REASON.CAPACITY_AVAILABLE);
  t.end();
});

test('checkAdd - throws when targetNodeId is missing', async (t) => {
  initializeConfig();
  const {admission} = setupWithNode('node-1', NUM.THOUSAND);

  await t.rejects(
    admission.checkAdd({estimatedBytes: NUM.TEN}),
    {message: ADMISSION_ERROR_MSG.TARGET_NODE_REQUIRED},
  );
  t.end();
});

test('checkAdd - throws when estimatedBytes is invalid', async (t) => {
  initializeConfig();
  const {admission} = setupWithNode('node-1', NUM.THOUSAND);

  await t.rejects(
    admission.checkAdd({targetNodeId: 'node-1', estimatedBytes: NUM.ZERO}),
    {message: ADMISSION_ERROR_MSG.ESTIMATED_BYTES_REQUIRED},
  );
  t.end();
});

// --- checkReplace ---

test('checkReplace - allows non-critical when capacity available',
  async (t) => {
    initializeConfig();
    const {admission} = setupWithNode('node-1', NUM.THOUSAND);

    const result = await admission.checkReplace({
      targetNodeId: 'node-1',
      estimatedBytes: NUM.TEN,
    });

    t.equal(result.decision, ADMISSION_DECISION.ALLOW);
    t.equal(result.reason, ADMISSION_REASON.CAPACITY_AVAILABLE);
    t.end();
  });

test('checkReplace - denies non-critical at hard pressure', async (t) => {
  initializeConfig();
  const {admission} = setupWithNode('node-1', NUM.HUNDRED);

  const result = await admission.checkReplace({
    targetNodeId: 'node-1',
    estimatedBytes: STORAGE_CAPACITY_DEFAULT.HARD_PRESSURE_PERCENT + NUM.ONE,
    isCritical: false,
  });

  t.equal(result.decision, ADMISSION_DECISION.DENY);
  t.equal(result.reason, ADMISSION_REASON.HARD_PRESSURE_EXCEEDED);
  t.end();
});

test('checkReplace - allows critical with emergency headroom', async (t) => {
  initializeConfig();
  // Budget 100, emergency headroom 5%, so max allowed = 95%.
  // Request 90 bytes -> 90% utilization, within emergency headroom.
  const {admission} = setupWithNode('node-1', NUM.HUNDRED);

  const result = await admission.checkReplace({
    targetNodeId: 'node-1',
    estimatedBytes: NUM.NINE * NUM.TEN,
    isCritical: true,
  });

  t.equal(result.decision, ADMISSION_DECISION.ALLOW);
  t.equal(result.reason, ADMISSION_REASON.EMERGENCY_HEADROOM_AVAILABLE);
  t.end();
});

test('checkReplace - denies critical when emergency headroom exceeded',
  async (t) => {
    initializeConfig();
    // Budget 100, emergency headroom 5%, max allowed = 95%.
    // Request 96 bytes -> 96% utilization, exceeds emergency headroom.
    const {admission} = setupWithNode('node-1', NUM.HUNDRED);

    const result = await admission.checkReplace({
      targetNodeId: 'node-1',
      estimatedBytes: NUM.NINE * NUM.TEN + NUM.SIX,
      isCritical: true,
    });

    t.equal(result.decision, ADMISSION_DECISION.DENY);
    t.equal(result.reason, ADMISSION_REASON.HARD_PRESSURE_EXCEEDED);
    t.end();
  });

// --- checkSplit ---

test('checkSplit - allows when capacity is available', async (t) => {
  initializeConfig();
  const {admission} = setupWithNode('node-1', NUM.THOUSAND);

  const result = await admission.checkSplit({
    targetNodeId: 'node-1',
    estimatedBytes: NUM.TEN,
  });

  t.equal(result.decision, ADMISSION_DECISION.ALLOW);
  t.equal(result.reason, ADMISSION_REASON.CAPACITY_AVAILABLE);
  t.end();
});

test('checkSplit - denies when budget exceeded', async (t) => {
  initializeConfig();
  const {admission} = setupWithNode('node-1', NUM.HUNDRED);

  const result = await admission.checkSplit({
    targetNodeId: 'node-1',
    estimatedBytes: NUM.HUNDRED + NUM.ONE,
  });

  t.equal(result.decision, ADMISSION_DECISION.DENY);
  t.equal(result.reason, ADMISSION_REASON.BUDGET_EXCEEDED);
  t.end();
});

test('checkSplit - returns structured admitted result for bootstrap targets',
  async (t) => {
    initializeConfig();
    const cache = new SystemTableCache();
    const accounting = new StorageCapacityAccountingService({
      systemTableCache: cache,
    });
    accounting.initialize({systemTableCache: cache});

    insertRow(cache, TABLES.NODES, {
      [COLUMN.NODE_ID]: 'node-a',
      [COLUMN.STORAGE_BUDGET_BYTES]: NUM.THOUSAND,
    });
    insertRow(cache, TABLES.NODES, {
      [COLUMN.NODE_ID]: 'node-b',
      [COLUMN.STORAGE_BUDGET_BYTES]: NUM.THOUSAND,
    });

    const admission = new StorageAdmissionService({
      accountingService: accounting,
      controlPlaneReadinessService: createReadinessService({
        'node-a': createReadiness('node-a'),
        'node-b': createReadiness('node-b'),
      }),
      now: () => 1000,
    });

    const result = await admission.checkSplit({
      targetNodeIds: ['node-a', 'node-b'],
      estimatedBytes: NUM.TEN,
      requiredReplicaCount: 2,
    });

    t.equal(result.allowed, true);
    t.equal(
      result.decisionType,
      STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
    );
    t.equal(
      result.operationType,
      STORAGE_ADMISSION_OPERATION_TYPE.PARTITION_SPLIT,
    );
    t.equal(result.requiredReplicaCount, 2);
    t.same(result.eligibleNodeIds, ['node-a', 'node-b']);
    t.same(result.blockingReasons, []);
    t.equal(result.decisionTimestamp, '1970-01-01T00:00:01.000Z');
    t.equal(
      result.projectedUtilizationByNodeId['node-a'].projectedAllocatedBytes,
      NUM.TEN,
    );
    t.equal(result.projectedUtilization, null);
    t.end();
  });

test('checkSplit - returns blocked result when too few nodes are eligible',
  async (t) => {
    initializeConfig();
    const cache = new SystemTableCache();
    const accounting = new StorageCapacityAccountingService({
      systemTableCache: cache,
    });
    accounting.initialize({systemTableCache: cache});

    insertRow(cache, TABLES.NODES, {
      [COLUMN.NODE_ID]: 'node-a',
      [COLUMN.STORAGE_BUDGET_BYTES]: NUM.THOUSAND,
    });
    insertRow(cache, TABLES.NODES, {
      [COLUMN.NODE_ID]: 'node-b',
    });

    const admission = new StorageAdmissionService({
      accountingService: accounting,
      controlPlaneReadinessService: createReadinessService({
        'node-a': createReadiness('node-a'),
        'node-b': createReadiness('node-b', {
          dimensions: {
            controlPlaneWritable: false,
            placementEligible: false,
          },
          reasons: [{
            code: STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
            dimension: 'controlPlaneWritable',
            sourceOwner: 'ControlPlaneReadinessService',
            observedAt: '2026-03-04T00:00:00.000Z',
          }],
        }),
      }),
    });

    const result = await admission.checkSplit({
      targetNodeIds: ['node-a', 'node-b'],
      estimatedBytes: NUM.TEN,
      requiredReplicaCount: 2,
    });

    t.equal(result.allowed, false);
    t.equal(
      result.decisionType,
      STORAGE_ADMISSION_DECISION_TYPE.BLOCKED,
    );
    t.same(result.eligibleNodeIds, ['node-a']);
    t.same(result.blockingReasons, [
      STORAGE_ADMISSION_REASON.INSUFFICIENT_PLACEMENT_ELIGIBLE_NODES,
      STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
      STORAGE_ADMISSION_REASON.STORAGE_BUDGET_EXHAUSTED,
    ]);
    t.same(result.ineligibleNodes, [{
      nodeId: 'node-b',
      failedDimensions: ['placementEligible', 'controlPlaneWritable'],
      reasonCodes: [
        STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
        ADMISSION_REASON.NO_BUDGET_REGISTERED,
      ],
      projectedUtilization: result.ineligibleNodes[0].projectedUtilization,
    }]);
    t.equal(result.projectedUtilizationByNodeId['node-b'].budgetBytes, null);
    t.end();
  });

test('checkSplit - defers when publication mode is degraded', async (t) => {
  initializeConfig();
  const cache = new SystemTableCache();
  const accounting = new StorageCapacityAccountingService({
    systemTableCache: cache,
  });
  accounting.initialize({systemTableCache: cache});

  insertRow(cache, TABLES.NODES, {
    [COLUMN.NODE_ID]: 'node-a',
    [COLUMN.STORAGE_BUDGET_BYTES]: NUM.THOUSAND,
  });
  insertRow(cache, TABLES.NODES, {
    [COLUMN.NODE_ID]: 'node-b',
    [COLUMN.STORAGE_BUDGET_BYTES]: NUM.THOUSAND,
  });

  const degradedReason = {
    code: STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED,
    dimension: 'metadataPublicationHealthy',
    sourceOwner: 'CDCGroupPropagationService',
    observedAt: '2026-03-04T00:00:00.000Z',
  };
  const admission = new StorageAdmissionService({
    accountingService: accounting,
    controlPlaneReadinessService: createReadinessService({
      'node-a': createReadiness('node-a', {
        dimensions: {
          metadataPublicationHealthy: false,
          controlPlaneWritable: false,
          placementEligible: false,
        },
        reasons: [degradedReason],
      }),
      'node-b': createReadiness('node-b', {
        dimensions: {
          metadataPublicationHealthy: false,
          controlPlaneWritable: false,
          placementEligible: false,
        },
        reasons: [degradedReason],
      }),
    }),
  });

  const result = await admission.checkSplit({
    targetNodeIds: ['node-a', 'node-b'],
    estimatedBytes: NUM.TEN,
    requiredReplicaCount: 2,
  });

  t.equal(result.allowed, false);
  t.equal(
    result.decisionType,
    STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
  );
  t.same(result.blockingReasons, [
    STORAGE_ADMISSION_REASON.INSUFFICIENT_PLACEMENT_ELIGIBLE_NODES,
    STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED,
  ]);
  t.same(
    result.ineligibleNodes.map((entry) => entry.reasonCodes),
    [
      [STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED],
      [STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED],
    ],
  );
  t.end();
});

// --- Existing usage affects admission ---

test('checkAdd - accounts for existing used bytes', async (t) => {
  initializeConfig();
  const {cache, admission} = setupWithNode('node-1', NUM.HUNDRED);

  // Add a partition that uses space
  insertRow(cache, TABLES.PARTITIONS, {
    [COLUMN.PARTITION_ID]: 'p-1',
    [COLUMN.SIZE_BYTES]: NUM.FOUR * NUM.TEN,
  });
  insertRow(cache, TABLES.SERVICES, {
    [COLUMN.SERVICE_ID]: 'svc-1',
    [COLUMN.NODE_ID]: 'node-1',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: 'p-1',
    [COLUMN.STATUS]: ReplicaStatus.ACTIVE,
  });

  // partition used: max(40, 10) + 5 = 45 bytes
  // Request 50 more -> total 95% -> exceeds hard (85%)
  const result = await admission.checkAdd({
    targetNodeId: 'node-1',
    estimatedBytes: NUM.FIVE * NUM.TEN,
  });

  t.equal(result.decision, ADMISSION_DECISION.DENY);
  t.equal(result.reason, ADMISSION_REASON.HARD_PRESSURE_EXCEEDED);
  t.equal(result.projectedUtilization.currentUsedBytes, 45);
  t.end();
});

test('checkAdd - accounts for active reservations', async (t) => {
  initializeConfig();
  const {cache, admission} = setupWithNode('node-1', NUM.HUNDRED);
  const now = Date.now();

  insertRow(cache, TABLES.STORAGE_RESERVATIONS, {
    [COLUMN.RESERVATION_ID]: 'res-1',
    [COLUMN.TARGET_NODE_ID]: 'node-1',
    [COLUMN.ESTIMATED_BYTES]: NUM.FOUR * NUM.TEN,
    [COLUMN.AMPLIFICATION_FACTOR]: NUM.ONE,
    [COLUMN.STATUS]: RESERVATION_STATUS.ACTIVE,
    [COLUMN.EXPIRES_AT]: now + NUM.THOUSAND * NUM.TEN,
  });

  // Reserved: 40 bytes. Request 50 more -> total 90% -> exceeds hard (85%)
  const result = await admission.checkAdd({
    targetNodeId: 'node-1',
    estimatedBytes: NUM.FIVE * NUM.TEN,
  });

  t.equal(result.decision, ADMISSION_DECISION.DENY);
  t.equal(result.reason, ADMISSION_REASON.HARD_PRESSURE_EXCEEDED);
  t.equal(
    result.projectedUtilization.currentReservedBytes,
    NUM.FOUR * NUM.TEN,
  );
  t.end();
});

// --- Emergency headroom with existing usage ---

test('checkReplace - critical allowed with existing usage within headroom',
  async (t) => {
    initializeConfig();
    // Budget 1000, emergency headroom 5%, max allowed = 950 bytes.
    const {cache, admission} = setupWithNode('node-1', NUM.THOUSAND);

    // Add existing usage: partition with 800 bytes payload
    insertRow(cache, TABLES.PARTITIONS, {
      [COLUMN.PARTITION_ID]: 'p-1',
      [COLUMN.SIZE_BYTES]: 800,
    });
    insertRow(cache, TABLES.SERVICES, {
      [COLUMN.SERVICE_ID]: 'svc-1',
      [COLUMN.NODE_ID]: 'node-1',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: 'p-1',
      [COLUMN.STATUS]: ReplicaStatus.ACTIVE,
    });

    // Used: max(800, 10) + 5 = 805. Request 100 -> total 905 = 90.5%
    // 90.5% < 95% emergency max -> allowed
    const result = await admission.checkReplace({
      targetNodeId: 'node-1',
      estimatedBytes: NUM.HUNDRED,
      isCritical: true,
    });

    t.equal(result.decision, ADMISSION_DECISION.ALLOW);
    t.equal(result.reason, ADMISSION_REASON.EMERGENCY_HEADROOM_AVAILABLE);
    t.end();
  });

// --- Configurable emergency headroom ---

test('checkReplace - respects custom emergency headroom config',
  async (t) => {
    initializeConfig({storageEmergencyHeadroomPercent: NUM.TEN});
    // Budget 100, emergency headroom 10%, max allowed = 90%.
    const {admission} = setupWithNode('node-1', NUM.HUNDRED);

    // Request 91 bytes -> 91% > 90% emergency max -> denied
    const result = await admission.checkReplace({
      targetNodeId: 'node-1',
      estimatedBytes: NUM.NINE * NUM.TEN + NUM.ONE,
      isCritical: true,
    });

    t.equal(result.decision, ADMISSION_DECISION.DENY);
    t.end();
  });

// --- Projected utilization structure ---

test('checkAdd - returns complete projected utilization', async (t) => {
  initializeConfig();
  const {admission} = setupWithNode('node-1', NUM.THOUSAND);

  const result = await admission.checkAdd({
    targetNodeId: 'node-1',
    estimatedBytes: NUM.HUNDRED,
  });

  const proj = result.projectedUtilization;
  t.equal(proj.budgetBytes, NUM.THOUSAND);
  t.equal(proj.currentUsedBytes, NUM.ZERO);
  t.equal(proj.currentReservedBytes, NUM.ZERO);
  t.equal(proj.estimatedBytes, NUM.HUNDRED);
  t.equal(proj.projectedAllocatedBytes, NUM.HUNDRED);
  t.equal(proj.projectedAvailableBytes, NUM.THOUSAND - NUM.HUNDRED);
  t.equal(proj.projectedUtilizationPercent, NUM.TEN);
  t.end();
});

// --- Result immutability ---

test('admission result is frozen', async (t) => {
  initializeConfig();
  const {admission} = setupWithNode('node-1', NUM.THOUSAND);

  const result = await admission.checkAdd({
    targetNodeId: 'node-1',
    estimatedBytes: NUM.TEN,
  });

  t.ok(Object.isFrozen(result));
  t.ok(Object.isFrozen(result.projectedUtilization));
  t.end();
});

// --- Property-based tests ---

test('PBT: admission never allows over-budget allocation', async (t) => {
  /**
   * Validates: Requirements 3.3
   *
   * When admission allows a non-critical operation, the projected
   * utilization must be below the hard pressure threshold.
   */
  initializeConfig();

  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 10000}),
      fc.integer({min: 1, max: 5000}),
      async (budget, estimated) => {
        const cache = new SystemTableCache();
        const accounting = new StorageCapacityAccountingService({
          systemTableCache: cache,
        });
        accounting.initialize({systemTableCache: cache});

        insertRow(cache, TABLES.NODES, {
          [COLUMN.NODE_ID]: 'pbt-node',
          [COLUMN.STORAGE_BUDGET_BYTES]: budget,
        });

        const admission = new StorageAdmissionService({
          accountingService: accounting,
        });

        const result = await admission.checkAdd({
          targetNodeId: 'pbt-node',
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
    {numRuns: 10},
  );
  t.pass('No over-budget allocation allowed');
  t.end();
});

test('PBT: deterministic admission for identical inputs', async (t) => {
  /**
   * Validates: Requirements 3.4
   *
   * Given the same metadata snapshot and estimated bytes, admission
   * must return the same decision and reason code.
   */
  initializeConfig();

  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 10000}),
      fc.integer({min: 1, max: 5000}),
      async (budget, estimated) => {
        const cache = new SystemTableCache();
        const accounting = new StorageCapacityAccountingService({
          systemTableCache: cache,
        });
        accounting.initialize({systemTableCache: cache});

        insertRow(cache, TABLES.NODES, {
          [COLUMN.NODE_ID]: 'det-node',
          [COLUMN.STORAGE_BUDGET_BYTES]: budget,
        });

        const admission = new StorageAdmissionService({
          accountingService: accounting,
        });

        const r1 = await admission.checkAdd({
          targetNodeId: 'det-node',
          estimatedBytes: estimated,
        });
        const r2 = await admission.checkAdd({
          targetNodeId: 'det-node',
          estimatedBytes: estimated,
        });

        return r1.decision === r2.decision && r1.reason === r2.reason;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Deterministic admission decisions');
  t.end();
});

test('PBT: critical replace allows more than non-critical at same usage',
  async (t) => {
    /**
     * Validates: Requirements 8.4
     *
     * A critical replacement must never be more restrictive than a
     * non-critical operation at the same utilization level. If
     * non-critical allows, critical must also allow.
     */
    initializeConfig();

    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 100, max: 10000}),
        fc.integer({min: 1, max: 5000}),
        async (budget, estimated) => {
          const cache = new SystemTableCache();
          const accounting = new StorageCapacityAccountingService({
            systemTableCache: cache,
          });
          accounting.initialize({systemTableCache: cache});

          insertRow(cache, TABLES.NODES, {
            [COLUMN.NODE_ID]: 'crit-node',
            [COLUMN.STORAGE_BUDGET_BYTES]: budget,
          });

          const admission = new StorageAdmissionService({
            accountingService: accounting,
          });

          const nonCritical = await admission.checkReplace({
            targetNodeId: 'crit-node',
            estimatedBytes: estimated,
            isCritical: false,
          });
          const critical = await admission.checkReplace({
            targetNodeId: 'crit-node',
            estimatedBytes: estimated,
            isCritical: true,
          });

          // If non-critical allows, critical must also allow
          if (nonCritical.decision === ADMISSION_DECISION.ALLOW) {
            return critical.decision === ADMISSION_DECISION.ALLOW;
          }
          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Critical replace is never more restrictive than non-critical');
    t.end();
  });
