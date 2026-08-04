// Deterministic proof for quest publication-recovery-snapshot-starvation-relief
// (measurement rung): the two profiled snapshot construction entry points -
// buildPublicationRecoveryGateSnapshot and
// buildPriorityRecoveryPlanningProjection - are wrapped with trackSyncSection
// so a live run reports how often each is actually rebuilt (CL-033/CL-034 memo
// misses included) and at what cost, via the event-loop gap watchdog's
// siteDeltas. Instrumentation-only: these tests prove each section is recorded
// into the shared registry and that the wrapped functions return/throw
// identically to their untracked bodies.

import {test} from '../../src/test-helpers/tap.js';
import {
  getSharedSyncSectionRegistry,
} from '../../src/diagnostics/event-loop-gap-watchdog.js';
import {
  buildPublicationRecoveryGateSnapshot,
} from '../../src/control-plane/publication-recovery-gate.js';
import {
  ControlPlaneReadinessPriorityRecoveryPlanning,
} from '../../src/control-plane/control-plane-readiness-priority-recovery-planning.js';

const GATE_SNAPSHOT_SITE = 'publication_recovery_gate_snapshot_build';
const PLANNING_PROJECTION_SITE = 'priority_recovery_planning_projection_build';

function siteSnapshot(site) {
  return getSharedSyncSectionRegistry().snapshot().sites[site];
}

test('publication_recovery_gate_snapshot_build section is recorded and the ' +
  'snapshot output is identical to the untracked body', async (t) => {
  const options = {
    reasonCodes: [
      'priority_partitions_not_spread',
      'priority_partitions_not_spread',
    ],
    priorityPartitionSummary: {
      blockedPartitionCount: 1,
      largestSpreadGap: 1,
      totalSpreadGap: 1,
      missingPartitionIds: [' partition-a ', 'partition-a'],
    },
  };

  const before = siteSnapshot(GATE_SNAPSHOT_SITE)?.count || 0;
  const tracked = buildPublicationRecoveryGateSnapshot(options);
  const after = siteSnapshot(GATE_SNAPSHOT_SITE)?.count || 0;

  t.equal(after, before + 1, 'the gate snapshot build entered its section');
  t.same(
    tracked.reasonCodes,
    ['priority_partitions_not_spread'],
    'normalized reason codes unchanged',
  );
  const again = buildPublicationRecoveryGateSnapshot(options);
  t.same(
    JSON.parse(JSON.stringify(again)),
    JSON.parse(JSON.stringify(tracked)),
    'repeated tracked builds are deterministic (no instrumentation leak ' +
      'into the snapshot)',
  );
  t.equal(
    siteSnapshot(GATE_SNAPSHOT_SITE)?.count || 0,
    before + 2,
    'every build is counted (the count measures rebuild cadence live)',
  );
  t.end();
});

test('priority_recovery_planning_projection_build section is recorded and ' +
  'the projection return value is unchanged', async (t) => {
  const planning = Object.create(
    ControlPlaneReadinessPriorityRecoveryPlanning.prototype,
  );

  const before = siteSnapshot(PLANNING_PROJECTION_SITE)?.count || 0;
  // The non-object guard is part of the wrapped body: null in, null out.
  t.equal(
    planning.buildPriorityRecoveryPlanningProjection(null),
    null,
    'null planning snapshot still resolves to null',
  );
  t.equal(
    siteSnapshot(PLANNING_PROJECTION_SITE)?.count || 0,
    before + 1,
    'the projection build entered its section (guard path included)',
  );

  // Delegation contract: the tracked wrapper calls the untracked body with
  // the same this-binding and argument and returns its value unchanged.
  const sentinel = Object.freeze({projection: 'sentinel'});
  const seen = [];
  planning.buildPriorityRecoveryPlanningProjectionUntracked =
    function untrackedStub(snapshot) {
      seen.push([this, snapshot]);
      return sentinel;
    };
  const input = {publicationEpoch: 7};
  const result = planning.buildPriorityRecoveryPlanningProjection(input);
  t.equal(result, sentinel, 'return value propagated unchanged');
  t.equal(seen.length, 1, 'untracked body invoked exactly once');
  t.equal(seen[0][0], planning, 'this-binding preserved');
  t.equal(seen[0][1], input, 'planning snapshot argument passed through');
  t.equal(
    siteSnapshot(PLANNING_PROJECTION_SITE)?.count || 0,
    before + 2,
    'delegated build is also counted',
  );

  planning.buildPriorityRecoveryPlanningProjectionUntracked =
    function throwingStub() {
      throw new Error('projection-boom');
    };
  let thrown = null;
  try {
    planning.buildPriorityRecoveryPlanningProjection(input);
  } catch (error) {
    thrown = error;
  }
  t.equal(
    thrown?.message,
    'projection-boom',
    'exceptions propagate unchanged (finally still exits the section)',
  );
  t.equal(
    siteSnapshot(PLANNING_PROJECTION_SITE)?.count || 0,
    before + 3,
    'section exits on throw too',
  );
  t.end();
});
