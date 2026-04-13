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
import { EventEmitter } from 'node:events';
import { LIFECYCLE_ALLOWED_TRANSITIONS, LIFECYCLE_DEFAULT, LIFECYCLE_DEPENDENCY, LIFECYCLE_DEPENDENCY_CLASS, LIFECYCLE_DEPENDENCY_DEMOTION_POLICY, LIFECYCLE_EVENT, LIFECYCLE_LEGACY_STATE, LIFECYCLE_PHASE, LIFECYCLE_PROBE_STATUS_CLASS, LIFECYCLE_REASON } from './lifecycle-controller-constants.js';
const HARD_CLASS = LIFECYCLE_DEPENDENCY_CLASS.HARD;
const SOFT_CLASS = LIFECYCLE_DEPENDENCY_CLASS.SOFT;
const THRESHOLD_DEMOTION_POLICY = LIFECYCLE_DEPENDENCY_DEMOTION_POLICY.THRESHOLD;
const IMMEDIATE_DEMOTION_POLICY = LIFECYCLE_DEPENDENCY_DEMOTION_POLICY.IMMEDIATE;
const EMPTY_REASONS = Object.freeze(stryMutAct_9fa48("15378") ? ["Stryker was here"] : (stryCov_9fa48("15378"), []));
const TYPE_FUNCTION = stryMutAct_9fa48("15379") ? "" : (stryCov_9fa48("15379"), 'function');
const TYPE_STRING = stryMutAct_9fa48("15380") ? "" : (stryCov_9fa48("15380"), 'string');
const TYPE_OBJECT = stryMutAct_9fa48("15381") ? "" : (stryCov_9fa48("15381"), 'object');
const TYPE_BOOLEAN = stryMutAct_9fa48("15382") ? "" : (stryCov_9fa48("15382"), 'boolean');
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
const LIFECYCLE_DEPENDENCY_NAME_REQUIRED_ERROR = stryMutAct_9fa48("15383") ? "" : (stryCov_9fa48("15383"), 'Lifecycle dependency name is required');
const UNKNOWN_LIFECYCLE_PHASE_ERROR_PREFIX = stryMutAct_9fa48("15384") ? "" : (stryCov_9fa48("15384"), 'Unknown lifecycle phase: ');
const INVALID_LIFECYCLE_PHASE_TRANSITION_ERROR_PREFIX = stryMutAct_9fa48("15385") ? "" : (stryCov_9fa48("15385"), 'Invalid lifecycle phase transition: ');
const INVALID_LIFECYCLE_PHASE_TRANSITION_SEPARATOR = stryMutAct_9fa48("15386") ? "" : (stryCov_9fa48("15386"), ' -> ');
const UNKNOWN_EVALUATION_STATE_ERROR_PREFIX = stryMutAct_9fa48("15387") ? "" : (stryCov_9fa48("15387"), 'Unknown lifecycle evaluation state: ');
const PROBE_STATUS_SUCCESS_MIN = 200;
const PROBE_STATUS_SUCCESS_MAX = 300;
const PROBE_STATUS_CLIENT_ERROR_MIN = 400;
const PROBE_STATUS_CLIENT_ERROR_MAX = 500;
const PROBE_STATUS_SERVER_ERROR_MIN = 500;
const PROBE_STATUS_SERVER_ERROR_MAX = 600;
const LIFECYCLE_EVALUATION_STATE = Object.freeze(stryMutAct_9fa48("15388") ? {} : (stryCov_9fa48("15388"), {
  DRAINING: stryMutAct_9fa48("15389") ? "" : (stryCov_9fa48("15389"), 'draining'),
  STARTUP_PENDING: stryMutAct_9fa48("15390") ? "" : (stryCov_9fa48("15390"), 'startup_pending'),
  HARD_CONTROL_BLOCKED: stryMutAct_9fa48("15391") ? "" : (stryCov_9fa48("15391"), 'hard_control_blocked'),
  HARD_DEGRADED_IMMEDIATE: stryMutAct_9fa48("15392") ? "" : (stryCov_9fa48("15392"), 'hard_degraded_immediate'),
  HARD_DEGRADED_THRESHOLD: stryMutAct_9fa48("15393") ? "" : (stryCov_9fa48("15393"), 'hard_degraded_threshold'),
  HARD_TRAFFIC_GRACE: stryMutAct_9fa48("15394") ? "" : (stryCov_9fa48("15394"), 'hard_traffic_grace'),
  STABLE_WINDOW_PENDING: stryMutAct_9fa48("15395") ? "" : (stryCov_9fa48("15395"), 'stable_window_pending'),
  TRAFFIC_READY: stryMutAct_9fa48("15396") ? "" : (stryCov_9fa48("15396"), 'traffic_ready')
}));
const LIFECYCLE_PHASE_RANK = Object.freeze(stryMutAct_9fa48("15397") ? {} : (stryCov_9fa48("15397"), {
  [LIFECYCLE_PHASE.INIT]: PHASE_RANK_INIT,
  [LIFECYCLE_PHASE.CONTROL_READY]: PHASE_RANK_CONTROL_READY,
  [LIFECYCLE_PHASE.JOIN_READY]: PHASE_RANK_JOIN_READY,
  [LIFECYCLE_PHASE.TRAFFIC_READY]: PHASE_RANK_TRAFFIC_READY,
  [LIFECYCLE_PHASE.DEGRADED]: PHASE_RANK_CONTROL_READY
}));
function resolveLifecyclePhaseRank(phase) {
  if (stryMutAct_9fa48("15398")) {
    {}
  } else {
    stryCov_9fa48("15398");
    return stryMutAct_9fa48("15401") ? LIFECYCLE_PHASE_RANK[phase] && PHASE_RANK_INIT : stryMutAct_9fa48("15400") ? false : stryMutAct_9fa48("15399") ? true : (stryCov_9fa48("15399", "15400", "15401"), LIFECYCLE_PHASE_RANK[phase] || PHASE_RANK_INIT);
  }
}

/**
 * LifecycleController is the single owner for startup/join/traffic lifecycle.
 */
class LifecycleController extends EventEmitter {
  constructor(options = {}) {
    if (stryMutAct_9fa48("15402")) {
      {}
    } else {
      stryCov_9fa48("15402");
      super();
      this._now = (stryMutAct_9fa48("15405") ? typeof options.now !== TYPE_FUNCTION : stryMutAct_9fa48("15404") ? false : stryMutAct_9fa48("15403") ? true : (stryCov_9fa48("15403", "15404", "15405"), typeof options.now === TYPE_FUNCTION)) ? options.now : stryMutAct_9fa48("15406") ? () => undefined : (stryCov_9fa48("15406"), () => Date.now());
      this._stableWindowMs = Number.isFinite(options.readyStableWindowMs) ? stryMutAct_9fa48("15407") ? Math.min(MIN_STABLE_WINDOW_MS, Math.floor(options.readyStableWindowMs)) : (stryCov_9fa48("15407"), Math.max(MIN_STABLE_WINDOW_MS, Math.floor(options.readyStableWindowMs))) : LIFECYCLE_DEFAULT.STABLE_WINDOW_MS;
      this._demotionFailureThreshold = Number.isFinite(options.demotionFailureThreshold) ? stryMutAct_9fa48("15408") ? Math.min(MIN_DEMOTION_FAILURE_THRESHOLD, Math.floor(options.demotionFailureThreshold)) : (stryCov_9fa48("15408"), Math.max(MIN_DEMOTION_FAILURE_THRESHOLD, Math.floor(options.demotionFailureThreshold))) : LIFECYCLE_DEFAULT.DEMOTION_FAILURE_THRESHOLD;
      this._defaultRetryAfterMs = Number.isFinite(options.retryAfterMs) ? stryMutAct_9fa48("15409") ? Math.min(MIN_RETRY_AFTER_MS, Math.floor(options.retryAfterMs)) : (stryCov_9fa48("15409"), Math.max(MIN_RETRY_AFTER_MS, Math.floor(options.retryAfterMs))) : LIFECYCLE_DEFAULT.RETRY_AFTER_MS;
      this._phase = LIFECYCLE_PHASE.INIT;
      this._ready = stryMutAct_9fa48("15410") ? true : (stryCov_9fa48("15410"), false);
      this._reasons = stryMutAct_9fa48("15411") ? ["Stryker was here"] : (stryCov_9fa48("15411"), []);
      this._degradedReasons = stryMutAct_9fa48("15412") ? ["Stryker was here"] : (stryCov_9fa48("15412"), []);
      this._consecutiveFailureCount = ZERO_COUNT;
      this._stableWindowStartedAt = null;
      this._dependencies = new Map();
      this._transitionCount = ZERO_COUNT;
      this._transitionHistory = stryMutAct_9fa48("15413") ? ["Stryker was here"] : (stryCov_9fa48("15413"), []);
      this._probeStatusCounts = new Map();
      this._blockedReasonSince = new Map();
      this._blockedDurationMs = new Map();
      this._draining = stryMutAct_9fa48("15414") ? true : (stryCov_9fa48("15414"), false);
      this._drainDeadlineMs = null;
      this._lastEvaluatedAt = null;
    }
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
    if (stryMutAct_9fa48("15415")) {
      {}
    } else {
      stryCov_9fa48("15415");
      if (stryMutAct_9fa48("15418") ? typeof name !== TYPE_STRING && name.length === PHASE_RANK_INIT : stryMutAct_9fa48("15417") ? false : stryMutAct_9fa48("15416") ? true : (stryCov_9fa48("15416", "15417", "15418"), (stryMutAct_9fa48("15420") ? typeof name === TYPE_STRING : stryMutAct_9fa48("15419") ? false : (stryCov_9fa48("15419", "15420"), typeof name !== TYPE_STRING)) || (stryMutAct_9fa48("15422") ? name.length !== PHASE_RANK_INIT : stryMutAct_9fa48("15421") ? false : (stryCov_9fa48("15421", "15422"), name.length === PHASE_RANK_INIT)))) {
        if (stryMutAct_9fa48("15423")) {
          {}
        } else {
          stryCov_9fa48("15423");
          throw new Error(LIFECYCLE_DEPENDENCY_NAME_REQUIRED_ERROR);
        }
      }
      const classification = (stryMutAct_9fa48("15426") ? options.classification !== SOFT_CLASS : stryMutAct_9fa48("15425") ? false : stryMutAct_9fa48("15424") ? true : (stryCov_9fa48("15424", "15425", "15426"), options.classification === SOFT_CLASS)) ? SOFT_CLASS : HARD_CLASS;
      const reasonCode = (stryMutAct_9fa48("15429") ? typeof options.reasonCode === TYPE_STRING || options.reasonCode.length > PHASE_RANK_INIT : stryMutAct_9fa48("15428") ? false : stryMutAct_9fa48("15427") ? true : (stryCov_9fa48("15427", "15428", "15429"), (stryMutAct_9fa48("15431") ? typeof options.reasonCode !== TYPE_STRING : stryMutAct_9fa48("15430") ? true : (stryCov_9fa48("15430", "15431"), typeof options.reasonCode === TYPE_STRING)) && (stryMutAct_9fa48("15434") ? options.reasonCode.length <= PHASE_RANK_INIT : stryMutAct_9fa48("15433") ? options.reasonCode.length >= PHASE_RANK_INIT : stryMutAct_9fa48("15432") ? true : (stryCov_9fa48("15432", "15433", "15434"), options.reasonCode.length > PHASE_RANK_INIT)))) ? options.reasonCode : null;
      const demotionPolicy = (stryMutAct_9fa48("15437") ? options.demotionPolicy !== IMMEDIATE_DEMOTION_POLICY : stryMutAct_9fa48("15436") ? false : stryMutAct_9fa48("15435") ? true : (stryCov_9fa48("15435", "15436", "15437"), options.demotionPolicy === IMMEDIATE_DEMOTION_POLICY)) ? IMMEDIATE_DEMOTION_POLICY : THRESHOLD_DEMOTION_POLICY;
      this._dependencies.set(name, stryMutAct_9fa48("15438") ? {} : (stryCov_9fa48("15438"), {
        ready: stryMutAct_9fa48("15441") ? ready !== true : stryMutAct_9fa48("15440") ? false : stryMutAct_9fa48("15439") ? true : (stryCov_9fa48("15439", "15440", "15441"), ready === (stryMutAct_9fa48("15442") ? false : (stryCov_9fa48("15442"), true))),
        classification,
        reasonCode,
        demotionPolicy,
        details: (stryMutAct_9fa48("15445") ? options.details || typeof options.details === TYPE_OBJECT : stryMutAct_9fa48("15444") ? false : stryMutAct_9fa48("15443") ? true : (stryCov_9fa48("15443", "15444", "15445"), options.details && (stryMutAct_9fa48("15447") ? typeof options.details !== TYPE_OBJECT : stryMutAct_9fa48("15446") ? true : (stryCov_9fa48("15446", "15447"), typeof options.details === TYPE_OBJECT)))) ? options.details : null
      }));
    }
  }

  /**
   * Evaluate dependency status and project lifecycle phase/readiness snapshot.
   * @return {Object}
   */
  evaluate() {
    if (stryMutAct_9fa48("15448")) {
      {}
    } else {
      stryCov_9fa48("15448");
      const now = this._now();
      const previousPhase = this._phase;
      const previousLegacyState = this.resolveLegacyState(previousPhase, stryMutAct_9fa48("15449") ? {} : (stryCov_9fa48("15449"), {
        beforeFirstEvaluation: stryMutAct_9fa48("15452") ? this._lastEvaluatedAt !== null : stryMutAct_9fa48("15451") ? false : stryMutAct_9fa48("15450") ? true : (stryCov_9fa48("15450", "15451", "15452"), this._lastEvaluatedAt === null)
      }));
      const previousReady = this._ready;
      const previousReasons = this._reasons;
      const dependencyStatus = this.collectDependencyStatus();
      const evaluationContext = this.collectEvaluationContext(stryMutAct_9fa48("15453") ? {} : (stryCov_9fa48("15453"), {
        now,
        dependencyStatus
      }));
      const outcome = this.resolveEvaluationOutcome(evaluationContext);
      this._stableWindowStartedAt = outcome.stableWindowStartedAt;
      this._consecutiveFailureCount = outcome.consecutiveFailureCount;
      this._phase = outcome.phase;
      this._ready = outcome.ready;
      this._reasons = stryMutAct_9fa48("15454") ? [] : (stryCov_9fa48("15454"), [...outcome.reasons]);
      this._degradedReasons = evaluationContext.degradedReasons;
      this._lastEvaluatedAt = now;
      this.updateBlockedReasonDurations(now, previousReasons);
      if (stryMutAct_9fa48("15457") ? (previousPhase !== this._phase || previousReady !== this._ready) && !this.sameReasons(previousReasons, this._reasons) : stryMutAct_9fa48("15456") ? false : stryMutAct_9fa48("15455") ? true : (stryCov_9fa48("15455", "15456", "15457"), (stryMutAct_9fa48("15459") ? previousPhase !== this._phase && previousReady !== this._ready : stryMutAct_9fa48("15458") ? false : (stryCov_9fa48("15458", "15459"), (stryMutAct_9fa48("15461") ? previousPhase === this._phase : stryMutAct_9fa48("15460") ? false : (stryCov_9fa48("15460", "15461"), previousPhase !== this._phase)) || (stryMutAct_9fa48("15463") ? previousReady === this._ready : stryMutAct_9fa48("15462") ? false : (stryCov_9fa48("15462", "15463"), previousReady !== this._ready)))) || (stryMutAct_9fa48("15464") ? this.sameReasons(previousReasons, this._reasons) : (stryCov_9fa48("15464"), !this.sameReasons(previousReasons, this._reasons))))) {
        if (stryMutAct_9fa48("15465")) {
          {}
        } else {
          stryCov_9fa48("15465");
          this.recordTransition(stryMutAct_9fa48("15466") ? {} : (stryCov_9fa48("15466"), {
            previousPhase,
            previousLegacyState,
            previousReady,
            phase: this._phase,
            ready: this._ready,
            reasons: this._reasons,
            degradedReasons: this._degradedReasons,
            timestamp: now
          }));
        }
      }
      return this.getSnapshot();
    }
  }
  collectEvaluationContext(context = {}) {
    if (stryMutAct_9fa48("15467")) {
      {}
    } else {
      stryCov_9fa48("15467");
      const dependencyStatus = (stryMutAct_9fa48("15470") ? context.dependencyStatus || typeof context.dependencyStatus === TYPE_OBJECT : stryMutAct_9fa48("15469") ? false : stryMutAct_9fa48("15468") ? true : (stryCov_9fa48("15468", "15469", "15470"), context.dependencyStatus && (stryMutAct_9fa48("15472") ? typeof context.dependencyStatus !== TYPE_OBJECT : stryMutAct_9fa48("15471") ? true : (stryCov_9fa48("15471", "15472"), typeof context.dependencyStatus === TYPE_OBJECT)))) ? context.dependencyStatus : {};
      const hardReasons = Array.isArray(dependencyStatus.hardReasons) ? dependencyStatus.hardReasons : EMPTY_REASONS;
      const immediateHardReasons = Array.isArray(dependencyStatus.immediateHardReasons) ? dependencyStatus.immediateHardReasons : EMPTY_REASONS;
      const degradedReasons = Array.isArray(dependencyStatus.softReasons) ? dependencyStatus.softReasons : EMPTY_REASONS;
      const stableWindowStartedAt = (stryMutAct_9fa48("15475") ? this._stableWindowStartedAt !== null : stryMutAct_9fa48("15474") ? false : stryMutAct_9fa48("15473") ? true : (stryCov_9fa48("15473", "15474", "15475"), this._stableWindowStartedAt === null)) ? context.now : this._stableWindowStartedAt;
      return stryMutAct_9fa48("15476") ? {} : (stryCov_9fa48("15476"), {
        now: context.now,
        startupComplete: stryMutAct_9fa48("15479") ? dependencyStatus.startupComplete !== true : stryMutAct_9fa48("15478") ? false : stryMutAct_9fa48("15477") ? true : (stryCov_9fa48("15477", "15478", "15479"), dependencyStatus.startupComplete === (stryMutAct_9fa48("15480") ? false : (stryCov_9fa48("15480"), true))),
        hardReasons,
        immediateHardReasons,
        degradedReasons,
        stableWindowStartedAt,
        stableElapsedMs: stryMutAct_9fa48("15481") ? context.now + stableWindowStartedAt : (stryCov_9fa48("15481"), context.now - stableWindowStartedAt),
        currentFailureCount: this._consecutiveFailureCount,
        currentlyReady: stryMutAct_9fa48("15484") ? this._ready !== true : stryMutAct_9fa48("15483") ? false : stryMutAct_9fa48("15482") ? true : (stryCov_9fa48("15482", "15483", "15484"), this._ready === (stryMutAct_9fa48("15485") ? false : (stryCov_9fa48("15485"), true))),
        draining: stryMutAct_9fa48("15488") ? this._draining !== true : stryMutAct_9fa48("15487") ? false : stryMutAct_9fa48("15486") ? true : (stryCov_9fa48("15486", "15487", "15488"), this._draining === (stryMutAct_9fa48("15489") ? false : (stryCov_9fa48("15489"), true)))
      });
    }
  }
  resolveEvaluationOutcome(context = {}) {
    if (stryMutAct_9fa48("15490")) {
      {}
    } else {
      stryCov_9fa48("15490");
      const evaluationDecision = this.resolveEvaluationDecision(context);
      switch (evaluationDecision.state) {
        case LIFECYCLE_EVALUATION_STATE.DRAINING:
          if (stryMutAct_9fa48("15491")) {} else {
            stryCov_9fa48("15491");
            return this.buildEvaluationOutcome(stryMutAct_9fa48("15492") ? {} : (stryCov_9fa48("15492"), {
              stableWindowStartedAt: null,
              ready: stryMutAct_9fa48("15493") ? true : (stryCov_9fa48("15493"), false),
              phase: LIFECYCLE_PHASE.DEGRADED,
              consecutiveFailureCount: NO_FAILURE_COUNT,
              reasons: this.uniqueReasons(stryMutAct_9fa48("15494") ? [] : (stryCov_9fa48("15494"), [LIFECYCLE_REASON.NODE_DRAINING, ...context.hardReasons]))
            }));
          }
        case LIFECYCLE_EVALUATION_STATE.STARTUP_PENDING:
          if (stryMutAct_9fa48("15495")) {} else {
            stryCov_9fa48("15495");
            return this.buildEvaluationOutcome(stryMutAct_9fa48("15496") ? {} : (stryCov_9fa48("15496"), {
              stableWindowStartedAt: null,
              consecutiveFailureCount: NO_FAILURE_COUNT,
              ready: stryMutAct_9fa48("15497") ? true : (stryCov_9fa48("15497"), false),
              phase: LIFECYCLE_PHASE.INIT,
              reasons: context.hardReasons
            }));
          }
        case LIFECYCLE_EVALUATION_STATE.HARD_CONTROL_BLOCKED:
          if (stryMutAct_9fa48("15498")) {} else {
            stryCov_9fa48("15498");
            return this.buildEvaluationOutcome(stryMutAct_9fa48("15499") ? {} : (stryCov_9fa48("15499"), {
              stableWindowStartedAt: null,
              consecutiveFailureCount: NO_FAILURE_COUNT,
              ready: stryMutAct_9fa48("15500") ? true : (stryCov_9fa48("15500"), false),
              phase: LIFECYCLE_PHASE.CONTROL_READY,
              reasons: context.hardReasons
            }));
          }
        case LIFECYCLE_EVALUATION_STATE.HARD_DEGRADED_IMMEDIATE:
          if (stryMutAct_9fa48("15501")) {} else {
            stryCov_9fa48("15501");
            return this.buildEvaluationOutcome(stryMutAct_9fa48("15502") ? {} : (stryCov_9fa48("15502"), {
              stableWindowStartedAt: null,
              consecutiveFailureCount: NO_FAILURE_COUNT,
              ready: stryMutAct_9fa48("15503") ? true : (stryCov_9fa48("15503"), false),
              phase: LIFECYCLE_PHASE.DEGRADED,
              reasons: context.hardReasons
            }));
          }
        case LIFECYCLE_EVALUATION_STATE.HARD_DEGRADED_THRESHOLD:
          if (stryMutAct_9fa48("15504")) {} else {
            stryCov_9fa48("15504");
            return this.buildEvaluationOutcome(stryMutAct_9fa48("15505") ? {} : (stryCov_9fa48("15505"), {
              stableWindowStartedAt: null,
              consecutiveFailureCount: evaluationDecision.consecutiveFailureCount,
              ready: stryMutAct_9fa48("15506") ? true : (stryCov_9fa48("15506"), false),
              phase: LIFECYCLE_PHASE.DEGRADED,
              reasons: context.hardReasons
            }));
          }
        case LIFECYCLE_EVALUATION_STATE.HARD_TRAFFIC_GRACE:
          if (stryMutAct_9fa48("15507")) {} else {
            stryCov_9fa48("15507");
            return this.buildEvaluationOutcome(stryMutAct_9fa48("15508") ? {} : (stryCov_9fa48("15508"), {
              stableWindowStartedAt: null,
              consecutiveFailureCount: evaluationDecision.consecutiveFailureCount,
              ready: stryMutAct_9fa48("15509") ? false : (stryCov_9fa48("15509"), true),
              phase: LIFECYCLE_PHASE.TRAFFIC_READY,
              reasons: EMPTY_REASONS
            }));
          }
        case LIFECYCLE_EVALUATION_STATE.STABLE_WINDOW_PENDING:
          if (stryMutAct_9fa48("15510")) {} else {
            stryCov_9fa48("15510");
            return this.buildEvaluationOutcome(stryMutAct_9fa48("15511") ? {} : (stryCov_9fa48("15511"), {
              stableWindowStartedAt: context.stableWindowStartedAt,
              consecutiveFailureCount: NO_FAILURE_COUNT,
              ready: stryMutAct_9fa48("15512") ? true : (stryCov_9fa48("15512"), false),
              phase: LIFECYCLE_PHASE.JOIN_READY,
              reasons: stryMutAct_9fa48("15513") ? [] : (stryCov_9fa48("15513"), [LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING])
            }));
          }
        case LIFECYCLE_EVALUATION_STATE.TRAFFIC_READY:
          if (stryMutAct_9fa48("15514")) {} else {
            stryCov_9fa48("15514");
            return this.buildEvaluationOutcome(stryMutAct_9fa48("15515") ? {} : (stryCov_9fa48("15515"), {
              stableWindowStartedAt: context.stableWindowStartedAt,
              consecutiveFailureCount: NO_FAILURE_COUNT,
              ready: stryMutAct_9fa48("15516") ? false : (stryCov_9fa48("15516"), true),
              phase: LIFECYCLE_PHASE.TRAFFIC_READY,
              reasons: EMPTY_REASONS
            }));
          }
        default:
          if (stryMutAct_9fa48("15517")) {} else {
            stryCov_9fa48("15517");
            throw new Error(stryMutAct_9fa48("15518") ? UNKNOWN_EVALUATION_STATE_ERROR_PREFIX - String(evaluationDecision.state) : (stryCov_9fa48("15518"), UNKNOWN_EVALUATION_STATE_ERROR_PREFIX + String(evaluationDecision.state)));
          }
      }
    }
  }
  resolveEvaluationDecision(context = {}) {
    if (stryMutAct_9fa48("15519")) {
      {}
    } else {
      stryCov_9fa48("15519");
      if (stryMutAct_9fa48("15522") ? context.draining !== true : stryMutAct_9fa48("15521") ? false : stryMutAct_9fa48("15520") ? true : (stryCov_9fa48("15520", "15521", "15522"), context.draining === (stryMutAct_9fa48("15523") ? false : (stryCov_9fa48("15523"), true)))) {
        if (stryMutAct_9fa48("15524")) {
          {}
        } else {
          stryCov_9fa48("15524");
          return stryMutAct_9fa48("15525") ? {} : (stryCov_9fa48("15525"), {
            state: LIFECYCLE_EVALUATION_STATE.DRAINING
          });
        }
      } else if (stryMutAct_9fa48("15528") ? context.startupComplete === true : stryMutAct_9fa48("15527") ? false : stryMutAct_9fa48("15526") ? true : (stryCov_9fa48("15526", "15527", "15528"), context.startupComplete !== (stryMutAct_9fa48("15529") ? false : (stryCov_9fa48("15529"), true)))) {
        if (stryMutAct_9fa48("15530")) {
          {}
        } else {
          stryCov_9fa48("15530");
          return stryMutAct_9fa48("15531") ? {} : (stryCov_9fa48("15531"), {
            state: LIFECYCLE_EVALUATION_STATE.STARTUP_PENDING
          });
        }
      } else if (stryMutAct_9fa48("15535") ? context.hardReasons.length <= NO_FAILURE_COUNT : stryMutAct_9fa48("15534") ? context.hardReasons.length >= NO_FAILURE_COUNT : stryMutAct_9fa48("15533") ? false : stryMutAct_9fa48("15532") ? true : (stryCov_9fa48("15532", "15533", "15534", "15535"), context.hardReasons.length > NO_FAILURE_COUNT)) {
        if (stryMutAct_9fa48("15536")) {
          {}
        } else {
          stryCov_9fa48("15536");
          return this.resolveHardFailureEvaluationDecision(context);
        }
      } else if (stryMutAct_9fa48("15540") ? context.stableElapsedMs >= this._stableWindowMs : stryMutAct_9fa48("15539") ? context.stableElapsedMs <= this._stableWindowMs : stryMutAct_9fa48("15538") ? false : stryMutAct_9fa48("15537") ? true : (stryCov_9fa48("15537", "15538", "15539", "15540"), context.stableElapsedMs < this._stableWindowMs)) {
        if (stryMutAct_9fa48("15541")) {
          {}
        } else {
          stryCov_9fa48("15541");
          return stryMutAct_9fa48("15542") ? {} : (stryCov_9fa48("15542"), {
            state: LIFECYCLE_EVALUATION_STATE.STABLE_WINDOW_PENDING
          });
        }
      } else {
        if (stryMutAct_9fa48("15543")) {
          {}
        } else {
          stryCov_9fa48("15543");
          return stryMutAct_9fa48("15544") ? {} : (stryCov_9fa48("15544"), {
            state: LIFECYCLE_EVALUATION_STATE.TRAFFIC_READY
          });
        }
      }
    }
  }
  resolveHardFailureEvaluationDecision(context = {}) {
    if (stryMutAct_9fa48("15545")) {
      {}
    } else {
      stryCov_9fa48("15545");
      if (stryMutAct_9fa48("15549") ? context.immediateHardReasons.length <= NO_FAILURE_COUNT : stryMutAct_9fa48("15548") ? context.immediateHardReasons.length >= NO_FAILURE_COUNT : stryMutAct_9fa48("15547") ? false : stryMutAct_9fa48("15546") ? true : (stryCov_9fa48("15546", "15547", "15548", "15549"), context.immediateHardReasons.length > NO_FAILURE_COUNT)) {
        if (stryMutAct_9fa48("15550")) {
          {}
        } else {
          stryCov_9fa48("15550");
          return stryMutAct_9fa48("15551") ? {} : (stryCov_9fa48("15551"), {
            state: LIFECYCLE_EVALUATION_STATE.HARD_DEGRADED_IMMEDIATE
          });
        }
      } else if (stryMutAct_9fa48("15554") ? context.currentlyReady === true : stryMutAct_9fa48("15553") ? false : stryMutAct_9fa48("15552") ? true : (stryCov_9fa48("15552", "15553", "15554"), context.currentlyReady !== (stryMutAct_9fa48("15555") ? false : (stryCov_9fa48("15555"), true)))) {
        if (stryMutAct_9fa48("15556")) {
          {}
        } else {
          stryCov_9fa48("15556");
          return stryMutAct_9fa48("15557") ? {} : (stryCov_9fa48("15557"), {
            state: LIFECYCLE_EVALUATION_STATE.HARD_CONTROL_BLOCKED
          });
        }
      } else {
        if (stryMutAct_9fa48("15558")) {
          {}
        } else {
          stryCov_9fa48("15558");
          const consecutiveFailureCount = stryMutAct_9fa48("15559") ? context.currentFailureCount - FAILURE_COUNT_STEP : (stryCov_9fa48("15559"), context.currentFailureCount + FAILURE_COUNT_STEP);
          return stryMutAct_9fa48("15560") ? {} : (stryCov_9fa48("15560"), {
            state: (stryMutAct_9fa48("15564") ? consecutiveFailureCount < this._demotionFailureThreshold : stryMutAct_9fa48("15563") ? consecutiveFailureCount > this._demotionFailureThreshold : stryMutAct_9fa48("15562") ? false : stryMutAct_9fa48("15561") ? true : (stryCov_9fa48("15561", "15562", "15563", "15564"), consecutiveFailureCount >= this._demotionFailureThreshold)) ? LIFECYCLE_EVALUATION_STATE.HARD_DEGRADED_THRESHOLD : LIFECYCLE_EVALUATION_STATE.HARD_TRAFFIC_GRACE,
            consecutiveFailureCount
          });
        }
      }
    }
  }
  buildEvaluationOutcome(options = {}) {
    if (stryMutAct_9fa48("15565")) {
      {}
    } else {
      stryCov_9fa48("15565");
      return stryMutAct_9fa48("15566") ? {} : (stryCov_9fa48("15566"), {
        stableWindowStartedAt: options.stableWindowStartedAt,
        consecutiveFailureCount: options.consecutiveFailureCount,
        ready: stryMutAct_9fa48("15569") ? options.ready !== true : stryMutAct_9fa48("15568") ? false : stryMutAct_9fa48("15567") ? true : (stryCov_9fa48("15567", "15568", "15569"), options.ready === (stryMutAct_9fa48("15570") ? false : (stryCov_9fa48("15570"), true))),
        phase: options.phase,
        reasons: Array.isArray(options.reasons) ? options.reasons : EMPTY_REASONS
      });
    }
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
    if (stryMutAct_9fa48("15571")) {
      {}
    } else {
      stryCov_9fa48("15571");
      if (stryMutAct_9fa48("15574") ? !Object.prototype.hasOwnProperty.call(LIFECYCLE_ALLOWED_TRANSITIONS, phase) || phase !== this._phase : stryMutAct_9fa48("15573") ? false : stryMutAct_9fa48("15572") ? true : (stryCov_9fa48("15572", "15573", "15574"), (stryMutAct_9fa48("15575") ? Object.prototype.hasOwnProperty.call(LIFECYCLE_ALLOWED_TRANSITIONS, phase) : (stryCov_9fa48("15575"), !Object.prototype.hasOwnProperty.call(LIFECYCLE_ALLOWED_TRANSITIONS, phase))) && (stryMutAct_9fa48("15577") ? phase === this._phase : stryMutAct_9fa48("15576") ? true : (stryCov_9fa48("15576", "15577"), phase !== this._phase)))) {
        if (stryMutAct_9fa48("15578")) {
          {}
        } else {
          stryCov_9fa48("15578");
          throw new Error(stryMutAct_9fa48("15579") ? UNKNOWN_LIFECYCLE_PHASE_ERROR_PREFIX - String(phase) : (stryCov_9fa48("15579"), UNKNOWN_LIFECYCLE_PHASE_ERROR_PREFIX + String(phase)));
        }
      }
      if (stryMutAct_9fa48("15582") ? phase !== this._phase || !this.isTransitionAllowed(this._phase, phase) : stryMutAct_9fa48("15581") ? false : stryMutAct_9fa48("15580") ? true : (stryCov_9fa48("15580", "15581", "15582"), (stryMutAct_9fa48("15584") ? phase === this._phase : stryMutAct_9fa48("15583") ? true : (stryCov_9fa48("15583", "15584"), phase !== this._phase)) && (stryMutAct_9fa48("15585") ? this.isTransitionAllowed(this._phase, phase) : (stryCov_9fa48("15585"), !this.isTransitionAllowed(this._phase, phase))))) {
        if (stryMutAct_9fa48("15586")) {
          {}
        } else {
          stryCov_9fa48("15586");
          throw new Error(stryMutAct_9fa48("15587") ? INVALID_LIFECYCLE_PHASE_TRANSITION_ERROR_PREFIX + this._phase + INVALID_LIFECYCLE_PHASE_TRANSITION_SEPARATOR - phase : (stryCov_9fa48("15587"), (stryMutAct_9fa48("15588") ? INVALID_LIFECYCLE_PHASE_TRANSITION_ERROR_PREFIX + this._phase - INVALID_LIFECYCLE_PHASE_TRANSITION_SEPARATOR : (stryCov_9fa48("15588"), (stryMutAct_9fa48("15589") ? INVALID_LIFECYCLE_PHASE_TRANSITION_ERROR_PREFIX - this._phase : (stryCov_9fa48("15589"), INVALID_LIFECYCLE_PHASE_TRANSITION_ERROR_PREFIX + this._phase)) + INVALID_LIFECYCLE_PHASE_TRANSITION_SEPARATOR)) + phase));
        }
      }
      const now = this._now();
      const previousPhase = this._phase;
      const previousLegacyState = this.resolveLegacyState(previousPhase, stryMutAct_9fa48("15590") ? {} : (stryCov_9fa48("15590"), {
        beforeFirstEvaluation: stryMutAct_9fa48("15593") ? this._lastEvaluatedAt !== null : stryMutAct_9fa48("15592") ? false : stryMutAct_9fa48("15591") ? true : (stryCov_9fa48("15591", "15592", "15593"), this._lastEvaluatedAt === null)
      }));
      const previousReady = this._ready;
      const previousReasons = this._reasons;
      const reasons = this.normalizeReasons(options.reasons);
      const degradedReasons = this.normalizeReasons(options.degradedReasons);
      this._phase = phase;
      this._ready = (stryMutAct_9fa48("15596") ? typeof options.ready !== TYPE_BOOLEAN : stryMutAct_9fa48("15595") ? false : stryMutAct_9fa48("15594") ? true : (stryCov_9fa48("15594", "15595", "15596"), typeof options.ready === TYPE_BOOLEAN)) ? options.ready : stryMutAct_9fa48("15599") ? phase !== LIFECYCLE_PHASE.TRAFFIC_READY : stryMutAct_9fa48("15598") ? false : stryMutAct_9fa48("15597") ? true : (stryCov_9fa48("15597", "15598", "15599"), phase === LIFECYCLE_PHASE.TRAFFIC_READY);
      this._reasons = reasons;
      this._degradedReasons = degradedReasons;
      this._lastEvaluatedAt = now;
      this.updateBlockedReasonDurations(now, previousReasons);
      this.recordTransition(stryMutAct_9fa48("15600") ? {} : (stryCov_9fa48("15600"), {
        previousPhase,
        previousLegacyState,
        previousReady,
        phase: this._phase,
        ready: this._ready,
        reasons: this._reasons,
        degradedReasons: this._degradedReasons,
        timestamp: now
      }));
      return this.getSnapshot();
    }
  }

  /**
   * Enter draining mode and force non-ready lifecycle projection.
   * @param {Object} [options]
   * @param {string} [options.reasonCode]
   * @param {number} [options.drainDeadlineMs]
   * @return {Object}
   */
  beginDrain(options = {}) {
    if (stryMutAct_9fa48("15601")) {
      {}
    } else {
      stryCov_9fa48("15601");
      const reasonCode = (stryMutAct_9fa48("15604") ? typeof options.reasonCode === TYPE_STRING || options.reasonCode.length > PHASE_RANK_INIT : stryMutAct_9fa48("15603") ? false : stryMutAct_9fa48("15602") ? true : (stryCov_9fa48("15602", "15603", "15604"), (stryMutAct_9fa48("15606") ? typeof options.reasonCode !== TYPE_STRING : stryMutAct_9fa48("15605") ? true : (stryCov_9fa48("15605", "15606"), typeof options.reasonCode === TYPE_STRING)) && (stryMutAct_9fa48("15609") ? options.reasonCode.length <= PHASE_RANK_INIT : stryMutAct_9fa48("15608") ? options.reasonCode.length >= PHASE_RANK_INIT : stryMutAct_9fa48("15607") ? true : (stryCov_9fa48("15607", "15608", "15609"), options.reasonCode.length > PHASE_RANK_INIT)))) ? options.reasonCode : LIFECYCLE_REASON.NODE_DRAINING;
      this._draining = stryMutAct_9fa48("15610") ? false : (stryCov_9fa48("15610"), true);
      this._drainDeadlineMs = Number.isFinite(options.drainDeadlineMs) ? Math.floor(options.drainDeadlineMs) : null;
      this.transitionTo(LIFECYCLE_PHASE.DEGRADED, stryMutAct_9fa48("15611") ? {} : (stryCov_9fa48("15611"), {
        ready: stryMutAct_9fa48("15612") ? true : (stryCov_9fa48("15612"), false),
        reasons: stryMutAct_9fa48("15613") ? [] : (stryCov_9fa48("15613"), [reasonCode])
      }));
      return this.getSnapshot();
    }
  }

  /**
   * Track one probe response status class.
   * @param {string} endpoint
   * @param {number} statusCode
   */
  recordProbeResult(endpoint, statusCode) {
    if (stryMutAct_9fa48("15614")) {
      {}
    } else {
      stryCov_9fa48("15614");
      if (stryMutAct_9fa48("15617") ? typeof endpoint !== TYPE_STRING && endpoint.length === ZERO_COUNT : stryMutAct_9fa48("15616") ? false : stryMutAct_9fa48("15615") ? true : (stryCov_9fa48("15615", "15616", "15617"), (stryMutAct_9fa48("15619") ? typeof endpoint === TYPE_STRING : stryMutAct_9fa48("15618") ? false : (stryCov_9fa48("15618", "15619"), typeof endpoint !== TYPE_STRING)) || (stryMutAct_9fa48("15621") ? endpoint.length !== ZERO_COUNT : stryMutAct_9fa48("15620") ? false : (stryCov_9fa48("15620", "15621"), endpoint.length === ZERO_COUNT)))) {
        if (stryMutAct_9fa48("15622")) {
          {}
        } else {
          stryCov_9fa48("15622");
          return;
        }
      }
      const statusClass = this.classifyProbeStatusCode(statusCode);
      const key = endpoint + (stryMutAct_9fa48("15623") ? "" : (stryCov_9fa48("15623"), ':')) + statusClass;
      this._probeStatusCounts.set(key, stryMutAct_9fa48("15624") ? (this._probeStatusCounts.get(key) || ZERO_COUNT) - ONE_COUNT : (stryCov_9fa48("15624"), (stryMutAct_9fa48("15627") ? this._probeStatusCounts.get(key) && ZERO_COUNT : stryMutAct_9fa48("15626") ? false : stryMutAct_9fa48("15625") ? true : (stryCov_9fa48("15625", "15626", "15627"), this._probeStatusCounts.get(key) || ZERO_COUNT)) + ONE_COUNT));
    }
  }

  /**
   * Return immutable lifecycle snapshot.
   * @return {Object}
   */
  getSnapshot() {
    if (stryMutAct_9fa48("15628")) {
      {}
    } else {
      stryCov_9fa48("15628");
      const now = this._now();
      const stableSinceMs = (stryMutAct_9fa48("15631") ? this._stableWindowStartedAt !== null : stryMutAct_9fa48("15630") ? false : stryMutAct_9fa48("15629") ? true : (stryCov_9fa48("15629", "15630", "15631"), this._stableWindowStartedAt === null)) ? null : this._stableWindowStartedAt;
      return stryMutAct_9fa48("15632") ? {} : (stryCov_9fa48("15632"), {
        ready: this._ready,
        phase: this._phase,
        phaseRank: resolveLifecyclePhaseRank(this._phase),
        state: this.resolveLegacyState(this._phase),
        reasons: stryMutAct_9fa48("15633") ? [] : (stryCov_9fa48("15633"), [...this._reasons]),
        degradedReasons: stryMutAct_9fa48("15634") ? [] : (stryCov_9fa48("15634"), [...this._degradedReasons]),
        draining: this._draining,
        drainDeadlineMs: this._drainDeadlineMs,
        retryAfterMs: this._ready ? ZERO_COUNT : this._defaultRetryAfterMs,
        transitionCount: this._transitionCount,
        stableWindowMs: this._stableWindowMs,
        stableElapsedMs: (stryMutAct_9fa48("15637") ? this._stableWindowStartedAt !== null : stryMutAct_9fa48("15636") ? false : stryMutAct_9fa48("15635") ? true : (stryCov_9fa48("15635", "15636", "15637"), this._stableWindowStartedAt === null)) ? ZERO_COUNT : stryMutAct_9fa48("15638") ? Math.min(ZERO_COUNT, now - this._stableWindowStartedAt) : (stryCov_9fa48("15638"), Math.max(ZERO_COUNT, stryMutAct_9fa48("15639") ? now + this._stableWindowStartedAt : (stryCov_9fa48("15639"), now - this._stableWindowStartedAt))),
        stableSinceMs,
        consecutiveFailureCount: this._consecutiveFailureCount,
        timestamp: now
      });
    }
  }

  /**
   * Return lifecycle diagnostics and observability counters.
   * @return {Object}
   */
  getMetrics() {
    if (stryMutAct_9fa48("15640")) {
      {}
    } else {
      stryCov_9fa48("15640");
      const blockedDurationMs = {};
      for (const [reason, duration] of this._blockedDurationMs.entries()) {
        if (stryMutAct_9fa48("15641")) {
          {}
        } else {
          stryCov_9fa48("15641");
          blockedDurationMs[reason] = duration;
        }
      }
      for (const [reason, since] of this._blockedReasonSince.entries()) {
        if (stryMutAct_9fa48("15642")) {
          {}
        } else {
          stryCov_9fa48("15642");
          blockedDurationMs[reason] = stryMutAct_9fa48("15643") ? (blockedDurationMs[reason] || ZERO_COUNT) - Math.max(ZERO_COUNT, this._now() - since) : (stryCov_9fa48("15643"), (stryMutAct_9fa48("15646") ? blockedDurationMs[reason] && ZERO_COUNT : stryMutAct_9fa48("15645") ? false : stryMutAct_9fa48("15644") ? true : (stryCov_9fa48("15644", "15645", "15646"), blockedDurationMs[reason] || ZERO_COUNT)) + (stryMutAct_9fa48("15647") ? Math.min(ZERO_COUNT, this._now() - since) : (stryCov_9fa48("15647"), Math.max(ZERO_COUNT, stryMutAct_9fa48("15648") ? this._now() + since : (stryCov_9fa48("15648"), this._now() - since)))));
        }
      }
      const probeStatusCounts = {};
      for (const [key, count] of this._probeStatusCounts.entries()) {
        if (stryMutAct_9fa48("15649")) {
          {}
        } else {
          stryCov_9fa48("15649");
          probeStatusCounts[key] = count;
        }
      }
      return stryMutAct_9fa48("15650") ? {} : (stryCov_9fa48("15650"), {
        phase: this._phase,
        ready: this._ready,
        transitionCount: this._transitionCount,
        blockedDurationMs,
        probeStatusCounts,
        degradedReasons: stryMutAct_9fa48("15651") ? [] : (stryCov_9fa48("15651"), [...this._degradedReasons])
      });
    }
  }

  /**
   * Return transition history (oldest first).
   * @return {Array<Object>}
   */
  getTransitionHistory() {
    if (stryMutAct_9fa48("15652")) {
      {}
    } else {
      stryCov_9fa48("15652");
      return this._transitionHistory.map(stryMutAct_9fa48("15653") ? () => undefined : (stryCov_9fa48("15653"), entry => stryMutAct_9fa48("15654") ? {} : (stryCov_9fa48("15654"), {
        previousPhase: entry.previousPhase,
        previousReady: entry.previousReady,
        phase: entry.phase,
        ready: entry.ready,
        reasons: stryMutAct_9fa48("15655") ? [] : (stryCov_9fa48("15655"), [...entry.reasons]),
        degradedReasons: stryMutAct_9fa48("15656") ? [] : (stryCov_9fa48("15656"), [...entry.degradedReasons]),
        timestamp: entry.timestamp
      })));
    }
  }

  /**
   * Classify probe status into a coarse status class.
   * @param {*} statusCode
   * @return {string}
   */
  classifyProbeStatusCode(statusCode) {
    if (stryMutAct_9fa48("15657")) {
      {}
    } else {
      stryCov_9fa48("15657");
      if (stryMutAct_9fa48("15660") ? false : stryMutAct_9fa48("15659") ? true : stryMutAct_9fa48("15658") ? Number.isFinite(statusCode) : (stryCov_9fa48("15658", "15659", "15660"), !Number.isFinite(statusCode))) {
        if (stryMutAct_9fa48("15661")) {
          {}
        } else {
          stryCov_9fa48("15661");
          return LIFECYCLE_PROBE_STATUS_CLASS.UNKNOWN;
        }
      }
      const normalizedStatus = Math.floor(statusCode);
      if (stryMutAct_9fa48("15664") ? normalizedStatus >= PROBE_STATUS_SUCCESS_MIN || normalizedStatus < PROBE_STATUS_SUCCESS_MAX : stryMutAct_9fa48("15663") ? false : stryMutAct_9fa48("15662") ? true : (stryCov_9fa48("15662", "15663", "15664"), (stryMutAct_9fa48("15667") ? normalizedStatus < PROBE_STATUS_SUCCESS_MIN : stryMutAct_9fa48("15666") ? normalizedStatus > PROBE_STATUS_SUCCESS_MIN : stryMutAct_9fa48("15665") ? true : (stryCov_9fa48("15665", "15666", "15667"), normalizedStatus >= PROBE_STATUS_SUCCESS_MIN)) && (stryMutAct_9fa48("15670") ? normalizedStatus >= PROBE_STATUS_SUCCESS_MAX : stryMutAct_9fa48("15669") ? normalizedStatus <= PROBE_STATUS_SUCCESS_MAX : stryMutAct_9fa48("15668") ? true : (stryCov_9fa48("15668", "15669", "15670"), normalizedStatus < PROBE_STATUS_SUCCESS_MAX)))) {
        if (stryMutAct_9fa48("15671")) {
          {}
        } else {
          stryCov_9fa48("15671");
          return LIFECYCLE_PROBE_STATUS_CLASS.SUCCESS_2XX;
        }
      }
      if (stryMutAct_9fa48("15674") ? normalizedStatus >= PROBE_STATUS_CLIENT_ERROR_MIN || normalizedStatus < PROBE_STATUS_CLIENT_ERROR_MAX : stryMutAct_9fa48("15673") ? false : stryMutAct_9fa48("15672") ? true : (stryCov_9fa48("15672", "15673", "15674"), (stryMutAct_9fa48("15677") ? normalizedStatus < PROBE_STATUS_CLIENT_ERROR_MIN : stryMutAct_9fa48("15676") ? normalizedStatus > PROBE_STATUS_CLIENT_ERROR_MIN : stryMutAct_9fa48("15675") ? true : (stryCov_9fa48("15675", "15676", "15677"), normalizedStatus >= PROBE_STATUS_CLIENT_ERROR_MIN)) && (stryMutAct_9fa48("15680") ? normalizedStatus >= PROBE_STATUS_CLIENT_ERROR_MAX : stryMutAct_9fa48("15679") ? normalizedStatus <= PROBE_STATUS_CLIENT_ERROR_MAX : stryMutAct_9fa48("15678") ? true : (stryCov_9fa48("15678", "15679", "15680"), normalizedStatus < PROBE_STATUS_CLIENT_ERROR_MAX)))) {
        if (stryMutAct_9fa48("15681")) {
          {}
        } else {
          stryCov_9fa48("15681");
          return LIFECYCLE_PROBE_STATUS_CLASS.CLIENT_4XX;
        }
      }
      if (stryMutAct_9fa48("15684") ? normalizedStatus >= PROBE_STATUS_SERVER_ERROR_MIN || normalizedStatus < PROBE_STATUS_SERVER_ERROR_MAX : stryMutAct_9fa48("15683") ? false : stryMutAct_9fa48("15682") ? true : (stryCov_9fa48("15682", "15683", "15684"), (stryMutAct_9fa48("15687") ? normalizedStatus < PROBE_STATUS_SERVER_ERROR_MIN : stryMutAct_9fa48("15686") ? normalizedStatus > PROBE_STATUS_SERVER_ERROR_MIN : stryMutAct_9fa48("15685") ? true : (stryCov_9fa48("15685", "15686", "15687"), normalizedStatus >= PROBE_STATUS_SERVER_ERROR_MIN)) && (stryMutAct_9fa48("15690") ? normalizedStatus >= PROBE_STATUS_SERVER_ERROR_MAX : stryMutAct_9fa48("15689") ? normalizedStatus <= PROBE_STATUS_SERVER_ERROR_MAX : stryMutAct_9fa48("15688") ? true : (stryCov_9fa48("15688", "15689", "15690"), normalizedStatus < PROBE_STATUS_SERVER_ERROR_MAX)))) {
        if (stryMutAct_9fa48("15691")) {
          {}
        } else {
          stryCov_9fa48("15691");
          return LIFECYCLE_PROBE_STATUS_CLASS.SERVER_5XX;
        }
      }
      return LIFECYCLE_PROBE_STATUS_CLASS.UNKNOWN;
    }
  }
  collectDependencyStatus() {
    if (stryMutAct_9fa48("15692")) {
      {}
    } else {
      stryCov_9fa48("15692");
      const hardReasons = stryMutAct_9fa48("15693") ? ["Stryker was here"] : (stryCov_9fa48("15693"), []);
      const immediateHardReasons = stryMutAct_9fa48("15694") ? ["Stryker was here"] : (stryCov_9fa48("15694"), []);
      const softReasons = stryMutAct_9fa48("15695") ? ["Stryker was here"] : (stryCov_9fa48("15695"), []);
      let startupComplete = stryMutAct_9fa48("15696") ? false : (stryCov_9fa48("15696"), true);
      for (const [name, dependency] of this._dependencies.entries()) {
        if (stryMutAct_9fa48("15697")) {
          {}
        } else {
          stryCov_9fa48("15697");
          if (stryMutAct_9fa48("15700") ? dependency.ready !== true : stryMutAct_9fa48("15699") ? false : stryMutAct_9fa48("15698") ? true : (stryCov_9fa48("15698", "15699", "15700"), dependency.ready === (stryMutAct_9fa48("15701") ? false : (stryCov_9fa48("15701"), true)))) {
            if (stryMutAct_9fa48("15702")) {
              {}
            } else {
              stryCov_9fa48("15702");
              continue;
            }
          }
          const reason = dependency.reasonCode;
          if (stryMutAct_9fa48("15705") ? dependency.classification !== SOFT_CLASS : stryMutAct_9fa48("15704") ? false : stryMutAct_9fa48("15703") ? true : (stryCov_9fa48("15703", "15704", "15705"), dependency.classification === SOFT_CLASS)) {
            if (stryMutAct_9fa48("15706")) {
              {}
            } else {
              stryCov_9fa48("15706");
              if (stryMutAct_9fa48("15709") ? typeof reason === TYPE_STRING || reason.length > ZERO_COUNT : stryMutAct_9fa48("15708") ? false : stryMutAct_9fa48("15707") ? true : (stryCov_9fa48("15707", "15708", "15709"), (stryMutAct_9fa48("15711") ? typeof reason !== TYPE_STRING : stryMutAct_9fa48("15710") ? true : (stryCov_9fa48("15710", "15711"), typeof reason === TYPE_STRING)) && (stryMutAct_9fa48("15714") ? reason.length <= ZERO_COUNT : stryMutAct_9fa48("15713") ? reason.length >= ZERO_COUNT : stryMutAct_9fa48("15712") ? true : (stryCov_9fa48("15712", "15713", "15714"), reason.length > ZERO_COUNT)))) {
                if (stryMutAct_9fa48("15715")) {
                  {}
                } else {
                  stryCov_9fa48("15715");
                  softReasons.push(reason);
                }
              }
              continue;
            }
          }
          if (stryMutAct_9fa48("15718") ? typeof reason === TYPE_STRING || reason.length > ZERO_COUNT : stryMutAct_9fa48("15717") ? false : stryMutAct_9fa48("15716") ? true : (stryCov_9fa48("15716", "15717", "15718"), (stryMutAct_9fa48("15720") ? typeof reason !== TYPE_STRING : stryMutAct_9fa48("15719") ? true : (stryCov_9fa48("15719", "15720"), typeof reason === TYPE_STRING)) && (stryMutAct_9fa48("15723") ? reason.length <= ZERO_COUNT : stryMutAct_9fa48("15722") ? reason.length >= ZERO_COUNT : stryMutAct_9fa48("15721") ? true : (stryCov_9fa48("15721", "15722", "15723"), reason.length > ZERO_COUNT)))) {
            if (stryMutAct_9fa48("15724")) {
              {}
            } else {
              stryCov_9fa48("15724");
              hardReasons.push(reason);
              if (stryMutAct_9fa48("15727") ? dependency.demotionPolicy !== IMMEDIATE_DEMOTION_POLICY : stryMutAct_9fa48("15726") ? false : stryMutAct_9fa48("15725") ? true : (stryCov_9fa48("15725", "15726", "15727"), dependency.demotionPolicy === IMMEDIATE_DEMOTION_POLICY)) {
                if (stryMutAct_9fa48("15728")) {
                  {}
                } else {
                  stryCov_9fa48("15728");
                  immediateHardReasons.push(reason);
                }
              }
            }
          }
          if (stryMutAct_9fa48("15731") ? name !== LIFECYCLE_DEPENDENCY.STARTUP_COMPLETE : stryMutAct_9fa48("15730") ? false : stryMutAct_9fa48("15729") ? true : (stryCov_9fa48("15729", "15730", "15731"), name === LIFECYCLE_DEPENDENCY.STARTUP_COMPLETE)) {
            if (stryMutAct_9fa48("15732")) {
              {}
            } else {
              stryCov_9fa48("15732");
              startupComplete = stryMutAct_9fa48("15733") ? true : (stryCov_9fa48("15733"), false);
            }
          }
        }
      }
      return stryMutAct_9fa48("15734") ? {} : (stryCov_9fa48("15734"), {
        hardReasons: this.uniqueReasons(hardReasons),
        immediateHardReasons: this.uniqueReasons(immediateHardReasons),
        softReasons: this.uniqueReasons(softReasons),
        startupComplete
      });
    }
  }
  mapLegacyState(phase) {
    if (stryMutAct_9fa48("15735")) {
      {}
    } else {
      stryCov_9fa48("15735");
      if (stryMutAct_9fa48("15738") ? phase !== LIFECYCLE_PHASE.INIT : stryMutAct_9fa48("15737") ? false : stryMutAct_9fa48("15736") ? true : (stryCov_9fa48("15736", "15737", "15738"), phase === LIFECYCLE_PHASE.INIT)) {
        if (stryMutAct_9fa48("15739")) {
          {}
        } else {
          stryCov_9fa48("15739");
          return LIFECYCLE_LEGACY_STATE.BOOTSTRAPPING;
        }
      }
      if (stryMutAct_9fa48("15742") ? phase === LIFECYCLE_PHASE.CONTROL_READY && phase === LIFECYCLE_PHASE.JOIN_READY : stryMutAct_9fa48("15741") ? false : stryMutAct_9fa48("15740") ? true : (stryCov_9fa48("15740", "15741", "15742"), (stryMutAct_9fa48("15744") ? phase !== LIFECYCLE_PHASE.CONTROL_READY : stryMutAct_9fa48("15743") ? false : (stryCov_9fa48("15743", "15744"), phase === LIFECYCLE_PHASE.CONTROL_READY)) || (stryMutAct_9fa48("15746") ? phase !== LIFECYCLE_PHASE.JOIN_READY : stryMutAct_9fa48("15745") ? false : (stryCov_9fa48("15745", "15746"), phase === LIFECYCLE_PHASE.JOIN_READY)))) {
        if (stryMutAct_9fa48("15747")) {
          {}
        } else {
          stryCov_9fa48("15747");
          return LIFECYCLE_LEGACY_STATE.WARMING;
        }
      }
      if (stryMutAct_9fa48("15750") ? phase !== LIFECYCLE_PHASE.TRAFFIC_READY : stryMutAct_9fa48("15749") ? false : stryMutAct_9fa48("15748") ? true : (stryCov_9fa48("15748", "15749", "15750"), phase === LIFECYCLE_PHASE.TRAFFIC_READY)) {
        if (stryMutAct_9fa48("15751")) {
          {}
        } else {
          stryCov_9fa48("15751");
          return LIFECYCLE_LEGACY_STATE.JOIN_READY;
        }
      }
      return LIFECYCLE_LEGACY_STATE.DEGRADED;
    }
  }
  resolveLegacyState(phase, options = {}) {
    if (stryMutAct_9fa48("15752")) {
      {}
    } else {
      stryCov_9fa48("15752");
      if (stryMutAct_9fa48("15755") ? options.beforeFirstEvaluation !== true : stryMutAct_9fa48("15754") ? false : stryMutAct_9fa48("15753") ? true : (stryCov_9fa48("15753", "15754", "15755"), options.beforeFirstEvaluation === (stryMutAct_9fa48("15756") ? false : (stryCov_9fa48("15756"), true)))) {
        if (stryMutAct_9fa48("15757")) {
          {}
        } else {
          stryCov_9fa48("15757");
          return LIFECYCLE_LEGACY_STATE.STARTING;
        }
      }
      return this.mapLegacyState(phase);
    }
  }
  isTransitionAllowed(fromPhase, toPhase) {
    if (stryMutAct_9fa48("15758")) {
      {}
    } else {
      stryCov_9fa48("15758");
      const allowedTransitions = stryMutAct_9fa48("15761") ? LIFECYCLE_ALLOWED_TRANSITIONS[fromPhase] && EMPTY_REASONS : stryMutAct_9fa48("15760") ? false : stryMutAct_9fa48("15759") ? true : (stryCov_9fa48("15759", "15760", "15761"), LIFECYCLE_ALLOWED_TRANSITIONS[fromPhase] || EMPTY_REASONS);
      return allowedTransitions.includes(toPhase);
    }
  }
  normalizeReasons(reasons) {
    if (stryMutAct_9fa48("15762")) {
      {}
    } else {
      stryCov_9fa48("15762");
      if (stryMutAct_9fa48("15765") ? false : stryMutAct_9fa48("15764") ? true : stryMutAct_9fa48("15763") ? Array.isArray(reasons) : (stryCov_9fa48("15763", "15764", "15765"), !Array.isArray(reasons))) {
        if (stryMutAct_9fa48("15766")) {
          {}
        } else {
          stryCov_9fa48("15766");
          return stryMutAct_9fa48("15767") ? ["Stryker was here"] : (stryCov_9fa48("15767"), []);
        }
      }
      return this.uniqueReasons(stryMutAct_9fa48("15768") ? reasons : (stryCov_9fa48("15768"), reasons.filter(stryMutAct_9fa48("15769") ? () => undefined : (stryCov_9fa48("15769"), reason => stryMutAct_9fa48("15772") ? typeof reason === TYPE_STRING || reason.length > ZERO_COUNT : stryMutAct_9fa48("15771") ? false : stryMutAct_9fa48("15770") ? true : (stryCov_9fa48("15770", "15771", "15772"), (stryMutAct_9fa48("15774") ? typeof reason !== TYPE_STRING : stryMutAct_9fa48("15773") ? true : (stryCov_9fa48("15773", "15774"), typeof reason === TYPE_STRING)) && (stryMutAct_9fa48("15777") ? reason.length <= ZERO_COUNT : stryMutAct_9fa48("15776") ? reason.length >= ZERO_COUNT : stryMutAct_9fa48("15775") ? true : (stryCov_9fa48("15775", "15776", "15777"), reason.length > ZERO_COUNT)))))));
    }
  }
  uniqueReasons(reasons) {
    if (stryMutAct_9fa48("15778")) {
      {}
    } else {
      stryCov_9fa48("15778");
      return stryMutAct_9fa48("15779") ? [] : (stryCov_9fa48("15779"), [...new Set(reasons)]);
    }
  }
  sameReasons(a, b) {
    if (stryMutAct_9fa48("15780")) {
      {}
    } else {
      stryCov_9fa48("15780");
      if (stryMutAct_9fa48("15783") ? (!Array.isArray(a) || !Array.isArray(b)) && a.length !== b.length : stryMutAct_9fa48("15782") ? false : stryMutAct_9fa48("15781") ? true : (stryCov_9fa48("15781", "15782", "15783"), (stryMutAct_9fa48("15785") ? !Array.isArray(a) && !Array.isArray(b) : stryMutAct_9fa48("15784") ? false : (stryCov_9fa48("15784", "15785"), (stryMutAct_9fa48("15786") ? Array.isArray(a) : (stryCov_9fa48("15786"), !Array.isArray(a))) || (stryMutAct_9fa48("15787") ? Array.isArray(b) : (stryCov_9fa48("15787"), !Array.isArray(b))))) || (stryMutAct_9fa48("15789") ? a.length === b.length : stryMutAct_9fa48("15788") ? false : (stryCov_9fa48("15788", "15789"), a.length !== b.length)))) {
        if (stryMutAct_9fa48("15790")) {
          {}
        } else {
          stryCov_9fa48("15790");
          return stryMutAct_9fa48("15791") ? true : (stryCov_9fa48("15791"), false);
        }
      }
      for (let index = ZERO_COUNT; stryMutAct_9fa48("15794") ? index >= a.length : stryMutAct_9fa48("15793") ? index <= a.length : stryMutAct_9fa48("15792") ? false : (stryCov_9fa48("15792", "15793", "15794"), index < a.length); stryMutAct_9fa48("15795") ? index -= ONE_COUNT : (stryCov_9fa48("15795"), index += ONE_COUNT)) {
        if (stryMutAct_9fa48("15796")) {
          {}
        } else {
          stryCov_9fa48("15796");
          if (stryMutAct_9fa48("15799") ? a[index] === b[index] : stryMutAct_9fa48("15798") ? false : stryMutAct_9fa48("15797") ? true : (stryCov_9fa48("15797", "15798", "15799"), a[index] !== b[index])) {
            if (stryMutAct_9fa48("15800")) {
              {}
            } else {
              stryCov_9fa48("15800");
              return stryMutAct_9fa48("15801") ? true : (stryCov_9fa48("15801"), false);
            }
          }
        }
      }
      return stryMutAct_9fa48("15802") ? false : (stryCov_9fa48("15802"), true);
    }
  }
  updateBlockedReasonDurations(now, previousReasons) {
    if (stryMutAct_9fa48("15803")) {
      {}
    } else {
      stryCov_9fa48("15803");
      const previousActiveReasons = new Set(Array.isArray(previousReasons) ? previousReasons : EMPTY_REASONS);
      const activeReasons = new Set(this._reasons);
      for (const reason of previousActiveReasons.values()) {
        if (stryMutAct_9fa48("15804")) {
          {}
        } else {
          stryCov_9fa48("15804");
          if (stryMutAct_9fa48("15806") ? false : stryMutAct_9fa48("15805") ? true : (stryCov_9fa48("15805", "15806"), this._blockedReasonSince.has(reason))) {
            if (stryMutAct_9fa48("15807")) {
              {}
            } else {
              stryCov_9fa48("15807");
              continue;
            }
          }
          this._blockedReasonSince.set(reason, now);
        }
      }
      for (const [reason, since] of this._blockedReasonSince.entries()) {
        if (stryMutAct_9fa48("15808")) {
          {}
        } else {
          stryCov_9fa48("15808");
          if (stryMutAct_9fa48("15810") ? false : stryMutAct_9fa48("15809") ? true : (stryCov_9fa48("15809", "15810"), activeReasons.has(reason))) {
            if (stryMutAct_9fa48("15811")) {
              {}
            } else {
              stryCov_9fa48("15811");
              continue;
            }
          }
          const elapsed = stryMutAct_9fa48("15812") ? Math.min(0, now - since) : (stryCov_9fa48("15812"), Math.max(0, stryMutAct_9fa48("15813") ? now + since : (stryCov_9fa48("15813"), now - since)));
          this._blockedDurationMs.set(reason, stryMutAct_9fa48("15814") ? (this._blockedDurationMs.get(reason) || ZERO_COUNT) - elapsed : (stryCov_9fa48("15814"), (stryMutAct_9fa48("15817") ? this._blockedDurationMs.get(reason) && ZERO_COUNT : stryMutAct_9fa48("15816") ? false : stryMutAct_9fa48("15815") ? true : (stryCov_9fa48("15815", "15816", "15817"), this._blockedDurationMs.get(reason) || ZERO_COUNT)) + elapsed));
          this.emit(LIFECYCLE_EVENT.BLOCKED_DURATION, stryMutAct_9fa48("15818") ? {} : (stryCov_9fa48("15818"), {
            reason,
            durationMs: elapsed,
            totalDurationMs: this._blockedDurationMs.get(reason),
            timestamp: now
          }));
          this._blockedReasonSince.delete(reason);
        }
      }
      for (const reason of activeReasons.values()) {
        if (stryMutAct_9fa48("15819")) {
          {}
        } else {
          stryCov_9fa48("15819");
          if (stryMutAct_9fa48("15822") ? false : stryMutAct_9fa48("15821") ? true : stryMutAct_9fa48("15820") ? this._blockedReasonSince.has(reason) : (stryCov_9fa48("15820", "15821", "15822"), !this._blockedReasonSince.has(reason))) {
            if (stryMutAct_9fa48("15823")) {
              {}
            } else {
              stryCov_9fa48("15823");
              this._blockedReasonSince.set(reason, now);
            }
          }
        }
      }
    }
  }
  recordTransition(transition) {
    if (stryMutAct_9fa48("15824")) {
      {}
    } else {
      stryCov_9fa48("15824");
      stryMutAct_9fa48("15825") ? this._transitionCount -= ONE_COUNT : (stryCov_9fa48("15825"), this._transitionCount += ONE_COUNT);
      this._transitionHistory.push(stryMutAct_9fa48("15826") ? {} : (stryCov_9fa48("15826"), {
        previousPhase: transition.previousPhase,
        previousReady: transition.previousReady,
        phase: transition.phase,
        ready: transition.ready,
        reasons: stryMutAct_9fa48("15827") ? [] : (stryCov_9fa48("15827"), [...transition.reasons]),
        degradedReasons: stryMutAct_9fa48("15828") ? [] : (stryCov_9fa48("15828"), [...transition.degradedReasons]),
        timestamp: transition.timestamp
      }));
      this.emit(LIFECYCLE_EVENT.TRANSITION, stryMutAct_9fa48("15829") ? {} : (stryCov_9fa48("15829"), {
        previousPhase: transition.previousPhase,
        previousState: transition.previousLegacyState,
        previousReady: transition.previousReady,
        phase: transition.phase,
        state: this.resolveLegacyState(transition.phase),
        ready: transition.ready,
        reasons: stryMutAct_9fa48("15830") ? [] : (stryCov_9fa48("15830"), [...transition.reasons]),
        degradedReasons: stryMutAct_9fa48("15831") ? [] : (stryCov_9fa48("15831"), [...transition.degradedReasons]),
        timestamp: transition.timestamp
      }));
    }
  }
}
export { LifecycleController };