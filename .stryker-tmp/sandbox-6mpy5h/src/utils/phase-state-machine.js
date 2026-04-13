/**
 * PhaseStateMachine - Generic state machine for phase-based operations.
 *
 * Provides a reusable pattern for multi-step operations with:
 * - Configurable state transitions
 * - Transition validation
 * - Event emission on state changes
 * - Timing tracking for observability
 *
 * Requirements: 4.5
 *
 * @module utils/phase-state-machine
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { EventEmitter } from 'events';

/**
 * Event names emitted by the phase state machine.
 * @type {Object}
 */
const STATE_MACHINE_EVENT = Object.freeze(stryMutAct_9fa48("160230") ? {} : (stryCov_9fa48("160230"), {
  TRANSITION: stryMutAct_9fa48("160231") ? "" : (stryCov_9fa48("160231"), 'transition'),
  STATE_ENTERED: stryMutAct_9fa48("160232") ? "" : (stryCov_9fa48("160232"), 'stateEntered'),
  STATE_EXITED: stryMutAct_9fa48("160233") ? "" : (stryCov_9fa48("160233"), 'stateExited')
}));

/**
 * Error messages for PhaseStateMachine.
 * @type {Object}
 */
const STATE_MACHINE_ERROR = Object.freeze(stryMutAct_9fa48("160234") ? {} : (stryCov_9fa48("160234"), {
  TRANSITIONS_REQUIRED: stryMutAct_9fa48("160235") ? "" : (stryCov_9fa48("160235"), 'transitions map is required'),
  INITIAL_STATE_REQUIRED: stryMutAct_9fa48("160236") ? "" : (stryCov_9fa48("160236"), 'initialState is required'),
  invalidTransition: stryMutAct_9fa48("160237") ? () => undefined : (stryCov_9fa48("160237"), (currentState, targetState, validStates) => (stryMutAct_9fa48("160238") ? `` : (stryCov_9fa48("160238"), `Cannot transition from ${currentState} to ${targetState}. `)) + (stryMutAct_9fa48("160239") ? `` : (stryCov_9fa48("160239"), `Valid transitions: ${(stryMutAct_9fa48("160243") ? validStates.length <= 0 : stryMutAct_9fa48("160242") ? validStates.length >= 0 : stryMutAct_9fa48("160241") ? false : stryMutAct_9fa48("160240") ? true : (stryCov_9fa48("160240", "160241", "160242", "160243"), validStates.length > 0)) ? validStates.join(stryMutAct_9fa48("160244") ? "" : (stryCov_9fa48("160244"), ', ')) : stryMutAct_9fa48("160245") ? "" : (stryCov_9fa48("160245"), 'none')}`))),
  unknownState: stryMutAct_9fa48("160246") ? () => undefined : (stryCov_9fa48("160246"), state => stryMutAct_9fa48("160247") ? `` : (stryCov_9fa48("160247"), `Unknown state: ${state}`))
}));

/**
 * Error thrown when an invalid state transition is attempted.
 * @extends Error
 */
class InvalidTransitionError extends Error {
  /**
   * Create an InvalidTransitionError.
   * @param {string} currentState - Current state name.
   * @param {string} targetState - Target state that was attempted.
   * @param {Array<string>} validTransitions - Array of valid target states.
   */
  constructor(currentState, targetState, validTransitions) {
    if (stryMutAct_9fa48("160248")) {
      {}
    } else {
      stryCov_9fa48("160248");
      super(STATE_MACHINE_ERROR.invalidTransition(currentState, targetState, validTransitions));
      this.name = stryMutAct_9fa48("160249") ? "" : (stryCov_9fa48("160249"), 'InvalidTransitionError');
      this.currentState = currentState;
      this.targetState = targetState;
      this.validTransitions = validTransitions;
    }
  }
}

/**
 * Generic phase state machine.
 * Enforces valid state transitions and tracks timing.
 *
 * @extends EventEmitter
 * @fires PhaseStateMachine#transition - When a state transition occurs
 * @fires PhaseStateMachine#stateEntered - When entering a new state
 * @fires PhaseStateMachine#stateExited - When exiting a state
 */
class PhaseStateMachine extends EventEmitter {
  /**
   * Create a new PhaseStateMachine.
   *
   * @param {Object} options - Configuration options.
   * @param {Object} options.transitions - Map of state to valid target states.
   *   Each key is a state name, value is array of valid target states.
   * @param {string} options.initialState - Starting state.
   * @throws {Error} If transitions or initialState is not provided.
   *
   * @example
   * const machine = new PhaseStateMachine({
   *   transitions: {
   *     IDLE: ['RUNNING'],
   *     RUNNING: ['PAUSED', 'COMPLETE'],
   *     PAUSED: ['RUNNING', 'COMPLETE'],
   *     COMPLETE: [],
   *   },
   *   initialState: 'IDLE',
   * });
   */
  constructor({
    transitions,
    initialState
  }) {
    if (stryMutAct_9fa48("160250")) {
      {}
    } else {
      stryCov_9fa48("160250");
      super();
      if (stryMutAct_9fa48("160253") ? false : stryMutAct_9fa48("160252") ? true : stryMutAct_9fa48("160251") ? transitions : (stryCov_9fa48("160251", "160252", "160253"), !transitions)) {
        if (stryMutAct_9fa48("160254")) {
          {}
        } else {
          stryCov_9fa48("160254");
          throw new Error(STATE_MACHINE_ERROR.TRANSITIONS_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("160257") ? false : stryMutAct_9fa48("160256") ? true : stryMutAct_9fa48("160255") ? initialState : (stryCov_9fa48("160255", "160256", "160257"), !initialState)) {
        if (stryMutAct_9fa48("160258")) {
          {}
        } else {
          stryCov_9fa48("160258");
          throw new Error(STATE_MACHINE_ERROR.INITIAL_STATE_REQUIRED);
        }
      }
      this._transitions = transitions;
      this._currentState = initialState;
      this._stateDurations = new Map();
      this._stateStartTimes = new Map();

      // Record start time for initial state
      this._stateStartTimes.set(this._currentState, Date.now());
    }
  }

  /**
   * Transition to a new state.
   *
   * @param {string} targetState - State to transition to.
   * @throws {InvalidTransitionError} If transition is invalid.
   * @return {void}
   */
  transition(targetState) {
    if (stryMutAct_9fa48("160259")) {
      {}
    } else {
      stryCov_9fa48("160259");
      const currentState = this._currentState;
      const validTransitions = stryMutAct_9fa48("160262") ? this._transitions[currentState] && [] : stryMutAct_9fa48("160261") ? false : stryMutAct_9fa48("160260") ? true : (stryCov_9fa48("160260", "160261", "160262"), this._transitions[currentState] || (stryMutAct_9fa48("160263") ? ["Stryker was here"] : (stryCov_9fa48("160263"), [])));
      if (stryMutAct_9fa48("160266") ? false : stryMutAct_9fa48("160265") ? true : stryMutAct_9fa48("160264") ? validTransitions.includes(targetState) : (stryCov_9fa48("160264", "160265", "160266"), !validTransitions.includes(targetState))) {
        if (stryMutAct_9fa48("160267")) {
          {}
        } else {
          stryCov_9fa48("160267");
          throw new InvalidTransitionError(currentState, targetState, validTransitions);
        }
      }

      // Record duration for the state we're leaving
      const startTime = this._stateStartTimes.get(currentState);
      if (stryMutAct_9fa48("160270") ? startTime === undefined : stryMutAct_9fa48("160269") ? false : stryMutAct_9fa48("160268") ? true : (stryCov_9fa48("160268", "160269", "160270"), startTime !== undefined)) {
        if (stryMutAct_9fa48("160271")) {
          {}
        } else {
          stryCov_9fa48("160271");
          const duration = stryMutAct_9fa48("160272") ? Date.now() + startTime : (stryCov_9fa48("160272"), Date.now() - startTime);
          this._stateDurations.set(currentState, duration);
        }
      }

      // Update current state
      this._currentState = targetState;

      // Record start time for new state
      this._stateStartTimes.set(targetState, Date.now());

      // Emit events
      this.emit(STATE_MACHINE_EVENT.STATE_EXITED, stryMutAct_9fa48("160273") ? {} : (stryCov_9fa48("160273"), {
        state: currentState,
        duration: this._stateDurations.get(currentState)
      }));
      this.emit(STATE_MACHINE_EVENT.STATE_ENTERED, stryMutAct_9fa48("160274") ? {} : (stryCov_9fa48("160274"), {
        state: targetState,
        previousState: currentState
      }));
      this.emit(STATE_MACHINE_EVENT.TRANSITION, stryMutAct_9fa48("160275") ? {} : (stryCov_9fa48("160275"), {
        fromState: currentState,
        toState: targetState,
        duration: this._stateDurations.get(currentState)
      }));
    }
  }

  /**
   * Check if a transition to the target state is valid.
   *
   * @param {string} targetState - State to check.
   * @return {boolean} True if transition is valid.
   */
  canTransition(targetState) {
    if (stryMutAct_9fa48("160276")) {
      {}
    } else {
      stryCov_9fa48("160276");
      const validTransitions = stryMutAct_9fa48("160279") ? this._transitions[this._currentState] && [] : stryMutAct_9fa48("160278") ? false : stryMutAct_9fa48("160277") ? true : (stryCov_9fa48("160277", "160278", "160279"), this._transitions[this._currentState] || (stryMutAct_9fa48("160280") ? ["Stryker was here"] : (stryCov_9fa48("160280"), [])));
      return validTransitions.includes(targetState);
    }
  }

  /**
   * Get current state.
   *
   * @return {string} Current state.
   */
  getCurrentState() {
    if (stryMutAct_9fa48("160281")) {
      {}
    } else {
      stryCov_9fa48("160281");
      return this._currentState;
    }
  }

  /**
   * Get valid next states from current state.
   *
   * @return {Array<string>} Valid target states.
   */
  getValidTransitions() {
    if (stryMutAct_9fa48("160282")) {
      {}
    } else {
      stryCov_9fa48("160282");
      return stryMutAct_9fa48("160285") ? this._transitions[this._currentState] && [] : stryMutAct_9fa48("160284") ? false : stryMutAct_9fa48("160283") ? true : (stryCov_9fa48("160283", "160284", "160285"), this._transitions[this._currentState] || (stryMutAct_9fa48("160286") ? ["Stryker was here"] : (stryCov_9fa48("160286"), [])));
    }
  }

  /**
   * Get duration of a completed state.
   *
   * @param {string} state - State name.
   * @return {number|null} Duration in ms or null if not completed.
   */
  getStateDuration(state) {
    if (stryMutAct_9fa48("160287")) {
      {}
    } else {
      stryCov_9fa48("160287");
      const duration = this._stateDurations.get(state);
      return (stryMutAct_9fa48("160290") ? duration === undefined : stryMutAct_9fa48("160289") ? false : stryMutAct_9fa48("160288") ? true : (stryCov_9fa48("160288", "160289", "160290"), duration !== undefined)) ? duration : null;
    }
  }

  /**
   * Get all completed state durations.
   *
   * @return {Object} Map of state names to durations in ms.
   */
  getAllStateDurations() {
    if (stryMutAct_9fa48("160291")) {
      {}
    } else {
      stryCov_9fa48("160291");
      const durations = {};
      for (const [state, duration] of this._stateDurations) {
        if (stryMutAct_9fa48("160292")) {
          {}
        } else {
          stryCov_9fa48("160292");
          durations[state] = duration;
        }
      }
      return durations;
    }
  }

  /**
   * Check if the state machine is in a terminal state (no valid transitions).
   *
   * @return {boolean} True if in terminal state.
   */
  isTerminal() {
    if (stryMutAct_9fa48("160293")) {
      {}
    } else {
      stryCov_9fa48("160293");
      const validTransitions = stryMutAct_9fa48("160296") ? this._transitions[this._currentState] && [] : stryMutAct_9fa48("160295") ? false : stryMutAct_9fa48("160294") ? true : (stryCov_9fa48("160294", "160295", "160296"), this._transitions[this._currentState] || (stryMutAct_9fa48("160297") ? ["Stryker was here"] : (stryCov_9fa48("160297"), [])));
      return stryMutAct_9fa48("160300") ? validTransitions.length !== 0 : stryMutAct_9fa48("160299") ? false : stryMutAct_9fa48("160298") ? true : (stryCov_9fa48("160298", "160299", "160300"), validTransitions.length === 0);
    }
  }

  /**
   * Get all defined states in the state machine.
   *
   * @return {Array<string>} Array of all state names.
   */
  getAllStates() {
    if (stryMutAct_9fa48("160301")) {
      {}
    } else {
      stryCov_9fa48("160301");
      return Object.keys(this._transitions);
    }
  }
}
export { InvalidTransitionError, PhaseStateMachine, STATE_MACHINE_ERROR, STATE_MACHINE_EVENT };