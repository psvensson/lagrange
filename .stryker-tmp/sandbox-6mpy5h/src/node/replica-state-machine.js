/**
 * Replica State Machine - Formal state machine for replica lifecycle management.
 * Provides a single source of truth for replica status across all components.
 *
 * Requirements: 1.1, 1.2, 1.3, 2.1-2.8
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
import { AddressManager } from '../address/address-manager.js';
import { LoggingService } from '../logging/logging-service.js';
import { SERVICE_TYPE, TABLES, TYPEOF } from '../constants/index.js';
import { assertCritical } from '../utils/assert.js';
import { CONTROL_PLANE_MUTATION_OPERATION } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { REPLICA_STATE_MACHINE_DEFAULT, REPLICA_STATE_MACHINE_DEFAULT_TIMEOUTS, REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE, REPLICA_STATE_MACHINE_ERROR_MSG, REPLICA_STATE_MACHINE_EVENT, REPLICA_STATE_MACHINE_EVENT_TYPE, REPLICA_STATE_MACHINE_LOG_MSG, REPLICA_STATE_MACHINE_NOW, REPLICA_STATE_MACHINE_NUM, REPLICA_STATE_MACHINE_OPERATION, REPLICA_STATE_MACHINE_REASON, REPLICA_STATE_MACHINE_STATE, REPLICA_STATE_MACHINE_SUBSYSTEM, REPLICA_STATE_MACHINE_TRANSITION, REPLICA_STATE_MACHINE_VALID_TRANSITIONS } from './replica-state-machine-constants.js';

/**
 * Replica state constants.
 * These are the only valid states a replica can be in.
 */
const ReplicaState = REPLICA_STATE_MACHINE_STATE;

/**
 * Valid state transitions matrix.
 * Key: current state (or null for new replica)
 * Value: array of valid next states
 */
const VALID_TRANSITIONS = REPLICA_STATE_MACHINE_VALID_TRANSITIONS;

/**
 * Default timeout values for transitional states (in milliseconds).
 */
const DEFAULT_TIMEOUTS = REPLICA_STATE_MACHINE_DEFAULT_TIMEOUTS;
const BACKGROUND_PERSISTENCE_STATES = new Set(stryMutAct_9fa48("96390") ? [] : (stryCov_9fa48("96390"), [ReplicaState.PENDING, ReplicaState.CREATING, ReplicaState.SYNCING, ReplicaState.REMOVING]));
const CLEARS_CANONICAL_PARTITION_LEADER_STATES = new Set(stryMutAct_9fa48("96391") ? [] : (stryCov_9fa48("96391"), [ReplicaState.REMOVING, ReplicaState.REMOVED, ReplicaState.FAILED]));

/**
 * ReplicaStateMachine - Central state machine for replica lifecycle.
 * Enforces valid transitions and emits events for all state changes.
 *
 */
class ReplicaStateMachine extends EventEmitter {
  /**
   * Create a new ReplicaStateMachine.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID for this state machine.
   * @param {Object} options.cdcIntegrationService - CDC service for
   *   persistence.
   * @param {number} [options.pendingTimeoutMs] - Timeout for pending state.
   * @param {number} [options.creatingTimeoutMs] - Timeout for creating state.
   * @param {number} [options.syncingTimeoutMs] - Timeout for syncing state.
   * @param {number} [options.removingTimeoutMs] - Timeout for removing state.
   * @param {number} [options.timeoutCheckIntervalMs] - Interval for timeout
   *   checks.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("96392")) {
      {}
    } else {
      stryCov_9fa48("96392");
      super();
      const loggingService = LoggingService.getInstance();
      const logger = loggingService.forSubsystem(REPLICA_STATE_MACHINE_SUBSYSTEM);
      this.nodeId = assertCritical(options.nodeId, REPLICA_STATE_MACHINE_ERROR_MSG.MISSING_NODE_ID);

      // CDC integration service for state persistence
      this.cdcIntegrationService = stryMutAct_9fa48("96395") ? options.cdcIntegrationService && null : stryMutAct_9fa48("96394") ? false : stryMutAct_9fa48("96393") ? true : (stryCov_9fa48("96393", "96394", "96395"), options.cdcIntegrationService || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("96398") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("96397") ? false : stryMutAct_9fa48("96396") ? true : (stryCov_9fa48("96396", "96397", "96398"), options.controlPlaneSystemTableGateway || null);
      assertCritical(stryMutAct_9fa48("96401") ? this.cdcIntegrationService && this.controlPlaneSystemTableGateway : stryMutAct_9fa48("96400") ? false : stryMutAct_9fa48("96399") ? true : (stryCov_9fa48("96399", "96400", "96401"), this.cdcIntegrationService || this.controlPlaneSystemTableGateway), REPLICA_STATE_MACHINE_ERROR_MSG.MISSING_CDC_SERVICE);
      this.now = (stryMutAct_9fa48("96404") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("96403") ? false : stryMutAct_9fa48("96402") ? true : (stryCov_9fa48("96402", "96403", "96404"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : REPLICA_STATE_MACHINE_NOW;

      // State tracking: Map<replicaId, ReplicaStateInfo>
      this.replicas = new Map();

      // State counts for quick lookup
      this.stateCounts = stryMutAct_9fa48("96405") ? {} : (stryCov_9fa48("96405"), {
        [ReplicaState.PENDING]: REPLICA_STATE_MACHINE_NUM.ZERO,
        [ReplicaState.CREATING]: REPLICA_STATE_MACHINE_NUM.ZERO,
        [ReplicaState.SYNCING]: REPLICA_STATE_MACHINE_NUM.ZERO,
        [ReplicaState.ACTIVE]: REPLICA_STATE_MACHINE_NUM.ZERO,
        [ReplicaState.REMOVING]: REPLICA_STATE_MACHINE_NUM.ZERO,
        [ReplicaState.REMOVED]: REPLICA_STATE_MACHINE_NUM.ZERO,
        [ReplicaState.FAILED]: REPLICA_STATE_MACHINE_NUM.ZERO
      });

      // Timeout configuration (ms)
      this.timeouts = stryMutAct_9fa48("96406") ? {} : (stryCov_9fa48("96406"), {
        [ReplicaState.PENDING]: stryMutAct_9fa48("96407") ? options.pendingTimeoutMs && DEFAULT_TIMEOUTS[ReplicaState.PENDING] : (stryCov_9fa48("96407"), options.pendingTimeoutMs ?? DEFAULT_TIMEOUTS[ReplicaState.PENDING]),
        [ReplicaState.CREATING]: stryMutAct_9fa48("96408") ? options.creatingTimeoutMs && DEFAULT_TIMEOUTS[ReplicaState.CREATING] : (stryCov_9fa48("96408"), options.creatingTimeoutMs ?? DEFAULT_TIMEOUTS[ReplicaState.CREATING]),
        [ReplicaState.SYNCING]: stryMutAct_9fa48("96409") ? options.syncingTimeoutMs && DEFAULT_TIMEOUTS[ReplicaState.SYNCING] : (stryCov_9fa48("96409"), options.syncingTimeoutMs ?? DEFAULT_TIMEOUTS[ReplicaState.SYNCING]),
        [ReplicaState.REMOVING]: stryMutAct_9fa48("96410") ? options.removingTimeoutMs && DEFAULT_TIMEOUTS[ReplicaState.REMOVING] : (stryCov_9fa48("96410"), options.removingTimeoutMs ?? DEFAULT_TIMEOUTS[ReplicaState.REMOVING])
      });

      // Timeout check interval (default 5 seconds)
      this.timeoutCheckIntervalMs = stryMutAct_9fa48("96411") ? options.timeoutCheckIntervalMs && REPLICA_STATE_MACHINE_DEFAULT.TIMEOUT_CHECK_INTERVAL_MS : (stryCov_9fa48("96411"), options.timeoutCheckIntervalMs ?? REPLICA_STATE_MACHINE_DEFAULT.TIMEOUT_CHECK_INTERVAL_MS);

      // Timeout checker interval handle
      this.timeoutCheckInterval = null;

      // Concurrent operation limits
      this.limits = stryMutAct_9fa48("96412") ? {} : (stryCov_9fa48("96412"), {
        maxConcurrentAdds: stryMutAct_9fa48("96413") ? options.maxConcurrentAdds && REPLICA_STATE_MACHINE_DEFAULT.MAX_CONCURRENT_ADDS : (stryCov_9fa48("96413"), options.maxConcurrentAdds ?? REPLICA_STATE_MACHINE_DEFAULT.MAX_CONCURRENT_ADDS),
        maxConcurrentRemoves: stryMutAct_9fa48("96414") ? options.maxConcurrentRemoves && REPLICA_STATE_MACHINE_DEFAULT.MAX_CONCURRENT_REMOVES : (stryCov_9fa48("96414"), options.maxConcurrentRemoves ?? REPLICA_STATE_MACHINE_DEFAULT.MAX_CONCURRENT_REMOVES)
      });

      // Metrics tracking
      this._initializeMetrics();

      // Logging - reuse the logger from deprecation warning
      this.logger = logger;
    }
  }

  /**
   * Initialize metrics tracking structures.
   * @private
   */
  _initializeMetrics() {
    if (stryMutAct_9fa48("96415")) {
      {}
    } else {
      stryCov_9fa48("96415");
      // Transition counts: Map<'fromState->toState', count>
      this.transitionCounts = new Map();

      // Time spent in each state: Map<state, totalMs>
      this.timeInState = new Map();
      for (const state of Object.values(ReplicaState)) {
        if (stryMutAct_9fa48("96416")) {
          {}
        } else {
          stryCov_9fa48("96416");
          this.timeInState.set(state, REPLICA_STATE_MACHINE_NUM.ZERO);
        }
      }

      // Failure and timeout counts
      this.failureCount = REPLICA_STATE_MACHINE_NUM.ZERO;
      this.timeoutCount = REPLICA_STATE_MACHINE_NUM.ZERO;

      // Peak concurrent operations
      this.peakConcurrentAdds = REPLICA_STATE_MACHINE_NUM.ZERO;
      this.peakConcurrentRemoves = REPLICA_STATE_MACHINE_NUM.ZERO;
    }
  }

  /**
   * Check if a transition is valid.
   * @param {string|null} currentState - Current state (or null for new replica).
   * @param {string} newState - Target state.
   * @return {boolean} True if transition is valid.
   */
  isValidTransition(currentState, newState) {
    if (stryMutAct_9fa48("96417")) {
      {}
    } else {
      stryCov_9fa48("96417");
      const validNextStates = VALID_TRANSITIONS[currentState];

      // If currentState is not in the matrix, it's invalid
      if (stryMutAct_9fa48("96420") ? validNextStates !== undefined : stryMutAct_9fa48("96419") ? false : stryMutAct_9fa48("96418") ? true : (stryCov_9fa48("96418", "96419", "96420"), validNextStates === undefined)) {
        if (stryMutAct_9fa48("96421")) {
          {}
        } else {
          stryCov_9fa48("96421");
          return stryMutAct_9fa48("96422") ? true : (stryCov_9fa48("96422"), false);
        }
      }
      return validNextStates.includes(newState);
    }
  }

  /**
   * Transition a replica to a new state.
   * Persists state to CDC.
   * @param {string} replicaId - Replica identifier.
   * @param {string} newState - Target state.
   * @param {Object} context - Additional context.
   * @param {string} context.partitionId - Partition identifier.
   * @param {string} context.nodeId - Node identifier.
   * @param {string} context.reason - Trigger reason.
   * @param {string} [context.errorMessage] - Error message (for failed state).
   * @param {Object} [context.metadata] - Additional metadata.
   * @param {string} [context.serviceId] - Service ID for CDC persistence.
   * @return {boolean|Promise<boolean>} True if transition succeeded.
   */
  transition(replicaId, newState, context = {}) {
    if (stryMutAct_9fa48("96423")) {
      {}
    } else {
      stryCov_9fa48("96423");
      return this._applyTransition(replicaId, newState, context, stryMutAct_9fa48("96424") ? {} : (stryCov_9fa48("96424"), {
        persist: stryMutAct_9fa48("96425") ? false : (stryCov_9fa48("96425"), true),
        validate: stryMutAct_9fa48("96426") ? false : (stryCov_9fa48("96426"), true)
      }));
    }
  }

  /**
   * Finalize one replica removal after the authoritative services row has
   * already been deleted. This updates local lifecycle tracking without
   * attempting a second CDC write against a row that no longer exists.
   * @param {string} replicaId - Replica identifier.
   * @param {Object} context - Additional context.
   * @return {boolean} True when local tracking was finalized.
   */
  completeDurableRemoval(replicaId, context = {}) {
    if (stryMutAct_9fa48("96427")) {
      {}
    } else {
      stryCov_9fa48("96427");
      const existingState = this.replicas.get(replicaId);
      if (stryMutAct_9fa48("96430") ? false : stryMutAct_9fa48("96429") ? true : stryMutAct_9fa48("96428") ? existingState : (stryCov_9fa48("96428", "96429", "96430"), !existingState)) {
        if (stryMutAct_9fa48("96431")) {
          {}
        } else {
          stryCov_9fa48("96431");
          return stryMutAct_9fa48("96432") ? false : (stryCov_9fa48("96432"), true);
        }
      }
      if (stryMutAct_9fa48("96435") ? existingState.state !== ReplicaState.REMOVED : stryMutAct_9fa48("96434") ? false : stryMutAct_9fa48("96433") ? true : (stryCov_9fa48("96433", "96434", "96435"), existingState.state === ReplicaState.REMOVED)) {
        if (stryMutAct_9fa48("96436")) {
          {}
        } else {
          stryCov_9fa48("96436");
          this.removeFromTracking(replicaId);
          return stryMutAct_9fa48("96437") ? false : (stryCov_9fa48("96437"), true);
        }
      }
      const transitionResult = this._applyTransition(replicaId, ReplicaState.REMOVED, context, stryMutAct_9fa48("96438") ? {} : (stryCov_9fa48("96438"), {
        persist: stryMutAct_9fa48("96439") ? true : (stryCov_9fa48("96439"), false),
        validate: stryMutAct_9fa48("96440") ? true : (stryCov_9fa48("96440"), false)
      }));
      if (stryMutAct_9fa48("96443") ? transitionResult === true : stryMutAct_9fa48("96442") ? false : stryMutAct_9fa48("96441") ? true : (stryCov_9fa48("96441", "96442", "96443"), transitionResult !== (stryMutAct_9fa48("96444") ? false : (stryCov_9fa48("96444"), true)))) {
        if (stryMutAct_9fa48("96445")) {
          {}
        } else {
          stryCov_9fa48("96445");
          return stryMutAct_9fa48("96446") ? true : (stryCov_9fa48("96446"), false);
        }
      }
      this.removeFromTracking(replicaId);
      return stryMutAct_9fa48("96447") ? false : (stryCov_9fa48("96447"), true);
    }
  }

  /**
   * Apply one replica-state transition with optional validation and
   * persistence.
   * @param {string} replicaId - Replica identifier.
   * @param {string} newState - Target state.
   * @param {Object} context - Additional context.
   * @param {Object} options - Transition options.
   * @param {boolean} options.persist - Persist through CDC.
   * @param {boolean} options.validate - Enforce transition matrix.
   * @return {boolean|Promise<boolean>} True if transition succeeded.
   * @private
   */
  _applyTransition(replicaId, newState, context = {}, options = {}) {
    if (stryMutAct_9fa48("96448")) {
      {}
    } else {
      stryCov_9fa48("96448");
      const existingState = this.replicas.get(replicaId);
      const currentState = existingState ? existingState.state : null;
      const validate = stryMutAct_9fa48("96451") ? options.validate === false : stryMutAct_9fa48("96450") ? false : stryMutAct_9fa48("96449") ? true : (stryCov_9fa48("96449", "96450", "96451"), options.validate !== (stryMutAct_9fa48("96452") ? true : (stryCov_9fa48("96452"), false)));
      const persist = stryMutAct_9fa48("96455") ? options.persist === false : stryMutAct_9fa48("96454") ? false : stryMutAct_9fa48("96453") ? true : (stryCov_9fa48("96453", "96454", "96455"), options.persist !== (stryMutAct_9fa48("96456") ? true : (stryCov_9fa48("96456"), false)));

      // Validate transition
      if (stryMutAct_9fa48("96459") ? validate || !this.isValidTransition(currentState, newState) : stryMutAct_9fa48("96458") ? false : stryMutAct_9fa48("96457") ? true : (stryCov_9fa48("96457", "96458", "96459"), validate && (stryMutAct_9fa48("96460") ? this.isValidTransition(currentState, newState) : (stryCov_9fa48("96460"), !this.isValidTransition(currentState, newState))))) {
        if (stryMutAct_9fa48("96461")) {
          {}
        } else {
          stryCov_9fa48("96461");
          this.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.INVALID_TRANSITION, stryMutAct_9fa48("96462") ? {} : (stryCov_9fa48("96462"), {
            replicaId,
            currentState,
            attemptedState: newState,
            reason: context.reason,
            nodeId: this.nodeId
          }));
          this.emit(REPLICA_STATE_MACHINE_EVENT.TRANSITION_ERROR, stryMutAct_9fa48("96463") ? {} : (stryCov_9fa48("96463"), {
            code: REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE.INVALID_TRANSITION,
            replicaId,
            currentState,
            attemptedState: newState,
            reason: context.reason,
            nodeId: this.nodeId
          }));
          return stryMutAct_9fa48("96464") ? true : (stryCov_9fa48("96464"), false);
        }
      }
      const now = this.now();
      const previousState = currentState;
      const timeInPreviousState = existingState ? stryMutAct_9fa48("96465") ? now + existingState.stateEnteredAt : (stryCov_9fa48("96465"), now - existingState.stateEnteredAt) : REPLICA_STATE_MACHINE_NUM.ZERO;

      // Update state counts
      if (stryMutAct_9fa48("96468") ? previousState === null : stryMutAct_9fa48("96467") ? false : stryMutAct_9fa48("96466") ? true : (stryCov_9fa48("96466", "96467", "96468"), previousState !== null)) {
        if (stryMutAct_9fa48("96469")) {
          {}
        } else {
          stryCov_9fa48("96469");
          stryMutAct_9fa48("96470") ? this.stateCounts[previousState]++ : (stryCov_9fa48("96470"), this.stateCounts[previousState]--);
        }
      }
      stryMutAct_9fa48("96471") ? this.stateCounts[newState]-- : (stryCov_9fa48("96471"), this.stateCounts[newState]++);

      // Track metrics: transition counts
      const transitionKey = stryMutAct_9fa48("96472") ? `` : (stryCov_9fa48("96472"), `${previousState}${REPLICA_STATE_MACHINE_TRANSITION.SEPARATOR}${newState}`);
      const currentTransitionCount = stryMutAct_9fa48("96475") ? this.transitionCounts.get(transitionKey) && REPLICA_STATE_MACHINE_NUM.ZERO : stryMutAct_9fa48("96474") ? false : stryMutAct_9fa48("96473") ? true : (stryCov_9fa48("96473", "96474", "96475"), this.transitionCounts.get(transitionKey) || REPLICA_STATE_MACHINE_NUM.ZERO);
      this.transitionCounts.set(transitionKey, stryMutAct_9fa48("96476") ? currentTransitionCount - REPLICA_STATE_MACHINE_NUM.ONE : (stryCov_9fa48("96476"), currentTransitionCount + REPLICA_STATE_MACHINE_NUM.ONE));

      // Track metrics: time spent in previous state
      if (stryMutAct_9fa48("96479") ? previousState !== null || timeInPreviousState > REPLICA_STATE_MACHINE_NUM.ZERO : stryMutAct_9fa48("96478") ? false : stryMutAct_9fa48("96477") ? true : (stryCov_9fa48("96477", "96478", "96479"), (stryMutAct_9fa48("96481") ? previousState === null : stryMutAct_9fa48("96480") ? true : (stryCov_9fa48("96480", "96481"), previousState !== null)) && (stryMutAct_9fa48("96484") ? timeInPreviousState <= REPLICA_STATE_MACHINE_NUM.ZERO : stryMutAct_9fa48("96483") ? timeInPreviousState >= REPLICA_STATE_MACHINE_NUM.ZERO : stryMutAct_9fa48("96482") ? true : (stryCov_9fa48("96482", "96483", "96484"), timeInPreviousState > REPLICA_STATE_MACHINE_NUM.ZERO)))) {
        if (stryMutAct_9fa48("96485")) {
          {}
        } else {
          stryCov_9fa48("96485");
          const currentTimeInState = stryMutAct_9fa48("96488") ? this.timeInState.get(previousState) && REPLICA_STATE_MACHINE_NUM.ZERO : stryMutAct_9fa48("96487") ? false : stryMutAct_9fa48("96486") ? true : (stryCov_9fa48("96486", "96487", "96488"), this.timeInState.get(previousState) || REPLICA_STATE_MACHINE_NUM.ZERO);
          this.timeInState.set(previousState, stryMutAct_9fa48("96489") ? currentTimeInState - timeInPreviousState : (stryCov_9fa48("96489"), currentTimeInState + timeInPreviousState));
        }
      }

      // Track metrics: failure count
      if (stryMutAct_9fa48("96492") ? newState !== ReplicaState.FAILED : stryMutAct_9fa48("96491") ? false : stryMutAct_9fa48("96490") ? true : (stryCov_9fa48("96490", "96491", "96492"), newState === ReplicaState.FAILED)) {
        if (stryMutAct_9fa48("96493")) {
          {}
        } else {
          stryCov_9fa48("96493");
          stryMutAct_9fa48("96494") ? this.failureCount-- : (stryCov_9fa48("96494"), this.failureCount++);
        }
      }

      // Track metrics: peak concurrent operations
      this._updatePeakConcurrentOperations();

      // Create or update replica state
      const replicaState = stryMutAct_9fa48("96495") ? {} : (stryCov_9fa48("96495"), {
        replicaId,
        partitionId: stryMutAct_9fa48("96498") ? (context.partitionId || existingState?.partitionId) && null : stryMutAct_9fa48("96497") ? false : stryMutAct_9fa48("96496") ? true : (stryCov_9fa48("96496", "96497", "96498"), (stryMutAct_9fa48("96500") ? context.partitionId && existingState?.partitionId : stryMutAct_9fa48("96499") ? false : (stryCov_9fa48("96499", "96500"), context.partitionId || (stryMutAct_9fa48("96501") ? existingState.partitionId : (stryCov_9fa48("96501"), existingState?.partitionId)))) || null),
        nodeId: stryMutAct_9fa48("96504") ? (context.nodeId || existingState?.nodeId) && this.nodeId : stryMutAct_9fa48("96503") ? false : stryMutAct_9fa48("96502") ? true : (stryCov_9fa48("96502", "96503", "96504"), (stryMutAct_9fa48("96506") ? context.nodeId && existingState?.nodeId : stryMutAct_9fa48("96505") ? false : (stryCov_9fa48("96505", "96506"), context.nodeId || (stryMutAct_9fa48("96507") ? existingState.nodeId : (stryCov_9fa48("96507"), existingState?.nodeId)))) || this.nodeId),
        state: newState,
        stateEnteredAt: now,
        timeoutStartedAt: null,
        previousState,
        triggerReason: stryMutAct_9fa48("96510") ? context.reason && REPLICA_STATE_MACHINE_REASON.UNKNOWN : stryMutAct_9fa48("96509") ? false : stryMutAct_9fa48("96508") ? true : (stryCov_9fa48("96508", "96509", "96510"), context.reason || REPLICA_STATE_MACHINE_REASON.UNKNOWN),
        errorMessage: stryMutAct_9fa48("96513") ? context.errorMessage && null : stryMutAct_9fa48("96512") ? false : stryMutAct_9fa48("96511") ? true : (stryCov_9fa48("96511", "96512", "96513"), context.errorMessage || null),
        metadata: stryMutAct_9fa48("96516") ? (context.metadata || existingState?.metadata) && {} : stryMutAct_9fa48("96515") ? false : stryMutAct_9fa48("96514") ? true : (stryCov_9fa48("96514", "96515", "96516"), (stryMutAct_9fa48("96518") ? context.metadata && existingState?.metadata : stryMutAct_9fa48("96517") ? false : (stryCov_9fa48("96517", "96518"), context.metadata || (stryMutAct_9fa48("96519") ? existingState.metadata : (stryCov_9fa48("96519"), existingState?.metadata)))) || {}),
        serviceId: stryMutAct_9fa48("96522") ? (context.serviceId || existingState?.serviceId) && null : stryMutAct_9fa48("96521") ? false : stryMutAct_9fa48("96520") ? true : (stryCov_9fa48("96520", "96521", "96522"), (stryMutAct_9fa48("96524") ? context.serviceId && existingState?.serviceId : stryMutAct_9fa48("96523") ? false : (stryCov_9fa48("96523", "96524"), context.serviceId || (stryMutAct_9fa48("96525") ? existingState.serviceId : (stryCov_9fa48("96525"), existingState?.serviceId)))) || null),
        serviceType: stryMutAct_9fa48("96528") ? (context.serviceType || existingState?.serviceType) && SERVICE_TYPE.PARTITION : stryMutAct_9fa48("96527") ? false : stryMutAct_9fa48("96526") ? true : (stryCov_9fa48("96526", "96527", "96528"), (stryMutAct_9fa48("96530") ? context.serviceType && existingState?.serviceType : stryMutAct_9fa48("96529") ? false : (stryCov_9fa48("96529", "96530"), context.serviceType || (stryMutAct_9fa48("96531") ? existingState.serviceType : (stryCov_9fa48("96531"), existingState?.serviceType)))) || SERVICE_TYPE.PARTITION),
        serviceAddress: stryMutAct_9fa48("96534") ? (context.serviceAddress || existingState?.serviceAddress) && null : stryMutAct_9fa48("96533") ? false : stryMutAct_9fa48("96532") ? true : (stryCov_9fa48("96532", "96533", "96534"), (stryMutAct_9fa48("96536") ? context.serviceAddress && existingState?.serviceAddress : stryMutAct_9fa48("96535") ? false : (stryCov_9fa48("96535", "96536"), context.serviceAddress || (stryMutAct_9fa48("96537") ? existingState.serviceAddress : (stryCov_9fa48("96537"), existingState?.serviceAddress)))) || null)
      });
      this.replicas.set(replicaId, replicaState);
      this.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.STATE_TRANSITION, stryMutAct_9fa48("96538") ? {} : (stryCov_9fa48("96538"), {
        replicaId,
        previousState,
        newState,
        reason: context.reason,
        nodeId: this.nodeId
      }));

      // Emit state transition event
      this.emit(REPLICA_STATE_MACHINE_EVENT.STATE_TRANSITION, stryMutAct_9fa48("96539") ? {} : (stryCov_9fa48("96539"), {
        eventType: REPLICA_STATE_MACHINE_EVENT_TYPE.REPLICA_STATE_TRANSITION,
        replicaId,
        partitionId: replicaState.partitionId,
        nodeId: replicaState.nodeId,
        previousState,
        newState,
        timestamp: now,
        triggerReason: replicaState.triggerReason,
        errorMessage: replicaState.errorMessage,
        timeInPreviousState
      }));
      if (stryMutAct_9fa48("96542") ? false : stryMutAct_9fa48("96541") ? true : stryMutAct_9fa48("96540") ? persist : (stryCov_9fa48("96540", "96541", "96542"), !persist)) {
        if (stryMutAct_9fa48("96543")) {
          {}
        } else {
          stryCov_9fa48("96543");
          this._armTimeoutClock(replicaId);
          return stryMutAct_9fa48("96544") ? false : (stryCov_9fa48("96544"), true);
        }
      }
      const persistenceResult = (stryMutAct_9fa48("96547") ? previousState !== null : stryMutAct_9fa48("96546") ? false : stryMutAct_9fa48("96545") ? true : (stryCov_9fa48("96545", "96546", "96547"), previousState === null)) ? this._createReplicaRowInCdc(replicaState) : this._updateReplicaStateInCdc(replicaState, previousState);
      return Promise.resolve(persistenceResult).then(result => {
        if (stryMutAct_9fa48("96548")) {
          {}
        } else {
          stryCov_9fa48("96548");
          this._armTimeoutClock(replicaId);
          return result;
        }
      });
    }
  }

  /**
   * Create the initial services row for a newly tracked replica.
   * @param {Object} replicaState - The replica state to persist.
   * @return {Promise<boolean>} True if persistence succeeded.
   * @private
   */
  async _createReplicaRowInCdc(replicaState) {
    if (stryMutAct_9fa48("96549")) {
      {}
    } else {
      stryCov_9fa48("96549");
      try {
        if (stryMutAct_9fa48("96550")) {
          {}
        } else {
          stryCov_9fa48("96550");
          const serviceId = stryMutAct_9fa48("96553") ? replicaState.serviceId && replicaState.replicaId : stryMutAct_9fa48("96552") ? false : stryMutAct_9fa48("96551") ? true : (stryCov_9fa48("96551", "96552", "96553"), replicaState.serviceId || replicaState.replicaId);
          const addressManager = AddressManager.getInstance();
          const serviceType = stryMutAct_9fa48("96556") ? replicaState.serviceType && SERVICE_TYPE.PARTITION : stryMutAct_9fa48("96555") ? false : stryMutAct_9fa48("96554") ? true : (stryCov_9fa48("96554", "96555", "96556"), replicaState.serviceType || SERVICE_TYPE.PARTITION);
          const address = stryMutAct_9fa48("96559") ? replicaState.serviceAddress && addressManager.format(replicaState.nodeId, serviceType, serviceId) : stryMutAct_9fa48("96558") ? false : stryMutAct_9fa48("96557") ? true : (stryCov_9fa48("96557", "96558", "96559"), replicaState.serviceAddress || addressManager.format(replicaState.nodeId, serviceType, serviceId));
          const insertData = this._buildCreateCdcData(replicaState, serviceId, serviceType, address);
          const persistenceOptions = this._buildCdcPersistenceOptions(replicaState, serviceId);
          await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("96560") ? {} : (stryCov_9fa48("96560"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
            tableName: TABLES.SERVICES,
            row: insertData
          }), persistenceOptions);
          this.logger.debug(REPLICA_STATE_MACHINE_LOG_MSG.STATE_PERSISTED, stryMutAct_9fa48("96561") ? {} : (stryCov_9fa48("96561"), {
            replicaId: replicaState.replicaId,
            state: replicaState.state,
            nodeId: this.nodeId
          }));
          return stryMutAct_9fa48("96562") ? false : (stryCov_9fa48("96562"), true);
        }
      } catch (error) {
        if (stryMutAct_9fa48("96563")) {
          {}
        } else {
          stryCov_9fa48("96563");
          this.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.STATE_PERSIST_FAILED, stryMutAct_9fa48("96564") ? {} : (stryCov_9fa48("96564"), {
            replicaId: replicaState.replicaId,
            state: replicaState.state,
            error: error.message,
            nodeId: this.nodeId
          }));
          this.emit(REPLICA_STATE_MACHINE_EVENT.PERSISTENCE_ERROR, stryMutAct_9fa48("96565") ? {} : (stryCov_9fa48("96565"), {
            replicaId: replicaState.replicaId,
            state: replicaState.state,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Update an existing services row for a tracked replica.
   * @param {Object} replicaState - The replica state to persist.
   * @param {string} previousState - The previous state.
   * @return {Promise<boolean>} True if persistence succeeded.
   * @private
   */
  async _updateReplicaStateInCdc(replicaState, previousState) {
    if (stryMutAct_9fa48("96566")) {
      {}
    } else {
      stryCov_9fa48("96566");
      try {
        if (stryMutAct_9fa48("96567")) {
          {}
        } else {
          stryCov_9fa48("96567");
          const serviceId = stryMutAct_9fa48("96570") ? replicaState.serviceId && replicaState.replicaId : stryMutAct_9fa48("96569") ? false : stryMutAct_9fa48("96568") ? true : (stryCov_9fa48("96568", "96569", "96570"), replicaState.serviceId || replicaState.replicaId);
          const persistenceOptions = this._buildCdcPersistenceOptions(replicaState, serviceId);
          await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("96571") ? {} : (stryCov_9fa48("96571"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
            tableName: TABLES.SERVICES,
            whereClause: stryMutAct_9fa48("96572") ? {} : (stryCov_9fa48("96572"), {
              service_id: serviceId
            }),
            data: this._buildUpdateCdcData(replicaState, previousState)
          }), persistenceOptions);
          await this._clearCanonicalPartitionLeaderIfNeeded(replicaState);
          this.logger.debug(REPLICA_STATE_MACHINE_LOG_MSG.STATE_PERSISTED, stryMutAct_9fa48("96573") ? {} : (stryCov_9fa48("96573"), {
            replicaId: replicaState.replicaId,
            state: replicaState.state,
            nodeId: this.nodeId
          }));
          return stryMutAct_9fa48("96574") ? false : (stryCov_9fa48("96574"), true);
        }
      } catch (error) {
        if (stryMutAct_9fa48("96575")) {
          {}
        } else {
          stryCov_9fa48("96575");
          this.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.STATE_PERSIST_FAILED, stryMutAct_9fa48("96576") ? {} : (stryCov_9fa48("96576"), {
            replicaId: replicaState.replicaId,
            state: replicaState.state,
            error: error.message,
            nodeId: this.nodeId
          }));
          this.emit(REPLICA_STATE_MACHINE_EVENT.PERSISTENCE_ERROR, stryMutAct_9fa48("96577") ? {} : (stryCov_9fa48("96577"), {
            replicaId: replicaState.replicaId,
            state: replicaState.state,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }
  async _clearCanonicalPartitionLeaderIfNeeded(replicaState) {
    if (stryMutAct_9fa48("96578")) {
      {}
    } else {
      stryCov_9fa48("96578");
      if (stryMutAct_9fa48("96581") ? (!replicaState || replicaState.serviceType !== SERVICE_TYPE.PARTITION || !CLEARS_CANONICAL_PARTITION_LEADER_STATES.has(replicaState.state) || typeof replicaState.partitionId !== TYPEOF.STRING || replicaState.partitionId.length === 0 || typeof replicaState.nodeId !== TYPEOF.STRING) && replicaState.nodeId.length === 0 : stryMutAct_9fa48("96580") ? false : stryMutAct_9fa48("96579") ? true : (stryCov_9fa48("96579", "96580", "96581"), (stryMutAct_9fa48("96583") ? (!replicaState || replicaState.serviceType !== SERVICE_TYPE.PARTITION || !CLEARS_CANONICAL_PARTITION_LEADER_STATES.has(replicaState.state) || typeof replicaState.partitionId !== TYPEOF.STRING || replicaState.partitionId.length === 0) && typeof replicaState.nodeId !== TYPEOF.STRING : stryMutAct_9fa48("96582") ? false : (stryCov_9fa48("96582", "96583"), (stryMutAct_9fa48("96585") ? (!replicaState || replicaState.serviceType !== SERVICE_TYPE.PARTITION || !CLEARS_CANONICAL_PARTITION_LEADER_STATES.has(replicaState.state) || typeof replicaState.partitionId !== TYPEOF.STRING) && replicaState.partitionId.length === 0 : stryMutAct_9fa48("96584") ? false : (stryCov_9fa48("96584", "96585"), (stryMutAct_9fa48("96587") ? (!replicaState || replicaState.serviceType !== SERVICE_TYPE.PARTITION || !CLEARS_CANONICAL_PARTITION_LEADER_STATES.has(replicaState.state)) && typeof replicaState.partitionId !== TYPEOF.STRING : stryMutAct_9fa48("96586") ? false : (stryCov_9fa48("96586", "96587"), (stryMutAct_9fa48("96589") ? (!replicaState || replicaState.serviceType !== SERVICE_TYPE.PARTITION) && !CLEARS_CANONICAL_PARTITION_LEADER_STATES.has(replicaState.state) : stryMutAct_9fa48("96588") ? false : (stryCov_9fa48("96588", "96589"), (stryMutAct_9fa48("96591") ? !replicaState && replicaState.serviceType !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("96590") ? false : (stryCov_9fa48("96590", "96591"), (stryMutAct_9fa48("96592") ? replicaState : (stryCov_9fa48("96592"), !replicaState)) || (stryMutAct_9fa48("96594") ? replicaState.serviceType === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("96593") ? false : (stryCov_9fa48("96593", "96594"), replicaState.serviceType !== SERVICE_TYPE.PARTITION)))) || (stryMutAct_9fa48("96595") ? CLEARS_CANONICAL_PARTITION_LEADER_STATES.has(replicaState.state) : (stryCov_9fa48("96595"), !CLEARS_CANONICAL_PARTITION_LEADER_STATES.has(replicaState.state))))) || (stryMutAct_9fa48("96597") ? typeof replicaState.partitionId === TYPEOF.STRING : stryMutAct_9fa48("96596") ? false : (stryCov_9fa48("96596", "96597"), typeof replicaState.partitionId !== TYPEOF.STRING)))) || (stryMutAct_9fa48("96599") ? replicaState.partitionId.length !== 0 : stryMutAct_9fa48("96598") ? false : (stryCov_9fa48("96598", "96599"), replicaState.partitionId.length === 0)))) || (stryMutAct_9fa48("96601") ? typeof replicaState.nodeId === TYPEOF.STRING : stryMutAct_9fa48("96600") ? false : (stryCov_9fa48("96600", "96601"), typeof replicaState.nodeId !== TYPEOF.STRING)))) || (stryMutAct_9fa48("96603") ? replicaState.nodeId.length !== 0 : stryMutAct_9fa48("96602") ? false : (stryCov_9fa48("96602", "96603"), replicaState.nodeId.length === 0)))) {
        if (stryMutAct_9fa48("96604")) {
          {}
        } else {
          stryCov_9fa48("96604");
          return;
        }
      }
      await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("96605") ? {} : (stryCov_9fa48("96605"), {
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.PARTITIONS,
        whereClause: stryMutAct_9fa48("96606") ? {} : (stryCov_9fa48("96606"), {
          partition_id: replicaState.partitionId,
          leader_node_id: replicaState.nodeId
        }),
        data: stryMutAct_9fa48("96607") ? {} : (stryCov_9fa48("96607"), {
          leader_node_id: null,
          updated_at: replicaState.stateEnteredAt
        })
      }), stryMutAct_9fa48("96608") ? {} : (stryCov_9fa48("96608"), {
        allowCoalescing: stryMutAct_9fa48("96609") ? false : (stryCov_9fa48("96609"), true),
        coalescingKey: stryMutAct_9fa48("96610") ? `` : (stryCov_9fa48("96610"), `partitions:leader:${replicaState.partitionId}`),
        deliveryPriority: stryMutAct_9fa48("96611") ? "" : (stryCov_9fa48("96611"), 'critical'),
        workClass: stryMutAct_9fa48("96612") ? "" : (stryCov_9fa48("96612"), 'critical'),
        skipCacheWait: stryMutAct_9fa48("96613") ? false : (stryCov_9fa48("96613"), true)
      }));
    }
  }

  /**
   * Arm timeout tracking after the transition has been durably persisted.
   * This prevents CDC write latency from consuming replica lifecycle timeout
   * budgets before the new state is actually effective.
   * @param {string} replicaId - Replica identifier.
   * @private
   */
  _armTimeoutClock(replicaId) {
    if (stryMutAct_9fa48("96614")) {
      {}
    } else {
      stryCov_9fa48("96614");
      const replicaState = this.replicas.get(replicaId);
      if (stryMutAct_9fa48("96617") ? false : stryMutAct_9fa48("96616") ? true : stryMutAct_9fa48("96615") ? replicaState : (stryCov_9fa48("96615", "96616", "96617"), !replicaState)) {
        if (stryMutAct_9fa48("96618")) {
          {}
        } else {
          stryCov_9fa48("96618");
          return;
        }
      }
      if (stryMutAct_9fa48("96621") ? this.timeouts[replicaState.state] !== undefined : stryMutAct_9fa48("96620") ? false : stryMutAct_9fa48("96619") ? true : (stryCov_9fa48("96619", "96620", "96621"), this.timeouts[replicaState.state] === undefined)) {
        if (stryMutAct_9fa48("96622")) {
          {}
        } else {
          stryCov_9fa48("96622");
          replicaState.timeoutStartedAt = null;
          return;
        }
      }
      replicaState.timeoutStartedAt = this.now();
    }
  }

  /**
   * Build CDC payload for updating an existing services row.
   * @param {Object} replicaState - Replica state snapshot.
   * @param {string|null} previousState - Previous state value.
   * @return {Object} Partial services-row update payload.
   * @private
   */
  _buildUpdateCdcData(replicaState, previousState) {
    if (stryMutAct_9fa48("96623")) {
      {}
    } else {
      stryCov_9fa48("96623");
      const cdcData = stryMutAct_9fa48("96624") ? {} : (stryCov_9fa48("96624"), {
        status: replicaState.state,
        state_entered_at: replicaState.stateEnteredAt,
        previous_state: previousState,
        trigger_reason: replicaState.triggerReason,
        updated_at: replicaState.stateEnteredAt
      });
      if (stryMutAct_9fa48("96626") ? false : stryMutAct_9fa48("96625") ? true : (stryCov_9fa48("96625", "96626"), replicaState.errorMessage)) {
        if (stryMutAct_9fa48("96627")) {
          {}
        } else {
          stryCov_9fa48("96627");
          cdcData.error_message = replicaState.errorMessage;
        }
      }
      return cdcData;
    }
  }

  /**
   * Build CDC payload for creating a services row.
   * @param {Object} replicaState - Replica state snapshot.
   * @param {string} serviceId - Canonical service identifier.
   * @param {string} serviceType - Service type for the row.
   * @param {string} address - Resolved service address.
   * @return {Object} Full services-row creation payload.
   * @private
   */
  _buildCreateCdcData(replicaState, serviceId, serviceType, address) {
    if (stryMutAct_9fa48("96628")) {
      {}
    } else {
      stryCov_9fa48("96628");
      return stryMutAct_9fa48("96629") ? {} : (stryCov_9fa48("96629"), {
        ...this._buildUpdateCdcData(replicaState, null),
        service_id: serviceId,
        service_type: serviceType,
        node_id: replicaState.nodeId,
        partition_id: replicaState.partitionId,
        replica_id: replicaState.replicaId,
        address,
        created_at: replicaState.stateEnteredAt
      });
    }
  }

  /**
   * Build canonical CDC mutation options for one replica-state write.
   * Transitional lifecycle updates are non-routable background metadata;
   * they should not occupy scarce critical-lane capacity or retain memory
   * waiting on local cache propagation. Stable states still use the
   * canonical write path but keep critical delivery priority.
   * @param {Object} replicaState
   * @param {string} serviceId
   * @return {Object}
   * @private
   */
  _buildCdcPersistenceOptions(replicaState, serviceId) {
    if (stryMutAct_9fa48("96630")) {
      {}
    } else {
      stryCov_9fa48("96630");
      const state = stryMutAct_9fa48("96633") ? replicaState?.state && null : stryMutAct_9fa48("96632") ? false : stryMutAct_9fa48("96631") ? true : (stryCov_9fa48("96631", "96632", "96633"), (stryMutAct_9fa48("96634") ? replicaState.state : (stryCov_9fa48("96634"), replicaState?.state)) || null);
      const backgroundWrite = BACKGROUND_PERSISTENCE_STATES.has(state);
      return stryMutAct_9fa48("96635") ? {} : (stryCov_9fa48("96635"), {
        allowCoalescing: stryMutAct_9fa48("96636") ? false : (stryCov_9fa48("96636"), true),
        coalescingKey: stryMutAct_9fa48("96637") ? `` : (stryCov_9fa48("96637"), `replica-state:${serviceId}`),
        deliveryPriority: backgroundWrite ? stryMutAct_9fa48("96638") ? "" : (stryCov_9fa48("96638"), 'background') : stryMutAct_9fa48("96639") ? "" : (stryCov_9fa48("96639"), 'critical'),
        workClass: backgroundWrite ? stryMutAct_9fa48("96640") ? "" : (stryCov_9fa48("96640"), 'background') : stryMutAct_9fa48("96641") ? "" : (stryCov_9fa48("96641"), 'critical'),
        // ReplicaStateMachine is the canonical owner already; waiting for the
        // local cache here only retains memory and elongates transitional churn.
        skipCacheWait: stryMutAct_9fa48("96642") ? false : (stryCov_9fa48("96642"), true)
      });
    }
  }

  /**
   * Get current state of a replica.
   * @param {string} replicaId - Replica identifier.
   * @return {Object|null} Current state info or null if not tracked.
   */
  getState(replicaId) {
    if (stryMutAct_9fa48("96643")) {
      {}
    } else {
      stryCov_9fa48("96643");
      return stryMutAct_9fa48("96646") ? this.replicas.get(replicaId) && null : stryMutAct_9fa48("96645") ? false : stryMutAct_9fa48("96644") ? true : (stryCov_9fa48("96644", "96645", "96646"), this.replicas.get(replicaId) || null);
    }
  }

  /**
   * Get counts of replicas in each state.
   * @return {Object} State counts object.
   */
  getStateCounts() {
    if (stryMutAct_9fa48("96647")) {
      {}
    } else {
      stryCov_9fa48("96647");
      return stryMutAct_9fa48("96648") ? {} : (stryCov_9fa48("96648"), {
        ...this.stateCounts
      });
    }
  }

  /**
   * Get all replicas in a specific state.
   * @param {string} state - State to filter by.
   * @return {Array<Object>} Array of replica state objects.
   */
  getReplicasInState(state) {
    if (stryMutAct_9fa48("96649")) {
      {}
    } else {
      stryCov_9fa48("96649");
      const result = stryMutAct_9fa48("96650") ? ["Stryker was here"] : (stryCov_9fa48("96650"), []);
      for (const replicaState of this.replicas.values()) {
        if (stryMutAct_9fa48("96651")) {
          {}
        } else {
          stryCov_9fa48("96651");
          if (stryMutAct_9fa48("96654") ? replicaState.state !== state : stryMutAct_9fa48("96653") ? false : stryMutAct_9fa48("96652") ? true : (stryCov_9fa48("96652", "96653", "96654"), replicaState.state === state)) {
            if (stryMutAct_9fa48("96655")) {
              {}
            } else {
              stryCov_9fa48("96655");
              result.push(stryMutAct_9fa48("96656") ? {} : (stryCov_9fa48("96656"), {
                ...replicaState
              }));
            }
          }
        }
      }
      return result;
    }
  }

  /**
   * Get all tracked replicas.
   * @return {Array<Object>} Array of all replica state objects.
   */
  getAllReplicas() {
    if (stryMutAct_9fa48("96657")) {
      {}
    } else {
      stryCov_9fa48("96657");
      return Array.from(this.replicas.values()).map(stryMutAct_9fa48("96658") ? () => undefined : (stryCov_9fa48("96658"), r => stryMutAct_9fa48("96659") ? {} : (stryCov_9fa48("96659"), {
        ...r
      })));
    }
  }

  /**
   * Get replicas in transitional states.
   * Transitional states are: pending, creating, syncing, removing.
   * @return {Array<Object>} Replicas in transitional states.
   */
  getTransitionalReplicas() {
    if (stryMutAct_9fa48("96660")) {
      {}
    } else {
      stryCov_9fa48("96660");
      const transitionalStates = stryMutAct_9fa48("96661") ? [] : (stryCov_9fa48("96661"), [ReplicaState.PENDING, ReplicaState.CREATING, ReplicaState.SYNCING, ReplicaState.REMOVING]);
      const result = stryMutAct_9fa48("96662") ? ["Stryker was here"] : (stryCov_9fa48("96662"), []);
      for (const replicaState of this.replicas.values()) {
        if (stryMutAct_9fa48("96663")) {
          {}
        } else {
          stryCov_9fa48("96663");
          if (stryMutAct_9fa48("96665") ? false : stryMutAct_9fa48("96664") ? true : (stryCov_9fa48("96664", "96665"), transitionalStates.includes(replicaState.state))) {
            if (stryMutAct_9fa48("96666")) {
              {}
            } else {
              stryCov_9fa48("96666");
              result.push(stryMutAct_9fa48("96667") ? {} : (stryCov_9fa48("96667"), {
                ...replicaState
              }));
            }
          }
        }
      }
      return result;
    }
  }

  /**
   * Check if concurrent operation limits allow new operations.
   * @param {string} operationType - 'add' or 'remove'.
   * @return {boolean} True if operation can proceed.
   */
  canStartOperation(operationType) {
    if (stryMutAct_9fa48("96668")) {
      {}
    } else {
      stryCov_9fa48("96668");
      if (stryMutAct_9fa48("96671") ? operationType !== REPLICA_STATE_MACHINE_OPERATION.ADD : stryMutAct_9fa48("96670") ? false : stryMutAct_9fa48("96669") ? true : (stryCov_9fa48("96669", "96670", "96671"), operationType === REPLICA_STATE_MACHINE_OPERATION.ADD)) {
        if (stryMutAct_9fa48("96672")) {
          {}
        } else {
          stryCov_9fa48("96672");
          // Add operations are limited by pending + creating + syncing count
          const addTransitionalCount = stryMutAct_9fa48("96673") ? this.stateCounts[ReplicaState.PENDING] + this.stateCounts[ReplicaState.CREATING] - this.stateCounts[ReplicaState.SYNCING] : (stryCov_9fa48("96673"), (stryMutAct_9fa48("96674") ? this.stateCounts[ReplicaState.PENDING] - this.stateCounts[ReplicaState.CREATING] : (stryCov_9fa48("96674"), this.stateCounts[ReplicaState.PENDING] + this.stateCounts[ReplicaState.CREATING])) + this.stateCounts[ReplicaState.SYNCING]);
          if (stryMutAct_9fa48("96678") ? addTransitionalCount < this.limits.maxConcurrentAdds : stryMutAct_9fa48("96677") ? addTransitionalCount > this.limits.maxConcurrentAdds : stryMutAct_9fa48("96676") ? false : stryMutAct_9fa48("96675") ? true : (stryCov_9fa48("96675", "96676", "96677", "96678"), addTransitionalCount >= this.limits.maxConcurrentAdds)) {
            if (stryMutAct_9fa48("96679")) {
              {}
            } else {
              stryCov_9fa48("96679");
              this.logger.warn(REPLICA_STATE_MACHINE_LOG_MSG.CONCURRENT_ADD_LIMIT, stryMutAct_9fa48("96680") ? {} : (stryCov_9fa48("96680"), {
                currentCount: addTransitionalCount,
                limit: this.limits.maxConcurrentAdds,
                nodeId: this.nodeId
              }));
              return stryMutAct_9fa48("96681") ? true : (stryCov_9fa48("96681"), false);
            }
          }
          return stryMutAct_9fa48("96682") ? false : (stryCov_9fa48("96682"), true);
        }
      } else if (stryMutAct_9fa48("96685") ? operationType !== REPLICA_STATE_MACHINE_OPERATION.REMOVE : stryMutAct_9fa48("96684") ? false : stryMutAct_9fa48("96683") ? true : (stryCov_9fa48("96683", "96684", "96685"), operationType === REPLICA_STATE_MACHINE_OPERATION.REMOVE)) {
        if (stryMutAct_9fa48("96686")) {
          {}
        } else {
          stryCov_9fa48("96686");
          // Remove operations are limited by removing count
          const removeTransitionalCount = this.stateCounts[ReplicaState.REMOVING];
          if (stryMutAct_9fa48("96690") ? removeTransitionalCount < this.limits.maxConcurrentRemoves : stryMutAct_9fa48("96689") ? removeTransitionalCount > this.limits.maxConcurrentRemoves : stryMutAct_9fa48("96688") ? false : stryMutAct_9fa48("96687") ? true : (stryCov_9fa48("96687", "96688", "96689", "96690"), removeTransitionalCount >= this.limits.maxConcurrentRemoves)) {
            if (stryMutAct_9fa48("96691")) {
              {}
            } else {
              stryCov_9fa48("96691");
              this.logger.warn(REPLICA_STATE_MACHINE_LOG_MSG.CONCURRENT_REMOVE_LIMIT, stryMutAct_9fa48("96692") ? {} : (stryCov_9fa48("96692"), {
                currentCount: removeTransitionalCount,
                limit: this.limits.maxConcurrentRemoves,
                nodeId: this.nodeId
              }));
              return stryMutAct_9fa48("96693") ? true : (stryCov_9fa48("96693"), false);
            }
          }
          return stryMutAct_9fa48("96694") ? false : (stryCov_9fa48("96694"), true);
        }
      }

      // Unknown operation type
      this.logger.warn(REPLICA_STATE_MACHINE_LOG_MSG.UNKNOWN_OPERATION, stryMutAct_9fa48("96695") ? {} : (stryCov_9fa48("96695"), {
        operationType,
        nodeId: this.nodeId
      }));
      return stryMutAct_9fa48("96696") ? true : (stryCov_9fa48("96696"), false);
    }
  }

  /**
   * Get the configured concurrent operation limits.
   * @return {Object} Limits object with maxConcurrentAdds and maxConcurrentRemoves.
   */
  getLimits() {
    if (stryMutAct_9fa48("96697")) {
      {}
    } else {
      stryCov_9fa48("96697");
      return stryMutAct_9fa48("96698") ? {} : (stryCov_9fa48("96698"), {
        ...this.limits
      });
    }
  }

  /**
   * Remove a replica from tracking (after it reaches REMOVED state).
   * @param {string} replicaId - Replica identifier.
   * @return {boolean} True if replica was removed from tracking.
   */
  removeFromTracking(replicaId) {
    if (stryMutAct_9fa48("96699")) {
      {}
    } else {
      stryCov_9fa48("96699");
      const state = this.replicas.get(replicaId);
      if (stryMutAct_9fa48("96702") ? false : stryMutAct_9fa48("96701") ? true : stryMutAct_9fa48("96700") ? state : (stryCov_9fa48("96700", "96701", "96702"), !state)) {
        if (stryMutAct_9fa48("96703")) {
          {}
        } else {
          stryCov_9fa48("96703");
          return stryMutAct_9fa48("96704") ? true : (stryCov_9fa48("96704"), false);
        }
      }

      // Only allow removal from tracking if in REMOVED state
      if (stryMutAct_9fa48("96707") ? state.state === ReplicaState.REMOVED : stryMutAct_9fa48("96706") ? false : stryMutAct_9fa48("96705") ? true : (stryCov_9fa48("96705", "96706", "96707"), state.state !== ReplicaState.REMOVED)) {
        if (stryMutAct_9fa48("96708")) {
          {}
        } else {
          stryCov_9fa48("96708");
          this.logger.warn(REPLICA_STATE_MACHINE_LOG_MSG.REMOVE_TRACKING_INVALID, stryMutAct_9fa48("96709") ? {} : (stryCov_9fa48("96709"), {
            replicaId,
            currentState: state.state,
            nodeId: this.nodeId
          }));
          return stryMutAct_9fa48("96710") ? true : (stryCov_9fa48("96710"), false);
        }
      }
      stryMutAct_9fa48("96711") ? this.stateCounts[state.state]++ : (stryCov_9fa48("96711"), this.stateCounts[state.state]--);
      this.replicas.delete(replicaId);
      this.logger.debug(REPLICA_STATE_MACHINE_LOG_MSG.REMOVE_TRACKING_SUCCESS, stryMutAct_9fa48("96712") ? {} : (stryCov_9fa48("96712"), {
        replicaId,
        nodeId: this.nodeId
      }));
      return stryMutAct_9fa48("96713") ? false : (stryCov_9fa48("96713"), true);
    }
  }

  /**
   * Update peak concurrent operations tracking.
   * @private
   */
  _updatePeakConcurrentOperations() {
    if (stryMutAct_9fa48("96714")) {
      {}
    } else {
      stryCov_9fa48("96714");
      // Calculate current concurrent adds (pending + creating + syncing)
      const currentAdds = stryMutAct_9fa48("96715") ? this.stateCounts[ReplicaState.PENDING] + this.stateCounts[ReplicaState.CREATING] - this.stateCounts[ReplicaState.SYNCING] : (stryCov_9fa48("96715"), (stryMutAct_9fa48("96716") ? this.stateCounts[ReplicaState.PENDING] - this.stateCounts[ReplicaState.CREATING] : (stryCov_9fa48("96716"), this.stateCounts[ReplicaState.PENDING] + this.stateCounts[ReplicaState.CREATING])) + this.stateCounts[ReplicaState.SYNCING]);
      if (stryMutAct_9fa48("96720") ? currentAdds <= this.peakConcurrentAdds : stryMutAct_9fa48("96719") ? currentAdds >= this.peakConcurrentAdds : stryMutAct_9fa48("96718") ? false : stryMutAct_9fa48("96717") ? true : (stryCov_9fa48("96717", "96718", "96719", "96720"), currentAdds > this.peakConcurrentAdds)) {
        if (stryMutAct_9fa48("96721")) {
          {}
        } else {
          stryCov_9fa48("96721");
          this.peakConcurrentAdds = currentAdds;
        }
      }

      // Calculate current concurrent removes
      const currentRemoves = this.stateCounts[ReplicaState.REMOVING];
      if (stryMutAct_9fa48("96725") ? currentRemoves <= this.peakConcurrentRemoves : stryMutAct_9fa48("96724") ? currentRemoves >= this.peakConcurrentRemoves : stryMutAct_9fa48("96723") ? false : stryMutAct_9fa48("96722") ? true : (stryCov_9fa48("96722", "96723", "96724", "96725"), currentRemoves > this.peakConcurrentRemoves)) {
        if (stryMutAct_9fa48("96726")) {
          {}
        } else {
          stryCov_9fa48("96726");
          this.peakConcurrentRemoves = currentRemoves;
        }
      }
    }
  }

  /**
   * Increment the timeout count.
   * Called when a timeout-triggered failure occurs.
   */
  incrementTimeoutCount() {
    if (stryMutAct_9fa48("96727")) {
      {}
    } else {
      stryCov_9fa48("96727");
      stryMutAct_9fa48("96728") ? this.timeoutCount -= REPLICA_STATE_MACHINE_NUM.ONE : (stryCov_9fa48("96728"), this.timeoutCount += REPLICA_STATE_MACHINE_NUM.ONE);
    }
  }

  /**
   * Get metrics about state machine operations.
   * @return {Object} Metrics object containing:
   *   - stateCounts: count of replicas in each state
   *   - transitionCounts: count of transitions per state pair
   *   - timeInState: total time spent in each state (ms)
   *   - failureCount: total number of failures
   *   - timeoutCount: total number of timeout-triggered failures
   *   - currentConcurrentAdds: current count of add operations in progress
   *   - currentConcurrentRemoves: current count of remove operations in progress
   *   - peakConcurrentAdds: peak concurrent add operations
   *   - peakConcurrentRemoves: peak concurrent remove operations
   */
  getMetrics() {
    if (stryMutAct_9fa48("96729")) {
      {}
    } else {
      stryCov_9fa48("96729");
      // Calculate current concurrent operations
      const currentConcurrentAdds = stryMutAct_9fa48("96730") ? this.stateCounts[ReplicaState.PENDING] + this.stateCounts[ReplicaState.CREATING] - this.stateCounts[ReplicaState.SYNCING] : (stryCov_9fa48("96730"), (stryMutAct_9fa48("96731") ? this.stateCounts[ReplicaState.PENDING] - this.stateCounts[ReplicaState.CREATING] : (stryCov_9fa48("96731"), this.stateCounts[ReplicaState.PENDING] + this.stateCounts[ReplicaState.CREATING])) + this.stateCounts[ReplicaState.SYNCING]);
      const currentConcurrentRemoves = this.stateCounts[ReplicaState.REMOVING];

      // Convert transition counts Map to object
      const transitionCountsObj = {};
      for (const [key, value] of this.transitionCounts) {
        if (stryMutAct_9fa48("96732")) {
          {}
        } else {
          stryCov_9fa48("96732");
          transitionCountsObj[key] = value;
        }
      }

      // Convert time in state Map to object
      const timeInStateObj = {};
      for (const [key, value] of this.timeInState) {
        if (stryMutAct_9fa48("96733")) {
          {}
        } else {
          stryCov_9fa48("96733");
          timeInStateObj[key] = value;
        }
      }
      return stryMutAct_9fa48("96734") ? {} : (stryCov_9fa48("96734"), {
        stateCounts: stryMutAct_9fa48("96735") ? {} : (stryCov_9fa48("96735"), {
          ...this.stateCounts
        }),
        transitionCounts: transitionCountsObj,
        timeInState: timeInStateObj,
        failureCount: this.failureCount,
        timeoutCount: this.timeoutCount,
        currentConcurrentAdds,
        currentConcurrentRemoves,
        peakConcurrentAdds: this.peakConcurrentAdds,
        peakConcurrentRemoves: this.peakConcurrentRemoves
      });
    }
  }

  /**
   * Reset all metrics to initial values.
   * Used for testing.
   */
  resetMetrics() {
    if (stryMutAct_9fa48("96736")) {
      {}
    } else {
      stryCov_9fa48("96736");
      this._initializeMetrics();
    }
  }

  /**
   * Clear all tracked replicas.
   * Used for testing and shutdown.
   */
  clear() {
    if (stryMutAct_9fa48("96737")) {
      {}
    } else {
      stryCov_9fa48("96737");
      this.stopTimeoutChecker();
      this.replicas.clear();
      for (const state of Object.keys(this.stateCounts)) {
        if (stryMutAct_9fa48("96738")) {
          {}
        } else {
          stryCov_9fa48("96738");
          this.stateCounts[state] = REPLICA_STATE_MACHINE_NUM.ZERO;
        }
      }
      this._initializeMetrics();
    }
  }
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("96739")) {
      {}
    } else {
      stryCov_9fa48("96739");
      if (stryMutAct_9fa48("96741") ? false : stryMutAct_9fa48("96740") ? true : (stryCov_9fa48("96740", "96741"), this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("96742")) {
          {}
        } else {
          stryCov_9fa48("96742");
          return this.controlPlaneSystemTableGateway;
        }
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("96743") ? {} : (stryCov_9fa48("96743"), {
        nodeId: this.nodeId,
        getCdcIntegrationService: stryMutAct_9fa48("96744") ? () => undefined : (stryCov_9fa48("96744"), () => this.cdcIntegrationService)
      })).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
  }

  /**
   * Get the configured timeout for a state.
   * @param {string} state - The state to get timeout for.
   * @return {number|null} Timeout in ms or null if no timeout for this state.
   */
  getTimeout(state) {
    if (stryMutAct_9fa48("96745")) {
      {}
    } else {
      stryCov_9fa48("96745");
      return stryMutAct_9fa48("96746") ? this.timeouts[state] && null : (stryCov_9fa48("96746"), this.timeouts[state] ?? null);
    }
  }

  /**
   * Start the timeout checker interval.
   * Periodically checks for replicas that have exceeded their state timeout.
   */
  startTimeoutChecker() {
    if (stryMutAct_9fa48("96747")) {
      {}
    } else {
      stryCov_9fa48("96747");
      if (stryMutAct_9fa48("96750") ? this.timeoutCheckInterval === null : stryMutAct_9fa48("96749") ? false : stryMutAct_9fa48("96748") ? true : (stryCov_9fa48("96748", "96749", "96750"), this.timeoutCheckInterval !== null)) {
        if (stryMutAct_9fa48("96751")) {
          {}
        } else {
          stryCov_9fa48("96751");
          // Already running
          return;
        }
      }
      this.timeoutCheckInterval = setInterval(() => {
        if (stryMutAct_9fa48("96752")) {
          {}
        } else {
          stryCov_9fa48("96752");
          this._checkTimeouts();
        }
      }, this.timeoutCheckIntervalMs);
      this.timeoutCheckInterval.unref();
      this.logger.debug(REPLICA_STATE_MACHINE_LOG_MSG.TIMEOUT_CHECKER_STARTED, stryMutAct_9fa48("96753") ? {} : (stryCov_9fa48("96753"), {
        intervalMs: this.timeoutCheckIntervalMs,
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Stop the timeout checker interval.
   */
  stopTimeoutChecker() {
    if (stryMutAct_9fa48("96754")) {
      {}
    } else {
      stryCov_9fa48("96754");
      if (stryMutAct_9fa48("96757") ? this.timeoutCheckInterval === null : stryMutAct_9fa48("96756") ? false : stryMutAct_9fa48("96755") ? true : (stryCov_9fa48("96755", "96756", "96757"), this.timeoutCheckInterval !== null)) {
        if (stryMutAct_9fa48("96758")) {
          {}
        } else {
          stryCov_9fa48("96758");
          clearInterval(this.timeoutCheckInterval);
          this.timeoutCheckInterval = null;
          this.logger.debug(REPLICA_STATE_MACHINE_LOG_MSG.TIMEOUT_CHECKER_STOPPED, stryMutAct_9fa48("96759") ? {} : (stryCov_9fa48("96759"), {
            nodeId: this.nodeId
          }));
        }
      }
    }
  }

  /**
   * Check for timed out replicas and transition them to failed.
   * @private
   */
  _checkTimeouts() {
    if (stryMutAct_9fa48("96760")) {
      {}
    } else {
      stryCov_9fa48("96760");
      const now = this.now();
      const timedOutReplicas = stryMutAct_9fa48("96761") ? ["Stryker was here"] : (stryCov_9fa48("96761"), []);
      for (const [replicaId, state] of this.replicas) {
        if (stryMutAct_9fa48("96762")) {
          {}
        } else {
          stryCov_9fa48("96762");
          const timeout = this.timeouts[state.state];
          if (stryMutAct_9fa48("96765") ? timeout !== undefined : stryMutAct_9fa48("96764") ? false : stryMutAct_9fa48("96763") ? true : (stryCov_9fa48("96763", "96764", "96765"), timeout === undefined)) {
            if (stryMutAct_9fa48("96766")) {
              {}
            } else {
              stryCov_9fa48("96766");
              // No timeout for this state (e.g., active, removed, failed)
              continue;
            }
          }
          const hasExplicitTimeoutAnchor = Object.prototype.hasOwnProperty.call(state, stryMutAct_9fa48("96767") ? "" : (stryCov_9fa48("96767"), 'timeoutStartedAt'));
          const timeoutAnchor = hasExplicitTimeoutAnchor ? state.timeoutStartedAt : state.stateEnteredAt;
          if (stryMutAct_9fa48("96770") ? false : stryMutAct_9fa48("96769") ? true : stryMutAct_9fa48("96768") ? Number.isFinite(timeoutAnchor) : (stryCov_9fa48("96768", "96769", "96770"), !Number.isFinite(timeoutAnchor))) {
            if (stryMutAct_9fa48("96771")) {
              {}
            } else {
              stryCov_9fa48("96771");
              continue;
            }
          }
          const elapsed = stryMutAct_9fa48("96772") ? now + timeoutAnchor : (stryCov_9fa48("96772"), now - timeoutAnchor);
          if (stryMutAct_9fa48("96776") ? elapsed <= timeout : stryMutAct_9fa48("96775") ? elapsed >= timeout : stryMutAct_9fa48("96774") ? false : stryMutAct_9fa48("96773") ? true : (stryCov_9fa48("96773", "96774", "96775", "96776"), elapsed > timeout)) {
            if (stryMutAct_9fa48("96777")) {
              {}
            } else {
              stryCov_9fa48("96777");
              timedOutReplicas.push(stryMutAct_9fa48("96778") ? {} : (stryCov_9fa48("96778"), {
                replicaId,
                state: state.state,
                elapsed,
                timeout,
                partitionId: state.partitionId,
                nodeId: state.nodeId
              }));
            }
          }
        }
      }

      // Transition timed out replicas to failed
      for (const timedOut of timedOutReplicas) {
        if (stryMutAct_9fa48("96779")) {
          {}
        } else {
          stryCov_9fa48("96779");
          this.logger.warn(REPLICA_STATE_MACHINE_LOG_MSG.OPERATION_TIMEOUT, stryMutAct_9fa48("96780") ? {} : (stryCov_9fa48("96780"), {
            replicaId: timedOut.replicaId,
            state: timedOut.state,
            elapsed: timedOut.elapsed,
            timeout: timedOut.timeout,
            nodeId: this.nodeId
          }));

          // Increment timeout count
          stryMutAct_9fa48("96781") ? this.timeoutCount -= REPLICA_STATE_MACHINE_NUM.ONE : (stryCov_9fa48("96781"), this.timeoutCount += REPLICA_STATE_MACHINE_NUM.ONE);
          this.emit(REPLICA_STATE_MACHINE_EVENT.TIMEOUT, stryMutAct_9fa48("96782") ? {} : (stryCov_9fa48("96782"), {
            replicaId: timedOut.replicaId,
            partitionId: timedOut.partitionId,
            nodeId: timedOut.nodeId,
            state: timedOut.state,
            elapsed: timedOut.elapsed,
            timeout: timedOut.timeout
          }));
          this.transition(timedOut.replicaId, ReplicaState.FAILED, stryMutAct_9fa48("96783") ? {} : (stryCov_9fa48("96783"), {
            partitionId: timedOut.partitionId,
            nodeId: timedOut.nodeId,
            reason: REPLICA_STATE_MACHINE_ERROR_MSG.timeoutReason(timedOut.state, timedOut.elapsed),
            errorMessage: REPLICA_STATE_MACHINE_ERROR_MSG.timeoutMessage(timedOut.timeout)
          }));
        }
      }
    }
  }

  /**
   * Check timeouts immediately (for testing).
   * @return {number} Number of replicas that timed out.
   */
  checkTimeoutsNow() {
    if (stryMutAct_9fa48("96784")) {
      {}
    } else {
      stryCov_9fa48("96784");
      const countBefore = this.stateCounts[ReplicaState.FAILED];
      this._checkTimeouts();
      return stryMutAct_9fa48("96785") ? this.stateCounts[ReplicaState.FAILED] + countBefore : (stryCov_9fa48("96785"), this.stateCounts[ReplicaState.FAILED] - countBefore);
    }
  }

  /**
   * Handle node recovery - process replicas in transitional states.
   * Called when a node recovers after a failure.
   *
   * For replicas in 'creating' or 'syncing' state: transition to 'failed'
   * For replicas in 'removing' state: complete removal (transition to 'removed')
   *
   * Requirements: 4.2, 4.3, 4.4
   *
   * @param {Object} options - Recovery options.
   * @param {Object} options.systemTableCache - System table cache to query.
   * @param {string} [options.nodeId] - Node ID to filter replicas (defaults to
   *   this.nodeId).
   * @return {Promise<Object>} Recovery result with counts of processed replicas.
   */
  async handleNodeRecovery(options = {}) {
    if (stryMutAct_9fa48("96786")) {
      {}
    } else {
      stryCov_9fa48("96786");
      const {
        systemTableCache
      } = options;
      const nodeId = stryMutAct_9fa48("96789") ? options.nodeId && this.nodeId : stryMutAct_9fa48("96788") ? false : stryMutAct_9fa48("96787") ? true : (stryCov_9fa48("96787", "96788", "96789"), options.nodeId || this.nodeId);
      this.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_START, stryMutAct_9fa48("96790") ? {} : (stryCov_9fa48("96790"), {
        nodeId
      }));
      assertCritical(systemTableCache, REPLICA_STATE_MACHINE_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE);

      // Query services table for replicas on this node in transitional states
      let services = stryMutAct_9fa48("96791") ? ["Stryker was here"] : (stryCov_9fa48("96791"), []);
      try {
        if (stryMutAct_9fa48("96792")) {
          {}
        } else {
          stryCov_9fa48("96792");
          services = stryMutAct_9fa48("96793") ? systemTableCache : (stryCov_9fa48("96793"), systemTableCache.filter(TABLES.SERVICES, stryMutAct_9fa48("96794") ? () => undefined : (stryCov_9fa48("96794"), service => stryMutAct_9fa48("96797") ? service.node_id === nodeId && service.service_type === SERVICE_TYPE.PARTITION || [ReplicaState.CREATING, ReplicaState.SYNCING, ReplicaState.REMOVING].includes(service.status) : stryMutAct_9fa48("96796") ? false : stryMutAct_9fa48("96795") ? true : (stryCov_9fa48("96795", "96796", "96797"), (stryMutAct_9fa48("96799") ? service.node_id === nodeId || service.service_type === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("96798") ? true : (stryCov_9fa48("96798", "96799"), (stryMutAct_9fa48("96801") ? service.node_id !== nodeId : stryMutAct_9fa48("96800") ? true : (stryCov_9fa48("96800", "96801"), service.node_id === nodeId)) && (stryMutAct_9fa48("96803") ? service.service_type !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("96802") ? true : (stryCov_9fa48("96802", "96803"), service.service_type === SERVICE_TYPE.PARTITION)))) && (stryMutAct_9fa48("96804") ? [] : (stryCov_9fa48("96804"), [ReplicaState.CREATING, ReplicaState.SYNCING, ReplicaState.REMOVING])).includes(service.status)))));
        }
      } catch (error) {
        if (stryMutAct_9fa48("96805")) {
          {}
        } else {
          stryCov_9fa48("96805");
          this.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_QUERY_FAILED, stryMutAct_9fa48("96806") ? {} : (stryCov_9fa48("96806"), {
            nodeId,
            error: error.message
          }));
          throw error;
        }
      }
      this.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_FOUND, stryMutAct_9fa48("96807") ? {} : (stryCov_9fa48("96807"), {
        count: services.length,
        nodeId
      }));
      let creatingToFailed = REPLICA_STATE_MACHINE_NUM.ZERO;
      let syncingToFailed = REPLICA_STATE_MACHINE_NUM.ZERO;
      let removingToRemoved = REPLICA_STATE_MACHINE_NUM.ZERO;
      for (const service of services) {
        if (stryMutAct_9fa48("96808")) {
          {}
        } else {
          stryCov_9fa48("96808");
          const {
            service_id: replicaId,
            partition_id: partitionId,
            status
          } = service;
          this.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_PROCESSING, stryMutAct_9fa48("96809") ? {} : (stryCov_9fa48("96809"), {
            replicaId,
            partitionId,
            status,
            nodeId
          }));
          try {
            if (stryMutAct_9fa48("96810")) {
              {}
            } else {
              stryCov_9fa48("96810");
              // Register the replica in the state machine if not already tracked
              // We need to set up the replica in its current state first
              const existingState = this.replicas.get(replicaId);
              if (stryMutAct_9fa48("96813") ? false : stryMutAct_9fa48("96812") ? true : stryMutAct_9fa48("96811") ? existingState : (stryCov_9fa48("96811", "96812", "96813"), !existingState)) {
                if (stryMutAct_9fa48("96814")) {
                  {}
                } else {
                  stryCov_9fa48("96814");
                  // Directly set the replica state without going through transitions
                  // This is necessary because we're recovering from a persisted state
                  this._registerReplicaForRecovery(replicaId, stryMutAct_9fa48("96815") ? {} : (stryCov_9fa48("96815"), {
                    partitionId,
                    nodeId,
                    state: status,
                    serviceId: service.service_id
                  }));
                }
              }
              if (stryMutAct_9fa48("96818") ? status === ReplicaState.CREATING && status === ReplicaState.SYNCING : stryMutAct_9fa48("96817") ? false : stryMutAct_9fa48("96816") ? true : (stryCov_9fa48("96816", "96817", "96818"), (stryMutAct_9fa48("96820") ? status !== ReplicaState.CREATING : stryMutAct_9fa48("96819") ? false : (stryCov_9fa48("96819", "96820"), status === ReplicaState.CREATING)) || (stryMutAct_9fa48("96822") ? status !== ReplicaState.SYNCING : stryMutAct_9fa48("96821") ? false : (stryCov_9fa48("96821", "96822"), status === ReplicaState.SYNCING)))) {
                if (stryMutAct_9fa48("96823")) {
                  {}
                } else {
                  stryCov_9fa48("96823");
                  // Transition creating/syncing replicas to failed
                  const result = this.transition(replicaId, ReplicaState.FAILED, stryMutAct_9fa48("96824") ? {} : (stryCov_9fa48("96824"), {
                    partitionId,
                    nodeId,
                    reason: REPLICA_STATE_MACHINE_REASON.RECOVERY_INCOMPLETE,
                    errorMessage: REPLICA_STATE_MACHINE_ERROR_MSG.recoveryIncompleteOperation(status),
                    serviceId: service.service_id
                  }));
                  if (stryMutAct_9fa48("96827") ? result === true && result instanceof Promise && (await result) : stryMutAct_9fa48("96826") ? false : stryMutAct_9fa48("96825") ? true : (stryCov_9fa48("96825", "96826", "96827"), (stryMutAct_9fa48("96829") ? result !== true : stryMutAct_9fa48("96828") ? false : (stryCov_9fa48("96828", "96829"), result === (stryMutAct_9fa48("96830") ? false : (stryCov_9fa48("96830"), true)))) || (stryMutAct_9fa48("96832") ? result instanceof Promise || (await result) : stryMutAct_9fa48("96831") ? false : (stryCov_9fa48("96831", "96832"), result instanceof Promise && (await result))))) {
                    if (stryMutAct_9fa48("96833")) {
                      {}
                    } else {
                      stryCov_9fa48("96833");
                      if (stryMutAct_9fa48("96836") ? status !== ReplicaState.CREATING : stryMutAct_9fa48("96835") ? false : stryMutAct_9fa48("96834") ? true : (stryCov_9fa48("96834", "96835", "96836"), status === ReplicaState.CREATING)) {
                        if (stryMutAct_9fa48("96837")) {
                          {}
                        } else {
                          stryCov_9fa48("96837");
                          stryMutAct_9fa48("96838") ? creatingToFailed -= REPLICA_STATE_MACHINE_NUM.ONE : (stryCov_9fa48("96838"), creatingToFailed += REPLICA_STATE_MACHINE_NUM.ONE);
                        }
                      } else {
                        if (stryMutAct_9fa48("96839")) {
                          {}
                        } else {
                          stryCov_9fa48("96839");
                          stryMutAct_9fa48("96840") ? syncingToFailed -= REPLICA_STATE_MACHINE_NUM.ONE : (stryCov_9fa48("96840"), syncingToFailed += REPLICA_STATE_MACHINE_NUM.ONE);
                        }
                      }
                      this.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_TO_FAILED, stryMutAct_9fa48("96841") ? {} : (stryCov_9fa48("96841"), {
                        replicaId,
                        previousStatus: status,
                        nodeId
                      }));
                    }
                  }
                }
              } else if (stryMutAct_9fa48("96844") ? status !== ReplicaState.REMOVING : stryMutAct_9fa48("96843") ? false : stryMutAct_9fa48("96842") ? true : (stryCov_9fa48("96842", "96843", "96844"), status === ReplicaState.REMOVING)) {
                if (stryMutAct_9fa48("96845")) {
                  {}
                } else {
                  stryCov_9fa48("96845");
                  // Complete removal for removing replicas
                  const result = this.transition(replicaId, ReplicaState.REMOVED, stryMutAct_9fa48("96846") ? {} : (stryCov_9fa48("96846"), {
                    partitionId,
                    nodeId,
                    reason: REPLICA_STATE_MACHINE_REASON.RECOVERY_COMPLETE_REMOVAL,
                    serviceId: service.service_id
                  }));
                  if (stryMutAct_9fa48("96849") ? result === true && result instanceof Promise && (await result) : stryMutAct_9fa48("96848") ? false : stryMutAct_9fa48("96847") ? true : (stryCov_9fa48("96847", "96848", "96849"), (stryMutAct_9fa48("96851") ? result !== true : stryMutAct_9fa48("96850") ? false : (stryCov_9fa48("96850", "96851"), result === (stryMutAct_9fa48("96852") ? false : (stryCov_9fa48("96852"), true)))) || (stryMutAct_9fa48("96854") ? result instanceof Promise || (await result) : stryMutAct_9fa48("96853") ? false : (stryCov_9fa48("96853", "96854"), result instanceof Promise && (await result))))) {
                    if (stryMutAct_9fa48("96855")) {
                      {}
                    } else {
                      stryCov_9fa48("96855");
                      stryMutAct_9fa48("96856") ? removingToRemoved -= REPLICA_STATE_MACHINE_NUM.ONE : (stryCov_9fa48("96856"), removingToRemoved += REPLICA_STATE_MACHINE_NUM.ONE);
                      this.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_REMOVED, stryMutAct_9fa48("96857") ? {} : (stryCov_9fa48("96857"), {
                        replicaId,
                        nodeId
                      }));
                    }
                  }
                }
              }
            }
          } catch (error) {
            if (stryMutAct_9fa48("96858")) {
              {}
            } else {
              stryCov_9fa48("96858");
              this.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_FAILED, stryMutAct_9fa48("96859") ? {} : (stryCov_9fa48("96859"), {
                replicaId,
                status,
                error: error.message,
                nodeId
              }));
            }
          }
        }
      }
      const total = stryMutAct_9fa48("96860") ? creatingToFailed + syncingToFailed - removingToRemoved : (stryCov_9fa48("96860"), (stryMutAct_9fa48("96861") ? creatingToFailed - syncingToFailed : (stryCov_9fa48("96861"), creatingToFailed + syncingToFailed)) + removingToRemoved);
      this.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_COMPLETE, stryMutAct_9fa48("96862") ? {} : (stryCov_9fa48("96862"), {
        nodeId,
        creatingToFailed,
        syncingToFailed,
        removingToRemoved,
        total
      }));

      // Emit recovery complete event
      this.emit(REPLICA_STATE_MACHINE_EVENT.RECOVERY_COMPLETE, stryMutAct_9fa48("96863") ? {} : (stryCov_9fa48("96863"), {
        nodeId,
        creatingToFailed,
        syncingToFailed,
        removingToRemoved,
        total
      }));
      return stryMutAct_9fa48("96864") ? {} : (stryCov_9fa48("96864"), {
        nodeId,
        creatingToFailed,
        syncingToFailed,
        removingToRemoved,
        total
      });
    }
  }

  /**
   * Register a replica snapshot directly without transitional writes.
   * Used during bootstrap to seed in-memory state from already-created services
   * rows while avoiding synthetic CDC write storms.
   * @param {string} replicaId - Replica identifier.
   * @param {Object} context - Replica context.
   * @param {string} context.partitionId - Partition identifier.
   * @param {string} [context.nodeId] - Node identifier.
   * @param {string} [context.state] - Snapshot state (default: active).
   * @param {string} [context.serviceId] - Service ID for CDC linkage.
   * @param {string} [context.reason] - Trigger reason.
   * @return {boolean} True when registration succeeded.
   */
  registerReplicaSnapshot(replicaId, context = {}) {
    if (stryMutAct_9fa48("96865")) {
      {}
    } else {
      stryCov_9fa48("96865");
      if (stryMutAct_9fa48("96868") ? !replicaId && typeof replicaId !== 'string' : stryMutAct_9fa48("96867") ? false : stryMutAct_9fa48("96866") ? true : (stryCov_9fa48("96866", "96867", "96868"), (stryMutAct_9fa48("96869") ? replicaId : (stryCov_9fa48("96869"), !replicaId)) || (stryMutAct_9fa48("96871") ? typeof replicaId === 'string' : stryMutAct_9fa48("96870") ? false : (stryCov_9fa48("96870", "96871"), typeof replicaId !== (stryMutAct_9fa48("96872") ? "" : (stryCov_9fa48("96872"), 'string')))))) {
        if (stryMutAct_9fa48("96873")) {
          {}
        } else {
          stryCov_9fa48("96873");
          return stryMutAct_9fa48("96874") ? true : (stryCov_9fa48("96874"), false);
        }
      }
      if (stryMutAct_9fa48("96876") ? false : stryMutAct_9fa48("96875") ? true : (stryCov_9fa48("96875", "96876"), this.replicas.has(replicaId))) {
        if (stryMutAct_9fa48("96877")) {
          {}
        } else {
          stryCov_9fa48("96877");
          return stryMutAct_9fa48("96878") ? false : (stryCov_9fa48("96878"), true);
        }
      }
      const state = stryMutAct_9fa48("96881") ? context.state && ReplicaState.ACTIVE : stryMutAct_9fa48("96880") ? false : stryMutAct_9fa48("96879") ? true : (stryCov_9fa48("96879", "96880", "96881"), context.state || ReplicaState.ACTIVE);
      if (stryMutAct_9fa48("96884") ? false : stryMutAct_9fa48("96883") ? true : stryMutAct_9fa48("96882") ? Object.values(ReplicaState).includes(state) : (stryCov_9fa48("96882", "96883", "96884"), !Object.values(ReplicaState).includes(state))) {
        if (stryMutAct_9fa48("96885")) {
          {}
        } else {
          stryCov_9fa48("96885");
          this.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.INVALID_TRANSITION, stryMutAct_9fa48("96886") ? {} : (stryCov_9fa48("96886"), {
            replicaId,
            currentState: null,
            attemptedState: state,
            reason: context.reason,
            nodeId: this.nodeId
          }));
          this.emit(REPLICA_STATE_MACHINE_EVENT.TRANSITION_ERROR, stryMutAct_9fa48("96887") ? {} : (stryCov_9fa48("96887"), {
            code: REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE.INVALID_TRANSITION,
            replicaId,
            currentState: null,
            attemptedState: state,
            reason: context.reason,
            nodeId: this.nodeId
          }));
          return stryMutAct_9fa48("96888") ? true : (stryCov_9fa48("96888"), false);
        }
      }
      this._registerReplicaForRecovery(replicaId, stryMutAct_9fa48("96889") ? {} : (stryCov_9fa48("96889"), {
        partitionId: context.partitionId,
        nodeId: stryMutAct_9fa48("96892") ? context.nodeId && this.nodeId : stryMutAct_9fa48("96891") ? false : stryMutAct_9fa48("96890") ? true : (stryCov_9fa48("96890", "96891", "96892"), context.nodeId || this.nodeId),
        state,
        serviceId: stryMutAct_9fa48("96895") ? context.serviceId && null : stryMutAct_9fa48("96894") ? false : stryMutAct_9fa48("96893") ? true : (stryCov_9fa48("96893", "96894", "96895"), context.serviceId || null),
        triggerReason: stryMutAct_9fa48("96898") ? context.reason && REPLICA_STATE_MACHINE_REASON.RECOVERY_REGISTRATION : stryMutAct_9fa48("96897") ? false : stryMutAct_9fa48("96896") ? true : (stryCov_9fa48("96896", "96897", "96898"), context.reason || REPLICA_STATE_MACHINE_REASON.RECOVERY_REGISTRATION)
      }));
      return stryMutAct_9fa48("96899") ? false : (stryCov_9fa48("96899"), true);
    }
  }

  /**
   * Register a replica directly for recovery purposes.
   * This bypasses normal transition validation to restore state from persistence.
   * @param {string} replicaId - Replica identifier.
   * @param {Object} context - Replica context.
   * @param {string} context.partitionId - Partition identifier.
   * @param {string} context.nodeId - Node identifier.
   * @param {string} context.state - Current state from persistence.
   * @param {string} [context.serviceId] - Service ID for CDC.
   * @private
   */
  _registerReplicaForRecovery(replicaId, context) {
    if (stryMutAct_9fa48("96900")) {
      {}
    } else {
      stryCov_9fa48("96900");
      const now = this.now();
      const state = context.state;

      // Update state counts
      stryMutAct_9fa48("96901") ? this.stateCounts[state]-- : (stryCov_9fa48("96901"), this.stateCounts[state]++);

      // Create replica state entry
      const replicaState = stryMutAct_9fa48("96902") ? {} : (stryCov_9fa48("96902"), {
        replicaId,
        partitionId: context.partitionId,
        nodeId: stryMutAct_9fa48("96905") ? context.nodeId && this.nodeId : stryMutAct_9fa48("96904") ? false : stryMutAct_9fa48("96903") ? true : (stryCov_9fa48("96903", "96904", "96905"), context.nodeId || this.nodeId),
        state,
        stateEnteredAt: now,
        timeoutStartedAt: (stryMutAct_9fa48("96908") ? this.timeouts[state] !== undefined : stryMutAct_9fa48("96907") ? false : stryMutAct_9fa48("96906") ? true : (stryCov_9fa48("96906", "96907", "96908"), this.timeouts[state] === undefined)) ? null : now,
        previousState: null,
        triggerReason: stryMutAct_9fa48("96911") ? context.triggerReason && REPLICA_STATE_MACHINE_REASON.RECOVERY_REGISTRATION : stryMutAct_9fa48("96910") ? false : stryMutAct_9fa48("96909") ? true : (stryCov_9fa48("96909", "96910", "96911"), context.triggerReason || REPLICA_STATE_MACHINE_REASON.RECOVERY_REGISTRATION),
        errorMessage: null,
        metadata: {},
        serviceId: stryMutAct_9fa48("96914") ? context.serviceId && null : stryMutAct_9fa48("96913") ? false : stryMutAct_9fa48("96912") ? true : (stryCov_9fa48("96912", "96913", "96914"), context.serviceId || null),
        serviceType: stryMutAct_9fa48("96917") ? context.serviceType && SERVICE_TYPE.PARTITION : stryMutAct_9fa48("96916") ? false : stryMutAct_9fa48("96915") ? true : (stryCov_9fa48("96915", "96916", "96917"), context.serviceType || SERVICE_TYPE.PARTITION),
        serviceAddress: stryMutAct_9fa48("96920") ? context.serviceAddress && null : stryMutAct_9fa48("96919") ? false : stryMutAct_9fa48("96918") ? true : (stryCov_9fa48("96918", "96919", "96920"), context.serviceAddress || null)
      });
      this.replicas.set(replicaId, replicaState);
      this.logger.debug(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_REGISTERED, stryMutAct_9fa48("96921") ? {} : (stryCov_9fa48("96921"), {
        replicaId,
        state,
        nodeId: this.nodeId
      }));
    }
  }
}
export { ReplicaStateMachine, ReplicaState, VALID_TRANSITIONS, DEFAULT_TIMEOUTS };