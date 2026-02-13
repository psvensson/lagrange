/**
 * Ownership and regression tests for storage capacity architecture.
 *
 * These are structural/contract tests that verify the architecture
 * invariants described in Requirements 11.1–11.5 and 13.5:
 *
 * - Single accounting owner (Req 11.1)
 * - Single admission owner (Req 11.2)
 * - MovePlanner single planner consuming admission APIs (Req 11.3)
 * - Coordinator lifecycle ownership with delegated reservation (Req 11.4)
 * - No duplicate capacity cache (Req 11.5)
 * - No bypass paths for admission/reservation (Req 13.5)
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NUM} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  ADMISSION_DECISION,
  PRESSURE_STATE,
  STORAGE_CAPACITY_DEFAULT,
} from '../../src/rebalancer/storage-capacity-constants.js';

import {StorageCapacityAccountingService} from
  '../../src/rebalancer/storage-capacity-accounting-service.js';
import {StorageAdmissionService} from
  '../../src/rebalancer/storage-admission-service.js';
import {StoragePressureBehavior} from
  '../../src/rebalancer/storage-pressure-behavior.js';
import {StorageCapacityMetrics} from
  '../../src/rebalancer/storage-capacity-metrics.js';
import {StorageCapacityMigration} from
  '../../src/rebalancer/storage-capacity-migration.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {PartitionSplitMergeManager} from
  '../../src/partition/partition-split-merge-manager.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({});
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function createMinimalCache(nodeRows = [], serviceRows = [],
  reservationRows = []) {
  const tables = {
    nodes: nodeRows,
    services: serviceRows,
    storage_reservations: reservationRows,
  };
  return {
    getAll(tableName) {
      return tables[tableName] || [];
    },
    get(tableName, key) {
      const rows = tables[tableName] || [];
      return rows.find((r) => r.node_id === key) || null;
    },
    filter(tableName, predicate) {
      return (tables[tableName] || []).filter(predicate);
    },
  };
}

function createMinimalMoveStateProvider() {
  return {
    getNodeStates() {
      return [];
    },
    getServiceRows() {
      return [];
    },
  };
}

// ---------------------------------------------------------------
// Req 11.1 — Single accounting owner
// ---------------------------------------------------------------

test('Req 11.1 — StorageCapacityAccountingService is the ' +
  'single capacity snapshot owner', async (t) => {
  t.beforeEach(() => initializeTestEnvironment());
  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  await t.test('exports getCapacitySnapshots method', (t) => {
    const service = new StorageCapacityAccountingService();
    t.equal(typeof service.getCapacitySnapshots, 'function');
    t.end();
  });

  await t.test('exports getCapacitySnapshotForNode method', (t) => {
    const service = new StorageCapacityAccountingService();
    t.equal(typeof service.getCapacitySnapshotForNode, 'function');
    t.end();
  });

  await t.test('exports estimateReplicaBytes method', (t) => {
    const service = new StorageCapacityAccountingService();
    t.equal(typeof service.estimateReplicaBytes, 'function');
    t.end();
  });

  await t.test('StorageAdmissionService does not implement its ' +
    'own snapshot computation', (t) => {
    const accounting = new StorageCapacityAccountingService();
    const admission = new StorageAdmissionService({
      accountingService: accounting,
    });
    t.equal(admission.getCapacitySnapshots, undefined);
    t.equal(admission.getCapacitySnapshotForNode, undefined);
    t.equal(admission.buildSnapshot, undefined);
    t.end();
  });

  await t.test('StoragePressureBehavior does not implement its ' +
    'own snapshot computation', (t) => {
    const behavior = new StoragePressureBehavior({});
    t.equal(behavior.getCapacitySnapshots, undefined);
    t.equal(behavior.getCapacitySnapshotForNode, undefined);
    t.equal(behavior.buildSnapshot, undefined);
    t.end();
  });

  await t.test('StorageCapacityMetrics does not implement its ' +
    'own snapshot computation', (t) => {
    const metrics = new StorageCapacityMetrics({});
    t.equal(metrics.getCapacitySnapshots, undefined);
    t.equal(metrics.getCapacitySnapshotForNode, undefined);
    t.equal(metrics.buildSnapshot, undefined);
    t.end();
  });

  await t.test('StorageCapacityMigration does not implement its ' +
    'own snapshot computation', (t) => {
    const migration = new StorageCapacityMigration({});
    t.equal(migration.getCapacitySnapshots, undefined);
    t.equal(migration.getCapacitySnapshotForNode, undefined);
    t.equal(migration.buildSnapshot, undefined);
    t.end();
  });
});

// ---------------------------------------------------------------
// Req 11.2 — Single admission owner
// ---------------------------------------------------------------

test('Req 11.2 — StorageAdmissionService is the single ' +
  'admission gate', async (t) => {
  t.beforeEach(() => initializeTestEnvironment());
  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  await t.test('exports checkAdd, checkReplace, checkSplit', (t) => {
    const accounting = new StorageCapacityAccountingService();
    const admission = new StorageAdmissionService({
      accountingService: accounting,
    });
    t.equal(typeof admission.checkAdd, 'function');
    t.equal(typeof admission.checkReplace, 'function');
    t.equal(typeof admission.checkSplit, 'function');
    t.end();
  });

  await t.test('MovePlanner does not implement its own ' +
    'admission methods', (t) => {
    const planner = new MovePlanner({
      entityId: 'p-1',
      entityType: SERVICE_TYPE.PARTITION,
      moveStateProvider: createMinimalMoveStateProvider(),
    });
    t.equal(planner.checkAdd, undefined);
    t.equal(planner.checkReplace, undefined);
    t.equal(planner.checkSplit, undefined);
    t.end();
  });

  await t.test('MovePlanner delegates capacity filtering to ' +
    'storageAdmissionService.checkAdd', async (t) => {
    let checkAddCalled = false;
    const mockAdmission = {
      checkAdd: async () => {
        checkAddCalled = true;
        return {
          decision: ADMISSION_DECISION.ALLOW,
          reason: 'capacity_available',
          projectedUtilization: {},
        };
      },
    };
    const planner = new MovePlanner({
      entityId: 'p-1',
      entityType: SERVICE_TYPE.PARTITION,
      moveStateProvider: createMinimalMoveStateProvider(),
      storageAdmissionService: mockAdmission,
      accountingService: {
        estimateReplicaBytes: () => NUM.THOUSAND,
      },
    });

    const nodes = [{node_id: 'n-1'}];
    await planner.filterNodesByCapacity(nodes, NUM.THOUSAND);
    t.ok(checkAddCalled,
      'filterNodesByCapacity must delegate to checkAdd');
    t.end();
  });

  await t.test('PartitionSplitMergeManager delegates split ' +
    'preflight to storageAdmissionService.checkSplit',
  async (t) => {
    let checkSplitCalled = false;
    const mockAdmission = {
      checkSplit: async () => {
        checkSplitCalled = true;
        return {
          decision: ADMISSION_DECISION.ALLOW,
          reason: 'capacity_available',
          projectedUtilization: {},
        };
      },
    };
    const mockAccounting = {
      estimateReplicaBytes: () => NUM.THOUSAND,
    };
    const manager = new PartitionSplitMergeManager({
      storageAdmissionService: mockAdmission,
      storageAccountingService: mockAccounting,
    });

    const result = await manager.checkSplitCapacityPreflight(
      'part-1', {sizeBytes: NUM.HUNDRED}, 'n-1',
    );
    t.ok(checkSplitCalled,
      'checkSplitCapacityPreflight must delegate to checkSplit');
    t.ok(result.feasible);
    t.end();
  });
});

// ---------------------------------------------------------------
// Req 11.3 — MovePlanner single planner consuming admission APIs
// ---------------------------------------------------------------

test('Req 11.3 — MovePlanner consumes admission and pressure ' +
  'APIs via dependency injection', async (t) => {
  t.beforeEach(() => initializeTestEnvironment());
  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  await t.test('accepts storageAdmissionService dependency', (t) => {
    const mockAdmission = {checkAdd: async () => ({})};
    const planner = new MovePlanner({
      entityId: 'p-1',
      entityType: SERVICE_TYPE.PARTITION,
      moveStateProvider: createMinimalMoveStateProvider(),
      storageAdmissionService: mockAdmission,
    });
    t.equal(planner.storageAdmissionService, mockAdmission);
    t.end();
  });

  await t.test('accepts storagePressureBehavior dependency', (t) => {
    const mockBehavior = {shouldAllowMove: async () => ({})};
    const planner = new MovePlanner({
      entityId: 'p-1',
      entityType: SERVICE_TYPE.PARTITION,
      moveStateProvider: createMinimalMoveStateProvider(),
      storagePressureBehavior: mockBehavior,
    });
    t.equal(planner.storagePressureBehavior, mockBehavior);
    t.end();
  });

  await t.test('accepts accountingService dependency', (t) => {
    const mockAccounting = {estimateReplicaBytes: () => NUM.ZERO};
    const planner = new MovePlanner({
      entityId: 'p-1',
      entityType: SERVICE_TYPE.PARTITION,
      moveStateProvider: createMinimalMoveStateProvider(),
      accountingService: mockAccounting,
    });
    t.equal(planner.accountingService, mockAccounting);
    t.end();
  });

  await t.test('does not implement its own capacity snapshot ' +
    'computation', (t) => {
    const planner = new MovePlanner({
      entityId: 'p-1',
      entityType: SERVICE_TYPE.PARTITION,
      moveStateProvider: createMinimalMoveStateProvider(),
    });
    t.equal(planner.getCapacitySnapshots, undefined);
    t.equal(planner.getCapacitySnapshotForNode, undefined);
    t.equal(planner.buildSnapshot, undefined);
    t.equal(planner.getPressureState, undefined);
    t.end();
  });

  await t.test('delegates pressure gating to ' +
    'storagePressureBehavior.shouldAllowMove', async (t) => {
    let shouldAllowCalled = false;
    const mockBehavior = {
      shouldAllowMove: async () => {
        shouldAllowCalled = true;
        return {
          decision: 'allow',
          pressureState: PRESSURE_STATE.NORMAL,
        };
      },
    };
    const planner = new MovePlanner({
      entityId: 'p-1',
      entityType: SERVICE_TYPE.PARTITION,
      moveStateProvider: createMinimalMoveStateProvider(),
      storagePressureBehavior: mockBehavior,
    });

    const moves = [{
      type: 'ADD',
      nodeId: 'n-1',
      reason: 'spread',
    }];
    await planner.applyPressureGating(moves);
    t.ok(shouldAllowCalled,
      'applyPressureGating must delegate to shouldAllowMove');
    t.end();
  });
});

// ---------------------------------------------------------------
// Req 11.4 — Coordinator lifecycle ownership with delegated
//            reservation APIs
// ---------------------------------------------------------------

test('Req 11.4 — RebalanceCoordinator owns reservation lifecycle ' +
  'via delegated APIs', async (t) => {
  t.beforeEach(() => initializeTestEnvironment());
  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  await t.test('accepts storageAdmissionService dependency', (t) => {
    const mockAdmission = {checkAdd: async () => ({})};
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-1',
      systemTableCache: createMinimalCache(),
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
      },
      messageRouter: {
        deliver: async () => ({acknowledged: true}),
        getConnectionState: () => 'connected',
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({}),
      },
      sqlQueryEngine: {
        executeQuery: async () => ({rows: []}),
      },
      storageAdmissionService: mockAdmission,
    });
    t.equal(coordinator.storageAdmissionService, mockAdmission);
    coordinator.shutdown();
    t.end();
  });

  await t.test('accepts storageAccountingService dependency', (t) => {
    const mockAccounting = {estimateReplicaBytes: () => NUM.ZERO};
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-1',
      systemTableCache: createMinimalCache(),
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
      },
      messageRouter: {
        deliver: async () => ({acknowledged: true}),
        getConnectionState: () => 'connected',
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({}),
      },
      sqlQueryEngine: {
        executeQuery: async () => ({rows: []}),
      },
      storageAccountingService: mockAccounting,
    });
    t.equal(coordinator.storageAccountingService, mockAccounting);
    coordinator.shutdown();
    t.end();
  });

  await t.test('exposes createReservationForOperation as a ' +
    'method', (t) => {
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-1',
      systemTableCache: createMinimalCache(),
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
      },
      messageRouter: {
        deliver: async () => ({acknowledged: true}),
        getConnectionState: () => 'connected',
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({}),
      },
      sqlQueryEngine: {
        executeQuery: async () => ({rows: []}),
      },
    });
    t.equal(
      typeof coordinator.createReservationForOperation, 'function',
    );
    coordinator.shutdown();
    t.end();
  });

  await t.test('exposes releaseReservationForOperation as a ' +
    'method', (t) => {
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-1',
      systemTableCache: createMinimalCache(),
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
      },
      messageRouter: {
        deliver: async () => ({acknowledged: true}),
        getConnectionState: () => 'connected',
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({}),
      },
      sqlQueryEngine: {
        executeQuery: async () => ({rows: []}),
      },
    });
    t.equal(
      typeof coordinator.releaseReservationForOperation, 'function',
    );
    coordinator.shutdown();
    t.end();
  });

  await t.test('exposes reconcileReservations as a method', (t) => {
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-1',
      systemTableCache: createMinimalCache(),
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
      },
      messageRouter: {
        deliver: async () => ({acknowledged: true}),
        getConnectionState: () => 'connected',
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({}),
      },
      sqlQueryEngine: {
        executeQuery: async () => ({rows: []}),
      },
    });
    t.equal(typeof coordinator.reconcileReservations, 'function');
    coordinator.shutdown();
    t.end();
  });

  await t.test('does not maintain its own reservation state ' +
    'map', (t) => {
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-1',
      systemTableCache: createMinimalCache(),
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
      },
      messageRouter: {
        deliver: async () => ({acknowledged: true}),
        getConnectionState: () => 'connected',
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({}),
      },
      sqlQueryEngine: {
        executeQuery: async () => ({rows: []}),
      },
    });
    // The coordinator must not have a local reservations Map/Set.
    // It persists reservations via SQL and reads via SQL/cache.
    t.equal(coordinator.reservations, undefined);
    t.equal(coordinator.reservationMap, undefined);
    t.equal(coordinator.activeReservations, undefined);
    coordinator.shutdown();
    t.end();
  });
});

// ---------------------------------------------------------------
// Req 11.5 — No duplicate capacity cache
// ---------------------------------------------------------------

test('Req 11.5 — No duplicate in-memory capacity cache outside ' +
  'SQL/cache ownership', async (t) => {
  t.beforeEach(() => initializeTestEnvironment());
  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  await t.test('StorageCapacityAccountingService reads from ' +
    'SystemTableCache', (t) => {
    const cache = createMinimalCache();
    const service = new StorageCapacityAccountingService({
      systemTableCache: cache,
    });
    t.equal(service.systemTableCache, cache);
    t.end();
  });

  await t.test('StorageCapacityAccountingService does not ' +
    'maintain a local capacity Map', (t) => {
    const service = new StorageCapacityAccountingService();
    // Must not have any local cache of capacity data
    t.equal(service.capacityCache, undefined);
    t.equal(service.snapshotCache, undefined);
    t.equal(service.nodeCapacityMap, undefined);
    t.end();
  });

  await t.test('StorageAdmissionService does not maintain a ' +
    'local capacity Map', (t) => {
    const accounting = new StorageCapacityAccountingService();
    const admission = new StorageAdmissionService({
      accountingService: accounting,
    });
    t.equal(admission.capacityCache, undefined);
    t.equal(admission.snapshotCache, undefined);
    t.equal(admission.nodeCapacityMap, undefined);
    t.end();
  });

  await t.test('StoragePressureBehavior tracks only pressure ' +
    'state transitions, not capacity data', (t) => {
    const behavior = new StoragePressureBehavior({});
    // knownStates is a transition tracker, not a capacity cache
    t.ok(behavior.knownStates instanceof Map);
    // Must not have capacity data caches
    t.equal(behavior.capacityCache, undefined);
    t.equal(behavior.snapshotCache, undefined);
    t.equal(behavior.nodeCapacityMap, undefined);
    t.end();
  });

  await t.test('StorageCapacityMetrics does not maintain a ' +
    'local capacity Map', (t) => {
    const metrics = new StorageCapacityMetrics({});
    t.equal(metrics.capacityCache, undefined);
    t.equal(metrics.snapshotCache, undefined);
    t.equal(metrics.nodeCapacityMap, undefined);
    t.end();
  });

  await t.test('StorageCapacityMigration does not maintain a ' +
    'local capacity Map', (t) => {
    const migration = new StorageCapacityMigration({});
    t.equal(migration.capacityCache, undefined);
    t.equal(migration.snapshotCache, undefined);
    t.equal(migration.nodeCapacityMap, undefined);
    t.end();
  });
});

// ---------------------------------------------------------------
// Req 13.5 — No bypass paths for admission and reservation
// ---------------------------------------------------------------

test('Req 13.5 — No bypass paths for admission or reservation ' +
  'logic', async (t) => {
  t.beforeEach(() => initializeTestEnvironment());
  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  await t.test('StorageAdmissionService is the only class with ' +
    'checkAdd/checkReplace/checkSplit', (t) => {
    // Verify MovePlanner has no admission methods
    const planner = new MovePlanner({
      entityId: 'p-1',
      entityType: SERVICE_TYPE.PARTITION,
      moveStateProvider: createMinimalMoveStateProvider(),
    });
    t.equal(planner.checkAdd, undefined);
    t.equal(planner.checkReplace, undefined);
    t.equal(planner.checkSplit, undefined);
    t.equal(planner.evaluate, undefined);

    // Verify RebalanceCoordinator has no admission methods
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-1',
      systemTableCache: createMinimalCache(),
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
      },
      messageRouter: {
        deliver: async () => ({acknowledged: true}),
        getConnectionState: () => 'connected',
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({}),
      },
      sqlQueryEngine: {
        executeQuery: async () => ({rows: []}),
      },
    });
    t.equal(coordinator.checkAdd, undefined);
    t.equal(coordinator.checkReplace, undefined);
    t.equal(coordinator.checkSplit, undefined);
    coordinator.shutdown();

    // Verify PartitionSplitMergeManager has no direct admission
    // methods — it delegates via checkSplitCapacityPreflight
    const manager = new PartitionSplitMergeManager({});
    t.equal(manager.checkAdd, undefined);
    t.equal(manager.checkReplace, undefined);
    t.equal(manager.checkSplit, undefined);
    t.end();
  });

  await t.test('PartitionSplitMergeManager preflight delegates ' +
    'to admission service, not its own logic', async (t) => {
    let delegated = false;
    const mockAdmission = {
      checkSplit: async () => {
        delegated = true;
        return {
          decision: ADMISSION_DECISION.DENY,
          reason: 'budget_exceeded',
          projectedUtilization: {},
        };
      },
    };
    const mockAccounting = {
      estimateReplicaBytes: () => NUM.THOUSAND,
    };
    const manager = new PartitionSplitMergeManager({
      storageAdmissionService: mockAdmission,
      storageAccountingService: mockAccounting,
    });

    const result = await manager.checkSplitCapacityPreflight(
      'part-1', {sizeBytes: NUM.HUNDRED}, 'n-1',
    );
    t.ok(delegated, 'must delegate to admission service');
    t.equal(result.feasible, false,
      'must respect admission denial');
    t.end();
  });

  await t.test('MovePlanner capacity filter respects admission ' +
    'denial without fallback', async (t) => {
    const mockAdmission = {
      checkAdd: async () => ({
        decision: ADMISSION_DECISION.DENY,
        reason: 'budget_exceeded',
        projectedUtilization: {},
      }),
    };
    const planner = new MovePlanner({
      entityId: 'p-1',
      entityType: SERVICE_TYPE.PARTITION,
      moveStateProvider: createMinimalMoveStateProvider(),
      storageAdmissionService: mockAdmission,
      accountingService: {
        estimateReplicaBytes: () => NUM.THOUSAND,
      },
    });

    const nodes = [{node_id: 'n-1'}, {node_id: 'n-2'}];
    const {feasibleNodes, diagnostics} =
      await planner.filterNodesByCapacity(nodes, NUM.THOUSAND);
    t.equal(feasibleNodes.length, NUM.ZERO,
      'all nodes must be rejected when admission denies');
    t.equal(diagnostics.rejectedCount, nodes.length);
    t.end();
  });

  await t.test('no alternate checkCapacity or hasCapacity ' +
    'methods exist on any storage-capacity component', (t) => {
    const components = [
      new StorageCapacityAccountingService(),
      new StorageAdmissionService({
        accountingService: new StorageCapacityAccountingService(),
      }),
      new StoragePressureBehavior({}),
      new StorageCapacityMetrics({}),
      new StorageCapacityMigration({}),
    ];

    for (const component of components) {
      const name = component.constructor.name;
      t.equal(component.checkCapacity, undefined,
        `${name} must not have checkCapacity`);
      t.equal(component.hasCapacity, undefined,
        `${name} must not have hasCapacity`);
      t.equal(component.canFit, undefined,
        `${name} must not have canFit`);
      t.equal(component.hasFreeSpace, undefined,
        `${name} must not have hasFreeSpace`);
    }
    t.end();
  });

  await t.test('RebalanceCoordinator reservation methods use ' +
    'SQL persistence, not local state', (t) => {
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-1',
      systemTableCache: createMinimalCache(),
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
      },
      messageRouter: {
        deliver: async () => ({acknowledged: true}),
        getConnectionState: () => 'connected',
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({}),
      },
      sqlQueryEngine: {
        executeQuery: async () => ({rows: []}),
      },
    });

    // Coordinator must use SQL for reservation persistence.
    // Verify it has the SQL execution method but no local
    // reservation state.
    t.equal(
      typeof coordinator.executeOperationMutationWithRetry,
      'function',
    );
    t.equal(coordinator.reservations, undefined);
    t.equal(coordinator.reservationMap, undefined);
    t.equal(coordinator.reservationCache, undefined);
    coordinator.shutdown();
    t.end();
  });
});
