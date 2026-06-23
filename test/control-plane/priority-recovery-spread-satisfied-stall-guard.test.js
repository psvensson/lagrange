// Census #4 — un-mask `spread_satisfied_in_flight` when its in-flight op has
// stalled past the threshold. Falsifier: flag-off MUST stay signed-off
// (byte-identical), flag-on over a stale in-flight op MUST promote to the honest
// operation_stalled / blocked pairing that routes to re-drive, and a FRESH op MUST
// stay satisfied (no premature un-mask).
import {test} from '../../src/test-helpers/tap.js';
import {
  buildPriorityRecoveryCompletion,
  PRIORITY_RECOVERY_COMPLETION_REASON,
  PRIORITY_RECOVERY_COMPLETION_STATE,
} from '../../src/control-plane/priority-recovery-completion.js';
import {
  resolvePriorityRecoverySemanticState,
} from '../../src/control-plane/priority-recovery-snapshot-ingress.js';
import {
  buildPriorityRecoveryPartitionAssessment,
} from '../../src/control-plane/priority-recovery-snapshot-closure.js';
import {
  resolvePriorityRecoverySpreadSatisfiedInFlightStalled,
} from '../../src/control-plane/priority-recovery-snapshot-observation.js';
import {
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SPREAD_SATISFIED_STALL_THRESHOLD_MS,
} from '../../src/control-plane/priority-recovery-diagnostics-constants.js';

const STALL_GUARD_FLAG = 'LAGRANGE_PR_SPREAD_STALL_GUARD';
const THRESHOLD_MS = PRIORITY_RECOVERY_SPREAD_SATISFIED_STALL_THRESHOLD_MS;
const STALE_AGE_MS = THRESHOLD_MS + 15000;
const FRESH_AGE_MS = 1000;

function buildActiveOperationContext(ageMs, operationId = 'op-in-flight') {
  // latestTimelineInFlight=true => non-terminal => counts as an active in-flight op.
  return {operationId, latestTimelineInFlight: true, ageMs};
}

function withStallGuard(enabled, fn) {
  const previous = process.env[STALL_GUARD_FLAG];
  if (enabled) {
    process.env[STALL_GUARD_FLAG] = 'true';
  } else {
    delete process.env[STALL_GUARD_FLAG];
  }
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env[STALL_GUARD_FLAG];
    } else {
      process.env[STALL_GUARD_FLAG] = previous;
    }
  }
}

// --- pure stall signal -------------------------------------------------------

test('stall signal flags a stale in-flight op and exonerates a fresh one',
  async (t) => {
    t.equal(
      resolvePriorityRecoverySpreadSatisfiedInFlightStalled(
        [buildActiveOperationContext(STALE_AGE_MS)],
        0,
        THRESHOLD_MS,
      ),
      true,
      'an in-flight op at/above the threshold is stalled',
    );
    t.equal(
      resolvePriorityRecoverySpreadSatisfiedInFlightStalled(
        [buildActiveOperationContext(FRESH_AGE_MS)],
        0,
        THRESHOLD_MS,
      ),
      false,
      'a fresh in-flight op is not stalled',
    );
    t.equal(
      resolvePriorityRecoverySpreadSatisfiedInFlightStalled([], 0, THRESHOLD_MS),
      false,
      'no in-flight ops cannot be stalled',
    );
    t.equal(
      resolvePriorityRecoverySpreadSatisfiedInFlightStalled(
        [buildActiveOperationContext(STALE_AGE_MS)],
        0,
        0,
      ),
      false,
      'a non-positive threshold disables the signal (no per-step deadline trap)',
    );
  });

// --- semantic-state classifier ----------------------------------------------

test('semantic classifier promotes satisfied-in-flight to operation_stalled only when stalled',
  async (t) => {
    const baseOptions = {
      blockerReasons: [],
      plannerReady: false,
      hasActiveOperationContexts: true,
      spreadCompletion: {satisfied: true},
    };
    t.equal(
      resolvePriorityRecoverySemanticState({...baseOptions}),
      PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
      'no stall signal stays signed off (flag-off byte-identical)',
    );
    t.equal(
      resolvePriorityRecoverySemanticState({
        ...baseOptions,
        operationStalled: false,
      }),
      PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
      'explicit non-stall stays signed off',
    );
    t.equal(
      resolvePriorityRecoverySemanticState({
        ...baseOptions,
        operationStalled: true,
      }),
      PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED,
      'a stalled in-flight op is promoted to the honest operation_stalled blocker',
    );
  });

// --- completion-state classifier --------------------------------------------

test('completion classifier promotes satisfied-in-flight to blocked only when stalled',
  async (t) => {
    const baseAssessment = {
      planner: {ready: false, spreadGap: 1},
      spreadCompletion: {satisfied: true, reasonCode: 'satisfying'},
      activeOperationContexts: [buildActiveOperationContext(STALE_AGE_MS)],
    };
    const signedOff = buildPriorityRecoveryCompletion({
      assessment: baseAssessment,
      priorityRecoveryActive: true,
    });
    t.equal(
      signedOff.state,
      PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT,
      'without the precomputed stall signal completion stays signed off',
    );
    t.equal(signedOff.blocked, false, 'signed-off completion is not blocked');

    const stalled = buildPriorityRecoveryCompletion({
      assessment: {...baseAssessment, spreadSatisfiedInFlightStalled: true},
      priorityRecoveryActive: true,
    });
    t.equal(
      stalled.state,
      PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED,
      'a stalled satisfied-in-flight op leaves the drain-completion set (blocked)',
    );
    t.equal(
      stalled.reasonCode,
      PRIORITY_RECOVERY_COMPLETION_REASON.SPREAD_SATISFIED_IN_FLIGHT_STALLED,
      'the blocked completion carries the stall reason code',
    );
    t.equal(stalled.blocked, true, 'a stalled completion is blocked (re-drives)');
  });

// --- end-to-end through the real closure assessment builder + flag ----------

test('closure assessment wires the flag: off => signed off, on+stale => stalled, on+fresh => signed off',
  async (t) => {
    const buildAssessment = (ageMs) =>
      buildPriorityRecoveryPartitionAssessment({
        partitionId: 'partition-under-test',
        planner: {ready: true},
        nowMs: 1000000,
        operationContexts: [buildActiveOperationContext(ageMs)],
        admission: {effectiveEligibleNodeIds: [], effectiveEligibleNodeCount: 0},
      });

    const flagOffStale = withStallGuard(false, () => buildAssessment(STALE_AGE_MS));
    t.equal(
      flagOffStale.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
      'flag-off over a stale op stays signed off (byte-identical)',
    );
    t.equal(
      flagOffStale.spreadSatisfiedInFlightStalled,
      false,
      'flag-off never computes a stall signal',
    );

    const flagOnStale = withStallGuard(true, () => buildAssessment(STALE_AGE_MS));
    t.equal(
      flagOnStale.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED,
      'flag-on over a stale in-flight op promotes to operation_stalled',
    );
    t.equal(
      flagOnStale.spreadSatisfiedInFlightStalled,
      true,
      'flag-on surfaces the stall signal on the assessment for the completion classifier',
    );

    const flagOnFresh = withStallGuard(true, () => buildAssessment(FRESH_AGE_MS));
    t.equal(
      flagOnFresh.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
      'flag-on over a fresh in-flight op does NOT prematurely un-mask',
    );
    t.equal(
      flagOnFresh.spreadSatisfiedInFlightStalled,
      false,
      'a fresh op leaves the stall signal clear',
    );
  });
