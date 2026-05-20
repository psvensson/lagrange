export function registerPriorityRecoveryTopologyTimeoutOwnerReentryTestCases({registerCase, dependencies}) {
  const {
    NUM, OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES, OPERATION_WORKFLOW_OUTCOME_VALUES, OPERATION_WORKFLOW_OWNER, PRIORITY_RECOVERY_ACTUATION_STATE, PRIORITY_RECOVERY_BLOCKING_BOUNDARY, PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION, PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION, PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE, PRIORITY_RECOVERY_WAIT_MODE,
    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE, TEST_ACTUAL_STATUS_ABSENT, TEST_ASSERT_LONGER_GRACE_REMAINS_ACTIVE, TEST_ASSERT_STALE_HANDOFF_ARMS_RETRY, TEST_ASSERT_STALE_HANDOFF_REMAINS_SINGLE_TIMER, TEST_ASSERT_STALE_HANDOFF_REPLACES_TIMER, TEST_ASSERT_STALE_HANDOFF_REWAKES_REMOTE_OWNER, TEST_ASSERT_STALE_HANDOFF_REWAKE_TARGET,
    TEST_CAPTURED_AT_MS, TEST_COORDINATOR_CREATED_REMOTE_HANDOFF, TEST_DEFERRED_RETRY_PENDING_REASON, TEST_DEFERRED_VISIBILITY_STATE, TEST_DELIVERY_STATUS_INITIATED, TEST_DISPATCH_SUCCESS, TEST_EMPTY_LIST, TEST_EMPTY_VALUE,
    TEST_ENTITY_TYPE_PARTITION, TEST_HANDOFF_TIMEOUT_MS, TEST_LOCAL_OWNER_PARTITION_ID, TEST_LOCAL_OWNER_REPLICA_ID, TEST_LONG_REMOTE_HANDOFF_GRACE_MS, TEST_MIN_REPLICA_COUNT, TEST_OPERATION_CREATED_AT_MS, TEST_OPERATION_ID,
    TEST_OPERATION_OWNER_CORRELATION_KEY, TEST_OPERATION_TYPE_REPLACE, TEST_PARTITION_ID, TEST_PUBLICATION_EPOCH, TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT, TEST_QUERY_SERVICES_FRAGMENT, TEST_REPLICA_DISPATCH_TARGET, TEST_REPLICA_HANDLER_DISPATCH_TARGET,
    TEST_REPLICA_ID, TEST_REPLICA_OPERATIONS_TABLE, TEST_RETRYABLE_HANDOFF_ERROR, TEST_RETRY_AFTER_MS, TEST_SOURCE_NODE_ID, TEST_STALE_REMOTE_HANDOFF_REWAKE_TEST_NAME, TEST_STATUS_CREATING, TEST_STATUS_PENDING,
    TEST_STEP_CREATING, TEST_STEP_HISTORY_LAG_MS, TEST_STEP_PENDING, TEST_STEP_SENDING, TEST_STEP_TIMEOUT_MS, TEST_TARGET_NODE_ID, TEST_TIMELINE_LENGTH, TEST_TIMELINE_STEP_COUNT,
    TEST_TIMEOUT_OVERRUN_MS, TEST_TOPOLOGY_OPERATOR_ACTIVE_GATE_BOUNDARY, TEST_TOPOLOGY_OPERATOR_ACTIVE_GATE_OWNER, TEST_TOPOLOGY_OPERATOR_ACTIVE_GATE_RECONCILE_STEP, TEST_TOPOLOGY_OPERATOR_KIND_ACTIVE_GATE_RECONCILE, TEST_TOPOLOGY_OPERATOR_KIND_PUBLICATION_ACK, TEST_TOPOLOGY_OPERATOR_PUBLICATION_ACK_STEP,
    TEST_TOPOLOGY_OPERATOR_PUBLICATION_BOUNDARY, TEST_TOPOLOGY_OPERATOR_PUBLICATION_OWNER, TEST_TOPOLOGY_OPERATOR_RECONCILE_ACTIVE_GATE, TEST_TOPOLOGY_OPERATOR_WAIT_FOR_PUBLICATION_ACK, TEST_TOPOLOGY_OPERATOR_WITNESS_STATE, TEST_TRANSITION_RETRY_SNAPSHOT_REENTRY_TEST_NAME, WORKFLOW_STEP,
    assertTopologyOperatorWitness, buildDispatchPendingReentryPlanningSnapshot, buildPriorityRecoveryDecisionSnapshot, buildPriorityRecoveryObservationSnapshot, buildRemoteDispatchPendingOperationOwnerOutcome, buildRetryableTransitionFailure, buildTransactionCoordinator, createCoordinator,
    createTopologyOperatorWitnessCoordinator,
  } = dependencies;

registerCase('topology operator witness maps dispatch-pending owner progress',
(t) => {
  const coordinator = createTopologyOperatorWitnessCoordinator();
  const snapshot = buildPriorityRecoveryDecisionSnapshot({
    partitionId: TEST_PARTITION_ID,
    capturedAt: TEST_CAPTURED_AT_MS,
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    publicationConvergence: buildDispatchPendingReentryPlanningSnapshot(),
    priorityPartitionSummary:
      buildDispatchPendingReentryPlanningSnapshot().priorityPartitionSummary,
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
    operationId: TEST_OPERATION_ID,
    stepTimeoutMsByWorkflowStep: {
      [TEST_STEP_PENDING]: TEST_STEP_TIMEOUT_MS,
    },
    operationOwnerOutcome: buildRemoteDispatchPendingOperationOwnerOutcome(),
  });
  const expectedWitness = {
    operatorId: TEST_OPERATION_ID,
    owner: OPERATION_WORKFLOW_OWNER,
    boundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
    kind: TEST_OPERATION_TYPE_REPLACE,
    partitionId: TEST_PARTITION_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    currentStepId: PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    currentStepState: TEST_TOPOLOGY_OPERATOR_WITNESS_STATE.PLANNED,
    nextAction:
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
    message: 'dispatch-pending owner progress should produce a step witness',
  };
  const liveWitness = snapshot.progress.topologyOperatorWitness;
  assertTopologyOperatorWitness(t, liveWitness, expectedWitness);
  t.same(
    snapshot.topologyOperatorWitness,
    liveWitness,
    'decision snapshots should expose the live topology witness at the summary boundary',
  );
  const observation = buildPriorityRecoveryObservationSnapshot({
    publicationConvergence: buildDispatchPendingReentryPlanningSnapshot(),
    priorityRecoveryDecisionSnapshots: Object.freeze({
      schemaVersion: NUM.ONE,
      capturedAt: TEST_CAPTURED_AT_MS,
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      snapshots: Object.freeze([snapshot]),
    }),
  });
  const partitionWitness =
    observation.priorityRecoveryPartitionWitnesses.find((entry) =>
      entry.partitionId === TEST_PARTITION_ID,
    );
  assertTopologyOperatorWitness(
    t,
    partitionWitness?.topologyOperatorWitness,
    expectedWitness,
  );
  const witness =
    coordinator.workflowOwner.buildTopologyOperatorWitnessFromWorkflowProgress(
      snapshot,
    );

  assertTopologyOperatorWitness(t, witness, expectedWitness);
  t.end();
});

registerCase('topology operator witness maps owner retry progress',
(t) => {
  const coordinator = createTopologyOperatorWitnessCoordinator();
  const witness =
    coordinator.workflowOwner.buildTopologyOperatorWitnessFromWorkflowProgress({
      operationId: TEST_OPERATION_ID,
      partitionId: TEST_PARTITION_ID,
      capturedAt: TEST_CAPTURED_AT_MS,
      actuation: {
        state: PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
      },
      coordinator: {
        operation: {
          operationId: TEST_OPERATION_ID,
          partitionId: TEST_PARTITION_ID,
          targetNodeId: TEST_TARGET_NODE_ID,
          type: TEST_OPERATION_TYPE_REPLACE,
          updatedAtMs: TEST_OPERATION_CREATED_AT_MS,
        },
      },
      progress: {
        currentOwner: OPERATION_WORKFLOW_OWNER,
        blockingBoundary:
          PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
        workflowProgressPhaseId:
          PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
        waitMode: PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
        nextRequiredAction:
          PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
        stepTimeoutMs: TEST_STEP_TIMEOUT_MS,
      },
    });

  assertTopologyOperatorWitness(t, witness, {
    operatorId: TEST_OPERATION_ID,
    owner: OPERATION_WORKFLOW_OWNER,
    boundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
    kind: TEST_OPERATION_TYPE_REPLACE,
    partitionId: TEST_PARTITION_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    currentStepId: PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    currentStepState: TEST_TOPOLOGY_OPERATOR_WITNESS_STATE.RETRY_SCHEDULED,
    nextAction:
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
    message: 'owner retry progress should produce a retry step witness',
  });
  t.end();
});

registerCase('topology operator witness maps publication ACK progress',
(t) => {
  const coordinator = createTopologyOperatorWitnessCoordinator();
  const witness =
    coordinator.workflowOwner.buildTopologyOperatorWitnessFromWorkflowProgress(
      {},
      {
        operatorId: String(TEST_PUBLICATION_EPOCH),
        owner: TEST_TOPOLOGY_OPERATOR_PUBLICATION_OWNER,
        boundary: TEST_TOPOLOGY_OPERATOR_PUBLICATION_BOUNDARY,
        kind: TEST_TOPOLOGY_OPERATOR_KIND_PUBLICATION_ACK,
        partitionId: TEST_LOCAL_OWNER_PARTITION_ID,
        targetNodeId: TEST_TARGET_NODE_ID,
        currentStepId: TEST_TOPOLOGY_OPERATOR_PUBLICATION_ACK_STEP,
        currentStepState: TEST_TOPOLOGY_OPERATOR_WITNESS_STATE.OBSERVED,
        nextAction: TEST_TOPOLOGY_OPERATOR_WAIT_FOR_PUBLICATION_ACK,
        deadlineMs: TEST_CAPTURED_AT_MS + TEST_STEP_TIMEOUT_MS,
        lastObservedAtMs: TEST_CAPTURED_AT_MS,
      },
    );

  assertTopologyOperatorWitness(t, witness, {
    operatorId: String(TEST_PUBLICATION_EPOCH),
    owner: TEST_TOPOLOGY_OPERATOR_PUBLICATION_OWNER,
    boundary: TEST_TOPOLOGY_OPERATOR_PUBLICATION_BOUNDARY,
    kind: TEST_TOPOLOGY_OPERATOR_KIND_PUBLICATION_ACK,
    partitionId: TEST_LOCAL_OWNER_PARTITION_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    currentStepId: TEST_TOPOLOGY_OPERATOR_PUBLICATION_ACK_STEP,
    currentStepState: TEST_TOPOLOGY_OPERATOR_WITNESS_STATE.OBSERVED,
    nextAction: TEST_TOPOLOGY_OPERATOR_WAIT_FOR_PUBLICATION_ACK,
    message: 'publication ACK progress should produce a step witness',
  });
  t.end();
});

registerCase('topology operator witness maps active-gate reconcile progress',
(t) => {
  const coordinator = createTopologyOperatorWitnessCoordinator();
  const witness =
    coordinator.workflowOwner.buildTopologyOperatorWitnessFromWorkflowProgress(
      {},
      {
        operatorId: TEST_OPERATION_OWNER_CORRELATION_KEY,
        owner: TEST_TOPOLOGY_OPERATOR_ACTIVE_GATE_OWNER,
        boundary: TEST_TOPOLOGY_OPERATOR_ACTIVE_GATE_BOUNDARY,
        kind: TEST_TOPOLOGY_OPERATOR_KIND_ACTIVE_GATE_RECONCILE,
        partitionId: TEST_LOCAL_OWNER_PARTITION_ID,
        targetNodeId: TEST_TARGET_NODE_ID,
        currentStepId: TEST_TOPOLOGY_OPERATOR_ACTIVE_GATE_RECONCILE_STEP,
        currentStepState: TEST_TOPOLOGY_OPERATOR_WITNESS_STATE.PLANNED,
        nextAction: TEST_TOPOLOGY_OPERATOR_RECONCILE_ACTIVE_GATE,
        deadlineMs: TEST_CAPTURED_AT_MS + TEST_STEP_TIMEOUT_MS,
        lastObservedAtMs: TEST_CAPTURED_AT_MS,
      },
    );

  assertTopologyOperatorWitness(t, witness, {
    operatorId: TEST_OPERATION_OWNER_CORRELATION_KEY,
    owner: TEST_TOPOLOGY_OPERATOR_ACTIVE_GATE_OWNER,
    boundary: TEST_TOPOLOGY_OPERATOR_ACTIVE_GATE_BOUNDARY,
    kind: TEST_TOPOLOGY_OPERATOR_KIND_ACTIVE_GATE_RECONCILE,
    partitionId: TEST_LOCAL_OWNER_PARTITION_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    currentStepId: TEST_TOPOLOGY_OPERATOR_ACTIVE_GATE_RECONCILE_STEP,
    currentStepState: TEST_TOPOLOGY_OPERATOR_WITNESS_STATE.PLANNED,
    nextAction: TEST_TOPOLOGY_OPERATOR_RECONCILE_ACTIVE_GATE,
    message: 'active-gate reconcile progress should produce a step witness',
  });
  t.end();
});

registerCase(TEST_TRANSITION_RETRY_SNAPSHOT_REENTRY_TEST_NAME,
async (t) => {
  const deferredTimers = [];
  const resumedDispatchOperations = [];
  const nowMs = Date.now();
  const operation = Object.freeze({
    operationId: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partitionId: TEST_PARTITION_ID,
    entityType: TEST_ENTITY_TYPE_PARTITION,
    entityId: TEST_PARTITION_ID,
    replicaId: TEST_REPLICA_ID,
    sourceNodeId: TEST_SOURCE_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    status: TEST_STATUS_PENDING,
    workflowStep: TEST_STEP_PENDING,
    createdAt: nowMs,
    updatedAt: nowMs,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    stepsHistory: TEST_EMPTY_LIST,
  });
  const coordinator = createCoordinator({
    nodeId: TEST_TARGET_NODE_ID,
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
        return {
          acknowledged: true,
          status: TEST_DELIVERY_STATUS_INITIATED,
        };
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
  coordinator.workflowOwner.repository.queryAuthoritativeOperationById =
    async () => TEST_EMPTY_VALUE;
  coordinator.workflowOwner.repository.getOperationByIdVisibilityObservation =
    async () => Object.freeze({
      operation: TEST_EMPTY_VALUE,
      deferredOutcome: Object.freeze({
        state: TEST_DEFERRED_VISIBILITY_STATE,
      }),
    });
  coordinator.workflowOwner.claimPendingDispatchOperation = async () => {
    throw buildRetryableTransitionFailure();
  };
  coordinator.workflowOwner.dispatchOperationInternal =
    async (dispatchOperation) => {
      resumedDispatchOperations.push(dispatchOperation);
      return TEST_DISPATCH_SUCCESS;
    };

  try {
    const applied =
      await coordinator.workflowOwner.armCoordinatorCreatedOperation(operation);
    const retrySnapshot =
      coordinator.workflowOwner.getTransitionRetryOperationSnapshot(
        TEST_OPERATION_ID,
      );

    t.equal(
      applied?.outcome?.outcome,
      OPERATION_WORKFLOW_OUTCOME_VALUES.DISPATCH_LOCAL_OWNER,
      'retryable coordinator-created claim failures should persist the owner progress outcome',
    );
    t.equal(
      applied?.outcome?.effectCommand,
      OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.DISPATCH_LOCAL_OWNER_COMMAND,
      'retryable coordinator-created claim failures should keep the local dispatch command as the deferred effect',
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      'the retryable claim failure should arm one transition retry',
    );
    t.equal(
      retrySnapshot?.operationId,
      TEST_OPERATION_ID,
      'the transition retry should retain the adapter operation snapshot',
    );

    await deferredTimers[NUM.ZERO].fn();

    t.equal(
      resumedDispatchOperations.length,
      NUM.ONE,
      'deferred visibility should re-enter dispatch from the retained snapshot',
    );
    t.equal(
      resumedDispatchOperations[NUM.ZERO]?.operationId,
      TEST_OPERATION_ID,
      'deferred retry dispatch should use the original operation id',
    );
    t.equal(
      resumedDispatchOperations[NUM.ZERO]?.workflowStep,
      TEST_STEP_PENDING,
      'deferred retry dispatch should preserve the dispatch-pending workflow step',
    );
  } finally {
    await coordinator.shutdown();
  }
});

registerCase('dispatch transition retries preserve priority owner context after ' +
  'the step timeout',
async (t) => {
  const deferredTimers = [];
  const resumedDispatchOperations = [];
  let claimAttempts = NUM.ZERO;
  const originalDateNow = Date.now;
  Date.now = () => TEST_CAPTURED_AT_MS;
  const operationCreatedAt =
    TEST_CAPTURED_AT_MS - TEST_STEP_TIMEOUT_MS - TEST_TIMEOUT_OVERRUN_MS;
  const operation = {
    operationId: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partitionId: TEST_LOCAL_OWNER_PARTITION_ID,
    entityType: TEST_ENTITY_TYPE_PARTITION,
    entityId: TEST_LOCAL_OWNER_PARTITION_ID,
    replicaId: TEST_LOCAL_OWNER_REPLICA_ID,
    sourceNodeId: TEST_SOURCE_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    status: TEST_STATUS_PENDING,
    workflowStep: TEST_STEP_PENDING,
    createdAt: operationCreatedAt,
    updatedAt: operationCreatedAt,
    stepsHistory: [],
  };
  const coordinator = createCoordinator({
    nodeId: TEST_TARGET_NODE_ID,
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
        return {
          acknowledged: true,
          status: TEST_DELIVERY_STATUS_INITIATED,
        };
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
  coordinator.workflowOwner.repository.getOperationByIdVisibilityObservation =
    async () => Object.freeze({
      operation: TEST_EMPTY_VALUE,
      deferredOutcome: Object.freeze({
        state: TEST_DEFERRED_VISIBILITY_STATE,
      }),
    });
  coordinator.workflowOwner.claimPendingDispatchOperation =
    async (dispatchOperation) => {
      claimAttempts += NUM.ONE;
      if (claimAttempts === NUM.ONE) {
        throw buildRetryableTransitionFailure();
      }
      return {
        ...dispatchOperation,
        status: TEST_STATUS_CREATING,
        workflowStep: TEST_STEP_SENDING,
      };
    };
  coordinator.workflowOwner.executeOperationInternal =
    async (dispatchOperation) => {
      resumedDispatchOperations.push(dispatchOperation);
      return TEST_DISPATCH_SUCCESS;
    };

  try {
    const dispatchResult =
      await coordinator.workflowOwner.dispatchOperation(operation);

    t.equal(
      dispatchResult?.reason,
      TEST_DEFERRED_RETRY_PENDING_REASON,
      'retryable transition pressure should defer the dispatch path',
    );
    t.equal(
      deferredTimers.length,
      NUM.ONE,
      'the transition failure should arm one retry timer',
    );
    t.equal(
      coordinator.workflowOwner.hasActiveTransitionRetryGrace(
        TEST_OPERATION_ID,
      ),
      true,
      'priority control-plane dispatch retries should keep operation-budget grace after the step timeout',
    );

    await deferredTimers[NUM.ZERO].fn();

    t.equal(
      resumedDispatchOperations.length,
      NUM.ONE,
      'deferred transition retry should re-enter dispatch instead of timeout reconcile',
    );
    t.equal(
      resumedDispatchOperations[NUM.ZERO]?.partitionId,
      TEST_LOCAL_OWNER_PARTITION_ID,
      'deferred retry dispatch should preserve the priority partition context',
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

registerCase('checkTimeouts re-wakes restart-discovered remote-owned priority ' +
  'dispatch-pending PENDING rows while the operation budget is still active',
async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  let deliveryAttempt = 0;
  let updateCount = 0;
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

  const sqlQueryEngine = {
    async executeQuery(sql, params = [], options = {}) {
      const normalizedSql = String(sql);
      if (normalizedSql.includes('FROM replica_operations')) {
        return {
          success: true,
          rows: [{...operationRow}],
          affectedRows: 1,
        };
      }
      if (normalizedSql.startsWith('UPDATE replica_operations SET')) {
        updateCount += 1;
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
      if (normalizedSql.includes('FROM services')) {
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
    nodeId: TEST_SOURCE_NODE_ID,
    sqlQueryEngine,
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
      async deliver(target, payload) {
        deliveries.push({target, payload});
        deliveryAttempt += 1;
        if (deliveryAttempt === 1) {
          return {
            acknowledged: false,
            error: TEST_RETRYABLE_HANDOFF_ERROR,
            deferRetry: true,
            retryAfterMs: TEST_RETRY_AFTER_MS,
          };
        }
        return {acknowledged: true, status: 'initiated'};
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
  const drainSnapshot =
    await coordinator.workflowOwner.buildPriorityRecoveryOperationDrainSnapshot(
      cachedOperation,
    );

  await coordinator.checkTimeouts();

  t.equal(
    cachedOperation?.operationId,
    TEST_OPERATION_ID,
    'the timeout witness should normalize the cached replica_operations row into one operation contract',
  );
  t.equal(
    coordinator.repository.isOperationLocallyOwned(cachedOperation),
    false,
    'the timeout witness should stay remote-owned on the observing source node',
  );
  t.equal(
    coordinator.workflowOwner.shouldRearmDispatchFromProgressReconcile(
      cachedOperation,
      TEST_ACTUAL_STATUS_ABSENT,
      {now: nowMs},
    ),
    true,
    'the timeout witness should be eligible for dispatch re-arm while its operation budget remains active',
  );
  t.equal(
    drainSnapshot?.ownerState,
    PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_STATE.REMOTE_REARM_REQUIRED,
    'stale remote-owned timeout witnesses should use the explicit remote drain re-arm owner state',
  );
  t.equal(
    drainSnapshot?.ownerAction,
    PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.WAKE_REMOTE_OWNER,
    'stale remote-owned timeout witnesses should route through remote-owner wake instead of staying transition-deferred',
  );

  t.equal(
    deliveries.length,
    1,
    'timeout reconciliation should wake the remote owner once while the retry timer remains armed',
  );
  t.equal(
    deliveries[0]?.target,
    TEST_REPLICA_DISPATCH_TARGET,
    'timeout reconciliation should target the canonical remote replica-dispatch ingress',
  );
  t.equal(
    deferredTimers.length,
    1,
    'timeout reconciliation should arm one remote handoff follow-up timer for the stale PENDING row',
  );
  t.equal(
    coordinator.workflowOwner.createdOperationHandoffRetryTimerByOperationId
      .size,
    1,
    'the remote handoff retry lane should stay armed after timeout reconciliation',
  );
  t.equal(
    operationRow.workflow_step,
    TEST_STEP_PENDING,
    'timeout reconciliation should keep the durable row in PENDING while the remote owner is being re-woken',
  );
  t.equal(
    operationRow.status,
    TEST_STATUS_PENDING,
    'timeout reconciliation should not fail or mutate the remote-owned row while the operation budget is still active',
  );
  t.equal(
    operationRow.error_message,
    TEST_EMPTY_VALUE,
    'timeout reconciliation should not record a timeout failure while the remote owner retry lane is active',
  );
  t.equal(
    updateCount,
    0,
    'timeout reconciliation should not persist step updates for the remote-owned row before remote progress is observed',
  );

  coordinator.initialized = false;
  await deferredTimers[0].fn();

  t.equal(
    deliveries.length,
    2,
    'the deferred remote handoff retry should still wake the remote owner while the source owner is transiently uninitialized',
  );
  t.equal(
    coordinator.workflowOwner.createdOperationHandoffRetryTimerByOperationId
      .size,
    1,
    'the successful remote handoff wake should leave the bounded verification lane armed while source initialization recovers',
  );

  coordinator.initialized = true;
  await deferredTimers[1].fn();

  t.equal(
    deliveries.length,
    3,
    'the verification retry should continue re-entering the owner wake path after source initialization recovers',
  );
  t.equal(
    deliveries[2]?.target,
    TEST_REPLICA_DISPATCH_TARGET,
    'deferred remote handoff retry should use the same canonical replica-dispatch ingress',
  );
  t.equal(
    coordinator.workflowOwner.createdOperationHandoffRetryTimerByOperationId
      .size,
    1,
    'successful retry wake should leave the bounded verification lane armed',
  );
  t.equal(
    updateCount,
    0,
    'deferred remote handoff retry should not mutate the remote-owned row before owner progress is observed',
  );

  await coordinator.shutdown();
});

registerCase(TEST_STALE_REMOTE_HANDOFF_REWAKE_TEST_NAME,
async (t) => {
  const deliveries = [];
  const deferredTimers = [];
  let nowMs = TEST_CAPTURED_AT_MS;
  const originalDateNow = Date.now;
  Date.now = () => nowMs;
  const pendingTimeoutMs = TEST_STEP_TIMEOUT_MS;
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
    updated_at: nowMs - pendingTimeoutMs - TEST_TIMEOUT_OVERRUN_MS,
    completed_at: TEST_EMPTY_VALUE,
    error_message: TEST_EMPTY_VALUE,
    steps_history: JSON.stringify([{
      step: TEST_STEP_PENDING,
      timestamp: nowMs - pendingTimeoutMs - TEST_STEP_HISTORY_LAG_MS,
    }]),
    entity_type: TEST_ENTITY_TYPE_PARTITION,
    entity_id: TEST_PARTITION_ID,
  };

  const sqlQueryEngine = {
    async executeQuery(sql) {
      const normalizedSql = String(sql);
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
    nodeId: TEST_SOURCE_NODE_ID,
    sqlQueryEngine,
    transactionCoordinator: buildTransactionCoordinator(),
    systemTableCache: {
      get(tableName, key) {
        if (tableName !== TEST_REPLICA_OPERATIONS_TABLE) {
          return null;
        }
        return key === TEST_OPERATION_ID ? operationRow : null;
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
      async deliver(target, payload) {
        deliveries.push({target, payload});
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

    const cachedOperation =
      coordinator.repository.queryCachedIncompleteOperations()[0];
    coordinator.workflowOwner.recordTransitionRetryGrace(
      TEST_OPERATION_ID,
      {
        boundary: TEST_COORDINATOR_CREATED_REMOTE_HANDOFF,
        partitionId: TEST_PARTITION_ID,
        workflowStep: TEST_STEP_PENDING,
        updatedAt: operationRow.updated_at,
        createdAt: operationRow.created_at,
      },
      TEST_LONG_REMOTE_HANDOFF_GRACE_MS,
    );
    t.equal(
      coordinator.workflowOwner.deferCoordinatorCreatedRemoteHandoffRetry(
        cachedOperation,
        {
          deferRetry: true,
          retryAfterMs: TEST_RETRY_AFTER_MS,
          error: TEST_RETRYABLE_HANDOFF_ERROR,
        },
      ),
      true,
      TEST_ASSERT_STALE_HANDOFF_ARMS_RETRY,
    );

    nowMs += TEST_RETRY_AFTER_MS + TEST_TIMEOUT_OVERRUN_MS;
    t.equal(
      coordinator.workflowOwner.hasActiveTransitionRetryGrace(
        TEST_OPERATION_ID,
        nowMs,
      ),
      true,
      TEST_ASSERT_LONGER_GRACE_REMAINS_ACTIVE,
    );

    await coordinator.checkTimeouts();

    t.equal(
      deliveries.length,
      1,
      TEST_ASSERT_STALE_HANDOFF_REWAKES_REMOTE_OWNER,
    );
    t.equal(
      deliveries[0]?.target,
      TEST_REPLICA_DISPATCH_TARGET,
      TEST_ASSERT_STALE_HANDOFF_REWAKE_TARGET,
    );
    t.equal(
      deferredTimers.length,
      2,
      TEST_ASSERT_STALE_HANDOFF_REPLACES_TIMER,
    );
    t.equal(
      coordinator.workflowOwner.createdOperationHandoffRetryTimerByOperationId
        .size,
      1,
      TEST_ASSERT_STALE_HANDOFF_REMAINS_SINGLE_TIMER,
    );
  } finally {
    Date.now = originalDateNow;
    await coordinator.shutdown();
  }
});

registerCase('checkTimeouts re-dispatches restart-discovered locally owned priority ' +
  'dispatch-pending PENDING rows while the operation budget is still active',
async (t) => {
  const deliveries = [];
  let updateCount = 0;
  const nowMs = Date.now();
  const operationRow = {
    operation_id: TEST_OPERATION_ID,
    type: TEST_OPERATION_TYPE_REPLACE,
    partition_id: TEST_LOCAL_OWNER_PARTITION_ID,
    replica_id: TEST_LOCAL_OWNER_REPLICA_ID,
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
    entity_id: TEST_LOCAL_OWNER_PARTITION_ID,
  };

  const sqlQueryEngine = {
    async executeQuery(sql, params = [], options = {}) {
      const normalizedSql = String(sql);
      if (normalizedSql.includes('FROM replica_operations')) {
        return {
          success: true,
          rows: [{...operationRow}],
          affectedRows: 1,
        };
      }
      if (normalizedSql.startsWith('UPDATE replica_operations SET')) {
        updateCount += 1;
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
      if (normalizedSql.includes('FROM services')) {
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
        return {acknowledged: true, status: 'initiated'};
      },
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 3};
      },
    },
    enableTimeouts: false,
  });

  const pendingTimeoutMs = coordinator.getTimeoutForStep(
    WORKFLOW_STEP.PENDING,
    {partitionId: TEST_LOCAL_OWNER_PARTITION_ID},
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
    'the timeout witness should be locally owned by the replacement target node',
  );
  t.equal(
    coordinator.workflowOwner.shouldRearmDispatchFromProgressReconcile(
      cachedOperation,
      TEST_ACTUAL_STATUS_ABSENT,
      {now: nowMs},
    ),
    true,
    'the local timeout witness should be eligible for dispatch re-arm while its operation budget remains active',
  );

  await coordinator.checkTimeouts();

  t.equal(
    deliveries.length,
    1,
    'timeout reconciliation should dispatch the existing local-owner operation once',
  );
  t.equal(
    deliveries[0]?.target,
    TEST_REPLICA_HANDLER_DISPATCH_TARGET,
    'local-owner re-dispatch should target the canonical replica handler',
  );
  t.equal(
    operationRow.workflow_step,
    TEST_STEP_CREATING,
    'local-owner re-dispatch should advance durable workflow progress out of PENDING',
  );
  t.equal(
    operationRow.status,
    TEST_STATUS_CREATING,
    'local-owner re-dispatch should persist the creating status after dispatch acknowledgement',
  );
  t.equal(
    operationRow.error_message,
    TEST_EMPTY_VALUE,
    'local-owner re-dispatch should not record a timeout failure while operation budget remains active',
  );
  t.equal(
    updateCount,
    2,
    'local-owner re-dispatch should persist the SENDING and CREATING transitions',
  );

  await coordinator.shutdown();
});

}
