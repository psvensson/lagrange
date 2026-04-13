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
const TIMEOUT_BUDGET_CLASSIFICATION = Object.freeze(stryMutAct_9fa48("75019") ? {} : (stryCov_9fa48("75019"), {
  LOCAL_SCHEDULER_STARVATION: stryMutAct_9fa48("75020") ? "" : (stryCov_9fa48("75020"), 'local_scheduler_starvation'),
  REMOTE_CALL_TIMEOUT: stryMutAct_9fa48("75021") ? "" : (stryCov_9fa48("75021"), 'remote_call_timeout'),
  QUERY_TIMEOUT: stryMutAct_9fa48("75022") ? "" : (stryCov_9fa48("75022"), 'query_timeout'),
  PUBLICATION_WAIT_TIMEOUT: stryMutAct_9fa48("75023") ? "" : (stryCov_9fa48("75023"), 'publication_wait_timeout'),
  CACHE_VISIBILITY_TIMEOUT: stryMutAct_9fa48("75024") ? "" : (stryCov_9fa48("75024"), 'cache_visibility_timeout'),
  REBALANCE_OPERATION_TIMEOUT: stryMutAct_9fa48("75025") ? "" : (stryCov_9fa48("75025"), 'rebalance_operation_timeout'),
  ABSOLUTE_DEADLINE_EXHAUSTED: stryMutAct_9fa48("75026") ? "" : (stryCov_9fa48("75026"), 'absolute_deadline_exhausted'),
  EXACT_BOUNDARY_HIT: stryMutAct_9fa48("75027") ? "" : (stryCov_9fa48("75027"), 'exact_boundary_hit')
}));
const TIMEOUT_BUDGET_DEFAULT = Object.freeze(stryMutAct_9fa48("75028") ? {} : (stryCov_9fa48("75028"), {
  MINIMUM_OPERATION_BUDGET_MS: 5,
  REBALANCE_OPERATION_BUDGET_MS: 300000,
  SPLIT_OPERATION_BUDGET_MS: 300000,
  DISPATCH_OPERATION_BUDGET_MS: 60000,
  TRANSACTION_BUDGET_MS: 60000,
  PREPARED_HOLD_TIMEOUT_MS: 60000
}));
const CONTROL_PLANE_TIMEOUT_DEFAULT = Object.freeze(stryMutAct_9fa48("75029") ? {} : (stryCov_9fa48("75029"), {
  SQL_QUERY_TIMEOUT_MS: 5000
}));
function resolveNow(now) {
  if (stryMutAct_9fa48("75030")) {
    {}
  } else {
    stryCov_9fa48("75030");
    return (stryMutAct_9fa48("75033") ? typeof now !== 'function' : stryMutAct_9fa48("75032") ? false : stryMutAct_9fa48("75031") ? true : (stryCov_9fa48("75031", "75032", "75033"), typeof now === (stryMutAct_9fa48("75034") ? "" : (stryCov_9fa48("75034"), 'function')))) ? now : Date.now;
  }
}
function normalizePositiveInteger(value, fallback = 0) {
  if (stryMutAct_9fa48("75035")) {
    {}
  } else {
    stryCov_9fa48("75035");
    return (stryMutAct_9fa48("75038") ? Number.isFinite(value) || value > 0 : stryMutAct_9fa48("75037") ? false : stryMutAct_9fa48("75036") ? true : (stryCov_9fa48("75036", "75037", "75038"), Number.isFinite(value) && (stryMutAct_9fa48("75041") ? value <= 0 : stryMutAct_9fa48("75040") ? value >= 0 : stryMutAct_9fa48("75039") ? true : (stryCov_9fa48("75039", "75040", "75041"), value > 0)))) ? Math.floor(value) : fallback;
  }
}
function createTimeoutBudget(options = {}) {
  if (stryMutAct_9fa48("75042")) {
    {}
  } else {
    stryCov_9fa48("75042");
    const now = resolveNow(options.now);
    const configuredBudgetMs = normalizePositiveInteger(options.configuredBudgetMs);
    const startedAtMs = Number.isFinite(options.startedAtMs) ? options.startedAtMs : now();
    return Object.freeze(stryMutAct_9fa48("75043") ? {} : (stryCov_9fa48("75043"), {
      configuredBudgetMs,
      startedAtMs,
      deadlineMs: stryMutAct_9fa48("75044") ? startedAtMs - configuredBudgetMs : (stryCov_9fa48("75044"), startedAtMs + configuredBudgetMs)
    }));
  }
}
function getBudgetTiming(budget, now) {
  if (stryMutAct_9fa48("75045")) {
    {}
  } else {
    stryCov_9fa48("75045");
    const nowFn = resolveNow(now);
    const nowMs = nowFn();
    const rawRemainingMs = stryMutAct_9fa48("75046") ? budget.deadlineMs + nowMs : (stryCov_9fa48("75046"), budget.deadlineMs - nowMs);
    return stryMutAct_9fa48("75047") ? {} : (stryCov_9fa48("75047"), {
      nowMs,
      rawRemainingMs,
      remainingBudgetMs: stryMutAct_9fa48("75048") ? Math.min(0, rawRemainingMs) : (stryCov_9fa48("75048"), Math.max(0, rawRemainingMs))
    });
  }
}
function getRemainingBudgetMs(budget, options = {}) {
  if (stryMutAct_9fa48("75049")) {
    {}
  } else {
    stryCov_9fa48("75049");
    return getBudgetTiming(budget, options.now).remainingBudgetMs;
  }
}
function resolveControlPlaneQueryTimeoutMs(options = {}) {
  if (stryMutAct_9fa48("75050")) {
    {}
  } else {
    stryCov_9fa48("75050");
    const requestedTimeoutMs = normalizePositiveInteger(options.requestedTimeoutMs, CONTROL_PLANE_TIMEOUT_DEFAULT.SQL_QUERY_TIMEOUT_MS);
    const timeoutBudget = options.timeoutBudget;
    if (stryMutAct_9fa48("75053") ? !timeoutBudget && typeof timeoutBudget !== 'object' : stryMutAct_9fa48("75052") ? false : stryMutAct_9fa48("75051") ? true : (stryCov_9fa48("75051", "75052", "75053"), (stryMutAct_9fa48("75054") ? timeoutBudget : (stryCov_9fa48("75054"), !timeoutBudget)) || (stryMutAct_9fa48("75056") ? typeof timeoutBudget === 'object' : stryMutAct_9fa48("75055") ? false : (stryCov_9fa48("75055", "75056"), typeof timeoutBudget !== (stryMutAct_9fa48("75057") ? "" : (stryCov_9fa48("75057"), 'object')))))) {
      if (stryMutAct_9fa48("75058")) {
        {}
      } else {
        stryCov_9fa48("75058");
        return requestedTimeoutMs;
      }
    }
    const remainingBudgetMs = getRemainingBudgetMs(timeoutBudget, stryMutAct_9fa48("75059") ? {} : (stryCov_9fa48("75059"), {
      now: options.now
    }));
    if (stryMutAct_9fa48("75063") ? remainingBudgetMs > 0 : stryMutAct_9fa48("75062") ? remainingBudgetMs < 0 : stryMutAct_9fa48("75061") ? false : stryMutAct_9fa48("75060") ? true : (stryCov_9fa48("75060", "75061", "75062", "75063"), remainingBudgetMs <= 0)) {
      if (stryMutAct_9fa48("75064")) {
        {}
      } else {
        stryCov_9fa48("75064");
        return TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS;
      }
    }
    return stryMutAct_9fa48("75065") ? Math.min(TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS, Math.min(requestedTimeoutMs, remainingBudgetMs)) : (stryCov_9fa48("75065"), Math.max(TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS, stryMutAct_9fa48("75066") ? Math.max(requestedTimeoutMs, remainingBudgetMs) : (stryCov_9fa48("75066"), Math.min(requestedTimeoutMs, remainingBudgetMs))));
  }
}
function buildControlPlaneQueryOptions(options = {}) {
  if (stryMutAct_9fa48("75067")) {
    {}
  } else {
    stryCov_9fa48("75067");
    return Object.freeze(stryMutAct_9fa48("75068") ? {} : (stryCov_9fa48("75068"), {
      timeoutMs: resolveControlPlaneQueryTimeoutMs(options)
    }));
  }
}
function buildTimeoutClassification(options = {}) {
  if (stryMutAct_9fa48("75069")) {
    {}
  } else {
    stryCov_9fa48("75069");
    const budget = options.budget;
    const timing = getBudgetTiming(budget, options.now);
    const boundaryHit = stryMutAct_9fa48("75072") ? timing.rawRemainingMs !== 0 : stryMutAct_9fa48("75071") ? false : stryMutAct_9fa48("75070") ? true : (stryCov_9fa48("75070", "75071", "75072"), timing.rawRemainingMs === 0);
    return Object.freeze(stryMutAct_9fa48("75073") ? {} : (stryCov_9fa48("75073"), {
      classification: boundaryHit ? TIMEOUT_BUDGET_CLASSIFICATION.EXACT_BOUNDARY_HIT : options.classification,
      configuredBudgetMs: budget.configuredBudgetMs,
      remainingBudgetMs: timing.remainingBudgetMs,
      boundaryHit,
      nestedOperation: stryMutAct_9fa48("75076") ? options.nestedOperation && null : stryMutAct_9fa48("75075") ? false : stryMutAct_9fa48("75074") ? true : (stryCov_9fa48("75074", "75075", "75076"), options.nestedOperation || null),
      operationName: stryMutAct_9fa48("75079") ? budget.operationName && null : stryMutAct_9fa48("75078") ? false : stryMutAct_9fa48("75077") ? true : (stryCov_9fa48("75077", "75078", "75079"), budget.operationName || null),
      originalClassification: boundaryHit ? options.classification : null
    }));
  }
}
function createChildTimeoutBudget(parentBudget, options = {}) {
  if (stryMutAct_9fa48("75080")) {
    {}
  } else {
    stryCov_9fa48("75080");
    const timing = getBudgetTiming(parentBudget, options.now);
    const requestedBudgetMs = normalizePositiveInteger(options.requestedBudgetMs, timing.remainingBudgetMs);
    const minimumBudgetMs = normalizePositiveInteger(options.minimumBudgetMs, TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS);
    const grantedBudgetMs = stryMutAct_9fa48("75081") ? Math.max(requestedBudgetMs, timing.remainingBudgetMs) : (stryCov_9fa48("75081"), Math.min(requestedBudgetMs, timing.remainingBudgetMs));
    if (stryMutAct_9fa48("75085") ? grantedBudgetMs >= minimumBudgetMs : stryMutAct_9fa48("75084") ? grantedBudgetMs <= minimumBudgetMs : stryMutAct_9fa48("75083") ? false : stryMutAct_9fa48("75082") ? true : (stryCov_9fa48("75082", "75083", "75084", "75085"), grantedBudgetMs < minimumBudgetMs)) {
      if (stryMutAct_9fa48("75086")) {
        {}
      } else {
        stryCov_9fa48("75086");
        return Object.freeze(stryMutAct_9fa48("75087") ? {} : (stryCov_9fa48("75087"), {
          allowed: stryMutAct_9fa48("75088") ? true : (stryCov_9fa48("75088"), false),
          grantedBudgetMs,
          remainingBudgetMs: timing.remainingBudgetMs,
          budget: null,
          timeoutClassification: buildTimeoutClassification(stryMutAct_9fa48("75089") ? {} : (stryCov_9fa48("75089"), {
            budget: parentBudget,
            classification: stryMutAct_9fa48("75092") ? options.classification && TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED : stryMutAct_9fa48("75091") ? false : stryMutAct_9fa48("75090") ? true : (stryCov_9fa48("75090", "75091", "75092"), options.classification || TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED),
            nestedOperation: options.nestedOperation,
            now: stryMutAct_9fa48("75093") ? () => undefined : (stryCov_9fa48("75093"), () => timing.nowMs)
          }))
        }));
      }
    }
    return Object.freeze(stryMutAct_9fa48("75094") ? {} : (stryCov_9fa48("75094"), {
      allowed: stryMutAct_9fa48("75095") ? false : (stryCov_9fa48("75095"), true),
      grantedBudgetMs,
      remainingBudgetMs: timing.remainingBudgetMs,
      budget: createTimeoutBudget(stryMutAct_9fa48("75096") ? {} : (stryCov_9fa48("75096"), {
        configuredBudgetMs: grantedBudgetMs,
        startedAtMs: timing.nowMs,
        now: stryMutAct_9fa48("75097") ? () => undefined : (stryCov_9fa48("75097"), () => timing.nowMs)
      })),
      timeoutClassification: null
    }));
  }
}
function createTimeoutBudgetError(options = {}) {
  if (stryMutAct_9fa48("75098")) {
    {}
  } else {
    stryCov_9fa48("75098");
    const error = new Error(options.message);
    error.timeoutClassification = buildTimeoutClassification(stryMutAct_9fa48("75099") ? {} : (stryCov_9fa48("75099"), {
      budget: options.budget,
      classification: options.classification,
      nestedOperation: options.nestedOperation,
      now: options.now
    }));
    return error;
  }
}
function createTopLevelOperationBudget(options = {}) {
  if (stryMutAct_9fa48("75100")) {
    {}
  } else {
    stryCov_9fa48("75100");
    const configuredBudgetMs = normalizePositiveInteger(options.configuredBudgetMs);
    const operationName = stryMutAct_9fa48("75103") ? options.operationName && null : stryMutAct_9fa48("75102") ? false : stryMutAct_9fa48("75101") ? true : (stryCov_9fa48("75101", "75102", "75103"), options.operationName || null);
    const budget = createTimeoutBudget(stryMutAct_9fa48("75104") ? {} : (stryCov_9fa48("75104"), {
      configuredBudgetMs,
      startedAtMs: options.startedAtMs,
      now: options.now
    }));
    return Object.freeze(stryMutAct_9fa48("75105") ? {} : (stryCov_9fa48("75105"), {
      ...budget,
      operationName
    }));
  }
}
export { CONTROL_PLANE_TIMEOUT_DEFAULT, TIMEOUT_BUDGET_CLASSIFICATION, TIMEOUT_BUDGET_DEFAULT, buildTimeoutClassification, buildControlPlaneQueryOptions, createChildTimeoutBudget, createTimeoutBudget, createTimeoutBudgetError, createTopLevelOperationBudget, getRemainingBudgetMs, resolveControlPlaneQueryTimeoutMs };