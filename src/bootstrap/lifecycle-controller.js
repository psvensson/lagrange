import {EventEmitter} from 'node:events';
import {
  LIFECYCLE_ALLOWED_TRANSITIONS,
  LIFECYCLE_DEFAULT,
  LIFECYCLE_DEPENDENCY,
  LIFECYCLE_DEPENDENCY_CLASS,
  LIFECYCLE_DEPENDENCY_DEMOTION_POLICY,
  LIFECYCLE_EVENT,
  LIFECYCLE_LEGACY_STATE,
  LIFECYCLE_PHASE,
  LIFECYCLE_PROBE_STATUS_CLASS,
  LIFECYCLE_REASON,
} from './lifecycle-controller-constants.js';

const HARD_CLASS = LIFECYCLE_DEPENDENCY_CLASS.HARD;
const SOFT_CLASS = LIFECYCLE_DEPENDENCY_CLASS.SOFT;
const THRESHOLD_DEMOTION_POLICY =
  LIFECYCLE_DEPENDENCY_DEMOTION_POLICY.THRESHOLD;
const IMMEDIATE_DEMOTION_POLICY =
  LIFECYCLE_DEPENDENCY_DEMOTION_POLICY.IMMEDIATE;
const EMPTY_REASONS = Object.freeze([]);
const TYPE_FUNCTION = 'function';
const TYPE_STRING = 'string';
const TYPE_OBJECT = 'object';
const TYPE_BOOLEAN = 'boolean';
const ZERO_COUNT = 0;
const ONE_COUNT = 1;
const PHASE_RANK_INIT = 0;
const PHASE_RANK_CONTROL_READY = 1;
const PHASE_RANK_JOIN_READY = 2;
const PHASE_RANK_TRAFFIC_READY = 3;
const MIN_STABLE_WINDOW_MS = 0;
const MIN_DEMOTION_FAILURE_THRESHOLD = 1;
const MIN_RETRY_AFTER_MS = 0;
const NO_FAILURE_COUNT = 0;
const FAILURE_COUNT_STEP = 1;
const LIFECYCLE_DEPENDENCY_NAME_REQUIRED_ERROR =
  'Lifecycle dependency name is required';
const UNKNOWN_LIFECYCLE_PHASE_ERROR_PREFIX = 'Unknown lifecycle phase: ';
const INVALID_LIFECYCLE_PHASE_TRANSITION_ERROR_PREFIX =
  'Invalid lifecycle phase transition: ';
const INVALID_LIFECYCLE_PHASE_TRANSITION_SEPARATOR = ' -> ';
const UNKNOWN_EVALUATION_STATE_ERROR_PREFIX =
  'Unknown lifecycle evaluation state: ';
const PROBE_STATUS_SUCCESS_MIN = 200;
const PROBE_STATUS_SUCCESS_MAX = 300;
const PROBE_STATUS_CLIENT_ERROR_MIN = 400;
const PROBE_STATUS_CLIENT_ERROR_MAX = 500;
const PROBE_STATUS_SERVER_ERROR_MIN = 500;
const PROBE_STATUS_SERVER_ERROR_MAX = 600;
const LIFECYCLE_EVALUATION_STATE = Object.freeze({
  DRAINING: 'draining',
  STARTUP_PENDING: 'startup_pending',
  HARD_CONTROL_BLOCKED: 'hard_control_blocked',
  HARD_DEGRADED_IMMEDIATE: 'hard_degraded_immediate',
  HARD_DEGRADED_THRESHOLD: 'hard_degraded_threshold',
  HARD_TRAFFIC_GRACE: 'hard_traffic_grace',
  STABLE_WINDOW_PENDING: 'stable_window_pending',
  TRAFFIC_READY: 'traffic_ready',
});
const LIFECYCLE_PHASE_RANK = Object.freeze({
  [LIFECYCLE_PHASE.INIT]: PHASE_RANK_INIT,
  [LIFECYCLE_PHASE.CONTROL_READY]: PHASE_RANK_CONTROL_READY,
  [LIFECYCLE_PHASE.JOIN_READY]: PHASE_RANK_JOIN_READY,
  [LIFECYCLE_PHASE.TRAFFIC_READY]: PHASE_RANK_TRAFFIC_READY,
  [LIFECYCLE_PHASE.DEGRADED]: PHASE_RANK_CONTROL_READY,
});

function resolveLifecyclePhaseRank(phase) {
  return LIFECYCLE_PHASE_RANK[phase] || PHASE_RANK_INIT;
}

/**
 * LifecycleController is the single owner for startup/join/traffic lifecycle.
 */
class LifecycleController extends EventEmitter {
  constructor(options = {}) {
    super();
    this._now = typeof options.now === TYPE_FUNCTION ?
      options.now :
      () => Date.now();
    this._stableWindowMs = Number.isFinite(options.readyStableWindowMs) ?
      Math.max(MIN_STABLE_WINDOW_MS, Math.floor(options.readyStableWindowMs)) :
      LIFECYCLE_DEFAULT.STABLE_WINDOW_MS;
    this._demotionFailureThreshold =
      Number.isFinite(options.demotionFailureThreshold) ?
        Math.max(
          MIN_DEMOTION_FAILURE_THRESHOLD,
          Math.floor(options.demotionFailureThreshold),
        ) :
        LIFECYCLE_DEFAULT.DEMOTION_FAILURE_THRESHOLD;
    this._defaultRetryAfterMs = Number.isFinite(options.retryAfterMs) ?
      Math.max(MIN_RETRY_AFTER_MS, Math.floor(options.retryAfterMs)) :
      LIFECYCLE_DEFAULT.RETRY_AFTER_MS;

    this._phase = LIFECYCLE_PHASE.INIT;
    this._ready = false;
    this._reasons = [];
    this._degradedReasons = [];
    this._consecutiveFailureCount = ZERO_COUNT;
    this._stableWindowStartedAt = null;
    this._dependencies = new Map();
    this._transitionCount = ZERO_COUNT;
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
    if (typeof name !== TYPE_STRING || name.length === PHASE_RANK_INIT) {
      throw new Error(LIFECYCLE_DEPENDENCY_NAME_REQUIRED_ERROR);
    }
    const classification = options.classification === SOFT_CLASS ?
      SOFT_CLASS :
      HARD_CLASS;
    const reasonCode = typeof options.reasonCode === TYPE_STRING &&
      options.reasonCode.length > PHASE_RANK_INIT ?
      options.reasonCode :
      null;
    const demotionPolicy = options.demotionPolicy === IMMEDIATE_DEMOTION_POLICY ?
      IMMEDIATE_DEMOTION_POLICY :
      THRESHOLD_DEMOTION_POLICY;
    this._dependencies.set(name, {
      ready: ready === true,
      classification,
      reasonCode,
      demotionPolicy,
      details: options.details && typeof options.details === TYPE_OBJECT ?
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
    const previousLegacyState = this.resolveLegacyState(previousPhase, {
      beforeFirstEvaluation: this._lastEvaluatedAt === null,
    });
    const previousReady = this._ready;
    const previousReasons = this._reasons;
    const dependencyStatus = this.collectDependencyStatus();
    const evaluationContext = this.collectEvaluationContext({
      now,
      dependencyStatus,
    });
    const outcome = this.resolveEvaluationOutcome(evaluationContext);

    this._stableWindowStartedAt = outcome.stableWindowStartedAt;
    this._consecutiveFailureCount = outcome.consecutiveFailureCount;
    this._phase = outcome.phase;
    this._ready = outcome.ready;
    this._reasons = [...outcome.reasons];
    this._degradedReasons = evaluationContext.degradedReasons;
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
        ready: this._ready,
        reasons: this._reasons,
        degradedReasons: this._degradedReasons,
        timestamp: now,
      });
    }

    return this.getSnapshot();
  }

  collectEvaluationContext(context = {}) {
    const dependencyStatus = context.dependencyStatus &&
      typeof context.dependencyStatus === TYPE_OBJECT ?
      context.dependencyStatus :
      {};
    const hardReasons = Array.isArray(dependencyStatus.hardReasons) ?
      dependencyStatus.hardReasons :
      EMPTY_REASONS;
    const immediateHardReasons = Array.isArray(dependencyStatus.immediateHardReasons) ?
      dependencyStatus.immediateHardReasons :
      EMPTY_REASONS;
    const degradedReasons = Array.isArray(dependencyStatus.softReasons) ?
      dependencyStatus.softReasons :
      EMPTY_REASONS;
    const stableWindowStartedAt = this._stableWindowStartedAt === null ?
      context.now :
      this._stableWindowStartedAt;

    return {
      now: context.now,
      startupComplete: dependencyStatus.startupComplete === true,
      hardReasons,
      immediateHardReasons,
      degradedReasons,
      stableWindowStartedAt,
      stableElapsedMs: context.now - stableWindowStartedAt,
      currentFailureCount: this._consecutiveFailureCount,
      currentlyReady: this._ready === true,
      draining: this._draining === true,
    };
  }

  resolveEvaluationOutcome(context = {}) {
    const evaluationDecision = this.resolveEvaluationDecision(context);

    switch (evaluationDecision.state) {
    case LIFECYCLE_EVALUATION_STATE.DRAINING:
      return this.buildEvaluationOutcome({
        stableWindowStartedAt: null,
        ready: false,
        phase: LIFECYCLE_PHASE.DEGRADED,
        consecutiveFailureCount: NO_FAILURE_COUNT,
        reasons: this.uniqueReasons([
          LIFECYCLE_REASON.NODE_DRAINING,
          ...context.hardReasons,
        ]),
      });
    case LIFECYCLE_EVALUATION_STATE.STARTUP_PENDING:
      return this.buildEvaluationOutcome({
        stableWindowStartedAt: null,
        consecutiveFailureCount: NO_FAILURE_COUNT,
        ready: false,
        phase: LIFECYCLE_PHASE.INIT,
        reasons: context.hardReasons,
      });
    case LIFECYCLE_EVALUATION_STATE.HARD_CONTROL_BLOCKED:
      return this.buildEvaluationOutcome({
        stableWindowStartedAt: null,
        consecutiveFailureCount: NO_FAILURE_COUNT,
        ready: false,
        phase: LIFECYCLE_PHASE.CONTROL_READY,
        reasons: context.hardReasons,
      });
    case LIFECYCLE_EVALUATION_STATE.HARD_DEGRADED_IMMEDIATE:
      return this.buildEvaluationOutcome({
        stableWindowStartedAt: null,
        consecutiveFailureCount: NO_FAILURE_COUNT,
        ready: false,
        phase: LIFECYCLE_PHASE.DEGRADED,
        reasons: context.hardReasons,
      });
    case LIFECYCLE_EVALUATION_STATE.HARD_DEGRADED_THRESHOLD:
      return this.buildEvaluationOutcome({
        stableWindowStartedAt: null,
        consecutiveFailureCount: evaluationDecision.consecutiveFailureCount,
        ready: false,
        phase: LIFECYCLE_PHASE.DEGRADED,
        reasons: context.hardReasons,
      });
    case LIFECYCLE_EVALUATION_STATE.HARD_TRAFFIC_GRACE:
      return this.buildEvaluationOutcome({
        stableWindowStartedAt: null,
        consecutiveFailureCount: evaluationDecision.consecutiveFailureCount,
        ready: true,
        phase: LIFECYCLE_PHASE.TRAFFIC_READY,
        reasons: EMPTY_REASONS,
      });
    case LIFECYCLE_EVALUATION_STATE.STABLE_WINDOW_PENDING:
      return this.buildEvaluationOutcome({
        stableWindowStartedAt: context.stableWindowStartedAt,
        consecutiveFailureCount: NO_FAILURE_COUNT,
        ready: false,
        phase: LIFECYCLE_PHASE.JOIN_READY,
        reasons: [LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING],
      });
    case LIFECYCLE_EVALUATION_STATE.TRAFFIC_READY:
      return this.buildEvaluationOutcome({
        stableWindowStartedAt: context.stableWindowStartedAt,
        consecutiveFailureCount: NO_FAILURE_COUNT,
        ready: true,
        phase: LIFECYCLE_PHASE.TRAFFIC_READY,
        reasons: EMPTY_REASONS,
      });
    default:
      throw new Error(
        UNKNOWN_EVALUATION_STATE_ERROR_PREFIX +
          String(evaluationDecision.state),
      );
    }
  }

  resolveEvaluationDecision(context = {}) {
    if (context.draining === true) {
      return {state: LIFECYCLE_EVALUATION_STATE.DRAINING};
    } else if (context.startupComplete !== true) {
      return {state: LIFECYCLE_EVALUATION_STATE.STARTUP_PENDING};
    } else if (context.hardReasons.length > NO_FAILURE_COUNT) {
      return this.resolveHardFailureEvaluationDecision(context);
    } else if (context.stableElapsedMs < this._stableWindowMs) {
      return {state: LIFECYCLE_EVALUATION_STATE.STABLE_WINDOW_PENDING};
    } else {
      return {state: LIFECYCLE_EVALUATION_STATE.TRAFFIC_READY};
    }
  }

  resolveHardFailureEvaluationDecision(context = {}) {
    if (context.immediateHardReasons.length > NO_FAILURE_COUNT) {
      return {state: LIFECYCLE_EVALUATION_STATE.HARD_DEGRADED_IMMEDIATE};
    } else if (context.currentlyReady !== true) {
      return {state: LIFECYCLE_EVALUATION_STATE.HARD_CONTROL_BLOCKED};
    } else {
      const consecutiveFailureCount =
        context.currentFailureCount + FAILURE_COUNT_STEP;
      return {
        state: consecutiveFailureCount >= this._demotionFailureThreshold ?
          LIFECYCLE_EVALUATION_STATE.HARD_DEGRADED_THRESHOLD :
          LIFECYCLE_EVALUATION_STATE.HARD_TRAFFIC_GRACE,
        consecutiveFailureCount,
      };
    }
  }

  buildEvaluationOutcome(options = {}) {
    return {
      stableWindowStartedAt: options.stableWindowStartedAt,
      consecutiveFailureCount: options.consecutiveFailureCount,
      ready: options.ready === true,
      phase: options.phase,
      reasons: Array.isArray(options.reasons) ? options.reasons : EMPTY_REASONS,
    };
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
      throw new Error(UNKNOWN_LIFECYCLE_PHASE_ERROR_PREFIX + String(phase));
    }
    if (phase !== this._phase && !this.isTransitionAllowed(this._phase, phase)) {
      throw new Error(
        INVALID_LIFECYCLE_PHASE_TRANSITION_ERROR_PREFIX +
        this._phase +
        INVALID_LIFECYCLE_PHASE_TRANSITION_SEPARATOR +
        phase,
      );
    }

    const now = this._now();
    const previousPhase = this._phase;
    const previousLegacyState = this.resolveLegacyState(previousPhase, {
      beforeFirstEvaluation: this._lastEvaluatedAt === null,
    });
    const previousReady = this._ready;
    const previousReasons = this._reasons;
    const reasons = this.normalizeReasons(options.reasons);
    const degradedReasons = this.normalizeReasons(options.degradedReasons);

    this._phase = phase;
    this._ready = typeof options.ready === TYPE_BOOLEAN ?
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
    const reasonCode = typeof options.reasonCode === TYPE_STRING &&
      options.reasonCode.length > PHASE_RANK_INIT ?
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
    if (typeof endpoint !== TYPE_STRING || endpoint.length === ZERO_COUNT) {
      return;
    }
    const statusClass = this.classifyProbeStatusCode(statusCode);
    const key = endpoint + ':' + statusClass;
    this._probeStatusCounts.set(
      key,
      (this._probeStatusCounts.get(key) || ZERO_COUNT) + ONE_COUNT,
    );
  }

  /**
   * Return immutable lifecycle snapshot.
   * @return {Object}
   */
  getSnapshot() {
    const now = this._now();
    const stableSinceMs = this._stableWindowStartedAt === null ?
      null :
      this._stableWindowStartedAt;
    return {
      ready: this._ready,
      phase: this._phase,
      phaseRank: resolveLifecyclePhaseRank(this._phase),
      state: this.resolveLegacyState(this._phase),
      reasons: [...this._reasons],
      degradedReasons: [...this._degradedReasons],
      draining: this._draining,
      drainDeadlineMs: this._drainDeadlineMs,
      retryAfterMs: this._ready ? ZERO_COUNT : this._defaultRetryAfterMs,
      transitionCount: this._transitionCount,
      stableWindowMs: this._stableWindowMs,
      stableElapsedMs: this._stableWindowStartedAt === null ?
        ZERO_COUNT :
        Math.max(ZERO_COUNT, now - this._stableWindowStartedAt),
      stableSinceMs,
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
      blockedDurationMs[reason] = (blockedDurationMs[reason] || ZERO_COUNT) +
        Math.max(ZERO_COUNT, this._now() - since);
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
    if (normalizedStatus >= PROBE_STATUS_SUCCESS_MIN &&
        normalizedStatus < PROBE_STATUS_SUCCESS_MAX) {
      return LIFECYCLE_PROBE_STATUS_CLASS.SUCCESS_2XX;
    }
    if (normalizedStatus >= PROBE_STATUS_CLIENT_ERROR_MIN &&
        normalizedStatus < PROBE_STATUS_CLIENT_ERROR_MAX) {
      return LIFECYCLE_PROBE_STATUS_CLASS.CLIENT_4XX;
    }
    if (normalizedStatus >= PROBE_STATUS_SERVER_ERROR_MIN &&
        normalizedStatus < PROBE_STATUS_SERVER_ERROR_MAX) {
      return LIFECYCLE_PROBE_STATUS_CLASS.SERVER_5XX;
    }
    return LIFECYCLE_PROBE_STATUS_CLASS.UNKNOWN;
  }

  collectDependencyStatus() {
    const hardReasons = [];
    const immediateHardReasons = [];
    const softReasons = [];
    let startupComplete = true;

    for (const [name, dependency] of this._dependencies.entries()) {
      if (dependency.ready === true) {
        continue;
      }
      const reason = dependency.reasonCode;
      if (dependency.classification === SOFT_CLASS) {
        if (typeof reason === TYPE_STRING && reason.length > ZERO_COUNT) {
          softReasons.push(reason);
        }
        continue;
      }
      if (typeof reason === TYPE_STRING && reason.length > ZERO_COUNT) {
        hardReasons.push(reason);
        if (dependency.demotionPolicy === IMMEDIATE_DEMOTION_POLICY) {
          immediateHardReasons.push(reason);
        }
      }
      if (name === LIFECYCLE_DEPENDENCY.STARTUP_COMPLETE) {
        startupComplete = false;
      }
    }

    return {
      hardReasons: this.uniqueReasons(hardReasons),
      immediateHardReasons: this.uniqueReasons(immediateHardReasons),
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

  resolveLegacyState(phase, options = {}) {
    if (options.beforeFirstEvaluation === true) {
      return LIFECYCLE_LEGACY_STATE.STARTING;
    }
    return this.mapLegacyState(phase);
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
      reasons.filter((reason) =>
        typeof reason === TYPE_STRING && reason.length > ZERO_COUNT),
    );
  }

  uniqueReasons(reasons) {
    return [...new Set(reasons)];
  }

  sameReasons(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    for (let index = ZERO_COUNT; index < a.length; index += ONE_COUNT) {
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
        (this._blockedDurationMs.get(reason) || ZERO_COUNT) + elapsed,
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
    this._transitionCount += ONE_COUNT;
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
      state: this.resolveLegacyState(transition.phase),
      ready: transition.ready,
      reasons: [...transition.reasons],
      degradedReasons: [...transition.degradedReasons],
      timestamp: transition.timestamp,
    });
  }
}

export {LifecycleController};
