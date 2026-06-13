/**
 * CL-029 GUARD — executor-outcome completion evidence must keep a retry
 * owner for a priority control-plane REPLACE (closure-ledger/CL-029.md).
 * This test is RED IF THE FIX IS REVERTED.
 *
 * The bug (run 145024Z-run3): a REPLACE for control_plane_publications-p1
 * wedged forever at workflow step SYNCING ("target_sync") because the
 * target's REPLICA_CREATE_ACTIVE executor outcome was lost on a SILENT
 * exit — no 'Operation transition retry deferred' warn, no 'transition
 * failed' error, no armed timer. The characterization predecessor of this
 * file pinned two loss mechanisms:
 *
 *  - PRIMARY (scenario 1): handleExecutorOutcome submitted the reconcile
 *    once through operationWorkflowRunExclusive, whose underlying
 *    DurableWorkflowCoordinator.runExclusive COALESCES — a held owner
 *    lane (the dispatch step-walk PENDING->SENDING->CREATING->SYNCING,
 *    ~28s in the run) returns the holder's in-flight promise and DISCARDS
 *    the factory. reconcileExecutorOutcome never ran; the retained
 *    payload had no consumer; a pure lost wakeup with zero log lines.
 *  - SECONDARY, ledger exit (a) (scenario 3): when the reconcile DID run
 *    against a stale read snapshot, the ACTIVE updateStep lost the
 *    expectedWorkflowStep CAS against the true SYNCING row, the
 *    authoritative replay read the same stale row and no-opped, and the
 *    retained payload had ALREADY been erased by the pre-action
 *    clearExecutorOutcomeRetry — evidence destroyed, nothing to retry.
 *
 * THE FIX this file guards (all in src/rebalancer; this test does not
 * touch src/):
 *  1. redriveExecutorOutcomeReconcile
 *     (operation-workflow-executor-outcome-reconcile-methods.js):
 *     handleExecutorOutcome retains the payload and runs a re-drive loop
 *     — awaiting the coalesced promise waits out the lane holder, then
 *     the loop resubmits the LATEST retained payload until it is consumed
 *     / a retry timer is armed / a ran iteration leaves it unchanged /
 *     the lane-wait cap falls back to the timed retry. Lane holders'
 *     rejections are NOT attributed to the outcome.
 *  2. reconcileExecutorOutcome no longer clears the retained payload
 *     BEFORE the action; each action branch clears on successful
 *     application (clearExecutorOutcomeRetryIfNotAhead preserves a
 *     retained payload that outranks the applied one).
 *  3. reconcileReplaceActualActive (operation-workflow-owner-segment-6.js)
 *     returns applied:boolean — false when the ACTIVE CAS lost AND the
 *     authoritative replay found nothing actionable; on false the
 *     reconcile calls scheduleExecutorOutcomeRetry so the evidence keeps
 *     a retry owner.
 *  4. scheduleExecutorOutcomeRetry backs off exponentially per operation
 *     (executorOutcomeRetryDelayMsByOperationId: doubles per arm, capped,
 *     reset on clear), warns per arm, and its timer callback re-enters
 *     redriveExecutorOutcomeReconcile with the payload still retained.
 *
 * Scenario -> fix-piece map (what goes red on which revert):
 *  1. lane-held arrival: RED if the re-drive loop (piece 1) is reverted
 *     to a single coalesced submission — reconcile count drops to 0, the
 *     row wedges at SYNCING, source removal never dispatches, the routed
 *     event never fires.
 *  2. CONTROL (lane-free happy path): both reconciles run, the ACTIVE CAS
 *     commits, source removal resumes. Pins the baseline either way.
 *  3. stale-read exit (a): RED if reconcileReplaceActualActive stops
 *     reporting applied=false (piece 3 — no retry is scheduled), if the
 *     pre-action clear comes back (piece 2 — the spy sees the retained
 *     ACTIVE payload erased), or if the armed timer's re-drive no longer
 *     applies the still-retained payload once reads heal (pieces 1+4 —
 *     the old timer path deleted the payload before retrying). Also pins
 *     the per-arm deferred warn and the exponential backoff doubling.
 *  4. ledger exit (b) (retryable CAS persist failure): the observed-target
 *     replay actuates source removal and reports applied, so clearing the
 *     evidence is correct; pins the 'Failed to persist operation' error
 *     as the discriminating observable vs the real run.
 *
 * CL-029 VERIFICATION AMENDMENTS (subtests 5-7, what goes red on which
 * revert):
 *  5. selectExecutorOutcomeRetryPayload success-supersedes-failure
 *     (isFailureExecutorOutcome): a retained FAILURE payload carries
 *     WORKFLOW_STEP.FAILED (top step-rank) and under the pure rank
 *     contest would mask EVERY later success outcome from a recreated
 *     replica. RED if the supersede rule reverts to pure rank: the
 *     retained map would keep FAILED over an incoming ACTIVE (rank 5 < 7)
 *     and over an incoming SYNCING (rank 4 < 7).
 *  6. the FAIL action branch on DEFER_RETRY: when deferTransitionRetry
 *     accepts ownership, the branch clears the retained FAILED payload —
 *     it must not survive into the transition-retry-owned phase where it
 *     would outrank the recreated replica's success evidence. RED if the
 *     clearExecutorOutcomeRetry(operationId) before the early return is
 *     reverted (the payload would stay retained, timerless/driverless).
 *  7. the not-locally-owned path clears the retained payload (the remote
 *     owner converges from the durable row + its own evidence; a local
 *     driverless entry would mask later outcomes). RED if that clear is
 *     reverted. (handleDeferredExecutorOutcomeRetryFailure's clear on
 *     NON-retryable errors and the unknown-mapping clear are the same
 *     amendment family; the not-local path is the reachable
 *     representative pinned here.)
 *
 * Does not modify src/. Spies are instance-property wrappers only, except
 * where a subtest explicitly stubs a collaborator boundary
 * (deferTransitionRetry, repository.isOperationLocallyOwned) to steer the
 * reconcile onto the amended branch.
 */

import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {ExecutorOutcomeEmitter, buildExecutorOutcome} from
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
// Amendment subtests: a REPLICA_CREATE_FAILED outcome whose error shape
// classifies as a retryable control-plane failure
// (isRetryableControlPlaneError: deferRetry === true is sufficient).
const TEST_RETRYABLE_FAILED_OUTCOME_OPTIONS = Object.freeze({
  replicaId: TEST_TARGET_REPLICA_ID,
  partitionId: TEST_PARTITION_ID,
  errorMessage: TEST_RETRYABLE_CAS_FAILURE.error,
  errorCode: TEST_RETRYABLE_CAS_FAILURE.errorCode,
  retryAfterMs: TEST_RETRYABLE_CAS_FAILURE.retryAfterMs,
  deferRetry: true,
});

function buildTargetOutcome(outcomeType, workflowStep, options = {}) {
  return buildExecutorOutcome(outcomeType, TEST_OPERATION_ID, workflowStep, {
    replicaId: TEST_TARGET_REPLICA_ID,
    partitionId: TEST_PARTITION_ID,
    ...options,
  });
}

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
 * settle before emitting the next. The spacing keeps the lane-free
 * scenarios DETERMINISTIC: exactly one reconcile per outcome, with no
 * re-drive resubmission in between (with the CL-029 re-drive an ACTIVE
 * outcome emitted while the SYNCING reconcile holds the lane would still
 * be applied, but via the loop — a different call shape than these
 * scenarios pin).
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
  'CL-029 guard: REPLACE target-completion evidence keeps a retry owner ' +
  'across the dispatch step-walk and stale reads (red on fix revert)',
  async (t) => {
    await t.test(
      'GUARD fix piece 1 (re-drive loop): outcomes arriving while the ' +
      'dispatch step-walk holds the owner lane are RE-DRIVEN once the ' +
      'holder finishes — reconcile runs, the ACTIVE evidence applies, ' +
      'source removal resumes (red on revert: the runExclusive ' +
      'coalescing drop orphaned the evidence and wedged the row at ' +
      'SYNCING)',
      async (t) => {
        const operation = buildReplaceOperation();
        const store = createCasBackedReplicaOperationStore(operation);
        const harness = createHarness(store);
        const {owner} = harness;

        try {
          await runScenario(harness, operation, {emitDuringWalk: true});
          await waitForCondition(
            () => removeDeliveries(harness).length >= 1,
            'the re-driven ACTIVE evidence to dispatch source removal',
          );

          // --- the wakeup is no longer lost: the re-drive loop awaited
          // the coalesced dispatch holder and resubmitted the LATEST
          // retained payload after the lane freed
          t.equal(
            callsOf(harness.calls, 'reconcileExecutorOutcome').length,
            1,
            'reconcileExecutorOutcome RAN (exactly once): the re-drive ' +
            'loop resubmitted the retained payload — the ACTIVE ' +
            'outcome, which superseded SYNCING by workflow-step rank — ' +
            'after the dispatch walk released the lane',
          );
          t.equal(
            harness.routedEvents.length,
            1,
            'the outcome was routed (OUTCOME_ROUTED emitted)',
          );
          t.equal(
            callsOf(harness.calls, 'reconcileReplaceActualActive')[0]
              ?.result,
            true,
            'reconcileReplaceActualActive reported applied=true for the ' +
            're-driven ACTIVE evidence',
          );

          // --- no wedge: the row advanced past SYNCING (target_sync)
          t.equal(
            store.state.authoritative.workflowStep,
            WORKFLOW_STEP.STOPPING,
            'durable workflow row advanced past SYNCING into the ' +
            'source-removal phase — the target_sync wedge is gone',
          );
          t.equal(
            removeDeliveries(harness).length,
            1,
            'the applied ACTIVE evidence resumed source removal ' +
            '(REMOVE_REPLICA dispatched)',
          );

          // --- the evidence was CONSUMED on application (or, on a path
          // that could not apply yet, a retry timer owns it) — never
          // orphaned without a driver
          t.equal(
            owner.executorOutcomeRetryPayloadByOperationId.size === 0 ||
              owner.executorOutcomeRetryTimerByOperationId.has(
                TEST_OPERATION_ID,
              ),
            true,
            'the retained payload map is empty (consumed) or an ' +
            'executor-outcome retry timer is armed — the evidence ' +
            'always keeps an owner',
          );
          t.equal(
            harness.clearedRetainedPayloads.some(
              (record) =>
                record.retainedWorkflowStep === WORKFLOW_STEP.ACTIVE,
            ),
            true,
            'the ACTIVE payload was cleared AFTER successful application ' +
            '(clearExecutorOutcomeRetryIfNotAhead), not pre-action',
          );

          // --- no misattribution: the lane holder execution the loop
          // awaited was never charged to the outcome
          t.equal(
            errorsMatching(
              harness.logs,
              REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_TRANSITION_FAILED,
            ).length,
            0,
            'no outcome-transition-failed error was logged — coalesced ' +
            'lane waits are not attributed to the outcome',
          );
          t.equal(
            harness.logs.errors.length,
            0,
            'zero errors logged overall',
          );
          t.equal(
            callsOf(harness.calls, 'completeOperation').length +
              callsOf(harness.calls, 'failOperation').length,
            0,
            'the REPLACE proceeds through source removal — neither ' +
            'completed nor failed at this point',
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
      'GUARD fix pieces 2+3+4 (stale-read exit (a)): the ACTIVE CAS ' +
      'loses to the dispatch walk and the authoritative replay no-ops, ' +
      'but the evidence is NOT erased — reconcileReplaceActualActive ' +
      'reports applied=false, a warned retry timer with exponential ' +
      'backoff owns the retained payload, and once reads heal the ' +
      'timer\'s re-drive applies it (red on revert: the pre-action ' +
      'clear erased the payload and no retry was ever scheduled)',
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

          // --- PHASE A (stale reads): the application cannot land YET
          t.equal(
            store.state.authoritative.workflowStep,
            WORKFLOW_STEP.SYNCING,
            'durable workflow row is still at SYNCING while the read ' +
            'path serves the stale snapshot — the retry owner asserted ' +
            'below is what un-wedges it later',
          );

          // --- the exact raced application: ACTIVE CAS lost to the walk
          const activeUpdateCalls = updateStepCallsTo(
            harness.calls,
            WORKFLOW_STEP.ACTIVE,
          );
          t.equal(
            activeUpdateCalls.length,
            1,
            'reconcileReplaceActualActive attempted exactly one ' +
            'updateStep(operation, ACTIVE) so far',
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
            'replayReplaceActiveSourceRemovalFromAuthoritative, which ' +
            'read the stale (non-ACTIVE) row and found nothing actionable',
          );
          t.equal(
            callsOf(harness.calls, 'reconcileReplaceActualActive')[0]
              ?.result,
            false,
            'GUARD fix piece 3: reconcileReplaceActualActive reported ' +
            'applied=false (CAS lost AND authoritative replay no-op) — ' +
            'red if it goes back to returning undefined/void',
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

          // --- GUARD fix piece 2: the evidence SURVIVES the failed
          // application — the pre-action clear is gone
          t.equal(
            harness.clearedRetainedPayloads.some(
              (record) =>
                record.retainedWorkflowStep === WORKFLOW_STEP.ACTIVE,
            ),
            false,
            'GUARD fix piece 2: no clearExecutorOutcomeRetry erased the ' +
            'retained ACTIVE payload — the pre-action clear at the top ' +
            'of reconcileExecutorOutcome (which destroyed the evidence ' +
            'before the action could fail) must stay gone',
          );
          t.equal(
            owner.executorOutcomeRetryPayloadByOperationId.get(
              TEST_OPERATION_ID,
            )?.workflowStep,
            WORKFLOW_STEP.ACTIVE,
            'the ACTIVE completion evidence is still retained',
          );

          // --- GUARD fix pieces 3->4 handoff: a retry owner is armed
          // and the deferral is observable
          t.ok(
            callsOf(harness.calls, 'scheduleExecutorOutcomeRetry')
              .length >= 1,
            'scheduleExecutorOutcomeRetry was called for the unapplied ' +
            'completion evidence',
          );
          t.equal(
            owner.executorOutcomeRetryTimerByOperationId.has(
              TEST_OPERATION_ID,
            ),
            true,
            'an executor-outcome retry timer is armed — the evidence ' +
            'keeps a live driver',
          );
          const deferredWarns = warnsMatching(
            harness.logs,
            REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TRANSITION_RETRY_DEFERRED,
          );
          t.equal(
            deferredWarns.length,
            1,
            'one "Operation transition retry deferred" warn fired — the ' +
            'run\'s fully-silent loss is observable now',
          );
          t.ok(
            deferredWarns[0]?.payload?.delayMs > 0,
            'the warn carries the armed retry delay',
          );
          t.equal(
            harness.logs.errors.length,
            0,
            'the deferral warns, it does not error — and nothing was ' +
            'misattributed to the outcome',
          );
          t.equal(
            removeDeliveries(harness).length,
            0,
            'source removal has not been dispatched yet (the stale view ' +
            'still hides the true row)',
          );

          // --- PHASE B: the timer fires while reads are STILL stale —
          // the retry must re-arm with exponential backoff, not erase
          // the evidence and not warn-spin at a fixed cadence
          const firstRetryTimer =
            owner.executorOutcomeRetryTimerByOperationId.get(
              TEST_OPERATION_ID,
            );
          await firstRetryTimer.callback();
          t.equal(
            owner.executorOutcomeRetryPayloadByOperationId.get(
              TEST_OPERATION_ID,
            )?.workflowStep,
            WORKFLOW_STEP.ACTIVE,
            'GUARD fix piece 4: the retained payload SURVIVES a fired ' +
            'retry that still cannot apply (the old timer path deleted ' +
            'it before the retry ran)',
          );
          const rearmedWarns = warnsMatching(
            harness.logs,
            REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TRANSITION_RETRY_DEFERRED,
          );
          t.equal(
            rearmedWarns.length,
            2,
            'the re-arm warned again (one warn per arm)',
          );
          t.equal(
            rearmedWarns[1]?.payload?.delayMs,
            deferredWarns[0].payload.delayMs * 2,
            'GUARD fix piece 4: the second arm DOUBLED the retry delay ' +
            '(per-operation exponential backoff)',
          );
          t.equal(
            owner.executorOutcomeRetryTimerByOperationId.has(
              TEST_OPERATION_ID,
            ),
            true,
            'a retry timer is armed again — the evidence never loses ' +
            'its owner while unapplied',
          );

          // --- PHASE C: reads heal (the divergent replica catches up);
          // the next fired retry re-drives the STILL-retained payload
          // and applies it
          store.engageStaleReadView(null);
          const healedRetryTimer =
            owner.executorOutcomeRetryTimerByOperationId.get(
              TEST_OPERATION_ID,
            );
          await healedRetryTimer.callback();
          await waitForCondition(
            () => removeDeliveries(harness).length >= 1,
            'the healed retry to apply ACTIVE and dispatch source removal',
          );
          t.equal(
            store.state.authoritative.workflowStep,
            WORKFLOW_STEP.STOPPING,
            'GUARD fix pieces 1+4: the fired retry re-drove the retained ' +
            'evidence against the healed view — ACTIVE committed and the ' +
            'REPLACE advanced into the source-removal phase (the ' +
            'target_sync wedge resolves)',
          );
          t.equal(
            removeDeliveries(harness).length,
            1,
            'source removal was dispatched by the retried application',
          );
          t.same(
            {
              retainedPayloads:
                owner.executorOutcomeRetryPayloadByOperationId.size,
              retryTimers:
                owner.executorOutcomeRetryTimerByOperationId.size,
              backoffStreaks:
                owner.executorOutcomeRetryDelayMsByOperationId.size,
            },
            {retainedPayloads: 0, retryTimers: 0, backoffStreaks: 0},
            'the applied evidence cleared its payload, its timer, and ' +
            'its backoff streak (streak resets on clear)',
          );
          t.equal(
            harness.logs.errors.length,
            0,
            'still zero errors across defer/re-arm/apply',
          );
          t.equal(
            callsOf(harness.calls, 'completeOperation').length +
              callsOf(harness.calls, 'failOperation').length,
            0,
            'the operation neither completed nor failed — it is mid ' +
            'source-removal, where the run should have been',
          );
        } finally {
          await harness.coordinator.shutdown();
        }
      },
    );

    await t.test(
      'ledger exit (b) baseline: retryable CAS persist failure — the ' +
      'observed-target replay ACTUATES source removal (applied, so ' +
      'clearing the evidence is correct) with the durable row still at ' +
      'SYNCING, and it LOGS a persist error (the real run had none, ' +
      'discriminating the run away from exit (b))',
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
            'the observed-target replay reports true: it actuated ' +
            'progress (source removal) from the observed-ACTIVE target, ' +
            'absorbing the retryable persist error — exit (b)',
          );
          t.equal(
            store.state.authoritative.workflowStep,
            WORKFLOW_STEP.SYNCING,
            'the DURABLE row never records ACTIVE (or any later step) — ' +
            'still SYNCING; progress continues via the dispatched removal',
          );
          t.equal(
            owner.executorOutcomeRetryPayloadByOperationId.size +
              owner.executorOutcomeRetryTimerByOperationId.size,
            0,
            'no executor-outcome retry owner remains — correct here ' +
            '(unlike exit (a)) because the evidence WAS applied via the ' +
            'observed-target replay, so clearing it is consumption, not ' +
            'loss',
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

    await t.test(
      'GUARD amendment 5 (success supersedes retained failure): an ' +
      'incoming SUCCESS outcome replaces a retained FAILURE payload in ' +
      'retainExecutorOutcomeRetryPayload even though FAILED holds the ' +
      'top workflow-step rank (red on revert: the pure rank contest ' +
      'keeps FAILED and masks all later success evidence)',
      async (t) => {
        const operation = buildReplaceOperation();
        const store = createCasBackedReplicaOperationStore(operation);
        const harness = createHarness(store);
        const {owner} = harness;

        try {
          const failedOutcome = buildTargetOutcome(
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
            WORKFLOW_STEP.FAILED,
            TEST_RETRYABLE_FAILED_OUTCOME_OPTIONS,
          );
          const syncingOutcome = buildTargetOutcome(
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
            WORKFLOW_STEP.SYNCING,
          );
          const activeOutcome = buildTargetOutcome(
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
            WORKFLOW_STEP.ACTIVE,
          );

          // The new predicate the supersede rule hangs on.
          t.equal(
            owner.isFailureExecutorOutcome(failedOutcome),
            true,
            'isFailureExecutorOutcome classifies REPLICA_CREATE_FAILED ' +
            '(action FAIL) as a failure outcome',
          );
          t.equal(
            owner.isFailureExecutorOutcome(activeOutcome),
            false,
            'isFailureExecutorOutcome classifies REPLICA_CREATE_ACTIVE ' +
            '(action COMPLETE) as a non-failure outcome',
          );

          // Baseline: the FAILED payload is retained first.
          owner.retainExecutorOutcomeRetryPayload(
            TEST_OPERATION_ID,
            failedOutcome,
          );
          t.equal(
            owner.executorOutcomeRetryPayloadByOperationId.get(
              TEST_OPERATION_ID,
            )?.outcomeType,
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
            'baseline: the FAILED payload (workflowStep FAILED, top ' +
            'step-rank) is retained',
          );

          // THE AMENDMENT: an ACTIVE success outcome (rank 5 < FAILED
          // rank 7) supersedes the retained failure.
          owner.retainExecutorOutcomeRetryPayload(
            TEST_OPERATION_ID,
            activeOutcome,
          );
          t.equal(
            owner.executorOutcomeRetryPayloadByOperationId.get(
              TEST_OPERATION_ID,
            )?.outcomeType,
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
            'GUARD amendment 5: the incoming ACTIVE success outcome ' +
            'SUPERSEDED the retained FAILED payload — red on revert to ' +
            'the pure rank contest (ACTIVE rank 5 loses to FAILED rank 7)',
          );

          // Among non-failure outcomes the rank contest still governs: a
          // later lower-rank success must not regress the retained one.
          owner.retainExecutorOutcomeRetryPayload(
            TEST_OPERATION_ID,
            syncingOutcome,
          );
          t.equal(
            owner.executorOutcomeRetryPayloadByOperationId.get(
              TEST_OPERATION_ID,
            )?.outcomeType,
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
            'success-vs-success stays rank-governed: a SYNCING arrival ' +
            'does not displace the retained ACTIVE payload',
          );

          // The supersede rule is not rank-shaped: even the LOWEST-rank
          // success evidence beats a retained failure.
          owner.clearExecutorOutcomeRetry(TEST_OPERATION_ID);
          owner.retainExecutorOutcomeRetryPayload(
            TEST_OPERATION_ID,
            failedOutcome,
          );
          owner.retainExecutorOutcomeRetryPayload(
            TEST_OPERATION_ID,
            syncingOutcome,
          );
          t.equal(
            owner.executorOutcomeRetryPayloadByOperationId.get(
              TEST_OPERATION_ID,
            )?.outcomeType,
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING,
            'GUARD amendment 5: a SYNCING success outcome (rank 4) also ' +
            'supersedes the retained FAILED payload (rank 7) — the rule ' +
            'is failure-vs-success, not rank',
          );

          owner.clearExecutorOutcomeRetry(TEST_OPERATION_ID);
        } finally {
          await harness.coordinator.shutdown();
        }
      },
    );

    await t.test(
      'GUARD amendment 6 (DEFER_RETRY hands the evidence to the ' +
      'transition retry): when the FAIL branch defers a retryable ' +
      'control-plane failure to deferTransitionRetry, the retained ' +
      'FAILED payload is CLEARED before the early return (red on ' +
      'revert: a driverless FAILED payload survives into the ' +
      'transition-retry-owned phase and masks the recreated replica\'s ' +
      'success outcomes)',
      async (t) => {
        const operation = buildReplaceOperation();
        // The DEFER_RETRY row of EXECUTOR_FAILURE_RECONCILE_STATE_TABLE
        // needs dispatchRetryableWorkflowStep: for a critical-partition
        // REPLACE that includes the CREATING re-arm dispatch phase.
        operation.workflowStep = WORKFLOW_STEP.CREATING;
        operation.stepsHistory.push({
          step: WORKFLOW_STEP.CREATING,
          timestamp: operation.createdAt,
          sourceReplicaId: TEST_SOURCE_REPLICA_ID,
        });
        const store = createCasBackedReplicaOperationStore(operation);
        const harness = createHarness(store);
        const {owner} = harness;

        // Stub the transition-retry boundary: it ACCEPTS ownership.
        const deferTransitionRetryCalls = [];
        owner.deferTransitionRetry = function deferStub(
          operationId,
          errorLike,
          context,
        ) {
          deferTransitionRetryCalls.push({operationId, errorLike, context});
          return true;
        };

        try {
          harness.emitter.emitOutcome(
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
            TEST_OPERATION_ID,
            WORKFLOW_STEP.FAILED,
            TEST_RETRYABLE_FAILED_OUTCOME_OPTIONS,
          );
          await waitForCondition(
            () => settledReconcileCount(harness) >= 1,
            'the FAILED outcome reconcile to settle',
          );
          await quiesce();

          // The reconcile took the DEFER_RETRY branch.
          t.equal(
            deferTransitionRetryCalls.length,
            1,
            'the failure evidence (retryable control-plane error + ' +
            'critical partition + dispatch-retryable CREATING step) ' +
            'matched DEFER_RETRY and called deferTransitionRetry once',
          );
          t.equal(
            deferTransitionRetryCalls[0]?.operationId,
            TEST_OPERATION_ID,
            'deferTransitionRetry received the operation id',
          );
          t.equal(
            deferTransitionRetryCalls[0]?.context?.workflowStep,
            WORKFLOW_STEP.CREATING,
            'the deferral context carries the durable row\'s CREATING step',
          );
          t.equal(
            callsOf(harness.calls, 'reconcileExecutorOutcome')[0]?.result,
            true,
            'the reconcile reported handled=true via the deferred early ' +
            'return',
          );
          t.equal(
            callsOf(harness.calls, 'failOperation').length,
            0,
            'the operation was NOT failed — the transition retry owns it',
          );
          t.equal(
            harness.routedEvents.length,
            0,
            'the deferred branch returns before OUTCOME_ROUTED',
          );

          // THE AMENDMENT: the retained FAILED payload did not survive
          // into the transition-retry-owned phase.
          t.equal(
            owner.executorOutcomeRetryPayloadByOperationId.has(
              TEST_OPERATION_ID,
            ),
            false,
            'GUARD amendment 6: the retained FAILED payload was CLEARED ' +
            'when deferTransitionRetry accepted ownership — red if the ' +
            'clearExecutorOutcomeRetry before the early return is ' +
            'reverted',
          );
          t.equal(
            harness.clearedRetainedPayloads.some(
              (record) =>
                record.operationId === TEST_OPERATION_ID &&
                record.retainedWorkflowStep === WORKFLOW_STEP.FAILED,
            ),
            true,
            'the clear ran while the FAILED payload was still retained ' +
            '(it erased exactly the masking evidence)',
          );
          t.equal(
            owner.executorOutcomeRetryTimerByOperationId.size,
            0,
            'no executor-outcome retry timer was armed — the transition ' +
            'retry is the sole owner',
          );
          t.equal(
            harness.logs.errors.length,
            0,
            'the deferral path logs no errors',
          );
        } finally {
          await harness.coordinator.shutdown();
        }
      },
    );

    await t.test(
      'GUARD amendment 7 (not-locally-owned clears the retained ' +
      'payload): an outcome reconciled against an operation owned by a ' +
      'REMOTE node clears the locally retained evidence (red on ' +
      'revert: a driverless local payload lingers and masks later ' +
      'outcomes)',
      async (t) => {
        const operation = buildReplaceOperation();
        // Mid-walk row; the ACTIVE outcome arrives against SYNCING, so
        // the not-local path is also wake-inert (SYNCING is not a
        // dispatch-retryable step for a REPLACE).
        operation.workflowStep = WORKFLOW_STEP.SYNCING;
        operation.stepsHistory.push({
          step: WORKFLOW_STEP.SYNCING,
          timestamp: operation.createdAt,
          sourceReplicaId: TEST_SOURCE_REPLICA_ID,
        });
        const store = createCasBackedReplicaOperationStore(operation);
        const harness = createHarness(store);
        const {owner} = harness;

        // Stub the ownership boundary: the durable row belongs to a
        // remote owner node.
        const ownershipChecks = [];
        owner.repository.isOperationLocallyOwned = function notLocal(op) {
          ownershipChecks.push(op?.operationId || null);
          return false;
        };

        try {
          harness.emitter.emitOutcome(
            EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
            TEST_OPERATION_ID,
            WORKFLOW_STEP.ACTIVE,
            {
              replicaId: TEST_TARGET_REPLICA_ID,
              partitionId: TEST_PARTITION_ID,
            },
          );
          await waitForCondition(
            () => settledReconcileCount(harness) >= 1,
            'the ACTIVE outcome reconcile to settle',
          );
          await quiesce();

          t.equal(
            ownershipChecks.includes(TEST_OPERATION_ID),
            true,
            'the reconcile consulted repository.isOperationLocallyOwned',
          );
          t.equal(
            callsOf(harness.calls, 'reconcileExecutorOutcome')[0]?.result,
            false,
            'the not-locally-owned reconcile reported false (no local ' +
            'action)',
          );

          // THE AMENDMENT: no driverless local copy of the evidence.
          t.equal(
            owner.executorOutcomeRetryPayloadByOperationId.has(
              TEST_OPERATION_ID,
            ),
            false,
            'GUARD amendment 7: the retained ACTIVE payload was CLEARED ' +
            'on the not-locally-owned path — red if that clear is ' +
            'reverted (the payload would linger with no timer and no ' +
            're-drive consumer)',
          );
          t.equal(
            harness.clearedRetainedPayloads.some(
              (record) =>
                record.operationId === TEST_OPERATION_ID &&
                record.retainedWorkflowStep === WORKFLOW_STEP.ACTIVE,
            ),
            true,
            'the clear ran while the ACTIVE payload was still retained',
          );
          t.equal(
            owner.executorOutcomeRetryTimerByOperationId.size,
            0,
            'no executor-outcome retry timer was armed for the ' +
            'remotely-owned operation',
          );
          t.equal(
            removeDeliveries(harness).length,
            0,
            'no local actuation (source removal) was dispatched for the ' +
            'remotely-owned operation',
          );
          t.equal(
            store.state.authoritative.workflowStep,
            WORKFLOW_STEP.SYNCING,
            'the durable row was left untouched for the remote owner',
          );
          t.equal(
            harness.logs.errors.length,
            0,
            'the not-local path logs no errors',
          );
        } finally {
          await harness.coordinator.shutdown();
        }
      },
    );
  },
);
