/**
 * Falsifier: message-group rebalancer-leadership readiness hysteresis.
 *
 * Mirrors the PartitionService fix (resolveRebalancerLeadership): the
 * message-group rebalancer leadership was gated
 * `setLeader(isBackgroundWorkReady() && isLeaderReplica())`, and
 * `isBackgroundWorkReady()` reads the SAME node-wide shared
 * metadata-publication readiness object that oscillates during
 * control-plane recovery — so a single readiness blip demoted+re-promoted
 * every group's rebalancer in lockstep (the same flap class that reset the
 * post-restart quiescence window for partitions).
 *
 * Policy under test: background-work readiness gates rebalancer-leadership
 * ACQUISITION; raft leadership (leader replica) gates RETENTION. An
 * already-active rebalancer leader that still holds raft leadership is
 * RETAINED across a transient (non-draining) readiness dip; a
 * draining/shutting-down node still demotes; a non-active group still
 * obeys the acquisition gate.
 *
 * RED before the fix; GREEN after.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  createTestTransport,
  registerMessageGroupServiceLifecycleHooks,
  setTestPortBase,
} from './message-group-service-test-support.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {
  LIFECYCLE_PHASE,
} from '../../src/bootstrap/lifecycle-controller-constants.js';

setTestPortBase(25400);
registerMessageGroupServiceLifecycleHooks();

const READY_SNAPSHOT = {
  ready: true,
  phase: LIFECYCLE_PHASE.TRAFFIC_READY,
  draining: false,
  reasons: [],
};

const RECOVERY_DIP_SNAPSHOT = {
  ready: false,
  phase: LIFECYCLE_PHASE.DEGRADED,
  draining: false,
  reasons: ['priority_control_plane_recovery_pending'],
};

const DRAINING_SNAPSHOT = {
  ready: false,
  phase: LIFECYCLE_PHASE.DEGRADED,
  draining: true,
  reasons: ['draining'],
};

function readinessStateFor(snapshot) {
  return {
    evaluate: () => snapshot,
    getSnapshot: () => snapshot,
    on: () => {},
    off: () => {},
  };
}

/**
 * Build a message-group service with a stub rebalancer that tracks
 * LEADER_STOP (true->false) transitions, holding raft + active leadership.
 * @param {Object} router - Test transport router.
 * @param {string} nodeId - Node id.
 * @return {Object} {service, rebalancer, flapStops()}.
 */
function createActiveLeaderService(router, nodeId, groupId) {
  const service = new MessageGroupService({
    groupId,
    replicaId: `${groupId}-r1`,
    nodeId,
    transport: router,
  });
  let flapStops = 0;
  const rebalancer = {
    isLeader: true,
    isShuttingDown: false,
    setLeader(next) {
      if (this.isLeader === true && next === false) {
        flapStops += 1;
      }
      this.isLeader = next;
    },
  };
  service.rebalancer = rebalancer;
  service.isLeaderReplica = () => true;
  service.metadataPublicationReadinessState = readinessStateFor(READY_SNAPSHOT);
  return {service, rebalancer, flapStops: () => flapStops};
}

test('mg hysteresis — active rebalancer leader is RETAINED across a ' +
  'transient (non-draining) readiness dip while raft leadership holds',
async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const {service, rebalancer} =
      createActiveLeaderService(router, nodeId, 'mg-hyst-retain');

    t.equal(service.isBackgroundWorkReady(), true, 'ready before the dip');

    service.metadataPublicationReadinessState =
      readinessStateFor(RECOVERY_DIP_SNAPSHOT);
    t.equal(service.isBackgroundWorkReady(), false, 'not-ready during dip');
    service.updateRebalancerLeadership();

    t.equal(rebalancer.isLeader, true,
      'rebalancer leadership RETAINED across the transient dip (no flap)');
  } finally {
    await cleanup();
  }
});

test('mg hysteresis — repeated readiness oscillation does NOT flap an ' +
  'active rebalancer leader', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const {service, rebalancer, flapStops} =
      createActiveLeaderService(router, nodeId, 'mg-hyst-osc');

    for (let i = 0; i < 5; i += 1) {
      service.metadataPublicationReadinessState =
        readinessStateFor(RECOVERY_DIP_SNAPSHOT);
      service.updateRebalancerLeadership();
      service.metadataPublicationReadinessState =
        readinessStateFor(READY_SNAPSHOT);
      service.updateRebalancerLeadership();
    }

    t.equal(flapStops(), 0,
      'no LEADER_STOP transitions across 5 readiness oscillations');
    t.equal(rebalancer.isLeader, true, 'still leader at the end');
  } finally {
    await cleanup();
  }
});

test('mg demotion preserved — draining readiness demotes even an active ' +
  'rebalancer leader', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const {service, rebalancer} =
      createActiveLeaderService(router, nodeId, 'mg-hyst-drain');

    service.metadataPublicationReadinessState =
      readinessStateFor(DRAINING_SNAPSHOT);
    service.updateRebalancerLeadership();

    t.equal(rebalancer.isLeader, false,
      'draining is terminal — rebalancer leadership demoted');
  } finally {
    await cleanup();
  }
});

test('mg demotion preserved — loss of raft leadership demotes the ' +
  'rebalancer regardless of readiness', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const {service, rebalancer} =
      createActiveLeaderService(router, nodeId, 'mg-hyst-raftloss');

    service.isLeaderReplica = () => false;
    service.updateRebalancerLeadership();

    t.equal(rebalancer.isLeader, false,
      'raft leadership gates retention — demoted on raft loss');
  } finally {
    await cleanup();
  }
});

test('mg acquisition gate preserved — a non-active rebalancer does NOT ' +
  'acquire leadership while background work is not ready', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const {service, rebalancer} =
      createActiveLeaderService(router, nodeId, 'mg-hyst-acquire');
    rebalancer.isLeader = false;

    service.metadataPublicationReadinessState =
      readinessStateFor(RECOVERY_DIP_SNAPSHOT);
    service.updateRebalancerLeadership();

    t.equal(rebalancer.isLeader, false,
      'does not re-acquire while not background-ready (acquisition gate)');
  } finally {
    await cleanup();
  }
});
