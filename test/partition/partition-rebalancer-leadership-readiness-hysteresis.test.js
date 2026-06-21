/**
 * Falsifier: rebalancer-leadership readiness hysteresis.
 *
 * Pins the fix for the post-restart `quiescence_candidate` stall whose
 * proven mechanism is a lockstep rebalancer-leadership FLAP: the node-wide
 * shared metadata-publication readiness state oscillates (e.g. re-entering
 * a degraded phase during control-plane recovery), and because every
 * partition's rebalancer leadership was gated on
 * `isBackgroundWorkReady() && isLeader`, a single readiness blip demoted
 * and re-promoted the rebalancer on EVERY partition in lockstep — resetting
 * the harness's 15s contiguous leadership-quiet window so convergence never
 * settled (187 LEADER_START / 187 LEADER_STOP observed on the rejoiner).
 *
 * Policy under test: background-work readiness gates rebalancer-leadership
 * ACQUISITION; raft leadership gates RETENTION. An already-active rebalancer
 * leader that still holds raft leadership must be RETAINED across a transient
 * (non-draining) readiness dip. A draining/shutting-down node still demotes,
 * and a partition that never acquired (or lost raft leadership) still obeys
 * the acquisition gate.
 *
 * RED before the fix (setLeader(isBackgroundWorkReady() && isLeader) demotes
 * on every dip); GREEN after resolveRebalancerLeadership() adds hysteresis.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  LIFECYCLE_PHASE,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {
  createMockCache,
  createMockCdcService,
  createMockPolicyService,
  createMockMessageRouter,
  createMockCoordinator,
} from '../rebalancer/test-helpers.js';

const PARTITION_ID = 'test-partition-1';
const TABLE_ID = 'test-table-1';
const REPLICA_ID = 'test-replica-1';
const NODE_ID = 'test-node-1';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: NODE_ID}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function createMockSqlEngine() {
  return {
    execute: async () => ({rows: []}),
    executeSQL: async () => ({success: true, rows: []}),
  };
}

/**
 * Build a readiness state that exposes a fixed snapshot.
 * @param {Object} snapshot - The snapshot to expose.
 * @return {Object} Mock readiness state.
 */
function readinessStateFor(snapshot) {
  return {
    evaluate: () => snapshot,
    getSnapshot: () => snapshot,
    on: () => {},
    off: () => {},
  };
}

const READY_SNAPSHOT = {
  ready: true,
  phase: LIFECYCLE_PHASE.TRAFFIC_READY,
  draining: false,
  reasons: [],
};

// A transient recovery dip: NOT background-ready, but NOT draining — the
// exact shape that oscillates during control-plane recovery.
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

function createPartitionService() {
  return new PartitionService({
    partitionId: PARTITION_ID,
    tableId: TABLE_ID,
    replicaId: REPLICA_ID,
    nodeId: NODE_ID,
    dbPath: ':memory:',
    deferElection: true,
    suppressLifecycleLogs: true,
  });
}

/**
 * Wire dependencies and acquire rebalancer leadership while ready.
 * @return {PartitionService} A leader partition with an active rebalancer.
 */
function createActiveLeaderPartition() {
  const ps = createPartitionService();
  ps.metadataPublicationReadinessState = readinessStateFor(READY_SNAPSHOT);
  ps.messageRouter = createMockMessageRouter();
  ps.isLeader = true;
  ps.setSystemTableCache(createMockCache());
  ps.setCdcIntegrationService(createMockCdcService());
  ps.setTablePolicyService(createMockPolicyService());
  ps.setSqlQueryEngine(createMockSqlEngine());
  ps.setRebalanceCoordinator(createMockCoordinator());
  return ps;
}

async function shutdownPartitionService(ps) {
  if (ps.rebalancer) {
    ps.rebalancer.shutdown();
  }
  await ps.shutdown();
}

// ── Retention: the core falsifier ──────────────────────────────────

test('hysteresis — active rebalancer leader is RETAINED across a ' +
  'transient (non-draining) readiness dip while raft leadership holds',
async (t) => {
  const ps = createActiveLeaderPartition();
  t.ok(ps.rebalancer, 'rebalancer created');
  t.equal(ps.rebalancer.isLeader, true, 'acquired leadership while ready');

  // Node-wide readiness dips (recovery re-entry), raft leadership unchanged.
  ps.metadataPublicationReadinessState =
    readinessStateFor(RECOVERY_DIP_SNAPSHOT);
  t.equal(ps.isBackgroundWorkReady(), false,
    'background work reports not-ready during the dip');
  ps.updateRebalancerLeadership();

  t.equal(ps.rebalancer.isLeader, true,
    'rebalancer leadership RETAINED across the transient dip (no flap)');

  // Recovery: readiness returns; still leader (no spurious re-toggle needed).
  ps.metadataPublicationReadinessState = readinessStateFor(READY_SNAPSHOT);
  ps.updateRebalancerLeadership();
  t.equal(ps.rebalancer.isLeader, true,
    'rebalancer leadership stable after readiness returns');

  await shutdownPartitionService(ps);
});

test('hysteresis — repeated readiness oscillation does NOT flap an active ' +
  'rebalancer leader (no lockstep churn)', async (t) => {
  const ps = createActiveLeaderPartition();
  let flapStops = 0;
  const realSetLeader = ps.rebalancer.setLeader.bind(ps.rebalancer);
  ps.rebalancer.setLeader = (next) => {
    if (ps.rebalancer.isLeader === true && next === false) {
      flapStops += 1;
    }
    return realSetLeader(next);
  };

  for (let i = 0; i < 5; i += 1) {
    ps.metadataPublicationReadinessState =
      readinessStateFor(RECOVERY_DIP_SNAPSHOT);
    ps.updateRebalancerLeadership();
    ps.metadataPublicationReadinessState = readinessStateFor(READY_SNAPSHOT);
    ps.updateRebalancerLeadership();
  }

  t.equal(flapStops, 0,
    'no LEADER_STOP transitions across 5 readiness oscillations');
  t.equal(ps.rebalancer.isLeader, true, 'still leader at the end');

  await shutdownPartitionService(ps);
});

// ── Demotion paths that MUST still demote ──────────────────────────

test('demotion preserved — draining readiness demotes even an active ' +
  'rebalancer leader', async (t) => {
  const ps = createActiveLeaderPartition();
  t.equal(ps.rebalancer.isLeader, true, 'acquired leadership while ready');

  ps.metadataPublicationReadinessState = readinessStateFor(DRAINING_SNAPSHOT);
  ps.updateRebalancerLeadership();

  t.equal(ps.rebalancer.isLeader, false,
    'draining is terminal — rebalancer leadership demoted');

  await shutdownPartitionService(ps);
});

test('demotion preserved — loss of raft leadership demotes the rebalancer ' +
  'regardless of readiness', async (t) => {
  const ps = createActiveLeaderPartition();
  t.equal(ps.rebalancer.isLeader, true, 'acquired leadership while ready');

  ps.isLeader = false;
  ps.updateRebalancerLeadership();

  t.equal(ps.rebalancer.isLeader, false,
    'raft leadership gates retention — demoted on raft loss');

  await shutdownPartitionService(ps);
});

// ── Acquisition gate is unchanged ──────────────────────────────────

test('acquisition gate preserved — a non-active rebalancer does NOT acquire ' +
  'leadership while background work is not ready', async (t) => {
  const ps = createActiveLeaderPartition();
  // Force a non-active rebalancer (e.g. after a raft-loss demotion), then
  // present a not-ready dip and confirm it does NOT re-acquire.
  ps.isLeader = false;
  ps.updateRebalancerLeadership();
  t.equal(ps.rebalancer.isLeader, false, 'demoted (non-active)');

  ps.isLeader = true;
  ps.metadataPublicationReadinessState =
    readinessStateFor(RECOVERY_DIP_SNAPSHOT);
  ps.updateRebalancerLeadership();

  t.equal(ps.rebalancer.isLeader, false,
    'does not re-acquire while not background-ready (acquisition gate intact)');

  await shutdownPartitionService(ps);
});
