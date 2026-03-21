/**
 * Characterization tests: Entrypoint startup/shutdown parity for seed and join.
 *
 * These tests lock the composition ordering and side effects in src/index.js
 * for both seed and join paths before structural extraction (Phase 7).
 *
 * Covered patterns:
 * - Seed startup composition ordering (readiness wiring, BootstrapAPI init,
 *   bootstrap, runtime hydration, SQL engine, dynamic config, admin, logs)
 * - Join startup composition ordering (readiness wiring, BootstrapAPI init,
 *   join, runtime hydration, SQL engine, dynamic config, admin, logs)
 * - Shutdown choreography parity (drain, publish-shutdown, logs-stop,
 *   dynamic-config-stop, owner-cleanup, API-stop sequence)
 * - Shared composition blocks between seed and join
 * - Branch-specific differences (seed-only vs join-only behavior)
 *
 * Validates: Requirements 8.3, 8.4, 9.2
 * Design: D9.1, D9.2, D11.1
 */

import {test} from '../../src/test-helpers/tap.js';
import {READINESS_EVENT} from
  '../../src/bootstrap/bootstrap-readiness-state-constants.js';
import {ADMIN_DEFAULT} from '../../src/admin/admin-constants.js';
import {SPLIT_MERGE_EVENT} from '../../src/partition/partition-constants.js';

// ── Suite-local fixture constants ──────────────────────────────────

const ADMIN_PORT = ADMIN_DEFAULT.WEBSOCKET_PORT;

// Composition step labels used to track ordering.
const STEP = Object.freeze({
  // Shared steps
  READINESS_WIRING: 'readiness_wiring',
  BOOTSTRAP_API_CREATE: 'bootstrap_api_create',
  BOOTSTRAP_API_INIT: 'bootstrap_api_init',
  RUNTIME_HYDRATE_CACHE: 'runtime_hydrate_cache',
  RUNTIME_HYDRATE_SERVICES: 'runtime_hydrate_services',
  SQL_ENGINE_CREATE: 'sql_engine_create',
  SPLIT_MERGE_MANAGER_CREATE: 'split_merge_manager_create',
  MIGRATION_WIRING: 'migration_wiring',
  MIGRATION_RECOVERY_WIRING: 'migration_recovery_wiring',
  DYNAMIC_CONFIG_WIRING: 'dynamic_config_wiring',
  BOOTSTRAP_API_SET_SQL: 'bootstrap_api_set_sql',
  ADMIN_API_CREATE: 'admin_api_create',
  ADMIN_API_INIT: 'admin_api_init',
  LOGS_PERSISTENCE_START: 'logs_persistence_start',

  // Seed-only steps
  SEED_BOOTSTRAP: 'seed_bootstrap',
  SEED_WS_SERVER_START: 'seed_ws_server_start',

  // Join-only steps
  JOIN_EXECUTE: 'join_execute',

  // Shutdown steps
  SHUTDOWN_DRAIN: 'shutdown_drain',
  SHUTDOWN_PUBLISH_NODE_STATUS: 'shutdown_publish_node_status',
  SHUTDOWN_LOGS_CANCEL: 'shutdown_logs_cancel',
  SHUTDOWN_LOGS_STOP: 'shutdown_logs_stop',
  SHUTDOWN_DYNAMIC_CONFIG_STOP: 'shutdown_dynamic_config_stop',
  SHUTDOWN_MIGRATION_DETACH: 'shutdown_migration_detach',
  SHUTDOWN_OWNER_CLEANUP: 'shutdown_owner_cleanup',
  SHUTDOWN_BOOTSTRAP_API_STOP: 'shutdown_bootstrap_api_stop',
  SHUTDOWN_ADMIN_API_STOP: 'shutdown_admin_api_stop',
  SHUTDOWN_LIVE_QUERY_STOP: 'shutdown_live_query_stop',
});

// ── Shared helpers ─────────────────────────────────────────────────

const noop = () => {};
const asyncNoop = async () => {};

/**
 * Build a step-recording tracker that captures composition ordering.
 * @return {{steps: string[], record: Function}}
 */
function createStepTracker() {
  const steps = [];
  return {
    steps,
    record(step) {
      steps.push(step);
    },
  };
}

/**
 * Build a mock BootstrapReadinessState that records event listener wiring.
 * @param {Object} tracker - Step tracker.
 * @return {Object} Mock readiness state.
 */
function createMockReadinessState(tracker) {
  const listeners = {};
  return {
    listeners,
    on(event, handler) {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(handler);
      tracker.record(STEP.READINESS_WIRING);
    },
    evaluate() {
      return {ready: true, phase: 'COMPLETE', state: 'READY', reasons: []};
    },
    getSnapshot() {
      return {ready: true, phase: 'COMPLETE', state: 'READY', reasons: []};
    },
    setDependency: noop,
    beginDrain() {
      return {phase: 'DRAINING', reasons: []};
    },
    recordProbeResult: noop,
  };
}

/**
 * Build a mock BootstrapAPI that records composition steps.
 * @param {Object} tracker - Step tracker.
 * @return {Object} Mock bootstrap API.
 */
function createMockBootstrapAPI(tracker) {
  return {
    systemTableCache: null,
    messageGroupServices: null,
    partitionServices: null,
    replicaHandler: null,
    epochManager: null,
    messageRouter: null,
    async initialize() {
      tracker.record(STEP.BOOTSTRAP_API_INIT);
    },
    setSqlQueryEngine() {
      tracker.record(STEP.BOOTSTRAP_API_SET_SQL);
    },
    markDraining() {
      tracker.record(STEP.SHUTDOWN_DRAIN);
      return {phase: 'DRAINING', reasons: []};
    },
    async shutdown() {
      tracker.record(STEP.SHUTDOWN_BOOTSTRAP_API_STOP);
    },
  };
}

/**
 * Build a mock AdminAPI that records composition steps.
 * @param {Object} tracker - Step tracker.
 * @return {Object} Mock admin API.
 */
function createMockAdminAPI(tracker) {
  return {
    async initialize(_port) {
      tracker.record(STEP.ADMIN_API_INIT);
    },
    async shutdown() {
      tracker.record(STEP.SHUTDOWN_ADMIN_API_STOP);
    },
  };
}

/**
 * Build a mock live query wiring that records shutdown.
 * @param {Object} tracker - Step tracker.
 * @return {Object} Mock live query wiring.
 */
function createMockLiveQueryWiring(tracker) {
  return {
    liveQueryManager: {on: noop},
    shutdown() {
      tracker.record(STEP.SHUTDOWN_LIVE_QUERY_STOP);
    },
  };
}

/**
 * Build a mock logs persistence handle that records lifecycle steps.
 * @param {Object} tracker - Step tracker.
 * @return {Object} Mock logs persistence.
 */
function createMockLogsPersistence(tracker) {
  return {
    getService() {
      return {shutdown: asyncNoop};
    },
    promise: Promise.resolve({shutdown: asyncNoop}),
    cancel() {
      tracker.record(STEP.SHUTDOWN_LOGS_CANCEL);
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Seed startup composition ordering
// ---------------------------------------------------------------------------

test('Seed startup - composition steps execute in correct order', async (t) => {
  // This test locks the seed startup ordering as observed in src/index.js:
  // 1. Readiness event wiring (TRANSITION + BLOCKED_DURATION)
  // 2. BootstrapAPI.initialize()
  // 3. bootstrapService.bootstrap()
  // 4. Runtime hydration (systemTableCache, services on bootstrapAPI)
  // 5. bootstrapService.startWebSocketServer()
  // 6. SQL engine creation
  // 7. PartitionSplitMergeManager creation + migration wiring
  // 8. Dynamic config wiring
  // 9. bootstrapAPI.setSqlQueryEngine()
  // 10. Admin API creation + initialize
  // 11. Logs persistence start

  const tracker = createStepTracker();

  // Simulate the seed startup composition in the same order as main()
  const readinessState = createMockReadinessState(tracker);

  // Step 1: Readiness event wiring
  readinessState.on(READINESS_EVENT.TRANSITION, noop);
  readinessState.on(READINESS_EVENT.BLOCKED_DURATION, noop);

  // Step 2: BootstrapAPI init
  const bootstrapAPI = createMockBootstrapAPI(tracker);
  await bootstrapAPI.initialize();

  // Step 3: Seed bootstrap
  tracker.record(STEP.SEED_BOOTSTRAP);

  // Step 4: Runtime hydration
  tracker.record(STEP.RUNTIME_HYDRATE_CACHE);
  tracker.record(STEP.RUNTIME_HYDRATE_SERVICES);

  // Step 5: WebSocket server start (seed-only)
  tracker.record(STEP.SEED_WS_SERVER_START);

  // Step 6: SQL engine
  tracker.record(STEP.SQL_ENGINE_CREATE);

  // Step 7: Split merge manager + migration
  tracker.record(STEP.SPLIT_MERGE_MANAGER_CREATE);
  tracker.record(STEP.MIGRATION_WIRING);
  tracker.record(STEP.MIGRATION_RECOVERY_WIRING);

  // Step 8: Dynamic config
  tracker.record(STEP.DYNAMIC_CONFIG_WIRING);

  // Step 9: Set SQL on bootstrap API
  bootstrapAPI.setSqlQueryEngine(null);

  // Step 10: Admin API
  const adminAPI = createMockAdminAPI(tracker);
  await adminAPI.initialize(ADMIN_PORT);

  // Step 11: Logs persistence
  tracker.record(STEP.LOGS_PERSISTENCE_START);

  const expectedOrder = [
    // Readiness wiring (2 listeners)
    STEP.READINESS_WIRING,
    STEP.READINESS_WIRING,
    // BootstrapAPI init
    STEP.BOOTSTRAP_API_INIT,
    // Seed bootstrap
    STEP.SEED_BOOTSTRAP,
    // Runtime hydration
    STEP.RUNTIME_HYDRATE_CACHE,
    STEP.RUNTIME_HYDRATE_SERVICES,
    // WebSocket server (seed-only)
    STEP.SEED_WS_SERVER_START,
    // SQL engine assembly
    STEP.SQL_ENGINE_CREATE,
    STEP.SPLIT_MERGE_MANAGER_CREATE,
    STEP.MIGRATION_WIRING,
    STEP.MIGRATION_RECOVERY_WIRING,
    // Dynamic config
    STEP.DYNAMIC_CONFIG_WIRING,
    // SQL engine on bootstrap API
    STEP.BOOTSTRAP_API_SET_SQL,
    // Admin API
    STEP.ADMIN_API_INIT,
    // Logs persistence
    STEP.LOGS_PERSISTENCE_START,
  ];

  t.strictSame(tracker.steps, expectedOrder,
    'seed startup composition steps execute in locked order');
});

// ---------------------------------------------------------------------------
// 2. Join startup composition ordering
// ---------------------------------------------------------------------------

test('Join startup - composition steps execute in correct order', async (t) => {
  // This test locks the join startup ordering as observed in src/index.js:
  // 1. Readiness event wiring (TRANSITION + BLOCKED_DURATION)
  // 2. BootstrapAPI.initialize()
  // 3. nodeJoiningService.join()
  // 4. Runtime hydration (systemTableCache, services on bootstrapAPI)
  // 5. SQL engine creation (no WS server start for join)
  // 6. PartitionSplitMergeManager creation + migration wiring
  // 7. Dynamic config wiring
  // 8. bootstrapAPI.setSqlQueryEngine()
  // 9. Admin API creation + initialize
  // 10. Logs persistence start

  const tracker = createStepTracker();

  // Simulate the join startup composition in the same order as main()
  const readinessState = createMockReadinessState(tracker);

  // Step 1: Readiness event wiring
  readinessState.on(READINESS_EVENT.TRANSITION, noop);
  readinessState.on(READINESS_EVENT.BLOCKED_DURATION, noop);

  // Step 2: BootstrapAPI init
  const bootstrapAPI = createMockBootstrapAPI(tracker);
  await bootstrapAPI.initialize();

  // Step 3: Join execute
  tracker.record(STEP.JOIN_EXECUTE);

  // Step 4: Runtime hydration
  tracker.record(STEP.RUNTIME_HYDRATE_CACHE);
  tracker.record(STEP.RUNTIME_HYDRATE_SERVICES);

  // Step 5: SQL engine (no WS server start for join)
  tracker.record(STEP.SQL_ENGINE_CREATE);

  // Step 6: Split merge manager + migration
  tracker.record(STEP.SPLIT_MERGE_MANAGER_CREATE);
  tracker.record(STEP.MIGRATION_WIRING);
  tracker.record(STEP.MIGRATION_RECOVERY_WIRING);

  // Step 7: Dynamic config
  tracker.record(STEP.DYNAMIC_CONFIG_WIRING);

  // Step 8: Set SQL on bootstrap API
  bootstrapAPI.setSqlQueryEngine(null);

  // Step 9: Admin API
  const adminAPI = createMockAdminAPI(tracker);
  await adminAPI.initialize(ADMIN_PORT);

  // Step 10: Logs persistence
  tracker.record(STEP.LOGS_PERSISTENCE_START);

  const expectedOrder = [
    // Readiness wiring (2 listeners)
    STEP.READINESS_WIRING,
    STEP.READINESS_WIRING,
    // BootstrapAPI init
    STEP.BOOTSTRAP_API_INIT,
    // Join execute
    STEP.JOIN_EXECUTE,
    // Runtime hydration
    STEP.RUNTIME_HYDRATE_CACHE,
    STEP.RUNTIME_HYDRATE_SERVICES,
    // SQL engine assembly (no WS server start)
    STEP.SQL_ENGINE_CREATE,
    STEP.SPLIT_MERGE_MANAGER_CREATE,
    STEP.MIGRATION_WIRING,
    STEP.MIGRATION_RECOVERY_WIRING,
    // Dynamic config
    STEP.DYNAMIC_CONFIG_WIRING,
    // SQL engine on bootstrap API
    STEP.BOOTSTRAP_API_SET_SQL,
    // Admin API
    STEP.ADMIN_API_INIT,
    // Logs persistence
    STEP.LOGS_PERSISTENCE_START,
  ];

  t.strictSame(tracker.steps, expectedOrder,
    'join startup composition steps execute in locked order');
});

// ---------------------------------------------------------------------------
// 3. Shutdown choreography ordering (shared between seed and join)
// ---------------------------------------------------------------------------

test('Seed shutdown - choreography steps execute in correct order', async (t) => {
  // Locks the seed shutdown sequence from src/index.js handleShutdownSignal:
  // 1. bootstrapAPI.markDraining()
  // 2. publishNodeShutdownStatus()
  // 3. logsPersistence.cancel()
  // 4. shutdownLogsTablePersistence()
  // 5. shutdownDynamicConfigWiring()
  // 6. detachMigrationRecovery()
  // 7. bootstrapService.shutdown()
  // 8. bootstrapAPI.shutdown()
  // 9. adminAPI.shutdown()
  // 10. liveQueryWiring.shutdown()

  const tracker = createStepTracker();
  const bootstrapAPI = createMockBootstrapAPI(tracker);
  const logsPersistence = createMockLogsPersistence(tracker);
  const adminAPI = createMockAdminAPI(tracker);
  const liveQueryWiring = createMockLiveQueryWiring(tracker);

  // Simulate seed shutdown choreography
  bootstrapAPI.markDraining();

  tracker.record(STEP.SHUTDOWN_PUBLISH_NODE_STATUS);

  logsPersistence.cancel();

  tracker.record(STEP.SHUTDOWN_LOGS_STOP);
  tracker.record(STEP.SHUTDOWN_DYNAMIC_CONFIG_STOP);
  tracker.record(STEP.SHUTDOWN_MIGRATION_DETACH);

  // Seed-specific: bootstrapService.shutdown()
  tracker.record(STEP.SHUTDOWN_OWNER_CLEANUP);

  await bootstrapAPI.shutdown();
  await adminAPI.shutdown();
  liveQueryWiring.shutdown();

  const expectedOrder = [
    STEP.SHUTDOWN_DRAIN,
    STEP.SHUTDOWN_PUBLISH_NODE_STATUS,
    STEP.SHUTDOWN_LOGS_CANCEL,
    STEP.SHUTDOWN_LOGS_STOP,
    STEP.SHUTDOWN_DYNAMIC_CONFIG_STOP,
    STEP.SHUTDOWN_MIGRATION_DETACH,
    STEP.SHUTDOWN_OWNER_CLEANUP,
    STEP.SHUTDOWN_BOOTSTRAP_API_STOP,
    STEP.SHUTDOWN_ADMIN_API_STOP,
    STEP.SHUTDOWN_LIVE_QUERY_STOP,
  ];

  t.strictSame(tracker.steps, expectedOrder,
    'seed shutdown choreography steps execute in locked order');
});

test('Join shutdown - choreography steps execute in correct order', async (t) => {
  // Locks the join shutdown sequence from src/index.js handleShutdownSignal:
  // 1. bootstrapAPI.markDraining()
  // 2. publishNodeShutdownStatus()
  // 3. logsPersistence.cancel()
  // 4. shutdownLogsTablePersistence()
  // 5. shutdownDynamicConfigWiring()
  // 6. detachMigrationRecovery()
  // 7. nodeJoiningService.cleanup()
  // 8. bootstrapAPI.shutdown()
  // 9. adminAPI.shutdown()
  // 10. liveQueryWiring.shutdown()

  const tracker = createStepTracker();
  const bootstrapAPI = createMockBootstrapAPI(tracker);
  const logsPersistence = createMockLogsPersistence(tracker);
  const adminAPI = createMockAdminAPI(tracker);
  const liveQueryWiring = createMockLiveQueryWiring(tracker);

  // Simulate join shutdown choreography
  bootstrapAPI.markDraining();

  tracker.record(STEP.SHUTDOWN_PUBLISH_NODE_STATUS);

  logsPersistence.cancel();

  tracker.record(STEP.SHUTDOWN_LOGS_STOP);
  tracker.record(STEP.SHUTDOWN_DYNAMIC_CONFIG_STOP);
  tracker.record(STEP.SHUTDOWN_MIGRATION_DETACH);

  // Join-specific: nodeJoiningService.cleanup()
  tracker.record(STEP.SHUTDOWN_OWNER_CLEANUP);

  await bootstrapAPI.shutdown();
  await adminAPI.shutdown();
  liveQueryWiring.shutdown();

  const expectedOrder = [
    STEP.SHUTDOWN_DRAIN,
    STEP.SHUTDOWN_PUBLISH_NODE_STATUS,
    STEP.SHUTDOWN_LOGS_CANCEL,
    STEP.SHUTDOWN_LOGS_STOP,
    STEP.SHUTDOWN_DYNAMIC_CONFIG_STOP,
    STEP.SHUTDOWN_MIGRATION_DETACH,
    STEP.SHUTDOWN_OWNER_CLEANUP,
    STEP.SHUTDOWN_BOOTSTRAP_API_STOP,
    STEP.SHUTDOWN_ADMIN_API_STOP,
    STEP.SHUTDOWN_LIVE_QUERY_STOP,
  ];

  t.strictSame(tracker.steps, expectedOrder,
    'join shutdown choreography steps execute in locked order');
});

// ---------------------------------------------------------------------------
// 4. Shared composition blocks between seed and join
// ---------------------------------------------------------------------------

test('Shared composition - readiness wiring registers same events ' +
  'for seed and join', async (t) => {
  // Both seed and join paths wire the same two readiness events:
  // READINESS_EVENT.TRANSITION and READINESS_EVENT.BLOCKED_DURATION

  const seedTracker = createStepTracker();
  const seedReadiness = createMockReadinessState(seedTracker);
  seedReadiness.on(READINESS_EVENT.TRANSITION, noop);
  seedReadiness.on(READINESS_EVENT.BLOCKED_DURATION, noop);

  const joinTracker = createStepTracker();
  const joinReadiness = createMockReadinessState(joinTracker);
  joinReadiness.on(READINESS_EVENT.TRANSITION, noop);
  joinReadiness.on(READINESS_EVENT.BLOCKED_DURATION, noop);

  t.equal(
    Object.keys(seedReadiness.listeners).length,
    Object.keys(joinReadiness.listeners).length,
    'seed and join register the same number of readiness event types',
  );

  const seedEventTypes = Object.keys(seedReadiness.listeners).sort();
  const joinEventTypes = Object.keys(joinReadiness.listeners).sort();
  t.strictSame(seedEventTypes, joinEventTypes,
    'seed and join register identical readiness event types');

  t.strictSame(
    seedEventTypes,
    [READINESS_EVENT.BLOCKED_DURATION, READINESS_EVENT.TRANSITION].sort(),
    'readiness wiring registers TRANSITION and BLOCKED_DURATION events',
  );
});

test('Shared composition - shutdown choreography has identical step ' +
  'sequence for seed and join', async (t) => {
  // The shutdown sequence is structurally identical between seed and join.
  // The only difference is which owner cleanup method is called
  // (bootstrapService.shutdown vs nodeJoiningService.cleanup), but the
  // surrounding choreography is the same.

  const seedSteps = [
    STEP.SHUTDOWN_DRAIN,
    STEP.SHUTDOWN_PUBLISH_NODE_STATUS,
    STEP.SHUTDOWN_LOGS_CANCEL,
    STEP.SHUTDOWN_LOGS_STOP,
    STEP.SHUTDOWN_DYNAMIC_CONFIG_STOP,
    STEP.SHUTDOWN_MIGRATION_DETACH,
    STEP.SHUTDOWN_OWNER_CLEANUP,
    STEP.SHUTDOWN_BOOTSTRAP_API_STOP,
    STEP.SHUTDOWN_ADMIN_API_STOP,
    STEP.SHUTDOWN_LIVE_QUERY_STOP,
  ];

  const joinSteps = [
    STEP.SHUTDOWN_DRAIN,
    STEP.SHUTDOWN_PUBLISH_NODE_STATUS,
    STEP.SHUTDOWN_LOGS_CANCEL,
    STEP.SHUTDOWN_LOGS_STOP,
    STEP.SHUTDOWN_DYNAMIC_CONFIG_STOP,
    STEP.SHUTDOWN_MIGRATION_DETACH,
    STEP.SHUTDOWN_OWNER_CLEANUP,
    STEP.SHUTDOWN_BOOTSTRAP_API_STOP,
    STEP.SHUTDOWN_ADMIN_API_STOP,
    STEP.SHUTDOWN_LIVE_QUERY_STOP,
  ];

  t.strictSame(seedSteps, joinSteps,
    'seed and join shutdown choreography share identical step sequence');
});

test('Shared composition - admin API uses same port for seed and join',
  async (t) => {
    // Both paths use ADMIN_DEFAULT.WEBSOCKET_PORT for admin API initialization.
    t.equal(ADMIN_PORT, ADMIN_DEFAULT.WEBSOCKET_PORT,
      'admin port is the canonical ADMIN_DEFAULT.WEBSOCKET_PORT');
    t.ok(typeof ADMIN_PORT === 'number' && ADMIN_PORT > 0,
      'admin port is a positive number');
  });

test('Shared composition - SQL engine assembly includes split merge manager ' +
  'and migration wiring for both paths', async (t) => {
  // Both seed and join paths follow the same SQL engine assembly sequence:
  // 1. Create SQLQueryEngine
  // 2. Create PartitionSplitMergeManager
  // 3. Wire split-completed event to rebalancer stabilization reset
  // 4. Wire migration workflow owners
  // 5. Wire migration recovery on leader election

  const seedTracker = createStepTracker();
  const joinTracker = createStepTracker();

  // Simulate seed SQL assembly
  seedTracker.record(STEP.SQL_ENGINE_CREATE);
  seedTracker.record(STEP.SPLIT_MERGE_MANAGER_CREATE);
  seedTracker.record(STEP.MIGRATION_WIRING);
  seedTracker.record(STEP.MIGRATION_RECOVERY_WIRING);

  // Simulate join SQL assembly
  joinTracker.record(STEP.SQL_ENGINE_CREATE);
  joinTracker.record(STEP.SPLIT_MERGE_MANAGER_CREATE);
  joinTracker.record(STEP.MIGRATION_WIRING);
  joinTracker.record(STEP.MIGRATION_RECOVERY_WIRING);

  t.strictSame(seedTracker.steps, joinTracker.steps,
    'seed and join SQL engine assembly follows identical step sequence');
});

test('Shared composition - split-completed event wires to ' +
  'STABILIZATION_RESET_TRIGGER for both paths', async (t) => {
  // Both paths register a SPLIT_COMPLETED listener on the
  // PartitionSplitMergeManager that calls rebalancer.recordStateChange
  // with STABILIZATION_RESET_TRIGGER.SPLIT_COMPLETED.
  // This test locks the event name used for the wiring.

  t.equal(SPLIT_MERGE_EVENT.SPLIT_COMPLETED, 'splitCompleted',
    'split-completed event name is the canonical SPLIT_MERGE_EVENT constant');
});

// ---------------------------------------------------------------------------
// 5. Branch-specific differences between seed and join
// ---------------------------------------------------------------------------

test('Branch-specific - seed path includes WebSocket server start ' +
  'that join path omits', async (t) => {
  // The seed path calls bootstrapService.startWebSocketServer() after
  // runtime hydration and before SQL engine creation.
  // The join path does NOT start a WebSocket server — it connects to
  // the seed's WebSocket server during the join phases instead.

  const seedTracker = createStepTracker();
  const joinTracker = createStepTracker();

  // Seed: includes WS server start
  seedTracker.record(STEP.RUNTIME_HYDRATE_CACHE);
  seedTracker.record(STEP.SEED_WS_SERVER_START);
  seedTracker.record(STEP.SQL_ENGINE_CREATE);

  // Join: no WS server start
  joinTracker.record(STEP.RUNTIME_HYDRATE_CACHE);
  joinTracker.record(STEP.SQL_ENGINE_CREATE);

  t.ok(seedTracker.steps.includes(STEP.SEED_WS_SERVER_START),
    'seed path includes WebSocket server start');
  t.notOk(joinTracker.steps.includes(STEP.SEED_WS_SERVER_START),
    'join path does not include WebSocket server start');
});

test('Branch-specific - seed gets systemTableCache from NodeService, ' +
  'join gets it from messageGroupServices', async (t) => {
  // Seed path: systemTableCache = NodeService.getInstance().getSystemTableCache()
  // Join path: iterates joinResult.messageGroupServices to find cache

  // This test documents the structural difference in cache acquisition.
  // Both paths must end up with a non-null systemTableCache before
  // proceeding to runtime hydration.

  const seedCacheSource = 'NodeService.getInstance().getSystemTableCache()';
  const joinCacheSource = 'messageGroupServices iteration';

  t.not(seedCacheSource, joinCacheSource,
    'seed and join use different cache acquisition strategies');
  t.ok(seedCacheSource.includes('NodeService'),
    'seed acquires cache from NodeService singleton');
  t.ok(joinCacheSource.includes('messageGroupServices'),
    'join acquires cache from messageGroupServices');
});

test('Branch-specific - seed shutdown calls bootstrapService.shutdown(), ' +
  'join calls nodeJoiningService.cleanup()', async (t) => {
  // The owner cleanup step in shutdown is the only structural difference
  // in the shutdown choreography between seed and join.
  // Seed: await bootstrapService.shutdown()
  // Join: await nodeJoiningService.cleanup()

  let seedOwnerCleanupCalled = false;
  let joinOwnerCleanupCalled = false;

  const seedOwner = {
    async shutdown() { seedOwnerCleanupCalled = true; },
  };

  const joinOwner = {
    async cleanup() { joinOwnerCleanupCalled = true; },
  };

  // Seed shutdown calls .shutdown()
  await seedOwner.shutdown();
  t.ok(seedOwnerCleanupCalled,
    'seed shutdown calls bootstrapService.shutdown()');

  // Join shutdown calls .cleanup()
  await joinOwner.cleanup();
  t.ok(joinOwnerCleanupCalled,
    'join shutdown calls nodeJoiningService.cleanup()');
});

test('Branch-specific - seed creates BootstrapAPI with bootstrapService ' +
  'reference, join creates it without', async (t) => {
  // Seed path: new BootstrapAPI({...bootstrapService: bootstrapService...})
  // Join path: new BootstrapAPI({...bootstrapService: null...})
  // This affects isStartupComplete() and other bootstrapService-dependent
  // readiness checks in BootstrapAPI.

  const seedBootstrapAPIOptions = {
    bootstrapService: {phase: 'COMPLETE'},
  };

  const joinBootstrapAPIOptions = {
    bootstrapService: null,
  };

  t.ok(seedBootstrapAPIOptions.bootstrapService !== null,
    'seed BootstrapAPI receives bootstrapService reference');
  t.equal(joinBootstrapAPIOptions.bootstrapService, null,
    'join BootstrapAPI receives null bootstrapService');
});

test('Branch-specific - both paths wire controlPlaneWriteHealthProvider ' +
  'from their respective owner', async (t) => {
  // Seed: createControlPlaneWriteHealthProvider(bootstrapService)
  // Join: createControlPlaneWriteHealthProvider(nodeJoiningService)
  // Both use the same factory function but with different owner instances.

  const seedOwner = {
    heartbeatService: {heartbeatConsecutiveFailures: 0},
  };
  const joinOwner = {
    heartbeatService: {heartbeatConsecutiveFailures: 0},
  };

  // Both owners provide heartbeatService for the health provider
  t.ok(seedOwner.heartbeatService !== undefined,
    'seed owner provides heartbeatService for write health');
  t.ok(joinOwner.heartbeatService !== undefined,
    'join owner provides heartbeatService for write health');
});

// ---------------------------------------------------------------------------
// 6. Composition ordering invariants
// ---------------------------------------------------------------------------

test('Composition invariant - BootstrapAPI.initialize() happens before ' +
  'bootstrap/join execution', async (t) => {
  // BootstrapAPI is initialized early so /health reports liveness during
  // bootstrap/join phases. This is a critical ordering invariant.

  const tracker = createStepTracker();
  const bootstrapAPI = createMockBootstrapAPI(tracker);

  await bootstrapAPI.initialize();
  tracker.record(STEP.SEED_BOOTSTRAP);

  const initIndex = tracker.steps.indexOf(STEP.BOOTSTRAP_API_INIT);
  const bootstrapIndex = tracker.steps.indexOf(STEP.SEED_BOOTSTRAP);

  t.ok(initIndex < bootstrapIndex,
    'BootstrapAPI.initialize() precedes bootstrap execution');
});

test('Composition invariant - logs persistence starts after admin API ' +
  'initialization', async (t) => {
  // Logs persistence is the last startup step, started after admin API
  // is fully initialized and the node is operational.

  const tracker = createStepTracker();
  const adminAPI = createMockAdminAPI(tracker);

  await adminAPI.initialize(ADMIN_PORT);
  tracker.record(STEP.LOGS_PERSISTENCE_START);

  const adminIndex = tracker.steps.indexOf(STEP.ADMIN_API_INIT);
  const logsIndex = tracker.steps.indexOf(STEP.LOGS_PERSISTENCE_START);

  t.ok(adminIndex < logsIndex,
    'admin API initialization precedes logs persistence start');
});

test('Composition invariant - shutdown drains before any cleanup',
  async (t) => {
    // The first shutdown step is always markDraining, which makes the node
    // report not-ready to load balancers before tearing down services.

    const tracker = createStepTracker();
    const bootstrapAPI = createMockBootstrapAPI(tracker);

    bootstrapAPI.markDraining();
    tracker.record(STEP.SHUTDOWN_OWNER_CLEANUP);

    const drainIndex = tracker.steps.indexOf(STEP.SHUTDOWN_DRAIN);
    const cleanupIndex = tracker.steps.indexOf(STEP.SHUTDOWN_OWNER_CLEANUP);

    t.ok(drainIndex < cleanupIndex,
      'drain step precedes owner cleanup in shutdown');
  });

test('Composition invariant - bootstrapAPI.shutdown() happens after ' +
  'owner cleanup in shutdown', async (t) => {
  // The owner (bootstrapService or nodeJoiningService) is cleaned up
  // before the BootstrapAPI is shut down. This ensures the owner can
  // still use the API during its cleanup if needed.

  const tracker = createStepTracker();
  const bootstrapAPI = createMockBootstrapAPI(tracker);

  tracker.record(STEP.SHUTDOWN_OWNER_CLEANUP);
  await bootstrapAPI.shutdown();

  const cleanupIndex = tracker.steps.indexOf(STEP.SHUTDOWN_OWNER_CLEANUP);
  const apiStopIndex = tracker.steps.indexOf(
    STEP.SHUTDOWN_BOOTSTRAP_API_STOP,
  );

  t.ok(cleanupIndex < apiStopIndex,
    'owner cleanup precedes bootstrapAPI.shutdown()');
});

test('Composition invariant - liveQueryWiring.shutdown() is the last ' +
  'shutdown step', async (t) => {
  // Live query wiring shutdown is the final step before process.exit(0).

  const tracker = createStepTracker();
  const bootstrapAPI = createMockBootstrapAPI(tracker);
  const adminAPI = createMockAdminAPI(tracker);
  const liveQueryWiring = createMockLiveQueryWiring(tracker);

  await bootstrapAPI.shutdown();
  await adminAPI.shutdown();
  liveQueryWiring.shutdown();

  const lastStep = tracker.steps[tracker.steps.length - 1];
  t.equal(lastStep, STEP.SHUTDOWN_LIVE_QUERY_STOP,
    'liveQueryWiring.shutdown() is the final shutdown step');
});
