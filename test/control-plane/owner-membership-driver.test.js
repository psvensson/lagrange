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

t.test('drive: no-op when this node is NOT the publications leader', async (t) => {
  let planningCalls = 0;
  const ctx = {
    nodeId: 'seed',
    systemTableCache: leaderCache('other'), // leader is someone else
    readPublicationPlanningSnapshot: async () => {planningCalls += 1; return null;},
    reconcileActiveGateMembershipPublication: async () => {},
    logger: {},
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
    logger: {},
  };
  t.equal(await drive.call(ctx), false, 'null snapshot -> false');
  t.equal(planningCalls, 1, 'leader proceeds past the gate');
  t.equal(ctx.ownerMembershipReconcileInFlight, false, 'in-flight reset in finally');
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
