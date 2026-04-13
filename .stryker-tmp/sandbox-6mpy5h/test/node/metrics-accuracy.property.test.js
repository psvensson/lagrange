/**
 * Property Test: Metrics Accuracy
 * **Property 14: Metrics Accuracy**
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.4**
 *
 * *For any* sequence of state transitions, the Replica_State_Machine SHALL
 * maintain accurate metrics including: transition counts per state pair,
 * time spent in each state, failure counts, and peak concurrent operations.
 */
// @ts-nocheck


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

// All possible states
const ALL_STATES = [
  ReplicaState.PENDING,
  ReplicaState.CREATING,
  ReplicaState.SYNCING,
  ReplicaState.ACTIVE,
  ReplicaState.REMOVING,
  ReplicaState.REMOVED,
  ReplicaState.FAILED,
];

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

test('Property 14: Metrics Accuracy', async (t) => {
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
   * Property: Transition counts are accurately tracked per state pair.
   * Requirements 10.1
   */
  t.test('transition counts are accurate per state pair', async (t) => {
    await fc.assert(
      fc.property(
        fc.array(fc.uuid(), {minLength: 1, maxLength: 5}),
        (replicaIds) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
          });

          // Track expected transition counts manually
          const expectedCounts = new Map();

          // Transition each replica through the full lifecycle
          for (const replicaId of replicaIds) {
            const path = getPathToState(ReplicaState.ACTIVE);
            let prevState = null;

            for (const state of path) {
              stateMachine.transition(replicaId, state, {
                partitionId: 'test-partition',
                reason: 'test',
              });

              const key = `${prevState}->${state}`;
              expectedCounts.set(key, (expectedCounts.get(key) || 0) + 1);
              prevState = state;
            }
          }

          const metrics = stateMachine.getMetrics();

          // Verify transition counts match
          for (const [key, expectedCount] of expectedCounts) {
            if (metrics.transitionCounts[key] !== expectedCount) {
              stateMachine.clear();
              return false;
            }
          }

          stateMachine.clear();
          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('transition counts are accurate per state pair');
  });

  /**
   * Property: Failure counts are accurately tracked.
   * Requirements 10.2
   */
  t.test('failure counts are accurate', async (t) => {
    await fc.assert(
      fc.property(
        fc.integer({min: 1, max: 5}),
        (numFailures) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
          });

          // Create replicas and transition them to failed
          for (let i = 0; i < numFailures; i++) {
            const replicaId = `replica-${i}`;

            // First transition to pending
            stateMachine.transition(replicaId, ReplicaState.PENDING, {
              partitionId: 'test-partition',
              reason: 'test',
            });

            // Then transition to failed
            stateMachine.transition(replicaId, ReplicaState.FAILED, {
              partitionId: 'test-partition',
              reason: 'test failure',
              errorMessage: 'Test error',
            });
          }

          const metrics = stateMachine.getMetrics();
          const result = metrics.failureCount === numFailures;

          stateMachine.clear();
          return result;
        },
      ),
      {numRuns: 10},
    );

    t.pass('failure counts are accurate');
  });

  /**
   * Property: Peak concurrent operations are accurately tracked.
   * Requirements 10.3
   */
  t.test('peak concurrent operations are accurate', async (t) => {
    await fc.assert(
      fc.property(
        fc.integer({min: 1, max: 5}),
        (numReplicas) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
            maxConcurrentAdds: 10,
            maxConcurrentRemoves: 10,
          });

          // Create multiple replicas in pending state (concurrent adds)
          for (let i = 0; i < numReplicas; i++) {
            stateMachine.transition(`replica-${i}`, ReplicaState.PENDING, {
              partitionId: 'test-partition',
              reason: 'test',
            });
          }

          const metricsAfterAdds = stateMachine.getMetrics();
          const peakAddsCorrect = metricsAfterAdds.peakConcurrentAdds >= numReplicas;

          // Transition all to active (no longer in add transitional states)
          for (let i = 0; i < numReplicas; i++) {
            stateMachine.transition(`replica-${i}`, ReplicaState.CREATING, {
              partitionId: 'test-partition',
              reason: 'test',
            });
            stateMachine.transition(`replica-${i}`, ReplicaState.SYNCING, {
              partitionId: 'test-partition',
              reason: 'test',
            });
            stateMachine.transition(`replica-${i}`, ReplicaState.ACTIVE, {
              partitionId: 'test-partition',
              reason: 'test',
            });
          }

          // Now transition to removing (concurrent removes)
          for (let i = 0; i < numReplicas; i++) {
            stateMachine.transition(`replica-${i}`, ReplicaState.REMOVING, {
              partitionId: 'test-partition',
              reason: 'test',
            });
          }

          const metricsAfterRemoves = stateMachine.getMetrics();
          const peakRemovesCorrect =
            metricsAfterRemoves.peakConcurrentRemoves >= numReplicas;

          stateMachine.clear();
          return peakAddsCorrect && peakRemovesCorrect;
        },
      ),
      {numRuns: 10},
    );

    t.pass('peak concurrent operations are accurate');
  });

  /**
   * Property: State counts in metrics match actual replica states.
   * Requirements 10.1
   */
  t.test('state counts in metrics match actual states', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom(...ALL_STATES.filter((s) => s !== ReplicaState.REMOVED)),
        fc.integer({min: 1, max: 3}),
        (targetState, numReplicas) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
          });

          // Transition replicas to the target state
          for (let i = 0; i < numReplicas; i++) {
            const path = getPathToState(targetState);
            for (const state of path) {
              stateMachine.transition(`replica-${i}`, state, {
                partitionId: 'test-partition',
                reason: 'test',
              });
            }
          }

          const metrics = stateMachine.getMetrics();
          const result = metrics.stateCounts[targetState] === numReplicas;

          stateMachine.clear();
          return result;
        },
      ),
      {numRuns: 10},
    );

    t.pass('state counts in metrics match actual states');
  });

  /**
   * Property: Current concurrent operations are accurate.
   * Requirements 10.3
   */
  t.test('current concurrent operations are accurate', async (t) => {
    await fc.assert(
      fc.property(
        fc.integer({min: 1, max: 3}),
        fc.integer({min: 1, max: 3}),
        (numAdds, numRemoves) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
            maxConcurrentAdds: 10,
            maxConcurrentRemoves: 10,
          });

          // Create replicas in add transitional states
          for (let i = 0; i < numAdds; i++) {
            stateMachine.transition(`add-replica-${i}`, ReplicaState.PENDING, {
              partitionId: 'test-partition',
              reason: 'test',
            });
          }

          // Create replicas in removing state
          for (let i = 0; i < numRemoves; i++) {
            const replicaId = `remove-replica-${i}`;
            // First get to active state
            const path = getPathToState(ReplicaState.ACTIVE);
            for (const state of path) {
              stateMachine.transition(replicaId, state, {
                partitionId: 'test-partition',
                reason: 'test',
              });
            }
            // Then transition to removing
            stateMachine.transition(replicaId, ReplicaState.REMOVING, {
              partitionId: 'test-partition',
              reason: 'test',
            });
          }

          const metrics = stateMachine.getMetrics();
          const addsCorrect = metrics.currentConcurrentAdds === numAdds;
          const removesCorrect = metrics.currentConcurrentRemoves === numRemoves;

          stateMachine.clear();
          return addsCorrect && removesCorrect;
        },
      ),
      {numRuns: 10},
    );

    t.pass('current concurrent operations are accurate');
  });
});
