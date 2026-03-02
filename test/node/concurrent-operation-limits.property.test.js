/**
 * Property Test: Concurrent Operation Limits
 * **Property 12: Concurrent Operation Limits**
 * **Validates: Requirements 7.2, 7.3**
 *
 * *For any* operation type (add or remove), when the count of replicas in
 * the corresponding transitional states exceeds the configured limit, the
 * state machine SHALL report `canStartOperation()` as false.
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

test('Property 12: Concurrent Operation Limits', async (t) => {
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
   * Property: canStartOperation('add') returns false when add transitional
   * count exceeds limit.
   */
  t.test('add operations blocked when limit exceeded', async (t) => {
    await fc.assert(
      fc.property(
        fc.integer({min: 1, max: 5}),
        fc.integer({min: 0, max: 3}),
        (limit, extraReplicas) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
            maxConcurrentAdds: limit,
          });

          // Add replicas up to the limit
          for (let i = 0; i < limit; i++) {
            stateMachine.transition(`replica-${i}`, ReplicaState.PENDING, {
              partitionId: `partition-${i}`,
              reason: 'test',
            });
          }

          // At limit, should not allow more
          const atLimit = !stateMachine.canStartOperation('add');

          // Add more replicas beyond limit
          for (let i = 0; i < extraReplicas; i++) {
            stateMachine.transition(
              `extra-replica-${i}`,
              ReplicaState.PENDING,
              {
                partitionId: `extra-partition-${i}`,
                reason: 'test',
              },
            );
          }

          // Beyond limit, should still not allow
          const beyondLimit = !stateMachine.canStartOperation('add');

          stateMachine.clear();

          return atLimit && beyondLimit;
        },
      ),
      {numRuns: 10},
    );

    t.pass('add operations blocked when limit exceeded');
  });

  /**
   * Property: canStartOperation('add') returns true when below limit.
   */
  t.test('add operations allowed when below limit', async (t) => {
    await fc.assert(
      fc.property(
        fc.integer({min: 2, max: 10}),
        fc.integer({min: 0, max: 5}),
        (limit, numReplicas) => {
          const belowLimit = Math.min(numReplicas, limit - 1);

          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
            maxConcurrentAdds: limit,
          });

          // Add replicas below the limit
          for (let i = 0; i < belowLimit; i++) {
            stateMachine.transition(`replica-${i}`, ReplicaState.PENDING, {
              partitionId: `partition-${i}`,
              reason: 'test',
            });
          }

          // Below limit, should allow more
          const canAdd = stateMachine.canStartOperation('add');

          stateMachine.clear();

          return canAdd === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('add operations allowed when below limit');
  });

  /**
   * Property: canStartOperation('remove') returns false when remove
   * transitional count exceeds limit.
   */
  t.test('remove operations blocked when limit exceeded', async (t) => {
    await fc.assert(
      fc.property(
        fc.integer({min: 1, max: 5}),
        fc.integer({min: 0, max: 3}),
        (limit, extraReplicas) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
            maxConcurrentRemoves: limit,
          });

          // First get replicas to active state, then to removing
          for (let i = 0; i < limit + extraReplicas; i++) {
            const path = getPathToState(ReplicaState.ACTIVE);
            for (const state of path) {
              stateMachine.transition(`replica-${i}`, state, {
                partitionId: `partition-${i}`,
                reason: 'test',
              });
            }
          }

          // Transition to removing up to limit
          for (let i = 0; i < limit; i++) {
            stateMachine.transition(`replica-${i}`, ReplicaState.REMOVING, {
              partitionId: `partition-${i}`,
              reason: 'test removal',
            });
          }

          // At limit, should not allow more
          const atLimit = !stateMachine.canStartOperation('remove');

          // Add more to removing beyond limit
          for (let i = limit; i < limit + extraReplicas; i++) {
            stateMachine.transition(`replica-${i}`, ReplicaState.REMOVING, {
              partitionId: `partition-${i}`,
              reason: 'test removal',
            });
          }

          // Beyond limit, should still not allow
          const beyondLimit = !stateMachine.canStartOperation('remove');

          stateMachine.clear();

          return atLimit && beyondLimit;
        },
      ),
      {numRuns: 10},
    );

    t.pass('remove operations blocked when limit exceeded');
  });

  /**
   * Property: canStartOperation('remove') returns true when below limit.
   */
  t.test('remove operations allowed when below limit', async (t) => {
    await fc.assert(
      fc.property(
        fc.integer({min: 2, max: 10}),
        fc.integer({min: 0, max: 5}),
        (limit, numReplicas) => {
          const belowLimit = Math.min(numReplicas, limit - 1);

          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
            maxConcurrentRemoves: limit,
          });

          // First get replicas to active state
          for (let i = 0; i < belowLimit; i++) {
            const path = getPathToState(ReplicaState.ACTIVE);
            for (const state of path) {
              stateMachine.transition(`replica-${i}`, state, {
                partitionId: `partition-${i}`,
                reason: 'test',
              });
            }
          }

          // Transition to removing
          for (let i = 0; i < belowLimit; i++) {
            stateMachine.transition(`replica-${i}`, ReplicaState.REMOVING, {
              partitionId: `partition-${i}`,
              reason: 'test removal',
            });
          }

          // Below limit, should allow more
          const canRemove = stateMachine.canStartOperation('remove');

          stateMachine.clear();

          return canRemove === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('remove operations allowed when below limit');
  });

  /**
   * Property: Add transitional count includes pending, creating, and syncing.
   */
  t.test('add limit considers all add transitional states', async (t) => {
    await fc.assert(
      fc.property(
        fc.integer({min: 3, max: 6}),
        (limit) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
            maxConcurrentAdds: limit,
          });

          // Distribute replicas across pending, creating, syncing
          // One in each state
          stateMachine.transition('replica-pending', ReplicaState.PENDING, {
            partitionId: 'p1',
            reason: 'test',
          });

          stateMachine.transition('replica-creating', ReplicaState.PENDING, {
            partitionId: 'p2',
            reason: 'test',
          });
          stateMachine.transition('replica-creating', ReplicaState.CREATING, {
            partitionId: 'p2',
            reason: 'test',
          });

          stateMachine.transition('replica-syncing', ReplicaState.PENDING, {
            partitionId: 'p3',
            reason: 'test',
          });
          stateMachine.transition('replica-syncing', ReplicaState.CREATING, {
            partitionId: 'p3',
            reason: 'test',
          });
          stateMachine.transition('replica-syncing', ReplicaState.SYNCING, {
            partitionId: 'p3',
            reason: 'test',
          });

          // Total add transitional = 3
          const counts = stateMachine.getStateCounts();
          const addTransitional =
            counts[ReplicaState.PENDING] +
            counts[ReplicaState.CREATING] +
            counts[ReplicaState.SYNCING];

          // If limit is 3, should not allow more
          const canAdd = stateMachine.canStartOperation('add');
          const expectedCanAdd = addTransitional < limit;

          stateMachine.clear();

          return canAdd === expectedCanAdd;
        },
      ),
      {numRuns: 10},
    );

    t.pass('add limit considers all add transitional states');
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
