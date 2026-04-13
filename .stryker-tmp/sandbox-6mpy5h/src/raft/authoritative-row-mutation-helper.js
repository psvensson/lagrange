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
import { TIME_MS, TYPEOF } from '../constants/index.js';
import { CONTROL_PLANE_MUTATION_OPERATION, CONTROL_PLANE_MUTATION_OUTCOME } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
const CACHE_VISIBILITY_ERROR_FRAGMENT = stryMutAct_9fa48("126455") ? "" : (stryCov_9fa48("126455"), 'Cache update not observed');
const AUTHORITATIVE_ROW_MUTATION_REASON = Object.freeze(stryMutAct_9fa48("126456") ? {} : (stryCov_9fa48("126456"), {
  APPLIED: stryMutAct_9fa48("126457") ? "" : (stryCov_9fa48("126457"), 'applied'),
  AUTHORITATIVE_WRITE_FAILED: stryMutAct_9fa48("126458") ? "" : (stryCov_9fa48("126458"), 'authoritative-write-failed'),
  CACHE_VISIBILITY_GAP_RECOVERED: stryMutAct_9fa48("126459") ? "" : (stryCov_9fa48("126459"), 'cache-visibility-gap-recovered'),
  CACHE_VISIBILITY_GAP_UNRECOVERED: stryMutAct_9fa48("126460") ? "" : (stryCov_9fa48("126460"), 'cache-visibility-gap-unrecovered'),
  DEFERRED: stryMutAct_9fa48("126461") ? "" : (stryCov_9fa48("126461"), 'deferred'),
  IN_FLIGHT: stryMutAct_9fa48("126462") ? "" : (stryCov_9fa48("126462"), 'in-flight'),
  NOOP: stryMutAct_9fa48("126463") ? "" : (stryCov_9fa48("126463"), 'noop'),
  OBSERVED_STATE_CHANGED: stryMutAct_9fa48("126464") ? "" : (stryCov_9fa48("126464"), 'observed-state-changed'),
  OWNER_NOT_READY: stryMutAct_9fa48("126465") ? "" : (stryCov_9fa48("126465"), 'owner-not-ready'),
  REJECTED: stryMutAct_9fa48("126466") ? "" : (stryCov_9fa48("126466"), 'rejected'),
  SKIPPED: stryMutAct_9fa48("126467") ? "" : (stryCov_9fa48("126467"), 'skipped')
}));
const AUTHORITATIVE_ROW_MUTATION_ERROR_MSG = Object.freeze(stryMutAct_9fa48("126468") ? {} : (stryCov_9fa48("126468"), {
  MISSING_BUILD_UPDATE_DATA: stryMutAct_9fa48("126469") ? "" : (stryCov_9fa48("126469"), 'AuthoritativeRowMutationHelper requires buildUpdateData'),
  MISSING_BUILD_WHERE_CLAUSE: stryMutAct_9fa48("126470") ? "" : (stryCov_9fa48("126470"), 'AuthoritativeRowMutationHelper requires buildWhereClause'),
  MISSING_READ_VALUE_FROM_CACHE: stryMutAct_9fa48("126471") ? "" : (stryCov_9fa48("126471"), 'AuthoritativeRowMutationHelper requires readValueFromCache'),
  MISSING_TABLE_NAME: stryMutAct_9fa48("126472") ? "" : (stryCov_9fa48("126472"), 'AuthoritativeRowMutationHelper requires tableName')
}));
const AUTHORITATIVE_ROW_MUTATION_RETRY = Object.freeze(stryMutAct_9fa48("126473") ? {} : (stryCov_9fa48("126473"), {
  BACKOFF_MULTIPLIER: 2,
  MAX_DELAY_MS: stryMutAct_9fa48("126474") ? TIME_MS.SECOND / 30 : (stryCov_9fa48("126474"), TIME_MS.SECOND * 30)
}));
function extractAffectedRows(result) {
  if (stryMutAct_9fa48("126475")) {
    {}
  } else {
    stryCov_9fa48("126475");
    const candidate = Number(stryMutAct_9fa48("126476") ? result?.partitionResult?.affectedRows && result?.affectedRows : (stryCov_9fa48("126476"), (stryMutAct_9fa48("126478") ? result.partitionResult?.affectedRows : stryMutAct_9fa48("126477") ? result?.partitionResult.affectedRows : (stryCov_9fa48("126477", "126478"), result?.partitionResult?.affectedRows)) ?? (stryMutAct_9fa48("126479") ? result.affectedRows : (stryCov_9fa48("126479"), result?.affectedRows))));
    return Number.isFinite(candidate) ? candidate : null;
  }
}
function classifyMutationFailure(error) {
  if (stryMutAct_9fa48("126480")) {
    {}
  } else {
    stryCov_9fa48("126480");
    const message = stryMutAct_9fa48("126483") ? error?.message && '' : stryMutAct_9fa48("126482") ? false : stryMutAct_9fa48("126481") ? true : (stryCov_9fa48("126481", "126482", "126483"), (stryMutAct_9fa48("126484") ? error.message : (stryCov_9fa48("126484"), error?.message)) || (stryMutAct_9fa48("126485") ? "Stryker was here!" : (stryCov_9fa48("126485"), '')));
    if (stryMutAct_9fa48("126487") ? false : stryMutAct_9fa48("126486") ? true : (stryCov_9fa48("126486", "126487"), message.includes(CACHE_VISIBILITY_ERROR_FRAGMENT))) {
      if (stryMutAct_9fa48("126488")) {
        {}
      } else {
        stryCov_9fa48("126488");
        return AUTHORITATIVE_ROW_MUTATION_REASON.CACHE_VISIBILITY_GAP_UNRECOVERED;
      }
    }
    return AUTHORITATIVE_ROW_MUTATION_REASON.AUTHORITATIVE_WRITE_FAILED;
  }
}
function classifyGatewayMutationOutcome(result) {
  if (stryMutAct_9fa48("126489")) {
    {}
  } else {
    stryCov_9fa48("126489");
    if (stryMutAct_9fa48("126492") ? result?.outcome !== CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED : stryMutAct_9fa48("126491") ? false : stryMutAct_9fa48("126490") ? true : (stryCov_9fa48("126490", "126491", "126492"), (stryMutAct_9fa48("126493") ? result.outcome : (stryCov_9fa48("126493"), result?.outcome)) === CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED)) {
      if (stryMutAct_9fa48("126494")) {
        {}
      } else {
        stryCov_9fa48("126494");
        return AUTHORITATIVE_ROW_MUTATION_REASON.DEFERRED;
      }
    }
    if (stryMutAct_9fa48("126497") ? result?.outcome !== CONTROL_PLANE_MUTATION_OUTCOME.REJECTED : stryMutAct_9fa48("126496") ? false : stryMutAct_9fa48("126495") ? true : (stryCov_9fa48("126495", "126496", "126497"), (stryMutAct_9fa48("126498") ? result.outcome : (stryCov_9fa48("126498"), result?.outcome)) === CONTROL_PLANE_MUTATION_OUTCOME.REJECTED)) {
      if (stryMutAct_9fa48("126499")) {
        {}
      } else {
        stryCov_9fa48("126499");
        return AUTHORITATIVE_ROW_MUTATION_REASON.REJECTED;
      }
    }
    if (stryMutAct_9fa48("126502") ? result?.outcome !== CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY : stryMutAct_9fa48("126501") ? false : stryMutAct_9fa48("126500") ? true : (stryCov_9fa48("126500", "126501", "126502"), (stryMutAct_9fa48("126503") ? result.outcome : (stryCov_9fa48("126503"), result?.outcome)) === CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY)) {
      if (stryMutAct_9fa48("126504")) {
        {}
      } else {
        stryCov_9fa48("126504");
        return AUTHORITATIVE_ROW_MUTATION_REASON.OWNER_NOT_READY;
      }
    }
    if (stryMutAct_9fa48("126507") ? result?.outcome !== CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED : stryMutAct_9fa48("126506") ? false : stryMutAct_9fa48("126505") ? true : (stryCov_9fa48("126505", "126506", "126507"), (stryMutAct_9fa48("126508") ? result.outcome : (stryCov_9fa48("126508"), result?.outcome)) === CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED)) {
      if (stryMutAct_9fa48("126509")) {
        {}
      } else {
        stryCov_9fa48("126509");
        return AUTHORITATIVE_ROW_MUTATION_REASON.OBSERVED_STATE_CHANGED;
      }
    }
    return null;
  }
}
class AuthoritativeRowMutationHelper {
  constructor(options = {}) {
    if (stryMutAct_9fa48("126510")) {
      {}
    } else {
      stryCov_9fa48("126510");
      const {
        tableName,
        buildWhereClause,
        buildUpdateData,
        buildUpdateOptions = stryMutAct_9fa48("126511") ? () => undefined : (stryCov_9fa48("126511"), () => ({})),
        readValueFromCache,
        readRowFromCache = null,
        buildExpectedCacheFields = null,
        isWriteReady = stryMutAct_9fa48("126512") ? () => undefined : (stryCov_9fa48("126512"), () => stryMutAct_9fa48("126513") ? false : (stryCov_9fa48("126513"), true)),
        prepareFlush = stryMutAct_9fa48("126514") ? () => undefined : (stryCov_9fa48("126514"), () => stryMutAct_9fa48("126515") ? {} : (stryCov_9fa48("126515"), {
          skip: stryMutAct_9fa48("126516") ? true : (stryCov_9fa48("126516"), false)
        })),
        retryDelayMs = TIME_MS.SECOND,
        retryBackoffMultiplier = AUTHORITATIVE_ROW_MUTATION_RETRY.BACKOFF_MULTIPLIER,
        maxRetryDelayMs = AUTHORITATIVE_ROW_MUTATION_RETRY.MAX_DELAY_MS,
        cdcIntegrationService = null,
        controlPlaneSystemTableGateway = null,
        nodeId = null,
        messageRouter = null,
        systemTableCache = null,
        onAsyncError = () => {},
        now = stryMutAct_9fa48("126517") ? () => undefined : (stryCov_9fa48("126517"), () => Date.now()),
        setTimeoutFn = setTimeout,
        clearTimeoutFn = clearTimeout
      } = options;
      if (stryMutAct_9fa48("126520") ? false : stryMutAct_9fa48("126519") ? true : stryMutAct_9fa48("126518") ? tableName : (stryCov_9fa48("126518", "126519", "126520"), !tableName)) {
        if (stryMutAct_9fa48("126521")) {
          {}
        } else {
          stryCov_9fa48("126521");
          throw new Error(AUTHORITATIVE_ROW_MUTATION_ERROR_MSG.MISSING_TABLE_NAME);
        }
      }
      if (stryMutAct_9fa48("126524") ? typeof buildWhereClause === TYPEOF.FUNCTION : stryMutAct_9fa48("126523") ? false : stryMutAct_9fa48("126522") ? true : (stryCov_9fa48("126522", "126523", "126524"), typeof buildWhereClause !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("126525")) {
          {}
        } else {
          stryCov_9fa48("126525");
          throw new Error(AUTHORITATIVE_ROW_MUTATION_ERROR_MSG.MISSING_BUILD_WHERE_CLAUSE);
        }
      }
      if (stryMutAct_9fa48("126528") ? typeof buildUpdateData === TYPEOF.FUNCTION : stryMutAct_9fa48("126527") ? false : stryMutAct_9fa48("126526") ? true : (stryCov_9fa48("126526", "126527", "126528"), typeof buildUpdateData !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("126529")) {
          {}
        } else {
          stryCov_9fa48("126529");
          throw new Error(AUTHORITATIVE_ROW_MUTATION_ERROR_MSG.MISSING_BUILD_UPDATE_DATA);
        }
      }
      if (stryMutAct_9fa48("126532") ? typeof readValueFromCache === TYPEOF.FUNCTION : stryMutAct_9fa48("126531") ? false : stryMutAct_9fa48("126530") ? true : (stryCov_9fa48("126530", "126531", "126532"), typeof readValueFromCache !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("126533")) {
          {}
        } else {
          stryCov_9fa48("126533");
          throw new Error(AUTHORITATIVE_ROW_MUTATION_ERROR_MSG.MISSING_READ_VALUE_FROM_CACHE);
        }
      }
      this.tableName = tableName;
      this.buildWhereClause = buildWhereClause;
      this.buildUpdateData = buildUpdateData;
      this.buildUpdateOptions = buildUpdateOptions;
      this.readValueFromCache = readValueFromCache;
      this.readRowFromCache = readRowFromCache;
      this.buildExpectedCacheFields = buildExpectedCacheFields;
      this.isWriteReady = isWriteReady;
      this.prepareFlush = prepareFlush;
      this.retryDelayMs = retryDelayMs;
      this.retryBackoffMultiplier = (stryMutAct_9fa48("126536") ? Number.isFinite(retryBackoffMultiplier) || retryBackoffMultiplier >= 1 : stryMutAct_9fa48("126535") ? false : stryMutAct_9fa48("126534") ? true : (stryCov_9fa48("126534", "126535", "126536"), Number.isFinite(retryBackoffMultiplier) && (stryMutAct_9fa48("126539") ? retryBackoffMultiplier < 1 : stryMutAct_9fa48("126538") ? retryBackoffMultiplier > 1 : stryMutAct_9fa48("126537") ? true : (stryCov_9fa48("126537", "126538", "126539"), retryBackoffMultiplier >= 1)))) ? retryBackoffMultiplier : AUTHORITATIVE_ROW_MUTATION_RETRY.BACKOFF_MULTIPLIER;
      this.maxRetryDelayMs = (stryMutAct_9fa48("126542") ? Number.isFinite(maxRetryDelayMs) || maxRetryDelayMs > 0 : stryMutAct_9fa48("126541") ? false : stryMutAct_9fa48("126540") ? true : (stryCov_9fa48("126540", "126541", "126542"), Number.isFinite(maxRetryDelayMs) && (stryMutAct_9fa48("126545") ? maxRetryDelayMs <= 0 : stryMutAct_9fa48("126544") ? maxRetryDelayMs >= 0 : stryMutAct_9fa48("126543") ? true : (stryCov_9fa48("126543", "126544", "126545"), maxRetryDelayMs > 0)))) ? Math.floor(maxRetryDelayMs) : AUTHORITATIVE_ROW_MUTATION_RETRY.MAX_DELAY_MS;
      this.cdcIntegrationService = cdcIntegrationService;
      this.controlPlaneSystemTableGateway = controlPlaneSystemTableGateway;
      this.nodeId = nodeId;
      this.messageRouter = messageRouter;
      this.systemTableCache = systemTableCache;
      this.onAsyncError = onAsyncError;
      this.now = now;
      this.setTimeoutFn = setTimeoutFn;
      this.clearTimeoutFn = clearTimeoutFn;
      this.pendingValue = null;
      this.persistedValue = null;
      this.inFlight = stryMutAct_9fa48("126546") ? true : (stryCov_9fa48("126546"), false);
      this.retryTimer = null;
      this.retryAttemptCount = 0;
      this.followUpFlushScheduled = stryMutAct_9fa48("126547") ? true : (stryCov_9fa48("126547"), false);
      this.shuttingDown = stryMutAct_9fa48("126548") ? true : (stryCov_9fa48("126548"), false);
    }
  }
  setSystemTableCache(systemTableCache) {
    if (stryMutAct_9fa48("126549")) {
      {}
    } else {
      stryCov_9fa48("126549");
      this.systemTableCache = systemTableCache;
    }
  }
  setCdcIntegrationService(cdcIntegrationService) {
    if (stryMutAct_9fa48("126550")) {
      {}
    } else {
      stryCov_9fa48("126550");
      this.cdcIntegrationService = cdcIntegrationService;
    }
  }
  setControlPlaneSystemTableGateway(controlPlaneSystemTableGateway) {
    if (stryMutAct_9fa48("126551")) {
      {}
    } else {
      stryCov_9fa48("126551");
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("126554") ? controlPlaneSystemTableGateway && null : stryMutAct_9fa48("126553") ? false : stryMutAct_9fa48("126552") ? true : (stryCov_9fa48("126552", "126553", "126554"), controlPlaneSystemTableGateway || null);
    }
  }
  queue(value) {
    if (stryMutAct_9fa48("126555")) {
      {}
    } else {
      stryCov_9fa48("126555");
      if (stryMutAct_9fa48("126557") ? false : stryMutAct_9fa48("126556") ? true : (stryCov_9fa48("126556", "126557"), this.shuttingDown)) {
        if (stryMutAct_9fa48("126558")) {
          {}
        } else {
          stryCov_9fa48("126558");
          return;
        }
      }
      if (stryMutAct_9fa48("126561") ? !value && value === this.persistedValue : stryMutAct_9fa48("126560") ? false : stryMutAct_9fa48("126559") ? true : (stryCov_9fa48("126559", "126560", "126561"), (stryMutAct_9fa48("126562") ? value : (stryCov_9fa48("126562"), !value)) || (stryMutAct_9fa48("126564") ? value !== this.persistedValue : stryMutAct_9fa48("126563") ? false : (stryCov_9fa48("126563", "126564"), value === this.persistedValue)))) {
        if (stryMutAct_9fa48("126565")) {
          {}
        } else {
          stryCov_9fa48("126565");
          return;
        }
      }
      this.pendingValue = value;
      if (stryMutAct_9fa48("126568") ? false : stryMutAct_9fa48("126567") ? true : stryMutAct_9fa48("126566") ? this.cdcIntegrationService : (stryCov_9fa48("126566", "126567", "126568"), !this.cdcIntegrationService)) {
        if (stryMutAct_9fa48("126569")) {
          {}
        } else {
          stryCov_9fa48("126569");
          return;
        }
      }
      if (stryMutAct_9fa48("126571") ? false : stryMutAct_9fa48("126570") ? true : (stryCov_9fa48("126570", "126571"), this.inFlight)) {
        if (stryMutAct_9fa48("126572")) {
          {}
        } else {
          stryCov_9fa48("126572");
          this.scheduleFollowUpFlush();
          return;
        }
      }
      this.flush().catch(error => {
        if (stryMutAct_9fa48("126573")) {
          {}
        } else {
          stryCov_9fa48("126573");
          this.onAsyncError(error, stryMutAct_9fa48("126574") ? {} : (stryCov_9fa48("126574"), {
            value,
            retry: stryMutAct_9fa48("126575") ? true : (stryCov_9fa48("126575"), false)
          }));
        }
      });
    }
  }
  syncFromCache() {
    if (stryMutAct_9fa48("126576")) {
      {}
    } else {
      stryCov_9fa48("126576");
      const cachedValue = this.readValueFromCache(this.systemTableCache);
      if (stryMutAct_9fa48("126579") ? false : stryMutAct_9fa48("126578") ? true : stryMutAct_9fa48("126577") ? cachedValue : (stryCov_9fa48("126577", "126578", "126579"), !cachedValue)) {
        if (stryMutAct_9fa48("126580")) {
          {}
        } else {
          stryCov_9fa48("126580");
          return stryMutAct_9fa48("126581") ? true : (stryCov_9fa48("126581"), false);
        }
      }
      this.persistedValue = cachedValue;
      if (stryMutAct_9fa48("126584") ? this.pendingValue !== cachedValue : stryMutAct_9fa48("126583") ? false : stryMutAct_9fa48("126582") ? true : (stryCov_9fa48("126582", "126583", "126584"), this.pendingValue === cachedValue)) {
        if (stryMutAct_9fa48("126585")) {
          {}
        } else {
          stryCov_9fa48("126585");
          this.pendingValue = null;
          return stryMutAct_9fa48("126586") ? false : (stryCov_9fa48("126586"), true);
        }
      }
      return stryMutAct_9fa48("126587") ? true : (stryCov_9fa48("126587"), false);
    }
  }
  async flush() {
    if (stryMutAct_9fa48("126588")) {
      {}
    } else {
      stryCov_9fa48("126588");
      if (stryMutAct_9fa48("126590") ? false : stryMutAct_9fa48("126589") ? true : (stryCov_9fa48("126589", "126590"), this.shuttingDown)) {
        if (stryMutAct_9fa48("126591")) {
          {}
        } else {
          stryCov_9fa48("126591");
          return this.buildResult(stryMutAct_9fa48("126592") ? {} : (stryCov_9fa48("126592"), {
            cacheVisible: stryMutAct_9fa48("126595") ? this.pendingValue !== null : stryMutAct_9fa48("126594") ? false : stryMutAct_9fa48("126593") ? true : (stryCov_9fa48("126593", "126594", "126595"), this.pendingValue === null),
            reason: AUTHORITATIVE_ROW_MUTATION_REASON.SKIPPED
          }));
        }
      }
      if (stryMutAct_9fa48("126597") ? false : stryMutAct_9fa48("126596") ? true : (stryCov_9fa48("126596", "126597"), this.inFlight)) {
        if (stryMutAct_9fa48("126598")) {
          {}
        } else {
          stryCov_9fa48("126598");
          return this.buildResult(stryMutAct_9fa48("126599") ? {} : (stryCov_9fa48("126599"), {
            reason: AUTHORITATIVE_ROW_MUTATION_REASON.IN_FLIGHT
          }));
        }
      }
      const recoveredFromCacheGap = this.syncFromCache();
      const prepareResult = stryMutAct_9fa48("126602") ? this.prepareFlush({
        pendingValue: this.pendingValue,
        persistedValue: this.persistedValue
      }) && {
        skip: false
      } : stryMutAct_9fa48("126601") ? false : stryMutAct_9fa48("126600") ? true : (stryCov_9fa48("126600", "126601", "126602"), this.prepareFlush(stryMutAct_9fa48("126603") ? {} : (stryCov_9fa48("126603"), {
        pendingValue: this.pendingValue,
        persistedValue: this.persistedValue
      })) || (stryMutAct_9fa48("126604") ? {} : (stryCov_9fa48("126604"), {
        skip: stryMutAct_9fa48("126605") ? true : (stryCov_9fa48("126605"), false)
      })));
      if (stryMutAct_9fa48("126607") ? false : stryMutAct_9fa48("126606") ? true : (stryCov_9fa48("126606", "126607"), prepareResult.clearPending)) {
        if (stryMutAct_9fa48("126608")) {
          {}
        } else {
          stryCov_9fa48("126608");
          this.pendingValue = null;
        }
      }
      if (stryMutAct_9fa48("126610") ? false : stryMutAct_9fa48("126609") ? true : (stryCov_9fa48("126609", "126610"), prepareResult.skip)) {
        if (stryMutAct_9fa48("126611")) {
          {}
        } else {
          stryCov_9fa48("126611");
          if (stryMutAct_9fa48("126614") ? !prepareResult.clearPending || prepareResult.retry === true : stryMutAct_9fa48("126613") ? false : stryMutAct_9fa48("126612") ? true : (stryCov_9fa48("126612", "126613", "126614"), (stryMutAct_9fa48("126615") ? prepareResult.clearPending : (stryCov_9fa48("126615"), !prepareResult.clearPending)) && (stryMutAct_9fa48("126617") ? prepareResult.retry !== true : stryMutAct_9fa48("126616") ? true : (stryCov_9fa48("126616", "126617"), prepareResult.retry === (stryMutAct_9fa48("126618") ? false : (stryCov_9fa48("126618"), true)))))) {
            if (stryMutAct_9fa48("126619")) {
              {}
            } else {
              stryCov_9fa48("126619");
              this.scheduleRetry(prepareResult.retryDelayMs);
            }
          }
          return this.buildResult(stryMutAct_9fa48("126620") ? {} : (stryCov_9fa48("126620"), {
            cacheVisible: stryMutAct_9fa48("126623") ? this.pendingValue !== null : stryMutAct_9fa48("126622") ? false : stryMutAct_9fa48("126621") ? true : (stryCov_9fa48("126621", "126622", "126623"), this.pendingValue === null),
            recoveredFromCacheGap,
            reason: stryMutAct_9fa48("126626") ? prepareResult.reason && AUTHORITATIVE_ROW_MUTATION_REASON.SKIPPED : stryMutAct_9fa48("126625") ? false : stryMutAct_9fa48("126624") ? true : (stryCov_9fa48("126624", "126625", "126626"), prepareResult.reason || AUTHORITATIVE_ROW_MUTATION_REASON.SKIPPED)
          }));
        }
      }
      if (stryMutAct_9fa48("126629") ? (!this.cdcIntegrationService || !this.pendingValue) && this.pendingValue === this.persistedValue : stryMutAct_9fa48("126628") ? false : stryMutAct_9fa48("126627") ? true : (stryCov_9fa48("126627", "126628", "126629"), (stryMutAct_9fa48("126631") ? !this.cdcIntegrationService && !this.pendingValue : stryMutAct_9fa48("126630") ? false : (stryCov_9fa48("126630", "126631"), (stryMutAct_9fa48("126632") ? this.cdcIntegrationService : (stryCov_9fa48("126632"), !this.cdcIntegrationService)) || (stryMutAct_9fa48("126633") ? this.pendingValue : (stryCov_9fa48("126633"), !this.pendingValue)))) || (stryMutAct_9fa48("126635") ? this.pendingValue !== this.persistedValue : stryMutAct_9fa48("126634") ? false : (stryCov_9fa48("126634", "126635"), this.pendingValue === this.persistedValue)))) {
        if (stryMutAct_9fa48("126636")) {
          {}
        } else {
          stryCov_9fa48("126636");
          if (stryMutAct_9fa48("126639") ? this.pendingValue === null && this.pendingValue === this.persistedValue : stryMutAct_9fa48("126638") ? false : stryMutAct_9fa48("126637") ? true : (stryCov_9fa48("126637", "126638", "126639"), (stryMutAct_9fa48("126641") ? this.pendingValue !== null : stryMutAct_9fa48("126640") ? false : (stryCov_9fa48("126640", "126641"), this.pendingValue === null)) || (stryMutAct_9fa48("126643") ? this.pendingValue !== this.persistedValue : stryMutAct_9fa48("126642") ? false : (stryCov_9fa48("126642", "126643"), this.pendingValue === this.persistedValue)))) {
            if (stryMutAct_9fa48("126644")) {
              {}
            } else {
              stryCov_9fa48("126644");
              this.retryAttemptCount = 0;
            }
          }
          return this.buildResult(stryMutAct_9fa48("126645") ? {} : (stryCov_9fa48("126645"), {
            cacheVisible: stryMutAct_9fa48("126648") ? this.pendingValue !== null : stryMutAct_9fa48("126647") ? false : stryMutAct_9fa48("126646") ? true : (stryCov_9fa48("126646", "126647", "126648"), this.pendingValue === null),
            recoveredFromCacheGap,
            reason: recoveredFromCacheGap ? AUTHORITATIVE_ROW_MUTATION_REASON.CACHE_VISIBILITY_GAP_RECOVERED : AUTHORITATIVE_ROW_MUTATION_REASON.NOOP
          }));
        }
      }
      if (stryMutAct_9fa48("126651") ? false : stryMutAct_9fa48("126650") ? true : stryMutAct_9fa48("126649") ? this.isWriteReady() : (stryCov_9fa48("126649", "126650", "126651"), !this.isWriteReady())) {
        if (stryMutAct_9fa48("126652")) {
          {}
        } else {
          stryCov_9fa48("126652");
          this.scheduleRetry();
          return this.buildResult(stryMutAct_9fa48("126653") ? {} : (stryCov_9fa48("126653"), {
            recoveredFromCacheGap,
            reason: AUTHORITATIVE_ROW_MUTATION_REASON.OWNER_NOT_READY
          }));
        }
      }
      this.inFlight = stryMutAct_9fa48("126654") ? false : (stryCov_9fa48("126654"), true);
      let writeSucceeded = stryMutAct_9fa48("126655") ? true : (stryCov_9fa48("126655"), false);
      const value = this.pendingValue;
      const updateData = this.buildUpdateData(value, this.now());
      const cachedRow = (stryMutAct_9fa48("126658") ? typeof this.readRowFromCache !== TYPEOF.FUNCTION : stryMutAct_9fa48("126657") ? false : stryMutAct_9fa48("126656") ? true : (stryCov_9fa48("126656", "126657", "126658"), typeof this.readRowFromCache === TYPEOF.FUNCTION)) ? this.readRowFromCache(this.systemTableCache) : null;
      const mutationContext = stryMutAct_9fa48("126659") ? {} : (stryCov_9fa48("126659"), {
        cachedRow,
        persistedValue: this.persistedValue
      });
      const whereClause = this.buildWhereClause(value, mutationContext);
      const updateOptionsCandidate = (stryMutAct_9fa48("126662") ? typeof this.buildUpdateOptions !== TYPEOF.FUNCTION : stryMutAct_9fa48("126661") ? false : stryMutAct_9fa48("126660") ? true : (stryCov_9fa48("126660", "126661", "126662"), typeof this.buildUpdateOptions === TYPEOF.FUNCTION)) ? this.buildUpdateOptions(value, updateData, mutationContext) : null;
      const updateOptions = (stryMutAct_9fa48("126665") ? updateOptionsCandidate || typeof updateOptionsCandidate === TYPEOF.OBJECT : stryMutAct_9fa48("126664") ? false : stryMutAct_9fa48("126663") ? true : (stryCov_9fa48("126663", "126664", "126665"), updateOptionsCandidate && (stryMutAct_9fa48("126667") ? typeof updateOptionsCandidate !== TYPEOF.OBJECT : stryMutAct_9fa48("126666") ? true : (stryCov_9fa48("126666", "126667"), typeof updateOptionsCandidate === TYPEOF.OBJECT)))) ? updateOptionsCandidate : {};
      const expectedCacheFields = (stryMutAct_9fa48("126670") ? typeof this.buildExpectedCacheFields !== TYPEOF.FUNCTION : stryMutAct_9fa48("126669") ? false : stryMutAct_9fa48("126668") ? true : (stryCov_9fa48("126668", "126669", "126670"), typeof this.buildExpectedCacheFields === TYPEOF.FUNCTION)) ? this.buildExpectedCacheFields(value, updateData) : null;
      const writeOptions = stryMutAct_9fa48("126671") ? {} : (stryCov_9fa48("126671"), {
        ...updateOptions,
        ...(expectedCacheFields ? stryMutAct_9fa48("126672") ? {} : (stryCov_9fa48("126672"), {
          expectedCacheFields
        }) : {})
      });
      try {
        if (stryMutAct_9fa48("126673")) {
          {}
        } else {
          stryCov_9fa48("126673");
          const partitionResult = await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("126674") ? {} : (stryCov_9fa48("126674"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
            tableName: this.tableName,
            whereClause,
            data: updateData
          }), writeOptions);
          const gatewayFailureReason = classifyGatewayMutationOutcome(partitionResult);
          if (stryMutAct_9fa48("126677") ? partitionResult?.success === false || gatewayFailureReason : stryMutAct_9fa48("126676") ? false : stryMutAct_9fa48("126675") ? true : (stryCov_9fa48("126675", "126676", "126677"), (stryMutAct_9fa48("126679") ? partitionResult?.success !== false : stryMutAct_9fa48("126678") ? true : (stryCov_9fa48("126678", "126679"), (stryMutAct_9fa48("126680") ? partitionResult.success : (stryCov_9fa48("126680"), partitionResult?.success)) === (stryMutAct_9fa48("126681") ? true : (stryCov_9fa48("126681"), false)))) && gatewayFailureReason)) {
            if (stryMutAct_9fa48("126682")) {
              {}
            } else {
              stryCov_9fa48("126682");
              this.scheduleRetry(stryMutAct_9fa48("126683") ? partitionResult.retryAfterMs : (stryCov_9fa48("126683"), partitionResult?.retryAfterMs));
              return this.buildResult(stryMutAct_9fa48("126684") ? {} : (stryCov_9fa48("126684"), {
                attempts: 1,
                partitionResult,
                reason: gatewayFailureReason
              }));
            }
          }
          const affectedRows = extractAffectedRows(partitionResult);
          if (stryMutAct_9fa48("126687") ? gatewayFailureReason === AUTHORITATIVE_ROW_MUTATION_REASON.OBSERVED_STATE_CHANGED && affectedRows !== null && affectedRows <= 0 : stryMutAct_9fa48("126686") ? false : stryMutAct_9fa48("126685") ? true : (stryCov_9fa48("126685", "126686", "126687"), (stryMutAct_9fa48("126689") ? gatewayFailureReason !== AUTHORITATIVE_ROW_MUTATION_REASON.OBSERVED_STATE_CHANGED : stryMutAct_9fa48("126688") ? false : (stryCov_9fa48("126688", "126689"), gatewayFailureReason === AUTHORITATIVE_ROW_MUTATION_REASON.OBSERVED_STATE_CHANGED)) || (stryMutAct_9fa48("126691") ? affectedRows !== null || affectedRows <= 0 : stryMutAct_9fa48("126690") ? false : (stryCov_9fa48("126690", "126691"), (stryMutAct_9fa48("126693") ? affectedRows === null : stryMutAct_9fa48("126692") ? true : (stryCov_9fa48("126692", "126693"), affectedRows !== null)) && (stryMutAct_9fa48("126696") ? affectedRows > 0 : stryMutAct_9fa48("126695") ? affectedRows < 0 : stryMutAct_9fa48("126694") ? true : (stryCov_9fa48("126694", "126695", "126696"), affectedRows <= 0)))))) {
            if (stryMutAct_9fa48("126697")) {
              {}
            } else {
              stryCov_9fa48("126697");
              this.scheduleRetry();
              return this.buildResult(stryMutAct_9fa48("126698") ? {} : (stryCov_9fa48("126698"), {
                attempts: 1,
                partitionResult,
                reason: AUTHORITATIVE_ROW_MUTATION_REASON.OBSERVED_STATE_CHANGED
              }));
            }
          }
          this.persistedValue = value;
          if (stryMutAct_9fa48("126701") ? this.pendingValue !== value : stryMutAct_9fa48("126700") ? false : stryMutAct_9fa48("126699") ? true : (stryCov_9fa48("126699", "126700", "126701"), this.pendingValue === value)) {
            if (stryMutAct_9fa48("126702")) {
              {}
            } else {
              stryCov_9fa48("126702");
              this.pendingValue = null;
            }
          }
          writeSucceeded = stryMutAct_9fa48("126703") ? false : (stryCov_9fa48("126703"), true);
          this.retryAttemptCount = 0;
          return this.buildResult(stryMutAct_9fa48("126704") ? {} : (stryCov_9fa48("126704"), {
            applied: stryMutAct_9fa48("126705") ? false : (stryCov_9fa48("126705"), true),
            authoritativeWriteApplied: stryMutAct_9fa48("126706") ? false : (stryCov_9fa48("126706"), true),
            cacheVisible: stryMutAct_9fa48("126707") ? false : (stryCov_9fa48("126707"), true),
            attempts: 1,
            partitionResult,
            reason: AUTHORITATIVE_ROW_MUTATION_REASON.APPLIED
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("126708")) {
          {}
        } else {
          stryCov_9fa48("126708");
          const reason = classifyMutationFailure(error);
          const mutationResult = this.buildResult(stryMutAct_9fa48("126709") ? {} : (stryCov_9fa48("126709"), {
            attempts: 1,
            reason
          }));
          error.mutationResult = mutationResult;
          if (stryMutAct_9fa48("126712") ? false : stryMutAct_9fa48("126711") ? true : stryMutAct_9fa48("126710") ? this.shuttingDown : (stryCov_9fa48("126710", "126711", "126712"), !this.shuttingDown)) {
            if (stryMutAct_9fa48("126713")) {
              {}
            } else {
              stryCov_9fa48("126713");
              this.scheduleRetry(stryMutAct_9fa48("126714") ? error.retryAfterMs : (stryCov_9fa48("126714"), error?.retryAfterMs));
            }
          }
          throw error;
        }
      } finally {
        if (stryMutAct_9fa48("126715")) {
          {}
        } else {
          stryCov_9fa48("126715");
          this.inFlight = stryMutAct_9fa48("126716") ? true : (stryCov_9fa48("126716"), false);
          if (stryMutAct_9fa48("126719") ? !this.shuttingDown && writeSucceeded && this.pendingValue || this.pendingValue !== this.persistedValue : stryMutAct_9fa48("126718") ? false : stryMutAct_9fa48("126717") ? true : (stryCov_9fa48("126717", "126718", "126719"), (stryMutAct_9fa48("126721") ? !this.shuttingDown && writeSucceeded || this.pendingValue : stryMutAct_9fa48("126720") ? true : (stryCov_9fa48("126720", "126721"), (stryMutAct_9fa48("126723") ? !this.shuttingDown || writeSucceeded : stryMutAct_9fa48("126722") ? true : (stryCov_9fa48("126722", "126723"), (stryMutAct_9fa48("126724") ? this.shuttingDown : (stryCov_9fa48("126724"), !this.shuttingDown)) && writeSucceeded)) && this.pendingValue)) && (stryMutAct_9fa48("126726") ? this.pendingValue === this.persistedValue : stryMutAct_9fa48("126725") ? true : (stryCov_9fa48("126725", "126726"), this.pendingValue !== this.persistedValue)))) {
            if (stryMutAct_9fa48("126727")) {
              {}
            } else {
              stryCov_9fa48("126727");
              this.scheduleFollowUpFlush();
            }
          }
        }
      }
    }
  }
  scheduleRetry(delayMs = null) {
    if (stryMutAct_9fa48("126728")) {
      {}
    } else {
      stryCov_9fa48("126728");
      if (stryMutAct_9fa48("126731") ? this.shuttingDown && this.retryTimer : stryMutAct_9fa48("126730") ? false : stryMutAct_9fa48("126729") ? true : (stryCov_9fa48("126729", "126730", "126731"), this.shuttingDown || this.retryTimer)) {
        if (stryMutAct_9fa48("126732")) {
          {}
        } else {
          stryCov_9fa48("126732");
          return;
        }
      }
      const boundedDelayMs = this.resolveRetryDelayMs(delayMs);
      stryMutAct_9fa48("126733") ? this.retryAttemptCount -= 1 : (stryCov_9fa48("126733"), this.retryAttemptCount += 1);
      this.retryTimer = this.setTimeoutFn(async () => {
        if (stryMutAct_9fa48("126734")) {
          {}
        } else {
          stryCov_9fa48("126734");
          this.retryTimer = null;
          await this.flush().catch(error => {
            if (stryMutAct_9fa48("126735")) {
              {}
            } else {
              stryCov_9fa48("126735");
              this.onAsyncError(error, stryMutAct_9fa48("126736") ? {} : (stryCov_9fa48("126736"), {
                value: this.pendingValue,
                retry: stryMutAct_9fa48("126737") ? false : (stryCov_9fa48("126737"), true)
              }));
            }
          });
        }
      }, boundedDelayMs);
    }
  }
  resolveRetryDelayMs(delayMs = null) {
    if (stryMutAct_9fa48("126738")) {
      {}
    } else {
      stryCov_9fa48("126738");
      const explicitDelayMs = (stryMutAct_9fa48("126741") ? Number.isFinite(delayMs) || delayMs > 0 : stryMutAct_9fa48("126740") ? false : stryMutAct_9fa48("126739") ? true : (stryCov_9fa48("126739", "126740", "126741"), Number.isFinite(delayMs) && (stryMutAct_9fa48("126744") ? delayMs <= 0 : stryMutAct_9fa48("126743") ? delayMs >= 0 : stryMutAct_9fa48("126742") ? true : (stryCov_9fa48("126742", "126743", "126744"), delayMs > 0)))) ? Math.floor(delayMs) : 0;
      const baseDelayMs = (stryMutAct_9fa48("126747") ? Number.isFinite(this.retryDelayMs) || this.retryDelayMs > 0 : stryMutAct_9fa48("126746") ? false : stryMutAct_9fa48("126745") ? true : (stryCov_9fa48("126745", "126746", "126747"), Number.isFinite(this.retryDelayMs) && (stryMutAct_9fa48("126750") ? this.retryDelayMs <= 0 : stryMutAct_9fa48("126749") ? this.retryDelayMs >= 0 : stryMutAct_9fa48("126748") ? true : (stryCov_9fa48("126748", "126749", "126750"), this.retryDelayMs > 0)))) ? Math.floor(this.retryDelayMs) : TIME_MS.SECOND;
      const backoffDelayMs = stryMutAct_9fa48("126751") ? Math.max(this.maxRetryDelayMs, Math.floor(baseDelayMs * this.retryBackoffMultiplier ** this.retryAttemptCount)) : (stryCov_9fa48("126751"), Math.min(this.maxRetryDelayMs, Math.floor(stryMutAct_9fa48("126752") ? baseDelayMs / this.retryBackoffMultiplier ** this.retryAttemptCount : (stryCov_9fa48("126752"), baseDelayMs * this.retryBackoffMultiplier ** this.retryAttemptCount))));
      return stryMutAct_9fa48("126753") ? Math.max(this.maxRetryDelayMs, Math.max(backoffDelayMs, explicitDelayMs)) : (stryCov_9fa48("126753"), Math.min(this.maxRetryDelayMs, stryMutAct_9fa48("126754") ? Math.min(backoffDelayMs, explicitDelayMs) : (stryCov_9fa48("126754"), Math.max(backoffDelayMs, explicitDelayMs))));
    }
  }
  scheduleFollowUpFlush() {
    if (stryMutAct_9fa48("126755")) {
      {}
    } else {
      stryCov_9fa48("126755");
      if (stryMutAct_9fa48("126758") ? (this.shuttingDown || this.followUpFlushScheduled) && !this.cdcIntegrationService : stryMutAct_9fa48("126757") ? false : stryMutAct_9fa48("126756") ? true : (stryCov_9fa48("126756", "126757", "126758"), (stryMutAct_9fa48("126760") ? this.shuttingDown && this.followUpFlushScheduled : stryMutAct_9fa48("126759") ? false : (stryCov_9fa48("126759", "126760"), this.shuttingDown || this.followUpFlushScheduled)) || (stryMutAct_9fa48("126761") ? this.cdcIntegrationService : (stryCov_9fa48("126761"), !this.cdcIntegrationService)))) {
        if (stryMutAct_9fa48("126762")) {
          {}
        } else {
          stryCov_9fa48("126762");
          return;
        }
      }
      this.followUpFlushScheduled = stryMutAct_9fa48("126763") ? false : (stryCov_9fa48("126763"), true);
      queueMicrotask(() => {
        if (stryMutAct_9fa48("126764")) {
          {}
        } else {
          stryCov_9fa48("126764");
          this.followUpFlushScheduled = stryMutAct_9fa48("126765") ? true : (stryCov_9fa48("126765"), false);
          if (stryMutAct_9fa48("126767") ? false : stryMutAct_9fa48("126766") ? true : (stryCov_9fa48("126766", "126767"), this.shuttingDown)) {
            if (stryMutAct_9fa48("126768")) {
              {}
            } else {
              stryCov_9fa48("126768");
              return;
            }
          }
          if (stryMutAct_9fa48("126771") ? (this.inFlight || !this.pendingValue) && this.pendingValue === this.persistedValue : stryMutAct_9fa48("126770") ? false : stryMutAct_9fa48("126769") ? true : (stryCov_9fa48("126769", "126770", "126771"), (stryMutAct_9fa48("126773") ? this.inFlight && !this.pendingValue : stryMutAct_9fa48("126772") ? false : (stryCov_9fa48("126772", "126773"), this.inFlight || (stryMutAct_9fa48("126774") ? this.pendingValue : (stryCov_9fa48("126774"), !this.pendingValue)))) || (stryMutAct_9fa48("126776") ? this.pendingValue !== this.persistedValue : stryMutAct_9fa48("126775") ? false : (stryCov_9fa48("126775", "126776"), this.pendingValue === this.persistedValue)))) {
            if (stryMutAct_9fa48("126777")) {
              {}
            } else {
              stryCov_9fa48("126777");
              return;
            }
          }
          this.flush().catch(error => {
            if (stryMutAct_9fa48("126778")) {
              {}
            } else {
              stryCov_9fa48("126778");
              this.onAsyncError(error, stryMutAct_9fa48("126779") ? {} : (stryCov_9fa48("126779"), {
                value: this.pendingValue,
                retry: stryMutAct_9fa48("126780") ? true : (stryCov_9fa48("126780"), false)
              }));
            }
          });
        }
      });
    }
  }
  shutdown() {
    if (stryMutAct_9fa48("126781")) {
      {}
    } else {
      stryCov_9fa48("126781");
      this.shuttingDown = stryMutAct_9fa48("126782") ? false : (stryCov_9fa48("126782"), true);
      if (stryMutAct_9fa48("126785") ? false : stryMutAct_9fa48("126784") ? true : stryMutAct_9fa48("126783") ? this.retryTimer : (stryCov_9fa48("126783", "126784", "126785"), !this.retryTimer)) {
        if (stryMutAct_9fa48("126786")) {
          {}
        } else {
          stryCov_9fa48("126786");
          this.followUpFlushScheduled = stryMutAct_9fa48("126787") ? true : (stryCov_9fa48("126787"), false);
          this.pendingValue = null;
          this.retryAttemptCount = 0;
          return;
        }
      }
      this.clearTimeoutFn(this.retryTimer);
      this.retryTimer = null;
      this.followUpFlushScheduled = stryMutAct_9fa48("126788") ? true : (stryCov_9fa48("126788"), false);
      this.pendingValue = null;
      this.retryAttemptCount = 0;
    }
  }
  buildResult(overrides = {}) {
    if (stryMutAct_9fa48("126789")) {
      {}
    } else {
      stryCov_9fa48("126789");
      return stryMutAct_9fa48("126790") ? {} : (stryCov_9fa48("126790"), {
        applied: stryMutAct_9fa48("126791") ? true : (stryCov_9fa48("126791"), false),
        authoritativeWriteApplied: stryMutAct_9fa48("126792") ? true : (stryCov_9fa48("126792"), false),
        cacheVisible: stryMutAct_9fa48("126793") ? true : (stryCov_9fa48("126793"), false),
        recoveredFromCacheGap: stryMutAct_9fa48("126794") ? true : (stryCov_9fa48("126794"), false),
        attempts: 0,
        reason: AUTHORITATIVE_ROW_MUTATION_REASON.NOOP,
        ...overrides
      });
    }
  }
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("126795")) {
      {}
    } else {
      stryCov_9fa48("126795");
      if (stryMutAct_9fa48("126797") ? false : stryMutAct_9fa48("126796") ? true : (stryCov_9fa48("126796", "126797"), this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("126798")) {
          {}
        } else {
          stryCov_9fa48("126798");
          return this.controlPlaneSystemTableGateway;
        }
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("126799") ? {} : (stryCov_9fa48("126799"), {
        nodeId: this.nodeId,
        getCdcIntegrationService: stryMutAct_9fa48("126800") ? () => undefined : (stryCov_9fa48("126800"), () => this.cdcIntegrationService),
        getMessageRouter: stryMutAct_9fa48("126801") ? () => undefined : (stryCov_9fa48("126801"), () => this.messageRouter)
      })).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
  }
}
export { AuthoritativeRowMutationHelper, classifyMutationFailure };