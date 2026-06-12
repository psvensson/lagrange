/**
 * CL-029 CHARACTERIZATION — target-completion evidence loss for a priority
 * control-plane REPLACE (closure-ledger record CL-029).
 *
 * Pins the liveness bug observed in run 145024Z-run3: a REPLACE for
 * control_plane_publications-p1 wedges forever at workflow step SYNCING
 * ("target_sync") because the target's REPLICA_CREATE_ACTIVE executor
 * outcome is lost on a SILENT exit — no 'Operation transition retry
 * deferred' warn, no 'transition failed' error, no armed timer.
 *
 * WHAT THIS TEST FOUND (scenario 1): the primary silent exit is NOT one of
 * the ledger's candidates (a)/(b)/(c) — it is upstream of all of them.
 * handleExecutorOutcome routes the outcome through
 * operationWorkflowRunExclusive(getOperationOwnerSingleFlightKey(opId))
 * (operation-workflow-executor-outcome-reconcile-methods.js:151), and the
 * underlying DurableWorkflowCoordinator.runExclusive
 * (src/workflow/durable-workflow-coordinator.js:500-521) COALESCES instead
 * of queueing: when the owner lane is already held — as it is for the
 * entire slow dispatch step-walk (PENDING->SENDING->CREATING->SYNCING,
 * ~14s per durable write on the recovering control plane, lane held by
 * runOperationOwnerAction(DISPATCH)) — the new execution factory is
 * DISCARDED and the caller just receives the in-flight dispatch promise.
 * reconcileExecutorOutcome NEVER RUNS for either outcome. The retained
 * payload (executorOutcomeRetryPayloadByOperationId) keeps the ACTIVE
 * evidence, but its ONLY consumer is the timer armed by
 * scheduleExecutorOutcomeRetry — which is only armed from inside
 * reconcileExecutorOutcome on deferred visibility. No timer is armed, so
 * the evidence sits orphaned forever; the owner waits event_driven at
 * target_sync. A pure lost-wakeup, with zero log lines — exactly matching
 * the run evidence (outcomes at 15:07:36.0/.1 inside the walk window
 * 15:07:35.9 -> 15:08:03.6).
 *
 * Scenarios:
 *  1. REPRO (the pinned mechanism): outcomes arrive while the dispatch
 *     step-walk holds the owner lane -> reconcile factories coalesced
 *     away, evidence orphaned, row wedged at SYNCING, fully silent.
 *  2. CONTROL: same outcomes arriving AFTER the lane is released ->
 *     reconcile runs, the ACTIVE CAS (expected SYNCING) commits, source
 *     removal resumes. Proves the loss is specifically the lane-held
 *     arrival window, not the reconcile logic itself.
 *  3. Ledger candidate (a), reachable when the reconcile DOES run but the
 *     owner's read path serves a stale row snapshot (the run's
 *     read/write divergence: the seed's replica_operations store has
 *     no/old row): the ACTIVE updateStep loses the expectedWorkflowStep
 *     CAS against the true SYNCING row, falls to
 *     replayReplaceActiveSourceRemovalFromAuthoritative which reads the
 *     same stale (non-ACTIVE) row and silently does nothing; the retained
 *     payload was already erased by clearExecutorOutcomeRetry. A second
 *     fully-silent exit.
 *  4. Ledger candidate (b): the ACTIVE CAS write fails with a retryable
 *     deferRetry control-plane error -> the inner catch swallows it via
 *     replayReplaceActiveSourceRemovalFromObservedTarget; the durable row
 *     stays at SYNCING, BUT the repository logs 'Failed to persist
 *     operation' — observable noise the real run did NOT have, which
 *     discriminates the run away from (b).
 *
 * THESE ASSERTIONS DOCUMENT TODAY'S BROKEN BEHAVIOR (characterization
 * style). When the CL-029 fix lands (a retained retry owner that re-drives
 * executor completion evidence after the lane frees / on raced or failed
 * application), every assertion marked "BROKEN TODAY" is EXPECTED TO FLIP
 * and this file must be updated to assert the fixed behavior.
 *
 * Does not modify src/. Spies are instance-property wrappers only.
 */

import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {ExecutorOutcomeEmitter} from
  '../../src/rebalancer/executor-outcome-emitter.js';
import {EXECUTOR_OUTCOME_TYPE} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
} from '../../src/rebalancer/rebalancer-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
import {createMockControlPlaneSystemTableGateway} from './test-helpers.js';

const TEST_NODE_ID = 'node-target-local';
const TEST_SEED_NODE_ID = 'node-seed-remote';
const TEST_OPERATION_ID = 'op-cl-029-replace';
const TEST_PARTITION_ID = 'control_plane_publications-p1';
const TEST_SOURCE_REPLICA_ID = 'control_plane_publications-p1-r1';
const TEST_TARGET_REPLICA_ID = 'control_plane_publications-p1-r2';
const TEST_DISPATCH_REASON = 'cl029_test_dispatch_walk';
const TEST_SETTLE_TIMEOUT_MS = 8000;
const TEST_SETTLE_POLL_MS = 5;
const TEST_QUIESCE_MS = 100;
const TEST_EXPECTED_RECONCILE_COUNT = 2;
const TEST_CAS_SQL_FRAGMENT = 'AND workflow_step = ?';
const TEST_UPDATE_SQL_FRAGMENT = 'UPDATE replica_operations';
const TEST_INSERT_SQL_FRAGMENT = 'INSERT INTO replica_operations';
const TEST_SELECT_BY_ID_SQL_FRAGMENT = 'operation_id = ?';
const TEST_REPLICA_OPERATIONS_SQL_FRAGMENT = 'replica_operations';
const TEST_REMOVE_REPLICA_MESSAGE_TYPE = 'REMOVE_REPLICA';
const TEST_RETRYABLE_CAS_FAILURE = Object.freeze({
  success: false,
  error:
    'replica_operations partition leader unavailable during ' +
    'control-plane recovery',
  errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
  code: 'CONTROL_PLANE_PRESSURE_DEGRADED',
  deferRetry: true,
  retryAfterMs: 50,
});

/**
 * Build the CL-029 REPLACE operation row: priority control-plane
 * partition, target node = local node, so per
 * replica-operation-repository-row-methods.js:124-151 the op is locally
 * owned by the TARGET (this node) while unsettled.
 */
function buildReplaceOperation() {
  const now = Date.now();
  return {
    operationId: TEST_OPERATION_ID,
    type: OperationType.REPLACE,
    partitionId: TEST_PARTITION_ID,
    entityType: 'partition',
    entityId: TEST_PARTITION_ID,
    replicaId: TEST_TARGET_REPLICA_ID,
    sourceReplicaId: TEST_SOURCE_REPLICA_ID,
    sourceNodeId: TEST_SEED_NODE_ID,
    targetNodeId: TEST_NODE_ID,
    status: ReplicaStatus.PENDING,
    workflowStep: WORKFLOW_STEP.PENDING,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    errorMessage: null,
    stepsHistory: [
      {
        step: WORKFLOW_STEP.PENDING,
        timestamp: now,
        sourceReplicaId: TEST_SOURCE_REPLICA_ID,
      },
    ],
  };
}

/**
 * Convert an operation-shaped record to the SQL row shape the repository
 * read path expects (no source_replica_id column — it is reconstructed
 * from steps_history metadata, matching production).
 */
function operationToRow(op) {
  return {
    operation_id: op.operationId,
    type: op.type,
    partition_id: op.partitionId,
    entity_type: op.entityType,
    entity_id: op.entityId,
    replica_id: op.replicaId,
    source_node_id: op.sourceNodeId,
    target_node_id: op.targetNodeId,
    status: op.status,
    workflow_step: op.workflowStep,
    created_at: op.createdAt,
    updated_at: op.updatedAt,
    completed_at: op.completedAt,
    error_message: op.errorMessage,
    steps_history: JSON.stringify(op.stepsHistory || []),
  };
}

/**
 * Durable replica_operations store with REAL CAS semantics for
 * UPDATE ... WHERE operation_id = ? AND workflow_step = ?
 * (SQL.UPDATE_OPERATION_EXPECTING_STEP).
 *
 * Reads (SELECT by operation_id) are served from `readView` when set —
 * this models the run's read/write divergence: authoritative READS routed
 * to a divergent/lagging replica while the CAS WRITE evaluates on the
 * true partition leader row.
 */
function createCasBackedReplicaOperationStore(initialOperation) {
  const state = {
    authoritative: {
      ...initialOperation,
      stepsHistory: initialOperation.stepsHistory.map((entry) => ({
        ...entry,
      })),
    },
    readView: null,
    updateAttempts: [],
    insertAttempts: [],
    failCasUpdateForStep: null,
    failCasUpdateResult: null,
  };

  const snapshotAuthoritative = () => ({
    ...state.authoritative,
    stepsHistory: (state.authoritative.stepsHistory || []).map((entry) => ({
      ...entry,
    })),
  });

  async function executeQuery(sql, params = []) {
    if (sql.includes(TEST_UPDATE_SQL_FRAGMENT)) {
      const isCas = sql.includes(TEST_CAS_SQL_FRAGMENT);
      const [
        status,
        workflowStep,
        updatedAt,
        completedAt,
        errorMessage,
        stepsHistoryJson,
        replicaId,
        operationId,
        expectedWorkflowStep,
      ] = params;
      const attempt = {
        isCas,
        workflowStep,
        expectedWorkflowStep: isCas ? expectedWorkflowStep : null,
        authoritativeStepAtWrite: state.authoritative.workflowStep,
        applied: false,
        injectedFailure: false,
      };
      state.updateAttempts.push(attempt);
      if (
        isCas &&
        state.failCasUpdateResult &&
        workflowStep === state.failCasUpdateForStep
      ) {
        const failure = state.failCasUpdateResult;
        state.failCasUpdateResult = null;
        state.failCasUpdateForStep = null;
        attempt.injectedFailure = true;
        return failure;
      }
      if (operationId !== state.authoritative.operationId) {
        return {success: true, affectedRows: 0};
      }
      if (
        isCas &&
        state.authoritative.workflowStep !== expectedWorkflowStep
      ) {
        // CAS lost: the write path sees the true (newer) row.
        return {success: true, affectedRows: 0};
      }
      state.authoritative.status = status;
      state.authoritative.workflowStep = workflowStep;
      state.authoritative.updatedAt = updatedAt;
      state.authoritative.completedAt = completedAt;
      state.authoritative.errorMessage = errorMessage;
      state.authoritative.stepsHistory =
        typeof stepsHistoryJson === 'string' ?
          JSON.parse(stepsHistoryJson) :
          state.authoritative.stepsHistory;
      state.authoritative.replicaId = replicaId;
      attempt.applied = true;
      return {success: true, affectedRows: 1};
    }
    if (sql.includes(TEST_INSERT_SQL_FRAGMENT)) {
      state.insertAttempts.push({params});
      return {success: true, affectedRows: 1};
    }
    if (
      sql.includes(TEST_REPLICA_OPERATIONS_SQL_FRAGMENT) &&
      sql.includes(TEST_SELECT_BY_ID_SQL_FRAGMENT)
    ) {
      const visible = state.readView || state.authoritative;
      if (params?.[0] === visible.operationId) {
        return {success: true, rows: [operationToRow(visible)]};
      }
      return {success: true, rows: []};
    }
    return {success: true, rows: []};
  }

  return {
    state,
    executeQuery,
    snapshotAuthoritative,
    engageStaleReadView(snapshot) {
      state.readView = snapshot;
    },
    injectRetryableCasFailureForStep(workflowStep, failureResult) {
      state.failCasUpdateForStep = workflowStep;
      state.failCasUpdateResult = failureResult;
    },
  };
}

function createTransactionCoordinator() {
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

function createCaptureLogger(logs) {
  return {
    debug(message, payload) {
      logs.debugs.push({message, payload});
    },
    info(message, payload) {
      logs.infos.push({message, payload});
    },
    warn(message, payload) {
      logs.warns.push({message, payload});
    },
    error(message, payload) {
      logs.errors.push({message, payload});
    },
  };
}

/**
 * Wrap a method on the owner with a call-recording spy. Preserves
 * sync/async semantics; does not change behavior.
 */
function instrumentMethod(target, methodName, calls) {
  const original = target[methodName];
  target[methodName] = function instrumented(...args) {
    const record = {method: methodName, args, settled: false};
    calls.push(record);
    let outcome;
    try {
      outcome = original.apply(this, args);
    } catch (error) {
      record.error = error;
      record.settled = true;
      throw error;
    }
    if (outcome && typeof outcome.then === 'function') {
      return outcome.then(
        (value) => {
          record.result = value;
          record.settled = true;
          return value;
        },
        (error) => {
          record.error = error;
          record.settled = true;
          throw error;
        },
      );
    }
    record.result = outcome;
    record.settled = true;
    return outcome;
  };
}

async function waitForCondition(checkFn, description) {
  const deadlineAtMs = Date.now() + TEST_SETTLE_TIMEOUT_MS;
  while (Date.now() < deadlineAtMs) {
    if (checkFn()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, TEST_SETTLE_POLL_MS));
  }
  throw new Error(`Timed out waiting for: ${description}`);
}

async function quiesce() {
  await new Promise((resolve) => setTimeout(resolve, TEST_QUIESCE_MS));
}

/**
 * Build the real coordinator/owner wired to the CAS-backed store,
 * mirroring rebalance-coordinator-outcome-routing.test.js conventions.
 */
function createHarness(store) {
  const emitter = new ExecutorOutcomeEmitter({
    logger: {debug() {}, info() {}, warn() {}, error() {}},
  });
  const workflowCoordinator = new DurableWorkflowCoordinator();
  const deliveries = [];
  const scheduledTimers = [];
  const logs = {debugs: [], infos: [], warns: [], errors: []};
  const routedEvents = [];

  const coordinator = new RebalanceCoordinator({
    nodeId: TEST_NODE_ID,
    transactionCoordinator: createTransactionCoordinator(),
    systemTableCache: {
      get() {
        return null;
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true, status: 'initiated'};
      },
    },
    sqlQueryEngine: {
      executeQuery: store.executeQuery,
    },
    controlPlaneSystemTableGateway:
      createMockControlPlaneSystemTableGateway({
        executeQuery: store.executeQuery,
      }),
    storageAccountingService: {estimateReplicaBytes: () => 1},
    storageAdmissionService: {
      async checkAdd() {
        return {allowed: true, decision: 'allow'};
      },
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return null;
      },
    },
    operationWorkflowCoordinator: workflowCoordinator,
    executorOutcomeEmitter: emitter,
    setTimeoutFn(callback, delayMs) {
      const timerHandle = {callback, delayMs, cleared: false};
      scheduledTimers.push(timerHandle);
      return timerHandle;
    },
    clearTimeoutFn(timerHandle) {
      if (timerHandle) {
        timerHandle.cleared = true;
      }
    },
    enableTimeouts: false,
  });
  coordinator.initialize();

  const owner = coordinator.workflowOwner;
  const captureLogger = createCaptureLogger(logs);
  owner.logger = captureLogger;
  coordinator.repository.logger = captureLogger;

  // Replica-status evidence is unreadable during control-plane recovery
  // (the run's services/cache reads return nothing useful at this point);
  // keeps the incidental SYNCING-outcome lifecycle reconcile inert so the
  // characterization stays pinned on the ACTIVE-outcome path.
  owner.getReconciledReplicaStatus = async () => null;
  // Remove-safety voter-topology evidence is downstream of the
  // characterization point; stub it safe (same convention as the
  // in-progress remove test in rebalance-coordinator-outcome-routing)
  // so the post-ACTIVE source-removal phase stays healthy when reached.
  owner.evaluateRemoveSafety = async () => ({});

  coordinator.on(REBALANCE_COORDINATOR_EVENT.OUTCOME_ROUTED, (event) => {
    routedEvents.push(event);
  });

  const calls = [];
  for (const methodName of [
    'reconcileExecutorOutcome',
    'reconcileReplaceActualActive',
    'updateStep',
    'replayReplaceActiveSourceRemovalFromAuthoritative',
    'replayReplaceActiveSourceRemovalFromObservedTarget',
    'scheduleExecutorOutcomeRetry',
    'ensurePriorityActiveReplaceRetryArmed',
    'completeOperation',
    'failOperation',
  ]) {
    instrumentMethod(owner, methodName, calls);
  }

  // Record what retained evidence is present at the moment
  // clearExecutorOutcomeRetry erases it (reconcile-methods line ~599).
  const clearedRetainedPayloads = [];
  const originalClear = owner.clearExecutorOutcomeRetry;
  owner.clearExecutorOutcomeRetry = function clearSpy(operationId) {
    clearedRetainedPayloads.push({
      operationId,
      retainedWorkflowStep:
        this.executorOutcomeRetryPayloadByOperationId.get(operationId)
          ?.workflowStep ?? null,
      hadTimer: this.executorOutcomeRetryTimerByOperationId.has(operationId),
    });
    return originalClear.call(this, operationId);
  };

  return {
    coordinator,
    owner,
    emitter,
    deliveries,
    scheduledTimers,
    logs,
    routedEvents,
    calls,
    clearedRetainedPayloads,
  };
}

function callsOf(calls, methodName) {
  return calls.filter((record) => record.method === methodName);
}

function updateStepCallsTo(calls, step) {
  return callsOf(calls, 'updateStep').filter(
    (record) => record.args?.[1] === step,
  );
}

function countLiveOwnerRetryState(owner) {
  return {
    executorOutcomeRetryPayloads:
      owner.executorOutcomeRetryPayloadByOperationId.size,
    executorOutcomeRetryTimers:
      owner.executorOutcomeRetryTimerByOperationId.size,
    transitionRetryTimers: owner.transitionRetryTimerByOperationId.size,
    priorityActiveReplaceRetryTimers:
      owner.priorityActiveReplaceRetryTimerByOperationId.size,
    observedProgressRetryTimers:
      owner.observedProgressRetryTimerByOperationId.size,
    dispatchRetryTimers: owner.dispatchRetryTimerByOperationId.size,
  };
}

function removeDeliveries(harness) {
  return harness.deliveries.filter(
    (delivery) =>
      delivery?.payload?.type === TEST_REMOVE_REPLICA_MESSAGE_TYPE,
  );
}

/**
 * The dispatch step-walk: holds the operation-owner single-flight lane
 * (exactly as runOperationOwnerAction(DISPATCH) does for the whole
 * dispatchOperationInternal execution) and walks the durable row with the
 * REAL updateStep. While this runs, the owner lane is held, exactly like
 * the ~28s window in run 145024Z-run3.
 */
function startDispatchStepWalk(owner, operation, hooks = {}) {
  return owner.operationWorkflowRunExclusive(
    owner.getOperationOwnerSingleFlightKey(operation.operationId),
    async () => {
      await owner.updateStep(
        operation,
        WORKFLOW_STEP.SENDING,
        TEST_DISPATCH_REASON,
      );
      if (hooks.whileLaneHeldAtSending) {
        await hooks.whileLaneHeldAtSending();
      }
      await owner.updateStep(
        operation,
        WORKFLOW_STEP.CREATING,
        TEST_DISPATCH_REASON,
      );
      await owner.updateStep(
        operation,
        WORKFLOW_STEP.SYNCING,
        TEST_DISPATCH_REASON,
      );
    },
  );
}

function emitTargetCompletionOutcomes(emitter) {
  emitter.emitOutcome(
    EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
    TEST_OPERATION_ID,
    WORKFLOW_STEP.SYNCING,
    {replicaId: TEST_TARGET_REPLICA_ID, partitionId: TEST_PARTITION_ID},
  );
  emitter.emitOutcome(
    EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
    TEST_OPERATION_ID,
    WORKFLOW_STEP.ACTIVE,
    {replicaId: TEST_TARGET_REPLICA_ID, partitionId: TEST_PARTITION_ID},
  );
}

function settledReconcileCount(harness) {
  return callsOf(harness.calls, 'reconcileExecutorOutcome').filter(
    (record) => record.settled,
  ).length;
}

/**
 * Emit the two target outcomes with the lane FREE, letting each reconcile
 * settle before emitting the next. NOTE: this spacing is REQUIRED to get
 * both reconciles to run at all — if REPLICA_CREATE_ACTIVE is emitted
 * while the REPLICA_CREATE_SYNCING reconcile still holds the lane (the
 * production spacing: ~140ms apart, with ~14s durable writes inside the
 * first reconcile), the ACTIVE reconcile factory is coalesced away by the
 * same runExclusive drop as in the REPRO scenario.
 */
async function emitTargetCompletionOutcomesSequentially(harness) {
  harness.emitter.emitOutcome(
    EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
    TEST_OPERATION_ID,
    WORKFLOW_STEP.SYNCING,
    {replicaId: TEST_TARGET_REPLICA_ID, partitionId: TEST_PARTITION_ID},
  );
  await waitForCondition(
    () => settledReconcileCount(harness) >= 1,
    'the SYNCING outcome reconcile to settle',
  );
  harness.emitter.emitOutcome(
    EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
    TEST_OPERATION_ID,
    WORKFLOW_STEP.ACTIVE,
    {replicaId: TEST_TARGET_REPLICA_ID, partitionId: TEST_PARTITION_ID},
  );
  await waitForCondition(
    () => settledReconcileCount(harness) >= TEST_EXPECTED_RECONCILE_COUNT,
    'the ACTIVE outcome reconcile to settle',
  );
}

/**
 * Run the dispatch walk to completion. When emitDuringWalk is true the
 * outcomes are emitted while the lane is held at SENDING (the run's
 * timing); otherwise they are emitted after the lane is released.
 */
async function runScenario(harness, operation, options = {}) {
  const {owner, emitter} = harness;
  const {emitDuringWalk = true, afterWalk = null} = options;

  let releaseWalk;
  const walkGate = new Promise((resolve) => {
    releaseWalk = resolve;
  });
  const walkPromise = startDispatchStepWalk(owner, operation, {
    whileLaneHeldAtSending: async () => {
      await walkGate;
    },
  });
  await waitForCondition(
    () => operation.workflowStep === WORKFLOW_STEP.SENDING,
    'dispatch walk to durably commit SENDING',
  );

  if (emitDuringWalk) {
    // Target completes ~150ms into the walk, while the durable row is at
    // SENDING and the owner lane is HELD by the dispatch execution.
    emitTargetCompletionOutcomes(emitter);
    await waitForCondition(
      () =>
        owner.executorOutcomeRetryPayloadByOperationId.get(
          TEST_OPERATION_ID,
        )?.workflowStep === WORKFLOW_STEP.ACTIVE,
      'ACTIVE outcome to be retained by handleExecutorOutcome',
    );
  }

  releaseWalk();
  await walkPromise;

  if (afterWalk) {
    await afterWalk();
  }

  if (!emitDuringWalk) {
    await emitTargetCompletionOutcomesSequentially(harness);
  }

  await quiesce();
}

function warnsMatching(logs, message) {
  return logs.warns.filter((entry) => entry.message === message);
}

function errorsMatching(logs, message) {
  return logs.errors.filter((entry) => entry.message === message);
}

test(
  'CL-029 characterization: REPLACE target-completion evidence vs the ' +
  'dispatch step-walk',
  async (t) => {
    await t.test(
      'REPRO (the pinned silent exit): outcomes arriving while the ' +
      'dispatch step-walk holds the owner lane are COALESCED away by ' +
      'runExclusive — reconcile never runs, evidence orphaned, row ' +
      'wedged at SYNCING (BROKEN TODAY; flips when CL-029 is fixed)',
      async (t) => {
        const operation = buildReplaceOperation();
        const store = createCasBackedReplicaOperationStore(operation);
        const harness = createHarness(store);
        const {owner} = harness;

        try {
          await runScenario(harness, operation, {emitDuringWalk: true});

          // --- the lost wakeup: the reconcile factories were DISCARDED
          t.equal(
            callsOf(harness.calls, 'reconcileExecutorOutcome').length,
            0,
            'BROKEN TODAY: reconcileExecutorOutcome NEVER RAN for either ' +
            'outcome — DurableWorkflowCoordinator.runExclusive ' +
            '(durable-workflow-coordinator.js:505-507) returned the ' +
            'in-flight dispatch execution and dropped the factory',
          );
          t.equal(
            harness.routedEvents.length,
            0,
            'no outcome was ever routed',
          );

          // --- the wedge
          t.equal(
            store.state.authoritative.workflowStep,
            WORKFLOW_STEP.SYNCING,
            'BROKEN TODAY: durable workflow row is wedged at SYNCING ' +
            '(target_sync) even though the target emitted ' +
            'REPLICA_CREATE_ACTIVE',
          );
          t.equal(
            removeDeliveries(harness).length,
            0,
            'source removal was never dispatched — the REPLACE never ' +
            'leaves target_sync',
          );

          // --- the orphaned evidence: retained but with NO driver
          t.equal(
            owner.executorOutcomeRetryPayloadByOperationId.get(
              TEST_OPERATION_ID,
            )?.workflowStep,
            WORKFLOW_STEP.ACTIVE,
            'the ACTIVE evidence IS retained in ' +
            'executorOutcomeRetryPayloadByOperationId ...',
          );
          t.same(
            {
              executorOutcomeRetryTimers:
                owner.executorOutcomeRetryTimerByOperationId.size,
              transitionRetryTimers:
                owner.transitionRetryTimerByOperationId.size,
              priorityActiveReplaceRetryTimers:
                owner.priorityActiveReplaceRetryTimerByOperationId.size,
              observedProgressRetryTimers:
                owner.observedProgressRetryTimerByOperationId.size,
              dispatchRetryTimers:
                owner.dispatchRetryTimerByOperationId.size,
            },
            {
              executorOutcomeRetryTimers: 0,
              transitionRetryTimers: 0,
              priorityActiveReplaceRetryTimers: 0,
              observedProgressRetryTimers: 0,
              dispatchRetryTimers: 0,
            },
            'BROKEN TODAY: ... but NO timer of any kind is armed — the ' +
            'only consumer of the retained payload is the ' +
            'scheduleExecutorOutcomeRetry timer, which is only armed ' +
            'from inside the reconcile that never ran',
          );
          t.equal(
            callsOf(harness.calls, 'scheduleExecutorOutcomeRetry').length,
            0,
            'scheduleExecutorOutcomeRetry was never called',
          );
          t.equal(
            harness.clearedRetainedPayloads.length,
            0,
            'clearExecutorOutcomeRetry never ran either — the evidence ' +
            'is orphaned, not erased',
          );
          t.equal(
            callsOf(harness.calls, 'reconcileReplaceActualActive').length,
            0,
            'ledger exits (a)/(b)/(c) are all unreachable here: ' +
            'reconcileReplaceActualActive never ran',
          );

          // --- silence: matches run 145024Z-run3 exactly
          t.equal(
            warnsMatching(
              harness.logs,
              REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TRANSITION_RETRY_DEFERRED,
            ).length,
            0,
            'zero "Operation transition retry deferred" warns — matches ' +
            'the run',
          );
          t.equal(
            harness.logs.errors.length,
            0,
            'BROKEN TODAY: the loss is COMPLETELY silent — zero errors ' +
            'logged (matches the run: zero transition-failed errors)',
          );
          t.equal(
            callsOf(harness.calls, 'completeOperation').length +
              callsOf(harness.calls, 'failOperation').length,
            0,
            'the operation neither completed nor failed — pure liveness ' +
            'loss',
          );
        } finally {
          await harness.coordinator.shutdown();
        }
      },
    );

    await t.test(
      'CONTROL: the same outcomes arriving AFTER the lane is released ' +
      'reconcile normally — the ACTIVE CAS commits and source removal ' +
      'resumes (proves the loss is the lane-held arrival window)',
      async (t) => {
        const operation = buildReplaceOperation();
        const store = createCasBackedReplicaOperationStore(operation);
        const harness = createHarness(store);

        try {
          await runScenario(harness, operation, {emitDuringWalk: false});

          t.equal(
            callsOf(harness.calls, 'reconcileExecutorOutcome').length,
            TEST_EXPECTED_RECONCILE_COUNT,
            'both outcome reconciles ran once the lane was free',
          );
          const activeUpdateCalls = updateStepCallsTo(
            harness.calls,
            WORKFLOW_STEP.ACTIVE,
          );
          t.equal(
            activeUpdateCalls.some((record) => record.result === true),
            true,
            'the ACTIVE CAS (expected SYNCING) committed against the ' +
            'consistent row',
          );
          t.not(
            store.state.authoritative.workflowStep,
            WORKFLOW_STEP.SYNCING,
            'durable row advanced beyond SYNCING — no wedge when the ' +
            'reconcile actually runs against consistent views',
          );
          t.equal(
            removeDeliveries(harness).length,
            1,
            'the applied ACTIVE evidence resumed source removal ' +
            '(REMOVE_REPLICA dispatched)',
          );
          t.equal(
            store.state.authoritative.workflowStep,
            WORKFLOW_STEP.STOPPING,
            'the REPLACE durably advanced into the source-removal phase',
          );
        } finally {
          await harness.coordinator.shutdown();
        }
      },
    );

    await t.test(
      'ledger exit (a): reconcile runs against a STALE read snapshot — ' +
      'the ACTIVE CAS loses to the dispatch walk, the authoritative ' +
      'replay reads the same stale row and silently does nothing, and ' +
      'the retained evidence is ERASED (BROKEN TODAY; flips with the fix)',
      async (t) => {
        const operation = buildReplaceOperation();
        const store = createCasBackedReplicaOperationStore(operation);
        const harness = createHarness(store);
        const {owner} = harness;

        try {
          let staleSendingSnapshot = null;
          await runScenario(harness, operation, {
            emitDuringWalk: false,
            afterWalk: async () => {
              // The owner's read path is served by a divergent replica
              // frozen at the SENDING era (run evidence: 'No row found
              // for CDC update' on the seed's replica_operations store);
              // the CAS write path sees the true SYNCING row.
              staleSendingSnapshot = store.snapshotAuthoritative();
              staleSendingSnapshot.workflowStep = WORKFLOW_STEP.SENDING;
              staleSendingSnapshot.status = ReplicaStatus.PENDING;
              staleSendingSnapshot.stepsHistory =
                staleSendingSnapshot.stepsHistory.filter(
                  (entry) =>
                    entry.step === WORKFLOW_STEP.PENDING ||
                    entry.step === WORKFLOW_STEP.SENDING,
                );
              store.engageStaleReadView(staleSendingSnapshot);
            },
          });

          // --- the wedge (BROKEN TODAY — expected to flip with the fix)
          t.equal(
            store.state.authoritative.workflowStep,
            WORKFLOW_STEP.SYNCING,
            'BROKEN TODAY: durable workflow row is wedged at SYNCING',
          );

          // --- the exact exit: (a)
          const activeUpdateCalls = updateStepCallsTo(
            harness.calls,
            WORKFLOW_STEP.ACTIVE,
          );
          t.equal(
            activeUpdateCalls.length,
            1,
            'reconcileReplaceActualActive attempted exactly one ' +
            'updateStep(operation, ACTIVE)',
          );
          t.equal(
            activeUpdateCalls[0]?.result,
            false,
            'the ACTIVE transition did NOT commit (and did not throw): ' +
            'the CAS lost against the dispatch step-walk',
          );
          const activeCasAttempts = store.state.updateAttempts.filter(
            (attempt) =>
              attempt.isCas &&
              attempt.workflowStep === WORKFLOW_STEP.ACTIVE,
          );
          t.equal(
            activeCasAttempts.length,
            1,
            'one durable CAS write was attempted for the ACTIVE step',
          );
          t.equal(
            activeCasAttempts[0]?.expectedWorkflowStep,
            WORKFLOW_STEP.SENDING,
            'the CAS expected the stale snapshot step (SENDING) ...',
          );
          t.equal(
            activeCasAttempts[0]?.authoritativeStepAtWrite,
            WORKFLOW_STEP.SYNCING,
            '... while the true durable row was already at SYNCING — ' +
            'CAS lost, affectedRows=0',
          );
          const replayAuthoritativeCalls = callsOf(
            harness.calls,
            'replayReplaceActiveSourceRemovalFromAuthoritative',
          );
          t.equal(
            replayAuthoritativeCalls.length,
            1,
            'the uncommitted CAS fell through to ' +
            'replayReplaceActiveSourceRemovalFromAuthoritative',
          );
          t.equal(
            replayAuthoritativeCalls[0]?.result,
            false,
            'BROKEN TODAY: the authoritative replay read the stale ' +
            '(non-ACTIVE) row and silently did nothing — exit (a)',
          );
          t.equal(
            callsOf(
              harness.calls,
              'replayReplaceActiveSourceRemovalFromObservedTarget',
            ).length,
            0,
            'exit (b) path (observed-target replay) never ran — ' +
            'updateStep returned false instead of throwing',
          );

          // --- here the evidence is fully ERASED, not just orphaned
          t.same(
            countLiveOwnerRetryState(owner),
            {
              executorOutcomeRetryPayloads: 0,
              executorOutcomeRetryTimers: 0,
              transitionRetryTimers: 0,
              priorityActiveReplaceRetryTimers: 0,
              observedProgressRetryTimers: 0,
              dispatchRetryTimers: 0,
            },
            'BROKEN TODAY: no retained payload and no armed timer ' +
            'survives — the completion evidence has no live driver',
          );
          t.equal(
            harness.clearedRetainedPayloads.some(
              (record) =>
                record.retainedWorkflowStep === WORKFLOW_STEP.ACTIVE,
            ),
            true,
            'BROKEN TODAY: the retained ACTIVE payload was erased by ' +
            'clearExecutorOutcomeRetry at the START of the ACTIVE ' +
            'reconcile (reconcile-methods line ~599), BEFORE the action ' +
            'was applied — so the failed application has nothing left ' +
            'to retry from',
          );
          t.equal(
            callsOf(harness.calls, 'scheduleExecutorOutcomeRetry').length,
            0,
            'BROKEN TODAY: no executor-outcome retry was ever scheduled',
          );

          // --- silence: also matches the run's zero-warn/zero-error log
          t.equal(
            warnsMatching(
              harness.logs,
              REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TRANSITION_RETRY_DEFERRED,
            ).length,
            0,
            'zero "Operation transition retry deferred" warns',
          );
          t.equal(
            harness.logs.errors.length,
            0,
            'BROKEN TODAY: exit (a) is also COMPLETELY silent',
          );
          t.equal(
            removeDeliveries(harness).length,
            0,
            'source removal was never dispatched',
          );
          t.equal(
            callsOf(harness.calls, 'completeOperation').length +
              callsOf(harness.calls, 'failOperation').length,
            0,
            'the operation neither completed nor failed',
          );
        } finally {
          await harness.coordinator.shutdown();
        }
      },
    );

    await t.test(
      'ledger exit (b): retryable CAS persist failure — swallowed by the ' +
      'observed-target replay with the durable row still at SYNCING, but ' +
      'it LOGS a persist error (the real run had none, discriminating ' +
      'the run away from exit (b))',
      async (t) => {
        const operation = buildReplaceOperation();
        const store = createCasBackedReplicaOperationStore(operation);
        const harness = createHarness(store);
        const {owner} = harness;

        try {
          await runScenario(harness, operation, {
            emitDuringWalk: false,
            afterWalk: async () => {
              // Reads stay consistent; only the ACTIVE CAS write fails
              // with a retryable deferRetry control-plane error.
              store.injectRetryableCasFailureForStep(
                WORKFLOW_STEP.ACTIVE,
                TEST_RETRYABLE_CAS_FAILURE,
              );
            },
          });

          const activeUpdateCalls = updateStepCallsTo(
            harness.calls,
            WORKFLOW_STEP.ACTIVE,
          );
          t.equal(
            activeUpdateCalls.length >= 1 &&
              Boolean(activeUpdateCalls[0]?.error),
            true,
            'updateStep(operation, ACTIVE) threw the retryable ' +
            'control-plane persist error',
          );
          const replayObservedTargetCalls = callsOf(
            harness.calls,
            'replayReplaceActiveSourceRemovalFromObservedTarget',
          );
          t.equal(
            replayObservedTargetCalls.length,
            1,
            'the inner catch routed to ' +
            'replayReplaceActiveSourceRemovalFromObservedTarget',
          );
          t.equal(
            replayObservedTargetCalls[0]?.result,
            true,
            'BROKEN TODAY: the observed-target replay reports true and ' +
            'the retryable error is swallowed — exit (b)',
          );
          t.equal(
            store.state.authoritative.workflowStep,
            WORKFLOW_STEP.SYNCING,
            'BROKEN TODAY: the DURABLE row never records ACTIVE (or any ' +
            'later step) — still SYNCING',
          );
          t.equal(
            owner.executorOutcomeRetryPayloadByOperationId.size +
              owner.executorOutcomeRetryTimerByOperationId.size,
            0,
            'BROKEN TODAY: no executor-outcome retry owner survives ' +
            'exit (b) either',
          );
          // The discriminating observable vs the real run:
          t.ok(
            errorsMatching(
              harness.logs,
              REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED,
            ).length >= 1,
            'exit (b) logs "Failed to persist operation" — run ' +
            '145024Z-run3 had ZERO errors, so the run did NOT take ' +
            'exit (b)',
          );
          t.comment(
            `exit(b): removeDeliveries=${removeDeliveries(harness).length}; ` +
            'liveRetryState=' +
            `${JSON.stringify(countLiveOwnerRetryState(owner))}`,
          );
        } finally {
          await harness.coordinator.shutdown();
        }
      },
    );
  },
);
