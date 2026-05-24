import {test} from '../../src/test-helpers/tap.js';
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
  NODE_CAPABILITY,
  NUM,
  SERVICE_STATUS,
  STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  createService,
  initEnv,
} from './replica-dispatch-node-state-update.test-part-4-fixtures.js';

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
