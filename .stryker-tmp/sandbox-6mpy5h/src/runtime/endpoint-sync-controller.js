/**
 * Endpoint sync controller orchestration.
 *
 * Orchestrates source reads, filtering, planning, and Kubernetes
 * reconciliation for one convergence cycle.
 *
 * @module runtime/endpoint-sync-controller
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
import { TYPEOF } from '../constants/index.js';
import { BaseError } from '../utils/base-error.js';
import { ENDPOINT_SYNC_ERROR, ENDPOINT_SYNC_EVENT_REASON, ENDPOINT_SYNC_EVENT_TYPE, ENDPOINT_SYNC_LOG } from './endpoint-sync-constants.js';
import { filterNormalizedEndpointRows } from './endpoint-sync-source-query.js';
import { planEndpointExports } from './endpoint-sync-planner.js';
import { RECONCILE_SUMMARY_DEFAULT, reconcilePlannedExports } from './endpoint-sync-k8s-reconciler.js';
import { EndpointSyncLeaseLeaderElector } from './endpoint-sync-leader-election.js';
import { EndpointSyncMetrics } from './endpoint-sync-metrics.js';
const ENDPOINT_SYNC_CONTROLLER_ERROR = Object.freeze(stryMutAct_9fa48("145075") ? {} : (stryCov_9fa48("145075"), {
  SOURCE_CLIENT_REQUIRED: stryMutAct_9fa48("145076") ? "" : (stryCov_9fa48("145076"), 'sourceClient is required'),
  SOURCE_FETCH_METHOD_REQUIRED: stryMutAct_9fa48("145077") ? "" : (stryCov_9fa48("145077"), 'sourceClient must implement fetchEndpointRows(options)'),
  K8S_CLIENT_REQUIRED: stryMutAct_9fa48("145078") ? "" : (stryCov_9fa48("145078"), 'k8sClient is required'),
  CONFIG_REQUIRED: stryMutAct_9fa48("145079") ? "" : (stryCov_9fa48("145079"), 'config is required'),
  NAMESPACE_REQUIRED: stryMutAct_9fa48("145080") ? "" : (stryCov_9fa48("145080"), 'namespace is required in config or constructor options'),
  LEADER_ELECTOR_METHOD_REQUIRED: stryMutAct_9fa48("145081") ? "" : (stryCov_9fa48("145081"), 'leaderElector must implement tryAcquireLeadership()'),
  METRICS_METHOD_PREFIX: stryMutAct_9fa48("145082") ? "" : (stryCov_9fa48("145082"), 'metrics reporter missing required method')
}));
const REQUIRED_METRICS_METHOD = Object.freeze(stryMutAct_9fa48("145083") ? [] : (stryCov_9fa48("145083"), [stryMutAct_9fa48("145084") ? "" : (stryCov_9fa48("145084"), 'recordReconcileDurationMs'), stryMutAct_9fa48("145085") ? "" : (stryCov_9fa48("145085"), 'incrementReconcileFailures'), stryMutAct_9fa48("145086") ? "" : (stryCov_9fa48("145086"), 'setExportedServices'), stryMutAct_9fa48("145087") ? "" : (stryCov_9fa48("145087"), 'setExportedEndpoints'), stryMutAct_9fa48("145088") ? "" : (stryCov_9fa48("145088"), 'incrementPortConflicts'), stryMutAct_9fa48("145089") ? "" : (stryCov_9fa48("145089"), 'snapshot')]));

/**
 * Typed controller error.
 *
 * @extends BaseError
 */
class EndpointSyncControllerError extends BaseError {
  /**
   * @param {string} message - Error message.
   * @param {Object} [metadata={}] - Error metadata.
   * @param {Error} [cause] - Underlying cause.
   */
  constructor(message, metadata = {}, cause = undefined) {
    if (stryMutAct_9fa48("145090")) {
      {}
    } else {
      stryCov_9fa48("145090");
      super(message, stryMutAct_9fa48("145091") ? {} : (stryCov_9fa48("145091"), {
        cause,
        context: stryMutAct_9fa48("145092") ? {} : (stryCov_9fa48("145092"), {
          component: stryMutAct_9fa48("145093") ? "" : (stryCov_9fa48("145093"), 'EndpointSyncController'),
          operation: stryMutAct_9fa48("145094") ? "" : (stryCov_9fa48("145094"), 'runOnce'),
          metadata
        })
      }));
    }
  }
}

/**
 * Best-effort structured logging helper.
 *
 * @param {Object} logger - Logger object.
 * @param {string} level - Logger method name.
 * @param {string} message - Log message/tag.
 * @param {Object} payload - Structured fields.
 */
function safeLog(logger, level, message, payload) {
  if (stryMutAct_9fa48("145095")) {
    {}
  } else {
    stryCov_9fa48("145095");
    if (stryMutAct_9fa48("145098") ? !logger && typeof logger[level] !== TYPEOF.FUNCTION : stryMutAct_9fa48("145097") ? false : stryMutAct_9fa48("145096") ? true : (stryCov_9fa48("145096", "145097", "145098"), (stryMutAct_9fa48("145099") ? logger : (stryCov_9fa48("145099"), !logger)) || (stryMutAct_9fa48("145101") ? typeof logger[level] === TYPEOF.FUNCTION : stryMutAct_9fa48("145100") ? false : (stryCov_9fa48("145100", "145101"), typeof logger[level] !== TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("145102")) {
        {}
      } else {
        stryCov_9fa48("145102");
        return;
      }
    }
    try {
      if (stryMutAct_9fa48("145103")) {
        {}
      } else {
        stryCov_9fa48("145103");
        logger[level](message, payload);
      }
    } catch (_error) {
      // logging failures must not affect reconcile behavior
    }
  }
}

/**
 * Clone reconcile summary from default shape.
 *
 * @return {Object}
 */
function cloneReconcileSummary() {
  if (stryMutAct_9fa48("145104")) {
    {}
  } else {
    stryCov_9fa48("145104");
    return stryMutAct_9fa48("145105") ? {} : (stryCov_9fa48("145105"), {
      desiredServices: RECONCILE_SUMMARY_DEFAULT.desiredServices,
      desiredEndpointSlices: RECONCILE_SUMMARY_DEFAULT.desiredEndpointSlices,
      upsertedServices: RECONCILE_SUMMARY_DEFAULT.upsertedServices,
      upsertedEndpointSlices: RECONCILE_SUMMARY_DEFAULT.upsertedEndpointSlices,
      exportedEndpoints: RECONCILE_SUMMARY_DEFAULT.exportedEndpoints,
      deletedServices: RECONCILE_SUMMARY_DEFAULT.deletedServices,
      deletedEndpointSlices: RECONCILE_SUMMARY_DEFAULT.deletedEndpointSlices,
      groupFailures: stryMutAct_9fa48("145106") ? ["Stryker was here"] : (stryCov_9fa48("145106"), [])
    });
  }
}

/**
 * Build run summary shell used across success/failure paths.
 *
 * @return {Object}
 */
function createRunSummary() {
  if (stryMutAct_9fa48("145107")) {
    {}
  } else {
    stryCov_9fa48("145107");
    return stryMutAct_9fa48("145108") ? {} : (stryCov_9fa48("145108"), {
      sourceRowCount: 0,
      filteredRowCount: 0,
      plannedExportCount: 0,
      conflictCount: 0,
      conflicts: stryMutAct_9fa48("145109") ? ["Stryker was here"] : (stryCov_9fa48("145109"), []),
      skippedAsFollower: stryMutAct_9fa48("145110") ? true : (stryCov_9fa48("145110"), false),
      leadership: null,
      reconcileSummary: cloneReconcileSummary()
    });
  }
}

/**
 * Resolve whether an error originated from source query path.
 *
 * @param {Error} error - Error to inspect.
 * @return {boolean}
 */
function isSourceQueryError(error) {
  if (stryMutAct_9fa48("145111")) {
    {}
  } else {
    stryCov_9fa48("145111");
    if (stryMutAct_9fa48("145114") ? !error && typeof error !== TYPEOF.OBJECT : stryMutAct_9fa48("145113") ? false : stryMutAct_9fa48("145112") ? true : (stryCov_9fa48("145112", "145113", "145114"), (stryMutAct_9fa48("145115") ? error : (stryCov_9fa48("145115"), !error)) || (stryMutAct_9fa48("145117") ? typeof error === TYPEOF.OBJECT : stryMutAct_9fa48("145116") ? false : (stryCov_9fa48("145116", "145117"), typeof error !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("145118")) {
        {}
      } else {
        stryCov_9fa48("145118");
        return stryMutAct_9fa48("145119") ? true : (stryCov_9fa48("145119"), false);
      }
    }
    if (stryMutAct_9fa48("145122") ? error?.context?.component !== 'EndpointSyncSourceClient' : stryMutAct_9fa48("145121") ? false : stryMutAct_9fa48("145120") ? true : (stryCov_9fa48("145120", "145121", "145122"), (stryMutAct_9fa48("145124") ? error.context?.component : stryMutAct_9fa48("145123") ? error?.context.component : (stryCov_9fa48("145123", "145124"), error?.context?.component)) === (stryMutAct_9fa48("145125") ? "" : (stryCov_9fa48("145125"), 'EndpointSyncSourceClient')))) {
      if (stryMutAct_9fa48("145126")) {
        {}
      } else {
        stryCov_9fa48("145126");
        return stryMutAct_9fa48("145127") ? false : (stryCov_9fa48("145127"), true);
      }
    }
    return stryMutAct_9fa48("145130") ? error.message === ENDPOINT_SYNC_ERROR.SOURCE_QUERY_FAILED && error.message === ENDPOINT_SYNC_ERROR.SOURCE_QUERY_TIMEOUT : stryMutAct_9fa48("145129") ? false : stryMutAct_9fa48("145128") ? true : (stryCov_9fa48("145128", "145129", "145130"), (stryMutAct_9fa48("145132") ? error.message !== ENDPOINT_SYNC_ERROR.SOURCE_QUERY_FAILED : stryMutAct_9fa48("145131") ? false : (stryCov_9fa48("145131", "145132"), error.message === ENDPOINT_SYNC_ERROR.SOURCE_QUERY_FAILED)) || (stryMutAct_9fa48("145134") ? error.message !== ENDPOINT_SYNC_ERROR.SOURCE_QUERY_TIMEOUT : stryMutAct_9fa48("145133") ? false : (stryCov_9fa48("145133", "145134"), error.message === ENDPOINT_SYNC_ERROR.SOURCE_QUERY_TIMEOUT)));
  }
}

/**
 * Controller entrypoint for endpoint synchronization.
 */
class EndpointSyncController {
  /**
   * @param {Object} options - Controller options.
   * @param {Object} options.sourceClient - Source query client.
   * @param {Object} options.k8sClient - Kubernetes client.
   * @param {Object} options.config - Controller config.
   * @param {string} [options.namespace] - Explicit target namespace.
   * @param {Object} [options.leaderElector] - Optional leader elector override.
   * @param {Object} [options.metrics] - Optional metrics storage override.
   * @param {Object} [options.logger] - Optional logger override.
   * @param {string} [options.leaderIdentity] - Optional lease holder identity.
   */
  constructor(options) {
    if (stryMutAct_9fa48("145135")) {
      {}
    } else {
      stryCov_9fa48("145135");
      if (stryMutAct_9fa48("145138") ? !options && typeof options !== TYPEOF.OBJECT : stryMutAct_9fa48("145137") ? false : stryMutAct_9fa48("145136") ? true : (stryCov_9fa48("145136", "145137", "145138"), (stryMutAct_9fa48("145139") ? options : (stryCov_9fa48("145139"), !options)) || (stryMutAct_9fa48("145141") ? typeof options === TYPEOF.OBJECT : stryMutAct_9fa48("145140") ? false : (stryCov_9fa48("145140", "145141"), typeof options !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("145142")) {
          {}
        } else {
          stryCov_9fa48("145142");
          throw new EndpointSyncControllerError(ENDPOINT_SYNC_CONTROLLER_ERROR.CONFIG_REQUIRED);
        }
      }
      this._sourceClient = options.sourceClient;
      if (stryMutAct_9fa48("145145") ? false : stryMutAct_9fa48("145144") ? true : stryMutAct_9fa48("145143") ? this._sourceClient : (stryCov_9fa48("145143", "145144", "145145"), !this._sourceClient)) {
        if (stryMutAct_9fa48("145146")) {
          {}
        } else {
          stryCov_9fa48("145146");
          throw new EndpointSyncControllerError(ENDPOINT_SYNC_CONTROLLER_ERROR.SOURCE_CLIENT_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("145149") ? typeof this._sourceClient.fetchEndpointRows === TYPEOF.FUNCTION : stryMutAct_9fa48("145148") ? false : stryMutAct_9fa48("145147") ? true : (stryCov_9fa48("145147", "145148", "145149"), typeof this._sourceClient.fetchEndpointRows !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("145150")) {
          {}
        } else {
          stryCov_9fa48("145150");
          throw new EndpointSyncControllerError(ENDPOINT_SYNC_CONTROLLER_ERROR.SOURCE_FETCH_METHOD_REQUIRED);
        }
      }
      this._k8sClient = options.k8sClient;
      if (stryMutAct_9fa48("145153") ? !this._k8sClient && typeof this._k8sClient !== TYPEOF.OBJECT : stryMutAct_9fa48("145152") ? false : stryMutAct_9fa48("145151") ? true : (stryCov_9fa48("145151", "145152", "145153"), (stryMutAct_9fa48("145154") ? this._k8sClient : (stryCov_9fa48("145154"), !this._k8sClient)) || (stryMutAct_9fa48("145156") ? typeof this._k8sClient === TYPEOF.OBJECT : stryMutAct_9fa48("145155") ? false : (stryCov_9fa48("145155", "145156"), typeof this._k8sClient !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("145157")) {
          {}
        } else {
          stryCov_9fa48("145157");
          throw new EndpointSyncControllerError(ENDPOINT_SYNC_CONTROLLER_ERROR.K8S_CLIENT_REQUIRED);
        }
      }
      this._config = options.config;
      if (stryMutAct_9fa48("145160") ? !this._config && typeof this._config !== TYPEOF.OBJECT : stryMutAct_9fa48("145159") ? false : stryMutAct_9fa48("145158") ? true : (stryCov_9fa48("145158", "145159", "145160"), (stryMutAct_9fa48("145161") ? this._config : (stryCov_9fa48("145161"), !this._config)) || (stryMutAct_9fa48("145163") ? typeof this._config === TYPEOF.OBJECT : stryMutAct_9fa48("145162") ? false : (stryCov_9fa48("145162", "145163"), typeof this._config !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("145164")) {
          {}
        } else {
          stryCov_9fa48("145164");
          throw new EndpointSyncControllerError(ENDPOINT_SYNC_CONTROLLER_ERROR.CONFIG_REQUIRED);
        }
      }
      this._namespace = stryMutAct_9fa48("145167") ? (options.namespace || this._config.targetNamespace || this._config.leaseNamespace) && '' : stryMutAct_9fa48("145166") ? false : stryMutAct_9fa48("145165") ? true : (stryCov_9fa48("145165", "145166", "145167"), (stryMutAct_9fa48("145169") ? (options.namespace || this._config.targetNamespace) && this._config.leaseNamespace : stryMutAct_9fa48("145168") ? false : (stryCov_9fa48("145168", "145169"), (stryMutAct_9fa48("145171") ? options.namespace && this._config.targetNamespace : stryMutAct_9fa48("145170") ? false : (stryCov_9fa48("145170", "145171"), options.namespace || this._config.targetNamespace)) || this._config.leaseNamespace)) || (stryMutAct_9fa48("145172") ? "Stryker was here!" : (stryCov_9fa48("145172"), '')));
      if (stryMutAct_9fa48("145175") ? typeof this._namespace !== TYPEOF.STRING && this._namespace.trim().length === 0 : stryMutAct_9fa48("145174") ? false : stryMutAct_9fa48("145173") ? true : (stryCov_9fa48("145173", "145174", "145175"), (stryMutAct_9fa48("145177") ? typeof this._namespace === TYPEOF.STRING : stryMutAct_9fa48("145176") ? false : (stryCov_9fa48("145176", "145177"), typeof this._namespace !== TYPEOF.STRING)) || (stryMutAct_9fa48("145179") ? this._namespace.trim().length !== 0 : stryMutAct_9fa48("145178") ? false : (stryCov_9fa48("145178", "145179"), (stryMutAct_9fa48("145180") ? this._namespace.length : (stryCov_9fa48("145180"), this._namespace.trim().length)) === 0)))) {
        if (stryMutAct_9fa48("145181")) {
          {}
        } else {
          stryCov_9fa48("145181");
          throw new EndpointSyncControllerError(ENDPOINT_SYNC_CONTROLLER_ERROR.NAMESPACE_REQUIRED);
        }
      }
      this._namespace = stryMutAct_9fa48("145182") ? this._namespace : (stryCov_9fa48("145182"), this._namespace.trim());
      this._logger = stryMutAct_9fa48("145185") ? options.logger && console : stryMutAct_9fa48("145184") ? false : stryMutAct_9fa48("145183") ? true : (stryCov_9fa48("145183", "145184", "145185"), options.logger || console);
      this._metrics = stryMutAct_9fa48("145188") ? options.metrics && new EndpointSyncMetrics() : stryMutAct_9fa48("145187") ? false : stryMutAct_9fa48("145186") ? true : (stryCov_9fa48("145186", "145187", "145188"), options.metrics || new EndpointSyncMetrics());
      this._validateMetricsReporter();
      this._leaderElector = null;
      if (stryMutAct_9fa48("145191") ? this._config.leaderElectionEnabled !== true : stryMutAct_9fa48("145190") ? false : stryMutAct_9fa48("145189") ? true : (stryCov_9fa48("145189", "145190", "145191"), this._config.leaderElectionEnabled === (stryMutAct_9fa48("145192") ? false : (stryCov_9fa48("145192"), true)))) {
        if (stryMutAct_9fa48("145193")) {
          {}
        } else {
          stryCov_9fa48("145193");
          this._leaderElector = stryMutAct_9fa48("145196") ? options.leaderElector && new EndpointSyncLeaseLeaderElector({
            k8sClient: this._k8sClient,
            namespace: this._config.leaseNamespace || this._namespace,
            leaseName: this._config.leaseName,
            holderIdentity: options.leaderIdentity
          }) : stryMutAct_9fa48("145195") ? false : stryMutAct_9fa48("145194") ? true : (stryCov_9fa48("145194", "145195", "145196"), options.leaderElector || new EndpointSyncLeaseLeaderElector(stryMutAct_9fa48("145197") ? {} : (stryCov_9fa48("145197"), {
            k8sClient: this._k8sClient,
            namespace: stryMutAct_9fa48("145200") ? this._config.leaseNamespace && this._namespace : stryMutAct_9fa48("145199") ? false : stryMutAct_9fa48("145198") ? true : (stryCov_9fa48("145198", "145199", "145200"), this._config.leaseNamespace || this._namespace),
            leaseName: this._config.leaseName,
            holderIdentity: options.leaderIdentity
          })));
          if (stryMutAct_9fa48("145203") ? typeof this._leaderElector.tryAcquireLeadership === TYPEOF.FUNCTION : stryMutAct_9fa48("145202") ? false : stryMutAct_9fa48("145201") ? true : (stryCov_9fa48("145201", "145202", "145203"), typeof this._leaderElector.tryAcquireLeadership !== TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("145204")) {
              {}
            } else {
              stryCov_9fa48("145204");
              throw new EndpointSyncControllerError(ENDPOINT_SYNC_CONTROLLER_ERROR.LEADER_ELECTOR_METHOD_REQUIRED);
            }
          }
        }
      }
    }
  }

  /**
   * Verify injected metrics reporter shape.
   *
   * @private
   */
  _validateMetricsReporter() {
    if (stryMutAct_9fa48("145205")) {
      {}
    } else {
      stryCov_9fa48("145205");
      for (const methodName of REQUIRED_METRICS_METHOD) {
        if (stryMutAct_9fa48("145206")) {
          {}
        } else {
          stryCov_9fa48("145206");
          if (stryMutAct_9fa48("145209") ? typeof this._metrics[methodName] === TYPEOF.FUNCTION : stryMutAct_9fa48("145208") ? false : stryMutAct_9fa48("145207") ? true : (stryCov_9fa48("145207", "145208", "145209"), typeof this._metrics[methodName] !== TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("145210")) {
              {}
            } else {
              stryCov_9fa48("145210");
              throw new EndpointSyncControllerError(stryMutAct_9fa48("145211") ? `` : (stryCov_9fa48("145211"), `${ENDPOINT_SYNC_CONTROLLER_ERROR.METRICS_METHOD_PREFIX}: ${methodName}`));
            }
          }
        }
      }
    }
  }

  /**
   * Emit group-level warning event when supported by k8s client.
   *
   * @param {Object} eventData - Event payload.
   * @private
   */
  async _emitKubernetesEvent(eventData) {
    if (stryMutAct_9fa48("145212")) {
      {}
    } else {
      stryCov_9fa48("145212");
      if (stryMutAct_9fa48("145215") ? typeof this._k8sClient.recordEvent === TYPEOF.FUNCTION : stryMutAct_9fa48("145214") ? false : stryMutAct_9fa48("145213") ? true : (stryCov_9fa48("145213", "145214", "145215"), typeof this._k8sClient.recordEvent !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("145216")) {
          {}
        } else {
          stryCov_9fa48("145216");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("145217")) {
          {}
        } else {
          stryCov_9fa48("145217");
          await this._k8sClient.recordEvent(stryMutAct_9fa48("145218") ? {} : (stryCov_9fa48("145218"), {
            namespace: this._namespace,
            type: ENDPOINT_SYNC_EVENT_TYPE.WARNING,
            reason: eventData.reason,
            message: eventData.message,
            serviceKey: stryMutAct_9fa48("145221") ? eventData.serviceKey && null : stryMutAct_9fa48("145220") ? false : stryMutAct_9fa48("145219") ? true : (stryCov_9fa48("145219", "145220", "145221"), eventData.serviceKey || null),
            serviceName: stryMutAct_9fa48("145224") ? eventData.serviceName && null : stryMutAct_9fa48("145223") ? false : stryMutAct_9fa48("145222") ? true : (stryCov_9fa48("145222", "145223", "145224"), eventData.serviceName || null),
            protocol: stryMutAct_9fa48("145227") ? eventData.protocol && null : stryMutAct_9fa48("145226") ? false : stryMutAct_9fa48("145225") ? true : (stryCov_9fa48("145225", "145226", "145227"), eventData.protocol || null),
            stage: stryMutAct_9fa48("145230") ? eventData.stage && null : stryMutAct_9fa48("145229") ? false : stryMutAct_9fa48("145228") ? true : (stryCov_9fa48("145228", "145229", "145230"), eventData.stage || null)
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("145231")) {
          {}
        } else {
          stryCov_9fa48("145231");
          safeLog(this._logger, stryMutAct_9fa48("145232") ? "" : (stryCov_9fa48("145232"), 'warn'), ENDPOINT_SYNC_LOG.EVENT_EMIT_FAILURE, stryMutAct_9fa48("145233") ? {} : (stryCov_9fa48("145233"), {
            namespace: this._namespace,
            reason: eventData.reason,
            error: error.message
          }));
        }
      }
    }
  }

  /**
   * Record controller metric values from one run.
   *
   * @param {Object} summary - Run summary.
   * @param {number} durationMs - Run duration.
   * @param {boolean} cycleFailed - Whether run threw error.
   * @private
   */
  _recordMetrics(summary, durationMs, cycleFailed) {
    if (stryMutAct_9fa48("145234")) {
      {}
    } else {
      stryCov_9fa48("145234");
      if (stryMutAct_9fa48("145237") ? this._config.metricsEnabled === true : stryMutAct_9fa48("145236") ? false : stryMutAct_9fa48("145235") ? true : (stryCov_9fa48("145235", "145236", "145237"), this._config.metricsEnabled !== (stryMutAct_9fa48("145238") ? false : (stryCov_9fa48("145238"), true)))) {
        if (stryMutAct_9fa48("145239")) {
          {}
        } else {
          stryCov_9fa48("145239");
          return;
        }
      }
      this._metrics.recordReconcileDurationMs(durationMs);
      this._metrics.setExportedServices(summary.reconcileSummary.upsertedServices);
      this._metrics.setExportedEndpoints(summary.reconcileSummary.exportedEndpoints);
      this._metrics.incrementPortConflicts(summary.conflictCount);
      if (stryMutAct_9fa48("145242") ? cycleFailed && summary.reconcileSummary.groupFailures.length > 0 : stryMutAct_9fa48("145241") ? false : stryMutAct_9fa48("145240") ? true : (stryCov_9fa48("145240", "145241", "145242"), cycleFailed || (stryMutAct_9fa48("145245") ? summary.reconcileSummary.groupFailures.length <= 0 : stryMutAct_9fa48("145244") ? summary.reconcileSummary.groupFailures.length >= 0 : stryMutAct_9fa48("145243") ? false : (stryCov_9fa48("145243", "145244", "145245"), summary.reconcileSummary.groupFailures.length > 0)))) {
        if (stryMutAct_9fa48("145246")) {
          {}
        } else {
          stryCov_9fa48("145246");
          this._metrics.incrementReconcileFailures();
        }
      }
    }
  }

  /**
   * Emit one structured summary log for reconcile run.
   *
   * @param {Object} summary - Run summary.
   * @param {number} durationMs - Run duration.
   * @param {boolean} cycleFailed - Whether run threw error.
   * @private
   */
  _logReconcileSummary(summary, durationMs, cycleFailed) {
    if (stryMutAct_9fa48("145247")) {
      {}
    } else {
      stryCov_9fa48("145247");
      const payload = stryMutAct_9fa48("145248") ? {} : (stryCov_9fa48("145248"), {
        durationMs,
        sourceRowCount: summary.sourceRowCount,
        filteredRowCount: summary.filteredRowCount,
        plannedExportCount: summary.plannedExportCount,
        conflictCount: summary.conflictCount,
        skippedAsFollower: summary.skippedAsFollower,
        desiredServices: summary.reconcileSummary.desiredServices,
        desiredEndpointSlices: summary.reconcileSummary.desiredEndpointSlices,
        upsertedServices: summary.reconcileSummary.upsertedServices,
        upsertedEndpointSlices: summary.reconcileSummary.upsertedEndpointSlices,
        exportedEndpoints: summary.reconcileSummary.exportedEndpoints,
        deletedServices: summary.reconcileSummary.deletedServices,
        deletedEndpointSlices: summary.reconcileSummary.deletedEndpointSlices,
        groupFailureCount: summary.reconcileSummary.groupFailures.length
      });
      if (stryMutAct_9fa48("145250") ? false : stryMutAct_9fa48("145249") ? true : (stryCov_9fa48("145249", "145250"), cycleFailed)) {
        if (stryMutAct_9fa48("145251")) {
          {}
        } else {
          stryCov_9fa48("145251");
          safeLog(this._logger, stryMutAct_9fa48("145252") ? "" : (stryCov_9fa48("145252"), 'error'), ENDPOINT_SYNC_LOG.RECONCILE_SUMMARY, payload);
          return;
        }
      }
      if (stryMutAct_9fa48("145255") ? summary.reconcileSummary.groupFailures.length > 0 && summary.conflictCount > 0 : stryMutAct_9fa48("145254") ? false : stryMutAct_9fa48("145253") ? true : (stryCov_9fa48("145253", "145254", "145255"), (stryMutAct_9fa48("145258") ? summary.reconcileSummary.groupFailures.length <= 0 : stryMutAct_9fa48("145257") ? summary.reconcileSummary.groupFailures.length >= 0 : stryMutAct_9fa48("145256") ? false : (stryCov_9fa48("145256", "145257", "145258"), summary.reconcileSummary.groupFailures.length > 0)) || (stryMutAct_9fa48("145261") ? summary.conflictCount <= 0 : stryMutAct_9fa48("145260") ? summary.conflictCount >= 0 : stryMutAct_9fa48("145259") ? false : (stryCov_9fa48("145259", "145260", "145261"), summary.conflictCount > 0)))) {
        if (stryMutAct_9fa48("145262")) {
          {}
        } else {
          stryCov_9fa48("145262");
          safeLog(this._logger, stryMutAct_9fa48("145263") ? "" : (stryCov_9fa48("145263"), 'warn'), ENDPOINT_SYNC_LOG.RECONCILE_SUMMARY, payload);
          return;
        }
      }
      safeLog(this._logger, stryMutAct_9fa48("145264") ? "" : (stryCov_9fa48("145264"), 'info'), ENDPOINT_SYNC_LOG.RECONCILE_SUMMARY, payload);
    }
  }

  /**
   * Return immutable metrics snapshot.
   *
   * @return {Readonly<Object>}
   */
  getMetricsSnapshot() {
    if (stryMutAct_9fa48("145265")) {
      {}
    } else {
      stryCov_9fa48("145265");
      return this._metrics.snapshot();
    }
  }

  /**
   * Execute one reconciliation cycle.
   *
   * @return {Promise<Object>} Run summary.
   */
  async runOnce() {
    if (stryMutAct_9fa48("145266")) {
      {}
    } else {
      stryCov_9fa48("145266");
      const startedAtMs = Date.now();
      const summary = createRunSummary();
      try {
        if (stryMutAct_9fa48("145267")) {
          {}
        } else {
          stryCov_9fa48("145267");
          if (stryMutAct_9fa48("145269") ? false : stryMutAct_9fa48("145268") ? true : (stryCov_9fa48("145268", "145269"), this._leaderElector)) {
            if (stryMutAct_9fa48("145270")) {
              {}
            } else {
              stryCov_9fa48("145270");
              summary.leadership = await this._leaderElector.tryAcquireLeadership();
              safeLog(this._logger, stryMutAct_9fa48("145271") ? "" : (stryCov_9fa48("145271"), 'info'), ENDPOINT_SYNC_LOG.LEADER_STATUS, stryMutAct_9fa48("145272") ? {} : (stryCov_9fa48("145272"), {
                holderIdentity: summary.leadership.holderIdentity,
                leaseName: summary.leadership.leaseName,
                leaseNamespace: summary.leadership.leaseNamespace,
                isLeader: summary.leadership.isLeader,
                observedHolderIdentity: summary.leadership.observedHolderIdentity
              }));
              if (stryMutAct_9fa48("145275") ? false : stryMutAct_9fa48("145274") ? true : stryMutAct_9fa48("145273") ? summary.leadership.isLeader : (stryCov_9fa48("145273", "145274", "145275"), !summary.leadership.isLeader)) {
                if (stryMutAct_9fa48("145276")) {
                  {}
                } else {
                  stryCov_9fa48("145276");
                  summary.skippedAsFollower = stryMutAct_9fa48("145277") ? false : (stryCov_9fa48("145277"), true);
                  const durationMs = stryMutAct_9fa48("145278") ? Date.now() + startedAtMs : (stryCov_9fa48("145278"), Date.now() - startedAtMs);
                  this._recordMetrics(summary, durationMs, stryMutAct_9fa48("145279") ? true : (stryCov_9fa48("145279"), false));
                  this._logReconcileSummary(summary, durationMs, stryMutAct_9fa48("145280") ? true : (stryCov_9fa48("145280"), false));
                  return summary;
                }
              }
            }
          }
          const sourceRows = await this._sourceClient.fetchEndpointRows(this._config);
          summary.sourceRowCount = sourceRows.length;
          const filteredRows = filterNormalizedEndpointRows(sourceRows, stryMutAct_9fa48("145281") ? {} : (stryCov_9fa48("145281"), {
            protocolAllowlist: this._config.protocolAllowlist,
            serviceIdAllowlist: this._config.serviceIdAllowlist,
            healthyOnly: this._config.healthyOnly,
            unhealthyPolicy: this._config.unhealthyPolicy
          }));
          summary.filteredRowCount = filteredRows.length;
          const plan = planEndpointExports(filteredRows, stryMutAct_9fa48("145282") ? {} : (stryCov_9fa48("145282"), {
            strictPortMode: this._config.strictPortMode,
            serviceNamePrefix: this._config.serviceNamePrefix,
            maxEndpointsPerSlice: this._config.maxEndpointsPerSlice
          }));
          summary.plannedExportCount = plan.exports.length;
          summary.conflictCount = plan.conflicts.length;
          summary.conflicts = plan.conflicts;
          for (const conflict of plan.conflicts) {
            if (stryMutAct_9fa48("145283")) {
              {}
            } else {
              stryCov_9fa48("145283");
              safeLog(this._logger, stryMutAct_9fa48("145284") ? "" : (stryCov_9fa48("145284"), 'warn'), ENDPOINT_SYNC_LOG.GROUP_FAILURE, stryMutAct_9fa48("145285") ? {} : (stryCov_9fa48("145285"), {
                reason: ENDPOINT_SYNC_EVENT_REASON.PORT_CONFLICT,
                serviceKey: conflict.serviceKey,
                serviceName: conflict.logicalServiceName,
                protocol: conflict.protocol,
                ports: conflict.ports,
                message: conflict.reason
              }));
              await this._emitKubernetesEvent(stryMutAct_9fa48("145286") ? {} : (stryCov_9fa48("145286"), {
                reason: ENDPOINT_SYNC_EVENT_REASON.PORT_CONFLICT,
                serviceKey: conflict.serviceKey,
                serviceName: conflict.logicalServiceName,
                protocol: conflict.protocol,
                message: stryMutAct_9fa48("145287") ? `` : (stryCov_9fa48("145287"), `Strict port conflict for ${conflict.serviceKey}: ${conflict.ports.join(stryMutAct_9fa48("145288") ? "" : (stryCov_9fa48("145288"), ', '))}`)
              }));
            }
          }
          summary.reconcileSummary = await reconcilePlannedExports(stryMutAct_9fa48("145289") ? {} : (stryCov_9fa48("145289"), {
            k8sClient: this._k8sClient,
            namespace: this._namespace,
            plannedExports: plan.exports,
            unhealthyPolicy: this._config.unhealthyPolicy
          }));
          for (const groupFailure of summary.reconcileSummary.groupFailures) {
            if (stryMutAct_9fa48("145290")) {
              {}
            } else {
              stryCov_9fa48("145290");
              safeLog(this._logger, stryMutAct_9fa48("145291") ? "" : (stryCov_9fa48("145291"), 'error'), ENDPOINT_SYNC_LOG.GROUP_FAILURE, stryMutAct_9fa48("145292") ? {} : (stryCov_9fa48("145292"), {
                reason: ENDPOINT_SYNC_EVENT_REASON.RECONCILE_FAILED,
                serviceKey: groupFailure.serviceKey,
                serviceName: groupFailure.serviceName,
                protocol: groupFailure.protocol,
                stage: groupFailure.stage,
                message: groupFailure.message
              }));
              await this._emitKubernetesEvent(stryMutAct_9fa48("145293") ? {} : (stryCov_9fa48("145293"), {
                reason: ENDPOINT_SYNC_EVENT_REASON.RECONCILE_FAILED,
                serviceKey: groupFailure.serviceKey,
                serviceName: groupFailure.serviceName,
                protocol: groupFailure.protocol,
                stage: groupFailure.stage,
                message: (stryMutAct_9fa48("145294") ? `` : (stryCov_9fa48("145294"), `Projection failure for ${stryMutAct_9fa48("145297") ? groupFailure.serviceName && 'managed-resource' : stryMutAct_9fa48("145296") ? false : stryMutAct_9fa48("145295") ? true : (stryCov_9fa48("145295", "145296", "145297"), groupFailure.serviceName || (stryMutAct_9fa48("145298") ? "" : (stryCov_9fa48("145298"), 'managed-resource')))}: `)) + (stryMutAct_9fa48("145299") ? `` : (stryCov_9fa48("145299"), `${groupFailure.message}`))
              }));
            }
          }
          const durationMs = stryMutAct_9fa48("145300") ? Date.now() + startedAtMs : (stryCov_9fa48("145300"), Date.now() - startedAtMs);
          this._recordMetrics(summary, durationMs, stryMutAct_9fa48("145301") ? true : (stryCov_9fa48("145301"), false));
          this._logReconcileSummary(summary, durationMs, stryMutAct_9fa48("145302") ? true : (stryCov_9fa48("145302"), false));
          return summary;
        }
      } catch (error) {
        if (stryMutAct_9fa48("145303")) {
          {}
        } else {
          stryCov_9fa48("145303");
          const durationMs = stryMutAct_9fa48("145304") ? Date.now() + startedAtMs : (stryCov_9fa48("145304"), Date.now() - startedAtMs);
          this._recordMetrics(summary, durationMs, stryMutAct_9fa48("145305") ? false : (stryCov_9fa48("145305"), true));
          const eventReason = isSourceQueryError(error) ? ENDPOINT_SYNC_EVENT_REASON.SOURCE_QUERY_FAILED : ENDPOINT_SYNC_EVENT_REASON.RECONCILE_FAILED;
          await this._emitKubernetesEvent(stryMutAct_9fa48("145306") ? {} : (stryCov_9fa48("145306"), {
            reason: eventReason,
            message: error.message
          }));
          safeLog(this._logger, stryMutAct_9fa48("145307") ? "" : (stryCov_9fa48("145307"), 'error'), ENDPOINT_SYNC_LOG.RECONCILE_FAILURE, stryMutAct_9fa48("145308") ? {} : (stryCov_9fa48("145308"), {
            error: error.message
          }));
          this._logReconcileSummary(summary, durationMs, stryMutAct_9fa48("145309") ? false : (stryCov_9fa48("145309"), true));
          throw error;
        }
      }
    }
  }
}
export { ENDPOINT_SYNC_CONTROLLER_ERROR, REQUIRED_METRICS_METHOD, EndpointSyncControllerError, safeLog, cloneReconcileSummary, createRunSummary, isSourceQueryError, EndpointSyncController };