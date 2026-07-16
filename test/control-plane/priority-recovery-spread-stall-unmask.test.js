/**
 * Directed below-gate proof for the spread stall un-mask
 * (Quest operation-workflow-drain-redrive; epic
 * control-plane-write-wedge-leader-local-establishment.md, "ROOT REFRAMED").
 *
 * The priority-recovery spread view OPTIMISTICALLY certifies a partition as
 * spread-satisfied the moment a REPLACE op reaches its REMOVE-dispatch phase
 * (workflowStep ACTIVE/STOPPING) on an eligible target — regardless of whether the
 * new target replica is actually voter-ready in the OBSERVED projection
 * (`targetVisibilityState === ACTIVE_OPERATIONAL`). That optimism produces
 * `spread_satisfied_in_flight` for a partition the strict active gate still sees as
 * under-spread, MASKING the real PASS blocker: the REPLACE-created learner failing
 * voter-ready promotion under load (CL-003 / CL-009 / CL-021).
 *
 * The un-mask is unconditional (no flag) and STALL-SCOPED: a REPLACE-remove-dispatch
 * op keeps its optimistic certification only while it is still progressing; once it
 * has sat in the remove-dispatch phase past the stall budget without its target
 * becoming voter-ready, it stops certifying so the honest under-spread blocker is
 * surfaced. These tests pin:
 *  - a still-progressing (or untimed) un-voter-ready remove-dispatch op still
 *    certifies (transient promotion is not penalized);
 *  - a STALLED un-voter-ready remove-dispatch op no longer certifies, so
 *    buildPriorityRecoverySpreadCompletion flips satisfied:true → false;
 *  - a voter-ready (ACTIVE_OPERATIONAL) target certifies regardless of stall;
 *  - non-dispatch-phase ops certify iff voter-ready (unchanged);
 *  - the strict `plannerReady === true` path stays satisfied regardless.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  buildPriorityRecoverySpreadCompletion,
  isPriorityRecoverySpreadSatisfyingOperationContext,
} from '../../src/control-plane/priority-recovery-snapshot-ingress.js';
import {buildPriorityRecoveryReplicaOperationContext} from '../../src/control-plane/priority-recovery-snapshot-rebalancer.js';

const ELIGIBLE = ['nodeB'];
// Mirrors PRIORITY_RECOVERY_REPLACE_REMOVE_DISPATCH_SPREAD_STALL_BUDGET_MS (60s).
const STALLED_STEP_AGE_MS = 600000;
const PROGRESSING_STEP_AGE_MS = 1000;
const CLOSURE_NOW_MS = 1000000;

// A REPLACE whose op-level workflowStep is in the REMOVE-dispatch phase
// (ACTIVE/STOPPING) but whose OBSERVED target replica is not yet voter-ready.
function dispatchPhaseOpUnverified(overrides = {}) {
  return {
    operationId: 'replace-dispatch-op',
    type: 'REPLACE',
    workflowStep: 'ACTIVE',
    targetNodeId: 'nodeB',
    targetVisibilityState: 'non_active',
    stepAgeMs: PROGRESSING_STEP_AGE_MS,
    ...overrides,
  };
}

test('a still-progressing un-voter-ready remove-dispatch op certifies spread (optimistic grace)', (t) => {
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(
      dispatchPhaseOpUnverified({stepAgeMs: PROGRESSING_STEP_AGE_MS}),
      {eligibleTargetNodeIds: ELIGIBLE},
    ),
    true,
    'recently-entered REMOVE-dispatch op still certifies (grace window)',
  );
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(
      dispatchPhaseOpUnverified({stepAgeMs: undefined}),
      {eligibleTargetNodeIds: ELIGIBLE},
    ),
    true,
    'an untimed REMOVE-dispatch op certifies (no stall evidence => optimistic)',
  );
  t.end();
});

test('a STALLED un-voter-ready remove-dispatch op does NOT certify spread (un-masked)', (t) => {
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(
      dispatchPhaseOpUnverified({stepAgeMs: STALLED_STEP_AGE_MS}),
      {eligibleTargetNodeIds: ELIGIBLE},
    ),
    false,
    'a remove-dispatch op stalled past the budget without a voter-ready target no longer certifies',
  );
  t.end();
});

test('stall detection is robust to a stepTimeoutMs of 0 (no per-step deadline)', (t) => {
  // The stall predicate anchors on stepAgeMs, never on stepTimeoutMs, so a step
  // with no deadline still un-masks once it is stalled.
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(
      dispatchPhaseOpUnverified({stepAgeMs: STALLED_STEP_AGE_MS, stepTimeoutMs: 0}),
      {eligibleTargetNodeIds: ELIGIBLE},
    ),
    false,
    'a no-deadline (stepTimeoutMs=0) stalled op is still un-masked',
  );
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(
      dispatchPhaseOpUnverified({stepAgeMs: PROGRESSING_STEP_AGE_MS, stepTimeoutMs: 0}),
      {eligibleTargetNodeIds: ELIGIBLE},
    ),
    true,
    'a no-deadline progressing op still certifies (stall is stepAgeMs-driven)',
  );
  t.end();
});

test('a voter-ready (ACTIVE_OPERATIONAL) remove-dispatch op certifies even when stalled', (t) => {
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(
      dispatchPhaseOpUnverified({
        targetVisibilityState: 'active_operational',
        stepAgeMs: STALLED_STEP_AGE_MS,
      }),
      {eligibleTargetNodeIds: ELIGIBLE},
    ),
    true,
    'an actually voter-ready target certifies regardless of stall',
  );
  t.end();
});

test('a non-dispatch-phase op certifies iff its target is ACTIVE_OPERATIONAL (stall-agnostic)', (t) => {
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(
      {operationId: 'add', type: 'ADD', workflowStep: 'SYNCING', targetNodeId: 'nodeB', targetVisibilityState: 'active_operational', stepAgeMs: STALLED_STEP_AGE_MS},
      {eligibleTargetNodeIds: ELIGIBLE},
    ),
    true,
    'active non-dispatch target certifies (even when stalled)',
  );
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(
      {operationId: 'add', type: 'ADD', workflowStep: 'SYNCING', targetNodeId: 'nodeB', targetVisibilityState: 'non_active', stepAgeMs: PROGRESSING_STEP_AGE_MS},
      {eligibleTargetNodeIds: ELIGIBLE},
    ),
    false,
    'non-active non-dispatch target does not certify',
  );
  t.end();
});

test('buildPriorityRecoverySpreadCompletion flips satisfied true->false for a STALLED un-voter-ready REPLACE', (t) => {
  const progressing = buildPriorityRecoverySpreadCompletion({
    activeOperationContexts: [dispatchPhaseOpUnverified({stepAgeMs: PROGRESSING_STEP_AGE_MS})],
    eligibleTargetNodeIds: ELIGIBLE,
  });
  t.equal(progressing.satisfied, true, 'progressing: optimistic spread_satisfied_in_flight');
  t.ok(progressing.satisfyingOperationIds.includes('replace-dispatch-op'), 'progressing: op counted as satisfier');

  const stalled = buildPriorityRecoverySpreadCompletion({
    activeOperationContexts: [dispatchPhaseOpUnverified({stepAgeMs: STALLED_STEP_AGE_MS})],
    eligibleTargetNodeIds: ELIGIBLE,
  });
  t.equal(stalled.satisfied, false, 'stalled: honest under-spread (not satisfied)');
  t.equal(stalled.satisfyingOperationCount, 0, 'stalled: op is no longer a satisfier');
  t.ok(stalled.blockingOperationIds.includes('replace-dispatch-op'), 'stalled: op now blocks spread');
  t.end();
});

// Closure / serve-eligibility path: buildPriorityRecoveryReplicaOperationContext
// (the full-cluster builder, distinct from the per-partition decision-snapshot
// builder) must ALSO populate stepAgeMs from the raw steps_history so the un-mask
// fires consistently — else the cluster closure view would re-mask a stalled op
// the per-partition view un-masks.
function closureContextFor(stepAgeMs) {
  const row = {
    operation_id: 'closure-replace-op',
    type: 'REPLACE',
    workflow_step: 'ACTIVE',
    status: 'active',
    entity_type: 'partition',
    partition_id: 'sql_write_operations-p1',
    entity_id: 'sql_write_operations-p1',
    replica_id: 'sql_write_operations-p1-r4',
    source_node_id: 'nodeA',
    target_node_id: 'nodeB',
    updated_at: CLOSURE_NOW_MS,
    steps_history: JSON.stringify([
      {step: 'ACTIVE', timestamp: CLOSURE_NOW_MS - stepAgeMs},
    ]),
  };
  const serviceRows = [{
    service_id: 'sql_write_operations-p1-r4',
    replica_id: 'sql_write_operations-p1-r4',
    service_type: 'partition',
    partition_id: 'sql_write_operations-p1',
    node_id: 'nodeB',
    raft_role: 'learner', // not voter-ready => ACTIVE_NON_OPERATIONAL
    status: 'active',
    address: 'nodeB/partition/sql_write_operations-p1-r4',
  }];
  const built = buildPriorityRecoveryReplicaOperationContext(
    row, {}, serviceRows, {nowMs: CLOSURE_NOW_MS},
  );
  return built?.context;
}

test('closure builder populates stepAgeMs and un-masks a STALLED remove-dispatch op (serve-eligibility path)', (t) => {
  const stalled = closureContextFor(STALLED_STEP_AGE_MS);
  t.equal(stalled?.stepAgeMs, STALLED_STEP_AGE_MS,
    'closure context carries stepAgeMs from raw steps_history (not undefined)');
  const stalledCompletion = buildPriorityRecoverySpreadCompletion({
    activeOperationContexts: [stalled],
    eligibleTargetNodeIds: ELIGIBLE,
  });
  t.equal(stalledCompletion.satisfied, false,
    'closure path: stalled un-voter-ready op no longer certifies spread (un-masked)');

  const progressing = closureContextFor(PROGRESSING_STEP_AGE_MS);
  const progressingCompletion = buildPriorityRecoverySpreadCompletion({
    activeOperationContexts: [progressing],
    eligibleTargetNodeIds: ELIGIBLE,
  });
  t.equal(progressingCompletion.satisfied, true,
    'closure path: progressing op keeps optimistic certification (grace window)');
  t.end();
});

test('strict plannerReady path stays satisfied regardless of stall (un-mask governs only in-flight optimism)', (t) => {
  const completion = buildPriorityRecoverySpreadCompletion({
    activeOperationContexts: [dispatchPhaseOpUnverified({stepAgeMs: STALLED_STEP_AGE_MS})],
    eligibleTargetNodeIds: ELIGIBLE,
    plannerReady: true,
  });
  t.equal(completion.satisfied, true, 'plannerReady=true => satisfied even when the in-flight op is stalled');
  t.equal(completion.reasonCode, 'planner_ready', 'reason is planner_ready (strict spread), not in-flight');
  t.end();
});

test('spread completion covers the numeric gap with distinct eligible targets', (t) => {
  const operationOnNodeB = dispatchPhaseOpUnverified({
    operationId: 'replace-node-b-1',
    targetVisibilityState: 'active_operational',
  });
  const retryOnNodeB = dispatchPhaseOpUnverified({
    operationId: 'replace-node-b-2',
    targetVisibilityState: 'active_operational',
  });
  const operationOnNodeC = dispatchPhaseOpUnverified({
    operationId: 'replace-node-c',
    targetNodeId: 'nodeC',
    targetVisibilityState: 'active_operational',
  });
  const duplicateTargetCoverage = buildPriorityRecoverySpreadCompletion({
    activeOperationContexts: [operationOnNodeB, retryOnNodeB],
    eligibleTargetNodeIds: ['nodeB', 'nodeC'],
    plannerSpreadGap: 2,
  });
  t.equal(
    duplicateTargetCoverage.satisfied,
    false,
    'two operations on one node cover only one unit of a two-node spread gap',
  );
  t.same(
    duplicateTargetCoverage.satisfyingOperationIds,
    ['replace-node-b-1', 'replace-node-b-2'],
    'partial qualifying evidence stays inspectable without certifying closure',
  );

  const distinctTargetCoverage = buildPriorityRecoverySpreadCompletion({
    activeOperationContexts: [operationOnNodeB, operationOnNodeC],
    eligibleTargetNodeIds: ['nodeB', 'nodeC'],
    plannerSpreadGap: 2,
  });
  t.equal(
    distinctTargetCoverage.satisfied,
    true,
    'two distinct eligible targets cover the two-node spread gap',
  );
  t.end();
});
