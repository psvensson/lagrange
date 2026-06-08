import t from 'tap';
import {HeartbeatService} from '../../src/control-plane/heartbeat-service.js';

// Phase 4 (4.1c): the write-leader's heartbeat tick drives the membership
// reconcile. Leadership is resolved via the steady-state predicate
// (control_plane_publications partition leader), NOT the bootstrap-only check.
const driver =
  HeartbeatService.prototype.maybeDriveLeaderMembershipReconcile;

function leaderCache(nodeId) {
  return {
    get: (table, key) =>
      table === 'partitions' && key === 'control_plane_publications-p1' ?
        {leader_node_id: nodeId} :
        null,
    find: () => null,
  };
}

function makeCtx({cache, enqueueSpy, nodeId = 'seed'}) {
  return {
    nodeId,
    membershipPublicationService: {
      enqueueClusterMembershipReconcile: enqueueSpy,
    },
    systemTableCache: cache,
  };
}

t.beforeEach(() => {
  delete process.env.LAGRANGE_MEMBERSHIP_LEADER_DRIVEN;
});

t.test('flag off -> never drives (default unchanged)', async (t) => {
  let calls = 0;
  const ctx = makeCtx({cache: leaderCache('seed'), enqueueSpy: () => {calls += 1;}});
  t.equal(driver.call(ctx), false);
  t.equal(calls, 0);
});

t.test('flag on + this node is partition leader -> enqueues', async (t) => {
  process.env.LAGRANGE_MEMBERSHIP_LEADER_DRIVEN = 'true';
  let reason = null;
  const ctx = makeCtx({cache: leaderCache('seed'), enqueueSpy: (r) => {reason = r;}});
  t.equal(driver.call(ctx), true);
  t.equal(reason, 'leader_periodic_membership_drive');
});

t.test('flag on + NOT partition leader -> does not enqueue', async (t) => {
  process.env.LAGRANGE_MEMBERSHIP_LEADER_DRIVEN = 'true';
  let calls = 0;
  // cache says the leader is 'seed' but this node is a rejoiner
  const ctx = makeCtx({
    cache: leaderCache('seed'),
    nodeId: 'rejoiner',
    enqueueSpy: () => {calls += 1;},
  });
  t.equal(driver.call(ctx), false);
  t.equal(calls, 0);
});

t.test('flag on + throwing cache -> fail-safe false', async (t) => {
  process.env.LAGRANGE_MEMBERSHIP_LEADER_DRIVEN = 'true';
  let calls = 0;
  const ctx = makeCtx({
    cache: {get: () => {throw new Error('cache miss');}, find: () => null},
    enqueueSpy: () => {calls += 1;},
  });
  t.equal(driver.call(ctx), false);
  t.equal(calls, 0);
});

t.test('flag on, no publication service -> false', async (t) => {
  process.env.LAGRANGE_MEMBERSHIP_LEADER_DRIVEN = 'true';
  t.equal(
    driver.call({
      nodeId: 'seed',
      membershipPublicationService: null,
      systemTableCache: leaderCache('seed'),
    }),
    false,
  );
});
