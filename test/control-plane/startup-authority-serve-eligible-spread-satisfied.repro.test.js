/**
 * Repro + safety spec — serve-eligibility while spread is satisfied in flight
 *
 * Deterministic spec for the rolling-restart N=8 gate failures run3
 * (restart_recovery_timeout) and run7 (nodeSlotUnavailable),
 * stat-gate-20260627T163326Z. Both stall on the same gate: the startup
 * authority reports state !== READY (so serveEligible is false cluster-wide,
 * reason PRIORITY_CONTROL_PLANE_RECOVERY_PENDING) which in run7 denies all
 * load admission and in run3 makes the seed return LEADER_METADATA_INCOMPLETE
 * to a rejoiner until its seed-contact budget is exhausted.
 *
 * Mechanism (src/control-plane/startup-authority-snapshot-owner.js): the
 * projection active-gate state REPAIR_READY means the node IS ready to serve
 * but a recovery operation is still in flight. It was forcing RECOVERY_PENDING
 * even when the priority spread is satisfied. The fix relaxes to READY, but
 * ONLY when it is safe to serve:
 *   - the active gate is REPAIR_READY (repair lane ready, serve blocked), AND
 *   - the VOTER-READY-SOUND durable priority spread is satisfied
 *     (durablePriorityPartitionSummary, not the optimistic closure-witness one
 *     that can be satisfied without a voter-ready replacement under the
 *     LAGRANGE_PR_SPREAD_REQUIRE_VOTER_READY=off default), AND
 *   - the active gate's serve-lane reasonCodes contain ONLY
 *     priority_recovery_active — no serve_not_eligible / publication_stream_*
 *     disqualifier.
 *
 * The first case below is RED on unfixed code (the bug); the rest assert the
 * safety envelope must hold (they pass before and after — they exist to catch
 * an over-broad relaxation). DT1-class: structural state, synchronous gate
 * output, no wall clock, no docker.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';

function createCache() {
  return {
    get() {
      return null;
    },
    getAll() {
      return [];
    },
    filter() {
      return [];
    },
    onCacheChange() {},
  };
}

function buildSnapshot(activeGate, overrides = {}) {
  const service = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: createCache(),
  });
  return service.buildStartupAuthoritySnapshotFromPlanningAnswer({
    publicationEpoch: 13,
    publicationStatus: 'PUBLISHED',
    priorityPartitionSummary: {satisfied: true},
    recoveryProtocolState: 'steady_published',
    priorityRecoveryReasonCodes: [],
    recoveryActiveNodeIds: ['seed-node', 'node-2', 'node-3'],
    recoveryActiveNodeSource: 'locally_eligible_projection',
    ...overrides,
    projectionReadinessContract: {activeGate},
  });
}

test('run3/run7 repro: REPAIR_READY + voter-ready spread + only ' +
  'priority_recovery_active => serve-eligible (READY)',
async (t) => {
  const snapshot = buildSnapshot({
    state: 'repair_ready',
    reasonCodes: ['priority_recovery_active'],
  });
  t.equal(
    snapshot.ready,
    true,
    'a node with satisfied voter-ready spread whose serve lane is blocked ' +
    `only by an in-flight recovery op must be serve-eligible (state=${
      snapshot.state})`,
  );
  t.end();
});

test('safety: a serve_not_eligible disqualifier keeps the node ' +
  'RECOVERY_PENDING (must not over-relax)',
async (t) => {
  const snapshot = buildSnapshot({
    state: 'repair_ready',
    reasonCodes: ['priority_recovery_active', 'serve_not_eligible'],
  });
  t.equal(snapshot.ready, false, 'runtime-serve-ineligible must stay pending');
  t.end();
});

test('safety: a publication_stream_not_ready disqualifier keeps the node ' +
  'RECOVERY_PENDING',
async (t) => {
  const snapshot = buildSnapshot({
    state: 'repair_ready',
    reasonCodes: ['priority_recovery_active', 'publication_stream_not_ready'],
  });
  t.equal(snapshot.ready, false, 'publication-not-ready must stay pending');
  t.end();
});

test('safety: voter-ready (durable) spread NOT satisfied keeps the node ' +
  'RECOVERY_PENDING even when the optimistic summary says satisfied',
async (t) => {
  const snapshot = buildSnapshot(
    {state: 'repair_ready', reasonCodes: ['priority_recovery_active']},
    {
      priorityPartitionSummary: {satisfied: false},
      priorityRecoveryClosureWitness: {
        refreshedPriorityPartitionSummary: {satisfied: true},
      },
    },
  );
  t.equal(
    snapshot.ready,
    false,
    'optimistic-only spread (no voter-ready replacement) must stay pending',
  );
  t.end();
});

test('safety: a cluster_member_unhealthy reason (internal-lane blocker that ' +
  'can ride along in REPAIR_READY) keeps the node RECOVERY_PENDING',
async (t) => {
  const snapshot = buildSnapshot({
    state: 'repair_ready',
    reasonCodes: ['priority_recovery_active', 'cluster_member_unhealthy'],
  });
  t.equal(
    snapshot.ready,
    false,
    'a membership-unhealthy node must not be relaxed to serve-eligible',
  );
  t.end();
});

test('safety: the weaker INTERNAL_READY active gate is not relaxed',
  async (t) => {
    const snapshot = buildSnapshot({
      state: 'internal_ready',
      reasonCodes: ['priority_recovery_active'],
    });
    t.equal(snapshot.ready, false, 'internal_ready must stay pending');
    t.end();
  });

test('safety: a summarized snapshot (active-gate reasonCodes dropped) stays ' +
  'conservatively RECOVERY_PENDING',
async (t) => {
  const snapshot = buildSnapshot({state: 'repair_ready'});
  t.equal(
    snapshot.ready,
    false,
    'without positive reasonCodes evidence the node must stay pending',
  );
  t.end();
});
