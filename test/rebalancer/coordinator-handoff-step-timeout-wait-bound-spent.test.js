/**
 * Spent-wait witness for the coordinator-created handoff step timeout
 * (COORDINATOR_HANDOFF_RETRY_STEP_TIMEOUT) on the arm path
 * (armCoordinatorCreatedOperation) and the remote-owner wake port: a
 * decision that says stop logs one wait_bound_spent ERROR per operation
 * even when both paths (and repeated wake passes) observe the same expiry,
 * the handoff retry is still cleared and the answer is still false; a live
 * decision logs none and still wakes the owner.
 */

import {test} from '../../src/test-helpers/tap.js';
import {withOwnerHandoffState} from
  '../../src/rebalancer/operation-workflow-owner-handoff-state.js';
import {createOperationWorkflowOwnerPorts} from
  '../../src/rebalancer/operation-workflow-owner-ports.js';
import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';

const HANDOFF_WAIT = 'COORDINATOR_HANDOFF_RETRY_STEP_TIMEOUT';
const STEP_TIMEOUT_MS = 30000;

class HandoffHost extends withOwnerHandoffState(class {}) {}

function stopDecision(shouldStop) {
  return Object.freeze({
    shouldStop,
    stepTimedOut: shouldStop,
    operationBudgetActive: false,
    operationBudgetDeadlineMs: null,
    workflowStep: 'pending',
  });
}

function createOwner(operation, shouldStop) {
  const capture = captureLogger();
  const record = {cleared: [], woken: []};
  const owner = Object.create(HandoffHost.prototype);
  Object.assign(owner, {
    nodeId: 'coordinator-node',
    logger: capture.logger,
    isShuttingDown: false,
    isInitialized: true,
    repository: {
      queryAuthoritativeOperationById: async () => operation,
      isOperationLocallyOwned: () => false,
    },
    getOperationOwnerSingleFlightKey: (operationId) => operationId,
    operationWorkflowRunExclusive: (key, run) => run(),
    resolveCoordinatorCreatedOperationArmState: () => 'remote',
    resolveCoordinatorCreatedOperationArmAction: () => 'wake_remote_owner',
    buildCoordinatorCreatedRemoteHandoffTimeoutDecision: () =>
      stopDecision(shouldStop),
    getTimeoutForStep: () => STEP_TIMEOUT_MS,
    clearCreatedOperationHandoffRetry: (operationId) => {
      record.cleared.push(operationId);
    },
    wakeCoordinatorCreatedRemoteOwner: async (woken) => {
      record.woken.push(woken.operationId);
      return true;
    },
    deferCoordinatorCreatedRemoteHandoffRetry: () => false,
  });
  return {owner, capture, record};
}

function operationNamed(operationId) {
  return Object.freeze({
    operationId,
    partitionId: 'tbl-witness_p_1',
    type: 'ADD',
    status: 'pending',
    workflowStep: 'pending',
    updatedAt: 1000,
  });
}

test('a stopped handoff seen by the arm path and the wake port reports one ' +
  'wait_bound_spent and still clears and answers false', async (t) => {
  const operation = operationNamed('handoff-stop-op');
  const {owner, capture, record} = createOwner(operation, true);
  const ports = createOperationWorkflowOwnerPorts(owner);

  t.equal(await owner.armCoordinatorCreatedOperation(operation), false);
  t.equal(await ports.wakeRemoteOwner(operation, {nowMs: 5000}), false);
  t.equal(await ports.wakeRemoteOwner(operation, {nowMs: 6000}), false);

  t.same(record.cleared,
    ['handoff-stop-op', 'handoff-stop-op', 'handoff-stop-op'],
    'every observation still clears the handoff retry');
  t.same(record.woken, [], 'no owner is woken past the bound');
  const spent = capture.spent();
  t.equal(spent.length, 1, 'one line for one operation\'s expiry');
  t.equal(spent[0].context.wait, HANDOFF_WAIT);
  t.equal(spent[0].context.boundMs, STEP_TIMEOUT_MS);
  t.equal(spent[0].context.lastObserved.stepTimedOut, true);
  t.equal(spent[0].context.scope.operationId, 'handoff-stop-op');
});

test('each path reports a stopped handoff on its own', async (t) => {
  const armed = createOwner(operationNamed('arm-only-op'), true);
  await armed.owner.armCoordinatorCreatedOperation(
    operationNamed('arm-only-op'));
  t.equal(armed.capture.spent().length, 1, 'arm path');

  const woken = createOwner(operationNamed('wake-only-op'), true);
  await createOperationWorkflowOwnerPorts(woken.owner).wakeRemoteOwner(
    operationNamed('wake-only-op'), {nowMs: 5000});
  t.equal(woken.capture.spent().length, 1, 'wake port');
});

test('a live handoff decision reports nothing and still wakes the owner',
  async (t) => {
    const operation = operationNamed('handoff-live-op');
    const {owner, capture, record} = createOwner(operation, false);

    t.equal(await owner.armCoordinatorCreatedOperation(operation), true);
    t.equal(await createOperationWorkflowOwnerPorts(owner).wakeRemoteOwner(
      operation, {nowMs: 5000}), true);

    t.same(record.woken, ['handoff-live-op', 'handoff-live-op']);
    t.equal(capture.spent().length, 0);
  });
