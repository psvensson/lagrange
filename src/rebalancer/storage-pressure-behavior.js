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

const LOCAL_STR_FUNCTION = 'function';

const PRESSURE_BEHAVIOR_EVALUATION_STATE = Object.freeze({
  CONSTRAINED_ALLOW: 'constrained_allow',
  CONSTRAINED_DENY: 'constrained_deny',
  NORMAL_ALLOW: 'normal_allow',
  SOFT_ALLOW: 'soft_allow',
  SOFT_ALLOW_REDUCED_PRIORITY: 'soft_allow_reduced_priority',
});

function buildPressureBehaviorEvaluationSnapshot(pressureState, moveCriticality) {
  return Object.freeze({
    pressureState,
    moveCriticality,
    isCritical: moveCriticality === MOVE_CRITICALITY.CRITICAL,
  });
}

function resolvePressureBehaviorEvaluationState(snapshot) {
  if (snapshot.pressureState === PRESSURE_STATE.NORMAL) {
    return PRESSURE_BEHAVIOR_EVALUATION_STATE.NORMAL_ALLOW;
  }

  if (snapshot.pressureState === PRESSURE_STATE.SOFT) {
    return snapshot.isCritical ?
      PRESSURE_BEHAVIOR_EVALUATION_STATE.SOFT_ALLOW :
      PRESSURE_BEHAVIOR_EVALUATION_STATE.SOFT_ALLOW_REDUCED_PRIORITY;
  }

  return snapshot.isCritical ?
    PRESSURE_BEHAVIOR_EVALUATION_STATE.CONSTRAINED_ALLOW :
    PRESSURE_BEHAVIOR_EVALUATION_STATE.CONSTRAINED_DENY;
}

function buildPressureBehaviorDecision(snapshot, state) {
  if (state === PRESSURE_BEHAVIOR_EVALUATION_STATE.NORMAL_ALLOW ||
      state === PRESSURE_BEHAVIOR_EVALUATION_STATE.SOFT_ALLOW ||
      state === PRESSURE_BEHAVIOR_EVALUATION_STATE.CONSTRAINED_ALLOW) {
    return Object.freeze({
      state,
      decision: PRESSURE_BEHAVIOR_DECISION.ALLOW,
      pressureState: snapshot.pressureState,
    });
  }

  if (state ===
      PRESSURE_BEHAVIOR_EVALUATION_STATE.SOFT_ALLOW_REDUCED_PRIORITY) {
    return Object.freeze({
      state,
      decision: PRESSURE_BEHAVIOR_DECISION.ALLOW_REDUCED_PRIORITY,
      pressureState: snapshot.pressureState,
    });
  }

  return Object.freeze({
    state,
    decision: PRESSURE_BEHAVIOR_DECISION.DENY,
    pressureState: snapshot.pressureState,
  });
}

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

    const snapshot = buildPressureBehaviorEvaluationSnapshot(
      pressureState,
      moveCriticality,
    );
    const state = resolvePressureBehaviorEvaluationState(snapshot);
    return buildPressureBehaviorDecision(snapshot, state);
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
          LOCAL_STR_FUNCTION) {
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
