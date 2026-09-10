import t from 'tap';
import {
  ControlPlaneReadinessPublicationPlanningResolution,
} from '../../src/control-plane/control-plane-readiness-publication-planning-resolution.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';

// CL-034: the residual readiness-build cost CL-033's projection memo did not cover.
// getNodeReadinessSync -> resolveNodeMembershipPublicationPlanningAnswerSync calls
// resolveMembershipPublicationPlanningSnapshot (the merge: a SECOND deep cluster
// read via buildMembershipPublicationPlanningSnapshot + the full pending-ack merge +
// a second buildPriorityRecoveryPlanningProjection) on EVERY routing call. During
// recovery the stored-snapshot fast path misses every call, so this merge rebuilt
// per routing call -> the ~14s residual seed event-loop gap that still exceeds the
// raft election timeout and loses control_plane_publications-p1 leadership (CL-001
// variant B). The fix memoizes the (already Object.frozen) merge output per
// publisher node under the SAME planning-source revision discipline as CL-033.
// These tests exercise the memo directly via the prototype method with a mock
// `this`.
const resolveMemo =
  ControlPlaneReadinessPublicationPlanningResolution.prototype
    .resolveMemoizedMembershipPublicationPlanningSnapshotSync;

const T0 = Date.parse('2026-06-14T06:00:00.000Z');
const iso = (offsetMs) => new Date(T0 + offsetMs).toISOString();

// `_bumpEpoch` simulates a publication-row epoch change for the freshness
// recheck. `builds` records every heavy merge so we can prove the memo collapses
// the per-routing-call storm.
function memoCtx({
  nodeId = 'seed',
  epoch = 20,
  status = 'PUBLISHED',
} = {}) {
  let clock = T0;
  let pub = {publicationEpoch: epoch, status};
  const builds = [];
  const ctx = {
    nodeId,
    now: () => (clock += 1),
    membershipPublicationPlanningActiveStaleGraceMs: 15000,
    membershipPublicationPlanningSourceRevision: 0,
    membershipPublicationPlanningSnapshotMemoByNodeId: new Map(),
    readPlanningProjectionSourceGeneration:
      ControlPlaneReadinessPublicationPlanningResolution.prototype
        .readPlanningProjectionSourceGeneration,
    isReadinessPlanningMemoWithinStaleGrace:
      ControlPlaneReadinessPublicationPlanningResolution.prototype
        .isReadinessPlanningMemoWithinStaleGrace,
    readLatestMembershipPublicationEpochStatusProbe:
      ControlPlaneReadinessPublicationPlanningResolution.prototype
        .readLatestMembershipPublicationEpochStatusProbe,
    buildMembershipPublicationPlanningMemoKeyComponent:
      ControlPlaneReadinessPublicationPlanningResolution.prototype
        .buildMembershipPublicationPlanningMemoKeyComponent,
    readMembershipPublicationPlanningMemoVersionKey:
      ControlPlaneReadinessPublicationPlanningResolution.prototype
        .readMembershipPublicationPlanningMemoVersionKey,
    membershipPublicationPlanningMemoVersionKeyMatches:
      ControlPlaneReadinessPublicationPlanningResolution.prototype
        .membershipPublicationPlanningMemoVersionKeyMatches,
    membershipPublicationService: {
      getLatestMembershipPublicationEpochStatusForNodeSync: () => pub,
    },
    // The heavy stage-3 merge — counted; returns a fresh frozen projection per
    // build carrying the current epoch/status so the freshness recheck passes
    // while the publication row is unchanged.
    resolveMembershipPublicationPlanningSnapshot: (context) => {
      builds.push(context?.nodeId ?? null);
      return Object.freeze({
        mergeFor: context?.nodeId ?? null,
        build: builds.length,
        publicationEpoch: pub.publicationEpoch,
        publicationStatus: pub.status,
      });
    },
    _bumpEpoch: () => {
      pub = {publicationEpoch: pub.publicationEpoch + 1, status: pub.status};
    },
  };
  return {ctx, builds};
}

t.test('merge memo: a stable cache-epoch builds the merge once and reuses it', async (t) => {
  const {ctx, builds} = memoCtx();
  const first = resolveMemo.call(ctx, 'seed', iso(1), {}, null);
  const second = resolveMemo.call(ctx, 'seed', iso(2), {}, null);
  const third = resolveMemo.call(ctx, 'seed', iso(3), {}, null);
  t.equal(builds.length, 1, 'merge built exactly once across 3 routing calls');
  t.equal(second, first, 'second call returns the SAME memoized merge');
  t.equal(third, first, 'third call returns the SAME memoized merge');
});

t.test('merge memo: an invalidation (cache change) forces exactly one rebuild', async (t) => {
  const {ctx, builds} = memoCtx();
  const before = resolveMemo.call(ctx, 'seed', iso(1), {}, null);
  t.equal(builds.length, 1, 'built once');
  // Any planning-source cache change advances the cluster-wide revision.
  ctx.membershipPublicationPlanningSourceRevision += 1;
  const after = resolveMemo.call(ctx, 'seed', iso(2), {}, null);
  t.equal(builds.length, 2, 'rebuilt once after invalidation');
  t.not(after, before, 'returns the fresh merge, not the stale one');
  const reused = resolveMemo.call(ctx, 'seed', iso(3), {}, null);
  t.equal(builds.length, 2, 'no rebuild while stable again');
  t.equal(reused, after, 'reuses the post-invalidation entry');
});

t.test('merge memo: distinct publisher nodes are keyed separately (no cross-node reuse)', async (t) => {
  const {ctx, builds} = memoCtx();
  const seed = resolveMemo.call(ctx, 'seed', iso(1), {}, null);
  const peer = resolveMemo.call(ctx, 'peer', iso(2), {}, null);
  t.equal(builds.length, 2, 'a different publisher node builds its own merge');
  t.equal(seed.mergeFor, 'seed', 'seed merge carries seed read');
  t.equal(peer.mergeFor, 'peer', 'peer merge carries peer read');
  resolveMemo.call(ctx, 'seed', iso(3), {}, null);
  resolveMemo.call(ctx, 'peer', iso(4), {}, null);
  t.equal(builds.length, 2, 'both nodes reuse their own memoized merge');
});

t.test('merge memo: falls back to this.nodeId when nodeId is empty', async (t) => {
  const {ctx, builds} = memoCtx({nodeId: 'seed'});
  const viaNull = resolveMemo.call(ctx, null, iso(1), {}, null);
  const viaSeed = resolveMemo.call(ctx, 'seed', iso(2), {}, null);
  t.equal(builds.length, 1, 'null nodeId and explicit seed share the this.nodeId memo key');
  t.equal(viaSeed, viaNull, 'same memoized merge');
});

t.test('merge memo: a publication epoch bump forces a rebuild (freshness recheck)', async (t) => {
  // The cluster invalidation marker is the primary guard, but the epoch/status
  // recheck against the live publication row is the belt-and-suspenders that
  // catches an epoch advance even if the marker mock does not fire here.
  const {ctx, builds} = memoCtx();
  const before = resolveMemo.call(ctx, 'seed', iso(1), {}, null);
  t.equal(builds.length, 1, 'built once');
  ctx._bumpEpoch(); // publication row advanced to a new epoch
  const after = resolveMemo.call(ctx, 'seed', iso(2), {}, null);
  t.equal(builds.length, 2, 'rebuilt because the cached merge is for a stale epoch');
  t.not(after, before, 'returns the fresh-epoch merge');
});

t.test('merge memo: a stale observedAt beyond the wall-time grace forces a rebuild', async (t) => {
  // Regression guard for 54db83b9: the grace bound must be a real ms comparison
  // (observedAt is an ISO string on the hot path), not `Number(observedAt)` -> NaN.
  const {ctx, builds} = memoCtx();
  resolveMemo.call(ctx, 'seed', iso(1), {}, null);
  t.equal(builds.length, 1, 'built once');
  resolveMemo.call(ctx, 'seed', iso(20000), {}, null); // 20s later, grace is 15s
  t.equal(builds.length, 2, 'rebuilt once the cached entry aged past the grace');
});

t.test('async owner answer is not merged again inside the same readiness build',
  async (t) => {
    const cache = {
      addListener() {},
      filter() {
        return [];
      },
      get() {
        return null;
      },
      getAll() {
        return [];
      },
      getTableMutationVersion() {
        return 0;
      },
    };
    const readiness = new ControlPlaneReadinessService({
      nodeId: 'seed',
      now: () => T0,
      systemTableCache: cache,
      membershipPublicationService: {
        async deriveClusterMembershipCandidate(options = {}) {
          return {
            publicationEpoch: 20,
            status: 'PUBLISHED',
            publishedActiveNodeIds: [options.publisherNodeId],
          };
        },
        getLatestMembershipPublicationEpochStatusForNodeSync() {
          return {publicationEpoch: 20, status: 'PUBLISHED'};
        },
      },
    });
    const originalResolve =
      readiness.resolveMembershipPublicationPlanningSnapshot.bind(readiness);
    let mergeBuildCount = 0;
    readiness.resolveMembershipPublicationPlanningSnapshot = (context) => {
      mergeBuildCount++;
      return originalResolve(context);
    };
    const membershipPublication = null;
    const answer = await readiness.resolveNodeMembershipPublicationPlanningAnswer(
      'seed',
      iso(1),
      membershipPublication,
    );
    t.equal(mergeBuildCount, 1,
      'the async owner should build one merged planning answer');

    const consumed =
      readiness.resolveMemoizedMembershipPublicationPlanningSnapshotForContextSync({
        nodeId: 'seed',
        observedAt: iso(1),
        membershipPublication,
        membershipPublicationPlanningSnapshot: answer,
      });
    t.equal(mergeBuildCount, 1,
      'runtime-authority consumption should not rebuild the completed answer');
    t.equal(consumed, answer,
      'the same owner-built frozen planning answer should cross the seam');
  });
