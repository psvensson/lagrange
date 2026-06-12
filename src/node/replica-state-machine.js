/**
 * Replica State Machine - Formal state machine for replica lifecycle management.
 * Provides a single source of truth for replica status across all components.
 *
 * Requirements: 1.1, 1.2, 1.3, 2.1-2.8
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {TYPEOF} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {
  REPLICA_STATE_MACHINE_DEFAULT,
  REPLICA_STATE_MACHINE_DEFAULT_TIMEOUTS,
  REPLICA_STATE_MACHINE_ERROR_MSG,
  REPLICA_STATE_MACHINE_LOCAL_ONLY_ROW_RETRY_MAX_DELAY_MS,
  REPLICA_STATE_MACHINE_LOG_MSG,
  REPLICA_STATE_MACHINE_NOW,
  REPLICA_STATE_MACHINE_NUM,
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
  clearCanonicalPartitionLeaderIfNeeded,
  createReplicaRowInCdc,
  getControlPlaneSystemTableGateway,
  hasOtherActivePartitionReplicaOnLeaderNode,
  updateReplicaStateInCdc,
} from './replica-state-machine-transition.js';
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
  handleNodeRecovery,
  registerReplicaForRecovery,
  registerReplicaSnapshot,
} from './replica-state-machine-recovery.js';

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
    super();

    const loggingService = LoggingService.getInstance();
    const logger = loggingService.forSubsystem(REPLICA_STATE_MACHINE_SUBSYSTEM);

    this.nodeId = assertCritical(
      options.nodeId,
      REPLICA_STATE_MACHINE_ERROR_MSG.MISSING_NODE_ID,
    );

    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;
    assertCritical(
      this.cdcIntegrationService || this.controlPlaneSystemTableGateway,
      REPLICA_STATE_MACHINE_ERROR_MSG.MISSING_CDC_SERVICE,
    );
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      REPLICA_STATE_MACHINE_NOW;
    this.systemTableCache = options.systemTableCache || null;

    // CL-016: service rows seeded into the LOCAL cache by the priority
    // create fallback, whose durable write is still unconfirmed. The
    // lifecycle persistence path must UPSERT (not UPDATE) these until a
    // durable write commits, because the local cache no longer proxies
    // remote existence for them.
    this.localOnlyServiceRowIds = new Set();
    // CL-021: per-row retry backoff for converging those deferred durable
    // writes on the timeout-checker tick (serviceId -> {delayMs,
    // notBeforeMs}); entries clear with the local-only marker.
    this.localOnlyServiceRowRetryStateByServiceId = new Map();
    this.localOnlyServiceRowReconcileInFlight = false;

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
   * Finalize one replica removal after the authoritative services row has
   * already been deleted.
   * @param {string} replicaId - Replica identifier.
   * @param {Object} context - Additional context.
   * @return {boolean} True when local tracking was finalized.
   */
  completeDurableRemoval(replicaId, context = {}) {
    const existingState = this.replicas.get(replicaId);
    if (!existingState) {
      return true;
    }

    if (existingState.state === ReplicaState.REMOVED) {
      this.removeFromTracking(replicaId);
      return true;
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
    if (transitionResult !== true) {
      return false;
    }
    this.removeFromTracking(replicaId);
    return true;
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
    return removeFromTracking(this, replicaId);
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
    clear(this);
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

  _checkTimeouts() {
    return checkTimeouts(this);
  }

  checkTimeoutsNow() {
    return this._checkTimeouts();
  }

  /**
   * CL-016: mark a service row as seeded locally (durable write deferred);
   * lifecycle persistence will UPSERT instead of UPDATE for it until a
   * durable write commits.
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
   * idempotent UPSERT lifecycle persistence already uses for local-only
   * rows, and success clears the marker inside _updateReplicaStateInCdc.
   * @return {Promise<number>} Rows durably converged this pass.
   */
  async _reconcileLocalOnlyServiceRows() {
    if (
      this.localOnlyServiceRowReconcileInFlight === true ||
      this.localOnlyServiceRowIds.size === REPLICA_STATE_MACHINE_NUM.ZERO
    ) {
      return REPLICA_STATE_MACHINE_NUM.ZERO;
    }
    this.localOnlyServiceRowReconcileInFlight = true;
    let persisted = REPLICA_STATE_MACHINE_NUM.ZERO;
    try {
      for (const serviceId of [...this.localOnlyServiceRowIds]) {
        const nowMs = this.now();
        const retryState =
          this.localOnlyServiceRowRetryStateByServiceId.get(serviceId) ||
          null;
        if (retryState && nowMs < retryState.notBeforeMs) {
          continue;
        }
        const replicaState = this.replicas.get(serviceId) || null;
        if (!replicaState) {
          // The replica is no longer tracked — there is no local truth
          // left to converge durably; drop the marker so the set stays
          // bounded.
          this.clearServiceRowLocalOnly(serviceId);
          continue;
        }
        try {
          await this._updateReplicaStateInCdc(replicaState, replicaState);
          // The persistence helper cleared the marker (and this row's
          // retry state) on commit.
          persisted += REPLICA_STATE_MACHINE_NUM.ONE;
          this.logger.info(
            REPLICA_STATE_MACHINE_LOG_MSG.LOCAL_ONLY_ROW_CONVERGED,
            {
              replicaId: replicaState.replicaId,
              partitionId: replicaState.partitionId,
              state: replicaState.state,
              nodeId: this.nodeId,
            },
          );
        } catch (_error) {
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
      }
    } finally {
      this.localOnlyServiceRowReconcileInFlight = false;
    }
    return persisted;
  }

  async handleNodeRecovery(options = {}) {
    return handleNodeRecovery(this, options);
  }

  registerReplicaSnapshot(replicaId, context = {}) {
    return registerReplicaSnapshot(this, replicaId, context);
  }

  _registerReplicaForRecovery(replicaId, context) {
    registerReplicaForRecovery(this, replicaId, context);
  }
}

export {
  ReplicaStateMachine,
  ReplicaState,
  VALID_TRANSITIONS,
  DEFAULT_TIMEOUTS,
};
