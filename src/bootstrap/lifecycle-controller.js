import {EventEmitter} from 'node:events';
import {
  LIFECYCLE_ALLOWED_TRANSITIONS,
  LIFECYCLE_DEFAULT,
  LIFECYCLE_DEPENDENCY,
  LIFECYCLE_DEPENDENCY_CLASS,
  LIFECYCLE_EVENT,
  LIFECYCLE_LEGACY_STATE,
  LIFECYCLE_PHASE,
  LIFECYCLE_PROBE_STATUS_CLASS,
  LIFECYCLE_REASON,
} from './lifecycle-controller-constants.js';

const HARD_CLASS = LIFECYCLE_DEPENDENCY_CLASS.HARD;
const SOFT_CLASS = LIFECYCLE_DEPENDENCY_CLASS.SOFT;
const EMPTY_REASONS = Object.freeze([]);

/**
 * LifecycleController is the single owner for startup/join/traffic lifecycle.
 */
class LifecycleController extends EventEmitter {
  constructor(options = {}) {
    super();
    this._now = typeof options.now === 'function' ?
      options.now :
      () => Date.now();
    this._stableWindowMs = Number.isFinite(options.readyStableWindowMs) ?
      Math.max(0, Math.floor(options.readyStableWindowMs)) :
      LIFECYCLE_DEFAULT.STABLE_WINDOW_MS;
    this._demotionFailureThreshold =
      Number.isFinite(options.demotionFailureThreshold) ?
        Math.max(1, Math.floor(options.demotionFailureThreshold)) :
        LIFECYCLE_DEFAULT.DEMOTION_FAILURE_THRESHOLD;
    this._defaultRetryAfterMs = Number.isFinite(options.retryAfterMs) ?
      Math.max(0, Math.floor(options.retryAfterMs)) :
      LIFECYCLE_DEFAULT.RETRY_AFTER_MS;

    this._phase = LIFECYCLE_PHASE.INIT;
    this._legacyState = LIFECYCLE_LEGACY_STATE.STARTING;
    this._ready = false;
    this._reasons = [];
    this._degradedReasons = [];
    this._consecutiveFailureCount = 0;
    this._stableWindowStartedAt = null;
    this._dependencies = new Map();
    this._transitionCount = 0;
    this._transitionHistory = [];
    this._probeStatusCounts = new Map();
    this._blockedReasonSince = new Map();
    this._blockedDurationMs = new Map();
    this._draining = false;
    this._drainDeadlineMs = null;
    this._lastEvaluatedAt = null;
  }

  /**
   * Update one dependency contributing to lifecycle evaluation.
   * @param {string} name
   * @param {boolean} ready
   * @param {Object} [options]
   * @param {string} [options.reasonCode]
   * @param {string} [options.classification]
   * @param {Object|null} [options.details]
   */
  setDependency(name, ready, options = {}) {
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('Lifecycle dependency name is required');
    }
    const classification = options.classification === SOFT_CLASS ?
      SOFT_CLASS :
      HARD_CLASS;
    const reasonCode = typeof options.reasonCode === 'string' &&
      options.reasonCode.length > 0 ?
      options.reasonCode :
      null;
    this._dependencies.set(name, {
      ready: ready === true,
      classification,
      reasonCode,
      details: options.details && typeof options.details === 'object' ?
        options.details :
        null,
    });
  }

  /**
   * Evaluate dependency status and project lifecycle phase/readiness snapshot.
   * @return {Object}
   */
  evaluate() {
    const now = this._now();
    const previousPhase = this._phase;
    const previousLegacyState = this._legacyState;
    const previousReady = this._ready;
    const previousReasons = this._reasons;
    const dependencyStatus = this.collectDependencyStatus();
    const hardReasons = dependencyStatus.hardReasons;
    const degradedReasons = dependencyStatus.softReasons;
    const startupComplete = dependencyStatus.startupComplete;
    let nextReady = this._ready;
    let nextPhase = this._phase;
    let nextReasons = EMPTY_REASONS;

    if (this._draining) {
      this._stableWindowStartedAt = null;
      this._consecutiveFailureCount = 0;
      nextReady = false;
      nextPhase = LIFECYCLE_PHASE.DEGRADED;
      nextReasons = this.uniqueReasons([
        LIFECYCLE_REASON.NODE_DRAINING,
        ...hardReasons,
      ]);
    } else if (!startupComplete) {
      this._stableWindowStartedAt = null;
      this._consecutiveFailureCount = 0;
      nextReady = false;
      nextPhase = LIFECYCLE_PHASE.INIT;
      nextReasons = hardReasons;
    } else if (hardReasons.length > 0) {
      this._stableWindowStartedAt = null;
      if (this._ready) {
        this._consecutiveFailureCount += 1;
        if (this._consecutiveFailureCount >= this._demotionFailureThreshold) {
          nextReady = false;
          nextPhase = LIFECYCLE_PHASE.DEGRADED;
          nextReasons = hardReasons;
        } else {
          nextReady = true;
          nextPhase = LIFECYCLE_PHASE.TRAFFIC_READY;
          nextReasons = EMPTY_REASONS;
        }
      } else {
        this._consecutiveFailureCount = 0;
        nextReady = false;
        nextPhase = LIFECYCLE_PHASE.CONTROL_READY;
        nextReasons = hardReasons;
      }
    } else {
      this._consecutiveFailureCount = 0;
      if (this._stableWindowStartedAt === null) {
        this._stableWindowStartedAt = now;
      }
      const stableElapsedMs = now - this._stableWindowStartedAt;
      if (stableElapsedMs < this._stableWindowMs) {
        nextReady = false;
        nextPhase = LIFECYCLE_PHASE.JOIN_READY;
        nextReasons = [LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING];
      } else {
        nextReady = true;
        nextPhase = LIFECYCLE_PHASE.TRAFFIC_READY;
        nextReasons = EMPTY_REASONS;
      }
    }

    this._phase = nextPhase;
    this._legacyState = this.mapLegacyState(nextPhase);
    this._ready = nextReady;
    this._reasons = [...nextReasons];
    this._degradedReasons = degradedReasons;
    this._lastEvaluatedAt = now;
    this.updateBlockedReasonDurations(now, previousReasons);

    if (previousPhase !== this._phase ||
        previousReady !== this._ready ||
        !this.sameReasons(previousReasons, this._reasons)) {
      this.recordTransition({
        previousPhase,
        previousLegacyState,
        previousReady,
        phase: this._phase,
        legacyState: this._legacyState,
        ready: this._ready,
        reasons: this._reasons,
        degradedReasons: this._degradedReasons,
        timestamp: now,
      });
    }

    return this.getSnapshot();
  }

  /**
   * Apply one explicit phase transition with invariant validation.
   * @param {string} phase
   * @param {Object} [options]
   * @param {Array<string>} [options.reasons]
   * @param {Array<string>} [options.degradedReasons]
   * @param {boolean} [options.ready]
   * @return {Object}
   */
  transitionTo(phase, options = {}) {
    if (!Object.prototype.hasOwnProperty.call(LIFECYCLE_ALLOWED_TRANSITIONS, phase) &&
        phase !== this._phase) {
      throw new Error('Unknown lifecycle phase: ' + String(phase));
    }
    if (phase !== this._phase && !this.isTransitionAllowed(this._phase, phase)) {
      throw new Error(
        'Invalid lifecycle phase transition: ' +
        this._phase + ' -> ' + phase,
      );
    }

    const now = this._now();
    const previousPhase = this._phase;
    const previousLegacyState = this._legacyState;
    const previousReady = this._ready;
    const previousReasons = this._reasons;
    const reasons = this.normalizeReasons(options.reasons);
    const degradedReasons = this.normalizeReasons(options.degradedReasons);

    this._phase = phase;
    this._legacyState = this.mapLegacyState(phase);
    this._ready = typeof options.ready === 'boolean' ?
      options.ready :
      phase === LIFECYCLE_PHASE.TRAFFIC_READY;
    this._reasons = reasons;
    this._degradedReasons = degradedReasons;
    this._lastEvaluatedAt = now;
    this.updateBlockedReasonDurations(now, previousReasons);
    this.recordTransition({
      previousPhase,
      previousLegacyState,
      previousReady,
      phase: this._phase,
      legacyState: this._legacyState,
      ready: this._ready,
      reasons: this._reasons,
      degradedReasons: this._degradedReasons,
      timestamp: now,
    });
    return this.getSnapshot();
  }

  /**
   * Enter draining mode and force non-ready lifecycle projection.
   * @param {Object} [options]
   * @param {string} [options.reasonCode]
   * @param {number} [options.drainDeadlineMs]
   * @return {Object}
   */
  beginDrain(options = {}) {
    const reasonCode = typeof options.reasonCode === 'string' &&
      options.reasonCode.length > 0 ?
      options.reasonCode :
      LIFECYCLE_REASON.NODE_DRAINING;
    this._draining = true;
    this._drainDeadlineMs = Number.isFinite(options.drainDeadlineMs) ?
      Math.floor(options.drainDeadlineMs) :
      null;
    this.transitionTo(LIFECYCLE_PHASE.DEGRADED, {
      ready: false,
      reasons: [reasonCode],
    });
    return this.getSnapshot();
  }

  /**
   * Track one probe response status class.
   * @param {string} endpoint
   * @param {number} statusCode
   */
  recordProbeResult(endpoint, statusCode) {
    if (typeof endpoint !== 'string' || endpoint.length === 0) {
      return;
    }
    const statusClass = this.classifyProbeStatusCode(statusCode);
    const key = endpoint + ':' + statusClass;
    this._probeStatusCounts.set(key, (this._probeStatusCounts.get(key) || 0) + 1);
  }

  /**
   * Return immutable lifecycle snapshot.
   * @return {Object}
   */
  getSnapshot() {
    const now = this._now();
    return {
      ready: this._ready,
      phase: this._phase,
      state: this._legacyState,
      reasons: [...this._reasons],
      degradedReasons: [...this._degradedReasons],
      draining: this._draining,
      drainDeadlineMs: this._drainDeadlineMs,
      retryAfterMs: this._ready ? 0 : this._defaultRetryAfterMs,
      stableWindowMs: this._stableWindowMs,
      stableElapsedMs: this._stableWindowStartedAt === null ?
        0 :
        Math.max(0, now - this._stableWindowStartedAt),
      consecutiveFailureCount: this._consecutiveFailureCount,
      timestamp: now,
    };
  }

  /**
   * Return lifecycle diagnostics and observability counters.
   * @return {Object}
   */
  getMetrics() {
    const blockedDurationMs = {};
    for (const [reason, duration] of this._blockedDurationMs.entries()) {
      blockedDurationMs[reason] = duration;
    }
    for (const [reason, since] of this._blockedReasonSince.entries()) {
      blockedDurationMs[reason] = (blockedDurationMs[reason] || 0) +
        Math.max(0, this._now() - since);
    }

    const probeStatusCounts = {};
    for (const [key, count] of this._probeStatusCounts.entries()) {
      probeStatusCounts[key] = count;
    }

    return {
      phase: this._phase,
      ready: this._ready,
      transitionCount: this._transitionCount,
      blockedDurationMs,
      probeStatusCounts,
      degradedReasons: [...this._degradedReasons],
    };
  }

  /**
   * Return transition history (oldest first).
   * @return {Array<Object>}
   */
  getTransitionHistory() {
    return this._transitionHistory.map((entry) => ({
      previousPhase: entry.previousPhase,
      previousReady: entry.previousReady,
      phase: entry.phase,
      ready: entry.ready,
      reasons: [...entry.reasons],
      degradedReasons: [...entry.degradedReasons],
      timestamp: entry.timestamp,
    }));
  }

  /**
   * Classify probe status into a coarse status class.
   * @param {*} statusCode
   * @return {string}
   */
  classifyProbeStatusCode(statusCode) {
    if (!Number.isFinite(statusCode)) {
      return LIFECYCLE_PROBE_STATUS_CLASS.UNKNOWN;
    }
    const normalizedStatus = Math.floor(statusCode);
    if (normalizedStatus >= 200 && normalizedStatus < 300) {
      return LIFECYCLE_PROBE_STATUS_CLASS.SUCCESS_2XX;
    }
    if (normalizedStatus >= 400 && normalizedStatus < 500) {
      return LIFECYCLE_PROBE_STATUS_CLASS.CLIENT_4XX;
    }
    if (normalizedStatus >= 500 && normalizedStatus < 600) {
      return LIFECYCLE_PROBE_STATUS_CLASS.SERVER_5XX;
    }
    return LIFECYCLE_PROBE_STATUS_CLASS.UNKNOWN;
  }

  collectDependencyStatus() {
    const hardReasons = [];
    const softReasons = [];
    let startupComplete = true;

    for (const [name, dependency] of this._dependencies.entries()) {
      if (dependency.ready === true) {
        continue;
      }
      const reason = dependency.reasonCode;
      if (dependency.classification === SOFT_CLASS) {
        if (typeof reason === 'string' && reason.length > 0) {
          softReasons.push(reason);
        }
        continue;
      }
      if (typeof reason === 'string' && reason.length > 0) {
        hardReasons.push(reason);
      }
      if (name === LIFECYCLE_DEPENDENCY.STARTUP_COMPLETE) {
        startupComplete = false;
      }
    }

    return {
      hardReasons: this.uniqueReasons(hardReasons),
      softReasons: this.uniqueReasons(softReasons),
      startupComplete,
    };
  }

  mapLegacyState(phase) {
    if (phase === LIFECYCLE_PHASE.INIT) {
      return LIFECYCLE_LEGACY_STATE.BOOTSTRAPPING;
    }
    if (phase === LIFECYCLE_PHASE.CONTROL_READY ||
        phase === LIFECYCLE_PHASE.JOIN_READY) {
      return LIFECYCLE_LEGACY_STATE.WARMING;
    }
    if (phase === LIFECYCLE_PHASE.TRAFFIC_READY) {
      return LIFECYCLE_LEGACY_STATE.JOIN_READY;
    }
    return LIFECYCLE_LEGACY_STATE.DEGRADED;
  }

  isTransitionAllowed(fromPhase, toPhase) {
    const allowedTransitions = LIFECYCLE_ALLOWED_TRANSITIONS[fromPhase] || EMPTY_REASONS;
    return allowedTransitions.includes(toPhase);
  }

  normalizeReasons(reasons) {
    if (!Array.isArray(reasons)) {
      return [];
    }
    return this.uniqueReasons(
      reasons.filter((reason) => typeof reason === 'string' && reason.length > 0),
    );
  }

  uniqueReasons(reasons) {
    return [...new Set(reasons)];
  }

  sameReasons(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) {
        return false;
      }
    }
    return true;
  }

  updateBlockedReasonDurations(now, previousReasons) {
    const previousActiveReasons = new Set(
      Array.isArray(previousReasons) ? previousReasons : EMPTY_REASONS,
    );
    const activeReasons = new Set(this._reasons);

    for (const reason of previousActiveReasons.values()) {
      if (this._blockedReasonSince.has(reason)) {
        continue;
      }
      this._blockedReasonSince.set(reason, now);
    }

    for (const [reason, since] of this._blockedReasonSince.entries()) {
      if (activeReasons.has(reason)) {
        continue;
      }
      const elapsed = Math.max(0, now - since);
      this._blockedDurationMs.set(
        reason,
        (this._blockedDurationMs.get(reason) || 0) + elapsed,
      );
      this.emit(LIFECYCLE_EVENT.BLOCKED_DURATION, {
        reason,
        durationMs: elapsed,
        totalDurationMs: this._blockedDurationMs.get(reason),
        timestamp: now,
      });
      this._blockedReasonSince.delete(reason);
    }

    for (const reason of activeReasons.values()) {
      if (!this._blockedReasonSince.has(reason)) {
        this._blockedReasonSince.set(reason, now);
      }
    }
  }

  recordTransition(transition) {
    this._transitionCount += 1;
    this._transitionHistory.push({
      previousPhase: transition.previousPhase,
      previousReady: transition.previousReady,
      phase: transition.phase,
      ready: transition.ready,
      reasons: [...transition.reasons],
      degradedReasons: [...transition.degradedReasons],
      timestamp: transition.timestamp,
    });

    this.emit(LIFECYCLE_EVENT.TRANSITION, {
      previousPhase: transition.previousPhase,
      previousState: transition.previousLegacyState,
      previousReady: transition.previousReady,
      phase: transition.phase,
      state: transition.legacyState,
      ready: transition.ready,
      reasons: [...transition.reasons],
      degradedReasons: [...transition.degradedReasons],
      timestamp: transition.timestamp,
    });
  }
}

export {LifecycleController};
