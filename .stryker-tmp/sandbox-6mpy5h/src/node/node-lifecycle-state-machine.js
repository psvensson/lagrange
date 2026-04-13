/**
 * Node Lifecycle State Machine - Manages explicit node lifecycle states.
 * Provides a formal state machine with enforced transitions for node lifecycle.
 * Requirements: 2.1, 2.2, 2.3, 2.4
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
import { LoggingService } from '../logging/logging-service.js';
import { STRING, TYPEOF } from '../constants/index.js';
import { NODE_LIFECYCLE_DIAGNOSTIC_CODE, NODE_LIFECYCLE_SUBSYSTEM, NODE_LIFECYCLE_EVENT, NODE_LIFECYCLE_LOG_MSG, NODE_LIFECYCLE_ERROR_NAME, NODE_LIFECYCLE_ERROR_MSG } from './node-constants.js';
import { NODE_LIFECYCLE_DEFAULT_OPTIONS, NODE_LIFECYCLE_NO_SUB_PHASE, NODE_LIFECYCLE_NOW, NODE_LIFECYCLE_STATE, NODE_LIFECYCLE_TERMINAL_SUB_PHASE_ADVANCE, NODE_LIFECYCLE_SUB_PHASE_ROOT, NODE_LIFECYCLE_VALID_SUB_PHASES, NODE_LIFECYCLE_VALID_SUB_PHASE_TRANSITIONS, NODE_LIFECYCLE_VALID_TRANSITIONS } from './node-lifecycle-state-machine-constants.js';
const NodeState = NODE_LIFECYCLE_STATE;
const VALID_TRANSITIONS = NODE_LIFECYCLE_VALID_TRANSITIONS;
const VALID_SUB_PHASES = NODE_LIFECYCLE_VALID_SUB_PHASES;
const VALID_SUB_PHASE_TRANSITIONS = NODE_LIFECYCLE_VALID_SUB_PHASE_TRANSITIONS;
const TERMINAL_SUB_PHASE_ADVANCE = NODE_LIFECYCLE_TERMINAL_SUB_PHASE_ADVANCE;

/**
 * @typedef {Record<string, number>} NodeLifecycleSubPhaseDurations
 */

/**
 * Error thrown when an invalid state transition is attempted.
 */
class InvalidTransitionError extends Error {
  /**
   * Create an InvalidTransitionError.
   * @param {string} currentState - The current state.
   * @param {string} attemptedState - The attempted target state.
  * @param {string[]} validTransitions - Valid transitions from current state.
  */
  constructor(currentState, attemptedState, validTransitions) {
    if (stryMutAct_9fa48("92900")) {
      {}
    } else {
      stryCov_9fa48("92900");
      super(NODE_LIFECYCLE_ERROR_MSG.invalidTransition(currentState, attemptedState, validTransitions));
      this.name = NODE_LIFECYCLE_ERROR_NAME.INVALID_TRANSITION;
      this.currentState = currentState;
      this.attemptedState = attemptedState;
      this.validTransitions = validTransitions;
    }
  }
}

/**
 * NodeLifecycleStateMachine - Manages explicit node lifecycle states.
 * Enforces valid transitions and emits events for all state changes.
 */
class NodeLifecycleStateMachine extends EventEmitter {
  /**
   * Create a new NodeLifecycleStateMachine.
   * @param {Object} options - Configuration options.
   * @param {string} [options.nodeId] - Node ID for logging context.
   * @param {string} [options.initialState] - Initial state (defaults to STARTING).
   */
  constructor(options = NODE_LIFECYCLE_DEFAULT_OPTIONS) {
    if (stryMutAct_9fa48("92901")) {
      {}
    } else {
      stryCov_9fa48("92901");
      super();
      this.nodeId = stryMutAct_9fa48("92904") ? options.nodeId && STRING.UNKNOWN : stryMutAct_9fa48("92903") ? false : stryMutAct_9fa48("92902") ? true : (stryCov_9fa48("92902", "92903", "92904"), options.nodeId || STRING.UNKNOWN);
      this.now = (stryMutAct_9fa48("92907") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("92906") ? false : stryMutAct_9fa48("92905") ? true : (stryCov_9fa48("92905", "92906", "92907"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : NODE_LIFECYCLE_NOW;

      // Initialize state to STARTING by default
      this.state = stryMutAct_9fa48("92910") ? options.initialState && NodeState.STARTING : stryMutAct_9fa48("92909") ? false : stryMutAct_9fa48("92908") ? true : (stryCov_9fa48("92908", "92909", "92910"), options.initialState || NodeState.STARTING);
      this.subPhase = NODE_LIFECYCLE_NO_SUB_PHASE;

      // Sub-phase duration tracking
      this._subPhaseDurations = new Map();
      this._subPhaseStartTimes = new Map();

      // Set up subsystem logger
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.forSubsystem(NODE_LIFECYCLE_SUBSYSTEM);
    }
  }

  /**
   * Get current state.
   * @return {string} The current node state.
   */
  getState() {
    if (stryMutAct_9fa48("92911")) {
      {}
    } else {
      stryCov_9fa48("92911");
      return this.state;
    }
  }

  /**
   * Get current sub-phase.
   * @return {string|null} Current sub-phase.
   */
  getSubPhase() {
    if (stryMutAct_9fa48("92912")) {
      {}
    } else {
      stryCov_9fa48("92912");
      return this.subPhase;
    }
  }

  /**
   * Get duration of a completed sub-phase.
   * @param {string} subPhase - Sub-phase name.
   * @return {number|null} Duration in ms or null if not completed.
   */
  getSubPhaseDuration(subPhase) {
    if (stryMutAct_9fa48("92913")) {
      {}
    } else {
      stryCov_9fa48("92913");
      const duration = this._subPhaseDurations.get(subPhase);
      return (stryMutAct_9fa48("92916") ? duration === undefined : stryMutAct_9fa48("92915") ? false : stryMutAct_9fa48("92914") ? true : (stryCov_9fa48("92914", "92915", "92916"), duration !== undefined)) ? duration : null;
    }
  }

  /**
   * Get all completed sub-phase durations.
   * @return {NodeLifecycleSubPhaseDurations} Map of sub-phase names to durations in ms.
   */
  getAllSubPhaseDurations() {
    if (stryMutAct_9fa48("92917")) {
      {}
    } else {
      stryCov_9fa48("92917");
      const durations = {};
      for (const [subPhase, duration] of this._subPhaseDurations) {
        if (stryMutAct_9fa48("92918")) {
          {}
        } else {
          stryCov_9fa48("92918");
          durations[subPhase] = duration;
        }
      }
      return durations;
    }
  }

  /**
   * Check if a transition is valid.
   * @param {string} fromState - Current state.
   * @param {string} toState - Target state.
   * @return {boolean} True if transition is valid.
   */
  isValidTransition(fromState, toState) {
    if (stryMutAct_9fa48("92919")) {
      {}
    } else {
      stryCov_9fa48("92919");
      const validNextStates = VALID_TRANSITIONS[fromState];

      // If fromState is not in the map, it's invalid
      if (stryMutAct_9fa48("92922") ? validNextStates !== undefined : stryMutAct_9fa48("92921") ? false : stryMutAct_9fa48("92920") ? true : (stryCov_9fa48("92920", "92921", "92922"), validNextStates === undefined)) {
        if (stryMutAct_9fa48("92923")) {
          {}
        } else {
          stryCov_9fa48("92923");
          return stryMutAct_9fa48("92924") ? true : (stryCov_9fa48("92924"), false);
        }
      }
      return validNextStates.includes(toState);
    }
  }

  /**
   * Attempt to transition to a new state.
   * @param {string} newState - Target state.
   * @return {boolean} True if transition succeeded.
   * @emits NODE_LIFECYCLE_EVENT.STATE_CHANGE with {from, to, timestamp}
   */
  transition(newState) {
    if (stryMutAct_9fa48("92925")) {
      {}
    } else {
      stryCov_9fa48("92925");
      const currentState = this.state;
      if (stryMutAct_9fa48("92928") ? currentState === NodeState.READY || newState === NodeState.READY : stryMutAct_9fa48("92927") ? false : stryMutAct_9fa48("92926") ? true : (stryCov_9fa48("92926", "92927", "92928"), (stryMutAct_9fa48("92930") ? currentState !== NodeState.READY : stryMutAct_9fa48("92929") ? true : (stryCov_9fa48("92929", "92930"), currentState === NodeState.READY)) && (stryMutAct_9fa48("92932") ? newState !== NodeState.READY : stryMutAct_9fa48("92931") ? true : (stryCov_9fa48("92931", "92932"), newState === NodeState.READY)))) {
        if (stryMutAct_9fa48("92933")) {
          {}
        } else {
          stryCov_9fa48("92933");
          return stryMutAct_9fa48("92934") ? false : (stryCov_9fa48("92934"), true);
        }
      }

      // Validate transition
      if (stryMutAct_9fa48("92937") ? false : stryMutAct_9fa48("92936") ? true : stryMutAct_9fa48("92935") ? this.isValidTransition(currentState, newState) : (stryCov_9fa48("92935", "92936", "92937"), !this.isValidTransition(currentState, newState))) {
        if (stryMutAct_9fa48("92938")) {
          {}
        } else {
          stryCov_9fa48("92938");
          const validTransitions = stryMutAct_9fa48("92941") ? VALID_TRANSITIONS[currentState] && [] : stryMutAct_9fa48("92940") ? false : stryMutAct_9fa48("92939") ? true : (stryCov_9fa48("92939", "92940", "92941"), VALID_TRANSITIONS[currentState] || (stryMutAct_9fa48("92942") ? ["Stryker was here"] : (stryCov_9fa48("92942"), [])));
          this.logger.error(NODE_LIFECYCLE_LOG_MSG.INVALID_TRANSITION_ATTEMPT, stryMutAct_9fa48("92943") ? {} : (stryCov_9fa48("92943"), {
            nodeId: this.nodeId,
            currentState,
            attemptedState: newState,
            validTransitions
          }));
          this.emit(NODE_LIFECYCLE_EVENT.TRANSITION_ERROR, stryMutAct_9fa48("92944") ? {} : (stryCov_9fa48("92944"), {
            code: NODE_LIFECYCLE_DIAGNOSTIC_CODE.INVALID_TRANSITION,
            nodeId: this.nodeId,
            currentState,
            attemptedState: newState,
            validTransitions
          }));
          return stryMutAct_9fa48("92945") ? true : (stryCov_9fa48("92945"), false);
        }
      }
      const timestamp = this.now();
      const previousState = currentState;

      // Update state
      this.state = newState;
      this.subPhase = NODE_LIFECYCLE_NO_SUB_PHASE;
      this.logger.info(NODE_LIFECYCLE_LOG_MSG.STATE_TRANSITION, stryMutAct_9fa48("92946") ? {} : (stryCov_9fa48("92946"), {
        nodeId: this.nodeId,
        from: previousState,
        to: newState,
        timestamp
      }));

      // Emit state change event
      this.emit(NODE_LIFECYCLE_EVENT.STATE_CHANGE, stryMutAct_9fa48("92947") ? {} : (stryCov_9fa48("92947"), {
        from: previousState,
        to: newState,
        timestamp
      }));
      return stryMutAct_9fa48("92948") ? false : (stryCov_9fa48("92948"), true);
    }
  }

  /**
   * Transition the lifecycle sub-phase for STARTING/JOINING states.
   * Terminal sub-phases auto-advance the parent state.
   * @param {string} newSubPhase - Target sub-phase.
   * @return {boolean} True when transition succeeded.
   */
  transitionSubPhase(newSubPhase) {
    if (stryMutAct_9fa48("92949")) {
      {}
    } else {
      stryCov_9fa48("92949");
      const parentState = this.state;
      const validSubPhases = VALID_SUB_PHASES[parentState];
      if (stryMutAct_9fa48("92952") ? !validSubPhases && !validSubPhases.includes(newSubPhase) : stryMutAct_9fa48("92951") ? false : stryMutAct_9fa48("92950") ? true : (stryCov_9fa48("92950", "92951", "92952"), (stryMutAct_9fa48("92953") ? validSubPhases : (stryCov_9fa48("92953"), !validSubPhases)) || (stryMutAct_9fa48("92954") ? validSubPhases.includes(newSubPhase) : (stryCov_9fa48("92954"), !validSubPhases.includes(newSubPhase))))) {
        if (stryMutAct_9fa48("92955")) {
          {}
        } else {
          stryCov_9fa48("92955");
          return stryMutAct_9fa48("92956") ? true : (stryCov_9fa48("92956"), false);
        }
      }
      const fromSubPhase = this.subPhase;
      const fromKey = (stryMutAct_9fa48("92959") ? fromSubPhase !== NODE_LIFECYCLE_NO_SUB_PHASE : stryMutAct_9fa48("92958") ? false : stryMutAct_9fa48("92957") ? true : (stryCov_9fa48("92957", "92958", "92959"), fromSubPhase === NODE_LIFECYCLE_NO_SUB_PHASE)) ? NODE_LIFECYCLE_SUB_PHASE_ROOT : fromSubPhase;
      const validNextSubPhases = stryMutAct_9fa48("92962") ? VALID_SUB_PHASE_TRANSITIONS[fromKey] && [] : stryMutAct_9fa48("92961") ? false : stryMutAct_9fa48("92960") ? true : (stryCov_9fa48("92960", "92961", "92962"), VALID_SUB_PHASE_TRANSITIONS[fromKey] || (stryMutAct_9fa48("92963") ? ["Stryker was here"] : (stryCov_9fa48("92963"), [])));
      if (stryMutAct_9fa48("92966") ? false : stryMutAct_9fa48("92965") ? true : stryMutAct_9fa48("92964") ? validNextSubPhases.includes(newSubPhase) : (stryCov_9fa48("92964", "92965", "92966"), !validNextSubPhases.includes(newSubPhase))) {
        if (stryMutAct_9fa48("92967")) {
          {}
        } else {
          stryCov_9fa48("92967");
          return stryMutAct_9fa48("92968") ? true : (stryCov_9fa48("92968"), false);
        }
      }

      // Record duration for the sub-phase we're leaving
      if (stryMutAct_9fa48("92971") ? fromSubPhase === NODE_LIFECYCLE_NO_SUB_PHASE : stryMutAct_9fa48("92970") ? false : stryMutAct_9fa48("92969") ? true : (stryCov_9fa48("92969", "92970", "92971"), fromSubPhase !== NODE_LIFECYCLE_NO_SUB_PHASE)) {
        if (stryMutAct_9fa48("92972")) {
          {}
        } else {
          stryCov_9fa48("92972");
          const startTime = this._subPhaseStartTimes.get(fromSubPhase);
          if (stryMutAct_9fa48("92975") ? startTime === undefined : stryMutAct_9fa48("92974") ? false : stryMutAct_9fa48("92973") ? true : (stryCov_9fa48("92973", "92974", "92975"), startTime !== undefined)) {
            if (stryMutAct_9fa48("92976")) {
              {}
            } else {
              stryCov_9fa48("92976");
              this._subPhaseDurations.set(fromSubPhase, stryMutAct_9fa48("92977") ? this.now() + startTime : (stryCov_9fa48("92977"), this.now() - startTime));
            }
          }
        }
      }
      this.subPhase = newSubPhase;

      // Record start time for the new sub-phase
      this._subPhaseStartTimes.set(newSubPhase, this.now());
      this.emit(NODE_LIFECYCLE_EVENT.SUB_PHASE_CHANGE, stryMutAct_9fa48("92978") ? {} : (stryCov_9fa48("92978"), {
        parentState,
        from: fromSubPhase,
        to: newSubPhase,
        timestamp: this.now()
      }));
      const nextState = TERMINAL_SUB_PHASE_ADVANCE[newSubPhase];
      if (stryMutAct_9fa48("92981") ? false : stryMutAct_9fa48("92980") ? true : stryMutAct_9fa48("92979") ? nextState : (stryCov_9fa48("92979", "92980", "92981"), !nextState)) {
        if (stryMutAct_9fa48("92982")) {
          {}
        } else {
          stryCov_9fa48("92982");
          return stryMutAct_9fa48("92983") ? false : (stryCov_9fa48("92983"), true);
        }
      }

      // Record duration for the terminal sub-phase before advancing
      const terminalStart = this._subPhaseStartTimes.get(newSubPhase);
      if (stryMutAct_9fa48("92986") ? terminalStart === undefined : stryMutAct_9fa48("92985") ? false : stryMutAct_9fa48("92984") ? true : (stryCov_9fa48("92984", "92985", "92986"), terminalStart !== undefined)) {
        if (stryMutAct_9fa48("92987")) {
          {}
        } else {
          stryCov_9fa48("92987");
          this._subPhaseDurations.set(newSubPhase, stryMutAct_9fa48("92988") ? this.now() + terminalStart : (stryCov_9fa48("92988"), this.now() - terminalStart));
        }
      }
      if (stryMutAct_9fa48("92990") ? false : stryMutAct_9fa48("92989") ? true : (stryCov_9fa48("92989", "92990"), this.isValidTransition(parentState, nextState))) {
        if (stryMutAct_9fa48("92991")) {
          {}
        } else {
          stryCov_9fa48("92991");
          return this.transition(nextState);
        }
      }
      return this.forceTransition(nextState, parentState);
    }
  }

  /**
   * Force a parent-state transition for terminal sub-phase auto-advance paths.
   * @param {string} nextState - Target parent state.
   * @param {string} fromState - Previous parent state.
   * @return {boolean} Always true.
   * @private
   */
  forceTransition(nextState, fromState) {
    if (stryMutAct_9fa48("92992")) {
      {}
    } else {
      stryCov_9fa48("92992");
      this.state = nextState;
      this.subPhase = NODE_LIFECYCLE_NO_SUB_PHASE;
      const timestamp = this.now();
      this.logger.info(NODE_LIFECYCLE_LOG_MSG.STATE_TRANSITION, stryMutAct_9fa48("92993") ? {} : (stryCov_9fa48("92993"), {
        nodeId: this.nodeId,
        from: fromState,
        to: nextState,
        timestamp
      }));
      this.emit(NODE_LIFECYCLE_EVENT.STATE_CHANGE, stryMutAct_9fa48("92994") ? {} : (stryCov_9fa48("92994"), {
        from: fromState,
        to: nextState,
        timestamp
      }));
      return stryMutAct_9fa48("92995") ? false : (stryCov_9fa48("92995"), true);
    }
  }

  /**
   * Check if node is in a state that accepts traffic.
   * @return {boolean} True if node is in READY state.
   */
  isReady() {
    if (stryMutAct_9fa48("92996")) {
      {}
    } else {
      stryCov_9fa48("92996");
      return stryMutAct_9fa48("92999") ? this.state !== NodeState.READY : stryMutAct_9fa48("92998") ? false : stryMutAct_9fa48("92997") ? true : (stryCov_9fa48("92997", "92998", "92999"), this.state === NodeState.READY);
    }
  }

  /**
   * Check if node is shutting down.
   * @return {boolean} True if node is in DRAINING state.
   */
  isDraining() {
    if (stryMutAct_9fa48("93000")) {
      {}
    } else {
      stryCov_9fa48("93000");
      return stryMutAct_9fa48("93003") ? this.state !== NodeState.DRAINING : stryMutAct_9fa48("93002") ? false : stryMutAct_9fa48("93001") ? true : (stryCov_9fa48("93001", "93002", "93003"), this.state === NodeState.DRAINING);
    }
  }

  /**
   * Check if node is in the joining phase.
   * @return {boolean} True if node is in JOINING state.
   */
  isJoining() {
    if (stryMutAct_9fa48("93004")) {
      {}
    } else {
      stryCov_9fa48("93004");
      return stryMutAct_9fa48("93007") ? this.state !== NodeState.JOINING : stryMutAct_9fa48("93006") ? false : stryMutAct_9fa48("93005") ? true : (stryCov_9fa48("93005", "93006", "93007"), this.state === NodeState.JOINING);
    }
  }

  /**
   * Get valid transitions from the current state.
   * @return {string[]} Array of valid next states.
   */
  getValidTransitions() {
    if (stryMutAct_9fa48("93008")) {
      {}
    } else {
      stryCov_9fa48("93008");
      return stryMutAct_9fa48("93011") ? VALID_TRANSITIONS[this.state] && [] : stryMutAct_9fa48("93010") ? false : stryMutAct_9fa48("93009") ? true : (stryCov_9fa48("93009", "93010", "93011"), VALID_TRANSITIONS[this.state] || (stryMutAct_9fa48("93012") ? ["Stryker was here"] : (stryCov_9fa48("93012"), [])));
    }
  }

  /**
   * Check if the node is in a terminal state (STOPPED).
   * @return {boolean} True if node is stopped.
   */
  isStopped() {
    if (stryMutAct_9fa48("93013")) {
      {}
    } else {
      stryCov_9fa48("93013");
      return stryMutAct_9fa48("93016") ? this.state !== NodeState.STOPPED : stryMutAct_9fa48("93015") ? false : stryMutAct_9fa48("93014") ? true : (stryCov_9fa48("93014", "93015", "93016"), this.state === NodeState.STOPPED);
    }
  }

  /**
   * Check if the node is in a transitional state (not READY or STOPPED).
   * @return {boolean} True if node is in a transitional state.
   */
  isTransitional() {
    if (stryMutAct_9fa48("93017")) {
      {}
    } else {
      stryCov_9fa48("93017");
      return stryMutAct_9fa48("93020") ? this.state !== NodeState.READY || this.state !== NodeState.STOPPED : stryMutAct_9fa48("93019") ? false : stryMutAct_9fa48("93018") ? true : (stryCov_9fa48("93018", "93019", "93020"), (stryMutAct_9fa48("93022") ? this.state === NodeState.READY : stryMutAct_9fa48("93021") ? true : (stryCov_9fa48("93021", "93022"), this.state !== NodeState.READY)) && (stryMutAct_9fa48("93024") ? this.state === NodeState.STOPPED : stryMutAct_9fa48("93023") ? true : (stryCov_9fa48("93023", "93024"), this.state !== NodeState.STOPPED)));
    }
  }
}
export { VALID_SUB_PHASES, VALID_SUB_PHASE_TRANSITIONS, TERMINAL_SUB_PHASE_ADVANCE, NodeLifecycleStateMachine, NodeState, VALID_TRANSITIONS, InvalidTransitionError };