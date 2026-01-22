/**
 * Property Test: State Persistence via CDC
 * **Property 6: State Persistence via CDC**
 * **Validates: Requirements 4.1**
 *
 * *For any* state transition, the Replica_State_Machine SHALL persist
 * the new state to the `services` system table via CDC before the
 * transition method returns.
 */

import {test} from 'tap';
import fc from 'fast-check';
import {
  ReplicaStateMachine,
  ReplicaState,
} from '../../src/node/replica-state-machine.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Valid transition sequences for testing
const VALID_TRANSITION_SEQUENCES = [
  [ReplicaState.PENDING],
  [ReplicaState.PENDING, ReplicaState.CREATING],
  [ReplicaState.PENDING, ReplicaState.CREATING, ReplicaState.SYNCING],
  [ReplicaState.PENDING, ReplicaState.CREATING, ReplicaState.SYNCING, ReplicaState.ACTIVE],
  [ReplicaState.PENDING, ReplicaState.FAILED],
  [ReplicaState.PENDING, ReplicaState.CREATING, ReplicaState.FAILED],
];

/**
 * Create a mock CDC integration service that tracks calls.
 * @return {Object} Mock service with calls array.
 */
function createMockCdcService() {
  const calls = [];
  return {
    calls,
    updateSystemTableRow: async (tableName, whereClause, data) => {
      calls.push({
        type: 'update',
        tableName,
        whereClause,
        data,
        timestamp: Date.now(),
      });
      return {success: true};
    },
    insertSystemTableRow: async (tableName, data) => {
      calls.push({
        type: 'insert',
        tableName,
        data,
        timestamp: Date.now(),
      });
      return {success: true};
    },
  };
}

test('Property 6: State Persistence via CDC', async (t) => {
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
   * Property: For any state transition with CDC configured,
   * CDC persistence is called for each transition.
   */
  t.test('CDC persistence called for every transition', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...VALID_TRANSITION_SEQUENCES),
        fc.uuid(),
        fc.uuid(),
        async (transitionSequence, replicaId, partitionId) => {
          const mockCdc = createMockCdcService();

          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: mockCdc,
          });

          // Execute transition sequence
          for (const state of transitionSequence) {
            const result = await stateMachine.transition(replicaId, state, {
              partitionId,
              nodeId: 'test-node',
              reason: `transition to ${state}`,
            });
            if (!result) {
              stateMachine.clear();
              return false;
            }
          }

          stateMachine.clear();

          // Verify CDC was called for each transition
          return mockCdc.calls.length === transitionSequence.length;
        },
      ),
      {numRuns: 10},
    );

    t.pass('CDC persistence called for every transition');
  });

  /**
   * Property: CDC persistence includes all required state fields.
   */
  t.test('CDC persistence includes required fields', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.string({minLength: 1, maxLength: 50}),
        async (replicaId, partitionId, reason) => {
          const mockCdc = createMockCdcService();

          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: mockCdc,
          });

          // Execute a transition
          const result = await stateMachine.transition(
            replicaId,
            ReplicaState.PENDING,
            {
              partitionId,
              nodeId: 'test-node',
              reason,
            },
          );

          stateMachine.clear();

          if (!result || mockCdc.calls.length === 0) {
            return false;
          }

          const call = mockCdc.calls[0];

          // Verify table name is 'services'
          if (call.tableName !== 'services') {
            return false;
          }

          // Verify data includes required state machine fields
          const data = call.data;
          const hasStatus = 'status' in data;
          const hasStateEnteredAt = 'state_entered_at' in data;
          const hasTriggerReason = 'trigger_reason' in data;

          return hasStatus && hasStateEnteredAt && hasTriggerReason;
        },
      ),
      {numRuns: 10},
    );

    t.pass('CDC persistence includes required fields');
  });

  /**
   * Property: CDC persistence completes before transition returns.
   */
  t.test('CDC persistence completes synchronously', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (replicaId, partitionId) => {
          let cdcCompleted = false;

          // Mock CDC integration service with tracking
          const mockCdc = {
            updateSystemTableRow: async () => {
              cdcCompleted = true;
              return {success: true};
            },
            insertSystemTableRow: async () => {
              cdcCompleted = true;
              return {success: true};
            },
          };

          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: mockCdc,
          });

          // Execute transition and await it
          const result = await stateMachine.transition(
            replicaId,
            ReplicaState.PENDING,
            {
              partitionId,
              nodeId: 'test-node',
              reason: 'test',
            },
          );

          stateMachine.clear();

          // After await, both should be true
          return cdcCompleted && result === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('CDC persistence completes synchronously');
  });

  /**
   * Property: Previous state is persisted correctly.
   */
  t.test('previous state persisted correctly', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (replicaId, partitionId) => {
          const mockCdc = createMockCdcService();

          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: mockCdc,
          });

          // Execute two transitions
          await stateMachine.transition(replicaId, ReplicaState.PENDING, {
            partitionId,
            nodeId: 'test-node',
            reason: 'first transition',
          });

          await stateMachine.transition(replicaId, ReplicaState.CREATING, {
            partitionId,
            nodeId: 'test-node',
            reason: 'second transition',
          });

          stateMachine.clear();

          // Verify we have at least 2 calls
          if (mockCdc.calls.length < 2) {
            return false;
          }

          // Second call should have previous_state set to 'pending'
          const secondCall = mockCdc.calls[1];
          const hasPreviousState = 'previous_state' in secondCall.data;

          if (!hasPreviousState) {
            return false;
          }

          return secondCall.data.previous_state === ReplicaState.PENDING;
        },
      ),
      {numRuns: 10},
    );

    t.pass('previous state persisted correctly');
  });

  /**
   * Property: State machine works without CDC service (backward compatible).
   */
  t.test('backward compatible without CDC service', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom(...VALID_TRANSITION_SEQUENCES),
        fc.uuid(),
        fc.uuid(),
        (transitionSequence, replicaId, partitionId) => {
          // Create state machine WITHOUT CDC service
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            // No cdcIntegrationService provided
          });

          // Execute transition sequence - should work without CDC
          let allSucceeded = true;
          for (const state of transitionSequence) {
            const result = stateMachine.transition(replicaId, state, {
              partitionId,
              nodeId: 'test-node',
              reason: `transition to ${state}`,
            });
            if (!result) {
              allSucceeded = false;
              break;
            }
          }

          // Verify final state
          const finalState = stateMachine.getState(replicaId);
          const expectedFinalState = transitionSequence[transitionSequence.length - 1];

          stateMachine.clear();

          return allSucceeded && finalState?.state === expectedFinalState;
        },
      ),
      {numRuns: 10},
    );

    t.pass('backward compatible without CDC service');
  });
});
