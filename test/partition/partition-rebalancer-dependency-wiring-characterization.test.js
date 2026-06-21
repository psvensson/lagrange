/**
 * Characterization tests: Partition/rebalancer dependency wiring.
 *
 * These tests lock the current initialization gates, coordinator
 * rebinding behavior, and dependency wiring patterns in
 * PartitionService → UnifiedRebalancer before the dependency
 * refactor (Phase 5, Tasks 23–24).
 *
 * Covered paths:
 * - PartitionService.maybeInitializeRebalancer (initialization gates)
 * - PartitionService.initializeRebalancer (dependency assertions)
 * - PartitionService.setRebalanceCoordinator (coordinator rebinding)
 * - PartitionService.updateRebalancerLeadership (leader/background gate)
 * - UnifiedRebalancer.setRebalanceCoordinator (canonical setter path)
 * - UnifiedRebalancer.syncOwnerDependenciesFromCoordinator (dep sync)
 * - isBackgroundWorkReady gate on rebalancer initialization
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
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
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
  createMockCoordinator,
  createMockControlPlaneReadinessService,
  createTestCoordinator,
} from '../rebalancer/test-helpers.js';

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
  return new PartitionService({
    partitionId: PARTITION_ID,
    tableId: TABLE_ID,
    replicaId: REPLICA_ID,
    nodeId: NODE_ID,
    dbPath: ':memory:',
    deferElection: true,
    suppressLifecycleLogs: true,
    ...overrides,
  });
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
    createMockCoordinator();

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
 * Shut down a PartitionService and its rebalancer, clearing timers.
 * @param {PartitionService} ps - Partition service.
 */
async function shutdownPartitionService(ps) {
  if (ps.rebalancer) {
    ps.rebalancer.shutdown();
  }
  await ps.shutdown();
}

// ── 1. Initialization gate: all dependencies required ──────────────
//
// Lock the behavior that maybeInitializeRebalancer does NOT create
// a rebalancer until all six dependencies are present AND the
// partition is leader AND background work is ready.

test('initialization gate — rebalancer not created when ' +
  'systemTableCache is missing', async (t) => {
  const ps = createPartitionService();
  ps.metadataPublicationReadinessState = createMockReadinessState(true);
  ps.messageRouter = createMockMessageRouter();
  ps.isLeader = true;
  ps.setCdcIntegrationService(createMockCdcService());
  ps.setTablePolicyService(createMockPolicyService());
  ps.setSqlQueryEngine(createMockSqlEngine());
  ps.setRebalanceCoordinator(createMockCoordinator());

  t.equal(ps.rebalancer, null,
    'rebalancer not created without systemTableCache');
  await shutdownPartitionService(ps);
});

test('initialization gate — rebalancer not created when ' +
  'cdcIntegrationService is missing', async (t) => {
  const ps = createPartitionService();
  ps.metadataPublicationReadinessState = createMockReadinessState(true);
  ps.messageRouter = createMockMessageRouter();
  ps.isLeader = true;
  ps.setSystemTableCache(createMockCache());
  ps.setTablePolicyService(createMockPolicyService());
  ps.setSqlQueryEngine(createMockSqlEngine());
  ps.setRebalanceCoordinator(createMockCoordinator());

  t.equal(ps.rebalancer, null,
    'rebalancer not created without cdcIntegrationService');
  await shutdownPartitionService(ps);
});

test('initialization gate — rebalancer not created when ' +
  'tablePolicyService is missing', async (t) => {
  const ps = createPartitionService();
  ps.metadataPublicationReadinessState = createMockReadinessState(true);
  ps.messageRouter = createMockMessageRouter();
  ps.isLeader = true;
  ps.setSystemTableCache(createMockCache());
  ps.setCdcIntegrationService(createMockCdcService());
  ps.setSqlQueryEngine(createMockSqlEngine());
  ps.setRebalanceCoordinator(createMockCoordinator());

  t.equal(ps.rebalancer, null,
    'rebalancer not created without tablePolicyService');
  await shutdownPartitionService(ps);
});

test('initialization gate — rebalancer not created when ' +
  'messageRouter is missing', async (t) => {
  const ps = createPartitionService();
  ps.metadataPublicationReadinessState = createMockReadinessState(true);
  ps.isLeader = true;
  ps.setSystemTableCache(createMockCache());
  ps.setCdcIntegrationService(createMockCdcService());
  ps.setTablePolicyService(createMockPolicyService());
  ps.setSqlQueryEngine(createMockSqlEngine());
  ps.setRebalanceCoordinator(createMockCoordinator());

  t.equal(ps.rebalancer, null,
    'rebalancer not created without messageRouter');
  await shutdownPartitionService(ps);
});

test('initialization gate — rebalancer not created when ' +
  'sqlQueryEngine is missing', async (t) => {
  const ps = createPartitionService();
  ps.metadataPublicationReadinessState = createMockReadinessState(true);
  ps.messageRouter = createMockMessageRouter();
  ps.isLeader = true;
  ps.setSystemTableCache(createMockCache());
  ps.setCdcIntegrationService(createMockCdcService());
  ps.setTablePolicyService(createMockPolicyService());
  ps.setRebalanceCoordinator(createMockCoordinator());

  t.equal(ps.rebalancer, null,
    'rebalancer not created without sqlQueryEngine');
  await shutdownPartitionService(ps);
});

test('initialization gate — rebalancer not created when ' +
  'rebalanceCoordinator is missing', async (t) => {
  const ps = createPartitionService();
  ps.metadataPublicationReadinessState = createMockReadinessState(true);
  ps.messageRouter = createMockMessageRouter();
  ps.isLeader = true;
  ps.setSystemTableCache(createMockCache());
  ps.setCdcIntegrationService(createMockCdcService());
  ps.setTablePolicyService(createMockPolicyService());
  ps.setSqlQueryEngine(createMockSqlEngine());

  t.equal(ps.rebalancer, null,
    'rebalancer not created without rebalanceCoordinator');
  await shutdownPartitionService(ps);
});

test('initialization gate — rebalancer not created when ' +
  'not leader', async (t) => {
  const ps = createPartitionService();
  ps.metadataPublicationReadinessState = createMockReadinessState(true);
  ps.messageRouter = createMockMessageRouter();
  ps.isLeader = false;
  ps.setSystemTableCache(createMockCache());
  ps.setCdcIntegrationService(createMockCdcService());
  ps.setTablePolicyService(createMockPolicyService());
  ps.setSqlQueryEngine(createMockSqlEngine());
  ps.setRebalanceCoordinator(createMockCoordinator());

  t.equal(ps.rebalancer, null,
    'rebalancer not created when partition is not leader');
  await shutdownPartitionService(ps);
});

test('initialization gate — rebalancer not created when ' +
  'background work is not ready', async (t) => {
  const ps = createPartitionService();
  ps.metadataPublicationReadinessState = createMockReadinessState(false);
  ps.messageRouter = createMockMessageRouter();
  ps.isLeader = true;
  ps.setSystemTableCache(createMockCache());
  ps.setCdcIntegrationService(createMockCdcService());
  ps.setTablePolicyService(createMockPolicyService());
  ps.setSqlQueryEngine(createMockSqlEngine());
  ps.setRebalanceCoordinator(createMockCoordinator());

  t.equal(ps.rebalancer, null,
    'rebalancer not created when background work is not ready');
  await shutdownPartitionService(ps);
});

test('initialization gate — rebalancer created when all ' +
  'dependencies present and leader and background ready', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);

  t.ok(ps.rebalancer,
    'rebalancer created when all gates satisfied');
  t.ok(ps.rebalancer instanceof UnifiedRebalancer,
    'rebalancer is a UnifiedRebalancer instance');
  await shutdownPartitionService(ps);
});

// ── 2. Coordinator rebinding via setRebalanceCoordinator ───────────
//
// Lock the behavior that PartitionService.setRebalanceCoordinator
// routes through the rebalancer's setRebalanceCoordinator method
// (the canonical setter path per system guidelines §1.5.1).

test('coordinator rebinding — setRebalanceCoordinator routes ' +
  'through rebalancer.setRebalanceCoordinator', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);

  t.ok(ps.rebalancer, 'rebalancer exists after wiring');

  const newCoordinator = createMockCoordinator();
  let setCoordinatorCalled = false;
  const originalSetCoordinator =
    ps.rebalancer.setRebalanceCoordinator.bind(ps.rebalancer);
  ps.rebalancer.setRebalanceCoordinator = (coord) => {
    setCoordinatorCalled = true;
    originalSetCoordinator(coord);
  };

  ps.setRebalanceCoordinator(newCoordinator);

  t.equal(setCoordinatorCalled, true,
    'uses rebalancer.setRebalanceCoordinator (canonical setter path)');
  t.equal(ps.rebalanceCoordinator, newCoordinator,
    'PartitionService coordinator reference updated');
  t.equal(ps.rebalancer.rebalanceCoordinator, newCoordinator,
    'rebalancer coordinator reference updated');
  await shutdownPartitionService(ps);
});

test('coordinator rebinding — null coordinator is rejected ' +
  'by setRebalanceCoordinator', async (t) => {
  const ps = createPartitionService();
  const originalCoordinator = createMockCoordinator();
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

  const newCoordinator = createMockCoordinator();
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

  const newCoordinator = createMockCoordinator();
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
  const coordinator = createMockCoordinator();

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
    rebalanceCoordinator: createMockCoordinator(),
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
  const coordinator = createMockCoordinator();

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
    rebalanceCoordinator: createMockCoordinator(),
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
  const coordinator = createMockCoordinator();

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
    rebalanceCoordinator: createMockCoordinator(),
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
  const coordinator = createMockCoordinator();

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

// ── 4. Leader/background readiness gate ────────────────────────────
//
// Lock the behavior that background-work readiness gates rebalancer
// leadership ACQUISITION, while raft leadership gates RETENTION: an
// already-active rebalancer leader is RETAINED across a transient
// (non-draining) readiness dip while it still holds raft leadership.
// (Retention hysteresis prevents the lockstep rebalancer-leadership flap
// that resets the post-restart quiescence window — see
// partition-rebalancer-leadership-readiness-hysteresis.test.js.)

test('leader gate — active rebalancer leader is RETAINED when ' +
  'background work transiently reports not-ready', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);

  t.ok(ps.rebalancer, 'rebalancer created');
  t.equal(ps.rebalancer.isLeader, true, 'acquired leadership while ready');

  // Switch to a transient (non-draining) not-ready state; raft leadership
  // is unchanged, so an already-active rebalancer leader retains.
  const notReadyState = createMockReadinessState(false);
  ps.metadataPublicationReadinessState = notReadyState;
  ps.updateRebalancerLeadership();

  t.equal(ps.rebalancer.isLeader, true,
    'rebalancer leadership retained across a transient readiness dip');
  await shutdownPartitionService(ps);
});

test('leader gate — rebalancer setLeader receives true when ' +
  'both leader and background ready', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);

  t.ok(ps.rebalancer, 'rebalancer created');
  ps.updateRebalancerLeadership();

  t.equal(ps.rebalancer.isLeader, true,
    'rebalancer leadership is true when leader and background ready');
  await shutdownPartitionService(ps);
});

test('leader gate — rebalancer setLeader receives false when ' +
  'partition is not leader', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);

  t.ok(ps.rebalancer, 'rebalancer created');

  ps.isLeader = false;
  ps.updateRebalancerLeadership();

  t.equal(ps.rebalancer.isLeader, false,
    'rebalancer leadership is false when partition not leader');
  await shutdownPartitionService(ps);
});

// ── 5. maybeInitializeRebalancer dependency propagation ────────────
//
// Lock the behavior that maybeInitializeRebalancer propagates
// dependencies to an existing rebalancer (not just on first create).

test('dependency propagation — maybeInitializeRebalancer updates ' +
  'existing rebalancer dependencies', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);

  t.ok(ps.rebalancer, 'rebalancer created');

  const newCache = createMockCache();
  ps.setSystemTableCache(newCache);

  t.equal(ps.rebalancer.systemTableCache, newCache,
    'rebalancer systemTableCache updated via ' +
    'maybeInitializeRebalancer');
  await shutdownPartitionService(ps);
});

test('dependency propagation — maybeInitializeRebalancer routes ' +
  'coordinator through setRebalanceCoordinator', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);

  t.ok(ps.rebalancer, 'rebalancer created');

  let setCoordinatorCallCount = 0;
  const originalSet =
    ps.rebalancer.setRebalanceCoordinator.bind(ps.rebalancer);
  ps.rebalancer.setRebalanceCoordinator = (coord) => {
    setCoordinatorCallCount++;
    originalSet(coord);
  };

  // Trigger maybeInitializeRebalancer via a dependency setter
  ps.setSystemTableCache(createMockCache());

  t.ok(setCoordinatorCallCount > 0,
    'maybeInitializeRebalancer routes coordinator through ' +
    'setRebalanceCoordinator (canonical setter path)');
  await shutdownPartitionService(ps);
});

// ── 6. UnifiedRebalancer constructor dependency assertions ─────────
//
// Lock the behavior that UnifiedRebalancer constructor requires
// specific dependencies and throws when they are missing.

test('constructor gate — UnifiedRebalancer throws when ' +
  'entityId is missing', async (t) => {
  t.throws(() => new UnifiedRebalancer({
    entityType: ENTITY_TYPE_PARTITION,
    nodeId: NODE_ID,
    systemTableCache: createMockCache(),
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator: createMockCoordinator(),
  }), {message: REBALANCER_ERROR_MSG.ENTITY_ID_REQUIRED},
  'throws when entityId missing');
});

test('constructor gate — UnifiedRebalancer throws when ' +
  'systemTableCache is missing', async (t) => {
  t.throws(() => new UnifiedRebalancer({
    entityId: PARTITION_ID,
    entityType: ENTITY_TYPE_PARTITION,
    nodeId: NODE_ID,
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator: createMockCoordinator(),
  }), {message: REBALANCER_ERROR_MSG.CACHE_REQUIRED},
  'throws when systemTableCache missing');
});

test('constructor gate — UnifiedRebalancer throws when ' +
  'rebalanceCoordinator is missing', async (t) => {
  t.throws(() => new UnifiedRebalancer({
    entityId: PARTITION_ID,
    entityType: ENTITY_TYPE_PARTITION,
    nodeId: NODE_ID,
    systemTableCache: createMockCache(),
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
  }), {message: REBALANCER_ERROR_MSG.COORDINATOR_REQUIRED},
  'throws when rebalanceCoordinator missing');
});

// ── 7. initializeRebalancer assertion gates ────────────────────────
//
// Lock the behavior that initializeRebalancer asserts all six
// dependencies before creating the UnifiedRebalancer.

test('initializeRebalancer gate — throws when systemTableCache ' +
  'is null at initialization time', async (t) => {
  const ps = createPartitionService();
  ps.messageRouter = createMockMessageRouter();
  ps.isLeader = true;
  ps.metadataPublicationReadinessState = createMockReadinessState(true);
  ps._cdcIntegrationService = createMockCdcService();
  ps.tablePolicyService = createMockPolicyService();
  ps.sqlQueryEngine = createMockSqlEngine();
  ps.rebalanceCoordinator = createMockCoordinator();

  t.throws(
    () => ps.initializeRebalancer(),
    {message: PARTITION_SERVICE_ERROR_MSG.REBALANCER_CACHE_REQUIRED},
    'initializeRebalancer asserts systemTableCache',
  );
  await shutdownPartitionService(ps);
});

test('initializeRebalancer gate — throws when ' +
  'rebalanceCoordinator is null at initialization time', async (t) => {
  const ps = createPartitionService();
  ps.messageRouter = createMockMessageRouter();
  ps.isLeader = true;
  ps.metadataPublicationReadinessState = createMockReadinessState(true);
  ps.setSystemTableCache(createMockCache());
  ps.setCdcIntegrationService(createMockCdcService());
  ps.setTablePolicyService(createMockPolicyService());
  ps.setSqlQueryEngine(createMockSqlEngine());

  // Force coordinator to null
  ps.rebalanceCoordinator = null;

  t.throws(
    () => ps.initializeRebalancer(),
    {
      message:
        PARTITION_SERVICE_ERROR_MSG.REBALANCER_COORDINATOR_REQUIRED,
    },
    'initializeRebalancer asserts rebalanceCoordinator',
  );
  await shutdownPartitionService(ps);
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
  const coordinator = createMockCoordinator();

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
  const coordinator = createMockCoordinator();

  const ps = createPartitionService();
  ps.metadataPublicationReadinessState = createMockReadinessState(true);
  ps.messageRouter = router;
  ps.isLeader = false;
  ps.setSystemTableCache(cache);
  ps.setCdcIntegrationService(cdc);
  ps.setTablePolicyService(policy);
  ps.setRebalanceCoordinator(coordinator);

  t.equal(ps.rebalancer, null,
    'rebalancer is not created before leader/background gates open');

  ps.setSqlQueryEngine(sql);

  t.equal(ps.rebalancer, null,
    'setSqlQueryEngine does not bypass rebalancer creation gates');
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

test('dependency bundle — applyRebalancerDependencies updates ' +
  'existing rebalancer via bundle (single wiring path)', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);
  t.ok(ps.rebalancer, 'rebalancer created');

  const newCache = createMockCache();
  const newCdc = createMockCdcService();
  const newPolicy = createMockPolicyService();
  const newRouter = createMockMessageRouter();
  const newSql = createMockSqlEngine();
  const newCoordinator = createMockCoordinator();

  const bundle = {
    systemTableCache: newCache,
    cdcIntegrationService: newCdc,
    tablePolicyService: newPolicy,
    messageRouter: newRouter,
    sqlQueryEngine: newSql,
    rebalanceCoordinator: newCoordinator,
  };

  ps.applyRebalancerDependencies(bundle);

  t.equal(ps.rebalancer.systemTableCache, newCache,
    'rebalancer systemTableCache updated via bundle');
  t.equal(ps.rebalancer.cdcIntegrationService, newCdc,
    'rebalancer cdcIntegrationService updated via bundle');
  t.equal(ps.rebalancer.tablePolicyService, newPolicy,
    'rebalancer tablePolicyService updated via bundle');
  t.equal(ps.rebalancer.messageRouter, newRouter,
    'rebalancer messageRouter updated via bundle');
  t.equal(ps.rebalancer.sqlQueryEngine, newSql,
    'rebalancer sqlQueryEngine updated via bundle');
  t.equal(ps.rebalancer.rebalanceCoordinator, newCoordinator,
    'rebalancer coordinator updated via bundle');
  await shutdownPartitionService(ps);
});

test('dependency bundle — applyRebalancerDependencies syncs ' +
  'nested coordinator and gateway dependencies', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);
  t.ok(ps.rebalancer, 'rebalancer created');

  const newCache = createMockCache();
  const newCdc = createMockCdcService();
  const newPolicy = createMockPolicyService();
  const newRouter = createMockMessageRouter();
  const newSql = createMockSqlEngine();
  const newCoordinator = createTestCoordinator({
    enableTimeouts: false,
  });

  ps.applyRebalancerDependencies({
    systemTableCache: newCache,
    cdcIntegrationService: newCdc,
    tablePolicyService: newPolicy,
    messageRouter: newRouter,
    sqlQueryEngine: newSql,
    rebalanceCoordinator: newCoordinator,
  });

  t.equal(
    ps.rebalancer.controlPlaneSystemTableGateway.resolveCdcIntegrationService(),
    newCdc,
    'rebalancer gateway cdcIntegrationService resolves via bundle');
  t.equal(
    ps.rebalancer.controlPlaneSystemTableGateway.resolveMessageRouter(),
    newRouter,
    'rebalancer gateway messageRouter resolves via bundle');
  t.equal(
    ps.rebalancer.controlPlaneSystemTableGateway.resolveSqlQueryEngine(),
    newSql,
    'rebalancer gateway sqlQueryEngine resolves via bundle');
  t.equal(newCoordinator.repository.systemTableCache, newCache,
    'coordinator repository cache synced via bundle');
  t.equal(newCoordinator.repository.cdcIntegrationService, newCdc,
    'coordinator repository cdcIntegrationService synced via bundle');
  t.equal(newCoordinator.repository.controlPlaneSystemTableGateway,
    newCoordinator.controlPlaneSystemTableGateway,
    'coordinator repository gateway kept in sync');
  t.equal(newCoordinator.workflowOwner.messageRouter, newRouter,
    'coordinator workflow owner messageRouter synced via bundle');
  t.equal(newCoordinator.workflowOwner.tablePolicyService, newPolicy,
    'coordinator workflow owner tablePolicyService synced via bundle');

  await newCoordinator.shutdown();
  await shutdownPartitionService(ps);
});

test('dependency bundle — applyRebalancerDependencies is no-op ' +
  'when bundle is null', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);
  t.ok(ps.rebalancer, 'rebalancer created');

  const originalCache = ps.rebalancer.systemTableCache;
  ps.applyRebalancerDependencies(null);

  t.equal(ps.rebalancer.systemTableCache, originalCache,
    'rebalancer dependencies unchanged when bundle is null');
  await shutdownPartitionService(ps);
});

test('dependency bundle — applyRebalancerDependencies is no-op ' +
  'when rebalancer does not exist', async (t) => {
  const ps = createPartitionService();
  t.equal(ps.rebalancer, null, 'no rebalancer');

  // Should not throw
  ps.applyRebalancerDependencies({
    systemTableCache: createMockCache(),
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    sqlQueryEngine: createMockSqlEngine(),
    rebalanceCoordinator: createMockCoordinator(),
  });

  t.equal(ps.rebalancer, null,
    'rebalancer still null after apply with no rebalancer');
  await shutdownPartitionService(ps);
});

test('dependency bundle — applyRebalancerDependencies routes ' +
  'coordinator through setRebalanceCoordinator', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);
  t.ok(ps.rebalancer, 'rebalancer created');

  let setCoordinatorCalled = false;
  const originalSet =
    ps.rebalancer.setRebalanceCoordinator.bind(ps.rebalancer);
  ps.rebalancer.setRebalanceCoordinator = (coord) => {
    setCoordinatorCalled = true;
    originalSet(coord);
  };

  const newCoordinator = createMockCoordinator();
  ps.applyRebalancerDependencies({
    systemTableCache: createMockCache(),
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    sqlQueryEngine: createMockSqlEngine(),
    rebalanceCoordinator: newCoordinator,
  });

  t.equal(setCoordinatorCalled, true,
    'applyRebalancerDependencies routes coordinator through ' +
    'setRebalanceCoordinator (canonical setter path)');
  await shutdownPartitionService(ps);
});

test('dependency bundle — maybeInitializeRebalancer uses bundle ' +
  'path for existing rebalancer updates', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);
  t.ok(ps.rebalancer, 'rebalancer created');

  // Replace a dependency and trigger maybeInitializeRebalancer
  const newCache = createMockCache();
  ps.setSystemTableCache(newCache);

  // setSystemTableCache triggers maybeInitializeRebalancer which
  // now uses buildRebalancerDependencyBundle + applyRebalancerDependencies
  t.equal(ps.rebalancer.systemTableCache, newCache,
    'maybeInitializeRebalancer propagates updated cache via bundle');
  await shutdownPartitionService(ps);
});

test('dependency bundle — initializeRebalancer accepts pre-built ' +
  'bundle for first-time creation', async (t) => {
  const cache = createMockCache();
  const cdc = createMockCdcService();
  const policy = createMockPolicyService();
  const router = createMockMessageRouter();
  const sql = createMockSqlEngine();
  const coordinator = createMockCoordinator();

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
  ps.initializeRebalancer(bundle);

  t.ok(ps.rebalancer, 'rebalancer created via bundle');
  t.ok(ps.rebalancer instanceof UnifiedRebalancer,
    'rebalancer is UnifiedRebalancer instance');
  t.equal(ps.rebalancer.systemTableCache, cache,
    'rebalancer received cache from bundle');
  t.equal(ps.rebalancer.rebalanceCoordinator, coordinator,
    'rebalancer received coordinator from bundle');
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
  t.ok(ps.rebalancer, 'rebalancer created');

  const newCoordinator = createMockCoordinator();
  ps.rebindCoordinator(newCoordinator);

  t.equal(ps.rebalanceCoordinator, newCoordinator,
    'PartitionService coordinator reference updated via rebind');
  await shutdownPartitionService(ps);
});

test('rebind path — rebindCoordinator updates rebalancer ' +
  'coordinator binding', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);
  t.ok(ps.rebalancer, 'rebalancer created');

  const newCoordinator = createMockCoordinator();
  ps.rebindCoordinator(newCoordinator);

  t.equal(ps.rebalancer.rebalanceCoordinator, newCoordinator,
    'rebalancer coordinator updated via rebind');
  await shutdownPartitionService(ps);
});

test('rebind path — rebindCoordinator routes through ' +
  'rebalancer.setRebalanceCoordinator', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);
  t.ok(ps.rebalancer, 'rebalancer created');

  let setCoordinatorCalled = false;
  const originalSet =
    ps.rebalancer.setRebalanceCoordinator.bind(ps.rebalancer);
  ps.rebalancer.setRebalanceCoordinator = (coord) => {
    setCoordinatorCalled = true;
    originalSet(coord);
  };

  const newCoordinator = createMockCoordinator();
  ps.rebindCoordinator(newCoordinator);

  t.equal(setCoordinatorCalled, true,
    'rebindCoordinator uses rebalancer.setRebalanceCoordinator');
  await shutdownPartitionService(ps);
});

test('rebind path — setRebalanceCoordinator delegates to ' +
  'rebindCoordinator (single canonical path)', async (t) => {
  const ps = createPartitionService();
  wireAllDependencies(ps);
  t.ok(ps.rebalancer, 'rebalancer created');

  let rebindCalled = false;
  const originalRebind = ps.rebindCoordinator.bind(ps);
  ps.rebindCoordinator = (coord) => {
    rebindCalled = true;
    originalRebind(coord);
  };

  const newCoordinator = createMockCoordinator();
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
  t.ok(ps.rebalancer, 'rebalancer created');

  const logCalls = [];
  const originalInfo = ps.logger.info.bind(ps.logger);
  ps.logger.info = (msg, meta) => {
    logCalls.push({msg, meta});
    originalInfo(msg, meta);
  };

  const newCoordinator = createMockCoordinator();
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

  const coordinator = createMockCoordinator();
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
  t.ok(ps.rebalancer, 'rebalancer created');

  ps.ownsRebalanceCoordinator = true;
  const previousCoordinator = ps.rebalanceCoordinator;
  let shutdownCalled = false;
  previousCoordinator.shutdown = async () => {
    shutdownCalled = true;
  };

  const newCoordinator = createMockCoordinator();
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
  t.ok(ps.rebalancer, 'rebalancer created');

  ps.ownsRebalanceCoordinator = false;
  const previousCoordinator = ps.rebalanceCoordinator;
  let shutdownCalled = false;
  previousCoordinator.shutdown = async () => {
    shutdownCalled = true;
  };

  const newCoordinator = createMockCoordinator();
  ps.rebindCoordinator(newCoordinator);

  await new Promise((resolve) => resolve());

  t.equal(shutdownCalled, false,
    'non-owned previous coordinator not shut down');
  await shutdownPartitionService(ps);
});
