/**
 * BR6 / AN12 (amendment-1 step 5): the dispatch-time membership epoch gate
 * fences what its own contract names - a queued ADD/REPLACE that sat
 * PENDING across an epoch advance and would otherwise dispatch work from an
 * abandoned plan. It applies only before the operation's create has been
 * handed to an executor. A REPLACE already past that point (placing its
 * target, or in its owner phases) re-entering through DISPATCH after an
 * epoch advance is not failed by the gate: it converges under its owner.
 *
 * Universe: every non-terminal REPLACE step (production enumeration).
 * Oracle: the REPLACE step order - the steps before CREATING (the step in
 * which the executor is asked to create the target) are pre-dispatch. The
 * control half of the universe proves the gate still fences there.
 */

import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OPERATION_TERMINAL_WORKFLOW_STEPS_BY_TYPE,
  OperationType,
  WORKFLOW_STEP_TO_STATUS,
  getWorkflowSteps,
} from '../../src/rebalancer/replica-status.js';
import {
  PLANNING_EPOCH,
  buildEpochBoundAddOperation,
  createEpochCoordinator,
  initializeConfig,
  wireEpochDispatchProbe,
} from './epoch-fence-test-harness.js';

const REPLACE_STEPS = getWorkflowSteps(OperationType.REPLACE);
const NON_TERMINAL_REPLACE_STEPS = REPLACE_STEPS.filter((step) =>
  !OPERATION_TERMINAL_WORKFLOW_STEPS_BY_TYPE.get(OperationType.REPLACE)
    .has(step));
const PRE_DISPATCH_STEPS = new Set(
  REPLACE_STEPS.slice(0, REPLACE_STEPS.indexOf(WORKFLOW_STEP.CREATING)));
const STALE_EPOCH_PATTERN = /Stale dispatch for published membership epoch/;

function replaceAt(step) {
  return buildEpochBoundAddOperation(PLANNING_EPOCH, {
    operationId: `an12-replace-${step}`,
    type: OperationType.REPLACE,
    sourceNodeId: 'epoch-source-node',
    sourceReplicaId: 'p-epoch-fence-r1',
    workflowStep: step,
    status: WORKFLOW_STEP_TO_STATUS[step],
    stepsHistory: [{step, sourceReplicaId: 'p-epoch-fence-r1'}],
  });
}

test('BR6/AN12: an epoch advance fails a REPLACE through DISPATCH only ' +
  'before its create was handed to an executor', async (t) => {
  initializeConfig();
  t.ok(PRE_DISPATCH_STEPS.size > 0 &&
    PRE_DISPATCH_STEPS.size < NON_TERMINAL_REPLACE_STEPS.length,
  'the universe has both pre-dispatch and dispatched steps');
  for (const step of NON_TERMINAL_REPLACE_STEPS) {
    const {coordinator, setCurrentEpoch} = createEpochCoordinator({
      currentEpoch: PLANNING_EPOCH,
    });
    try {
      const probe = wireEpochDispatchProbe(coordinator);
      setCurrentEpoch(PLANNING_EPOCH + 1);
      try {
        await probe.dispatch(replaceAt(step));
      } catch (_error) {
        // A later stage of the lane may refuse this reduced operation for
        // its own reasons; only the epoch gate's verdict is asserted.
      }
      const epochFailures = probe.failedOperations.filter(({message}) =>
        STALE_EPOCH_PATTERN.test(String(message)));
      if (PRE_DISPATCH_STEPS.has(step)) {
        t.equal(epochFailures.length, 1,
          `${step}: control - a queued REPLACE of an abandoned plan fails`);
      } else {
        t.equal(epochFailures.length, 0,
          `${step}: an epoch advance does not fail it through DISPATCH`);
      }
    } finally {
      await coordinator.shutdown();
    }
  }
});
