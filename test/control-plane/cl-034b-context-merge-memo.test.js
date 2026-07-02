import t from 'tap';
import {
  ControlPlaneReadinessPublicationPlanningResolution,
} from '../../src/control-plane/control-plane-readiness-publication-planning-resolution.js';

// CL-034 follow-up: the readiness-build sub-builders re-run the SAME merge ~6 times
// per getNodeReadinessSync, all threading the SAME already-resolved planning snapshot
// through context. This within-build memo is keyed by that providedPlanningSnapshot
// OBJECT REFERENCE: same object => collapse to one merge; a different object (different
// epoch/status, a later build, or a direct call) => a different key, so it can never
// return a result computed for a different logical input. These tests exercise the
// wrapper directly via the prototype method with a mock `this`.
const resolveMemo =
  ControlPlaneReadinessPublicationPlanningResolution.prototype
    .resolveMemoizedMembershipPublicationPlanningSnapshotForContextSync;

function memoCtx() {
  const builds = [];
  const ctx = {
    membershipPublicationPlanningSnapshotContextMemo: new WeakMap(),
    // The heavy merge — counted; returns a fresh frozen result per build so identity
    // distinguishes a memo hit from a rebuild.
    resolveMembershipPublicationPlanningSnapshot: (context) => {
      builds.push(context?.membershipPublicationPlanningSnapshot ?? null);
      return Object.freeze({
        mergeOf: context?.membershipPublicationPlanningSnapshot ?? null,
        build: builds.length,
      });
    },
  };
  return {ctx, builds};
}

t.test('context memo: the same provided snapshot object collapses ~6 sub-builder calls into one merge', async (t) => {
  const {ctx, builds} = memoCtx();
  const provided = {publicationEpoch: 24, publicationStatus: 'PUBLISHED'};
  const a = resolveMemo.call(ctx, {nodeId: 'seed', membershipPublicationPlanningSnapshot: provided});
  const b = resolveMemo.call(ctx, {nodeId: 'seed', membershipPublicationPlanningSnapshot: provided});
  const c = resolveMemo.call(ctx, {nodeId: 'seed', membershipPublicationPlanningSnapshot: provided});
  t.equal(builds.length, 1, 'merge built exactly once for one shared snapshot object');
  t.equal(b, a, 'second call returns the SAME memoized merge');
  t.equal(c, a, 'third call returns the SAME memoized merge');
});

t.test('context memo: a DIFFERENT provided snapshot object is a different key (no collision)', async (t) => {
  // This is the contract the part-4 "shadow blocker" test enforces: two distinct
  // snapshots (different epoch/status) must NOT share a cached merge.
  const {ctx, builds} = memoCtx();
  const settled = {publicationEpoch: 24, publicationStatus: 'PUBLISHED'};
  const pending = {publicationEpoch: 25, publicationStatus: 'ACK_PENDING'};
  const first = resolveMemo.call(ctx, {membershipPublicationPlanningSnapshot: settled});
  const second = resolveMemo.call(ctx, {membershipPublicationPlanningSnapshot: pending});
  t.equal(builds.length, 2, 'each distinct snapshot object builds its own merge');
  t.not(second, first, 'distinct snapshots return distinct merges');
  t.equal(first.mergeOf, settled, 'first merge is for the settled snapshot');
  t.equal(second.mergeOf, pending, 'second merge is for the pending snapshot');
});

t.test('context memo: a retained snapshot object re-presented after the publication advances rebuilds', async (t) => {
  // resolvePriorityRecoveryPlanningAnswer can RETAIN the same snapshot object across
  // builds; the WeakMap key would then survive into a later build whose live publication
  // has advanced. The membershipPublication-reference guard must force a rebuild so the
  // memo never serves a merge computed against a stale publication.
  const {ctx, builds} = memoCtx();
  const provided = {publicationEpoch: 24}; // the retained object, reused across builds
  const pubM = {publicationEpoch: 24, status: 'PUBLISHED'};
  const pubN = {publicationEpoch: 25, status: 'ACK_PENDING'}; // advanced => new object
  const a = resolveMemo.call(ctx, {
    membershipPublication: pubM,
    membershipPublicationPlanningSnapshot: provided,
  });
  const b = resolveMemo.call(ctx, {
    membershipPublication: pubM,
    membershipPublicationPlanningSnapshot: provided,
  });
  t.equal(builds.length, 1, 'same provided + same publication object reuses within a build');
  t.equal(b, a, 'reused merge');
  const c = resolveMemo.call(ctx, {
    membershipPublication: pubN,
    membershipPublicationPlanningSnapshot: provided,
  });
  t.equal(builds.length, 2, 'rebuilt because the live publication advanced to a new object');
  t.not(c, a, 'fresh merge for the advanced publication, not the stale retained one');
});

t.test('context memo: a null/non-object provided snapshot falls through to a direct merge', async (t) => {
  const {ctx, builds} = memoCtx();
  resolveMemo.call(ctx, {nodeId: 'seed', membershipPublicationPlanningSnapshot: null});
  resolveMemo.call(ctx, {nodeId: 'seed'}); // undefined provided
  t.equal(builds.length, 2, 'no memo when there is no snapshot object to key on (each computes)');
});
