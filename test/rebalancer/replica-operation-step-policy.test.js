import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {OPERATION_TRANSITION_REASON} from '../../src/rebalancer/rebalancer-constants.js';
import {
  DISPATCH_PENDING_WORKFLOW_STEPS,
  DISPATCH_WAKE_PROGRESS_PREEMPT_WORKFLOW_STEPS,
  NODE_RECOVERY_MARK_FAILED_WORKFLOW_STEPS,
  OPERATION_EXECUTOR_COMPLETION_WORKFLOW_STEPS,
  PRE_SYNC_WORKFLOW_STEPS,
  PRIORITY_CONTROL_PLANE_REMOVE_LANE_WORKFLOW_STEPS_BY_TYPE,
  PRIORITY_DISPATCH_TRANSITION_MUTATION_STEPS,
  PRIORITY_OUTCOME_DEFERRED_LOCAL_PROGRESS_TYPES_BY_STEP,
  PRIORITY_RECOVERY_INCOMPLETE_OPERATION_STEP_ORDER,
  PRIORITY_RECOVERY_INCOMPLETE_OPERATION_VISIBILITY_STEPS,
  PRIORITY_RECOVERY_OPERATION_DRAIN_WORKFLOW_STEPS,
  PROTECTED_PRIORITY_BUDGET_WORKFLOW_STEPS,
  REMOVE_PHASE_DISPATCH_WORKFLOW_STEPS,
  isActiveReplaceSourceRemovalPhase,
  isIncompleteOperationRowStep,
  isPriorityOutcomeDeferredLocalProgressCovered,
  resolveOperationTransitionReason,
} from '../../src/rebalancer/replica-operation-step-policy.js';

// Red-on-revert pin for the single-owner step-coverage policy (quest
// step-coverage-single-owner-table, CL-029 lineage). The rows' exact
// memberships are the contract: every widening/narrowing must fail here
// first and be an explicit incident-class decision.

test('CL-029 lineage rows keep their sealed memberships', (t) => {
  t.strictSame(
    [...DISPATCH_WAKE_PROGRESS_PREEMPT_WORKFLOW_STEPS].sort(),
    [WORKFLOW_STEP.CREATING, WORKFLOW_STEP.PENDING, WORKFLOW_STEP.SENDING].sort(),
    'wake-preempt covers exactly {PENDING,SENDING,CREATING} — extending it is a CL-029-class decision');
  t.strictSame(
    [...PRIORITY_DISPATCH_TRANSITION_MUTATION_STEPS].sort(),
    [WORKFLOW_STEP.CREATING, WORKFLOW_STEP.SENDING].sort());
  t.ok(PRIORITY_OUTCOME_DEFERRED_LOCAL_PROGRESS_TYPES_BY_STEP
    .get(WORKFLOW_STEP.ACTIVE).has(OperationType.REPLACE));
  t.ok(PRIORITY_OUTCOME_DEFERRED_LOCAL_PROGRESS_TYPES_BY_STEP
    .get(WORKFLOW_STEP.STOPPING).has(OperationType.REMOVE));
  t.notOk(PRIORITY_OUTCOME_DEFERRED_LOCAL_PROGRESS_TYPES_BY_STEP
    .get(WORKFLOW_STEP.STOPPING).has(OperationType.ADD));
  t.notOk(PRIORITY_OUTCOME_DEFERRED_LOCAL_PROGRESS_TYPES_BY_STEP
    .has(WORKFLOW_STEP.REMOVED),
  'terminal steps deliberately absent: REMOVED converges via completeOperation');
  t.end();
});

test('deferred-local-progress predicate mirrors the table', (t) => {
  t.ok(isPriorityOutcomeDeferredLocalProgressCovered(
    OperationType.REPLACE, WORKFLOW_STEP.ACTIVE));
  t.ok(isPriorityOutcomeDeferredLocalProgressCovered(
    OperationType.REMOVE, WORKFLOW_STEP.STOPPING));
  t.notOk(isPriorityOutcomeDeferredLocalProgressCovered(
    OperationType.ADD, WORKFLOW_STEP.ACTIVE));
  t.notOk(isPriorityOutcomeDeferredLocalProgressCovered(
    OperationType.REPLACE, WORKFLOW_STEP.CREATING),
  'CREATING takes the mutation-budget lane, not this table');
  t.end();
});

test('dispatch phase windows', (t) => {
  t.strictSame([...DISPATCH_PENDING_WORKFLOW_STEPS].sort(),
    [WORKFLOW_STEP.PENDING, WORKFLOW_STEP.SENDING].sort());
  t.strictSame([...REMOVE_PHASE_DISPATCH_WORKFLOW_STEPS].sort(),
    [WORKFLOW_STEP.ACTIVE, WORKFLOW_STEP.STOPPING].sort());
  t.ok(isActiveReplaceSourceRemovalPhase(
    OperationType.REPLACE, WORKFLOW_STEP.ACTIVE));
  t.notOk(isActiveReplaceSourceRemovalPhase(
    OperationType.ADD, WORKFLOW_STEP.ACTIVE));
  t.notOk(isActiveReplaceSourceRemovalPhase(
    OperationType.REPLACE, WORKFLOW_STEP.STOPPING));
  t.end();
});

test('incompleteness: ACTIVE counts only for remove-phase types', (t) => {
  t.ok(isIncompleteOperationRowStep(OperationType.REPLACE, WORKFLOW_STEP.ACTIVE));
  t.ok(isIncompleteOperationRowStep(OperationType.REMOVE, WORKFLOW_STEP.ACTIVE));
  t.notOk(isIncompleteOperationRowStep(OperationType.ADD, WORKFLOW_STEP.ACTIVE),
    'an ADD at ACTIVE is terminal');
  t.ok(isIncompleteOperationRowStep(OperationType.ADD, WORKFLOW_STEP.SYNCING));
  t.notOk(isIncompleteOperationRowStep(OperationType.REMOVE, WORKFLOW_STEP.REMOVED));
  t.strictSame(
    [...PRIORITY_RECOVERY_INCOMPLETE_OPERATION_STEP_ORDER].sort(),
    [...PRIORITY_RECOVERY_INCOMPLETE_OPERATION_VISIBILITY_STEPS].sort(),
    'ordered SQL list and visibility set stay membership-identical');
  t.end();
});

test('budget and recovery coverage rows', (t) => {
  t.notOk(PROTECTED_PRIORITY_BUDGET_WORKFLOW_STEPS.has(WORKFLOW_STEP.CREATING),
    'CREATING deliberately excluded: it uses the bounded mutation lane');
  t.strictSame([...NODE_RECOVERY_MARK_FAILED_WORKFLOW_STEPS].sort(),
    [...PRE_SYNC_WORKFLOW_STEPS, WORKFLOW_STEP.STOPPING].sort(),
    'recovery marks failed = pre-sync plus STOPPING');
  for (const step of PRE_SYNC_WORKFLOW_STEPS) {
    t.ok(PRIORITY_RECOVERY_OPERATION_DRAIN_WORKFLOW_STEPS.has(step),
      `pre-sync ${step} participates in the drain`);
  }
  t.end();
});

test('per-type lane rows and completion signaling', (t) => {
  const removeLane = PRIORITY_CONTROL_PLANE_REMOVE_LANE_WORKFLOW_STEPS_BY_TYPE;
  t.ok(removeLane.get(OperationType.REMOVE).has(WORKFLOW_STEP.STOPPING));
  t.notOk(removeLane.get(OperationType.REMOVE).has(WORKFLOW_STEP.SYNCING));
  t.ok(removeLane.get(OperationType.REPLACE).has(WORKFLOW_STEP.SYNCING));
  t.strictSame([...OPERATION_EXECUTOR_COMPLETION_WORKFLOW_STEPS].sort(),
    [WORKFLOW_STEP.ACTIVE, WORKFLOW_STEP.FAILED, WORKFLOW_STEP.REMOVED].sort(),
    'the formerly-triplicated completion row');
  t.end();
});

test('transition-reason projection', (t) => {
  t.equal(resolveOperationTransitionReason(
    WORKFLOW_STEP.SYNCING, WORKFLOW_STEP.ACTIVE),
  OPERATION_TRANSITION_REASON.RECONCILE_ACTIVE);
  t.equal(resolveOperationTransitionReason(
    WORKFLOW_STEP.PENDING, WORKFLOW_STEP.ACTIVE),
  OPERATION_TRANSITION_REASON.DISPATCH_ALREADY_EXISTS);
  t.equal(resolveOperationTransitionReason(
    WORKFLOW_STEP.ACTIVE, WORKFLOW_STEP.REMOVED),
  OPERATION_TRANSITION_REASON.OPERATION_COMPLETED);
  t.equal(resolveOperationTransitionReason(null, 'unknown-step'),
    OPERATION_TRANSITION_REASON.DISPATCH_SENDING,
    'unknown transitions keep the historical DISPATCH_SENDING fallback');
  t.end();
});

test('every exported row is frozen', (t) => {
  for (const row of [
    DISPATCH_PENDING_WORKFLOW_STEPS,
    DISPATCH_WAKE_PROGRESS_PREEMPT_WORKFLOW_STEPS,
    NODE_RECOVERY_MARK_FAILED_WORKFLOW_STEPS,
    OPERATION_EXECUTOR_COMPLETION_WORKFLOW_STEPS,
    PRE_SYNC_WORKFLOW_STEPS,
    PRIORITY_DISPATCH_TRANSITION_MUTATION_STEPS,
    PRIORITY_RECOVERY_OPERATION_DRAIN_WORKFLOW_STEPS,
    PROTECTED_PRIORITY_BUDGET_WORKFLOW_STEPS,
    REMOVE_PHASE_DISPATCH_WORKFLOW_STEPS,
  ]) {
    t.ok(Object.isFrozen(row));
  }
  t.end();
});
