/**
 * Property Test: Valid Transition Enforcement
 * **Property 1: Valid Transition Enforcement**
 * **Validates: Requirements 1.2, 1.3**
 *
 * *For any* state transition attempt on the Replica_State_Machine,
 * the transition SHALL succeed if and only if the (currentState, newState)
 * pair exists in the valid transitions matrix. Invalid transitions SHALL
 * be rejected and logged.
 */

import {test} from 'tap';
import fc from 'fast-check';
import {
  ReplicaStateMachine,
  ReplicaState,
  VALID_TRANSITIONS,
} from '../../src/node/replica-state-machine.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

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

// All possible current states including null (new replica)
const ALL_CURRENT_STATES = [null, ...ALL_STATES];

test('Property 1: Valid Transition Enforcement', async (t) => {
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
   * Property: For any valid transition defined in VALID_TRANSITIONS,
   * the transition should succeed.
   */
  t.test('valid transitions succeed', async (t) => {
    // Generate valid transition pairs
    const validTransitions = [];
    for (const [fromState, toStates] of Object.entries(VALID_TRANSITIONS)) {
      const from = fromState === 'null' ? null : fromState;
      for (const toState of toStates) {
        validTransitions.push({from, to: toState});
      }
    }

    if (validTransitions.length === 0) {
      t.pass('no valid transitions to test');
      return;
    }

    await fc.assert(
      fc.property(
        fc.constantFrom(...validTransitions),
        fc.uuid(),
        fc.uuid(),
        (transition, replicaId, partitionId) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
          });

          // If from state is not null, set up the replica in that state first
          if (transition.from !== null) {
            // We need to get to the from state through valid transitions
            const setupPath = getPathToState(transition.from);
            for (const state of setupPath) {
              stateMachine.transition(replicaId, state, {
                partitionId,
                reason: 'setup',
              });
            }
          }

          // Attempt the transition
          const result = stateMachine.transition(replicaId, transition.to, {
            partitionId,
            reason: 'test transition',
          });

          stateMachine.clear();

          return result === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('valid transitions succeed');
  });

  /**
   * Property: For any invalid transition (not in VALID_TRANSITIONS),
   * the transition should fail.
   */
  t.test('invalid transitions fail', async (t) => {
    // Generate invalid transition pairs
    const invalidTransitions = [];
    for (const fromState of ALL_CURRENT_STATES) {
      const validNextStates = VALID_TRANSITIONS[fromState] || [];
      for (const toState of ALL_STATES) {
        if (!validNextStates.includes(toState)) {
          invalidTransitions.push({from: fromState, to: toState});
        }
      }
    }

    if (invalidTransitions.length === 0) {
      t.pass('no invalid transitions to test');
      return;
    }

    await fc.assert(
      fc.property(
        fc.constantFrom(...invalidTransitions),
        fc.uuid(),
        fc.uuid(),
        (transition, replicaId, partitionId) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
          });

          // Track if transitionError event was emitted
          let errorEmitted = false;
          stateMachine.on('transitionError', () => {
            errorEmitted = true;
          });

          // If from state is not null, set up the replica in that state first
          if (transition.from !== null) {
            const setupPath = getPathToState(transition.from);
            for (const state of setupPath) {
              stateMachine.transition(replicaId, state, {
                partitionId,
                reason: 'setup',
              });
            }
          }

          // Attempt the invalid transition
          const result = stateMachine.transition(replicaId, transition.to, {
            partitionId,
            reason: 'test invalid transition',
          });

          stateMachine.clear();

          // Invalid transitions should return false and emit error
          return result === false && errorEmitted === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('invalid transitions fail');
  });

  /**
   * Property: isValidTransition correctly validates all transitions.
   */
  t.test('isValidTransition validates correctly', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom(...ALL_CURRENT_STATES),
        fc.constantFrom(...ALL_STATES),
        (fromState, toState) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
          });

          const isValid = stateMachine.isValidTransition(fromState, toState);

          // Check against expected validity
          const validNextStates = VALID_TRANSITIONS[fromState] || [];
          const expectedValid = validNextStates.includes(toState);

          stateMachine.clear();

          return isValid === expectedValid;
        },
      ),
      {numRuns: 10},
    );

    t.pass('isValidTransition validates correctly');
  });

  /**
   * Property: State counts are updated correctly after transitions.
   */
  t.test('state counts updated correctly', async (t) => {
    await fc.assert(
      fc.property(
        fc.array(fc.uuid(), {minLength: 1, maxLength: 5}),
        (replicaIds) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
          });

          // Transition all replicas to pending
          for (const replicaId of replicaIds) {
            stateMachine.transition(replicaId, ReplicaState.PENDING, {
              partitionId: 'test-partition',
              reason: 'test',
            });
          }

          const counts = stateMachine.getStateCounts();

          stateMachine.clear();

          return counts[ReplicaState.PENDING] === replicaIds.length;
        },
      ),
      {numRuns: 10},
    );

    t.pass('state counts updated correctly');
  });

  /**
   * Property: Terminal state (REMOVED) has no valid outgoing transitions.
   */
  t.test('REMOVED state has no outgoing transitions', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom(...ALL_STATES),
        fc.uuid(),
        (targetState, replicaId) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
          });

          // Get replica to REMOVED state
          const pathToRemoved = getPathToState(ReplicaState.REMOVED);
          for (const state of pathToRemoved) {
            stateMachine.transition(replicaId, state, {
              partitionId: 'test-partition',
              reason: 'setup',
            });
          }

          // Attempt transition from REMOVED
          const result = stateMachine.transition(replicaId, targetState, {
            partitionId: 'test-partition',
            reason: 'test',
          });

          stateMachine.clear();

          // All transitions from REMOVED should fail
          return result === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('REMOVED state has no outgoing transitions');
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
