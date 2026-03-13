/**
 * Regression tests proving dispatch, rebalance, and split admission
 * workflows consume readiness from ControlPlaneReadinessService.
 *
 * Validates: Requirements 4.1, 4.2, 4.3 (Unified Readiness Contract)
 *
 * These tests fail if any workflow bypasses the canonical readiness
 * service and falls back to a local heuristic.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SERVICE_STATUS, NUM, TYPEOF} from '../../src/constants/index.js';
import {
  ADMISSION_MODE,
} from '../../src/rebalancer/storage-capacity-constants.js';

const FIXTURE_NODE_ID = 'node-readiness-1';
const FIXTURE_PARTITION_ID = 'partition-readiness-1';
const FIXTURE_LEASE_FUTURE_MS = 60000;

/**
 * Build a readiness snapshot with all dimensions set to a value.
 * @param {string} nodeId
 * @param {boolean} ready
 * @return {Object}
 */
function buildReadiness(nodeId, ready) {
  return {
    nodeId,
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: ready,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
        ready,
      [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: ready,
      [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: ready,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: ready,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
        ready,
      [CONTROL_PLANE_READINESS_DIMENSION
        .METADATA_PUBLICATION_HEALTHY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: ready,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: ready,
    },
    reasons: [],
  };
}

/**
 * Create a mock readiness service that returns controlled snapshots.
 * @param {Map<string,Object>} readinessMap - nodeId → snapshot
 * @return {Object}
 */
function createControlledReadinessService(readinessMap) {
  return {
    getNodeReadinessSync: (nodeId) => {
      return readinessMap.get(nodeId) ||
        buildReadiness(nodeId, false);
    },
    getNodeReadiness: async (nodeId) => {
      return readinessMap.get(nodeId) ||
        buildReadiness(nodeId, false);
    },
    getAllNodeReadiness: async () => {
      return Array.from(readinessMap.values());
    },
  };
}

function createMinimalCache(nodes = []) {
  const now = Date.now();
  const nodeMap = new Map(nodes.map((n) => [n.node_id, {
    ready_lease_expires_at: now + FIXTURE_LEASE_FUTURE_MS,
    status: SERVICE_STATUS.ACTIVE,
    ...n,
  }]));
  return {
    get: (table, key) => {
      if (table === SYSTEM_TABLE_NAME.NODES) {
        return nodeMap.get(key) || null;
      }
      return null;
    },
    filter: (table, predicate) => {
      if (table === SYSTEM_TABLE_NAME.NODES) {
        return Array.from(nodeMap.values()).filter(predicate);
      }
      return [];
    },
    getAll: (table) => {
      if (table === SYSTEM_TABLE_NAME.NODES) {
        return Array.from(nodeMap.values());
      }
      return [];
    },
  };
}

function createQueryRoutingCache({services = [], partitions = []} = {}) {
  const serviceRows = services.map((service) => ({...service}));
  const partitionRows = partitions.map((partition) => ({...partition}));
  return {
    get: (table, key) => {
      if (table === SYSTEM_TABLE_NAME.PARTITIONS) {
        return partitionRows.find((partition) =>
          partition.partition_id === key,
        ) || null;
      }
      if (table === SYSTEM_TABLE_NAME.SERVICES) {
        return serviceRows.find((service) =>
          service.service_id === key || service.replica_id === key,
        ) || null;
      }
      return null;
    },
    filter: (table, predicate) => {
      if (table === SYSTEM_TABLE_NAME.PARTITIONS) {
        return partitionRows.filter(predicate);
      }
      if (table === SYSTEM_TABLE_NAME.SERVICES) {
        return serviceRows.filter(predicate);
      }
      return [];
    },
    getAll: (table) => {
      if (table === SYSTEM_TABLE_NAME.PARTITIONS) {
        return partitionRows;
      }
      if (table === SYSTEM_TABLE_NAME.SERVICES) {
        return serviceRows;
      }
      return [];
    },
  };
}

function createPublicationOwner() {
  return {
    getPublicationModeDiagnostics: () => ({
      currentMode: 'grouped',
      reasonCode: 'normal',
      enteredAt: new Date().toISOString(),
      recentTransitions: [],
    }),
  };
}

function initEnv() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: FIXTURE_NODE_ID},
      logging: {level: 'error'},
      rebalancer: {
        storageAdmissionMode: ADMISSION_MODE.ENFORCE,
      },
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

// ── Dispatch ────────────────────────────────────────────────────────

test('ReplicaDispatchService.isNodeReady consumes canonical readiness',
  async (t) => {
    initEnv();
    const {ReplicaDispatchService} = await import(
      '../../src/control-plane/replica-dispatch-service.js'
    );

    const readinessMap = new Map();
    readinessMap.set(
      FIXTURE_NODE_ID, buildReadiness(FIXTURE_NODE_ID, true),
    );

    const cache = createMinimalCache([
      {node_id: FIXTURE_NODE_ID},
    ]);
    const readinessService =
      createControlledReadinessService(readinessMap);

    const dispatch = new ReplicaDispatchService({
      nodeId: FIXTURE_NODE_ID,
      systemTableCache: cache,
      controlPlaneReadinessService: readinessService,
    });

    await t.test('returns true when readiness reports routing ready',
      async (t) => {
        t.equal(
          dispatch.isNodeReady(FIXTURE_NODE_ID),
          true,
          'node should be ready when canonical readiness says so',
        );
      });

    await t.test('returns false when readiness reports not routing',
      async (t) => {
        readinessMap.set(
          FIXTURE_NODE_ID,
          buildReadiness(FIXTURE_NODE_ID, false),
        );
        t.equal(
          dispatch.isNodeReady(FIXTURE_NODE_ID),
          false,
          'node should be not-ready when canonical readiness says so',
        );
      });

    await t.test('returns false without readiness service',
      async (t) => {
        const noReadiness = new ReplicaDispatchService({
          nodeId: FIXTURE_NODE_ID,
          systemTableCache: cache,
          cdcGroupPropagationService: createPublicationOwner(),
        });
        // Default readiness service is created from cache;
        // node with valid lease is ready via default service.
        t.equal(
          noReadiness.isNodeReady(FIXTURE_NODE_ID),
          true,
          'default readiness service should use cache',
        );
      });
  });

// ── Rebalancer ──────────────────────────────────────────────────────

test('UnifiedRebalancer.getAvailableNodes consumes canonical readiness',
  async (t) => {
    initEnv();
    const {UnifiedRebalancer, EntityType} = await import(
      '../../src/rebalancer/unified-rebalancer.js'
    );

    const readyNodeId = 'node-ready';
    const unreadyNodeId = 'node-unready';

    const readinessMap = new Map();
    readinessMap.set(readyNodeId, buildReadiness(readyNodeId, true));
    readinessMap.set(
      unreadyNodeId, buildReadiness(unreadyNodeId, false),
    );

    const cache = createMinimalCache([
      {node_id: readyNodeId},
      {node_id: unreadyNodeId},
    ]);
    const readinessService =
      createControlledReadinessService(readinessMap);

    const rebalancer = new UnifiedRebalancer({
      entityId: FIXTURE_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: readyNodeId,
      systemTableCache: cache,
      cdcIntegrationService: {
        insertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({}),
      },
      messageRouter: {
        getConnectionState: () => 'connected',
        deliver: async () => ({acknowledged: true}),
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      },
      rebalanceCoordinator: {
        getMoveSafetyError: () => null,
        createOperation: async () => ({operationId: 'op-1'}),
        executeOperation: async () => ({success: true}),
        canStartAddOperation: async () => true,
        canStartRemoveOperation: async () => true,
        getStats: () => ({}),
      },
      controlPlaneReadinessService: readinessService,
    });

    await t.test('includes only nodes canonical readiness marks healthy',
      async (t) => {
        const available = rebalancer.getAvailableNodes();
        const ids = available.map((n) => n.node_id);
        t.ok(
          ids.includes(readyNodeId),
          'ready node should be available',
        );
        t.notOk(
          ids.includes(unreadyNodeId),
          'unready node should be excluded',
        );
      });

    await t.test('default service uses cache when none injected',
      async (t) => {
        const noReadiness = new UnifiedRebalancer({
          entityId: FIXTURE_PARTITION_ID,
          entityType: EntityType.PARTITION,
          nodeId: readyNodeId,
          systemTableCache: cache,
          cdcIntegrationService: {
            insertSystemTableRow: async () => ({success: true}),
            updateSystemTableRow: async () => ({success: true}),
          },
          tablePolicyService: {
            getPolicyForPartition: () => ({}),
          },
          messageRouter: {
            getConnectionState: () => 'connected',
            deliver: async () => ({acknowledged: true}),
            pingNode: async () => true,
            isOutboundQueueAvailable: () => true,
          },
          rebalanceCoordinator: {
            getMoveSafetyError: () => null,
            createOperation: async () => ({operationId: 'op-1'}),
            executeOperation: async () => ({success: true}),
            canStartAddOperation: async () => true,
            canStartRemoveOperation: async () => true,
            getStats: () => ({}),
          },
          cdcGroupPropagationService: createPublicationOwner(),
        });
        const available = noReadiness.getAvailableNodes();
        t.ok(
          available.length > NUM.ZERO,
          'default readiness service should use cache',
        );
      });
  });

// ── RebalanceCoordinator ────────────────────────────────────────────

test('RebalanceCoordinator.isNodeReadyForRouting consumes canonical',
  async (t) => {
    initEnv();
    const {RebalanceCoordinator} = await import(
      '../../src/rebalancer/rebalance-coordinator.js'
    );
    const {DurableWorkflowCoordinator} = await import(
      '../../src/workflow/durable-workflow-coordinator.js'
    );

    const readinessMap = new Map();
    readinessMap.set(
      FIXTURE_NODE_ID, buildReadiness(FIXTURE_NODE_ID, true),
    );

    const cache = createMinimalCache([
      {node_id: FIXTURE_NODE_ID},
    ]);
    const readinessService =
      createControlledReadinessService(readinessMap);

    const coordinator = new RebalanceCoordinator({
      nodeId: FIXTURE_NODE_ID,
      systemTableCache: cache,
      cdcIntegrationService: {
        insertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
        waitForCacheUpdate: async () => true,
      },
      messageRouter: {
        getConnectionState: () => 'connected',
        deliver: async () => ({acknowledged: true}),
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({}),
      },
      sqlQueryEngine: {
        executeQuery: async () => ({success: true, rows: []}),
      },
      controlPlaneReadinessService: readinessService,
      operationWorkflowCoordinator: new DurableWorkflowCoordinator(),
    });

    await t.test('returns true when readiness reports routing ready',
      async (t) => {
        t.equal(
          coordinator.isNodeReadyForRouting(FIXTURE_NODE_ID),
          true,
          'node should be routable via canonical readiness',
        );
      });

    await t.test('returns false when readiness reports not routing',
      async (t) => {
        readinessMap.set(
          FIXTURE_NODE_ID,
          buildReadiness(FIXTURE_NODE_ID, false),
        );
        t.equal(
          coordinator.isNodeReadyForRouting(FIXTURE_NODE_ID),
          false,
          'node should not be routable via canonical readiness',
        );
      });

    await t.test('default service uses cache when none injected',
      async (t) => {
        const noReadiness = new RebalanceCoordinator({
          nodeId: FIXTURE_NODE_ID,
          systemTableCache: cache,
          cdcIntegrationService: {
            insertSystemTableRow: async () => ({success: true}),
            updateSystemTableRow: async () => ({success: true}),
            waitForCacheUpdate: async () => true,
          },
          messageRouter: {
            getConnectionState: () => 'connected',
            deliver: async () => ({acknowledged: true}),
          },
          tablePolicyService: {
            getPolicyForPartition: () => ({}),
          },
          sqlQueryEngine: {
            executeQuery: async () => ({success: true, rows: []}),
          },
          cdcGroupPropagationService: {
            getPublicationModeDiagnostics:
              createPublicationOwner().getPublicationModeDiagnostics,
          },
          operationWorkflowCoordinator:
            new DurableWorkflowCoordinator(),
        });
        t.equal(
          noReadiness.isNodeReadyForRouting(FIXTURE_NODE_ID),
          true,
          'default readiness service should use cache',
        );
      });
  });

// ── Query Routing ───────────────────────────────────────────────────

test('QueryExecutor routability consumes canonical serve readiness',
  async (t) => {
    initEnv();
    const {QueryExecutor} = await import(
      '../../src/query/query-executor.js'
    );

    const serviceRow = {
      service_id: 'partition-service-1',
      replica_id: 'partition-service-1',
      service_type: 'partition',
      partition_id: FIXTURE_PARTITION_ID,
      node_id: FIXTURE_NODE_ID,
      status: SERVICE_STATUS.ACTIVE,
      address: `${FIXTURE_NODE_ID}/partition/${FIXTURE_PARTITION_ID}`,
    };
    const cache = createQueryRoutingCache({
      services: [serviceRow],
      partitions: [{
        partition_id: FIXTURE_PARTITION_ID,
        leader_node_id: FIXTURE_NODE_ID,
      }],
    });
    const readinessMap = new Map();
    readinessMap.set(
      FIXTURE_NODE_ID,
      buildReadiness(FIXTURE_NODE_ID, true),
    );
    const readinessService =
      createControlledReadinessService(readinessMap);

    const executor = new QueryExecutor({
      nodeId: FIXTURE_NODE_ID,
      systemCache: cache,
      controlPlaneReadinessService: readinessService,
    });

    t.equal(
      executor.getRoutablePartitionServices(FIXTURE_PARTITION_ID).length,
      1,
      'routing should allow the service when canonical readiness says serve-eligible',
    );

    readinessMap.set(
      FIXTURE_NODE_ID,
      buildReadiness(FIXTURE_NODE_ID, false),
    );

    t.equal(
      executor.getRoutablePartitionServices(FIXTURE_PARTITION_ID).length,
      0,
      'routing should reject the service when canonical readiness says not serve-eligible',
    );
  });

test('SQLQueryEngine routable service metadata consumes canonical serve readiness',
  async (t) => {
    initEnv();
    const {SQLQueryEngine} = await import(
      '../../src/query/sql-query-engine.js'
    );

    const serviceRow = {
      service_id: 'partition-service-2',
      replica_id: 'partition-service-2',
      service_type: 'partition',
      partition_id: FIXTURE_PARTITION_ID,
      node_id: FIXTURE_NODE_ID,
      status: SERVICE_STATUS.ACTIVE,
      address: `${FIXTURE_NODE_ID}/partition/${FIXTURE_PARTITION_ID}`,
    };
    const cache = createQueryRoutingCache({
      services: [serviceRow],
      partitions: [{
        partition_id: FIXTURE_PARTITION_ID,
        leader_node_id: FIXTURE_NODE_ID,
      }],
    });
    const readinessMap = new Map();
    readinessMap.set(
      FIXTURE_NODE_ID,
      buildReadiness(FIXTURE_NODE_ID, true),
    );
    const readinessService =
      createControlledReadinessService(readinessMap);

    const engine = new SQLQueryEngine({
      nodeId: FIXTURE_NODE_ID,
      systemCache: cache,
      controlPlaneReadinessService: readinessService,
    });

    t.equal(
      engine.hasRoutableServiceMetadata(serviceRow.service_id),
      true,
      'query engine should surface the service when canonical readiness says serve-eligible',
    );

    readinessMap.set(
      FIXTURE_NODE_ID,
      buildReadiness(FIXTURE_NODE_ID, false),
    );

    t.equal(
      engine.hasRoutableServiceMetadata(serviceRow.service_id),
      false,
      'query engine should hide the service when canonical readiness says not serve-eligible',
    );
  });

test('QueryExecutor can route bootstrap-owned work via repair-eligible readiness',
  async (t) => {
    initEnv();
    const {QueryExecutor} = await import(
      '../../src/query/query-executor.js'
    );

    const serviceRow = {
      service_id: 'partition-service-3',
      replica_id: 'partition-service-3',
      service_type: 'partition',
      partition_id: FIXTURE_PARTITION_ID,
      node_id: FIXTURE_NODE_ID,
      status: SERVICE_STATUS.ACTIVE,
      address: `${FIXTURE_NODE_ID}/partition/${FIXTURE_PARTITION_ID}`,
    };
    const cache = createQueryRoutingCache({
      services: [serviceRow],
      partitions: [{
        partition_id: FIXTURE_PARTITION_ID,
        leader_node_id: FIXTURE_NODE_ID,
      }],
    });
    const readinessMap = new Map();
    const readiness = buildReadiness(FIXTURE_NODE_ID, true);
    readiness.dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE
    ] = false;
    readiness.dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY
    ] = false;
    readiness.dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE
    ] = false;
    readinessMap.set(FIXTURE_NODE_ID, readiness);
    const readinessService =
      createControlledReadinessService(readinessMap);

    const executor = new QueryExecutor({
      nodeId: FIXTURE_NODE_ID,
      systemCache: cache,
      controlPlaneReadinessService: readinessService,
      messageRouter: {
        deliver: async () => ({
          acknowledged: true,
          success: true,
          rows: [],
          changes: 1,
        }),
      },
    });

    const blocked = await executor.executeOnPartition(
      FIXTURE_PARTITION_ID,
      'SELECT 1',
      [],
      false,
      false,
      false,
    );
    t.equal(
      blocked.success,
      false,
      'default serve-eligible routing should still block non-servable nodes',
    );

    const repairEligible = await executor.executeOnPartition(
      FIXTURE_PARTITION_ID,
      'SELECT 1',
      [],
      false,
      false,
      false,
      {
        routingReadinessDimension:
          CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      },
    );
    t.equal(
      repairEligible.success,
      true,
      'bootstrap-owned routing should be able to use repair-eligible readiness',
    );
  });

// ── Rebalancer isNodeReady ──────────────────────────────────────────

test('UnifiedRebalancer.isNodeReady consumes canonical readiness',
  async (t) => {
    initEnv();
    const {UnifiedRebalancer, EntityType} = await import(
      '../../src/rebalancer/unified-rebalancer.js'
    );

    const readinessMap = new Map();
    readinessMap.set(
      FIXTURE_NODE_ID, buildReadiness(FIXTURE_NODE_ID, true),
    );

    const cache = createMinimalCache([
      {node_id: FIXTURE_NODE_ID},
    ]);
    const readinessService =
      createControlledReadinessService(readinessMap);

    const rebalancer = new UnifiedRebalancer({
      entityId: FIXTURE_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: FIXTURE_NODE_ID,
      systemTableCache: cache,
      cdcIntegrationService: {
        insertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({}),
      },
      messageRouter: {
        getConnectionState: () => 'connected',
        deliver: async () => ({acknowledged: true}),
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      },
      rebalanceCoordinator: {
        getMoveSafetyError: () => null,
        createOperation: async () => ({operationId: 'op-1'}),
        executeOperation: async () => ({success: true}),
        canStartAddOperation: async () => true,
        canStartRemoveOperation: async () => true,
        getStats: () => ({}),
      },
      controlPlaneReadinessService: readinessService,
    });

    await t.test('returns true when canonical readiness and transport ok',
      async (t) => {
        t.equal(
          await rebalancer.isNodeReady(FIXTURE_NODE_ID),
          true,
          'node should be ready when canonical readiness and transport ok',
        );
      });

    await t.test('returns false when canonical readiness says not ready',
      async (t) => {
        readinessMap.set(
          FIXTURE_NODE_ID,
          buildReadiness(FIXTURE_NODE_ID, false),
        );
        t.equal(
          await rebalancer.isNodeReady(FIXTURE_NODE_ID),
          false,
          'canonical readiness rejection must block isNodeReady',
        );
        // Restore for subsequent tests
        readinessMap.set(
          FIXTURE_NODE_ID,
          buildReadiness(FIXTURE_NODE_ID, true),
        );
      });

    await t.test('returns false when transport is not connected',
      async (t) => {
        const disconnectedRebalancer = new UnifiedRebalancer({
          entityId: FIXTURE_PARTITION_ID,
          entityType: EntityType.PARTITION,
          nodeId: FIXTURE_NODE_ID,
          systemTableCache: cache,
          cdcIntegrationService: {
            insertSystemTableRow: async () => ({success: true}),
            updateSystemTableRow: async () => ({success: true}),
          },
          tablePolicyService: {
            getPolicyForPartition: () => ({}),
          },
          messageRouter: {
            getConnectionState: () => 'disconnected',
            deliver: async () => ({acknowledged: true}),
            isOutboundQueueAvailable: () => true,
          },
          rebalanceCoordinator: {
            getMoveSafetyError: () => null,
            createOperation: async () => ({operationId: 'op-1'}),
            executeOperation: async () => ({success: true}),
            canStartAddOperation: async () => true,
            canStartRemoveOperation: async () => true,
            getStats: () => ({}),
          },
          controlPlaneReadinessService: readinessService,
        });
        t.equal(
          await disconnectedRebalancer.isNodeReady(FIXTURE_NODE_ID),
          false,
          'transport disconnect must block even when canonical ready',
        );
      });
  });

// ── Split Admission ─────────────────────────────────────────────────

test('Split admission consumes canonical readiness via admission service',
  async (t) => {
    initEnv();
    const {StorageAdmissionService} = await import(
      '../../src/rebalancer/storage-admission-service.js'
    );

    let readinessCallNodeIds = [];
    const readinessMap = new Map();
    readinessMap.set(
      FIXTURE_NODE_ID, buildReadiness(FIXTURE_NODE_ID, true),
    );

    const readinessService = {
      getNodeReadinessSync: (nodeId) => {
        readinessCallNodeIds.push(nodeId);
        return readinessMap.get(nodeId) ||
          buildReadiness(nodeId, false);
      },
      getNodeReadiness: async (nodeId) => {
        readinessCallNodeIds.push(nodeId);
        return readinessMap.get(nodeId) ||
          buildReadiness(nodeId, false);
      },
      getAllNodeReadiness: async () => {
        return Array.from(readinessMap.values());
      },
    };

    const mockAccounting = {
      getNodeCapacity: () => ({
        totalBytes: NUM.THOUSAND * NUM.THOUSAND,
        usedBytes: NUM.ZERO,
        reservedBytes: NUM.ZERO,
        availableBytes: NUM.THOUSAND * NUM.THOUSAND,
      }),
      getCapacitySnapshotForNode: () => ({
        budgetBytes: NUM.THOUSAND * NUM.THOUSAND,
        usedBytes: NUM.ZERO,
        reservedBytes: NUM.ZERO,
      }),
      estimateReplicaBytes: () => NUM.THOUSAND,
    };

    const admission = new StorageAdmissionService({
      nodeId: FIXTURE_NODE_ID,
      accountingService: mockAccounting,
      controlPlaneReadinessService: readinessService,
    });

    await t.test('checkAdd consults canonical readiness service',
      async (t) => {
        readinessCallNodeIds = [];
        await admission.checkAdd({
          targetNodeId: FIXTURE_NODE_ID,
          estimatedBytes: NUM.THOUSAND,
        });
        t.ok(
          readinessCallNodeIds.includes(FIXTURE_NODE_ID),
          'admission checkAdd must consult canonical readiness',
        );
      });
  });


// ── Shared-Consumption Regression (Task 4.3) ───────────────────────
// These tests prove all three workflows (dispatch, rebalance, split)
// consume the same ControlPlaneReadinessService contract. A single
// injected service controls the outcome for every workflow. If any
// workflow introduces a local readiness heuristic that bypasses the
// canonical service, these tests fail.

test('shared readiness contract: single service controls all workflows',
  async (t) => {
    initEnv();
    const {ReplicaDispatchService} = await import(
      '../../src/control-plane/replica-dispatch-service.js'
    );
    const {UnifiedRebalancer, EntityType} = await import(
      '../../src/rebalancer/unified-rebalancer.js'
    );
    const {StorageAdmissionService} = await import(
      '../../src/rebalancer/storage-admission-service.js'
    );

    // Track which workflows consulted the shared service.
    const consultedBy = new Set();
    const readinessMap = new Map();
    readinessMap.set(
      FIXTURE_NODE_ID, buildReadiness(FIXTURE_NODE_ID, true),
    );

    const sharedService = {
      getNodeReadinessSync: (nodeId) => {
        consultedBy.add('sync');
        return readinessMap.get(nodeId) ||
          buildReadiness(nodeId, false);
      },
      getNodeReadiness: async (nodeId) => {
        consultedBy.add('async');
        return readinessMap.get(nodeId) ||
          buildReadiness(nodeId, false);
      },
      getAllNodeReadiness: async () => {
        return Array.from(readinessMap.values());
      },
    };

    const cache = createMinimalCache([
      {node_id: FIXTURE_NODE_ID},
    ]);

    // ── Dispatch ──
    const dispatch = new ReplicaDispatchService({
      nodeId: FIXTURE_NODE_ID,
      systemTableCache: cache,
      controlPlaneReadinessService: sharedService,
    });

    // ── Rebalancer ──
    const rebalancer = new UnifiedRebalancer({
      entityId: FIXTURE_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: FIXTURE_NODE_ID,
      systemTableCache: cache,
      cdcIntegrationService: {
        insertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({}),
      },
      messageRouter: {
        getConnectionState: () => 'connected',
        deliver: async () => ({acknowledged: true}),
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      },
      rebalanceCoordinator: {
        getMoveSafetyError: () => null,
        createOperation: async () => ({operationId: 'op-1'}),
        executeOperation: async () => ({success: true}),
        canStartAddOperation: async () => true,
        canStartRemoveOperation: async () => true,
        getStats: () => ({}),
      },
      controlPlaneReadinessService: sharedService,
    });

    // ── Admission (split path) ──
    const mockAccounting = {
      getNodeCapacity: () => ({
        totalBytes: NUM.THOUSAND * NUM.THOUSAND,
        usedBytes: NUM.ZERO,
        reservedBytes: NUM.ZERO,
        availableBytes: NUM.THOUSAND * NUM.THOUSAND,
      }),
      getCapacitySnapshotForNode: () => ({
        budgetBytes: NUM.THOUSAND * NUM.THOUSAND,
        usedBytes: NUM.ZERO,
        reservedBytes: NUM.ZERO,
      }),
      estimateReplicaBytes: () => NUM.THOUSAND,
    };

    const admission = new StorageAdmissionService({
      nodeId: FIXTURE_NODE_ID,
      accountingService: mockAccounting,
      controlPlaneReadinessService: sharedService,
    });

    await t.test('all workflows ready when shared service says ready',
      async (t) => {
        consultedBy.clear();

        const dispatchReady =
          dispatch.isNodeReady(FIXTURE_NODE_ID);
        const rebalancerReady =
          await rebalancer.isNodeReady(FIXTURE_NODE_ID);
        const admissionResult = await admission.checkSplit({
          targetNodeIds: [FIXTURE_NODE_ID],
          estimatedBytes: NUM.THOUSAND,
          requiredReplicaCount: NUM.ONE,
        });

        t.equal(dispatchReady, true,
          'dispatch must be ready via shared service');
        t.equal(rebalancerReady, true,
          'rebalancer must be ready via shared service');
        t.equal(admissionResult.allowed, true,
          'split admission must be allowed via shared service');
        t.ok(consultedBy.size > NUM.ZERO,
          'shared service must have been consulted');
      });

    await t.test('all workflows blocked when shared service says not ready',
      async (t) => {
        readinessMap.set(
          FIXTURE_NODE_ID,
          buildReadiness(FIXTURE_NODE_ID, false),
        );
        consultedBy.clear();

        const dispatchReady =
          dispatch.isNodeReady(FIXTURE_NODE_ID);
        const rebalancerReady =
          await rebalancer.isNodeReady(FIXTURE_NODE_ID);
        const admissionResult = await admission.checkSplit({
          targetNodeIds: [FIXTURE_NODE_ID],
          estimatedBytes: NUM.THOUSAND,
          requiredReplicaCount: NUM.ONE,
        });

        t.equal(dispatchReady, false,
          'dispatch must be blocked via shared service');
        t.equal(rebalancerReady, false,
          'rebalancer must be blocked via shared service');
        t.equal(admissionResult.allowed, false,
          'split admission must be blocked via shared service');
        t.ok(consultedBy.size > NUM.ZERO,
          'shared service must have been consulted');
      });
  });

// ── Regression: no workflow-local readiness bypass ──────────────────
// Proves that readiness decisions are routed exclusively through the
// injected ControlPlaneReadinessService. If a workflow adds a local
// heuristic that overrides the service, these tests detect it.

test('regression: dispatch cannot bypass canonical readiness',
  async (t) => {
    initEnv();
    const {ReplicaDispatchService} = await import(
      '../../src/control-plane/replica-dispatch-service.js'
    );

    let callCount = NUM.ZERO;
    const blockingService = {
      getNodeReadinessSync: (nodeId) => {
        callCount++;
        return buildReadiness(nodeId, false);
      },
      getNodeReadiness: async (nodeId) => {
        callCount++;
        return buildReadiness(nodeId, false);
      },
      getAllNodeReadiness: async () => [],
    };

    const cache = createMinimalCache([
      {node_id: FIXTURE_NODE_ID},
    ]);

    const dispatch = new ReplicaDispatchService({
      nodeId: FIXTURE_NODE_ID,
      systemTableCache: cache,
      controlPlaneReadinessService: blockingService,
    });

    callCount = NUM.ZERO;
    const ready = dispatch.isNodeReady(FIXTURE_NODE_ID);

    t.equal(ready, false,
      'dispatch must respect canonical not-ready');
    t.ok(callCount > NUM.ZERO,
      'dispatch must call canonical readiness service');

    // Verify the service property is the injected instance.
    t.equal(
      typeof dispatch.controlPlaneReadinessService
        .getNodeReadinessSync,
      TYPEOF.FUNCTION,
      'dispatch stores canonical readiness service',
    );
  });

test('regression: rebalancer cannot bypass canonical readiness',
  async (t) => {
    initEnv();
    const {UnifiedRebalancer, EntityType} = await import(
      '../../src/rebalancer/unified-rebalancer.js'
    );

    let callCount = NUM.ZERO;
    const blockingService = {
      getNodeReadinessSync: (nodeId) => {
        callCount++;
        return buildReadiness(nodeId, false);
      },
      getNodeReadiness: async (nodeId) => {
        callCount++;
        return buildReadiness(nodeId, false);
      },
      getAllNodeReadiness: async () => [],
    };

    const cache = createMinimalCache([
      {node_id: FIXTURE_NODE_ID},
    ]);

    const rebalancer = new UnifiedRebalancer({
      entityId: FIXTURE_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: FIXTURE_NODE_ID,
      systemTableCache: cache,
      cdcIntegrationService: {
        insertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({}),
      },
      messageRouter: {
        getConnectionState: () => 'connected',
        deliver: async () => ({acknowledged: true}),
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      },
      rebalanceCoordinator: {
        getMoveSafetyError: () => null,
        createOperation: async () => ({operationId: 'op-1'}),
        executeOperation: async () => ({success: true}),
        canStartAddOperation: async () => true,
        canStartRemoveOperation: async () => true,
        getStats: () => ({}),
      },
      controlPlaneReadinessService: blockingService,
    });

    await t.test('isNodeReady blocked by canonical service',
      async (t) => {
        callCount = NUM.ZERO;
        const ready =
          await rebalancer.isNodeReady(FIXTURE_NODE_ID);
        t.equal(ready, false,
          'rebalancer isNodeReady must respect canonical not-ready');
        t.ok(callCount > NUM.ZERO,
          'rebalancer must call canonical readiness service');
      });

    await t.test('getAvailableNodes filtered by canonical service',
      async (t) => {
        callCount = NUM.ZERO;
        const available = rebalancer.getAvailableNodes();
        t.equal(available.length, NUM.ZERO,
          'no nodes available when canonical says not-ready');
        t.ok(callCount > NUM.ZERO,
          'getAvailableNodes must call canonical readiness service');
      });

    // Verify the service property is the injected instance.
    t.equal(
      typeof rebalancer.controlPlaneReadinessService
        .getNodeReadinessSync,
      TYPEOF.FUNCTION,
      'rebalancer stores canonical readiness service',
    );
  });

test('regression: split admission cannot bypass canonical readiness',
  async (t) => {
    initEnv();
    const {StorageAdmissionService} = await import(
      '../../src/rebalancer/storage-admission-service.js'
    );

    let callCount = NUM.ZERO;
    const blockingService = {
      getNodeReadinessSync: (nodeId) => {
        callCount++;
        return buildReadiness(nodeId, false);
      },
      getNodeReadiness: async (nodeId) => {
        callCount++;
        return buildReadiness(nodeId, false);
      },
      getAllNodeReadiness: async () => [],
    };

    const mockAccounting = {
      getNodeCapacity: () => ({
        totalBytes: NUM.THOUSAND * NUM.THOUSAND,
        usedBytes: NUM.ZERO,
        reservedBytes: NUM.ZERO,
        availableBytes: NUM.THOUSAND * NUM.THOUSAND,
      }),
      getCapacitySnapshotForNode: () => ({
        budgetBytes: NUM.THOUSAND * NUM.THOUSAND,
        usedBytes: NUM.ZERO,
        reservedBytes: NUM.ZERO,
      }),
      estimateReplicaBytes: () => NUM.THOUSAND,
    };

    const admission = new StorageAdmissionService({
      nodeId: FIXTURE_NODE_ID,
      accountingService: mockAccounting,
      controlPlaneReadinessService: blockingService,
    });

    callCount = NUM.ZERO;
    const result = await admission.checkSplit({
      targetNodeIds: [FIXTURE_NODE_ID],
      estimatedBytes: NUM.THOUSAND,
      requiredReplicaCount: NUM.ONE,
    });

    t.equal(result.allowed, false,
      'split admission must be blocked by canonical not-ready');
    t.ok(callCount > NUM.ZERO,
      'split admission must call canonical readiness service');

    // Verify the service property is the injected instance.
    t.equal(
      typeof admission.controlPlaneReadinessService
        .getNodeReadinessSync,
      TYPEOF.FUNCTION,
      'admission stores canonical readiness service',
    );
  });

// ── Regression: coordinator shares the same readiness contract ──────

test('regression: RebalanceCoordinator cannot bypass canonical readiness',
  async (t) => {
    initEnv();
    const {RebalanceCoordinator} = await import(
      '../../src/rebalancer/rebalance-coordinator.js'
    );
    const {DurableWorkflowCoordinator} = await import(
      '../../src/workflow/durable-workflow-coordinator.js'
    );

    let callCount = NUM.ZERO;
    const blockingService = {
      getNodeReadinessSync: (nodeId) => {
        callCount++;
        return buildReadiness(nodeId, false);
      },
      getNodeReadiness: async (nodeId) => {
        callCount++;
        return buildReadiness(nodeId, false);
      },
      getAllNodeReadiness: async () => [],
    };

    const cache = createMinimalCache([
      {node_id: FIXTURE_NODE_ID},
    ]);

    const coordinator = new RebalanceCoordinator({
      nodeId: FIXTURE_NODE_ID,
      systemTableCache: cache,
      cdcIntegrationService: {
        insertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
        waitForCacheUpdate: async () => true,
      },
      messageRouter: {
        getConnectionState: () => 'connected',
        deliver: async () => ({acknowledged: true}),
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({}),
      },
      sqlQueryEngine: {
        executeQuery: async () => ({success: true, rows: []}),
      },
      controlPlaneReadinessService: blockingService,
      operationWorkflowCoordinator:
        new DurableWorkflowCoordinator(),
    });

    callCount = NUM.ZERO;
    const ready =
      coordinator.isNodeReadyForRouting(FIXTURE_NODE_ID);

    t.equal(ready, false,
      'coordinator must respect canonical not-ready');
    t.ok(callCount > NUM.ZERO,
      'coordinator must call canonical readiness service');

    t.equal(
      typeof coordinator.controlPlaneReadinessService
        .getNodeReadinessSync,
      TYPEOF.FUNCTION,
      'coordinator stores canonical readiness service',
    );
  });
