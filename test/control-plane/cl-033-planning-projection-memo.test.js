import t from 'tap';
import {
  ControlPlaneReadinessServiceSegment4Stage2,
} from '../../src/control-plane/control-plane-readiness-service-segment-4-stage-2.js';

// CL-033: getNodeReadinessSync is the query-routing hot path; during recovery the
// stored-snapshot fast path misses every call, so the priority-recovery planning
// projection (deep cluster read + parse/clone storm) was rebuilt per routing call
// → seed event-loop freeze. The fix memoizes the projection per publisher node,
// validated by the EXISTING isReadinessSnapshotInvalidated predicate. These tests
// exercise the memo directly via the prototype method with a mock `this`.
const resolveMemo =
  ControlPlaneReadinessServiceSegment4Stage2.prototype
    .resolveMemoizedPriorityRecoveryPlanningProjectionSync;

// Build a mock readiness service `this`. `invalidated` is a mutable predicate the
// test drives to simulate cache-change invalidation. `builds` records every heavy
// projection build (per nodeId) so we can prove the memo collapses the storm.
function memoCtx({nodeId = 'seed', invalidated = () => false} = {}) {
  let clock = 1000;
  const builds = [];
  const ctx = {
    nodeId,
    now: () => (clock += 1),
    priorityRecoveryPlanningProjectionMemoByNodeId: new Map(),
    isReadinessSnapshotInvalidated: (key, capturedAtMs) =>
      invalidated(key, capturedAtMs),
    // The deep cluster read — counted, returns a per-node sentinel payload.
    getMembershipPublicationPlanningSnapshotSync: (id) => ({read: id}),
    // The parse/clone-heavy projection — counted; returns a fresh frozen object
    // per build so identity distinguishes a memo hit from a rebuild.
    buildPriorityRecoveryPlanningProjection: (snapshot) => {
      builds.push(snapshot?.read ?? null);
      return Object.freeze({projectionFor: snapshot?.read ?? null, build: builds.length});
    },
  };
  return {ctx, builds};
}

t.test('memo: a stable cache-epoch builds the projection once and reuses it', async (t) => {
  const {ctx, builds} = memoCtx();
  const first = resolveMemo.call(ctx, 'seed', 'iso-1');
  const second = resolveMemo.call(ctx, 'seed', 'iso-2');
  const third = resolveMemo.call(ctx, 'seed', 'iso-3');
  t.equal(builds.length, 1, 'projection built exactly once across 3 routing calls');
  t.equal(second, first, 'second call returns the SAME memoized object');
  t.equal(third, first, 'third call returns the SAME memoized object');
});

t.test('memo: an invalidation (cache change) forces exactly one rebuild', async (t) => {
  let invalid = false;
  const {ctx, builds} = memoCtx({invalidated: () => invalid});
  const before = resolveMemo.call(ctx, 'seed', 'iso-1');
  t.equal(builds.length, 1, 'built once');
  invalid = true; // a publication/node cache change supersedes the memo
  const after = resolveMemo.call(ctx, 'seed', 'iso-2');
  t.equal(builds.length, 2, 'rebuilt once after invalidation');
  t.not(after, before, 'returns the fresh projection, not the stale one');
  invalid = false; // re-stabilized; the fresh entry is now reused
  const reused = resolveMemo.call(ctx, 'seed', 'iso-3');
  t.equal(builds.length, 2, 'no rebuild while stable again');
  t.equal(reused, after, 'reuses the post-invalidation entry');
});

t.test('memo: distinct publisher nodes are keyed separately (no cross-node reuse)', async (t) => {
  const {ctx, builds} = memoCtx();
  const seed = resolveMemo.call(ctx, 'seed', 'iso-1');
  const peer = resolveMemo.call(ctx, 'peer', 'iso-2');
  t.equal(builds.length, 2, 'a different publisher node builds its own projection');
  t.equal(seed.projectionFor, 'seed', 'seed projection carries seed read');
  t.equal(peer.projectionFor, 'peer', 'peer projection carries peer read');
  // each remains independently reusable
  resolveMemo.call(ctx, 'seed', 'iso-3');
  resolveMemo.call(ctx, 'peer', 'iso-4');
  t.equal(builds.length, 2, 'both nodes reuse their own memoized projection');
});

t.test('memo: falls back to this.nodeId when nodeId is empty (matches publisher resolution)', async (t) => {
  const {ctx, builds} = memoCtx({nodeId: 'seed'});
  const viaNull = resolveMemo.call(ctx, null, 'iso-1');
  const viaSeed = resolveMemo.call(ctx, 'seed', 'iso-2');
  t.equal(builds.length, 1, 'null nodeId and explicit seed share the this.nodeId memo key');
  t.equal(viaSeed, viaNull, 'same memoized object');
});
