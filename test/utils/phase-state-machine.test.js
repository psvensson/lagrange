/**
 * Unit tests for PhaseStateMachine class.
 *
 * Tests the generic state machine for phase-based operations including:
 * - State transition validation
 * - Event emission on transitions
 * - Timing tracking
 * - Error handling for invalid transitions
 *
 * Requirements: 4.5
 */

import {test} from 'tap';
import {
  InvalidTransitionError,
  PhaseStateMachine,
  STATE_MACHINE_ERROR,
  STATE_MACHINE_EVENT,
} from '../../src/utils/phase-state-machine.js';

/**
 * Sample transitions for testing.
 */
const SAMPLE_TRANSITIONS = Object.freeze({
  IDLE: ['RUNNING'],
  RUNNING: ['PAUSED', 'COMPLETE'],
  PAUSED: ['RUNNING', 'COMPLETE'],
  COMPLETE: [],
});

test('STATE_MACHINE_EVENT constants', async (t) => {
  t.equal(STATE_MACHINE_EVENT.TRANSITION, 'transition', 'TRANSITION should be transition');
  t.equal(
    STATE_MACHINE_EVENT.STATE_ENTERED,
    'stateEntered',
    'STATE_ENTERED should be stateEntered',
  );
  t.equal(STATE_MACHINE_EVENT.STATE_EXITED, 'stateExited', 'STATE_EXITED should be stateExited');
});

test('STATE_MACHINE_ERROR constants', async (t) => {
  t.equal(
    STATE_MACHINE_ERROR.TRANSITIONS_REQUIRED,
    'transitions map is required',
    'TRANSITIONS_REQUIRED should have correct message',
  );
  t.equal(
    STATE_MACHINE_ERROR.INITIAL_STATE_REQUIRED,
    'initialState is required',
    'INITIAL_STATE_REQUIRED should have correct message',
  );

  // Test parameterized error messages
  const invalidMsg = STATE_MACHINE_ERROR.invalidTransition('A', 'B', ['C', 'D']);
  t.ok(
    invalidMsg.includes('Cannot transition from A to B'),
    'invalidTransition should include from/to states',
  );
  t.ok(
    invalidMsg.includes('C, D'),
    'invalidTransition should include valid transitions',
  );

  const unknownMsg = STATE_MACHINE_ERROR.unknownState('UNKNOWN');
  t.ok(
    unknownMsg.includes('Unknown state: UNKNOWN'),
    'unknownState should include state name',
  );
});

test('InvalidTransitionError', async (t) => {
  const error = new InvalidTransitionError('IDLE', 'COMPLETE', ['RUNNING']);

  t.equal(error.name, 'InvalidTransitionError', 'should have correct name');
  t.equal(error.currentState, 'IDLE', 'should have currentState');
  t.equal(error.targetState, 'COMPLETE', 'should have targetState');
  t.same(error.validTransitions, ['RUNNING'], 'should have validTransitions');
  t.ok(error.message.includes('IDLE'), 'message should include current state');
  t.ok(error.message.includes('COMPLETE'), 'message should include target state');
  t.ok(error.message.includes('RUNNING'), 'message should include valid transitions');
});

test('PhaseStateMachine constructor', async (t) => {
  await t.test('creates state machine with valid options', async (t) => {
    const sm = new PhaseStateMachine({
      transitions: SAMPLE_TRANSITIONS,
      initialState: 'IDLE',
    });

    t.equal(sm.getCurrentState(), 'IDLE', 'should set initial state');
  });

  await t.test('throws when transitions is missing', async (t) => {
    t.throws(
      () => new PhaseStateMachine({initialState: 'IDLE'}),
      {message: STATE_MACHINE_ERROR.TRANSITIONS_REQUIRED},
      'should throw for missing transitions',
    );
  });

  await t.test('throws when initialState is missing', async (t) => {
    t.throws(
      () => new PhaseStateMachine({transitions: SAMPLE_TRANSITIONS}),
      {message: STATE_MACHINE_ERROR.INITIAL_STATE_REQUIRED},
      'should throw for missing initialState',
    );
  });
});

test('PhaseStateMachine.getCurrentState()', async (t) => {
  const sm = new PhaseStateMachine({
    transitions: SAMPLE_TRANSITIONS,
    initialState: 'IDLE',
  });

  t.equal(sm.getCurrentState(), 'IDLE', 'should return initial state');

  sm.transition('RUNNING');
  t.equal(sm.getCurrentState(), 'RUNNING', 'should return updated state after transition');
});

test('PhaseStateMachine.getValidTransitions()', async (t) => {
  await t.test('returns valid transitions from current state', async (t) => {
    const sm = new PhaseStateMachine({
      transitions: SAMPLE_TRANSITIONS,
      initialState: 'IDLE',
    });

    t.same(sm.getValidTransitions(), ['RUNNING'], 'should return valid transitions from IDLE');
  });

  await t.test('returns multiple valid transitions', async (t) => {
    const sm = new PhaseStateMachine({
      transitions: SAMPLE_TRANSITIONS,
      initialState: 'RUNNING',
    });

    t.same(
      sm.getValidTransitions(),
      ['PAUSED', 'COMPLETE'],
      'should return multiple valid transitions from RUNNING',
    );
  });

  await t.test('returns empty array for terminal state', async (t) => {
    const sm = new PhaseStateMachine({
      transitions: SAMPLE_TRANSITIONS,
      initialState: 'COMPLETE',
    });

    t.same(sm.getValidTransitions(), [], 'should return empty array for COMPLETE');
  });
});

test('PhaseStateMachine.canTransition()', async (t) => {
  const sm = new PhaseStateMachine({
    transitions: SAMPLE_TRANSITIONS,
    initialState: 'IDLE',
  });

  t.equal(sm.canTransition('RUNNING'), true, 'should return true for valid transition');
  t.equal(sm.canTransition('COMPLETE'), false, 'should return false for invalid transition');
  t.equal(sm.canTransition('PAUSED'), false, 'should return false for unreachable state');
});

test('PhaseStateMachine.transition() - valid transitions', async (t) => {
  await t.test('valid transition succeeds', async (t) => {
    const sm = new PhaseStateMachine({
      transitions: SAMPLE_TRANSITIONS,
      initialState: 'IDLE',
    });

    sm.transition('RUNNING');
    t.equal(sm.getCurrentState(), 'RUNNING', 'should transition to RUNNING');
  });

  await t.test('multiple sequential transitions succeed', async (t) => {
    const sm = new PhaseStateMachine({
      transitions: SAMPLE_TRANSITIONS,
      initialState: 'IDLE',
    });

    sm.transition('RUNNING');
    sm.transition('PAUSED');
    sm.transition('RUNNING');
    sm.transition('COMPLETE');

    t.equal(sm.getCurrentState(), 'COMPLETE', 'should reach COMPLETE state');
  });
});

test('PhaseStateMachine.transition() - invalid transitions', async (t) => {
  await t.test('invalid transition throws InvalidTransitionError', async (t) => {
    const sm = new PhaseStateMachine({
      transitions: SAMPLE_TRANSITIONS,
      initialState: 'IDLE',
    });

    t.throws(
      () => sm.transition('COMPLETE'),
      InvalidTransitionError,
      'should throw InvalidTransitionError',
    );
  });

  await t.test('error contains correct information', async (t) => {
    const sm = new PhaseStateMachine({
      transitions: SAMPLE_TRANSITIONS,
      initialState: 'IDLE',
    });

    try {
      sm.transition('COMPLETE');
      t.fail('should have thrown');
    } catch (error) {
      t.equal(error.name, 'InvalidTransitionError', 'should be InvalidTransitionError');
      t.equal(error.currentState, 'IDLE', 'should have correct currentState');
      t.equal(error.targetState, 'COMPLETE', 'should have correct targetState');
      t.same(error.validTransitions, ['RUNNING'], 'should have correct validTransitions');
    }
  });

  await t.test('transition from terminal state throws', async (t) => {
    const sm = new PhaseStateMachine({
      transitions: SAMPLE_TRANSITIONS,
      initialState: 'COMPLETE',
    });

    t.throws(
      () => sm.transition('IDLE'),
      InvalidTransitionError,
      'should throw for transition from terminal state',
    );
  });
});

test('PhaseStateMachine - Event Emission', async (t) => {
  await t.test('emits transition event on transition', async (t) => {
    const sm = new PhaseStateMachine({
      transitions: SAMPLE_TRANSITIONS,
      initialState: 'IDLE',
    });
    let eventData = null;

    sm.on(STATE_MACHINE_EVENT.TRANSITION, (data) => {
      eventData = data;
    });

    sm.transition('RUNNING');

    t.ok(eventData, 'should emit transition event');
    t.equal(eventData.fromState, 'IDLE', 'should have correct fromState');
    t.equal(eventData.toState, 'RUNNING', 'should have correct toState');
    t.type(eventData.duration, 'number', 'should have duration');
  });

  await t.test('emits stateEntered event on transition', async (t) => {
    const sm = new PhaseStateMachine({
      transitions: SAMPLE_TRANSITIONS,
      initialState: 'IDLE',
    });
    let eventData = null;

    sm.on(STATE_MACHINE_EVENT.STATE_ENTERED, (data) => {
      eventData = data;
    });

    sm.transition('RUNNING');

    t.ok(eventData, 'should emit stateEntered event');
    t.equal(eventData.state, 'RUNNING', 'should have correct state');
    t.equal(eventData.previousState, 'IDLE', 'should have correct previousState');
  });

  await t.test('emits stateExited event on transition', async (t) => {
    const sm = new PhaseStateMachine({
      transitions: SAMPLE_TRANSITIONS,
      initialState: 'IDLE',
    });
    let eventData = null;

    sm.on(STATE_MACHINE_EVENT.STATE_EXITED, (data) => {
      eventData = data;
    });

    sm.transition('RUNNING');

    t.ok(eventData, 'should emit stateExited event');
    t.equal(eventData.state, 'IDLE', 'should have correct state');
    t.type(eventData.duration, 'number', 'should have duration');
  });

  await t.test('events are emitted in correct order', async (t) => {
    const sm = new PhaseStateMachine({
      transitions: SAMPLE_TRANSITIONS,
      initialState: 'IDLE',
    });
    const events = [];

    sm.on(STATE_MACHINE_EVENT.STATE_EXITED, () => events.push('exited'));
    sm.on(STATE_MACHINE_EVENT.STATE_ENTERED, () => events.push('entered'));
    sm.on(STATE_MACHINE_EVENT.TRANSITION, () => events.push('transition'));

    sm.transition('RUNNING');

    t.same(events, ['exited', 'entered', 'transition'], 'should emit events in correct order');
  });
});

test('PhaseStateMachine - State Duration Tracking', async (t) => {
  await t.test('getStateDuration returns null for current state', async (t) => {
    const sm = new PhaseStateMachine({
      transitions: SAMPLE_TRANSITIONS,
      initialState: 'IDLE',
    });

    t.equal(sm.getStateDuration('IDLE'), null, 'should return null for current state');
  });

  await t.test('getStateDuration returns duration for completed state', async (t) => {
    const sm = new PhaseStateMachine({
      transitions: SAMPLE_TRANSITIONS,
      initialState: 'IDLE',
    });

    sm.transition('RUNNING');

    const duration = sm.getStateDuration('IDLE');
    t.type(duration, 'number', 'should return a number');
    t.ok(duration >= 0, 'should be non-negative');
  });

  await t.test('getStateDuration returns null for unknown state', async (t) => {
    const sm = new PhaseStateMachine({
      transitions: SAMPLE_TRANSITIONS,
      initialState: 'IDLE',
    });

    t.equal(sm.getStateDuration('UNKNOWN'), null, 'should return null for unknown state');
  });

  await t.test('getAllStateDurations returns all completed state durations', async (t) => {
    const sm = new PhaseStateMachine({
      transitions: SAMPLE_TRANSITIONS,
      initialState: 'IDLE',
    });

    sm.transition('RUNNING');
    sm.transition('PAUSED');

    const durations = sm.getAllStateDurations();

    t.ok('IDLE' in durations, 'should have IDLE duration');
    t.ok('RUNNING' in durations, 'should have RUNNING duration');
    t.notOk('PAUSED' in durations, 'should not have PAUSED duration (current state)');
  });
});

test('PhaseStateMachine.isTerminal()', async (t) => {
  await t.test('returns false for non-terminal state', async (t) => {
    const sm = new PhaseStateMachine({
      transitions: SAMPLE_TRANSITIONS,
      initialState: 'IDLE',
    });

    t.equal(sm.isTerminal(), false, 'should return false for IDLE');
  });

  await t.test('returns true for terminal state', async (t) => {
    const sm = new PhaseStateMachine({
      transitions: SAMPLE_TRANSITIONS,
      initialState: 'COMPLETE',
    });

    t.equal(sm.isTerminal(), true, 'should return true for COMPLETE');
  });
});

test('PhaseStateMachine.getAllStates()', async (t) => {
  const sm = new PhaseStateMachine({
    transitions: SAMPLE_TRANSITIONS,
    initialState: 'IDLE',
  });

  const states = sm.getAllStates();

  t.same(
    states.sort(),
    ['COMPLETE', 'IDLE', 'PAUSED', 'RUNNING'],
    'should return all defined states',
  );
});

test('PhaseStateMachine is an EventEmitter', async (t) => {
  const sm = new PhaseStateMachine({
    transitions: SAMPLE_TRANSITIONS,
    initialState: 'IDLE',
  });

  t.ok(typeof sm.on === 'function', 'should have on method');
  t.ok(typeof sm.emit === 'function', 'should have emit method');
  t.ok(typeof sm.removeListener === 'function', 'should have removeListener method');
});
