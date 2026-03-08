/**
 * Property Test: Timeout-Triggered Failures
 * **Property 10: Timeout-Triggered Failures**
 * **Validates: Requirements 6.2, 6.3, 6.4, 6.5**
 *
 * *For any* replica that remains in a transitional state longer than the
 * configured timeout for that state, the Replica_State_Machine SHALL
 * automatically transition it to `failed` state with a timeout error message.
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  ReplicaStateMachine,
  ReplicaState,
  DEFAULT_TIMEOUTS,
} from '../../src/node/replica-state-machine.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

function createMockCDCService() {
  return {
    updateSystemTableRow: async () => ({success: true}),
    upsertSystemTableRow: async () => ({success: true}),
  };
}

// Transitional states that have timeouts
const TRANSITIONAL_STATES = [
  ReplicaState.PENDING,
  ReplicaState.CREATING,
  ReplicaState.SYNCING,
  ReplicaState.REMOVING,
];

test('Property 10: Timeout-Triggered Failures', async (t) => {
  t.beforeEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});
  });

  t.afterEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  /**
   * Property: For any replica in a transitional state that exceeds the
   * configured timeout, checkTimeoutsNow() should transition it to failed.
   */
  t.test('replicas exceeding timeout transition to failed', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom(...TRANSITIONAL_STATES),
        fc.uuid(),
        fc.uuid(),
        (targetState, replicaId, partitionId) => {
          // Use very short timeouts for testing
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
            pendingTimeoutMs: 1,
            creatingTimeoutMs: 1,
            syncingTimeoutMs: 1,
            removingTimeoutMs: 1,
          });

          // Get to the target transitional state
          const path = getPathToState(targetState);
          for (const state of path) {
            stateMachine.transition(replicaId, state, {
              partitionId,
              reason: 'test',
            });
          }

          // Verify replica is in target state
          const beforeState = stateMachine.getState(replicaId);
          if (beforeState.state !== targetState) {
            stateMachine.clear();
            return false;
          }

          // Manually set entry time to simulate timeout
          beforeState.timeoutStartedAt = Date.now() - 100;

          // Check timeouts
          stateMachine.checkTimeoutsNow();

          // Verify replica transitioned to failed
          const afterState = stateMachine.getState(replicaId);

          stateMachine.clear();

          return afterState.state === ReplicaState.FAILED;
        },
      ),
      {numRuns: 10},
    );

    t.pass('replicas exceeding timeout transition to failed');
  });

  /**
   * Property: Timeout error message includes the timeout value.
   */
  t.test('timeout error message includes timeout value', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom(...TRANSITIONAL_STATES),
        fc.uuid(),
        fc.uuid(),
        (targetState, replicaId, partitionId) => {
          const timeoutMs = 50;
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
            pendingTimeoutMs: timeoutMs,
            creatingTimeoutMs: timeoutMs,
            syncingTimeoutMs: timeoutMs,
            removingTimeoutMs: timeoutMs,
          });

          // Get to the target transitional state
          const path = getPathToState(targetState);
          for (const state of path) {
            stateMachine.transition(replicaId, state, {
              partitionId,
              reason: 'test',
            });
          }

          // Manually set entry time to simulate timeout
          const replicaState = stateMachine.getState(replicaId);
          replicaState.timeoutStartedAt = Date.now() - 100;

          // Check timeouts
          stateMachine.checkTimeoutsNow();

          // Verify error message contains timeout value
          const afterState = stateMachine.getState(replicaId);

          stateMachine.clear();

          return (
            afterState.state === ReplicaState.FAILED &&
            afterState.errorMessage !== null &&
            afterState.errorMessage.includes(String(timeoutMs))
          );
        },
      ),
      {numRuns: 10},
    );

    t.pass('timeout error message includes timeout value');
  });

  /**
   * Property: Timeout reason includes the state name.
   */
  t.test('timeout reason includes state name', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom(...TRANSITIONAL_STATES),
        fc.uuid(),
        fc.uuid(),
        (targetState, replicaId, partitionId) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
            pendingTimeoutMs: 1,
            creatingTimeoutMs: 1,
            syncingTimeoutMs: 1,
            removingTimeoutMs: 1,
          });

          // Get to the target transitional state
          const path = getPathToState(targetState);
          for (const state of path) {
            stateMachine.transition(replicaId, state, {
              partitionId,
              reason: 'test',
            });
          }

          // Manually set entry time to simulate timeout
          const replicaState = stateMachine.getState(replicaId);
          replicaState.timeoutStartedAt = Date.now() - 100;

          // Check timeouts
          stateMachine.checkTimeoutsNow();

          // Verify trigger reason contains state name
          const afterState = stateMachine.getState(replicaId);

          stateMachine.clear();

          return (
            afterState.state === ReplicaState.FAILED &&
            afterState.triggerReason !== null &&
            afterState.triggerReason.includes(targetState)
          );
        },
      ),
      {numRuns: 10},
    );

    t.pass('timeout reason includes state name');
  });

  /**
   * Property: Replicas not exceeding timeout remain in their state.
   */
  t.test('replicas not exceeding timeout remain unchanged', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom(...TRANSITIONAL_STATES),
        fc.uuid(),
        fc.uuid(),
        (targetState, replicaId, partitionId) => {
          // Use very long timeouts
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
            pendingTimeoutMs: 999999,
            creatingTimeoutMs: 999999,
            syncingTimeoutMs: 999999,
            removingTimeoutMs: 999999,
          });

          // Get to the target transitional state
          const path = getPathToState(targetState);
          for (const state of path) {
            stateMachine.transition(replicaId, state, {
              partitionId,
              reason: 'test',
            });
          }

          // Check timeouts (should not trigger)
          const timedOutCount = stateMachine.checkTimeoutsNow();

          // Verify replica remains in original state
          const afterState = stateMachine.getState(replicaId);

          stateMachine.clear();

          return (
            timedOutCount === 0 &&
            afterState.state === targetState
          );
        },
      ),
      {numRuns: 10},
    );

    t.pass('replicas not exceeding timeout remain unchanged');
  });

  /**
   * Property: Timeout event is emitted before transition.
   */
  t.test('timeout event emitted on timeout', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom(...TRANSITIONAL_STATES),
        fc.uuid(),
        fc.uuid(),
        (targetState, replicaId, partitionId) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
            pendingTimeoutMs: 1,
            creatingTimeoutMs: 1,
            syncingTimeoutMs: 1,
            removingTimeoutMs: 1,
          });

          let timeoutEventReceived = false;
          let timeoutEventData = null;

          stateMachine.on('timeout', (event) => {
            timeoutEventReceived = true;
            timeoutEventData = event;
          });

          // Get to the target transitional state
          const path = getPathToState(targetState);
          for (const state of path) {
            stateMachine.transition(replicaId, state, {
              partitionId,
              reason: 'test',
            });
          }

          // Manually set entry time to simulate timeout
          const replicaState = stateMachine.getState(replicaId);
          replicaState.timeoutStartedAt = Date.now() - 100;

          // Check timeouts
          stateMachine.checkTimeoutsNow();

          stateMachine.clear();

          return (
            timeoutEventReceived === true &&
            timeoutEventData !== null &&
            timeoutEventData.replicaId === replicaId &&
            timeoutEventData.state === targetState
          );
        },
      ),
      {numRuns: 10},
    );

    t.pass('timeout event emitted on timeout');
  });

  /**
   * Property: Non-transitional states (active, removed, failed) do not timeout.
   */
  t.test('non-transitional states do not timeout', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        (replicaId, partitionId) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
            pendingTimeoutMs: 1,
            creatingTimeoutMs: 1,
            syncingTimeoutMs: 1,
            removingTimeoutMs: 1,
          });

          // Get replica to active state
          const path = getPathToState(ReplicaState.ACTIVE);
          for (const state of path) {
            stateMachine.transition(replicaId, state, {
              partitionId,
              reason: 'test',
            });
          }

          // Manually set entry time to simulate old entry
          const replicaState = stateMachine.getState(replicaId);
          replicaState.timeoutStartedAt = Date.now() - 999999;

          // Check timeouts (should not trigger for active state)
          const timedOutCount = stateMachine.checkTimeoutsNow();

          // Verify replica remains in active state
          const afterState = stateMachine.getState(replicaId);

          stateMachine.clear();

          return (
            timedOutCount === 0 &&
            afterState.state === ReplicaState.ACTIVE
          );
        },
      ),
      {numRuns: 10},
    );

    t.pass('non-transitional states do not timeout');
  });

  /**
   * Property: Default timeouts match requirements.
   */
  t.test('default timeouts match requirements', async (t) => {
    // Requirements specify:
    // - pending: 30s (30000ms)
    // - creating: 60s (60000ms)
    // - syncing: 300s (300000ms)
    // - removing: 60s (60000ms)

    t.equal(DEFAULT_TIMEOUTS[ReplicaState.PENDING], 30000,
      'pending timeout is 30s');
    t.equal(DEFAULT_TIMEOUTS[ReplicaState.CREATING], 60000,
      'creating timeout is 60s');
    t.equal(DEFAULT_TIMEOUTS[ReplicaState.SYNCING], 300000,
      'syncing timeout is 300s');
    t.equal(DEFAULT_TIMEOUTS[ReplicaState.REMOVING], 60000,
      'removing timeout is 60s');
  });

  /**
   * Property: startTimeoutChecker and stopTimeoutChecker work correctly.
   */
  t.test('timeout checker can be started and stopped', async (t) => {
    const stateMachine = new ReplicaStateMachine({
      nodeId: 'test-node',
      cdcIntegrationService: createMockCDCService(),
      timeoutCheckIntervalMs: 10000, // Long interval to avoid actual checks
    });

    // Initially not running
    t.equal(stateMachine.timeoutCheckInterval, null,
      'timeout checker initially null');

    // Start checker
    stateMachine.startTimeoutChecker();
    t.not(stateMachine.timeoutCheckInterval, null,
      'timeout checker started');

    // Starting again should be idempotent
    const firstInterval = stateMachine.timeoutCheckInterval;
    stateMachine.startTimeoutChecker();
    t.equal(stateMachine.timeoutCheckInterval, firstInterval,
      'starting again is idempotent');

    // Stop checker
    stateMachine.stopTimeoutChecker();
    t.equal(stateMachine.timeoutCheckInterval, null,
      'timeout checker stopped');

    // Stopping again should be safe
    stateMachine.stopTimeoutChecker();
    t.equal(stateMachine.timeoutCheckInterval, null,
      'stopping again is safe');

    stateMachine.clear();
  });

  /**
   * Property: clear() stops the timeout checker.
   */
  t.test('clear stops timeout checker', async (t) => {
    const stateMachine = new ReplicaStateMachine({
      nodeId: 'test-node',
      cdcIntegrationService: createMockCDCService(),
      timeoutCheckIntervalMs: 10000,
    });

    stateMachine.startTimeoutChecker();
    t.not(stateMachine.timeoutCheckInterval, null,
      'timeout checker started');

    stateMachine.clear();
    t.equal(stateMachine.timeoutCheckInterval, null,
      'clear stopped timeout checker');
  });

  /**
   * Property: getTimeout returns correct timeout for each state.
   */
  t.test('getTimeout returns correct values', async (t) => {
    const customTimeouts = {
      pendingTimeoutMs: 100,
      creatingTimeoutMs: 200,
      syncingTimeoutMs: 300,
      removingTimeoutMs: 400,
    };

    const stateMachine = new ReplicaStateMachine({
      nodeId: 'test-node',
      cdcIntegrationService: createMockCDCService(),
      ...customTimeouts,
    });

    t.equal(stateMachine.getTimeout(ReplicaState.PENDING), 100,
      'pending timeout correct');
    t.equal(stateMachine.getTimeout(ReplicaState.CREATING), 200,
      'creating timeout correct');
    t.equal(stateMachine.getTimeout(ReplicaState.SYNCING), 300,
      'syncing timeout correct');
    t.equal(stateMachine.getTimeout(ReplicaState.REMOVING), 400,
      'removing timeout correct');
    t.equal(stateMachine.getTimeout(ReplicaState.ACTIVE), null,
      'active has no timeout');
    t.equal(stateMachine.getTimeout(ReplicaState.FAILED), null,
      'failed has no timeout');
    t.equal(stateMachine.getTimeout(ReplicaState.REMOVED), null,
      'removed has no timeout');

    stateMachine.clear();
  });
});

/**
 * Get a valid path of transitions to reach a target state from null.
 * @param {string} targetState - The state to reach.
 * @return {Array<string>} Array of states to transition through.
 */
function getPathToState(targetState) {
  const paths = {
    [ReplicaState.PENDING]: [ReplicaState.PENDING],
    [ReplicaState.CREATING]: [ReplicaState.PENDING, ReplicaState.CREATING],
    [ReplicaState.SYNCING]: [
      ReplicaState.PENDING,
      ReplicaState.CREATING,
      ReplicaState.SYNCING,
    ],
    [ReplicaState.ACTIVE]: [
      ReplicaState.PENDING,
      ReplicaState.CREATING,
      ReplicaState.SYNCING,
      ReplicaState.ACTIVE,
    ],
    [ReplicaState.REMOVING]: [
      ReplicaState.PENDING,
      ReplicaState.CREATING,
      ReplicaState.SYNCING,
      ReplicaState.ACTIVE,
      ReplicaState.REMOVING,
    ],
    [ReplicaState.REMOVED]: [
      ReplicaState.PENDING,
      ReplicaState.CREATING,
      ReplicaState.SYNCING,
      ReplicaState.ACTIVE,
      ReplicaState.REMOVING,
      ReplicaState.REMOVED,
    ],
    [ReplicaState.FAILED]: [
      ReplicaState.PENDING,
      ReplicaState.FAILED,
    ],
  };

  return paths[targetState] || [];
}
