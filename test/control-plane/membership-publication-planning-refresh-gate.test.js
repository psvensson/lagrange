import t from 'tap';
import {
  ControlPlaneReadinessPublicationPlanningSnapshot,
} from '../../src/control-plane/control-plane-readiness-publication-planning-snapshot.js';

// Saturation-relief gate: getMembershipPublicationPlanningSnapshotBestEffort must
// SKIP its authoritative full-table refresh (5x SELECT* + PR planning rebuild)
// while the cache is provably fresh — not invalidated since the last authoritative
// refresh AND within the stale-grace floor — and return the CDC-current sync answer
// instead, so the per-tick refresh stops pegging a saturated owner loop during a
// no-progress drain stall. It MUST still refresh when the readiness invalidation
// marker bumps (a services/publication write, incl. the drain-completion services
// removal) or when the grace floor lapses, so a stale projection is never served.
const proto = ControlPlaneReadinessPublicationPlanningSnapshot.prototype;
const T0 = Date.parse('2026-06-14T06:00:00.000Z');
const iso = (offsetMs) => new Date(T0 + offsetMs).toISOString();

function gateCtx({
  invalidatedSince = () => false,
  timeoutMs = 0,
  asyncHangs = false,
} = {}) {
  const reads = []; // every AUTHORITATIVE refresh (the heavy 5x SELECT* path)
  const ctx = {
    nodeId: 'seed',
    now: () => T0, // authoritative refreshes stamp the marker at T0
    membershipPublicationPlanningActiveStaleGraceMs: 15000,
    membershipPublicationPlanningSnapshotRefreshTimeoutMs: timeoutMs,
    lastAuthoritativePlanningRefreshAtMsByNodeId: new Map(),
    // Real methods under test:
    canReuseSyncMembershipPublicationPlanningSnapshot:
      proto.canReuseSyncMembershipPublicationPlanningSnapshot,
    recordAuthoritativeMembershipPublicationPlanningRefresh:
      proto.recordAuthoritativeMembershipPublicationPlanningRefresh,
    getMembershipPublicationPlanningSnapshotBestEffort:
      proto.getMembershipPublicationPlanningSnapshotBestEffort,
    isReadinessPlanningMemoWithinStaleGrace:
      proto.isReadinessPlanningMemoWithinStaleGrace,
    // Controllable collaborators:
    isReadinessSnapshotInvalidated: (key, sinceMs) =>
      invalidatedSince(key, sinceMs),
    getMembershipPublicationPlanningAnswerSync: (nodeId) => ({
      kind: 'sync',
      nodeId,
    }),
    getMembershipPublicationPlanningSnapshot: async (nodeId) => {
      reads.push(nodeId);
      if (asyncHangs) {
        return new Promise(() => {}); // never resolves => the race must time out
      }
      return {kind: 'authoritative', nodeId, read: reads.length};
    },
    resolvePriorityRecoveryPlanningAnswer: (_nodeId, _observedAt, snapshot) =>
      snapshot,
    // Race-branch timer seam: fire immediately so the timeout rejection wins.
    setTimeoutFn: (fn) => {
      fn();
      return {unref() {}};
    },
    clearTimeoutFn: () => {},
  };
  return {ctx, reads};
}

const drive = (ctx, observedAt) =>
  ctx.getMembershipPublicationPlanningSnapshotBestEffort('seed', observedAt);

t.test('a stable fresh cache refreshes authoritatively ONCE across many ticks', async (t) => {
  const {ctx, reads} = gateCtx();
  await drive(ctx, iso(1));
  await drive(ctx, iso(2));
  await drive(ctx, iso(3));
  t.equal(reads.length, 1, 'only the first tick does the authoritative refresh; the rest reuse the sync answer');
});

t.test('the first tick always refreshes (no false-skip on a cold marker)', async (t) => {
  const {ctx, reads} = gateCtx();
  const answer = await drive(ctx, iso(1));
  t.equal(reads.length, 1, 'cold node with no prior authoritative refresh must refresh');
  t.equal(answer.kind, 'authoritative', 'returns the authoritative answer on the refreshing tick');
});

t.test('an invalidation (services/publication write) forces a refresh — drain completion is never masked', async (t) => {
  let invalid = false;
  const {ctx, reads} = gateCtx({invalidatedSince: () => invalid});
  await drive(ctx, iso(1));
  t.equal(reads.length, 1, 'refreshed once');
  await drive(ctx, iso(2));
  t.equal(reads.length, 1, 'skipped while stable');
  invalid = true; // the source replica's services row is removed (drain completes)
  const answer = await drive(ctx, iso(3));
  t.equal(reads.length, 2, 'a cache invalidation forces a fresh authoritative refresh');
  t.equal(answer.kind, 'authoritative', 'returns the fresh authoritative answer, not a stale sync one');
  invalid = false;
  await drive(ctx, iso(4));
  t.equal(reads.length, 2, 'stable again after the refresh => no further redundant refresh');
});

t.test('the stale-grace floor forces a periodic authoritative refresh (CDC-lag bound)', async (t) => {
  const {ctx, reads} = gateCtx(); // grace = 15000ms
  await drive(ctx, iso(1));
  t.equal(reads.length, 1, 'refreshed once');
  await drive(ctx, iso(10000)); // within grace
  t.equal(reads.length, 1, 'still within grace => reuse');
  await drive(ctx, iso(20000)); // 20s > 15s grace
  t.equal(reads.length, 2, 'grace lapse forces a floor refresh even with no invalidation');
});

t.test('the marker is stamped at refresh START, so a mid-refresh invalidation re-opens the gate', async (t) => {
  // A services write that lands DURING the in-flight authoritative read (after the
  // read started, before it finished) must not be masked. Model: refresh starts at
  // t=100; the read takes until t=200; an invalidation lands at t=150 (mid-refresh).
  // Stamping the START (100) means the next gate check sees invalidatedAt(150) >=
  // 100 => re-opens. Stamping the FINISH (200) would mask it (150 < 200).
  let clock = 100;
  let invalidatedAtMs = 0;
  const reads = [];
  const ctx = {
    nodeId: 'seed',
    now: () => clock,
    membershipPublicationPlanningActiveStaleGraceMs: 15000,
    membershipPublicationPlanningSnapshotRefreshTimeoutMs: 0,
    lastAuthoritativePlanningRefreshAtMsByNodeId: new Map(),
    canReuseSyncMembershipPublicationPlanningSnapshot:
      proto.canReuseSyncMembershipPublicationPlanningSnapshot,
    recordAuthoritativeMembershipPublicationPlanningRefresh:
      proto.recordAuthoritativeMembershipPublicationPlanningRefresh,
    getMembershipPublicationPlanningSnapshotBestEffort:
      proto.getMembershipPublicationPlanningSnapshotBestEffort,
    isReadinessPlanningMemoWithinStaleGrace:
      proto.isReadinessPlanningMemoWithinStaleGrace,
    isReadinessSnapshotInvalidated: (_key, sinceMs) => invalidatedAtMs >= sinceMs,
    getMembershipPublicationPlanningAnswerSync: () => ({kind: 'sync'}),
    getMembershipPublicationPlanningSnapshot: async () => {
      reads.push(1);
      clock = 200; // time passes during the authoritative read
      invalidatedAtMs = 150; // a services write landed mid-refresh
      return {kind: 'authoritative'};
    },
    resolvePriorityRecoveryPlanningAnswer: (_a, _b, snapshot) => snapshot,
  };
  await ctx.getMembershipPublicationPlanningSnapshotBestEffort('seed', clock);
  t.equal(reads.length, 1, 'first tick refreshes');
  await ctx.getMembershipPublicationPlanningSnapshotBestEffort('seed', clock);
  t.equal(reads.length, 2, 'a mid-refresh invalidation re-opens the gate (stamp at START), not masked until grace');
});

t.test('a timed-out refresh does NOT stamp the marker (no false-skip after a failed refresh)', async (t) => {
  const {ctx, reads} = gateCtx({timeoutMs: 50, asyncHangs: true});
  const answer = await drive(ctx, iso(1));
  t.equal(answer.kind, 'sync', 'a timeout falls back to the sync answer');
  t.equal(reads.length, 1, 'the authoritative read was attempted');
  // Next tick: because the refresh timed out (never stamped), the gate must NOT
  // skip — it must attempt the authoritative refresh again.
  await drive(ctx, iso(2));
  t.equal(reads.length, 2, 'a failed/timed-out refresh leaves the gate open so the next tick retries');
});
