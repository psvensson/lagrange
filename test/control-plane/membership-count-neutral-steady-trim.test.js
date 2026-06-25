import {test} from '../../src/test-helpers/tap.js';
import {buildMembershipPublicationTargetSnapshot} from '../../src/control-plane/membership-publication-target-selection.js';

const FLAG = 'LAGRANGE_PR_COUNT_NEUTRAL_STEADY_TRIM';

// Directed test for the count-neutral steady-trim decouple (default-off).
// Reproduces the run3 gate wedge: drain completed but a durably non-serving node
// ('D') stayed in PUBLISHED membership 135s over-target because the steady-trim was
// held by the GLOBAL priorityRecoverySpreadGapPending gate. The lever must publish the
// removal-only PROJECTED_STEADY_TRIM despite the spread gap — but ONLY for removals
// (no additions) and only with the observed-projection-gap + freeze guards still intact.

const STATE_STEADY_TRIM = 'projected_steady_trim';
const STATE_RECOVERY_COHORT = 'recovery_cohort';

const helperFns = {
  normalizeNodeIdList: (xs) =>
    [...new Set((Array.isArray(xs) ? xs : []).map((x) => String(x)))],
};

// Baseline publishes [A,B,C,D]; projection has durably dropped D (serving = [A,B,C]).
// recoveryActiveNodeIds still carries D (the cohort fallback retains it = the bug).
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

function withFlag(value, fn) {
  const prior = process.env[FLAG];
  if (value === undefined) {
    delete process.env[FLAG];
  } else {
    process.env[FLAG] = value;
  }
  try {
    fn();
  } finally {
    if (prior === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = prior;
    }
  }
}

test('lever OFF: spread-gap holds the trim → stale node stays published (the bug)', (t) => {
  for (const value of [undefined, 'false']) {
    withFlag(value, () => {
      const snap = buildMembershipPublicationTargetSnapshot(
        baseOptions({countNeutralSteadyTrimEnabled: value === 'true'}),
        helperFns,
      );
      t.equal(snap.state, STATE_RECOVERY_COHORT, `flag=${value}: falls to recovery cohort`);
      t.same(sorted(snap.nodeIds), ['A', 'B', 'C', 'D'], `flag=${value}: D NOT trimmed`);
    });
  }
  t.end();
});

test('lever ON: removal-only count-neutral trim publishes despite the spread gap', (t) => {
  withFlag('true', () => {
    const snap = buildMembershipPublicationTargetSnapshot(
      baseOptions({countNeutralSteadyTrimEnabled: true}),
      helperFns,
    );
    t.equal(snap.state, STATE_STEADY_TRIM, 'steady trim engages');
    t.same(sorted(snap.nodeIds), ['A', 'B', 'C'], 'D is trimmed from published membership');
  });
  t.end();
});

test('lever ON: NO spread gap behaves identically (trim already allowed)', (t) => {
  withFlag('true', () => {
    const snap = buildMembershipPublicationTargetSnapshot(
      baseOptions({
        countNeutralSteadyTrimEnabled: true,
        priorityRecoverySpreadGapPending: false,
      }),
      helperFns,
    );
    t.equal(snap.state, STATE_STEADY_TRIM, 'baseline trim path still engages');
    t.same(sorted(snap.nodeIds), ['A', 'B', 'C'], 'D trimmed');
  });
  t.end();
});

test('lever ON safety: an ADDITION (widening) is NOT count-neutral → stays gated', (t) => {
  withFlag('true', () => {
    const snap = buildMembershipPublicationTargetSnapshot(
      baseOptions({
        countNeutralSteadyTrimEnabled: true,
        // serving introduces E (not in baseline) → not a removal-only subset
        projectedServingNodeIds: ['A', 'B', 'C', 'E'],
      }),
      helperFns,
    );
    t.equal(snap.state, STATE_RECOVERY_COHORT, 'widening stays blocked under spread gap');
  });
  t.end();
});

test('lever ON safety: observedRecoveryProjectionGap still blocks the trim', (t) => {
  withFlag('true', () => {
    const snap = buildMembershipPublicationTargetSnapshot(
      baseOptions({
        countNeutralSteadyTrimEnabled: true,
        observedRecoveryProjectionGap: true,
      }),
      helperFns,
    );
    t.equal(snap.state, STATE_RECOVERY_COHORT, 'observed-projection-gap guard preserved');
  });
  t.end();
});

test('lever ON safety: membershipFreezeActive still blocks the trim', (t) => {
  withFlag('true', () => {
    const snap = buildMembershipPublicationTargetSnapshot(
      baseOptions({
        countNeutralSteadyTrimEnabled: true,
        membershipFreezeActive: true,
      }),
      helperFns,
    );
    t.equal(snap.state, STATE_RECOVERY_COHORT, 'membership-freeze guard preserved');
  });
  t.end();
});

test('lever ON: no trim debt (serving == baseline) → no spurious trim', (t) => {
  withFlag('true', () => {
    const snap = buildMembershipPublicationTargetSnapshot(
      baseOptions({
        countNeutralSteadyTrimEnabled: true,
        projectedServingNodeIds: ['A', 'B', 'C', 'D'],
        priorityRecoverySpreadGapPending: false,
      }),
      helperFns,
    );
    // serving == baseline → publishedTrimDebt false → not steady trim
    t.not(snap.state, STATE_STEADY_TRIM, 'no trim when nothing to trim');
  });
  t.end();
});
