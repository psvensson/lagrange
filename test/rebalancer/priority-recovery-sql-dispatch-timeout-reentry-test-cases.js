export function registerPriorityRecoverySqlDispatchTimeoutReentryTestCases({registerCase, dependencies}) {
  const {
    NUM, TEST_ACTUAL_STATUS_ABSENT, TEST_ASSERT_SQL_PRIORITY_CLAIM_BOUNDED_BUDGET, TEST_ASSERT_SQL_PRIORITY_CLAIM_CAS, TEST_ASSERT_SQL_PRIORITY_CLAIM_NO_SESSION, TEST_ASSERT_SQL_PRIORITY_CLAIM_SESSION_ABSENT, TEST_ASSERT_SQL_PRIORITY_CREATING_BOUNDED_BUDGET, TEST_ASSERT_SQL_PRIORITY_DEFERRED_CLAIM_CAS,
    TEST_ASSERT_SQL_PRIORITY_DEFERRED_CLAIM_DISPATCH, TEST_ASSERT_SQL_PRIORITY_DEFERRED_CLAIM_STEP, TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_RETRY, TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_RETRY_STATUS, TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_RETRY_STEP, TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_STALE_ROW, TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_TIMER, TEST_ASSERT_SQL_PRIORITY_DISPATCH,
    TEST_ASSERT_SQL_PRIORITY_DISPATCH_SOURCE, TEST_ASSERT_SQL_PRIORITY_DISPATCH_TARGET, TEST_ASSERT_SQL_PRIORITY_DISPATCH_TIMEOUT, TEST_ASSERT_SQL_PRIORITY_LOCAL_OWNER, TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_ACCEPTED_STATUS, TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_ACCEPTED_STEP, TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_NO_CREATE, TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_STATUS,
    TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_STEP, TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_SUCCESS, TEST_ASSERT_SQL_PRIORITY_REARM, TEST_ASSERT_SQL_PRIORITY_SNAPSHOT_STEP, TEST_ASSERT_SQL_PRIORITY_STALE_ROW, TEST_ASSERT_SQL_PRIORITY_STATUS, TEST_ASSERT_SQL_PRIORITY_STEP, TEST_ASSERT_SQL_PRIORITY_TRANSITIONS,
    TEST_CAPTURED_AT_MS, TEST_DELIVERY_STATUS_INITIATED, TEST_DISTRIBUTED_PARTICIPANT_FAILURE, TEST_EMPTY_LIST, TEST_EMPTY_VALUE, TEST_ENTITY_TYPE_PARTITION, TEST_EXPECTED_WORKFLOW_STEP_PARAM_INDEX, TEST_HANDOFF_TIMEOUT_MS,
    TEST_LOCAL_OWNER_PARTITION_ID, TEST_LOCAL_OWNER_REPLICA_ID, TEST_MIN_REPLICA_COUNT, TEST_PARTITION_ID, TEST_PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS, TEST_QUERY_OPERATION_BY_ID_FRAGMENT, TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT, TEST_QUERY_SERVICES_FRAGMENT,
    TEST_RAFT_ROLE_FOLLOWER, TEST_REPLICA_HANDLER_DISPATCH_TARGET, TEST_REPLICA_ID, TEST_REPLICA_OPERATIONS_TABLE, TEST_REPLICA_OPERATION_DISPATCH_DELIVERY_SOURCE, TEST_REPLICA_SERVICE_ADDRESS, TEST_RETRY_AFTER_MS, TEST_SQL_PRIORITY_DEFERRED_CLAIM_DISPATCH_TEST_NAME,
    TEST_SQL_PRIORITY_DEFERRED_PROGRESS_DISPATCH_TEST_NAME, TEST_SQL_PRIORITY_PENDING_WAKE_ACCEPTED_RECONCILE_TEST_NAME, TEST_SQL_PRIORITY_PENDING_WAKE_ACTIVE_RECONCILE_TEST_NAME, TEST_SQL_PRIORITY_STALE_VISIBILITY_REDISPATCH_TEST_NAME, TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID, TEST_SQL_PRIORITY_TIMEOUT_REDISPATCH_TEST_NAME, TEST_STATUS_ACTIVE, TEST_STATUS_CREATING,
    TEST_STATUS_PENDING, TEST_STEP_ACTIVE, TEST_STEP_CREATING, TEST_STEP_HISTORY_LAG_MS, TEST_STEP_PENDING, TEST_STEP_SENDING, TEST_TARGET_NODE_ID, TEST_TIMEOUT_OVERRUN_MS,
    TEST_UPDATE_REPLICA_OPERATIONS_PREFIX, WORKFLOW_STEP, buildDispatchPendingReentryPlanningSnapshot, buildPendingOperationRow, buildTransactionCoordinator, createCoordinator,
  } = dependencies;

registerCase(TEST_SQL_PRIORITY_TIMEOUT_REDISPATCH_TEST_NAME, async (t) => {
  const deliveries = [];
  const updateOptions = [];
  const updateParams = [];
  let updateCount = 0;
  const nowMs = Date.now();
  const operationRow = buildPendingOperationRow({
    operationId: TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID,
    partitionId: TEST_PARTITION_ID,
    replicaId: TEST_REPLICA_ID,
    nowMs,
  });

  const sqlQueryEngine = {
    async executeQuery(sql, params = [], options = {}) {
      const normalizedSql = String(sql);
      if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
        return {
          success: true,
          rows: [{...operationRow}],
          affectedRows: 1,
        };
      }
      if (normalizedSql.startsWith(TEST_UPDATE_REPLICA_OPERATIONS_PREFIX)) {
        updateCount += 1;
        updateOptions.push({...options});
        updateParams.push([...params]);
        operationRow.status = params[0];
        operationRow.workflow_step = params[1];
        operationRow.updated_at = params[2];
        operationRow.completed_at = params[3];
        operationRow.error_message = params[4];
        operationRow.steps_history = params[5];
        operationRow.replica_id = params[6];
        return {
          success: true,
          affectedRows: 1,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_SERVICES_FRAGMENT)) {
        return {
          success: true,
          rows: [],
          affectedRows: 0,
        };
      }
      return {
        success: true,
        rows: [],
        affectedRows: 0,
      };
    },
  };

  const coordinator = createCoordinator({
    nodeId: TEST_TARGET_NODE_ID,
    replicaOperationDispatchTimeoutMs: TEST_HANDOFF_TIMEOUT_MS,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return null;
        }
        return key === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID ?
          operationRow :
          null;
      },
      getAll(tableName) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow];
      },
      filter(tableName, predicate) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow].filter(predicate);
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
    {partitionId: TEST_PARTITION_ID},
  );
  operationRow.created_at =
    nowMs - pendingTimeoutMs - TEST_TIMEOUT_OVERRUN_MS;
  operationRow.updated_at = operationRow.created_at;
  operationRow.steps_history = JSON.stringify([{
    step: TEST_STEP_PENDING,
    timestamp: operationRow.updated_at - TEST_STEP_HISTORY_LAG_MS,
  }]);

  coordinator.initialize();

  const cachedOperation =
    coordinator.repository.queryCachedIncompleteOperations()[0];

  t.equal(
    coordinator.repository.isOperationLocallyOwned(cachedOperation),
    true,
    TEST_ASSERT_SQL_PRIORITY_LOCAL_OWNER,
  );
  t.equal(
    coordinator.workflowOwner.shouldRearmDispatchFromProgressReconcile(
      cachedOperation,
      TEST_ACTUAL_STATUS_ABSENT,
      {now: nowMs},
    ),
    true,
    TEST_ASSERT_SQL_PRIORITY_REARM,
  );

  await coordinator.checkTimeouts();

  t.equal(
    deliveries.length,
    NUM.ONE,
    TEST_ASSERT_SQL_PRIORITY_DISPATCH,
  );
  t.equal(
    deliveries[NUM.ZERO]?.target,
    TEST_REPLICA_HANDLER_DISPATCH_TARGET,
    TEST_ASSERT_SQL_PRIORITY_DISPATCH_TARGET,
  );
  t.equal(
    deliveries[NUM.ZERO]?.options?.timeoutMs,
    TEST_HANDOFF_TIMEOUT_MS,
    TEST_ASSERT_SQL_PRIORITY_DISPATCH_TIMEOUT,
  );
  t.equal(
    deliveries[NUM.ZERO]?.options?.deliverySource,
    TEST_REPLICA_OPERATION_DISPATCH_DELIVERY_SOURCE,
    TEST_ASSERT_SQL_PRIORITY_DISPATCH_SOURCE,
  );
  t.equal(
    operationRow.workflow_step,
    TEST_STEP_CREATING,
    TEST_ASSERT_SQL_PRIORITY_STEP,
  );
  t.equal(
    operationRow.status,
    TEST_STATUS_CREATING,
    TEST_ASSERT_SQL_PRIORITY_STATUS,
  );
  t.equal(
    updateCount,
    2,
    TEST_ASSERT_SQL_PRIORITY_TRANSITIONS,
  );
  t.equal(
    updateOptions[NUM.ZERO]?.disableSystemWriteSession,
    true,
    TEST_ASSERT_SQL_PRIORITY_CLAIM_NO_SESSION,
  );
  t.equal(
    Object.hasOwn(updateOptions[NUM.ZERO] || {}, 'sessionId'),
    false,
    TEST_ASSERT_SQL_PRIORITY_CLAIM_SESSION_ABSENT,
  );
  t.equal(
    updateParams[NUM.ZERO]?.[TEST_EXPECTED_WORKFLOW_STEP_PARAM_INDEX],
    TEST_STEP_PENDING,
    TEST_ASSERT_SQL_PRIORITY_CLAIM_CAS,
  );
  t.equal(
    updateOptions[NUM.ZERO]?.timeoutBudget?.configuredBudgetMs,
    TEST_PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS,
    TEST_ASSERT_SQL_PRIORITY_CLAIM_BOUNDED_BUDGET,
  );
  t.ok(
    updateOptions[NUM.ZERO]?.timeoutMs <=
      TEST_PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS &&
      updateOptions[NUM.ZERO]?.timeoutMs > NUM.ZERO,
    TEST_ASSERT_SQL_PRIORITY_CLAIM_BOUNDED_BUDGET,
  );
  t.equal(
    updateOptions[NUM.ONE]?.timeoutBudget?.configuredBudgetMs,
    TEST_PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS,
    TEST_ASSERT_SQL_PRIORITY_CREATING_BOUNDED_BUDGET,
  );
  t.ok(
    updateOptions[NUM.ONE]?.timeoutMs <=
      TEST_PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS &&
      updateOptions[NUM.ONE]?.timeoutMs > NUM.ZERO,
    TEST_ASSERT_SQL_PRIORITY_CREATING_BOUNDED_BUDGET,
  );

  await coordinator.shutdown();
});

registerCase(TEST_SQL_PRIORITY_DEFERRED_CLAIM_DISPATCH_TEST_NAME, async (t) => {
  const deliveries = [];
  const updateParams = [];
  let updateCount = 0;
  const nowMs = Date.now();
  const operationRow = buildPendingOperationRow({
    operationId: TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID,
    partitionId: TEST_PARTITION_ID,
    replicaId: TEST_REPLICA_ID,
    nowMs,
  });

  const sqlQueryEngine = {
    async executeQuery(sql, params = []) {
      const normalizedSql = String(sql);
      if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
        return {
          success: true,
          rows: [{...operationRow}],
          affectedRows: NUM.ONE,
        };
      }
      if (normalizedSql.startsWith(TEST_UPDATE_REPLICA_OPERATIONS_PREFIX)) {
        updateCount += NUM.ONE;
        updateParams.push([...params]);
        if (updateCount === NUM.ONE) {
          return {
            success: false,
            error: TEST_DISTRIBUTED_PARTICIPANT_FAILURE,
            errorCode: TEST_DISTRIBUTED_PARTICIPANT_FAILURE,
            participantFailures: [
              {
                deferRetry: true,
                retryAfterMs: TEST_RETRY_AFTER_MS,
              },
            ],
            firstFailedParticipant: {
              deferRetry: true,
              retryAfterMs: TEST_RETRY_AFTER_MS,
            },
          };
        }
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
    replicaOperationDispatchTimeoutMs: TEST_HANDOFF_TIMEOUT_MS,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return null;
        }
        return key === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID ?
          operationRow :
          null;
      },
      getAll(tableName) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow];
      },
      filter(tableName, predicate) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow].filter(predicate);
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
    {partitionId: TEST_PARTITION_ID},
  );
  operationRow.created_at =
    nowMs - pendingTimeoutMs - TEST_TIMEOUT_OVERRUN_MS;
  operationRow.updated_at = operationRow.created_at;
  operationRow.steps_history = JSON.stringify([{
    step: TEST_STEP_PENDING,
    timestamp: operationRow.updated_at - TEST_STEP_HISTORY_LAG_MS,
  }]);

  coordinator.initialize();

  await coordinator.checkTimeouts();

  t.equal(
    deliveries.length,
    NUM.ONE,
    TEST_ASSERT_SQL_PRIORITY_DEFERRED_CLAIM_DISPATCH,
  );
  t.equal(
    operationRow.workflow_step,
    TEST_STEP_CREATING,
    TEST_ASSERT_SQL_PRIORITY_DEFERRED_CLAIM_STEP,
  );
  t.equal(
    updateParams[NUM.ONE]?.[TEST_EXPECTED_WORKFLOW_STEP_PARAM_INDEX],
    TEST_STEP_PENDING,
    TEST_ASSERT_SQL_PRIORITY_DEFERRED_CLAIM_CAS,
  );

  await coordinator.shutdown();
});

registerCase(TEST_SQL_PRIORITY_DEFERRED_PROGRESS_DISPATCH_TEST_NAME, async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const updateOptions = [];
  let updateCount = 0;
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;
  const operationRow = buildPendingOperationRow({
    operationId: TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID,
    partitionId: TEST_PARTITION_ID,
    replicaId: TEST_REPLICA_ID,
    nowMs: TEST_CAPTURED_AT_MS,
  });

  const sqlQueryEngine = {
    async executeQuery(sql, params = [], options = {}) {
      const normalizedSql = String(sql);
      if (normalizedSql.startsWith(TEST_UPDATE_REPLICA_OPERATIONS_PREFIX)) {
        updateCount += NUM.ONE;
        updateOptions.push({...options});
        if (updateCount === NUM.ONE || updateCount === NUM.THREE) {
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
        return {
          success: false,
          error: TEST_DISTRIBUTED_PARTICIPANT_FAILURE,
          errorCode: TEST_DISTRIBUTED_PARTICIPANT_FAILURE,
          participantFailures: [
            {
              deferRetry: true,
              retryAfterMs: TEST_RETRY_AFTER_MS,
            },
          ],
          firstFailedParticipant: {
            deferRetry: true,
            retryAfterMs: TEST_RETRY_AFTER_MS,
          },
        };
      }
      if (
        normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT) &&
        normalizedSql.includes(TEST_QUERY_OPERATION_BY_ID_FRAGMENT)
      ) {
        const operationId = params[NUM.ZERO];
        return {
          success: true,
          rows: operationId === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID ?
            [{...operationRow}] :
            [],
          affectedRows:
            operationId === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID ?
              NUM.ONE :
              NUM.ZERO,
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
    nodeId: TEST_TARGET_NODE_ID,
    replicaOperationDispatchTimeoutMs: TEST_HANDOFF_TIMEOUT_MS,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return null;
        }
        return key === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID ?
          operationRow :
          null;
      },
      getAll(tableName) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow];
      },
      filter(tableName, predicate) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow].filter(predicate);
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
  coordinator.workflowOwner.repository
    .replicaOperationAuthoritativeVisibilityTimeoutMs = NUM.ZERO;

  const pendingTimeoutMs = coordinator.getTimeoutForStep(
    WORKFLOW_STEP.PENDING,
    {partitionId: TEST_PARTITION_ID},
  );
  operationRow.created_at =
    TEST_CAPTURED_AT_MS - pendingTimeoutMs - TEST_TIMEOUT_OVERRUN_MS;
  operationRow.updated_at = operationRow.created_at;
  operationRow.steps_history = JSON.stringify([{
    step: TEST_STEP_PENDING,
    timestamp: operationRow.updated_at - TEST_STEP_HISTORY_LAG_MS,
  }]);

  try {
    coordinator.initialize();

    await coordinator.checkTimeouts();

    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          TEST_PARTITION_ID,
          TEST_EMPTY_LIST,
        );

    t.equal(
      deliveries.length,
      NUM.ONE,
      TEST_ASSERT_SQL_PRIORITY_DISPATCH,
    );
    t.equal(
      updateCount,
      NUM.TWO,
      TEST_ASSERT_SQL_PRIORITY_TRANSITIONS,
    );
    t.equal(
      operationRow.workflow_step,
      TEST_STEP_SENDING,
      TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_STALE_ROW,
    );
    t.equal(
      updateOptions[NUM.ONE]?.timeoutBudget?.configuredBudgetMs,
      TEST_PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS,
      TEST_ASSERT_SQL_PRIORITY_CREATING_BOUNDED_BUDGET,
    );
    t.equal(
      snapshot?.coordinator?.operation?.workflowStep,
      TEST_STEP_CREATING,
      TEST_ASSERT_SQL_PRIORITY_SNAPSHOT_STEP,
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_TIMER,
    );

    await deferredTimers[NUM.ZERO].fn();

    t.equal(
      updateCount,
      NUM.THREE,
      TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_RETRY,
    );
    t.equal(
      operationRow.workflow_step,
      TEST_STEP_CREATING,
      TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_RETRY_STEP,
    );
    t.equal(
      operationRow.status,
      TEST_STATUS_CREATING,
      TEST_ASSERT_SQL_PRIORITY_DEFERRED_PROGRESS_RETRY_STATUS,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

registerCase(TEST_SQL_PRIORITY_PENDING_WAKE_ACTIVE_RECONCILE_TEST_NAME, async (t) => {
  const deliveries = [];
  let updateCount = NUM.ZERO;
  const nowMs = Date.now();
  const operationRow = buildPendingOperationRow({
    operationId: TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID,
    partitionId: TEST_LOCAL_OWNER_PARTITION_ID,
    replicaId: TEST_LOCAL_OWNER_REPLICA_ID,
    nowMs,
  });
  const serviceRow = {
    service_id: TEST_LOCAL_OWNER_REPLICA_ID,
    service_type: TEST_ENTITY_TYPE_PARTITION,
    node_id: TEST_TARGET_NODE_ID,
    partition_id: TEST_LOCAL_OWNER_PARTITION_ID,
    group_id: TEST_EMPTY_VALUE,
    replica_id: TEST_LOCAL_OWNER_REPLICA_ID,
    raft_role: TEST_RAFT_ROLE_FOLLOWER,
    status: TEST_STATUS_ACTIVE,
    address: TEST_REPLICA_SERVICE_ADDRESS,
    created_at: nowMs,
    updated_at: nowMs,
  };

  const sqlQueryEngine = {
    async executeQuery(sql, params = []) {
      const normalizedSql = String(sql);
      if (normalizedSql.startsWith(TEST_UPDATE_REPLICA_OPERATIONS_PREFIX)) {
        updateCount += NUM.ONE;
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
      if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
        return {
          success: true,
          rows: [{...operationRow}],
          affectedRows: NUM.ONE,
        };
      }
      if (normalizedSql.includes(TEST_QUERY_SERVICES_FRAGMENT)) {
        const requestedReplicaId = params[NUM.ZERO];
        const requestedNodeId = params[NUM.ONE];
        const serviceMatches =
          requestedReplicaId === TEST_LOCAL_OWNER_REPLICA_ID ||
          requestedNodeId === TEST_TARGET_NODE_ID;
        return {
          success: true,
          rows: serviceMatches ? [{...serviceRow}] : [],
          affectedRows: serviceMatches ? NUM.ONE : NUM.ZERO,
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
    replicaOperationDispatchTimeoutMs: TEST_HANDOFF_TIMEOUT_MS,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return TEST_EMPTY_VALUE;
        }
        return key === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID ?
          operationRow :
          TEST_EMPTY_VALUE;
      },
      getAll(tableName) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow];
      },
      filter(tableName, predicate) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow].filter(predicate);
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

  try {
    coordinator.initialize();
    const pendingWakeOperation =
      coordinator.repository.rowToOperation(operationRow);
    const pendingWakeOptions = {
      cause: TEST_REPLICA_OPERATION_DISPATCH_DELIVERY_SOURCE,
    };

    const dispatchResult = await coordinator.dispatchOperation(
      pendingWakeOperation,
      pendingWakeOptions,
    );

    t.equal(
      dispatchResult?.success,
      true,
      TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_SUCCESS,
    );
    t.equal(
      deliveries.length,
      NUM.ZERO,
      TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_NO_CREATE,
    );
    t.equal(
      operationRow.workflow_step,
      TEST_STEP_ACTIVE,
      TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_STEP,
    );
    t.equal(
      operationRow.status,
      TEST_STATUS_ACTIVE,
      TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_STATUS,
    );
    t.ok(updateCount >= NUM.ONE, TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_STEP);
  } finally {
    await coordinator.shutdown();
  }
});

registerCase(TEST_SQL_PRIORITY_PENDING_WAKE_ACCEPTED_RECONCILE_TEST_NAME,
  async (t) => {
    const deliveries = [];
    let updateCount = NUM.ZERO;
    const nowMs = Date.now();
    const operationRow = buildPendingOperationRow({
      operationId: TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID,
      partitionId: TEST_LOCAL_OWNER_PARTITION_ID,
      replicaId: TEST_LOCAL_OWNER_REPLICA_ID,
      nowMs,
    });
    const serviceRow = {
      service_id: TEST_LOCAL_OWNER_REPLICA_ID,
      service_type: TEST_ENTITY_TYPE_PARTITION,
      node_id: TEST_TARGET_NODE_ID,
      partition_id: TEST_LOCAL_OWNER_PARTITION_ID,
      group_id: TEST_EMPTY_VALUE,
      replica_id: TEST_LOCAL_OWNER_REPLICA_ID,
      raft_role: TEST_RAFT_ROLE_FOLLOWER,
      status: TEST_STATUS_PENDING,
      address: TEST_REPLICA_SERVICE_ADDRESS,
      created_at: nowMs,
      updated_at: nowMs,
    };

    const sqlQueryEngine = {
      async executeQuery(sql, params = []) {
        const normalizedSql = String(sql);
        if (normalizedSql.startsWith(TEST_UPDATE_REPLICA_OPERATIONS_PREFIX)) {
          updateCount += NUM.ONE;
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
        if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
          return {
            success: true,
            rows: [{...operationRow}],
            affectedRows: NUM.ONE,
          };
        }
        if (normalizedSql.includes(TEST_QUERY_SERVICES_FRAGMENT)) {
          const requestedReplicaId = params[NUM.ZERO];
          const requestedNodeId = params[NUM.ONE];
          const serviceMatches =
            requestedReplicaId === TEST_LOCAL_OWNER_REPLICA_ID ||
            requestedNodeId === TEST_TARGET_NODE_ID;
          return {
            success: true,
            rows: serviceMatches ? [{...serviceRow}] : [],
            affectedRows: serviceMatches ? NUM.ONE : NUM.ZERO,
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
      replicaOperationDispatchTimeoutMs: TEST_HANDOFF_TIMEOUT_MS,
      sqlQueryEngine,
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get(tableName, key) {
          if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
            return TEST_EMPTY_VALUE;
          }
          return key === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID ?
            operationRow :
            TEST_EMPTY_VALUE;
        },
        getAll(tableName) {
          if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
            return [];
          }
          return [operationRow];
        },
        filter(tableName, predicate) {
          if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
            return [];
          }
          return [operationRow].filter(predicate);
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

    try {
      coordinator.initialize();
      const pendingWakeOperation =
        coordinator.repository.rowToOperation(operationRow);
      const pendingWakeOptions = {
        cause: TEST_REPLICA_OPERATION_DISPATCH_DELIVERY_SOURCE,
      };

      const dispatchResult = await coordinator.dispatchOperation(
        pendingWakeOperation,
        pendingWakeOptions,
      );

      t.equal(
        dispatchResult?.success,
        true,
        TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_SUCCESS,
      );
      t.equal(
        deliveries.length,
        NUM.ZERO,
        TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_NO_CREATE,
      );
      t.equal(
        operationRow.workflow_step,
        TEST_STEP_CREATING,
        TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_ACCEPTED_STEP,
      );
      t.equal(
        operationRow.status,
        TEST_STATUS_CREATING,
        TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_ACCEPTED_STATUS,
      );
      t.ok(
        updateCount >= NUM.ONE,
        TEST_ASSERT_SQL_PRIORITY_PENDING_WAKE_ACCEPTED_STEP,
      );
    } finally {
      await coordinator.shutdown();
    }
  });

registerCase(TEST_SQL_PRIORITY_STALE_VISIBILITY_REDISPATCH_TEST_NAME, async (t) => {
  const deliveries = [];
  const updateOptions = [];
  let updateCount = 0;
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;
  const operationRow = buildPendingOperationRow({
    operationId: TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID,
    partitionId: TEST_PARTITION_ID,
    replicaId: TEST_REPLICA_ID,
    nowMs: TEST_CAPTURED_AT_MS,
  });

  const sqlQueryEngine = {
    async executeQuery(sql, params = [], options = {}) {
      const normalizedSql = String(sql);
      if (normalizedSql.startsWith(TEST_UPDATE_REPLICA_OPERATIONS_PREFIX)) {
        updateCount += 1;
        updateOptions.push({...options});
        if (updateCount === NUM.ONE) {
          operationRow.status = params[NUM.ZERO];
          operationRow.workflow_step = params[NUM.ONE];
          operationRow.updated_at = params[NUM.TWO];
          operationRow.completed_at = params[NUM.THREE];
          operationRow.error_message = params[NUM.FOUR];
          operationRow.steps_history = params[NUM.FIVE];
          operationRow.replica_id = params[NUM.SIX];
        }
        return {
          success: true,
          affectedRows: NUM.ONE,
        };
      }
      if (
        normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT) &&
        normalizedSql.includes(TEST_QUERY_OPERATION_BY_ID_FRAGMENT)
      ) {
        const operationId = params[NUM.ZERO];
        return {
          success: true,
          rows: operationId === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID ?
            [{...operationRow}] :
            [],
          affectedRows:
            operationId === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID ?
              NUM.ONE :
              NUM.ZERO,
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
    nodeId: TEST_TARGET_NODE_ID,
    replicaOperationDispatchTimeoutMs: TEST_HANDOFF_TIMEOUT_MS,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return null;
        }
        return key === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID ?
          operationRow :
          null;
      },
      getAll(tableName) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow];
      },
      filter(tableName, predicate) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return [];
        }
        return [operationRow].filter(predicate);
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
    enableTimeouts: false,
  });
  coordinator.workflowOwner.repository
    .replicaOperationAuthoritativeVisibilityTimeoutMs = NUM.ZERO;

  const pendingTimeoutMs = coordinator.getTimeoutForStep(
    WORKFLOW_STEP.PENDING,
    {partitionId: TEST_PARTITION_ID},
  );
  operationRow.created_at =
    TEST_CAPTURED_AT_MS - pendingTimeoutMs - TEST_TIMEOUT_OVERRUN_MS;
  operationRow.updated_at = operationRow.created_at;
  operationRow.steps_history = JSON.stringify([{
    step: TEST_STEP_PENDING,
    timestamp: operationRow.updated_at - TEST_STEP_HISTORY_LAG_MS,
  }]);

  try {
    coordinator.initialize();

    await coordinator.checkTimeouts();

    const snapshot =
      await coordinator.workflowOwner
        .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
          TEST_PARTITION_ID,
          TEST_EMPTY_LIST,
        );

    t.equal(
      deliveries.length,
      NUM.ONE,
      TEST_ASSERT_SQL_PRIORITY_DISPATCH,
    );
    t.equal(
      updateCount,
      NUM.TWO,
      TEST_ASSERT_SQL_PRIORITY_TRANSITIONS,
    );
    t.equal(
      operationRow.workflow_step,
      TEST_STEP_SENDING,
      TEST_ASSERT_SQL_PRIORITY_STALE_ROW,
    );
    t.equal(
      updateOptions[NUM.ZERO]?.timeoutBudget?.configuredBudgetMs,
      TEST_PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS,
      TEST_ASSERT_SQL_PRIORITY_CLAIM_BOUNDED_BUDGET,
    );
    t.ok(
      updateOptions[NUM.ZERO]?.timeoutMs <=
        TEST_PRIORITY_DISPATCH_TRANSITION_MUTATION_BUDGET_MS &&
        updateOptions[NUM.ZERO]?.timeoutMs > NUM.ZERO,
      TEST_ASSERT_SQL_PRIORITY_CLAIM_BOUNDED_BUDGET,
    );
    t.equal(
      snapshot?.coordinator?.operation?.workflowStep,
      TEST_STEP_CREATING,
      TEST_ASSERT_SQL_PRIORITY_SNAPSHOT_STEP,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

}
