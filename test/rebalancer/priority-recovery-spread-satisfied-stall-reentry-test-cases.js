// Quest operation-workflow-drain-redrive, acceptance #1 (mask-pinning baseline):
// a durably STALLED, locally-owned REPLACE in its REMOVE-dispatch phase (ACTIVE)
// that is over target gets classified spread_satisfied_in_flight, and the EXISTING
// dispatch-pending reentry therefore does NOT re-drive its source removal -- the
// mask the parent run4 quest must defeat. This file pins that mask deterministically
// so the un-mask fix (acceptance #2) has a red-on-revert observable to flip.
export function registerPriorityRecoverySpreadSatisfiedStallReentryTestCases(
  {registerCase, dependencies},
) {
  const {
    NUM,
    TEST_OPERATION_TYPE_REPLACE,
    TEST_STATUS_ACTIVE,
    TEST_STEP_ACTIVE,
    TEST_SOURCE_NODE_ID,
    TEST_TARGET_NODE_ID,
    TEST_PARTITION_ID,
    TEST_REPLICA_ID,
    TEST_REPLICA_OPERATIONS_TABLE,
    TEST_ENTITY_TYPE_PARTITION,
    TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT,
    TEST_QUERY_OPERATION_BY_ID_FRAGMENT,
    TEST_UPDATE_REPLICA_OPERATIONS_PREFIX,
    TEST_QUERY_SERVICES_FRAGMENT,
    TEST_DELIVERY_STATUS_INITIATED,
    TEST_MIN_REPLICA_COUNT,
    TEST_EMPTY_LIST,
    TEST_EMPTY_VALUE,
    TEST_CAPTURED_AT_MS,
    TEST_HANDOFF_TIMEOUT_MS,
    TEST_RAFT_ROLE_FOLLOWER,
    TEST_REPLICA_SERVICE_ADDRESS,
    TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID,
    PRIORITY_RECOVERY_SEMANTIC_STATE,
    buildPendingOperationRow,
    buildDispatchPendingReentryPlanningSnapshot,
    buildTransactionCoordinator,
    createCoordinator,
  } = dependencies;

  // A learner raft role that has not been promoted to voter => the matching target
  // service row resolves ACTIVE_NON_OPERATIONAL (not voter-ready).
  const TARGET_LEARNER_RAFT_ROLE = 'learner';

  // Seed a stalled, locally-owned, over-target REPLACE in its REMOVE-dispatch
  // (ACTIVE) phase plus the stubs that drive the decision snapshot, and run the
  // single reentry drive. Returns the captured observables.
  // Past the spread stall budget (60s) so a not-voter-ready remove-dispatch op is
  // treated as stalled; well under it for the transient-progress guard case.
  const STALLED_STEP_AGE_MS = 600000;
  const PROGRESSING_STEP_AGE_MS = 1000;

  async function driveStalledRemoveDispatchReentry(
    t,
    {sourceRemovalPending, stepAgeMs = STALLED_STEP_AGE_MS},
  ) {
    const deliveries = [];
    const deferredTimers = [];
    let updateCount = NUM.ZERO;
    const originalDateNow = Date.now;
    Date.now = () => TEST_CAPTURED_AT_MS;

    const operationRow = buildPendingOperationRow({
      operationId: TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID,
      partitionId: TEST_PARTITION_ID,
      replicaId: TEST_REPLICA_ID,
      nowMs: TEST_CAPTURED_AT_MS,
    });
    operationRow.type = TEST_OPERATION_TYPE_REPLACE;
    // ACTIVE in REPLACE_REMOVE_DISPATCH_WORKFLOW_STEPS => REMOVE-dispatch phase.
    operationRow.workflow_step = TEST_STEP_ACTIVE;
    operationRow.status = TEST_STATUS_ACTIVE;
    operationRow.source_node_id = TEST_SOURCE_NODE_ID;
    operationRow.target_node_id = TEST_TARGET_NODE_ID;
    // The only step-history entry is ACTIVE; its age (now - timestamp) is the
    // stall signal. Frozen far in the past => stalled; recent => still progressing.
    operationRow.steps_history = JSON.stringify([{
      step: TEST_STEP_ACTIVE,
      timestamp: TEST_CAPTURED_AT_MS - stepAgeMs,
    }]);

    // The real wedge (priority-recovery-snapshot-ingress.js:62-68): the REPLACE's
    // new target replica is a LEARNER that failed voter-ready promotion, so the
    // partition is genuinely under-spread while the source replica is still present
    // (source removal pending). A learner target => ACTIVE_NON_OPERATIONAL (not
    // voter-ready); the source + stable replicas keep the row over target.
    const replicaSpecs = [
      {replicaId: TEST_REPLICA_ID, nodeId: TEST_TARGET_NODE_ID,
        raftRole: TARGET_LEARNER_RAFT_ROLE},
      {replicaId: TEST_PARTITION_ID + '-r2', nodeId: 'node-stable-2',
        raftRole: TEST_RAFT_ROLE_FOLLOWER},
      {replicaId: TEST_PARTITION_ID + '-r3', nodeId: 'node-stable-3',
        raftRole: TEST_RAFT_ROLE_FOLLOWER},
    ];
    if (sourceRemovalPending) {
      replicaSpecs.push({
        replicaId: TEST_PARTITION_ID + '-source',
        nodeId: TEST_SOURCE_NODE_ID,
        raftRole: TEST_RAFT_ROLE_FOLLOWER,
      });
    }
    const serviceRows = replicaSpecs.map(({replicaId, nodeId, raftRole}) => ({
      service_id: replicaId,
      service_type: TEST_ENTITY_TYPE_PARTITION,
      node_id: nodeId,
      partition_id: TEST_PARTITION_ID,
      group_id: TEST_EMPTY_VALUE,
      replica_id: replicaId,
      raft_role: raftRole,
      status: TEST_STATUS_ACTIVE,
      address: TEST_REPLICA_SERVICE_ADDRESS,
      created_at: TEST_CAPTURED_AT_MS,
      updated_at: TEST_CAPTURED_AT_MS,
    }));

    const sqlQueryEngine = {
      async executeQuery(sql, params = []) {
        const normalizedSql = String(sql);
        if (normalizedSql.startsWith(TEST_UPDATE_REPLICA_OPERATIONS_PREFIX)) {
          updateCount += NUM.ONE;
          operationRow.status = params[NUM.ZERO];
          operationRow.workflow_step = params[NUM.ONE];
          operationRow.steps_history = params[NUM.FIVE];
          return {success: true, affectedRows: NUM.ONE};
        }
        if (
          normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT) &&
          normalizedSql.includes(TEST_QUERY_OPERATION_BY_ID_FRAGMENT)
        ) {
          const operationId = params[NUM.ZERO];
          const matches =
            operationId === TEST_SQL_PRIORITY_TIMEOUT_OPERATION_ID;
          return {
            success: true,
            rows: matches ? [{...operationRow}] : [],
            affectedRows: matches ? NUM.ONE : NUM.ZERO,
          };
        }
        if (normalizedSql.includes(TEST_QUERY_REPLICA_OPERATIONS_FRAGMENT)) {
          return {success: true, rows: [{...operationRow}], affectedRows: NUM.ONE};
        }
        if (normalizedSql.includes(TEST_QUERY_SERVICES_FRAGMENT)) {
          return {
            success: true,
            rows: serviceRows.map((row) => ({...row})),
            affectedRows: serviceRows.length,
          };
        }
        return {success: true, rows: [], affectedRows: NUM.ZERO};
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
          return tableName === TEST_REPLICA_OPERATIONS_TABLE ?
            [operationRow] :
            [];
        },
        filter(tableName, predicate) {
          return tableName === TEST_REPLICA_OPERATIONS_TABLE ?
            [operationRow].filter(predicate) :
            [];
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

      const cachedOperation =
        coordinator.repository.queryCachedIncompleteOperations()[NUM.ZERO];
      t.equal(
        coordinator.repository.isOperationLocallyOwned(cachedOperation),
        true,
        'seeded REPLACE remove-dispatch op is locally owned by node-target',
      );

      const snapshot =
        await coordinator.workflowOwner
          .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
            TEST_PARTITION_ID,
            TEST_EMPTY_LIST,
          );

      return {snapshot, deliveries, deferredTimers, operationRow,
        updateCount: () => updateCount};
    } finally {
      Date.now = originalDateNow;
      await coordinator.shutdown();
    }
  }

  // RED-ON-REVERT: a STALLED not-voter-ready remove-dispatch op must be un-masked
  // (surfaced as actionable instead of spread_satisfied_in_flight) so the existing
  // reentry/drain no longer accepts it as drain-complete and re-drives it. On `main`
  // (mask restored) the stalled op classifies spread_satisfied_in_flight and the
  // drain accepts it -> these assertions go red.
  registerCase(
    'a stalled not-voter-ready REPLACE remove-dispatch op is un-masked and ' +
      'surfaced as actionable instead of spread_satisfied_in_flight',
    async (t) => {
      const {snapshot} = await driveStalledRemoveDispatchReentry(t, {
        sourceRemovalPending: true,
        stepAgeMs: STALLED_STEP_AGE_MS,
      });

      t.not(
        snapshot?.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
        'stalled op is no longer masked as spread_satisfied_in_flight (semanticState)',
      );
      t.not(
        snapshot?.completion?.state,
        PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
        'stalled op completion no longer accepts drain as spread_satisfied_in_flight',
      );
      t.equal(
        snapshot?.completion?.blocked,
        true,
        'stalled op completion reports the honest blocker (drain not accepted)',
      );
    },
  );

  // GUARD (green before and after the fix): a still-PROGRESSING not-voter-ready
  // remove-dispatch op keeps its optimistic spread certification (grace window), so
  // the un-mask does not falsely penalize transient promotion.
  registerCase(
    'a still-progressing not-voter-ready REPLACE remove-dispatch op keeps its ' +
      'optimistic spread_satisfied_in_flight certification',
    async (t) => {
      const {snapshot} = await driveStalledRemoveDispatchReentry(t, {
        sourceRemovalPending: true,
        stepAgeMs: PROGRESSING_STEP_AGE_MS,
      });

      t.equal(
        snapshot?.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
        'progressing op stays optimistically spread_satisfied_in_flight (not un-masked)',
      );
    },
  );
}
