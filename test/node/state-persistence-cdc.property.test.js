/**
 * Property Test: State Persistence via CDC
 * **Property 6: State Persistence via CDC**
 * **Validates: Requirements 4.1**
 *
 * *For any* state transition, ReplicaStateMachine SHALL persist the new
 * state through the canonical control-plane mutation bundle before the
 * transition method returns. Every transition writes one authoritative
 * `services` row, and stable non-routable partition states may append one
 * canonical `partitions` leader-clear mutation.
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  ReplicaStateMachine,
  ReplicaState,
} from '../../src/node/replica-state-machine.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  buildReplicaStatePropertyContext,
  getExpectedReplicaStateMutationBundleCount,
  getServiceMutationCalls,
} from './replica-state-machine-property-helpers.js';

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
    upsertSystemTableRow: async (tableName, data) => {
      calls.push({
        type: 'upsert',
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
   * the authoritative service-row persistence runs for each transition and the
   * total emitted mutation bundle matches the canonical late-state contract.
   */
  t.test('CDC persistence emits the canonical mutation bundle for every transition',
    async (t) => {
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
            const result = await stateMachine.transition(
              replicaId,
              state,
              buildReplicaStatePropertyContext(
                partitionId,
                `transition to ${state}`,
              ),
            );
            if (!result) {
              stateMachine.clear();
              return false;
            }
          }

          stateMachine.clear();

          const serviceCalls = getServiceMutationCalls(mockCdc.calls);
          return serviceCalls.length === transitionSequence.length &&
            mockCdc.calls.length ===
              getExpectedReplicaStateMutationBundleCount(
                transitionSequence,
              );
        },
      ),
      {numRuns: 10},
    );

      t.pass(
        'CDC persistence emits the canonical mutation bundle for every transition',
      );
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
            buildReplicaStatePropertyContext(partitionId, reason),
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
            upsertSystemTableRow: async () => {
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
            buildReplicaStatePropertyContext(partitionId, 'test'),
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
          await stateMachine.transition(
            replicaId,
            ReplicaState.PENDING,
            buildReplicaStatePropertyContext(
              partitionId,
              'first transition',
            ),
          );

          await stateMachine.transition(
            replicaId,
            ReplicaState.CREATING,
            buildReplicaStatePropertyContext(
              partitionId,
              'second transition',
            ),
          );

          stateMachine.clear();

          const serviceCalls = getServiceMutationCalls(mockCdc.calls);
          if (serviceCalls.length < 2) {
            return false;
          }

          // Second service-row call should have previous_state set to 'pending'
          const secondCall = serviceCalls[1];
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

  t.test('requires CDC service', async (t) => {
    t.throws(
      () => new ReplicaStateMachine({nodeId: 'test-node'}),
      /cdcIntegrationService/,
      'should require CDC integration service',
    );
    t.end();
  });
});
