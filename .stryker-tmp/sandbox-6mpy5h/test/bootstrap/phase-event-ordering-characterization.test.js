/**
 * Characterization tests for seed/join phase event ordering.
 *
 * These tests lock the exact sequence of phase start/complete/fail events
 * emitted during bootstrap and join startup paths. Any future refactoring
 * that accidentally changes the ordering will be caught.
 *
 * Requirements: 1.5, 4.3, 9.2
 * Design: D2.1, D5.3, D11.1
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {READINESS_CONVERGENCE_PHASE} from
  '../../src/bootstrap/pipeline/join-startup-plan.js';
import {
  BOOTSTRAP_PHASE,
  BOOTSTRAP_EVENT,
  JOINING_PHASE,
  JOINING_PHASE_TO_SUB_PHASE,
} from '../../src/bootstrap/bootstrap-constants.js';
import {
  NodeState,
} from '../../src/node/node-lifecycle-state-machine.js';
import {
  BOOTSTRAP_SUB_PHASE,
} from '../../src/node/node-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {NUM} from '../../src/constants/index.js';

// -- Suite-local fixture constants --

const TEST_NODE_ID = 'phase-event-ordering-node';
const TEST_NODE_ADDRESS = 'ws://localhost:19999';
const TEST_WS_PORT = 19999;
const SILENT_LOGGER = Object.freeze({
  info() {},
  debug() {},
  warn() {},
  error() {},
});

/**
 * Expected seed bootstrap phase order as defined in seed-startup-plan.js.
 * Each phase is executed via BootstrapService.executePhase which emits
 * phaseStart/phaseComplete (BOOTSTRAP_EVENT) and phase:start/phase:complete.
 */
const EXPECTED_SEED_PHASE_ORDER = Object.freeze([
  BOOTSTRAP_PHASE.INFRASTRUCTURE,
  BOOTSTRAP_PHASE.MESSAGE_GROUPS,
  BOOTSTRAP_PHASE.PARTITIONS,
  BOOTSTRAP_PHASE.REGISTRATION,
  BOOTSTRAP_PHASE.CACHE_HYDRATION,
]);

/**
 * Expected join phase order as defined in join-startup-plan.js.
 * The message-group phase is conditional (CREATE_SELF_HOSTED or MOVE_REPLICA)
 * but the surrounding order is fixed.
 */
const EXPECTED_JOIN_PHASE_ORDER = Object.freeze([
  JOINING_PHASE.CONTACTING_SEED,
  JOINING_PHASE.CONNECTING_WEBSOCKET,
  JOINING_PHASE.CREATING_MESSAGE_GROUP,
  JOINING_PHASE.WAITING_LEADERSHIP,
  JOINING_PHASE.QUERYING_STATE,
  READINESS_CONVERGENCE_PHASE,
]);

const PHASE_EVENT_START = 'phase:start';
const PHASE_EVENT_COMPLETE = 'phase:complete';
const PHASE_EVENT_FAILED = 'phase:failed';

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

// ---------------------------------------------------------------------------
// Seed bootstrap phase event ordering
// ---------------------------------------------------------------------------

test('Seed bootstrap - emits phase:start and phase:complete in correct order',
  async (t) => {
    initializeTestEnvironment();

    const bootstrap = new BootstrapService({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      wsPort: TEST_WS_PORT,
    });

    // Stub all phase implementations to no-ops so we test only event ordering
    bootstrap.seedPhaseOwners = {
      infrastructure: async () => {},
      messageGroups: async () => {},
      partitions: async () => {},
      registration: async () => {},
      cacheHydration: async () => {},
    };
    // Stub post-pipeline steps
    bootstrap.initializeReplicaHandler = () => {};
    bootstrap.initializeMessageGroupServiceHandler = () => {
      bootstrap.messageGroupServiceHandler = {};
    };
    bootstrap.initializeControlPlaneService = async () => {};
    bootstrap.registerSeedNodeWithControlPlane = async () => {};
    bootstrap.activateMessageGroupServiceRows = async () => {};
    bootstrap.initializeRuntimeServiceHandler = () => {};
    bootstrap.startLatencyTopologyLifecycle = () => {};
    bootstrap.activateControlPlaneBackgroundWriters = () => {};
    bootstrap.logger = SILENT_LOGGER;

    const events = [];
    bootstrap.on(PHASE_EVENT_START, (payload) => {
      events.push({type: PHASE_EVENT_START, phase: payload.phase});
    });
    bootstrap.on(PHASE_EVENT_COMPLETE, (payload) => {
      events.push({type: PHASE_EVENT_COMPLETE, phase: payload.phase});
    });

    const result = await bootstrap.bootstrap();
    t.equal(result.success, true, 'bootstrap should succeed');

    // Verify exact interleaved start/complete ordering
    const expectedEvents = EXPECTED_SEED_PHASE_ORDER.flatMap((phase) => [
      {type: PHASE_EVENT_START, phase},
      {type: PHASE_EVENT_COMPLETE, phase},
    ]);

    t.equal(
      events.length,
      expectedEvents.length,
      'should emit exactly one start and one complete per phase',
    );

    for (let i = NUM.ZERO; i < expectedEvents.length; i++) {
      t.equal(
        events[i].type,
        expectedEvents[i].type,
        `event[${i}] type should be ${expectedEvents[i].type}`,
      );
      t.equal(
        events[i].phase,
        expectedEvents[i].phase,
        `event[${i}] phase should be ${expectedEvents[i].phase}`,
      );
    }
  });

test('Seed bootstrap - emits BOOTSTRAP_EVENT.PHASE_START/COMPLETE in correct order',
  async (t) => {
    initializeTestEnvironment();

    const bootstrap = new BootstrapService({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      wsPort: TEST_WS_PORT,
    });

    bootstrap.seedPhaseOwners = {
      infrastructure: async () => {},
      messageGroups: async () => {},
      partitions: async () => {},
      registration: async () => {},
      cacheHydration: async () => {},
    };
    bootstrap.initializeReplicaHandler = () => {};
    bootstrap.initializeMessageGroupServiceHandler = () => {
      bootstrap.messageGroupServiceHandler = {};
    };
    bootstrap.initializeControlPlaneService = async () => {};
    bootstrap.registerSeedNodeWithControlPlane = async () => {};
    bootstrap.activateMessageGroupServiceRows = async () => {};
    bootstrap.initializeRuntimeServiceHandler = () => {};
    bootstrap.startLatencyTopologyLifecycle = () => {};
    bootstrap.activateControlPlaneBackgroundWriters = () => {};
    bootstrap.logger = SILENT_LOGGER;

    const events = [];
    bootstrap.on(BOOTSTRAP_EVENT.PHASE_START, (payload) => {
      events.push({type: BOOTSTRAP_EVENT.PHASE_START, phase: payload.phase});
    });
    bootstrap.on(BOOTSTRAP_EVENT.PHASE_COMPLETE, (payload) => {
      events.push({
        type: BOOTSTRAP_EVENT.PHASE_COMPLETE,
        phase: payload.phase,
      });
    });

    const result = await bootstrap.bootstrap();
    t.equal(result.success, true, 'bootstrap should succeed');

    const phaseStarts = events
      .filter((e) => e.type === BOOTSTRAP_EVENT.PHASE_START)
      .map((e) => e.phase);
    const phaseCompletes = events
      .filter((e) => e.type === BOOTSTRAP_EVENT.PHASE_COMPLETE)
      .map((e) => e.phase);

    t.same(
      phaseStarts,
      [...EXPECTED_SEED_PHASE_ORDER],
      'phaseStart events should follow seed phase order',
    );
    t.same(
      phaseCompletes,
      [...EXPECTED_SEED_PHASE_ORDER],
      'phaseComplete events should follow seed phase order',
    );
  });

test('Seed bootstrap - emits COMPLETE event after all phases', async (t) => {
  initializeTestEnvironment();

  const bootstrap = new BootstrapService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    wsPort: TEST_WS_PORT,
  });

  bootstrap.seedPhaseOwners = {
    infrastructure: async () => {},
    messageGroups: async () => {},
    partitions: async () => {},
    registration: async () => {},
    cacheHydration: async () => {},
  };
  bootstrap.initializeReplicaHandler = () => {};
  bootstrap.initializeMessageGroupServiceHandler = () => {
    bootstrap.messageGroupServiceHandler = {};
  };
  bootstrap.initializeControlPlaneService = async () => {};
  bootstrap.registerSeedNodeWithControlPlane = async () => {};
  bootstrap.activateMessageGroupServiceRows = async () => {};
  bootstrap.initializeRuntimeServiceHandler = () => {};
  bootstrap.startLatencyTopologyLifecycle = () => {};
  bootstrap.activateControlPlaneBackgroundWriters = () => {};
  bootstrap.logger = SILENT_LOGGER;

  const allEvents = [];
  bootstrap.on(BOOTSTRAP_EVENT.PHASE_COMPLETE, (payload) => {
    allEvents.push({type: BOOTSTRAP_EVENT.PHASE_COMPLETE, phase: payload.phase});
  });
  bootstrap.on(BOOTSTRAP_EVENT.COMPLETE, (payload) => {
    allEvents.push({type: BOOTSTRAP_EVENT.COMPLETE, nodeId: payload.nodeId});
  });

  const result = await bootstrap.bootstrap();
  t.equal(result.success, true, 'bootstrap should succeed');

  const lastEvent = allEvents[allEvents.length - 1];
  t.equal(
    lastEvent.type,
    BOOTSTRAP_EVENT.COMPLETE,
    'COMPLETE event should be the last event emitted',
  );
  t.equal(
    lastEvent.nodeId,
    TEST_NODE_ID,
    'COMPLETE event should carry the correct nodeId',
  );

  // All phase completes should precede the COMPLETE event
  const phaseCompleteCount = allEvents
    .filter((e) => e.type === BOOTSTRAP_EVENT.PHASE_COMPLETE).length;
  t.equal(
    phaseCompleteCount,
    EXPECTED_SEED_PHASE_ORDER.length,
    'all phase completes should fire before COMPLETE',
  );
});

test('Seed bootstrap - phase failure emits phase:failed and phaseFailed events',
  async (t) => {
    initializeTestEnvironment();

    const bootstrap = new BootstrapService({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      wsPort: TEST_WS_PORT,
    });

    const failureMessage = 'intentional partition phase failure';
    bootstrap.seedPhaseOwners = {
      infrastructure: async () => {},
      messageGroups: async () => {},
      partitions: async () => {
        throw new Error(failureMessage);
      },
      registration: async () => {},
      cacheHydration: async () => {},
    };
    bootstrap.initializeReplicaHandler = () => {};
    bootstrap.initializeMessageGroupServiceHandler = () => {};
    bootstrap.initializeControlPlaneService = async () => {};
    bootstrap.registerSeedNodeWithControlPlane = async () => {};
    bootstrap.activateMessageGroupServiceRows = async () => {};
    bootstrap.initializeRuntimeServiceHandler = () => {};
    bootstrap.startLatencyTopologyLifecycle = () => {};
    bootstrap.activateControlPlaneBackgroundWriters = () => {};
    bootstrap.handleBootstrapFailure = async (error) => ({
      success: false,
      error: error.message,
    });
    bootstrap.logger = SILENT_LOGGER;

    const events = [];
    bootstrap.on(PHASE_EVENT_START, (payload) => {
      events.push({type: PHASE_EVENT_START, phase: payload.phase});
    });
    bootstrap.on(PHASE_EVENT_COMPLETE, (payload) => {
      events.push({type: PHASE_EVENT_COMPLETE, phase: payload.phase});
    });
    bootstrap.on(PHASE_EVENT_FAILED, (payload) => {
      events.push({
        type: PHASE_EVENT_FAILED,
        phase: payload.phase,
        error: payload.error,
      });
    });
    bootstrap.on(BOOTSTRAP_EVENT.PHASE_FAILED, (payload) => {
      events.push({
        type: BOOTSTRAP_EVENT.PHASE_FAILED,
        phase: payload.phase,
        error: payload.error,
      });
    });

    const result = await bootstrap.bootstrap();
    t.equal(result.success, false, 'bootstrap should fail');

    // Infrastructure and message_groups should complete successfully
    const completedPhases = events
      .filter((e) => e.type === PHASE_EVENT_COMPLETE)
      .map((e) => e.phase);
    t.same(
      completedPhases,
      [BOOTSTRAP_PHASE.INFRASTRUCTURE, BOOTSTRAP_PHASE.MESSAGE_GROUPS],
      'only phases before failure should complete',
    );

    // Partitions phase should emit start then failed
    const partitionEvents = events.filter(
      (e) => e.phase === BOOTSTRAP_PHASE.PARTITIONS,
    );
    t.equal(partitionEvents.length, NUM.THREE,
      'failed phase should emit start + phase:failed + phaseFailed');
    t.equal(partitionEvents[0].type, PHASE_EVENT_START,
      'first event for failed phase should be start');
    t.equal(partitionEvents[1].type, BOOTSTRAP_EVENT.PHASE_FAILED,
      'second event for failed phase should be phaseFailed');
    t.equal(partitionEvents[1].error, failureMessage,
      'phaseFailed event should carry error message');
    t.equal(partitionEvents[2].type, PHASE_EVENT_FAILED,
      'third event for failed phase should be phase:failed');
    t.equal(partitionEvents[2].error, failureMessage,
      'phase:failed event should carry error message');

    // No events for phases after the failure
    const registrationEvents = events.filter(
      (e) => e.phase === BOOTSTRAP_PHASE.REGISTRATION,
    );
    t.equal(registrationEvents.length, NUM.ZERO,
      'phases after failure should not emit any events');
  });

// ---------------------------------------------------------------------------
// Join startup phase event ordering
// ---------------------------------------------------------------------------

/**
 * Stub a NodeJoiningService for phase event ordering tests.
 * Replaces phase owners and infrastructure methods with no-ops
 * while preserving the checkpoint-based join flow.
 * @param {NodeJoiningService} service
 * @param {string} assignmentStrategy - Message group assignment strategy.
 */
function stubJoinServiceForEventOrdering(service, assignmentStrategy) {
  service.joiningPhaseOwners = {
    contactSeed: async () => {
      service.bootstrapResponse = {
        messageGroupAssignment: {
          strategy: assignmentStrategy,
          groupId: 'mg-1',
          replicaToMove: 'replica-1',
        },
      };
      service.seedNodeId = 'seed-node';
      service.seedNodeWsAddress = 'ws://localhost:8081';
    },
    connectWebSocket: async () => {},
    createSelfHostedMessageGroup: async () => {},
    joinExistingMessageGroup: async () => {},
    waitForLeadership: async () => {},
    querySystemState: async () => {},
  };

  service.initializeJoinInfrastructure = async () => {};
  service.completeSuccessfulJoin = () => {
    service.lifecycleStateMachine.transition('ready');
    service.activateControlPlaneBackgroundWriters = () => {};
    service.startLatencyTopologyLifecycle = () => {};
    service.phase = JOINING_PHASE.COMPLETE;

    const duration = service.now() - service.startTime;
    service.emit(BOOTSTRAP_EVENT.COMPLETE, {
      nodeId: service.nodeId,
      duration,
      messageGroupServices: service.messageGroupServices,
      transport: service.transport,
      messageRouter: service.messageRouter,
      lifecycleState: service.lifecycleStateMachine.getState(),
    });
  };
  service.joinReadinessEvaluator
    .waitForCanonicalJoinReadinessConvergence = async () => {};
  service.signalReadyForReplicas = async () => {};
  service.activateMessageGroupServiceRows = async () => {};
  service.startJoinOpportunisticBackfill = () => {};
  service.hasJoinInfrastructureReady = () => true;
  service.logger = SILENT_LOGGER;
}

test('Join startup - emits phase start/complete events in correct order',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      seedNodeAddress: 'http://localhost:8080',
    });

    stubJoinServiceForEventOrdering(service, 'CREATE_SELF_HOSTED');

    const events = [];
    service.on(BOOTSTRAP_EVENT.PHASE_START, (payload) => {
      events.push({
        type: BOOTSTRAP_EVENT.PHASE_START,
        phase: payload.phase,
      });
    });
    service.on(BOOTSTRAP_EVENT.PHASE_COMPLETE, (payload) => {
      events.push({
        type: BOOTSTRAP_EVENT.PHASE_COMPLETE,
        phase: payload.phase,
      });
    });

    const result = await service.join();
    t.equal(result.success, true, 'join should succeed');

    const phaseStarts = events
      .filter((e) => e.type === BOOTSTRAP_EVENT.PHASE_START)
      .map((e) => e.phase);
    const phaseCompletes = events
      .filter((e) => e.type === BOOTSTRAP_EVENT.PHASE_COMPLETE)
      .map((e) => e.phase);

    t.same(
      phaseStarts,
      [...EXPECTED_JOIN_PHASE_ORDER],
      'join phaseStart events should follow join phase order',
    );
    t.same(
      phaseCompletes,
      [...EXPECTED_JOIN_PHASE_ORDER],
      'join phaseComplete events should follow join phase order',
    );

    // Verify interleaved ordering: each start precedes its complete
    for (const phase of EXPECTED_JOIN_PHASE_ORDER) {
      const startIdx = events.findIndex(
        (e) => e.type === BOOTSTRAP_EVENT.PHASE_START &&
          e.phase === phase,
      );
      const completeIdx = events.findIndex(
        (e) => e.type === BOOTSTRAP_EVENT.PHASE_COMPLETE &&
          e.phase === phase,
      );
      t.ok(
        startIdx < completeIdx,
        `phase ${phase}: start event should precede complete event`,
      );
    }
  });

test('Join startup - emits COMPLETE event after all phases', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: 'http://localhost:8080',
  });

  stubJoinServiceForEventOrdering(service, 'CREATE_SELF_HOSTED');

  const allEvents = [];
  service.on(BOOTSTRAP_EVENT.PHASE_COMPLETE, (payload) => {
    allEvents.push({
      type: BOOTSTRAP_EVENT.PHASE_COMPLETE,
      phase: payload.phase,
    });
  });
  service.on(BOOTSTRAP_EVENT.COMPLETE, (payload) => {
    allEvents.push({
      type: BOOTSTRAP_EVENT.COMPLETE,
      nodeId: payload.nodeId,
    });
  });

  const result = await service.join();
  t.equal(result.success, true, 'join should succeed');

  const lastEvent = allEvents[allEvents.length - 1];
  t.equal(
    lastEvent.type,
    BOOTSTRAP_EVENT.COMPLETE,
    'COMPLETE event should be the last event emitted',
  );
  t.equal(
    lastEvent.nodeId,
    TEST_NODE_ID,
    'COMPLETE event should carry the correct nodeId',
  );
});

test('Join startup - phase failure emits phaseFailed event with error',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      seedNodeAddress: 'http://localhost:8080',
    });

    const failureMessage = 'intentional websocket phase failure';
    stubJoinServiceForEventOrdering(service, 'CREATE_SELF_HOSTED');
    // Override connectWebSocket to throw
    service.joiningPhaseOwners.connectWebSocket = async () => {
      throw new Error(failureMessage);
    };
    service.handleJoiningFailure = async (error) => ({
      success: false,
      error: error.message,
    });

    const events = [];
    service.on(BOOTSTRAP_EVENT.PHASE_START, (payload) => {
      events.push({
        type: BOOTSTRAP_EVENT.PHASE_START,
        phase: payload.phase,
      });
    });
    service.on(BOOTSTRAP_EVENT.PHASE_COMPLETE, (payload) => {
      events.push({
        type: BOOTSTRAP_EVENT.PHASE_COMPLETE,
        phase: payload.phase,
      });
    });
    service.on(BOOTSTRAP_EVENT.PHASE_FAILED, (payload) => {
      events.push({
        type: BOOTSTRAP_EVENT.PHASE_FAILED,
        phase: payload.phase,
        error: payload.error,
      });
    });

    const result = await service.join();
    t.equal(result.success, false, 'join should fail');

    // contacting_seed should complete successfully
    const completedPhases = events
      .filter((e) => e.type === BOOTSTRAP_EVENT.PHASE_COMPLETE)
      .map((e) => e.phase);
    t.same(
      completedPhases,
      [JOINING_PHASE.CONTACTING_SEED],
      'only phases before failure should complete',
    );

    // connecting_websocket should emit start then failed
    const wsEvents = events.filter(
      (e) => e.phase === JOINING_PHASE.CONNECTING_WEBSOCKET,
    );
    t.equal(wsEvents.length, NUM.TWO,
      'failed phase should emit start + phaseFailed');
    t.equal(wsEvents[0].type, BOOTSTRAP_EVENT.PHASE_START,
      'first event for failed phase should be start');
    t.equal(wsEvents[1].type, BOOTSTRAP_EVENT.PHASE_FAILED,
      'second event for failed phase should be phaseFailed');
    t.equal(wsEvents[1].error, failureMessage,
      'phaseFailed event should carry error message');

    // No events for phases after the failure
    const leadershipEvents = events.filter(
      (e) => e.phase === JOINING_PHASE.WAITING_LEADERSHIP,
    );
    t.equal(leadershipEvents.length, NUM.ZERO,
      'phases after failure should not emit any events');
  });

test('Join startup - MOVE_REPLICA strategy emits joining_message_group phase',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      seedNodeAddress: 'http://localhost:8080',
    });

    stubJoinServiceForEventOrdering(service, 'MOVE_REPLICA');

    const phaseStarts = [];
    service.on(BOOTSTRAP_EVENT.PHASE_START, (payload) => {
      phaseStarts.push(payload.phase);
    });

    const result = await service.join();
    t.equal(result.success, true, 'join should succeed');

    // With MOVE_REPLICA, the message-group phase should be joining_message_group
    const expectedOrder = [
      JOINING_PHASE.CONTACTING_SEED,
      JOINING_PHASE.CONNECTING_WEBSOCKET,
      JOINING_PHASE.JOINING_MESSAGE_GROUP,
      JOINING_PHASE.WAITING_LEADERSHIP,
      JOINING_PHASE.QUERYING_STATE,
      READINESS_CONVERGENCE_PHASE,
    ];
    t.same(
      phaseStarts,
      expectedOrder,
      'MOVE_REPLICA strategy should emit joining_message_group phase',
    );
  });

// ---------------------------------------------------------------------------
// Event payload shape characterization
// ---------------------------------------------------------------------------

test('Seed bootstrap - phase event payloads include phase and nodeId',
  async (t) => {
    initializeTestEnvironment();

    const bootstrap = new BootstrapService({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      wsPort: TEST_WS_PORT,
    });

    bootstrap.seedPhaseOwners = {
      infrastructure: async () => {},
      messageGroups: async () => {},
      partitions: async () => {},
      registration: async () => {},
      cacheHydration: async () => {},
    };
    bootstrap.initializeReplicaHandler = () => {};
    bootstrap.initializeMessageGroupServiceHandler = () => {
      bootstrap.messageGroupServiceHandler = {};
    };
    bootstrap.initializeControlPlaneService = async () => {};
    bootstrap.registerSeedNodeWithControlPlane = async () => {};
    bootstrap.activateMessageGroupServiceRows = async () => {};
    bootstrap.initializeRuntimeServiceHandler = () => {};
    bootstrap.startLatencyTopologyLifecycle = () => {};
    bootstrap.activateControlPlaneBackgroundWriters = () => {};
    bootstrap.logger = SILENT_LOGGER;

    const startPayloads = [];
    const completePayloads = [];
    bootstrap.on(BOOTSTRAP_EVENT.PHASE_START, (payload) => {
      startPayloads.push(payload);
    });
    bootstrap.on(BOOTSTRAP_EVENT.PHASE_COMPLETE, (payload) => {
      completePayloads.push(payload);
    });

    await bootstrap.bootstrap();

    for (const payload of startPayloads) {
      t.ok(payload.phase, 'phaseStart payload should include phase');
      t.equal(
        payload.nodeId,
        TEST_NODE_ID,
        'phaseStart payload should include nodeId',
      );
    }

    for (const payload of completePayloads) {
      t.ok(payload.phase, 'phaseComplete payload should include phase');
      t.equal(
        payload.nodeId,
        TEST_NODE_ID,
        'phaseComplete payload should include nodeId',
      );
      t.ok(
        typeof payload.duration === 'number',
        'phaseComplete payload should include numeric duration',
      );
    }
  });

test('Join startup - phase event payloads include phase and nodeId',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      seedNodeAddress: 'http://localhost:8080',
    });

    stubJoinServiceForEventOrdering(service, 'CREATE_SELF_HOSTED');

    const startPayloads = [];
    const completePayloads = [];
    service.on(BOOTSTRAP_EVENT.PHASE_START, (payload) => {
      startPayloads.push(payload);
    });
    service.on(BOOTSTRAP_EVENT.PHASE_COMPLETE, (payload) => {
      completePayloads.push(payload);
    });

    await service.join();

    for (const payload of startPayloads) {
      t.ok(payload.phase, 'phaseStart payload should include phase');
      t.equal(
        payload.nodeId,
        TEST_NODE_ID,
        'phaseStart payload should include nodeId',
      );
    }

    for (const payload of completePayloads) {
      t.ok(payload.phase, 'phaseComplete payload should include phase');
      t.equal(
        payload.nodeId,
        TEST_NODE_ID,
        'phaseComplete payload should include nodeId',
      );
      t.ok(
        typeof payload.duration === 'number',
        'phaseComplete payload should include numeric duration',
      );
    }
  });

// ---------------------------------------------------------------------------
// Normalized lifecycle diagnostics tuple (D5.3, Req 4.3)
// ---------------------------------------------------------------------------

/**
 * Expected lifecycle tuple fields for phase events.
 * Per D5.3, every phase log/event must include: state, phase, subPhase, duration.
 * Start events omit duration (not yet known); complete/failed events include it.
 */
const LIFECYCLE_TUPLE_START_KEYS = Object.freeze([
  'phase', 'nodeId', 'state', 'subPhase',
]);
const LIFECYCLE_TUPLE_COMPLETE_KEYS = Object.freeze([
  'phase', 'nodeId', 'state', 'subPhase', 'duration',
]);
const LIFECYCLE_TUPLE_FAILED_KEYS = Object.freeze([
  'phase', 'nodeId', 'state', 'subPhase', 'duration', 'error',
]);

test('Seed bootstrap - phase events include normalized lifecycle tuple ' +
  '(state, phase, subPhase, duration) — uses lifecycleStateMachine owner',
async (t) => {
  initializeTestEnvironment();

  const bootstrap = new BootstrapService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    wsPort: TEST_WS_PORT,
  });

  bootstrap.seedPhaseOwners = {
    infrastructure: async () => {},
    messageGroups: async () => {},
    partitions: async () => {},
    registration: async () => {},
    cacheHydration: async () => {},
  };
  bootstrap.initializeReplicaHandler = () => {};
  bootstrap.initializeMessageGroupServiceHandler = () => {
    bootstrap.messageGroupServiceHandler = {};
  };
  bootstrap.initializeControlPlaneService = async () => {};
  bootstrap.registerSeedNodeWithControlPlane = async () => {};
  bootstrap.activateMessageGroupServiceRows = async () => {};
  bootstrap.initializeRuntimeServiceHandler = () => {};
  bootstrap.startLatencyTopologyLifecycle = () => {};
  bootstrap.activateControlPlaneBackgroundWriters = () => {};
  bootstrap.logger = SILENT_LOGGER;

  const startPayloads = [];
  const completePayloads = [];
  bootstrap.on(BOOTSTRAP_EVENT.PHASE_START, (payload) => {
    startPayloads.push(payload);
  });
  bootstrap.on(BOOTSTRAP_EVENT.PHASE_COMPLETE, (payload) => {
    completePayloads.push(payload);
  });

  await bootstrap.bootstrap();

  // All start payloads carry the lifecycle tuple (minus duration)
  for (const payload of startPayloads) {
    for (const key of LIFECYCLE_TUPLE_START_KEYS) {
      t.ok(
        key in payload,
        `seed phaseStart for ${payload.phase} includes '${key}'`,
      );
    }
    t.ok(
      typeof payload.state === 'string',
      `seed phaseStart state is a string for ${payload.phase}`,
    );
  }

  // Non-terminal phases run in STARTING; cache_hydration is terminal
  // and auto-advances to CONNECTING before the event fires.
  const nonTerminalStarts = startPayloads.filter(
    (p) => p.phase !== BOOTSTRAP_PHASE.CACHE_HYDRATION,
  );
  for (const payload of nonTerminalStarts) {
    t.equal(
      payload.state,
      NodeState.STARTING,
      `seed phaseStart state is STARTING for ${payload.phase}`,
    );
  }
  const cacheStart = startPayloads.find(
    (p) => p.phase === BOOTSTRAP_PHASE.CACHE_HYDRATION,
  );
  t.equal(
    cacheStart.state,
    NodeState.CONNECTING,
    'seed cache_hydration phaseStart state is CONNECTING (terminal advance)',
  );

  // All complete payloads carry the full lifecycle tuple
  for (const payload of completePayloads) {
    for (const key of LIFECYCLE_TUPLE_COMPLETE_KEYS) {
      t.ok(
        key in payload,
        `seed phaseComplete for ${payload.phase} includes '${key}'`,
      );
    }
    t.equal(
      typeof payload.duration,
      'number',
      `seed phaseComplete duration is numeric for ${payload.phase}`,
    );
  }

  // Verify subPhase values match BOOTSTRAP_SUB_PHASE mapping
  const firstStart = startPayloads[NUM.ZERO];
  t.equal(
    firstStart.subPhase,
    BOOTSTRAP_SUB_PHASE.INFRASTRUCTURE,
    'first seed phase subPhase is infrastructure',
  );
});

test('Seed bootstrap - phase:failed event includes normalized lifecycle ' +
  'tuple — uses lifecycleStateMachine owner',
async (t) => {
  initializeTestEnvironment();

  const bootstrap = new BootstrapService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    wsPort: TEST_WS_PORT,
  });

  const failureMessage = 'intentional infra failure for tuple test';
  bootstrap.seedPhaseOwners = {
    infrastructure: async () => {
      throw new Error(failureMessage);
    },
    messageGroups: async () => {},
    partitions: async () => {},
    registration: async () => {},
    cacheHydration: async () => {},
  };
  bootstrap.initializeReplicaHandler = () => {};
  bootstrap.initializeMessageGroupServiceHandler = () => {};
  bootstrap.initializeControlPlaneService = async () => {};
  bootstrap.registerSeedNodeWithControlPlane = async () => {};
  bootstrap.activateMessageGroupServiceRows = async () => {};
  bootstrap.initializeRuntimeServiceHandler = () => {};
  bootstrap.startLatencyTopologyLifecycle = () => {};
  bootstrap.activateControlPlaneBackgroundWriters = () => {};
  bootstrap.handleBootstrapFailure = async (error) => ({
    success: false,
    error: error.message,
  });
  bootstrap.logger = SILENT_LOGGER;

  const failedPayloads = [];
  bootstrap.on(BOOTSTRAP_EVENT.PHASE_FAILED, (payload) => {
    failedPayloads.push(payload);
  });

  await bootstrap.bootstrap();

  t.equal(failedPayloads.length, NUM.ONE,
    'exactly one phaseFailed event emitted');

  const payload = failedPayloads[NUM.ZERO];
  for (const key of LIFECYCLE_TUPLE_FAILED_KEYS) {
    t.ok(
      key in payload,
      `seed phaseFailed includes '${key}'`,
    );
  }
  t.equal(payload.state, NodeState.STARTING,
    'seed phaseFailed state is STARTING');
  t.equal(payload.phase, BOOTSTRAP_PHASE.INFRASTRUCTURE,
    'seed phaseFailed phase is infrastructure');
  t.equal(payload.error, failureMessage,
    'seed phaseFailed carries error message');
});

test('Join startup - phase events include normalized lifecycle tuple ' +
  '(state, phase, subPhase, duration) — uses lifecycleStateMachine owner',
async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: 'http://localhost:8080',
  });

  stubJoinServiceForEventOrdering(service, 'CREATE_SELF_HOSTED');

  const startPayloads = [];
  const completePayloads = [];
  service.on(BOOTSTRAP_EVENT.PHASE_START, (payload) => {
    startPayloads.push(payload);
  });
  service.on(BOOTSTRAP_EVENT.PHASE_COMPLETE, (payload) => {
    completePayloads.push(payload);
  });

  await service.join();

  // All start payloads carry the lifecycle tuple (minus duration)
  for (const payload of startPayloads) {
    for (const key of LIFECYCLE_TUPLE_START_KEYS) {
      t.ok(
        key in payload,
        `join phaseStart for ${payload.phase} includes '${key}'`,
      );
    }
    t.ok(
      typeof payload.state === 'string',
      `join phaseStart state is a string for ${payload.phase}`,
    );
  }

  // All complete payloads carry the full lifecycle tuple
  for (const payload of completePayloads) {
    for (const key of LIFECYCLE_TUPLE_COMPLETE_KEYS) {
      t.ok(
        key in payload,
        `join phaseComplete for ${payload.phase} includes '${key}'`,
      );
    }
    t.equal(
      typeof payload.duration,
      'number',
      `join phaseComplete duration is numeric for ${payload.phase}`,
    );
  }

  // Verify subPhase values match JOINING_PHASE_TO_SUB_PHASE mapping.
  // The last phase (readiness convergence) is terminal and auto-advances
  // to READY, which resets subPhase to null.
  const lastComplete = completePayloads[completePayloads.length - NUM.ONE];
  t.equal(
    lastComplete.phase,
    READINESS_CONVERGENCE_PHASE,
    'last join phase is readiness convergence',
  );
  t.equal(
    lastComplete.subPhase,
    null,
    'last join phase subPhase is null (terminal advance resets it)',
  );
  t.equal(
    lastComplete.state,
    NodeState.READY,
    'last join phase state is READY (terminal advance)',
  );
});

test('Join startup - phaseFailed event includes normalized lifecycle ' +
  'tuple — uses lifecycleStateMachine owner',
async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: 'http://localhost:8080',
  });

  const failureMessage = 'intentional ws failure for tuple test';
  stubJoinServiceForEventOrdering(service, 'CREATE_SELF_HOSTED');
  service.joiningPhaseOwners.connectWebSocket = async () => {
    throw new Error(failureMessage);
  };
  service.handleJoiningFailure = async (error) => ({
    success: false,
    error: error.message,
  });

  const failedPayloads = [];
  service.on(BOOTSTRAP_EVENT.PHASE_FAILED, (payload) => {
    failedPayloads.push(payload);
  });

  await service.join();

  t.equal(failedPayloads.length, NUM.ONE,
    'exactly one phaseFailed event emitted');

  const payload = failedPayloads[NUM.ZERO];
  for (const key of LIFECYCLE_TUPLE_FAILED_KEYS) {
    t.ok(
      key in payload,
      `join phaseFailed includes '${key}'`,
    );
  }
  t.equal(payload.phase, JOINING_PHASE.CONNECTING_WEBSOCKET,
    'join phaseFailed phase is connecting_websocket');
  t.equal(payload.error, failureMessage,
    'join phaseFailed carries error message');
  t.ok(
    typeof payload.state === 'string',
    'join phaseFailed state is a string',
  );
});

test('Seed and join phase events share the same lifecycle tuple shape ' +
  '— normalized diagnostics parity (D5.3)',
async (t) => {
  initializeTestEnvironment();

  // Collect seed payloads
  const bootstrap = new BootstrapService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    wsPort: TEST_WS_PORT,
  });

  bootstrap.seedPhaseOwners = {
    infrastructure: async () => {},
    messageGroups: async () => {},
    partitions: async () => {},
    registration: async () => {},
    cacheHydration: async () => {},
  };
  bootstrap.initializeReplicaHandler = () => {};
  bootstrap.initializeMessageGroupServiceHandler = () => {
    bootstrap.messageGroupServiceHandler = {};
  };
  bootstrap.initializeControlPlaneService = async () => {};
  bootstrap.registerSeedNodeWithControlPlane = async () => {};
  bootstrap.activateMessageGroupServiceRows = async () => {};
  bootstrap.initializeRuntimeServiceHandler = () => {};
  bootstrap.startLatencyTopologyLifecycle = () => {};
  bootstrap.activateControlPlaneBackgroundWriters = () => {};
  bootstrap.logger = SILENT_LOGGER;

  const seedComplete = [];
  bootstrap.on(BOOTSTRAP_EVENT.PHASE_COMPLETE, (p) => seedComplete.push(p));
  await bootstrap.bootstrap();

  // Collect join payloads
  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: 'http://localhost:8080',
  });
  stubJoinServiceForEventOrdering(service, 'CREATE_SELF_HOSTED');

  const joinComplete = [];
  service.on(BOOTSTRAP_EVENT.PHASE_COMPLETE, (p) => joinComplete.push(p));
  await service.join();

  // Both paths must emit the same set of lifecycle tuple keys
  const seedKeys = Object.keys(seedComplete[NUM.ZERO]).sort();
  const joinKeys = Object.keys(joinComplete[NUM.ZERO]).sort();

  t.same(
    seedKeys,
    joinKeys,
    'seed and join phaseComplete payloads have identical key sets',
  );
});
