/**
 * Property Test: Entry Time Tracking
 * **Property 9: Entry Time Tracking**
 * **Validates: Requirements 6.1**
 *
 * *For any* replica entering a transitional state (`pending`, `creating`,
 * `syncing`, `removing`), the Replica_State_Machine SHALL record the entry
 * timestamp and make it available via `getState()`.
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  ReplicaStateMachine,
  ReplicaState,
} from '../../src/node/replica-state-machine.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

function createMockCDCService() {
  return {
    updateSystemTableRow: async () => ({success: true}),
    upsertSystemTableRow: async () => ({success: true}),
  };
}

// Transitional states as defined in requirements
const TRANSITIONAL_STATES = [
  ReplicaState.PENDING,
  ReplicaState.CREATING,
  ReplicaState.SYNCING,
  ReplicaState.REMOVING,
];

test('Property 9: Entry Time Tracking', async (t) => {
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
   * Property: For any replica entering a transitional state,
   * stateEnteredAt should be recorded and available via getState().
   */
  t.test('transitional states record entry time', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...TRANSITIONAL_STATES),
        fc.uuid(),
        fc.uuid(),
        async (targetState, replicaId, partitionId) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
          });

          const beforeTime = Date.now();

          // Get to the target transitional state
          const path = getPathToState(targetState);
          for (const state of path) {
            await stateMachine.transition(replicaId, state, {
              partitionId,
              reason: 'test',
            });
          }

          const afterTime = Date.now();

          // Get the state and verify entry time is recorded
          const replicaState = stateMachine.getState(replicaId);

          stateMachine.clear();

          // Entry time should exist and be within the test window
          return (
            replicaState !== null &&
            replicaState.stateEnteredAt !== undefined &&
            replicaState.stateEnteredAt >= beforeTime &&
            replicaState.stateEnteredAt <= afterTime
          );
        },
      ),
      {numRuns: 10},
    );

    t.pass('transitional states record entry time');
  });

  /**
   * Property: Entry time is updated on each state transition.
   */
  t.test('entry time updates on each transition', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (replicaId, partitionId) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
          });

          // Transition to pending
          await stateMachine.transition(replicaId, ReplicaState.PENDING, {
            partitionId,
            reason: 'test',
          });

          const pendingState = stateMachine.getState(replicaId);
          const pendingEntryTime = pendingState.stateEnteredAt;

          // Transition to creating
          await stateMachine.transition(replicaId, ReplicaState.CREATING, {
            partitionId,
            reason: 'test',
          });

          const creatingState = stateMachine.getState(replicaId);
          const creatingEntryTime = creatingState.stateEnteredAt;

          stateMachine.clear();

          // Entry time should be updated (>= previous)
          return creatingEntryTime >= pendingEntryTime;
        },
      ),
      {numRuns: 10},
    );

    t.pass('entry time updates on each transition');
  });

  /**
   * Property: getTransitionalReplicas returns only replicas in transitional
   * states with valid entry times.
   */
  t.test('getTransitionalReplicas returns correct replicas', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.uuid(), {minLength: 1, maxLength: 5}),
        async (replicaIds) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
          });

          const beforeTime = Date.now();

          // Put all replicas in pending state (transitional)
          for (const replicaId of replicaIds) {
            await stateMachine.transition(replicaId, ReplicaState.PENDING, {
              partitionId: 'test-partition',
              reason: 'test',
            });
          }

          const afterTime = Date.now();

          const transitional = stateMachine.getTransitionalReplicas();

          stateMachine.clear();

          // All replicas should be in transitional list with valid entry times
          return (
            transitional.length === replicaIds.length &&
            transitional.every((r) =>
              r.stateEnteredAt >= beforeTime &&
              r.stateEnteredAt <= afterTime &&
              TRANSITIONAL_STATES.includes(r.state),
            )
          );
        },
      ),
      {numRuns: 10},
    );

    t.pass('getTransitionalReplicas returns correct replicas');
  });

  /**
   * Property: Non-transitional states (active, removed, failed) are not
   * returned by getTransitionalReplicas.
   */
  t.test('non-transitional states excluded from getTransitionalReplicas',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          async (replicaId, partitionId) => {
            const stateMachine = new ReplicaStateMachine({
              nodeId: 'test-node',
              cdcIntegrationService: createMockCDCService(),
            });

            // Get replica to active state (non-transitional)
            const path = getPathToState(ReplicaState.ACTIVE);
            for (const state of path) {
              await stateMachine.transition(replicaId, state, {
                partitionId,
                reason: 'test',
              });
            }

            const transitional = stateMachine.getTransitionalReplicas();

            stateMachine.clear();

            // Active replica should not be in transitional list
            return transitional.length === 0;
          },
        ),
        {numRuns: 10},
      );

      t.pass('non-transitional states excluded from getTransitionalReplicas');
    });

  /**
   * Property: Previous state is tracked correctly for debugging.
   */
  t.test('previous state tracked for debugging', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (replicaId, partitionId) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
          });

          // Transition through states
          await stateMachine.transition(replicaId, ReplicaState.PENDING, {
            partitionId,
            reason: 'test',
          });

          await stateMachine.transition(replicaId, ReplicaState.CREATING, {
            partitionId,
            reason: 'test',
          });

          const state = stateMachine.getState(replicaId);

          stateMachine.clear();

          // Previous state should be PENDING
          return state.previousState === ReplicaState.PENDING;
        },
      ),
      {numRuns: 10},
    );

    t.pass('previous state tracked for debugging');
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
