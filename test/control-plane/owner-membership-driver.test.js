import t from 'tap';
import {
  MembershipPublicationCoordinatorClassStage2,
} from '../../src/control-plane/membership-publication-coordinator-class-stage-2.js';

// Workstream A: the always-on owner-membership driver. Test gating + lifecycle
// directly via the prototype methods with a mock `this`.
const drive =
  MembershipPublicationCoordinatorClassStage2.prototype.driveOwnerMembershipReconcile;
const start =
  MembershipPublicationCoordinatorClassStage2.prototype.startOwnerMembershipDriver;
const stop =
  MembershipPublicationCoordinatorClassStage2.prototype.stopOwnerMembershipDriver;

function leaderCache(leaderNodeId) {
  return {
    get: (table, key) =>
      table === 'partitions' && key === 'control_plane_publications-p1' ?
        {leader_node_id: leaderNodeId} :
        null,
    find: () => null,
  };
}

// The driver emits console-only convergence decision traces and readiness trace
// fields on every path; stub them on the mock `this`.
const traceStubs = () => ({
  _emitConvergenceDecisionTrace: () => {},
  _buildPublicationReadinessTraceFields: () => ({}),
});

t.test('drive: no-op when this node is NOT the publications leader', async (t) => {
  let planningCalls = 0;
  const ctx = {
    nodeId: 'seed',
    systemTableCache: leaderCache('other'), // leader is someone else
    readPublicationPlanningSnapshot: async () => {planningCalls += 1; return null;},
    reconcileActiveGateMembershipPublication: async () => {},
    logger: {},
    ...traceStubs(),
  };
  t.equal(await drive.call(ctx), false, 'returns false');
  t.equal(planningCalls, 0, 'gated before reading planning snapshot');
});

t.test('drive: no-op while a prior drive is in flight', async (t) => {
  let planningCalls = 0;
  const ctx = {
    nodeId: 'seed',
    ownerMembershipReconcileInFlight: true,
    systemTableCache: leaderCache('seed'),
    readPublicationPlanningSnapshot: async () => {planningCalls += 1; return null;},
    logger: {},
    ...traceStubs(),
  };
  t.equal(await drive.call(ctx), false);
  t.equal(planningCalls, 0, 'in-flight guard short-circuits');
});

t.test('drive: leader passes the gate and reads the planning snapshot', async (t) => {
  let planningCalls = 0;
  const ctx = {
    nodeId: 'seed',
    systemTableCache: leaderCache('seed'),
    readPublicationPlanningSnapshot: async () => {planningCalls += 1; return null;},
    reconcileActiveGateMembershipPublication: async () => {},
    assertSingleMembershipPartition: () => {},
    logger: {},
    ...traceStubs(),
  };
  t.equal(await drive.call(ctx), false, 'null snapshot -> false');
  t.equal(planningCalls, 1, 'leader proceeds past the gate');
  t.equal(ctx.ownerMembershipReconcileInFlight, false, 'in-flight reset in finally');
});

// CL-001 variant A guard: an OPEN publication whose published set has NO deficit
// (missingPublishedCount === 0) but is still awaiting a recovery-eligible ack must
// re-drive the owner reconcile to CLOSE it, instead of skipping with no-deficit.
function ackCompletionCtx({recoveryEligible}) {
  let reconcileCalls = 0;
  const ctx = {
    nodeId: 'seed',
    systemTableCache: leaderCache('seed'),
    assertSingleMembershipPartition: () => {},
    now: () => 1,
    reconcileActiveGateMembershipPublication: async () => {reconcileCalls += 1;},
    readPublicationPlanningSnapshot: async () => ({
      // empty nodeRows -> expectedNodeIds empty -> missingPublishedCount === 0,
      // isolating the ack-completion path.
      nodeRows: [],
      readinessByNodeId: {
        peer: {dimensions: {controlPlaneRecoveryEligible: recoveryEligible}},
      },
      latestPublicationRow: {
        publicationEpoch: 20,
        status: 'OPEN',
        publishedActiveNodeIds: ['seed', 'peer'],
        requiredAckNodeIds: ['seed', 'peer'],
        acknowledgedNodeIds: ['seed'],
      },
      latestPublishedPublicationRow: null,
    }),
    logger: {warn: () => {}},
    ...traceStubs(),
  };
  return {ctx, reconcileCalls: () => reconcileCalls};
}

t.test('drive: re-drives an OPEN publication awaiting a recovery-eligible ack (CL-001)', async (t) => {
  const {ctx, reconcileCalls} = ackCompletionCtx({recoveryEligible: true});
  const drove = await drive.call(ctx);
  t.equal(drove, true, 'drives despite zero published-set deficit');
  t.equal(reconcileCalls(), 1, 'reconcile invoked to close the OPEN publication');
});

t.test('drive: does NOT re-drive when the pending-ack node is not recovery-eligible (thrash guard)', async (t) => {
  const {ctx, reconcileCalls} = ackCompletionCtx({recoveryEligible: false});
  const drove = await drive.call(ctx);
  t.equal(drove, false, 'skips: a non-eligible pending ack must not spin the driver');
  t.equal(reconcileCalls(), 0, 'no reconcile when the ack cannot complete');
});

t.test('B4 tripwire: assertSingleMembershipPartition', async (t) => {
  const assertFn =
    MembershipPublicationCoordinatorClassStage2.prototype.assertSingleMembershipPartition;
  // single partition -> no error, asserted latches true
  let errors = 0;
  const single = {
    nodeId: 'seed',
    logger: {error: () => {errors += 1;}},
    systemTableCache: {getAll: () => [{table_id: 'control_plane_publications', partition_id: 'control_plane_publications-p1'}]},
  };
  assertFn.call(single);
  t.equal(errors, 0, 'single partition -> no critical log');
  t.equal(single.membershipSinglePartitionAsserted, true, 'latched');
  // multi partition -> critical error
  let multiErrors = 0;
  const multi = {
    nodeId: 'seed',
    logger: {error: () => {multiErrors += 1;}},
    systemTableCache: {getAll: () => [
      {table_id: 'control_plane_publications', partition_id: 'control_plane_publications-p1'},
      {table_id: 'control_plane_publications', partition_id: 'control_plane_publications-p2'},
    ]},
  };
  assertFn.call(multi);
  t.equal(multiErrors, 1, 'multi partition -> critical log');
  t.notOk(multi.membershipSinglePartitionAsserted, 'not latched while violated');
});

t.test('start: no-op when leader-driven mode is disabled', async (t) => {
  let intervals = 0;
  const ctx = {};
  start.call(ctx, {enabled: false, setIntervalFn: () => {intervals += 1;}});
  t.equal(intervals, 0);
  t.equal(ctx.ownerMembershipDriverTimer, undefined);
});

t.test('start/stop: enabled starts an interval; stop clears it', async (t) => {
  let intervals = 0;
  const fakeTimer = {unref() {}};
  const ctx = {};
  start.call(ctx, {enabled: true, setIntervalFn: () => {intervals += 1; return fakeTimer;}});
  t.equal(intervals, 1, 'interval started');
  t.equal(ctx.ownerMembershipDriverTimer, fakeTimer);
  // second start is idempotent
  start.call(ctx, {enabled: true, setIntervalFn: () => {intervals += 1;}});
  t.equal(intervals, 1, 'start is idempotent');
  stop.call(ctx);
  t.equal(ctx.ownerMembershipDriverTimer, null, 'stopped');
});
