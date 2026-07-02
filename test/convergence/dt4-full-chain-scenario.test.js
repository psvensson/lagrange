import t from 'tap';
import LifeRaft from '../../src/raft/liferaft.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {TABLES} from '../../src/constants/index.js';
import {
  MembershipPublicationCoordinatorReconcile,
} from '../../src/control-plane/membership-publication-coordinator-reconcile.js';

// DT4 — the full freeze→leadership→publication-stall chain (CL-039 L1→TT), in-process
// and deterministic. The companion L1→L2 scenario (dt4-freeze-leadership-scenario)
// proves a freeze sheds raft leadership; THIS one closes the chain L2→TT: once the
// seed is no longer the control_plane_publications raft leader, the REAL owner-
// membership driver defers every tick (NOT_OWNER) and the publication stops advancing
// — the stuck-OPEN epoch that leaves the cluster non-converged.
//
// Fidelity: the leadership signal is the seed's LIVE raft state, read through the
// production Tier-0 path (resolveControlPlanePublicationsLeadership ->
// cdcIntegrationService.canWriteSystemTableLocally). The owner-driver (its interval,
// its in-flight guard, its leadership gate) is the real prototype code running on the
// same VirtualTimeSource as the raft node — one clock advance drives both. We observe
// the leadership GATE (a planning-snapshot read happens only past it); the publish
// internals downstream of the gate are exercised by their own tests.

const HIGH_MS = '10000 ms'; // keep raft's own timers dormant during the scenario

function makeLeaderNode(clock) {
  return new LifeRaft('seed', {
    'timeSource': clock,
    'state': LifeRaft.LEADER,
    'election min': HIGH_MS,
    'election max': HIGH_MS,
    'heartbeat': HIGH_MS,
    'write': (_packet, callback) => {
      if (typeof callback === 'function') {
        callback(null);
      }
    },
  });
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

t.test('freeze→leadership-loss→publication-stall (CL-039 L1→TT)', async (t) => {
  const clock = new VirtualTimeSource();
  const seed = makeLeaderNode(clock);
  t.teardown(() => seed.end());

  // Production Tier-0 leadership: "can this node write control_plane_publications
  // locally" == the seed's live raft leadership.
  const cdcIntegrationService = {
    canWriteSystemTableLocally: (table) =>
      table === TABLES.CONTROL_PLANE_PUBLICATIONS &&
      seed.state === LifeRaft.LEADER,
  };

  let snapshotReads = 0; // increments only AFTER the owner-driver's leadership gate
  const proto = MembershipPublicationCoordinatorReconcile.prototype;
  const coordinator = {
    driveOwnerMembershipReconcile: proto.driveOwnerMembershipReconcile,
    startOwnerMembershipDriver: proto.startOwnerMembershipDriver,
    stopOwnerMembershipDriver: proto.stopOwnerMembershipDriver,
    nodeId: 'seed',
    // No partition-row / services witness: force resolution onto the Tier-0
    // raft-role path (the cache tiers lag and are not the signal here).
    systemTableCache: {get: () => null, find: () => null},
    cdcIntegrationService,
    ownerMembershipReconcileInFlight: false,
    assertSingleMembershipPartition: () => {},
    readPublicationPlanningSnapshot: async () => {
      snapshotReads += 1;
      return null; // past the gate; the publish internals are out of scope here
    },
    reconcileActiveGateMembershipPublication: async () => {},
    _emitConvergenceDecisionTrace: () => {},
    _buildPublicationReadinessTraceFields: () => ({}),
    // CL-001 variant D: the follower-skip and owner no-deficit paths hydrate the
    // local cache from authority via this real prototype method; stub it as a
    // best-effort no-op so the leadership-gate behaviour stays isolated.
    refreshDeferredPublicationsCacheFromAuthority: async () => {},
    logger: {warn: () => {}, info: () => {}, debug: () => {}, error: () => {}},
  };

  // The owner-driver runs on the SAME virtual clock as the raft node.
  coordinator.startOwnerMembershipDriver({
    enabled: true,
    intervalMs: 50,
    timeSource: clock,
  });
  t.teardown(() => coordinator.stopOwnerMembershipDriver());

  // Phase 1 — healthy: the seed holds publications leadership, so each driver tick
  // passes the gate and advances the publication.
  for (let i = 0; i < 3; i += 1) {
    clock.advance(50);
    await flushMicrotasks();
  }
  const advancedWhileLeader = snapshotReads;
  t.ok(advancedWhileLeader > 0,
    'while the seed is the publications raft leader, the driver passes the leadership gate and proceeds to publish');

  // The freeze outcome (L1→L2, proven deterministically in the companion scenario):
  // the seed's event loop blocked past the election timeout, a peer won a higher
  // term, and the seed steps down. Leadership leaves the seed.
  seed.change({state: LifeRaft.FOLLOWER});
  t.not(seed.state, LifeRaft.LEADER, 'seed has shed publications leadership');

  // Phase 2 — post-freeze: the driver keeps ticking on the clock, but every tick now
  // defers (NOT_OWNER), so the publication does not advance — the stuck-OPEN stall.
  for (let i = 0; i < 4; i += 1) {
    clock.advance(50);
    await flushMicrotasks();
  }
  t.equal(snapshotReads, advancedWhileLeader,
    'after leadership is lost the driver defers at the gate every tick — it never reaches publish, so the publication cannot advance (TT)');

  // And the gate itself reports NOT the owner now.
  const deferred = await coordinator.driveOwnerMembershipReconcile.call(coordinator);
  t.equal(deferred, false, 'driveOwnerMembershipReconcile returns false (deferred) when not leader');
});

t.test('regaining leadership lets the publication advance again', async (t) => {
  const clock = new VirtualTimeSource();
  const seed = makeLeaderNode(clock);
  t.teardown(() => seed.end());
  seed.change({state: LifeRaft.FOLLOWER}); // start NOT the leader

  let snapshotReads = 0;
  const proto = MembershipPublicationCoordinatorReconcile.prototype;
  const coordinator = {
    driveOwnerMembershipReconcile: proto.driveOwnerMembershipReconcile,
    nodeId: 'seed',
    systemTableCache: {get: () => null, find: () => null},
    cdcIntegrationService: {
      canWriteSystemTableLocally: (table) =>
        table === TABLES.CONTROL_PLANE_PUBLICATIONS &&
        seed.state === LifeRaft.LEADER,
    },
    ownerMembershipReconcileInFlight: false,
    assertSingleMembershipPartition: () => {},
    readPublicationPlanningSnapshot: async () => {
      snapshotReads += 1;
      return null;
    },
    reconcileActiveGateMembershipPublication: async () => {},
    _emitConvergenceDecisionTrace: () => {},
    _buildPublicationReadinessTraceFields: () => ({}),
    // CL-001 variant D: the follower-skip and owner no-deficit paths hydrate the
    // local cache from authority via this real prototype method; stub it as a
    // best-effort no-op so the leadership-gate behaviour stays isolated.
    refreshDeferredPublicationsCacheFromAuthority: async () => {},
    logger: {warn: () => {}, info: () => {}, debug: () => {}, error: () => {}},
  };

  await coordinator.driveOwnerMembershipReconcile.call(coordinator);
  t.equal(snapshotReads, 0, 'no advance while not the leader');

  seed.change({state: LifeRaft.LEADER}); // leadership fails back to the seed
  await coordinator.driveOwnerMembershipReconcile.call(coordinator);
  t.equal(snapshotReads, 1, 'publication advances again once leadership returns');
});
