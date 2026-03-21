/**
 * Characterization tests for join sub-phase transition parity.
 *
 * These tests lock the lifecycle sub-phase transition behavior during
 * bootstrap and join phase execution. Bootstrap already applies sub-phase
 * transitions via a declarative PHASE_TO_SUB_PHASE map inside executePhase.
 * Join should adopt the same pattern but currently does not — these tests
 * characterize the gap and define the target contract.
 *
 * Requirements: 4.1, 4.2, 4.4, 9.2
 * Design: D5.1, D5.2, D11.1
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {
  BOOTSTRAP_EVENT,
  JOINING_PHASE,
} from '../../src/bootstrap/bootstrap-constants.js';
import {
  BOOTSTRAP_SUB_PHASE,
  JOINING_SUB_PHASE,
  NODE_LIFECYCLE_EVENT,
} from '../../src/node/node-constants.js';
import {
  NodeLifecycleStateMachine,
  NodeState,
} from '../../src/node/node-lifecycle-state-machine.js';
import {
  NODE_LIFECYCLE_TERMINAL_SUB_PHASE_ADVANCE,
  NODE_LIFECYCLE_VALID_SUB_PHASES,
  NODE_LIFECYCLE_VALID_SUB_PHASE_TRANSITIONS,
  NODE_LIFECYCLE_SUB_PHASE_ROOT,
} from '../../src/node/node-lifecycle-state-machine-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';

// -- Suite-local fixture constants --

const TEST_NODE_ID = 'lifecycle-parity-node';
const TEST_NODE_ADDRESS = 'ws://localhost:19998';
const TEST_WS_PORT = 19998;
const SILENT_LOGGER = Object.freeze({
  info() {},
  debug() {},
  warn() {},
  error() {},
});

/**
 * Expected mapping from JOINING_PHASE to JOINING_SUB_PHASE.
 * This is the declarative map that join executePhase should use
 * (D5.1: centralized map keyed by JOINING_PHASE).
 */
const EXPECTED_JOIN_PHASE_TO_SUB_PHASE = Object.freeze({
  [JOINING_PHASE.CONTACTING_SEED]: JOINING_SUB_PHASE.CONTACTING_SEED,
  [JOINING_PHASE.CONNECTING_WEBSOCKET]: JOINING_SUB_PHASE.CONNECTING_WEBSOCKET,
  [JOINING_PHASE.CREATING_MESSAGE_GROUP]:
    JOINING_SUB_PHASE.CREATING_MESSAGE_GROUP,
  [JOINING_PHASE.JOINING_MESSAGE_GROUP]:
    JOINING_SUB_PHASE.JOINING_MESSAGE_GROUP,
  [JOINING_PHASE.WAITING_LEADERSHIP]: JOINING_SUB_PHASE.WAITING_LEADERSHIP,
  [JOINING_PHASE.QUERYING_STATE]: JOINING_SUB_PHASE.QUERYING_STATE,
});

/**
 * Ordered join sub-phases for the CREATE_SELF_HOSTED path.
 */
const CREATE_SELF_HOSTED_SUB_PHASE_ORDER = Object.freeze([
  JOINING_SUB_PHASE.CONTACTING_SEED,
  JOINING_SUB_PHASE.CONNECTING_WEBSOCKET,
  JOINING_SUB_PHASE.CREATING_MESSAGE_GROUP,
  JOINING_SUB_PHASE.WAITING_LEADERSHIP,
  JOINING_SUB_PHASE.QUERYING_STATE,
]);

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

/**
 * Stub a NodeJoiningService for lifecycle sub-phase parity tests.
 * Replaces phase owners and infrastructure methods with no-ops
 * while preserving the checkpoint-based join flow and lifecycle
 * state machine.
 * @param {NodeJoiningService} service - The service to stub.
 */
function stubJoinServiceForSubPhaseTests(service) {
  service.joiningPhaseOwners = {
    contactSeed: async () => {
      service.bootstrapResponse = {
        messageGroupAssignment: {
          strategy: 'CREATE_SELF_HOSTED',
          groupId: 'mg-1',
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
    service.lifecycleStateMachine.transition(NodeState.READY);
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

// ---------------------------------------------------------------------------
// Bootstrap sub-phase transition characterization (reference behavior)
// ---------------------------------------------------------------------------

test('Bootstrap executePhase updates lifecycle sub-phases during phase execution',
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
      bootstrap.messageGroupServiceHandlerRegistered = true;
    };
    bootstrap.initializeControlPlaneService = async () => {};
    bootstrap.registerSeedNodeWithControlPlane = async () => {};
    bootstrap.activateMessageGroupServiceRows = async () => {};
    bootstrap.initializeRuntimeServiceHandler = () => {};
    bootstrap.startLatencyTopologyLifecycle = () => {};
    bootstrap.activateControlPlaneBackgroundWriters = () => {};
    bootstrap.logger = SILENT_LOGGER;

    const subPhaseChanges = [];
    bootstrap.lifecycleStateMachine.on(
      NODE_LIFECYCLE_EVENT.SUB_PHASE_CHANGE,
      (payload) => {
        subPhaseChanges.push({
          parentState: payload.parentState,
          from: payload.from,
          to: payload.to,
        });
      },
    );

    const result = await bootstrap.bootstrap();
    t.equal(result.success, true, 'bootstrap should succeed');

    // Bootstrap should transition through all sub-phases
    const subPhaseNames = subPhaseChanges.map((c) => c.to);
    t.same(
      subPhaseNames,
      [
        BOOTSTRAP_SUB_PHASE.INFRASTRUCTURE,
        BOOTSTRAP_SUB_PHASE.MESSAGE_GROUPS,
        BOOTSTRAP_SUB_PHASE.PARTITIONS,
        BOOTSTRAP_SUB_PHASE.REGISTRATION,
        BOOTSTRAP_SUB_PHASE.CACHE_HYDRATION,
      ],
      'bootstrap should transition through all sub-phases in order',
    );

    // All sub-phase changes should happen under STARTING parent state
    for (const change of subPhaseChanges) {
      t.equal(
        change.parentState,
        NodeState.STARTING,
        `sub-phase ${change.to} should occur under STARTING state`,
      );
    }
  });

test('Bootstrap terminal sub-phase CACHE_HYDRATION auto-advances to CONNECTING',
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
      bootstrap.messageGroupServiceHandlerRegistered = true;
    };
    bootstrap.initializeControlPlaneService = async () => {};
    bootstrap.registerSeedNodeWithControlPlane = async () => {};
    bootstrap.activateMessageGroupServiceRows = async () => {};
    bootstrap.initializeRuntimeServiceHandler = () => {};
    bootstrap.startLatencyTopologyLifecycle = () => {};
    bootstrap.activateControlPlaneBackgroundWriters = () => {};
    bootstrap.logger = SILENT_LOGGER;

    const stateChanges = [];
    bootstrap.lifecycleStateMachine.on(
      NODE_LIFECYCLE_EVENT.STATE_CHANGE,
      (payload) => {
        stateChanges.push({from: payload.from, to: payload.to});
      },
    );

    const result = await bootstrap.bootstrap();
    t.equal(result.success, true, 'bootstrap should succeed');

    // Terminal sub-phase CACHE_HYDRATION should auto-advance to CONNECTING
    const connectingTransition = stateChanges.find(
      (c) => c.to === NodeState.CONNECTING,
    );
    t.ok(
      connectingTransition,
      'terminal sub-phase should auto-advance state to CONNECTING',
    );
    t.equal(
      connectingTransition.from,
      NodeState.STARTING,
      'auto-advance should transition from STARTING to CONNECTING',
    );
  });

// ---------------------------------------------------------------------------
// Join sub-phase transition parity tests (Validates: Requirements 4.1, 4.4)
// ---------------------------------------------------------------------------

test('Join executePhase should update lifecycle sub-phases during phase execution',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      seedNodeAddress: 'http://localhost:8080',
    });

    stubJoinServiceForSubPhaseTests(service);

    const subPhaseChanges = [];
    service.lifecycleStateMachine.on(
      NODE_LIFECYCLE_EVENT.SUB_PHASE_CHANGE,
      (payload) => {
        subPhaseChanges.push({
          parentState: payload.parentState,
          from: payload.from,
          to: payload.to,
        });
      },
    );

    const result = await service.join();
    t.equal(result.success, true, 'join should succeed');

    // Join should transition through sub-phases as phases execute
    // (parity with bootstrap's PHASE_TO_SUB_PHASE pattern)
    const subPhaseNames = subPhaseChanges.map((c) => c.to);

    t.ok(
      subPhaseNames.length > 0,
      'join executePhase should emit sub-phase transitions ' +
      '(Validates: Requirements 4.1)',
    );

    // Verify the expected sub-phase order for CREATE_SELF_HOSTED path
    t.same(
      subPhaseNames,
      [...CREATE_SELF_HOSTED_SUB_PHASE_ORDER],
      'join sub-phases should follow the declared phase-to-sub-phase ' +
      'mapping order (Validates: Requirements 4.4)',
    );

    // All join sub-phase changes should happen under JOINING parent state
    const joiningSubPhases = subPhaseChanges.filter(
      (c) => c.parentState === NodeState.JOINING,
    );
    t.equal(
      joiningSubPhases.length,
      subPhaseChanges.length,
      'all join sub-phase transitions should occur under JOINING state',
    );
  });

// ---------------------------------------------------------------------------
// Terminal READY transition semantics (Validates: Requirements 4.2)
// ---------------------------------------------------------------------------

test('Join terminal sub-phase QUERYING_STATE should preserve READY transition',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      seedNodeAddress: 'http://localhost:8080',
    });

    stubJoinServiceForSubPhaseTests(service);

    const stateChanges = [];
    service.lifecycleStateMachine.on(
      NODE_LIFECYCLE_EVENT.STATE_CHANGE,
      (payload) => {
        stateChanges.push({from: payload.from, to: payload.to});
      },
    );

    const result = await service.join();
    t.equal(result.success, true, 'join should succeed');

    // The final state should be READY
    t.equal(
      service.lifecycleStateMachine.getState(),
      NodeState.READY,
      'lifecycle state should be READY after successful join ' +
      '(Validates: Requirements 4.2)',
    );

    // Verify READY transition exists in state changes
    const readyTransition = stateChanges.find(
      (c) => c.to === NodeState.READY,
    );
    t.ok(
      readyTransition,
      'should have a state transition to READY',
    );
  });

// ---------------------------------------------------------------------------
// Declarative phase-to-sub-phase mapping contract (Validates: Requirements 4.4)
// ---------------------------------------------------------------------------

test('JOINING_PHASE values have corresponding JOINING_SUB_PHASE entries',
  async (t) => {
    // Every executable join phase should have a sub-phase mapping.
    // NOT_STARTED, COMPLETE, and FAILED are lifecycle markers, not
    // executable phases.
    const executablePhases = [
      JOINING_PHASE.CONTACTING_SEED,
      JOINING_PHASE.CONNECTING_WEBSOCKET,
      JOINING_PHASE.CREATING_MESSAGE_GROUP,
      JOINING_PHASE.JOINING_MESSAGE_GROUP,
      JOINING_PHASE.WAITING_LEADERSHIP,
      JOINING_PHASE.QUERYING_STATE,
    ];

    for (const phase of executablePhases) {
      const expectedSubPhase = EXPECTED_JOIN_PHASE_TO_SUB_PHASE[phase];
      t.ok(
        expectedSubPhase,
        `JOINING_PHASE.${phase} should have a corresponding sub-phase`,
      );
      t.ok(
        Object.values(JOINING_SUB_PHASE).includes(expectedSubPhase),
        `sub-phase for ${phase} should be a valid JOINING_SUB_PHASE value`,
      );
    }
  });

test('JOINING_SUB_PHASE values are registered in lifecycle state machine',
  async (t) => {
    // All JOINING_SUB_PHASE values should be valid sub-phases for
    // the JOINING parent state in the lifecycle state machine.
    const validJoiningSubPhases =
      NODE_LIFECYCLE_VALID_SUB_PHASES[NodeState.JOINING];

    t.ok(
      validJoiningSubPhases,
      'JOINING state should have valid sub-phases defined',
    );

    for (const subPhase of Object.values(JOINING_SUB_PHASE)) {
      t.ok(
        validJoiningSubPhases.includes(subPhase),
        `JOINING_SUB_PHASE.${subPhase} should be registered as valid ` +
        'for JOINING state',
      );
    }
  });

test('JOINING_SUB_PHASE transitions form a valid chain from root',
  async (t) => {
    // Verify the sub-phase transition chain is connected:
    // null -> CONTACTING_SEED -> CONNECTING_WEBSOCKET ->
    //   CREATING_MESSAGE_GROUP or JOINING_MESSAGE_GROUP ->
    //   WAITING_LEADERSHIP -> QUERYING_STATE
    const rootTransitions =
      NODE_LIFECYCLE_VALID_SUB_PHASE_TRANSITIONS[
        NODE_LIFECYCLE_SUB_PHASE_ROOT
      ];
    t.ok(
      rootTransitions.includes(JOINING_SUB_PHASE.CONTACTING_SEED),
      'root should allow transition to CONTACTING_SEED',
    );

    const fromContactingSeed =
      NODE_LIFECYCLE_VALID_SUB_PHASE_TRANSITIONS[
        JOINING_SUB_PHASE.CONTACTING_SEED
      ];
    t.ok(
      fromContactingSeed.includes(JOINING_SUB_PHASE.CONNECTING_WEBSOCKET),
      'CONTACTING_SEED should allow transition to CONNECTING_WEBSOCKET',
    );

    const fromConnectingWs =
      NODE_LIFECYCLE_VALID_SUB_PHASE_TRANSITIONS[
        JOINING_SUB_PHASE.CONNECTING_WEBSOCKET
      ];
    t.ok(
      fromConnectingWs.includes(JOINING_SUB_PHASE.CREATING_MESSAGE_GROUP),
      'CONNECTING_WEBSOCKET should allow transition to ' +
      'CREATING_MESSAGE_GROUP',
    );
    t.ok(
      fromConnectingWs.includes(JOINING_SUB_PHASE.JOINING_MESSAGE_GROUP),
      'CONNECTING_WEBSOCKET should allow transition to ' +
      'JOINING_MESSAGE_GROUP',
    );

    const fromCreating =
      NODE_LIFECYCLE_VALID_SUB_PHASE_TRANSITIONS[
        JOINING_SUB_PHASE.CREATING_MESSAGE_GROUP
      ];
    t.ok(
      fromCreating.includes(JOINING_SUB_PHASE.WAITING_LEADERSHIP),
      'CREATING_MESSAGE_GROUP should allow transition to ' +
      'WAITING_LEADERSHIP',
    );

    const fromJoining =
      NODE_LIFECYCLE_VALID_SUB_PHASE_TRANSITIONS[
        JOINING_SUB_PHASE.JOINING_MESSAGE_GROUP
      ];
    t.ok(
      fromJoining.includes(JOINING_SUB_PHASE.WAITING_LEADERSHIP),
      'JOINING_MESSAGE_GROUP should allow transition to ' +
      'WAITING_LEADERSHIP',
    );

    const fromWaiting =
      NODE_LIFECYCLE_VALID_SUB_PHASE_TRANSITIONS[
        JOINING_SUB_PHASE.WAITING_LEADERSHIP
      ];
    t.ok(
      fromWaiting.includes(JOINING_SUB_PHASE.QUERYING_STATE),
      'WAITING_LEADERSHIP should allow transition to QUERYING_STATE',
    );
  });

test('QUERYING_STATE is the terminal join sub-phase that advances to READY',
  async (t) => {
    // D5.2: Terminal join sub-phase (QUERYING_STATE) should preserve
    // current JOINING -> READY behavior.
    const terminalAdvance =
      NODE_LIFECYCLE_TERMINAL_SUB_PHASE_ADVANCE[
        JOINING_SUB_PHASE.QUERYING_STATE
      ];
    t.equal(
      terminalAdvance,
      NodeState.READY,
      'QUERYING_STATE terminal sub-phase should advance to READY ' +
      '(Validates: Requirements 4.2)',
    );
  });

test('CACHE_HYDRATION is the terminal bootstrap sub-phase that advances to CONNECTING',
  async (t) => {
    // Reference: bootstrap terminal sub-phase behavior for parity comparison.
    const terminalAdvance =
      NODE_LIFECYCLE_TERMINAL_SUB_PHASE_ADVANCE[
        BOOTSTRAP_SUB_PHASE.CACHE_HYDRATION
      ];
    t.equal(
      terminalAdvance,
      NodeState.CONNECTING,
      'CACHE_HYDRATION terminal sub-phase should advance to CONNECTING',
    );
  });

// ---------------------------------------------------------------------------
// Lifecycle state machine unit tests for join sub-phase transitions
// ---------------------------------------------------------------------------

test('Lifecycle state machine - full join sub-phase chain with ' +
  'CREATE_SELF_HOSTED path', async (t) => {
  initializeTestEnvironment();

  const sm = new NodeLifecycleStateMachine({
    nodeId: TEST_NODE_ID,
    initialState: NodeState.JOINING,
  });

  const subPhaseChanges = [];
  sm.on(NODE_LIFECYCLE_EVENT.SUB_PHASE_CHANGE, (payload) => {
    subPhaseChanges.push({from: payload.from, to: payload.to});
  });

  // Walk through the CREATE_SELF_HOSTED sub-phase chain
  t.equal(
    sm.transitionSubPhase(JOINING_SUB_PHASE.CONTACTING_SEED),
    true,
    'should transition to CONTACTING_SEED',
  );
  t.equal(
    sm.getSubPhase(),
    JOINING_SUB_PHASE.CONTACTING_SEED,
    'sub-phase should be CONTACTING_SEED',
  );

  t.equal(
    sm.transitionSubPhase(JOINING_SUB_PHASE.CONNECTING_WEBSOCKET),
    true,
    'should transition to CONNECTING_WEBSOCKET',
  );

  t.equal(
    sm.transitionSubPhase(JOINING_SUB_PHASE.CREATING_MESSAGE_GROUP),
    true,
    'should transition to CREATING_MESSAGE_GROUP',
  );

  t.equal(
    sm.transitionSubPhase(JOINING_SUB_PHASE.WAITING_LEADERSHIP),
    true,
    'should transition to WAITING_LEADERSHIP',
  );

  // QUERYING_STATE is terminal — should auto-advance to READY
  t.equal(
    sm.transitionSubPhase(JOINING_SUB_PHASE.QUERYING_STATE),
    true,
    'should transition to QUERYING_STATE (terminal)',
  );

  // After terminal sub-phase, state should auto-advance to READY
  t.equal(
    sm.getState(),
    NodeState.READY,
    'terminal QUERYING_STATE should auto-advance state to READY',
  );

  // Sub-phase should be cleared after state advance
  t.equal(
    sm.getSubPhase(),
    null,
    'sub-phase should be null after state auto-advance',
  );

  // Verify all sub-phase durations were recorded
  const durations = sm.getAllSubPhaseDurations();
  for (const subPhase of CREATE_SELF_HOSTED_SUB_PHASE_ORDER) {
    t.ok(
      subPhase in durations,
      `duration should be recorded for ${subPhase}`,
    );
  }
});

test('Lifecycle state machine - full join sub-phase chain with ' +
  'MOVE_REPLICA path', async (t) => {
  initializeTestEnvironment();

  const sm = new NodeLifecycleStateMachine({
    nodeId: TEST_NODE_ID,
    initialState: NodeState.JOINING,
  });

  // Walk through the MOVE_REPLICA sub-phase chain
  t.equal(
    sm.transitionSubPhase(JOINING_SUB_PHASE.CONTACTING_SEED),
    true,
    'should transition to CONTACTING_SEED',
  );

  t.equal(
    sm.transitionSubPhase(JOINING_SUB_PHASE.CONNECTING_WEBSOCKET),
    true,
    'should transition to CONNECTING_WEBSOCKET',
  );

  // MOVE_REPLICA uses JOINING_MESSAGE_GROUP instead of CREATING
  t.equal(
    sm.transitionSubPhase(JOINING_SUB_PHASE.JOINING_MESSAGE_GROUP),
    true,
    'should transition to JOINING_MESSAGE_GROUP',
  );

  t.equal(
    sm.transitionSubPhase(JOINING_SUB_PHASE.WAITING_LEADERSHIP),
    true,
    'should transition to WAITING_LEADERSHIP',
  );

  t.equal(
    sm.transitionSubPhase(JOINING_SUB_PHASE.QUERYING_STATE),
    true,
    'should transition to QUERYING_STATE (terminal)',
  );

  t.equal(
    sm.getState(),
    NodeState.READY,
    'terminal QUERYING_STATE should auto-advance to READY via ' +
    'MOVE_REPLICA path',
  );
});

test('Lifecycle state machine - join sub-phase rejects invalid transitions',
  async (t) => {
    initializeTestEnvironment();

    const sm = new NodeLifecycleStateMachine({
      nodeId: TEST_NODE_ID,
      initialState: NodeState.JOINING,
    });

    // Cannot skip directly to WAITING_LEADERSHIP from root
    t.equal(
      sm.transitionSubPhase(JOINING_SUB_PHASE.WAITING_LEADERSHIP),
      false,
      'should reject skip from root to WAITING_LEADERSHIP',
    );

    // Start valid chain
    sm.transitionSubPhase(JOINING_SUB_PHASE.CONTACTING_SEED);

    // Cannot skip to QUERYING_STATE from CONTACTING_SEED
    t.equal(
      sm.transitionSubPhase(JOINING_SUB_PHASE.QUERYING_STATE),
      false,
      'should reject skip from CONTACTING_SEED to QUERYING_STATE',
    );

    // Cannot go backward
    sm.transitionSubPhase(JOINING_SUB_PHASE.CONNECTING_WEBSOCKET);
    t.equal(
      sm.transitionSubPhase(JOINING_SUB_PHASE.CONTACTING_SEED),
      false,
      'should reject backward transition to CONTACTING_SEED',
    );
  });

test('Lifecycle state machine - join sub-phases rejected under wrong ' +
  'parent state', async (t) => {
  initializeTestEnvironment();

  // STARTING state should not accept JOINING sub-phases
  const sm = new NodeLifecycleStateMachine({
    nodeId: TEST_NODE_ID,
    initialState: NodeState.STARTING,
  });

  t.equal(
    sm.transitionSubPhase(JOINING_SUB_PHASE.CONTACTING_SEED),
    false,
    'JOINING sub-phases should be rejected under STARTING state',
  );

  // READY state should not accept any sub-phases
  const readySm = new NodeLifecycleStateMachine({
    nodeId: TEST_NODE_ID,
    initialState: NodeState.READY,
  });

  t.equal(
    readySm.transitionSubPhase(JOINING_SUB_PHASE.CONTACTING_SEED),
    false,
    'JOINING sub-phases should be rejected under READY state',
  );
});
