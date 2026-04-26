/**
 * Characterization and contract tests for join checkpoint progression.
 *
 * These tests lock the current checkpoint behavior in NodeJoiningService:
 * how checkpoints advance through phases, and what happens when a checkpoint
 * is resumed from a specific point. They also define the future contract
 * where checkpoint steps reference named segments instead of slice offsets.
 *
 * Requirements: 3.2, 3.4, 9.2
 * Design: D4.2, D10, D11.1
 */

import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {READINESS_CONVERGENCE_PHASE} from
  '../../src/bootstrap/pipeline/join-startup-plan.js';
import {
  JOINING_PHASE,
  BOOTSTRAP_EVENT,
  JOIN_PLAN_SEGMENT,
} from '../../src/bootstrap/bootstrap-constants.js';
import {
  JOIN_CHECKPOINT,
  JOIN_CHECKPOINT_SEQUENCE,
  JoinSessionStore,
} from '../../src/bootstrap/join-session-store.js';
import {JoinCoordinator} from '../../src/bootstrap/join-coordinator.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {NUM} from '../../src/constants/index.js';

// -- Suite-local fixture constants --

const TEST_NODE_ID = 'checkpoint-progression-node';
const TEST_NODE_ADDRESS = 'ws://localhost:19998';
const TEST_SEED_ADDRESS = 'http://localhost:8080';
const SILENT_LOGGER = Object.freeze({
  info() {},
  debug() {},
  warn() {},
  error() {},
});

/**
 * Expected checkpoint progression order as defined in
 * buildJoinCheckpointSteps. This is the canonical sequence that
 * the join coordinator walks through.
 */
const EXPECTED_CHECKPOINT_ORDER = Object.freeze([
  JOIN_CHECKPOINT.SEED_CONTACTED,
  JOIN_CHECKPOINT.JOIN_INFRASTRUCTURE_READY,
  JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
  JOIN_CHECKPOINT.READY_LEASE_ASSIGNED,
  JOIN_CHECKPOINT.FINALIZED,
]);

/**
 * The number of checkpoint steps produced by buildJoinCheckpointSteps.
 */
const EXPECTED_CHECKPOINT_STEP_COUNT = EXPECTED_CHECKPOINT_ORDER.length;

/**
 * Expected phase names in the join startup plan, in order.
 */
const EXPECTED_PLAN_PHASE_NAMES = Object.freeze([
  JOINING_PHASE.CONTACTING_SEED,
  JOINING_PHASE.CONNECTING_WEBSOCKET,
  'joining:message-group-assignment',
  JOINING_PHASE.WAITING_LEADERSHIP,
  JOINING_PHASE.QUERYING_STATE,
  READINESS_CONVERGENCE_PHASE,
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
 * Stub a NodeJoiningService for checkpoint progression tests.
 * Replaces phase owners and infrastructure methods with tracking stubs
 * so we can observe which phases each checkpoint step executes.
 * @param {NodeJoiningService} service
 * @return {Object} Tracking object with executedPhases array.
 */
function stubJoinServiceForCheckpointTests(service) {
  const tracking = {
    executedPhases: [],
    infrastructureInitialized: false,
    readinessConverged: false,
    readySignaled: false,
    joinCompleted: false,
    messageGroupRowsActivated: false,
    backfillStarted: false,
  };

  service.joiningPhaseOwners = {
    contactSeed: async () => {
      tracking.executedPhases.push(JOINING_PHASE.CONTACTING_SEED);
      service.bootstrapResponse = {
        messageGroupAssignment: {
          strategy: 'CREATE_SELF_HOSTED',
          groupId: 'mg-1',
        },
      };
      service.seedNodeId = 'seed-node';
      service.seedNodeWsAddress = 'ws://localhost:8081';
    },
    connectWebSocket: async () => {
      tracking.executedPhases.push(JOINING_PHASE.CONNECTING_WEBSOCKET);
    },
    createSelfHostedMessageGroup: async () => {
      tracking.executedPhases.push(JOINING_PHASE.CREATING_MESSAGE_GROUP);
    },
    joinExistingMessageGroup: async () => {
      tracking.executedPhases.push(JOINING_PHASE.JOINING_MESSAGE_GROUP);
    },
    waitForLeadership: async () => {
      tracking.executedPhases.push(JOINING_PHASE.WAITING_LEADERSHIP);
    },
    querySystemState: async () => {
      tracking.executedPhases.push(JOINING_PHASE.QUERYING_STATE);
    },
  };

  service.initializeJoinInfrastructure = async () => {
    tracking.infrastructureInitialized = true;
  };
  service.hasJoinInfrastructureReady = () => {
    return tracking.infrastructureInitialized;
  };
  service.joinReadinessEvaluator
    .waitForCanonicalJoinReadinessConvergence = async () => {
      tracking.executedPhases.push(READINESS_CONVERGENCE_PHASE);
      tracking.readinessConverged = true;
    };
  service.signalReadyForReplicas = async () => {
    tracking.readySignaled = true;
  };
  service.activateMessageGroupServiceRows = async () => {
    tracking.messageGroupRowsActivated = true;
  };
  service.startJoinOpportunisticBackfill = () => {
    tracking.backfillStarted = true;
  };
  service.completeSuccessfulJoin = () => {
    tracking.joinCompleted = true;
    service.lifecycleStateMachine.transition('ready');
    service.phase = JOINING_PHASE.COMPLETE;
    service.hasActiveControlPlaneBackgroundWriters = () => true;
    service.emit(BOOTSTRAP_EVENT.COMPLETE, {
      nodeId: service.nodeId,
      duration: service.now() - service.startTime,
      messageGroupServices: service.messageGroupServices,
      transport: service.transport,
      messageRouter: service.messageRouter,
      lifecycleState: service.lifecycleStateMachine.getState(),
    });
  };
  service.runJoinInfrastructurePhases = async (runner, joinPlan) => {
    const infraPhases =
      joinPlan.segments[JOIN_PLAN_SEGMENT.INFRASTRUCTURE];
    await runner.run({phases: infraPhases.slice(0, 1)});
    service.lifecycleStateMachine.transition('discovering');
    await runner.run({phases: infraPhases.slice(1)});
    tracking.infrastructureInitialized = true;
    service.lifecycleStateMachine.transition('joining');
  };
  service.logger = SILENT_LOGGER;

  return tracking;
}

// ---------------------------------------------------------------------------
// Characterization: checkpoint progression order (Req 3.4, D11.1)
// Uses buildJoinCheckpointSteps via the join() method owner path
// ---------------------------------------------------------------------------

test('Join checkpoint progression - steps execute in canonical order',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      seedNodeAddress: TEST_SEED_ADDRESS,
    });

    const tracking = stubJoinServiceForCheckpointTests(service);

    const result = await service.join();
    t.equal(result.success, true, 'join should succeed');

    // Verify all five checkpoint phases executed
    t.equal(
      tracking.executedPhases.length,
      EXPECTED_PLAN_PHASE_NAMES.length,
      'all join plan phases should execute during full checkpoint progression',
    );

    // Verify the phase execution order matches the plan
    t.same(
      tracking.executedPhases,
      [
        JOINING_PHASE.CONTACTING_SEED,
        JOINING_PHASE.CONNECTING_WEBSOCKET,
        JOINING_PHASE.CREATING_MESSAGE_GROUP,
        JOINING_PHASE.WAITING_LEADERSHIP,
        JOINING_PHASE.QUERYING_STATE,
        READINESS_CONVERGENCE_PHASE,
      ],
      'phases should execute in the canonical join plan order',
    );
  });

test('Join checkpoint progression - session advances through all checkpoints',
  async (t) => {
    initializeTestEnvironment();

    const store = new JoinSessionStore({now: () => Date.now()});
    const coordinator = new JoinCoordinator({joinSessionStore: store});

    const service = new NodeJoiningService({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      seedNodeAddress: TEST_SEED_ADDRESS,
    });
    service.joinCoordinator = coordinator;
    service.joinSessionStore = store;

    stubJoinServiceForCheckpointTests(service);

    const result = await service.join();
    t.equal(result.success, true, 'join should succeed');

    // Verify the session reached FINALIZED checkpoint
    const session = await store.loadSession({
      nodeId: TEST_NODE_ID,
      sessionId: service.joinSessionId,
    });
    t.equal(
      session.checkpoint,
      JOIN_CHECKPOINT.FINALIZED,
      'session should reach FINALIZED checkpoint after successful join',
    );
  });


// ---------------------------------------------------------------------------
// Characterization: resume semantics (Req 3.4, D11.1)
// Proves that resuming from a checkpoint skips already-completed phases
// ---------------------------------------------------------------------------

test('Join checkpoint progression - resume skips completed checkpoints',
  async (t) => {
    initializeTestEnvironment();

    const store = new JoinSessionStore({now: () => Date.now()});
    const coordinator = new JoinCoordinator({joinSessionStore: store});

    const service = new NodeJoiningService({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      seedNodeAddress: TEST_SEED_ADDRESS,
    });
    service.joinCoordinator = coordinator;
    service.joinSessionStore = store;

    const tracking = stubJoinServiceForCheckpointTests(service);

    // Simulate a failure during the MEMBERSHIP_WRITTEN step
    let membershipFail = true;
    const originalQuerySystemState =
      service.joiningPhaseOwners.querySystemState;
    service.joiningPhaseOwners.querySystemState = async () => {
      if (membershipFail) {
        const error = new Error('membership write failed');
        error.retryable = true;
        throw error;
      }
      return originalQuerySystemState();
    };
    service.handleJoiningFailure = async (error) => ({
      success: false,
      error: error.message,
    });

    const firstResult = await service.join();
    t.equal(firstResult.success, false, 'first join attempt should fail');

    // Record which phases ran in the first attempt
    const firstAttemptPhases = [...tracking.executedPhases];
    t.ok(
      firstAttemptPhases.includes(JOINING_PHASE.CONTACTING_SEED),
      'first attempt should have executed contacting_seed',
    );

    // Clear tracking and fix the failure
    tracking.executedPhases.length = NUM.ZERO;
    membershipFail = false;
    service.joiningPhaseOwners.querySystemState = originalQuerySystemState;

    // Resume — seed contact and infrastructure should be skipped
    const secondResult = await service.join();
    t.equal(secondResult.success, true, 'resumed join should succeed');

    // The seed contact phase should NOT re-execute because its checkpoint
    // was already satisfied
    t.notOk(
      tracking.executedPhases.includes(JOINING_PHASE.CONTACTING_SEED),
      'resume should skip contacting_seed (checkpoint already satisfied)',
    );

    // The querying_state phase should execute on resume
    t.ok(
      tracking.executedPhases.includes(JOINING_PHASE.QUERYING_STATE),
      'resume should execute querying_state phase',
    );
  });

test('Join checkpoint progression - shouldRerun forces re-execution ' +
  'when local state needs refresh at current checkpoint',
async (t) => {
  initializeTestEnvironment();

  // Use a shared session store
  const store = new JoinSessionStore({now: () => Date.now()});
  const coordinator = new JoinCoordinator({joinSessionStore: store});

  let localInfrastructureReady = false;
  let infrastructureRunCount = NUM.ZERO;

  // First run: advance to JOIN_INFRASTRUCTURE_READY only
  await coordinator.run({
    nodeId: TEST_NODE_ID,
    sessionId: 'session-rerun',
    steps: [
      {
        checkpoint: JOIN_CHECKPOINT.SEED_CONTACTED,
        phase: 'seed',
        run: async () => {},
      },
      {
        checkpoint: JOIN_CHECKPOINT.JOIN_INFRASTRUCTURE_READY,
        phase: 'infrastructure',
        run: async () => {
          infrastructureRunCount += 1;
          localInfrastructureReady = true;
        },
      },
    ],
  });
  t.equal(infrastructureRunCount, 1,
    'first run should execute infrastructure once');

  // Clear local state to trigger shouldRerun
  localInfrastructureReady = false;

  // Second run: session is at JOIN_INFRASTRUCTURE_READY, shouldRerun
  // returns true because local state was lost. The coordinator re-runs
  // the step and re-advances to the same checkpoint (no-op advance).
  await coordinator.run({
    nodeId: TEST_NODE_ID,
    sessionId: 'session-rerun',
    steps: [
      {
        checkpoint: JOIN_CHECKPOINT.SEED_CONTACTED,
        phase: 'seed',
        run: async () => {},
      },
      {
        checkpoint: JOIN_CHECKPOINT.JOIN_INFRASTRUCTURE_READY,
        phase: 'infrastructure',
        shouldRerun: () => !localInfrastructureReady,
        run: async () => {
          infrastructureRunCount += 1;
          localInfrastructureReady = true;
        },
      },
    ],
  });

  t.equal(infrastructureRunCount, 2,
    'shouldRerun guard should force re-execution of infrastructure ' +
    'when local state is missing');
});

// ---------------------------------------------------------------------------
// Characterization: checkpoint-to-phase mapping (Req 3.4, D4.2)
// Proves which join plan phases each checkpoint step executes via slice
// ---------------------------------------------------------------------------

test('Join checkpoint progression - SEED_CONTACTED step runs plan phase 0',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      seedNodeAddress: TEST_SEED_ADDRESS,
    });

    const tracking = stubJoinServiceForCheckpointTests(service);

    // Build the checkpoint steps directly to inspect phase mapping
    const {createJoinStartupPlan} = await import(
      '../../src/bootstrap/pipeline/join-startup-plan.js'
    );
    const {StartupPipelineRunner} = await import(
      '../../src/bootstrap/pipeline/startup-pipeline-runner.js'
    );

    const runner = new StartupPipelineRunner({
      logger: SILENT_LOGGER,
      eventSink: service,
    });
    const joinPlan = createJoinStartupPlan(service);
    const steps = service.buildJoinCheckpointSteps(runner, joinPlan);

    // Execute only the SEED_CONTACTED step
    await steps[NUM.ZERO].run();

    t.same(
      tracking.executedPhases,
      [JOINING_PHASE.CONTACTING_SEED],
      'SEED_CONTACTED checkpoint should execute only the contacting_seed phase',
    );
  });

test('Join checkpoint progression - MEMBERSHIP_WRITTEN step runs plan phase 4',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      seedNodeAddress: TEST_SEED_ADDRESS,
    });

    const tracking = stubJoinServiceForCheckpointTests(service);

    const {createJoinStartupPlan} = await import(
      '../../src/bootstrap/pipeline/join-startup-plan.js'
    );
    const {StartupPipelineRunner} = await import(
      '../../src/bootstrap/pipeline/startup-pipeline-runner.js'
    );

    const runner = new StartupPipelineRunner({
      logger: SILENT_LOGGER,
      eventSink: service,
    });
    const joinPlan = createJoinStartupPlan(service);
    const steps = service.buildJoinCheckpointSteps(runner, joinPlan);

    // The MEMBERSHIP_WRITTEN step is at index 2
    const membershipStepIndex = 2;
    await steps[membershipStepIndex].run();

    t.ok(
      tracking.executedPhases.includes(JOINING_PHASE.QUERYING_STATE),
      'MEMBERSHIP_WRITTEN checkpoint should execute the querying_state phase',
    );
    t.ok(
      tracking.messageGroupRowsActivated,
      'MEMBERSHIP_WRITTEN checkpoint should activate message group rows',
    );
    t.ok(
      tracking.backfillStarted,
      'MEMBERSHIP_WRITTEN checkpoint should start opportunistic backfill',
    );
  });


// ---------------------------------------------------------------------------
// Characterization: checkpoint sequence matches session store sequence
// ---------------------------------------------------------------------------

test('Join checkpoint progression - checkpoint names match ' +
  'JOIN_CHECKPOINT_SEQUENCE subset',
async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_ADDRESS,
  });

  stubJoinServiceForCheckpointTests(service);

  const {createJoinStartupPlan} = await import(
    '../../src/bootstrap/pipeline/join-startup-plan.js'
  );
  const {StartupPipelineRunner} = await import(
    '../../src/bootstrap/pipeline/startup-pipeline-runner.js'
  );

  const runner = new StartupPipelineRunner({
    logger: SILENT_LOGGER,
    eventSink: service,
  });
  const joinPlan = createJoinStartupPlan(service);
  const steps = service.buildJoinCheckpointSteps(runner, joinPlan);

  const stepCheckpoints = steps.map((s) => s.checkpoint);

  t.equal(
    stepCheckpoints.length,
    EXPECTED_CHECKPOINT_STEP_COUNT,
    `should produce exactly ${EXPECTED_CHECKPOINT_STEP_COUNT} checkpoint steps`,
  );
  t.same(
    stepCheckpoints,
    [...EXPECTED_CHECKPOINT_ORDER],
    'checkpoint step order should match expected progression',
  );

  // Every checkpoint used by buildJoinCheckpointSteps must exist in
  // the canonical JOIN_CHECKPOINT_SEQUENCE
  for (const checkpoint of stepCheckpoints) {
    t.ok(
      JOIN_CHECKPOINT_SEQUENCE.includes(checkpoint),
      `checkpoint "${checkpoint}" should exist in JOIN_CHECKPOINT_SEQUENCE`,
    );
  }

  // Checkpoints must be in monotonically increasing order within the sequence
  for (let i = 1; i < stepCheckpoints.length; i++) {
    const prevIndex = JOIN_CHECKPOINT_SEQUENCE.indexOf(stepCheckpoints[i - 1]);
    const currIndex = JOIN_CHECKPOINT_SEQUENCE.indexOf(stepCheckpoints[i]);
    t.ok(
      currIndex > prevIndex,
      `checkpoint "${stepCheckpoints[i]}" should follow ` +
      `"${stepCheckpoints[i - 1]}" in canonical sequence`,
    );
  }
});

// ---------------------------------------------------------------------------
// Characterization: FINALIZED checkpoint shouldRerun guard
// ---------------------------------------------------------------------------

test('Join checkpoint progression - FINALIZED shouldRerun detects ' +
  'incomplete join state',
async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_ADDRESS,
  });

  stubJoinServiceForCheckpointTests(service);

  const {createJoinStartupPlan} = await import(
    '../../src/bootstrap/pipeline/join-startup-plan.js'
  );
  const {StartupPipelineRunner} = await import(
    '../../src/bootstrap/pipeline/startup-pipeline-runner.js'
  );

  const runner = new StartupPipelineRunner({
    logger: SILENT_LOGGER,
    eventSink: service,
  });
  const joinPlan = createJoinStartupPlan(service);
  const steps = service.buildJoinCheckpointSteps(runner, joinPlan);

  // The FINALIZED step is the last one
  const finalizedStep = steps[steps.length - 1];
  t.equal(
    finalizedStep.checkpoint,
    JOIN_CHECKPOINT.FINALIZED,
    'last step should be FINALIZED checkpoint',
  );

  // Before join completes, shouldRerun should return true
  t.ok(
    typeof finalizedStep.shouldRerun === 'function',
    'FINALIZED step should have a shouldRerun guard',
  );
  t.equal(
    finalizedStep.shouldRerun(),
    true,
    'FINALIZED shouldRerun should return true when join is not complete',
  );

  // After completing the join, shouldRerun should return false
  service.phase = JOINING_PHASE.COMPLETE;
  // Walk through valid state transitions to reach ready
  service.lifecycleStateMachine.transition('connecting');
  service.lifecycleStateMachine.transition('discovering');
  service.lifecycleStateMachine.transition('joining');
  service.lifecycleStateMachine.transition('ready');
  service.hasActiveControlPlaneBackgroundWriters = () => true;
  t.equal(
    finalizedStep.shouldRerun(),
    false,
    'FINALIZED shouldRerun should return false when join is fully complete',
  );
});

// ---------------------------------------------------------------------------
// Contract: named-segment-based checkpoint progression (Req 3.2, D4.2)
// These tests define the contract that Task 17 must satisfy.
// They will fail until buildJoinCheckpointSteps consumes named segments.
// ---------------------------------------------------------------------------

test('Join checkpoint progression - checkpoint steps should reference ' +
  'named segments instead of slice offsets (Req 3.2)',
async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_ADDRESS,
  });

  stubJoinServiceForCheckpointTests(service);

  const {createJoinStartupPlan} = await import(
    '../../src/bootstrap/pipeline/join-startup-plan.js'
  );
  const {StartupPipelineRunner} = await import(
    '../../src/bootstrap/pipeline/startup-pipeline-runner.js'
  );

  const runner = new StartupPipelineRunner({
    logger: SILENT_LOGGER,
    eventSink: service,
  });
  const joinPlan = createJoinStartupPlan(service);

  // The plan must expose named segments for checkpoint steps to consume
  t.ok(
    joinPlan.segments !== null &&
    joinPlan.segments !== undefined &&
    typeof joinPlan.segments === 'object',
    'join plan should expose segments object for checkpoint consumption ' +
    '(Req 3.2, D4.2)',
  );

  // Guard: if segments don't exist yet, remaining assertions are moot
  if (!joinPlan.segments || typeof joinPlan.segments !== 'object') {
    t.fail(
      'plan.segments is missing — cannot verify segment-based checkpoints',
    );
    return;
  }

  const steps = service.buildJoinCheckpointSteps(runner, joinPlan);

  // Each checkpoint step should carry a segment reference
  for (const step of steps) {
    t.ok(
      typeof step.segment === 'string' && step.segment.length > NUM.ZERO,
      `checkpoint "${step.checkpoint}" should reference a named segment ` +
      '(Req 3.2, D4.2)',
    );
  }
});

test('Join checkpoint progression - SEED_CONTACTED step should reference ' +
  'seedContact segment (Req 3.2, D4.2)',
async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_ADDRESS,
  });

  stubJoinServiceForCheckpointTests(service);

  const {createJoinStartupPlan} = await import(
    '../../src/bootstrap/pipeline/join-startup-plan.js'
  );
  const {StartupPipelineRunner} = await import(
    '../../src/bootstrap/pipeline/startup-pipeline-runner.js'
  );

  const runner = new StartupPipelineRunner({
    logger: SILENT_LOGGER,
    eventSink: service,
  });
  const joinPlan = createJoinStartupPlan(service);

  if (!joinPlan.segments || typeof joinPlan.segments !== 'object') {
    t.fail(
      'plan.segments is missing — cannot verify segment-based checkpoints',
    );
    return;
  }

  const steps = service.buildJoinCheckpointSteps(runner, joinPlan);
  const seedStep = steps.find(
    (s) => s.checkpoint === JOIN_CHECKPOINT.SEED_CONTACTED,
  );

  t.ok(seedStep, 'should have a SEED_CONTACTED checkpoint step');
  t.equal(
    seedStep.segment,
    'seedContact',
    'SEED_CONTACTED step should reference the seedContact segment',
  );
});

test('Join checkpoint progression - INFRASTRUCTURE_READY step should ' +
  'reference infrastructure segment (Req 3.2, D4.2)',
async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_ADDRESS,
  });

  stubJoinServiceForCheckpointTests(service);

  const {createJoinStartupPlan} = await import(
    '../../src/bootstrap/pipeline/join-startup-plan.js'
  );
  const {StartupPipelineRunner} = await import(
    '../../src/bootstrap/pipeline/startup-pipeline-runner.js'
  );

  const runner = new StartupPipelineRunner({
    logger: SILENT_LOGGER,
    eventSink: service,
  });
  const joinPlan = createJoinStartupPlan(service);

  if (!joinPlan.segments || typeof joinPlan.segments !== 'object') {
    t.fail(
      'plan.segments is missing — cannot verify segment-based checkpoints',
    );
    return;
  }

  const steps = service.buildJoinCheckpointSteps(runner, joinPlan);
  const infraStep = steps.find(
    (s) => s.checkpoint === JOIN_CHECKPOINT.JOIN_INFRASTRUCTURE_READY,
  );

  t.ok(infraStep, 'should have a JOIN_INFRASTRUCTURE_READY checkpoint step');
  t.equal(
    infraStep.segment,
    'infrastructure',
    'JOIN_INFRASTRUCTURE_READY step should reference the ' +
    'infrastructure segment',
  );
});

test('Join checkpoint progression - MEMBERSHIP_WRITTEN step should ' +
  'reference membership segment (Req 3.2, D4.2)',
async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_ADDRESS,
  });

  stubJoinServiceForCheckpointTests(service);

  const {createJoinStartupPlan} = await import(
    '../../src/bootstrap/pipeline/join-startup-plan.js'
  );
  const {StartupPipelineRunner} = await import(
    '../../src/bootstrap/pipeline/startup-pipeline-runner.js'
  );

  const runner = new StartupPipelineRunner({
    logger: SILENT_LOGGER,
    eventSink: service,
  });
  const joinPlan = createJoinStartupPlan(service);

  if (!joinPlan.segments || typeof joinPlan.segments !== 'object') {
    t.fail(
      'plan.segments is missing — cannot verify segment-based checkpoints',
    );
    return;
  }

  const steps = service.buildJoinCheckpointSteps(runner, joinPlan);
  const membershipStep = steps.find(
    (s) => s.checkpoint === JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
  );

  t.ok(membershipStep, 'should have a MEMBERSHIP_WRITTEN checkpoint step');
  t.equal(
    membershipStep.segment,
    'membership',
    'MEMBERSHIP_WRITTEN step should reference the membership segment',
  );
});

test('Join checkpoint progression - READY_LEASE_ASSIGNED step should ' +
  'reference readiness segment (Req 3.2, D4.2)',
async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_ADDRESS,
  });

  stubJoinServiceForCheckpointTests(service);

  const {createJoinStartupPlan} = await import(
    '../../src/bootstrap/pipeline/join-startup-plan.js'
  );
  const {StartupPipelineRunner} = await import(
    '../../src/bootstrap/pipeline/startup-pipeline-runner.js'
  );

  const runner = new StartupPipelineRunner({
    logger: SILENT_LOGGER,
    eventSink: service,
  });
  const joinPlan = createJoinStartupPlan(service);

  if (!joinPlan.segments || typeof joinPlan.segments !== 'object') {
    t.fail(
      'plan.segments is missing — cannot verify segment-based checkpoints',
    );
    return;
  }

  const steps = service.buildJoinCheckpointSteps(runner, joinPlan);
  const readinessStep = steps.find(
    (s) => s.checkpoint === JOIN_CHECKPOINT.READY_LEASE_ASSIGNED,
  );

  t.ok(readinessStep, 'should have a READY_LEASE_ASSIGNED checkpoint step');
  t.equal(
    readinessStep.segment,
    'readiness',
    'READY_LEASE_ASSIGNED step should reference the readiness segment',
  );
});
