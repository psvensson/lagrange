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
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  COLUMN,
  NODE_CAPABILITY,
  NUM,
  SERVICE_STATUS,
  STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';

const HEARTBEAT_READY_CAPABILITY_TEST_NAME =
  'ReplicaDispatchService heartbeat-only READY updates explicit capabilities';
const HEARTBEAT_READY_CAPABILITY_NODE_ID = 'node-heartbeat-capability-ready';
const HEARTBEAT_READY_CAPABILITY_NODE_ADDRESS = 'localhost:19190';
const HEARTBEAT_READY_CAPABILITY_EXISTING_JSON = '[]';
const HEARTBEAT_READY_CAPABILITY_LAST_HEARTBEAT = 1;
const HEARTBEAT_READY_CAPABILITY_EXPIRED_LEASE = 2;
const HEARTBEAT_READY_CAPABILITY_AT = 3;
const HEARTBEAT_READY_CAPABILITY_LEASE_EXPIRES_AT = 4;
const HEARTBEAT_READY_CAPABILITY_VALUES = Object.freeze([
  NODE_CAPABILITY.PARTITION_REPLICA,
  NODE_CAPABILITY.MESSAGE_GROUP_REPLICA,
]);
const HEARTBEAT_READY_CAPABILITY_JSON =
  JSON.stringify(HEARTBEAT_READY_CAPABILITY_VALUES);
const HEARTBEAT_READY_CAPABILITY_UPDATE_COUNT = 1;
const HEARTBEAT_READY_CAPABILITY_ASSERT_UPDATE =
  'heartbeat-only READY should persist one nodes update';
const HEARTBEAT_READY_CAPABILITY_ASSERT_CAPABILITIES =
  'heartbeat-only READY should not leave replica capabilities empty';
const CREATING_REARM_REPLAY_TEST_NAME =
  'ReplicaDispatchService replays CREATING system-table rows through the ' +
  'coordinator owner path';
const CREATING_REARM_REPLAY_OPERATION_ID =
  'replace-op-dispatch-creating-1';
const CREATING_REARM_REPLAY_PARTITION_ID =
  'control_plane_publications-p1';
const CREATING_REARM_REPLAY_REPLICA_ID =
  'control_plane_publications-p1-r6';
const CREATING_REARM_REPLAY_SOURCE_NODE_ID = 'node-2';
const CREATING_REARM_REPLAY_TARGET_NODE_ID = 'node-1';
const CREATING_REARM_REPLAY_STATUS = 'creating';
const CREATING_REARM_REPLAY_STEPS_HISTORY_JSON = '[]';
const CREATING_REARM_REPLAY_CREATED_AT = 1700000000000;
const CREATING_REARM_REPLAY_UPDATED_AT = 1700000000500;
const CREATING_REARM_REPLAY_DISPATCH_COUNT = 1;
const CREATING_REARM_REPLAY_ASSERT_DISPATCHED =
  'reconcile should replay CREATING rearm rows instead of dropping them';
const CREATING_REARM_REPLAY_ASSERT_OPERATION_ID =
  'CREATING rearm replay should preserve the operation id';
const CREATING_REARM_REPLAY_ASSERT_WORKFLOW_STEP =
  'CREATING rearm replay should preserve the workflow step';
const AUTHORITATIVE_CREATING_RETRY_TEST_NAME =
  'ReplicaDispatchService keeps authoritative CREATING system-table retry rows';
const AUTHORITATIVE_CREATING_RETRY_QUERY_COUNT = 1;
const AUTHORITATIVE_CREATING_RETRY_ASSERT_QUERY =
  'authoritative retry discovery should query the repository owner path';
const AUTHORITATIVE_CREATING_RETRY_ASSERT_ROW =
  'authoritative CREATING system-table rows should remain retryable';
const DIRECT_WAKEUP_RETRY_TEST_NAME =
  'ReplicaDispatchService retries bounded remote direct dispatch wake-ups';
const DIRECT_WAKEUP_VERIFICATION_TEST_NAME =
  'ReplicaDispatchService verifies acknowledged remote direct wake-ups';
const DIRECT_WAKEUP_RETRY_OPERATION_ID = 'op-remote-wakeup-retry-1';
const DIRECT_WAKEUP_VERIFICATION_OPERATION_ID =
  'op-remote-wakeup-verification-1';
const DIRECT_WAKEUP_RETRY_PARTITION_ID = 'control_plane_publications-p1';
const DIRECT_WAKEUP_RETRY_REPLICA_ID = 'control_plane_publications-p1-r4';
const DIRECT_WAKEUP_RETRY_SOURCE_NODE_ID = 'node-1';
const DIRECT_WAKEUP_RETRY_TARGET_NODE_ID = 'node-2';
const DIRECT_WAKEUP_RETRY_TARGET_ADDRESS =
  'node-2/service/replica-dispatch';
const DIRECT_WAKEUP_RETRY_STEPS_HISTORY_JSON = '[]';
const DIRECT_WAKEUP_RETRY_CREATED_AT = 1700000000000;
const DIRECT_WAKEUP_RETRY_UPDATED_AT = 1700000000100;
const DIRECT_WAKEUP_RETRY_TIMEOUT_MS = 17;
const DIRECT_WAKEUP_RETRY_AFTER_MS = 23;
const DIRECT_WAKEUP_RETRY_DELIVERY_SOURCE =
  'coordinator_created_remote_handoff';
const DIRECT_WAKEUP_RETRY_DELIVERY_PRIORITY = 'critical';
const DIRECT_WAKEUP_RETRY_ERROR = 'Message timeout';
const DIRECT_WAKEUP_RETRY_EXPECTED_SINGLE_CALL = 1;
const DIRECT_WAKEUP_RETRY_EXPECTED_TWO_CALLS = 2;
const DIRECT_WAKEUP_RETRY_REFRESH_ROW_BEFORE_DISPATCH =
  'refreshRowBeforeDispatch';
const DIRECT_WAKEUP_RETRY_ASSERT_FIRST_DELIVERY =
  'initial remote wake-up should use bounded target-owner delivery';
const DIRECT_WAKEUP_RETRY_ASSERT_RETRY_ARMED =
  'retryable remote wake-up failure should stay on the dispatch retry lane';
const DIRECT_WAKEUP_RETRY_ASSERT_RETRY_DELAY =
  'remote wake-up retry should honor the transport retry-after';
const DIRECT_WAKEUP_RETRY_ASSERT_RETRY_REENTRY =
  'retry timer should re-enter the remote direct wake-up path';
const DIRECT_WAKEUP_RETRY_ASSERT_RETRY_CLEARED =
  'successful remote wake-up retry should clear the deferred dispatch slot';
const DIRECT_WAKEUP_RETRY_ASSERT_VERIFICATION_ARMED =
  'successful remote wake-up retry should arm a verification dispatch slot';
const DIRECT_WAKEUP_VERIFICATION_ASSERT_TIMER =
  'acknowledged remote wake-up should arm a source-side verification timer';
const DIRECT_WAKEUP_VERIFICATION_ASSERT_REENTRY =
  'verification timer should refresh the row before re-waking the remote owner';

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
    replicaOperationDispatchTimeoutMs:
      options.replicaOperationDispatchTimeoutMs,
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

test(HEARTBEAT_READY_CAPABILITY_TEST_NAME, async (t) => {
  initEnv();

  const updateCalls = [];
  const service = createService({
    cacheNode: {
      [COLUMN.NODE_ID]: HEARTBEAT_READY_CAPABILITY_NODE_ID,
      [COLUMN.NODE_ADDRESS]: HEARTBEAT_READY_CAPABILITY_NODE_ADDRESS,
      status: SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.CAPABILITIES]: HEARTBEAT_READY_CAPABILITY_EXISTING_JSON,
      [COLUMN.LAST_HEARTBEAT]: HEARTBEAT_READY_CAPABILITY_LAST_HEARTBEAT,
      [COLUMN.READY_LEASE_EXPIRES_AT]:
        HEARTBEAT_READY_CAPABILITY_EXPIRED_LEASE,
    },
    cdcIntegrationService: {
      updateSystemTableRow: async (...args) => {
        updateCalls.push(args);
        return {partitionResult: {affectedRows: NUM.ONE}};
      },
      upsertSystemTableRow: async () => ({success: true}),
    },
  });

  try {
    await service.handleNodeStateUpdate({
      type: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: HEARTBEAT_READY_CAPABILITY_NODE_ID,
      [ControlPlaneField.NODE_ADDRESS]: HEARTBEAT_READY_CAPABILITY_NODE_ADDRESS,
      [ControlPlaneField.STATE]: STATE.READY,
      [ControlPlaneField.CAPABILITIES]: HEARTBEAT_READY_CAPABILITY_VALUES,
      [ControlPlaneField.HEARTBEAT_AT]: HEARTBEAT_READY_CAPABILITY_AT,
      [ControlPlaneField.READY_LEASE_EXPIRES_AT]:
        HEARTBEAT_READY_CAPABILITY_LEASE_EXPIRES_AT,
      [ControlPlaneField.HEARTBEAT_ONLY]: true,
    });

    t.equal(
      updateCalls.length,
      HEARTBEAT_READY_CAPABILITY_UPDATE_COUNT,
      HEARTBEAT_READY_CAPABILITY_ASSERT_UPDATE,
    );
    t.equal(
      updateCalls[NUM.ZERO]?.[NUM.TWO]?.[COLUMN.CAPABILITIES],
      HEARTBEAT_READY_CAPABILITY_JSON,
      HEARTBEAT_READY_CAPABILITY_ASSERT_CAPABILITIES,
    );
  } finally {
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

test(CREATING_REARM_REPLAY_TEST_NAME, async (t) => {
  initEnv();

  const dispatchCalls = [];
  const operationRow = {
    operation_id: CREATING_REARM_REPLAY_OPERATION_ID,
    partition_id: CREATING_REARM_REPLAY_PARTITION_ID,
    replica_id: CREATING_REARM_REPLAY_REPLICA_ID,
    source_node_id: CREATING_REARM_REPLAY_SOURCE_NODE_ID,
    target_node_id: CREATING_REARM_REPLAY_TARGET_NODE_ID,
    status: CREATING_REARM_REPLAY_STATUS,
    workflow_step: WORKFLOW_STEP.CREATING,
    type: OperationType.REPLACE,
    steps_history: CREATING_REARM_REPLAY_STEPS_HISTORY_JSON,
    created_at: CREATING_REARM_REPLAY_CREATED_AT,
    updated_at: CREATING_REARM_REPLAY_UPDATED_AT,
  };

  const service = createService({
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    rebalanceCoordinator: {
      async dispatchOperation(operation) {
        dispatchCalls.push(operation);
        return {success: true};
      },
      isOperationLocallyOwned(operation) {
        return operation?.target_node_id ===
          CREATING_REARM_REPLAY_TARGET_NODE_ID ||
          operation?.targetNodeId === CREATING_REARM_REPLAY_TARGET_NODE_ID;
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
      CREATING_REARM_REPLAY_DISPATCH_COUNT,
      CREATING_REARM_REPLAY_ASSERT_DISPATCHED,
    );
    t.equal(
      dispatchCalls[NUM.ZERO]?.operationId,
      CREATING_REARM_REPLAY_OPERATION_ID,
      CREATING_REARM_REPLAY_ASSERT_OPERATION_ID,
    );
    t.equal(
      dispatchCalls[NUM.ZERO]?.workflowStep,
      WORKFLOW_STEP.CREATING,
      CREATING_REARM_REPLAY_ASSERT_WORKFLOW_STEP,
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService enqueues CREATING system-table cache replay',
  async (t) => {
    initEnv();

    const dispatchCalls = [];
    const operationRow = {
      operation_id: CREATING_REARM_REPLAY_OPERATION_ID,
      partition_id: CREATING_REARM_REPLAY_PARTITION_ID,
      replica_id: CREATING_REARM_REPLAY_REPLICA_ID,
      source_node_id: CREATING_REARM_REPLAY_SOURCE_NODE_ID,
      target_node_id: CREATING_REARM_REPLAY_TARGET_NODE_ID,
      status: CREATING_REARM_REPLAY_STATUS,
      workflow_step: WORKFLOW_STEP.CREATING,
      type: OperationType.REPLACE,
      steps_history: CREATING_REARM_REPLAY_STEPS_HISTORY_JSON,
      created_at: CREATING_REARM_REPLAY_CREATED_AT,
      updated_at: CREATING_REARM_REPLAY_UPDATED_AT,
    };

    const service = createService({
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true}),
        upsertSystemTableRow: async () => ({success: true}),
      },
      rebalanceCoordinator: {
        async dispatchOperation(operation) {
          dispatchCalls.push(operation);
          return {success: true};
        },
        isOperationLocallyOwned(operation) {
          return operation?.target_node_id ===
            CREATING_REARM_REPLAY_TARGET_NODE_ID ||
            operation?.targetNodeId === CREATING_REARM_REPLAY_TARGET_NODE_ID;
        },
      },
    });

    try {
      t.equal(
        service.replayReplicaOperationRow(operationRow, {
          pendingReason: RECONCILE_REASON.REPLICA_OPERATIONS_CACHE_PENDING,
          replaceActiveReason:
            RECONCILE_REASON.REPLICA_OPERATIONS_CACHE_REPLACE_ACTIVE,
        }),
        true,
        CREATING_REARM_REPLAY_ASSERT_DISPATCHED,
      );

      await new Promise((resolve) => setImmediate(resolve));

      t.equal(
        dispatchCalls.length,
        CREATING_REARM_REPLAY_DISPATCH_COUNT,
        CREATING_REARM_REPLAY_ASSERT_DISPATCHED,
      );
      t.equal(
        dispatchCalls[NUM.ZERO]?.operationId,
        CREATING_REARM_REPLAY_OPERATION_ID,
        CREATING_REARM_REPLAY_ASSERT_OPERATION_ID,
      );
      t.equal(
        dispatchCalls[NUM.ZERO]?.workflowStep,
        WORKFLOW_STEP.CREATING,
        CREATING_REARM_REPLAY_ASSERT_WORKFLOW_STEP,
      );
    } finally {
      service.stop();
    }
  });

test(AUTHORITATIVE_CREATING_RETRY_TEST_NAME, async (t) => {
  initEnv();

  const queryOptions = [];
  const service = createService({
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    rebalanceCoordinator: {
      repository: {
        async queryIncompleteOperations(options) {
          queryOptions.push(options);
          return [{
            operationId: CREATING_REARM_REPLAY_OPERATION_ID,
            partitionId: CREATING_REARM_REPLAY_PARTITION_ID,
            replicaId: CREATING_REARM_REPLAY_REPLICA_ID,
            sourceNodeId: CREATING_REARM_REPLAY_SOURCE_NODE_ID,
            targetNodeId: CREATING_REARM_REPLAY_TARGET_NODE_ID,
            status: CREATING_REARM_REPLAY_STATUS,
            workflowStep: WORKFLOW_STEP.CREATING,
            type: OperationType.REPLACE,
            stepsHistory: [],
            createdAt: CREATING_REARM_REPLAY_CREATED_AT,
            updatedAt: CREATING_REARM_REPLAY_UPDATED_AT,
          }];
        },
      },
      isOperationLocallyOwned(operation) {
        return operation?.targetNodeId === CREATING_REARM_REPLAY_TARGET_NODE_ID;
      },
    },
  });

  try {
    const dispatchRows = await service.getAuthoritativeDispatchRetryRowsForNode(
      CREATING_REARM_REPLAY_TARGET_NODE_ID,
    );

    t.equal(
      queryOptions.length,
      AUTHORITATIVE_CREATING_RETRY_QUERY_COUNT,
      AUTHORITATIVE_CREATING_RETRY_ASSERT_QUERY,
    );
    t.match(
      dispatchRows,
      [{
        operation_id: CREATING_REARM_REPLAY_OPERATION_ID,
        partition_id: CREATING_REARM_REPLAY_PARTITION_ID,
        target_node_id: CREATING_REARM_REPLAY_TARGET_NODE_ID,
        workflow_step: WORKFLOW_STEP.CREATING,
      }],
      AUTHORITATIVE_CREATING_RETRY_ASSERT_ROW,
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

test('ReplicaDispatchService uses recovery eligibility for critical ' +
  'system-table dispatches', async (t) => {
  initEnv();

  const TARGET_NODE_ID = 'node-2';
  const SOURCE_NODE_ID = 'node-1';
  const OPERATION_ID = 'op-critical-recovery-dispatch-1';
  const PARTITION_ID = 'sql_write_operations-p1';
  const REPLICA_ID = 'sql_write_operations-p1-r4';
  const OPERATION_STATUS = 'pending';
  const EMPTY_STEPS_HISTORY = '[]';

  const authoritativeCalls = [];
  let dispatchCalls = NUM.ZERO;
  const operationRow = {
    operation_id: OPERATION_ID,
    type: OperationType.REPLACE,
    partition_id: PARTITION_ID,
    replica_id: REPLICA_ID,
    source_node_id: SOURCE_NODE_ID,
    target_node_id: TARGET_NODE_ID,
    status: OPERATION_STATUS,
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: EMPTY_STEPS_HISTORY,
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId, options) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
          },
          decisionDimension: options?.decisionDimension,
          reasons: [],
        };
      },
      async getNodeReadiness(nodeId, options) {
        authoritativeCalls.push({nodeId, options});
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
          },
          decisionDimension: options?.decisionDimension,
          reasons: [],
        };
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += NUM.ONE;
        return {success: true};
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
  });

  try {
    await service.dispatchOperationRow(operationRow);

    t.equal(
      dispatchCalls,
      NUM.ONE,
      'critical system-table dispatch should proceed on recovery eligibility',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      NUM.ZERO,
      'recovery-eligible critical dispatch should not defer as not-ready',
    );
    t.same(
      authoritativeCalls[NUM.ZERO],
      {
        nodeId: TARGET_NODE_ID,
        options: {
          allowAuthoritativeRefresh: true,
          decisionDimension:
            CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE,
          maxCachedAgeMs: NUM.ZERO,
        },
      },
      'critical dispatch readiness should refresh the recovery dimension',
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

test('ReplicaDispatchService dispatches same-node operations through the ' +
  'local handler capability snapshot', async (t) => {
  initEnv();

  const LOCAL_NODE_ID = 'node-1';
  const LOCAL_PARTITION_ID = 'split-child-p1';
  const LOCAL_REPLICA_ID = 'split-child-p1-r1';
  const LOCAL_OPERATION_ID = 'op-local-handler-ready-1';
  const LOCAL_SERVICE_ID = 'partition-service-local-1';
  const LOCAL_ENTITY_TYPE = 'partition';
  const LOCAL_READY_REASON = 'control_plane_publication_pending';

  const scheduled = [];
  const authoritativeCalls = [];
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: LOCAL_OPERATION_ID,
    type: OperationType.ADD,
    partition_id: LOCAL_PARTITION_ID,
    replica_id: LOCAL_REPLICA_ID,
    source_node_id: LOCAL_NODE_ID,
    target_node_id: LOCAL_NODE_ID,
    status: 'pending',
    workflow_step: WORKFLOW_STEP.SENDING,
    entity_type: LOCAL_ENTITY_TYPE,
    entity_id: LOCAL_PARTITION_ID,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };

  const service = createService({
    cacheServices: [
      {
        service_id: LOCAL_SERVICE_ID,
        node_id: LOCAL_NODE_ID,
        partition_id: 'services-p1',
        service_type: LOCAL_ENTITY_TYPE,
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
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
          reasons: [{code: LOCAL_READY_REASON}],
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
          reasons: [{code: LOCAL_READY_REASON}],
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
      1,
      'same-node dispatch should proceed when the local handler capability is already active',
    );
    t.equal(
      authoritativeCalls.length,
      0,
      'same-node local-handler dispatch should not perform an authoritative readiness refresh',
    );
    t.equal(
      scheduled.length,
      0,
      'same-node local-handler dispatch should not arm deferred readiness retries',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      NUM.ZERO,
      'same-node local-handler dispatch should not remain queued for retry',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService trusts router-registered same-node handler ' +
  'capability before service-row activation', async (t) => {
  initEnv();

  const LOCAL_NODE_ID = 'node-1';
  const LOCAL_PARTITION_ID = 'split-child-p2';
  const LOCAL_REPLICA_ID = 'split-child-p2-r1';
  const LOCAL_OPERATION_ID = 'op-local-handler-router-ready-1';
  const LOCAL_ENTITY_TYPE = 'partition';
  const LOCAL_HANDLER_ADDRESS = 'node-1/service/replica-handler';
  const LOCAL_READY_REASON = 'control_plane_publication_pending';

  const authoritativeCalls = [];
  const routerRegistrationChecks = [];
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: LOCAL_OPERATION_ID,
    type: OperationType.ADD,
    partition_id: LOCAL_PARTITION_ID,
    replica_id: LOCAL_REPLICA_ID,
    source_node_id: LOCAL_NODE_ID,
    target_node_id: LOCAL_NODE_ID,
    status: 'pending',
    workflow_step: WORKFLOW_STEP.SENDING,
    entity_type: LOCAL_ENTITY_TYPE,
    entity_id: LOCAL_PARTITION_ID,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };

  const service = createService({
    messageRouter: {
      isRegistered(address) {
        routerRegistrationChecks.push(address);
        return address === LOCAL_HANDLER_ADDRESS;
      },
    },
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
          reasons: [{code: LOCAL_READY_REASON}],
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
          reasons: [{code: LOCAL_READY_REASON}],
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
  });

  try {
    await service.dispatchOperationRow(operationRow);

    t.equal(
      dispatchCalls,
      1,
      'same-node dispatch should proceed when the router already owns the local handler capability',
    );
    t.same(
      routerRegistrationChecks,
      [LOCAL_HANDLER_ADDRESS],
      'same-node dispatch should consult the canonical local handler address once',
    );
    t.equal(
      authoritativeCalls.length,
      0,
      'router-registered local capability should bypass authoritative readiness refreshes',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      NUM.ZERO,
      'router-registered local capability should not leave the operation parked for retry',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService ready-node retries reuse ready sync evidence ' +
  'instead of forcing a second authoritative refresh', async (t) => {
  initEnv();

  const readyNode = {
    node_id: 'node-2',
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    last_heartbeat: Date.now(),
    ready_lease_expires_at: Date.now() + 60000,
  };
  const authoritativeCalls = [];
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: 'op-ready-trigger-sync-reuse-1',
    type: OperationType.REPLACE,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r8',
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
        return {
          nodeId,
          observedAt: new Date().toISOString(),
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
          },
          reasons: [{code: 'should_not_run'}],
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
  });

  try {
    await service.dispatchOperationRow(operationRow, {
      readyNodeId: 'node-2',
      readyNodeRow: readyNode,
    });

    t.equal(
      dispatchCalls,
      1,
      'ready-node retries should proceed from the already-observed ready sync evidence',
    );
    t.equal(
      authoritativeCalls.length,
      0,
      'ready-node retries should not force a second authoritative readiness refresh for the same target',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      NUM.ZERO,
      'ready-node sync reuse should not leave the operation parked for another dispatch retry',
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

test(DIRECT_WAKEUP_VERIFICATION_TEST_NAME, async (t) => {
  initEnv();

  const deliveries = [];
  const deferredTimers = [];
  const service = createService({
    operationDispatchRetryAfterMs: DIRECT_WAKEUP_RETRY_AFTER_MS,
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
        t.fail('remote-owned direct wake verification should not dispatch locally');
      },
      isOperationLocallyOwned() {
        return false;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn(handle) {
      if (handle) {
        handle.cleared = true;
      }
    },
  });

  try {
    await service.handleCoordinatorOperationCreated({
      operationId: DIRECT_WAKEUP_VERIFICATION_OPERATION_ID,
      partitionId: DIRECT_WAKEUP_RETRY_PARTITION_ID,
      replicaId: DIRECT_WAKEUP_RETRY_REPLICA_ID,
      type: OperationType.REPLACE,
      workflowStep: WORKFLOW_STEP.PENDING,
      sourceNodeId: DIRECT_WAKEUP_RETRY_SOURCE_NODE_ID,
      targetNodeId: DIRECT_WAKEUP_RETRY_TARGET_NODE_ID,
      createdAt: DIRECT_WAKEUP_RETRY_CREATED_AT,
      updatedAt: DIRECT_WAKEUP_RETRY_UPDATED_AT,
      stepsHistory: [],
    });

    t.equal(
      deliveries.length,
      DIRECT_WAKEUP_RETRY_EXPECTED_SINGLE_CALL,
      DIRECT_WAKEUP_VERIFICATION_ASSERT_TIMER,
    );
    t.equal(
      deferredTimers.length,
      DIRECT_WAKEUP_RETRY_EXPECTED_SINGLE_CALL,
      DIRECT_WAKEUP_VERIFICATION_ASSERT_TIMER,
    );
    t.equal(
      deferredTimers[NUM.ZERO]?.delayMs,
      DIRECT_WAKEUP_RETRY_AFTER_MS,
      DIRECT_WAKEUP_VERIFICATION_ASSERT_TIMER,
    );

    const retryEnqueues = [];
    const originalQueue = service.operationDispatchQueue;
    service.operationDispatchQueue = {
      enqueue(operationId, reason, context) {
        retryEnqueues.push({operationId, reason, context});
      },
      shutdown() {},
    };

    deferredTimers[NUM.ZERO].callback();

    t.same(
      retryEnqueues,
      [{
        operationId: DIRECT_WAKEUP_VERIFICATION_OPERATION_ID,
        reason: RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH,
        context: {
          row: deliveries[NUM.ZERO]?.payload?.[
            ControlPlaneField.OPERATION_ROW
          ],
          [DIRECT_WAKEUP_RETRY_REFRESH_ROW_BEFORE_DISPATCH]: true,
        },
      }],
      DIRECT_WAKEUP_VERIFICATION_ASSERT_REENTRY,
    );

    service.operationDispatchQueue = originalQueue;
  } finally {
    service.stop();
  }
});

test(DIRECT_WAKEUP_RETRY_TEST_NAME, async (t) => {
  initEnv();

  const deliveries = [];
  const deferredTimers = [];
  const service = createService({
    replicaOperationDispatchTimeoutMs: DIRECT_WAKEUP_RETRY_TIMEOUT_MS,
    operationDispatchRetryAfterMs: DIRECT_WAKEUP_RETRY_AFTER_MS,
    messageRouter: {
      async deliver(address, payload, options) {
        deliveries.push({address, payload, options});
        if (deliveries.length === DIRECT_WAKEUP_RETRY_EXPECTED_SINGLE_CALL) {
          return {
            error: DIRECT_WAKEUP_RETRY_ERROR,
            deferRetry: true,
            retryAfterMs: DIRECT_WAKEUP_RETRY_AFTER_MS,
          };
        }
        return {acknowledged: true};
      },
    },
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        t.fail('remote-owned direct wake retry should not dispatch locally');
      },
      isOperationLocallyOwned() {
        return false;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn(handle) {
      if (handle) {
        handle.cleared = true;
      }
    },
  });

  try {
    await service.handleCoordinatorOperationCreated({
      operationId: DIRECT_WAKEUP_RETRY_OPERATION_ID,
      partitionId: DIRECT_WAKEUP_RETRY_PARTITION_ID,
      replicaId: DIRECT_WAKEUP_RETRY_REPLICA_ID,
      type: OperationType.REPLACE,
      workflowStep: WORKFLOW_STEP.PENDING,
      sourceNodeId: DIRECT_WAKEUP_RETRY_SOURCE_NODE_ID,
      targetNodeId: DIRECT_WAKEUP_RETRY_TARGET_NODE_ID,
      createdAt: DIRECT_WAKEUP_RETRY_CREATED_AT,
      updatedAt: DIRECT_WAKEUP_RETRY_UPDATED_AT,
      stepsHistory: [],
    });

    t.equal(
      deliveries.length,
      DIRECT_WAKEUP_RETRY_EXPECTED_SINGLE_CALL,
      DIRECT_WAKEUP_RETRY_ASSERT_FIRST_DELIVERY,
    );
    t.same(
      deliveries[NUM.ZERO],
      {
        address: DIRECT_WAKEUP_RETRY_TARGET_ADDRESS,
        payload: {
          type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
          [ControlPlaneField.OPERATION_ID]: DIRECT_WAKEUP_RETRY_OPERATION_ID,
          [ControlPlaneField.OPERATION_ROW]: {
            operation_id: DIRECT_WAKEUP_RETRY_OPERATION_ID,
            type: OperationType.REPLACE,
            partition_id: DIRECT_WAKEUP_RETRY_PARTITION_ID,
            replica_id: DIRECT_WAKEUP_RETRY_REPLICA_ID,
            source_node_id: DIRECT_WAKEUP_RETRY_SOURCE_NODE_ID,
            target_node_id: DIRECT_WAKEUP_RETRY_TARGET_NODE_ID,
            status: undefined,
            workflow_step: WORKFLOW_STEP.PENDING,
            created_at: DIRECT_WAKEUP_RETRY_CREATED_AT,
            updated_at: DIRECT_WAKEUP_RETRY_UPDATED_AT,
            completed_at: undefined,
            error_message: undefined,
            steps_history: DIRECT_WAKEUP_RETRY_STEPS_HISTORY_JSON,
            entity_type: undefined,
            entity_id: undefined,
          },
        },
        options: {
          targetNodeId: DIRECT_WAKEUP_RETRY_TARGET_NODE_ID,
          timeoutMs: DIRECT_WAKEUP_RETRY_TIMEOUT_MS,
          deliverySource: DIRECT_WAKEUP_RETRY_DELIVERY_SOURCE,
          deliveryPriority: DIRECT_WAKEUP_RETRY_DELIVERY_PRIORITY,
        },
      },
      DIRECT_WAKEUP_RETRY_ASSERT_FIRST_DELIVERY,
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      DIRECT_WAKEUP_RETRY_EXPECTED_SINGLE_CALL,
      DIRECT_WAKEUP_RETRY_ASSERT_RETRY_ARMED,
    );
    t.equal(
      deferredTimers[NUM.ZERO]?.delayMs,
      DIRECT_WAKEUP_RETRY_AFTER_MS,
      DIRECT_WAKEUP_RETRY_ASSERT_RETRY_DELAY,
    );

    let retryPromise = null;
    const retryEnqueues = [];
    const originalQueue = service.operationDispatchQueue;
    service.operationDispatchQueue = {
      enqueue(operationId, reason, context) {
        retryEnqueues.push({operationId, reason, context});
        retryPromise = service.reconcileOperationDispatch(
          operationId,
          context,
        );
      },
      shutdown() {},
    };

    deferredTimers[NUM.ZERO].callback();
    await retryPromise;

    t.same(
      retryEnqueues.map((entry) => ({
        operationId: entry.operationId,
        reason: entry.reason,
      })),
      [{
        operationId: DIRECT_WAKEUP_RETRY_OPERATION_ID,
        reason: RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH,
      }],
      DIRECT_WAKEUP_RETRY_ASSERT_RETRY_REENTRY,
    );
    t.equal(
      deliveries.length,
      DIRECT_WAKEUP_RETRY_EXPECTED_TWO_CALLS,
      DIRECT_WAKEUP_RETRY_ASSERT_RETRY_REENTRY,
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      DIRECT_WAKEUP_RETRY_EXPECTED_SINGLE_CALL,
      DIRECT_WAKEUP_RETRY_ASSERT_VERIFICATION_ARMED,
    );

    service.operationDispatchQueue = originalQueue;
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
