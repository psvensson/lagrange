/**
 * Unit tests for ReplicaDispatchService NODE_STATE_UPDATE handling.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ReplicaDispatchService} from
  '../../src/control-plane/replica-dispatch-service.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {
  COLUMN,
  NUM,
  SERVICE_STATUS,
  STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({logging: {level: 'error'}});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createService(options = {}) {
  const cacheNode = options.cacheNode || null;
  const cacheNodes = Array.isArray(options.cacheNodes) ?
    options.cacheNodes :
    (cacheNode ? [cacheNode] : []);
  const cacheReplicaOperations = Array.isArray(options.cacheReplicaOperations) ?
    options.cacheReplicaOperations :
    [];
  const cacheByNodeId = new Map();
  for (const node of cacheNodes) {
    if (!node || !node.node_id) {
      continue;
    }
    cacheByNodeId.set(node.node_id, node);
  }
  const cdcIntegrationService = options.cdcIntegrationService;
  const controlPlaneReadinessService =
    options.controlPlaneReadinessService;
  const controlPlaneSystemTableGateway =
    options.controlPlaneSystemTableGateway ||
    (cdcIntegrationService ? {
      updateSystemTableRow: (...args) =>
        cdcIntegrationService.updateSystemTableRow(...args),
      insertSystemTableRow: (...args) =>
        cdcIntegrationService.insertSystemTableRow?.(...args),
      upsertSystemTableRow: (...args) =>
        cdcIntegrationService.upsertSystemTableRow?.(...args),
      deleteSystemTableRow: (...args) =>
        cdcIntegrationService.deleteSystemTableRow?.(...args),
    } : null);
  const rebalanceCoordinator = options.rebalanceCoordinator || {
    executeOperation: async () => ({success: true}),
  };

  const service = new ReplicaDispatchService({
    nodeId: 'node-1',
    messageRouter: options.messageRouter || {},
    cdcIntegrationService,
    controlPlaneSystemTableGateway,
    controlPlaneReadinessService,
    nodeStateUpdateQueueShardCount: options.nodeStateUpdateQueueShardCount,
    setTimeoutFn: options.setTimeoutFn,
    clearTimeoutFn: options.clearTimeoutFn,
    nodeStateUpdateRetryAfterMs: options.nodeStateUpdateRetryAfterMs,
    systemTableCache: {
      get: (tableName, nodeId) => {
        if (tableName !== 'nodes') {
          return null;
        }
        return cacheByNodeId.get(nodeId) || null;
      },
      getAll: (tableName) => {
        if (tableName === 'replica_operations') {
          return cacheReplicaOperations;
        }
        if (tableName === 'nodes') {
          return cacheNodes;
        }
        return [];
      },
    },
    rebalanceCoordinator,
  });
  service.initialize();
  return service;
}

test('ReplicaDispatchService updates existing node rows for NODE_STATE_UPDATE',
  async (t) => {
    initEnv();

    const now = Date.now();
    const updates = [];
    const upserts = [];
    const cacheNode = {
      node_id: 'node-2',
      node_address: 'localhost:8082',
      cpu_cores: 8,
      memory_mb: 16384,
      disk_gb: 500,
      cpu_usage_percent: 10,
      memory_usage_percent: 20,
      disk_usage_percent: 30,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.CONNECTED,
      capabilities: '[]',
      last_heartbeat: now - 1000,
      ready_lease_expires_at: null,
      storage_budget_bytes: 1024,
      created_at: now - 5000,
    };

    const service = createService({
      cacheNode,
      cdcIntegrationService: {
        updateSystemTableRow: async (tableName, whereClause, row, options) => {
          updates.push({tableName, whereClause, row, options});
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        },
        upsertSystemTableRow: async (tableName, row) => {
          upserts.push({tableName, row});
          return {success: true};
        },
      },
    });

    await service.handleNodeStateUpdate({
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: 'node-2',
      [ControlPlaneField.NODE_ADDRESS]: 'localhost:8082',
      [ControlPlaneField.STATE]: STATE.READY,
      [ControlPlaneField.CAPABILITIES]: ['partition_replica'],
      [ControlPlaneField.HEARTBEAT_AT]: now,
    });

    t.equal(updates.length, 1, 'persists one nodes row update');
    t.equal(upserts.length, 0, 'should not upsert when update affects row');
    t.equal(updates[0].tableName, 'nodes', 'writes to nodes table');
    t.same(
      updates[0].whereClause,
      {node_id: 'node-2'},
      'targets the node row by node_id',
    );
    t.equal(
      updates[0].options?.skipCacheWait,
      true,
      'node-state updates should not wait on cache convergence',
    );
    t.equal(
      updates[0].options?.allowPressureDefer,
      true,
      'node-state updates should defer through the owner queue when backpressured',
    );
    t.equal(
      updates[0].options?.allowCoalescing,
      true,
      'node-state updates should coalesce concurrent writes per node',
    );
    t.equal(
      updates[0].options?.coalescingKey,
      'node-state:node-2',
      'node-state updates should share a stable coalescing key',
    );
    t.equal(
      updates[0].options?.workClass,
      'critical',
      'ready publication should bypass pressure deferral on the critical lane',
    );
    t.equal(
      updates[0].row.connection_state,
      STATE.READY,
      'marks node as ready',
    );
    t.ok(
      updates[0].row.last_heartbeat >= now,
      'heartbeat timestamp should be fresh at apply time',
    );
    t.ok(
      updates[0].row.ready_lease_expires_at > updates[0].row.last_heartbeat,
      'ready lease should extend from the applied heartbeat timestamp',
    );
    t.equal(
      updates[0].row.storage_budget_bytes,
      undefined,
      'update payload should not mutate storage budget ownership fields',
    );

    service.stop();
  });

test('ReplicaDispatchService acknowledges required membership publication ' +
  'for READY node-state updates', async (t) => {
  initEnv();

  const now = Date.now();
  const acknowledgements = [];
  const cacheNode = {
    node_id: 'node-publication-ack',
    node_address: 'localhost:8087',
    cpu_cores: 8,
    memory_mb: 16384,
    disk_gb: 500,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.CONNECTED,
    capabilities: '[]',
    last_heartbeat: now - 1000,
    ready_lease_expires_at: null,
    created_at: now - 5000,
  };

  const service = createService({
    cacheNode,
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({
        success: true,
        partitionResult: {affectedRows: 1},
      }),
    },
    controlPlaneReadinessService: {
      membershipPublicationService: {
        getLatestPublicationForNodeSync(nodeId) {
          return {
            publication_id: 'publication-1',
            status: 'ACK_PENDING',
            required_ack_node_ids: [nodeId],
            acknowledged_node_ids: [],
          };
        },
        async acknowledgePublication(publicationId, nodeId, options) {
          acknowledgements.push({publicationId, nodeId, options});
          return options?.publicationRow || null;
        },
      },
    },
  });

  await service.handleNodeStateUpdate({
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
    [ControlPlaneField.NODE_ID]: 'node-publication-ack',
    [ControlPlaneField.NODE_ADDRESS]: 'localhost:8087',
    [ControlPlaneField.STATE]: STATE.READY,
    [ControlPlaneField.HEARTBEAT_AT]: now,
  });

  t.equal(
    acknowledgements.length,
    1,
    'ready node-state updates should acknowledge required cluster publications',
  );
  t.equal(
    acknowledgements[0]?.publicationId,
    'publication-1',
    'acknowledgement should target the latest publication id',
  );
  t.equal(
    acknowledgements[0]?.nodeId,
    'node-publication-ack',
    'acknowledgement should be keyed by the ready node id',
  );

  service.stop();
});

test('ReplicaDispatchService refreshes publication ownership before skipping ' +
  'READY acknowledgement on stale cache rows', async (t) => {
  initEnv();

  const now = Date.now();
  const refreshCalls = [];
  const acknowledgements = [];
  const cacheNode = {
    node_id: 'node-publication-refresh-ack',
    node_address: 'localhost:8088',
    cpu_cores: 8,
    memory_mb: 16384,
    disk_gb: 500,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.CONNECTED,
    capabilities: '[]',
    last_heartbeat: now - 1000,
    ready_lease_expires_at: null,
    created_at: now - 5000,
  };

  const service = createService({
    cacheNode,
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({
        success: true,
        partitionResult: {affectedRows: 1},
      }),
    },
    controlPlaneReadinessService: {
      membershipPublicationService: {
        getLatestPublicationForNodeSync() {
          return {
            publication_id: 'publication-cache-stale',
            status: 'ACK_PENDING',
            required_ack_node_ids: ['node-other'],
            acknowledged_node_ids: [],
          };
        },
        async getLatestPublicationForNode(nodeId, options) {
          refreshCalls.push({nodeId, options});
          return {
            publication_id: 'publication-authoritative',
            status: 'ACK_PENDING',
            required_ack_node_ids: [nodeId],
            acknowledged_node_ids: [],
          };
        },
        async acknowledgePublication(publicationId, nodeId, options) {
          acknowledgements.push({publicationId, nodeId, options});
          return options?.publicationRow || null;
        },
      },
    },
  });

  await service.handleNodeStateUpdate({
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
    [ControlPlaneField.NODE_ID]: 'node-publication-refresh-ack',
    [ControlPlaneField.NODE_ADDRESS]: 'localhost:8088',
    [ControlPlaneField.STATE]: STATE.READY,
    [ControlPlaneField.HEARTBEAT_AT]: now,
  });

  t.equal(
    refreshCalls.length,
    1,
    'ready acknowledgement should re-read publication ownership when cache omits the node requirement',
  );
  t.equal(
    refreshCalls[0]?.options?.preferAuthoritativeRead,
    true,
    'refresh should force authoritative publication reads through the owner path',
  );
  t.equal(
    acknowledgements.length,
    1,
    'authoritative refresh should still acknowledge when the node is required',
  );
  t.equal(
    acknowledgements[0]?.publicationId,
    'publication-authoritative',
    'acknowledgement should target the refreshed required publication',
  );

  service.stop();
});

test('ReplicaDispatchService keeps READY node-state publication on the ' +
  'critical lane under pressure', async (t) => {
  initEnv();

  const scheduled = [];
  const readyRetryEnqueues = [];
  const now = Date.now();
  const cacheNode = {
    node_id: 'node-pressure-ready',
    node_address: 'localhost:8085',
    cpu_cores: 8,
    memory_mb: 16384,
    disk_gb: 500,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.CONNECTED,
    capabilities: '[]',
    last_heartbeat: now - 1000,
    ready_lease_expires_at: null,
    created_at: now - 5000,
  };
  const gatewayCalls = [];

  const service = createService({
    cacheNode,
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
      isTransientCdcError() {
        return false;
      },
    },
    controlPlaneSystemTableGateway: {
      async updateSystemTableRow(tableName, whereClause, row, options) {
        gatewayCalls.push({tableName, whereClause, row, options});
        if (options?.workClass !== 'critical') {
          const error = new Error('control_plane_pressure_degraded');
          error.code = 'CONTROL_PLANE_PRESSURE_DEGRADED';
          error.retryAfterMs = 250;
          throw error;
        }
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });
  const originalNodeReadyRetryQueue = service.nodeReadyRetryQueue;
  service.nodeReadyRetryQueue = {
    enqueue(nodeId, reason, context) {
      readyRetryEnqueues.push({nodeId, reason, context});
      return true;
    },
    shutdown() {},
  };

  await service.reconcileNodeStateUpdate('node-pressure-ready', {
    payload: {
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: 'node-pressure-ready',
      [ControlPlaneField.NODE_ADDRESS]: 'localhost:8085',
      [ControlPlaneField.STATE]: STATE.READY,
      [ControlPlaneField.HEARTBEAT_AT]: now,
    },
  });

  t.equal(gatewayCalls.length, 1,
    'READY publication should attempt the canonical node update once');
  t.equal(
    gatewayCalls[0]?.options?.workClass,
    'critical',
    'READY publication must bypass pressure deferral on the critical lane',
  );
  t.equal(
    scheduled.length,
    0,
    'READY publication should not arm a deferred retry timer',
  );
  t.equal(
    service.nodeStateUpdateDeferredRetries.size,
    0,
    'READY publication should not remain parked in the deferred retry map',
  );
  t.equal(
    readyRetryEnqueues.length,
    1,
    'successful READY publication should re-enter the ready retry owner path',
  );

  service.nodeReadyRetryQueue = originalNodeReadyRetryQueue;
  service.stop();
});

test('ReplicaDispatchService uses injected owners for shared metadata cache reads',
  async (t) => {
    initEnv();

    let cacheGetCalls = 0;
    let cacheGetAllCalls = 0;
    const nodeRow = {
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.CONNECTED,
      last_heartbeat: Date.now(),
    };
    const serviceRow = {
      service_id: 'handler-node-2',
      node_id: 'node-2',
      service_type: 'partition',
      status: SERVICE_STATUS.ACTIVE,
    };
    const operationRow = {
      operation_id: 'op-1',
      target_node_id: 'node-2',
      type: 'ADD',
      workflow_step: WORKFLOW_STEP.PENDING,
    };

    const service = new ReplicaDispatchService({
      nodeId: 'node-1',
      messageRouter: {},
      cdcIntegrationService: {},
      systemTableCache: {
        get() {
          cacheGetCalls += 1;
          throw new Error('direct cache get should not be used');
        },
        getAll() {
          cacheGetAllCalls += 1;
          throw new Error('direct cache getAll should not be used');
        },
      },
      controlPlaneReadinessService: {
        getNodeReadinessSync() {
          return null;
        },
      },
      rebalanceCoordinator: {
        executeOperation: async () => ({success: true}),
      },
      nodesOwner: {
        async getNodeFromCache(nodeId) {
          return {
            success: true,
            rows: nodeId === 'node-2' ? [nodeRow] : [],
          };
        },
      },
      servicesOwner: {
        async listServicesFromCache() {
          return {
            success: true,
            rows: [serviceRow],
          };
        },
      },
      replicaOperationsOwner: {
        async getReplicaOperationFromCache(operationId) {
          return {
            success: true,
            rows: operationId === 'op-1' ? [operationRow] : [],
          };
        },
        async listReplicaOperationsFromCache() {
          return {
            success: true,
            rows: [operationRow],
          };
        },
      },
    });
    service.initialize();

    const loadedNode = await service.getNodeRow('node-2');
    const loadedOperation = await service.getReplicaOperationRow('op-1');
    const hasHandler = await service.hasHandlerOnTarget('node-2', 'partition');
    const pendingOperations = await service.getPendingReplicaOpsForNode('node-2');

    t.equal(loadedNode.node_id, 'node-2');
    t.equal(loadedOperation.operation_id, 'op-1');
    t.equal(hasHandler, true);
    t.equal(pendingOperations.length, 1);
    t.equal(cacheGetCalls, 0, 'owner-backed reads should not call cache.get');
    t.equal(cacheGetAllCalls, 0, 'owner-backed reads should not call cache.getAll');

    service.stop();
  });

test('ReplicaDispatchService demotes non-ready node-state churn to the ' +
  'background lane', async (t) => {
  initEnv();

  const now = Date.now();
  const updates = [];
  const cacheNode = {
    node_id: 'node-connected',
    node_address: 'localhost:8082',
    cpu_cores: 8,
    memory_mb: 16384,
    disk_gb: 500,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.CONNECTED,
    capabilities: '[]',
    last_heartbeat: now - 1000,
    ready_lease_expires_at: null,
    created_at: now - 5000,
  };

  const service = createService({
    cacheNode,
    cdcIntegrationService: {
      updateSystemTableRow: async (tableName, whereClause, row, options) => {
        updates.push({tableName, whereClause, row, options});
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
      upsertSystemTableRow: async () => ({success: true}),
    },
  });

  await service.handleNodeStateUpdate({
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
    [ControlPlaneField.NODE_ID]: 'node-connected',
    [ControlPlaneField.NODE_ADDRESS]: 'localhost:8082',
    [ControlPlaneField.STATE]: STATE.CONNECTED,
    [ControlPlaneField.HEARTBEAT_AT]: now,
  });

  t.equal(updates.length, 1, 'persists one nodes row update');
  t.equal(
    updates[0].options?.workClass,
    'background',
    'non-ready node-state churn should use the background work class',
  );
  t.equal(
    updates[0].options?.deliveryPriority,
    'background',
    'non-ready node-state churn should not claim critical transport capacity',
  );

  service.stop();
});

test('ReplicaDispatchService fails loudly when NODE_STATE_UPDATE targets a missing node row',
  async (t) => {
    initEnv();

    const now = Date.now();
    const updates = [];
    const upserts = [];
    const cacheNode = {
      node_id: 'node-3',
      node_address: 'localhost:8083',
      cpu_cores: 8,
      memory_mb: 16384,
      disk_gb: 500,
      cpu_usage_percent: 10,
      memory_usage_percent: 20,
      disk_usage_percent: 30,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.CONNECTED,
      capabilities: '[]',
      last_heartbeat: now - 1000,
      ready_lease_expires_at: null,
      storage_budget_bytes: 107374182400,
      storage_budget_source: 'absolute',
      storage_budget_updated_at: now - 5000,
      created_at: now - 10000,
    };

    const service = createService({
      cacheNode,
      cdcIntegrationService: {
        updateSystemTableRow: async (tableName, whereClause, row, options) => {
          updates.push({tableName, whereClause, row, options});
          return {
            success: true,
            partitionResult: {affectedRows: 0},
          };
        },
        upsertSystemTableRow: async (tableName, row, options) => {
          upserts.push({tableName, row, options});
          return {success: true};
        },
      },
    });

    await t.rejects(
      service.handleNodeStateUpdate({
        [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
        [ControlPlaneField.NODE_ID]: 'node-3',
        [ControlPlaneField.NODE_ADDRESS]: 'localhost:8083',
        [ControlPlaneField.STATE]: STATE.READY,
        [ControlPlaneField.CAPABILITIES]: ['partition_replica'],
        [ControlPlaneField.HEARTBEAT_AT]: now,
      }),
      /node row .*missing/i,
      'NODE_STATE_UPDATE should not recreate missing authoritative rows',
    );
    t.equal(updates.length, 1, 'attempts the canonical update path once');
    t.equal(upserts.length, 0, 'dispatch updates should not fall back to upsert');

    service.stop();
  });

test('ReplicaDispatchService ready-node retry re-enters operationDispatchQueue',
  async (t) => {
    initEnv();

    const now = Date.now();
    const readyNode = {
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      last_heartbeat: now,
      ready_lease_expires_at: now + 60000,
    };
    const pendingRow = {
      operation_id: 'op-ready-retry-1',
      target_node_id: 'node-2',
      workflow_step: WORKFLOW_STEP.PENDING,
      type: 'ADD',
    };
    const dispatchCalls = [];
    const enqueueCalls = [];
    const service = createService({
      cacheNodes: [readyNode],
      cacheReplicaOperations: [pendingRow],
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      rebalanceCoordinator: {
        dispatchOperation: async (operationId) => {
          dispatchCalls.push(operationId);
          return {success: true};
        },
      },
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            },
          };
        },
      },
    });
    const originalOperationDispatchQueue = service.operationDispatchQueue;
    service.operationDispatchQueue = {
      enqueue(operationId, reason, context) {
        enqueueCalls.push({operationId, reason, context});
      },
    };

    await service.retryPendingDispatchesForReadyNode({
      nodeId: 'node-2',
      nodeRow: readyNode,
    });

    t.same(
      enqueueCalls,
      [{
        operationId: 'op-ready-retry-1',
        reason: RECONCILE_REASON.NODE_READY_DISPATCH_RETRY,
        context: {row: pendingRow},
      }],
      'ready-node retries must route pending operations through the canonical operation queue',
    );
    t.same(
      dispatchCalls,
      [],
      'ready-node retries must not dispatch operations inline',
    );

    service.operationDispatchQueue = originalOperationDispatchQueue;
    service.stop();
  });

test('ReplicaDispatchService ignores bootstrap-owned MOVE_ASSIGNMENT rows ' +
  'for ready-node retry',
  async (t) => {
    initEnv();

    const now = Date.now();
    const readyNode = {
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      last_heartbeat: now,
      ready_lease_expires_at: now + 60000,
    };
    const pendingAssignmentRow = {
      operation_id: 'assignment-op-1',
      target_node_id: 'node-2',
      workflow_step: WORKFLOW_STEP.PENDING,
      type: 'MOVE_ASSIGNMENT',
    };
    const service = createService({
      cacheNodes: [readyNode],
      cacheReplicaOperations: [pendingAssignmentRow],
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            },
          };
        },
      },
    });

    const enqueueCalls = [];
    const originalOperationDispatchQueue = service.operationDispatchQueue;
    service.operationDispatchQueue = {
      enqueue(...args) {
        enqueueCalls.push(args);
      },
    };

    await service.retryPendingDispatchesForReadyNode({
      nodeId: 'node-2',
      nodeRow: readyNode,
    });

    t.equal(
      enqueueCalls.length,
      NUM.ZERO,
      'ready-node retry must ignore bootstrap-owned reservations',
    );

    service.operationDispatchQueue = originalOperationDispatchQueue;
    service.stop();
  });

test('ReplicaDispatchService ignores bootstrap-owned MOVE_ASSIGNMENT rows ' +
  'from replica_operations CDC',
  async (t) => {
    initEnv();

    const service = createService({
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
    });
    const enqueueCalls = [];
    const originalOperationDispatchQueue = service.operationDispatchQueue;
    service.operationDispatchQueue = {
      enqueue(...args) {
        enqueueCalls.push(args);
      },
    };

    await service.handleCdcApplied(null, {
      tableName: 'replica_operations',
      data: {
        operation_id: 'assignment-op-2',
        target_node_id: 'node-2',
        workflow_step: WORKFLOW_STEP.PENDING,
        type: 'MOVE_ASSIGNMENT',
      },
    });

    t.equal(
      enqueueCalls.length,
      NUM.ZERO,
      'CDC dispatch trigger must ignore bootstrap-owned reservations',
    );

    service.operationDispatchQueue = originalOperationDispatchQueue;
    service.stop();
  });

test('ReplicaDispatchService rejects NODE_STATE_UPDATE first-insert attempts ' +
  'even when startup payload carries storage budget fields',
async (t) => {
  initEnv();

  const now = Date.now();
  const updates = [];
  const upserts = [];

  const service = createService({
    cdcIntegrationService: {
      updateSystemTableRow: async (tableName, whereClause, row, options) => {
        updates.push({tableName, whereClause, row, options});
        return {
          success: true,
          partitionResult: {affectedRows: 0},
        };
      },
      upsertSystemTableRow: async (tableName, row, options) => {
        upserts.push({tableName, row, options});
        return {success: true};
      },
    },
  });

  await t.rejects(
    service.handleNodeStateUpdate({
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: 'node-joiner',
      [ControlPlaneField.NODE_ADDRESS]: 'localhost:8099',
      [ControlPlaneField.STATE]: STATE.CONNECTED,
      [ControlPlaneField.CAPABILITIES]: ['partition_replica'],
      [ControlPlaneField.HEARTBEAT_AT]: now,
      [ControlPlaneField.NODE_ROW]: {
        [COLUMN.NODE_ID]: 'node-joiner',
        [COLUMN.NODE_ADDRESS]: 'localhost:8099',
        [COLUMN.CPU_CORES]: 8,
        [COLUMN.MEMORY_MB]: 16384,
        [COLUMN.DISK_GB]: 500,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
        [COLUMN.LAST_HEARTBEAT]: now,
        [COLUMN.CREATED_AT]: now - 1000,
        [COLUMN.STORAGE_BUDGET_BYTES]: 107374182400,
        [COLUMN.STORAGE_BUDGET_SOURCE]: 'backfill',
        [COLUMN.STORAGE_BUDGET_UPDATED_AT]: now - 500,
      },
    }),
    /node row is missing/i,
    'startup registration must create the node row before NODE_STATE_UPDATE',
  );
  t.equal(updates.length, 1, 'attempts the canonical update path once');
  t.equal(upserts.length, 0, 'dispatch should not upsert first-insert node rows');

  service.stop();
});

test('ReplicaDispatchService NODE_STATE_UPDATE uses injected control-plane ' +
  'system-table gateway', async (t) => {
  initEnv();

  const gatewayCalls = [];
  const cacheNode = {
    node_id: 'node-gateway',
    node_address: 'localhost:8090',
    cpu_cores: 8,
    memory_mb: 16384,
    disk_gb: 500,
    cpu_usage_percent: 10,
    memory_usage_percent: 20,
    disk_usage_percent: 30,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.CONNECTED,
    capabilities: '[]',
    last_heartbeat: Date.now() - 1000,
    ready_lease_expires_at: null,
    created_at: Date.now() - 10000,
  };

  const service = createService({
    cacheNode,
    cdcIntegrationService: {
      updateSystemTableRow: async () => {
        throw new Error('cdcIntegrationService should not handle node writes');
      },
      upsertSystemTableRow: async () => {
        throw new Error('cdcIntegrationService should not handle node writes');
      },
    },
    controlPlaneSystemTableGateway: {
      async updateSystemTableRow(tableName, whereClause, row, options) {
        gatewayCalls.push({
          method: 'updateSystemTableRow',
          tableName,
          whereClause,
          row,
          options,
        });
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
      async upsertSystemTableRow(tableName, row, options) {
        gatewayCalls.push({
          method: 'upsertSystemTableRow',
          tableName,
          row,
          options,
        });
        return {success: true};
      },
    },
  });

  await service.handleNodeStateUpdate({
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
    [ControlPlaneField.NODE_ID]: 'node-gateway',
    [ControlPlaneField.NODE_ADDRESS]: 'localhost:8090',
    [ControlPlaneField.STATE]: STATE.READY,
    [ControlPlaneField.HEARTBEAT_AT]: Date.now(),
  });

  t.equal(gatewayCalls.length, 1, 'gateway should own the node-state write');
  t.equal(
    gatewayCalls[0].method,
    'updateSystemTableRow',
    'dispatch should route NODE_STATE_UPDATE through the gateway',
  );
  t.equal(
    gatewayCalls[0].tableName,
    'nodes',
    'dispatch gateway writes should target the nodes table',
  );

  service.stop();
});

test('ReplicaDispatchService defers transient NODE_STATE_UPDATE failures and ' +
  're-enqueues only the latest payload', async (t) => {
  initEnv();

  const scheduled = [];
  const enqueues = [];
  const now = Date.now();
  const cacheNode = {
    node_id: 'node-deferred',
    node_address: 'localhost:8091',
    cpu_cores: 8,
    memory_mb: 16384,
    disk_gb: 500,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.CONNECTED,
    capabilities: '[]',
    last_heartbeat: now - 1000,
    ready_lease_expires_at: null,
    created_at: now - 10000,
  };
  const transientError = new Error('Connection to node seed closed');
  transientError.retryAfterMs = 123;

  const service = createService({
    cacheNode,
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
      isTransientCdcError(message) {
        return message.includes('Connection to node');
      },
    },
    controlPlaneSystemTableGateway: {
      async updateSystemTableRow() {
        throw transientError;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  const originalQueue = service.nodeStateUpdateQueue;
  service.nodeStateUpdateQueue = {
    enqueue(nodeId, reason, context) {
      enqueues.push({nodeId, reason, context});
      return true;
    },
    shutdown() {},
  };
  service.nodeStateUpdateQueues = [service.nodeStateUpdateQueue];

  const initialPayload = {
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
    [ControlPlaneField.NODE_ID]: 'node-deferred',
    [ControlPlaneField.NODE_ADDRESS]: 'localhost:8091',
    [ControlPlaneField.STATE]: STATE.READY,
    [ControlPlaneField.HEARTBEAT_AT]: now,
  };
  const newerPayload = {
    ...initialPayload,
    [ControlPlaneField.HEARTBEAT_AT]: now + 5000,
    [ControlPlaneField.READY_LEASE_EXPIRES_AT]: now + 65000,
  };

  await service.reconcileNodeStateUpdate('node-deferred', {
    payload: initialPayload,
  });

  t.equal(
    scheduled.length,
    1,
    'transient failure should arm one deferred retry timer',
  );
  t.equal(
    scheduled[0].delayMs,
    123,
    'deferred retry should honor retryAfterMs',
  );
  t.equal(
    service.nodeStateUpdateDeferredRetries.size,
    1,
    'deferred retry slot should be retained until replay',
  );

  const enqueueResult = service.enqueueNodeStateUpdate(newerPayload);
  t.equal(
    enqueueResult,
    false,
    'new payload should merge into the deferred retry slot instead of queueing immediately',
  );
  t.equal(
    enqueues.length,
    0,
    'deferred retry slot should suppress immediate queue traffic',
  );

  scheduled[0].callback();

  t.equal(enqueues.length, 1, 'timer should re-enqueue one retry');
  t.same(
    enqueues[0],
    {
      nodeId: 'node-deferred',
      reason: RECONCILE_REASON.NODE_STATE_UPDATE_MESSAGE,
      context: {payload: newerPayload},
    },
    'deferred retry should publish the newest merged payload only once',
  );
  t.equal(
    service.nodeStateUpdateDeferredRetries.size,
    0,
    'deferred retry slot should clear after re-enqueue',
  );

  service.nodeStateUpdateQueue = originalQueue;
  service.stop();
});

test('ReplicaDispatchService ignores stale CONNECTED regression after READY',
  async (t) => {
    initEnv();

    const now = Date.now();
    const updates = [];
    const cacheNode = {
      node_id: 'node-4',
      node_address: 'localhost:8084',
      cpu_cores: 8,
      memory_mb: 16384,
      disk_gb: 500,
      cpu_usage_percent: 10,
      memory_usage_percent: 20,
      disk_usage_percent: 30,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      capabilities: '[]',
      last_heartbeat: now - 1000,
      ready_lease_expires_at: now + 5000,
      created_at: now - 10000,
    };

    const service = createService({
      cacheNode,
      cdcIntegrationService: {
        updateSystemTableRow: async (tableName, whereClause, row, options) => {
          updates.push({tableName, whereClause, row, options});
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        },
        upsertSystemTableRow: async () => ({success: true}),
      },
    });

    await service.handleNodeStateUpdate({
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: 'node-4',
      [ControlPlaneField.NODE_ADDRESS]: 'localhost:8084',
      [ControlPlaneField.STATE]: STATE.CONNECTED,
      [ControlPlaneField.HEARTBEAT_AT]: now - 10000,
    });

    t.equal(
      updates.length,
      0,
      'should ignore stale CONNECTED regressions instead of rewriting nodes',
    );

    service.stop();
  });

test('ReplicaDispatchService accepts lagged READY heartbeat timestamps',
  async (t) => {
    initEnv();

    const now = Date.now();
    const updates = [];
    const cacheNode = {
      node_id: 'node-4b',
      node_address: 'localhost:8084',
      cpu_cores: 8,
      memory_mb: 16384,
      disk_gb: 500,
      cpu_usage_percent: 10,
      memory_usage_percent: 20,
      disk_usage_percent: 30,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      capabilities: '[]',
      last_heartbeat: now - 5000,
      ready_lease_expires_at: now + 5000,
      created_at: now - 10000,
    };

    const service = createService({
      cacheNode,
      cdcIntegrationService: {
        updateSystemTableRow: async (tableName, whereClause, row, options) => {
          updates.push({tableName, whereClause, row, options});
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        },
        upsertSystemTableRow: async () => ({success: true}),
      },
    });

    await service.handleNodeStateUpdate({
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: 'node-4b',
      [ControlPlaneField.NODE_ADDRESS]: 'localhost:8084',
      [ControlPlaneField.STATE]: STATE.READY,
      [ControlPlaneField.HEARTBEAT_AT]: now - 60000,
    });

    t.equal(
      updates.length,
      1,
      'lagged READY payload should still refresh the node heartbeat',
    );
    t.ok(
      updates[0]?.row?.last_heartbeat >= now,
      'applies a fresh heartbeat timestamp at write time',
    );

    service.stop();
  });

test('ReplicaDispatchService isolates slow NODE_STATE_UPDATE writes by node lane',
  async (t) => {
    initEnv();

    let resolveSlowUpdate = null;
    let slowInFlight = false;
    let fastObservedSlowInFlight = false;
    const writes = [];
    const service = createService({
      nodeStateUpdateQueueShardCount: 2,
      cdcIntegrationService: {},
      cacheNodes: [
        {
          node_id: 'node-slow',
          node_address: 'localhost:8091',
          status: SERVICE_STATUS.ACTIVE,
          connection_state: STATE.CONNECTED,
          capabilities: '[]',
          created_at: Date.now() - 10000,
        },
        {
          node_id: 'node-fast',
          node_address: 'localhost:8092',
          status: SERVICE_STATUS.ACTIVE,
          connection_state: STATE.CONNECTED,
          capabilities: '[]',
          created_at: Date.now() - 10000,
        },
      ],
      controlPlaneSystemTableGateway: {
        updateSystemTableRow: async (tableName, whereClause, row, options) => {
          const nodeId = whereClause?.node_id;
          writes.push({nodeId, tableName, row, options});
          if (nodeId === 'node-slow') {
            slowInFlight = true;
            return new Promise((resolve) => {
              resolveSlowUpdate = () => {
                slowInFlight = false;
                resolve({
                  success: true,
                  partitionResult: {affectedRows: 1},
                });
              };
            });
          }
          fastObservedSlowInFlight = slowInFlight;
          return {
            success: true,
            partitionResult: {affectedRows: 1},
          };
        },
      },
    });
    const mgService = {
      acknowledgeMessage: async () => {},
      isLeaderReplica: () => true,
      getMetadataIngressReadiness: () => ({ready: true}),
    };

    const now = Date.now();
    await service.handleMessageReceived(mgService, {
      messageId: 'slow-msg',
      payload: {
        [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
        [ControlPlaneField.NODE_ID]: 'node-slow',
        [ControlPlaneField.NODE_ADDRESS]: 'localhost:8091',
        [ControlPlaneField.STATE]: STATE.READY,
        [ControlPlaneField.HEARTBEAT_AT]: now,
      },
    });
    await service.handleMessageReceived(mgService, {
      messageId: 'fast-msg',
      payload: {
        [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
        [ControlPlaneField.NODE_ID]: 'node-fast',
        [ControlPlaneField.NODE_ADDRESS]: 'localhost:8092',
        [ControlPlaneField.STATE]: STATE.READY,
        [ControlPlaneField.HEARTBEAT_AT]: now,
      },
    });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (fastObservedSlowInFlight) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    t.equal(
      fastObservedSlowInFlight,
      true,
      'fast-node update should execute while slow-node write remains in flight',
    );
    t.ok(
      writes.some((entry) => entry.nodeId === 'node-fast'),
      'fast-node write should not be blocked behind slow-node queue ownership',
    );

    resolveSlowUpdate?.();
    await Promise.resolve();
    service.stop();
  });

test('ReplicaDispatchService acknowledges NODE_STATE_UPDATE before slow write completes',
  async (t) => {
    initEnv();

    let resolveUpdate = null;
    const updates = [];
    const acknowledgements = [];
    const service = createService({
      cdcIntegrationService: {},
      cacheNode: {
        node_id: 'node-5',
        node_address: 'localhost:8085',
        status: SERVICE_STATUS.ACTIVE,
        connection_state: STATE.CONNECTED,
        capabilities: '[]',
        created_at: Date.now() - 10000,
      },
      controlPlaneSystemTableGateway: {
        updateSystemTableRow: async (tableName, whereClause, row, options) => {
          updates.push({tableName, whereClause, row, options});
          return new Promise((resolve) => {
            resolveUpdate = () => resolve({
              success: true,
              partitionResult: {affectedRows: 1},
            });
          });
        },
      },
    });
    const mgService = {
      acknowledgeMessage: async (messageId) => {
        acknowledgements.push(messageId);
      },
      isLeaderReplica: () => true,
      getMetadataIngressReadiness: () => ({ready: true}),
    };

    const now = Date.now();
    const outcome = await Promise.race([
      service.handleMessageReceived(mgService, {
        messageId: 'msg-1',
        payload: {
          [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
          [ControlPlaneField.NODE_ID]: 'node-5',
          [ControlPlaneField.NODE_ADDRESS]: 'localhost:8085',
          [ControlPlaneField.STATE]: STATE.READY,
          [ControlPlaneField.HEARTBEAT_AT]: now,
        },
      }).then(() => 'completed'),
      new Promise((resolve) => setTimeout(() => resolve('timed_out'), 50)),
    ]);

    t.equal(
      outcome,
      'completed',
      'node-state message handling should not wait on the slow write path',
    );
    t.same(
      acknowledgements,
      ['msg-1'],
      'node-state message should be acknowledged once enqueued',
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    t.equal(updates.length, 1, 'should still process the queued write');

    resolveUpdate?.();
    await Promise.resolve();
    service.stop();
  });

test('ReplicaDispatchService forwards NODE_STATE_UPDATE when local ingress is not metadata-ready',
  async (t) => {
    initEnv();

    const acknowledgements = [];
    const forwarded = [];
    const service = createService({
      cdcIntegrationService: {},
      cacheNode: {
        node_id: 'node-6',
        node_address: 'localhost:8086',
        status: SERVICE_STATUS.ACTIVE,
        connection_state: STATE.CONNECTED,
        capabilities: '[]',
        created_at: Date.now() - 10000,
      },
      controlPlaneSystemTableGateway: {
        updateSystemTableRow: async () => {
          throw new Error('should not write locally when ingress is not ready');
        },
      },
    });
    const mgService = {
      acknowledgeMessage: async (messageId) => {
        acknowledgements.push(messageId);
      },
      isLeaderReplica: () => false,
      getMetadataIngressReadiness: () => ({
        ready: false,
        reason: 'leader routing not established',
        retryAfterMs: 250,
      }),
      getLeaderId: () => {
        throw new Error('should not use raw leader-id forwarding');
      },
      buildPeerAddress: () => {
        throw new Error('should not build raw leader address for metadata ingress');
      },
      sendMessage: async () => {
        throw new Error('should not send metadata ingress via raw leader path');
      },
      forwardMetadataIngressPayloadToLeader: async (payload, options) => {
        forwarded.push({payload, options});
      },
    };

    const now = Date.now();
    await service.handleMessageReceived(mgService, {
      messageId: 'msg-forward',
      payload: {
        [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
        [ControlPlaneField.NODE_ID]: 'node-6',
        [ControlPlaneField.NODE_ADDRESS]: 'localhost:8086',
        [ControlPlaneField.STATE]: STATE.READY,
        [ControlPlaneField.HEARTBEAT_AT]: now,
      },
    });

    t.same(
      acknowledgements,
      ['msg-forward'],
      'forwarded node-state message should still be acknowledged once forwarded',
    );
    t.same(
      forwarded,
      [{
        payload: {
          [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
          [ControlPlaneField.NODE_ID]: 'node-6',
          [ControlPlaneField.NODE_ADDRESS]: 'localhost:8086',
          [ControlPlaneField.STATE]: STATE.READY,
          [ControlPlaneField.HEARTBEAT_AT]: now,
        },
        options: {
          requiredTables: ['nodes'],
          forwardedByNodeId: 'node-1',
        },
      }],
      'node-state updates should forward through canonical metadata ingress routing instead of writing locally',
    );

    service.stop();
  });
