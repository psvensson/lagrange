/**
 * Property Test: State Change Event Emission
 * **Property 4: State Change Event Emission**
 * **Validates: Requirements 2.2**
 *
 * Feature: simplified-cluster-architecture, Property 4: State Change Event Emission
 *
 * *For any* valid state transition, the Node_Lifecycle_Service SHALL emit
 * exactly one 'stateChange' event containing the from state, to state,
 * and timestamp.
 *
 * This property test verifies:
 * 1. Exactly one event is emitted per valid transition
 * 2. Event contains correct 'from' state
 * 3. Event contains correct 'to' state
 * 4. Event contains a valid timestamp
 * 5. No events are emitted for invalid transitions
 */

import {test} from 'tap';
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
 * Generator for valid transition pairs (fromState, toState).
 * Only generates pairs where the transition is valid according to
 * VALID_TRANSITIONS map.
 */
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

test('Property 4: State Change Event Emission', async (t) => {
  t.beforeEach(() => {
    initializeTestDependencies();
  });

  t.afterEach(() => {
    resetTestDependencies();
  });

  /**
   * Property: For any valid state transition, exactly one 'stateChange'
   * event SHALL be emitted.
   */
  t.test('exactly one event emitted per valid transition', async (t) => {
    fc.assert(
      fc.property(
        validTransitionArb,
        (transitionPair) => {
          initializeTestDependencies();

          const {fromState, toState} = transitionPair;
          const events = [];

          // Create state machine starting in fromState
          const sm = new NodeLifecycleStateMachine({
            nodeId: 'test-node',
            initialState: fromState,
          });

          // Listen for stateChange events
          sm.on('stateChange', (event) => {
            events.push(event);
          });

          // Perform the valid transition
          sm.transition(toState);

          resetTestDependencies();

          // Exactly one event should be emitted
          return events.length === 1;
        },
      ),
      {numRuns: 10},
    );

    t.pass('exactly one event emitted per valid transition');
  });

  /**
   * Property: For any valid state transition, the emitted event SHALL
   * contain the correct 'from' state.
   */
  t.test('event contains correct from state', async (t) => {
    fc.assert(
      fc.property(
        validTransitionArb,
        (transitionPair) => {
          initializeTestDependencies();

          const {fromState, toState} = transitionPair;
          const events = [];

          // Create state machine starting in fromState
          const sm = new NodeLifecycleStateMachine({
            nodeId: 'test-node',
            initialState: fromState,
          });

          // Listen for stateChange events
          sm.on('stateChange', (event) => {
            events.push(event);
          });

          // Perform the valid transition
          sm.transition(toState);

          resetTestDependencies();

          // Event should have correct 'from' state
          return events.length === 1 && events[0].from === fromState;
        },
      ),
      {numRuns: 10},
    );

    t.pass('event contains correct from state');
  });

  /**
   * Property: For any valid state transition, the emitted event SHALL
   * contain the correct 'to' state.
   */
  t.test('event contains correct to state', async (t) => {
    fc.assert(
      fc.property(
        validTransitionArb,
        (transitionPair) => {
          initializeTestDependencies();

          const {fromState, toState} = transitionPair;
          const events = [];

          // Create state machine starting in fromState
          const sm = new NodeLifecycleStateMachine({
            nodeId: 'test-node',
            initialState: fromState,
          });

          // Listen for stateChange events
          sm.on('stateChange', (event) => {
            events.push(event);
          });

          // Perform the valid transition
          sm.transition(toState);

          resetTestDependencies();

          // Event should have correct 'to' state
          return events.length === 1 && events[0].to === toState;
        },
      ),
      {numRuns: 10},
    );

    t.pass('event contains correct to state');
  });

  /**
   * Property: For any valid state transition, the emitted event SHALL
   * contain a valid timestamp (a positive number).
   */
  t.test('event contains valid timestamp', async (t) => {
    fc.assert(
      fc.property(
        validTransitionArb,
        (transitionPair) => {
          initializeTestDependencies();

          const {fromState, toState} = transitionPair;
          const events = [];

          // Create state machine starting in fromState
          const sm = new NodeLifecycleStateMachine({
            nodeId: 'test-node',
            initialState: fromState,
          });

          // Listen for stateChange events
          sm.on('stateChange', (event) => {
            events.push(event);
          });

          // Perform the valid transition
          sm.transition(toState);

          resetTestDependencies();

          // Event should have a valid timestamp (positive number)
          return events.length === 1 &&
                 typeof events[0].timestamp === 'number' &&
                 events[0].timestamp > 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('event contains valid timestamp');
  });

  /**
   * Property: For any invalid state transition, no 'stateChange' event
   * SHALL be emitted.
   */
  t.test('no event emitted for invalid transitions', async (t) => {
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

          const events = [];

          // Create state machine starting in fromState
          const sm = new NodeLifecycleStateMachine({
            nodeId: 'test-node',
            initialState: fromState,
          });

          // Listen for stateChange events
          sm.on('stateChange', (event) => {
            events.push(event);
          });

          // Attempt the invalid transition
          sm.transition(toState);

          resetTestDependencies();

          // No events should be emitted for invalid transitions
          return events.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('no event emitted for invalid transitions');
  });

  /**
   * Property: For a sequence of valid transitions, the number of events
   * emitted SHALL equal the number of transitions performed.
   */
  t.test('event count matches transition count for sequences', async (t) => {
    // Generate a sequence of valid transitions
    const transitionSequenceArb = fc.integer({min: 1, max: 5}).chain((count) => {
      // Build a sequence of valid transitions starting from STARTING
      return fc.constant(buildValidTransitionSequence(count));
    }).filter((seq) => seq.length > 0);

    fc.assert(
      fc.property(
        transitionSequenceArb,
        (transitions) => {
          initializeTestDependencies();

          const events = [];

          // Create state machine starting in STARTING
          const sm = new NodeLifecycleStateMachine({
            nodeId: 'test-node',
            initialState: NodeState.STARTING,
          });

          // Listen for stateChange events
          sm.on('stateChange', (event) => {
            events.push(event);
          });

          // Perform all transitions
          for (const targetState of transitions) {
            sm.transition(targetState);
          }

          resetTestDependencies();

          // Number of events should equal number of transitions
          return events.length === transitions.length;
        },
      ),
      {numRuns: 10},
    );

    t.pass('event count matches transition count for sequences');
  });

  /**
   * Property: Events emitted during a sequence of transitions SHALL have
   * consecutive from/to states (to of event N equals from of event N+1).
   */
  t.test('events have consecutive states in sequence', async (t) => {
    // Generate a sequence of valid transitions
    const transitionSequenceArb = fc.integer({min: 2, max: 5}).chain((count) => {
      return fc.constant(buildValidTransitionSequence(count));
    }).filter((seq) => seq.length >= 2);

    fc.assert(
      fc.property(
        transitionSequenceArb,
        (transitions) => {
          initializeTestDependencies();

          const events = [];

          // Create state machine starting in STARTING
          const sm = new NodeLifecycleStateMachine({
            nodeId: 'test-node',
            initialState: NodeState.STARTING,
          });

          // Listen for stateChange events
          sm.on('stateChange', (event) => {
            events.push(event);
          });

          // Perform all transitions
          for (const targetState of transitions) {
            sm.transition(targetState);
          }

          resetTestDependencies();

          // Check consecutive events have matching states
          for (let i = 0; i < events.length - 1; i++) {
            if (events[i].to !== events[i + 1].from) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('events have consecutive states in sequence');
  });
});

/**
 * Build a valid transition sequence starting from STARTING state.
 * @param {number} count - Number of transitions to generate.
 * @return {string[]} Array of target states for valid transitions.
 */
function buildValidTransitionSequence(count) {
  const sequence = [];
  let currentState = NodeState.STARTING;

  for (let i = 0; i < count; i++) {
    const validTargets = VALID_TRANSITIONS[currentState] || [];
    if (validTargets.length === 0) {
      // No more valid transitions possible
      break;
    }

    // Pick the first valid target (deterministic for reproducibility)
    const nextState = validTargets[0];
    sequence.push(nextState);
    currentState = nextState;
  }

  return sequence;
}
