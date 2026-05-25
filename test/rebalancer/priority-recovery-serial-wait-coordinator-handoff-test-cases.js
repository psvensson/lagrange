export function registerPriorityRecoverySerialWaitCoordinatorHandoffTestCases({registerCase, dependencies}) {
  const {
    NUM, PRIORITY_RECOVERY_ACTUATION_STATE, PRIORITY_RECOVERY_BLOCKING_BOUNDARY, PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION, PRIORITY_RECOVERY_SEMANTIC_STATE, PRIORITY_RECOVERY_WAIT_MODE, PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE, TEST_ASSERT_LOCAL_OWNER_HANDOFF_RETRY_CONSUMED,
    TEST_ASSERT_LOCAL_OWNER_NO_HANDOFF_TIMER, TEST_ASSERT_LOCAL_OWNER_SCHEDULE_REJECTED, TEST_ASSERT_LOCAL_OWNER_TRANSITION_GRACE_REMAINS, TEST_CAPTURED_AT_MS, TEST_COORDINATOR_CREATED_REMOTE_HANDOFF, TEST_DELIVERY_STATUS_INITIATED, TEST_EMPTY_LIST, TEST_EMPTY_VALUE,
    TEST_ENTITY_TYPE_PARTITION, TEST_HANDOFF_TIMEOUT_MS, TEST_LOCAL_OWNER_PARTITION_ID, TEST_LOCAL_OWNER_REMOTE_HANDOFF_GUARD_TEST_NAME, TEST_LOCAL_OWNER_REPLICA_ID, TEST_MICROTASK_DELAY_MS, TEST_MIN_REPLICA_COUNT, TEST_OBSERVER_NODE_ID,
    TEST_OPERATION_CREATED_AT_MS, TEST_OPERATION_ID, TEST_OPERATION_TYPE_REPLACE, TEST_PARTITION_ID, TEST_PUBLICATION_EPOCH, TEST_PUBLICATION_STATUS_PUBLISHED, TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT, TEST_QUERY_SERVICES_FRAGMENT,
    TEST_READY_DISTINCT_NODE_COUNT, TEST_READY_ELIGIBLE_NODE_COUNT, TEST_REPLICA_DISPATCH_TARGET, TEST_REPLICA_ID, TEST_REPLICA_OPERATION_DISPATCH_DELIVERY_SOURCE, TEST_REQUIRED_DISTINCT_NODE_COUNT, TEST_RETRYABLE_HANDOFF_ERROR, TEST_RETRY_AFTER_MS,
    TEST_SERIAL_WAIT_OPERATION_IDS, TEST_SERIAL_WAIT_PARTITION_IDS, TEST_SOURCE_NODE_ID, TEST_SPREAD_GAP, TEST_STATUS_PENDING, TEST_STEP_HISTORY_LAG_MS, TEST_STEP_PENDING, TEST_STEP_SENDING,
    TEST_STEP_TIMEOUT_MS, TEST_TARGET_NODE_ID, TEST_TIMELINE_LENGTH, TEST_TIMELINE_STEP_COUNT, TEST_UNDEFINED_VALUE, buildPriorityRecoveryDecisionSnapshot, buildRemoteDispatchPendingOperationOwnerOutcome, buildSerialWaitReentryPlanningSnapshot,
    buildTransactionCoordinator, createCoordinator,
  } = dependencies;

registerCase('priority recovery snapshots re-enter serial-wait PENDING rows through ' +
  'the workflow owner',
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
        return buildSerialWaitReentryPlanningSnapshot();
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
          state: 'present',
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

    t.same(
      snapshot?.blockerReasons,
      TEST_EMPTY_LIST,
      'serial-wait PENDING rows with durable operation evidence should clear the stale serial blocker',
    );
    t.equal(
      snapshot?.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
      'serial-wait PENDING rows should be classified as in-flight workflow progress',
    );
    t.equal(
      snapshot?.progress?.workflowProgressPhaseId,
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
      'serial-wait PENDING rows should enter the dispatch-pending workflow phase',
    );
    t.equal(
      snapshot?.progress?.nextRequiredAction,
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      'serial-wait PENDING rows should surface owner advancement',
    );
    t.same(
      snapshot?.coordinator?.serialWaitOperationIds,
      TEST_SERIAL_WAIT_OPERATION_IDS,
      'serial-wait PENDING rows should retain the source operation witness',
    );
    t.same(
      snapshot?.coordinator?.serialWaitPartitionIds,
      TEST_SERIAL_WAIT_PARTITION_IDS,
      'serial-wait PENDING rows should retain the source partition witness',
    );
    t.equal(
      deliveries.length,
      NUM.ONE,
      'serial-wait PENDING rows should wake the remote owner and keep bounded verification',
    );
    t.equal(
      deliveries[NUM.ZERO]?.target,
      TEST_REPLICA_DISPATCH_TARGET,
      'serial-wait re-entry should use the canonical remote dispatch ingress',
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      'serial-wait re-entry should arm one verification retry',
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

registerCase(TEST_LOCAL_OWNER_REMOTE_HANDOFF_GUARD_TEST_NAME, async (t) => {
  const deferredTimers = [];
  const nowMs = Date.now();
  const operationRow = {
    operation_id: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partition_id: TEST_LOCAL_OWNER_PARTITION_ID,
    replica_id: TEST_LOCAL_OWNER_REPLICA_ID,
    source_node_id: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: TEST_STATUS_PENDING,
    workflow_step: TEST_STEP_SENDING,
    created_at: nowMs,
    updated_at: nowMs,
    completed_at: TEST_EMPTY_VALUE,
    error_message: TEST_EMPTY_VALUE,
    steps_history: JSON.stringify([{
      step: TEST_STEP_SENDING,
      timestamp: nowMs - TEST_STEP_HISTORY_LAG_MS,
    }]),
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_LOCAL_OWNER_PARTITION_ID,
  };

  const coordinator = createCoordinator({
    nodeId: TEST_TARGET_NODE_ID,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get() {
        return operationRow;
      },
      getAll() {
        return [operationRow];
      },
      filter(_tableName, predicate) {
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
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: TEST_MIN_REPLICA_COUNT};
      },
    },
    messageRouter: {
      async deliver() {
        return {acknowledged: true, status: TEST_DELIVERY_STATUS_INITIATED};
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
    coordinator.workflowOwner.recordTransitionRetryGrace(
      TEST_OPERATION_ID,
      {
        boundary: TEST_REPLICA_OPERATION_DISPATCH_DELIVERY_SOURCE,
        partitionId: TEST_LOCAL_OWNER_PARTITION_ID,
        workflowStep: TEST_STEP_SENDING,
        updatedAt: operationRow.updated_at,
        createdAt: operationRow.created_at,
      },
      TEST_RETRY_AFTER_MS,
    );

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
      TEST_ASSERT_LOCAL_OWNER_HANDOFF_RETRY_CONSUMED,
    );
    t.equal(
      coordinator.workflowOwner.createdOperationHandoffRetryTimerByOperationId
        .size,
      NUM.ZERO,
      TEST_ASSERT_LOCAL_OWNER_NO_HANDOFF_TIMER,
    );
    t.equal(
      deferredTimers.length,
      NUM.ZERO,
      TEST_ASSERT_LOCAL_OWNER_NO_HANDOFF_TIMER,
    );
    t.equal(
      coordinator.workflowOwner.scheduleCoordinatorCreatedRemoteHandoffFollowUp(
        operation,
        TEST_RETRY_AFTER_MS,
      ),
      false,
      TEST_ASSERT_LOCAL_OWNER_SCHEDULE_REJECTED,
    );
    t.equal(
      coordinator.workflowOwner.hasActiveTransitionRetryGrace(
        TEST_OPERATION_ID,
      ),
      true,
      TEST_ASSERT_LOCAL_OWNER_TRANSITION_GRACE_REMAINS,
    );
  } finally {
    await coordinator.shutdown();
  }
});

registerCase('coordinator-created remote handoff uses bounded priority delivery for ' +
  'dispatch-pending PENDING rows',
async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  const nowMs = Date.now();
  const operationRow = {
    operation_id: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: TEST_STATUS_PENDING,
    workflow_step: TEST_STEP_PENDING,
    created_at: nowMs,
    updated_at: nowMs,
    completed_at: TEST_EMPTY_VALUE,
    error_message: TEST_EMPTY_VALUE,
    steps_history: JSON.stringify([{
      step: TEST_STEP_PENDING,
      timestamp: nowMs - TEST_STEP_HISTORY_LAG_MS,
    }]),
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_PARTITION_ID,
  };

  const coordinator = createCoordinator({
    nodeId: TEST_SOURCE_NODE_ID,
    replicaOperationDispatchTimeoutMs: TEST_HANDOFF_TIMEOUT_MS,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== 'replica_operations') {
          return null;
        }
        return key === TEST_OPERATION_ID ? operationRow : null;
      },
      getAll(tableName) {
        if (tableName !== 'replica_operations') {
          return [];
        }
        return [operationRow];
      },
      filter(tableName, predicate) {
        if (tableName !== 'replica_operations') {
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
        return {
          acknowledged: false,
          error: TEST_RETRYABLE_HANDOFF_ERROR,
          deferRetry: true,
          retryAfterMs: TEST_RETRY_AFTER_MS,
        };
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 3};
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
  coordinator.initialize();

  const cachedOperation =
    coordinator.repository.queryCachedIncompleteOperations()[0];

  await coordinator.workflowOwner.armCoordinatorCreatedOperation(
    cachedOperation,
  );

  t.equal(
    deliveries.length,
    1,
    'remote-owned dispatch-pending priority rows should wake the target owner immediately',
  );
  t.equal(
    deliveries[0]?.target,
    TEST_REPLICA_DISPATCH_TARGET,
    'remote handoff should target the canonical target-owner replica-dispatch ingress',
  );
  t.equal(
    deliveries[0]?.options?.timeoutMs,
    TEST_HANDOFF_TIMEOUT_MS,
    'remote handoff should carry a bounded timeout so transport cannot strand PENDING workflow progress',
  );
  t.equal(
    deliveries[0]?.options?.deliverySource,
    TEST_COORDINATOR_CREATED_REMOTE_HANDOFF,
    'remote handoff should identify the coordinator-created handoff boundary to transport',
  );
  t.equal(
    deferredTimers.length,
    1,
    'retryable bounded handoff failure should arm a prompt verification retry',
  );
  t.equal(
    deferredTimers[0]?.delayMs,
    TEST_RETRY_AFTER_MS,
    'remote handoff retry should honor the bounded delivery retry-after value',
  );

  await coordinator.shutdown();
});

registerCase('priority recovery snapshot builder reclassifies stale dispatch-pending ' +
  'PENDING rows to owner advancement',
(t) => {
  const snapshot = buildPriorityRecoveryDecisionSnapshot({
    partitionId: TEST_PARTITION_ID,
    capturedAt: TEST_CAPTURED_AT_MS,
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    publicationConvergence: {
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
      publishedActiveNodeIds: [
        TEST_SOURCE_NODE_ID,
        TEST_TARGET_NODE_ID,
      ],
      pendingAckNodeIds: TEST_EMPTY_LIST,
      pendingAckCount: NUM.ZERO,
    },
    priorityPartitionSummary: {
      blockedPartitions: [{
        partitionId: TEST_PARTITION_ID,
        spreadGap: TEST_SPREAD_GAP,
        readyDistinctNodeCount: TEST_READY_DISTINCT_NODE_COUNT,
        requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
      }],
      readyEligibleNodeCount: TEST_READY_ELIGIBLE_NODE_COUNT,
    },
    operationContexts: [{
      operationId: TEST_OPERATION_ID,
      partitionId: TEST_PARTITION_ID,
      type: TEST_OPERATION_TYPE_REPLACE,
      status: TEST_STATUS_PENDING,
      workflowStep: TEST_STEP_PENDING,
      sourceNodeId: TEST_SOURCE_NODE_ID,
      targetNodeId: TEST_TARGET_NODE_ID,
      replicaId: TEST_REPLICA_ID,
      createdAtMs: TEST_OPERATION_CREATED_AT_MS,
      updatedAtMs: TEST_OPERATION_CREATED_AT_MS,
      stepTimeoutMs: TEST_STEP_TIMEOUT_MS,
      timelineLength: TEST_TIMELINE_LENGTH,
      timelineStepCount: TEST_TIMELINE_STEP_COUNT,
      latestTimelineStep: TEST_STEP_PENDING,
      latestTimelineStatus: TEST_STATUS_PENDING,
      latestTimelineInFlight: true,
    }],
    stepTimeoutMsByWorkflowStep: {
      [TEST_STEP_PENDING]: TEST_STEP_TIMEOUT_MS,
    },
    operationOwnerOutcome: buildRemoteDispatchPendingOperationOwnerOutcome(),
  });

  t.equal(
    snapshot?.semanticState,
    PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
    'stale dispatch-pending rows should remain in-flight, not operation-stalled',
  );
  t.same(
    snapshot?.blockerReasons,
    TEST_EMPTY_LIST,
    'stale dispatch-pending timeout blocker reasons should be cleared',
  );
  t.equal(
    snapshot?.actuation?.state,
    PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
    'stale dispatch-pending rows should preserve persisted-not-dispatched actuation',
  );
  t.equal(
    snapshot?.progress?.nextRequiredAction,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
    'stale dispatch-pending rows should ask the owner to advance the existing operation',
  );
  t.equal(
    snapshot?.progress?.blockingBoundary,
    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
    'stale dispatch-pending rows should not remain on workflow_timeout',
  );
  t.equal(
    snapshot?.progress?.waitMode,
    PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
    'stale dispatch-pending rows should return to event-driven owner progress',
  );

  t.end();
});

}
