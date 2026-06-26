import {test} from '../../src/test-helpers/tap.js';
import {buildMembershipPublicationTargetSnapshot} from '../../src/control-plane/membership-publication-target-selection.js';

// The steady-trim that drops a durably non-serving node from PUBLISHED membership is
// gated on the GLOBAL priorityRecoverySpreadGapPending flag (plus the
// observedRecoveryProjectionGap + membershipFreeze guards). When the spread gap is
// pending, the trim is held and the cluster falls back to the recovery cohort.

const STATE_STEADY_TRIM = 'projected_steady_trim';
const STATE_RECOVERY_COHORT = 'recovery_cohort';

const helperFns = {
  normalizeNodeIdList: (xs) =>
    [...new Set((Array.isArray(xs) ? xs : []).map((x) => String(x)))],
};

// Baseline publishes [A,B,C,D]; projection has durably dropped D (serving = [A,B,C]).
// recoveryActiveNodeIds still carries D (the cohort fallback retains it).
function baseOptions(overrides = {}) {
  return {
    explicitPublishedNodeIds: [],
    publishedBaselineNodeIds: ['A', 'B', 'C', 'D'],
    projectedServingNodeIds: ['A', 'B', 'C'],
    recoveryActiveNodeIds: ['A', 'B', 'C', 'D'],
    observedActiveNodeIds: ['A', 'B', 'C'],
    priorityRecoverySpreadGapPending: true,
    observedRecoveryProjectionGap: false,
    membershipFreezeActive: false,
    ...overrides,
  };
}

function sorted(xs) {
  return [...xs].sort();
}

test('spread-gap pending holds the trim → stale node stays published', (t) => {
  const snap = buildMembershipPublicationTargetSnapshot(baseOptions(), helperFns);
  t.equal(snap.state, STATE_RECOVERY_COHORT, 'falls to recovery cohort');
  t.same(sorted(snap.nodeIds), ['A', 'B', 'C', 'D'], 'D NOT trimmed');
  t.end();
});

test('NO spread gap: trim is allowed and engages', (t) => {
  const snap = buildMembershipPublicationTargetSnapshot(
    baseOptions({priorityRecoverySpreadGapPending: false}),
    helperFns,
  );
  t.equal(snap.state, STATE_STEADY_TRIM, 'baseline trim path engages');
  t.same(sorted(snap.nodeIds), ['A', 'B', 'C'], 'D trimmed');
  t.end();
});

test('observedRecoveryProjectionGap blocks the trim', (t) => {
  const snap = buildMembershipPublicationTargetSnapshot(
    baseOptions({
      priorityRecoverySpreadGapPending: false,
      observedRecoveryProjectionGap: true,
    }),
    helperFns,
  );
  t.equal(snap.state, STATE_RECOVERY_COHORT, 'observed-projection-gap guard preserved');
  t.end();
});

test('membershipFreezeActive blocks the trim', (t) => {
  const snap = buildMembershipPublicationTargetSnapshot(
    baseOptions({
      priorityRecoverySpreadGapPending: false,
      membershipFreezeActive: true,
    }),
    helperFns,
  );
  t.equal(snap.state, STATE_RECOVERY_COHORT, 'membership-freeze guard preserved');
  t.end();
});

test('no trim debt (serving == baseline) → no spurious trim', (t) => {
  const snap = buildMembershipPublicationTargetSnapshot(
    baseOptions({
      projectedServingNodeIds: ['A', 'B', 'C', 'D'],
      priorityRecoverySpreadGapPending: false,
    }),
    helperFns,
  );
  // serving == baseline → publishedTrimDebt false → not steady trim
  t.not(snap.state, STATE_STEADY_TRIM, 'no trim when nothing to trim');
  t.end();
});
