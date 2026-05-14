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
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {
} from '../../src/control-plane/replica-dispatch-service-constants.js';
import {
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
} from '../../src/message-group/message-group-forwarding-owner.js';
import {
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  OPERATION_WORKFLOW_OWNER_SHARED,
} from '../../src/rebalancer/operation-workflow-owner-shared.js';
import {
  NUM,
  SERVICE_STATUS,
  STATE,
  TIME_MS,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';

const {
  OPERATION_WORKFLOW_OWNER_REASON,
  REBALANCER_SKIP_REASON,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const READY_RETRY_TARGET_NODE_ID = 'node-2';
const READY_RETRY_SOURCE_NODE_ID = 'node-1';
const READY_RETRY_PARTITION_ID = 'replica_operations-p1';
const READY_RETRY_PENDING_STATUS = 'pending';
const READY_RETRY_EMPTY_STEPS_HISTORY = '[]';
const READY_RETRY_PUBLICATION_STATUS = 'PUBLISHED';
const READY_RETRY_PUBLICATION_EPOCH = 14;
const READY_RETRY_REQUIRED_DISTINCT_NODE_COUNT = 2;
const READY_RETRY_READY_ELIGIBLE_NODE_COUNT = 1;
const READY_RETRY_READY_DISTINCT_NODE_COUNT = 1;
const READY_RETRY_SPREAD_GAP = 1;
const READY_RETRY_EXPECTED_SINGLE_CALL = 1;
const READY_RETRY_DEFERRED_RETRY_AFTER_MS = 5;
const READY_RETRY_QUEUE_DRAIN_TICKS = 8;
const READY_RETRY_QUEUE_DRAIN_START = 0;
const READY_RETRY_QUEUE_DRAIN_INCREMENT = 1;
const READY_RETRY_OWNER_STARTING_OPERATION_ID =
  'op-priority-retry-owner-starting';
const READY_RETRY_OWNER_DEFERRED_OPERATION_ID =
  'op-priority-retry-owner-deferred';
const READY_RETRY_OWNER_STARTING_TEST_NAME =
  'ReplicaDispatchService retries ready-node rediscovered PENDING rows ' +
  'when workflow owner initialization is still catching up';
const READY_RETRY_OWNER_DEFERRED_TEST_NAME =
  'ReplicaDispatchService retains direct wake-up rows when workflow owner ' +
  'has a deferred retry pending';
const READY_RETRY_PARTIAL_CACHE_TEST_NAME =
  'ReplicaDispatchService ready-node retry merges authoritative priority ' +
  'rows when cache coverage is partial';
const READY_RETRY_OPERATION_WITNESS_TEST_NAME =
  'ReplicaDispatchService ready-node retry rediscovers the priority witness ' +
  'operation when its partition is cache-visible';
const READY_RETRY_PARTIAL_CACHE_VISIBLE_OPERATION_ID =
  'op-priority-retry-cache-visible';
const READY_RETRY_PARTIAL_CACHE_SECOND_OPERATION_ID =
  'op-priority-retry-cache-visible-2';
const READY_RETRY_PARTIAL_CACHE_MISSING_OPERATION_ID =
  'op-priority-retry-cache-missing';
const READY_RETRY_OPERATION_WITNESS_VISIBLE_OPERATION_ID =
  'op-priority-retry-witness-visible';
const READY_RETRY_OPERATION_WITNESS_BLOCKED_OPERATION_ID =
  'b81411d7-43b0-4fd2-8803-46d413628e9d';
const READY_RETRY_PARTIAL_CACHE_SECOND_PARTITION_ID =
  'sql_transactions-p1';
const READY_RETRY_PARTIAL_CACHE_MISSING_PARTITION_ID =
  'sql_transaction_participants-p1';
const READY_RETRY_OPERATION_WITNESS_PARTITION_ID =
  'sql_write_operations-p1';
const READY_RETRY_PARTIAL_CACHE_EXPECTED_QUEUE_COUNT = 3;
const READY_RETRY_OPERATION_WITNESS_EXPECTED_QUEUE_COUNT = 2;
const READY_RETRY_PUBLICATION_FORCE_TEST_NAME =
  'ReplicaDispatchService publication updates force ready-node retry after ' +
  'an unchanged ready watermark';
const READY_RETRY_PUBLICATION_FORCE_OPERATION_ID =
  'op-priority-retry-publication-force';
const READY_RETRY_PUBLICATION_FORCE_PARTITION_ID =
  'control_plane_publications-p1';
const READY_RETRY_PUBLICATION_FORCE_ID =
  'publication-ready-retry-force';
const READY_RETRY_ASSERT_PARTIAL_AUTHORITY_READ =
  'partial priority cache coverage should query authoritative operations';
const READY_RETRY_ASSERT_PARTIAL_QUEUE_IDS =
  'partial priority cache coverage should enqueue cached and authoritative rows';
const READY_RETRY_ASSERT_WITNESS_AUTHORITY_READ =
  'operation-level priority witness coverage should query authoritative rows';
const READY_RETRY_ASSERT_WITNESS_QUEUE_IDS =
  'operation-level priority witness coverage should enqueue the blocked row';
const READY_RETRY_ASSERT_PUBLICATION_FORCE_AUTHORITY_READ =
  'publication updates should force authoritative rediscovery after an ' +
  'unchanged ready watermark';
const READY_RETRY_ASSERT_PUBLICATION_FORCE_QUEUE =
  'publication updates should re-enter dispatch for newly visible operations';
const READY_RETRY_ASSERT_INITIAL_DISPATCH =
  'ready-node rediscovery should attempt dispatch once before owner ' +
  'initialization finishes';
const READY_RETRY_ASSERT_DEFERRED_RETRY_ARMED =
  'shutdown-in-progress owner skips should arm a dispatch retry';
const READY_RETRY_ASSERT_BOUNDED_DELAY =
  'dispatch retry should use the bounded operation retry delay';
const READY_RETRY_ASSERT_RETRY_LANE =
  'the pending operation should remain in the dispatch retry lane';
const READY_RETRY_ASSERT_INITIAL_OPERATION =
  'first dispatch attempt should use the rediscovered pending operation';
const READY_RETRY_ASSERT_RETRY_REENTRY =
  'deferred retry should re-enter the canonical dispatch queue with the ' +
  'rediscovered PENDING row';
const READY_RETRY_ASSERT_RETRY_SLOT_CLEARED =
  'retry enqueue should clear the deferred dispatch slot before re-entry';
const READY_RETRY_ASSERT_OWNER_DEFERRED_RETRY_ARMED =
  'owner-deferred dispatch should keep the direct wake-up row in the retry lane';
const READY_RETRY_ASSERT_OWNER_DEFERRED_REENTRY =
  'owner-deferred dispatch retry should re-enter with the original wake-up row';

async function waitForOperationDispatchQueueDrain(service = null) {
  for (
    let tick = READY_RETRY_QUEUE_DRAIN_START;
    tick < READY_RETRY_QUEUE_DRAIN_TICKS;
    tick += READY_RETRY_QUEUE_DRAIN_INCREMENT
  ) {
    await Promise.resolve();
  }
  await new Promise((resolve) => {
    setTimeout(resolve, NUM.ZERO);
  });
  if (Array.isArray(service?.operationDispatchQueues)) {
    await Promise.all(
      service.operationDispatchQueues.map((queue) => queue.drain()),
    );
  }
}

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
    nodeId: options.nodeId || 'node-1',
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
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
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
    const cacheReplicaOperations = [];
    const service = createService({
      cacheNodes: [readyNode],
      cacheReplicaOperations,
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
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
              [CONTROL_PLANE_READINESS_DIMENSION
                .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            },
          };
        },
      },
    });
    cacheReplicaOperations.push(pendingRow);
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
        context: {
          row: pendingRow,
          readyNodeId: 'node-2',
          readyNodeRow: readyNode,
        },
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

test('ReplicaDispatchService initialize replays already-ready cached nodes ' +
  'through nodeReadyRetryQueue', async (t) => {
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
    operation_id: 'op-startup-replay-1',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    workflow_step: WORKFLOW_STEP.PENDING,
    type: OperationType.REPLACE,
    partition_id: 'replica_operations-p1',
  };
  const enqueueCalls = [];
  const dispatchCalls = [];

  const service = new ReplicaDispatchService({
    nodeId: 'node-2',
    messageRouter: {},
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
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        };
      },
    },
    systemTableCache: {
      get(tableName, nodeId) {
        if (tableName !== 'nodes' || nodeId !== readyNode.node_id) {
          return null;
        }
        return readyNode;
      },
      getAll(tableName) {
        if (tableName === 'nodes') {
          return [readyNode];
        }
        if (tableName === 'replica_operations') {
          return [pendingRow];
        }
        return [];
      },
      onCacheChange() {},
    },
    rebalanceCoordinator: {
      async dispatchOperation(operation) {
        dispatchCalls.push(operation.operationId);
        return {success: true};
      },
      isOperationLocallyOwned(operation) {
        return (
          operation?.targetNodeId === 'node-2' ||
          operation?.target_node_id === 'node-2'
        );
      },
      resolveOperationOwnerNodeId(operation) {
        return operation?.targetNodeId || operation?.target_node_id || null;
      },
    },
  });
  const originalNodeReadyRetryQueue = service.nodeReadyRetryQueue;
  const originalNodeReadyRetryEnqueue =
    originalNodeReadyRetryQueue.enqueue.bind(originalNodeReadyRetryQueue);
  service.nodeReadyRetryQueue.enqueue = (nodeId, reason, context) => {
    enqueueCalls.push({nodeId, reason, context});
    return true;
  };

  try {
    service.initialize();
    await Promise.resolve();

    t.same(
      enqueueCalls,
      [{
        nodeId: 'node-2',
        reason: RECONCILE_REASON.NODES_CACHE_READY,
        context: {
          nodeRow: readyNode,
        },
      }],
      'initialize should replay already-ready cached nodes through the canonical ready-node queue',
    );
    t.same(
      dispatchCalls,
      [],
      'initialize replay must not dispatch operations inline',
    );
  } finally {
    service.nodeReadyRetryQueue.enqueue = originalNodeReadyRetryEnqueue;
    service.stop();
  }
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
      {
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
      },
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
          readyNodeId: 'node-2',
          readyNodeRow: readyNode,
        },
      }],
      'authoritative rediscovery should still re-enter the canonical per-operation queue',
    );

    service.operationDispatchQueue = originalOperationDispatchQueue;
    service.stop();
  });

test(READY_RETRY_OWNER_STARTING_TEST_NAME,
async (t) => {
  initEnv();

  const now = Date.now();
  const readyNode = {
    node_id: READY_RETRY_TARGET_NODE_ID,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    last_heartbeat: now,
    ready_lease_expires_at: now + TIME_MS.MINUTE,
  };
  const priorityOperation = {
    operationId: READY_RETRY_OWNER_STARTING_OPERATION_ID,
    partitionId: READY_RETRY_PARTITION_ID,
    type: OperationType.REPLACE,
    sourceNodeId: READY_RETRY_SOURCE_NODE_ID,
    targetNodeId: READY_RETRY_TARGET_NODE_ID,
    status: READY_RETRY_PENDING_STATUS,
    workflowStep: WORKFLOW_STEP.PENDING,
    updatedAt: now - TIME_MS.MINUTE,
    stepsHistory: [],
  };
  const deferredTimers = [];
  const dispatchResults = [
    {
      success: false,
      skipped: true,
      reason: OPERATION_WORKFLOW_OWNER_REASON.SHUTDOWN_IN_PROGRESS,
    },
    {success: true},
  ];
  const dispatchCalls = [];
  const service = createService({
    cacheNodes: [readyNode],
    cacheReplicaOperations: [],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    operationDispatchRetryAfterMs: READY_RETRY_DEFERRED_RETRY_AFTER_MS,
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn(handle) {
      const timerIndex = deferredTimers.indexOf(handle);
      if (timerIndex >= NUM.ZERO) {
        deferredTimers.splice(timerIndex, NUM.ONE);
      }
    },
    rebalanceCoordinator: {
      repository: {
        async queryIncompleteOperations() {
          return [priorityOperation];
        },
      },
      dispatchOperation(operation) {
        dispatchCalls.push(operation);
        return dispatchResults.shift();
      },
      isOperationLocallyOwned(operation) {
        return (
          operation?.targetNodeId === READY_RETRY_TARGET_NODE_ID ||
          operation?.target_node_id === READY_RETRY_TARGET_NODE_ID
        );
      },
      resolveOperationOwnerNodeId(operation) {
        return operation?.targetNodeId || operation?.target_node_id || null;
      },
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        };
      },
      async getNodeReadiness(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        };
      },
      getMembershipPublicationDiagnosticsSync() {
        return {
          publicationEpoch: READY_RETRY_PUBLICATION_EPOCH,
          publicationStatus: READY_RETRY_PUBLICATION_STATUS,
          publishedActiveNodeIds: [READY_RETRY_SOURCE_NODE_ID],
          priorityPartitionSummary: {
            requiredDistinctNodeCount:
              READY_RETRY_REQUIRED_DISTINCT_NODE_COUNT,
            readyEligibleNodeCount: READY_RETRY_READY_ELIGIBLE_NODE_COUNT,
            blockedPartitions: [{
              partitionId: READY_RETRY_PARTITION_ID,
              requiredDistinctNodeCount:
                READY_RETRY_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount: READY_RETRY_READY_DISTINCT_NODE_COUNT,
              spreadGap: READY_RETRY_SPREAD_GAP,
            }],
            missingPartitionIds: [READY_RETRY_PARTITION_ID],
          },
          membershipLifecycleSummary: {
            locallyEligibleNodeIds: [READY_RETRY_TARGET_NODE_ID],
            projectedServingNodeIds: [READY_RETRY_TARGET_NODE_ID],
          },
        };
      },
    },
  });

  await service.retryPendingDispatchesForReadyNode({
    nodeId: READY_RETRY_TARGET_NODE_ID,
    nodeRow: readyNode,
  });
  await waitForOperationDispatchQueueDrain(service);

  t.equal(
    dispatchCalls.length,
    READY_RETRY_EXPECTED_SINGLE_CALL,
    READY_RETRY_ASSERT_INITIAL_DISPATCH,
  );
  t.equal(
    deferredTimers.length,
    READY_RETRY_EXPECTED_SINGLE_CALL,
    READY_RETRY_ASSERT_DEFERRED_RETRY_ARMED,
  );
  t.equal(
    deferredTimers[READY_RETRY_QUEUE_DRAIN_START].delayMs,
    READY_RETRY_DEFERRED_RETRY_AFTER_MS,
    READY_RETRY_ASSERT_BOUNDED_DELAY,
  );
  t.equal(
    service.operationDispatchDeferredRetries.size,
    READY_RETRY_EXPECTED_SINGLE_CALL,
    READY_RETRY_ASSERT_RETRY_LANE,
  );

  const retryEnqueues = [];
  const originalOperationDispatchQueue = service.operationDispatchQueue;
  service.operationDispatchQueue = {
    enqueue(operationId, reason, context) {
      retryEnqueues.push({operationId, reason, context});
    },
  };
  deferredTimers[READY_RETRY_QUEUE_DRAIN_START].callback();

  t.equal(
    dispatchCalls[READY_RETRY_QUEUE_DRAIN_START]?.operationId,
    priorityOperation.operationId,
    READY_RETRY_ASSERT_INITIAL_OPERATION,
  );
  t.same(
    retryEnqueues,
    [{
      operationId: priorityOperation.operationId,
      reason: RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH,
      context: {
        row: {
          operation_id: priorityOperation.operationId,
          type: OperationType.REPLACE,
          partition_id: READY_RETRY_PARTITION_ID,
          replica_id: undefined,
          source_node_id: READY_RETRY_SOURCE_NODE_ID,
          target_node_id: READY_RETRY_TARGET_NODE_ID,
          status: READY_RETRY_PENDING_STATUS,
          workflow_step: WORKFLOW_STEP.PENDING,
          created_at: undefined,
          updated_at: priorityOperation.updatedAt,
          completed_at: undefined,
          error_message: undefined,
          steps_history: READY_RETRY_EMPTY_STEPS_HISTORY,
          entity_type: undefined,
          entity_id: undefined,
        },
      },
    }],
    READY_RETRY_ASSERT_RETRY_REENTRY,
  );
  t.equal(
    service.operationDispatchDeferredRetries.size,
    NUM.ZERO,
    READY_RETRY_ASSERT_RETRY_SLOT_CLEARED,
  );

  service.operationDispatchQueue = originalOperationDispatchQueue;
  service.stop();
});

test(READY_RETRY_OWNER_DEFERRED_TEST_NAME, async (t) => {
  initEnv();

  const now = Date.now();
  const readyNode = {
    node_id: READY_RETRY_TARGET_NODE_ID,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    last_heartbeat: now,
    ready_lease_expires_at: now + TIME_MS.MINUTE,
  };
  const operationRow = {
    operation_id: READY_RETRY_OWNER_DEFERRED_OPERATION_ID,
    type: OperationType.REPLACE,
    partition_id: READY_RETRY_PUBLICATION_FORCE_PARTITION_ID,
    replica_id: READY_RETRY_PUBLICATION_FORCE_PARTITION_ID,
    source_node_id: READY_RETRY_SOURCE_NODE_ID,
    target_node_id: READY_RETRY_TARGET_NODE_ID,
    status: READY_RETRY_PENDING_STATUS,
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: now - TIME_MS.MINUTE,
    updated_at: now - TIME_MS.MINUTE,
    completed_at: undefined,
    error_message: undefined,
    steps_history: READY_RETRY_EMPTY_STEPS_HISTORY,
    entity_type: undefined,
    entity_id: undefined,
  };
  const deferredTimers = [];
  const dispatchCalls = [];
  const service = createService({
    nodeId: READY_RETRY_TARGET_NODE_ID,
    cacheNodes: [readyNode],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    operationDispatchRetryAfterMs: READY_RETRY_DEFERRED_RETRY_AFTER_MS,
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn(handle) {
      const timerIndex = deferredTimers.indexOf(handle);
      if (timerIndex >= NUM.ZERO) {
        deferredTimers.splice(timerIndex, NUM.ONE);
      }
    },
    rebalanceCoordinator: {
      dispatchOperation(operation) {
        dispatchCalls.push(operation);
        return {
          success: false,
          skipped: true,
          reason: REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
        };
      },
      isOperationLocallyOwned(operation) {
        return (
          operation?.targetNodeId === READY_RETRY_TARGET_NODE_ID ||
          operation?.target_node_id === READY_RETRY_TARGET_NODE_ID
        );
      },
      resolveOperationOwnerNodeId(operation) {
        return operation?.targetNodeId || operation?.target_node_id || null;
      },
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        };
      },
    },
  });

  await service.dispatchOperationRow(operationRow, {
    readyNodeId: READY_RETRY_TARGET_NODE_ID,
    readyNodeRow: readyNode,
  });

  t.equal(
    dispatchCalls.length,
    READY_RETRY_EXPECTED_SINGLE_CALL,
    READY_RETRY_ASSERT_INITIAL_DISPATCH,
  );
  t.equal(
    deferredTimers.length,
    READY_RETRY_EXPECTED_SINGLE_CALL,
    READY_RETRY_ASSERT_OWNER_DEFERRED_RETRY_ARMED,
  );
  t.equal(
    service.operationDispatchDeferredRetries.size,
    READY_RETRY_EXPECTED_SINGLE_CALL,
    READY_RETRY_ASSERT_OWNER_DEFERRED_RETRY_ARMED,
  );

  const retryEnqueues = [];
  const originalOperationDispatchQueue = service.operationDispatchQueue;
  service.operationDispatchQueue = {
    enqueue(operationId, reason, context) {
      retryEnqueues.push({operationId, reason, context});
    },
  };
  deferredTimers[READY_RETRY_QUEUE_DRAIN_START].callback();

  t.same(
    retryEnqueues,
    [{
      operationId: READY_RETRY_OWNER_DEFERRED_OPERATION_ID,
      reason: RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH,
      context: {
        row: operationRow,
      },
    }],
    READY_RETRY_ASSERT_OWNER_DEFERRED_REENTRY,
  );
  t.equal(
    service.operationDispatchDeferredRetries.size,
    NUM.ZERO,
    READY_RETRY_ASSERT_RETRY_SLOT_CLEARED,
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
        context: {
          row: pendingRow,
          readyNodeId: 'node-2',
          readyNodeRow: readyNode,
        },
      }],
      'cache-visible retry rows should keep the existing dispatch retry path',
    );

    service.operationDispatchQueue = originalOperationDispatchQueue;
    service.stop();
  });

test(READY_RETRY_PARTIAL_CACHE_TEST_NAME, async (t) => {
  initEnv();

  const now = Date.now();
  const readyNode = {
    node_id: READY_RETRY_TARGET_NODE_ID,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    last_heartbeat: now,
    ready_lease_expires_at: now + TIME_MS.MINUTE,
  };
  const visibleRow = {
    operation_id: READY_RETRY_PARTIAL_CACHE_VISIBLE_OPERATION_ID,
    source_node_id: READY_RETRY_SOURCE_NODE_ID,
    target_node_id: READY_RETRY_TARGET_NODE_ID,
    workflow_step: WORKFLOW_STEP.PENDING,
    status: READY_RETRY_PENDING_STATUS,
    type: OperationType.REPLACE,
    partition_id: READY_RETRY_PARTITION_ID,
  };
  const secondVisibleRow = {
    operation_id: READY_RETRY_PARTIAL_CACHE_SECOND_OPERATION_ID,
    source_node_id: READY_RETRY_SOURCE_NODE_ID,
    target_node_id: READY_RETRY_TARGET_NODE_ID,
    workflow_step: WORKFLOW_STEP.PENDING,
    status: READY_RETRY_PENDING_STATUS,
    type: OperationType.REPLACE,
    partition_id: READY_RETRY_PARTIAL_CACHE_SECOND_PARTITION_ID,
  };
  const missingAuthoritativeOperation = {
    operationId: READY_RETRY_PARTIAL_CACHE_MISSING_OPERATION_ID,
    partitionId: READY_RETRY_PARTIAL_CACHE_MISSING_PARTITION_ID,
    type: OperationType.REPLACE,
    sourceNodeId: READY_RETRY_SOURCE_NODE_ID,
    targetNodeId: READY_RETRY_TARGET_NODE_ID,
    status: READY_RETRY_PENDING_STATUS,
    workflowStep: WORKFLOW_STEP.PENDING,
    stepsHistory: [],
  };
  let authoritativeQueryCount = NUM.ZERO;
  const enqueueCalls = [];
  const blockedPartitions = [
    READY_RETRY_PARTITION_ID,
    READY_RETRY_PARTIAL_CACHE_SECOND_PARTITION_ID,
    READY_RETRY_PARTIAL_CACHE_MISSING_PARTITION_ID,
  ].map((partitionId) => ({
    partitionId,
    requiredDistinctNodeCount: READY_RETRY_REQUIRED_DISTINCT_NODE_COUNT,
    readyDistinctNodeCount: READY_RETRY_READY_DISTINCT_NODE_COUNT,
    spreadGap: READY_RETRY_SPREAD_GAP,
  }));
  const service = createService({
    nodeId: READY_RETRY_TARGET_NODE_ID,
    cacheNodes: [readyNode],
    cacheReplicaOperations: [visibleRow, secondVisibleRow],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    rebalanceCoordinator: {
      resolveOperationOwnerNodeId(operation) {
        return operation?.targetNodeId || operation?.target_node_id || null;
      },
      repository: {
        async queryIncompleteOperations() {
          authoritativeQueryCount += READY_RETRY_QUEUE_DRAIN_INCREMENT;
          return [
            missingAuthoritativeOperation,
            {
              operationId: READY_RETRY_PARTIAL_CACHE_VISIBLE_OPERATION_ID,
              partitionId: READY_RETRY_PARTITION_ID,
              type: OperationType.REPLACE,
              sourceNodeId: READY_RETRY_SOURCE_NODE_ID,
              targetNodeId: READY_RETRY_TARGET_NODE_ID,
              status: READY_RETRY_PENDING_STATUS,
              workflowStep: WORKFLOW_STEP.PENDING,
              stepsHistory: [],
            },
          ];
        },
      },
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        };
      },
      getMembershipPublicationDiagnosticsSync() {
        return {
          publicationEpoch: READY_RETRY_PUBLICATION_EPOCH,
          publicationStatus: READY_RETRY_PUBLICATION_STATUS,
          publishedActiveNodeIds: [READY_RETRY_SOURCE_NODE_ID],
          priorityPartitionSummary: {
            requiredDistinctNodeCount:
              READY_RETRY_REQUIRED_DISTINCT_NODE_COUNT,
            readyEligibleNodeCount: READY_RETRY_READY_ELIGIBLE_NODE_COUNT,
            blockedPartitions,
            missingPartitionIds: blockedPartitions.map(
              (partition) => partition.partitionId,
            ),
          },
          membershipLifecycleSummary: {
            locallyEligibleNodeIds: [READY_RETRY_TARGET_NODE_ID],
            projectedServingNodeIds: [READY_RETRY_TARGET_NODE_ID],
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
    nodeId: READY_RETRY_TARGET_NODE_ID,
    nodeRow: readyNode,
  });

  t.equal(
    authoritativeQueryCount,
    READY_RETRY_EXPECTED_SINGLE_CALL,
    READY_RETRY_ASSERT_PARTIAL_AUTHORITY_READ,
  );
  t.same(
    enqueueCalls.map((call) => call.operationId).sort(),
    [
      READY_RETRY_PARTIAL_CACHE_MISSING_OPERATION_ID,
      READY_RETRY_PARTIAL_CACHE_SECOND_OPERATION_ID,
      READY_RETRY_PARTIAL_CACHE_VISIBLE_OPERATION_ID,
    ].sort(),
    READY_RETRY_ASSERT_PARTIAL_QUEUE_IDS,
  );
  t.equal(
    enqueueCalls.length,
    READY_RETRY_PARTIAL_CACHE_EXPECTED_QUEUE_COUNT,
    READY_RETRY_ASSERT_PARTIAL_QUEUE_IDS,
  );

  service.operationDispatchQueue = originalOperationDispatchQueue;
  service.stop();
});

test(READY_RETRY_OPERATION_WITNESS_TEST_NAME, async (t) => {
  initEnv();

  const now = Date.now();
  const readyNode = {
    node_id: READY_RETRY_TARGET_NODE_ID,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    last_heartbeat: now,
    ready_lease_expires_at: now + TIME_MS.MINUTE,
  };
  const visibleRow = {
    operation_id: READY_RETRY_OPERATION_WITNESS_VISIBLE_OPERATION_ID,
    source_node_id: READY_RETRY_SOURCE_NODE_ID,
    target_node_id: READY_RETRY_TARGET_NODE_ID,
    workflow_step: WORKFLOW_STEP.PENDING,
    status: READY_RETRY_PENDING_STATUS,
    type: OperationType.REPLACE,
    partition_id: READY_RETRY_OPERATION_WITNESS_PARTITION_ID,
  };
  const blockedAuthoritativeOperation = {
    operationId: READY_RETRY_OPERATION_WITNESS_BLOCKED_OPERATION_ID,
    partitionId: READY_RETRY_OPERATION_WITNESS_PARTITION_ID,
    type: OperationType.REPLACE,
    sourceNodeId: READY_RETRY_SOURCE_NODE_ID,
    targetNodeId: READY_RETRY_TARGET_NODE_ID,
    status: READY_RETRY_PENDING_STATUS,
    workflowStep: WORKFLOW_STEP.PENDING,
    stepsHistory: [],
  };
  let authoritativeQueryCount = NUM.ZERO;
  const enqueueCalls = [];
  const service = createService({
    nodeId: READY_RETRY_TARGET_NODE_ID,
    cacheNodes: [readyNode],
    cacheReplicaOperations: [visibleRow],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    rebalanceCoordinator: {
      resolveOperationOwnerNodeId(operation) {
        return operation?.targetNodeId || operation?.target_node_id || null;
      },
      repository: {
        async queryIncompleteOperations() {
          authoritativeQueryCount += READY_RETRY_QUEUE_DRAIN_INCREMENT;
          return [blockedAuthoritativeOperation];
        },
      },
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        };
      },
      getMembershipPublicationDiagnosticsSync() {
        return {
          publicationEpoch: READY_RETRY_PUBLICATION_EPOCH,
          publicationStatus: READY_RETRY_PUBLICATION_STATUS,
          publishedActiveNodeIds: [READY_RETRY_SOURCE_NODE_ID],
          priorityPartitionSummary: {
            requiredDistinctNodeCount:
              READY_RETRY_REQUIRED_DISTINCT_NODE_COUNT,
            readyEligibleNodeCount: READY_RETRY_READY_ELIGIBLE_NODE_COUNT,
            blockedPartitions: [{
              partitionId: READY_RETRY_OPERATION_WITNESS_PARTITION_ID,
              requiredDistinctNodeCount:
                READY_RETRY_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount: READY_RETRY_READY_DISTINCT_NODE_COUNT,
              spreadGap: READY_RETRY_SPREAD_GAP,
            }],
            missingPartitionIds: [
              READY_RETRY_OPERATION_WITNESS_PARTITION_ID,
            ],
          },
          priorityRecoveryPartitionWitnesses: [{
            partitionId: READY_RETRY_OPERATION_WITNESS_PARTITION_ID,
            operationIds: [
              READY_RETRY_OPERATION_WITNESS_BLOCKED_OPERATION_ID,
            ],
          }],
          membershipLifecycleSummary: {
            locallyEligibleNodeIds: [READY_RETRY_TARGET_NODE_ID],
            projectedServingNodeIds: [READY_RETRY_TARGET_NODE_ID],
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
    nodeId: READY_RETRY_TARGET_NODE_ID,
    nodeRow: readyNode,
  });

  t.equal(
    authoritativeQueryCount,
    READY_RETRY_EXPECTED_SINGLE_CALL,
    READY_RETRY_ASSERT_WITNESS_AUTHORITY_READ,
  );
  t.same(
    enqueueCalls.map((call) => call.operationId).sort(),
    [
      READY_RETRY_OPERATION_WITNESS_BLOCKED_OPERATION_ID,
      READY_RETRY_OPERATION_WITNESS_VISIBLE_OPERATION_ID,
    ].sort(),
    READY_RETRY_ASSERT_WITNESS_QUEUE_IDS,
  );
  t.equal(
    enqueueCalls.length,
    READY_RETRY_OPERATION_WITNESS_EXPECTED_QUEUE_COUNT,
    READY_RETRY_ASSERT_WITNESS_QUEUE_IDS,
  );

  service.operationDispatchQueue = originalOperationDispatchQueue;
  service.stop();
});

test(READY_RETRY_PUBLICATION_FORCE_TEST_NAME, async (t) => {
  initEnv();

  const now = Date.now();
  const readyNode = {
    node_id: READY_RETRY_TARGET_NODE_ID,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    last_heartbeat: now,
    ready_lease_expires_at: now + TIME_MS.MINUTE,
  };
  const authoritativeOperation = {
    operationId: READY_RETRY_PUBLICATION_FORCE_OPERATION_ID,
    partitionId: READY_RETRY_PUBLICATION_FORCE_PARTITION_ID,
    type: OperationType.REPLACE,
    sourceNodeId: READY_RETRY_SOURCE_NODE_ID,
    targetNodeId: READY_RETRY_TARGET_NODE_ID,
    status: READY_RETRY_PENDING_STATUS,
    workflowStep: WORKFLOW_STEP.PENDING,
    stepsHistory: [],
  };
  const authoritativeRowsByRead = [
    [],
    [authoritativeOperation],
  ];
  let authoritativeQueryCount = NUM.ZERO;
  const enqueueCalls = [];
  const service = createService({
    nodeId: READY_RETRY_TARGET_NODE_ID,
    cacheNodes: [readyNode],
    cacheReplicaOperations: [],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    rebalanceCoordinator: {
      resolveOperationOwnerNodeId(operation) {
        return operation?.targetNodeId || operation?.target_node_id || null;
      },
      repository: {
        async queryIncompleteOperations() {
          const rows =
            authoritativeRowsByRead[authoritativeQueryCount] || [];
          authoritativeQueryCount += READY_RETRY_QUEUE_DRAIN_INCREMENT;
          return rows;
        },
      },
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        };
      },
      getMembershipPublicationDiagnosticsSync() {
        return {
          publicationEpoch: READY_RETRY_PUBLICATION_EPOCH,
          publicationStatus: READY_RETRY_PUBLICATION_STATUS,
          publishedActiveNodeIds: [READY_RETRY_SOURCE_NODE_ID],
          priorityPartitionSummary: {
            requiredDistinctNodeCount:
              READY_RETRY_REQUIRED_DISTINCT_NODE_COUNT,
            readyEligibleNodeCount: READY_RETRY_READY_ELIGIBLE_NODE_COUNT,
            blockedPartitions: [{
              partitionId: READY_RETRY_PUBLICATION_FORCE_PARTITION_ID,
              requiredDistinctNodeCount:
                READY_RETRY_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount: READY_RETRY_READY_DISTINCT_NODE_COUNT,
              spreadGap: READY_RETRY_SPREAD_GAP,
            }],
            missingPartitionIds: [READY_RETRY_PUBLICATION_FORCE_PARTITION_ID],
          },
          membershipLifecycleSummary: {
            locallyEligibleNodeIds: [READY_RETRY_TARGET_NODE_ID],
            projectedServingNodeIds: [READY_RETRY_TARGET_NODE_ID],
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
    nodeId: READY_RETRY_TARGET_NODE_ID,
    nodeRow: readyNode,
  });
  await service.handleCdcApplied(null, {
    tableName: 'control_plane_publications',
    data: {
      publication_id: READY_RETRY_PUBLICATION_FORCE_ID,
      status: READY_RETRY_PUBLICATION_STATUS,
    },
  });
  await service.nodeReadyRetryQueue.drain();
  await waitForOperationDispatchQueueDrain(service);

  t.equal(
    authoritativeQueryCount,
    READY_RETRY_REQUIRED_DISTINCT_NODE_COUNT,
    READY_RETRY_ASSERT_PUBLICATION_FORCE_AUTHORITY_READ,
  );
  t.same(
    enqueueCalls.map((call) => call.operationId),
    [READY_RETRY_PUBLICATION_FORCE_OPERATION_ID],
    READY_RETRY_ASSERT_PUBLICATION_FORCE_QUEUE,
  );
  t.same(
    enqueueCalls.map((call) => call.reason),
    [RECONCILE_REASON.NODE_READY_DISPATCH_RETRY],
    READY_RETRY_ASSERT_PUBLICATION_FORCE_QUEUE,
  );

  service.operationDispatchQueue = originalOperationDispatchQueue;
  service.stop();
});

test('ReplicaDispatchService ready-node retry wakes remote owners for ' +
  'remote-owned pending operations',
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
  const deliveries = [];
  const enqueueCalls = [];
  const cacheReplicaOperations = [];
  const service = createService({
    cacheNodes: [readyNode],
    cacheReplicaOperations,
    messageRouter: {
      async deliver(address, payload) {
        deliveries.push({address, payload});
        return {acknowledged: true};
      },
    },
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    rebalanceCoordinator: {
      isOperationLocallyOwned(operation) {
        return operation?.source_node_id === 'node-1';
      },
      resolveOperationOwnerNodeId(operation) {
        return operation?.sourceNodeId || operation?.source_node_id || null;
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
  cacheReplicaOperations.push(remoteOwnedPendingRow);
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

  t.same(
    deliveries,
    [{
      address: 'node-remote-owner/service/replica-dispatch',
      payload: {
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: 'op-ready-retry-remote',
        [ControlPlaneField.OPERATION_ROW]: {
          operation_id: 'op-ready-retry-remote',
          type: 'ADD',
          partition_id: undefined,
          replica_id: undefined,
          source_node_id: 'node-remote-owner',
          target_node_id: 'node-2',
          status: undefined,
          workflow_step: WORKFLOW_STEP.PENDING,
          created_at: undefined,
          updated_at: undefined,
          completed_at: undefined,
          error_message: undefined,
          steps_history: '[]',
          entity_type: 'partition',
          entity_id: undefined,
        },
      },
    }],
    'ready-node retry should wake the remote owner directly when the ready target only sees a remote-owned pending operation',
  );
  t.equal(
    enqueueCalls.length,
    NUM.ZERO,
    'ready-node retry should not enqueue remote-owned rows for local dispatch reconcile',
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

test('ReplicaDispatchService cache replay wakes remote owners for remote-owned ' +
  'priority REPLACE pending rows',
async (t) => {
  initEnv();

  const deliveries = [];
  const service = createService({
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    messageRouter: {
      async deliver(address, payload) {
        deliveries.push({address, payload});
        return {acknowledged: true};
      },
    },
    rebalanceCoordinator: {
      resolveOperationOwnerNodeId(operation) {
        const partitionId = operation?.partitionId || operation?.partition_id;
        const targetNodeId =
          operation?.targetNodeId || operation?.target_node_id;
        const sourceNodeId =
          operation?.sourceNodeId || operation?.source_node_id;
        if (operation?.type === OperationType.REPLACE &&
            partitionId === 'sql_write_operations-p1') {
          return targetNodeId;
        }
        return sourceNodeId || null;
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
    operation_id: 'replace-op-remote-cache-1',
    partition_id: 'sql_write_operations-p1',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    workflow_step: WORKFLOW_STEP.PENDING,
    type: OperationType.REPLACE,
    entity_type: 'partition',
    entity_id: 'sql_write_operations-p1',
  });

  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  t.same(
    enqueueCalls,
    [],
    'cache replay should not enqueue remote-owned rows onto the local queue',
  );
  t.same(
    deliveries,
    [{
      address: 'node-2/service/replica-dispatch',
      payload: {
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: 'replace-op-remote-cache-1',
        [ControlPlaneField.OPERATION_ROW]: {
          operation_id: 'replace-op-remote-cache-1',
          type: OperationType.REPLACE,
          partition_id: 'sql_write_operations-p1',
          replica_id: undefined,
          source_node_id: 'node-1',
          target_node_id: 'node-2',
          status: undefined,
          workflow_step: WORKFLOW_STEP.PENDING,
          created_at:
            deliveries[0]?.payload?.[ControlPlaneField.OPERATION_ROW]
              ?.created_at,
          updated_at:
            deliveries[0]?.payload?.[ControlPlaneField.OPERATION_ROW]
              ?.updated_at,
          completed_at: undefined,
          error_message: undefined,
          steps_history: '[]',
          entity_type: 'partition',
          entity_id: 'sql_write_operations-p1',
        },
      },
    }],
    'cache replay should wake the canonical remote owner for dispatchable rows',
  );

  service.operationDispatchQueue = originalOperationDispatchQueue;
  service.stop();
});

test('ReplicaDispatchService replica_operations CDC replay wakes remote ' +
  'owners for remote-owned priority REPLACE pending rows',
async (t) => {
  initEnv();

  const deliveries = [];
  const service = createService({
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    messageRouter: {
      async deliver(address, payload) {
        deliveries.push({address, payload});
        return {acknowledged: true};
      },
    },
    rebalanceCoordinator: {
      resolveOperationOwnerNodeId(operation) {
        const partitionId = operation?.partitionId || operation?.partition_id;
        const targetNodeId =
          operation?.targetNodeId || operation?.target_node_id;
        const sourceNodeId =
          operation?.sourceNodeId || operation?.source_node_id;
        if (operation?.type === OperationType.REPLACE &&
            partitionId === 'sql_write_operations-p1') {
          return targetNodeId;
        }
        return sourceNodeId || null;
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

  await service.handleCdcApplied(null, {
    tableName: 'replica_operations',
    data: {
      operation_id: 'replace-op-remote-cdc-1',
      partition_id: 'sql_write_operations-p1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      workflow_step: WORKFLOW_STEP.PENDING,
      type: OperationType.REPLACE,
      entity_type: 'partition',
      entity_id: 'sql_write_operations-p1',
    },
  });

  t.same(
    enqueueCalls,
    [],
    'CDC replay should not enqueue remote-owned rows onto the local queue',
  );
  t.same(
    deliveries,
    [{
      address: 'node-2/service/replica-dispatch',
      payload: {
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        [ControlPlaneField.OPERATION_ID]: 'replace-op-remote-cdc-1',
        [ControlPlaneField.OPERATION_ROW]: {
          operation_id: 'replace-op-remote-cdc-1',
          type: OperationType.REPLACE,
          partition_id: 'sql_write_operations-p1',
          replica_id: undefined,
          source_node_id: 'node-1',
          target_node_id: 'node-2',
          status: undefined,
          workflow_step: WORKFLOW_STEP.PENDING,
          created_at:
            deliveries[0]?.payload?.[ControlPlaneField.OPERATION_ROW]
              ?.created_at,
          updated_at:
            deliveries[0]?.payload?.[ControlPlaneField.OPERATION_ROW]
              ?.updated_at,
          completed_at: undefined,
          error_message: undefined,
          steps_history: '[]',
          entity_type: 'partition',
          entity_id: 'sql_write_operations-p1',
        },
      },
    }],
    'CDC replay should wake the canonical remote owner for dispatchable rows',
  );

  service.operationDispatchQueue = originalOperationDispatchQueue;
  service.stop();
});
