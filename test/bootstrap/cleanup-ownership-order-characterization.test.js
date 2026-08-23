/**
 * Characterization tests: Cleanup ownership, step ordering, best-effort
 * behavior, and result/error shape parity for seed and join paths.
 *
 * These tests lock existing cleanup behavior before structural refactor.
 * They verify:
 * - SeedCleanupHandler is the canonical seed cleanup owner (D3.1)
 * - Cleanup step ordering for seed and join (D3.1, D11.1)
 * - Best-effort semantics: step failures don't prevent other steps (D3.1)
 * - Result/error shape parity between seed and join (D3.3)
 *
 * Validates: Requirements 2.2, 2.4, 2.5, 9.2
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {SeedCleanupHandler} from
  '../../src/bootstrap/phases/seed-cleanup-handler.js';
import {JoinCleanupHandler} from
  '../../src/bootstrap/join-cleanup-handler.js';
import {
  BOOTSTRAP_PHASE,
  BOOTSTRAP_CLEANUP_STEP,
  CLEANUP_RESULT,
  JOINING_PHASE,
} from '../../src/bootstrap/bootstrap-constants.js';
import {
  JOINING_CLEANUP_STEP,
} from '../../src/bootstrap/node-joining-constants.js';
import {NodeState} from '../../src/node/node-lifecycle-state-machine.js';

// ── Suite-local fixture constants ──────────────────────────────────

const SEED_NODE_ID = 'test-seed-node';
const SEED_NODE_ADDRESS = 'http://localhost:3000';
const JOIN_NODE_ID = 'test-joining-node';
const JOIN_NODE_ADDRESS = 'http://localhost:4000';

// ── Shared helpers ─────────────────────────────────────────────────

const noop = () => {};
const silentLogger = {
  info: noop, warn: noop, error: noop, debug: noop,
};

/**
 * Create a minimal BootstrapService for cleanup characterization.
 * @param {Object} overrides - Field overrides.
 * @return {BootstrapService}
 */
function createSeedService(overrides = {}) {
  const service = new BootstrapService({
    nodeId: SEED_NODE_ID,
    nodeAddress: SEED_NODE_ADDRESS,
    wsPort: null,
  });
  service.logger = silentLogger;
  Object.assign(service, overrides);
  return service;
}

/**
 * Create a minimal NodeJoiningService for cleanup characterization.
 * @param {Object} overrides - Field overrides.
 * @return {NodeJoiningService}
 */
function createJoinService(overrides = {}) {
  const service = new NodeJoiningService({
    nodeId: JOIN_NODE_ID,
    nodeAddress: JOIN_NODE_ADDRESS,
    seedNodeAddress: SEED_NODE_ADDRESS,
    wsPort: null,
  });
  service.logger = silentLogger;
  Object.assign(service, overrides);
  return service;
}

// ── 1. Seed cleanup step ordering ──────────────────────────────────

test('seed cleanup step ordering — CLEANUP_STEPS_REVERSE_ORDER ' +
  'matches canonical constant order', async (t) => {
  const expectedOrder = [
    BOOTSTRAP_CLEANUP_STEP.CACHE_HYDRATION,
    BOOTSTRAP_CLEANUP_STEP.REGISTRATION,
    BOOTSTRAP_CLEANUP_STEP.PARTITIONS,
    BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS,
    BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE,
  ];

  const stepsExecuted = [];

  const service = createSeedService({
    systemTableCache: {clear: noop},
    messageRouter: {shutdown: async () => {}, unregister: noop},
    transport: null,
  });

  // Intercept each cleanup step to record execution order.
  // These delegate to the handler, so we intercept at the
  // handler level to track without breaking the chain.
  const handler = service.seedCleanupHandler;
  const origCache = handler._cleanupCacheHydration.bind(handler);
  handler._cleanupCacheHydration = async () => {
    stepsExecuted.push(BOOTSTRAP_CLEANUP_STEP.CACHE_HYDRATION);
    return origCache();
  };
  const origReg = handler._cleanupRegistration.bind(handler);
  handler._cleanupRegistration = async (ctx) => {
    stepsExecuted.push(BOOTSTRAP_CLEANUP_STEP.REGISTRATION);
    return origReg(ctx);
  };
  const origPart = handler._cleanupPartitions.bind(handler);
  handler._cleanupPartitions = async () => {
    stepsExecuted.push(BOOTSTRAP_CLEANUP_STEP.PARTITIONS);
    return origPart();
  };
  const origMg = handler._cleanupMessageGroups.bind(handler);
  handler._cleanupMessageGroups = async () => {
    stepsExecuted.push(BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS);
    return origMg();
  };
  const origInfra = handler._cleanupInfrastructure.bind(handler);
  handler._cleanupInfrastructure = async () => {
    stepsExecuted.push(BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE);
    return origInfra();
  };

  const cleanupContext = {
    createdPartitions: [],
    createdServices: [],
    createdMessageGroups: [],
    registeredNodeId: null,
  };

  // Fail at CACHE_HYDRATION to trigger all steps
  await service.cleanupFailedBootstrap(
    BOOTSTRAP_PHASE.CACHE_HYDRATION, cleanupContext,
  );

  t.same(
    stepsExecuted, expectedOrder,
    'seed cleanup runs all 5 steps in canonical reverse phase order',
  );
  t.end();
});

test('seed cleanup step ordering — phase-to-cleanup-index mapping ' +
  'determines starting step', async (t) => {
  const stepsPerPhase = {};

  const phases = [
    BOOTSTRAP_PHASE.CACHE_HYDRATION,
    BOOTSTRAP_PHASE.REGISTRATION,
    BOOTSTRAP_PHASE.PARTITIONS,
    BOOTSTRAP_PHASE.MESSAGE_GROUPS,
    BOOTSTRAP_PHASE.INFRASTRUCTURE,
  ];

  for (const phase of phases) {
    const stepsExecuted = [];
    const service = createSeedService({
      systemTableCache: {clear: noop},
      messageRouter: {shutdown: async () => {}, unregister: noop},
      transport: null,
    });

    const handler = service.seedCleanupHandler;
    handler._cleanupCacheHydration = async () => {
      stepsExecuted.push(BOOTSTRAP_CLEANUP_STEP.CACHE_HYDRATION);
      return CLEANUP_RESULT.SUCCESS;
    };
    handler._cleanupRegistration = async () => {
      stepsExecuted.push(BOOTSTRAP_CLEANUP_STEP.REGISTRATION);
      return CLEANUP_RESULT.SUCCESS;
    };
    handler._cleanupPartitions = async () => {
      stepsExecuted.push(BOOTSTRAP_CLEANUP_STEP.PARTITIONS);
      return CLEANUP_RESULT.SUCCESS;
    };
    handler._cleanupMessageGroups = async () => {
      stepsExecuted.push(BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS);
      return CLEANUP_RESULT.SUCCESS;
    };
    handler._cleanupInfrastructure = async () => {
      stepsExecuted.push(BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE);
      return CLEANUP_RESULT.SUCCESS;
    };

    const ctx = {
      createdPartitions: [],
      createdServices: [],
      createdMessageGroups: [],
      registeredNodeId: null,
    };

    await service.cleanupFailedBootstrap(phase, ctx);
    stepsPerPhase[phase] = stepsExecuted;
  }

  t.equal(stepsPerPhase[BOOTSTRAP_PHASE.CACHE_HYDRATION].length, 5,
    'CACHE_HYDRATION failure runs 5 cleanup steps');
  t.equal(stepsPerPhase[BOOTSTRAP_PHASE.REGISTRATION].length, 4,
    'REGISTRATION failure runs 4 cleanup steps');
  t.equal(stepsPerPhase[BOOTSTRAP_PHASE.PARTITIONS].length, 3,
    'PARTITIONS failure runs 3 cleanup steps');
  t.equal(stepsPerPhase[BOOTSTRAP_PHASE.MESSAGE_GROUPS].length, 2,
    'MESSAGE_GROUPS failure runs 2 cleanup steps');
  t.equal(stepsPerPhase[BOOTSTRAP_PHASE.INFRASTRUCTURE].length, 1,
    'INFRASTRUCTURE failure runs 1 cleanup step');

  t.equal(
    stepsPerPhase[BOOTSTRAP_PHASE.REGISTRATION][0],
    BOOTSTRAP_CLEANUP_STEP.REGISTRATION,
    'REGISTRATION failure starts at registration step',
  );
  t.equal(
    stepsPerPhase[BOOTSTRAP_PHASE.INFRASTRUCTURE][0],
    BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE,
    'INFRASTRUCTURE failure starts at infrastructure step',
  );
  t.end();
});

// ── 2. Join cleanup step ordering ──────────────────────────────────

test('join cleanup step ordering — JOINING_CLEANUP_STEPS_REVERSE ' +
  'matches canonical constant order', async (t) => {
  const expectedOrder = [
    JOINING_CLEANUP_STEP.QUERYING_STATE,
    JOINING_CLEANUP_STEP.WAITING_LEADERSHIP,
    JOINING_CLEANUP_STEP.MESSAGE_GROUP,
    JOINING_CLEANUP_STEP.CONNECTING_WEBSOCKET,
  ];

  const stepsExecuted = [];

  const service = createJoinService({
    messageRouter: {shutdown: async () => {}, unregister: noop},
    transport: null,
  });

  // Intercept at the handler level since cleanupFailedJoin
  // delegates entirely to joinCleanupHandler.
  const handler = service.joinCleanupHandler;
  const origQs = handler._cleanupQueryingState.bind(handler);
  handler._cleanupQueryingState = async (ctx) => {
    stepsExecuted.push(JOINING_CLEANUP_STEP.QUERYING_STATE);
    return origQs(ctx);
  };
  const origWl =
    handler._cleanupWaitingLeadership.bind(handler);
  handler._cleanupWaitingLeadership = async () => {
    stepsExecuted.push(JOINING_CLEANUP_STEP.WAITING_LEADERSHIP);
    return origWl();
  };
  const origMg = handler._cleanupMessageGroup.bind(handler);
  handler._cleanupMessageGroup = async (ctx) => {
    stepsExecuted.push(JOINING_CLEANUP_STEP.MESSAGE_GROUP);
    return origMg(ctx);
  };
  const origWs =
    handler._cleanupConnectingWebSocket.bind(handler);
  handler._cleanupConnectingWebSocket = async () => {
    stepsExecuted.push(
      JOINING_CLEANUP_STEP.CONNECTING_WEBSOCKET,
    );
    return origWs();
  };

  const cleanupContext = {
    registeredNodeId: null,
    createdServiceIds: [],
    createdMessageGroupIds: [],
  };

  // Fail at QUERYING_STATE to trigger all steps
  await service.cleanupFailedJoin(
    JOINING_PHASE.QUERYING_STATE, cleanupContext,
  );

  t.same(
    stepsExecuted, expectedOrder,
    'join cleanup runs all 4 steps in canonical reverse phase order',
  );
  t.end();
});

test('join cleanup step ordering — phase-to-cleanup-index mapping ' +
  'determines starting step', async (t) => {
  const stepsPerPhase = {};

  const phases = [
    JOINING_PHASE.QUERYING_STATE,
    JOINING_PHASE.WAITING_LEADERSHIP,
    JOINING_PHASE.CREATING_MESSAGE_GROUP,
    JOINING_PHASE.JOINING_MESSAGE_GROUP,
    JOINING_PHASE.CONNECTING_WEBSOCKET,
    JOINING_PHASE.CONTACTING_SEED,
  ];

  for (const phase of phases) {
    const stepsExecuted = [];
    const service = createJoinService({
      messageRouter: {shutdown: async () => {}, unregister: noop},
      transport: null,
    });

    const handler = service.joinCleanupHandler;
    handler._cleanupQueryingState = async () => {
      stepsExecuted.push(JOINING_CLEANUP_STEP.QUERYING_STATE);
      return CLEANUP_RESULT.SUCCESS;
    };
    handler._cleanupWaitingLeadership = async () => {
      stepsExecuted.push(
        JOINING_CLEANUP_STEP.WAITING_LEADERSHIP,
      );
      return CLEANUP_RESULT.SUCCESS;
    };
    handler._cleanupMessageGroup = async () => {
      stepsExecuted.push(JOINING_CLEANUP_STEP.MESSAGE_GROUP);
      return CLEANUP_RESULT.SUCCESS;
    };
    handler._cleanupConnectingWebSocket = async () => {
      stepsExecuted.push(
        JOINING_CLEANUP_STEP.CONNECTING_WEBSOCKET,
      );
      return CLEANUP_RESULT.SUCCESS;
    };

    const ctx = {
      registeredNodeId: null,
      createdServiceIds: [],
      createdMessageGroupIds: [],
    };

    await service.cleanupFailedJoin(phase, ctx);
    stepsPerPhase[phase] = stepsExecuted;
  }

  // QUERYING_STATE (index 0) → all 4 steps
  t.equal(
    stepsPerPhase[JOINING_PHASE.QUERYING_STATE].length, 4,
    'QUERYING_STATE failure runs 4 cleanup steps',
  );
  // WAITING_LEADERSHIP (index 1) → 3 steps
  t.equal(
    stepsPerPhase[JOINING_PHASE.WAITING_LEADERSHIP].length, 3,
    'WAITING_LEADERSHIP failure runs 3 cleanup steps',
  );
  // CREATING_MESSAGE_GROUP (index 2) → 2 steps
  t.equal(
    stepsPerPhase[JOINING_PHASE.CREATING_MESSAGE_GROUP].length, 2,
    'CREATING_MESSAGE_GROUP failure runs 2 cleanup steps',
  );
  // JOINING_MESSAGE_GROUP shares index 2 with CREATING
  t.equal(
    stepsPerPhase[JOINING_PHASE.JOINING_MESSAGE_GROUP].length, 2,
    'JOINING_MESSAGE_GROUP failure runs 2 cleanup steps',
  );
  // CONNECTING_WEBSOCKET (index 3) → 1 step
  t.equal(
    stepsPerPhase[JOINING_PHASE.CONNECTING_WEBSOCKET].length, 1,
    'CONNECTING_WEBSOCKET failure runs 1 cleanup step',
  );
  // CONTACTING_SEED (index 4) → 0 steps (beyond array length)
  t.equal(
    stepsPerPhase[JOINING_PHASE.CONTACTING_SEED].length, 0,
    'CONTACTING_SEED failure runs 0 cleanup steps',
  );

  t.equal(
    stepsPerPhase[JOINING_PHASE.WAITING_LEADERSHIP][0],
    JOINING_CLEANUP_STEP.WAITING_LEADERSHIP,
    'WAITING_LEADERSHIP failure starts at waiting_leadership step',
  );
  t.equal(
    stepsPerPhase[JOINING_PHASE.CONNECTING_WEBSOCKET][0],
    JOINING_CLEANUP_STEP.CONNECTING_WEBSOCKET,
    'CONNECTING_WEBSOCKET failure starts at websocket step',
  );
  t.end();
});

test('join cleanup drains replica handler before CDC SQL teardown',
  async (t) => {
    const events = [];
    const sqlQueryEngine = {
      shutdown: async () => {
        events.push('sqlQueryEngine.shutdown');
      },
    };
    const cdcIntegrationService = {sqlQueryEngine};
    const replicaStateMachine = {
      stopTimeoutChecker: () => {
        events.push('replicaStateMachine.stopTimeoutChecker');
      },
      clear: () => {
        events.push('replicaStateMachine.clear');
      },
    };
    const messageRouter = {
      shutdown: async () => {
        events.push('messageRouter.shutdown');
      },
    };
    const delegates = {
      getLogger: () => silentLogger,
      getMessageGroupServices: () => new Map(),
      getPartitionServices: () => new Map(),
      getMessageRouter: () => messageRouter,
      setMessageRouter: noop,
      getTransport: () => null,
      setTransport: noop,
      getCdcIntegrationService: () => cdcIntegrationService,
      setCdcIntegrationService: (value) => {
        events.push('setCdcIntegrationService');
        delegates.cdcIntegrationService = value;
      },
      getRebalanceCoordinator: () => null,
      setRebalanceCoordinator: noop,
      getLatencyTopology: () => null,
      setLatencyTopology: noop,
      getReplicaStateMachine: () => delegates.replicaStateMachine,
      setReplicaStateMachine: (value) => {
        events.push('setReplicaStateMachine');
        delegates.replicaStateMachine = value;
      },
      getRpcClient: () => null,
      setRpcClient: noop,
      getHeartbeatService: () => null,
      setHeartbeatService: noop,
      getLeaseService: () => null,
      setLeaseService: noop,
      getEndpointService: () => null,
      setEndpointService: noop,
      getDispatchService: () => null,
      setDispatchService: noop,
      getReplicaHandler: () => delegates.replicaHandler,
      setReplicaHandler: (value) => {
        events.push('setReplicaHandler');
        delegates.replicaHandler = value;
      },
      stopJoiningLifecycleOwners: () => {
        events.push('stopJoiningLifecycleOwners');
      },
    };
    const replicaHandler = {
      unregisterFromRouter: (router) => {
        t.equal(router, messageRouter,
          'replica handler unregisters from the live message router');
        events.push('replicaHandler.unregisterFromRouter');
      },
      shutdown: async () => {
        t.equal(
          cdcIntegrationService.sqlQueryEngine,
          sqlQueryEngine,
          'replica handler drains while CDC SQL query engine is attached',
        );
        t.equal(
          delegates.getReplicaStateMachine(),
          replicaStateMachine,
          'replica handler drains while replica state machine is attached',
        );
        events.push('replicaHandler.shutdown');
      },
    };
    delegates.replicaHandler = replicaHandler;
    delegates.replicaStateMachine = replicaStateMachine;

    const handler = new JoinCleanupHandler({
      nodeId: JOIN_NODE_ID,
      delegates,
    });

    await handler.cleanup();

    t.same(
      events,
      [
        'stopJoiningLifecycleOwners',
        'replicaHandler.unregisterFromRouter',
        'replicaHandler.shutdown',
        'setReplicaHandler',
        'replicaStateMachine.stopTimeoutChecker',
        'replicaStateMachine.clear',
        'setReplicaStateMachine',
        'sqlQueryEngine.shutdown',
        'messageRouter.shutdown',
        'setCdcIntegrationService',
      ],
      'cleanup keeps lifecycle dependencies alive until replica tasks drain',
    );
    t.equal(
      cdcIntegrationService.sqlQueryEngine,
      null,
      'CDC SQL query engine is detached after replica handler shutdown',
    );
    t.end();
  });

// ── 3. Best-effort semantics ───────────────────────────────────────

test('seed cleanup best-effort — individual step error returns ' +
  'error result without preventing subsequent steps', async (t) => {
  /**
   * The best-effort contract (D3.1 / Requirement 2.5): each cleanup
   * step has its own try/catch inside the handler. A step that fails
   * returns CLEANUP_RESULT.ERROR but does not throw, so subsequent
   * steps still run.
   *
   * We test this by making the system table cache throw during
   * _cleanupCacheHydration, then verifying all steps still execute.
   */
  const stepsExecuted = [];

  const service = createSeedService({
    // Cache that throws on clear — triggers error inside handler
    systemTableCache: {
      clear: () => {
        throw new Error('cache clear exploded');
      },
    },
    messageRouter: {shutdown: async () => {}, unregister: noop},
    transport: null,
  });

  const handler = service.seedCleanupHandler;
  const origCache = handler._cleanupCacheHydration.bind(handler);
  handler._cleanupCacheHydration = async () => {
    const result = await origCache();
    stepsExecuted.push({
      step: BOOTSTRAP_CLEANUP_STEP.CACHE_HYDRATION,
      result,
    });
    return result;
  };
  const origReg = handler._cleanupRegistration.bind(handler);
  handler._cleanupRegistration = async (ctx) => {
    const result = await origReg(ctx);
    stepsExecuted.push({
      step: BOOTSTRAP_CLEANUP_STEP.REGISTRATION,
      result,
    });
    return result;
  };
  const origPart = handler._cleanupPartitions.bind(handler);
  handler._cleanupPartitions = async () => {
    const result = await origPart();
    stepsExecuted.push({
      step: BOOTSTRAP_CLEANUP_STEP.PARTITIONS,
      result,
    });
    return result;
  };
  const origMg = handler._cleanupMessageGroups.bind(handler);
  handler._cleanupMessageGroups = async () => {
    const result = await origMg();
    stepsExecuted.push({
      step: BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS,
      result,
    });
    return result;
  };
  const origInfra = handler._cleanupInfrastructure.bind(handler);
  handler._cleanupInfrastructure = async () => {
    const result = await origInfra();
    stepsExecuted.push({
      step: BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE,
      result,
    });
    return result;
  };

  const ctx = {
    createdPartitions: [],
    createdServices: [],
    createdMessageGroups: [],
    registeredNodeId: null,
  };

  // Should not throw despite cache clear failure
  await service.cleanupFailedBootstrap(
    BOOTSTRAP_PHASE.CACHE_HYDRATION, ctx,
  );

  t.equal(stepsExecuted.length, 5,
    'all 5 steps execute despite cache clear failure');

  // The cache step should return 'error'
  const cacheStep = stepsExecuted.find(
    (s) => s.step === BOOTSTRAP_CLEANUP_STEP.CACHE_HYDRATION,
  );
  t.equal(cacheStep.result, CLEANUP_RESULT.ERROR,
    'failed cache step returns error result');

  // Infrastructure step should still succeed
  const infraStep = stepsExecuted.find(
    (s) => s.step === BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE,
  );
  t.equal(infraStep.result, CLEANUP_RESULT.SUCCESS,
    'infrastructure step succeeds after earlier failure');
  t.end();
});

test('join cleanup best-effort — individual step error returns ' +
  'error result without preventing subsequent steps', async (t) => {
  /**
   * Same best-effort contract for join: each cleanup step has its
   * own try/catch. A step that fails returns error but does not
   * throw, so subsequent steps still run.
   *
   * We make message group shutdown throw during
   * _cleanupWaitingLeadership, then verify all steps still execute.
   */
  const stepsExecuted = [];

  const throwingMg = new Map();
  throwingMg.set('mg-fail', {
    shutdown: async () => {
      throw new Error('MG shutdown exploded');
    },
  });

  const service = createJoinService({
    messageGroupServices: throwingMg,
    messageRouter: {shutdown: async () => {}, unregister: noop},
    transport: null,
  });

  const handler = service.joinCleanupHandler;
  const origQs = handler._cleanupQueryingState.bind(handler);
  handler._cleanupQueryingState = async (ctx) => {
    const result = await origQs(ctx);
    stepsExecuted.push({
      step: JOINING_CLEANUP_STEP.QUERYING_STATE,
      result,
    });
    return result;
  };
  const origWl =
    handler._cleanupWaitingLeadership.bind(handler);
  handler._cleanupWaitingLeadership = async () => {
    const result = await origWl();
    stepsExecuted.push({
      step: JOINING_CLEANUP_STEP.WAITING_LEADERSHIP,
      result,
    });
    return result;
  };
  const origMg = handler._cleanupMessageGroup.bind(handler);
  handler._cleanupMessageGroup = async (ctx) => {
    const result = await origMg(ctx);
    stepsExecuted.push({
      step: JOINING_CLEANUP_STEP.MESSAGE_GROUP,
      result,
    });
    return result;
  };
  const origWs =
    handler._cleanupConnectingWebSocket.bind(handler);
  handler._cleanupConnectingWebSocket = async () => {
    const result = await origWs();
    stepsExecuted.push({
      step: JOINING_CLEANUP_STEP.CONNECTING_WEBSOCKET,
      result,
    });
    return result;
  };

  const ctx = {
    registeredNodeId: null,
    createdServiceIds: ['mg-fail'],
    createdMessageGroupIds: [],
  };

  // Should not throw despite MG shutdown failure
  await service.cleanupFailedJoin(
    JOINING_PHASE.QUERYING_STATE, ctx,
  );

  t.equal(stepsExecuted.length, 4,
    'all 4 steps execute despite MG shutdown failure');

  // Websocket step should still succeed
  const wsStep = stepsExecuted.find(
    (s) => s.step === JOINING_CLEANUP_STEP.CONNECTING_WEBSOCKET,
  );
  t.equal(wsStep.result, CLEANUP_RESULT.SUCCESS,
    'websocket step succeeds after earlier failure');
  t.end();
});

// ── 4. Result/error shape parity ───────────────────────────────────

test('seed and join cleanup result shape — both use the shared ' +
  'CLEANUP_RESULT constant from bootstrap-constants', async (t) => {
  t.ok(CLEANUP_RESULT.SUCCESS,
    'shared CLEANUP_RESULT has SUCCESS');
  t.ok(CLEANUP_RESULT.ERROR,
    'shared CLEANUP_RESULT has ERROR');
  t.ok(CLEANUP_RESULT.SKIPPED,
    'shared CLEANUP_RESULT has SKIPPED');
  t.equal(CLEANUP_RESULT.SUCCESS, 'success',
    'SUCCESS value is correct');
  t.equal(CLEANUP_RESULT.ERROR, 'error',
    'ERROR value is correct');
  t.equal(CLEANUP_RESULT.SKIPPED, 'skipped',
    'SKIPPED value is correct');
  t.end();
});

test('seed handleBootstrapFailure result shape — returns ' +
  'canonical failure result object', async (t) => {
  const service = createSeedService({
    messageRouter: {shutdown: async () => {}, unregister: noop},
    transport: null,
  });
  service.startTime = Date.now();
  service.phase = BOOTSTRAP_PHASE.INFRASTRUCTURE;

  const result = await service.handleBootstrapFailure(
    new Error('test seed failure'),
  );

  t.equal(result.success, false, 'result.success is false');
  t.equal(result.nodeId, SEED_NODE_ID, 'result.nodeId present');
  t.type(result.duration, 'number', 'result.duration is number');
  t.equal(result.error, 'test seed failure',
    'result.error is error message');
  t.equal(result.phase, BOOTSTRAP_PHASE.INFRASTRUCTURE,
    'result.phase is the failed phase');
  t.ok('servicesCreated' in result,
    'result includes servicesCreated');
  t.end();
});

test('join handleJoiningFailure result shape — returns ' +
  'canonical failure result object', async (t) => {
  const service = createJoinService({
    messageRouter: {shutdown: async () => {}, unregister: noop},
    transport: null,
  });
  service.startTime = Date.now();
  service.phase = JOINING_PHASE.CONNECTING_WEBSOCKET;

  const result = await service.handleJoiningFailure(
    new Error('test join failure'),
  );

  t.equal(result.success, false, 'result.success is false');
  t.equal(result.nodeId, JOIN_NODE_ID, 'result.nodeId present');
  t.type(result.duration, 'number', 'result.duration is number');
  t.equal(result.error, 'test join failure',
    'result.error is error message');
  t.equal(result.phase, JOINING_PHASE.CONNECTING_WEBSOCKET,
    'result.phase is the original failed phase, not FAILED');
  t.end();
});

test('seed and join failure result shape parity — both return ' +
  'objects with equivalent core fields', async (t) => {
  const seedService = createSeedService({
    messageRouter: {shutdown: async () => {}, unregister: noop},
    transport: null,
  });
  seedService.startTime = Date.now();
  seedService.phase = BOOTSTRAP_PHASE.INFRASTRUCTURE;

  const joinService = createJoinService({
    messageRouter: {shutdown: async () => {}, unregister: noop},
    transport: null,
  });
  joinService.startTime = Date.now();
  joinService.phase = JOINING_PHASE.CONNECTING_WEBSOCKET;

  const seedResult = await seedService.handleBootstrapFailure(
    new Error('seed error'),
  );
  const joinResult = await joinService.handleJoiningFailure(
    new Error('join error'),
  );

  const coreFields = [
    'success', 'nodeId', 'duration', 'error', 'phase',
  ];
  for (const field of coreFields) {
    t.ok(field in seedResult,
      `seed result has core field: ${field}`);
    t.ok(field in joinResult,
      `join result has core field: ${field}`);
  }

  t.equal(seedResult.success, false,
    'seed result success is false');
  t.equal(joinResult.success, false,
    'join result success is false');
  t.end();
});

// ── 5. SeedCleanupHandler canonical ownership ─────────────────────

test('SeedCleanupHandler is the canonical seed cleanup owner — ' +
  'BootstrapService delegates all cleanup methods', async (t) => {
  const service = createSeedService();

  t.ok(service.seedCleanupHandler,
    'BootstrapService has seedCleanupHandler');
  t.ok(
    service.seedCleanupHandler instanceof SeedCleanupHandler,
    'seedCleanupHandler is a SeedCleanupHandler instance',
  );

  // Verify delegation: shutdown() routes to handler.cleanup()
  // (D2.3: wrapper methods removed; cleanup handler is called directly)
  let handlerCleanupCalled = false;
  service.seedCleanupHandler.cleanup = async () => {
    handlerCleanupCalled = true;
  };
  await service.shutdown();
  t.ok(handlerCleanupCalled,
    'shutdown() delegates to seedCleanupHandler.cleanup()');

  // Verify _executeCleanupStep routes to handler methods directly
  let handlerCacheCleanupCalled = false;
  service.seedCleanupHandler._cleanupCacheHydration = async () => {
    handlerCacheCleanupCalled = true;
    return CLEANUP_RESULT.SUCCESS;
  };
  await service._executeCleanupStep(
    BOOTSTRAP_CLEANUP_STEP.CACHE_HYDRATION, {},
  );
  t.ok(handlerCacheCleanupCalled,
    '_executeCleanupStep routes CACHE_HYDRATION to handler');

  // Verify _executeCleanupStep routes INFRASTRUCTURE to handler
  let handlerInfraCleanupCalled = false;
  service.seedCleanupHandler._cleanupInfrastructure = async () => {
    handlerInfraCleanupCalled = true;
    return CLEANUP_RESULT.SUCCESS;
  };
  await service._executeCleanupStep(
    BOOTSTRAP_CLEANUP_STEP.INFRASTRUCTURE, {},
  );
  t.ok(handlerInfraCleanupCalled,
    '_executeCleanupStep routes INFRASTRUCTURE to handler');

  // Verify _executeCleanupStep routes PARTITIONS to handler
  let handlerPartitionsCleanupCalled = false;
  service.seedCleanupHandler._cleanupPartitions = async () => {
    handlerPartitionsCleanupCalled = true;
    return CLEANUP_RESULT.SUCCESS;
  };
  await service._executeCleanupStep(
    BOOTSTRAP_CLEANUP_STEP.PARTITIONS, {},
  );
  t.ok(handlerPartitionsCleanupCalled,
    '_executeCleanupStep routes PARTITIONS to handler');

  // Verify _executeCleanupStep routes MESSAGE_GROUPS to handler
  let handlerMgCleanupCalled = false;
  service.seedCleanupHandler._cleanupMessageGroups = async () => {
    handlerMgCleanupCalled = true;
    return CLEANUP_RESULT.SUCCESS;
  };
  await service._executeCleanupStep(
    BOOTSTRAP_CLEANUP_STEP.MESSAGE_GROUPS, {},
  );
  t.ok(handlerMgCleanupCalled,
    '_executeCleanupStep routes MESSAGE_GROUPS to handler');

  // Verify _executeCleanupStep routes REGISTRATION to handler
  let handlerRegCleanupCalled = false;
  service.seedCleanupHandler._cleanupRegistration = async () => {
    handlerRegCleanupCalled = true;
    return CLEANUP_RESULT.SUCCESS;
  };
  await service._executeCleanupStep(
    BOOTSTRAP_CLEANUP_STEP.REGISTRATION, {},
  );
  t.ok(handlerRegCleanupCalled,
    '_executeCleanupStep routes REGISTRATION to handler');

  t.end();
});

test('JoinCleanupHandler is the canonical join cleanup owner — ' +
  'NodeJoiningService delegates all cleanup methods', async (t) => {
  const service = createJoinService();

  t.ok(service.joinCleanupHandler,
    'NodeJoiningService has joinCleanupHandler');
  t.ok(
    service.joinCleanupHandler instanceof JoinCleanupHandler,
    'joinCleanupHandler is a JoinCleanupHandler instance',
  );

  // Verify delegation: service.cleanup() routes to handler
  let handlerCleanupCalled = false;
  service.joinCleanupHandler.cleanup = async () => {
    handlerCleanupCalled = true;
  };
  await service.cleanup();
  t.ok(handlerCleanupCalled,
    'service.cleanup() delegates to joinCleanupHandler.cleanup()');

  // Verify handleJoiningFailure delegates to handler
  let handlerFailureCalled = false;
  service.joinCleanupHandler.handleJoiningFailure = async () => {
    handlerFailureCalled = true;
    return {success: false};
  };
  await service.handleJoiningFailure(new Error('test'));
  t.ok(handlerFailureCalled,
    'handleJoiningFailure delegates to handler');

  // Verify _cleanupQueryingState delegates to handler
  let handlerQsCleanupCalled = false;
  service.joinCleanupHandler._cleanupQueryingState = async () => {
    handlerQsCleanupCalled = true;
    return CLEANUP_RESULT.SUCCESS;
  };
  await service._cleanupQueryingState({});
  t.ok(handlerQsCleanupCalled,
    '_cleanupQueryingState delegates to handler');

  // Verify _cleanupWaitingLeadership delegates to handler
  let handlerWlCleanupCalled = false;
  service.joinCleanupHandler._cleanupWaitingLeadership =
    async () => {
      handlerWlCleanupCalled = true;
      return CLEANUP_RESULT.SUCCESS;
    };
  await service._cleanupWaitingLeadership();
  t.ok(handlerWlCleanupCalled,
    '_cleanupWaitingLeadership delegates to handler');

  // Verify _cleanupMessageGroup delegates to handler
  let handlerMgCleanupCalled = false;
  service.joinCleanupHandler._cleanupMessageGroup = async () => {
    handlerMgCleanupCalled = true;
    return CLEANUP_RESULT.SUCCESS;
  };
  await service._cleanupMessageGroup({});
  t.ok(handlerMgCleanupCalled,
    '_cleanupMessageGroup delegates to handler');

  // Verify _cleanupConnectingWebSocket delegates to handler
  let handlerWsCleanupCalled = false;
  service.joinCleanupHandler._cleanupConnectingWebSocket =
    async () => {
      handlerWsCleanupCalled = true;
      return CLEANUP_RESULT.SUCCESS;
    };
  await service._cleanupConnectingWebSocket();
  t.ok(handlerWsCleanupCalled,
    '_cleanupConnectingWebSocket delegates to handler');

  t.end();
});

test('seed and join cleanup both transition lifecycle to STOPPED ' +
  'after cleanup', async (t) => {
  const seedService = createSeedService({
    systemTableCache: {clear: noop},
    messageRouter: {shutdown: async () => {}, unregister: noop},
    transport: null,
  });

  await seedService.cleanupFailedBootstrap(
    BOOTSTRAP_PHASE.INFRASTRUCTURE, {
      createdPartitions: [],
      createdServices: [],
      createdMessageGroups: [],
      registeredNodeId: null,
    },
  );

  t.equal(
    seedService.lifecycleStateMachine.getState(),
    NodeState.STOPPED,
    'seed cleanup transitions to STOPPED',
  );

  const joinService = createJoinService({
    messageRouter: {shutdown: async () => {}, unregister: noop},
    transport: null,
  });

  await joinService.cleanupFailedJoin(
    JOINING_PHASE.CONNECTING_WEBSOCKET, {
      registeredNodeId: null,
      createdServiceIds: [],
      createdMessageGroupIds: [],
    },
  );

  t.equal(
    joinService.lifecycleStateMachine.getState(),
    NodeState.STOPPED,
    'join cleanup transitions to STOPPED',
  );
  t.end();
});

test('join cleanup drains READY lifecycle before STOPPED', async (t) => {
  const joinService = createJoinService({
    messageRouter: {shutdown: async () => {}, unregister: noop},
    transport: null,
  });
  const lifecycleTransitionPath = [];
  const originalTransition =
    joinService.lifecycleStateMachine.transition.bind(
      joinService.lifecycleStateMachine,
    );
  joinService.lifecycleStateMachine.transition = (targetState) => {
    const transitioned = originalTransition(targetState);
    if (transitioned === true) {
      lifecycleTransitionPath.push(targetState);
    }
    return transitioned;
  };

  for (const targetState of [
    NodeState.CONNECTING,
    NodeState.DISCOVERING,
    NodeState.JOINING,
    NodeState.READY,
  ]) {
    t.equal(
      joinService.lifecycleStateMachine.transition(targetState),
      true,
      'fixture lifecycle should reach READY through valid transitions',
    );
  }
  lifecycleTransitionPath.length = 0;

  await joinService.cleanupFailedJoin(
    JOINING_PHASE.QUERYING_STATE, {
      registeredNodeId: null,
      createdServiceIds: [],
      createdMessageGroupIds: [],
    },
  );

  t.same(
    lifecycleTransitionPath,
    [NodeState.DRAINING, NodeState.STOPPED],
    'join cleanup should use the READY -> DRAINING -> STOPPED lifecycle path',
  );
  t.equal(
    joinService.lifecycleStateMachine.getState(),
    NodeState.STOPPED,
    'join cleanup from READY should finish at STOPPED',
  );
  t.end();
});

// ── 6. Single cleanup execution path (D3.2) ───────────────────────

test('single cleanup execution path — StartupPipelineRunner does ' +
  'not own cleanup for seed bootstrap flow (D3.2)', async (t) => {
  /**
   * Requirement 2.2: Cleanup execution SHALL run through one path,
   * not parallel duplicated orchestration paths.
   *
   * The pipeline runner is a phase-execution tool only. Cleanup is
   * owned exclusively by SeedCleanupHandler (seed) and
   * JoinCleanupHandler (join). The pipeline must not have cleanup
   * methods that could create a parallel execution path.
   *
   * Validates: Requirements 2.2, 2.5
   */
  const {StartupPipelineRunner} = await import(
    '../../src/bootstrap/pipeline/startup-pipeline-runner.js'
  );

  const runner = new StartupPipelineRunner();

  // Pipeline runner must not expose cleanup orchestration methods
  t.equal(typeof runner.runCleanup, 'undefined',
    'pipeline runner has no runCleanup method');
  t.equal(typeof runner.shouldRunCleanupStep, 'undefined',
    'pipeline runner has no shouldRunCleanupStep method');

  // Verify the seed bootstrap path: pipeline failure propagates
  // to BootstrapService.handleBootstrapFailure which delegates
  // to SeedCleanupHandler — the single cleanup execution path.
  const service = createSeedService({
    systemTableCache: {clear: noop},
    messageRouter: {shutdown: async () => {}, unregister: noop},
    transport: null,
  });

  let handlerCleanupInvoked = false;
  service.seedCleanupHandler.cleanupFailedBootstrap =
    async () => {
      handlerCleanupInvoked = true;
    };

  service.startTime = Date.now();
  service.phase = BOOTSTRAP_PHASE.PARTITIONS;

  await service.handleBootstrapFailure(
    new Error('phase failure'),
  );

  t.ok(handlerCleanupInvoked,
    'handleBootstrapFailure routes cleanup through ' +
    'SeedCleanupHandler (single execution path)');
  t.end();
});

test('single cleanup execution path — pipeline phase failure ' +
  'propagates error without triggering pipeline cleanup',
async (t) => {
  /**
   * When a phase fails inside the pipeline, the error must
   * propagate directly to the caller. The pipeline must NOT
   * attempt any cleanup — that responsibility belongs to the
   * handler-owned path (SeedCleanupHandler / JoinCleanupHandler).
   *
   * Validates: Requirements 2.2, 2.5
   */
  const {StartupPipelineRunner} = await import(
    '../../src/bootstrap/pipeline/startup-pipeline-runner.js'
  );

  const events = [];
  const sink = {
    emit(eventName, _payload) {
      events.push(eventName);
    },
  };

  const runner = new StartupPipelineRunner({
    eventSink: sink,
  });

  try {
    await runner.run({
      phases: [
        {name: 'infra', run: async () => {}},
        {
          name: 'partitions',
          run: async () => {
            throw new Error('boom');
          },
        },
      ],
    });
    t.fail('expected error to propagate');
  } catch (error) {
    t.equal(error.message, 'boom',
      'phase error propagates to caller');
  }

  // No cleanup events should have been emitted
  const cleanupEvents = events.filter(
    (e) => e.includes('cleanup') || e.includes('Cleanup'),
  );
  t.equal(cleanupEvents.length, 0,
    'no cleanup events emitted by pipeline runner');
  t.end();
});

// ── 7. Aligned diagnostics shape (D3.3, Requirement 2.4) ──────────

test('seed and join failure event payload — both emit failedPhase ' +
  'not the post-transition FAILED state (D3.3)', async (t) => {
  /**
   * Both handlers should emit the original failed phase in the
   * BOOTSTRAP_EVENT.FAILED payload so diagnostics consumers see
   * which phase actually failed, not just the terminal FAILED state.
   *
   * Validates: Requirements 2.4, 9.2
   */
  const seedEvents = [];
  const seedService = createSeedService({
    messageRouter: {shutdown: async () => {}, unregister: noop},
    transport: null,
  });
  seedService.startTime = Date.now();
  seedService.phase = BOOTSTRAP_PHASE.PARTITIONS;
  const origSeedEmit = seedService.emit.bind(seedService);
  seedService.emit = (event, payload) => {
    seedEvents.push({event, payload});
    origSeedEmit(event, payload);
  };

  await seedService.handleBootstrapFailure(
    new Error('seed phase error'),
  );

  const seedFailed = seedEvents.find(
    (e) => e.event === 'failed',
  );
  t.ok(seedFailed, 'seed emits failed event');
  t.equal(seedFailed.payload.phase, BOOTSTRAP_PHASE.PARTITIONS,
    'seed failed event carries original failedPhase');

  const joinEvents = [];
  const joinService = createJoinService({
    messageRouter: {shutdown: async () => {}, unregister: noop},
    transport: null,
  });
  joinService.startTime = Date.now();
  joinService.phase = JOINING_PHASE.CREATING_MESSAGE_GROUP;
  const origJoinEmit = joinService.emit.bind(joinService);
  joinService.emit = (event, payload) => {
    joinEvents.push({event, payload});
    origJoinEmit(event, payload);
  };

  await joinService.handleJoiningFailure(
    new Error('join phase error'),
  );

  const joinFailed = joinEvents.find(
    (e) => e.event === 'failed',
  );
  t.ok(joinFailed, 'join emits failed event');
  t.equal(
    joinFailed.payload.phase,
    JOINING_PHASE.CREATING_MESSAGE_GROUP,
    'join failed event carries original failedPhase',
  );
  t.end();
});

test('seed and join cleanup summary log shape — both include ' +
  'nodeId, failedPhase, and stepResults keys', async (t) => {
  /**
   * The cleanup summary log payload must use the same field names
   * across seed and join paths for consistent diagnostics (D3.3).
   *
   * Validates: Requirements 2.4, 9.2
   */
  const seedLogs = [];
  const seedLogger = {
    info: (msg, payload) => seedLogs.push({msg, payload}),
    warn: noop, error: noop, debug: noop,
  };

  const seedService = createSeedService({
    systemTableCache: {clear: noop},
    messageRouter: {shutdown: async () => {}, unregister: noop},
    transport: null,
  });
  seedService.logger = seedLogger;
  // Patch the handler's delegate to use the capturing logger
  seedService.seedCleanupHandler.delegates.getLogger =
    () => seedLogger;

  await seedService.cleanupFailedBootstrap(
    BOOTSTRAP_PHASE.INFRASTRUCTURE, {
      createdPartitions: [],
      createdServices: [],
      createdMessageGroups: [],
      registeredNodeId: null,
    },
  );

  const seedSummary = seedLogs.find(
    (l) => l.msg.includes('summary') || l.msg.includes('Summary'),
  );
  t.ok(seedSummary, 'seed emits cleanup summary log');
  t.ok('nodeId' in seedSummary.payload,
    'seed summary has nodeId');
  t.ok('failedPhase' in seedSummary.payload,
    'seed summary has failedPhase');
  t.ok('stepResults' in seedSummary.payload,
    'seed summary has stepResults');

  const joinLogs = [];
  const joinLogger = {
    info: (msg, payload) => joinLogs.push({msg, payload}),
    warn: noop, error: noop, debug: noop,
  };

  const joinService = createJoinService({
    messageRouter: {shutdown: async () => {}, unregister: noop},
    transport: null,
  });
  joinService.logger = joinLogger;
  // Patch the handler's delegate to use the capturing logger
  joinService.joinCleanupHandler.delegates.getLogger =
    () => joinLogger;

  await joinService.cleanupFailedJoin(
    JOINING_PHASE.CONNECTING_WEBSOCKET, {
      registeredNodeId: null,
      createdServiceIds: [],
      createdMessageGroupIds: [],
    },
  );

  const joinSummary = joinLogs.find(
    (l) => l.msg.includes('summary') || l.msg.includes('Summary'),
  );
  t.ok(joinSummary, 'join emits cleanup summary log');
  t.ok('nodeId' in joinSummary.payload,
    'join summary has nodeId');
  t.ok('failedPhase' in joinSummary.payload,
    'join summary has failedPhase');
  t.ok('stepResults' in joinSummary.payload,
    'join summary has stepResults');

  // Verify both summaries have the same set of keys
  const seedKeys = Object.keys(seedSummary.payload).sort();
  const joinKeys = Object.keys(joinSummary.payload).sort();
  t.same(seedKeys, joinKeys,
    'seed and join cleanup summary payloads have identical keys');
  t.end();
});

test('seed and join both use shared CLEANUP_RESULT from ' +
  'bootstrap-constants — no duplicate result constants', async (t) => {
  /**
   * After alignment, both handlers import CLEANUP_RESULT from
   * bootstrap-constants.js. The old JOINING_CLEANUP_RESULT in
   * node-joining-constants.js is removed. This test verifies
   * the shared constant is the one used by both paths.
   *
   * Validates: Requirements 2.4, 9.2
   */
  // Verify the shared constant has all required values
  t.equal(CLEANUP_RESULT.SUCCESS, 'success',
    'shared CLEANUP_RESULT.SUCCESS');
  t.equal(CLEANUP_RESULT.ERROR, 'error',
    'shared CLEANUP_RESULT.ERROR');
  t.equal(CLEANUP_RESULT.SKIPPED, 'skipped',
    'shared CLEANUP_RESULT.SKIPPED');

  // Verify seed handler uses shared constant by checking
  // a successful cleanup step returns the shared value
  const seedService = createSeedService({
    systemTableCache: {clear: noop},
    messageRouter: {shutdown: async () => {}, unregister: noop},
    transport: null,
  });
  const seedResult =
    await seedService._executeCleanupStep(
      BOOTSTRAP_CLEANUP_STEP.CACHE_HYDRATION, {},
    );
  t.equal(seedResult, CLEANUP_RESULT.SUCCESS,
    'seed cleanup step returns shared CLEANUP_RESULT.SUCCESS');

  // Verify join handler uses shared constant
  const joinService = createJoinService({
    messageRouter: {shutdown: async () => {}, unregister: noop},
    transport: null,
  });
  const joinResult =
    await joinService._executeJoinCleanupStep(
      JOINING_CLEANUP_STEP.CONNECTING_WEBSOCKET, {},
    );
  t.equal(joinResult, CLEANUP_RESULT.SUCCESS,
    'join cleanup step returns shared CLEANUP_RESULT.SUCCESS');

  // Both return the exact same object reference value
  t.equal(seedResult, joinResult,
    'seed and join cleanup results are identical values');
  t.end();
});
