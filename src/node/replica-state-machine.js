/**
 * Replica State Machine - Formal state machine for replica lifecycle management.
 * Provides a single source of truth for replica status across all components.
 *
 * Requirements: 1.1, 1.2, 1.3, 2.1-2.8
 */

import {EventEmitter} from 'events';
import {AddressManager} from '../address/address-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {SERVICE_TYPE, TABLES, TYPEOF} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {
  REPLICA_STATE_MACHINE_DEFAULT,
  REPLICA_STATE_MACHINE_DEFAULT_TIMEOUTS,
  REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE,
  REPLICA_STATE_MACHINE_ERROR_MSG,
  REPLICA_STATE_MACHINE_EVENT,
  REPLICA_STATE_MACHINE_EVENT_TYPE,
  REPLICA_STATE_MACHINE_LOG_MSG,
  REPLICA_STATE_MACHINE_NOW,
  REPLICA_STATE_MACHINE_NUM,
  REPLICA_STATE_MACHINE_OPERATION,
  REPLICA_STATE_MACHINE_REASON,
  REPLICA_STATE_MACHINE_STATE,
  REPLICA_STATE_MACHINE_SUBSYSTEM,
  REPLICA_STATE_MACHINE_TRANSITION,
  REPLICA_STATE_MACHINE_VALID_TRANSITIONS,
} from './replica-state-machine-constants.js';

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

const BACKGROUND_PERSISTENCE_STATES = new Set([
  ReplicaState.PENDING,
  ReplicaState.CREATING,
  ReplicaState.SYNCING,
  ReplicaState.REMOVING,
]);
const CLEARS_CANONICAL_PARTITION_LEADER_STATES = new Set([
  ReplicaState.REMOVING,
  ReplicaState.REMOVED,
  ReplicaState.FAILED,
]);

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

    // CDC integration service for state persistence
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

    // State tracking: Map<replicaId, ReplicaStateInfo>
    this.replicas = new Map();

    // State counts for quick lookup
    this.stateCounts = {
      [ReplicaState.PENDING]: REPLICA_STATE_MACHINE_NUM.ZERO,
      [ReplicaState.CREATING]: REPLICA_STATE_MACHINE_NUM.ZERO,
      [ReplicaState.SYNCING]: REPLICA_STATE_MACHINE_NUM.ZERO,
      [ReplicaState.ACTIVE]: REPLICA_STATE_MACHINE_NUM.ZERO,
      [ReplicaState.REMOVING]: REPLICA_STATE_MACHINE_NUM.ZERO,
      [ReplicaState.REMOVED]: REPLICA_STATE_MACHINE_NUM.ZERO,
      [ReplicaState.FAILED]: REPLICA_STATE_MACHINE_NUM.ZERO,
    };

    // Timeout configuration (ms)
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

    // Timeout check interval (default 5 seconds)
    this.timeoutCheckIntervalMs = options.timeoutCheckIntervalMs ??
      REPLICA_STATE_MACHINE_DEFAULT.TIMEOUT_CHECK_INTERVAL_MS;

    // Timeout checker interval handle
    this.timeoutCheckInterval = null;

    // Concurrent operation limits
    this.limits = {
      maxConcurrentAdds: options.maxConcurrentAdds ??
        REPLICA_STATE_MACHINE_DEFAULT.MAX_CONCURRENT_ADDS,
      maxConcurrentRemoves: options.maxConcurrentRemoves ??
        REPLICA_STATE_MACHINE_DEFAULT.MAX_CONCURRENT_REMOVES,
    };

    // Metrics tracking
    this._initializeMetrics();

    // Logging - reuse the logger from deprecation warning
    this.logger = logger;
  }

  /**
   * Initialize metrics tracking structures.
   * @private
   */
  _initializeMetrics() {
    // Transition counts: Map<'fromState->toState', count>
    this.transitionCounts = new Map();

    // Time spent in each state: Map<state, totalMs>
    this.timeInState = new Map();
    for (const state of Object.values(ReplicaState)) {
      this.timeInState.set(state, REPLICA_STATE_MACHINE_NUM.ZERO);
    }

    // Failure and timeout counts
    this.failureCount = REPLICA_STATE_MACHINE_NUM.ZERO;
    this.timeoutCount = REPLICA_STATE_MACHINE_NUM.ZERO;

    // Peak concurrent operations
    this.peakConcurrentAdds = REPLICA_STATE_MACHINE_NUM.ZERO;
    this.peakConcurrentRemoves = REPLICA_STATE_MACHINE_NUM.ZERO;
  }

  /**
   * Check if a transition is valid.
   * @param {string|null} currentState - Current state (or null for new replica).
   * @param {string} newState - Target state.
   * @return {boolean} True if transition is valid.
   */
  isValidTransition(currentState, newState) {
    const validNextStates = VALID_TRANSITIONS[currentState];

    // If currentState is not in the matrix, it's invalid
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
   * @param {string} context.partitionId - Partition identifier.
   * @param {string} context.nodeId - Node identifier.
   * @param {string} context.reason - Trigger reason.
   * @param {string} [context.errorMessage] - Error message (for failed state).
   * @param {Object} [context.metadata] - Additional metadata.
   * @param {string} [context.serviceId] - Service ID for CDC persistence.
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
   * already been deleted. This updates local lifecycle tracking without
   * attempting a second CDC write against a row that no longer exists.
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
    const existingState = this.replicas.get(replicaId);
    const currentState = existingState ? existingState.state : null;
    const validate = options.validate !== false;
    const persist = options.persist !== false;

    // Validate transition
    if (validate && !this.isValidTransition(currentState, newState)) {
      this.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.INVALID_TRANSITION, {
        replicaId,
        currentState,
        attemptedState: newState,
        reason: context.reason,
        nodeId: this.nodeId,
      });

      this.emit(REPLICA_STATE_MACHINE_EVENT.TRANSITION_ERROR, {
        code: REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE.INVALID_TRANSITION,
        replicaId,
        currentState,
        attemptedState: newState,
        reason: context.reason,
        nodeId: this.nodeId,
      });

      return false;
    }

    const now = this.now();
    const previousState = currentState;
    const timeInPreviousState = existingState ?
      now - existingState.stateEnteredAt : REPLICA_STATE_MACHINE_NUM.ZERO;

    // Update state counts
    if (previousState !== null) {
      this.stateCounts[previousState]--;
    }
    this.stateCounts[newState]++;

    // Track metrics: transition counts
    const transitionKey =
      `${previousState}${REPLICA_STATE_MACHINE_TRANSITION.SEPARATOR}${newState}`;
    const currentTransitionCount = this.transitionCounts.get(transitionKey) ||
      REPLICA_STATE_MACHINE_NUM.ZERO;
    this.transitionCounts.set(
      transitionKey,
      currentTransitionCount + REPLICA_STATE_MACHINE_NUM.ONE,
    );

    // Track metrics: time spent in previous state
    if (previousState !== null && timeInPreviousState > REPLICA_STATE_MACHINE_NUM.ZERO) {
      const currentTimeInState = this.timeInState.get(previousState) ||
        REPLICA_STATE_MACHINE_NUM.ZERO;
      this.timeInState.set(previousState, currentTimeInState + timeInPreviousState);
    }

    // Track metrics: failure count
    if (newState === ReplicaState.FAILED) {
      this.failureCount++;
    }

    // Track metrics: peak concurrent operations
    this._updatePeakConcurrentOperations();

    // Create or update replica state
    const replicaState = {
      replicaId,
      partitionId: context.partitionId || existingState?.partitionId || null,
      nodeId: context.nodeId || existingState?.nodeId || this.nodeId,
      state: newState,
      stateEnteredAt: now,
      timeoutStartedAt: null,
      previousState,
      triggerReason: context.reason || REPLICA_STATE_MACHINE_REASON.UNKNOWN,
      errorMessage: context.errorMessage || null,
      metadata: context.metadata || existingState?.metadata || {},
      serviceId: context.serviceId || existingState?.serviceId || null,
      serviceType: context.serviceType || existingState?.serviceType || SERVICE_TYPE.PARTITION,
      serviceAddress: context.serviceAddress || existingState?.serviceAddress || null,
    };

    this.replicas.set(replicaId, replicaState);

    this.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.STATE_TRANSITION, {
      replicaId,
      previousState,
      newState,
      reason: context.reason,
      nodeId: this.nodeId,
    });

    // Emit state transition event
    this.emit(REPLICA_STATE_MACHINE_EVENT.STATE_TRANSITION, {
      eventType: REPLICA_STATE_MACHINE_EVENT_TYPE.REPLICA_STATE_TRANSITION,
      replicaId,
      partitionId: replicaState.partitionId,
      nodeId: replicaState.nodeId,
      previousState,
      newState,
      timestamp: now,
      triggerReason: replicaState.triggerReason,
      errorMessage: replicaState.errorMessage,
      timeInPreviousState,
    });

    if (!persist) {
      this._armTimeoutClock(replicaId);
      return true;
    }

    const persistenceResult = previousState === null ?
      this._createReplicaRowInCdc(replicaState) :
      this._updateReplicaStateInCdc(replicaState, previousState);

    return Promise.resolve(persistenceResult).then((result) => {
      this._armTimeoutClock(replicaId);
      return result;
    });
  }

  /**
   * Create the initial services row for a newly tracked replica.
   * @param {Object} replicaState - The replica state to persist.
   * @return {Promise<boolean>} True if persistence succeeded.
   * @private
   */
  async _createReplicaRowInCdc(replicaState) {
    try {
      const serviceId = replicaState.serviceId || replicaState.replicaId;
      const addressManager = AddressManager.getInstance();
      const serviceType = replicaState.serviceType || SERVICE_TYPE.PARTITION;
      const address = replicaState.serviceAddress ||
        addressManager.format(replicaState.nodeId, serviceType, serviceId);
      const insertData = this._buildCreateCdcData(
        replicaState,
        serviceId,
        serviceType,
        address,
      );
      const persistenceOptions = this._buildCdcPersistenceOptions(
        replicaState,
        serviceId,
      );

      await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
        tableName: TABLES.SERVICES,
        row: insertData,
      }, persistenceOptions);

      this.logger.debug(REPLICA_STATE_MACHINE_LOG_MSG.STATE_PERSISTED, {
        replicaId: replicaState.replicaId,
        state: replicaState.state,
        nodeId: this.nodeId,
      });

      return true;
    } catch (error) {
      this.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.STATE_PERSIST_FAILED, {
        replicaId: replicaState.replicaId,
        state: replicaState.state,
        error: error.message,
        nodeId: this.nodeId,
      });

      this.emit(REPLICA_STATE_MACHINE_EVENT.PERSISTENCE_ERROR, {
        replicaId: replicaState.replicaId,
        state: replicaState.state,
        error: error.message,
      });

      throw error;
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
    try {
      const serviceId = replicaState.serviceId || replicaState.replicaId;
      const persistenceOptions = this._buildCdcPersistenceOptions(
        replicaState,
        serviceId,
      );
      await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.SERVICES,
        whereClause: {service_id: serviceId},
        data: this._buildUpdateCdcData(replicaState, previousState),
      }, persistenceOptions);

      this.logger.debug(REPLICA_STATE_MACHINE_LOG_MSG.STATE_PERSISTED, {
        replicaId: replicaState.replicaId,
        state: replicaState.state,
        nodeId: this.nodeId,
      });

      return true;
    } catch (error) {
      this.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.STATE_PERSIST_FAILED, {
        replicaId: replicaState.replicaId,
        state: replicaState.state,
        error: error.message,
        nodeId: this.nodeId,
      });

      this.emit(REPLICA_STATE_MACHINE_EVENT.PERSISTENCE_ERROR, {
        replicaId: replicaState.replicaId,
        state: replicaState.state,
        error: error.message,
      });

      throw error;
    }
  }

  async _clearCanonicalPartitionLeaderIfNeeded(replicaState) {
    if (!replicaState ||
        replicaState.serviceType !== SERVICE_TYPE.PARTITION ||
        !CLEARS_CANONICAL_PARTITION_LEADER_STATES.has(replicaState.state) ||
        typeof replicaState.partitionId !== TYPEOF.STRING ||
        replicaState.partitionId.length === 0 ||
        typeof replicaState.nodeId !== TYPEOF.STRING ||
        replicaState.nodeId.length === 0) {
      return;
    }

    await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.PARTITIONS,
      whereClause: {
        partition_id: replicaState.partitionId,
        leader_node_id: replicaState.nodeId,
      },
      data: {
        leader_node_id: null,
        updated_at: replicaState.stateEnteredAt,
      },
    }, {
      allowCoalescing: true,
      coalescingKey: `partitions:leader:${replicaState.partitionId}`,
      deliveryPriority: 'critical',
      workClass: 'critical',
      skipCacheWait: true,
    });
  }

  /**
   * Arm timeout tracking after the transition has been durably persisted.
   * This prevents CDC write latency from consuming replica lifecycle timeout
   * budgets before the new state is actually effective.
   * @param {string} replicaId - Replica identifier.
   * @private
   */
  _armTimeoutClock(replicaId) {
    const replicaState = this.replicas.get(replicaId);
    if (!replicaState) {
      return;
    }

    if (this.timeouts[replicaState.state] === undefined) {
      replicaState.timeoutStartedAt = null;
      return;
    }

    replicaState.timeoutStartedAt = this.now();
  }

  /**
   * Build CDC payload for updating an existing services row.
   * @param {Object} replicaState - Replica state snapshot.
   * @param {string|null} previousState - Previous state value.
   * @return {Object} Partial services-row update payload.
   * @private
   */
  _buildUpdateCdcData(replicaState, previousState) {
    const cdcData = {
      status: replicaState.state,
      state_entered_at: replicaState.stateEnteredAt,
      previous_state: previousState,
      trigger_reason: replicaState.triggerReason,
      updated_at: replicaState.stateEnteredAt,
    };

    if (replicaState.errorMessage) {
      cdcData.error_message = replicaState.errorMessage;
    }

    return cdcData;
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
    return {
      ...this._buildUpdateCdcData(replicaState, null),
      service_id: serviceId,
      service_type: serviceType,
      node_id: replicaState.nodeId,
      partition_id: replicaState.partitionId,
      replica_id: replicaState.replicaId,
      address,
      created_at: replicaState.stateEnteredAt,
    };
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
    const state = replicaState?.state || null;
    const backgroundWrite = BACKGROUND_PERSISTENCE_STATES.has(state);
    return {
      allowCoalescing: true,
      coalescingKey: `replica-state:${serviceId}`,
      deliveryPriority: backgroundWrite ? 'background' : 'critical',
      workClass: backgroundWrite ? 'background' : 'critical',
      // ReplicaStateMachine is the canonical owner already; waiting for the
      // local cache here only retains memory and elongates transitional churn.
      skipCacheWait: true,
    };
  }

  /**
   * Get current state of a replica.
   * @param {string} replicaId - Replica identifier.
   * @return {Object|null} Current state info or null if not tracked.
   */
  getState(replicaId) {
    return this.replicas.get(replicaId) || null;
  }

  /**
   * Get counts of replicas in each state.
   * @return {Object} State counts object.
   */
  getStateCounts() {
    return {...this.stateCounts};
  }

  /**
   * Get all replicas in a specific state.
   * @param {string} state - State to filter by.
   * @return {Array<Object>} Array of replica state objects.
   */
  getReplicasInState(state) {
    const result = [];
    for (const replicaState of this.replicas.values()) {
      if (replicaState.state === state) {
        result.push({...replicaState});
      }
    }
    return result;
  }

  /**
   * Get all tracked replicas.
   * @return {Array<Object>} Array of all replica state objects.
   */
  getAllReplicas() {
    return Array.from(this.replicas.values()).map((r) => ({...r}));
  }

  /**
   * Get replicas in transitional states.
   * Transitional states are: pending, creating, syncing, removing.
   * @return {Array<Object>} Replicas in transitional states.
   */
  getTransitionalReplicas() {
    const transitionalStates = [
      ReplicaState.PENDING,
      ReplicaState.CREATING,
      ReplicaState.SYNCING,
      ReplicaState.REMOVING,
    ];

    const result = [];
    for (const replicaState of this.replicas.values()) {
      if (transitionalStates.includes(replicaState.state)) {
        result.push({...replicaState});
      }
    }
    return result;
  }

  /**
   * Check if concurrent operation limits allow new operations.
   * @param {string} operationType - 'add' or 'remove'.
   * @return {boolean} True if operation can proceed.
   */
  canStartOperation(operationType) {
    if (operationType === REPLICA_STATE_MACHINE_OPERATION.ADD) {
      // Add operations are limited by pending + creating + syncing count
      const addTransitionalCount =
        this.stateCounts[ReplicaState.PENDING] +
        this.stateCounts[ReplicaState.CREATING] +
        this.stateCounts[ReplicaState.SYNCING];

      if (addTransitionalCount >= this.limits.maxConcurrentAdds) {
        this.logger.warn(REPLICA_STATE_MACHINE_LOG_MSG.CONCURRENT_ADD_LIMIT, {
          currentCount: addTransitionalCount,
          limit: this.limits.maxConcurrentAdds,
          nodeId: this.nodeId,
        });
        return false;
      }
      return true;
    } else if (operationType === REPLICA_STATE_MACHINE_OPERATION.REMOVE) {
      // Remove operations are limited by removing count
      const removeTransitionalCount = this.stateCounts[ReplicaState.REMOVING];

      if (removeTransitionalCount >= this.limits.maxConcurrentRemoves) {
        this.logger.warn(REPLICA_STATE_MACHINE_LOG_MSG.CONCURRENT_REMOVE_LIMIT, {
          currentCount: removeTransitionalCount,
          limit: this.limits.maxConcurrentRemoves,
          nodeId: this.nodeId,
        });
        return false;
      }
      return true;
    }

    // Unknown operation type
    this.logger.warn(REPLICA_STATE_MACHINE_LOG_MSG.UNKNOWN_OPERATION, {
      operationType,
      nodeId: this.nodeId,
    });
    return false;
  }

  /**
   * Get the configured concurrent operation limits.
   * @return {Object} Limits object with maxConcurrentAdds and maxConcurrentRemoves.
   */
  getLimits() {
    return {...this.limits};
  }

  /**
   * Remove a replica from tracking (after it reaches REMOVED state).
   * @param {string} replicaId - Replica identifier.
   * @return {boolean} True if replica was removed from tracking.
   */
  removeFromTracking(replicaId) {
    const state = this.replicas.get(replicaId);
    if (!state) {
      return false;
    }

    // Only allow removal from tracking if in REMOVED state
    if (state.state !== ReplicaState.REMOVED) {
      this.logger.warn(REPLICA_STATE_MACHINE_LOG_MSG.REMOVE_TRACKING_INVALID, {
        replicaId,
        currentState: state.state,
        nodeId: this.nodeId,
      });
      return false;
    }

    this.stateCounts[state.state]--;
    this.replicas.delete(replicaId);

    this.logger.debug(REPLICA_STATE_MACHINE_LOG_MSG.REMOVE_TRACKING_SUCCESS, {
      replicaId,
      nodeId: this.nodeId,
    });

    return true;
  }

  /**
   * Update peak concurrent operations tracking.
   * @private
   */
  _updatePeakConcurrentOperations() {
    // Calculate current concurrent adds (pending + creating + syncing)
    const currentAdds =
      this.stateCounts[ReplicaState.PENDING] +
      this.stateCounts[ReplicaState.CREATING] +
      this.stateCounts[ReplicaState.SYNCING];

    if (currentAdds > this.peakConcurrentAdds) {
      this.peakConcurrentAdds = currentAdds;
    }

    // Calculate current concurrent removes
    const currentRemoves = this.stateCounts[ReplicaState.REMOVING];

    if (currentRemoves > this.peakConcurrentRemoves) {
      this.peakConcurrentRemoves = currentRemoves;
    }
  }

  /**
   * Increment the timeout count.
   * Called when a timeout-triggered failure occurs.
   */
  incrementTimeoutCount() {
    this.timeoutCount += REPLICA_STATE_MACHINE_NUM.ONE;
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
    // Calculate current concurrent operations
    const currentConcurrentAdds =
      this.stateCounts[ReplicaState.PENDING] +
      this.stateCounts[ReplicaState.CREATING] +
      this.stateCounts[ReplicaState.SYNCING];

    const currentConcurrentRemoves = this.stateCounts[ReplicaState.REMOVING];

    // Convert transition counts Map to object
    const transitionCountsObj = {};
    for (const [key, value] of this.transitionCounts) {
      transitionCountsObj[key] = value;
    }

    // Convert time in state Map to object
    const timeInStateObj = {};
    for (const [key, value] of this.timeInState) {
      timeInStateObj[key] = value;
    }

    return {
      stateCounts: {...this.stateCounts},
      transitionCounts: transitionCountsObj,
      timeInState: timeInStateObj,
      failureCount: this.failureCount,
      timeoutCount: this.timeoutCount,
      currentConcurrentAdds,
      currentConcurrentRemoves,
      peakConcurrentAdds: this.peakConcurrentAdds,
      peakConcurrentRemoves: this.peakConcurrentRemoves,
    };
  }

  /**
   * Reset all metrics to initial values.
   * Used for testing.
   */
  resetMetrics() {
    this._initializeMetrics();
  }

  /**
   * Clear all tracked replicas.
   * Used for testing and shutdown.
   */
  clear() {
    this.stopTimeoutChecker();
    this.replicas.clear();
    for (const state of Object.keys(this.stateCounts)) {
      this.stateCounts[state] = REPLICA_STATE_MACHINE_NUM.ZERO;
    }
    this._initializeMetrics();
  }

  getControlPlaneSystemTableGateway() {
    if (this.controlPlaneSystemTableGateway) {
      return this.controlPlaneSystemTableGateway;
    }
    this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle({
      nodeId: this.nodeId,
      getCdcIntegrationService: () => this.cdcIntegrationService,
    }).controlPlaneSystemTableGateway;
    return this.controlPlaneSystemTableGateway;
  }

  /**
   * Get the configured timeout for a state.
   * @param {string} state - The state to get timeout for.
   * @return {number|null} Timeout in ms or null if no timeout for this state.
   */
  getTimeout(state) {
    return this.timeouts[state] ?? null;
  }

  /**
   * Start the timeout checker interval.
   * Periodically checks for replicas that have exceeded their state timeout.
   */
  startTimeoutChecker() {
    if (this.timeoutCheckInterval !== null) {
      // Already running
      return;
    }

    this.timeoutCheckInterval = setInterval(() => {
      this._checkTimeouts();
    }, this.timeoutCheckIntervalMs);
    this.timeoutCheckInterval.unref();

    this.logger.debug(REPLICA_STATE_MACHINE_LOG_MSG.TIMEOUT_CHECKER_STARTED, {
      intervalMs: this.timeoutCheckIntervalMs,
      nodeId: this.nodeId,
    });
  }

  /**
   * Stop the timeout checker interval.
   */
  stopTimeoutChecker() {
    if (this.timeoutCheckInterval !== null) {
      clearInterval(this.timeoutCheckInterval);
      this.timeoutCheckInterval = null;

      this.logger.debug(REPLICA_STATE_MACHINE_LOG_MSG.TIMEOUT_CHECKER_STOPPED, {
        nodeId: this.nodeId,
      });
    }
  }

  /**
   * Check for timed out replicas and transition them to failed.
   * @private
   */
  _checkTimeouts() {
    const now = this.now();
    const timedOutReplicas = [];

    for (const [replicaId, state] of this.replicas) {
      const timeout = this.timeouts[state.state];
      if (timeout === undefined) {
        // No timeout for this state (e.g., active, removed, failed)
        continue;
      }

      const hasExplicitTimeoutAnchor =
        Object.prototype.hasOwnProperty.call(state, 'timeoutStartedAt');
      const timeoutAnchor = hasExplicitTimeoutAnchor ?
        state.timeoutStartedAt :
        state.stateEnteredAt;
      if (!Number.isFinite(timeoutAnchor)) {
        continue;
      }

      const elapsed = now - timeoutAnchor;
      if (elapsed > timeout) {
        timedOutReplicas.push({
          replicaId,
          state: state.state,
          elapsed,
          timeout,
          partitionId: state.partitionId,
          nodeId: state.nodeId,
        });
      }
    }

    // Transition timed out replicas to failed
    for (const timedOut of timedOutReplicas) {
      this.logger.warn(REPLICA_STATE_MACHINE_LOG_MSG.OPERATION_TIMEOUT, {
        replicaId: timedOut.replicaId,
        state: timedOut.state,
        elapsed: timedOut.elapsed,
        timeout: timedOut.timeout,
        nodeId: this.nodeId,
      });

      // Increment timeout count
      this.timeoutCount += REPLICA_STATE_MACHINE_NUM.ONE;

      this.emit(REPLICA_STATE_MACHINE_EVENT.TIMEOUT, {
        replicaId: timedOut.replicaId,
        partitionId: timedOut.partitionId,
        nodeId: timedOut.nodeId,
        state: timedOut.state,
        elapsed: timedOut.elapsed,
        timeout: timedOut.timeout,
      });

      this.transition(timedOut.replicaId, ReplicaState.FAILED, {
        partitionId: timedOut.partitionId,
        nodeId: timedOut.nodeId,
        reason: REPLICA_STATE_MACHINE_ERROR_MSG.timeoutReason(
          timedOut.state,
          timedOut.elapsed,
        ),
        errorMessage: REPLICA_STATE_MACHINE_ERROR_MSG.timeoutMessage(
          timedOut.timeout,
        ),
      });
    }
  }

  /**
   * Check timeouts immediately (for testing).
   * @return {number} Number of replicas that timed out.
   */
  checkTimeoutsNow() {
    const countBefore = this.stateCounts[ReplicaState.FAILED];
    this._checkTimeouts();
    return this.stateCounts[ReplicaState.FAILED] - countBefore;
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
    const {systemTableCache} = options;
    const nodeId = options.nodeId || this.nodeId;

    this.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_START, {
      nodeId,
    });

    assertCritical(
      systemTableCache,
      REPLICA_STATE_MACHINE_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE,
    );

    // Query services table for replicas on this node in transitional states
    let services = [];
    try {
      services = systemTableCache.filter(
        TABLES.SERVICES,
        (service) =>
          service.node_id === nodeId &&
          service.service_type === SERVICE_TYPE.PARTITION &&
          [ReplicaState.CREATING, ReplicaState.SYNCING, ReplicaState.REMOVING]
            .includes(service.status),
      );
    } catch (error) {
      this.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_QUERY_FAILED, {
        nodeId,
        error: error.message,
      });
      throw error;
    }

    this.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_FOUND, {
      count: services.length,
      nodeId,
    });

    let creatingToFailed = REPLICA_STATE_MACHINE_NUM.ZERO;
    let syncingToFailed = REPLICA_STATE_MACHINE_NUM.ZERO;
    let removingToRemoved = REPLICA_STATE_MACHINE_NUM.ZERO;

    for (const service of services) {
      const {service_id: replicaId, partition_id: partitionId, status} = service;

      this.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_PROCESSING, {
        replicaId,
        partitionId,
        status,
        nodeId,
      });

      try {
        // Register the replica in the state machine if not already tracked
        // We need to set up the replica in its current state first
        const existingState = this.replicas.get(replicaId);
        if (!existingState) {
          // Directly set the replica state without going through transitions
          // This is necessary because we're recovering from a persisted state
          this._registerReplicaForRecovery(replicaId, {
            partitionId,
            nodeId,
            state: status,
            serviceId: service.service_id,
          });
        }

        if (status === ReplicaState.CREATING || status === ReplicaState.SYNCING) {
          // Transition creating/syncing replicas to failed
          const result = this.transition(replicaId, ReplicaState.FAILED, {
            partitionId,
            nodeId,
            reason: REPLICA_STATE_MACHINE_REASON.RECOVERY_INCOMPLETE,
            errorMessage: REPLICA_STATE_MACHINE_ERROR_MSG.recoveryIncompleteOperation(
              status,
            ),
            serviceId: service.service_id,
          });

          if (result === true || result instanceof Promise && await result) {
            if (status === ReplicaState.CREATING) {
              creatingToFailed += REPLICA_STATE_MACHINE_NUM.ONE;
            } else {
              syncingToFailed += REPLICA_STATE_MACHINE_NUM.ONE;
            }
            this.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_TO_FAILED, {
              replicaId,
              previousStatus: status,
              nodeId,
            });
          }
        } else if (status === ReplicaState.REMOVING) {
          // Complete removal for removing replicas
          const result = this.transition(replicaId, ReplicaState.REMOVED, {
            partitionId,
            nodeId,
            reason: REPLICA_STATE_MACHINE_REASON.RECOVERY_COMPLETE_REMOVAL,
            serviceId: service.service_id,
          });

          if (result === true || result instanceof Promise && await result) {
            removingToRemoved += REPLICA_STATE_MACHINE_NUM.ONE;
            this.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_REMOVED, {
              replicaId,
              nodeId,
            });
          }
        }
      } catch (error) {
        this.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_FAILED, {
          replicaId,
          status,
          error: error.message,
          nodeId,
        });
      }
    }

    const total = creatingToFailed + syncingToFailed + removingToRemoved;

    this.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_COMPLETE, {
      nodeId,
      creatingToFailed,
      syncingToFailed,
      removingToRemoved,
      total,
    });

    // Emit recovery complete event
    this.emit(REPLICA_STATE_MACHINE_EVENT.RECOVERY_COMPLETE, {
      nodeId,
      creatingToFailed,
      syncingToFailed,
      removingToRemoved,
      total,
    });

    return {
      nodeId,
      creatingToFailed,
      syncingToFailed,
      removingToRemoved,
      total,
    };
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
    if (!replicaId || typeof replicaId !== 'string') {
      return false;
    }

    if (this.replicas.has(replicaId)) {
      return true;
    }

    const state = context.state || ReplicaState.ACTIVE;
    if (!Object.values(ReplicaState).includes(state)) {
      this.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.INVALID_TRANSITION, {
        replicaId,
        currentState: null,
        attemptedState: state,
        reason: context.reason,
        nodeId: this.nodeId,
      });
      this.emit(REPLICA_STATE_MACHINE_EVENT.TRANSITION_ERROR, {
        code: REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE.INVALID_TRANSITION,
        replicaId,
        currentState: null,
        attemptedState: state,
        reason: context.reason,
        nodeId: this.nodeId,
      });
      return false;
    }

    this._registerReplicaForRecovery(replicaId, {
      partitionId: context.partitionId,
      nodeId: context.nodeId || this.nodeId,
      state,
      serviceId: context.serviceId || null,
      triggerReason: context.reason ||
        REPLICA_STATE_MACHINE_REASON.RECOVERY_REGISTRATION,
    });
    return true;
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
    const now = this.now();
    const state = context.state;

    // Update state counts
    this.stateCounts[state]++;

    // Create replica state entry
    const replicaState = {
      replicaId,
      partitionId: context.partitionId,
      nodeId: context.nodeId || this.nodeId,
      state,
      stateEnteredAt: now,
      timeoutStartedAt: this.timeouts[state] === undefined ? null : now,
      previousState: null,
      triggerReason: context.triggerReason ||
        REPLICA_STATE_MACHINE_REASON.RECOVERY_REGISTRATION,
      errorMessage: null,
      metadata: {},
      serviceId: context.serviceId || null,
      serviceType: context.serviceType || SERVICE_TYPE.PARTITION,
      serviceAddress: context.serviceAddress || null,
    };

    this.replicas.set(replicaId, replicaState);

    this.logger.debug(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_REGISTERED, {
      replicaId,
      state,
      nodeId: this.nodeId,
    });
  }
}

export {
  ReplicaStateMachine,
  ReplicaState,
  VALID_TRANSITIONS,
  DEFAULT_TIMEOUTS,
};
