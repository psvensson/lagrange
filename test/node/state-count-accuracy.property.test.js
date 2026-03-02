/**
 * Property Test: State Count Accuracy
 * **Property 11: State Count Accuracy**
 * **Validates: Requirements 7.1**
 *
 * *For any* sequence of state transitions, the Replica_State_Machine SHALL
 * maintain accurate counts of replicas in each state, queryable via
 * `getStateCounts()`.
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

// Transitional states (for add operations)
const ADD_TRANSITIONAL_STATES = [
  ReplicaState.PENDING,
  ReplicaState.CREATING,
  ReplicaState.SYNCING,
];

// Remove transitional state
const REMOVE_TRANSITIONAL_STATE = ReplicaState.REMOVING;

test('Property 11: State Count Accuracy', async (t) => {
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
   * Property: State counts match actual replica counts after any sequence
   * of valid transitions.
   */
  t.test('state counts match actual replica counts', async (t) => {
    await fc.assert(
      fc.property(
        fc.array(fc.uuid(), {minLength: 1, maxLength: 10}),
        (replicaIds) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
          });

          // Transition each replica through various states
          for (const replicaId of replicaIds) {
            stateMachine.transition(replicaId, ReplicaState.PENDING, {
              partitionId: 'test-partition',
              reason: 'test',
            });
          }

          // Verify counts match
          const counts = stateMachine.getStateCounts();
          const actualCounts = countReplicasByState(stateMachine);

          stateMachine.clear();

          return countsMatch(counts, actualCounts);
        },
      ),
      {numRuns: 10},
    );

    t.pass('state counts match actual replica counts');
  });

  /**
   * Property: State counts remain accurate after mixed transitions.
   */
  t.test('state counts accurate after mixed transitions', async (t) => {
    await fc.assert(
      fc.property(
        fc.array(fc.uuid(), {minLength: 2, maxLength: 8}),
        fc.integer({min: 0, max: 3}),
        (replicaIds, transitionDepth) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
          });

          // Transition replicas to different depths
          for (let i = 0; i < replicaIds.length; i++) {
            const depth = (i + transitionDepth) % 4;
            const path = getPathToDepth(depth);

            for (const state of path) {
              stateMachine.transition(replicaIds[i], state, {
                partitionId: `partition-${i}`,
                reason: 'test',
              });
            }
          }

          // Verify counts match
          const counts = stateMachine.getStateCounts();
          const actualCounts = countReplicasByState(stateMachine);

          stateMachine.clear();

          return countsMatch(counts, actualCounts);
        },
      ),
      {numRuns: 10},
    );

    t.pass('state counts accurate after mixed transitions');
  });

  /**
   * Property: State counts are zero-initialized and sum correctly.
   */
  t.test('state counts sum equals total replicas', async (t) => {
    await fc.assert(
      fc.property(
        fc.array(fc.uuid(), {minLength: 0, maxLength: 10}),
        (replicaIds) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
          });

          // Transition replicas to pending
          for (const replicaId of replicaIds) {
            stateMachine.transition(replicaId, ReplicaState.PENDING, {
              partitionId: 'test-partition',
              reason: 'test',
            });
          }

          const counts = stateMachine.getStateCounts();
          const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

          stateMachine.clear();

          return totalCount === replicaIds.length;
        },
      ),
      {numRuns: 10},
    );

    t.pass('state counts sum equals total replicas');
  });

  /**
   * Property: Transitional state counts are accurate for add operations.
   */
  t.test('add transitional counts accurate', async (t) => {
    await fc.assert(
      fc.property(
        fc.array(fc.uuid(), {minLength: 1, maxLength: 6}),
        fc.array(
          fc.constantFrom(...ADD_TRANSITIONAL_STATES),
          {minLength: 1, maxLength: 6},
        ),
        (replicaIds, targetStates) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
          });

          // Transition each replica to its target state
          for (let i = 0; i < replicaIds.length; i++) {
            const targetState = targetStates[i % targetStates.length];
            const path = getPathToState(targetState);

            for (const state of path) {
              stateMachine.transition(replicaIds[i], state, {
                partitionId: `partition-${i}`,
                reason: 'test',
              });
            }
          }

          // Count replicas in add transitional states
          const counts = stateMachine.getStateCounts();
          const addTransitionalCount =
            counts[ReplicaState.PENDING] +
            counts[ReplicaState.CREATING] +
            counts[ReplicaState.SYNCING];

          // Count actual replicas in those states
          const actualAddTransitional = stateMachine.getAllReplicas()
            .filter((r) => ADD_TRANSITIONAL_STATES.includes(r.state))
            .length;

          stateMachine.clear();

          return addTransitionalCount === actualAddTransitional;
        },
      ),
      {numRuns: 10},
    );

    t.pass('add transitional counts accurate');
  });

  /**
   * Property: Remove transitional count is accurate.
   */
  t.test('remove transitional count accurate', async (t) => {
    await fc.assert(
      fc.property(
        fc.array(fc.uuid(), {minLength: 1, maxLength: 6}),
        fc.integer({min: 0, max: 5}),
        (replicaIds, numToRemove) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: createMockCDCService(),
          });

          // First get all replicas to active state
          for (const replicaId of replicaIds) {
            const path = getPathToState(ReplicaState.ACTIVE);
            for (const state of path) {
              stateMachine.transition(replicaId, state, {
                partitionId: 'test-partition',
                reason: 'test',
              });
            }
          }

          // Transition some to removing
          const toRemove = Math.min(numToRemove, replicaIds.length);
          for (let i = 0; i < toRemove; i++) {
            stateMachine.transition(replicaIds[i], ReplicaState.REMOVING, {
              partitionId: 'test-partition',
              reason: 'test removal',
            });
          }

          // Verify removing count
          const counts = stateMachine.getStateCounts();
          const actualRemovingCount = stateMachine.getAllReplicas()
            .filter((r) => r.state === REMOVE_TRANSITIONAL_STATE)
            .length;

          stateMachine.clear();

          return counts[ReplicaState.REMOVING] === actualRemovingCount;
        },
      ),
      {numRuns: 10},
    );

    t.pass('remove transitional count accurate');
  });
});

/**
 * Count replicas by state by iterating through all replicas.
 * @param {ReplicaStateMachine} stateMachine - The state machine.
 * @return {Object} Counts by state.
 */
function countReplicasByState(stateMachine) {
  const counts = {};
  for (const state of ALL_STATES) {
    counts[state] = 0;
  }

  for (const replica of stateMachine.getAllReplicas()) {
    counts[replica.state]++;
  }

  return counts;
}

/**
 * Check if two count objects match.
 * @param {Object} counts1 - First counts object.
 * @param {Object} counts2 - Second counts object.
 * @return {boolean} True if counts match.
 */
function countsMatch(counts1, counts2) {
  for (const state of ALL_STATES) {
    if (counts1[state] !== counts2[state]) {
      return false;
    }
  }
  return true;
}

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

/**
 * Get a path to a certain depth in the state machine.
 * @param {number} depth - Depth (0-3).
 * @return {Array<string>} Array of states.
 */
function getPathToDepth(depth) {
  const fullPath = [
    ReplicaState.PENDING,
    ReplicaState.CREATING,
    ReplicaState.SYNCING,
    ReplicaState.ACTIVE,
  ];

  return fullPath.slice(0, depth + 1);
}
