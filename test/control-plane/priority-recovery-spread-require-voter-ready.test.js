/**
 * Directed below-gate falsifier for the spread un-mask lever
 * (epic control-plane-write-wedge-leader-local-establishment.md, "ROOT REFRAMED").
 *
 * The priority-recovery spread view OPTIMISTICALLY certifies a partition as
 * spread-satisfied the moment a REPLACE op reaches its REMOVE-dispatch phase
 * (workflowStep ACTIVE/STOPPING) on an eligible target — regardless of whether the
 * new target replica is actually voter-ready in the OBSERVED projection
 * (`targetVisibilityState === ACTIVE_OPERATIONAL`). That optimism produces
 * `spread_satisfied_in_flight` / `gap=0` for a partition the strict active gate
 * still sees as under-spread, MASKING the real PASS blocker: the REPLACE-created
 * learner failing voter-ready promotion under load (CL-003 / CL-009 / CL-021).
 *
 * The flag `LAGRANGE_PR_SPREAD_REQUIRE_VOTER_READY` (default-off) tightens the
 * predicate so REPLACE-remove-dispatch alone no longer certifies spread until the
 * target replica is observed ACTIVE_OPERATIONAL. These tests pin:
 *  - flag-off → byte-identical optimistic behavior (REMOVE-dispatch certifies);
 *  - flag-on → an un-voter-ready REPLACE-dispatch op does NOT certify spread, so
 *    buildPriorityRecoverySpreadCompletion flips satisfied:true → false (the honest
 *    under-spread is surfaced) UNLESS the target is actually ACTIVE_OPERATIONAL;
 *  - the strict `plannerReady === true` path stays satisfied regardless of the flag
 *    (the un-mask only governs the in-flight optimism, not real planner-ready spread).
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  buildPriorityRecoverySpreadCompletion,
  isPriorityRecoverySpreadSatisfyingOperationContext,
} from '../../src/control-plane/priority-recovery-snapshot-ingress.js';

const FLAG = 'LAGRANGE_PR_SPREAD_REQUIRE_VOTER_READY';
const ELIGIBLE = ['nodeB'];

function withFlag(t, value) {
  const previous = process.env[FLAG];
  if (value === undefined) {
    delete process.env[FLAG];
  } else {
    process.env[FLAG] = value;
  }
  t.teardown(() => {
    if (previous === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = previous;
    }
  });
}

// A REPLACE whose op-level workflowStep is in the REMOVE-dispatch phase
// (ACTIVE/STOPPING) but whose OBSERVED target replica is not yet voter-ready.
function dispatchPhaseOpUnverified(overrides = {}) {
  return {
    operationId: 'replace-dispatch-op',
    type: 'REPLACE',
    workflowStep: 'ACTIVE',
    targetNodeId: 'nodeB',
    targetVisibilityState: 'non_active',
    ...overrides,
  };
}

test('flag-off: REPLACE-remove-dispatch certifies spread without voter-ready (legacy optimism preserved)', (t) => {
  withFlag(t, undefined);
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(
      dispatchPhaseOpUnverified(),
      {eligibleTargetNodeIds: ELIGIBLE},
    ),
    true,
    'unchanged: REMOVE-dispatch alone certifies when flag is unset',
  );
  withFlag(t, 'false');
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(
      dispatchPhaseOpUnverified(),
      {eligibleTargetNodeIds: ELIGIBLE},
    ),
    true,
    'unchanged: REMOVE-dispatch alone certifies when flag is false',
  );
  t.end();
});

test('flag-on: an un-voter-ready REPLACE-dispatch op does NOT certify spread (un-masked)', (t) => {
  withFlag(t, 'true');
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(
      dispatchPhaseOpUnverified(),
      {eligibleTargetNodeIds: ELIGIBLE},
    ),
    false,
    'REMOVE-dispatch without an observed voter-ready target no longer certifies',
  );
  t.end();
});

test('flag-on: a voter-ready (ACTIVE_OPERATIONAL) REPLACE-dispatch op DOES certify spread', (t) => {
  withFlag(t, 'true');
  t.equal(
    isPriorityRecoverySpreadSatisfyingOperationContext(
      dispatchPhaseOpUnverified({targetVisibilityState: 'active_operational'}),
      {eligibleTargetNodeIds: ELIGIBLE},
    ),
    true,
    'an actually-active target still certifies under the flag',
  );
  t.end();
});

test('flag-agnostic: a non-dispatch-phase op certifies iff its target is ACTIVE_OPERATIONAL (unchanged both ways)', (t) => {
  for (const value of [undefined, 'true']) {
    withFlag(t, value);
    const label = value === undefined ? 'off' : 'on';
    t.equal(
      isPriorityRecoverySpreadSatisfyingOperationContext(
        {operationId: 'add', type: 'ADD', workflowStep: 'SYNCING', targetNodeId: 'nodeB', targetVisibilityState: 'active_operational'},
        {eligibleTargetNodeIds: ELIGIBLE},
      ),
      true,
      `flag-${label}: active non-dispatch target certifies`,
    );
    t.equal(
      isPriorityRecoverySpreadSatisfyingOperationContext(
        {operationId: 'add', type: 'ADD', workflowStep: 'SYNCING', targetNodeId: 'nodeB', targetVisibilityState: 'non_active'},
        {eligibleTargetNodeIds: ELIGIBLE},
      ),
      false,
      `flag-${label}: non-active non-dispatch target does not certify`,
    );
  }
  t.end();
});

test('flag-on: buildPriorityRecoverySpreadCompletion flips satisfied true->false for an in-flight un-voter-ready REPLACE', (t) => {
  const activeOperationContexts = [dispatchPhaseOpUnverified()];
  withFlag(t, undefined);
  const off = buildPriorityRecoverySpreadCompletion({
    activeOperationContexts,
    eligibleTargetNodeIds: ELIGIBLE,
  });
  t.equal(off.satisfied, true, 'flag-off: optimistic spread_satisfied_in_flight');
  t.ok(off.satisfyingOperationIds.includes('replace-dispatch-op'), 'flag-off: op counted as satisfier');

  withFlag(t, 'true');
  const on = buildPriorityRecoverySpreadCompletion({
    activeOperationContexts,
    eligibleTargetNodeIds: ELIGIBLE,
  });
  t.equal(on.satisfied, false, 'flag-on: honest under-spread (not satisfied)');
  t.equal(on.satisfyingOperationCount, 0, 'flag-on: op is no longer a satisfier');
  t.ok(on.blockingOperationIds.includes('replace-dispatch-op'), 'flag-on: op now blocks spread');
  t.end();
});

test('strict plannerReady path stays satisfied regardless of the flag (un-mask governs only in-flight optimism)', (t) => {
  const activeOperationContexts = [dispatchPhaseOpUnverified()];
  withFlag(t, 'true');
  const completion = buildPriorityRecoverySpreadCompletion({
    activeOperationContexts,
    eligibleTargetNodeIds: ELIGIBLE,
    plannerReady: true,
  });
  t.equal(completion.satisfied, true, 'plannerReady=true => satisfied even under the flag');
  t.equal(completion.reasonCode, 'planner_ready', 'reason is planner_ready (strict spread), not in-flight');
  t.end();
});
