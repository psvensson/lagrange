import t from 'tap';
import {
  ControlPlaneReadinessPublicationPlanningSnapshot,
} from '../../src/control-plane/control-plane-readiness-publication-planning-snapshot.js';
import {
  ControlPlaneReadinessDiagnosticsEligibility,
} from '../../src/control-plane/control-plane-readiness-diagnostics-eligibility.js';
import {
  PRIORITY_RECOVERY_PLANNING_PROJECTION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  getSharedSyncSectionRegistry,
} from '../../src/diagnostics/event-loop-gap-watchdog.js';

// Quest publication-recovery-snapshot-starvation-relief, lever 2 (fan-out
// collapse, safe subset): buildPriorityRecoveryPlanningProjection brands its
// outputs with a NON-ENUMERABLE symbol, and the two matrix-proven
// pure-function consumers (isPriorityControlPlaneRecoveryActive,
// hasMembershipPublicationRecoveryGateEvidence) read branded fields directly
// instead of rebuilding a gate/projection per call. Spread-copies lose the
// brand, so hand-merged/retained snapshots keep the full re-derivation -
// the semantics trap the matrix identified. Section counts from the gap
// watchdog prove the skip/rebuild split.

const planningProto = ControlPlaneReadinessPublicationPlanningSnapshot.prototype;
const eligProto = ControlPlaneReadinessDiagnosticsEligibility.prototype;
const GATE_SITE = 'publication_recovery_gate_snapshot_build';
const PROJECTION_SITE = 'priority_recovery_planning_projection_build';

function siteCount(site) {
  return getSharedSyncSectionRegistry().snapshot().sites[site]?.count || 0;
}

function makeCtx() {
  const ctx = Object.create(planningProto);
  ctx.nodeId = 'node-a';
  ctx.localClusterIncarnationFenceProvider = () => null;
  return ctx;
}
const eligCtx = Object.create(eligProto);

const ACTIVE_SNAPSHOT = Object.freeze({
  publicationRecoveryGate: {
    reasonCodes: ['priority_partitions_not_spread'],
    priorityPartitionSummary: {
      blockedPartitionCount: 1,
      largestSpreadGap: 1,
      totalSpreadGap: 1,
      missingPartitionIds: ['p-a'],
    },
  },
  publicationStatus: 'PUBLISHED',
  publicationEpoch: 3,
});

t.test('builder outputs carry the non-enumerable brand; spread drops it',
  async (t) => {
    const projection = makeCtx()
      .buildPriorityRecoveryPlanningProjection(ACTIVE_SNAPSHOT);
    t.equal(
      projection[PRIORITY_RECOVERY_PLANNING_PROJECTION],
      true,
      'builder output is branded',
    );
    t.equal(
      Object.getOwnPropertyDescriptor(
        projection,
        PRIORITY_RECOVERY_PLANNING_PROJECTION,
      )?.enumerable,
      false,
      'brand is non-enumerable (so spreads and hand-merges drop it)',
    );
    const handMerged = {...projection, priorityRecoveryActive: false};
    t.equal(
      handMerged[PRIORITY_RECOVERY_PLANNING_PROJECTION],
      undefined,
      'spread-copied (hand-merged) snapshots lose the brand',
    );
  });

t.test('isPriorityControlPlaneRecoveryActive: branded projection skips the ' +
  'gate rebuild with an identical answer; unbranded copies re-derive',
async (t) => {
  const projection = makeCtx()
    .buildPriorityRecoveryPlanningProjection(ACTIVE_SNAPSHOT);

  const before = siteCount(GATE_SITE);
  const brandedAnswer = eligProto.isPriorityControlPlaneRecoveryActive.call(
    eligCtx, projection,
  );
  t.equal(
    siteCount(GATE_SITE),
    before,
    'branded input built NO gate snapshot',
  );
  t.equal(
    brandedAnswer,
    projection.priorityRecoveryActive === true,
    'short-circuit answer equals the branded field',
  );

  const unbranded = {...projection};
  const rebuiltAnswer = eligProto.isPriorityControlPlaneRecoveryActive.call(
    eligCtx, unbranded,
  );
  t.ok(
    siteCount(GATE_SITE) > before,
    'unbranded copy re-derived through a full gate build',
  );
  t.equal(
    rebuiltAnswer,
    brandedAnswer,
    'the re-derived answer matches (matrix equivalence on this sample)',
  );

  // The trap case the brand protects: a hand-merge whose top-level field
  // drifted from its embedded gate must be answered by re-derivation, not
  // trusted blindly.
  const drifted = {...projection, priorityRecoveryActive: false};
  t.equal(
    eligProto.isPriorityControlPlaneRecoveryActive.call(eligCtx, drifted),
    brandedAnswer,
    'a drifted hand-merge is re-derived from its gate evidence, not read ' +
      'from the drifted field',
  );
});

t.test('hasMembershipPublicationRecoveryGateEvidence: branded projection ' +
  'skips the re-projection with an identical answer', async (t) => {
  const ctx = makeCtx();
  const projection =
    ctx.buildPriorityRecoveryPlanningProjection(ACTIVE_SNAPSHOT);

  const before = siteCount(PROJECTION_SITE);
  const brandedAnswer =
    planningProto.hasMembershipPublicationRecoveryGateEvidence.call(
      ctx, projection,
    );
  t.equal(
    siteCount(PROJECTION_SITE),
    before,
    'branded input built NO projection',
  );

  const unbranded = {...projection};
  const rebuiltAnswer =
    planningProto.hasMembershipPublicationRecoveryGateEvidence.call(
      ctx, unbranded,
    );
  t.ok(
    siteCount(PROJECTION_SITE) > before,
    'unbranded copy re-projected',
  );
  t.equal(rebuiltAnswer, brandedAnswer, 'answers identical');
});
