/**
 * Tests for StorageCapacityMetrics and admin storage diagnostics (Task 12).
 *
 * Validates:
 * - Req 10.1: metrics report used/reserved/available bytes and pressure state
 * - Req 10.2: admission counters track allow/deny decisions
 * - Req 10.3: admin handlers expose reservations and capacity snapshots
 * - Req 10.4: CLI/node views display budget utilization
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NUM} from '../../src/constants/index.js';
import {
  ADMISSION_DECISION,
  PRESSURE_STATE,
  STORAGE_ADMIN_COMMAND,
  STORAGE_METRIC,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {
  StorageCapacityMetrics,
} from '../../src/rebalancer/storage-capacity-metrics.js';
import {
  handleGetStorageCapacity,
  handleGetStorageReservations,
} from '../../src/admin/admin-storage-diagnostics.js';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({});
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

const BUDGET = 1000000;
const USED = 400000;
const RESERVED = 100000;
const AVAILABLE = 500000;
const UTILIZATION = 50;

/**
 * Build a mock accounting service with fixed snapshots.
 * @param {Object[]} snapshots
 * @return {Object}
 */
function makeAccountingService(snapshots) {
  return {
    getCapacitySnapshotForNode: async (nodeId) => {
      return snapshots.find((s) => s.nodeId === nodeId) || null;
    },
    getCapacitySnapshots: async () => snapshots,
  };
}

function makeSnapshot(nodeId, overrides = {}) {
  return {
    nodeId,
    budgetBytes: BUDGET,
    usedBytes: USED,
    reservedBytes: RESERVED,
    availableBytes: AVAILABLE,
    utilizationPercent: UTILIZATION,
    pressureState: PRESSURE_STATE.NORMAL,
    ...overrides,
  };
}

test('StorageCapacityMetrics', async (t) => {
  t.beforeEach(initEnv);
  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  // --- Req 10.1: single node metric collection ---

  await t.test('collectNodeMetrics returns metrics for a node',
    async (t) => {
      const snapshot = makeSnapshot('n1');
      const metrics = new StorageCapacityMetrics({
        accountingService: makeAccountingService([snapshot]),
      });

      const result = await metrics.collectNodeMetrics('n1');

      t.ok(result, 'result should not be null');
      t.equal(result.nodeId, 'n1');
      t.equal(result[STORAGE_METRIC.BUDGET_BYTES], BUDGET);
      t.equal(result[STORAGE_METRIC.USED_BYTES], USED);
      t.equal(result[STORAGE_METRIC.RESERVED_BYTES], RESERVED);
      t.equal(result[STORAGE_METRIC.AVAILABLE_BYTES], AVAILABLE);
      t.equal(result[STORAGE_METRIC.UTILIZATION_PERCENT], UTILIZATION);
      t.equal(
        result[STORAGE_METRIC.PRESSURE_STATE], PRESSURE_STATE.NORMAL,
      );
    });

  await t.test('collectNodeMetrics returns null for unknown node',
    async (t) => {
      const metrics = new StorageCapacityMetrics({
        accountingService: makeAccountingService([]),
      });

      const result = await metrics.collectNodeMetrics('unknown');
      t.equal(result, null);
    });

  await t.test('collectNodeMetrics returns null without accounting',
    async (t) => {
      const metrics = new StorageCapacityMetrics({});
      const result = await metrics.collectNodeMetrics('n1');
      t.equal(result, null);
    });

  await t.test('collectNodeMetrics returns null for empty nodeId',
    async (t) => {
      const metrics = new StorageCapacityMetrics({
        accountingService: makeAccountingService([makeSnapshot('n1')]),
      });
      const result = await metrics.collectNodeMetrics('');
      t.equal(result, null);
    });

  // --- Req 10.1: all-node metric collection ---

  await t.test('collectAllNodeMetrics returns metrics for all nodes',
    async (t) => {
      const snapshots = [
        makeSnapshot('n1'),
        makeSnapshot('n2', {pressureState: PRESSURE_STATE.SOFT}),
      ];
      const metrics = new StorageCapacityMetrics({
        accountingService: makeAccountingService(snapshots),
      });

      const results = await metrics.collectAllNodeMetrics();

      t.equal(results.length, NUM.TWO);
      t.equal(results[NUM.ZERO].nodeId, 'n1');
      t.equal(
        results[NUM.ZERO][STORAGE_METRIC.PRESSURE_STATE],
        PRESSURE_STATE.NORMAL,
      );
      t.equal(results[NUM.ONE].nodeId, 'n2');
      t.equal(
        results[NUM.ONE][STORAGE_METRIC.PRESSURE_STATE],
        PRESSURE_STATE.SOFT,
      );
    });

  await t.test('collectAllNodeMetrics returns empty without accounting',
    async (t) => {
      const metrics = new StorageCapacityMetrics({});
      const results = await metrics.collectAllNodeMetrics();
      t.equal(results.length, NUM.ZERO);
    });

  await t.test('collectAllNodeMetrics returns empty when no nodes',
    async (t) => {
      const metrics = new StorageCapacityMetrics({
        accountingService: makeAccountingService([]),
      });
      const results = await metrics.collectAllNodeMetrics();
      t.equal(results.length, NUM.ZERO);
    });

  // --- Req 10.2: admission metric tracking ---

  await t.test('recordAdmission tracks allow decisions', async (t) => {
    const metrics = new StorageCapacityMetrics({});

    metrics.recordAdmission({decision: ADMISSION_DECISION.ALLOW});
    metrics.recordAdmission({decision: ADMISSION_DECISION.ALLOW});

    const counters = metrics.getAdmissionMetrics();
    t.equal(
      counters[STORAGE_METRIC.ADMISSION_ALLOW_COUNT], NUM.TWO,
    );
    t.equal(
      counters[STORAGE_METRIC.ADMISSION_DENY_COUNT], NUM.ZERO,
    );
  });

  await t.test('recordAdmission tracks deny decisions', async (t) => {
    const metrics = new StorageCapacityMetrics({});

    metrics.recordAdmission({decision: ADMISSION_DECISION.DENY});

    const counters = metrics.getAdmissionMetrics();
    t.equal(
      counters[STORAGE_METRIC.ADMISSION_ALLOW_COUNT], NUM.ZERO,
    );
    t.equal(
      counters[STORAGE_METRIC.ADMISSION_DENY_COUNT], NUM.ONE,
    );
  });

  await t.test('recordAdmission ignores null input', async (t) => {
    const metrics = new StorageCapacityMetrics({});

    metrics.recordAdmission(null);
    metrics.recordAdmission(undefined);

    const counters = metrics.getAdmissionMetrics();
    t.equal(
      counters[STORAGE_METRIC.ADMISSION_ALLOW_COUNT], NUM.ZERO,
    );
    t.equal(
      counters[STORAGE_METRIC.ADMISSION_DENY_COUNT], NUM.ZERO,
    );
  });

  await t.test('recordAdmission tracks mixed decisions', async (t) => {
    const metrics = new StorageCapacityMetrics({});

    metrics.recordAdmission({decision: ADMISSION_DECISION.ALLOW});
    metrics.recordAdmission({decision: ADMISSION_DECISION.DENY});
    metrics.recordAdmission({decision: ADMISSION_DECISION.ALLOW});
    metrics.recordAdmission({decision: ADMISSION_DECISION.DENY});
    metrics.recordAdmission({decision: ADMISSION_DECISION.DENY});

    const counters = metrics.getAdmissionMetrics();
    t.equal(
      counters[STORAGE_METRIC.ADMISSION_ALLOW_COUNT], NUM.TWO,
    );
    const expectedDenies = 3;
    t.equal(
      counters[STORAGE_METRIC.ADMISSION_DENY_COUNT], expectedDenies,
    );
  });
});

// --- Req 10.3: admin diagnostic handlers ---

test('Admin storage diagnostics', async (t) => {
  t.beforeEach(initEnv);
  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  await t.test('handleGetStorageCapacity returns all snapshots',
    async (t) => {
      const snapshots = [makeSnapshot('n1'), makeSnapshot('n2')];
      const context = {
        accountingService: makeAccountingService(snapshots),
      };

      const result = await handleGetStorageCapacity({}, context);

      t.equal(result.success, true);
      t.equal(
        result.command,
        STORAGE_ADMIN_COMMAND.GET_STORAGE_CAPACITY,
      );
      t.equal(result.snapshots.length, NUM.TWO);
    });

  await t.test('handleGetStorageCapacity filters by nodeId',
    async (t) => {
      const snapshots = [makeSnapshot('n1'), makeSnapshot('n2')];
      const context = {
        accountingService: makeAccountingService(snapshots),
      };

      const result = await handleGetStorageCapacity(
        {nodeId: 'n1'}, context,
      );

      t.equal(result.success, true);
      t.equal(result.snapshots.length, NUM.ONE);
      t.equal(result.snapshots[NUM.ZERO].nodeId, 'n1');
    });

  await t.test('handleGetStorageCapacity returns empty for unknown node',
    async (t) => {
      const context = {
        accountingService: makeAccountingService([]),
      };

      const result = await handleGetStorageCapacity(
        {nodeId: 'unknown'}, context,
      );

      t.equal(result.success, true);
      t.equal(result.snapshots.length, NUM.ZERO);
    });

  await t.test('handleGetStorageCapacity fails without service',
    async (t) => {
      const result = await handleGetStorageCapacity({}, {});

      t.equal(result.success, false);
      t.ok(result.errors.length > NUM.ZERO);
    });

  await t.test('handleGetStorageReservations returns SQL with defaults',
    async (t) => {
      const result = handleGetStorageReservations({});

      t.equal(result.success, true);
      t.equal(
        result.command,
        STORAGE_ADMIN_COMMAND.GET_STORAGE_RESERVATIONS,
      );
      t.ok(result.sql.includes('storage_reservations'));
      t.ok(result.sql.includes('status'));
      t.equal(result.params.length, NUM.ONE);
      t.equal(result.params[NUM.ZERO], 'active');
    });

  await t.test('handleGetStorageReservations filters by nodeId',
    async (t) => {
      const result = handleGetStorageReservations({nodeId: 'n1'});

      t.equal(result.success, true);
      t.ok(result.sql.includes('target_node_id'));
      t.equal(result.params.length, NUM.TWO);
      t.equal(result.params[NUM.ZERO], 'n1');
    });

  await t.test('handleGetStorageReservations filters by status',
    async (t) => {
      const result = handleGetStorageReservations({status: 'released'});

      t.equal(result.success, true);
      t.ok(result.sql.includes('status'));
      t.equal(result.params.length, NUM.ONE);
      t.equal(result.params[NUM.ZERO], 'released');
    });
});
