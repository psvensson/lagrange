export function registerPriorityRecoverySnapshotHandoffTimeoutReentryTestCases({registerCase, dependencies}) {
  const {
    NUM, OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES, OPERATION_WORKFLOW_OWNER, PRIORITY_RECOVERY_ACTUATION_STATE, PRIORITY_RECOVERY_BLOCKING_BOUNDARY, PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION, PRIORITY_RECOVERY_OPERATION_OWNER_EFFECT_EXECUTION, PRIORITY_RECOVERY_WAIT_MODE, PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE, TEST_ADVANCE_EFFECT_CAPTURED_AT_REENTRY_TEST_NAME, TEST_ASSERT_ACTIVE_HANDOFF_RETRY_BOUNDED,
    TEST_ASSERT_ACTIVE_HANDOFF_RETRY_NO_INLINE_WAKE, TEST_ASSERT_ACTIVE_HANDOFF_RETRY_TIMER_PRESERVED, TEST_ASSERT_ADVANCE_EFFECT_CAPTURED_AT_TARGET, TEST_ASSERT_ADVANCE_EFFECT_CAPTURED_AT_TIMER, TEST_ASSERT_ADVANCE_EFFECT_CAPTURED_AT_WAKE, TEST_ASSERT_COUNT_ONLY_HANDOFF_NO_DUPLICATE_WAKE, TEST_ASSERT_COUNT_ONLY_HANDOFF_TIMERS_PRESERVED, TEST_ASSERT_COUNT_ONLY_HANDOFF_UNIQUE_RETRIES, TEST_ASSERT_OWNER_LANE_HELD_DEFERS_REENTRY, TEST_ASSERT_OWNER_LANE_HELD_NO_INLINE_WAKE, TEST_ASSERT_OWNER_LANE_HELD_RETRY_WAKES,
    TEST_ASSERT_REPRESENTATIVE_HANDOFF_NO_DUPLICATE_WAKE, TEST_ASSERT_REPRESENTATIVE_HANDOFF_RETRY_BOUNDED, TEST_ASSERT_REPRESENTATIVE_HANDOFF_TIMER_PRESERVED, TEST_ASSERT_RETRY_SCHEDULED_REENTRY_TARGET, TEST_ASSERT_RETRY_SCHEDULED_REENTRY_TIMER, TEST_ASSERT_RETRY_SCHEDULED_REENTRY_WAKES, TEST_ASSERT_SNAPSHOT_REENTRY_ADVANCE_ACTION, TEST_ASSERT_SNAPSHOT_REENTRY_ARMS_RETRY,
    TEST_ASSERT_SNAPSHOT_REENTRY_NOT_TRANSITION_DEFERRED, TEST_ASSERT_SNAPSHOT_REENTRY_PRESERVES_PENDING, TEST_ASSERT_SNAPSHOT_REENTRY_TARGET, TEST_ASSERT_SNAPSHOT_REENTRY_WAKES_REMOTE_OWNER, TEST_AUTHORITATIVE_ONLY_OPERATION_ID, TEST_AUTHORITATIVE_ONLY_PARTITION_ID, TEST_AUTHORITATIVE_ONLY_REPLICA_ID, TEST_CAPTURED_AT_MS,
    TEST_DELIVERY_STATUS_INITIATED, TEST_EMPTY_LIST, TEST_EMPTY_VALUE, TEST_ENTITY_TYPE_PARTITION, TEST_EXPECTED_SENDING_REENTRY_ACTUATION_STATE, TEST_LOCAL_OWNER_PARTITION_ID, TEST_LOCAL_OWNER_REPLICA_ID, TEST_MICROTASK_DELAY_MS,
    TEST_MIN_REPLICA_COUNT, TEST_OBSERVER_NODE_ID, TEST_OPERATION_CREATED_AT_MS, TEST_OPERATION_ID, TEST_OPERATION_TYPE_REPLACE, TEST_PARTITION_ID, TEST_PUBLICATION_COUNT_ONLY_PUBLICATION_OPERATION_ID, TEST_PUBLICATION_COUNT_ONLY_REPLICA_OPERATION_ID,
    TEST_PUBLICATION_COUNT_ONLY_SQL_PARTICIPANT_OPERATION_ID, TEST_PUBLICATION_COUNT_ONLY_SQL_TRANSACTION_OPERATION_ID, TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT, TEST_QUERY_SERVICES_FRAGMENT, TEST_REPLICA_DISPATCH_TARGET, TEST_REPLICA_HANDLER_DISPATCH_TARGET, TEST_REPLICA_ID, TEST_REPLICA_OPERATIONS_TABLE,
    TEST_REPRESENTATIVE_PUBLICATION_OPERATION_ID, TEST_RETRYABLE_HANDOFF_ERROR, TEST_RETRY_AFTER_MS, TEST_RETRY_SCHEDULED_REENTRY_TEST_NAME, TEST_SNAPSHOT_REENTRY_TEST_NAME, TEST_SOURCE_NODE_ID, TEST_SQL_TRANSACTIONS_PARTITION_ID, TEST_SQL_TRANSACTIONS_REPLICA_ID,
    TEST_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID, TEST_SQL_TRANSACTION_PARTICIPANTS_REPLICA_ID, TEST_STATUS_CREATING, TEST_STATUS_PENDING, TEST_STEP_CREATING, TEST_STEP_PENDING, TEST_STEP_TIMEOUT_MS, TEST_TARGET_NODE_ID,
    TEST_TIMEOUT_OVERRUN_MS, TEST_UNDEFINED_VALUE, WORKFLOW_STEP, buildDispatchPendingReentryPlanningSnapshot, buildTransactionCoordinator, createCoordinator,
  } = dependencies;

const TEST_CACHE_VISIBLE_PRIORITY_SCAN_TEST_NAME =
  'checkTimeouts supplements cache-visible priority scans with ' +
  'authoritative no-step rows';
const TEST_ASSERT_CACHE_VISIBLE_PRIORITY_AUTHORITATIVE_READ =
  'priority timeout scans should supplement partial cache visibility with ' +
  'one authoritative owner read';
const TEST_ASSERT_AUTHORITATIVE_ONLY_LOCAL_DISPATCH =
  'authoritative-only no-step priority rows should re-enter local dispatch';
const TEST_ASSERT_AUTHORITATIVE_ONLY_DISPATCH_PROGRESS =
  'authoritative-only no-step priority rows should persist dispatch progress';
const TEST_ASSERT_AUTHORITATIVE_ONLY_REPLICA_HANDLER_DISPATCH =
  'authoritative-only priority rows should dispatch through the replica ' +
  'handler';
const TEST_OWNER_LANE_HELD_REENTRY_TEST_NAME =
  'priority recovery snapshots defer dispatch-pending re-entry when the ' +
  'operation owner lane is already held';
const TEST_AUTHORITATIVE_OBSERVATION_STATE_PRESENT = 'present';
const TEST_ACTIVE_HANDOFF_RETRY_TEST_NAME =
  'priority recovery snapshots surface retry-scheduled rebalancer handoff ' +
  'progress while a remote handoff retry is already active';
const TEST_REBALANCER_HANDOFF_RETRY_WAKE_SOURCE =
  'rebalancer_handoff_retry';
const TEST_REPRESENTATIVE_HANDOFF_RETRY_TEST_NAME =
  'representative control-plane publication retry-scheduled handoff residual ' +
  'preserves one bounded remote retry for duplicate witnesses';
const TEST_PUBLICATION_COUNT_ONLY_HANDOFF_TEST_NAME =
  'publication count-only retry-scheduled handoff residual preserves one ' +
  'bounded remote retry per unique operation';

registerCase(TEST_CACHE_VISIBLE_PRIORITY_SCAN_TEST_NAME,
async (t) => {
  const deliveries = [];
  const authoritativeIncompleteReads = [];
  const nowMs = Date.now();
  const cacheVisibleOperationRow = {
    operation_id: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_OBSERVER_NODE_ID,
    target_node_id: TEST_SOURCE_NODE_ID,
    status: TEST_STATUS_PENDING,
    workflow_step: TEST_STEP_PENDING,
    created_at: nowMs,
    updated_at: nowMs,
    completed_at: TEST_EMPTY_VALUE,
    error_message: TEST_EMPTY_VALUE,
    steps_history: JSON.stringify(TEST_EMPTY_LIST),
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_PARTITION_ID,
  };
  const authoritativeOnlyOperationRow = {
    operation_id: TEST_AUTHORITATIVE_ONLY_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partition_id: TEST_AUTHORITATIVE_ONLY_PARTITION_ID,
    replica_id: TEST_AUTHORITATIVE_ONLY_REPLICA_ID,
    source_node_id: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: TEST_STATUS_PENDING,
    workflow_step: TEST_STEP_PENDING,
    created_at: nowMs,
    updated_at: nowMs,
    completed_at: TEST_EMPTY_VALUE,
    error_message: TEST_EMPTY_VALUE,
    steps_history: JSON.stringify(TEST_EMPTY_LIST),
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_AUTHORITATIVE_ONLY_PARTITION_ID,
  };
  const operationRows = new Map([
    [cacheVisibleOperationRow.operation_id, cacheVisibleOperationRow],
    [
      authoritativeOnlyOperationRow.operation_id,
      authoritativeOnlyOperationRow,
    ],
  ]);

  const sqlQueryEngine = {
    async executeQuery(sql, params = []) {
      const normalizedSql = String(sql);
      if (
        normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT) &&
        normalizedSql.includes('WHERE operation_id = ?')
      ) {
        const operationId = params[NUM.ZERO];
        const operationRow = operationRows.get(operationId) || null;
        return {
          success: true,
          rows: operationRow ? [{...operationRow}] : [],
          affectedRows: operationRow ? NUM.ONE : NUM.ZERO,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
        authoritativeIncompleteReads.push({
          sql: normalizedSql,
          params: [...params],
        });
        return {
          success: true,
          rows: [...operationRows.values()]
            .filter((row) =>
              row.source_node_id === TEST_TARGET_NODE_ID ||
              row.target_node_id === TEST_TARGET_NODE_ID,
            )
            .map((row) => ({...row})),
          affectedRows: NUM.ONE,
        };
      }
      if (normalizedSql.startsWith('UPDATE replica_operations SET')) {
        const operationRow = operationRows.get(params[7]);
        operationRow.status = params[NUM.ZERO];
        operationRow.workflow_step = params[NUM.ONE];
        operationRow.updated_at = params[NUM.TWO];
        operationRow.completed_at = params[NUM.THREE];
        operationRow.error_message = params[NUM.FOUR];
        operationRow.steps_history = params[NUM.FIVE];
        operationRow.replica_id = params[NUM.SIX];
        return {
          success: true,
          affectedRows: NUM.ONE,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_SERVICES_FRAGMENT)) {
        return {
          success: true,
          rows: [],
          affectedRows: NUM.ZERO,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: NUM.ZERO,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: TEST_TARGET_NODE_ID,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return TEST_EMPTY_VALUE;
        }
        return key === TEST_OPERATION_ID ?
          cacheVisibleOperationRow :
          TEST_EMPTY_VALUE;
      },
      getAll(tableName) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [cacheVisibleOperationRow];
      },
      filter(tableName, predicate) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [cacheVisibleOperationRow].filter(predicate);
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: TEST_DELIVERY_STATUS_INITIATED};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    enableTimeouts: false,
  });

  const pendingTimeoutMs = coordinator.getTimeoutForStep(
    WORKFLOW_STEP.PENDING,
    {partitionId: TEST_AUTHORITATIVE_ONLY_PARTITION_ID},
  );
  authoritativeOnlyOperationRow.created_at =
    nowMs - pendingTimeoutMs - TEST_TIMEOUT_OVERRUN_MS;
  authoritativeOnlyOperationRow.updated_at =
    authoritativeOnlyOperationRow.created_at;

  coordinator.initialize();

  await coordinator.checkTimeouts();

  t.ok(
    authoritativeIncompleteReads.some((entry) =>
      entry.sql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT),
    ),
    TEST_ASSERT_CACHE_VISIBLE_PRIORITY_AUTHORITATIVE_READ,
  );
  t.equal(
    authoritativeOnlyOperationRow.workflow_step,
    TEST_STEP_CREATING,
    TEST_ASSERT_AUTHORITATIVE_ONLY_LOCAL_DISPATCH,
  );
  t.equal(
    authoritativeOnlyOperationRow.status,
    TEST_STATUS_CREATING,
    TEST_ASSERT_AUTHORITATIVE_ONLY_DISPATCH_PROGRESS,
  );
  t.ok(
    deliveries.some((delivery) =>
      delivery.target === TEST_REPLICA_HANDLER_DISPATCH_TARGET &&
      delivery.payload?.operationId === TEST_AUTHORITATIVE_ONLY_OPERATION_ID,
    ),
    TEST_ASSERT_AUTHORITATIVE_ONLY_REPLICA_HANDLER_DISPATCH,
  );

  await coordinator.shutdown();
});

registerCase(TEST_SNAPSHOT_REENTRY_TEST_NAME,
async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  let nowMs = TEST_CAPTURED_AT_MS;
  const originalDateNow = Date.now;
  Date.now = () => nowMs;
  const operationRow = {
    operation_id: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: TEST_STATUS_PENDING,
    workflow_step: WORKFLOW_STEP.SENDING,
    created_at: TEST_OPERATION_CREATED_AT_MS,
    updated_at:
      nowMs - TEST_STEP_TIMEOUT_MS - TEST_TIMEOUT_OVERRUN_MS,
    completed_at: TEST_EMPTY_VALUE,
    error_message: TEST_EMPTY_VALUE,
    steps_history: JSON.stringify(TEST_EMPTY_LIST),
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_PARTITION_ID,
  };

  const sqlQueryEngine = {
    async executeQuery(sql, params = []) {
      const normalizedSql = String(sql);
      if (
        normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT) &&
        normalizedSql.includes('WHERE operation_id = ?')
      ) {
        const operationId = params[NUM.ZERO];
        return {
          success: true,
          rows: operationId === TEST_OPERATION_ID ? [{...operationRow}] : [],
          affectedRows:
            operationId === TEST_OPERATION_ID ? NUM.ONE : NUM.ZERO,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
        return {
          success: true,
          rows: [{...operationRow}],
          affectedRows: NUM.ONE,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_SERVICES_FRAGMENT)) {
        return {
          success: true,
          rows: [],
          affectedRows: NUM.ZERO,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: NUM.ZERO,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: TEST_OBSERVER_NODE_ID,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get() {
        return null;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    controlPlaneReadinessService: {
      getPriorityRecoveryPlanningSnapshotBestEffort() {
        return buildDispatchPendingReentryPlanningSnapshot();
      },
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: TEST_DELIVERY_STATUS_INITIATED};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });

  try {
    coordinator.initialize();
    const operation = coordinator.repository.rowToOperation(operationRow);
    coordinator.workflowOwner.repository
      .getOperationsByEntityAuthoritativeObservation = async () => {
        return Object.freeze({
          state: TEST_AUTHORITATIVE_OBSERVATION_STATE_PRESENT,
          operationCount: NUM.ONE,
          operations: Object.freeze([operation]),
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };

    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          TEST_PARTITION_ID,
          TEST_EMPTY_LIST,
        );
    await new Promise((resolve) => {
      setTimeout(resolve, TEST_MICROTASK_DELAY_MS);
    });

    t.equal(
      snapshot?.progress?.nextRequiredAction,
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      TEST_ASSERT_SNAPSHOT_REENTRY_ADVANCE_ACTION,
    );
    t.equal(
      snapshot?.actuation?.state,
      TEST_EXPECTED_SENDING_REENTRY_ACTUATION_STATE,
      TEST_ASSERT_SNAPSHOT_REENTRY_NOT_TRANSITION_DEFERRED,
    );
    t.equal(
      deliveries.length,
      NUM.ONE,
      TEST_ASSERT_SNAPSHOT_REENTRY_WAKES_REMOTE_OWNER,
    );
    t.equal(
      deliveries[NUM.ZERO]?.target,
      TEST_REPLICA_DISPATCH_TARGET,
      TEST_ASSERT_SNAPSHOT_REENTRY_TARGET,
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      TEST_ASSERT_SNAPSHOT_REENTRY_ARMS_RETRY,
    );
    t.equal(
      operationRow.status,
      TEST_STATUS_PENDING,
      TEST_ASSERT_SNAPSHOT_REENTRY_PRESERVES_PENDING,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});


registerCase(TEST_OWNER_LANE_HELD_REENTRY_TEST_NAME,
async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  let nowMs = TEST_CAPTURED_AT_MS;
  const originalDateNow = Date.now;
  Date.now = () => nowMs;
  const operationRow = {
    operation_id: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: TEST_STATUS_PENDING,
    workflow_step: TEST_STEP_PENDING,
    created_at: TEST_OPERATION_CREATED_AT_MS,
    updated_at: TEST_OPERATION_CREATED_AT_MS,
    completed_at: TEST_EMPTY_VALUE,
    error_message: TEST_EMPTY_VALUE,
    steps_history: JSON.stringify(TEST_EMPTY_LIST),
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_PARTITION_ID,
  };

  const sqlQueryEngine = {
    async executeQuery(sql, params = []) {
      const normalizedSql = String(sql);
      if (
        normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT) &&
        normalizedSql.includes('WHERE operation_id = ?')
      ) {
        const operationId = params[NUM.ZERO];
        return {
          success: true,
          rows: operationId === TEST_OPERATION_ID ? [{...operationRow}] : [],
          affectedRows:
            operationId === TEST_OPERATION_ID ? NUM.ONE : NUM.ZERO,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
        return {
          success: true,
          rows: [{...operationRow}],
          affectedRows: NUM.ONE,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_SERVICES_FRAGMENT)) {
        return {
          success: true,
          rows: [],
          affectedRows: NUM.ZERO,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: NUM.ZERO,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: TEST_OBSERVER_NODE_ID,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get() {
        return null;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    controlPlaneReadinessService: {
      getPriorityRecoveryPlanningSnapshotBestEffort() {
        return buildDispatchPendingReentryPlanningSnapshot();
      },
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: TEST_DELIVERY_STATUS_INITIATED};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });

  try {
    coordinator.initialize();
    const operation = coordinator.repository.rowToOperation(operationRow);
    coordinator.workflowOwner.repository
      .getOperationsByEntityAuthoritativeObservation = async () => {
        return Object.freeze({
          state: TEST_AUTHORITATIVE_OBSERVATION_STATE_PRESENT,
          operationCount: NUM.ONE,
          operations: Object.freeze([operation]),
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };
    const singleFlightKey =
      coordinator.workflowOwner.getOperationOwnerSingleFlightKey(
        TEST_OPERATION_ID,
      );
    let releaseOwnerLane;
    const heldOwnerLane = coordinator.workflowOwner.operationWorkflowRunExclusive(
      singleFlightKey,
      () => new Promise((resolve) => {
        releaseOwnerLane = resolve;
      }),
    );

    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          TEST_PARTITION_ID,
          TEST_EMPTY_LIST,
        );

    t.equal(
      snapshot?.progress?.nextRequiredAction,
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      TEST_ASSERT_SNAPSHOT_REENTRY_ADVANCE_ACTION,
    );
    t.equal(
      deliveries.length,
      NUM.ZERO,
      TEST_ASSERT_OWNER_LANE_HELD_NO_INLINE_WAKE,
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      TEST_ASSERT_OWNER_LANE_HELD_DEFERS_REENTRY,
    );

    releaseOwnerLane();
    await heldOwnerLane;
    nowMs += deferredTimers[NUM.ZERO].delayMs;
    await deferredTimers[NUM.ZERO].fn();

    t.equal(
      deliveries.length,
      NUM.ONE,
      TEST_ASSERT_OWNER_LANE_HELD_RETRY_WAKES,
    );
    t.equal(
      deliveries[NUM.ZERO]?.target,
      TEST_REPLICA_DISPATCH_TARGET,
      TEST_ASSERT_SNAPSHOT_REENTRY_TARGET,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

registerCase(TEST_ACTIVE_HANDOFF_RETRY_TEST_NAME,
async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  let nowMs = TEST_CAPTURED_AT_MS;
  const originalDateNow = Date.now;
  Date.now = () => nowMs;
  const operationRow = {
    operation_id: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: TEST_STATUS_PENDING,
    workflow_step: WORKFLOW_STEP.SENDING,
    created_at: TEST_OPERATION_CREATED_AT_MS,
    updated_at: TEST_OPERATION_CREATED_AT_MS,
    completed_at: TEST_EMPTY_VALUE,
    error_message: TEST_EMPTY_VALUE,
    steps_history: JSON.stringify(TEST_EMPTY_LIST),
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_PARTITION_ID,
  };

  const sqlQueryEngine = {
    async executeQuery(sql, params = []) {
      const normalizedSql = String(sql);
      if (
        normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT) &&
        normalizedSql.includes('WHERE operation_id = ?')
      ) {
        const operationId = params[NUM.ZERO];
        return {
          success: true,
          rows: operationId === TEST_OPERATION_ID ? [{...operationRow}] : [],
          affectedRows:
            operationId === TEST_OPERATION_ID ? NUM.ONE : NUM.ZERO,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
        return {
          success: true,
          rows: [{...operationRow}],
          affectedRows: NUM.ONE,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_SERVICES_FRAGMENT)) {
        return {
          success: true,
          rows: [],
          affectedRows: NUM.ZERO,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: NUM.ZERO,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: TEST_OBSERVER_NODE_ID,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get() {
        return null;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    controlPlaneReadinessService: {
      getPriorityRecoveryPlanningSnapshotBestEffort() {
        return buildDispatchPendingReentryPlanningSnapshot();
      },
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            controlPlaneRecoveryEligible: true,
            repairEligible: true,
            serveEligible: true,
          },
        };
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: TEST_DELIVERY_STATUS_INITIATED};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });

  try {
    coordinator.initialize();
    const operation = coordinator.repository.rowToOperation(operationRow);
    coordinator.workflowOwner.repository
      .getOperationsByEntityAuthoritativeObservation = async () => {
        return Object.freeze({
          state: TEST_AUTHORITATIVE_OBSERVATION_STATE_PRESENT,
          operationCount: NUM.ONE,
          operations: Object.freeze([operation]),
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };
    t.equal(
      coordinator.workflowOwner.deferCoordinatorCreatedRemoteHandoffRetry(
        operation,
        {
          deferRetry: true,
          retryAfterMs: TEST_RETRY_AFTER_MS,
          error: TEST_RETRYABLE_HANDOFF_ERROR,
        },
      ),
      true,
      TEST_ASSERT_ACTIVE_HANDOFF_RETRY_TIMER_PRESERVED,
    );

    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          TEST_PARTITION_ID,
          TEST_EMPTY_LIST,
        );

    t.equal(
      snapshot?.progress?.nextRequiredAction,
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      TEST_ASSERT_ACTIVE_HANDOFF_RETRY_BOUNDED,
    );
    t.equal(
      snapshot?.progress?.blockingBoundary,
      PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
      TEST_ASSERT_ACTIVE_HANDOFF_RETRY_BOUNDED,
    );
    t.equal(
      snapshot?.progress?.waitMode,
      PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
      TEST_ASSERT_ACTIVE_HANDOFF_RETRY_BOUNDED,
    );
    t.match(
      snapshot?.progress?.progressContract,
      {
        owner: OPERATION_WORKFLOW_OWNER,
        boundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
        wakeSource: TEST_REBALANCER_HANDOFF_RETRY_WAKE_SOURCE,
        blockingDependency:
          PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
      },
      TEST_ASSERT_ACTIVE_HANDOFF_RETRY_BOUNDED,
    );
    t.ok(
      snapshot?.progress?.progressContract?.retryAfterMs > NUM.ZERO,
      TEST_ASSERT_ACTIVE_HANDOFF_RETRY_BOUNDED,
    );
    t.equal(
      deliveries.length,
      NUM.ZERO,
      TEST_ASSERT_ACTIVE_HANDOFF_RETRY_NO_INLINE_WAKE,
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      TEST_ASSERT_ACTIVE_HANDOFF_RETRY_TIMER_PRESERVED,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

registerCase(TEST_RETRY_SCHEDULED_REENTRY_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const operation = Object.freeze({
    operationId: TEST_OPERATION_ID,
    partitionId: TEST_LOCAL_OWNER_PARTITION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    status: TEST_STATUS_PENDING,
    workflowStep: WORKFLOW_STEP.SENDING,
    sourceNodeId: TEST_SOURCE_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    replicaId: TEST_LOCAL_OWNER_REPLICA_ID,
    createdAt: TEST_CAPTURED_AT_MS,
    updatedAt: TEST_CAPTURED_AT_MS,
  });
  const snapshot = Object.freeze({
    operationId: TEST_OPERATION_ID,
    actuation: Object.freeze({
      owner: OPERATION_WORKFLOW_OWNER,
      state: PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    }),
    progress: Object.freeze({
      currentOwner: OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      blockingBoundary:
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    }),
  });
  const coordinator = createCoordinator({
    nodeId: TEST_OBSERVER_NODE_ID,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get() {
        return TEST_EMPTY_VALUE;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: TEST_DELIVERY_STATUS_INITIATED};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;

  try {
    coordinator.initialize();
    t.equal(
      coordinator.workflowOwner.schedulePriorityRecoveryDispatchPendingReentry(
        snapshot,
        [operation],
      ),
      true,
      TEST_ASSERT_RETRY_SCHEDULED_REENTRY_WAKES,
    );
    await new Promise((resolve) => {
      setTimeout(resolve, TEST_MICROTASK_DELAY_MS);
    });
    t.equal(
      deliveries.length,
      NUM.ONE,
      TEST_ASSERT_RETRY_SCHEDULED_REENTRY_WAKES,
    );
    t.equal(
      deliveries[NUM.ZERO]?.target,
      TEST_REPLICA_DISPATCH_TARGET,
      TEST_ASSERT_RETRY_SCHEDULED_REENTRY_TARGET,
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      TEST_ASSERT_RETRY_SCHEDULED_REENTRY_TIMER,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

registerCase(TEST_ADVANCE_EFFECT_CAPTURED_AT_REENTRY_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  let nowMs =
    TEST_CAPTURED_AT_MS +
    (TEST_STEP_TIMEOUT_MS * NUM.FIVE) +
    TEST_TIMEOUT_OVERRUN_MS;
  const originalDateNow = Date.now;
  Date.now = () => nowMs;
  const operation = Object.freeze({
    operationId: TEST_OPERATION_ID,
    partitionId: TEST_LOCAL_OWNER_PARTITION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    status: TEST_STATUS_PENDING,
    workflowStep: WORKFLOW_STEP.SENDING,
    sourceNodeId: TEST_SOURCE_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    replicaId: TEST_LOCAL_OWNER_REPLICA_ID,
    createdAt: TEST_CAPTURED_AT_MS,
    updatedAt: TEST_CAPTURED_AT_MS,
  });
  const snapshot = Object.freeze({
    operationId: TEST_OPERATION_ID,
    capturedAt: TEST_CAPTURED_AT_MS,
    operationOwnerObservation: Object.freeze({
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES
          .ADVANCE_EXISTING_OPERATION_COMMAND,
      effectExecution:
        PRIORITY_RECOVERY_OPERATION_OWNER_EFFECT_EXECUTION.NOT_EXECUTED,
    }),
    actuation: Object.freeze({
      owner: OPERATION_WORKFLOW_OWNER,
      state: PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    }),
    progress: Object.freeze({
      currentOwner: OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      blockingBoundary:
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    }),
  });
  const coordinator = createCoordinator({
    nodeId: TEST_OBSERVER_NODE_ID,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get() {
        return TEST_EMPTY_VALUE;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: TEST_DELIVERY_STATUS_INITIATED};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });

  try {
    coordinator.initialize();
    t.equal(
      await coordinator.workflowOwner
        .applyPriorityRecoveryDispatchPendingOwnerProgress(
          operation,
          snapshot,
        ),
      true,
      TEST_ASSERT_ADVANCE_EFFECT_CAPTURED_AT_WAKE,
    );
    t.equal(
      deliveries.length,
      NUM.ONE,
      TEST_ASSERT_ADVANCE_EFFECT_CAPTURED_AT_WAKE,
    );
    t.equal(
      deliveries[NUM.ZERO]?.target,
      TEST_REPLICA_DISPATCH_TARGET,
      TEST_ASSERT_ADVANCE_EFFECT_CAPTURED_AT_TARGET,
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      TEST_ASSERT_ADVANCE_EFFECT_CAPTURED_AT_TIMER,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

registerCase(TEST_REPRESENTATIVE_HANDOFF_RETRY_TEST_NAME,
async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const operation = Object.freeze({
    operationId: TEST_REPRESENTATIVE_PUBLICATION_OPERATION_ID,
    partitionId: TEST_LOCAL_OWNER_PARTITION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    status: TEST_STATUS_PENDING,
    workflowStep: WORKFLOW_STEP.SENDING,
    sourceNodeId: TEST_SOURCE_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    replicaId: TEST_LOCAL_OWNER_REPLICA_ID,
    createdAt: TEST_CAPTURED_AT_MS,
    updatedAt: TEST_CAPTURED_AT_MS,
  });
  const snapshot = Object.freeze({
    operationId: TEST_REPRESENTATIVE_PUBLICATION_OPERATION_ID,
    actuation: Object.freeze({
      owner: OPERATION_WORKFLOW_OWNER,
      state: PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    }),
    progress: Object.freeze({
      currentOwner: OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      blockingBoundary:
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    }),
  });
  const duplicateWitnesses = Object.freeze([
    operation,
    Object.freeze({...operation}),
  ]);
  const coordinator = createCoordinator({
    nodeId: TEST_OBSERVER_NODE_ID,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get() {
        return TEST_EMPTY_VALUE;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: TEST_DELIVERY_STATUS_INITIATED};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;

  try {
    coordinator.initialize();
    t.equal(
      coordinator.workflowOwner.deferCoordinatorCreatedRemoteHandoffRetry(
        operation,
        {
          deferRetry: true,
          retryAfterMs: TEST_RETRY_AFTER_MS,
          error: TEST_RETRYABLE_HANDOFF_ERROR,
        },
      ),
      true,
      TEST_ASSERT_REPRESENTATIVE_HANDOFF_RETRY_BOUNDED,
    );
    t.equal(
      coordinator.workflowOwner.schedulePriorityRecoveryDispatchPendingReentry(
        snapshot,
        duplicateWitnesses,
      ),
      false,
      TEST_ASSERT_REPRESENTATIVE_HANDOFF_NO_DUPLICATE_WAKE,
    );
    t.equal(
      deliveries.length,
      NUM.ZERO,
      TEST_ASSERT_REPRESENTATIVE_HANDOFF_NO_DUPLICATE_WAKE,
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      TEST_ASSERT_REPRESENTATIVE_HANDOFF_TIMER_PRESERVED,
    );
    t.equal(
      coordinator.workflowOwner.createdOperationHandoffRetryTimerByOperationId
        .size,
      NUM.ONE,
      TEST_ASSERT_REPRESENTATIVE_HANDOFF_TIMER_PRESERVED,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

registerCase(TEST_PUBLICATION_COUNT_ONLY_HANDOFF_TEST_NAME,
async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const witnessOperations = Object.freeze([
    Object.freeze({
      operationId: TEST_PUBLICATION_COUNT_ONLY_PUBLICATION_OPERATION_ID,
      partitionId: TEST_LOCAL_OWNER_PARTITION_ID,
      replicaId: TEST_LOCAL_OWNER_REPLICA_ID,
    }),
    Object.freeze({
      operationId: TEST_PUBLICATION_COUNT_ONLY_PUBLICATION_OPERATION_ID,
      partitionId: TEST_LOCAL_OWNER_PARTITION_ID,
      replicaId: TEST_LOCAL_OWNER_REPLICA_ID,
    }),
    Object.freeze({
      operationId: TEST_PUBLICATION_COUNT_ONLY_REPLICA_OPERATION_ID,
      partitionId: TEST_AUTHORITATIVE_ONLY_PARTITION_ID,
      replicaId: TEST_AUTHORITATIVE_ONLY_REPLICA_ID,
    }),
    Object.freeze({
      operationId: TEST_PUBLICATION_COUNT_ONLY_SQL_PARTICIPANT_OPERATION_ID,
      partitionId: TEST_SQL_TRANSACTION_PARTICIPANTS_PARTITION_ID,
      replicaId: TEST_SQL_TRANSACTION_PARTICIPANTS_REPLICA_ID,
    }),
    Object.freeze({
      operationId: TEST_PUBLICATION_COUNT_ONLY_SQL_TRANSACTION_OPERATION_ID,
      partitionId: TEST_SQL_TRANSACTIONS_PARTITION_ID,
      replicaId: TEST_SQL_TRANSACTIONS_REPLICA_ID,
    }),
  ].map((operation) => Object.freeze({
    ...operation,
    type: TEST_OPERATION_TYPE_REPLACE,
    status: TEST_STATUS_PENDING,
    workflowStep: WORKFLOW_STEP.SENDING,
    sourceNodeId: TEST_SOURCE_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    createdAt: TEST_CAPTURED_AT_MS,
    updatedAt: TEST_CAPTURED_AT_MS,
  })));
  const uniqueOperations = Object.freeze(Array.from(
    new Map(witnessOperations.map((operation) => [
      operation.operationId,
      operation,
    ])).values(),
  ));
  const coordinator = createCoordinator({
    nodeId: TEST_OBSERVER_NODE_ID,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get() {
        return TEST_EMPTY_VALUE;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: TEST_DELIVERY_STATUS_INITIATED};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      deferredTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;

  try {
    coordinator.initialize();
    for (const operation of uniqueOperations) {
      t.equal(
        coordinator.workflowOwner.deferCoordinatorCreatedRemoteHandoffRetry(
          operation,
          {
            deferRetry: true,
            retryAfterMs: TEST_RETRY_AFTER_MS,
            error: TEST_RETRYABLE_HANDOFF_ERROR,
          },
        ),
        true,
        TEST_ASSERT_COUNT_ONLY_HANDOFF_UNIQUE_RETRIES,
      );
    }
    for (const operation of uniqueOperations) {
      const snapshot = Object.freeze({
        operationId: operation.operationId,
        actuation: Object.freeze({
          owner: OPERATION_WORKFLOW_OWNER,
          state:
            PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
        }),
        progress: Object.freeze({
          currentOwner: OPERATION_WORKFLOW_OWNER,
          nextRequiredAction:
            PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
              .WAIT_FOR_OPERATION_PROGRESS,
          blockingBoundary:
            PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
          waitMode: PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
          workflowProgressPhaseId:
            PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
        }),
      });
      t.equal(
        coordinator.workflowOwner.schedulePriorityRecoveryDispatchPendingReentry(
          snapshot,
          witnessOperations,
        ),
        false,
        TEST_ASSERT_COUNT_ONLY_HANDOFF_NO_DUPLICATE_WAKE,
      );
    }
    t.equal(
      deliveries.length,
      NUM.ZERO,
      TEST_ASSERT_COUNT_ONLY_HANDOFF_NO_DUPLICATE_WAKE,
    );
    t.equal(
      deferredTimers.length,
      uniqueOperations.length,
      TEST_ASSERT_COUNT_ONLY_HANDOFF_TIMERS_PRESERVED,
    );
    t.equal(
      coordinator.workflowOwner.createdOperationHandoffRetryTimerByOperationId
        .size,
      uniqueOperations.length,
      TEST_ASSERT_COUNT_ONLY_HANDOFF_TIMERS_PRESERVED,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

}
