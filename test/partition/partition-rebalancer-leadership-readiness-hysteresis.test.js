/**
 * Falsifier: leadership-sink readiness hysteresis.
 *
 * Pins the fix for the post-restart `quiescence_candidate` stall whose
 * proven mechanism is a lockstep leadership FLAP: the node-wide shared
 * metadata-publication readiness state oscillates (e.g. re-entering a
 * degraded phase during control-plane recovery), and because leadership was
 * gated on `isBackgroundWorkReady() && isLeader`, a single readiness blip
 * demoted and re-promoted the leadership-driven owner on EVERY partition in
 * lockstep (187 LEADER_START / 187 LEADER_STOP observed on the rejoiner).
 *
 * Policy under test: background-work readiness gates leadership ACQUISITION;
 * raft leadership gates RETENTION. A sink this partition drove to leadership
 * that still holds raft leadership must be RETAINED across a transient
 * (non-draining) readiness dip. A draining/shutting-down node still demotes,
 * and a sink that never acquired (or lost raft leadership) still obeys the
 * acquisition gate.
 *
 * Subject: the leadership sink the partition drives
 * (`setRebalancerLeadershipSink`; in production the runtime-service owner on
 * service_definitions-p1 and the service-installation reconciler on
 * service_installations-p1). The per-partition rebalancer these cases first
 * pinned is retired (placement stage 3); the retention it carried belongs to
 * the partition's sink driver, which records the leadership it drove.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  LIFECYCLE_PHASE,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {attachRuntimeServiceRebalancerOwner} from
  '../../src/bootstrap/shared/runtime-service-rebalancer-setup.js';
import {attachServiceInstallationReconcilerOwner} from
  '../../src/bootstrap/shared/service-installation-reconciler-setup.js';
import {
  createMockCache,
  createMockCdcService,
  createMockPolicyService,
  createMockMessageRouter,
} from '../rebalancer/test-helpers.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {createReadinessHoldingCoordinator} from './readiness-holding-coordinator-fixture.js';

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

function createPartitionService({partitionId = PARTITION_ID, tableId = TABLE_ID,
  replicaId = REPLICA_ID} = {}) {
  return new PartitionService(withFoundingStamp({
    partitionId,
    tableId,
    replicaId,
    nodeId: NODE_ID,
    dbPath: ':memory:',
    deferElection: true,
    suppressLifecycleLogs: true,
  }));
}

// A leadership sink as the partition drives it: it holds what it was told.
function createLeadershipSink() {
  return {
    isLeader: false,
    setLeader(next) {
      this.isLeader = next === true;
    },
  };
}

/**
 * Wire dependencies and acquire sink leadership while ready.
 * @return {{ps: PartitionService, sink: Object}} A leader partition whose
 *   sink holds leadership.
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
  ps.setRebalanceCoordinator(createReadinessHoldingCoordinator());
  const sink = createLeadershipSink();
  ps.setRebalancerLeadershipSink(sink);
  return {ps, sink};
}

// ── Retention: the core falsifier ──────────────────────────────────

test('hysteresis — active rebalancer leader is RETAINED across a ' +
  'transient (non-draining) readiness dip while raft leadership holds',
async (t) => {
  const {ps, sink} = createActiveLeaderPartition();
  t.equal(ps.rebalancerLeadershipSink, sink, 'leadership sink attached');
  t.equal(sink.isLeader, true, 'acquired leadership while ready');

  // Node-wide readiness dips (recovery re-entry), raft leadership unchanged.
  ps.metadataPublicationReadinessState =
    readinessStateFor(RECOVERY_DIP_SNAPSHOT);
  t.equal(ps.isBackgroundWorkReady(), false,
    'background work reports not-ready during the dip');
  ps.updateRebalancerLeadership();

  t.equal(sink.isLeader, true,
    'rebalancer leadership RETAINED across the transient dip (no flap)');

  // Recovery: readiness returns; still leader (no spurious re-toggle needed).
  ps.metadataPublicationReadinessState = readinessStateFor(READY_SNAPSHOT);
  ps.updateRebalancerLeadership();
  t.equal(sink.isLeader, true,
    'rebalancer leadership stable after readiness returns');

  await ps.shutdown();
});

test('hysteresis — repeated readiness oscillation does NOT flap an active ' +
  'rebalancer leader (no lockstep churn)', async (t) => {
  const {ps, sink} = createActiveLeaderPartition();
  let flapStops = 0;
  const realSetLeader = sink.setLeader.bind(sink);
  sink.setLeader = (next) => {
    if (sink.isLeader === true && next === false) {
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
  t.equal(sink.isLeader, true, 'still leader at the end');

  await ps.shutdown();
});

// ── Demotion paths that MUST still demote ──────────────────────────

test('demotion preserved — draining readiness demotes even an active ' +
  'rebalancer leader', async (t) => {
  const {ps, sink} = createActiveLeaderPartition();
  t.equal(sink.isLeader, true, 'acquired leadership while ready');

  ps.metadataPublicationReadinessState = readinessStateFor(DRAINING_SNAPSHOT);
  ps.updateRebalancerLeadership();

  t.equal(sink.isLeader, false,
    'draining is terminal — rebalancer leadership demoted');

  await ps.shutdown();
});

test('demotion preserved — loss of raft leadership demotes the rebalancer ' +
  'regardless of readiness', async (t) => {
  const {ps, sink} = createActiveLeaderPartition();
  t.equal(sink.isLeader, true, 'acquired leadership while ready');

  ps.isLeader = false;
  ps.updateRebalancerLeadership();

  t.equal(sink.isLeader, false,
    'raft leadership gates retention — demoted on raft loss');

  await ps.shutdown();
});

// ── Acquisition gate is unchanged ──────────────────────────────────

test('acquisition gate preserved — a non-active rebalancer does NOT acquire ' +
  'leadership while background work is not ready', async (t) => {
  const {ps, sink} = createActiveLeaderPartition();
  // Force a non-active sink (e.g. after a raft-loss demotion), then present
  // a not-ready dip and confirm it does NOT re-acquire.
  ps.isLeader = false;
  ps.updateRebalancerLeadership();
  t.equal(sink.isLeader, false, 'demoted (non-active)');

  ps.isLeader = true;
  ps.metadataPublicationReadinessState =
    readinessStateFor(RECOVERY_DIP_SNAPSHOT);
  ps.updateRebalancerLeadership();

  t.equal(sink.isLeader, false,
    'does not re-acquire while not background-ready (acquisition gate intact)');

  await ps.shutdown();
});

// ── Production construction: the two live sinks ────────────────────

function installationCatalogOwner() {
  const gateway = {setSqlQueryEngine() {}};
  return {
    getGateway: () => gateway,
    listInstallations: async () => [],
    getRevision: async () => null,
    getPackage: async () => null,
    getFailure: async () => null,
    recordFailure: async () => null,
    recordRolloutOutcome: async () => null,
  };
}

// Counts every setLeader the partition hands an owner from now on.
function countLeadership(owner) {
  const counts = {acquisitions: 0, demotions: 0};
  const setLeader = owner.setLeader.bind(owner);
  owner.setLeader = (next) => {
    counts[next === true ? 'acquisitions' : 'demotions'] += 1;
    return setLeader(next);
  };
  return counts;
}

test('production construction — a non-draining readiness dip demotes neither ' +
  'the runtime-service owner nor the service-installation reconciler', async (t) => {
  const definitions = createPartitionService({
    partitionId: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS],
    tableId: SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS, replicaId: 'definitions-r1'});
  const installations = createPartitionService({
    partitionId: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICE_INSTALLATIONS],
    tableId: SYSTEM_TABLE_NAME.SERVICE_INSTALLATIONS, replicaId: 'installations-r1'});
  const partitions = [definitions, installations];
  const partitionServices = new Map(partitions.map((ps) => [ps.replicaId, ps]));
  for (const ps of partitions) {
    ps.metadataPublicationReadinessState = readinessStateFor(READY_SNAPSHOT);
  }
  const runtime = attachRuntimeServiceRebalancerOwner({
    nodeId: NODE_ID,
    systemTableCache: {filter: () => []},
    cdcIntegrationService: {sqlQueryEngine: {}},
    tablePolicyService: {},
    messageRouter: {},
    rebalanceCoordinator: {},
    serviceDefinitionsOwner: {reconcileRequestBinding: async () => {}},
    partitionServices,
    createRebalancer: () => ({initialize() {}, setLeader() {}, shutdown() {}}),
  });
  const installation = attachServiceInstallationReconcilerOwner({
    catalogOwner: installationCatalogOwner(),
    partitionServices,
    logger: {error() {}, warn() {}, info() {}},
  });
  t.equal(definitions.rebalancerLeadershipSink, runtime.owner,
    'the runtime-service owner is the sink of service_definitions-p1');
  t.equal(installations.rebalancerLeadershipSink, installation.owner,
    'the service-installation reconciler is the sink of service_installations-p1');
  const runtimeCounts = countLeadership(runtime.owner);
  const installationCounts = countLeadership(installation.owner);

  // Raft leadership arrives while the node is ready (leader activation).
  for (const ps of partitions) {
    ps.isLeader = true;
    ps.updateRebalancerLeadership();
  }
  t.ok(runtimeCounts.acquisitions > 0 && installationCounts.acquisitions > 0,
    'both owners acquired leadership while ready');

  // A transient recovery dip and its recovery, through the readiness fan-out.
  for (const snapshot of [RECOVERY_DIP_SNAPSHOT, READY_SNAPSHOT,
    RECOVERY_DIP_SNAPSHOT, READY_SNAPSHOT]) {
    for (const ps of partitions) {
      ps.metadataPublicationReadinessState = readinessStateFor(snapshot);
      ps.handleMetadataPublicationReadinessTransition();
    }
  }
  t.equal(runtimeCounts.demotions, 0,
    'the runtime-service owner is not demoted by a non-draining dip');
  t.equal(installationCounts.demotions, 0,
    'the service-installation reconciler is not demoted by a non-draining dip');

  // The counter is in the path: a drain demotes each owner exactly once.
  for (const ps of partitions) {
    ps.metadataPublicationReadinessState = readinessStateFor(DRAINING_SNAPSHOT);
    ps.handleMetadataPublicationReadinessTransition();
  }
  t.equal(runtimeCounts.demotions, 1, 'a drain demotes the runtime-service owner');
  t.equal(installationCounts.demotions, 1,
    'a drain demotes the service-installation reconciler');

  runtime.detach();
  installation.detach();
  for (const ps of partitions) {
    await ps.shutdown();
  }
});
