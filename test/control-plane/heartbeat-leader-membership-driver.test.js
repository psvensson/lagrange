import t from 'tap';
import {HeartbeatService} from '../../src/control-plane/heartbeat-service.js';

// Phase 4 (4.1c): the write-leader's heartbeat tick drives the membership
// reconcile. Test the driver predicate directly via the prototype method.
const driver =
  HeartbeatService.prototype.maybeDriveLeaderMembershipReconcile;

function makeCtx({writeLeader, enqueueSpy, throwOnLeaderCheck = false}) {
  return {
    membershipPublicationService: {
      enqueueClusterMembershipReconcile: enqueueSpy,
    },
    cdcIntegrationService: {
      canWriteSystemTableLocally: () => {
        if (throwOnLeaderCheck) {
          throw new Error('leadership unknown');
        }
        return writeLeader;
      },
    },
  };
}

t.beforeEach(() => {
  delete process.env.LAGRANGE_MEMBERSHIP_LEADER_DRIVEN;
});

t.test('flag off -> never drives (default unchanged)', async (t) => {
  let calls = 0;
  const ctx = makeCtx({writeLeader: true, enqueueSpy: () => {calls += 1;}});
  t.equal(driver.call(ctx), false);
  t.equal(calls, 0);
});

t.test('flag on + write-leader -> enqueues reconcile', async (t) => {
  process.env.LAGRANGE_MEMBERSHIP_LEADER_DRIVEN = 'true';
  let reason = null;
  const ctx = makeCtx({writeLeader: true, enqueueSpy: (r) => {reason = r;}});
  t.equal(driver.call(ctx), true);
  t.equal(reason, 'leader_periodic_membership_drive');
});

t.test('flag on + NOT write-leader -> does not enqueue', async (t) => {
  process.env.LAGRANGE_MEMBERSHIP_LEADER_DRIVEN = 'true';
  let calls = 0;
  const ctx = makeCtx({writeLeader: false, enqueueSpy: () => {calls += 1;}});
  t.equal(driver.call(ctx), false);
  t.equal(calls, 0);
});

t.test('flag on + throwing leader check -> fail-safe false', async (t) => {
  process.env.LAGRANGE_MEMBERSHIP_LEADER_DRIVEN = 'true';
  let calls = 0;
  const ctx = makeCtx({
    writeLeader: true,
    enqueueSpy: () => {calls += 1;},
    throwOnLeaderCheck: true,
  });
  t.equal(driver.call(ctx), false);
  t.equal(calls, 0);
});

t.test('flag on, no publication service -> false', async (t) => {
  process.env.LAGRANGE_MEMBERSHIP_LEADER_DRIVEN = 'true';
  t.equal(
    driver.call({membershipPublicationService: null, cdcIntegrationService: {}}),
    false,
  );
});
