/**
 * Tests for concern-scoped seed delegate bundles (D2.2).
 *
 * Verifies that _buildSeedDelegateBundles produces four concern-scoped
 * bundles (phaseExecution, readiness, cleanup, runtimeWiring) and that
 * _composeSeedDelegates merges them correctly for phase owners and
 * cleanup-only consumers.
 *
 * Requirements: 1.1, 1.4
 * Design: D2.2, D2.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {
  SEED_DELEGATE_BUNDLE,
} from '../../src/bootstrap/bootstrap-constants.js';

const TEST_NODE_ID = 'delegate-bundle-test-node';
const TEST_NODE_ADDRESS = 'ws://localhost:19999';
const TEST_WS_PORT = 19999;

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: TEST_NODE_ID},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function createService() {
  return new BootstrapService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    wsPort: TEST_WS_PORT,
    config: {partitionDbPath: ':memory:'},
  });
}

test('SEED_DELEGATE_BUNDLE exposes four concern keys', (t) => {
  const keys = Object.keys(SEED_DELEGATE_BUNDLE);
  t.equal(keys.length, 4,
    'exactly four bundle concerns');
  t.ok(SEED_DELEGATE_BUNDLE.PHASE_EXECUTION,
    'phaseExecution bundle key exists');
  t.ok(SEED_DELEGATE_BUNDLE.READINESS,
    'readiness bundle key exists');
  t.ok(SEED_DELEGATE_BUNDLE.CLEANUP,
    'cleanup bundle key exists');
  t.ok(SEED_DELEGATE_BUNDLE.RUNTIME_WIRING,
    'runtimeWiring bundle key exists');
  t.end();
});

test('_buildSeedDelegateBundles returns four concern-scoped bundles',
  (t) => {
    initializeTestEnvironment();
    const service = createService();
    const bundles = service._buildSeedDelegateBundles();

    t.ok(bundles[SEED_DELEGATE_BUNDLE.PHASE_EXECUTION],
      'phaseExecution bundle present');
    t.ok(bundles[SEED_DELEGATE_BUNDLE.READINESS],
      'readiness bundle present');
    t.ok(bundles[SEED_DELEGATE_BUNDLE.CLEANUP],
      'cleanup bundle present');
    t.ok(bundles[SEED_DELEGATE_BUNDLE.RUNTIME_WIRING],
      'runtimeWiring bundle present');
    t.end();
  });

test('phaseExecution bundle contains phase-specific delegates ' +
  'not present in cleanup bundle', (t) => {
  initializeTestEnvironment();
  const service = createService();
  const bundles = service._buildSeedDelegateBundles();
  const phase = bundles[SEED_DELEGATE_BUNDLE.PHASE_EXECUTION];
  const cleanup = bundles[SEED_DELEGATE_BUNDLE.CLEANUP];

  // Phase execution owns lifecycle manager access
  t.equal(typeof phase.getServiceLifecycleManager, 'function',
    'phaseExecution has getServiceLifecycleManager');
  t.equal(typeof phase.getServiceReconciler, 'function',
    'phaseExecution has getServiceReconciler');
  t.equal(typeof phase.createBootstrapServiceDescriptor, 'function',
    'phaseExecution has createBootstrapServiceDescriptor');

  // Cleanup does NOT own lifecycle manager access
  t.equal(cleanup.getServiceLifecycleManager, undefined,
    'cleanup does not have getServiceLifecycleManager');
  t.equal(cleanup.getServiceReconciler, undefined,
    'cleanup does not have getServiceReconciler');
  t.end();
});

test('cleanup bundle contains teardown helpers ' +
  'not present in phaseExecution bundle', (t) => {
  initializeTestEnvironment();
  const service = createService();
  const bundles = service._buildSeedDelegateBundles();
  const phase = bundles[SEED_DELEGATE_BUNDLE.PHASE_EXECUTION];
  const cleanup = bundles[SEED_DELEGATE_BUNDLE.CLEANUP];

  // Cleanup owns resource teardown helpers
  t.equal(typeof cleanup.clearCdcIntegrationService, 'function',
    'cleanup has clearCdcIntegrationService');
  t.equal(typeof cleanup.stopAndClearControlPlaneServices,
    'function',
    'cleanup has stopAndClearControlPlaneServices');
  t.equal(typeof cleanup.clearReplicaStateMachine, 'function',
    'cleanup has clearReplicaStateMachine');
  t.equal(typeof cleanup.clearRebalanceCoordinator, 'function',
    'cleanup has clearRebalanceCoordinator');

  // Phase execution does NOT own teardown helpers
  t.equal(phase.clearCdcIntegrationService, undefined,
    'phaseExecution does not have clearCdcIntegrationService');
  t.equal(phase.stopAndClearControlPlaneServices, undefined,
    'phaseExecution does not have ' +
    'stopAndClearControlPlaneServices');
  t.end();
});

test('readiness bundle contains lifecycle state machine accessor',
  (t) => {
    initializeTestEnvironment();
    const service = createService();
    const bundles = service._buildSeedDelegateBundles();
    const readiness = bundles[SEED_DELEGATE_BUNDLE.READINESS];

    t.equal(typeof readiness.getLifecycleStateMachine,
      'function',
      'readiness has getLifecycleStateMachine');
    t.equal(typeof readiness.getBootstrapReadinessState,
      'function',
      'readiness has getBootstrapReadinessState');
    t.end();
  });

test('runtimeWiring bundle contains post-phase wiring accessors',
  (t) => {
    initializeTestEnvironment();
    const service = createService();
    const bundles = service._buildSeedDelegateBundles();
    const wiring = bundles[SEED_DELEGATE_BUNDLE.RUNTIME_WIRING];

    t.equal(typeof wiring.getSystemTableCache, 'function',
      'runtimeWiring has getSystemTableCache');
    t.equal(typeof wiring.getMessageRouter, 'function',
      'runtimeWiring has getMessageRouter');
    t.equal(typeof wiring.getRebalanceCoordinator, 'function',
      'runtimeWiring has getRebalanceCoordinator');
    t.equal(typeof wiring.getCdcIntegrationService, 'function',
      'runtimeWiring has getCdcIntegrationService');
    t.equal(typeof wiring.getEpochManager, 'function',
      'runtimeWiring has getEpochManager');
    t.end();
  });

test('_composeSeedDelegates merges all bundles for phase owners',
  (t) => {
    initializeTestEnvironment();
    const service = createService();
    const bundles = service._buildSeedDelegateBundles();
    const composed = service._composeSeedDelegates(bundles);

    // Phase execution delegates present
    t.equal(typeof composed.getNodeId, 'function',
      'composed has getNodeId from phaseExecution');
    t.equal(typeof composed.createBootstrapServiceDescriptor,
      'function',
      'composed has createBootstrapServiceDescriptor');

    // Readiness delegates present
    t.equal(typeof composed.getLifecycleStateMachine, 'function',
      'composed has getLifecycleStateMachine from readiness');

    // Cleanup delegates present
    t.equal(typeof composed.clearCdcIntegrationService,
      'function',
      'composed has clearCdcIntegrationService from cleanup');

    // Runtime wiring delegates present
    t.equal(typeof composed.getSystemTableCache, 'function',
      'composed has getSystemTableCache from runtimeWiring');
    t.end();
  });

test('_composeSeedDelegates with cleanupOnly omits ' +
  'phaseExecution and runtimeWiring delegates', (t) => {
  initializeTestEnvironment();
  const service = createService();
  const bundles = service._buildSeedDelegateBundles();
  const cleanupDelegates = service._composeSeedDelegates(
    bundles, {cleanupOnly: true},
  );

  // Cleanup delegates present
  t.equal(typeof cleanupDelegates.clearCdcIntegrationService,
    'function',
    'cleanupOnly has clearCdcIntegrationService');
  t.equal(typeof cleanupDelegates.getNodeId, 'function',
    'cleanupOnly has getNodeId from cleanup bundle');

  // Readiness delegates present
  t.equal(typeof cleanupDelegates.getLifecycleStateMachine,
    'function',
    'cleanupOnly has getLifecycleStateMachine from readiness');

  // Phase-only delegates absent
  t.equal(cleanupDelegates.getServiceLifecycleManager,
    undefined,
    'cleanupOnly does not have getServiceLifecycleManager');
  t.equal(cleanupDelegates.createBootstrapServiceDescriptor,
    undefined,
    'cleanupOnly does not have ' +
    'createBootstrapServiceDescriptor');
  t.equal(cleanupDelegates.resolvePartitionDbPath, undefined,
    'cleanupOnly does not have resolvePartitionDbPath');
  t.end();
});

test('SeedCleanupHandler receives cleanup+readiness delegates ' +
  'via cleanupOnly composition', (t) => {
  initializeTestEnvironment();
  const service = createService();
  const handler = service.seedCleanupHandler;
  const d = handler.delegates;

  // Cleanup delegates wired
  t.equal(typeof d.clearCdcIntegrationService, 'function',
    'handler has clearCdcIntegrationService');
  t.equal(typeof d.stopAndClearControlPlaneServices, 'function',
    'handler has stopAndClearControlPlaneServices');
  t.equal(typeof d.setIsShuttingDown, 'function',
    'handler has setIsShuttingDown');

  // Readiness delegates wired
  t.equal(typeof d.getLifecycleStateMachine, 'function',
    'handler has getLifecycleStateMachine');

  // Phase-only delegates absent
  t.equal(d.getServiceLifecycleManager, undefined,
    'handler does not have getServiceLifecycleManager');
  t.equal(d.createBootstrapServiceDescriptor, undefined,
    'handler does not have createBootstrapServiceDescriptor');
  t.end();
});

test('phase owners receive full composed delegates ' +
  'including all four bundles', (t) => {
  initializeTestEnvironment();
  const service = createService();

  // Each phase owner should have the full composed delegates
  const infraDelegates =
    service.seedInfrastructurePhase.delegates;
  const mgDelegates =
    service.seedMessageGroupsPhase.delegates;
  const partDelegates =
    service.seedPartitionsPhase.delegates;
  const regDelegates =
    service.seedRegistrationPhase.delegates;
  const cacheDelegates =
    service.seedCacheHydrationPhase.delegates;

  for (const [name, d] of [
    ['infrastructure', infraDelegates],
    ['messageGroups', mgDelegates],
    ['partitions', partDelegates],
    ['registration', regDelegates],
    ['cacheHydration', cacheDelegates],
  ]) {
    // Phase execution delegates
    t.equal(typeof d.getNodeId, 'function',
      `${name} has getNodeId`);
    t.equal(typeof d.getConfig, 'function',
      `${name} has getConfig`);
    t.equal(typeof d.getLogger, 'function',
      `${name} has getLogger`);
    // Readiness delegates
    t.equal(typeof d.getLifecycleStateMachine, 'function',
      `${name} has getLifecycleStateMachine`);
    // Cleanup delegates (available but not primary concern)
    t.equal(typeof d.clearCdcIntegrationService, 'function',
      `${name} has clearCdcIntegrationService`);
    // Runtime wiring delegates
    t.equal(typeof d.getSystemTableCache, 'function',
      `${name} has getSystemTableCache`);
  }
  t.end();
});
