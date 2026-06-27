/**
 * Falsifier: rebalancer-leadership readiness EDGE-GATE (no-edge fan-out skip).
 *
 * Companion to partition-rebalancer-leadership-readiness-hysteresis.test.js.
 *
 * The hysteresis fix (resolveRebalancerLeadership) made the leadership OUTCOME
 * stable across a transient readiness dip. But `maybeInitializeRebalancer`
 * still, on EVERY shared-readiness transition, unconditionally re-ran
 * `buildRebalancerDependencyBundle()` + `applyRebalancerDependencies()` for an
 * already-active rebalancer. The metadata-publication readiness state is a
 * single node-wide object that ~35 partitions listen to; one oscillation
 * (PRIORITY_CONTROL_PLANE_RECOVERY_PENDING toggling) synchronously invokes that
 * re-apply across every partition in one tick — a multi-second event-loop
 * freeze (eventLoopUtilization 1.0) that starves the very readiness probes and
 * sustains the limit cycle.
 *
 * The edge-gate: when the rebalancer already exists AND the resolved leadership
 * is UNCHANGED from the rebalancer's current state (no leadership edge), SKIP
 * the redundant rebuild+reapply. Only an actual edge (false->true / true->false)
 * or first init does the full dependency re-wiring.
 *
 * RED before the fix: the unchanged-leadership readiness oscillation re-invokes
 * buildRebalancerDependencyBundle / applyRebalancerDependencies on every blip.
 * GREEN after: zero re-invocations on a no-edge transition; an ACTUAL leadership
 * edge still re-applies; the leadership OUTCOME is byte-identical on edges.
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

/**
 * Install counting spies on the redundant re-apply path.
 * @param {PartitionService} ps - The partition service.
 * @return {{counts: {build: number, apply: number}, reset: Function}}
 */
function spyOnReapply(ps) {
  const counts = {build: 0, apply: 0};
  const realBuild = ps.buildRebalancerDependencyBundle.bind(ps);
  const realApply = ps.applyRebalancerDependencies.bind(ps);
  ps.buildRebalancerDependencyBundle = (...args) => {
    counts.build += 1;
    return realBuild(...args);
  };
  ps.applyRebalancerDependencies = (...args) => {
    counts.apply += 1;
    return realApply(...args);
  };
  return {counts, reset: () => {
    counts.build = 0;
    counts.apply = 0;
  }};
}

async function shutdownPartitionService(ps) {
  if (ps.rebalancer) {
    ps.rebalancer.shutdown();
  }
  await ps.shutdown();
}

// ── Core falsifier: no-edge oscillation does ZERO re-apply work ─────

test('edge-gate — an unchanged-leadership readiness oscillation does NOT ' +
  're-run buildRebalancerDependencyBundle / applyRebalancerDependencies',
async (t) => {
  const ps = createActiveLeaderPartition();
  t.ok(ps.rebalancer, 'rebalancer created');
  t.equal(ps.rebalancer.isLeader, true, 'acquired leadership while ready');

  const {counts, reset} = spyOnReapply(ps);
  reset();

  // 5 full ready->dip->ready oscillations of the shared readiness state.
  // The leadership OUTCOME never changes (hysteresis retains it), so every
  // one of these transitions is a NO-EDGE transition.
  for (let i = 0; i < 5; i += 1) {
    ps.metadataPublicationReadinessState =
      readinessStateFor(RECOVERY_DIP_SNAPSHOT);
    ps.handleMetadataPublicationReadinessTransition();
    ps.metadataPublicationReadinessState = readinessStateFor(READY_SNAPSHOT);
    ps.handleMetadataPublicationReadinessTransition();
  }

  t.equal(counts.build, 0,
    'buildRebalancerDependencyBundle NOT re-invoked across 10 no-edge ' +
    'transitions (was 10 before the edge-gate — the freeze source)');
  t.equal(counts.apply, 0,
    'applyRebalancerDependencies NOT re-invoked across 10 no-edge transitions');
  t.equal(ps.rebalancer.isLeader, true,
    'leadership OUTCOME unchanged by the optimization (still leader)');

  await shutdownPartitionService(ps);
});

// ── An ACTUAL leadership edge MUST still re-apply ──────────────────

test('edge-gate — an actual leadership EDGE still re-applies dependencies ' +
  'and flips the rebalancer outcome', async (t) => {
  const ps = createActiveLeaderPartition();
  t.equal(ps.rebalancer.isLeader, true, 'acquired leadership while ready');

  const {counts, reset} = spyOnReapply(ps);
  reset();

  // Raft-leadership loss is a true demotion edge (true -> false).
  ps.isLeader = false;
  ps.handleMetadataPublicationReadinessTransition();
  t.equal(ps.rebalancer.isLeader, false, 'demoted on the raft-loss edge');
  t.ok(counts.apply >= 1,
    'applyRebalancerDependencies DID run on the demotion edge');
  t.ok(counts.build >= 1,
    'buildRebalancerDependencyBundle DID run on the demotion edge');

  // Re-acquire raft leadership while ready: a true promotion edge (false->true).
  reset();
  ps.isLeader = true;
  ps.metadataPublicationReadinessState = readinessStateFor(READY_SNAPSHOT);
  ps.handleMetadataPublicationReadinessTransition();
  t.equal(ps.rebalancer.isLeader, true, 're-acquired on the promotion edge');
  t.ok(counts.apply >= 1,
    'applyRebalancerDependencies DID run on the promotion edge');

  await shutdownPartitionService(ps);
});

// ── Outcome parity: edges behave byte-identically to pre-optimization ──

test('edge-gate — leadership outcomes are unchanged: dip retains, drain ' +
  'demotes, raft-loss demotes', async (t) => {
  const ps = createActiveLeaderPartition();
  t.equal(ps.rebalancer.isLeader, true, 'leader while ready');

  // No-edge dip: retained.
  ps.metadataPublicationReadinessState =
    readinessStateFor(RECOVERY_DIP_SNAPSHOT);
  ps.handleMetadataPublicationReadinessTransition();
  t.equal(ps.rebalancer.isLeader, true, 'retained across transient dip');

  // Draining: demotes (terminal edge).
  ps.metadataPublicationReadinessState = readinessStateFor({
    ready: false,
    phase: LIFECYCLE_PHASE.DEGRADED,
    draining: true,
    reasons: ['draining'],
  });
  ps.handleMetadataPublicationReadinessTransition();
  t.equal(ps.rebalancer.isLeader, false, 'draining demotes (terminal)');

  await shutdownPartitionService(ps);
});
