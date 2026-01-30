/**
 * Property Test: State Transition Validity
 * **Property 3: State Transition Validity**
 * **Validates: Requirements 2.3**
 *
 * Feature: simplified-cluster-architecture, Property 3: State Transition Validity
 *
 * *For any* current state and attempted target state, the Node_Lifecycle_Service
 * SHALL only allow the transition if it exists in the VALID_TRANSITIONS map.
 *
 * This property test verifies:
 * 1. Valid transitions (in VALID_TRANSITIONS map) are allowed
 * 2. Invalid transitions (not in VALID_TRANSITIONS map) are rejected
 * 3. State machine remains in current state after rejected transition
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  NodeLifecycleStateMachine,
  NodeState,
  VALID_TRANSITIONS,
} from '../../src/node/node-lifecycle-state-machine.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * All valid node states as an array for arbitrary generation.
 */
const ALL_STATES = Object.values(NodeState);

/**
 * Generator for any valid NodeState.
 */
const nodeStateArb = fc.constantFrom(...ALL_STATES);

/**
 * Initialize test dependencies.
 */
function initializeTestDependencies() {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

/**
 * Reset test dependencies.
 */
function resetTestDependencies() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

test('Property 3: State Transition Validity', async (t) => {
  t.beforeEach(() => {
    initializeTestDependencies();
  });

  t.afterEach(() => {
    resetTestDependencies();
  });

  /**
   * Property: For any current state and target state where the transition
   * IS in VALID_TRANSITIONS, the transition SHALL succeed.
   *
   * This tests that all valid transitions are allowed.
   */
  t.test('valid transitions in VALID_TRANSITIONS map are allowed', async (t) => {
    // Generate pairs of (fromState, toState) where toState is valid from fromState
    const validTransitionArb = fc.constantFrom(...ALL_STATES)
      .chain((fromState) => {
        const validTargets = VALID_TRANSITIONS[fromState] || [];
        if (validTargets.length === 0) {
          // No valid transitions from this state, return null to filter out
          return fc.constant(null);
        }
        return fc.constantFrom(...validTargets)
          .map((toState) => ({fromState, toState}));
      })
      .filter((pair) => pair !== null);

    fc.assert(
      fc.property(
        validTransitionArb,
        (transitionPair) => {
          initializeTestDependencies();

          const {fromState, toState} = transitionPair;

          // Create state machine starting in fromState
          const sm = new NodeLifecycleStateMachine({
            nodeId: 'test-node',
            initialState: fromState,
          });

          // Attempt the transition
          const result = sm.transition(toState);

          // Transition should succeed
          const transitionSucceeded = result === true;

          // State should now be toState
          const stateUpdated = sm.getState() === toState;

          resetTestDependencies();

          return transitionSucceeded && stateUpdated;
        },
      ),
      {numRuns: 10},
    );

    t.pass('valid transitions in VALID_TRANSITIONS map are allowed');
  });

  /**
   * Property: For any current state and target state where the transition
   * is NOT in VALID_TRANSITIONS, the transition SHALL be rejected.
   *
   * This tests that all invalid transitions are rejected.
   */
  t.test('invalid transitions not in VALID_TRANSITIONS map are rejected',
    async (t) => {
      fc.assert(
        fc.property(
          nodeStateArb,
          nodeStateArb,
          (fromState, toState) => {
            initializeTestDependencies();

            const validTargets = VALID_TRANSITIONS[fromState] || [];
            const isValidTransition = validTargets.includes(toState);

            // Skip if this is actually a valid transition
            if (isValidTransition) {
              resetTestDependencies();
              return true; // Property holds trivially for valid transitions
            }

            // Create state machine starting in fromState
            const sm = new NodeLifecycleStateMachine({
              nodeId: 'test-node',
              initialState: fromState,
            });

            // Attempt the invalid transition
            const result = sm.transition(toState);

            // Transition should fail
            const transitionRejected = result === false;

            // State should remain unchanged
            const stateUnchanged = sm.getState() === fromState;

            resetTestDependencies();

            return transitionRejected && stateUnchanged;
          },
        ),
        {numRuns: 10},
      );

      t.pass('invalid transitions not in VALID_TRANSITIONS map are rejected');
    });

  /**
   * Property: isValidTransition() returns true if and only if the transition
   * exists in VALID_TRANSITIONS map.
   *
   * This tests the isValidTransition helper method consistency.
   */
  t.test('isValidTransition matches VALID_TRANSITIONS map', async (t) => {
    fc.assert(
      fc.property(
        nodeStateArb,
        nodeStateArb,
        (fromState, toState) => {
          initializeTestDependencies();

          const sm = new NodeLifecycleStateMachine({nodeId: 'test-node'});

          // Check what VALID_TRANSITIONS says
          const validTargets = VALID_TRANSITIONS[fromState] || [];
          const expectedValid = validTargets.includes(toState);

          // Check what isValidTransition says
          const actualValid = sm.isValidTransition(fromState, toState);

          resetTestDependencies();

          return expectedValid === actualValid;
        },
      ),
      {numRuns: 10},
    );

    t.pass('isValidTransition matches VALID_TRANSITIONS map');
  });

  /**
   * Property: After a rejected transition, the state machine state
   * remains exactly as it was before the attempt.
   *
   * This tests state preservation on rejection.
   */
  t.test('state preserved after rejected transition', async (t) => {
    fc.assert(
      fc.property(
        nodeStateArb,
        nodeStateArb,
        (fromState, toState) => {
          initializeTestDependencies();

          const validTargets = VALID_TRANSITIONS[fromState] || [];
          const isValidTransition = validTargets.includes(toState);

          // Skip valid transitions - we only care about rejected ones
          if (isValidTransition) {
            resetTestDependencies();
            return true;
          }

          // Create state machine starting in fromState
          const sm = new NodeLifecycleStateMachine({
            nodeId: 'test-node',
            initialState: fromState,
          });

          // Record state before attempt
          const stateBefore = sm.getState();

          // Attempt the invalid transition
          sm.transition(toState);

          // Record state after attempt
          const stateAfter = sm.getState();

          resetTestDependencies();

          // State should be unchanged
          return stateBefore === stateAfter && stateAfter === fromState;
        },
      ),
      {numRuns: 10},
    );

    t.pass('state preserved after rejected transition');
  });

  /**
   * Property: STOPPED state has no valid outgoing transitions.
   * For any target state, transitioning from STOPPED SHALL be rejected.
   */
  t.test('STOPPED state has no valid outgoing transitions', async (t) => {
    fc.assert(
      fc.property(
        nodeStateArb,
        (targetState) => {
          initializeTestDependencies();

          // Create state machine in STOPPED state
          const sm = new NodeLifecycleStateMachine({
            nodeId: 'test-node',
            initialState: NodeState.STOPPED,
          });

          // Attempt transition to any state
          const result = sm.transition(targetState);

          // Should always fail (STOPPED has no valid transitions)
          const transitionRejected = result === false;

          // State should remain STOPPED
          const stateUnchanged = sm.getState() === NodeState.STOPPED;

          resetTestDependencies();

          return transitionRejected && stateUnchanged;
        },
      ),
      {numRuns: 10},
    );

    t.pass('STOPPED state has no valid outgoing transitions');
  });
});
