import t from 'tap';
import {
  ControlPlaneReadinessPublicationPlanningSnapshot,
} from '../../src/control-plane/control-plane-readiness-publication-planning-snapshot.js';
import {
  MembershipPublicationCoordinatorReads,
} from '../../src/control-plane/membership-publication-coordinator-reads.js';

// Quest publication-recovery-snapshot-starvation-relief: the CL-033/CL-034
// belt-and-suspenders epoch probe compared a NODE-INCLUSION-scoped read
// (null when the winning membership publication row does not include the
// probed node) against a cached projection that stores the CLUSTER winner's
// epoch. For any excluded node — exactly the joining/recovering nodes during
// churn — `null !== epoch` read as permanently stale and silently disabled
// both memos (the same silently-always-stale family as the 54db83b9 NaN
// observedAt regression). The probe now reads the winner row scope-
// consistently (requireNodeInclusion: false from the memo guard);
// inclusion-list changes still invalidate via the planning source-revision
// bump, and a genuine epoch/status advance still forces a rebuild.

const resolveMemo =
  ControlPlaneReadinessPublicationPlanningSnapshot.prototype
    .resolveMemoizedPriorityRecoveryPlanningProjectionSync;
const probeSync =
  MembershipPublicationCoordinatorReads.prototype
    .getLatestMembershipPublicationEpochStatusForNodeSync;

const T0 = Date.parse('2026-08-04T06:00:00.000Z');
const iso = (offsetMs) => new Date(T0 + offsetMs).toISOString();

// One membership publication winner row: epoch 7, includes only node-a.
function publicationRow({epoch = 7, status = 'PUBLISHED'} = {}) {
  return {
    publication_id: 'pub-1',
    publication_kind: 'cluster_membership',
    publication_epoch: epoch,
    status,
    published_active_node_ids: JSON.stringify(['node-a']),
    required_ack_node_ids: JSON.stringify(['node-a']),
    acknowledged_node_ids: JSON.stringify(['node-a']),
  };
}

function coordinatorService(rows) {
  return {
    systemTableCache: {getAll: () => rows},
    getLatestMembershipPublicationEpochStatusForNodeSync(nodeId, options) {
      return probeSync.call(this, nodeId, options);
    },
  };
}

function memoCtx(rows, {nodeId = 'node-b'} = {}) {
  let clock = T0;
  const builds = [];
  const ctx = {
    nodeId,
    now: () => (clock += 1),
    membershipPublicationPlanningActiveStaleGraceMs: 15000,
    membershipPublicationPlanningSourceRevision: 0,
    priorityRecoveryPlanningProjectionMemoByNodeId: new Map(),
    membershipPublicationService: coordinatorService(rows),
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
    getMembershipPublicationPlanningSnapshotSync: (id) => ({read: id}),
    buildTrackedPriorityRecoveryPlanningProjection: (snapshot) => {
      builds.push(snapshot?.read ?? null);
      // The projection stores the CLUSTER winner's epoch/status, regardless
      // of whether the projected node is included in the publication row.
      const winner = rows[0];
      return Object.freeze({
        projectionFor: snapshot?.read ?? null,
        build: builds.length,
        publicationEpoch: winner ? winner.publication_epoch : null,
        publicationStatus: winner ? winner.status : null,
      });
    },
  };
  return {ctx, builds};
}

t.test('probe: requireNodeInclusion=false returns the winner epoch/status ' +
  'for an excluded node; default keeps inclusion semantics', async (t) => {
  const service = coordinatorService([publicationRow()]);
  t.same(
    service.getLatestMembershipPublicationEpochStatusForNodeSync(
      'node-b',
      {requireNodeInclusion: false},
    ),
    {publicationEpoch: 7, status: 'PUBLISHED'},
    'excluded node reads the cluster winner scope-consistently',
  );
  t.equal(
    service.getLatestMembershipPublicationEpochStatusForNodeSync('node-b'),
    null,
    'default (inclusion-scoped) semantics unchanged for other callers',
  );
  t.same(
    service.getLatestMembershipPublicationEpochStatusForNodeSync('node-a'),
    {publicationEpoch: 7, status: 'PUBLISHED'},
    'included node unchanged under default semantics',
  );
});

t.test('memo: an EXCLUDED node reuses its projection while the winner row ' +
  'is unchanged (the silently-always-stale regression)', async (t) => {
  const rows = [publicationRow()];
  const {ctx, builds} = memoCtx(rows, {nodeId: 'node-b'});
  const first = resolveMemo.call(ctx, 'node-b', iso(1));
  const second = resolveMemo.call(ctx, 'node-b', iso(2));
  const third = resolveMemo.call(ctx, 'node-b', iso(3));
  t.equal(
    builds.length,
    1,
    'projection built exactly once across 3 calls for the excluded node',
  );
  t.equal(second, first, 'second call reuses the memoized projection');
  t.equal(third, first, 'third call reuses the memoized projection');
});

t.test('memo: a genuine epoch advance still forces a rebuild for the ' +
  'excluded node (belt-and-suspenders retained)', async (t) => {
  const rows = [publicationRow()];
  const {ctx, builds} = memoCtx(rows, {nodeId: 'node-b'});
  const before = resolveMemo.call(ctx, 'node-b', iso(1));
  t.equal(builds.length, 1, 'built once');
  rows[0] = publicationRow({epoch: 8});
  const after = resolveMemo.call(ctx, 'node-b', iso(2));
  t.equal(builds.length, 2, 'epoch advance rebuilt the projection');
  t.not(after, before, 'fresh projection returned after the advance');
  const reused = resolveMemo.call(ctx, 'node-b', iso(3));
  t.equal(builds.length, 2, 'stable again after the rebuild');
  t.equal(reused, after, 'post-advance projection is reused');
});

t.test('memo: a status change still forces a rebuild for the excluded node',
  async (t) => {
    const rows = [publicationRow()];
    const {ctx, builds} = memoCtx(rows, {nodeId: 'node-b'});
    resolveMemo.call(ctx, 'node-b', iso(1));
    rows[0] = publicationRow({status: 'ACKNOWLEDGED'});
    resolveMemo.call(ctx, 'node-b', iso(2));
    t.equal(builds.length, 2, 'status change rebuilt the projection');
  });
