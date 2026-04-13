/**
 * Kubernetes projection reconciler for endpoint-sync exports.
 *
 * Reconciles selector-less Service and managed EndpointSlice
 * resources from planned logical service exports.
 *
 * @module runtime/endpoint-sync-k8s-reconciler
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
import { ENDPOINT_SYNC_HEALTH, ENDPOINT_SYNC_LABEL, ENDPOINT_SYNC_RECONCILE_FAILURE_STAGE, ENDPOINT_SYNC_UNHEALTHY_POLICY } from './endpoint-sync-constants.js';
import { buildEndpointSliceName, normalizeDns1123Segment } from './endpoint-sync-naming.js';
const K8S_KIND = Object.freeze(stryMutAct_9fa48("145612") ? {} : (stryCov_9fa48("145612"), {
  SERVICE: stryMutAct_9fa48("145613") ? "" : (stryCov_9fa48("145613"), 'Service'),
  ENDPOINT_SLICE: stryMutAct_9fa48("145614") ? "" : (stryCov_9fa48("145614"), 'EndpointSlice')
}));
const K8S_API_VERSION = Object.freeze(stryMutAct_9fa48("145615") ? {} : (stryCov_9fa48("145615"), {
  SERVICE: stryMutAct_9fa48("145616") ? "" : (stryCov_9fa48("145616"), 'v1'),
  ENDPOINT_SLICE: stryMutAct_9fa48("145617") ? "" : (stryCov_9fa48("145617"), 'discovery.k8s.io/v1')
}));
const K8S_PROTOCOL = Object.freeze(stryMutAct_9fa48("145618") ? {} : (stryCov_9fa48("145618"), {
  TCP: stryMutAct_9fa48("145619") ? "" : (stryCov_9fa48("145619"), 'TCP')
}));
const K8S_LABEL = Object.freeze(stryMutAct_9fa48("145620") ? {} : (stryCov_9fa48("145620"), {
  SERVICE_NAME: stryMutAct_9fa48("145621") ? "" : (stryCov_9fa48("145621"), 'kubernetes.io/service-name')
}));
const K8S_RECONCILE_ERROR = Object.freeze(stryMutAct_9fa48("145622") ? {} : (stryCov_9fa48("145622"), {
  CLIENT_REQUIRED: stryMutAct_9fa48("145623") ? "" : (stryCov_9fa48("145623"), 'k8sClient is required'),
  CLIENT_METHOD_MISSING_PREFIX: stryMutAct_9fa48("145624") ? "" : (stryCov_9fa48("145624"), 'k8sClient missing required method'),
  NAMESPACE_REQUIRED: stryMutAct_9fa48("145625") ? "" : (stryCov_9fa48("145625"), 'namespace is required'),
  EXPORTS_REQUIRED: stryMutAct_9fa48("145626") ? "" : (stryCov_9fa48("145626"), 'plannedExports must be an array')
}));
const REQUIRED_CLIENT_METHOD = Object.freeze(stryMutAct_9fa48("145627") ? [] : (stryCov_9fa48("145627"), [stryMutAct_9fa48("145628") ? "" : (stryCov_9fa48("145628"), 'upsertService'), stryMutAct_9fa48("145629") ? "" : (stryCov_9fa48("145629"), 'upsertEndpointSlice'), stryMutAct_9fa48("145630") ? "" : (stryCov_9fa48("145630"), 'listServices'), stryMutAct_9fa48("145631") ? "" : (stryCov_9fa48("145631"), 'listEndpointSlices'), stryMutAct_9fa48("145632") ? "" : (stryCov_9fa48("145632"), 'deleteService'), stryMutAct_9fa48("145633") ? "" : (stryCov_9fa48("145633"), 'deleteEndpointSlice')]));
const RECONCILE_SUMMARY_DEFAULT = Object.freeze(stryMutAct_9fa48("145634") ? {} : (stryCov_9fa48("145634"), {
  desiredServices: 0,
  desiredEndpointSlices: 0,
  upsertedServices: 0,
  upsertedEndpointSlices: 0,
  exportedEndpoints: 0,
  deletedServices: 0,
  deletedEndpointSlices: 0,
  groupFailures: Object.freeze(stryMutAct_9fa48("145635") ? ["Stryker was here"] : (stryCov_9fa48("145635"), []))
}));

/**
 * Typed reconciler error.
 *
 * @extends BaseError
 */
class EndpointSyncReconcilerError extends BaseError {
  /**
   * @param {string} message - Error message.
   * @param {Object} [metadata={}] - Error metadata.
   * @param {Error} [cause] - Underlying cause.
   */
  constructor(message, metadata = {}, cause = undefined) {
    if (stryMutAct_9fa48("145636")) {
      {}
    } else {
      stryCov_9fa48("145636");
      super(message, stryMutAct_9fa48("145637") ? {} : (stryCov_9fa48("145637"), {
        cause,
        context: stryMutAct_9fa48("145638") ? {} : (stryCov_9fa48("145638"), {
          component: stryMutAct_9fa48("145639") ? "" : (stryCov_9fa48("145639"), 'EndpointSyncK8sReconciler'),
          operation: stryMutAct_9fa48("145640") ? "" : (stryCov_9fa48("145640"), 'reconcile'),
          metadata
        })
      }));
    }
  }
}

/**
 * Build common managed labels.
 *
 * @param {string} serviceKey - Deterministic service key.
 * @return {Object}
 */
function buildManagedLabels(serviceKey) {
  if (stryMutAct_9fa48("145641")) {
    {}
  } else {
    stryCov_9fa48("145641");
    return stryMutAct_9fa48("145642") ? {} : (stryCov_9fa48("145642"), {
      [ENDPOINT_SYNC_LABEL.MANAGED_KEY]: ENDPOINT_SYNC_LABEL.MANAGED_VALUE,
      [ENDPOINT_SYNC_LABEL.SOURCE_KEY]: ENDPOINT_SYNC_LABEL.SOURCE_VALUE,
      [ENDPOINT_SYNC_LABEL.SERVICE_KEY]: serviceKey
    });
  }
}

/**
 * Build selector-less Service manifest.
 *
 * @param {Object} plannedExport - Planned export record.
 * @param {string} namespace - Kubernetes namespace.
 * @return {Object}
 */
function buildServiceManifest(plannedExport, namespace) {
  if (stryMutAct_9fa48("145643")) {
    {}
  } else {
    stryCov_9fa48("145643");
    const labels = buildManagedLabels(plannedExport.serviceKey);
    const portName = normalizeDns1123Segment(plannedExport.protocol);
    return stryMutAct_9fa48("145644") ? {} : (stryCov_9fa48("145644"), {
      apiVersion: K8S_API_VERSION.SERVICE,
      kind: K8S_KIND.SERVICE,
      metadata: stryMutAct_9fa48("145645") ? {} : (stryCov_9fa48("145645"), {
        name: plannedExport.serviceName,
        namespace,
        labels
      }),
      spec: stryMutAct_9fa48("145646") ? {} : (stryCov_9fa48("145646"), {
        ports: stryMutAct_9fa48("145647") ? [] : (stryCov_9fa48("145647"), [stryMutAct_9fa48("145648") ? {} : (stryCov_9fa48("145648"), {
          name: portName,
          protocol: K8S_PROTOCOL.TCP,
          port: plannedExport.port,
          targetPort: plannedExport.port
        })])
      })
    });
  }
}

/**
 * Build EndpointSlice manifest from planned slice and export.
 *
 * @param {Object} plannedExport - Planned export record.
 * @param {Object} slicePlan - Planned slice record.
 * @param {number} sliceIndex - Slice index.
 * @param {string} namespace - Kubernetes namespace.
 * @param {string} unhealthyPolicy - Unhealthy endpoint policy.
 * @return {Object}
 */
function buildEndpointSliceManifest(plannedExport, slicePlan, sliceIndex, namespace, unhealthyPolicy) {
  if (stryMutAct_9fa48("145649")) {
    {}
  } else {
    stryCov_9fa48("145649");
    const sliceName = buildEndpointSliceName(plannedExport.serviceName, sliceIndex);
    const labels = stryMutAct_9fa48("145650") ? {} : (stryCov_9fa48("145650"), {
      ...buildManagedLabels(plannedExport.serviceKey),
      [K8S_LABEL.SERVICE_NAME]: plannedExport.serviceName
    });
    const portName = normalizeDns1123Segment(plannedExport.protocol);
    const endpoints = slicePlan.endpoints.map(endpoint => {
      if (stryMutAct_9fa48("145651")) {
        {}
      } else {
        stryCov_9fa48("145651");
        const isHealthy = stryMutAct_9fa48("145654") ? endpoint.healthStatus !== ENDPOINT_SYNC_HEALTH.HEALTHY : stryMutAct_9fa48("145653") ? false : stryMutAct_9fa48("145652") ? true : (stryCov_9fa48("145652", "145653", "145654"), endpoint.healthStatus === ENDPOINT_SYNC_HEALTH.HEALTHY);
        const isReady = (stryMutAct_9fa48("145657") ? unhealthyPolicy !== ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY : stryMutAct_9fa48("145656") ? false : stryMutAct_9fa48("145655") ? true : (stryCov_9fa48("145655", "145656", "145657"), unhealthyPolicy === ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY)) ? isHealthy : stryMutAct_9fa48("145658") ? false : (stryCov_9fa48("145658"), true);
        return stryMutAct_9fa48("145659") ? {} : (stryCov_9fa48("145659"), {
          addresses: stryMutAct_9fa48("145660") ? [] : (stryCov_9fa48("145660"), [endpoint.address]),
          conditions: stryMutAct_9fa48("145661") ? {} : (stryCov_9fa48("145661"), {
            ready: isReady
          }),
          hostname: endpoint.nodeId,
          nodeName: endpoint.nodeId
        });
      }
    });
    return stryMutAct_9fa48("145662") ? {} : (stryCov_9fa48("145662"), {
      apiVersion: K8S_API_VERSION.ENDPOINT_SLICE,
      kind: K8S_KIND.ENDPOINT_SLICE,
      metadata: stryMutAct_9fa48("145663") ? {} : (stryCov_9fa48("145663"), {
        name: sliceName,
        namespace,
        labels
      }),
      addressType: slicePlan.addressType,
      ports: stryMutAct_9fa48("145664") ? [] : (stryCov_9fa48("145664"), [stryMutAct_9fa48("145665") ? {} : (stryCov_9fa48("145665"), {
        name: portName,
        protocol: K8S_PROTOCOL.TCP,
        port: plannedExport.port
      })]),
      endpoints
    });
  }
}

/**
 * Detect whether resource metadata indicates managed ownership.
 *
 * @param {Object} resource - Kubernetes resource.
 * @return {boolean}
 */
function isManagedResource(resource) {
  if (stryMutAct_9fa48("145666")) {
    {}
  } else {
    stryCov_9fa48("145666");
    const labels = stryMutAct_9fa48("145669") ? resource?.metadata?.labels && null : stryMutAct_9fa48("145668") ? false : stryMutAct_9fa48("145667") ? true : (stryCov_9fa48("145667", "145668", "145669"), (stryMutAct_9fa48("145671") ? resource.metadata?.labels : stryMutAct_9fa48("145670") ? resource?.metadata.labels : (stryCov_9fa48("145670", "145671"), resource?.metadata?.labels)) || null);
    if (stryMutAct_9fa48("145674") ? !labels && typeof labels !== TYPEOF.OBJECT : stryMutAct_9fa48("145673") ? false : stryMutAct_9fa48("145672") ? true : (stryCov_9fa48("145672", "145673", "145674"), (stryMutAct_9fa48("145675") ? labels : (stryCov_9fa48("145675"), !labels)) || (stryMutAct_9fa48("145677") ? typeof labels === TYPEOF.OBJECT : stryMutAct_9fa48("145676") ? false : (stryCov_9fa48("145676", "145677"), typeof labels !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("145678")) {
        {}
      } else {
        stryCov_9fa48("145678");
        return stryMutAct_9fa48("145679") ? true : (stryCov_9fa48("145679"), false);
      }
    }
    return stryMutAct_9fa48("145682") ? labels[ENDPOINT_SYNC_LABEL.MANAGED_KEY] === ENDPOINT_SYNC_LABEL.MANAGED_VALUE || labels[ENDPOINT_SYNC_LABEL.SOURCE_KEY] === ENDPOINT_SYNC_LABEL.SOURCE_VALUE : stryMutAct_9fa48("145681") ? false : stryMutAct_9fa48("145680") ? true : (stryCov_9fa48("145680", "145681", "145682"), (stryMutAct_9fa48("145684") ? labels[ENDPOINT_SYNC_LABEL.MANAGED_KEY] !== ENDPOINT_SYNC_LABEL.MANAGED_VALUE : stryMutAct_9fa48("145683") ? true : (stryCov_9fa48("145683", "145684"), labels[ENDPOINT_SYNC_LABEL.MANAGED_KEY] === ENDPOINT_SYNC_LABEL.MANAGED_VALUE)) && (stryMutAct_9fa48("145686") ? labels[ENDPOINT_SYNC_LABEL.SOURCE_KEY] !== ENDPOINT_SYNC_LABEL.SOURCE_VALUE : stryMutAct_9fa48("145685") ? true : (stryCov_9fa48("145685", "145686"), labels[ENDPOINT_SYNC_LABEL.SOURCE_KEY] === ENDPOINT_SYNC_LABEL.SOURCE_VALUE)));
  }
}

/**
 * Collect stale managed resources by name.
 *
 * @param {Array<Object>} existingResources - Existing resources.
 * @param {Set<string>} desiredNames - Desired resource names.
 * @return {Array<string>} Names eligible for removal.
 */
function collectStaleManagedResourceNames(existingResources, desiredNames) {
  if (stryMutAct_9fa48("145687")) {
    {}
  } else {
    stryCov_9fa48("145687");
    const staleNames = stryMutAct_9fa48("145688") ? ["Stryker was here"] : (stryCov_9fa48("145688"), []);
    for (const resource of existingResources) {
      if (stryMutAct_9fa48("145689")) {
        {}
      } else {
        stryCov_9fa48("145689");
        if (stryMutAct_9fa48("145692") ? false : stryMutAct_9fa48("145691") ? true : stryMutAct_9fa48("145690") ? isManagedResource(resource) : (stryCov_9fa48("145690", "145691", "145692"), !isManagedResource(resource))) {
          if (stryMutAct_9fa48("145693")) {
            {}
          } else {
            stryCov_9fa48("145693");
            continue;
          }
        }
        const name = stryMutAct_9fa48("145696") ? resource?.metadata?.name && null : stryMutAct_9fa48("145695") ? false : stryMutAct_9fa48("145694") ? true : (stryCov_9fa48("145694", "145695", "145696"), (stryMutAct_9fa48("145698") ? resource.metadata?.name : stryMutAct_9fa48("145697") ? resource?.metadata.name : (stryCov_9fa48("145697", "145698"), resource?.metadata?.name)) || null);
        if (stryMutAct_9fa48("145701") ? false : stryMutAct_9fa48("145700") ? true : stryMutAct_9fa48("145699") ? name : (stryCov_9fa48("145699", "145700", "145701"), !name)) {
          if (stryMutAct_9fa48("145702")) {
            {}
          } else {
            stryCov_9fa48("145702");
            continue;
          }
        }
        if (stryMutAct_9fa48("145705") ? false : stryMutAct_9fa48("145704") ? true : stryMutAct_9fa48("145703") ? desiredNames.has(name) : (stryCov_9fa48("145703", "145704", "145705"), !desiredNames.has(name))) {
          if (stryMutAct_9fa48("145706")) {
            {}
          } else {
            stryCov_9fa48("145706");
            staleNames.push(name);
          }
        }
      }
    }
    return stryMutAct_9fa48("145707") ? staleNames : (stryCov_9fa48("145707"), staleNames.sort(stryMutAct_9fa48("145708") ? () => undefined : (stryCov_9fa48("145708"), (left, right) => left.localeCompare(right))));
  }
}

/**
 * Validate reconciler input options.
 *
 * @param {Object} options - Reconcile options.
 */
function validateReconcileOptions(options) {
  if (stryMutAct_9fa48("145709")) {
    {}
  } else {
    stryCov_9fa48("145709");
    if (stryMutAct_9fa48("145712") ? !options && typeof options !== TYPEOF.OBJECT : stryMutAct_9fa48("145711") ? false : stryMutAct_9fa48("145710") ? true : (stryCov_9fa48("145710", "145711", "145712"), (stryMutAct_9fa48("145713") ? options : (stryCov_9fa48("145713"), !options)) || (stryMutAct_9fa48("145715") ? typeof options === TYPEOF.OBJECT : stryMutAct_9fa48("145714") ? false : (stryCov_9fa48("145714", "145715"), typeof options !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("145716")) {
        {}
      } else {
        stryCov_9fa48("145716");
        throw new EndpointSyncReconcilerError(K8S_RECONCILE_ERROR.CLIENT_REQUIRED);
      }
    }
    const k8sClient = options.k8sClient;
    if (stryMutAct_9fa48("145719") ? !k8sClient && typeof k8sClient !== TYPEOF.OBJECT : stryMutAct_9fa48("145718") ? false : stryMutAct_9fa48("145717") ? true : (stryCov_9fa48("145717", "145718", "145719"), (stryMutAct_9fa48("145720") ? k8sClient : (stryCov_9fa48("145720"), !k8sClient)) || (stryMutAct_9fa48("145722") ? typeof k8sClient === TYPEOF.OBJECT : stryMutAct_9fa48("145721") ? false : (stryCov_9fa48("145721", "145722"), typeof k8sClient !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("145723")) {
        {}
      } else {
        stryCov_9fa48("145723");
        throw new EndpointSyncReconcilerError(K8S_RECONCILE_ERROR.CLIENT_REQUIRED);
      }
    }
    for (const methodName of REQUIRED_CLIENT_METHOD) {
      if (stryMutAct_9fa48("145724")) {
        {}
      } else {
        stryCov_9fa48("145724");
        if (stryMutAct_9fa48("145727") ? typeof k8sClient[methodName] === TYPEOF.FUNCTION : stryMutAct_9fa48("145726") ? false : stryMutAct_9fa48("145725") ? true : (stryCov_9fa48("145725", "145726", "145727"), typeof k8sClient[methodName] !== TYPEOF.FUNCTION)) {
          if (stryMutAct_9fa48("145728")) {
            {}
          } else {
            stryCov_9fa48("145728");
            throw new EndpointSyncReconcilerError(stryMutAct_9fa48("145729") ? `` : (stryCov_9fa48("145729"), `${K8S_RECONCILE_ERROR.CLIENT_METHOD_MISSING_PREFIX}: ${methodName}`));
          }
        }
      }
    }
    if (stryMutAct_9fa48("145732") ? !options.namespace && typeof options.namespace !== TYPEOF.STRING : stryMutAct_9fa48("145731") ? false : stryMutAct_9fa48("145730") ? true : (stryCov_9fa48("145730", "145731", "145732"), (stryMutAct_9fa48("145733") ? options.namespace : (stryCov_9fa48("145733"), !options.namespace)) || (stryMutAct_9fa48("145735") ? typeof options.namespace === TYPEOF.STRING : stryMutAct_9fa48("145734") ? false : (stryCov_9fa48("145734", "145735"), typeof options.namespace !== TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("145736")) {
        {}
      } else {
        stryCov_9fa48("145736");
        throw new EndpointSyncReconcilerError(K8S_RECONCILE_ERROR.NAMESPACE_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("145739") ? false : stryMutAct_9fa48("145738") ? true : stryMutAct_9fa48("145737") ? Array.isArray(options.plannedExports) : (stryCov_9fa48("145737", "145738", "145739"), !Array.isArray(options.plannedExports))) {
      if (stryMutAct_9fa48("145740")) {
        {}
      } else {
        stryCov_9fa48("145740");
        throw new EndpointSyncReconcilerError(K8S_RECONCILE_ERROR.EXPORTS_REQUIRED);
      }
    }
  }
}

/**
 * Build mutable reconcile summary object.
 *
 * @return {Object}
 */
function createReconcileSummary() {
  if (stryMutAct_9fa48("145741")) {
    {}
  } else {
    stryCov_9fa48("145741");
    return stryMutAct_9fa48("145742") ? {} : (stryCov_9fa48("145742"), {
      desiredServices: RECONCILE_SUMMARY_DEFAULT.desiredServices,
      desiredEndpointSlices: RECONCILE_SUMMARY_DEFAULT.desiredEndpointSlices,
      upsertedServices: RECONCILE_SUMMARY_DEFAULT.upsertedServices,
      upsertedEndpointSlices: RECONCILE_SUMMARY_DEFAULT.upsertedEndpointSlices,
      exportedEndpoints: RECONCILE_SUMMARY_DEFAULT.exportedEndpoints,
      deletedServices: RECONCILE_SUMMARY_DEFAULT.deletedServices,
      deletedEndpointSlices: RECONCILE_SUMMARY_DEFAULT.deletedEndpointSlices,
      groupFailures: stryMutAct_9fa48("145743") ? ["Stryker was here"] : (stryCov_9fa48("145743"), [])
    });
  }
}

/**
 * Reconcile Services and EndpointSlices from planned exports.
 *
 * @param {Object} options - Reconcile options.
 * @param {Object} options.k8sClient - Injected Kubernetes client.
 * @param {string} options.namespace - Target namespace.
 * @param {Array<Object>} options.plannedExports - Planned exports.
 * @param {string} [options.unhealthyPolicy='exclude'] - Health policy.
 * @return {Promise<Object>} Reconcile summary.
 */
async function reconcilePlannedExports(options) {
  if (stryMutAct_9fa48("145744")) {
    {}
  } else {
    stryCov_9fa48("145744");
    validateReconcileOptions(options);
    const unhealthyPolicy = stryMutAct_9fa48("145747") ? options.unhealthyPolicy && ENDPOINT_SYNC_UNHEALTHY_POLICY.EXCLUDE : stryMutAct_9fa48("145746") ? false : stryMutAct_9fa48("145745") ? true : (stryCov_9fa48("145745", "145746", "145747"), options.unhealthyPolicy || ENDPOINT_SYNC_UNHEALTHY_POLICY.EXCLUDE);
    const desiredServiceNames = new Set();
    const desiredEndpointSliceNames = new Set();
    const summary = createReconcileSummary();
    for (const plannedExport of options.plannedExports) {
      if (stryMutAct_9fa48("145748")) {
        {}
      } else {
        stryCov_9fa48("145748");
        const serviceManifest = buildServiceManifest(plannedExport, options.namespace);
        desiredServiceNames.add(serviceManifest.metadata.name);
        stryMutAct_9fa48("145749") ? summary.desiredServices -= 1 : (stryCov_9fa48("145749"), summary.desiredServices += 1);
        const sliceManifests = stryMutAct_9fa48("145750") ? ["Stryker was here"] : (stryCov_9fa48("145750"), []);
        for (let idx = 0; stryMutAct_9fa48("145753") ? idx >= plannedExport.slicePlans.length : stryMutAct_9fa48("145752") ? idx <= plannedExport.slicePlans.length : stryMutAct_9fa48("145751") ? false : (stryCov_9fa48("145751", "145752", "145753"), idx < plannedExport.slicePlans.length); stryMutAct_9fa48("145754") ? idx -= 1 : (stryCov_9fa48("145754"), idx += 1)) {
          if (stryMutAct_9fa48("145755")) {
            {}
          } else {
            stryCov_9fa48("145755");
            const sliceManifest = buildEndpointSliceManifest(plannedExport, plannedExport.slicePlans[idx], idx, options.namespace, unhealthyPolicy);
            desiredEndpointSliceNames.add(sliceManifest.metadata.name);
            sliceManifests.push(sliceManifest);
            stryMutAct_9fa48("145756") ? summary.desiredEndpointSlices -= 1 : (stryCov_9fa48("145756"), summary.desiredEndpointSlices += 1);
          }
        }
        try {
          if (stryMutAct_9fa48("145757")) {
            {}
          } else {
            stryCov_9fa48("145757");
            await options.k8sClient.upsertService(serviceManifest);
            stryMutAct_9fa48("145758") ? summary.upsertedServices -= 1 : (stryCov_9fa48("145758"), summary.upsertedServices += 1);
          }
        } catch (error) {
          if (stryMutAct_9fa48("145759")) {
            {}
          } else {
            stryCov_9fa48("145759");
            summary.groupFailures.push(stryMutAct_9fa48("145760") ? {} : (stryCov_9fa48("145760"), {
              serviceKey: plannedExport.serviceKey,
              serviceName: plannedExport.serviceName,
              protocol: plannedExport.protocol,
              stage: ENDPOINT_SYNC_RECONCILE_FAILURE_STAGE.SERVICE,
              message: error.message
            }));
            continue;
          }
        }
        let groupFailed = stryMutAct_9fa48("145761") ? true : (stryCov_9fa48("145761"), false);
        for (const sliceManifest of sliceManifests) {
          if (stryMutAct_9fa48("145762")) {
            {}
          } else {
            stryCov_9fa48("145762");
            try {
              if (stryMutAct_9fa48("145763")) {
                {}
              } else {
                stryCov_9fa48("145763");
                await options.k8sClient.upsertEndpointSlice(sliceManifest);
                stryMutAct_9fa48("145764") ? summary.upsertedEndpointSlices -= 1 : (stryCov_9fa48("145764"), summary.upsertedEndpointSlices += 1);
              }
            } catch (error) {
              if (stryMutAct_9fa48("145765")) {
                {}
              } else {
                stryCov_9fa48("145765");
                groupFailed = stryMutAct_9fa48("145766") ? false : (stryCov_9fa48("145766"), true);
                summary.groupFailures.push(stryMutAct_9fa48("145767") ? {} : (stryCov_9fa48("145767"), {
                  serviceKey: plannedExport.serviceKey,
                  serviceName: plannedExport.serviceName,
                  protocol: plannedExport.protocol,
                  stage: ENDPOINT_SYNC_RECONCILE_FAILURE_STAGE.ENDPOINT_SLICE,
                  message: error.message
                }));
                break;
              }
            }
          }
        }
        if (stryMutAct_9fa48("145770") ? false : stryMutAct_9fa48("145769") ? true : stryMutAct_9fa48("145768") ? groupFailed : (stryCov_9fa48("145768", "145769", "145770"), !groupFailed)) {
          if (stryMutAct_9fa48("145771")) {
            {}
          } else {
            stryCov_9fa48("145771");
            stryMutAct_9fa48("145772") ? summary.exportedEndpoints -= plannedExport.endpointCount : (stryCov_9fa48("145772"), summary.exportedEndpoints += plannedExport.endpointCount);
          }
        }
      }
    }
    const existingServices = await options.k8sClient.listServices(options.namespace);
    const staleServiceNames = collectStaleManagedResourceNames(existingServices, desiredServiceNames);
    for (const serviceName of staleServiceNames) {
      if (stryMutAct_9fa48("145773")) {
        {}
      } else {
        stryCov_9fa48("145773");
        try {
          if (stryMutAct_9fa48("145774")) {
            {}
          } else {
            stryCov_9fa48("145774");
            await options.k8sClient.deleteService(options.namespace, serviceName);
            stryMutAct_9fa48("145775") ? summary.deletedServices -= 1 : (stryCov_9fa48("145775"), summary.deletedServices += 1);
          }
        } catch (error) {
          if (stryMutAct_9fa48("145776")) {
            {}
          } else {
            stryCov_9fa48("145776");
            summary.groupFailures.push(stryMutAct_9fa48("145777") ? {} : (stryCov_9fa48("145777"), {
              serviceKey: null,
              serviceName,
              protocol: null,
              stage: ENDPOINT_SYNC_RECONCILE_FAILURE_STAGE.GARBAGE_COLLECTION,
              message: error.message
            }));
          }
        }
      }
    }
    const existingEndpointSlices = await options.k8sClient.listEndpointSlices(options.namespace);
    const staleEndpointSliceNames = collectStaleManagedResourceNames(existingEndpointSlices, desiredEndpointSliceNames);
    for (const sliceName of staleEndpointSliceNames) {
      if (stryMutAct_9fa48("145778")) {
        {}
      } else {
        stryCov_9fa48("145778");
        try {
          if (stryMutAct_9fa48("145779")) {
            {}
          } else {
            stryCov_9fa48("145779");
            await options.k8sClient.deleteEndpointSlice(options.namespace, sliceName);
            stryMutAct_9fa48("145780") ? summary.deletedEndpointSlices -= 1 : (stryCov_9fa48("145780"), summary.deletedEndpointSlices += 1);
          }
        } catch (error) {
          if (stryMutAct_9fa48("145781")) {
            {}
          } else {
            stryCov_9fa48("145781");
            summary.groupFailures.push(stryMutAct_9fa48("145782") ? {} : (stryCov_9fa48("145782"), {
              serviceKey: null,
              serviceName: sliceName,
              protocol: null,
              stage: ENDPOINT_SYNC_RECONCILE_FAILURE_STAGE.GARBAGE_COLLECTION,
              message: error.message
            }));
          }
        }
      }
    }
    return stryMutAct_9fa48("145783") ? {} : (stryCov_9fa48("145783"), {
      desiredServices: summary.desiredServices,
      desiredEndpointSlices: summary.desiredEndpointSlices,
      upsertedServices: summary.upsertedServices,
      upsertedEndpointSlices: summary.upsertedEndpointSlices,
      exportedEndpoints: summary.exportedEndpoints,
      deletedServices: summary.deletedServices,
      deletedEndpointSlices: summary.deletedEndpointSlices,
      groupFailures: summary.groupFailures
    });
  }
}
export { K8S_KIND, K8S_API_VERSION, K8S_PROTOCOL, K8S_LABEL, K8S_RECONCILE_ERROR, REQUIRED_CLIENT_METHOD, RECONCILE_SUMMARY_DEFAULT, EndpointSyncReconcilerError, buildManagedLabels, buildServiceManifest, buildEndpointSliceManifest, isManagedResource, collectStaleManagedResourceNames, validateReconcileOptions, createReconcileSummary, reconcilePlannedExports };