/**
 * Falsifier: immediate event-driven rebalancer wake on TRAFFIC_READY rising edge.
 *
 * Verifies Part (B) of #37:
 * When PartitionService or MessageGroupService already has rebalancer.isLeader === true
 * (initialized during an earlier TRAFFIC_READY window), dips into DEGRADED
 * [PRIORITY_CONTROL_PLANE_RECOVERY_PENDING] where currentInterval backed off and
 * lastCheckAtMs is non-zero, and then transitions back to TRAFFIC_READY:
 * - handleMetadataPublicationReadinessTransition / maybeInitializeRebalancer(
 *     {readinessTransitionOnly: true}
 *   ) immediately resets currentInterval = periodicCheckIntervalMs,
 *   clears lastCheckAtMs = 0, and enqueues a rebalance check with
 *   RECONCILE_REASON.PERIODIC_CHECK.
 * - Repeated TRAFFIC_READY -> TRAFFIC_READY transitions (not a rising edge) do NOT
 *   spuriously reset lastCheckAtMs or enqueue duplicate wakes.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {withTestDbPath} from '../test-helpers/message-group-db-path.js';
import {
  createMockCache,
  createMockCdcService,
  createMockPolicyService,
  createMockMessageRouter,
} from '../rebalancer/test-helpers.js';
import {createReadinessHoldingCoordinator} from './readiness-holding-coordinator-fixture.js';

const PARTITION_ID = 'test-partition-traffic-ready-wake';
const TABLE_ID = 'test-table-traffic-ready-wake';
const REPLICA_ID = 'test-replica-traffic-ready-wake';
const NODE_ID = 'test-node-traffic-ready-wake';
const BACKOFF_INTERVAL_MS = 120000;
const SIMULATED_LAST_CHECK_MS = 987654321;
const REDUNDANT_CHECK_TIMESTAMP_MS = 987659999;

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

const RECOVERY_DIP_SNAPSHOT = {
  ready: false,
  phase: LIFECYCLE_PHASE.DEGRADED,
  draining: false,
  reasons: [LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING],
};

function createPartitionService() {
  return new PartitionService(withFoundingStamp({
    partitionId: PARTITION_ID,
    tableId: TABLE_ID,
    replicaId: REPLICA_ID,
    nodeId: NODE_ID,
    dbPath: ':memory:',
    deferElection: true,
    suppressLifecycleLogs: true,
  }));
}

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
  return ps;
}

function createMockTransport() {
  return {
    deliver: () => {},
    initialize: () => {},
    setServiceNodeResolver: () => {},
    on: () => {},
    off: () => {},
  };
}

function createStubRebalancer({isLeader = true, periodicCheckIntervalMs = 60000} = {}) {
  const enqueued = [];
  return {
    isLeader,
    isShuttingDown: false,
    periodicCheckIntervalMs,
    currentInterval: periodicCheckIntervalMs,
    lastCheckAtMs: 0,
    enqueued,
    setLeader(next) {
      this.isLeader = next;
    },
    setRebalanceCoordinator() {},
    shutdown() {
      this.isShuttingDown = true;
    },
    enqueueRebalanceCheck(reason) {
      enqueued.push(reason);
      return true;
    },
  };
}

// ── PartitionService Tests ──────────────────────────────────────────

test('PartitionService: TRAFFIC_READY rising edge resets backoff and enqueues rebalance check',
  async (t) => {
    const ps = createActiveLeaderPartition();
    t.ok(ps.rebalancer, 'rebalancer initialized');
    t.equal(ps.rebalancer.isLeader, true, 'rebalancer is leader');

    const enqueuedReasons = [];
    const originalEnqueue = ps.rebalancer.enqueueRebalanceCheck.bind(ps.rebalancer);
    ps.rebalancer.enqueueRebalanceCheck = (reason) => {
      enqueuedReasons.push(reason);
      return originalEnqueue(reason);
    };

    const periodicInterval = ps.rebalancer.periodicCheckIntervalMs;
    t.ok(periodicInterval > 0, 'periodicCheckIntervalMs is positive');

    // Dip into DEGRADED [PRIORITY_CONTROL_PLANE_RECOVERY_PENDING]
    ps.metadataPublicationReadinessState = readinessStateFor(RECOVERY_DIP_SNAPSHOT);
    ps.handleMetadataPublicationReadinessTransition();

    // Simulate rebalancer backing off during recovery wait
    ps.rebalancer.currentInterval = BACKOFF_INTERVAL_MS;
    ps.rebalancer.lastCheckAtMs = SIMULATED_LAST_CHECK_MS;

    // Transition back to TRAFFIC_READY (rising edge)
    ps.metadataPublicationReadinessState = readinessStateFor(READY_SNAPSHOT);
    ps.handleMetadataPublicationReadinessTransition();

    t.equal(
      ps.rebalancer.currentInterval,
      periodicInterval,
      'currentInterval reset to periodicCheckIntervalMs on rising edge',
    );
    t.equal(ps.rebalancer.lastCheckAtMs, 0, 'lastCheckAtMs cleared to 0 on rising edge');
    t.equal(enqueuedReasons.length, 1, 'enqueueRebalanceCheck called exactly once on rising edge');
    t.equal(
      enqueuedReasons[0],
      RECONCILE_REASON.PERIODIC_CHECK,
      'enqueueRebalanceCheck called with canonical RECONCILE_REASON.PERIODIC_CHECK',
    );

    // Repeated TRAFFIC_READY -> TRAFFIC_READY transition (no rising edge)
    ps.rebalancer.lastCheckAtMs = REDUNDANT_CHECK_TIMESTAMP_MS;
    ps.handleMetadataPublicationReadinessTransition();

    t.equal(
      ps.rebalancer.lastCheckAtMs,
      REDUNDANT_CHECK_TIMESTAMP_MS,
      'lastCheckAtMs NOT reset on redundant TRAFFIC_READY transition',
    );
    t.equal(
      enqueuedReasons.length,
      1,
      'no duplicate enqueueRebalanceCheck on redundant TRAFFIC_READY transition',
    );

    if (ps.rebalancer) {
      ps.rebalancer.shutdown();
    }
    await ps.shutdown();
  });

test('PartitionService: stub rebalancer verifies maybeInitializeRebalancer options contract',
  async (t) => {
    const ps = createPartitionService();
    ps.isLeader = true;
    ps.metadataPublicationReadinessState = readinessStateFor(READY_SNAPSHOT);

    const rebalancer = createStubRebalancer({isLeader: true, periodicCheckIntervalMs: 60000});
    ps.rebalancer = rebalancer;
    ps.maybeInitializeRebalancer();

    // Transition to DEGRADED
    ps.metadataPublicationReadinessState = readinessStateFor(RECOVERY_DIP_SNAPSHOT);
    ps.maybeInitializeRebalancer({readinessTransitionOnly: true});

    rebalancer.currentInterval = BACKOFF_INTERVAL_MS;
    rebalancer.lastCheckAtMs = SIMULATED_LAST_CHECK_MS;

    // Rising edge to TRAFFIC_READY
    ps.metadataPublicationReadinessState = readinessStateFor(READY_SNAPSHOT);
    ps.maybeInitializeRebalancer({readinessTransitionOnly: true});

    t.equal(rebalancer.currentInterval, 60000, 'currentInterval reset to 60000');
    t.equal(rebalancer.lastCheckAtMs, 0, 'lastCheckAtMs reset to 0');
    t.equal(rebalancer.enqueued.length, 1, 'enqueueRebalanceCheck enqueued 1 wake');
    t.equal(rebalancer.enqueued[0], RECONCILE_REASON.PERIODIC_CHECK, 'canonical periodic_check');

    // Redundant transition without edge
    rebalancer.lastCheckAtMs = REDUNDANT_CHECK_TIMESTAMP_MS;
    ps.maybeInitializeRebalancer({readinessTransitionOnly: true});

    t.equal(rebalancer.lastCheckAtMs, REDUNDANT_CHECK_TIMESTAMP_MS, 'lastCheckAtMs retained');
    t.equal(rebalancer.enqueued.length, 1, 'no duplicate wake enqueued');

    await ps.shutdown();
  });

// ── MessageGroupService Tests ───────────────────────────────────────

test('MessageGroupService: TRAFFIC_READY rising edge resets backoff and enqueues rebalance check',
  async (t) => {
    const mg = new MessageGroupService(withTestDbPath({
      groupId: 'test-mg-traffic-ready-wake',
      replicaId: 'test-mg-traffic-ready-wake-r1',
      nodeId: NODE_ID,
      transport: createMockTransport(),
    }));
    mg.isLeaderReplica = () => true;
    mg.metadataPublicationReadinessState = readinessStateFor(READY_SNAPSHOT);

    const rebalancer = createStubRebalancer({isLeader: true, periodicCheckIntervalMs: 60000});
    mg.rebalancer = rebalancer;
    mg.maybeInitializeRebalancer();

    // Dip into DEGRADED [PRIORITY_CONTROL_PLANE_RECOVERY_PENDING]
    mg.metadataPublicationReadinessState = readinessStateFor(RECOVERY_DIP_SNAPSHOT);
    mg.handleMetadataPublicationReadinessTransition();

    // Simulate rebalancer backing off during recovery
    rebalancer.currentInterval = BACKOFF_INTERVAL_MS;
    rebalancer.lastCheckAtMs = SIMULATED_LAST_CHECK_MS;

    // Transition back to TRAFFIC_READY (rising edge)
    mg.metadataPublicationReadinessState = readinessStateFor(READY_SNAPSHOT);
    mg.handleMetadataPublicationReadinessTransition();

    t.equal(
      rebalancer.currentInterval,
      60000,
      'MessageGroupService currentInterval reset to periodicCheckIntervalMs on rising edge',
    );
    t.equal(rebalancer.lastCheckAtMs, 0, 'MessageGroupService lastCheckAtMs cleared to 0');
    t.equal(rebalancer.enqueued.length, 1, 'MessageGroupService enqueueRebalanceCheck called once');
    t.equal(
      rebalancer.enqueued[0],
      RECONCILE_REASON.PERIODIC_CHECK,
      'MessageGroupService enqueueRebalanceCheck called with RECONCILE_REASON.PERIODIC_CHECK',
    );

    // Repeated TRAFFIC_READY -> TRAFFIC_READY transition (no rising edge)
    rebalancer.lastCheckAtMs = REDUNDANT_CHECK_TIMESTAMP_MS;
    mg.handleMetadataPublicationReadinessTransition();

    t.equal(
      rebalancer.lastCheckAtMs,
      REDUNDANT_CHECK_TIMESTAMP_MS,
      'MessageGroupService lastCheckAtMs NOT reset on redundant TRAFFIC_READY transition',
    );
    t.equal(
      rebalancer.enqueued.length,
      1,
      'MessageGroupService no duplicate enqueueRebalanceCheck on redundant transition',
    );

    await mg.shutdown();
  });

test('Non-leader guard: no wake when rebalancer isLeader is false',
  async (t) => {
    const ps = createPartitionService();
    ps.isLeader = false;
    ps.metadataPublicationReadinessState = readinessStateFor(READY_SNAPSHOT);

    const psRebalancer = createStubRebalancer({isLeader: false, periodicCheckIntervalMs: 60000});
    ps.rebalancer = psRebalancer;
    ps.maybeInitializeRebalancer();

    ps.metadataPublicationReadinessState = readinessStateFor(RECOVERY_DIP_SNAPSHOT);
    ps.handleMetadataPublicationReadinessTransition();
    psRebalancer.currentInterval = BACKOFF_INTERVAL_MS;
    psRebalancer.lastCheckAtMs = SIMULATED_LAST_CHECK_MS;

    ps.metadataPublicationReadinessState = readinessStateFor(READY_SNAPSHOT);
    ps.handleMetadataPublicationReadinessTransition();

    t.equal(
      psRebalancer.currentInterval,
      BACKOFF_INTERVAL_MS,
      'PartitionService non-leader interval preserved',
    );
    t.equal(
      psRebalancer.lastCheckAtMs,
      SIMULATED_LAST_CHECK_MS,
      'PartitionService non-leader timestamp preserved',
    );
    t.equal(psRebalancer.enqueued.length, 0, 'PartitionService non-leader wake not enqueued');

    const mg = new MessageGroupService(withTestDbPath({
      groupId: 'test-mg-non-leader-wake',
      replicaId: 'test-mg-non-leader-wake-r1',
      nodeId: NODE_ID,
      transport: createMockTransport(),
    }));
    mg.isLeaderReplica = () => false;
    mg.metadataPublicationReadinessState = readinessStateFor(READY_SNAPSHOT);

    const mgRebalancer = createStubRebalancer({isLeader: false, periodicCheckIntervalMs: 60000});
    mg.rebalancer = mgRebalancer;
    mg.maybeInitializeRebalancer();

    mg.metadataPublicationReadinessState = readinessStateFor(RECOVERY_DIP_SNAPSHOT);
    mg.handleMetadataPublicationReadinessTransition();
    mgRebalancer.currentInterval = BACKOFF_INTERVAL_MS;
    mgRebalancer.lastCheckAtMs = SIMULATED_LAST_CHECK_MS;

    mg.metadataPublicationReadinessState = readinessStateFor(READY_SNAPSHOT);
    mg.handleMetadataPublicationReadinessTransition();

    t.equal(
      mgRebalancer.currentInterval,
      BACKOFF_INTERVAL_MS,
      'MessageGroupService non-leader interval preserved',
    );
    t.equal(
      mgRebalancer.lastCheckAtMs,
      SIMULATED_LAST_CHECK_MS,
      'MessageGroupService non-leader timestamp preserved',
    );
    t.equal(mgRebalancer.enqueued.length, 0, 'MessageGroupService non-leader wake not enqueued');

    await ps.shutdown();
    await mg.shutdown();
  });
