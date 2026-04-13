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
import { NUM, TIME_MS, TYPEOF } from '../../constants/index.js';
import { ROUTER_ERROR_MSG } from '../../constants/transport.js';
const LOCAL_QUERY_TRANSPORT_WAIT_DEFAULT = Object.freeze(stryMutAct_9fa48("28875") ? {} : (stryCov_9fa48("28875"), {
  MAX_ATTEMPTS: NUM.SIX,
  INITIAL_DELAY_MS: TIME_MS.SECOND,
  MAX_DELAY_MS: stryMutAct_9fa48("28876") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("28876"), TIME_MS.SECOND * NUM.FIVE),
  BACKOFF_MULTIPLIER: NUM.TWO
}));
function normalizePositiveInteger(value, fallback) {
  if (stryMutAct_9fa48("28877")) {
    {}
  } else {
    stryCov_9fa48("28877");
    return (stryMutAct_9fa48("28880") ? Number.isFinite(value) || value > NUM.ZERO : stryMutAct_9fa48("28879") ? false : stryMutAct_9fa48("28878") ? true : (stryCov_9fa48("28878", "28879", "28880"), Number.isFinite(value) && (stryMutAct_9fa48("28883") ? value <= NUM.ZERO : stryMutAct_9fa48("28882") ? value >= NUM.ZERO : stryMutAct_9fa48("28881") ? true : (stryCov_9fa48("28881", "28882", "28883"), value > NUM.ZERO)))) ? Math.floor(value) : fallback;
  }
}
function normalizeBackoffMultiplier(value) {
  if (stryMutAct_9fa48("28884")) {
    {}
  } else {
    stryCov_9fa48("28884");
    return (stryMutAct_9fa48("28887") ? Number.isFinite(value) || value > NUM.ZERO : stryMutAct_9fa48("28886") ? false : stryMutAct_9fa48("28885") ? true : (stryCov_9fa48("28885", "28886", "28887"), Number.isFinite(value) && (stryMutAct_9fa48("28890") ? value <= NUM.ZERO : stryMutAct_9fa48("28889") ? value >= NUM.ZERO : stryMutAct_9fa48("28888") ? true : (stryCov_9fa48("28888", "28889", "28890"), value > NUM.ZERO)))) ? value : LOCAL_QUERY_TRANSPORT_WAIT_DEFAULT.BACKOFF_MULTIPLIER;
  }
}
function normalizeLocalQueryTransportReadiness(rawReadiness) {
  if (stryMutAct_9fa48("28891")) {
    {}
  } else {
    stryCov_9fa48("28891");
    if (stryMutAct_9fa48("28894") ? !rawReadiness && typeof rawReadiness !== TYPEOF.OBJECT : stryMutAct_9fa48("28893") ? false : stryMutAct_9fa48("28892") ? true : (stryCov_9fa48("28892", "28893", "28894"), (stryMutAct_9fa48("28895") ? rawReadiness : (stryCov_9fa48("28895"), !rawReadiness)) || (stryMutAct_9fa48("28897") ? typeof rawReadiness === TYPEOF.OBJECT : stryMutAct_9fa48("28896") ? false : (stryCov_9fa48("28896", "28897"), typeof rawReadiness !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("28898")) {
        {}
      } else {
        stryCov_9fa48("28898");
        return Object.freeze(stryMutAct_9fa48("28899") ? {} : (stryCov_9fa48("28899"), {
          ready: null,
          state: stryMutAct_9fa48("28900") ? "" : (stryCov_9fa48("28900"), 'unknown'),
          reason: null,
          retryAfterMs: null
        }));
      }
    }
    const ready = (stryMutAct_9fa48("28903") ? typeof rawReadiness.ready !== 'boolean' : stryMutAct_9fa48("28902") ? false : stryMutAct_9fa48("28901") ? true : (stryCov_9fa48("28901", "28902", "28903"), typeof rawReadiness.ready === (stryMutAct_9fa48("28904") ? "" : (stryCov_9fa48("28904"), 'boolean')))) ? rawReadiness.ready : null;
    return Object.freeze(stryMutAct_9fa48("28905") ? {} : (stryCov_9fa48("28905"), {
      ready,
      state: (stryMutAct_9fa48("28908") ? typeof rawReadiness.state === TYPEOF.STRING || rawReadiness.state.length > NUM.ZERO : stryMutAct_9fa48("28907") ? false : stryMutAct_9fa48("28906") ? true : (stryCov_9fa48("28906", "28907", "28908"), (stryMutAct_9fa48("28910") ? typeof rawReadiness.state !== TYPEOF.STRING : stryMutAct_9fa48("28909") ? true : (stryCov_9fa48("28909", "28910"), typeof rawReadiness.state === TYPEOF.STRING)) && (stryMutAct_9fa48("28913") ? rawReadiness.state.length <= NUM.ZERO : stryMutAct_9fa48("28912") ? rawReadiness.state.length >= NUM.ZERO : stryMutAct_9fa48("28911") ? true : (stryCov_9fa48("28911", "28912", "28913"), rawReadiness.state.length > NUM.ZERO)))) ? rawReadiness.state : (stryMutAct_9fa48("28916") ? ready !== true : stryMutAct_9fa48("28915") ? false : stryMutAct_9fa48("28914") ? true : (stryCov_9fa48("28914", "28915", "28916"), ready === (stryMutAct_9fa48("28917") ? false : (stryCov_9fa48("28917"), true)))) ? stryMutAct_9fa48("28918") ? "" : (stryCov_9fa48("28918"), 'ready') : (stryMutAct_9fa48("28921") ? ready !== false : stryMutAct_9fa48("28920") ? false : stryMutAct_9fa48("28919") ? true : (stryCov_9fa48("28919", "28920", "28921"), ready === (stryMutAct_9fa48("28922") ? true : (stryCov_9fa48("28922"), false)))) ? stryMutAct_9fa48("28923") ? "" : (stryCov_9fa48("28923"), 'deferred') : stryMutAct_9fa48("28924") ? "" : (stryCov_9fa48("28924"), 'unknown'),
      reason: (stryMutAct_9fa48("28927") ? typeof rawReadiness.reason === TYPEOF.STRING || rawReadiness.reason.length > NUM.ZERO : stryMutAct_9fa48("28926") ? false : stryMutAct_9fa48("28925") ? true : (stryCov_9fa48("28925", "28926", "28927"), (stryMutAct_9fa48("28929") ? typeof rawReadiness.reason !== TYPEOF.STRING : stryMutAct_9fa48("28928") ? true : (stryCov_9fa48("28928", "28929"), typeof rawReadiness.reason === TYPEOF.STRING)) && (stryMutAct_9fa48("28932") ? rawReadiness.reason.length <= NUM.ZERO : stryMutAct_9fa48("28931") ? rawReadiness.reason.length >= NUM.ZERO : stryMutAct_9fa48("28930") ? true : (stryCov_9fa48("28930", "28931", "28932"), rawReadiness.reason.length > NUM.ZERO)))) ? rawReadiness.reason : null,
      retryAfterMs: normalizePositiveInteger(rawReadiness.retryAfterMs, null)
    }));
  }
}
function getLocalQueryTransportReadiness(messageRouter) {
  if (stryMutAct_9fa48("28933")) {
    {}
  } else {
    stryCov_9fa48("28933");
    if (stryMutAct_9fa48("28936") ? !messageRouter && typeof messageRouter.getQueryDataPlaneTransportReadiness !== TYPEOF.FUNCTION : stryMutAct_9fa48("28935") ? false : stryMutAct_9fa48("28934") ? true : (stryCov_9fa48("28934", "28935", "28936"), (stryMutAct_9fa48("28937") ? messageRouter : (stryCov_9fa48("28937"), !messageRouter)) || (stryMutAct_9fa48("28939") ? typeof messageRouter.getQueryDataPlaneTransportReadiness === TYPEOF.FUNCTION : stryMutAct_9fa48("28938") ? false : (stryCov_9fa48("28938", "28939"), typeof messageRouter.getQueryDataPlaneTransportReadiness !== TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("28940")) {
        {}
      } else {
        stryCov_9fa48("28940");
        return normalizeLocalQueryTransportReadiness(null);
      }
    }
    return normalizeLocalQueryTransportReadiness(messageRouter.getQueryDataPlaneTransportReadiness());
  }
}
function isLocalQueryTransportReady(readiness) {
  if (stryMutAct_9fa48("28941")) {
    {}
  } else {
    stryCov_9fa48("28941");
    return stryMutAct_9fa48("28944") ? readiness?.ready !== true : stryMutAct_9fa48("28943") ? false : stryMutAct_9fa48("28942") ? true : (stryCov_9fa48("28942", "28943", "28944"), (stryMutAct_9fa48("28945") ? readiness.ready : (stryCov_9fa48("28945"), readiness?.ready)) === (stryMutAct_9fa48("28946") ? false : (stryCov_9fa48("28946"), true)));
  }
}
function buildLocalQueryTransportNotReadyError(readiness) {
  if (stryMutAct_9fa48("28947")) {
    {}
  } else {
    stryCov_9fa48("28947");
    const error = new Error(stryMutAct_9fa48("28950") ? readiness?.reason && ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED : stryMutAct_9fa48("28949") ? false : stryMutAct_9fa48("28948") ? true : (stryCov_9fa48("28948", "28949", "28950"), (stryMutAct_9fa48("28951") ? readiness.reason : (stryCov_9fa48("28951"), readiness?.reason)) || ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED));
    error.code = stryMutAct_9fa48("28952") ? "" : (stryCov_9fa48("28952"), 'ROUTER_QUERY_TRANSPORT_NOT_READY');
    error.retryAfterMs = normalizePositiveInteger(stryMutAct_9fa48("28953") ? readiness.retryAfterMs : (stryCov_9fa48("28953"), readiness?.retryAfterMs), NUM.ZERO);
    error.localQueryTransport = stryMutAct_9fa48("28956") ? readiness && null : stryMutAct_9fa48("28955") ? false : stryMutAct_9fa48("28954") ? true : (stryCov_9fa48("28954", "28955", "28956"), readiness || null);
    return error;
  }
}
async function waitForLocalQueryTransportReadiness(options = {}) {
  if (stryMutAct_9fa48("28957")) {
    {}
  } else {
    stryCov_9fa48("28957");
    const readiness = getLocalQueryTransportReadiness(stryMutAct_9fa48("28960") ? options.messageRouter && null : stryMutAct_9fa48("28959") ? false : stryMutAct_9fa48("28958") ? true : (stryCov_9fa48("28958", "28959", "28960"), options.messageRouter || null));
    if (stryMutAct_9fa48("28962") ? false : stryMutAct_9fa48("28961") ? true : (stryCov_9fa48("28961", "28962"), isLocalQueryTransportReady(readiness))) {
      if (stryMutAct_9fa48("28963")) {
        {}
      } else {
        stryCov_9fa48("28963");
        return readiness;
      }
    }
    const maxAttempts = normalizePositiveInteger(options.maxAttempts, LOCAL_QUERY_TRANSPORT_WAIT_DEFAULT.MAX_ATTEMPTS);
    const maxDelayMs = normalizePositiveInteger(options.maxDelayMs, LOCAL_QUERY_TRANSPORT_WAIT_DEFAULT.MAX_DELAY_MS);
    let delayMs = normalizePositiveInteger(options.initialDelayMs, LOCAL_QUERY_TRANSPORT_WAIT_DEFAULT.INITIAL_DELAY_MS);
    const backoffMultiplier = normalizeBackoffMultiplier(options.backoffMultiplier);
    const sleep = (stryMutAct_9fa48("28966") ? typeof options.sleep !== TYPEOF.FUNCTION : stryMutAct_9fa48("28965") ? false : stryMutAct_9fa48("28964") ? true : (stryCov_9fa48("28964", "28965", "28966"), typeof options.sleep === TYPEOF.FUNCTION)) ? options.sleep : stryMutAct_9fa48("28967") ? () => undefined : (stryCov_9fa48("28967"), waitMs => new Promise(stryMutAct_9fa48("28968") ? () => undefined : (stryCov_9fa48("28968"), resolve => setTimeout(resolve, waitMs))));
    let lastReadiness = readiness;
    for (let attempt = NUM.ONE; stryMutAct_9fa48("28971") ? attempt > maxAttempts : stryMutAct_9fa48("28970") ? attempt < maxAttempts : stryMutAct_9fa48("28969") ? false : (stryCov_9fa48("28969", "28970", "28971"), attempt <= maxAttempts); stryMutAct_9fa48("28972") ? attempt -= NUM.ONE : (stryCov_9fa48("28972"), attempt += NUM.ONE)) {
      if (stryMutAct_9fa48("28973")) {
        {}
      } else {
        stryCov_9fa48("28973");
        lastReadiness = getLocalQueryTransportReadiness(stryMutAct_9fa48("28976") ? options.messageRouter && null : stryMutAct_9fa48("28975") ? false : stryMutAct_9fa48("28974") ? true : (stryCov_9fa48("28974", "28975", "28976"), options.messageRouter || null));
        if (stryMutAct_9fa48("28978") ? false : stryMutAct_9fa48("28977") ? true : (stryCov_9fa48("28977", "28978"), isLocalQueryTransportReady(lastReadiness))) {
          if (stryMutAct_9fa48("28979")) {
            {}
          } else {
            stryCov_9fa48("28979");
            return lastReadiness;
          }
        }
        const hintedDelayMs = normalizePositiveInteger(lastReadiness.retryAfterMs, null);
        const effectiveDelayMs = (stryMutAct_9fa48("28982") ? hintedDelayMs === null : stryMutAct_9fa48("28981") ? false : stryMutAct_9fa48("28980") ? true : (stryCov_9fa48("28980", "28981", "28982"), hintedDelayMs !== null)) ? stryMutAct_9fa48("28983") ? Math.max(hintedDelayMs, maxDelayMs) : (stryCov_9fa48("28983"), Math.min(hintedDelayMs, maxDelayMs)) : delayMs;
        if (stryMutAct_9fa48("28987") ? attempt < maxAttempts : stryMutAct_9fa48("28986") ? attempt > maxAttempts : stryMutAct_9fa48("28985") ? false : stryMutAct_9fa48("28984") ? true : (stryCov_9fa48("28984", "28985", "28986", "28987"), attempt >= maxAttempts)) {
          if (stryMutAct_9fa48("28988")) {
            {}
          } else {
            stryCov_9fa48("28988");
            throw buildLocalQueryTransportNotReadyError(stryMutAct_9fa48("28989") ? {} : (stryCov_9fa48("28989"), {
              ...lastReadiness,
              retryAfterMs: effectiveDelayMs
            }));
          }
        }
        if (stryMutAct_9fa48("28992") ? typeof options.onRetry !== TYPEOF.FUNCTION : stryMutAct_9fa48("28991") ? false : stryMutAct_9fa48("28990") ? true : (stryCov_9fa48("28990", "28991", "28992"), typeof options.onRetry === TYPEOF.FUNCTION)) {
          if (stryMutAct_9fa48("28993")) {
            {}
          } else {
            stryCov_9fa48("28993");
            options.onRetry(stryMutAct_9fa48("28994") ? {} : (stryCov_9fa48("28994"), {
              attempt,
              maxAttempts,
              delayMs: effectiveDelayMs,
              readiness: lastReadiness
            }));
          }
        }
        await sleep(effectiveDelayMs);
        delayMs = stryMutAct_9fa48("28995") ? Math.max(Math.max(NUM.ONE, Math.floor(delayMs * backoffMultiplier)), maxDelayMs) : (stryCov_9fa48("28995"), Math.min(stryMutAct_9fa48("28996") ? Math.min(NUM.ONE, Math.floor(delayMs * backoffMultiplier)) : (stryCov_9fa48("28996"), Math.max(NUM.ONE, Math.floor(stryMutAct_9fa48("28997") ? delayMs / backoffMultiplier : (stryCov_9fa48("28997"), delayMs * backoffMultiplier)))), maxDelayMs));
      }
    }
    throw buildLocalQueryTransportNotReadyError(lastReadiness);
  }
}
export { LOCAL_QUERY_TRANSPORT_WAIT_DEFAULT, buildLocalQueryTransportNotReadyError, getLocalQueryTransportReadiness, isLocalQueryTransportReady, waitForLocalQueryTransportReadiness };