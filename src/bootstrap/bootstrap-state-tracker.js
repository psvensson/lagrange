/**
 * Bootstrap State Tracker - Tracks and logs bootstrap initialization state.
 * Provides structured logging for phase transitions and Raft state changes.
 * Requirements: 28.1, 28.2, 28.5, 28.6, 28.8, 28.9
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {STRING, SERVICE_TYPE} from '../constants/index.js';
import {BOOTSTRAP_PHASE} from './bootstrap-constants.js';
import {
  BOOTSTRAP_TRACKER_EVENT,
  BOOTSTRAP_TRACKER_LOG_MSG,
  BOOTSTRAP_TRACKER_PHASE_DESCRIPTION,
  BOOTSTRAP_TRACKER_SUBSYSTEM,
} from './bootstrap-tracker-constants.js';

const BootstrapPhase = BOOTSTRAP_PHASE;
const PHASE_DESCRIPTIONS = BOOTSTRAP_TRACKER_PHASE_DESCRIPTION;

/**
 * BootstrapStateTracker tracks and logs bootstrap initialization state.
 * It provides structured logging for phase transitions and Raft state changes.
 */
class BootstrapStateTracker extends EventEmitter {
  /**
   * Create a new BootstrapStateTracker.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID.
   */
  constructor(options = {}) {
    super();

    this.nodeId = options.nodeId || STRING.UNKNOWN;
    this.currentPhase = BootstrapPhase.NOT_STARTED;
    this.phaseHistory = [];
    this.startTime = null;
    this.phaseStartTime = null;
    this.servicesCreated = 0;
    this.partitionsCreated = 0;
    this.messageGroupsCreated = 0;
    this.raftStateChanges = [];
    this.errors = [];

    // Initialize logger
    this.logger = this.initLogger();
  }

  /**
   * Initialize the logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(BOOTSTRAP_TRACKER_SUBSYSTEM);
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Set the node ID.
   * @param {string} nodeId - Node ID.
   */
  setNodeId(nodeId) {
    this.nodeId = nodeId;
  }

  /**
   * Start tracking bootstrap.
   */
  startTracking() {
    this.startTime = Date.now();
    this.currentPhase = BootstrapPhase.NOT_STARTED;

    this.logger.info(BOOTSTRAP_TRACKER_LOG_MSG.TRACKING_STARTED, {
      nodeId: this.nodeId,
      timestamp: this.startTime,
    });

    this.emit(BOOTSTRAP_TRACKER_EVENT.TRACKING_STARTED, {
      nodeId: this.nodeId,
      timestamp: this.startTime,
    });
  }

  /**
   * Transition to a new phase.
   * @param {string} phase - New phase.
   * @param {Object} context - Additional context.
   */
  transitionToPhase(phase, context = {}) {
    const previousPhase = this.currentPhase;
    const now = Date.now();
    const phaseDuration = this.phaseStartTime ? now - this.phaseStartTime : 0;

    // Record phase completion
    if (previousPhase !== BootstrapPhase.NOT_STARTED) {
      this.phaseHistory.push({
        phase: previousPhase,
        startTime: this.phaseStartTime,
        endTime: now,
        duration: phaseDuration,
      });
    }

    // Update state
    this.currentPhase = phase;
    this.phaseStartTime = now;

    // Log phase transition at INFO level (Requirement 28.1)
    this.logger.info(BOOTSTRAP_TRACKER_LOG_MSG.PHASE_TRANSITION, {
      nodeId: this.nodeId,
      previousPhase,
      newPhase: phase,
      phaseDescription: PHASE_DESCRIPTIONS[phase],
      previousPhaseDuration: phaseDuration,
      servicesCreated: this.servicesCreated,
      partitionsCreated: this.partitionsCreated,
      messageGroupsCreated: this.messageGroupsCreated,
      ...context,
    });

    this.emit(BOOTSTRAP_TRACKER_EVENT.PHASE_TRANSITION, {
      nodeId: this.nodeId,
      previousPhase,
      newPhase: phase,
      duration: phaseDuration,
      ...context,
    });
  }

  /**
   * Record a Raft state change.
   * @param {Object} change - Raft state change details.
   * @param {string} change.serviceId - Service ID.
   * @param {string} change.serviceType - Service type (partition, message_group).
   * @param {string} change.previousRole - Previous Raft role.
   * @param {string} change.newRole - New Raft role.
   * @param {string} change.groupId - Group or partition ID.
   */
  recordRaftStateChange(change) {
    const timestamp = Date.now();
    const record = {
      ...change,
      timestamp,
      nodeId: this.nodeId,
    };

    this.raftStateChanges.push(record);

    // Log Raft state changes at DEBUG level (Requirement 28.5)
    this.logger.debug(BOOTSTRAP_TRACKER_LOG_MSG.RAFT_STATE_CHANGE, {
      nodeId: this.nodeId,
      serviceId: change.serviceId,
      serviceType: change.serviceType,
      previousRole: change.previousRole,
      newRole: change.newRole,
      groupId: change.groupId,
      partitionId: change.partitionId,
      replicaId: change.replicaId,
    });

    this.emit(BOOTSTRAP_TRACKER_EVENT.RAFT_STATE_CHANGE, record);
  }

  /**
   * Record service creation.
   * @param {Object} service - Service details.
   * @param {string} service.serviceId - Service ID.
   * @param {string} service.serviceType - Service type.
   * @param {string} service.partitionId - Partition ID (if applicable).
   * @param {string} service.groupId - Group ID (if applicable).
   */
  recordServiceCreated(service) {
    this.servicesCreated++;

    // Log at DEBUG level with relevant identifiers (Requirement 28.6)
    this.logger.debug(BOOTSTRAP_TRACKER_LOG_MSG.SERVICE_CREATED, {
      nodeId: this.nodeId,
      serviceId: service.serviceId,
      serviceType: service.serviceType,
      partitionId: service.partitionId || null,
      groupId: service.groupId || null,
      replicaId: service.replicaId || null,
      tableId: service.tableId || null,
      totalServicesCreated: this.servicesCreated,
    });

    if (service.serviceType === SERVICE_TYPE.PARTITION) {
      this.partitionsCreated++;
    } else if (service.serviceType === SERVICE_TYPE.MESSAGE_GROUP) {
      this.messageGroupsCreated++;
    }

    this.emit(BOOTSTRAP_TRACKER_EVENT.SERVICE_CREATED, {
      ...service,
      nodeId: this.nodeId,
    });
  }

  /**
   * Record an error during bootstrap.
   * @param {Object} error - Error details.
   * @param {string} error.phase - Phase where error occurred.
   * @param {string} error.message - Error message.
   * @param {string} error.serviceId - Service ID (if applicable).
   * @param {Object} error.context - Additional context.
   */
  recordError(error) {
    const timestamp = Date.now();
    const record = {
      ...error,
      timestamp,
      nodeId: this.nodeId,
      phase: this.currentPhase,
    };

    this.errors.push(record);

    // Log errors at ERROR level with full context (Requirement 28.3)
    this.logger.error(BOOTSTRAP_TRACKER_LOG_MSG.ERROR, {
      nodeId: this.nodeId,
      phase: this.currentPhase,
      errorMessage: error.message,
      serviceId: error.serviceId || null,
      partitionId: error.partitionId || null,
      groupId: error.groupId || null,
      stack: error.stack || null,
      ...error.context,
    });

    this.emit(BOOTSTRAP_TRACKER_EVENT.ERROR, record);
  }

  /**
   * Complete bootstrap tracking.
   * @param {boolean} success - Whether bootstrap succeeded.
   * @param {Object} context - Additional context.
   */
  completeTracking(success, context = {}) {
    const endTime = Date.now();
    const totalDuration = this.startTime ? endTime - this.startTime : 0;

    // Transition to final phase
    this.transitionToPhase(
      success ? BootstrapPhase.COMPLETE : BootstrapPhase.FAILED,
      context,
    );

    // Log summary at INFO level (Requirement 28.4)
    if (success) {
      this.logger.info(BOOTSTRAP_TRACKER_LOG_MSG.TRACKING_COMPLETE, {
        nodeId: this.nodeId,
        totalDuration,
        servicesCreated: this.servicesCreated,
        partitionsCreated: this.partitionsCreated,
        messageGroupsCreated: this.messageGroupsCreated,
        phaseCount: this.phaseHistory.length,
        raftStateChanges: this.raftStateChanges.length,
        ...context,
      });
    } else {
      this.logger.error(BOOTSTRAP_TRACKER_LOG_MSG.TRACKING_FAILED, {
        nodeId: this.nodeId,
        totalDuration,
        failedPhase: this.currentPhase,
        servicesCreated: this.servicesCreated,
        errorCount: this.errors.length,
        lastError: this.errors[this.errors.length - 1]?.message || null,
        ...context,
      });
    }

    this.emit(BOOTSTRAP_TRACKER_EVENT.TRACKING_COMPLETE, {
      nodeId: this.nodeId,
      success,
      totalDuration,
      servicesCreated: this.servicesCreated,
      partitionsCreated: this.partitionsCreated,
      messageGroupsCreated: this.messageGroupsCreated,
    });
  }

  /**
   * Get the current bootstrap state.
   * @return {Object} Current state.
   */
  getState() {
    return {
      nodeId: this.nodeId,
      currentPhase: this.currentPhase,
      phaseDescription: PHASE_DESCRIPTIONS[this.currentPhase],
      startTime: this.startTime,
      phaseStartTime: this.phaseStartTime,
      servicesCreated: this.servicesCreated,
      partitionsCreated: this.partitionsCreated,
      messageGroupsCreated: this.messageGroupsCreated,
      phaseHistory: [...this.phaseHistory],
      raftStateChanges: this.raftStateChanges.length,
      errors: this.errors.length,
      duration: this.startTime ? Date.now() - this.startTime : 0,
    };
  }

  /**
   * Get phase history.
   * @return {Array} Phase history.
   */
  getPhaseHistory() {
    return [...this.phaseHistory];
  }

  /**
   * Get Raft state changes.
   * @return {Array} Raft state changes.
   */
  getRaftStateChanges() {
    return [...this.raftStateChanges];
  }

  /**
   * Get errors.
   * @return {Array} Errors.
   */
  getErrors() {
    return [...this.errors];
  }

  /**
   * Check if bootstrap is in progress.
   * @return {boolean} True if in progress.
   */
  isInProgress() {
    return this.currentPhase !== BootstrapPhase.NOT_STARTED &&
           this.currentPhase !== BootstrapPhase.COMPLETE &&
           this.currentPhase !== BootstrapPhase.FAILED;
  }

  /**
   * Check if bootstrap completed successfully.
   * @return {boolean} True if completed successfully.
   */
  isComplete() {
    return this.currentPhase === BootstrapPhase.COMPLETE;
  }

  /**
   * Check if bootstrap failed.
   * @return {boolean} True if failed.
   */
  isFailed() {
    return this.currentPhase === BootstrapPhase.FAILED;
  }

  /**
   * Reset the tracker.
   */
  reset() {
    this.currentPhase = BootstrapPhase.NOT_STARTED;
    this.phaseHistory = [];
    this.startTime = null;
    this.phaseStartTime = null;
    this.servicesCreated = 0;
    this.partitionsCreated = 0;
    this.messageGroupsCreated = 0;
    this.raftStateChanges = [];
    this.errors = [];
  }
}

export {BootstrapStateTracker, BootstrapPhase, PHASE_DESCRIPTIONS};
