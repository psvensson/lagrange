import t from 'tap';
import {
  ControlPlaneReadinessPublicationPlanningSnapshot,
} from '../../src/control-plane/control-plane-readiness-publication-planning-snapshot.js';

// CL-033: getNodeReadinessSync is the query-routing hot path; during recovery the
// stored-snapshot fast path misses every call, so the priority-recovery planning
// projection (deep cluster read + parse/clone storm) was rebuilt per routing call
// → seed event-loop freeze. The fix memoizes the projection per publisher node,
// validated by the cluster-wide planning-source revision. These tests exercise
// the memo directly via the prototype method with a mock `this`.
//
// observedAt on the real hot path is an ISO STRING (getNodeReadinessSync:
// normalizeIsoTimestamp(now)). These tests use REAL ISO timestamps so the
// wall-time grace gate is exercised as in production — the 54db83b9 regression
// (`Number(observedAt)` → NaN → `NaN <= grace` → memo never hits) makes the
// build-once / reuse assertions fail.
const resolveMemo =
  ControlPlaneReadinessPublicationPlanningSnapshot.prototype
    .resolveMemoizedPriorityRecoveryPlanningProjectionSync;

const T0 = Date.parse('2026-06-14T06:00:00.000Z');
const iso = (offsetMs) => new Date(T0 + offsetMs).toISOString();

// Build a mock readiness service `this`. `builds` records every heavy projection
// build (per nodeId) so we can prove the memo collapses the storm.
function memoCtx({nodeId = 'seed'} = {}) {
  let clock = T0;
  const builds = [];
  const ctx = {
    nodeId,
    now: () => (clock += 1),
    membershipPublicationPlanningActiveStaleGraceMs: 15000,
    membershipPublicationPlanningSourceRevision: 0,
    priorityRecoveryPlanningProjectionMemoByNodeId: new Map(),
    // CL-033/CL-034 regression repair: the real wall-time grace gate. With an ISO
    // observedAt this must parse to ms (not collapse to a NaN comparison that
    // silently disables the memo — the 54db83b9 regression these tests catch).
    readPlanningProjectionSourceGeneration:
      ControlPlaneReadinessPublicationPlanningSnapshot.prototype
        .readPlanningProjectionSourceGeneration,
    isReadinessPlanningMemoWithinStaleGrace:
      ControlPlaneReadinessPublicationPlanningSnapshot.prototype
        .isReadinessPlanningMemoWithinStaleGrace,
    readLatestMembershipPublicationEpochStatusProbe:
      ControlPlaneReadinessPublicationPlanningSnapshot.prototype
        .readLatestMembershipPublicationEpochStatusProbe,
    buildMembershipPublicationPlanningMemoKeyComponent:
      ControlPlaneReadinessPublicationPlanningSnapshot.prototype
        .buildMembershipPublicationPlanningMemoKeyComponent,
    readMembershipPublicationPlanningMemoVersionKey:
      ControlPlaneReadinessPublicationPlanningSnapshot.prototype
        .readMembershipPublicationPlanningMemoVersionKey,
    membershipPublicationPlanningMemoVersionKeyMatches:
      ControlPlaneReadinessPublicationPlanningSnapshot.prototype
        .membershipPublicationPlanningMemoVersionKeyMatches,
    // The deep cluster read — counted, returns a per-node sentinel payload.
    getMembershipPublicationPlanningSnapshotSync: (id) => ({read: id}),
    // The parse/clone-heavy projection — counted; returns a fresh frozen object
    // per build so identity distinguishes a memo hit from a rebuild.
    buildTrackedPriorityRecoveryPlanningProjection: (snapshot) => {
      builds.push(snapshot?.read ?? null);
      return Object.freeze({projectionFor: snapshot?.read ?? null, build: builds.length});
    },
  };
  return {ctx, builds};
}

t.test('memo: a stable cache-epoch builds the projection once and reuses it', async (t) => {
  const {ctx, builds} = memoCtx();
  const first = resolveMemo.call(ctx, 'seed', iso(1));
  const second = resolveMemo.call(ctx, 'seed', iso(2));
  const third = resolveMemo.call(ctx, 'seed', iso(3));
  t.equal(builds.length, 1, 'projection built exactly once across 3 routing calls');
  t.equal(second, first, 'second call returns the SAME memoized object');
  t.equal(third, first, 'third call returns the SAME memoized object');
});

t.test('memo: an invalidation (cache change) forces exactly one rebuild', async (t) => {
  const {ctx, builds} = memoCtx();
  const before = resolveMemo.call(ctx, 'seed', iso(1));
  t.equal(builds.length, 1, 'built once');
  // Any planning-source cache change advances the cluster-wide revision.
  ctx.membershipPublicationPlanningSourceRevision += 1;
  const after = resolveMemo.call(ctx, 'seed', iso(2));
  t.equal(builds.length, 2, 'rebuilt once after invalidation');
  t.not(after, before, 'returns the fresh projection, not the stale one');
  const reused = resolveMemo.call(ctx, 'seed', iso(3));
  t.equal(builds.length, 2, 'no rebuild while stable again');
  t.equal(reused, after, 'reuses the post-invalidation entry');
});

t.test('memo: distinct publisher nodes are keyed separately (no cross-node reuse)', async (t) => {
  const {ctx, builds} = memoCtx();
  const seed = resolveMemo.call(ctx, 'seed', iso(1));
  const peer = resolveMemo.call(ctx, 'peer', iso(2));
  t.equal(builds.length, 2, 'a different publisher node builds its own projection');
  t.equal(seed.projectionFor, 'seed', 'seed projection carries seed read');
  t.equal(peer.projectionFor, 'peer', 'peer projection carries peer read');
  // each remains independently reusable
  resolveMemo.call(ctx, 'seed', iso(3));
  resolveMemo.call(ctx, 'peer', iso(4));
  t.equal(builds.length, 2, 'both nodes reuse their own memoized projection');
});

t.test('memo: falls back to this.nodeId when nodeId is empty (matches publisher resolution)', async (t) => {
  const {ctx, builds} = memoCtx({nodeId: 'seed'});
  const viaNull = resolveMemo.call(ctx, null, iso(1));
  const viaSeed = resolveMemo.call(ctx, 'seed', iso(2));
  t.equal(builds.length, 1, 'null nodeId and explicit seed share the this.nodeId memo key');
  t.equal(viaSeed, viaNull, 'same memoized object');
});

t.test('memo: a stale observedAt beyond the wall-time grace forces a rebuild', async (t) => {
  // Regression guard for 54db83b9: the grace bound must be a real ms comparison.
  // First call caches at ~T0; a later call 20s out (> 15s grace) must rebuild
  // even though the invalidation marker never fired.
  const {ctx, builds} = memoCtx();
  resolveMemo.call(ctx, 'seed', iso(1));
  t.equal(builds.length, 1, 'built once');
  resolveMemo.call(ctx, 'seed', iso(20000)); // 20s later, grace is 15s
  t.equal(builds.length, 2, 'rebuilt once the cached entry aged past the grace');
});
