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
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-constants.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {
  NODE_STATE_UPDATE_RETRY_CLASS,
  NODE_STATE_UPDATE_RETRY_POLICY,
} from '../../src/control-plane/replica-dispatch-service-constants.js';
import {
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
  MESSAGE_GROUP_CDC_INGRESS_ACTION,
} from '../../src/message-group/message-group-forwarding-owner.js';
import {
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
} from '../../src/rebalancer/replica-operation-repository.js';
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
  const cacheServices = Array.isArray(options.cacheServices) ?
    options.cacheServices :
    [];
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
        if (tableName === 'services') {
          return cacheServices;
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

const TEST_MEMBERSHIP_PUBLICATION_STATUS = Object.freeze({
  ACK_PENDING: 'ACK_PENDING',
  OPEN: 'OPEN',
  PUBLISHED: 'PUBLISHED',
});

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
      updates[0].options?.workloadClass,
      CONTROL_PLANE_WORKLOAD_CLASS.NODE_STATE_PUBLICATION_CRITICAL,
      'ready publication should use the shared critical node-state workload class',
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
    updates[0].options?.workloadClass,
    CONTROL_PLANE_WORKLOAD_CLASS.NODE_STATE_PUBLICATION_BACKGROUND,
    'heartbeat-only READY updates should use the shared background node-state workload class',
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

test('ReplicaDispatchService re-enters membership publication when a READY ' +
  'heartbeat-only update reaches a node missing from the latest publication',
async (t) => {
  initEnv();

  const now = Date.now();
  const reconcileCalls = [];
  const acknowledgementCalls = [];
  const cacheNode = {
    node_id: 'node-heartbeat-publication-gap',
    node_address: 'localhost:8098',
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
  const membershipPublicationService = {
    getLatestPublicationForNodeSync() {
      return null;
    },
    getLatestPublicationRowSync() {
      return {
        status: TEST_MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
        publishedActiveNodeIds: ['node-1'],
      };
    },
    enqueueClusterMembershipReconcile(reason, context) {
      reconcileCalls.push({reason, context});
      return true;
    },
    async acknowledgeMembershipPublicationForNode(nodeId) {
      acknowledgementCalls.push(nodeId);
      return null;
    },
  };

  const service = createService({
    cacheNode,
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({
        success: true,
        partitionResult: {affectedRows: 1},
      }),
      upsertSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      membershipPublicationService,
    },
  });

  await service.handleNodeStateUpdate({
    [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
    [ControlPlaneField.NODE_ID]: 'node-heartbeat-publication-gap',
    [ControlPlaneField.NODE_ADDRESS]: 'localhost:8098',
    [ControlPlaneField.STATE]: STATE.READY,
    [ControlPlaneField.HEARTBEAT_ONLY]: true,
    [ControlPlaneField.NODE_STATE_PUBLICATION_MODE]:
      CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
    [ControlPlaneField.HEARTBEAT_AT]: now,
  });

  t.equal(
    reconcileCalls.length,
    1,
    'heartbeat-only READY visibility should re-enter membership publication',
  );
  t.equal(
    reconcileCalls[0]?.reason,
    RECONCILE_REASON.NODE_STATE_UPDATE_READY,
    'heartbeat-owned recovery should use the READY publication reason',
  );
  t.equal(
    reconcileCalls[0]?.context?.nodeId,
    'node-heartbeat-publication-gap',
    'publication repair should target the missing node',
  );
  t.equal(
    reconcileCalls[0]?.context?.state,
    STATE.READY,
    'publication repair should preserve READY state context',
  );
  t.equal(
    reconcileCalls[0]?.context?.nodeRow?.connection_state,
    STATE.READY,
    'publication repair should carry the visible READY row shape',
  );
  t.same(
    acknowledgementCalls,
    [],
    'missing publication membership should reconcile before acknowledgements',
  );

  service.stop();
});

test('ReplicaDispatchService cache-visible READY rows re-enter membership ' +
  'publication when the latest publication is still open for that node',
async (t) => {
  initEnv();

  const now = Date.now();
  const reconcileCalls = [];
  const acknowledgementCalls = [];
  const readyNode = {
    node_id: 'node-cache-publication-gap',
    node_address: 'localhost:8099',
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    last_heartbeat: now,
    ready_lease_expires_at: now + 60000,
  };
  const membershipPublicationRow = {
    publicationId: 'membership-publication:17:test',
    status: TEST_MEMBERSHIP_PUBLICATION_STATUS.OPEN,
    requiredAckNodeIds: ['node-cache-publication-gap'],
    publishedActiveNodeIds: ['node-1'],
  };
  const membershipPublicationService = {
    getLatestPublicationForNodeSync(nodeId) {
      return nodeId === 'node-cache-publication-gap' ?
        membershipPublicationRow :
        null;
    },
    getLatestPublicationRowSync() {
      return membershipPublicationRow;
    },
    enqueueClusterMembershipReconcile(reason, context) {
      reconcileCalls.push({reason, context});
      return true;
    },
    async acknowledgeMembershipPublicationForNode(nodeId) {
      acknowledgementCalls.push(nodeId);
      return membershipPublicationRow;
    },
  };

  const service = createService({
    cacheNodes: [readyNode],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      membershipPublicationService,
    },
  });

  service.handleCacheNodeChange(SYSTEM_TABLE_NAME.NODES, readyNode);
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  t.equal(
    reconcileCalls.length,
    1,
    'cache-visible READY rows should reopen membership publication repair',
  );
  t.equal(
    reconcileCalls[0]?.reason,
    RECONCILE_REASON.NODES_CACHE_READY,
    'cache-triggered repair should use the nodes-cache reconcile reason',
  );
  t.same(
    acknowledgementCalls,
    ['node-cache-publication-gap'],
    'open publication rows should be acknowledged once READY visibility appears',
  );

  service.stop();
});

test('ReplicaDispatchService delegates READY acknowledgements through the ' +
  'publication owner when in-flight publication membership is cache-stale',
async (t) => {
  initEnv();

  const now = Date.now();
  const reconcileCalls = [];
  const acknowledgementCalls = [];
  const readyNode = {
    node_id: 'node-inflight-publication-gap',
    node_address: 'localhost:8100',
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    last_heartbeat: now,
    ready_lease_expires_at: now + 60000,
  };
  const membershipPublicationRow = {
    publicationId: 'membership-publication:18:test',
    status: TEST_MEMBERSHIP_PUBLICATION_STATUS.ACK_PENDING,
    requiredAckNodeIds: ['node-1'],
    publishedActiveNodeIds: ['node-1'],
  };
  const membershipPublicationService = {
    getLatestPublicationForNodeSync() {
      return null;
    },
    getLatestPublicationRowSync() {
      return membershipPublicationRow;
    },
    enqueueClusterMembershipReconcile(reason, context) {
      reconcileCalls.push({reason, context});
      return true;
    },
    async acknowledgeMembershipPublicationForNode(nodeId) {
      acknowledgementCalls.push(nodeId);
      return membershipPublicationRow;
    },
  };

  const service = createService({
    cacheNodes: [readyNode],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      membershipPublicationService,
    },
  });

  service.handleCacheNodeChange(SYSTEM_TABLE_NAME.NODES, readyNode);
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  t.equal(
    reconcileCalls.length,
    1,
    'cache-stale in-flight publications should still reconcile ready visibility',
  );
  t.same(
    acknowledgementCalls,
    ['node-inflight-publication-gap'],
    'in-flight publications should delegate acknowledgement ownership ' +
      'even when cache membership lags',
  );

  service.stop();
});

test('ReplicaDispatchService surfaces heartbeat-recovery ' +
  'NODE_STATE_UPDATE publication pressure on the non-deferrable contract',
async (t) => {
  initEnv();

  const now = Date.now();
  const scheduled = [];
  const gatewayCalls = [];
  const service = createService({
    cacheNode: {
      node_id: 'node-heartbeat-recovery',
      node_address: 'localhost:8097',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      last_heartbeat: now - 1000,
      ready_lease_expires_at: now + 1000,
      capabilities: '["partition_replica"]',
    },
    cdcIntegrationService: {
      updateSystemTableRow: async (tableName, whereClause, row, options) => {
        gatewayCalls.push({tableName, whereClause, row, options});
        const error = new Error(
          'Distributed operation failed due to participant failures',
        );
        error.code = 'DISTRIBUTED_PARTICIPANT_FAILURE';
        error.retryAfterMs = 2000;
        throw error;
      },
      upsertSystemTableRow: async () => ({success: true}),
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  const error = await t.rejects(
    service.reconcileNodeStateUpdate('node-heartbeat-recovery', {
      payload: {
        [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
        [ControlPlaneField.NODE_ID]: 'node-heartbeat-recovery',
        [ControlPlaneField.NODE_ADDRESS]: 'localhost:8097',
        [ControlPlaneField.STATE]: STATE.READY,
        [ControlPlaneField.HEARTBEAT_ONLY]: true,
        [ControlPlaneField.NODE_STATE_PUBLICATION_MODE]:
          CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
        [ControlPlaneField.HEARTBEAT_AT]: now,
      },
    }),
  );

  t.equal(gatewayCalls.length, 1,
    'recovery heartbeat should attempt the canonical update once');
  t.equal(
    gatewayCalls[0].options?.allowPressureDefer,
    false,
    'recovery heartbeat writes should stay on the non-deferrable pressure contract',
  );
  t.equal(
    gatewayCalls[0].options?.deliveryPriority,
    'critical',
    'recovery heartbeat writes must keep critical delivery priority',
  );
  t.equal(
    gatewayCalls[0].options?.workClass,
    'critical',
    'recovery heartbeat writes must keep the critical work class',
  );
  t.equal(
    error?.code,
    'DISTRIBUTED_PARTICIPANT_FAILURE',
    'recovery heartbeat failures should surface the canonical pressure error',
  );
  t.equal(
    scheduled.length,
    0,
    'recovery heartbeat failures should not arm a deferred retry timer',
  );
  t.equal(
    service.nodeStateUpdateDeferredRetries.size,
    0,
    'recovery heartbeat failures should not park a deferred retry by node',
  );

  service.stop();
});

test('ReplicaDispatchService defers heartbeat-maintenance ' +
  'NODE_STATE_UPDATE publication pressure', async (t) => {
  initEnv();

  const now = Date.now();
  const scheduled = [];
  const gatewayCalls = [];
  const service = createService({
    cacheNode: {
      node_id: 'node-heartbeat-maintenance',
      node_address: 'localhost:80971',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      last_heartbeat: now - 1000,
      ready_lease_expires_at: now + 1000,
      capabilities: '["partition_replica"]',
    },
    cdcIntegrationService: {
      updateSystemTableRow: async (tableName, whereClause, row, options) => {
        gatewayCalls.push({tableName, whereClause, row, options});
        const error = new Error(
          'Distributed operation failed due to participant failures',
        );
        error.code = 'DISTRIBUTED_PARTICIPANT_FAILURE';
        error.retryAfterMs = 2000;
        throw error;
      },
      upsertSystemTableRow: async () => ({success: true}),
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  await service.reconcileNodeStateUpdate('node-heartbeat-maintenance', {
    payload: {
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: 'node-heartbeat-maintenance',
      [ControlPlaneField.NODE_ADDRESS]: 'localhost:80971',
      [ControlPlaneField.STATE]: STATE.READY,
      [ControlPlaneField.HEARTBEAT_ONLY]: true,
      [ControlPlaneField.NODE_STATE_PUBLICATION_MODE]:
        CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_MAINTENANCE,
      [ControlPlaneField.HEARTBEAT_AT]: now,
    },
  });

  t.equal(gatewayCalls.length, 1,
    'maintenance heartbeat should attempt the canonical update once');
  t.equal(
    gatewayCalls[0].options?.allowPressureDefer,
    true,
    'maintenance heartbeat writes should reuse pressure deferral',
  );
  t.equal(
    gatewayCalls[0].options?.deliveryPriority,
    'background',
    'maintenance heartbeat writes should remain on the background delivery lane',
  );
  t.equal(
    gatewayCalls[0].options?.workClass,
    'background',
    'maintenance heartbeat writes should remain in the background work class',
  );
  t.equal(
    scheduled.length,
    1,
    'maintenance heartbeat failures should arm one deferred retry timer',
  );
  t.equal(
    scheduled[0].delayMs,
    2000,
    'maintenance heartbeat retry should honor the publication-pressure retry-after',
  );
  t.equal(
    service.nodeStateUpdateDeferredRetries.size,
    1,
    'maintenance heartbeat failures should park one deferred retry by node',
  );

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
    'ready node-state updates should delegate cluster publication ' +
      'acknowledgement to publication service',
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
