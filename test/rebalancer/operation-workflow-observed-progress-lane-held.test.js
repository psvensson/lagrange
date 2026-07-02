import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';

const TEST_OPERATION_ID = 'op-observed-progress-lane-held';
const TEST_DISPATCH_WAKE_OPERATION_ID = 'op-observed-dispatch-wake-creating';
const TEST_TRANSITION_GRACE_OPERATION_ID =
  'op-observed-create-progress-transition-grace';
const TEST_PARTITION_ID = 'sql_write_operations-p1';
const TEST_REPLICA_ID = 'sql_write_operations-p1-r4';
const TEST_SOURCE_REPLICA_ID = 'sql_write_operations-p1-r1';
const TEST_SOURCE_NODE_ID = 'node-1';
const TEST_TARGET_NODE_ID = 'node-2';
const TEST_ENTITY_TYPE_PARTITION = 'partition';
const TEST_REPLICA_OPERATIONS_TABLE = 'replica_operations';
const TEST_SERVICES_TABLE = 'services';
const TEST_CACHE_OPERATION_UPSERT = 'UPSERT';
const TEST_UPDATE_OPERATION_SQL_PREFIX = 'UPDATE replica_operations SET';
const TEST_SELECT_SERVICE_ID_FRAGMENT = 'WHERE service_id = ?';
const TEST_SELECT_PARTITION_NODE_FRAGMENT =
  'WHERE partition_id = ? AND node_id = ?';
const TEST_RAFT_ROLE_FOLLOWER = 'follower';
const TEST_RAFT_ROLE_LEARNER = 'learner';
const TEST_EMPTY_VALUE = null;
const TEST_MIN_REPLICA_COUNT = 3;
const TEST_CREATED_AT_LAG_MS = 5000;
const TEST_UPDATED_AT_LAG_MS = 1000;
const TEST_TRANSITION_GRACE_DELAY_MS = 10000;
const TEST_INITIAL_TIMER_ID = 1;
const TEST_NO_AFFECTED_ROWS = 0;
const TEST_ONE_AFFECTED_ROW = 1;
const TEST_FIRST_TIMER_INDEX = 0;
const TEST_OPERATION_UPDATE_PARAM_INDEX = Object.freeze({
  STATUS: 0,
  WORKFLOW_STEP: 1,
  UPDATED_AT: 2,
  COMPLETED_AT: 3,
  ERROR_MESSAGE: 4,
  STEPS_HISTORY: 5,
  REPLICA_ID: 6,
});
const TEST_READ_SOURCE_LOCAL_PARTITION_REPLICA = 'local_partition_replica';
const TEST_REPLICA_OPERATION_INITIATED_STATUS = 'initiated';
const TEST_LANE_HELD_RETRY_TEST_NAME =
  'observed target creating is retried when owner lane is held';
const TEST_DISPATCH_WAKE_TEST_NAME =
  'SENDING dispatch wake reconciles cached target creating before create';
const TEST_TRANSITION_GRACE_TEST_NAME =
  'timeout re-entry reconciles CREATING priority REPLACE from cached ' +
  'active learner target while transition grace is active';
const TEST_MESSAGE_LANE_HELD_RETRY_SCHEDULED =
  'lane-held observed progress should schedule a retry';
const TEST_MESSAGE_LANE_HELD_NO_DURABLE_PROGRESS =
  'lane-held observed progress should not coalesce into durable progress';
const TEST_MESSAGE_RETRY_ADVANCES_TO_CREATING =
  'retry after the owner lane clears should advance durable progress';
const TEST_MESSAGE_RETRY_PERSISTS_CREATING =
  'retry after the owner lane clears should persist creating status';
const TEST_MESSAGE_OBSERVED_CREATING_NO_DISPATCH =
  'observed creating progress should not replay create dispatch';
const TEST_MESSAGE_RETRY_USES_LOCAL_STATUS =
  'retry should reconcile through local target status observation';
const TEST_MESSAGE_DISPATCH_WAKE_SUCCESS =
  'dispatch wake should report progress from cached target creating';
const TEST_MESSAGE_DISPATCH_WAKE_CREATING =
  'dispatch wake should advance SENDING to CREATING';
const TEST_MESSAGE_DISPATCH_WAKE_PERSISTS_CREATING =
  'dispatch wake should persist creating status';
const TEST_MESSAGE_DISPATCH_WAKE_NO_REPLAY =
  'dispatch wake should reconcile before replaying create dispatch';
const TEST_MESSAGE_TRANSITION_GRACE_ACTIVE =
  'the operation should begin under transition retry grace';
const TEST_MESSAGE_ACTIVE_LEARNER_OBSERVED =
  'the cached active learner target should be observed as target progress';
const TEST_MESSAGE_TRANSITION_GRACE_SYNCING =
  'transition-grace timeout re-entry should advance CREATING to SYNCING';
const TEST_MESSAGE_TRANSITION_GRACE_PERSISTS_SYNCING =
  'transition-grace timeout re-entry should persist syncing status';
const TEST_MESSAGE_TRANSITION_GRACE_NO_DISPATCH =
  'observed target progress should reconcile without replaying dispatch';

function buildTransactionCoordinator() {
  return {
    async begin() {
      return {success: true};
    },
    async commit() {
      return {success: true};
    },
    async rollback() {
      return {success: true};
    },
  };
}

function buildSendingOperationRow(operationId, nowMs) {
  return {
    operation_id: operationId,
    type: OperationType.REPLACE,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: ReplicaStatus.PENDING,
    workflow_step: WORKFLOW_STEP.SENDING,
    created_at: nowMs - TEST_CREATED_AT_LAG_MS,
    updated_at: nowMs - TEST_UPDATED_AT_LAG_MS,
    completed_at: TEST_EMPTY_VALUE,
    error_message: TEST_EMPTY_VALUE,
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_PARTITION_ID,
    steps_history: JSON.stringify([{
      step: WORKFLOW_STEP.PENDING,
      timestamp: nowMs - TEST_CREATED_AT_LAG_MS,
      sourceReplicaId: TEST_SOURCE_REPLICA_ID,
    }, {
      step: WORKFLOW_STEP.SENDING,
      timestamp: nowMs - TEST_UPDATED_AT_LAG_MS,
    }]),
  };
}

function buildCreatingOperationRow(operationId, nowMs) {
  return {
    operation_id: operationId,
    type: OperationType.REPLACE,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: ReplicaStatus.CREATING,
    workflow_step: WORKFLOW_STEP.CREATING,
    created_at: nowMs - TEST_CREATED_AT_LAG_MS,
    updated_at: nowMs - TEST_UPDATED_AT_LAG_MS,
    completed_at: TEST_EMPTY_VALUE,
    error_message: TEST_EMPTY_VALUE,
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_PARTITION_ID,
    steps_history: JSON.stringify([{
      step: WORKFLOW_STEP.PENDING,
      timestamp: nowMs - TEST_CREATED_AT_LAG_MS,
      sourceReplicaId: TEST_SOURCE_REPLICA_ID,
    }, {
      step: WORKFLOW_STEP.SENDING,
      timestamp: nowMs - TEST_UPDATED_AT_LAG_MS,
    }, {
      step: WORKFLOW_STEP.CREATING,
      timestamp: nowMs - TEST_UPDATED_AT_LAG_MS,
    }]),
  };
}

function buildObservedServiceRow({
  status = ReplicaStatus.CREATING,
  raftRole = TEST_RAFT_ROLE_FOLLOWER,
} = {}) {
  return {
    service_id: TEST_REPLICA_ID,
    replica_id: TEST_REPLICA_ID,
    partition_id: TEST_PARTITION_ID,
    node_id: TEST_TARGET_NODE_ID,
    service_type: TEST_ENTITY_TYPE_PARTITION,
    status,
    raft_role: raftRole,
    address: `${TEST_TARGET_NODE_ID}/partition/${TEST_REPLICA_ID}`,
  };
}

function buildCreatingServiceRow() {
  return buildObservedServiceRow();
}

function buildActiveLearnerServiceRow() {
  return buildObservedServiceRow({
    status: ReplicaStatus.ACTIVE,
    raftRole: TEST_RAFT_ROLE_LEARNER,
  });
}

function applyOperationUpdate(operationRow, params) {
  operationRow.status = params[TEST_OPERATION_UPDATE_PARAM_INDEX.STATUS];
  operationRow.workflow_step =
    params[TEST_OPERATION_UPDATE_PARAM_INDEX.WORKFLOW_STEP];
  operationRow.updated_at =
    params[TEST_OPERATION_UPDATE_PARAM_INDEX.UPDATED_AT];
  operationRow.completed_at =
    params[TEST_OPERATION_UPDATE_PARAM_INDEX.COMPLETED_AT];
  operationRow.error_message =
    params[TEST_OPERATION_UPDATE_PARAM_INDEX.ERROR_MESSAGE];
  operationRow.steps_history =
    params[TEST_OPERATION_UPDATE_PARAM_INDEX.STEPS_HISTORY];
  operationRow.replica_id =
    params[TEST_OPERATION_UPDATE_PARAM_INDEX.REPLICA_ID];
}

function createObservedProgressCoordinator({
  operationRow,
  serviceRow,
  scheduledTimers = [],
  dispatchedMessages = [],
  authoritativeReadCalls = [],
} = {}) {
  let nextTimerId = TEST_INITIAL_TIMER_ID;
  const cdcIntegrationService = {
    async waitForCacheUpdate() {},
    async executeAuthoritativeSystemTableRead(
      tableName,
      sql,
      params,
      options = {},
    ) {
      authoritativeReadCalls.push({
        tableName,
        sql: String(sql),
        params: [...(Array.isArray(params) ? params : [])],
        options: {...options},
      });

      if (tableName === TEST_REPLICA_OPERATIONS_TABLE) {
        return {
          success: true,
          source: TEST_READ_SOURCE_LOCAL_PARTITION_REPLICA,
          rows: [{...operationRow}],
        };
      }

      if (tableName === TEST_SERVICES_TABLE) {
        if (String(sql).includes(TEST_SELECT_SERVICE_ID_FRAGMENT)) {
          return {
            success: true,
            source: TEST_READ_SOURCE_LOCAL_PARTITION_REPLICA,
            rows: [{...serviceRow}],
          };
        }
        if (String(sql).includes(TEST_SELECT_PARTITION_NODE_FRAGMENT)) {
          return {
            success: true,
            source: TEST_READ_SOURCE_LOCAL_PARTITION_REPLICA,
            rows:
              serviceRow.partition_id === params?.[0] &&
              serviceRow.node_id === params?.[1] ?
                [{...serviceRow}] :
                [],
          };
        }
      }

      return {
        success: true,
        source: TEST_READ_SOURCE_LOCAL_PARTITION_REPLICA,
        rows: [],
      };
    },
  };

  return new RebalanceCoordinator({
    nodeId: TEST_TARGET_NODE_ID,
    transactionCoordinator: buildTransactionCoordinator(),
    sqlQueryEngine: {
      async executeQuery() {
        return {
          success: true,
          rows: [],
          affectedRows: TEST_NO_AFFECTED_ROWS,
        };
      },
    },
    systemTableCache: {
      get(tableName, key) {
        if (tableName === TEST_REPLICA_OPERATIONS_TABLE) {
          return key === operationRow.operation_id ?
            operationRow :
            TEST_EMPTY_VALUE;
        }
        if (tableName === TEST_SERVICES_TABLE) {
          return key === serviceRow.service_id ?
            serviceRow :
            TEST_EMPTY_VALUE;
        }
        return TEST_EMPTY_VALUE;
      },
      getAll(tableName) {
        if (tableName === TEST_REPLICA_OPERATIONS_TABLE) {
          return [operationRow];
        }
        if (tableName === TEST_SERVICES_TABLE) {
          return [serviceRow];
        }
        return [];
      },
      filter(tableName, predicate) {
        return this.getAll(tableName).filter(predicate);
      },
    },
    cdcIntegrationService,
    controlPlaneSystemTableGateway: {
      async readRows(tableName, sql, params = [], options = {}) {
        return cdcIntegrationService.executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
          options,
        );
      },
      async readAuthoritativeRows(tableName, sql, params = [], options = {}) {
        return cdcIntegrationService.executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
          options,
        );
      },
      async executeQuery(sql, params = []) {
        if (String(sql).startsWith(TEST_UPDATE_OPERATION_SQL_PREFIX)) {
          applyOperationUpdate(operationRow, params);
          return {
            success: true,
            affectedRows: TEST_ONE_AFFECTED_ROW,
          };
        }
        return {
          success: true,
          rows: [],
          affectedRows: TEST_NO_AFFECTED_ROWS,
        };
      },
    },
    messageRouter: {
      async deliver(target, request) {
        dispatchedMessages.push({target, request});
        return {
          acknowledged: true,
          status: TEST_REPLICA_OPERATION_INITIATED_STATUS,
        };
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    enableTimeouts: false,
    setTimeoutFn(callback, delayMs) {
      const timer = {
        id: nextTimerId++,
        callback,
        delayMs,
      };
      scheduledTimers.push(timer);
      return timer;
    },
    clearTimeoutFn(timer) {
      if (timer) {
        timer.cleared = true;
      }
    },
  });
}

test(TEST_LANE_HELD_RETRY_TEST_NAME,
  async (t) => {
    const nowMs = Date.now();
    const operationRow = buildSendingOperationRow(TEST_OPERATION_ID, nowMs);
    const serviceRow = buildCreatingServiceRow();
    const scheduledTimers = [];
    const dispatchedMessages = [];
    const authoritativeReadCalls = [];
    const coordinator = createObservedProgressCoordinator({
      operationRow,
      serviceRow,
      scheduledTimers,
      dispatchedMessages,
      authoritativeReadCalls,
    });

    coordinator.initialize();
    try {
      const ownerKey =
        coordinator.workflowOwner.getOperationOwnerSingleFlightKey(
          TEST_OPERATION_ID,
        );
      coordinator.workflowOwner.operationWorkflowCoordinator
        .inFlightExecutionsByOwnerKey.set(ownerKey, Promise.resolve());

      coordinator.handleObservedReplicaStateChange(
        TEST_SERVICES_TABLE,
        TEST_CACHE_OPERATION_UPSERT,
        serviceRow,
      );
      await new Promise((resolve) => setImmediate(resolve));

      t.equal(
        scheduledTimers.length,
        TEST_ONE_AFFECTED_ROW,
        TEST_MESSAGE_LANE_HELD_RETRY_SCHEDULED,
      );
      t.equal(
        operationRow.workflow_step,
        WORKFLOW_STEP.SENDING,
        TEST_MESSAGE_LANE_HELD_NO_DURABLE_PROGRESS,
      );

      coordinator.workflowOwner.operationWorkflowCoordinator
        .inFlightExecutionsByOwnerKey.delete(ownerKey);
      await scheduledTimers[TEST_FIRST_TIMER_INDEX].callback();
      await new Promise((resolve) => setImmediate(resolve));

      t.equal(
        operationRow.workflow_step,
        WORKFLOW_STEP.CREATING,
        TEST_MESSAGE_RETRY_ADVANCES_TO_CREATING,
      );
      t.equal(
        operationRow.status,
        ReplicaStatus.CREATING,
        TEST_MESSAGE_RETRY_PERSISTS_CREATING,
      );
      t.same(
        dispatchedMessages,
        [],
        TEST_MESSAGE_OBSERVED_CREATING_NO_DISPATCH,
      );
      t.ok(
        authoritativeReadCalls.some((call) =>
          call.tableName === TEST_SERVICES_TABLE &&
          call.options.authoritativeReadMode ===
            CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
        ),
        TEST_MESSAGE_RETRY_USES_LOCAL_STATUS,
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test(TEST_DISPATCH_WAKE_TEST_NAME,
  async (t) => {
    const nowMs = Date.now();
    const operationRow = buildSendingOperationRow(
      TEST_DISPATCH_WAKE_OPERATION_ID,
      nowMs,
    );
    const serviceRow = buildCreatingServiceRow();
    const dispatchedMessages = [];
    const coordinator = createObservedProgressCoordinator({
      operationRow,
      serviceRow,
      dispatchedMessages,
    });

    coordinator.initialize();
    try {
      const result = await coordinator.dispatchOperation(operationRow);

      t.equal(
        result.success,
        true,
        TEST_MESSAGE_DISPATCH_WAKE_SUCCESS,
      );
      t.equal(
        operationRow.workflow_step,
        WORKFLOW_STEP.CREATING,
        TEST_MESSAGE_DISPATCH_WAKE_CREATING,
      );
      t.equal(
        operationRow.status,
        ReplicaStatus.CREATING,
        TEST_MESSAGE_DISPATCH_WAKE_PERSISTS_CREATING,
      );
      t.same(
        dispatchedMessages,
        [],
        TEST_MESSAGE_DISPATCH_WAKE_NO_REPLAY,
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test(TEST_TRANSITION_GRACE_TEST_NAME,
  async (t) => {
    const nowMs = Date.now();
    const operationRow = buildCreatingOperationRow(
      TEST_TRANSITION_GRACE_OPERATION_ID,
      nowMs,
    );
    const serviceRow = buildActiveLearnerServiceRow();
    const dispatchedMessages = [];
    const coordinator = createObservedProgressCoordinator({
      operationRow,
      serviceRow,
      dispatchedMessages,
    });

    coordinator.initialize();
    try {
      const operation = coordinator.repository.rowToOperation(operationRow);
      coordinator.workflowOwner.recordTransitionRetryGrace(
        operation.operationId,
        {
          workflowStep: operation.workflowStep,
          partitionId: operation.partitionId,
          updatedAt: operation.updatedAt,
          createdAt: operation.createdAt,
        },
        TEST_TRANSITION_GRACE_DELAY_MS,
      );

      t.equal(
        coordinator.workflowOwner.hasActiveTransitionRetryGrace(
          operation.operationId,
          nowMs,
        ),
        true,
        TEST_MESSAGE_TRANSITION_GRACE_ACTIVE,
      );
      t.equal(
        coordinator.workflowOwner.hasObservedOperationRowTargetProgress(
          operation,
        ),
        true,
        TEST_MESSAGE_ACTIVE_LEARNER_OBSERVED,
      );

      await coordinator.workflowOwner.reconcileTimeoutOperation(operation, nowMs);

      t.equal(
        operationRow.workflow_step,
        WORKFLOW_STEP.SYNCING,
        TEST_MESSAGE_TRANSITION_GRACE_SYNCING,
      );
      t.equal(
        operationRow.status,
        ReplicaStatus.SYNCING,
        TEST_MESSAGE_TRANSITION_GRACE_PERSISTS_SYNCING,
      );
      t.same(
        dispatchedMessages,
        [],
        TEST_MESSAGE_TRANSITION_GRACE_NO_DISPATCH,
      );
    } finally {
      await coordinator.shutdown();
    }
  });
