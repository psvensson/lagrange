/**
 * CL-006 targeted repro + guard: a RETRYABLE failure of a checkpointed join
 * step must not regress durable join progress — handleJoiningFailure must not
 * run the destructive cleanup (entry withdrawal, message-group teardown,
 * router stop, service cleanup) when the resume loop is about to re-enter.
 * Terminal failures (non-retryable, resume budget exhausted) must still run
 * the full destructive cleanup exactly as before.
 *
 * See .kiro/specs/membership-lifecycle-placement-hard-cutover/closure-ledger.md
 * record CL-006 for the production witness (stat-gate-20260610T155735Z).
 */

import {EventEmitter} from 'events';
import {test} from '../../src/test-helpers/tap.js';
import {
  NodeJoiningService,
} from '../../src/bootstrap/node-joining-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {BOOTSTRAP_EVENT} from '../../src/bootstrap/bootstrap-constants.js';
import {NodeState} from '../../src/node/node-lifecycle-state-machine.js';
import {CDC_EVENT} from '../../src/cdc/cdc-constants.js';

const TEST_NODE_ID = '550e8400-e29b-41d4-a716-446655440200';
const TEST_NODE_ADDRESS = 'ws://localhost:9090';
const TEST_SEED_ADDRESS = 'http://localhost:8080';
// Matches RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS — the exact error class the
// production witness failed with on the MEMBERSHIP segment.
const RETRYABLE_REGISTRATION_ERROR =
  'Distributed operation failed due to participant failures';
const NON_RETRYABLE_ERROR = 'join plan validation rejected the node identity';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
  NodeService.resetInstance();
}

/**
 * Build a NodeJoiningService whose join() loop is drivable without any
 * network: the session store, lifecycle controller, and join coordinator are
 * stubbed; destructive cleanup entry points are spied on the real
 * JoinCleanupHandler instance.
 */
function buildResumableJoinHarness(options = {}) {
  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_ADDRESS,
    sleep: async () => {},
    config: {
      autoResumeRetryableFailures: true,
      retryableFailureResumeMaxAttempts: options.maxAttempts ?? 3,
      retryableFailureResumeBaseDelayMs: 1,
      retryableFailureResumeMaxDelayMs: 1,
      ...options.config,
    },
  });

  service.joinSessionStore = {
    resolveSessionId: async () => null,
  };
  service.membershipLifecycleController = {
    submitJoinIntent: async () => ({intentType: 'join_admission'}),
  };

  const spies = {
    cleanupFailedJoinCalls: 0,
    genericCleanupCalls: 0,
    coordinatorRuns: 0,
    failedEvents: 0,
  };
  const cleanupHandler = service.joinCleanupHandler;
  const realCleanupFailedJoin =
    cleanupHandler.cleanupFailedJoin.bind(cleanupHandler);
  cleanupHandler.cleanupFailedJoin = async (...args) => {
    spies.cleanupFailedJoinCalls += 1;
    return realCleanupFailedJoin(...args);
  };
  cleanupHandler.cleanup = async () => {
    spies.genericCleanupCalls += 1;
  };
  service.on(BOOTSTRAP_EVENT.FAILED, () => {
    spies.failedEvents += 1;
  });

  const failures = options.failures || [];
  service.joinCoordinator = {
    run: async () => {
      spies.coordinatorRuns += 1;
      const failure = failures[spies.coordinatorRuns - 1];
      if (failure) {
        throw failure;
      }
      return {checkpoint: 'FINALIZED'};
    },
  };

  return {service, spies};
}

function buildRetryableError() {
  return new Error(RETRYABLE_REGISTRATION_ERROR);
}

test('CL-006: retryable join-step failure preserves join state for the ' +
  'resume re-entry (no destructive cleanup, no FAILED event)', async (t) => {
  initializeTestEnvironment();

  const {service, spies} = buildResumableJoinHarness({
    failures: [buildRetryableError()],
  });

  const result = await service.join();

  t.equal(result.success, true,
    'join should succeed on the resume attempt');
  t.equal(spies.coordinatorRuns, 2,
    'join should re-enter the checkpointed coordinator exactly once');
  t.equal(spies.cleanupFailedJoinCalls, 0,
    'retryable failure must NOT run the destructive reverse-phase cleanup ' +
    '(entry withdrawal, message-group teardown, router stop)');
  t.equal(spies.genericCleanupCalls, 0,
    'retryable failure must NOT tear down partially initialized join ' +
    'infrastructure the checkpoint skips depend on');
  t.equal(spies.failedEvents, 0,
    'a resumed attempt is not a final failure and must not emit FAILED');
});

test('CL-006: non-retryable join failure still runs the full destructive ' +
  'cleanup exactly once', async (t) => {
  initializeTestEnvironment();

  const {service, spies} = buildResumableJoinHarness({
    failures: [new Error(NON_RETRYABLE_ERROR)],
  });

  const result = await service.join();

  t.equal(result.success, false,
    'join should fail terminally on a non-retryable error');
  t.equal(spies.coordinatorRuns, 1,
    'a non-retryable failure must not be resumed');
  t.equal(spies.cleanupFailedJoinCalls, 1,
    'terminal failure must run the destructive cleanup exactly once');
  t.equal(spies.genericCleanupCalls, 1,
    'terminal failure must clean up partially initialized services');
  t.equal(spies.failedEvents, 1,
    'terminal failure must emit FAILED for diagnostics consumers');
});

test('CL-006: a resumed pass that skips the infrastructure segment catches ' +
  'the lifecycle machine up to JOINING before the membership segment', async (t) => {
  initializeTestEnvironment();

  const {service} = buildResumableJoinHarness({});

  // A preserved resume re-enters at CONNECTING (fresh machine) and skips
  // runJoinInfrastructurePhases — the owner of CONNECTING→DISCOVERING→JOINING.
  service.lifecycleStateMachine.transition(NodeState.CONNECTING);
  service.advanceLifecycleAfterResumedInfrastructure();
  t.equal(service.lifecycleStateMachine.getState(), NodeState.JOINING,
    'catch-up must advance CONNECTING to JOINING so JOINING→READY stays valid');

  service.advanceLifecycleAfterResumedInfrastructure();
  t.equal(service.lifecycleStateMachine.getState(), NodeState.JOINING,
    'catch-up must be a no-op once the machine is at or past JOINING');
});

test('CL-006: re-running the CDC subscription on a preserved resume does ' +
  'not accumulate duplicate event handlers', async (t) => {
  initializeTestEnvironment();

  const {service} = buildResumableJoinHarness({});
  service.cdcIntegrationService = new EventEmitter();

  await service.subscribeToCDCEvents();
  await service.subscribeToCDCEvents();

  for (const eventType of [
    CDC_EVENT.INSERT,
    CDC_EVENT.UPDATE,
    CDC_EVENT.DELETE,
    CDC_EVENT.UPSERT,
  ]) {
    t.equal(service.cdcIntegrationService.listenerCount(eventType), 1,
      `resumed subscription must keep exactly one ${eventType} handler`);
  }
});

test('CL-006: resume attempt-budget exhaustion runs the full destructive ' +
  'cleanup on the final failure', async (t) => {
  initializeTestEnvironment();

  const {service, spies} = buildResumableJoinHarness({
    maxAttempts: 2,
    failures: [buildRetryableError(), buildRetryableError()],
  });

  const result = await service.join();

  t.equal(result.success, false,
    'join should fail once the resume attempt budget is exhausted');
  t.equal(spies.coordinatorRuns, 2,
    'join should consume the configured resume attempt budget');
  t.equal(spies.cleanupFailedJoinCalls, 1,
    'only the budget-exhausting failure runs the destructive cleanup — ' +
    'never the resumed intermediate failures');
  t.equal(spies.genericCleanupCalls, 1,
    'budget exhaustion must clean up partially initialized services once');
  t.equal(spies.failedEvents, 1,
    'budget exhaustion must emit FAILED exactly once');
});
