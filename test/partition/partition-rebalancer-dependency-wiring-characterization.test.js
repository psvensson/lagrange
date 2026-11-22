/**
 * Characterization tests: Partition/rebalancer dependency wiring.
 *
 * These tests lock the current initialization gates, coordinator
 * rebinding behavior, and dependency wiring patterns in
 * PartitionService → UnifiedRebalancer before the dependency
 * refactor (Phase 5, Tasks 23–24).
 *
 * Covered paths:
 * - PartitionService.setRebalanceCoordinator / rebindCoordinator (rebinding)
 * - PartitionService leadership sink (leader/background gate)
 * - UnifiedRebalancer.setRebalanceCoordinator (canonical setter path)
 * - UnifiedRebalancer.syncOwnerDependenciesFromCoordinator (dep sync)
 * - PartitionService.buildRebalancerDependencyBundle (coordinator sync)
 *
 * The partition's own UnifiedRebalancer construction (initialization gates,
 * initializeRebalancer, applyRebalancerDependencies, its leader gate) was
 * retired with the per-partition scheduler (placement stage 3b); its cases
 * were deleted with it (placement record section 33).
 *
 * Validates: Requirements 7.1, 7.3, 7.4, 9.2
 * Design: D8.1, D8.3, D11.1
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  REBALANCER_ERROR_MSG,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  LIFECYCLE_PHASE,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {
  createMockCache,
  createMockCdcService,
  createMockPolicyService,
  createMockMessageRouter,
  createMockControlPlaneReadinessService,
} from '../rebalancer/test-helpers.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {withNodeReadinessService} from '../helpers/readiness-service-fixture.js';
import {createReadinessHoldingCoordinator} from './readiness-holding-coordinator-fixture.js';

// ── Suite-local fixture constants ──────────────────────────────────

const PARTITION_ID = 'test-partition-1';
const TABLE_ID = 'test-table-1';
const REPLICA_ID = 'test-replica-1';
const NODE_ID = 'test-node-1';
const ENTITY_TYPE_PARTITION = 'partition';

// ── Shared helpers ─────────────────────────────────────────────────

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

/**
 * Create a minimal PartitionService with configurable dependencies.
 * @param {Object} overrides - Dependency overrides.
 * @return {PartitionService} Partition service instance.
 */
function createPartitionService(overrides = {}) {
  return new PartitionService(withFoundingStamp({
    partitionId: PARTITION_ID,
    tableId: TABLE_ID,
    replicaId: REPLICA_ID,
    nodeId: NODE_ID,
    dbPath: ':memory:',
    deferElection: true,
    suppressLifecycleLogs: true,
    ...overrides,
  }));
}

/**
 * Create a mock SQL query engine.
 * @return {Object} Mock SQL engine.
 */
function createMockSqlEngine() {
  return {
    executeQuery: async () => ({success: true, rows: []}),
  };
}

/**
 * Create a mock readiness state that reports background-work-ready.
 * Uses LIFECYCLE_PHASE constants for phase values.
 * @param {boolean} ready - Whether background work is ready.
 * @return {Object} Mock readiness state.
 */
function createMockReadinessState(ready) {
  const snapshot = ready ? {
    ready: true,
    phase: LIFECYCLE_PHASE.TRAFFIC_READY,
    draining: false,
    reasons: [],
  } : {
    ready: false,
    phase: LIFECYCLE_PHASE.BOOTSTRAPPING,
    draining: false,
    reasons: ['not_ready'],
  };
  return {
    evaluate: () => snapshot,
    getSnapshot: () => snapshot,
    on: () => {},
    off: () => {},
  };
}

/**
 * Wire all required dependencies onto a PartitionService so that
 * maybeInitializeRebalancer can fire. Sets isLeader=true before
 * the final setter call so the gate check succeeds.
 * @param {PartitionService} ps - Partition service.
 * @param {Object} overrides - Dependency overrides.
 */
function wireAllDependencies(ps, overrides = {}) {
  const cache = overrides.systemTableCache || createMockCache();
  const cdc = overrides.cdcIntegrationService || createMockCdcService();
  const policy = overrides.tablePolicyService || createMockPolicyService();
  const router = overrides.messageRouter || createMockMessageRouter();
  const sql = overrides.sqlQueryEngine || createMockSqlEngine();
  const coordinator = overrides.rebalanceCoordinator ||
    createReadinessHoldingCoordinator();

  ps.metadataPublicationReadinessState =
    overrides.readinessState || createMockReadinessState(true);
  ps.messageRouter = router;
  ps.isLeader = true;
  ps.setSystemTableCache(cache);
  ps.setCdcIntegrationService(cdc);
  ps.setTablePolicyService(policy);
  ps.setSqlQueryEngine(sql);
  // setRebalanceCoordinator is last — it triggers maybeInitializeRebalancer
  // which should now find all gates satisfied.
  ps.setRebalanceCoordinator(coordinator);
}

/**
 * Shut down a PartitionService, clearing timers.
 * @param {PartitionService} ps - Partition service.
 */
async function shutdownPartitionService(ps) {
  await ps.shutdown();
}

// ── 2. Coordinator rebinding via setRebalanceCoordinator ───────────
//
// Lock the behavior that PartitionService.setRebalanceCoordinator
// routes through the rebalancer's setRebalanceCoordinator method
// (the canonical setter path per system guidelines §1.5.1).

test('coordinator rebinding — null coordinator is rejected ' +
  'by setRebalanceCoordinator', async (t) => {
  const ps = createPartitionService();
  const originalCoordinator = createReadinessHoldingCoordinator();
  wireAllDependencies(ps, {rebalanceCoordinator: originalCoordinator});

  ps.setRebalanceCoordinator(null);

  t.equal(ps.rebalanceCoordinator, originalCoordinator,
    'null coordinator does not replace existing coordinator');
  await shutdownPartitionService(ps);
});

test('coordinator rebinding — previous owned coordinator is ' +
  'shut down on replacement', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);

  // Simulate owning the coordinator
  ps.ownsRebalanceCoordinator = true;
  const previousCoordinator = ps.rebalanceCoordinator;
  let shutdownCalled = false;
  previousCoordinator.shutdown = async () => {
    shutdownCalled = true;
  };

  const newCoordinator = createReadinessHoldingCoordinator();
  ps.setRebalanceCoordinator(newCoordinator);

  // Allow async shutdown to complete
  await new Promise((resolve) => resolve());

  t.equal(shutdownCalled, true,
    'previous owned coordinator is shut down');
  t.equal(ps.ownsRebalanceCoordinator, false,
    'ownership flag cleared after external coordinator set');
  await shutdownPartitionService(ps);
});

test('coordinator rebinding — non-owned previous coordinator is ' +
  'not shut down', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);

  ps.ownsRebalanceCoordinator = false;
  const previousCoordinator = ps.rebalanceCoordinator;
  let shutdownCalled = false;
  previousCoordinator.shutdown = async () => {
    shutdownCalled = true;
  };

  const newCoordinator = createReadinessHoldingCoordinator();
  ps.setRebalanceCoordinator(newCoordinator);

  await new Promise((resolve) => resolve());

  t.equal(shutdownCalled, false,
    'non-owned previous coordinator is not shut down');
  await shutdownPartitionService(ps);
});

// ── 3. Dependency sync from coordinator ────────────────────────────
//
// Lock the behavior that UnifiedRebalancer.setRebalanceCoordinator
// calls syncOwnerDependenciesFromCoordinator to propagate
// sub-dependencies from the coordinator.

test('dependency sync — setRebalanceCoordinator propagates ' +
  'storage services from coordinator', async (t) => {
  const cache = createMockCache();
  const router = createMockMessageRouter();
  const readinessService = createMockControlPlaneReadinessService({
    systemTableCache: cache,
  });
  const coordinator = createReadinessHoldingCoordinator();

  const customAdmission = {
    checkAdd: async () => ({allowed: true}),
    checkReplace: async () => ({allowed: true}),
    checkSplit: async () => ({allowed: true}),
  };
  const customAccounting = {estimateReplicaBytes: () => 42};
  coordinator.storageAdmissionService = customAdmission;
  coordinator.storageAccountingService = customAccounting;

  const rebalancer = new UnifiedRebalancer({
    entityId: PARTITION_ID,
    entityType: ENTITY_TYPE_PARTITION,
    nodeId: NODE_ID,
    systemTableCache: cache,
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: createMockPolicyService(),
    messageRouter: router,
    rebalanceCoordinator: createReadinessHoldingCoordinator(),
    controlPlaneReadinessService: readinessService,
  });

  rebalancer.setRebalanceCoordinator(coordinator);

  t.equal(rebalancer.storageAdmissionService, customAdmission,
    'storageAdmissionService synced from coordinator');
  t.equal(rebalancer.storageAccountingService, customAccounting,
    'storageAccountingService synced from coordinator');
  rebalancer.shutdown();
});

test('dependency sync — setRebalanceCoordinator propagates ' +
  'controlPlaneReadinessService from coordinator', async (t) => {
  const cache = createMockCache();
  const router = createMockMessageRouter();
  const initialReadiness = createMockControlPlaneReadinessService({
    systemTableCache: cache,
  });
  const coordinator = createReadinessHoldingCoordinator();

  const customReadiness = createMockControlPlaneReadinessService({
    systemTableCache: cache,
    defaultRepairEligible: false,
  });
  coordinator.controlPlaneReadinessService = customReadiness;

  const rebalancer = new UnifiedRebalancer({
    entityId: PARTITION_ID,
    entityType: ENTITY_TYPE_PARTITION,
    nodeId: NODE_ID,
    systemTableCache: cache,
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: createMockPolicyService(),
    messageRouter: router,
    rebalanceCoordinator: createReadinessHoldingCoordinator(),
    controlPlaneReadinessService: initialReadiness,
  });

  rebalancer.setRebalanceCoordinator(coordinator);

  t.equal(rebalancer.controlPlaneReadinessService, customReadiness,
    'controlPlaneReadinessService synced from coordinator');
  rebalancer.shutdown();
});

test('dependency sync — syncOwnerDependenciesFromCoordinator ' +
  'updates movePlanner sub-dependencies', async (t) => {
  const cache = createMockCache();
  const router = createMockMessageRouter();
  const readinessService = createMockControlPlaneReadinessService({
    systemTableCache: cache,
  });
  const coordinator = createReadinessHoldingCoordinator();

  const customAdmission = {
    checkAdd: async () => ({allowed: true}),
    checkReplace: async () => ({allowed: true}),
    checkSplit: async () => ({allowed: true}),
  };
  const customAccounting = {estimateReplicaBytes: () => 99};
  coordinator.storageAdmissionService = customAdmission;
  coordinator.storageAccountingService = customAccounting;

  const rebalancer = new UnifiedRebalancer({
    entityId: PARTITION_ID,
    entityType: ENTITY_TYPE_PARTITION,
    nodeId: NODE_ID,
    systemTableCache: cache,
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: createMockPolicyService(),
    messageRouter: router,
    rebalanceCoordinator: createReadinessHoldingCoordinator(),
    controlPlaneReadinessService: readinessService,
  });

  rebalancer.setRebalanceCoordinator(coordinator);

  t.equal(rebalancer.movePlanner.storageAdmissionService,
    customAdmission,
    'movePlanner storageAdmissionService synced from coordinator');
  t.equal(rebalancer.movePlanner.accountingService, customAccounting,
    'movePlanner accountingService synced from coordinator');
  rebalancer.shutdown();
});

test('dependency sync — null coordinator does not clear ' +
  'existing dependencies', async (t) => {
  const cache = createMockCache();
  const router = createMockMessageRouter();
  const readinessService = createMockControlPlaneReadinessService({
    systemTableCache: cache,
  });
  const coordinator = createReadinessHoldingCoordinator();

  const rebalancer = new UnifiedRebalancer({
    entityId: PARTITION_ID,
    entityType: ENTITY_TYPE_PARTITION,
    nodeId: NODE_ID,
    systemTableCache: cache,
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: createMockPolicyService(),
    messageRouter: router,
    rebalanceCoordinator: coordinator,
    controlPlaneReadinessService: readinessService,
  });

  const originalAdmission = rebalancer.storageAdmissionService;

  // syncOwnerDependenciesFromCoordinator with null is a no-op
  rebalancer.syncOwnerDependenciesFromCoordinator(null);

  t.equal(rebalancer.storageAdmissionService, originalAdmission,
    'null coordinator does not clear storageAdmissionService');
  rebalancer.shutdown();
});

// ── 4b. secondary rebalancer-leadership sink ───────────────────────
//
// Lock the behavior that an attached leadership sink (used to gate the
// RUNTIME_SERVICE rebalancer owner on service_definitions-p1 leadership) is
// driven in lockstep with the partition's own rebalancer leadership.

function createFakeSink() {
  return {
    leaderCalls: [],
    setLeader(value) {
      this.leaderCalls.push(value);
    },
  };
}

test('leadership sink — driven true when leader and background ready',
  async (t) => {
    const ps = createPartitionService();
    wireAllDependencies(ps);
    const sink = createFakeSink();
    ps.setRebalancerLeadershipSink(sink); // drives once on attach
    ps.updateRebalancerLeadership();
    t.ok(
      sink.leaderCalls.length >= 1 &&
        sink.leaderCalls[sink.leaderCalls.length - 1] === true,
      'sink last driven true when partition is leader+ready',
    );
    await shutdownPartitionService(ps);
  });

test('leadership sink — driven false when partition not leader',
  async (t) => {
    const ps = createPartitionService();
    wireAllDependencies(ps);
    const sink = createFakeSink();
    ps.setRebalancerLeadershipSink(sink);
    ps.isLeader = false;
    ps.updateRebalancerLeadership();
    t.equal(
      sink.leaderCalls[sink.leaderCalls.length - 1], false,
      'sink driven false when partition loses leadership',
    );
    await shutdownPartitionService(ps);
  });

test('leadership sink — quiesced (false) on partition shutdown',
  async (t) => {
    const ps = createPartitionService();
    wireAllDependencies(ps);
    const sink = createFakeSink();
    ps.setRebalancerLeadershipSink(sink);
    await shutdownPartitionService(ps); // shutdown() -> quiesceRebalancing()
    t.equal(
      sink.leaderCalls[sink.leaderCalls.length - 1], false,
      'sink driven false when the partition shuts down',
    );
  });

test('leadership sink — detached sink is no longer driven', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);
  const sink = createFakeSink();
  ps.setRebalancerLeadershipSink(sink);
  ps.setRebalancerLeadershipSink(null);
  const callsAfterDetach = sink.leaderCalls.length;
  ps.updateRebalancerLeadership();
  t.equal(
    sink.leaderCalls.length, callsAfterDetach,
    'no further sink driving after detach',
  );
  await shutdownPartitionService(ps);
});

// ── 6. UnifiedRebalancer constructor dependency assertions ─────────
//
// Lock the behavior that UnifiedRebalancer constructor requires
// specific dependencies and throws when they are missing.

test('constructor gate — UnifiedRebalancer throws when ' +
  'entityId is missing', async (t) => {
  t.throws(() => new UnifiedRebalancer(withNodeReadinessService('UnifiedRebalancer', {
    entityType: ENTITY_TYPE_PARTITION,
    nodeId: NODE_ID,
    systemTableCache: createMockCache(),
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator: createReadinessHoldingCoordinator(),
  })), {message: REBALANCER_ERROR_MSG.ENTITY_ID_REQUIRED},
  'throws when entityId missing');
});

test('constructor gate — UnifiedRebalancer throws when ' +
  'systemTableCache is missing', async (t) => {
  t.throws(() => new UnifiedRebalancer(withNodeReadinessService('UnifiedRebalancer', {
    entityId: PARTITION_ID,
    entityType: ENTITY_TYPE_PARTITION,
    nodeId: NODE_ID,
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator: createReadinessHoldingCoordinator(),
  })), {message: REBALANCER_ERROR_MSG.CACHE_REQUIRED},
  'throws when systemTableCache missing');
});

test('constructor gate — UnifiedRebalancer throws when ' +
  'rebalanceCoordinator is missing', async (t) => {
  t.throws(() => new UnifiedRebalancer(withNodeReadinessService('UnifiedRebalancer', {
    entityId: PARTITION_ID,
    entityType: ENTITY_TYPE_PARTITION,
    nodeId: NODE_ID,
    systemTableCache: createMockCache(),
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
  })), {message: REBALANCER_ERROR_MSG.COORDINATOR_REQUIRED},
  'throws when rebalanceCoordinator missing');
});

// ── 8. Dependency bundle wiring ────────────────────────────────────
//
// Verify that buildRebalancerDependencyBundle produces a complete
// bundle and that applyRebalancerDependencies is the single path
// for updating rebalancer owner dependencies after construction.
// Validates: Requirements 7.1, 7.4
// Design: D8.1, D8.2

test('dependency bundle — buildRebalancerDependencyBundle returns ' +
  'null when any required dependency is missing', async (t) => {
  const ps = createPartitionService();
  ps.metadataPublicationReadinessState = createMockReadinessState(true);
  ps.messageRouter = createMockMessageRouter();
  ps.isLeader = true;
  ps.setSystemTableCache(createMockCache());
  ps.setCdcIntegrationService(createMockCdcService());
  ps.setTablePolicyService(createMockPolicyService());
  ps.setSqlQueryEngine(createMockSqlEngine());
  // rebalanceCoordinator not set

  const bundle = ps.buildRebalancerDependencyBundle();
  t.equal(bundle, null,
    'bundle is null when rebalanceCoordinator is missing');
  await shutdownPartitionService(ps);
});

test('dependency bundle — buildRebalancerDependencyBundle returns ' +
  'complete bundle when all dependencies present', async (t) => {
  const cache = createMockCache();
  const cdc = createMockCdcService();
  const policy = createMockPolicyService();
  const router = createMockMessageRouter();
  const sql = createMockSqlEngine();
  const coordinator = createReadinessHoldingCoordinator();

  const ps = createPartitionService();
  ps.metadataPublicationReadinessState = createMockReadinessState(true);
  ps.messageRouter = router;
  ps.isLeader = true;
  ps.setSystemTableCache(cache);
  ps.setCdcIntegrationService(cdc);
  ps.setTablePolicyService(policy);
  ps.setSqlQueryEngine(sql);
  ps.rebalanceCoordinator = coordinator;

  const bundle = ps.buildRebalancerDependencyBundle();
  t.ok(bundle, 'bundle is not null');
  t.equal(bundle.systemTableCache, cache,
    'bundle contains systemTableCache');
  t.equal(bundle.cdcIntegrationService, cdc,
    'bundle contains cdcIntegrationService');
  t.equal(bundle.tablePolicyService, policy,
    'bundle contains tablePolicyService');
  t.equal(bundle.messageRouter, router,
    'bundle contains messageRouter');
  t.equal(bundle.sqlQueryEngine, sql,
    'bundle contains sqlQueryEngine');
  t.equal(bundle.rebalanceCoordinator, coordinator,
    'bundle contains rebalanceCoordinator');
  await shutdownPartitionService(ps);
});

test('dependency bundle — setSqlQueryEngine syncs coordinator before ' +
  'rebalancer exists', async (t) => {
  const cache = createMockCache();
  const cdc = createMockCdcService();
  const policy = createMockPolicyService();
  const router = createMockMessageRouter();
  const sql = createMockSqlEngine();
  const coordinator = createReadinessHoldingCoordinator();

  const ps = createPartitionService();
  ps.metadataPublicationReadinessState = createMockReadinessState(true);
  ps.messageRouter = router;
  ps.isLeader = false;
  ps.setSystemTableCache(cache);
  ps.setCdcIntegrationService(cdc);
  ps.setTablePolicyService(policy);
  ps.setRebalanceCoordinator(coordinator);

  ps.setSqlQueryEngine(sql);

  t.equal(coordinator.systemTableCache, cache,
    'coordinator cache synced from complete bundle');
  t.equal(coordinator.cdcIntegrationService, cdc,
    'coordinator cdcIntegrationService synced from complete bundle');
  t.equal(coordinator.tablePolicyService, policy,
    'coordinator tablePolicyService synced from complete bundle');
  t.equal(coordinator.messageRouter, router,
    'coordinator messageRouter synced from complete bundle');
  t.equal(coordinator.sqlQueryEngine, sql,
    'coordinator sqlQueryEngine synced from complete bundle');
  await shutdownPartitionService(ps);
});

// ── 9. Centralized coordinator rebind path ─────────────────────────
//
// Verify that rebindCoordinator is the single canonical API for
// coordinator replacement, that it emits diagnostic logging, and
// that setRebalanceCoordinator delegates to it.
// Validates: Requirements 7.2, 7.3
// Design: D8.2, D8.3

test('rebind path — rebindCoordinator updates PartitionService ' +
  'coordinator reference', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);

  const newCoordinator = createReadinessHoldingCoordinator();
  ps.rebindCoordinator(newCoordinator);

  t.equal(ps.rebalanceCoordinator, newCoordinator,
    'PartitionService coordinator reference updated via rebind');
  await shutdownPartitionService(ps);
});

test('rebind path — setRebalanceCoordinator delegates to ' +
  'rebindCoordinator (single canonical path)', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);

  let rebindCalled = false;
  const originalRebind = ps.rebindCoordinator.bind(ps);
  ps.rebindCoordinator = (coord) => {
    rebindCalled = true;
    originalRebind(coord);
  };

  const newCoordinator = createReadinessHoldingCoordinator();
  ps.setRebalanceCoordinator(newCoordinator);

  t.equal(rebindCalled, true,
    'setRebalanceCoordinator delegates to rebindCoordinator');
  t.equal(ps.rebalanceCoordinator, newCoordinator,
    'coordinator updated through delegation');
  await shutdownPartitionService(ps);
});

test('rebind path — rebindCoordinator emits diagnostic log ' +
  'with rebind context', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);

  const logCalls = [];
  const originalInfo = ps.logger.info.bind(ps.logger);
  ps.logger.info = (msg, meta) => {
    logCalls.push({msg, meta});
    originalInfo(msg, meta);
  };

  const newCoordinator = createReadinessHoldingCoordinator();
  ps.rebindCoordinator(newCoordinator);

  const rebindLog = logCalls.find(
    (c) => c.msg === 'Coordinator rebound via canonical rebind path',
  );
  t.ok(rebindLog, 'diagnostic log emitted for coordinator rebind');
  t.equal(rebindLog.meta.partitionId, PARTITION_ID,
    'diagnostic log includes partitionId');
  t.equal(rebindLog.meta.hadPrevious, true,
    'diagnostic log indicates previous coordinator existed');
  t.equal(rebindLog.meta.isReplacement, true,
    'diagnostic log indicates coordinator was replaced');
  await shutdownPartitionService(ps);
});

test('rebind path — rebindCoordinator diagnostic log reflects ' +
  'first-time binding (no previous)', async (t) => {
  const ps = createPartitionService();
  // Do not wire — no coordinator set yet
  ps.metadataPublicationReadinessState =
    createMockReadinessState(true);
  ps.messageRouter = createMockMessageRouter();
  ps.isLeader = true;
  ps.setSystemTableCache(createMockCache());
  ps.setCdcIntegrationService(createMockCdcService());
  ps.setTablePolicyService(createMockPolicyService());
  ps.setSqlQueryEngine(createMockSqlEngine());

  const logCalls = [];
  const originalInfo = ps.logger.info.bind(ps.logger);
  ps.logger.info = (msg, meta) => {
    logCalls.push({msg, meta});
    originalInfo(msg, meta);
  };

  const coordinator = createReadinessHoldingCoordinator();
  ps.rebindCoordinator(coordinator);

  const rebindLog = logCalls.find(
    (c) => c.msg === 'Coordinator rebound via canonical rebind path',
  );
  t.ok(rebindLog, 'diagnostic log emitted for first-time bind');
  t.equal(rebindLog.meta.hadPrevious, false,
    'diagnostic log indicates no previous coordinator');
  t.equal(rebindLog.meta.isReplacement, false,
    'diagnostic log indicates not a replacement');
  await shutdownPartitionService(ps);
});

test('rebind path — rebindCoordinator shuts down previous ' +
  'owned coordinator', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);

  ps.ownsRebalanceCoordinator = true;
  const previousCoordinator = ps.rebalanceCoordinator;
  let shutdownCalled = false;
  previousCoordinator.shutdown = async () => {
    shutdownCalled = true;
  };

  const newCoordinator = createReadinessHoldingCoordinator();
  ps.rebindCoordinator(newCoordinator);

  await new Promise((resolve) => resolve());

  t.equal(shutdownCalled, true,
    'previous owned coordinator shut down via rebind');
  t.equal(ps.ownsRebalanceCoordinator, false,
    'ownership flag cleared after rebind');
  await shutdownPartitionService(ps);
});

test('rebind path — rebindCoordinator does not shut down ' +
  'non-owned previous coordinator', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);

  ps.ownsRebalanceCoordinator = false;
  const previousCoordinator = ps.rebalanceCoordinator;
  let shutdownCalled = false;
  previousCoordinator.shutdown = async () => {
    shutdownCalled = true;
  };

  const newCoordinator = createReadinessHoldingCoordinator();
  ps.rebindCoordinator(newCoordinator);

  await new Promise((resolve) => resolve());

  t.equal(shutdownCalled, false,
    'non-owned previous coordinator not shut down');
  await shutdownPartitionService(ps);
});
