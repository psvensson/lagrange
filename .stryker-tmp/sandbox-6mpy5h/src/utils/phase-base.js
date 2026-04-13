/**
 * PhaseBase - Base class for phase-based operations.
 *
 * Provides a standardized pattern for multi-step operations with:
 * - Event emission on phase transitions (started, completed, failed)
 * - Timing tracking for observability
 * - Abstract run() method for subclass implementation
 *
 * Requirements: 4.4, 4.6
 *
 * @interface
 * @fires PhaseBase#phaseStarted - When phase execution begins
 * @fires PhaseBase#phaseCompleted - When phase execution completes successfully
 * @fires PhaseBase#phaseFailed - When phase execution fails
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

/**
 * Event names for phase lifecycle.
 * @type {Object}
 */
const PHASE_EVENT = Object.freeze(stryMutAct_9fa48("160204") ? {} : (stryCov_9fa48("160204"), {
  STARTED: stryMutAct_9fa48("160205") ? "" : (stryCov_9fa48("160205"), 'phaseStarted'),
  COMPLETED: stryMutAct_9fa48("160206") ? "" : (stryCov_9fa48("160206"), 'phaseCompleted'),
  FAILED: stryMutAct_9fa48("160207") ? "" : (stryCov_9fa48("160207"), 'phaseFailed')
}));

/**
 * Error messages for PhaseBase.
 * @type {Object}
 */
const PHASE_ERROR = Object.freeze(stryMutAct_9fa48("160208") ? {} : (stryCov_9fa48("160208"), {
  RUN_NOT_IMPLEMENTED: stryMutAct_9fa48("160209") ? "" : (stryCov_9fa48("160209"), 'Subclasses must implement run()')
}));

/**
 * Base class for phase-based operations.
 * Subclasses must implement the run() method.
 *
 * @extends EventEmitter
 */
class PhaseBase extends EventEmitter {
  /**
   * Create a new PhaseBase.
   * @param {string} name - The name of the phase.
   * @param {Object} context - Context data passed to the phase.
   */
  constructor(name, context) {
    if (stryMutAct_9fa48("160210")) {
      {}
    } else {
      stryCov_9fa48("160210");
      super();
      this.name = name;
      this.context = context;
      this.startTime = null;
      this.endTime = null;
    }
  }

  /**
   * Execute the phase with event emission and timing.
   * Emits 'phaseStarted' before execution, and either
   * 'phaseCompleted' or 'phaseFailed' after execution.
   *
   * @return {Promise<*>} The result from the run() method.
   * @throws {Error} If run() throws an error.
   */
  async execute() {
    if (stryMutAct_9fa48("160211")) {
      {}
    } else {
      stryCov_9fa48("160211");
      this.startTime = Date.now();
      this.emit(PHASE_EVENT.STARTED, stryMutAct_9fa48("160212") ? {} : (stryCov_9fa48("160212"), {
        phase: this.name,
        context: this.context
      }));
      try {
        if (stryMutAct_9fa48("160213")) {
          {}
        } else {
          stryCov_9fa48("160213");
          const result = await this.run();
          this.endTime = Date.now();
          this.emit(PHASE_EVENT.COMPLETED, stryMutAct_9fa48("160214") ? {} : (stryCov_9fa48("160214"), {
            phase: this.name,
            duration: stryMutAct_9fa48("160215") ? this.endTime + this.startTime : (stryCov_9fa48("160215"), this.endTime - this.startTime),
            result
          }));
          return result;
        }
      } catch (error) {
        if (stryMutAct_9fa48("160216")) {
          {}
        } else {
          stryCov_9fa48("160216");
          this.endTime = Date.now();
          this.emit(PHASE_EVENT.FAILED, stryMutAct_9fa48("160217") ? {} : (stryCov_9fa48("160217"), {
            phase: this.name,
            duration: stryMutAct_9fa48("160218") ? this.endTime + this.startTime : (stryCov_9fa48("160218"), this.endTime - this.startTime),
            error
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Abstract method that subclasses must implement.
   * Contains the actual phase logic.
   *
   * @abstract
   * @return {Promise<*>} The result of the phase execution.
   * @throws {Error} Always throws if not overridden.
   */
  async run() {
    if (stryMutAct_9fa48("160219")) {
      {}
    } else {
      stryCov_9fa48("160219");
      throw new Error(PHASE_ERROR.RUN_NOT_IMPLEMENTED);
    }
  }

  /**
   * Get the duration of the phase execution in milliseconds.
   * Returns null if the phase has not completed.
   *
   * @return {number|null} Duration in milliseconds or null.
   */
  getDuration() {
    if (stryMutAct_9fa48("160220")) {
      {}
    } else {
      stryCov_9fa48("160220");
      if (stryMutAct_9fa48("160223") ? this.startTime === null && this.endTime === null : stryMutAct_9fa48("160222") ? false : stryMutAct_9fa48("160221") ? true : (stryCov_9fa48("160221", "160222", "160223"), (stryMutAct_9fa48("160225") ? this.startTime !== null : stryMutAct_9fa48("160224") ? false : (stryCov_9fa48("160224", "160225"), this.startTime === null)) || (stryMutAct_9fa48("160227") ? this.endTime !== null : stryMutAct_9fa48("160226") ? false : (stryCov_9fa48("160226", "160227"), this.endTime === null)))) {
        if (stryMutAct_9fa48("160228")) {
          {}
        } else {
          stryCov_9fa48("160228");
          return null;
        }
      }
      return stryMutAct_9fa48("160229") ? this.endTime + this.startTime : (stryCov_9fa48("160229"), this.endTime - this.startTime);
    }
  }
}
export { PhaseBase, PHASE_EVENT, PHASE_ERROR };