/**
 * Storage Pressure Behavior - gates moves by per-node pressure state.
 *
 * Tracks pressure state transitions per node and provides a
 * `shouldAllowMove(nodeId, moveCriticality)` API that the MovePlanner
 * consults before scoring candidate target nodes.
 *
 * Requirements: 8.2, 8.3, 8.5
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
import { LoggingService } from '../logging/logging-service.js';
import { MOVE_CRITICALITY, PRESSURE_BEHAVIOR_DECISION, PRESSURE_BEHAVIOR_EVENT, PRESSURE_STATE, STORAGE_CAPACITY_LOG_MSG, STORAGE_CAPACITY_SUBSYSTEM } from './storage-capacity-constants.js';
const PRESSURE_BEHAVIOR_EVALUATION_STATE = Object.freeze(stryMutAct_9fa48("141867") ? {} : (stryCov_9fa48("141867"), {
  CONSTRAINED_ALLOW: stryMutAct_9fa48("141868") ? "" : (stryCov_9fa48("141868"), 'constrained_allow'),
  CONSTRAINED_DENY: stryMutAct_9fa48("141869") ? "" : (stryCov_9fa48("141869"), 'constrained_deny'),
  NORMAL_ALLOW: stryMutAct_9fa48("141870") ? "" : (stryCov_9fa48("141870"), 'normal_allow'),
  SOFT_ALLOW: stryMutAct_9fa48("141871") ? "" : (stryCov_9fa48("141871"), 'soft_allow'),
  SOFT_ALLOW_REDUCED_PRIORITY: stryMutAct_9fa48("141872") ? "" : (stryCov_9fa48("141872"), 'soft_allow_reduced_priority')
}));
function buildPressureBehaviorEvaluationSnapshot(pressureState, moveCriticality) {
  if (stryMutAct_9fa48("141873")) {
    {}
  } else {
    stryCov_9fa48("141873");
    return Object.freeze(stryMutAct_9fa48("141874") ? {} : (stryCov_9fa48("141874"), {
      pressureState,
      moveCriticality,
      isCritical: stryMutAct_9fa48("141877") ? moveCriticality !== MOVE_CRITICALITY.CRITICAL : stryMutAct_9fa48("141876") ? false : stryMutAct_9fa48("141875") ? true : (stryCov_9fa48("141875", "141876", "141877"), moveCriticality === MOVE_CRITICALITY.CRITICAL)
    }));
  }
}
function resolvePressureBehaviorEvaluationState(snapshot) {
  if (stryMutAct_9fa48("141878")) {
    {}
  } else {
    stryCov_9fa48("141878");
    if (stryMutAct_9fa48("141881") ? snapshot.pressureState !== PRESSURE_STATE.NORMAL : stryMutAct_9fa48("141880") ? false : stryMutAct_9fa48("141879") ? true : (stryCov_9fa48("141879", "141880", "141881"), snapshot.pressureState === PRESSURE_STATE.NORMAL)) {
      if (stryMutAct_9fa48("141882")) {
        {}
      } else {
        stryCov_9fa48("141882");
        return PRESSURE_BEHAVIOR_EVALUATION_STATE.NORMAL_ALLOW;
      }
    }
    if (stryMutAct_9fa48("141885") ? snapshot.pressureState !== PRESSURE_STATE.SOFT : stryMutAct_9fa48("141884") ? false : stryMutAct_9fa48("141883") ? true : (stryCov_9fa48("141883", "141884", "141885"), snapshot.pressureState === PRESSURE_STATE.SOFT)) {
      if (stryMutAct_9fa48("141886")) {
        {}
      } else {
        stryCov_9fa48("141886");
        return snapshot.isCritical ? PRESSURE_BEHAVIOR_EVALUATION_STATE.SOFT_ALLOW : PRESSURE_BEHAVIOR_EVALUATION_STATE.SOFT_ALLOW_REDUCED_PRIORITY;
      }
    }
    return snapshot.isCritical ? PRESSURE_BEHAVIOR_EVALUATION_STATE.CONSTRAINED_ALLOW : PRESSURE_BEHAVIOR_EVALUATION_STATE.CONSTRAINED_DENY;
  }
}
function buildPressureBehaviorDecision(snapshot, state) {
  if (stryMutAct_9fa48("141887")) {
    {}
  } else {
    stryCov_9fa48("141887");
    if (stryMutAct_9fa48("141890") ? (state === PRESSURE_BEHAVIOR_EVALUATION_STATE.NORMAL_ALLOW || state === PRESSURE_BEHAVIOR_EVALUATION_STATE.SOFT_ALLOW) && state === PRESSURE_BEHAVIOR_EVALUATION_STATE.CONSTRAINED_ALLOW : stryMutAct_9fa48("141889") ? false : stryMutAct_9fa48("141888") ? true : (stryCov_9fa48("141888", "141889", "141890"), (stryMutAct_9fa48("141892") ? state === PRESSURE_BEHAVIOR_EVALUATION_STATE.NORMAL_ALLOW && state === PRESSURE_BEHAVIOR_EVALUATION_STATE.SOFT_ALLOW : stryMutAct_9fa48("141891") ? false : (stryCov_9fa48("141891", "141892"), (stryMutAct_9fa48("141894") ? state !== PRESSURE_BEHAVIOR_EVALUATION_STATE.NORMAL_ALLOW : stryMutAct_9fa48("141893") ? false : (stryCov_9fa48("141893", "141894"), state === PRESSURE_BEHAVIOR_EVALUATION_STATE.NORMAL_ALLOW)) || (stryMutAct_9fa48("141896") ? state !== PRESSURE_BEHAVIOR_EVALUATION_STATE.SOFT_ALLOW : stryMutAct_9fa48("141895") ? false : (stryCov_9fa48("141895", "141896"), state === PRESSURE_BEHAVIOR_EVALUATION_STATE.SOFT_ALLOW)))) || (stryMutAct_9fa48("141898") ? state !== PRESSURE_BEHAVIOR_EVALUATION_STATE.CONSTRAINED_ALLOW : stryMutAct_9fa48("141897") ? false : (stryCov_9fa48("141897", "141898"), state === PRESSURE_BEHAVIOR_EVALUATION_STATE.CONSTRAINED_ALLOW)))) {
      if (stryMutAct_9fa48("141899")) {
        {}
      } else {
        stryCov_9fa48("141899");
        return Object.freeze(stryMutAct_9fa48("141900") ? {} : (stryCov_9fa48("141900"), {
          state,
          decision: PRESSURE_BEHAVIOR_DECISION.ALLOW,
          pressureState: snapshot.pressureState
        }));
      }
    }
    if (stryMutAct_9fa48("141903") ? state !== PRESSURE_BEHAVIOR_EVALUATION_STATE.SOFT_ALLOW_REDUCED_PRIORITY : stryMutAct_9fa48("141902") ? false : stryMutAct_9fa48("141901") ? true : (stryCov_9fa48("141901", "141902", "141903"), state === PRESSURE_BEHAVIOR_EVALUATION_STATE.SOFT_ALLOW_REDUCED_PRIORITY)) {
      if (stryMutAct_9fa48("141904")) {
        {}
      } else {
        stryCov_9fa48("141904");
        return Object.freeze(stryMutAct_9fa48("141905") ? {} : (stryCov_9fa48("141905"), {
          state,
          decision: PRESSURE_BEHAVIOR_DECISION.ALLOW_REDUCED_PRIORITY,
          pressureState: snapshot.pressureState
        }));
      }
    }
    return Object.freeze(stryMutAct_9fa48("141906") ? {} : (stryCov_9fa48("141906"), {
      state,
      decision: PRESSURE_BEHAVIOR_DECISION.DENY,
      pressureState: snapshot.pressureState
    }));
  }
}
class StoragePressureBehavior {
  /**
   * @param {Object} options
   * @param {Object} options.accountingService -
   *   StorageCapacityAccountingService instance
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("141907")) {
      {}
    } else {
      stryCov_9fa48("141907");
      this.accountingService = stryMutAct_9fa48("141910") ? options.accountingService && null : stryMutAct_9fa48("141909") ? false : stryMutAct_9fa48("141908") ? true : (stryCov_9fa48("141908", "141909", "141910"), options.accountingService || null);
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(STORAGE_CAPACITY_SUBSYSTEM) : console;

      /** @type {Map<string, string>} nodeId → last known pressure state */
      this.knownStates = new Map();

      /** @type {Array<Object>} collected metric events */
      this.metricEvents = stryMutAct_9fa48("141911") ? ["Stryker was here"] : (stryCov_9fa48("141911"), []);
    }
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
    if (stryMutAct_9fa48("141912")) {
      {}
    } else {
      stryCov_9fa48("141912");
      const pressureState = await this.resolvePressureState(nodeId);
      this.trackTransition(nodeId, pressureState);
      const snapshot = buildPressureBehaviorEvaluationSnapshot(pressureState, moveCriticality);
      const state = resolvePressureBehaviorEvaluationState(snapshot);
      return buildPressureBehaviorDecision(snapshot, state);
    }
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
    if (stryMutAct_9fa48("141913")) {
      {}
    } else {
      stryCov_9fa48("141913");
      if (stryMutAct_9fa48("141916") ? !this.accountingService && typeof this.accountingService.getCapacitySnapshotForNode !== 'function' : stryMutAct_9fa48("141915") ? false : stryMutAct_9fa48("141914") ? true : (stryCov_9fa48("141914", "141915", "141916"), (stryMutAct_9fa48("141917") ? this.accountingService : (stryCov_9fa48("141917"), !this.accountingService)) || (stryMutAct_9fa48("141919") ? typeof this.accountingService.getCapacitySnapshotForNode === 'function' : stryMutAct_9fa48("141918") ? false : (stryCov_9fa48("141918", "141919"), typeof this.accountingService.getCapacitySnapshotForNode !== (stryMutAct_9fa48("141920") ? "" : (stryCov_9fa48("141920"), 'function')))))) {
        if (stryMutAct_9fa48("141921")) {
          {}
        } else {
          stryCov_9fa48("141921");
          return PRESSURE_STATE.NORMAL;
        }
      }
      const snapshot = await this.accountingService.getCapacitySnapshotForNode(nodeId);
      if (stryMutAct_9fa48("141924") ? false : stryMutAct_9fa48("141923") ? true : stryMutAct_9fa48("141922") ? snapshot : (stryCov_9fa48("141922", "141923", "141924"), !snapshot)) {
        if (stryMutAct_9fa48("141925")) {
          {}
        } else {
          stryCov_9fa48("141925");
          return PRESSURE_STATE.NORMAL;
        }
      }
      return stryMutAct_9fa48("141928") ? snapshot.pressureState && PRESSURE_STATE.NORMAL : stryMutAct_9fa48("141927") ? false : stryMutAct_9fa48("141926") ? true : (stryCov_9fa48("141926", "141927", "141928"), snapshot.pressureState || PRESSURE_STATE.NORMAL);
    }
  }

  /**
   * Track pressure state transitions and emit logs/metrics on change.
   *
   * @param {string} nodeId
   * @param {string} currentState - PRESSURE_STATE value
   * @private
   */
  trackTransition(nodeId, currentState) {
    if (stryMutAct_9fa48("141929")) {
      {}
    } else {
      stryCov_9fa48("141929");
      const previousState = this.knownStates.get(nodeId);
      if (stryMutAct_9fa48("141932") ? previousState !== currentState : stryMutAct_9fa48("141931") ? false : stryMutAct_9fa48("141930") ? true : (stryCov_9fa48("141930", "141931", "141932"), previousState === currentState)) {
        if (stryMutAct_9fa48("141933")) {
          {}
        } else {
          stryCov_9fa48("141933");
          return;
        }
      }
      this.knownStates.set(nodeId, currentState);

      // First observation is not a transition — just record it
      if (stryMutAct_9fa48("141936") ? previousState !== undefined : stryMutAct_9fa48("141935") ? false : stryMutAct_9fa48("141934") ? true : (stryCov_9fa48("141934", "141935", "141936"), previousState === undefined)) {
        if (stryMutAct_9fa48("141937")) {
          {}
        } else {
          stryCov_9fa48("141937");
          return;
        }
      }
      this.logger.info(STORAGE_CAPACITY_LOG_MSG.PRESSURE_TRANSITION, stryMutAct_9fa48("141938") ? {} : (stryCov_9fa48("141938"), {
        nodeId,
        previousState,
        currentState
      }));
      this.metricEvents.push(stryMutAct_9fa48("141939") ? {} : (stryCov_9fa48("141939"), {
        type: PRESSURE_BEHAVIOR_EVENT.PRESSURE_TRANSITION,
        nodeId,
        previousState,
        currentState,
        timestamp: Date.now()
      }));
    }
  }

  /**
   * Return collected metric events (for observability consumers).
   * @return {Array<Object>}
   */
  getMetricEvents() {
    if (stryMutAct_9fa48("141940")) {
      {}
    } else {
      stryCov_9fa48("141940");
      return this.metricEvents;
    }
  }

  /**
   * Drain and return collected metric events, clearing the buffer.
   * @return {Array<Object>}
   */
  drainMetricEvents() {
    if (stryMutAct_9fa48("141941")) {
      {}
    } else {
      stryCov_9fa48("141941");
      const events = this.metricEvents;
      this.metricEvents = stryMutAct_9fa48("141942") ? ["Stryker was here"] : (stryCov_9fa48("141942"), []);
      return events;
    }
  }
}
export { StoragePressureBehavior };