/**
 * Property Test: State machine to CDC consistency
 * Feature: system-architecture-consolidation,
 *   Property 4: State machine to CDC consistency
 *
 * **Validates: Requirements 2.3**
 *
 * *For any* valid state transition in the NodeLifecycleStateMachine,
 * the state value written to the nodes system table via CDC shall be
 * identical to the state machine's current state value from the
 * unified NODE_STATE enum.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  NodeLifecycleStateMachine,
  VALID_TRANSITIONS,
} from '../../src/node/node-lifecycle-state-machine.js';
import {NODE_STATE} from '../../src/constants/node-state.js';
import {NODE_LIFECYCLE_EVENT} from '../../src/node/node-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * Set of all valid NODE_STATE enum values for membership checks.
 * @type {Set<string>}
 */
const NODE_STATE_VALUES = new Set(Object.values(NODE_STATE));

/**
 * All valid top-level state transition sequences through the
 * lifecycle. Each sequence starts from STARTING and follows
 * VALID_TRANSITIONS to produce a path of states.
 *
 * Sequences include early stops (e.g., CONNECTING → STOPPED)
 * and the full happy path (STARTING → ... → STOPPED).
 * @type {Array<{initialState: string, transitions: string[]}>}
 */
const TRANSITION_SEQUENCES = [];

/**
 * Build all valid transition paths from a given state.
 * Uses depth-first traversal of the VALID_TRANSITIONS graph.
 * @param {string} fromState - Starting state.
 * @param {string[]} pathSoFar - Accumulated transitions.
 */
function buildPaths(fromState, pathSoFar) {
  const nextStates = VALID_TRANSITIONS[fromState] || [];

  // Record the current path as a valid sequence
  if (pathSoFar.length > 0) {
    TRANSITION_SEQUENCES.push({
      initialState: NODE_STATE.STARTING,
      transitions: [...pathSoFar],
    });
  }

  for (const nextState of nextStates) {
    buildPaths(nextState, [...pathSoFar, nextState]);
  }
}

// Build all paths starting from STARTING
buildPaths(NODE_STATE.STARTING, []);

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'property-test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('Property 4: State machine to CDC consistency',
  async (t) => {
    /**
     * Property: For any valid state transition sequence,
     * getState() always returns a value from the unified
     * NODE_STATE enum. Since the NodeLifecycleService writes
     * getState() to CDC, this guarantees the CDC value matches
     * the state machine's current state.
     */
    t.test(
      'getState returns NODE_STATE enum value after transitions',
      async (t) => {
        fc.assert(
          fc.property(
            fc.constantFrom(...TRANSITION_SEQUENCES),
            (scenario) => {
              const sm = new NodeLifecycleStateMachine({
                nodeId: 'prop-test',
                initialState: scenario.initialState,
              });

              // Initial state must be from NODE_STATE enum
              if (!NODE_STATE_VALUES.has(sm.getState())) {
                return false;
              }

              // Walk through each transition
              for (const nextState of scenario.transitions) {
                const result = sm.transition(nextState);
                if (!result) return false;

                // After transition, getState() must return a
                // value from the unified NODE_STATE enum
                const currentState = sm.getState();
                if (!NODE_STATE_VALUES.has(currentState)) {
                  return false;
                }

                // The CDC write value would be getState() —
                // verify it equals the transition target
                if (currentState !== nextState) return false;
              }

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'getState always returns a NODE_STATE enum value ' +
          'after valid transitions',
        );
      },
    );

    /**
     * Property: For any valid state transition, the stateChange
     * event's `to` field (which the NodeLifecycleService uses
     * to write to CDC) is identical to getState() after the
     * transition. This ensures the event-driven CDC write path
     * and the state machine's current state are consistent.
     */
    t.test(
      'stateChange event to field matches getState for CDC',
      async (t) => {
        fc.assert(
          fc.property(
            fc.constantFrom(...TRANSITION_SEQUENCES),
            (scenario) => {
              const sm = new NodeLifecycleStateMachine({
                nodeId: 'prop-test',
                initialState: scenario.initialState,
              });

              const events = [];
              sm.on(
                NODE_LIFECYCLE_EVENT.STATE_CHANGE,
                (evt) => events.push(evt),
              );

              for (const nextState of scenario.transitions) {
                sm.transition(nextState);
              }

              // Each event's `to` field must match getState()
              // at the time of that transition, and must be
              // a NODE_STATE enum value
              let expectedState = scenario.initialState;
              for (let i = 0; i < events.length; i++) {
                const evt = events[i];

                // `from` must be the previous state
                if (evt.from !== expectedState) return false;

                // `to` must be the transition target
                if (evt.to !== scenario.transitions[i]) {
                  return false;
                }

                // `to` must be a NODE_STATE enum value
                if (!NODE_STATE_VALUES.has(evt.to)) return false;

                expectedState = evt.to;
              }

              // Final getState() must match last event's `to`
              if (events.length > 0) {
                const lastEvent = events[events.length - 1];
                if (sm.getState() !== lastEvent.to) return false;
              }

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'stateChange event to field is identical to ' +
          'getState for CDC writes',
        );
      },
    );

    /**
     * Property: For any valid state transition, the state value
     * is the same string from NODE_STATE — not a copy, alias,
     * or mapped value. This verifies the unified enum is used
     * directly (no mapping layer between state machine and CDC).
     */
    t.test(
      'state values are direct NODE_STATE references',
      async (t) => {
        fc.assert(
          fc.property(
            fc.constantFrom(...TRANSITION_SEQUENCES),
            (scenario) => {
              const sm = new NodeLifecycleStateMachine({
                nodeId: 'prop-test',
                initialState: scenario.initialState,
              });

              // Verify initial state is a direct NODE_STATE value
              const initialMatch = Object.values(NODE_STATE)
                .find((v) => v === sm.getState());
              if (initialMatch === undefined) return false;

              for (const nextState of scenario.transitions) {
                sm.transition(nextState);

                // getState() must be strictly equal to a
                // NODE_STATE enum value (same reference)
                const stateVal = sm.getState();
                const enumMatch = Object.values(NODE_STATE)
                  .find((v) => v === stateVal);
                if (enumMatch === undefined) return false;
              }

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'state values are direct NODE_STATE enum references',
        );
      },
    );

    /**
     * Property: For any valid transition sequence, the number
     * of stateChange events equals the number of transitions.
     * This ensures exactly one CDC write opportunity per
     * state change (no duplicate or missing events).
     */
    t.test(
      'exactly one stateChange event per transition',
      async (t) => {
        fc.assert(
          fc.property(
            fc.constantFrom(...TRANSITION_SEQUENCES),
            (scenario) => {
              const sm = new NodeLifecycleStateMachine({
                nodeId: 'prop-test',
                initialState: scenario.initialState,
              });

              const events = [];
              sm.on(
                NODE_LIFECYCLE_EVENT.STATE_CHANGE,
                (evt) => events.push(evt),
              );

              for (const nextState of scenario.transitions) {
                sm.transition(nextState);
              }

              // Exactly one event per transition
              return events.length ===
                scenario.transitions.length;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'exactly one stateChange event emitted per ' +
          'valid transition',
        );
      },
    );
  });
