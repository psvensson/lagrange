/**
 * Replica State Machine - Formal state machine for replica lifecycle management.
 * Provides a single source of truth for replica status across all components.
 *
 * Requirements: 1.1, 1.2, 1.3, 2.1-2.8
 */

import {resolveTimeSource} from '../time/time-source.js';
import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {
  REPLICA_STATE_MACHINE_DEFAULT,
  REPLICA_STATE_MACHINE_DEFAULT_TIMEOUTS,
  REPLICA_STATE_MACHINE_ERROR_MSG,
  REPLICA_STATE_MACHINE_LOCAL_ONLY_ROW_RETRY_MAX_DELAY_MS,
  REPLICA_STATE_MACHINE_NOW,
  REPLICA_STATE_MACHINE_NUM,
  REPLICA_STATE_MACHINE_REASON,
  REPLICA_STATE_MACHINE_STATE,
  REPLICA_STATE_MACHINE_SUBSYSTEM,
  REPLICA_STATE_MACHINE_VALID_TRANSITIONS,
} from './replica-state-machine-constants.js';
import {
  applyTransition,
  armTimeoutClock,
  buildCdcPersistenceOptions,
  buildCreateCdcData,
  buildUpdateCdcData,
  createReplicaRowInCdc,
  getControlPlaneSystemTableGateway,
  hasOtherActivePartitionReplicaOnLeaderNode,
  updateReplicaStateInCdc,
} from './replica-state-machine-transition.js';
import {
  reconcileLocalOnlyServiceRows,
} from './replica-state-machine-create-persistence.js';
import {
  clearCanonicalPartitionLeaderIfNeeded,
  hasCanonicalLeaderClearIdentity,
  settleCanonicalLeaderMutation,
} from
  './replica-state-machine-leader-clear.js';
import {
  canStartOperation,
  clear,
  getAllReplicas,
  getMetrics,
  getReplicasInState,
  getTransitionalReplicas,
  incrementTimeoutCount,
  initializeMetrics,
  removeFromTracking,
  resetMetrics,
  updatePeakConcurrentOperations,
} from './replica-state-machine-metrics.js';
import {
  checkTimeouts,
  startTimeoutChecker,
  stopTimeoutChecker,
} from './replica-state-machine-timeouts.js';
import {
  bindAuthoritativeRemovalAuthority,
  completeDurableRemovalWithAuthority,
  handleNodeRecovery,
  installAuthoritativeReplicaLifecycleInLane,
  registerReplicaSnapshot,
} from './replica-state-machine-recovery.js';
import {transitionAuthoritativeReplicaGeneration} from
  './replica-state-machine-authoritative-transition.js';
import {
  observeAuthoritativeReplicaLifecycle,
  rowMatchesReplicaLifecycle,
} from './replica-state-machine-lifecycle-observation.js';
import {activateRegisteredReplica} from
  './replica-state-machine-registered-activation.js';
import {
  captureReplicaAdmission,
  getReplicaRevision,
  isCanonicalLeaderClearSettled,
  isReplicaAdmissionCurrent,
  recordCanonicalLeaderClearSettlement,
  runHandlerBoundActivation,
  runReplicaHandlerRetirement,
  runSerializedReplicaMutation,
} from './replica-state-machine-serialization.js';

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

const REPLICA_LIFECYCLE_OWNER_INCARNATION_FIELD = 'ownerIncarnation';

/**
 * Stamp a replica lifecycle authority with the node boot incarnation that
 * owns it, read-only: an owner minted for incarnation G is never reused for
 * G+1 (ReplicaLifecycleOwner fences on it). 0 means pre-incarnation.
 * @param {Object} target - ReplicaStateMachine or ReplicaHandler.
 * @param {number} [ownerIncarnation]
 */
function defineReplicaLifecycleOwnerIncarnation(target, ownerIncarnation) {
  Object.defineProperty(target, REPLICA_LIFECYCLE_OWNER_INCARNATION_FIELD, {
    value: Number.isSafeInteger(ownerIncarnation) && ownerIncarnation > 0 ?
      ownerIncarnation :
      0,
    enumerable: true,
    writable: false,
    configurable: false,
  });
}

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
   * @param {number} [options.ownerIncarnation] - Owning node boot incarnation.
   */
  constructor(options = {}) {
    super();

    const loggingService = LoggingService.getInstance();
    const logger = loggingService.forSubsystem(REPLICA_STATE_MACHINE_SUBSYSTEM);

    this.nodeId = assertCritical(
      options.nodeId,
      REPLICA_STATE_MACHINE_ERROR_MSG.MISSING_NODE_ID,
    );
    defineReplicaLifecycleOwnerIncarnation(this, options.ownerIncarnation);

    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;
    assertCritical(
      this.cdcIntegrationService || this.controlPlaneSystemTableGateway,
      REPLICA_STATE_MACHINE_ERROR_MSG.MISSING_CDC_SERVICE,
    );
    // Timers run on the node's canonical time source (RealTimeSource when none
    // is given, i.e. the host timers); an explicit now() still wins for stamps.
    this.timeSource = resolveTimeSource({timeSource: options.timeSource});
    this.now = typeof options.now === 'function' ?
      options.now :
      options.timeSource ? () => this.timeSource.now() : REPLICA_STATE_MACHINE_NOW;
    this.systemTableCache = options.systemTableCache || null;

    // CL-016: service rows seeded into the LOCAL cache by the priority
    // create fallback, whose durable write is still unconfirmed. Their
    // dedicated reconcile owner may INSERT; lifecycle transitions remain
    // conditional UPDATEs bound to the tracked source generation.
    this.localOnlyServiceRowIds = new Set();
    // CL-021: per-row retry backoff for converging those deferred durable
    // writes on the timeout-checker tick (serviceId -> {delayMs,
    // notBeforeMs}); entries clear with the local-only marker.
    this.localOnlyServiceRowRetryStateByServiceId = new Map();
    this.localOnlyServiceRowReconcileInFlight = false;
    // CL-021: per-row durable-write serialization between transition
    // persistence and the local-only reconcile (serviceId -> in-flight
    // persist promise). Unserialized, the slower write lands second and
    // can regress the durable row to an older state.
    this.serviceRowPersistInFlightByServiceId = new Map();
    // Monotonic per-replica source revision for transition admission. Every
    // tracked-state mutation advances it, including direct hydration/removal,
    // so queued intents cannot survive ABA state changes or out-of-band writes.
    this.replicaRevisionByReplicaId = new Map();
    this.uncertainRemovingIntentByReplicaId = new Map();
    this.canonicalLeaderClearDebtByReplicaId = new Map();
    this.canonicalLeaderClearSettlementByReplicaId = new Map();
    this.replicaMutationAdmissionClosed = false;
    this.clearInFlight = null;

    this.replicas = new Map();
    this.stateCounts = {
      [ReplicaState.PENDING]: REPLICA_STATE_MACHINE_NUM.ZERO,
      [ReplicaState.CREATING]: REPLICA_STATE_MACHINE_NUM.ZERO,
      [ReplicaState.SYNCING]: REPLICA_STATE_MACHINE_NUM.ZERO,
      [ReplicaState.ACTIVE]: REPLICA_STATE_MACHINE_NUM.ZERO,
      [ReplicaState.REMOVING]: REPLICA_STATE_MACHINE_NUM.ZERO,
      [ReplicaState.REMOVED]: REPLICA_STATE_MACHINE_NUM.ZERO,
      [ReplicaState.FAILED]: REPLICA_STATE_MACHINE_NUM.ZERO,
    };

    this.timeouts = {
      [ReplicaState.PENDING]: options.pendingTimeoutMs ??
        DEFAULT_TIMEOUTS[ReplicaState.PENDING],
      [ReplicaState.CREATING]: options.creatingTimeoutMs ??
        DEFAULT_TIMEOUTS[ReplicaState.CREATING],
      [ReplicaState.SYNCING]: options.syncingTimeoutMs ??
        DEFAULT_TIMEOUTS[ReplicaState.SYNCING],
      [ReplicaState.REMOVING]: options.removingTimeoutMs ??
        DEFAULT_TIMEOUTS[ReplicaState.REMOVING],
    };

    this.timeoutCheckIntervalMs = options.timeoutCheckIntervalMs ??
      REPLICA_STATE_MACHINE_DEFAULT.TIMEOUT_CHECK_INTERVAL_MS;
    this.timeoutCheckInterval = null;
    this.limits = {
      maxConcurrentAdds: options.maxConcurrentAdds ??
        REPLICA_STATE_MACHINE_DEFAULT.MAX_CONCURRENT_ADDS,
      maxConcurrentRemoves: options.maxConcurrentRemoves ??
        REPLICA_STATE_MACHINE_DEFAULT.MAX_CONCURRENT_REMOVES,
    };

    this._initializeMetrics();
    this.logger = logger;
  }

  _initializeMetrics() {
    initializeMetrics(this);
  }

  /**
   * Check if a transition is valid.
   * @param {string|null} currentState - Current state (or null for new replica).
   * @param {string} newState - Target state.
   * @return {boolean} True if transition is valid.
   */
  isValidTransition(currentState, newState) {
    const validNextStates = VALID_TRANSITIONS[currentState];

    if (validNextStates === undefined) {
      return false;
    }

    return validNextStates.includes(newState);
  }

  /**
   * Transition a replica to a new state.
   * Persists state to CDC.
   * @param {string} replicaId - Replica identifier.
   * @param {string} newState - Target state.
   * @param {Object} context - Additional context.
   * @return {boolean|Promise<boolean>} True if transition succeeded.
   */
  transition(replicaId, newState, context = {}) {
    return this._applyTransition(replicaId, newState, context, {
      persist: true,
      validate: true,
    });
  }

  /**
   * Activate one INSERT-only bootstrap/join registration through the lifecycle
   * owner. The activation is serialized with ordinary lifecycle transitions
   * and is fenced by the exact durable STOPPED generation.
   * @param {Object} options - Registered row identity and mutation writer.
   * @return {Promise<Object>} The exact durably active row.
   */
  activateRegisteredReplica(options = {}) {
    return activateRegisteredReplica(this, options);
  }

  /**
   * Run an activation bound to the replica's exact transport handler in the
   * replica's lifecycle lane (owner decision N2): the handler check and the
   * ACTIVE effect share the activation effect section.
   * @param {string} replicaId
   * @param {Object} activation - {resolveSource, requireHandler, effect}.
   * @return {*|Promise<*>} The effect's result; false when admission closed.
   */
  runHandlerBoundActivation(replicaId, activation) {
    return runHandlerBoundActivation(this, replicaId, activation);
  }

  /**
   * Remove a replica's transport handler against the activation effect
   * boundary, so it cannot interleave between an activation's in-lane
   * exact-handler check and the settle of its ACTIVE CAS.
   * @param {string} replicaId
   * @param {Function} retire - Synchronous handler removal.
   * @return {Promise<boolean>}
   */
  retireReplicaHandler(replicaId, retire) {
    return runReplicaHandlerRetirement(this, replicaId, retire);
  }

  /**
   * Apply cross-node intent through exact authoritative lifecycle evidence.
   * @param {Object} evidence Exact observed source lifecycle row.
   * @param {string} newState Destination lifecycle state.
   * @param {Object} context Transition context.
   * @return {Promise<boolean>} True only for the exact destination generation.
   */
  transitionAuthoritativeReplicaGeneration(
    evidence,
    newState,
    context = {},
  ) {
    return transitionAuthoritativeReplicaGeneration(
      this,
      evidence,
      newState,
      context,
    );
  }

  /**
   * Re-enter CREATE after the durable operation owner explicitly re-dispatches
   * a replica whose previous participant attempt reached FAILED.
   *
   * This is deliberately not a global FAILED -> CREATING transition. FAILED
   * remains terminal for ordinary lifecycle transitions and canonical REMOVE
   * retains deletion authority. The explicit CREATE command is the replay
   * authority, and the handler must first prove that no runtime is tracked.
   * @param {string} replicaId - Replica identifier.
   * @param {Object} context - Additional transition context.
   * @param {Object} options - Persistence options.
   * @return {boolean|Promise<boolean>} True when replay was admitted.
   */
  restartFailedCreate(replicaId, context = {}, options = {}) {
    const existingState = this.replicas.get(replicaId);
    if (existingState?.state !== ReplicaState.FAILED) {
      return false;
    }
    return this._applyTransition(
      replicaId,
      ReplicaState.CREATING,
      {
        ...context,
        reason: REPLICA_STATE_MACHINE_REASON.CREATE_REDRIVE,
      },
      {
        persist: options.persist !== false,
        validate: false,
      },
    );
  }

  /**
   * Finalize one replica removal after the authoritative services row has
   * already been deleted.
   * @param {string} replicaId - Replica identifier.
   * @param {Object} context - Additional context.
   * @return {boolean|Promise<boolean>} True when local tracking was finalized.
   */
  completeDurableRemoval(replicaId, context = {}) {
    if (this.canonicalLeaderClearDebtByReplicaId.has(replicaId)) {
      return false;
    }
    const existingState = this.replicas.get(replicaId);
    if (!existingState) {
      return false;
    }

    if (existingState.state === ReplicaState.REMOVING &&
        !isCanonicalLeaderClearSettled(this, replicaId)) {
      return false;
    }

    if (existingState.state === ReplicaState.REMOVED) {
      return this.removeFromTracking(replicaId);
    }

    if (existingState.state !== ReplicaState.REMOVING) {
      return false;
    }

    const transitionResult = this._applyTransition(
      replicaId,
      ReplicaState.REMOVED,
      context,
      {
        persist: false,
        validate: false,
      },
    );
    const finishRemoval = (result) => result === true ?
      this.removeFromTracking(replicaId) : false;
    return transitionResult instanceof Promise ?
      transitionResult.then(finishRemoval) : finishRemoval(transitionResult);
  }

  completeDurableRemovalWithAuthority(
    replicaId,
    authority,
    action,
    onComplete,
    context = {},
  ) {
    return completeDurableRemovalWithAuthority(
      this,
      replicaId,
      authority,
      action,
      onComplete,
      context,
    );
  }

  _applyTransition(replicaId, newState, context = {}, options = {}) {
    return applyTransition(this, replicaId, newState, context, options);
  }

  async _createReplicaRowInCdc(replicaState) {
    return createReplicaRowInCdc(this, replicaState);
  }

  async _updateReplicaStateInCdc(replicaState, previousState) {
    return updateReplicaStateInCdc(this, replicaState, previousState);
  }

  async _clearCanonicalPartitionLeaderIfNeeded(replicaState) {
    return clearCanonicalPartitionLeaderIfNeeded(this, replicaState);
  }

  hasOtherActivePartitionReplicaOnLeaderNode(replicaState) {
    return hasOtherActivePartitionReplicaOnLeaderNode(this, replicaState);
  }

  _armTimeoutClock(replicaId) {
    armTimeoutClock(this, replicaId);
  }

  _buildUpdateCdcData(replicaState, previousState) {
    return buildUpdateCdcData(replicaState, previousState);
  }

  _buildCreateCdcData(replicaState, serviceId, serviceType, address) {
    return buildCreateCdcData(
      this,
      replicaState,
      serviceId,
      serviceType,
      address,
    );
  }

  _buildCdcPersistenceOptions(replicaState, serviceId) {
    return buildCdcPersistenceOptions(replicaState, serviceId);
  }

  getState(replicaId) {
    return this.replicas.get(replicaId) || null;
  }

  getStateCounts() {
    return {...this.stateCounts};
  }

  getReplicasInState(state) {
    return getReplicasInState(this, state);
  }

  getAllReplicas() {
    return getAllReplicas(this);
  }

  getTransitionalReplicas() {
    return getTransitionalReplicas(this);
  }

  canStartOperation(operationType) {
    return canStartOperation(this, operationType);
  }

  getLimits() {
    return {...this.limits};
  }

  removeFromTracking(replicaId) {
    const admission = captureReplicaAdmission(this, replicaId);
    return runSerializedReplicaMutation(this, replicaId, () => {
      if (!isReplicaAdmissionCurrent(this, replicaId, admission)) {
        return false;
      }
      return removeFromTracking(this, replicaId);
    });
  }

  _updatePeakConcurrentOperations() {
    updatePeakConcurrentOperations(this);
  }

  incrementTimeoutCount() {
    incrementTimeoutCount(this);
  }

  getMetrics() {
    return getMetrics(this);
  }

  resetMetrics() {
    resetMetrics(this);
  }

  clear() {
    return clear(this);
  }

  getControlPlaneSystemTableGateway() {
    return getControlPlaneSystemTableGateway(this);
  }

  getTimeout(state) {
    return this.timeouts[state] ?? null;
  }

  startTimeoutChecker() {
    startTimeoutChecker(this);
  }

  stopTimeoutChecker() {
    stopTimeoutChecker(this);
  }

  isTimeoutCheckerArmed() {
    return this.timeoutCheckInterval !== null;
  }

  _checkTimeouts() {
    return checkTimeouts(this);
  }

  checkTimeoutsNow() {
    return this._checkTimeouts();
  }

  /**
   * CL-021 deferred durable services-row retry, on demand: the same
   * reconcile pass the timeout-checker tick runs, for an owner that has
   * evidence the row is still missing remotely (a partition learner whose
   * promotion proof was refused learner_address_unresolvable). The pass's
   * own bounds apply unchanged — per-row backoff, the in-flight guard and
   * the transition-persist race guard — so a kick can never write more
   * often than the tick would.
   * @return {Promise<number>} Rows durably converged this pass.
   */
  reconcileLocalOnlyServiceRowsNow() {
    return this._reconcileLocalOnlyServiceRows();
  }

  /**
   * CL-016: mark a service row as seeded locally (durable write deferred).
   * Only the dedicated reconcile owner may INSERT that missing generation.
   * @param {string} serviceId
   * @return {void}
   */
  markServiceRowLocalOnly(serviceId) {
    if (serviceId) {
      this.localOnlyServiceRowIds.add(serviceId);
    }
  }

  /**
   * @param {string} serviceId
   * @return {boolean}
   */
  isServiceRowLocalOnly(serviceId) {
    return this.localOnlyServiceRowIds.has(serviceId);
  }

  /**
   * A durable write committed for this service row — remote existence is
   * confirmed, normal UPDATE semantics resume.
   * @param {string} serviceId
   * @return {void}
   */
  clearServiceRowLocalOnly(serviceId) {
    this.localOnlyServiceRowIds.delete(serviceId);
    this.localOnlyServiceRowRetryStateByServiceId.delete(serviceId);
  }

  /**
   * Arm (or extend) the per-row exponential backoff after a reconcile
   * pass that did not confirm a durable apply — thrown or returned
   * (CL-021: retained marker means retry, never silent convergence).
   * @param {string} serviceId
   * @param {?{delayMs: number, notBeforeMs: number}} retryState
   * @param {number} nowMs
   * @return {void}
   */
  _armLocalOnlyServiceRowRetry(serviceId, retryState, nowMs) {
    const previousDelayMs =
      retryState?.delayMs ?? this.timeoutCheckIntervalMs;
    const delayMs = Math.min(
      previousDelayMs * REPLICA_STATE_MACHINE_NUM.TWO,
      REPLICA_STATE_MACHINE_LOCAL_ONLY_ROW_RETRY_MAX_DELAY_MS,
    );
    this.localOnlyServiceRowRetryStateByServiceId.set(serviceId, {
      delayMs,
      notBeforeMs: nowMs + delayMs,
    });
  }

  /**
   * CL-021: converge deferred durable services rows. A priority replica
   * activated via the local-commit fallback (CL-016) defers its durable
   * services-row write because that write goes through the very control
   * plane being recovered — and when the replica's FINAL state transition
   * is the one that deferred, nothing ever retried: the row stayed
   * local-only forever, spread planners on other nodes never saw the
   * replica as ready, and priority spread recovery wedged planning
   * REPLACEs from already-retired sources into the safety guard (the
   * mode=load ACTIVE-wait surface). Runs on the existing timeout-checker
   * tick; per-row exponential backoff bounds the failure-log rate while
   * the control plane is still recovering. The durable write is the same
   * insert-only lifecycle admission already uses for local-only
   * rows, and success clears the marker inside _updateReplicaStateInCdc.
   * @return {Promise<number>} Rows durably converged this pass.
   */
  async _reconcileLocalOnlyServiceRows() {
    return reconcileLocalOnlyServiceRows(this);
  }

  /**
   * Retry leader-row cleanup after an authoritative lifecycle generation was
   * already durably applied. The lifecycle transition stays committed; this
   * queue only converges its recorded cross-owner side-effect debt.
   * @return {Promise<number>} Debt entries cleared in this pass.
   */
  async reconcileCanonicalLeaderClearDebtNow() {
    let reconciled = REPLICA_STATE_MACHINE_NUM.ZERO;
    for (const [replicaId, debt] of
      [...this.canonicalLeaderClearDebtByReplicaId.entries()]) {
      const settled = await this.settleCanonicalLeaderClearDebt(replicaId);
      if (settled === true &&
          this.canonicalLeaderClearDebtByReplicaId.get(replicaId) !== debt) {
        reconciled += REPLICA_STATE_MACHINE_NUM.ONE;
      }
    }
    return reconciled;
  }

  /**
   * Settle leader clearing for one exact lifecycle generation. Thrown,
   * deferred and non-applied outcomes retain debt; a different lifecycle
   * generation fences execution without pretending the old debt settled.
   * @param {string} replicaId
   * @return {Promise<boolean>} True only when no leader-clear debt remains.
   */
  async settleCanonicalLeaderClearDebt(replicaId) {
    let debt = this.canonicalLeaderClearDebtByReplicaId.get(replicaId);
    if (!debt) {
      const currentState = this.replicas.get(replicaId) || null;
      if (!hasCanonicalLeaderClearIdentity(currentState)) {
        return false;
      }
      if (isCanonicalLeaderClearSettled(this, replicaId)) {
        return true;
      }
      // A restart legitimately loses the in-memory side-effect record while
      // the durable REMOVING row remains its reconstructible authority.
      debt = Object.freeze({
        replicaState: currentState,
        revision: getReplicaRevision(this, replicaId),
      });
      this.canonicalLeaderClearDebtByReplicaId.set(replicaId, debt);
    }
    return Promise.resolve(runSerializedReplicaMutation(
      this,
      replicaId,
      async () => {
        if (this.canonicalLeaderClearDebtByReplicaId.get(replicaId) !== debt) {
          return false;
        }
        const currentState = this.replicas.get(replicaId) || null;
        if (getReplicaRevision(this, replicaId) !== debt.revision ||
            currentState !== debt.replicaState) {
          return false;
        }
        const lifecycleObservation =
          await observeAuthoritativeReplicaLifecycle(this, replicaId);
        if (lifecycleObservation.available !== true) return false;
        if (!rowMatchesReplicaLifecycle(
          lifecycleObservation.row,
          debt.replicaState,
        )) {
          if (lifecycleObservation.row) {
            installAuthoritativeReplicaLifecycleInLane(
              this,
              replicaId,
              lifecycleObservation.row,
            );
          }
          return false;
        }
        try {
          if (await settleCanonicalLeaderMutation(
            this,
            debt.replicaState,
          ) !== true) return false;
        } catch (_error) {
          return false;
        }
        if (this.canonicalLeaderClearDebtByReplicaId.get(replicaId) === debt) {
          this.canonicalLeaderClearDebtByReplicaId.delete(replicaId);
        }
        recordCanonicalLeaderClearSettlement(
          this,
          replicaId,
          debt.replicaState,
          debt.revision,
        );
        return true;
      },
    ));
  }

  async handleNodeRecovery(options = {}) {
    return handleNodeRecovery(this, options);
  }

  bindAuthoritativeRemovalAuthority(replicaId, context = {}) {
    return bindAuthoritativeRemovalAuthority(this, replicaId, context);
  }

  observeAuthoritativeReplicaLifecycle(replicaId) {
    return observeAuthoritativeReplicaLifecycle(this, replicaId);
  }

  registerReplicaSnapshot(replicaId, context = {}) {
    return registerReplicaSnapshot(this, replicaId, context);
  }
}

export {
  ReplicaStateMachine,
  ReplicaState,
  defineReplicaLifecycleOwnerIncarnation,
  VALID_TRANSITIONS,
  DEFAULT_TIMEOUTS,
};
