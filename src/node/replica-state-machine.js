/**
 * Replica State Machine - Formal state machine for replica lifecycle management.
 * Provides a single source of truth for replica status across all components.
 *
 * @deprecated This class is deprecated in favor of RebalanceCoordinator.
 * The RebalanceCoordinator now owns state tracking for replica operations.
 * This class is kept for backward compatibility during migration.
 * New code should use RebalanceCoordinator instead.
 *
 * Requirements: 1.1, 1.2, 1.3, 2.1-2.8
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';

/**
 * Replica state constants.
 * These are the only valid states a replica can be in.
 *
 * @deprecated Use ReplicaStatus from '../rebalancer/replica-status.js' instead.
 */
const ReplicaState = {
  PENDING: 'pending',
  CREATING: 'creating',
  SYNCING: 'syncing',
  ACTIVE: 'active',
  REMOVING: 'removing',
  REMOVED: 'removed',
  FAILED: 'failed',
};

/**
 * Valid state transitions matrix.
 * Key: current state (or null for new replica)
 * Value: array of valid next states
 */
const VALID_TRANSITIONS = {
  [null]: [ReplicaState.PENDING],
  [ReplicaState.PENDING]: [ReplicaState.CREATING, ReplicaState.FAILED],
  [ReplicaState.CREATING]: [ReplicaState.SYNCING, ReplicaState.FAILED],
  [ReplicaState.SYNCING]: [ReplicaState.ACTIVE, ReplicaState.FAILED],
  [ReplicaState.ACTIVE]: [ReplicaState.REMOVING, ReplicaState.FAILED],
  [ReplicaState.REMOVING]: [ReplicaState.REMOVED, ReplicaState.FAILED],
  [ReplicaState.FAILED]: [ReplicaState.REMOVED],
  [ReplicaState.REMOVED]: [],
};

/**
 * Default timeout values for transitional states (in milliseconds).
 */
const DEFAULT_TIMEOUTS = {
  [ReplicaState.PENDING]: 30000, // 30 seconds
  [ReplicaState.CREATING]: 60000, // 60 seconds
  [ReplicaState.SYNCING]: 300000, // 5 minutes
  [ReplicaState.REMOVING]: 60000, // 60 seconds
};

/**
 * ReplicaStateMachine - Central state machine for replica lifecycle.
 * Enforces valid transitions and emits events for all state changes.
 *
 * @deprecated This class is deprecated in favor of RebalanceCoordinator.
 * The RebalanceCoordinator now owns state tracking for replica operations.
 * This class is kept for backward compatibility during migration.
 *
 * Migration guide:
 * - Use RebalanceCoordinator.createOperation() instead of transition() for new operations
 * - Use RebalanceCoordinator.getInFlightOperations() instead of getTransitionalReplicas()
 * - Use RebalanceCoordinator.getOperation() instead of getState()
 * - Use ReplicaStatus from '../rebalancer/replica-status.js' instead of ReplicaState
 */
class ReplicaStateMachine extends EventEmitter {
  /**
   * Create a new ReplicaStateMachine.
   *
   * @deprecated Use RebalanceCoordinator instead.
   *
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID for this state machine.
   * @param {Object} [options.cdcIntegrationService] - CDC service for
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

    // Log deprecation warning
    const loggingService = LoggingService.getInstance();
    const logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('replica-state-machine') : console;
    logger.warn('ReplicaStateMachine is deprecated. Use RebalanceCoordinator instead.', {
      nodeId: options.nodeId,
    });

    this.nodeId = options.nodeId || 'unknown';

    // CDC integration service for state persistence (optional)
    this.cdcIntegrationService = options.cdcIntegrationService || null;

    // State tracking: Map<replicaId, ReplicaStateInfo>
    this.replicas = new Map();

    // State counts for quick lookup
    this.stateCounts = {
      [ReplicaState.PENDING]: 0,
      [ReplicaState.CREATING]: 0,
      [ReplicaState.SYNCING]: 0,
      [ReplicaState.ACTIVE]: 0,
      [ReplicaState.REMOVING]: 0,
      [ReplicaState.REMOVED]: 0,
      [ReplicaState.FAILED]: 0,
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
    this.timeoutCheckIntervalMs = options.timeoutCheckIntervalMs ?? 5000;

    // Timeout checker interval handle
    this.timeoutCheckInterval = null;

    // Concurrent operation limits
    this.limits = {
      maxConcurrentAdds: options.maxConcurrentAdds ?? 5,
      maxConcurrentRemoves: options.maxConcurrentRemoves ?? 5,
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
      this.timeInState.set(state, 0);
    }

    // Failure and timeout counts
    this.failureCount = 0;
    this.timeoutCount = 0;

    // Peak concurrent operations
    this.peakConcurrentAdds = 0;
    this.peakConcurrentRemoves = 0;
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
   * Persists state to CDC if cdcIntegrationService is configured.
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
    const existingState = this.replicas.get(replicaId);
    const currentState = existingState ? existingState.state : null;

    // Validate transition
    if (!this.isValidTransition(currentState, newState)) {
      this.logger.error('Invalid state transition attempted', {
        replicaId,
        currentState,
        attemptedState: newState,
        reason: context.reason,
        nodeId: this.nodeId,
      });

      this.emit('transitionError', {
        replicaId,
        currentState,
        attemptedState: newState,
        reason: context.reason,
        nodeId: this.nodeId,
      });

      return false;
    }

    const now = Date.now();
    const previousState = currentState;
    const timeInPreviousState = existingState ?
      now - existingState.stateEnteredAt : 0;

    // Update state counts
    if (previousState !== null) {
      this.stateCounts[previousState]--;
    }
    this.stateCounts[newState]++;

    // Track metrics: transition counts
    const transitionKey = `${previousState}->${newState}`;
    const currentTransitionCount = this.transitionCounts.get(transitionKey) || 0;
    this.transitionCounts.set(transitionKey, currentTransitionCount + 1);

    // Track metrics: time spent in previous state
    if (previousState !== null && timeInPreviousState > 0) {
      const currentTimeInState = this.timeInState.get(previousState) || 0;
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
      previousState,
      triggerReason: context.reason || 'unknown',
      errorMessage: context.errorMessage || null,
      metadata: context.metadata || existingState?.metadata || {},
      serviceId: context.serviceId || existingState?.serviceId || null,
    };

    this.replicas.set(replicaId, replicaState);

    this.logger.info('Replica state transition', {
      replicaId,
      previousState,
      newState,
      reason: context.reason,
      nodeId: this.nodeId,
    });

    // Emit state transition event
    this.emit('stateTransition', {
      eventType: 'replica_state_transition',
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

    // Persist state via CDC if service is configured
    if (this.cdcIntegrationService) {
      return this._persistStateToCdc(replicaState, previousState);
    }

    return true;
  }

  /**
   * Persist replica state to the services table via CDC.
   * @param {Object} replicaState - The replica state to persist.
   * @param {string|null} previousState - The previous state.
   * @return {Promise<boolean>} True if persistence succeeded.
   * @private
   */
  async _persistStateToCdc(replicaState, previousState) {
    try {
      const cdcData = {
        status: replicaState.state,
        state_entered_at: replicaState.stateEnteredAt,
        previous_state: previousState,
        trigger_reason: replicaState.triggerReason,
        updated_at: replicaState.stateEnteredAt,
      };

      // Include error message if present
      if (replicaState.errorMessage) {
        cdcData.error_message = replicaState.errorMessage;
      }

      // If we have a service_id, update the existing row
      if (replicaState.serviceId) {
        await this.cdcIntegrationService.updateSystemTableRow(
          'services',
          {service_id: replicaState.serviceId},
          cdcData,
        );
      } else {
        // Insert new row with replica state data
        const insertData = {
          ...cdcData,
          service_id: replicaState.replicaId,
          service_type: 'partition',
          node_id: replicaState.nodeId,
          partition_id: replicaState.partitionId,
          replica_id: replicaState.replicaId,
          created_at: replicaState.stateEnteredAt,
        };
        await this.cdcIntegrationService.insertSystemTableRow(
          'services',
          insertData,
        );
      }

      this.logger.debug('State persisted to CDC', {
        replicaId: replicaState.replicaId,
        state: replicaState.state,
        nodeId: this.nodeId,
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to persist state to CDC', {
        replicaId: replicaState.replicaId,
        state: replicaState.state,
        error: error.message,
        nodeId: this.nodeId,
      });

      this.emit('persistenceError', {
        replicaId: replicaState.replicaId,
        state: replicaState.state,
        error: error.message,
      });

      // Return true anyway - state machine update succeeded,
      // CDC persistence failure is logged but doesn't block
      return true;
    }
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
    if (operationType === 'add') {
      // Add operations are limited by pending + creating + syncing count
      const addTransitionalCount =
        this.stateCounts[ReplicaState.PENDING] +
        this.stateCounts[ReplicaState.CREATING] +
        this.stateCounts[ReplicaState.SYNCING];

      if (addTransitionalCount >= this.limits.maxConcurrentAdds) {
        this.logger.warn('Concurrent ADD limit reached', {
          currentCount: addTransitionalCount,
          limit: this.limits.maxConcurrentAdds,
          nodeId: this.nodeId,
        });
        return false;
      }
      return true;
    } else if (operationType === 'remove') {
      // Remove operations are limited by removing count
      const removeTransitionalCount = this.stateCounts[ReplicaState.REMOVING];

      if (removeTransitionalCount >= this.limits.maxConcurrentRemoves) {
        this.logger.warn('Concurrent REMOVE limit reached', {
          currentCount: removeTransitionalCount,
          limit: this.limits.maxConcurrentRemoves,
          nodeId: this.nodeId,
        });
        return false;
      }
      return true;
    }

    // Unknown operation type
    this.logger.warn('Unknown operation type for canStartOperation', {
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
      this.logger.warn('Cannot remove replica from tracking - not in REMOVED state', {
        replicaId,
        currentState: state.state,
        nodeId: this.nodeId,
      });
      return false;
    }

    this.stateCounts[state.state]--;
    this.replicas.delete(replicaId);

    this.logger.debug('Removed replica from tracking', {
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
    this.timeoutCount++;
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
      this.stateCounts[state] = 0;
    }
    this._initializeMetrics();
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

    this.logger.debug('Timeout checker started', {
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

      this.logger.debug('Timeout checker stopped', {
        nodeId: this.nodeId,
      });
    }
  }

  /**
   * Check for timed out replicas and transition them to failed.
   * @private
   */
  _checkTimeouts() {
    const now = Date.now();
    const timedOutReplicas = [];

    for (const [replicaId, state] of this.replicas) {
      const timeout = this.timeouts[state.state];
      if (timeout === undefined) {
        // No timeout for this state (e.g., active, removed, failed)
        continue;
      }

      const elapsed = now - state.stateEnteredAt;
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
      this.logger.warn('Replica operation timed out', {
        replicaId: timedOut.replicaId,
        state: timedOut.state,
        elapsed: timedOut.elapsed,
        timeout: timedOut.timeout,
        nodeId: this.nodeId,
      });

      // Increment timeout count
      this.timeoutCount++;

      this.emit('timeout', {
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
        reason: `Timeout in ${timedOut.state} state after ${timedOut.elapsed}ms`,
        errorMessage: `Operation timed out after ${timedOut.timeout}ms`,
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

    this.logger.info('Handling node recovery in state machine', {
      nodeId,
    });

    if (!systemTableCache) {
      this.logger.warn('No system table cache provided for recovery');
      return {
        nodeId,
        creatingToFailed: 0,
        syncingToFailed: 0,
        removingToRemoved: 0,
        total: 0,
      };
    }

    // Query services table for replicas on this node in transitional states
    let services = [];
    try {
      services = systemTableCache.filter(
        'services',
        (service) =>
          service.node_id === nodeId &&
          service.service_type === 'partition' &&
          ['creating', 'syncing', 'removing'].includes(service.status),
      );
    } catch (error) {
      this.logger.error('Failed to query services table for recovery', {
        nodeId,
        error: error.message,
      });
      return {
        nodeId,
        creatingToFailed: 0,
        syncingToFailed: 0,
        removingToRemoved: 0,
        total: 0,
        error: error.message,
      };
    }

    this.logger.info('Found replicas in transitional states for recovery', {
      count: services.length,
      nodeId,
    });

    let creatingToFailed = 0;
    let syncingToFailed = 0;
    let removingToRemoved = 0;

    for (const service of services) {
      const {service_id: replicaId, partition_id: partitionId, status} = service;

      this.logger.info('Processing replica for recovery', {
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

        if (status === 'creating' || status === 'syncing') {
          // Transition creating/syncing replicas to failed
          const result = this.transition(replicaId, ReplicaState.FAILED, {
            partitionId,
            nodeId,
            reason: 'Node recovery - incomplete operation',
            errorMessage: `Replica was in ${status} state during node failure`,
            serviceId: service.service_id,
          });

          if (result === true || result instanceof Promise && await result) {
            if (status === 'creating') {
              creatingToFailed++;
            } else {
              syncingToFailed++;
            }
            this.logger.info('Transitioned replica to failed during recovery', {
              replicaId,
              previousStatus: status,
              nodeId,
            });
          }
        } else if (status === 'removing') {
          // Complete removal for removing replicas
          const result = this.transition(replicaId, ReplicaState.REMOVED, {
            partitionId,
            nodeId,
            reason: 'Node recovery - completing removal',
            serviceId: service.service_id,
          });

          if (result === true || result instanceof Promise && await result) {
            removingToRemoved++;
            this.logger.info('Completed replica removal during recovery', {
              replicaId,
              nodeId,
            });
          }
        }
      } catch (error) {
        this.logger.error('Failed to process replica during recovery', {
          replicaId,
          status,
          error: error.message,
          nodeId,
        });
      }
    }

    const total = creatingToFailed + syncingToFailed + removingToRemoved;

    this.logger.info('Node recovery complete in state machine', {
      nodeId,
      creatingToFailed,
      syncingToFailed,
      removingToRemoved,
      total,
    });

    // Emit recovery complete event
    this.emit('recoveryComplete', {
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
    const now = Date.now();
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
      previousState: null,
      triggerReason: 'recovery_registration',
      errorMessage: null,
      metadata: {},
      serviceId: context.serviceId || null,
    };

    this.replicas.set(replicaId, replicaState);

    this.logger.debug('Registered replica for recovery', {
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
