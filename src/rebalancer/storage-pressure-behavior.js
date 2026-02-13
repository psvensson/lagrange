/**
 * Storage Pressure Behavior - gates moves by per-node pressure state.
 *
 * Tracks pressure state transitions per node and provides a
 * `shouldAllowMove(nodeId, moveCriticality)` API that the MovePlanner
 * consults before scoring candidate target nodes.
 *
 * Requirements: 8.2, 8.3, 8.5
 */

import {LoggingService} from '../logging/logging-service.js';
import {
  MOVE_CRITICALITY,
  PRESSURE_BEHAVIOR_DECISION,
  PRESSURE_BEHAVIOR_EVENT,
  PRESSURE_STATE,
  STORAGE_CAPACITY_LOG_MSG,
  STORAGE_CAPACITY_SUBSYSTEM,
} from './storage-capacity-constants.js';

class StoragePressureBehavior {
  /**
   * @param {Object} options
   * @param {Object} options.accountingService -
   *   StorageCapacityAccountingService instance
   */
  constructor(options = {}) {
    this.accountingService = options.accountingService || null;

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(STORAGE_CAPACITY_SUBSYSTEM) : console;

    /** @type {Map<string, string>} nodeId → last known pressure state */
    this.knownStates = new Map();

    /** @type {Array<Object>} collected metric events */
    this.metricEvents = [];
  }

  /**
   * Evaluate whether a move to `nodeId` should be allowed.
   *
   * - normal: allow all moves
   * - soft: allow critical; allow non-critical with reduced priority
   * - hard / exhausted: allow critical; deny non-critical
   *
   * Also detects and logs pressure state transitions.
   *
   * @param {string} nodeId
   * @param {string} moveCriticality - MOVE_CRITICALITY value
   * @return {Promise<Object>} { decision, pressureState }
   */
  async shouldAllowMove(nodeId, moveCriticality) {
    const pressureState = await this.resolvePressureState(nodeId);
    this.trackTransition(nodeId, pressureState);

    const isCritical =
      moveCriticality === MOVE_CRITICALITY.CRITICAL;

    if (pressureState === PRESSURE_STATE.NORMAL) {
      return {
        decision: PRESSURE_BEHAVIOR_DECISION.ALLOW,
        pressureState,
      };
    }

    if (pressureState === PRESSURE_STATE.SOFT) {
      if (isCritical) {
        return {
          decision: PRESSURE_BEHAVIOR_DECISION.ALLOW,
          pressureState,
        };
      }
      return {
        decision: PRESSURE_BEHAVIOR_DECISION.ALLOW_REDUCED_PRIORITY,
        pressureState,
      };
    }

    // hard or exhausted
    if (isCritical) {
      return {
        decision: PRESSURE_BEHAVIOR_DECISION.ALLOW,
        pressureState,
      };
    }
    return {
      decision: PRESSURE_BEHAVIOR_DECISION.DENY,
      pressureState,
    };
  }

  /**
   * Resolve the current pressure state for a node via the accounting
   * service.
   *
   * @param {string} nodeId
   * @return {Promise<string>} PRESSURE_STATE value
   * @private
   */
  async resolvePressureState(nodeId) {
    if (!this.accountingService ||
        typeof this.accountingService.getCapacitySnapshotForNode !==
          'function') {
      return PRESSURE_STATE.NORMAL;
    }

    const snapshot = await this.accountingService
      .getCapacitySnapshotForNode(nodeId);

    if (!snapshot) {
      return PRESSURE_STATE.NORMAL;
    }

    return snapshot.pressureState || PRESSURE_STATE.NORMAL;
  }

  /**
   * Track pressure state transitions and emit logs/metrics on change.
   *
   * @param {string} nodeId
   * @param {string} currentState - PRESSURE_STATE value
   * @private
   */
  trackTransition(nodeId, currentState) {
    const previousState = this.knownStates.get(nodeId);

    if (previousState === currentState) {
      return;
    }

    this.knownStates.set(nodeId, currentState);

    // First observation is not a transition — just record it
    if (previousState === undefined) {
      return;
    }

    this.logger.info(STORAGE_CAPACITY_LOG_MSG.PRESSURE_TRANSITION, {
      nodeId,
      previousState,
      currentState,
    });

    this.metricEvents.push({
      type: PRESSURE_BEHAVIOR_EVENT.PRESSURE_TRANSITION,
      nodeId,
      previousState,
      currentState,
      timestamp: Date.now(),
    });
  }

  /**
   * Return collected metric events (for observability consumers).
   * @return {Array<Object>}
   */
  getMetricEvents() {
    return this.metricEvents;
  }

  /**
   * Drain and return collected metric events, clearing the buffer.
   * @return {Array<Object>}
   */
  drainMetricEvents() {
    const events = this.metricEvents;
    this.metricEvents = [];
    return events;
  }
}

export {StoragePressureBehavior};
