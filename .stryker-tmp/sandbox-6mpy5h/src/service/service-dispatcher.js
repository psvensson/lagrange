/**
 * Canonical dispatcher for Service_Message envelopes.
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
import { SUBSYSTEM, TYPEOF } from '../constants/index.js';
import { assertServiceMessageEnvelope } from './service-message-contract.js';
import { ServicePolicyViolationError } from './service-lifecycle-errors.js';
const SERVICE_DISPATCHER_ERROR = Object.freeze(stryMutAct_9fa48("150092") ? {} : (stryCov_9fa48("150092"), {
  ROUTER_REQUIRED: stryMutAct_9fa48("150093") ? "" : (stryCov_9fa48("150093"), 'messageRouter must provide a deliver(targetAddress, message, options) function'),
  LEADER_RESOLVER_REQUIRED: stryMutAct_9fa48("150094") ? "" : (stryCov_9fa48("150094"), 'leaderResolver must be a function'),
  AUTHN_REQUIRED: stryMutAct_9fa48("150095") ? "" : (stryCov_9fa48("150095"), 'authenticate must be a function'),
  AUTHZ_REQUIRED: stryMutAct_9fa48("150096") ? "" : (stryCov_9fa48("150096"), 'authorize must be a function'),
  TARGET_ADDRESS_REQUIRED: stryMutAct_9fa48("150097") ? "" : (stryCov_9fa48("150097"), 'leaderResolver must return targetAddress'),
  DELIVERY_REJECTED: stryMutAct_9fa48("150098") ? "" : (stryCov_9fa48("150098"), 'message delivery was not acknowledged')
}));
const DISPATCHER_POLICY_TYPE = Object.freeze(stryMutAct_9fa48("150099") ? {} : (stryCov_9fa48("150099"), {
  AUTHN: stryMutAct_9fa48("150100") ? "" : (stryCov_9fa48("150100"), 'authn'),
  AUTHZ: stryMutAct_9fa48("150101") ? "" : (stryCov_9fa48("150101"), 'authz')
}));
const DISPATCHER_LOG = Object.freeze(stryMutAct_9fa48("150102") ? {} : (stryCov_9fa48("150102"), {
  DISPATCH_START: stryMutAct_9fa48("150103") ? "" : (stryCov_9fa48("150103"), 'Dispatching canonical service message'),
  DISPATCH_SUCCESS: stryMutAct_9fa48("150104") ? "" : (stryCov_9fa48("150104"), 'Service message dispatch completed'),
  DISPATCH_FAILURE: stryMutAct_9fa48("150105") ? "" : (stryCov_9fa48("150105"), 'Service message dispatch failed')
}));
const DISPATCH_METRIC_STATUS = Object.freeze(stryMutAct_9fa48("150106") ? {} : (stryCov_9fa48("150106"), {
  SUCCESS: stryMutAct_9fa48("150107") ? "" : (stryCov_9fa48("150107"), 'success'),
  FAILURE: stryMutAct_9fa48("150108") ? "" : (stryCov_9fa48("150108"), 'failure'),
  AUTHN_FAILURE: stryMutAct_9fa48("150109") ? "" : (stryCov_9fa48("150109"), 'authn_failure'),
  AUTHZ_FAILURE: stryMutAct_9fa48("150110") ? "" : (stryCov_9fa48("150110"), 'authz_failure')
}));
function resolveRuntimeKind(envelope) {
  if (stryMutAct_9fa48("150111")) {
    {}
  } else {
    stryCov_9fa48("150111");
    return stryMutAct_9fa48("150114") ? (envelope?.runtimeKind || envelope?.payload?.runtimeKind || envelope?.metadata?.runtimeKind) && null : stryMutAct_9fa48("150113") ? false : stryMutAct_9fa48("150112") ? true : (stryCov_9fa48("150112", "150113", "150114"), (stryMutAct_9fa48("150116") ? (envelope?.runtimeKind || envelope?.payload?.runtimeKind) && envelope?.metadata?.runtimeKind : stryMutAct_9fa48("150115") ? false : (stryCov_9fa48("150115", "150116"), (stryMutAct_9fa48("150118") ? envelope?.runtimeKind && envelope?.payload?.runtimeKind : stryMutAct_9fa48("150117") ? false : (stryCov_9fa48("150117", "150118"), (stryMutAct_9fa48("150119") ? envelope.runtimeKind : (stryCov_9fa48("150119"), envelope?.runtimeKind)) || (stryMutAct_9fa48("150121") ? envelope.payload?.runtimeKind : stryMutAct_9fa48("150120") ? envelope?.payload.runtimeKind : (stryCov_9fa48("150120", "150121"), envelope?.payload?.runtimeKind)))) || (stryMutAct_9fa48("150123") ? envelope.metadata?.runtimeKind : stryMutAct_9fa48("150122") ? envelope?.metadata.runtimeKind : (stryCov_9fa48("150122", "150123"), envelope?.metadata?.runtimeKind)))) || null);
  }
}
function resolveTraceId(envelope, context) {
  if (stryMutAct_9fa48("150124")) {
    {}
  } else {
    stryCov_9fa48("150124");
    return stryMutAct_9fa48("150127") ? (envelope?.traceId || context?.traceId || context?.authn?.traceId) && null : stryMutAct_9fa48("150126") ? false : stryMutAct_9fa48("150125") ? true : (stryCov_9fa48("150125", "150126", "150127"), (stryMutAct_9fa48("150129") ? (envelope?.traceId || context?.traceId) && context?.authn?.traceId : stryMutAct_9fa48("150128") ? false : (stryCov_9fa48("150128", "150129"), (stryMutAct_9fa48("150131") ? envelope?.traceId && context?.traceId : stryMutAct_9fa48("150130") ? false : (stryCov_9fa48("150130", "150131"), (stryMutAct_9fa48("150132") ? envelope.traceId : (stryCov_9fa48("150132"), envelope?.traceId)) || (stryMutAct_9fa48("150133") ? context.traceId : (stryCov_9fa48("150133"), context?.traceId)))) || (stryMutAct_9fa48("150135") ? context.authn?.traceId : stryMutAct_9fa48("150134") ? context?.authn.traceId : (stryCov_9fa48("150134", "150135"), context?.authn?.traceId)))) || null);
  }
}
function resolveNodeId(context) {
  if (stryMutAct_9fa48("150136")) {
    {}
  } else {
    stryCov_9fa48("150136");
    return stryMutAct_9fa48("150139") ? (context?.nodeId || context?.clientInfo?.nodeId) && null : stryMutAct_9fa48("150138") ? false : stryMutAct_9fa48("150137") ? true : (stryCov_9fa48("150137", "150138", "150139"), (stryMutAct_9fa48("150141") ? context?.nodeId && context?.clientInfo?.nodeId : stryMutAct_9fa48("150140") ? false : (stryCov_9fa48("150140", "150141"), (stryMutAct_9fa48("150142") ? context.nodeId : (stryCov_9fa48("150142"), context?.nodeId)) || (stryMutAct_9fa48("150144") ? context.clientInfo?.nodeId : stryMutAct_9fa48("150143") ? context?.clientInfo.nodeId : (stryCov_9fa48("150143", "150144"), context?.clientInfo?.nodeId)))) || null);
  }
}
class ServiceDispatcher {
  /**
   * @param {Object} options
   * @param {Object} options.messageRouter
   * @param {Function} options.leaderResolver
   * @param {Function} options.authenticate
   * @param {Function} options.authorize
   * @param {Object} [options.logger]
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("150145")) {
      {}
    } else {
      stryCov_9fa48("150145");
      if (stryMutAct_9fa48("150148") ? !options.messageRouter && typeof options.messageRouter.deliver !== TYPEOF.FUNCTION : stryMutAct_9fa48("150147") ? false : stryMutAct_9fa48("150146") ? true : (stryCov_9fa48("150146", "150147", "150148"), (stryMutAct_9fa48("150149") ? options.messageRouter : (stryCov_9fa48("150149"), !options.messageRouter)) || (stryMutAct_9fa48("150151") ? typeof options.messageRouter.deliver === TYPEOF.FUNCTION : stryMutAct_9fa48("150150") ? false : (stryCov_9fa48("150150", "150151"), typeof options.messageRouter.deliver !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("150152")) {
          {}
        } else {
          stryCov_9fa48("150152");
          throw new TypeError(SERVICE_DISPATCHER_ERROR.ROUTER_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("150155") ? typeof options.leaderResolver === TYPEOF.FUNCTION : stryMutAct_9fa48("150154") ? false : stryMutAct_9fa48("150153") ? true : (stryCov_9fa48("150153", "150154", "150155"), typeof options.leaderResolver !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("150156")) {
          {}
        } else {
          stryCov_9fa48("150156");
          throw new TypeError(SERVICE_DISPATCHER_ERROR.LEADER_RESOLVER_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("150159") ? typeof options.authenticate === TYPEOF.FUNCTION : stryMutAct_9fa48("150158") ? false : stryMutAct_9fa48("150157") ? true : (stryCov_9fa48("150157", "150158", "150159"), typeof options.authenticate !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("150160")) {
          {}
        } else {
          stryCov_9fa48("150160");
          throw new TypeError(SERVICE_DISPATCHER_ERROR.AUTHN_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("150163") ? typeof options.authorize === TYPEOF.FUNCTION : stryMutAct_9fa48("150162") ? false : stryMutAct_9fa48("150161") ? true : (stryCov_9fa48("150161", "150162", "150163"), typeof options.authorize !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("150164")) {
          {}
        } else {
          stryCov_9fa48("150164");
          throw new TypeError(SERVICE_DISPATCHER_ERROR.AUTHZ_REQUIRED);
        }
      }
      this._messageRouter = options.messageRouter;
      this._leaderResolver = options.leaderResolver;
      this._authenticate = options.authenticate;
      this._authorize = options.authorize;
      this._logger = stryMutAct_9fa48("150167") ? options.logger && this._initLogger() : stryMutAct_9fa48("150166") ? false : stryMutAct_9fa48("150165") ? true : (stryCov_9fa48("150165", "150166", "150167"), options.logger || this._initLogger());
      this._metrics = stryMutAct_9fa48("150168") ? {} : (stryCov_9fa48("150168"), {
        dispatchTotal: 0,
        dispatchSuccess: 0,
        dispatchFailure: 0,
        authnFailure: 0,
        authzFailure: 0,
        lastDispatchDurationMs: 0,
        dispatchLatencyMsTotal: 0,
        dispatchLatencyMsMax: 0,
        lastError: null
      });
    }
  }

  /**
   * @return {Object}
   * @private
   */
  _initLogger() {
    if (stryMutAct_9fa48("150169")) {
      {}
    } else {
      stryCov_9fa48("150169");
      try {
        if (stryMutAct_9fa48("150170")) {
          {}
        } else {
          stryCov_9fa48("150170");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("150172") ? false : stryMutAct_9fa48("150171") ? true : (stryCov_9fa48("150171", "150172"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("150173")) {
              {}
            } else {
              stryCov_9fa48("150173");
              return loggingService.forSubsystem(SUBSYSTEM.SERVICE_LIFECYCLE);
            }
          }
        }
      } catch {
        // Logging service may not be initialized in unit tests.
      }
      return console;
    }
  }

  /**
   * @return {Object}
   */
  getMetrics() {
    if (stryMutAct_9fa48("150174")) {
      {}
    } else {
      stryCov_9fa48("150174");
      return stryMutAct_9fa48("150175") ? {} : (stryCov_9fa48("150175"), {
        ...this._metrics
      });
    }
  }

  /**
   * @param {string} status
   * @param {number} durationMs
   * @param {Error|null} [error]
   * @return {void}
   * @private
   */
  _recordDispatchMetrics(status, durationMs, error = null) {
    if (stryMutAct_9fa48("150176")) {
      {}
    } else {
      stryCov_9fa48("150176");
      stryMutAct_9fa48("150177") ? this._metrics.dispatchTotal -= 1 : (stryCov_9fa48("150177"), this._metrics.dispatchTotal += 1);
      this._metrics.lastDispatchDurationMs = durationMs;
      stryMutAct_9fa48("150178") ? this._metrics.dispatchLatencyMsTotal -= durationMs : (stryCov_9fa48("150178"), this._metrics.dispatchLatencyMsTotal += durationMs);
      this._metrics.dispatchLatencyMsMax = stryMutAct_9fa48("150179") ? Math.min(this._metrics.dispatchLatencyMsMax, durationMs) : (stryCov_9fa48("150179"), Math.max(this._metrics.dispatchLatencyMsMax, durationMs));
      if (stryMutAct_9fa48("150182") ? status !== DISPATCH_METRIC_STATUS.SUCCESS : stryMutAct_9fa48("150181") ? false : stryMutAct_9fa48("150180") ? true : (stryCov_9fa48("150180", "150181", "150182"), status === DISPATCH_METRIC_STATUS.SUCCESS)) {
        if (stryMutAct_9fa48("150183")) {
          {}
        } else {
          stryCov_9fa48("150183");
          stryMutAct_9fa48("150184") ? this._metrics.dispatchSuccess -= 1 : (stryCov_9fa48("150184"), this._metrics.dispatchSuccess += 1);
          this._metrics.lastError = null;
          return;
        }
      }
      stryMutAct_9fa48("150185") ? this._metrics.dispatchFailure -= 1 : (stryCov_9fa48("150185"), this._metrics.dispatchFailure += 1);
      if (stryMutAct_9fa48("150188") ? status !== DISPATCH_METRIC_STATUS.AUTHN_FAILURE : stryMutAct_9fa48("150187") ? false : stryMutAct_9fa48("150186") ? true : (stryCov_9fa48("150186", "150187", "150188"), status === DISPATCH_METRIC_STATUS.AUTHN_FAILURE)) {
        if (stryMutAct_9fa48("150189")) {
          {}
        } else {
          stryCov_9fa48("150189");
          stryMutAct_9fa48("150190") ? this._metrics.authnFailure -= 1 : (stryCov_9fa48("150190"), this._metrics.authnFailure += 1);
        }
      }
      if (stryMutAct_9fa48("150193") ? status !== DISPATCH_METRIC_STATUS.AUTHZ_FAILURE : stryMutAct_9fa48("150192") ? false : stryMutAct_9fa48("150191") ? true : (stryCov_9fa48("150191", "150192", "150193"), status === DISPATCH_METRIC_STATUS.AUTHZ_FAILURE)) {
        if (stryMutAct_9fa48("150194")) {
          {}
        } else {
          stryCov_9fa48("150194");
          stryMutAct_9fa48("150195") ? this._metrics.authzFailure -= 1 : (stryCov_9fa48("150195"), this._metrics.authzFailure += 1);
        }
      }
      this._metrics.lastError = error ? error.message : null;
    }
  }

  /**
   * @param {Object} envelope
   * @param {Object} context
   * @return {Object}
   * @private
   */
  _buildLogContext(envelope, context) {
    if (stryMutAct_9fa48("150196")) {
      {}
    } else {
      stryCov_9fa48("150196");
      return stryMutAct_9fa48("150197") ? {} : (stryCov_9fa48("150197"), {
        serviceId: stryMutAct_9fa48("150200") ? envelope?.serviceId && null : stryMutAct_9fa48("150199") ? false : stryMutAct_9fa48("150198") ? true : (stryCov_9fa48("150198", "150199", "150200"), (stryMutAct_9fa48("150201") ? envelope.serviceId : (stryCov_9fa48("150201"), envelope?.serviceId)) || null),
        serviceType: stryMutAct_9fa48("150204") ? envelope?.serviceType && null : stryMutAct_9fa48("150203") ? false : stryMutAct_9fa48("150202") ? true : (stryCov_9fa48("150202", "150203", "150204"), (stryMutAct_9fa48("150205") ? envelope.serviceType : (stryCov_9fa48("150205"), envelope?.serviceType)) || null),
        runtimeKind: resolveRuntimeKind(envelope),
        operationId: stryMutAct_9fa48("150208") ? envelope?.messageId && null : stryMutAct_9fa48("150207") ? false : stryMutAct_9fa48("150206") ? true : (stryCov_9fa48("150206", "150207", "150208"), (stryMutAct_9fa48("150209") ? envelope.messageId : (stryCov_9fa48("150209"), envelope?.messageId)) || null),
        operation: stryMutAct_9fa48("150212") ? envelope?.operation && null : stryMutAct_9fa48("150211") ? false : stryMutAct_9fa48("150210") ? true : (stryCov_9fa48("150210", "150211", "150212"), (stryMutAct_9fa48("150213") ? envelope.operation : (stryCov_9fa48("150213"), envelope?.operation)) || null),
        traceId: resolveTraceId(envelope, context),
        nodeId: resolveNodeId(context)
      });
    }
  }

  /**
   * Run shared authn/authz checks (fail-closed).
   *
   * @param {Object} envelope
   * @param {Object} context
   * @return {Promise<Object>} Authenticated context.
   * @private
   */
  async _enforceAuthorization(envelope, context) {
    if (stryMutAct_9fa48("150214")) {
      {}
    } else {
      stryCov_9fa48("150214");
      const serviceId = stryMutAct_9fa48("150217") ? envelope.serviceId && 'unknown' : stryMutAct_9fa48("150216") ? false : stryMutAct_9fa48("150215") ? true : (stryCov_9fa48("150215", "150216", "150217"), envelope.serviceId || (stryMutAct_9fa48("150218") ? "" : (stryCov_9fa48("150218"), 'unknown')));
      let authnResult = null;
      try {
        if (stryMutAct_9fa48("150219")) {
          {}
        } else {
          stryCov_9fa48("150219");
          authnResult = await this._authenticate(envelope, context);
        }
      } catch (error) {
        if (stryMutAct_9fa48("150220")) {
          {}
        } else {
          stryCov_9fa48("150220");
          const violation = new ServicePolicyViolationError(DISPATCHER_POLICY_TYPE.AUTHN, stryMutAct_9fa48("150223") ? envelope.operation && 'dispatch' : stryMutAct_9fa48("150222") ? false : stryMutAct_9fa48("150221") ? true : (stryCov_9fa48("150221", "150222", "150223"), envelope.operation || (stryMutAct_9fa48("150224") ? "" : (stryCov_9fa48("150224"), 'dispatch'))), serviceId, error.message, stryMutAct_9fa48("150225") ? {} : (stryCov_9fa48("150225"), {
            cause: error
          }));
          violation._dispatchMetricStatus = DISPATCH_METRIC_STATUS.AUTHN_FAILURE;
          throw violation;
        }
      }
      const authorizedContext = stryMutAct_9fa48("150226") ? {} : (stryCov_9fa48("150226"), {
        ...context,
        authn: authnResult
      });
      try {
        if (stryMutAct_9fa48("150227")) {
          {}
        } else {
          stryCov_9fa48("150227");
          await this._authorize(envelope, authorizedContext);
        }
      } catch (error) {
        if (stryMutAct_9fa48("150228")) {
          {}
        } else {
          stryCov_9fa48("150228");
          const violation = new ServicePolicyViolationError(DISPATCHER_POLICY_TYPE.AUTHZ, stryMutAct_9fa48("150231") ? envelope.operation && 'dispatch' : stryMutAct_9fa48("150230") ? false : stryMutAct_9fa48("150229") ? true : (stryCov_9fa48("150229", "150230", "150231"), envelope.operation || (stryMutAct_9fa48("150232") ? "" : (stryCov_9fa48("150232"), 'dispatch'))), serviceId, error.message, stryMutAct_9fa48("150233") ? {} : (stryCov_9fa48("150233"), {
            cause: error
          }));
          violation._dispatchMetricStatus = DISPATCH_METRIC_STATUS.AUTHZ_FAILURE;
          throw violation;
        }
      }
      return authorizedContext;
    }
  }

  /**
   * Dispatch a canonical Service_Message to the resolved leader.
   *
   * @param {Object} envelope
   * @param {Object} [context]
   * @return {Promise<Object>}
   */
  async dispatch(envelope, context = {}) {
    if (stryMutAct_9fa48("150234")) {
      {}
    } else {
      stryCov_9fa48("150234");
      const startedAt = Date.now();
      let validatedEnvelope = null;
      let authorizedContext = context;
      let traceId = null;
      try {
        if (stryMutAct_9fa48("150235")) {
          {}
        } else {
          stryCov_9fa48("150235");
          validatedEnvelope = assertServiceMessageEnvelope(envelope);
          traceId = resolveTraceId(validatedEnvelope, context);
          this._logger.debug(DISPATCHER_LOG.DISPATCH_START, stryMutAct_9fa48("150236") ? {} : (stryCov_9fa48("150236"), {
            ...this._buildLogContext(validatedEnvelope, context)
          }));
          authorizedContext = await this._enforceAuthorization(validatedEnvelope, context);
          const target = await this._leaderResolver(validatedEnvelope, authorizedContext);
          if (stryMutAct_9fa48("150239") ? !target && typeof target.targetAddress !== TYPEOF.STRING : stryMutAct_9fa48("150238") ? false : stryMutAct_9fa48("150237") ? true : (stryCov_9fa48("150237", "150238", "150239"), (stryMutAct_9fa48("150240") ? target : (stryCov_9fa48("150240"), !target)) || (stryMutAct_9fa48("150242") ? typeof target.targetAddress === TYPEOF.STRING : stryMutAct_9fa48("150241") ? false : (stryCov_9fa48("150241", "150242"), typeof target.targetAddress !== TYPEOF.STRING)))) {
            if (stryMutAct_9fa48("150243")) {
              {}
            } else {
              stryCov_9fa48("150243");
              throw new Error(SERVICE_DISPATCHER_ERROR.TARGET_ADDRESS_REQUIRED);
            }
          }
          const delivery = await this._messageRouter.deliver(target.targetAddress, validatedEnvelope, stryMutAct_9fa48("150244") ? {} : (stryCov_9fa48("150244"), {
            targetNodeId: stryMutAct_9fa48("150247") ? target.targetNodeId && null : stryMutAct_9fa48("150246") ? false : stryMutAct_9fa48("150245") ? true : (stryCov_9fa48("150245", "150246", "150247"), target.targetNodeId || null),
            traceId
          }));
          if (stryMutAct_9fa48("150250") ? !delivery && delivery.acknowledged !== true : stryMutAct_9fa48("150249") ? false : stryMutAct_9fa48("150248") ? true : (stryCov_9fa48("150248", "150249", "150250"), (stryMutAct_9fa48("150251") ? delivery : (stryCov_9fa48("150251"), !delivery)) || (stryMutAct_9fa48("150253") ? delivery.acknowledged === true : stryMutAct_9fa48("150252") ? false : (stryCov_9fa48("150252", "150253"), delivery.acknowledged !== (stryMutAct_9fa48("150254") ? false : (stryCov_9fa48("150254"), true)))))) {
            if (stryMutAct_9fa48("150255")) {
              {}
            } else {
              stryCov_9fa48("150255");
              throw new Error((stryMutAct_9fa48("150256") ? `` : (stryCov_9fa48("150256"), `${SERVICE_DISPATCHER_ERROR.DELIVERY_REJECTED}:`)) + (stryMutAct_9fa48("150257") ? `` : (stryCov_9fa48("150257"), ` ${stryMutAct_9fa48("150260") ? delivery?.error && 'unknown_error' : stryMutAct_9fa48("150259") ? false : stryMutAct_9fa48("150258") ? true : (stryCov_9fa48("150258", "150259", "150260"), (stryMutAct_9fa48("150261") ? delivery.error : (stryCov_9fa48("150261"), delivery?.error)) || (stryMutAct_9fa48("150262") ? "" : (stryCov_9fa48("150262"), 'unknown_error')))}`)));
            }
          }
          const durationMs = stryMutAct_9fa48("150263") ? Date.now() + startedAt : (stryCov_9fa48("150263"), Date.now() - startedAt);
          this._recordDispatchMetrics(DISPATCH_METRIC_STATUS.SUCCESS, durationMs);
          this._logger.info(DISPATCHER_LOG.DISPATCH_SUCCESS, stryMutAct_9fa48("150264") ? {} : (stryCov_9fa48("150264"), {
            ...this._buildLogContext(validatedEnvelope, authorizedContext),
            targetAddress: target.targetAddress,
            targetNodeId: stryMutAct_9fa48("150267") ? target.targetNodeId && null : stryMutAct_9fa48("150266") ? false : stryMutAct_9fa48("150265") ? true : (stryCov_9fa48("150265", "150266", "150267"), target.targetNodeId || null),
            durationMs
          }));
          return stryMutAct_9fa48("150268") ? {} : (stryCov_9fa48("150268"), {
            envelope: validatedEnvelope,
            target,
            delivery
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("150269")) {
          {}
        } else {
          stryCov_9fa48("150269");
          const durationMs = stryMutAct_9fa48("150270") ? Date.now() + startedAt : (stryCov_9fa48("150270"), Date.now() - startedAt);
          const metricStatus = stryMutAct_9fa48("150273") ? error._dispatchMetricStatus && DISPATCH_METRIC_STATUS.FAILURE : stryMutAct_9fa48("150272") ? false : stryMutAct_9fa48("150271") ? true : (stryCov_9fa48("150271", "150272", "150273"), error._dispatchMetricStatus || DISPATCH_METRIC_STATUS.FAILURE);
          this._recordDispatchMetrics(metricStatus, durationMs, error);
          this._logger.error(DISPATCHER_LOG.DISPATCH_FAILURE, stryMutAct_9fa48("150274") ? {} : (stryCov_9fa48("150274"), {
            ...this._buildLogContext(stryMutAct_9fa48("150277") ? validatedEnvelope && envelope : stryMutAct_9fa48("150276") ? false : stryMutAct_9fa48("150275") ? true : (stryCov_9fa48("150275", "150276", "150277"), validatedEnvelope || envelope), authorizedContext),
            durationMs,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }
}
export { ServiceDispatcher };