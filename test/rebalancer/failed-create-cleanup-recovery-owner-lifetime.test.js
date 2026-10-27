import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {ReplicaOperationField} from
  '../../src/rebalancer/replica-operation-constants.js';
import {buildFailedCreateCleanupToken} from
  '../../src/rebalancer/failed-create-cleanup-token.js';
import {recoverFailedCreateCleanupReleaseDebt} from
  '../../src/rebalancer/operation-workflow-terminal-transition-repair.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
import {OperationLane} from '../../src/workflow/operation-lane.js';
import {
  OPERATION_SHUTDOWN_JOIN_RESULT,
  joinInFlightOperationOwnerLanes,
} from '../../src/rebalancer/operation-owner-shutdown-join.js';

const SCAN_ID = 'failed-create-cleanup-release-recovery-scan';
const JOIN_TIMEOUT_MS = 1;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, reject, resolve};
}

function waitForImmediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

function cleanupOperation(operationId = 'cleanup-recovery-op') {
  return {
    operationId,
    type: OperationType.REMOVE,
    partitionId: 'cleanup-recovery-p1',
    replicaId: 'cleanup-recovery-p1-r4',
    targetNodeId: 'node-4',
    entityType: 'partition',
    entityId: 'cleanup-recovery-p1',
    status: ReplicaStatus.REMOVED,
    workflowStep: WORKFLOW_STEP.REMOVED,
    completedAt: 50,
    [ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]: {
      cleanup_token: buildFailedCreateCleanupToken(operationId),
      create_attempt_token: `${operationId}-attempt`,
    },
  };
}

function createRecoveryOwner(queryTerminalDebt) {
  const workflowCoordinator = new DurableWorkflowCoordinator();
  const lane = new OperationLane({
    name: 'failed-create-cleanup-recovery-test',
    workflowCoordinator,
  });
  const timers = [];
  const logs = [];
  let initialized = true;
  let shuttingDown = false;
  let ownershipFenceEpoch = 0;
  let queryCalls = 0;
  const owner = {
    get isInitialized() {
      return initialized;
    },
    get isShuttingDown() {
      return shuttingDown;
    },
    terminalTransitionRepairStateByOperationId: new Map(),
    terminalTransitionRepairTimerByOperationId: new Map(),
    repository: {
      async queryTerminalFailedCreateCleanupOperations() {
        queryCalls += 1;
        return queryTerminalDebt(queryCalls);
      },
    },
    logger: {
      info(message, context) {
        logs.push({level: 'info', message, context});
      },
      warn(message, context) {
        logs.push({level: 'warn', message, context});
      },
      error(message, context) {
        logs.push({level: 'error', message, context});
      },
    },
    cloneOperationSnapshot: (operation) => structuredClone(operation),
    usesNativeRetryTimers: false,
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, cleared: false, delayMs};
      timers.push(handle);
      return handle;
    },
    clearTimeoutFn(handle) {
      handle.cleared = true;
    },
    getOperationOwnerSingleFlightKey(operationId) {
      return `operation:${operationId}`;
    },
    operationWorkflowRunExclusive: lane.run.bind(lane),
    getOperationOwnershipFenceEpoch() {
      return ownershipFenceEpoch;
    },
  };
  const scanOwnerKey = owner.getOperationOwnerSingleFlightKey(SCAN_ID);

  async function shutdown() {
    shuttingDown = true;
    initialized = false;
    ownershipFenceEpoch += 1;
    const join = await joinInFlightOperationOwnerLanes({
      inFlightExecutionsByOwnerKey:
        workflowCoordinator.inFlightExecutionsByOwnerKey,
      timeoutMs: JOIN_TIMEOUT_MS,
    });
    for (const handle of owner.terminalTransitionRepairTimerByOperationId
      .values()) {
      owner.clearTimeoutFn(handle);
    }
    owner.terminalTransitionRepairTimerByOperationId.clear();
    owner.terminalTransitionRepairStateByOperationId.clear();
    return join;
  }

  function recoveryOptions() {
    return {
      onQueryFailure(error) {
        logs.push({
          level: 'query-error',
          error: error.message,
          owned: workflowCoordinator.inFlightExecutionsByOwnerKey.has(
            scanOwnerKey,
          ),
        });
      },
    };
  }

  return {
    logs,
    owner,
    recoveryOptions,
    scanOwnerKey,
    shutdown,
    timers,
    get queryCalls() {
      return queryCalls;
    },
    workflowCoordinator,
  };
}

async function observeOutcome(promise) {
  return promise.then(
    (value) => ({error: null, value}),
    (error) => ({error, value: null}),
  );
}

test('cleanup recovery scan coalesces duplicate startup submissions in the ' +
  'canonical owner lane', async (t) => {
  const query = deferred();
  const harness = createRecoveryOwner(() => query.promise);
  const first = recoverFailedCreateCleanupReleaseDebt(
    harness.owner,
    harness.recoveryOptions(),
  );
  const second = recoverFailedCreateCleanupReleaseDebt(
    harness.owner,
    harness.recoveryOptions(),
  );
  await waitForImmediate();
  t.equal(harness.queryCalls, 1,
    'concurrent startup submissions share one authoritative query');
  t.ok(harness.workflowCoordinator.inFlightExecutionsByOwnerKey.has(
    harness.scanOwnerKey,
  ), 'the authoritative query is registered in the joined owner lane');
  query.resolve([]);
  t.equal(await first, 0);
  t.equal(await second, 0);
  t.equal(harness.logs.length, 0, 'successful empty debt emits no error');
});

test('cleanup recovery rejection is logged while its owner lane is held and ' +
  'retains one level-triggered retry', async (t) => {
  const error = new Error('authoritative_read_owner_unavailable');
  const harness = createRecoveryOwner(async () => {
    throw error;
  });
  const outcome = await observeOutcome(recoverFailedCreateCleanupReleaseDebt(
    harness.owner,
    harness.recoveryOptions(),
  ));
  t.equal(outcome.error, error, 'the authoritative error remains observable');
  t.match(harness.logs, [{
    level: 'query-error',
    error: error.message,
    owned: true,
  }], 'the error is reported before the lane deregisters');
  t.equal(harness.owner.terminalTransitionRepairTimerByOperationId.size, 1,
    'one retry remains level-triggered');
  t.equal(harness.owner.terminalTransitionRepairStateByOperationId.size, 1,
    'one retry owner retains the scan attempt');
});

test('cleanup recovery does not misclassify a post-query arm failure as an ' +
  'authoritative query failure', async (t) => {
  const operation = cleanupOperation('cleanup-arm-failure');
  const armError = new Error('cleanup arm failed');
  const harness = createRecoveryOwner(async () => [operation]);
  harness.owner.cloneOperationSnapshot = () => {
    throw armError;
  };
  const outcome = await observeOutcome(recoverFailedCreateCleanupReleaseDebt(
    harness.owner,
    harness.recoveryOptions(),
  ));
  t.equal(outcome.error, armError,
    'the cleanup-arm owner keeps its own failure identity');
  t.equal(harness.logs.length, 0,
    'a successful authoritative query emits no query-failure log');
  t.equal(harness.owner.terminalTransitionRepairTimerByOperationId.size, 0,
    'a cleanup-arm failure schedules no query retry');
  t.equal(harness.owner.terminalTransitionRepairStateByOperationId.size, 0,
    'a cleanup-arm failure retains no query-retry state');
});

for (const completion of ['success', 'rejection']) {
  test(`held initial cleanup scan ${completion} stands down past shutdown`,
    async (t) => {
      const query = deferred();
      const harness = createRecoveryOwner(() => query.promise);
      const pendingOutcome = observeOutcome(
        recoverFailedCreateCleanupReleaseDebt(
          harness.owner,
          harness.recoveryOptions(),
        ),
      );
      await waitForImmediate();
      const join = await harness.shutdown();
      t.equal(join.result, OPERATION_SHUTDOWN_JOIN_RESULT.TIMED_OUT,
        'the bounded join sees the held cleanup scan');
      if (completion === 'success') {
        query.resolve([cleanupOperation(`initial-${completion}`)]);
      } else {
        query.reject(new Error('late initial query rejection'));
      }
      const outcome = await pendingOutcome;
      t.equal(outcome.error, null,
        'a stale completion is consumed as a fenced stand-down');
      t.equal(outcome.value, 0, 'a stale scan arms no cleanup debt');
      t.equal(harness.owner.terminalTransitionRepairStateByOperationId.size, 0,
        'shutdown-cleared state stays clear');
      t.equal(harness.owner.terminalTransitionRepairTimerByOperationId.size, 0,
        'the stale continuation schedules no timer');
      t.equal(harness.logs.length, 0,
        'the stale continuation emits no post-shutdown log');
    });
}

for (const completion of ['success', 'rejection']) {
  test(`held retry cleanup scan ${completion} stands down past shutdown`,
    async (t) => {
      const retryQuery = deferred();
      const initialError = new Error('authoritative_read_owner_unavailable');
      const harness = createRecoveryOwner((queryCall) => {
        if (queryCall === 1) throw initialError;
        return retryQuery.promise;
      });
      const firstOutcome = await observeOutcome(
        recoverFailedCreateCleanupReleaseDebt(
          harness.owner,
          harness.recoveryOptions(),
        ),
      );
      t.equal(firstOutcome.error, initialError,
        'the live first rejection stays observable');
      const retryTimer = harness.timers[0];
      const retryOutcome = observeOutcome(retryTimer.callback());
      await waitForImmediate();
      t.ok(harness.workflowCoordinator.inFlightExecutionsByOwnerKey.has(
        harness.scanOwnerKey,
      ), 'the fired retry is registered in the same joined owner lane');
      const join = await harness.shutdown();
      t.equal(join.result, OPERATION_SHUTDOWN_JOIN_RESULT.TIMED_OUT,
        'shutdown boundedly joins the held retry scan');
      if (completion === 'success') {
        retryQuery.resolve([cleanupOperation(`retry-${completion}`)]);
      } else {
        retryQuery.reject(new Error('late retry query rejection'));
      }
      const outcome = await retryOutcome;
      t.equal(outcome.error, null,
        'the timer consumes the fenced retry completion');
      t.equal(harness.owner.terminalTransitionRepairStateByOperationId.size, 0,
        'the stale retry cannot restore shutdown-cleared state');
      t.equal(harness.owner.terminalTransitionRepairTimerByOperationId.size, 0,
        'the stale retry cannot restore a timer');
      t.equal(harness.logs.length, 1,
        'only the live first-query error was logged');
      t.equal(harness.logs[0]?.owned, true,
        'the sole log was emitted inside the owned scan');
    });
}
