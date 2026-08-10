/**
 * CL-029 (quest formation-ledger-self-move-blocks-cluster-ops): the re-drive
 * loop's retained-and-untouched exit must arm the timed retry.
 *
 * `redriveExecutorOutcomeReconcile` exits when a reconcile ran but left the
 * retained payload untouched (not-yet-applicable / raced by the dispatch
 * step-walk). The unfixed exit returned bare — payload retained, NO timer,
 * no re-drive consumer: the 2026-07-13 08:44 formation run left three ADD
 * operations silent for ~178s with their replicas already created, exactly
 * the recorded CL-029 invariant ("target-completion evidence must retain a
 * retry owner until applied to the durable workflow row").
 *
 * RED-ON-REVERT: the first case asserts a retry timer is armed after the
 * untouched exit; on the unfixed loop no timer exists.
 */

import {test} from '../../src/test-helpers/tap.js';
import {applyOperationWorkflowExecutorOutcomeReconcileMethods} from
  '../../src/rebalancer/operation-workflow-executor-outcome-reconcile-methods.js';
import {EXECUTOR_OUTCOME_TYPE} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationWorkflowTransitionPersistence} from
  '../../src/rebalancer/operation-workflow-transition-persistence.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION} from
  '../../src/rebalancer/replica-operation-update-disposition.js';
import {REBALANCE_COORDINATOR_LOG_MSG} from
  '../../src/rebalancer/rebalancer-constants.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';

const TEST_OPERATION_ID = 'op-redrive-untouched';

function buildOutcome() {
  return {
    operationId: TEST_OPERATION_ID,
    outcomeType: EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
    workflowStep: WORKFLOW_STEP.ACTIVE,
    partitionId: 'tbl-test-p1',
    replicaId: 'tbl-test-p1-r1',
  };
}

function buildHost({reconcile}) {
  class Host {}
  applyOperationWorkflowExecutorOutcomeReconcileMethods(Host);
  const host = new Host();
  host.isShuttingDown = false;
  host.isInitialized = true;
  host.executorOutcomeRedriveInFlightByOperationId = new Set();
  host.executorOutcomeRetryPayloadByOperationId = new Map();
  host.executorOutcomeRetryTimerByOperationId = new Map();
  host.executorOutcomeRetryDelayMsByOperationId = new Map();
  host.operationWorkflowRunExclusive = async (_key, factory) => factory();
  host.getOperationOwnerSingleFlightKey = (operationId) => operationId;
  host.reconcileExecutorOutcome = reconcile;
  host.setTimeoutFn = (fn, delayMs) => ({fn, delayMs});
  host.logger = {
    warn: () => {},
    info: () => {},
    error: () => {},
    debug: () => {},
  };
  return host;
}

test(
  'a reconcile that leaves the retained payload untouched arms the timed ' +
    'retry (the evidence always keeps an owner)',
  async (t) => {
    const host = buildHost({
      // Runs, but neither consumes nor replaces the payload — the raced /
      // not-yet-applicable shape.
      reconcile: async () => {},
    });
    host.handleExecutorOutcome(buildOutcome());
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(
      host.executorOutcomeRetryPayloadByOperationId.has(TEST_OPERATION_ID),
      true,
      'the evidence stays retained',
    );
    t.equal(
      host.executorOutcomeRetryTimerByOperationId.has(TEST_OPERATION_ID),
      true,
      'a timed retry owner is armed for the untouched payload',
    );
    t.end();
  },
);

test(
  'a reconcile that consumes the payload exits without arming a timer',
  async (t) => {
    const host = buildHost({
      reconcile: async () => {
        host.executorOutcomeRetryPayloadByOperationId.delete(
          TEST_OPERATION_ID,
        );
      },
    });
    host.handleExecutorOutcome(buildOutcome());
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(
      host.executorOutcomeRetryPayloadByOperationId.has(TEST_OPERATION_ID),
      false,
      'the evidence was consumed',
    );
    t.equal(
      host.executorOutcomeRetryTimerByOperationId.has(TEST_OPERATION_ID),
      false,
      'no timer for consumed evidence',
    );
    t.end();
  },
);

// --- terminal-write refusal keeps the retry owner (quest
// terminal-write-refusal-retry-ownership) ---
//
// completeOperation/failOperation used to erase every armed retry lane as
// their FIRST statement — a race that killed the executor-outcome
// visibility retry mid-backoff and then persisted a terminal write that
// was silently REFUSED (live proof: run ec-q6, retry cleared at
// 09:29:34.941Z, write refused, silence). Clearing must be a consequence
// of a PROVEN terminal, never a precondition of attempting one.

const TEST_TERMINAL_OPERATION = Object.freeze({
  operationId: TEST_OPERATION_ID,
  type: OperationType.ADD,
  partitionId: 'tbl-test-p1',
  replicaId: 'tbl-test-p1-r1',
  targetNodeId: 'node-target',
  workflowStep: WORKFLOW_STEP.SYNCING,
  status: 'syncing',
  completedAt: null,
  createdAt: 1,
  stepsHistory: [],
});

function buildTerminalPersistenceHost({transitionOutcome}) {
  const host = Object.create(OperationWorkflowTransitionPersistence.prototype);
  const recorded = {
    retryClears: [],
    transitionRetryClears: [],
    reservationReleases: [],
    warns: [],
    infos: [],
    scheduledRepairTimers: [],
  };
  host.clearDispatchRetry = (id) => recorded.retryClears.push(
    {lane: 'dispatch', id},
  );
  host.clearObservedProgressRetry = (id) => recorded.retryClears.push(
    {lane: 'observedProgress', id},
  );
  host.clearPriorityActiveReplaceRetry = (id) => recorded.retryClears.push(
    {lane: 'priorityActiveReplace', id},
  );
  host.clearExecutorOutcomeRetry = (id) => recorded.retryClears.push(
    {lane: 'executorOutcome', id},
  );
  host.clearTransitionRetry = (id) =>
    recorded.transitionRetryClears.push(id);
  host.clearDeferredSafetyBlockState = () => {};
  host.releaseReservationForOperation = async (operation) =>
    recorded.reservationReleases.push(operation.operationId);
  host.buildOperationTransitionStepEntry = (
    _operation, step, reason, previousStep, now,
  ) => ({step, reason, previousStep, timestamp: now});
  host.normalizeErrorMessage = (message, fallback) => message || fallback;
  host.isSafetyPolicyFailure = () => false;
  host.executeAtomicTransition = async () => transitionOutcome;
  host.emitter = {emit() {}};
  host.stats = {operationsCompleted: 0, operationsFailed: 0};
  host.logger = {
    debug() {},
    info(message, payload) {
      recorded.infos.push({message, payload});
    },
    warn(message, payload) {
      recorded.warns.push({message, payload});
    },
    error() {},
  };
  // armTerminalTransitionRepair owner surface. The prototype chain
  // exposes isShuttingDown as a getter, so shadow it on the instance.
  Object.defineProperty(host, 'isShuttingDown', {value: false});
  host.terminalTransitionRepairStateByOperationId = new Map();
  host.terminalTransitionRepairTimerByOperationId = new Map();
  host.cloneOperationSnapshot = (operation) => ({...operation});
  host.setTimeoutFn = (callback, delayMs) => {
    const timerHandle = {callback, delayMs};
    recorded.scheduledRepairTimers.push(timerHandle);
    return timerHandle;
  };
  host.clearTimeoutFn = () => {};
  return {host, recorded};
}

test(
  'a REFUSED terminal persist keeps every armed retry lane, arms the ' +
    'terminal-transition repair, and warns once (typed)',
  async (t) => {
    const refusedOutcome = Object.freeze({
      committed: false,
      disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
    });
    const {host, recorded} = buildTerminalPersistenceHost({
      transitionOutcome: refusedOutcome,
    });

    const returnedOutcome =
      await host.completeOperation({...TEST_TERMINAL_OPERATION});

    t.same(
      recorded.retryClears,
      [],
      'no retry lane is cleared before the terminal write is proven ' +
        '(clearTerminalOperationRetryState no longer fires pre-write)',
    );
    t.equal(
      recorded.reservationReleases.length,
      0,
      'the reservation stays ACTIVE on unresolved divergence',
    );
    t.equal(
      host.terminalTransitionRepairStateByOperationId.has(TEST_OPERATION_ID),
      true,
      'the EXISTING terminal-transition repair is armed for the refusal',
    );
    t.equal(
      host.terminalTransitionRepairTimerByOperationId.has(TEST_OPERATION_ID),
      true,
      'the repair retry timer is scheduled',
    );
    const refusalWarns = recorded.warns.filter((entry) =>
      entry.message ===
        REBALANCE_COORDINATOR_LOG_MSG.TERMINAL_TRANSITION_PERSIST_NOT_COMMITTED,
    );
    t.equal(refusalWarns.length, 1, 'exactly one typed refusal warn');
    t.same(
      {
        operationId: refusalWarns[0]?.payload?.operationId,
        disposition: refusalWarns[0]?.payload?.disposition,
        step: refusalWarns[0]?.payload?.step,
      },
      {
        operationId: TEST_OPERATION_ID,
        disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
        step: WORKFLOW_STEP.ACTIVE,
      },
      'the warn names operationId, disposition, and step',
    );
    t.equal(
      returnedOutcome,
      refusedOutcome,
      'completeOperation returns its typed transition outcome',
    );
    t.end();
  },
);

test(
  'a committed terminal persist clears the retry lanes as a consequence ' +
    'of the proven terminal',
  async (t) => {
    const {host, recorded} = buildTerminalPersistenceHost({
      transitionOutcome: Object.freeze({
        committed: true,
        disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED,
      }),
    });

    const returnedOutcome =
      await host.failOperation({...TEST_TERMINAL_OPERATION}, 'boom');

    t.same(
      recorded.retryClears.map((entry) => entry.lane),
      ['dispatch', 'observedProgress', 'priorityActiveReplace',
        'executorOutcome'],
      'every owner-local retry lane is cleared after the committed ' +
        'terminal',
    );
    t.equal(
      host.terminalTransitionRepairStateByOperationId.size,
      0,
      'no repair is armed for a committed terminal',
    );
    t.same(
      recorded.reservationReleases,
      [TEST_OPERATION_ID],
      'the reservation releases on the proven terminal',
    );
    t.equal(
      returnedOutcome?.committed,
      true,
      'failOperation returns its typed transition outcome',
    );
    t.end();
  },
);

test(
  'release-gated dispositions (TERMINAL_ADOPTED / IDEMPOTENT_REPLAY) keep ' +
    'today\'s behavior exactly: clear, release, no repair, no warn',
  async (t) => {
    for (const disposition of [
      REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED,
      REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY,
    ]) {
      const {host, recorded} = buildTerminalPersistenceHost({
        transitionOutcome: Object.freeze({committed: false, disposition}),
      });

      await host.completeOperation({...TEST_TERMINAL_OPERATION});

      t.same(
        recorded.retryClears.map((entry) => entry.lane),
        ['dispatch', 'observedProgress', 'priorityActiveReplace',
          'executorOutcome'],
        `${disposition}: retry lanes clear (a durable terminal is proven)`,
      );
      t.same(
        recorded.reservationReleases,
        [TEST_OPERATION_ID],
        `${disposition}: the reservation releases`,
      );
      t.equal(
        host.terminalTransitionRepairStateByOperationId.size,
        0,
        `${disposition}: no repair armed`,
      );
      t.same(
        recorded.warns,
        [],
        `${disposition}: no refusal warn`,
      );
    }
    t.end();
  },
);
