/**
 * Tests for concern-scoped join delegate bundles (D2.2).
 *
 * Verifies that _buildJoinDelegateBundles produces four concern-scoped
 * bundles (phaseExecution, readiness, cleanup, runtimeWiring) and that
 * _composeJoinDelegates merges them correctly for phase owners and
 * cleanup-only consumers.
 *
 * Requirements: 1.2, 1.4
 * Design: D2.2, D2.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {
  JOIN_DELEGATE_BUNDLE,
} from '../../src/bootstrap/bootstrap-constants.js';

const TEST_NODE_ID = 'join-delegate-bundle-test-node';
const TEST_NODE_ADDRESS = 'ws://localhost:19999';
const TEST_SEED_ADDRESS = 'http://localhost:18081';

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
  return new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_ADDRESS,
    config: {cdcPipelineReadinessTimeoutMs: 50},
  });
}

test('JOIN_DELEGATE_BUNDLE exposes four concern keys', (t) => {
  const keys = Object.keys(JOIN_DELEGATE_BUNDLE);
  t.equal(keys.length, 4,
    'exactly four bundle concerns');
  t.ok(JOIN_DELEGATE_BUNDLE.PHASE_EXECUTION,
    'phaseExecution bundle key exists');
  t.ok(JOIN_DELEGATE_BUNDLE.READINESS,
    'readiness bundle key exists');
  t.ok(JOIN_DELEGATE_BUNDLE.CLEANUP,
    'cleanup bundle key exists');
  t.ok(JOIN_DELEGATE_BUNDLE.RUNTIME_WIRING,
    'runtimeWiring bundle key exists');
  t.end();
});

test('_buildJoinDelegateBundles returns four concern-scoped bundles',
  (t) => {
    initializeTestEnvironment();
    const service = createService();
    const bundles = service._buildJoinDelegateBundles();

    t.ok(bundles[JOIN_DELEGATE_BUNDLE.PHASE_EXECUTION],
      'phaseExecution bundle present');
    t.ok(bundles[JOIN_DELEGATE_BUNDLE.READINESS],
      'readiness bundle present');
    t.ok(bundles[JOIN_DELEGATE_BUNDLE.CLEANUP],
      'cleanup bundle present');
    t.ok(bundles[JOIN_DELEGATE_BUNDLE.RUNTIME_WIRING],
      'runtimeWiring bundle present');
    t.end();
  });

test('phaseExecution bundle contains phase-specific delegates ' +
  'not present in cleanup bundle', (t) => {
  initializeTestEnvironment();
  const service = createService();
  const bundles = service._buildJoinDelegateBundles();
  const phase = bundles[JOIN_DELEGATE_BUNDLE.PHASE_EXECUTION];
  const cleanup = bundles[JOIN_DELEGATE_BUNDLE.CLEANUP];

  // Phase execution owns seed contact and retry helpers
  t.equal(typeof phase.resolveJoinRetryPolicy, 'function',
    'phaseExecution has resolveJoinRetryPolicy');
  t.equal(typeof phase.classifySeedContactFailure, 'function',
    'phaseExecution has classifySeedContactFailure');
  t.equal(typeof phase.computeSeedContactRetryDelayMs, 'function',
    'phaseExecution has computeSeedContactRetryDelayMs');
  t.equal(typeof phase.createJoinServiceDescriptor, 'function',
    'phaseExecution has createJoinServiceDescriptor');

  // Cleanup does NOT own phase execution helpers
  t.equal(cleanup.resolveJoinRetryPolicy, undefined,
    'cleanup does not have resolveJoinRetryPolicy');
  t.equal(cleanup.classifySeedContactFailure, undefined,
    'cleanup does not have classifySeedContactFailure');
  t.equal(cleanup.createJoinServiceDescriptor, undefined,
    'cleanup does not have createJoinServiceDescriptor');
  t.end();
});

test('cleanup bundle contains teardown helpers ' +
  'not present in phaseExecution bundle', (t) => {
  initializeTestEnvironment();
  const service = createService();
  const bundles = service._buildJoinDelegateBundles();
  const phase = bundles[JOIN_DELEGATE_BUNDLE.PHASE_EXECUTION];
  const cleanup = bundles[JOIN_DELEGATE_BUNDLE.CLEANUP];

  // Cleanup owns resource teardown helpers
  t.equal(typeof cleanup.setRebalanceCoordinator, 'function',
    'cleanup has setRebalanceCoordinator');
  t.equal(typeof cleanup.setReplicaStateMachine, 'function',
    'cleanup has setReplicaStateMachine');
  t.equal(typeof cleanup.setHeartbeatService, 'function',
    'cleanup has setHeartbeatService');
  t.equal(typeof cleanup.setLeaseService, 'function',
    'cleanup has setLeaseService');
  t.equal(typeof cleanup.setEndpointService, 'function',
    'cleanup has setEndpointService');
  t.equal(typeof cleanup.setDispatchService, 'function',
    'cleanup has setDispatchService');
  t.equal(typeof cleanup.setRpcClient, 'function',
    'cleanup has setRpcClient');
  t.equal(typeof cleanup.setReplicaHandler, 'function',
    'cleanup has setReplicaHandler');
  t.equal(typeof cleanup.stopJoiningLifecycleOwners, 'function',
    'cleanup has stopJoiningLifecycleOwners');

  // Phase execution does NOT own teardown helpers
  t.equal(phase.setRebalanceCoordinator, undefined,
    'phaseExecution does not have setRebalanceCoordinator');
  t.equal(phase.setReplicaStateMachine, undefined,
    'phaseExecution does not have setReplicaStateMachine');
  t.equal(phase.stopJoiningLifecycleOwners, undefined,
    'phaseExecution does not have stopJoiningLifecycleOwners');
  t.end();
});

test('readiness bundle contains lifecycle state machine accessor',
  (t) => {
    initializeTestEnvironment();
    const service = createService();
    const bundles = service._buildJoinDelegateBundles();
    const readiness = bundles[JOIN_DELEGATE_BUNDLE.READINESS];

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
    const bundles = service._buildJoinDelegateBundles();
    const wiring = bundles[JOIN_DELEGATE_BUNDLE.RUNTIME_WIRING];

    t.equal(typeof wiring.getSystemTableCache, 'function',
      'runtimeWiring has getSystemTableCache');
    t.equal(typeof wiring.getMessageRouter, 'function',
      'runtimeWiring has getMessageRouter');
    t.equal(typeof wiring.getRebalanceCoordinator, 'function',
      'runtimeWiring has getRebalanceCoordinator');
    t.equal(typeof wiring.getCdcIntegrationService, 'function',
      'runtimeWiring has getCdcIntegrationService');
    t.end();
  });

test('_composeJoinDelegates merges all bundles for phase owners',
  (t) => {
    initializeTestEnvironment();
    const service = createService();
    const bundles = service._buildJoinDelegateBundles();
    const composed = service._composeJoinDelegates(bundles);

    // Phase execution delegates present
    t.equal(typeof composed.getNodeId, 'function',
      'composed has getNodeId from phaseExecution');
    t.equal(typeof composed.createJoinServiceDescriptor,
      'function',
      'composed has createJoinServiceDescriptor');

    // Readiness delegates present
    t.equal(typeof composed.getLifecycleStateMachine,
      'function',
      'composed has getLifecycleStateMachine from readiness');

    // Cleanup delegates present
    t.equal(typeof composed.setRebalanceCoordinator,
      'function',
      'composed has setRebalanceCoordinator from cleanup');

    // Runtime wiring delegates present
    t.equal(typeof composed.getSystemTableCache, 'function',
      'composed has getSystemTableCache from runtimeWiring');
    t.end();
  });

test('_composeJoinDelegates with cleanupOnly omits ' +
  'phaseExecution and runtimeWiring delegates', (t) => {
  initializeTestEnvironment();
  const service = createService();
  const bundles = service._buildJoinDelegateBundles();
  const cleanupDelegates = service._composeJoinDelegates(
    bundles, {cleanupOnly: true},
  );

  // Cleanup delegates present
  t.equal(typeof cleanupDelegates.setRebalanceCoordinator,
    'function',
    'cleanupOnly has setRebalanceCoordinator');
  t.equal(typeof cleanupDelegates.getNodeId, 'function',
    'cleanupOnly has getNodeId from cleanup bundle');

  // Readiness delegates present
  t.equal(typeof cleanupDelegates.getLifecycleStateMachine,
    'function',
    'cleanupOnly has getLifecycleStateMachine from readiness');

  // Phase-only delegates absent
  t.equal(cleanupDelegates.resolveJoinRetryPolicy,
    undefined,
    'cleanupOnly does not have resolveJoinRetryPolicy');
  t.equal(cleanupDelegates.createJoinServiceDescriptor,
    undefined,
    'cleanupOnly does not have createJoinServiceDescriptor');
  t.equal(cleanupDelegates.computeSeedContactRetryDelayMs,
    undefined,
    'cleanupOnly does not have ' +
    'computeSeedContactRetryDelayMs');
  t.end();
});

test('JoinCleanupHandler receives cleanup+readiness delegates ' +
  'via cleanupOnly composition', (t) => {
  initializeTestEnvironment();
  const service = createService();
  const handler = service.joinCleanupHandler;
  const d = handler.delegates;

  // Cleanup delegates wired
  t.equal(typeof d.getLogger, 'function',
    'handler has getLogger');
  t.equal(typeof d.setRebalanceCoordinator, 'function',
    'handler has setRebalanceCoordinator');
  t.equal(typeof d.stopJoiningLifecycleOwners, 'function',
    'handler has stopJoiningLifecycleOwners');

  // Readiness delegates wired
  t.equal(typeof d.getLifecycleStateMachine, 'function',
    'handler has getLifecycleStateMachine');

  // Phase-only delegates absent
  t.equal(d.resolveJoinRetryPolicy, undefined,
    'handler does not have resolveJoinRetryPolicy');
  t.equal(d.createJoinServiceDescriptor, undefined,
    'handler does not have createJoinServiceDescriptor');
  t.end();
});

