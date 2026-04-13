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
import { getControlPlaneRetryAfterMs, isRetryableControlPlaneError } from '../../control-plane/control-plane-error-classification.js';
import { NUM, TIME_MS, TYPEOF } from '../../constants/index.js';
const DEFAULT_RETRY_TIMEOUT_MS = stryMutAct_9fa48("30453") ? TIME_MS.SECOND / NUM.TWO : (stryCov_9fa48("30453"), TIME_MS.SECOND * NUM.TWO);
const DEFAULT_RETRY_BASE_DELAY_MS = NUM.HUNDRED;
const DEFAULT_RETRY_MAX_DELAY_MS = TIME_MS.SECOND;
async function defaultSleep(delayMs) {
  if (stryMutAct_9fa48("30454")) {
    {}
  } else {
    stryCov_9fa48("30454");
    await new Promise(stryMutAct_9fa48("30455") ? () => undefined : (stryCov_9fa48("30455"), resolve => setTimeout(resolve, delayMs)));
  }
}
function shouldRetryControlPlaneWrite(resultOrError, deadlineMs, now) {
  if (stryMutAct_9fa48("30456")) {
    {}
  } else {
    stryCov_9fa48("30456");
    if (stryMutAct_9fa48("30459") ? false : stryMutAct_9fa48("30458") ? true : stryMutAct_9fa48("30457") ? isRetryableControlPlaneError(resultOrError) : (stryCov_9fa48("30457", "30458", "30459"), !isRetryableControlPlaneError(resultOrError))) {
      if (stryMutAct_9fa48("30460")) {
        {}
      } else {
        stryCov_9fa48("30460");
        return stryMutAct_9fa48("30461") ? true : (stryCov_9fa48("30461"), false);
      }
    }
    return stryMutAct_9fa48("30465") ? now() >= deadlineMs : stryMutAct_9fa48("30464") ? now() <= deadlineMs : stryMutAct_9fa48("30463") ? false : stryMutAct_9fa48("30462") ? true : (stryCov_9fa48("30462", "30463", "30464", "30465"), now() < deadlineMs);
  }
}
async function delayRetryableControlPlaneWrite(deadlineMs, nextDelayMs, resultOrError, options = {}) {
  if (stryMutAct_9fa48("30466")) {
    {}
  } else {
    stryCov_9fa48("30466");
    const now = options.now;
    const remainingMs = stryMutAct_9fa48("30467") ? Math.min(NUM.ZERO, deadlineMs - now()) : (stryCov_9fa48("30467"), Math.max(NUM.ZERO, stryMutAct_9fa48("30468") ? deadlineMs + now() : (stryCov_9fa48("30468"), deadlineMs - now())));
    if (stryMutAct_9fa48("30472") ? remainingMs > NUM.ZERO : stryMutAct_9fa48("30471") ? remainingMs < NUM.ZERO : stryMutAct_9fa48("30470") ? false : stryMutAct_9fa48("30469") ? true : (stryCov_9fa48("30469", "30470", "30471", "30472"), remainingMs <= NUM.ZERO)) {
      if (stryMutAct_9fa48("30473")) {
        {}
      } else {
        stryCov_9fa48("30473");
        return nextDelayMs;
      }
    }
    const retryAfterMs = getControlPlaneRetryAfterMs(resultOrError);
    const baseDelayMs = options.baseDelayMs;
    const maxDelayMs = options.maxDelayMs;
    const boundedDelayMs = stryMutAct_9fa48("30474") ? Math.max(remainingMs, Math.min(maxDelayMs, Math.max(baseDelayMs, retryAfterMs > NUM.ZERO ? retryAfterMs : nextDelayMs))) : (stryCov_9fa48("30474"), Math.min(remainingMs, stryMutAct_9fa48("30475") ? Math.max(maxDelayMs, Math.max(baseDelayMs, retryAfterMs > NUM.ZERO ? retryAfterMs : nextDelayMs)) : (stryCov_9fa48("30475"), Math.min(maxDelayMs, stryMutAct_9fa48("30476") ? Math.min(baseDelayMs, retryAfterMs > NUM.ZERO ? retryAfterMs : nextDelayMs) : (stryCov_9fa48("30476"), Math.max(baseDelayMs, (stryMutAct_9fa48("30480") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("30479") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("30478") ? false : stryMutAct_9fa48("30477") ? true : (stryCov_9fa48("30477", "30478", "30479", "30480"), retryAfterMs > NUM.ZERO)) ? retryAfterMs : nextDelayMs))))));
    if (stryMutAct_9fa48("30483") ? typeof options.onRetry !== TYPEOF.FUNCTION : stryMutAct_9fa48("30482") ? false : stryMutAct_9fa48("30481") ? true : (stryCov_9fa48("30481", "30482", "30483"), typeof options.onRetry === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("30484")) {
        {}
      } else {
        stryCov_9fa48("30484");
        options.onRetry(stryMutAct_9fa48("30485") ? {} : (stryCov_9fa48("30485"), {
          attempt: options.attempt,
          delayMs: boundedDelayMs,
          remainingMs,
          retryAfterMs: (stryMutAct_9fa48("30489") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("30488") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("30487") ? false : stryMutAct_9fa48("30486") ? true : (stryCov_9fa48("30486", "30487", "30488", "30489"), retryAfterMs > NUM.ZERO)) ? retryAfterMs : null,
          resultOrError
        }));
      }
    }
    await options.sleep(boundedDelayMs);
    return stryMutAct_9fa48("30490") ? Math.max(maxDelayMs, Math.max(baseDelayMs, nextDelayMs * NUM.TWO)) : (stryCov_9fa48("30490"), Math.min(maxDelayMs, stryMutAct_9fa48("30491") ? Math.min(baseDelayMs, nextDelayMs * NUM.TWO) : (stryCov_9fa48("30491"), Math.max(baseDelayMs, stryMutAct_9fa48("30492") ? nextDelayMs / NUM.TWO : (stryCov_9fa48("30492"), nextDelayMs * NUM.TWO)))));
  }
}
async function runRetryableControlPlaneWrite(executor, options = {}) {
  if (stryMutAct_9fa48("30493")) {
    {}
  } else {
    stryCov_9fa48("30493");
    const now = (stryMutAct_9fa48("30496") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("30495") ? false : stryMutAct_9fa48("30494") ? true : (stryCov_9fa48("30494", "30495", "30496"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : Date.now;
    const sleep = (stryMutAct_9fa48("30499") ? typeof options.sleep !== TYPEOF.FUNCTION : stryMutAct_9fa48("30498") ? false : stryMutAct_9fa48("30497") ? true : (stryCov_9fa48("30497", "30498", "30499"), typeof options.sleep === TYPEOF.FUNCTION)) ? options.sleep : defaultSleep;
    const timeoutMs = (stryMutAct_9fa48("30502") ? Number.isFinite(options.timeoutMs) || options.timeoutMs >= NUM.ZERO : stryMutAct_9fa48("30501") ? false : stryMutAct_9fa48("30500") ? true : (stryCov_9fa48("30500", "30501", "30502"), Number.isFinite(options.timeoutMs) && (stryMutAct_9fa48("30505") ? options.timeoutMs < NUM.ZERO : stryMutAct_9fa48("30504") ? options.timeoutMs > NUM.ZERO : stryMutAct_9fa48("30503") ? true : (stryCov_9fa48("30503", "30504", "30505"), options.timeoutMs >= NUM.ZERO)))) ? Math.floor(options.timeoutMs) : DEFAULT_RETRY_TIMEOUT_MS;
    const baseDelayMs = (stryMutAct_9fa48("30508") ? Number.isFinite(options.baseDelayMs) || options.baseDelayMs > NUM.ZERO : stryMutAct_9fa48("30507") ? false : stryMutAct_9fa48("30506") ? true : (stryCov_9fa48("30506", "30507", "30508"), Number.isFinite(options.baseDelayMs) && (stryMutAct_9fa48("30511") ? options.baseDelayMs <= NUM.ZERO : stryMutAct_9fa48("30510") ? options.baseDelayMs >= NUM.ZERO : stryMutAct_9fa48("30509") ? true : (stryCov_9fa48("30509", "30510", "30511"), options.baseDelayMs > NUM.ZERO)))) ? Math.floor(options.baseDelayMs) : DEFAULT_RETRY_BASE_DELAY_MS;
    const maxDelayMs = (stryMutAct_9fa48("30514") ? Number.isFinite(options.maxDelayMs) || options.maxDelayMs > NUM.ZERO : stryMutAct_9fa48("30513") ? false : stryMutAct_9fa48("30512") ? true : (stryCov_9fa48("30512", "30513", "30514"), Number.isFinite(options.maxDelayMs) && (stryMutAct_9fa48("30517") ? options.maxDelayMs <= NUM.ZERO : stryMutAct_9fa48("30516") ? options.maxDelayMs >= NUM.ZERO : stryMutAct_9fa48("30515") ? true : (stryCov_9fa48("30515", "30516", "30517"), options.maxDelayMs > NUM.ZERO)))) ? Math.floor(options.maxDelayMs) : DEFAULT_RETRY_MAX_DELAY_MS;
    const deadlineMs = stryMutAct_9fa48("30518") ? now() - timeoutMs : (stryCov_9fa48("30518"), now() + timeoutMs);
    let nextDelayMs = baseDelayMs;
    let attempt = NUM.ZERO;
    while (stryMutAct_9fa48("30520") ? false : stryMutAct_9fa48("30519") ? false : (stryCov_9fa48("30519", "30520"), true)) {
      if (stryMutAct_9fa48("30521")) {
        {}
      } else {
        stryCov_9fa48("30521");
        stryMutAct_9fa48("30522") ? attempt -= NUM.ONE : (stryCov_9fa48("30522"), attempt += NUM.ONE);
        try {
          if (stryMutAct_9fa48("30523")) {
            {}
          } else {
            stryCov_9fa48("30523");
            const result = await executor();
            if (stryMutAct_9fa48("30526") ? result?.success === false : stryMutAct_9fa48("30525") ? false : stryMutAct_9fa48("30524") ? true : (stryCov_9fa48("30524", "30525", "30526"), (stryMutAct_9fa48("30527") ? result.success : (stryCov_9fa48("30527"), result?.success)) !== (stryMutAct_9fa48("30528") ? true : (stryCov_9fa48("30528"), false)))) {
              if (stryMutAct_9fa48("30529")) {
                {}
              } else {
                stryCov_9fa48("30529");
                return result;
              }
            }
            if (stryMutAct_9fa48("30532") ? false : stryMutAct_9fa48("30531") ? true : stryMutAct_9fa48("30530") ? shouldRetryControlPlaneWrite(result, deadlineMs, now) : (stryCov_9fa48("30530", "30531", "30532"), !shouldRetryControlPlaneWrite(result, deadlineMs, now))) {
              if (stryMutAct_9fa48("30533")) {
                {}
              } else {
                stryCov_9fa48("30533");
                return result;
              }
            }
            nextDelayMs = await delayRetryableControlPlaneWrite(deadlineMs, nextDelayMs, result, stryMutAct_9fa48("30534") ? {} : (stryCov_9fa48("30534"), {
              attempt,
              baseDelayMs,
              maxDelayMs,
              now,
              onRetry: options.onRetry,
              sleep
            }));
            continue;
          }
        } catch (error) {
          if (stryMutAct_9fa48("30535")) {
            {}
          } else {
            stryCov_9fa48("30535");
            if (stryMutAct_9fa48("30538") ? false : stryMutAct_9fa48("30537") ? true : stryMutAct_9fa48("30536") ? shouldRetryControlPlaneWrite(error, deadlineMs, now) : (stryCov_9fa48("30536", "30537", "30538"), !shouldRetryControlPlaneWrite(error, deadlineMs, now))) {
              if (stryMutAct_9fa48("30539")) {
                {}
              } else {
                stryCov_9fa48("30539");
                throw error;
              }
            }
            nextDelayMs = await delayRetryableControlPlaneWrite(deadlineMs, nextDelayMs, error, stryMutAct_9fa48("30540") ? {} : (stryCov_9fa48("30540"), {
              attempt,
              baseDelayMs,
              maxDelayMs,
              now,
              onRetry: options.onRetry,
              sleep
            }));
          }
        }
      }
    }
  }
}
export { runRetryableControlPlaneWrite };