/**
 * Unit tests for BootstrapService.cleanupFailedBootstrap()
 * Tests the reverse-order cleanup of partial state after a failed
 * seed node bootstrap.
 *
 * Validates: Requirements 7.1, 7.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {
  BOOTSTRAP_PHASE,
  BOOTSTRAP_CLEANUP_STEP,
} from '../../src/bootstrap/bootstrap-constants.js';
import {NodeState} from '../../src/node/node-lifecycle-state-machine.js';

/**
 * Create a minimal BootstrapService with stubs for cleanup testing.
 * @param {Object} overrides - Override specific fields.
 * @return {BootstrapService} Configured service instance.
 */
function createTestBootstrapService(overrides = {}) {
  const service = new BootstrapService({
    nodeId: 'test-seed-node',
    nodeAddress: 'http://localhost:3000',
    wsPort: null,
  });

  // Override logger to capture log calls without console output
  const logEntries = [];
  service.logger = {
    info: (msg, ctx) => logEntries.push({level: 'info', msg, ctx}),
    warn: (msg, ctx) => logEntries.push({level: 'warn', msg, ctx}),
    error: (msg, ctx) => logEntries.push({level: 'error', msg, ctx}),
    debug: (msg, ctx) => logEntries.push({level: 'debug', msg, ctx}),
  };
  service._testLogEntries = logEntries;

  // Apply overrides
  Object.assign(service, overrides);

  return service;
}

/**
 * Create a mock partition service.
 * @param {string} replicaId - Replica ID.
 * @return {Object} Mock partition service.
 */
function createMockPartition(replicaId) {
  return {
    partitionId: replicaId,
    shutdownCalled: false,
    getUnifiedAddress: () =>
      `test-seed-node/partition/${replicaId}`,
    shutdown: async function() {
      this.shutdownCalled = true;
    },
  };
}

/**
 * Create a mock message group service.
 * @param {string} replicaId - Replica ID.
 * @return {Object} Mock message group service.
 */
function createMockMessageGroup(replicaId) {
  return {
    groupId: 'mg-1',
    replicaId,
    shutdownCalled: false,
    systemTableCache: null,
    shutdown: async function() {
      this.shutdownCalled = true;
    },
  };
}

/**
 * Create a mock message router.
 * @return {Object} Mock message router.
 */
function createMockRouter() {
  const unregistered = [];
  return {
    shutdownCalled: false,
    unregisteredAddresses: unregistered,
    unregister: (address) => unregistered.push(address),
    shutdown: async function() {
      this.shutdownCalled = true;
    },
  };
}

/**
 * Create a mock system table cache.
 * @return {Object} Mock system table cache.
 */
function createMockCache() {
  return {
    cleared: false,
    clear: function() {
      this.cleared = true;
    },
  };
}

test('cleanupFailedBootstrap - clears cache when failing at CACHE_HYDRATION', async (t) => {
  const cache = createMockCache();
  const service = createTestBootstrapService({
    systemTableCache: cache,
  });

  const cleanupContext = {
    createdPartitions: [],
    createdServices: [],
    createdMessageGroups: [],
    registeredNodeId: 'test-seed-node',
  };

  await service.cleanupFailedBootstrap(
    BOOTSTRAP_PHASE.CACHE_HYDRATION,
    cleanupContext,
  );

  t.ok(cache.cleared, 'should clear the system table cache');
  t.equal(service.systemTableCache, null, 'should null out cache ref');
  t.equal(
    service.lifecycleStateMachine.getState(),
    NodeState.STOPPED,
    'should transition to STOPPED',
  );
  t.end();
});

test('cleanupFailedBootstrap - stops partitions when failing at PARTITIONS', async (t) => {
  const p1 = createMockPartition('p1-r1');
  const p2 = createMockPartition('p1-r2');
  const router = createMockRouter();

  const partitionServices = new Map();
  partitionServices.set('p1-r1', p1);
  partitionServices.set('p1-r2', p2);

  const service = createTestBootstrapService({
    partitionServices,
    messageRouter: router,
    transport: router,
  });

  const cleanupContext = {
    createdPartitions: ['p1-r1', 'p1-r2'],
    createdServices: ['p1-r1', 'p1-r2'],
    createdMessageGroups: [],
    registeredNodeId: null,
  };

  await service.cleanupFailedBootstrap(
    BOOTSTRAP_PHASE.PARTITIONS,
    cleanupContext,
  );

  t.ok(p1.shutdownCalled, 'should shutdown partition p1-r1');
  t.ok(p2.shutdownCalled, 'should shutdown partition p1-r2');
  t.equal(partitionServices.size, 0, 'should clear partition map');
  t.ok(router.shutdownCalled, 'should shutdown router');
  t.equal(
    service.lifecycleStateMachine.getState(),
    NodeState.STOPPED,
    'should transition to STOPPED',
  );
  t.end();
});

test('cleanupFailedBootstrap - stops MG services when failing at MESSAGE_GROUPS', async (t) => {
  const mg1 = createMockMessageGroup('mg-1-r1');
  const mg2 = createMockMessageGroup('mg-1-r2');
  const router = createMockRouter();

  const messageGroupServices = new Map();
  messageGroupServices.set('mg-1-r1', mg1);
  messageGroupServices.set('mg-1-r2', mg2);

  const service = createTestBootstrapService({
    messageGroupServices,
    messageGroupReplicas: [mg1, mg2],
    messageRouter: router,
    transport: router,
  });

  const cleanupContext = {
    createdPartitions: [],
    createdServices: ['mg-1-r1', 'mg-1-r2'],
    createdMessageGroups: ['mg-1'],
    registeredNodeId: null,
  };

  await service.cleanupFailedBootstrap(
    BOOTSTRAP_PHASE.MESSAGE_GROUPS,
    cleanupContext,
  );

  t.ok(mg1.shutdownCalled, 'should shutdown MG mg-1-r1');
  t.ok(mg2.shutdownCalled, 'should shutdown MG mg-1-r2');
  t.equal(messageGroupServices.size, 0, 'should clear MG map');
  t.ok(router.shutdownCalled, 'should shutdown router');
  t.equal(
    service.lifecycleStateMachine.getState(),
    NodeState.STOPPED,
    'should transition to STOPPED',
  );
  t.end();
});

test('cleanupFailedBootstrap - stops router when failing at INFRASTRUCTURE', async (t) => {
  const router = createMockRouter();

  const service = createTestBootstrapService({
    messageRouter: router,
    transport: router,
  });

  const cleanupContext = {
    createdPartitions: [],
    createdServices: [],
    createdMessageGroups: [],
    registeredNodeId: null,
  };

  await service.cleanupFailedBootstrap(
    BOOTSTRAP_PHASE.INFRASTRUCTURE,
    cleanupContext,
  );

  t.ok(router.shutdownCalled, 'should shutdown router');
  t.equal(service.messageRouter, null, 'should null out router');
  t.equal(service.transport, null, 'should null out transport');
  t.equal(
    service.lifecycleStateMachine.getState(),
    NodeState.STOPPED,
    'should transition to STOPPED',
  );
  t.end();
});

test('cleanupFailedBootstrap - REGISTRATION cleans up control plane and writer', async (t) => {
  let heartbeatStopped = false;
  let leaseStopped = false;
  let endpointStopped = false;
  let dispatchStopped = false;
  let rpcShutdown = false;
  let replicaHandlerShutdown = false;
  let replicaHandlerUnregistered = false;
  let writerDisabled = false;
  let replicaSmCleared = false;

  const router = createMockRouter();

  const service = createTestBootstrapService({
    messageRouter: router,
    transport: router,
    heartbeatService: {
      stop: () => {
        heartbeatStopped = true;
      },
    },
    leaseService: {
      stop: () => {
        leaseStopped = true;
      },
    },
    endpointService: {
      stop: () => {
        endpointStopped = true;
      },
    },
    dispatchService: {
      stop: () => {
        dispatchStopped = true;
      },
    },
    rpcClient: {
      shutdown: async () => {
        rpcShutdown = true;
      },
    },
    replicaHandler: {
      unregisterFromRouter: () => {
        replicaHandlerUnregistered = true;
      },
      shutdown: () => {
        replicaHandlerShutdown = true;
      },
    },
    systemTableWriter: {
      disable: () => {
        writerDisabled = true;
      },
    },
    replicaStateMachine: {
      stopTimeoutChecker: () => {},
      clear: () => {
        replicaSmCleared = true;
      },
    },
    epochManager: {some: 'manager'},
    tablePolicyService: {some: 'policy'},
    rebalanceCoordinator: {some: 'coordinator'},
  });

  const cleanupContext = {
    createdPartitions: [],
    createdServices: [],
    createdMessageGroups: [],
    registeredNodeId: 'test-seed-node',
  };

  await service.cleanupFailedBootstrap(
    BOOTSTRAP_PHASE.REGISTRATION,
    cleanupContext,
  );

  t.ok(heartbeatStopped, 'should stop heartbeat service');
  t.ok(leaseStopped, 'should stop lease service');
  t.ok(endpointStopped, 'should stop endpoint service');
  t.ok(dispatchStopped, 'should stop dispatch service');
  t.ok(rpcShutdown, 'should shutdown RPC client');
  t.ok(replicaHandlerShutdown, 'should shutdown replica handler');
  t.ok(replicaHandlerUnregistered, 'should unregister replica handler');
  t.ok(writerDisabled, 'should disable system table writer');
  t.ok(replicaSmCleared, 'should clear replica state machine');
  t.equal(service.heartbeatService, null, 'should null heartbeat svc');
  t.equal(service.leaseService, null, 'should null lease svc');
  t.equal(service.endpointService, null, 'should null endpoint svc');
  t.equal(service.dispatchService, null, 'should null dispatch svc');
  t.equal(service.rpcClient, null, 'should null RPC client');
  t.equal(service.replicaHandler, null, 'should null replica handler');
  t.equal(service.systemTableWriter, null, 'should null writer');
  t.equal(service.replicaStateMachine, null, 'should null replica SM');
  t.equal(service.epochManager, null, 'should null epoch manager');
  t.equal(service.tablePolicyService, null, 'should null policy svc');
  t.equal(service.rebalanceCoordinator, null, 'should null coordinator');
  t.end();
});

test('cleanupFailedBootstrap - cleanup errors are logged but not thrown', async (t) => {
  const service = createTestBootstrapService({
    systemTableCache: {
      clear: () => {
        throw new Error('cache clear exploded');
      },
    },
    messageRouter: {
      shutdown: async () => {
        throw new Error('router shutdown exploded');
      },
      unregister: () => {},
    },
    transport: null,
  });

  const cleanupContext = {
    createdPartitions: [],
    createdServices: [],
    createdMessageGroups: [],
    registeredNodeId: null,
  };

  // Should NOT throw even though cleanup steps fail
  await service.cleanupFailedBootstrap(
    BOOTSTRAP_PHASE.CACHE_HYDRATION,
    cleanupContext,
  );

  // Verify errors were logged
  const warnings = service._testLogEntries
    .filter((e) => e.level === 'warn');
  t.ok(
    warnings.length > 0,
    'should log warnings for cleanup errors',
  );
  t.equal(
    service.lifecycleStateMachine.getState(),
    NodeState.STOPPED,
    'should still transition to STOPPED',
  );
  t.end();
});

test('cleanupFailedBootstrap - reverse order: CACHE_HYDRATION runs all 5 steps', async (t) => {
  const stepsExecuted = [];

  const cache = createMockCache();
  const router = createMockRouter();
  const mg = createMockMessageGroup('mg-r1');
  const partition = createMockPartition('p-r1');

  const messageGroupServices = new Map();
  messageGroupServices.set('mg-r1', mg);
  const partitionServices = new Map();
  partitionServices.set('p-r1', partition);

  const service = createTestBootstrapService({
    systemTableCache: cache,
    messageRouter: router,
    transport: router,
    messageGroupServices,
    messageGroupReplicas: [mg],
    partitionServices,
  });

  // Intercept cleanup steps to track execution order
  const origCache = service._cleanupCacheHydration.bind(service);
  service._cleanupCacheHydration = async () => {
    stepsExecuted.push(BOOTSTRAP_CLEANUP_STEP.CACHE_HYDRATION);
    return origCache();
  };
  const origReg = service._cleanupRegistration.bind(service);
  service._cleanupRegistration = async (ctx) => {
    stepsExecuted.push(BOOTSTRAP_CLEANUP_STEP.REGISTRATION);
    return origReg(ctx);
  };
  const origPart = service._cleanupPartitions.bind(service);
  service._cleanupPartitions = async () => {
    stepsExecuted.push(BOOTSTRAP_CLEANUP_STEP.PARTITIONS);
    return origPart();
  };
  const origMg = service._cleanupMessageGroups.bind(service);
  service._cleanupMessageGroups = async () => {
    stepsExecuted.push(BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS);
    return origMg();
  };
  const origInfra = service._cleanupInfrastructure.bind(service);
  service._cleanupInfrastructure = async () => {
    stepsExecuted.push(BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE);
    return origInfra();
  };

  const cleanupContext = {
    createdPartitions: ['p-r1'],
    createdServices: ['mg-r1', 'p-r1'],
    createdMessageGroups: ['mg-1'],
    registeredNodeId: 'test-seed-node',
  };

  await service.cleanupFailedBootstrap(
    BOOTSTRAP_PHASE.CACHE_HYDRATION,
    cleanupContext,
  );

  t.same(stepsExecuted, [
    BOOTSTRAP_CLEANUP_STEP.CACHE_HYDRATION,
    BOOTSTRAP_CLEANUP_STEP.REGISTRATION,
    BOOTSTRAP_CLEANUP_STEP.PARTITIONS,
    BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS,
    BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE,
  ], 'should execute all 5 steps in reverse order');
  t.end();
});

test('cleanupFailedBootstrap - PARTITIONS skips cache and registration steps', async (t) => {
  const stepsExecuted = [];

  const router = createMockRouter();
  const partition = createMockPartition('p-r1');
  const mg = createMockMessageGroup('mg-r1');

  const partitionServices = new Map();
  partitionServices.set('p-r1', partition);
  const messageGroupServices = new Map();
  messageGroupServices.set('mg-r1', mg);

  const service = createTestBootstrapService({
    messageRouter: router,
    transport: router,
    partitionServices,
    messageGroupServices,
    messageGroupReplicas: [mg],
  });

  // Track which steps run
  const origPart = service._cleanupPartitions.bind(service);
  service._cleanupPartitions = async () => {
    stepsExecuted.push(BOOTSTRAP_CLEANUP_STEP.PARTITIONS);
    return origPart();
  };
  const origMg = service._cleanupMessageGroups.bind(service);
  service._cleanupMessageGroups = async () => {
    stepsExecuted.push(BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS);
    return origMg();
  };
  const origInfra = service._cleanupInfrastructure.bind(service);
  service._cleanupInfrastructure = async () => {
    stepsExecuted.push(BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE);
    return origInfra();
  };

  const cleanupContext = {
    createdPartitions: ['p-r1'],
    createdServices: ['mg-r1', 'p-r1'],
    createdMessageGroups: ['mg-1'],
    registeredNodeId: null,
  };

  await service.cleanupFailedBootstrap(
    BOOTSTRAP_PHASE.PARTITIONS,
    cleanupContext,
  );

  t.same(stepsExecuted, [
    BOOTSTRAP_CLEANUP_STEP.PARTITIONS,
    BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS,
    BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE,
  ], 'should only run PARTITIONS, MESSAGE_GROUPS, INFRASTRUCTURE');
  t.end();
});

test('cleanupFailedBootstrap - partition shutdown error does not stop other cleanup', async (t) => {
  const failingPartition = {
    partitionId: 'p-fail',
    getUnifiedAddress: () => 'test-seed-node/partition/p-fail',
    shutdown: async () => {
      throw new Error('partition shutdown failed');
    },
  };
  const goodPartition = createMockPartition('p-good');
  const router = createMockRouter();

  const partitionServices = new Map();
  partitionServices.set('p-fail', failingPartition);
  partitionServices.set('p-good', goodPartition);

  const service = createTestBootstrapService({
    partitionServices,
    messageRouter: router,
    transport: router,
  });

  const cleanupContext = {
    createdPartitions: ['p-fail', 'p-good'],
    createdServices: [],
    createdMessageGroups: [],
    registeredNodeId: null,
  };

  await service.cleanupFailedBootstrap(
    BOOTSTRAP_PHASE.PARTITIONS,
    cleanupContext,
  );

  t.ok(
    goodPartition.shutdownCalled,
    'should still shutdown the good partition',
  );
  t.ok(
    router.shutdownCalled,
    'should still shutdown router after partition error',
  );
  t.end();
});

test('handleBootstrapFailure - calls cleanupFailedBootstrap', async (t) => {
  const router = createMockRouter();
  const service = createTestBootstrapService({
    messageRouter: router,
    transport: router,
  });
  service.startTime = Date.now();
  service.phase = BOOTSTRAP_PHASE.INFRASTRUCTURE;

  let cleanupCalled = false;
  let cleanupPhase = null;
  service.cleanupFailedBootstrap = async (failedPhase, _ctx) => {
    cleanupCalled = true;
    cleanupPhase = failedPhase;
  };

  const result = await service.handleBootstrapFailure(
    new Error('test failure'),
  );

  t.ok(cleanupCalled, 'should call cleanupFailedBootstrap');
  t.equal(
    cleanupPhase,
    BOOTSTRAP_PHASE.INFRASTRUCTURE,
    'should pass the failed phase',
  );
  t.equal(result.success, false, 'should return failure result');
  t.equal(result.phase, BOOTSTRAP_PHASE.INFRASTRUCTURE,
    'result should contain the failed phase');
  t.end();
});
