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
  TYPEOF,
  SERVICE_STATUS,
  STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';

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
    operationDispatchQueueShardCount:
      options.operationDispatchQueueShardCount,
    nodeStateUpdateQueueShardCount: options.nodeStateUpdateQueueShardCount,
    setTimeoutFn: options.setTimeoutFn,
    clearTimeoutFn: options.clearTimeoutFn,
    nodeStateUpdateRetryAfterMs: options.nodeStateUpdateRetryAfterMs,
    operationDispatchRetryAfterMs: options.operationDispatchRetryAfterMs,
    dispatchReadinessRefreshTimeoutMs:
      options.dispatchReadinessRefreshTimeoutMs,
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
      false,
      'READY node-state updates should not opt into pressure deferral',
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

test('ReplicaDispatchService routes READY heartbeat-only node-state updates to the ' +
  'background lane', async (t) => {
  initEnv();

  const now = Date.now();
  const updates = [];
  const reconcileEnqueues = [];
  const readyRetryEnqueues = [];
  const publicationAcks = [];
  const cacheNode = {
    node_id: 'node-heartbeat-only-ready',
    node_address: 'localhost:8096',
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
    controlPlaneReadinessService: {
      membershipPublicationService: {
        enqueueClusterMembershipReconcile(reason, context) {
          reconcileEnqueues.push({reason, context});
          return true;
        },
        acknowledgeMembershipPublicationForNode(nodeId, options) {
          publicationAcks.push({nodeId, options});
          return null;
        },
      },
    },
  });
  const originalNodeReadyRetryQueue = service.nodeReadyRetryQueue;
  service.nodeReadyRetryQueue = {
    enqueue(nodeId, reason, context) {
      readyRetryEnqueues.push({nodeId, reason, context});
      return true;
    },
    shutdown() {},
  };

  await service.handleNodeStateUpdate({
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
    [ControlPlaneField.NODE_ID]: 'node-heartbeat-only-ready',
    [ControlPlaneField.NODE_ADDRESS]: 'localhost:8096',
    [ControlPlaneField.STATE]: STATE.READY,
    [ControlPlaneField.CAPABILITIES]: ['partition_replica'],
    [ControlPlaneField.HEARTBEAT_ONLY]: true,
    [ControlPlaneField.HEARTBEAT_AT]: now,
    [ControlPlaneField.NODE_ROW]: {
      [COLUMN.CPU_CORES]: 8,
      [COLUMN.MEMORY_MB]: 16384,
      [COLUMN.DISK_GB]: 500,
      [COLUMN.STORAGE_BUDGET_BYTES]: 107374182400,
      [COLUMN.STORAGE_BUDGET_SOURCE]: 'absolute',
      [COLUMN.STORAGE_BUDGET_UPDATED_AT]: now - 500,
      [COLUMN.CAPABILITIES]: '["partition_replica"]',
    },
  });

  t.equal(updates.length, 1, 'persists one heartbeat-only nodes row update');
  t.equal(updates[0].options?.skipCacheWait, true);
  t.equal(
    updates[0].options?.deliveryPriority,
    'background',
    'heartbeat-only READY updates should use background delivery',
  );
  t.equal(
    updates[0].options?.allowPressureDefer,
    true,
    'heartbeat-only READY updates should remain pressure-deferrable',
  );
  t.equal(
    updates[0].options?.workClass,
    'background',
    'heartbeat-only READY updates should use background work class',
  );
  t.equal(
    updates[0].row.connection_state,
    STATE.READY,
    'heartbeat-only READY update should persist the READY connection state',
  );
  t.equal(
    updates[0].row.status,
    undefined,
    'heartbeat-only updates should not persist service status',
  );
  t.equal(
    updates[0].row.cpu_cores,
    undefined,
    'heartbeat-only updates should not persist resource participation fields',
  );
  t.equal(
    reconcileEnqueues.length,
    0,
    'heartbeat-only READY should not enqueue cluster publication reconcile work',
  );
  t.equal(
    readyRetryEnqueues.length,
    0,
    'heartbeat-only READY should not enqueue the ready retry owner path',
  );
  t.equal(
    publicationAcks.length,
    0,
    'heartbeat-only READY should not acknowledge cluster publication ownership',
  );

  service.nodeReadyRetryQueue = originalNodeReadyRetryQueue;
  service.stop();
});

test('ReplicaDispatchService promotes READY node-state updates from stopped rows',
  async (t) => {
    initEnv();

    const now = Date.now();
    const updates = [];
    const cacheNode = {
      node_id: 'node-restart-ready',
      node_address: 'localhost:8092',
      cpu_cores: 8,
      memory_mb: 16384,
      disk_gb: 500,
      cpu_usage_percent: 10,
      memory_usage_percent: 20,
      disk_usage_percent: 30,
      status: SERVICE_STATUS.STOPPED,
      connection_state: STATE.DISCONNECTED,
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
      },
    });

    await service.handleNodeStateUpdate({
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: 'node-restart-ready',
      [ControlPlaneField.NODE_ADDRESS]: 'localhost:8092',
      [ControlPlaneField.STATE]: STATE.READY,
      [ControlPlaneField.HEARTBEAT_AT]: now,
    });

    t.equal(updates.length, 1, 'persists one nodes row update');
    t.equal(
      updates[0].row.status,
      SERVICE_STATUS.ACTIVE,
      'READY node-state updates should restore stopped rows to active',
    );
    t.equal(
      updates[0].row.connection_state,
      STATE.READY,
      'READY node-state updates should publish ready connectivity',
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
        async acknowledgeMembershipPublicationForNode(nodeId, options) {
          acknowledgements.push({nodeId, options});
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
    'ready node-state updates should delegate cluster publication acknowledgement to publication service',
  );
  t.equal(
    acknowledgements[0]?.nodeId,
    'node-publication-ack',
    'acknowledgement should target the ready node id',
  );
  t.equal(
    typeof acknowledgements[0]?.options,
    TYPEOF.UNDEFINED,
    'dispatch should pass only the node id to the publication owner API',
  );

  service.stop();
});

test('ReplicaDispatchService delegates stale cache READY acknowledgements to ' +
  'the publication owner API', async (t) => {
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
        async acknowledgeMembershipPublicationForNode(nodeId, options) {
          refreshCalls.push({nodeId, options});
          acknowledgements.push({nodeId, options});
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
    acknowledgements.length,
    1,
    'publication owner should receive one READY acknowledgement delegation call',
  );
  t.equal(
    acknowledgements[0]?.options,
    undefined,
    'dispatch should pass only the node id to the publication owner API',
  );
  t.equal(refreshCalls.length, 1, 'dispatch should call the owner API once');
  t.equal(
    refreshCalls[0]?.nodeId,
    'node-publication-refresh-ack',
    'owner API should be called for the ready node',
  );

  service.stop();
});

test('ReplicaDispatchService READY node-state updates enqueue cluster ' +
  'membership reconcile through the publication owner queue', async (t) => {
  initEnv();

  const now = Date.now();
  const reconcileEnqueues = [];
  const cacheNode = {
    node_id: 'node-publication-reconcile',
    node_address: 'localhost:8089',
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
        enqueueClusterMembershipReconcile(reason, context) {
          reconcileEnqueues.push({reason, context});
          return true;
        },
      },
    },
  });

  await service.handleNodeStateUpdate({
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
    [ControlPlaneField.NODE_ID]: 'node-publication-reconcile',
    [ControlPlaneField.NODE_ADDRESS]: 'localhost:8089',
    [ControlPlaneField.STATE]: STATE.READY,
    [ControlPlaneField.HEARTBEAT_AT]: now,
  });

  t.equal(
    reconcileEnqueues.length,
    1,
    'READY node-state updates should re-enter the canonical membership publication owner queue',
  );
  t.equal(
    reconcileEnqueues[0]?.context?.nodeId,
    'node-publication-reconcile',
    'reconcile enqueue should preserve the ready node id',
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
      source_node_id: 'node-1',
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
          return nodeId === 'node-2' ? nodeRow : null;
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
          return operationId === 'op-1' ? operationRow : null;
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

test('ReplicaDispatchService rehydrates retry dispatches through the ' +
  'coordinator repository authoritative operation owner path',
  async (t) => {
    initEnv();

    const now = Date.now();
    let repositoryReadCalls = 0;
    let gatewayReadCalls = 0;
    let dispatchCalls = 0;
    const authoritativeOperation = {
      operationId: 'op-repository-authoritative-retry-1',
      type: OperationType.REPLACE,
      partitionId: 'control_plane_publications-p1',
      entityType: 'partition',
      entityId: 'control_plane_publications-p1',
      replicaId: 'control_plane_publications-p1-r4',
      sourceNodeId: 'node-source',
      targetNodeId: 'node-2',
      status: 'pending',
      workflowStep: WORKFLOW_STEP.PENDING,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      errorMessage: null,
      stepsHistory: [],
    };

    const service = new ReplicaDispatchService({
      nodeId: 'node-1',
      messageRouter: {},
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      controlPlaneSystemTableGateway: {
        async readAuthoritativeRows() {
          gatewayReadCalls += 1;
          return {
            success: true,
            rows: [],
          };
        },
      },
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            observedAt: new Date(now).toISOString(),
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION
                .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            },
            reasons: [],
          };
        },
      },
      systemTableCache: {
        get() {
          return null;
        },
        getAll() {
          return [];
        },
      },
      rebalanceCoordinator: {
        repository: {
          async queryAuthoritativeOperationById(operationId, options = {}) {
            repositoryReadCalls += 1;
            t.equal(
              operationId,
              authoritativeOperation.operationId,
              'the canonical repository read should target the deferred operation id',
            );
            t.equal(
              options.requireOwnerRpcRead,
              false,
              'dispatch retry rehydration should reuse the repository owner read contract',
            );
            return {...authoritativeOperation};
          },
        },
        async dispatchOperation(operation) {
          dispatchCalls += 1;
          t.equal(
            operation.operationId,
            authoritativeOperation.operationId,
            'dispatch should receive the operation rehydrated from the repository owner path',
          );
          return {success: true};
        },
        isOperationLocallyOwned() {
          return true;
        },
      },
    });
    service.initialize();

    try {
      await service.reconcileOperationDispatch(
        authoritativeOperation.operationId,
      );

      t.equal(
        repositoryReadCalls,
        1,
        'retry dispatch lookup should consult the canonical repository owner path once',
      );
      t.equal(
        gatewayReadCalls,
        0,
        'gateway row reads should be bypassed when the coordinator repository owner is available',
      );
      t.equal(
        dispatchCalls,
        1,
        'retry dispatch should continue once the authoritative owner row is rehydrated',
      );
    } finally {
      service.stop();
    }
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
  t.equal(
    updates[0].options?.allowPressureDefer,
    true,
    'non-ready node-state churn should remain deferrable under pressure',
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
      controlPlaneSystemTableGateway: {
        async updateSystemTableRow(tableName, whereClause, row, options) {
          updates.push({tableName, whereClause, row, options});
          return {
            success: true,
            partitionResult: {affectedRows: 0},
          };
        },
        async readAuthoritativeRows() {
          return {
            success: true,
            rows: [],
          };
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

test('ReplicaDispatchService defers missing-row NODE_STATE_UPDATE misses for ' +
  'previously known nodes while authoritative recovery is unavailable', async (t) => {
  initEnv();

  const now = Date.now();
  const scheduled = [];
  const enqueues = [];
  const cacheNode = {
    node_id: 'node-recovery',
    node_address: 'localhost:8084',
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
    created_at: now - 10000,
  };

  const service = createService({
    cacheNode,
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true};
      },
      async upsertSystemTableRow() {
        return {success: true};
      },
    },
    controlPlaneSystemTableGateway: {
      async updateSystemTableRow() {
        return {
          success: true,
          partitionResult: {affectedRows: 0},
        };
      },
      async readAuthoritativeRows() {
        return {
          success: false,
          error: 'authoritative_row_source_unavailable',
          rows: [],
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

  service.nodeStateUpdateQueue = {
    enqueue(nodeId, reason, context) {
      enqueues.push({nodeId, reason, context});
      return true;
    },
    shutdown() {},
  };
  service.nodeStateUpdateQueues = [service.nodeStateUpdateQueue];

  const payload = {
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
    [ControlPlaneField.NODE_ID]: 'node-recovery',
    [ControlPlaneField.NODE_ADDRESS]: 'localhost:8084',
    [ControlPlaneField.STATE]: STATE.READY,
    [ControlPlaneField.HEARTBEAT_AT]: now,
  };

  await service.reconcileNodeStateUpdate('node-recovery', {payload});

  t.equal(
    scheduled.length,
    1,
    'recovery miss should arm one deferred retry timer',
  );
  t.equal(
    scheduled[0].delayMs,
    service.nodeStateUpdateRetryAfterMs,
    'recovery miss should use the node-state retry budget',
  );
  t.equal(
    service.nodeStateUpdateDeferredRetries.size,
    1,
    'recovery miss should retain one deferred retry slot',
  );

  scheduled[0].callback();

  t.same(
    enqueues,
    [{
      nodeId: 'node-recovery',
      reason: RECONCILE_REASON.NODE_STATE_UPDATE_MESSAGE,
      context: {payload},
    }],
    'deferred recovery miss should re-enter the canonical node-state queue',
  );

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
      source_node_id: 'node-1',
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

test('ReplicaDispatchService shards operation dispatch reconcile so one ' +
  'blocked operation id does not head-of-line block another',
async (t) => {
  initEnv();

  const service = createService({
    operationDispatchQueueShardCount: 2,
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
  });

  const candidateOperationIds = [
    'op-shard-a',
    'op-shard-b',
    'op-shard-c',
    'op-shard-d',
  ];
  let blockedOperationId = null;
  let unblockedOperationId = null;
  for (const leftId of candidateOperationIds) {
    for (const rightId of candidateOperationIds) {
      if (leftId === rightId) {
        continue;
      }
      if (service.resolveOperationDispatchQueue(leftId) !==
          service.resolveOperationDispatchQueue(rightId)) {
        blockedOperationId = leftId;
        unblockedOperationId = rightId;
        break;
      }
    }
    if (blockedOperationId && unblockedOperationId) {
      break;
    }
  }

  t.ok(
    blockedOperationId && unblockedOperationId,
    'test should find two operation ids that route to different shards',
  );

  let releaseBlockedOperation = null;
  let blockedOperationStartedResolve = null;
  const blockedOperationStarted = new Promise((resolve) => {
    blockedOperationStartedResolve = resolve;
  });
  const unblockedExecutions = [];

  service.reconcileOperationDispatch = async (operationId) => {
    if (operationId === blockedOperationId) {
      blockedOperationStartedResolve();
      await new Promise((resolve) => {
        releaseBlockedOperation = resolve;
      });
      return;
    }
    unblockedExecutions.push(operationId);
  };

  service.operationDispatchQueue.enqueue(
    blockedOperationId,
    RECONCILE_REASON.REPLICA_OPERATIONS_CACHE_PENDING,
    {row: {operation_id: blockedOperationId}},
  );
  service.operationDispatchQueue.enqueue(
    unblockedOperationId,
    RECONCILE_REASON.REPLICA_OPERATIONS_CACHE_PENDING,
    {row: {operation_id: unblockedOperationId}},
  );

  await blockedOperationStarted;
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  t.same(
    unblockedExecutions,
    [unblockedOperationId],
    'distinct operation ids on separate shards should reconcile independently',
  );

  releaseBlockedOperation();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  service.stop();
});

test('ReplicaDispatchService ready-node retry uses authoritative fallback for priority recovery when cache is empty',
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
    const priorityOperation = {
      operationId: 'op-priority-retry-1',
      partitionId: 'replica_operations-p1',
      type: OperationType.REPLACE,
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
      status: 'pending',
      workflowStep: WORKFLOW_STEP.PENDING,
      stepsHistory: [],
    };
    const enqueueCalls = [];
    const authoritativeQueryOptions = [];
    const service = createService({
      cacheNodes: [readyNode],
      cacheReplicaOperations: [],
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      rebalanceCoordinator: {
        repository: {
          async queryIncompleteOperations(options) {
            authoritativeQueryOptions.push(options);
            return [priorityOperation];
          },
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
        getMembershipPublicationDiagnosticsSync() {
          return {
            publicationEpoch: 14,
            publicationStatus: 'PUBLISHED',
            publishedActiveNodeIds: ['node-1'],
            priorityPartitionSummary: {
              requiredDistinctNodeCount: 2,
              readyEligibleNodeCount: 1,
              blockedPartitions: [{
                partitionId: 'replica_operations-p1',
                requiredDistinctNodeCount: 2,
                readyDistinctNodeCount: 1,
                spreadGap: 1,
              }],
              missingPartitionIds: ['replica_operations-p1'],
            },
            membershipLifecycleSummary: {
              locallyEligibleNodeIds: ['node-2'],
              projectedServingNodeIds: ['node-2'],
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

    t.equal(
      authoritativeQueryOptions.length,
      1,
      'priority recovery should fall back to the authoritative repository when cache coverage is empty',
    );
    t.same(
      authoritativeQueryOptions[0],
      {preferAuthoritativeRead: true},
      'authoritative retry discovery should use the canonical repository owner path',
    );
    t.same(
      enqueueCalls,
      [{
        operationId: 'op-priority-retry-1',
        reason: RECONCILE_REASON.NODE_READY_DISPATCH_RETRY,
        context: {
          row: {
            operation_id: 'op-priority-retry-1',
            type: OperationType.REPLACE,
            partition_id: 'replica_operations-p1',
            replica_id: undefined,
            source_node_id: 'node-1',
            target_node_id: 'node-2',
            status: 'pending',
            workflow_step: WORKFLOW_STEP.PENDING,
            created_at: undefined,
            updated_at: undefined,
            completed_at: undefined,
            error_message: undefined,
            steps_history: '[]',
            entity_type: undefined,
            entity_id: undefined,
          },
        },
      }],
      'authoritative rediscovery should still re-enter the canonical per-operation queue',
    );

    service.operationDispatchQueue = originalOperationDispatchQueue;
    service.stop();
  });

test('ReplicaDispatchService ready-node retry prefers membership publication owner dispatch rows when available',
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
    const ownerCalls = [];
    const enqueueCalls = [];
    const service = createService({
      cacheNodes: [readyNode],
      cdcIntegrationService: {},
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            },
          };
        },
        membershipPublicationService: {
          async getDispatchRetryRowsForNode(nodeId) {
            ownerCalls.push(nodeId);
            return [{
              operation_id: 'op-owner-retry-1',
              type: OperationType.REPLACE,
              partition_id: 'replica_operations-p1',
              source_node_id: 'node-1',
              target_node_id: nodeId,
              status: 'pending',
              workflow_step: WORKFLOW_STEP.PENDING,
              steps_history: '[]',
            }];
          },
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
      ownerCalls,
      ['node-2'],
      'ready-node retry should ask the membership publication owner for dispatch rows first',
    );
    t.match(
      enqueueCalls,
      [{
        operationId: 'op-owner-retry-1',
        reason: RECONCILE_REASON.NODE_READY_DISPATCH_RETRY,
      }],
      'owner-returned retry rows should still re-enter the canonical operation queue',
    );

    service.operationDispatchQueue = originalOperationDispatchQueue;
    service.stop();
  });

test('ReplicaDispatchService ready-node retry prefers cache-visible rows over authoritative priority fallback',
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
      operation_id: 'op-ready-retry-cache-visible',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      workflow_step: WORKFLOW_STEP.PENDING,
      type: OperationType.REPLACE,
      partition_id: 'replica_operations-p1',
    };
    let authoritativeQueryCount = 0;
    const enqueueCalls = [];
    const service = createService({
      cacheNodes: [readyNode],
      cacheReplicaOperations: [pendingRow],
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      rebalanceCoordinator: {
        repository: {
          async queryIncompleteOperations() {
            authoritativeQueryCount += 1;
            return [];
          },
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
        getMembershipPublicationDiagnosticsSync() {
          return {
            publicationEpoch: 15,
            publicationStatus: 'PUBLISHED',
            publishedActiveNodeIds: ['node-1'],
            priorityPartitionSummary: {
              requiredDistinctNodeCount: 2,
              readyEligibleNodeCount: 1,
              blockedPartitions: [{
                partitionId: 'replica_operations-p1',
                requiredDistinctNodeCount: 2,
                readyDistinctNodeCount: 1,
                spreadGap: 1,
              }],
              missingPartitionIds: ['replica_operations-p1'],
            },
            membershipLifecycleSummary: {
              locallyEligibleNodeIds: ['node-2'],
              projectedServingNodeIds: ['node-2'],
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

    t.equal(
      authoritativeQueryCount,
      0,
      'cache-visible retry rows should not trigger authoritative fallback',
    );
    t.same(
      enqueueCalls,
      [{
        operationId: 'op-ready-retry-cache-visible',
        reason: RECONCILE_REASON.NODE_READY_DISPATCH_RETRY,
        context: {row: pendingRow},
      }],
      'cache-visible retry rows should keep the existing dispatch retry path',
    );

    service.operationDispatchQueue = originalOperationDispatchQueue;
    service.stop();
  });

test('ReplicaDispatchService ready-node retry ignores remote-owned pending ' +
  'operations',
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
  const remoteOwnedPendingRow = {
    operation_id: 'op-ready-retry-remote',
    source_node_id: 'node-remote-owner',
    target_node_id: 'node-2',
    workflow_step: WORKFLOW_STEP.PENDING,
    type: 'ADD',
  };
  const enqueueCalls = [];
  const service = createService({
    cacheNodes: [readyNode],
    cacheReplicaOperations: [remoteOwnedPendingRow],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    rebalanceCoordinator: {
      isOperationLocallyOwned(operation) {
        return operation?.source_node_id === 'node-1';
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
    'ready-node retry must ignore pending operations owned by another node',
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

test('ReplicaDispatchService enqueues locally owned pending ' +
  'replica_operations cache rows',
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

  service.handleCacheNodeChange('replica_operations', 'INSERT', {
    operation_id: 'add-op-1',
    source_node_id: 'node-1',
    target_node_id: 'node-1',
    workflow_step: WORKFLOW_STEP.PENDING,
    type: OperationType.ADD,
  });

  t.same(
    enqueueCalls,
    [[
      'add-op-1',
      RECONCILE_REASON.REPLICA_OPERATIONS_CACHE_PENDING,
      {
        row: {
          operation_id: 'add-op-1',
          source_node_id: 'node-1',
          target_node_id: 'node-1',
          workflow_step: WORKFLOW_STEP.PENDING,
          type: OperationType.ADD,
        },
      },
    ]],
    'cache visibility must wake the owning node for pending operations',
  );

  service.operationDispatchQueue = originalOperationDispatchQueue;
  service.stop();
});

test('ReplicaDispatchService enqueues target-owned priority REPLACE ' +
  'pending replica_operations cache rows',
async (t) => {
  initEnv();

  const service = createService({
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    rebalanceCoordinator: {
      resolveOperationOwnerNodeId(operation) {
        if (operation?.type === OperationType.REPLACE &&
            operation?.partition_id === 'control_plane_publications-p1') {
          return operation.target_node_id;
        }
        return operation?.source_node_id || null;
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

  service.handleCacheNodeChange('replica_operations', 'INSERT', {
    operation_id: 'replace-op-1',
    partition_id: 'control_plane_publications-p1',
    source_node_id: 'node-2',
    target_node_id: 'node-1',
    workflow_step: WORKFLOW_STEP.PENDING,
    type: OperationType.REPLACE,
  });

  t.same(
    enqueueCalls,
    [[
      'replace-op-1',
      RECONCILE_REASON.REPLICA_OPERATIONS_CACHE_PENDING,
      {
        row: {
          operation_id: 'replace-op-1',
          partition_id: 'control_plane_publications-p1',
          source_node_id: 'node-2',
          target_node_id: 'node-1',
          workflow_step: WORKFLOW_STEP.PENDING,
          type: OperationType.REPLACE,
        },
      },
    ]],
    'target-owned priority REPLACE rows should wake the target owner queue',
  );

  service.operationDispatchQueue = originalOperationDispatchQueue;
  service.stop();
});

test('ReplicaDispatchService enqueues target-owned priority REPLACE ' +
  'sending replica_operations cache rows',
async (t) => {
  initEnv();

  const service = createService({
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    rebalanceCoordinator: {
      resolveOperationOwnerNodeId(operation) {
        if (operation?.type === OperationType.REPLACE &&
            operation?.partition_id === 'control_plane_publications-p1') {
          return operation.target_node_id;
        }
        return operation?.source_node_id || null;
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

  service.handleCacheNodeChange('replica_operations', 'UPDATE', {
    operation_id: 'replace-op-sending-1',
    partition_id: 'control_plane_publications-p1',
    source_node_id: 'node-2',
    target_node_id: 'node-1',
    workflow_step: WORKFLOW_STEP.SENDING,
    type: OperationType.REPLACE,
  });

  t.same(
    enqueueCalls,
    [[
      'replace-op-sending-1',
      RECONCILE_REASON.REPLICA_OPERATIONS_CACHE_PENDING,
      {
        row: {
          operation_id: 'replace-op-sending-1',
          partition_id: 'control_plane_publications-p1',
          source_node_id: 'node-2',
          target_node_id: 'node-1',
          workflow_step: WORKFLOW_STEP.SENDING,
          type: OperationType.REPLACE,
        },
      },
    ]],
    'target-owned priority REPLACE rows should remain dispatch-replayable in SENDING',
  );

  service.operationDispatchQueue = originalOperationDispatchQueue;
  service.stop();
});

test('ReplicaDispatchService ignores non-owner replica_operations cache rows',
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

    service.handleCdcApplied(null, {
      tableName: 'replica_operations',
      data: {
        operation_id: 'add-op-2',
        source_node_id: 'node-2',
        target_node_id: 'node-1',
        workflow_step: WORKFLOW_STEP.PENDING,
        type: OperationType.ADD,
      },
    });
    service.handleCacheNodeChange('replica_operations', 'INSERT', {
      operation_id: 'add-op-2',
      source_node_id: 'node-2',
      target_node_id: 'node-1',
      workflow_step: WORKFLOW_STEP.PENDING,
      type: OperationType.ADD,
    });

    t.equal(
      enqueueCalls.length,
      NUM.ZERO,
      'non-owner nodes must not enqueue replica operation dispatch work',
    );

    service.operationDispatchQueue = originalOperationDispatchQueue;
    service.stop();
  });

test('ReplicaDispatchService bootstraps missing node rows from NODE_STATE_UPDATE ' +
  'payloads when startup registration visibility lags',
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
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
    },
  });

  await service.handleNodeStateUpdate({
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
  });
  t.equal(updates.length, 1, 'attempts the canonical update path once');
  t.equal(
    upserts.length,
    1,
    'dispatch should bootstrap a missing node row from the node-state payload',
  );
  t.equal(
    upserts[0].row[COLUMN.STORAGE_BUDGET_BYTES],
    107374182400,
    'bootstrap upsert should preserve startup-owned storage budget fields',
  );

  service.stop();
});

test('ReplicaDispatchService bootstraps missing node rows from heartbeat-only ' +
  'NODE_STATE_UPDATE payloads with background write options',
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
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
    },
  });

  await service.handleNodeStateUpdate({
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
    [ControlPlaneField.NODE_ID]: 'node-joiner-heartbeat-only',
    [ControlPlaneField.NODE_ADDRESS]: 'localhost:8100',
    [ControlPlaneField.STATE]: STATE.CONNECTED,
    [ControlPlaneField.HEARTBEAT_ONLY]: true,
    [ControlPlaneField.HEARTBEAT_AT]: now,
    [ControlPlaneField.CAPABILITIES]: ['partition_replica'],
    [ControlPlaneField.NODE_ROW]: {
      [COLUMN.NODE_ID]: 'node-joiner-heartbeat-only',
      [COLUMN.NODE_ADDRESS]: 'localhost:8100',
      [COLUMN.CPU_CORES]: 16,
      [COLUMN.MEMORY_MB]: 32768,
      [COLUMN.DISK_GB]: 1000,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now,
      [COLUMN.CREATED_AT]: now - 1000,
      [COLUMN.STORAGE_BUDGET_BYTES]: 107374182400,
      [COLUMN.STORAGE_BUDGET_SOURCE]: 'backfill',
      [COLUMN.STORAGE_BUDGET_UPDATED_AT]: now - 500,
    },
  });

  t.equal(updates.length, 1, 'attempts the canonical update path once');
  t.equal(
    upserts.length,
    1,
    'dispatch should bootstrap a missing row even for heartbeat-only updates',
  );
  t.equal(
    upserts[0].options?.allowPressureDefer,
    true,
    'heartbeat-only bootstrap should be pressure-deferrable',
  );
  t.equal(
    upserts[0].options?.deliveryPriority,
    'background',
    'heartbeat-only bootstrap should use background write delivery',
  );
  t.equal(
    upserts[0].options?.workClass,
    'background',
    'heartbeat-only bootstrap should use background work class',
  );
  t.equal(
    upserts[0].row[COLUMN.CPU_CORES],
    undefined,
    'heartbeat-only bootstrap should not persist resource participation fields',
  );
  t.equal(
    upserts[0].row[COLUMN.STORAGE_BUDGET_BYTES],
    undefined,
    'heartbeat-only bootstrap should not persist storage budget fields',
  );

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

test('ReplicaDispatchService defers retryable participant-failure ' +
  'NODE_STATE_UPDATE errors via shared control-plane classification',
async (t) => {
  initEnv();

  const scheduled = [];
  const now = Date.now();
  const cacheNode = {
    node_id: 'node-participant-failure',
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
  const retryableError =
    new Error('Distributed operation failed due to participant failures');
  retryableError.code = 'DISTRIBUTED_PARTICIPANT_FAILURE';

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
      async updateSystemTableRow() {
        throw retryableError;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  await service.reconcileNodeStateUpdate('node-participant-failure', {
    payload: {
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: 'node-participant-failure',
      [ControlPlaneField.NODE_ADDRESS]: 'localhost:8091',
      [ControlPlaneField.STATE]: STATE.READY,
      [ControlPlaneField.HEARTBEAT_AT]: now,
    },
  });

  t.equal(
    scheduled.length,
    1,
    'retryable participant failure should arm one deferred retry timer',
  );
  t.equal(
    scheduled[0].delayMs,
    service.nodeStateUpdateRetryAfterMs,
    'retryable participant failure should fall back to the canonical delay',
  );
  t.equal(
    service.nodeStateUpdateDeferredRetries.size,
    1,
    'retryable participant failure should keep the latest payload queued for replay',
  );

  service.stop();
});

test('ReplicaDispatchService defers retryable replica operation dispatch ' +
  'failures back onto the owner queue', async (t) => {
  initEnv();

  const scheduled = [];
  const enqueues = [];
  const now = Date.now();
  const retryableError =
    new Error('Transaction already active on this partition');
  retryableError.retryAfterMs = 123;
  const operationRow = {
    operation_id: 'op-retryable-dispatch-1',
    type: OperationType.ADD,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r4',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: now,
    updated_at: now,
    steps_history: '[]',
  };

  let dispatchCalls = 0;
  const service = createService({
    cacheNodes: [{
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      last_heartbeat: now,
      ready_lease_expires_at: now + 30000,
    }],
    cacheReplicaOperations: [operationRow],
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
          },
        };
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        throw retryableError;
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  const originalQueue = service.operationDispatchQueue;
  service.operationDispatchQueue = {
    enqueue(operationId, reason, context) {
      enqueues.push({operationId, reason, context});
      return true;
    },
    shutdown() {},
  };

  try {
    await service.reconcileOperationDispatch(
      operationRow.operation_id,
      {row: operationRow},
    );

    t.equal(
      dispatchCalls,
      1,
      'dispatch should attempt the operation once before deferring',
    );
    t.equal(
      scheduled.length,
      1,
      'retryable dispatch failure should arm one deferred retry timer',
    );
    t.equal(
      scheduled[0].delayMs,
      123,
      'retryable dispatch deferral should honor retryAfterMs',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      1,
      'deferred retry state should be retained until the timer fires',
    );

    scheduled[0].callback();

    t.same(
      enqueues,
      [{
        operationId: operationRow.operation_id,
        reason: RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH,
        context: {row: operationRow},
      }],
      'deferred retry should re-enter the canonical operation owner queue with the last dispatch row',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      0,
      'deferred retry state should clear after re-enqueue',
    );
  } finally {
    service.operationDispatchQueue = originalQueue;
    service.stop();
  }
});

test('ReplicaDispatchService retries SENDING operations for ready target nodes',
  async (t) => {
    initEnv();

    const now = Date.now();
    const enqueueCalls = [];
    const readyNode = {
      node_id: 'node-1',
      node_address: 'localhost:8081',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      capabilities: '[]',
      last_heartbeat: now,
      ready_lease_expires_at: now + 30000,
      created_at: now - 5000,
    };
    const service = createService({
      cacheNodes: [readyNode],
      cacheReplicaOperations: [{
        operation_id: 'replace-op-ready-sending-1',
        partition_id: 'control_plane_publications-p1',
        source_node_id: 'node-2',
        target_node_id: 'node-1',
        workflow_step: WORKFLOW_STEP.SENDING,
        type: OperationType.REPLACE,
      }],
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      controlPlaneReadinessService: {
        getNodeReadinessSync() {
          return {
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION
                .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            },
          };
        },
      },
      rebalanceCoordinator: {
        resolveOperationOwnerNodeId(operation) {
          if (operation?.type === OperationType.REPLACE &&
              operation?.partition_id === 'control_plane_publications-p1') {
            return operation.target_node_id;
          }
          return operation?.source_node_id || null;
        },
      },
    });
    const originalQueue = service.operationDispatchQueue;
    service.operationDispatchQueue = {
      enqueue(...args) {
        enqueueCalls.push(args);
        return true;
      },
      shutdown() {},
    };

    try {
      const retried = await service.retryPendingDispatchesForReadyNode({
        nodeId: 'node-1',
        nodeRow: readyNode,
      });

      t.equal(retried, true, 'ready-node retry should run for ready targets');
      t.same(
        enqueueCalls,
        [[
          'replace-op-ready-sending-1',
          RECONCILE_REASON.NODE_READY_DISPATCH_RETRY,
          {
            row: {
              operation_id: 'replace-op-ready-sending-1',
              partition_id: 'control_plane_publications-p1',
              source_node_id: 'node-2',
              target_node_id: 'node-1',
              workflow_step: WORKFLOW_STEP.SENDING,
              type: OperationType.REPLACE,
            },
          },
        ]],
        'ready-node retries should re-enter locally owned SENDING operations',
      );
    } finally {
      service.operationDispatchQueue = originalQueue;
      service.stop();
    }
  });

test('ReplicaDispatchService replays SENDING rows through the canonical ' +
  'dispatch owner path',
async (t) => {
  initEnv();

  const now = Date.now();
  const readyNode = {
    node_id: 'node-1',
    node_address: 'localhost:8081',
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    capabilities: '[]',
    last_heartbeat: now,
    ready_lease_expires_at: now + 30000,
    created_at: now - 5000,
  };
  const dispatchCalls = [];
  const operationRow = {
    operation_id: 'replace-op-dispatch-sending-1',
    partition_id: 'control_plane_publications-p1',
    source_node_id: 'node-2',
    target_node_id: 'node-1',
    workflow_step: WORKFLOW_STEP.SENDING,
    type: OperationType.REPLACE,
    steps_history: '[]',
    created_at: now - 1000,
    updated_at: now - 500,
  };

  const service = createService({
    cacheNodes: [readyNode],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        };
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation(operation) {
        dispatchCalls.push(operation);
        return {success: true};
      },
      isOperationLocallyOwned(operation) {
        return operation?.target_node_id === 'node-1' ||
          operation?.targetNodeId === 'node-1';
      },
    },
  });

  try {
    await service.reconcileOperationDispatch(
      operationRow.operation_id,
      {row: operationRow},
    );

    t.equal(
      dispatchCalls.length,
      1,
      'reconcile should replay SENDING rows instead of dropping them',
    );
    t.equal(
      dispatchCalls[0]?.operationId,
      operationRow.operation_id,
      'replayed dispatch should preserve the operation id',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService ignores remote-owned dispatch rows before ' +
  'readiness gating', async (t) => {
  initEnv();

  const scheduled = [];
  let readinessChecks = 0;
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: 'op-remote-owned-dispatch-1',
    type: OperationType.ADD,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r4',
    source_node_id: 'node-remote-owner',
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        readinessChecks += 1;
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
          },
        };
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: true};
      },
      isOperationLocallyOwned() {
        return false;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  try {
    await service.dispatchOperationRow(operationRow);

    t.equal(
      readinessChecks,
      NUM.ZERO,
      'remote-owned rows should skip readiness evaluation entirely',
    );
    t.equal(
      dispatchCalls,
      NUM.ZERO,
      'remote-owned rows should not reach coordinator dispatch',
    );
    t.equal(
      scheduled.length,
      NUM.ZERO,
      'remote-owned rows should not arm deferred retries',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService defers not-ready dispatches back onto the ' +
  'owner queue', async (t) => {
  initEnv();

  const scheduled = [];
  const enqueues = [];
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: 'op-target-not-ready-dispatch-1',
    type: OperationType.ADD,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r4',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          retryAfterMs: 123,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
          },
          reasons: [{code: 'control_plane_publication_pending'}],
        };
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: true};
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  const originalQueue = service.operationDispatchQueue;
  service.operationDispatchQueue = {
    enqueue(operationId, reason, context) {
      enqueues.push({operationId, reason, context});
      return true;
    },
    shutdown() {},
  };

  try {
    await service.dispatchOperationRow(operationRow);

    t.equal(
      dispatchCalls,
      NUM.ZERO,
      'not-ready targets should not dispatch inline',
    );
    t.equal(
      scheduled.length,
      1,
      'not-ready targets should arm one deferred retry timer',
    );
    t.equal(
      scheduled[0].delayMs,
      123,
      'not-ready target retries should honor readiness retryAfterMs',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      1,
      'deferred retry state should be retained until the retry fires',
    );

    scheduled[0].callback();

    t.same(
      enqueues,
      [{
        operationId: operationRow.operation_id,
        reason: RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH,
        context: {row: operationRow},
      }],
      'deferred target-not-ready retry should re-enter the canonical owner lane with the dispatch row',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      NUM.ZERO,
      'deferred retry state should clear after re-enqueue',
    );
  } finally {
    service.operationDispatchQueue = originalQueue;
    service.stop();
  }
});

test('ReplicaDispatchService uses authoritative readiness before dispatching',
  async (t) => {
    initEnv();

    const scheduled = [];
    const authoritativeCalls = [];
    let dispatchCalls = 0;
    const operationRow = {
      operation_id: 'op-authoritative-readiness-dispatch-1',
      type: OperationType.REPLACE,
      partition_id: 'replica_operations-p1',
      replica_id: 'replica_operations-p1-r4',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: Date.now(),
      updated_at: Date.now(),
      steps_history: '[]',
    };

    const service = createService({
      cdcIntegrationService: {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
      },
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION
                .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            },
            reasons: [],
          };
        },
        async getNodeReadiness(nodeId, options) {
          authoritativeCalls.push({nodeId, options});
          return {
            nodeId,
            retryAfterMs: 321,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION
                .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
            },
            reasons: [{code: 'control_plane_publication_pending'}],
          };
        },
      },
      rebalanceCoordinator: {
        async dispatchOperation() {
          dispatchCalls += 1;
          return {success: true};
        },
        isOperationLocallyOwned() {
          return true;
        },
      },
      setTimeoutFn(callback, delayMs) {
        const handle = {callback, delayMs};
        scheduled.push(handle);
        return handle;
      },
      clearTimeoutFn() {},
    });

    try {
      await service.dispatchOperationRow(operationRow);

      t.equal(
        dispatchCalls,
        NUM.ZERO,
        'authoritative ineligible readiness should block inline dispatch',
      );
      t.equal(
        authoritativeCalls.length,
        1,
        'dispatch readiness should refresh through the authoritative path',
      );
      t.same(
        authoritativeCalls[0],
        {
          nodeId: 'node-2',
          options: {
            allowAuthoritativeRefresh: true,
            decisionDimension:
              CONTROL_PLANE_READINESS_DIMENSION
                .CONTROL_PLANE_RECOVERY_ELIGIBLE,
            maxCachedAgeMs: NUM.ZERO,
          },
        },
        'authoritative dispatch readiness should bypass cached snapshots',
      );
      t.equal(
        scheduled.length,
        2,
        'authoritative ineligible readiness should arm the bounded refresh guard and one deferred retry timer',
      );
      t.equal(
        scheduled[0].delayMs,
        service.dispatchReadinessRefreshTimeoutMs,
        'dispatch should first arm the bounded authoritative readiness timeout',
      );
      t.equal(
        scheduled[1].delayMs,
        321,
        'authoritative readiness retryAfterMs should still drive the deferred dispatch retry',
      );
      t.equal(
        service.operationDispatchDeferredRetries.size,
        1,
        'authoritative readiness failures should remain queued for retry',
      );
    } finally {
      service.stop();
    }
  });

test('ReplicaDispatchService defers dispatch when authoritative readiness ' +
  'refresh fails', async (t) => {
  initEnv();

  const scheduled = [];
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: 'op-authoritative-readiness-error-1',
    type: OperationType.REPLACE,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r4',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
          },
          reasons: ['sync_snapshot_not_recovery_eligible'],
        };
      },
      async getNodeReadiness() {
        const error = new Error('authoritative_row_source_unavailable');
        error.retryAfterMs = 222;
        throw error;
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: true};
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  try {
    await service.dispatchOperationRow(operationRow);

    t.equal(
      dispatchCalls,
      NUM.ZERO,
      'readiness refresh failures should not dispatch inline',
    );
    t.equal(
      scheduled.length,
      2,
      'readiness refresh failures should arm the bounded refresh guard and one deferred retry timer',
    );
    t.equal(
      scheduled[0].delayMs,
      service.dispatchReadinessRefreshTimeoutMs,
      'readiness refresh should first arm the bounded authoritative timeout',
    );
    t.equal(
      scheduled[1].delayMs,
      222,
      'retryable readiness refresh failures should reuse retryAfterMs for the deferred dispatch retry',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      1,
      'readiness refresh failures should stay on the owner retry queue',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService falls back to ready sync recovery evidence ' +
  'when authoritative refresh times out', async (t) => {
  initEnv();

  const scheduled = [];
  const authoritativeCalls = [];
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: 'op-authoritative-readiness-timeout-1',
    type: OperationType.REPLACE,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r4',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          observedAt: new Date().toISOString(),
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
          reasons: [],
        };
      },
      async getNodeReadiness(nodeId, options) {
        authoritativeCalls.push({nodeId, options});
        const error = new Error('Message timeout while refreshing readiness');
        error.retryAfterMs = 111;
        throw error;
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: true};
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  try {
    await service.dispatchOperationRow(operationRow);

    t.equal(
      dispatchCalls,
      1,
      'retryable authoritative refresh timeouts should reuse ready sync recovery evidence',
    );
    t.equal(
      authoritativeCalls.length,
      1,
      'dispatch should still attempt authoritative readiness refresh first',
    );
    t.equal(
      scheduled.length,
      1,
      'sync fallback should only arm the bounded authoritative refresh guard',
    );
    t.equal(
      scheduled[0].delayMs,
      service.dispatchReadinessRefreshTimeoutMs,
      'sync fallback should use the bounded authoritative refresh budget',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      NUM.ZERO,
      'sync fallback should not leave a deferred dispatch retry behind',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService falls back to ready sync recovery evidence ' +
  'for retryable authoritative refresh failures', async (t) => {
  initEnv();

  const scheduled = [];
  const authoritativeCalls = [];
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: 'op-authoritative-readiness-retryable-1',
    type: OperationType.REPLACE,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r5',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          observedAt: new Date().toISOString(),
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
          reasons: [],
        };
      },
      async getNodeReadiness(nodeId, options) {
        authoritativeCalls.push({nodeId, options});
        const error = new Error(
          'control_plane_pressure_degraded while refreshing readiness',
        );
        error.retryAfterMs = 111;
        throw error;
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: true};
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  try {
    await service.dispatchOperationRow(operationRow);

    t.equal(
      dispatchCalls,
      1,
      'retryable authoritative refresh failures should reuse ready sync recovery evidence',
    );
    t.equal(
      authoritativeCalls.length,
      1,
      'dispatch should still attempt authoritative readiness refresh first',
    );
    t.equal(
      scheduled.length,
      1,
      'sync fallback should only arm the bounded authoritative refresh guard for retryable failures',
    );
    t.equal(
      scheduled[0].delayMs,
      service.dispatchReadinessRefreshTimeoutMs,
      'retryable sync fallback should use the bounded authoritative refresh budget',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      NUM.ZERO,
      'sync fallback should not leave a deferred dispatch retry behind',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService falls back to ready sync recovery evidence ' +
  'when authoritative refresh never resolves promptly', async (t) => {
  initEnv();

  const scheduled = [];
  const authoritativeCalls = [];
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: 'op-authoritative-readiness-hung-1',
    type: OperationType.REPLACE,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r6',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    dispatchReadinessRefreshTimeoutMs: 25,
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          observedAt: new Date().toISOString(),
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
          reasons: [],
        };
      },
      async getNodeReadiness(nodeId, options) {
        authoritativeCalls.push({nodeId, options});
        return new Promise(() => {});
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: true};
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {delayMs, cleared: false};
      scheduled.push(handle);
      Promise.resolve().then(() => {
        if (!handle.cleared) {
          callback();
        }
      });
      return handle;
    },
    clearTimeoutFn(handle) {
      if (handle) {
        handle.cleared = true;
      }
    },
  });

  try {
    await service.dispatchOperationRow(operationRow);

    t.equal(
      dispatchCalls,
      1,
      'hung authoritative refreshes should fall back to ready sync recovery evidence',
    );
    t.equal(
      authoritativeCalls.length,
      1,
      'dispatch should still attempt one authoritative refresh before timing out',
    );
    t.equal(
      scheduled.length,
      1,
      'bounded authoritative refresh should arm one timeout guard',
    );
    t.equal(
      scheduled[0].delayMs,
      25,
      'timeout guard should honor the configured dispatch readiness refresh budget',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      NUM.ZERO,
      'sync fallback should not leave a deferred dispatch retry behind when readiness is already satisfied',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService defers retry when authoritative readiness ' +
  'refresh never resolves and sync readiness is still ineligible',
async (t) => {
  initEnv();

  const scheduled = [];
  const authoritativeCalls = [];
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: 'op-authoritative-readiness-hung-ineligible-1',
    type: OperationType.REPLACE,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r7',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    dispatchReadinessRefreshTimeoutMs: 25,
    operationDispatchRetryAfterMs: 75,
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          observedAt: new Date().toISOString(),
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
          },
          reasons: ['priority_spread_pending'],
        };
      },
      async getNodeReadiness(nodeId, options) {
        authoritativeCalls.push({nodeId, options});
        return new Promise(() => {});
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: true};
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {delayMs, cleared: false};
      scheduled.push(handle);
      if (delayMs === 25) {
        Promise.resolve().then(() => {
          if (!handle.cleared) {
            callback();
          }
        });
      }
      return handle;
    },
    clearTimeoutFn(handle) {
      if (handle) {
        handle.cleared = true;
      }
    },
  });

  try {
    await service.dispatchOperationRow(operationRow);

    t.equal(
      dispatchCalls,
      0,
      'hung authoritative refreshes must not dispatch when sync readiness is still ineligible',
    );
    t.equal(
      authoritativeCalls.length,
      1,
      'dispatch should still attempt one authoritative refresh before deferring',
    );
    t.equal(
      scheduled.length,
      2,
      'bounded refresh should time out once and then arm one deferred dispatch retry',
    );
    t.equal(
      scheduled[0].delayMs,
      25,
      'the first timer should be the bounded readiness refresh timeout',
    );
    t.equal(
      scheduled[1].delayMs,
      75,
      'the deferred retry should honor the dispatch retry-after budget',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      1,
      'ineligible sync readiness should stay on the deferred dispatch retry lane',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService sends direct remote wake-up for target-owned ' +
  'coordinator-created operations', async (t) => {
  initEnv();

  const deliveries = [];
  const service = createService({
    messageRouter: {
      async deliver(address, payload) {
        deliveries.push({address, payload});
        return {acknowledged: true};
      },
    },
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        return {success: true};
      },
      isOperationLocallyOwned() {
        return false;
      },
    },
  });

  try {
    await service.handleCoordinatorOperationCreated({
      operationId: 'op-remote-owned-create-1',
      partitionId: 'control_plane_publications-p1',
      type: OperationType.REPLACE,
      workflowStep: WORKFLOW_STEP.PENDING,
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stepsHistory: [],
    });

    t.same(
      deliveries,
      [{
        address: 'node-2/service/replica-dispatch',
        payload: {
          type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
          [ControlPlaneField.OPERATION_ID]: 'op-remote-owned-create-1',
          [ControlPlaneField.OPERATION_ROW]: {
            operation_id: 'op-remote-owned-create-1',
            type: OperationType.REPLACE,
            partition_id: 'control_plane_publications-p1',
            replica_id: undefined,
            source_node_id: 'node-1',
            target_node_id: 'node-2',
            status: undefined,
            workflow_step: WORKFLOW_STEP.PENDING,
            created_at: deliveries[0]?.payload?.[ControlPlaneField.OPERATION_ROW]
              ?.created_at,
            updated_at: deliveries[0]?.payload?.[ControlPlaneField.OPERATION_ROW]
              ?.updated_at,
            completed_at: undefined,
            error_message: undefined,
            steps_history: '[]',
            entity_type: undefined,
            entity_id: undefined,
          },
        },
      }],
      'remote-owned coordinator creates should wake the target owner directly',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService registers a direct dispatch wake-up handler',
  async (t) => {
    initEnv();

    const registrations = [];
    const unregistrations = [];
    const service = createService({
      messageRouter: {
        register(address, handler) {
          registrations.push({address, handler});
        },
        unregister(address) {
          unregistrations.push(address);
        },
      },
      cdcIntegrationService: {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
      },
    });
    const enqueues = [];
    const originalQueue = service.operationDispatchQueue;
    service.operationDispatchQueue = {
      enqueue(operationId, reason, context) {
        enqueues.push({operationId, reason, context});
      },
      shutdown() {},
    };

    try {
      t.equal(
        registrations.length,
        1,
        'dispatch service should register one direct wake-up handler',
      );
      t.equal(
        registrations[0].address,
        'node-1/service/replica-dispatch',
        'dispatch service should register on the local service address',
      );

      await registrations[0].handler({
        payload: {
          type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
          [ControlPlaneField.OPERATION_ID]: 'op-direct-wakeup-1',
          [ControlPlaneField.OPERATION_ROW]: {
            operation_id: 'op-direct-wakeup-1',
            partition_id: 'control_plane_publications-p1',
            source_node_id: 'node-1',
            target_node_id: 'node-2',
            workflow_step: WORKFLOW_STEP.PENDING,
            type: OperationType.REPLACE,
          },
        },
      });

      t.same(
        enqueues,
        [{
          operationId: 'op-direct-wakeup-1',
          reason: RECONCILE_REASON.MESSAGE_DISPATCH_REQUEST,
          context: {
            row: {
              operation_id: 'op-direct-wakeup-1',
              partition_id: 'control_plane_publications-p1',
              source_node_id: 'node-1',
              target_node_id: 'node-2',
              workflow_step: WORKFLOW_STEP.PENDING,
              type: OperationType.REPLACE,
            },
          },
        }],
        'direct wake-up handler should enqueue the target operation',
      );
    } finally {
      service.operationDispatchQueue = originalQueue;
      service.stop();
    }

    t.same(
      unregistrations,
      ['node-1/service/replica-dispatch'],
      'dispatch service should unregister the direct wake-up handler on stop',
    );
  });

test('ReplicaDispatchService dispatches direct wake-up payload rows before ' +
  'cache visibility converges', async (t) => {
  initEnv();

  const dispatchCalls = [];
  const now = Date.now();
  const operationRow = {
    operation_id: 'op-direct-wakeup-payload-1',
    partition_id: 'control_plane_publications-p1',
    source_node_id: 'node-2',
    target_node_id: 'node-1',
    workflow_step: WORKFLOW_STEP.PENDING,
    type: OperationType.REPLACE,
    steps_history: '[]',
    created_at: now,
    updated_at: now,
  };

  const service = createService({
    cacheNodes: [{
      node_id: 'node-1',
      node_address: 'localhost:8081',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      capabilities: '[]',
      last_heartbeat: now,
      ready_lease_expires_at: now + 30000,
      created_at: now - 5000,
    }],
    cacheReplicaOperations: [],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        };
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation(operation) {
        dispatchCalls.push(operation);
        return {success: true};
      },
      isOperationLocallyOwned(operation) {
        return operation?.target_node_id === 'node-1' ||
          operation?.targetNodeId === 'node-1';
      },
    },
  });

  try {
    await service.reconcileOperationDispatch(operationRow.operation_id, {
      row: operationRow,
    });

    t.equal(
      dispatchCalls.length,
      1,
      'direct wake-up payload rows should dispatch without waiting for cache visibility',
    );
    t.equal(
      dispatchCalls[0]?.operationId,
      operationRow.operation_id,
      'payload-backed dispatch should preserve the operation id',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService preserves direct wake-up payload rows across ' +
  'deferred retry re-entry before cache visibility converges',
async (t) => {
  initEnv();

  const scheduled = [];
  const enqueues = [];
  const dispatchCalls = [];
  const now = Date.now();
  const retryableError = new Error(
    'control-plane recovery dispatch temporarily deferred',
  );
  retryableError.code = 'CONTROL_PLANE_PRESSURE_DEGRADED';
  retryableError.deferRetry = true;
  retryableError.retryAfterMs = 75;
  const operationRow = {
    operation_id: 'op-direct-wakeup-retry-payload-1',
    partition_id: 'control_plane_publications-p1',
    source_node_id: 'node-2',
    target_node_id: 'node-1',
    workflow_step: WORKFLOW_STEP.PENDING,
    type: OperationType.REPLACE,
    steps_history: '[]',
    created_at: now,
    updated_at: now,
  };

  const service = createService({
    cacheNodes: [{
      node_id: 'node-1',
      node_address: 'localhost:8081',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      capabilities: '[]',
      last_heartbeat: now,
      ready_lease_expires_at: now + 30000,
      created_at: now - 5000,
    }],
    cacheReplicaOperations: [],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        };
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation(operation) {
        dispatchCalls.push(operation);
        if (dispatchCalls.length === 1) {
          throw retryableError;
        }
        return {success: true};
      },
      isOperationLocallyOwned(operation) {
        return operation?.target_node_id === 'node-1' ||
          operation?.targetNodeId === 'node-1';
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  const originalQueue = service.operationDispatchQueue;
  service.operationDispatchQueue = {
    enqueue(operationId, reason, context) {
      enqueues.push({operationId, reason, context});
      return true;
    },
    shutdown() {},
  };

  try {
    await service.reconcileOperationDispatch(operationRow.operation_id, {
      row: operationRow,
    });

    t.equal(
      dispatchCalls.length,
      1,
      'the direct wake-up payload should drive the first dispatch attempt',
    );
    t.equal(
      scheduled.length,
      1,
      'retryable direct wake-up failures should arm one deferred retry',
    );
    t.equal(
      scheduled[0].delayMs,
      75,
      'deferred retry should honor the retry-after contract',
    );

    scheduled[0].callback();

    t.same(
      enqueues,
      [{
        operationId: operationRow.operation_id,
        reason: RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH,
        context: {row: operationRow},
      }],
      'deferred retry should preserve the payload row so cache lag cannot drop the handoff',
    );

    await service.reconcileOperationDispatch(
      operationRow.operation_id,
      enqueues[0].context,
    );

    t.equal(
      dispatchCalls.length,
      2,
      'retry re-entry should dispatch again from the preserved payload row',
    );
    t.equal(
      dispatchCalls[1]?.operationId,
      operationRow.operation_id,
      'preserved payload retry should keep the original operation identity',
    );
  } finally {
    service.operationDispatchQueue = originalQueue;
    service.stop();
  }
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
      'node-state updates should forward through canonical metadata ingress ' +
        'routing instead of writing locally',
    );

    service.stop();
  });
