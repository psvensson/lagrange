/**
 * Property Tests: Phase State Machine Transition Validation
 *
 * **Property 7: Phase State Machine Transition Validation**
 * *For any* state machine configuration and sequence of transitions:
 * - Invalid transitions (not in allowed list) must throw InvalidTransitionError
 * - Valid transitions must succeed and update current state
 * - State must match expected after valid transition
 *
 * **Validates: Requirements 4.5**
 *
 * Feature: code-clarity-maintainability, Property 7: Phase State Machine Transition Validation
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  InvalidTransitionError,
  PhaseStateMachine,
} from '../../src/utils/phase-state-machine.js';

/**
 * Predefined state machine configurations for testing.
 * Each configuration has known valid and invalid transitions.
 */
const STATE_MACHINE_CONFIGS = [
  {
    name: 'linear',
    transitions: {
      IDLE: ['RUNNING'],
      RUNNING: ['COMPLETE'],
      COMPLETE: [],
    },
    states: ['IDLE', 'RUNNING', 'COMPLETE'],
  },
  {
    name: 'branching',
    transitions: {
      IDLE: ['RUNNING'],
      RUNNING: ['PAUSED', 'COMPLETE'],
      PAUSED: ['RUNNING', 'COMPLETE'],
      COMPLETE: [],
    },
    states: ['IDLE', 'RUNNING', 'PAUSED', 'COMPLETE'],
  },
  {
    name: 'cyclic',
    transitions: {
      A: ['B', 'C'],
      B: ['A', 'C'],
      C: ['A'],
    },
    states: ['A', 'B', 'C'],
  },
  {
    name: 'complex',
    transitions: {
      INIT: ['VALIDATING'],
      VALIDATING: ['PROCESSING', 'FAILED'],
      PROCESSING: ['COMPLETE', 'FAILED'],
      COMPLETE: [],
      FAILED: [],
    },
    states: ['INIT', 'VALIDATING', 'PROCESSING', 'COMPLETE', 'FAILED'],
  },
  {
    name: 'single-state',
    transitions: {
      ONLY: [],
    },
    states: ['ONLY'],
  },
];

/**
 * Arbitrary for selecting a state machine configuration.
 */
const configArb = fc.constantFrom(...STATE_MACHINE_CONFIGS);

/**
 * Helper to get all valid transitions from a config.
 * @param {Object} config - State machine configuration.
 * @return {Array<{from: string, to: string}>} Array of valid transition pairs.
 */
function getValidTransitions(config) {
  const validTransitions = [];
  for (const [fromState, toStates] of Object.entries(config.transitions)) {
    for (const toState of toStates) {
      validTransitions.push({from: fromState, to: toState});
    }
  }
  return validTransitions;
}

/**
 * Helper to get all invalid transitions from a config.
 * @param {Object} config - State machine configuration.
 * @return {Array<{from: string, to: string}>} Array of invalid transition pairs.
 */
function getInvalidTransitions(config) {
  const invalidTransitions = [];
  for (const fromState of config.states) {
    const validTargets = config.transitions[fromState] || [];
    for (const toState of config.states) {
      if (!validTargets.includes(toState)) {
        invalidTransitions.push({from: fromState, to: toState});
      }
    }
  }
  return invalidTransitions;
}

test('Property 7: Phase State Machine Transition Validation', async (t) => {
  /**
   * Property: For any valid transition defined in the transitions map,
   * the transition SHALL succeed and update the current state.
   * **Validates: Requirements 4.5**
   */
  t.test('valid transitions succeed and update state', async (t) => {
    await fc.assert(
      fc.property(
        configArb,
        (config) => {
          const validTransitions = getValidTransitions(config);

          // Skip if no valid transitions exist
          if (validTransitions.length === 0) {
            return true;
          }

          // Test each valid transition from its source state
          for (const {from, to} of validTransitions) {
            const sm = new PhaseStateMachine({
              transitions: config.transitions,
              initialState: from,
            });

            // Transition should succeed
            sm.transition(to);

            // State should be updated
            if (sm.getCurrentState() !== to) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('valid transitions succeed and update state');
  });

  /**
   * Property: For any invalid transition (not in allowed list),
   * the transition SHALL throw InvalidTransitionError.
   * **Validates: Requirements 4.5**
   */
  t.test('invalid transitions throw InvalidTransitionError', async (t) => {
    await fc.assert(
      fc.property(
        configArb,
        (config) => {
          const invalidTransitions = getInvalidTransitions(config);

          // Skip if no invalid transitions exist
          if (invalidTransitions.length === 0) {
            return true;
          }

          // Test each invalid transition from its source state
          for (const {from, to} of invalidTransitions) {
            const sm = new PhaseStateMachine({
              transitions: config.transitions,
              initialState: from,
            });

            let threwCorrectError = false;
            try {
              sm.transition(to);
            } catch (error) {
              threwCorrectError = error instanceof InvalidTransitionError;
            }

            if (!threwCorrectError) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('invalid transitions throw InvalidTransitionError');
  });

  /**
   * Property: For any invalid transition, the state SHALL remain unchanged
   * after the error is thrown.
   * **Validates: Requirements 4.5**
   */
  t.test('state remains unchanged after invalid transition attempt', async (t) => {
    await fc.assert(
      fc.property(
        configArb,
        (config) => {
          const invalidTransitions = getInvalidTransitions(config);

          // Skip if no invalid transitions exist
          if (invalidTransitions.length === 0) {
            return true;
          }

          // Test that state is preserved after failed transition
          for (const {from, to} of invalidTransitions) {
            const sm = new PhaseStateMachine({
              transitions: config.transitions,
              initialState: from,
            });

            const stateBefore = sm.getCurrentState();

            try {
              sm.transition(to);
            } catch (_error) {
              // Expected to throw
            }

            // State should be unchanged
            if (sm.getCurrentState() !== stateBefore) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('state remains unchanged after invalid transition attempt');
  });

  /**
   * Property: canTransition() SHALL return true for valid transitions
   * and false for invalid transitions.
   * **Validates: Requirements 4.5**
   */
  t.test('canTransition correctly predicts transition validity', async (t) => {
    await fc.assert(
      fc.property(
        configArb,
        fc.constantFrom(...STATE_MACHINE_CONFIGS.flatMap((c) => c.states)),
        (config, initialState) => {
          // Skip if initialState is not in this config
          if (!config.states.includes(initialState)) {
            return true;
          }

          const sm = new PhaseStateMachine({
            transitions: config.transitions,
            initialState,
          });

          const validTargets = config.transitions[initialState] || [];

          // Check all states in this config
          for (const targetState of config.states) {
            const canTransitionResult = sm.canTransition(targetState);
            const isValid = validTargets.includes(targetState);

            if (canTransitionResult !== isValid) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('canTransition correctly predicts transition validity');
  });

  /**
   * Property: InvalidTransitionError SHALL contain correct metadata
   * (currentState, targetState, validTransitions).
   * **Validates: Requirements 4.5**
   */
  t.test('InvalidTransitionError contains correct metadata', async (t) => {
    await fc.assert(
      fc.property(
        configArb,
        (config) => {
          const invalidTransitions = getInvalidTransitions(config);

          // Skip if no invalid transitions exist
          if (invalidTransitions.length === 0) {
            return true;
          }

          // Test error metadata for each invalid transition
          for (const {from, to} of invalidTransitions) {
            const sm = new PhaseStateMachine({
              transitions: config.transitions,
              initialState: from,
            });

            try {
              sm.transition(to);
              // Should have thrown
              return false;
            } catch (error) {
              if (!(error instanceof InvalidTransitionError)) {
                return false;
              }

              // Verify error metadata
              if (error.currentState !== from) {
                return false;
              }
              if (error.targetState !== to) {
                return false;
              }

              const expectedValidTransitions = config.transitions[from] || [];
              const actualSorted = [...error.validTransitions].sort();
              const expectedSorted = [...expectedValidTransitions].sort();
              if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
                return false;
              }
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('InvalidTransitionError contains correct metadata');
  });

  /**
   * Property: For any sequence of valid transitions, the final state
   * SHALL match the last transition target.
   * **Validates: Requirements 4.5**
   */
  t.test('sequential valid transitions reach expected final state', async (t) => {
    await fc.assert(
      fc.property(
        configArb,
        fc.array(fc.integer({min: 0, max: 100}), {minLength: 1, maxLength: 5}),
        (config, indices) => {
          // Build a sequence of valid transitions
          const sequence = [];
          let currentState = config.states[0];

          for (const index of indices) {
            const validTargets = config.transitions[currentState] || [];
            if (validTargets.length === 0) {
              break;
            }
            const nextState = validTargets[index % validTargets.length];
            sequence.push({from: currentState, to: nextState});
            currentState = nextState;
          }

          // Skip if no valid sequence could be built
          if (sequence.length === 0) {
            return true;
          }

          const sm = new PhaseStateMachine({
            transitions: config.transitions,
            initialState: sequence[0].from,
          });

          // Execute all transitions
          for (const {to} of sequence) {
            sm.transition(to);
          }

          // Final state should match last transition target
          const expectedFinalState = sequence[sequence.length - 1].to;
          return sm.getCurrentState() === expectedFinalState;
        },
      ),
      {numRuns: 10},
    );

    t.pass('sequential valid transitions reach expected final state');
  });
});
