/**
 * Kubernetes API adapter for endpoint-sync reconciliation.
 *
 * Implements the controller-required client contract for Service,
 * EndpointSlice, Lease, and Event resources.
 *
 * @module runtime/endpoint-sync-k8s-client
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
import { readFile } from 'node:fs/promises';
import { Agent } from 'node:https';
import { URLSearchParams } from 'node:url';
import fetch from 'node-fetch';
import { TYPEOF } from '../constants/index.js';
import { BaseError } from '../utils/base-error.js';
import { ENDPOINT_SYNC_LABEL } from './endpoint-sync-constants.js';
const K8S_DEFAULT = Object.freeze(stryMutAct_9fa48("145310") ? {} : (stryCov_9fa48("145310"), {
  API_HOST: stryMutAct_9fa48("145311") ? "" : (stryCov_9fa48("145311"), 'kubernetes.default.svc'),
  API_PORT_HTTPS: stryMutAct_9fa48("145312") ? "" : (stryCov_9fa48("145312"), '443'),
  SERVICE_ACCOUNT_TOKEN_PATH: stryMutAct_9fa48("145313") ? "" : (stryCov_9fa48("145313"), '/var/run/secrets/kubernetes.io/serviceaccount/token'),
  SERVICE_ACCOUNT_CA_PATH: stryMutAct_9fa48("145314") ? "" : (stryCov_9fa48("145314"), '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt'),
  SERVICE_ACCOUNT_NAMESPACE_PATH: stryMutAct_9fa48("145315") ? "" : (stryCov_9fa48("145315"), '/var/run/secrets/kubernetes.io/serviceaccount/namespace'),
  EVENT_COMPONENT: stryMutAct_9fa48("145316") ? "" : (stryCov_9fa48("145316"), 'endpoint-sync-controller'),
  EVENT_ACTION: stryMutAct_9fa48("145317") ? "" : (stryCov_9fa48("145317"), 'reconcile')
}));
const K8S_PATH = Object.freeze(stryMutAct_9fa48("145318") ? {} : (stryCov_9fa48("145318"), {
  SERVICES: stryMutAct_9fa48("145319") ? "" : (stryCov_9fa48("145319"), '/api/v1/namespaces/{namespace}/services'),
  SERVICE_BY_NAME: stryMutAct_9fa48("145320") ? "" : (stryCov_9fa48("145320"), '/api/v1/namespaces/{namespace}/services/{name}'),
  ENDPOINT_SLICES: stryMutAct_9fa48("145321") ? "" : (stryCov_9fa48("145321"), '/apis/discovery.k8s.io/v1/namespaces/{namespace}/endpointslices'),
  ENDPOINT_SLICE_BY_NAME: stryMutAct_9fa48("145322") ? "" : (stryCov_9fa48("145322"), '/apis/discovery.k8s.io/v1/namespaces/{namespace}/endpointslices/{name}'),
  LEASES: stryMutAct_9fa48("145323") ? "" : (stryCov_9fa48("145323"), '/apis/coordination.k8s.io/v1/namespaces/{namespace}/leases'),
  LEASE_BY_NAME: stryMutAct_9fa48("145324") ? "" : (stryCov_9fa48("145324"), '/apis/coordination.k8s.io/v1/namespaces/{namespace}/leases/{name}'),
  EVENTS: stryMutAct_9fa48("145325") ? "" : (stryCov_9fa48("145325"), '/api/v1/namespaces/{namespace}/events')
}));
const HTTP_METHOD = Object.freeze(stryMutAct_9fa48("145326") ? {} : (stryCov_9fa48("145326"), {
  GET: stryMutAct_9fa48("145327") ? "" : (stryCov_9fa48("145327"), 'GET'),
  POST: stryMutAct_9fa48("145328") ? "" : (stryCov_9fa48("145328"), 'POST'),
  PUT: stryMutAct_9fa48("145329") ? "" : (stryCov_9fa48("145329"), 'PUT'),
  DELETE: stryMutAct_9fa48("145330") ? "" : (stryCov_9fa48("145330"), 'DELETE')
}));
const HTTP_STATUS = Object.freeze(stryMutAct_9fa48("145331") ? {} : (stryCov_9fa48("145331"), {
  NOT_FOUND: 404
}));
const HEADER = Object.freeze(stryMutAct_9fa48("145332") ? {} : (stryCov_9fa48("145332"), {
  AUTHORIZATION: stryMutAct_9fa48("145333") ? "" : (stryCov_9fa48("145333"), 'authorization'),
  CONTENT_TYPE: stryMutAct_9fa48("145334") ? "" : (stryCov_9fa48("145334"), 'content-type'),
  ACCEPT: stryMutAct_9fa48("145335") ? "" : (stryCov_9fa48("145335"), 'accept'),
  APPLICATION_JSON: stryMutAct_9fa48("145336") ? "" : (stryCov_9fa48("145336"), 'application/json')
}));
const K8S_CLIENT_ERROR = Object.freeze(stryMutAct_9fa48("145337") ? {} : (stryCov_9fa48("145337"), {
  RESOURCE_VERSION_REQUIRED: stryMutAct_9fa48("145338") ? "" : (stryCov_9fa48("145338"), 'resourceVersion is required for update operation'),
  REQUEST_FAILED_PREFIX: stryMutAct_9fa48("145339") ? "" : (stryCov_9fa48("145339"), 'Kubernetes API request failed')
}));
const URL_TEMPLATE_PARAM = Object.freeze(stryMutAct_9fa48("145340") ? {} : (stryCov_9fa48("145340"), {
  NAMESPACE: stryMutAct_9fa48("145341") ? "" : (stryCov_9fa48("145341"), '{namespace}'),
  NAME: stryMutAct_9fa48("145342") ? "" : (stryCov_9fa48("145342"), '{name}')
}));
function encodePathPart(value) {
  if (stryMutAct_9fa48("145343")) {
    {}
  } else {
    stryCov_9fa48("145343");
    return encodeURIComponent(String(value));
  }
}
function buildPath(template, namespace, name = null) {
  if (stryMutAct_9fa48("145344")) {
    {}
  } else {
    stryCov_9fa48("145344");
    let path = template.replace(URL_TEMPLATE_PARAM.NAMESPACE, encodePathPart(namespace));
    if (stryMutAct_9fa48("145347") ? name === null : stryMutAct_9fa48("145346") ? false : stryMutAct_9fa48("145345") ? true : (stryCov_9fa48("145345", "145346", "145347"), name !== null)) {
      if (stryMutAct_9fa48("145348")) {
        {}
      } else {
        stryCov_9fa48("145348");
        path = path.replace(URL_TEMPLATE_PARAM.NAME, encodePathPart(name));
      }
    }
    return path;
  }
}
function buildLabelSelector() {
  if (stryMutAct_9fa48("145349")) {
    {}
  } else {
    stryCov_9fa48("145349");
    return (stryMutAct_9fa48("145350") ? [] : (stryCov_9fa48("145350"), [stryMutAct_9fa48("145351") ? `` : (stryCov_9fa48("145351"), `${ENDPOINT_SYNC_LABEL.MANAGED_KEY}=${ENDPOINT_SYNC_LABEL.MANAGED_VALUE}`), stryMutAct_9fa48("145352") ? `` : (stryCov_9fa48("145352"), `${ENDPOINT_SYNC_LABEL.SOURCE_KEY}=${ENDPOINT_SYNC_LABEL.SOURCE_VALUE}`)])).join(stryMutAct_9fa48("145353") ? "" : (stryCov_9fa48("145353"), ','));
  }
}
function buildApiServerUrl() {
  if (stryMutAct_9fa48("145354")) {
    {}
  } else {
    stryCov_9fa48("145354");
    const host = stryMutAct_9fa48("145357") ? process.env.KUBERNETES_SERVICE_HOST && K8S_DEFAULT.API_HOST : stryMutAct_9fa48("145356") ? false : stryMutAct_9fa48("145355") ? true : (stryCov_9fa48("145355", "145356", "145357"), process.env.KUBERNETES_SERVICE_HOST || K8S_DEFAULT.API_HOST);
    const port = stryMutAct_9fa48("145360") ? (process.env.KUBERNETES_SERVICE_PORT_HTTPS || process.env.KUBERNETES_SERVICE_PORT) && K8S_DEFAULT.API_PORT_HTTPS : stryMutAct_9fa48("145359") ? false : stryMutAct_9fa48("145358") ? true : (stryCov_9fa48("145358", "145359", "145360"), (stryMutAct_9fa48("145362") ? process.env.KUBERNETES_SERVICE_PORT_HTTPS && process.env.KUBERNETES_SERVICE_PORT : stryMutAct_9fa48("145361") ? false : (stryCov_9fa48("145361", "145362"), process.env.KUBERNETES_SERVICE_PORT_HTTPS || process.env.KUBERNETES_SERVICE_PORT)) || K8S_DEFAULT.API_PORT_HTTPS);
    return stryMutAct_9fa48("145363") ? `` : (stryCov_9fa48("145363"), `https://${host}:${port}`);
  }
}
function withQuery(path, query = {}) {
  if (stryMutAct_9fa48("145364")) {
    {}
  } else {
    stryCov_9fa48("145364");
    const queryEntries = stryMutAct_9fa48("145365") ? Object.entries(query) : (stryCov_9fa48("145365"), Object.entries(query).filter(stryMutAct_9fa48("145366") ? () => undefined : (stryCov_9fa48("145366"), ([, value]) => stryMutAct_9fa48("145369") ? value !== null && value !== undefined || value !== '' : stryMutAct_9fa48("145368") ? false : stryMutAct_9fa48("145367") ? true : (stryCov_9fa48("145367", "145368", "145369"), (stryMutAct_9fa48("145371") ? value !== null || value !== undefined : stryMutAct_9fa48("145370") ? true : (stryCov_9fa48("145370", "145371"), (stryMutAct_9fa48("145373") ? value === null : stryMutAct_9fa48("145372") ? true : (stryCov_9fa48("145372", "145373"), value !== null)) && (stryMutAct_9fa48("145375") ? value === undefined : stryMutAct_9fa48("145374") ? true : (stryCov_9fa48("145374", "145375"), value !== undefined)))) && (stryMutAct_9fa48("145377") ? value === '' : stryMutAct_9fa48("145376") ? true : (stryCov_9fa48("145376", "145377"), value !== (stryMutAct_9fa48("145378") ? "Stryker was here!" : (stryCov_9fa48("145378"), ''))))))));
    if (stryMutAct_9fa48("145381") ? queryEntries.length !== 0 : stryMutAct_9fa48("145380") ? false : stryMutAct_9fa48("145379") ? true : (stryCov_9fa48("145379", "145380", "145381"), queryEntries.length === 0)) {
      if (stryMutAct_9fa48("145382")) {
        {}
      } else {
        stryCov_9fa48("145382");
        return path;
      }
    }
    const params = new URLSearchParams();
    for (const [key, value] of queryEntries) {
      if (stryMutAct_9fa48("145383")) {
        {}
      } else {
        stryCov_9fa48("145383");
        params.append(key, String(value));
      }
    }
    return stryMutAct_9fa48("145384") ? `` : (stryCov_9fa48("145384"), `${path}?${params.toString()}`);
  }
}
function parseK8sErrorMessage(payload, statusCode) {
  if (stryMutAct_9fa48("145385")) {
    {}
  } else {
    stryCov_9fa48("145385");
    if (stryMutAct_9fa48("145388") ? payload && typeof payload === TYPEOF.OBJECT || typeof payload.message === TYPEOF.STRING : stryMutAct_9fa48("145387") ? false : stryMutAct_9fa48("145386") ? true : (stryCov_9fa48("145386", "145387", "145388"), (stryMutAct_9fa48("145390") ? payload || typeof payload === TYPEOF.OBJECT : stryMutAct_9fa48("145389") ? true : (stryCov_9fa48("145389", "145390"), payload && (stryMutAct_9fa48("145392") ? typeof payload !== TYPEOF.OBJECT : stryMutAct_9fa48("145391") ? true : (stryCov_9fa48("145391", "145392"), typeof payload === TYPEOF.OBJECT)))) && (stryMutAct_9fa48("145394") ? typeof payload.message !== TYPEOF.STRING : stryMutAct_9fa48("145393") ? true : (stryCov_9fa48("145393", "145394"), typeof payload.message === TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("145395")) {
        {}
      } else {
        stryCov_9fa48("145395");
        return payload.message;
      }
    }
    return stryMutAct_9fa48("145396") ? `` : (stryCov_9fa48("145396"), `status=${statusCode}`);
  }
}
class EndpointSyncK8sClientError extends BaseError {
  constructor(message, metadata = {}, cause = undefined) {
    if (stryMutAct_9fa48("145397")) {
      {}
    } else {
      stryCov_9fa48("145397");
      super(message, stryMutAct_9fa48("145398") ? {} : (stryCov_9fa48("145398"), {
        cause,
        context: stryMutAct_9fa48("145399") ? {} : (stryCov_9fa48("145399"), {
          component: stryMutAct_9fa48("145400") ? "" : (stryCov_9fa48("145400"), 'EndpointSyncK8sClient'),
          operation: stryMutAct_9fa48("145401") ? "" : (stryCov_9fa48("145401"), 'request'),
          metadata
        })
      }));
    }
  }
}
async function readOptionalFile(filePath) {
  if (stryMutAct_9fa48("145402")) {
    {}
  } else {
    stryCov_9fa48("145402");
    try {
      if (stryMutAct_9fa48("145403")) {
        {}
      } else {
        stryCov_9fa48("145403");
        return await readFile(filePath, stryMutAct_9fa48("145404") ? "" : (stryCov_9fa48("145404"), 'utf8'));
      }
    } catch (_error) {
      if (stryMutAct_9fa48("145405")) {
        {}
      } else {
        stryCov_9fa48("145405");
        return null;
      }
    }
  }
}
async function readK8sServiceAccountFiles() {
  if (stryMutAct_9fa48("145406")) {
    {}
  } else {
    stryCov_9fa48("145406");
    const [tokenRaw, caRaw, namespaceRaw] = await Promise.all(stryMutAct_9fa48("145407") ? [] : (stryCov_9fa48("145407"), [readOptionalFile(K8S_DEFAULT.SERVICE_ACCOUNT_TOKEN_PATH), readOptionalFile(K8S_DEFAULT.SERVICE_ACCOUNT_CA_PATH), readOptionalFile(K8S_DEFAULT.SERVICE_ACCOUNT_NAMESPACE_PATH)]));
    return stryMutAct_9fa48("145408") ? {} : (stryCov_9fa48("145408"), {
      token: (stryMutAct_9fa48("145411") ? typeof tokenRaw !== TYPEOF.STRING : stryMutAct_9fa48("145410") ? false : stryMutAct_9fa48("145409") ? true : (stryCov_9fa48("145409", "145410", "145411"), typeof tokenRaw === TYPEOF.STRING)) ? stryMutAct_9fa48("145412") ? tokenRaw : (stryCov_9fa48("145412"), tokenRaw.trim()) : stryMutAct_9fa48("145413") ? "Stryker was here!" : (stryCov_9fa48("145413"), ''),
      caCert: (stryMutAct_9fa48("145416") ? typeof caRaw !== TYPEOF.STRING : stryMutAct_9fa48("145415") ? false : stryMutAct_9fa48("145414") ? true : (stryCov_9fa48("145414", "145415", "145416"), typeof caRaw === TYPEOF.STRING)) ? caRaw : stryMutAct_9fa48("145417") ? "Stryker was here!" : (stryCov_9fa48("145417"), ''),
      namespace: (stryMutAct_9fa48("145420") ? typeof namespaceRaw !== TYPEOF.STRING : stryMutAct_9fa48("145419") ? false : stryMutAct_9fa48("145418") ? true : (stryCov_9fa48("145418", "145419", "145420"), typeof namespaceRaw === TYPEOF.STRING)) ? stryMutAct_9fa48("145421") ? namespaceRaw : (stryCov_9fa48("145421"), namespaceRaw.trim()) : stryMutAct_9fa48("145422") ? "Stryker was here!" : (stryCov_9fa48("145422"), '')
    });
  }
}
function buildEventManifest(event) {
  if (stryMutAct_9fa48("145423")) {
    {}
  } else {
    stryCov_9fa48("145423");
    const nowIso = new Date().toISOString();
    const involvedKind = event.serviceName ? stryMutAct_9fa48("145424") ? "" : (stryCov_9fa48("145424"), 'Service') : stryMutAct_9fa48("145425") ? "" : (stryCov_9fa48("145425"), 'Namespace');
    const involvedName = stryMutAct_9fa48("145428") ? event.serviceName && event.namespace : stryMutAct_9fa48("145427") ? false : stryMutAct_9fa48("145426") ? true : (stryCov_9fa48("145426", "145427", "145428"), event.serviceName || event.namespace);
    return stryMutAct_9fa48("145429") ? {} : (stryCov_9fa48("145429"), {
      apiVersion: stryMutAct_9fa48("145430") ? "" : (stryCov_9fa48("145430"), 'v1'),
      kind: stryMutAct_9fa48("145431") ? "" : (stryCov_9fa48("145431"), 'Event'),
      metadata: stryMutAct_9fa48("145432") ? {} : (stryCov_9fa48("145432"), {
        namespace: event.namespace,
        generateName: stryMutAct_9fa48("145433") ? "" : (stryCov_9fa48("145433"), 'endpoint-sync-controller-')
      }),
      involvedObject: stryMutAct_9fa48("145434") ? {} : (stryCov_9fa48("145434"), {
        apiVersion: stryMutAct_9fa48("145435") ? "" : (stryCov_9fa48("145435"), 'v1'),
        kind: involvedKind,
        namespace: event.namespace,
        name: involvedName
      }),
      reason: event.reason,
      message: event.message,
      type: event.type,
      action: K8S_DEFAULT.EVENT_ACTION,
      source: stryMutAct_9fa48("145436") ? {} : (stryCov_9fa48("145436"), {
        component: K8S_DEFAULT.EVENT_COMPONENT,
        host: stryMutAct_9fa48("145439") ? (event.serviceKey || event.serviceName) && null : stryMutAct_9fa48("145438") ? false : stryMutAct_9fa48("145437") ? true : (stryCov_9fa48("145437", "145438", "145439"), (stryMutAct_9fa48("145441") ? event.serviceKey && event.serviceName : stryMutAct_9fa48("145440") ? false : (stryCov_9fa48("145440", "145441"), event.serviceKey || event.serviceName)) || null)
      }),
      firstTimestamp: nowIso,
      lastTimestamp: nowIso,
      count: 1
    });
  }
}
class EndpointSyncK8sClient {
  constructor(options) {
    if (stryMutAct_9fa48("145442")) {
      {}
    } else {
      stryCov_9fa48("145442");
      this._apiServerUrl = options.apiServerUrl;
      this._token = options.token;
      this._defaultNamespace = options.defaultNamespace;
      this._fetchImpl = stryMutAct_9fa48("145445") ? options.fetchImpl && fetch : stryMutAct_9fa48("145444") ? false : stryMutAct_9fa48("145443") ? true : (stryCov_9fa48("145443", "145444", "145445"), options.fetchImpl || fetch);
      this._httpsAgent = stryMutAct_9fa48("145448") ? options.httpsAgent && new Agent({
        ca: options.caCert || undefined,
        rejectUnauthorized: true
      }) : stryMutAct_9fa48("145447") ? false : stryMutAct_9fa48("145446") ? true : (stryCov_9fa48("145446", "145447", "145448"), options.httpsAgent || new Agent(stryMutAct_9fa48("145449") ? {} : (stryCov_9fa48("145449"), {
        ca: stryMutAct_9fa48("145452") ? options.caCert && undefined : stryMutAct_9fa48("145451") ? false : stryMutAct_9fa48("145450") ? true : (stryCov_9fa48("145450", "145451", "145452"), options.caCert || undefined),
        rejectUnauthorized: stryMutAct_9fa48("145453") ? false : (stryCov_9fa48("145453"), true)
      })));
    }
  }
  static async create(options = {}) {
    if (stryMutAct_9fa48("145454")) {
      {}
    } else {
      stryCov_9fa48("145454");
      const serviceAccount = await readK8sServiceAccountFiles();
      const apiServerUrl = stryMutAct_9fa48("145457") ? options.apiServerUrl && buildApiServerUrl() : stryMutAct_9fa48("145456") ? false : stryMutAct_9fa48("145455") ? true : (stryCov_9fa48("145455", "145456", "145457"), options.apiServerUrl || buildApiServerUrl());
      const token = stryMutAct_9fa48("145460") ? options.token && serviceAccount.token : stryMutAct_9fa48("145459") ? false : stryMutAct_9fa48("145458") ? true : (stryCov_9fa48("145458", "145459", "145460"), options.token || serviceAccount.token);
      const caCert = stryMutAct_9fa48("145463") ? options.caCert && serviceAccount.caCert : stryMutAct_9fa48("145462") ? false : stryMutAct_9fa48("145461") ? true : (stryCov_9fa48("145461", "145462", "145463"), options.caCert || serviceAccount.caCert);
      const defaultNamespace = stryMutAct_9fa48("145466") ? (options.defaultNamespace || serviceAccount.namespace) && '' : stryMutAct_9fa48("145465") ? false : stryMutAct_9fa48("145464") ? true : (stryCov_9fa48("145464", "145465", "145466"), (stryMutAct_9fa48("145468") ? options.defaultNamespace && serviceAccount.namespace : stryMutAct_9fa48("145467") ? false : (stryCov_9fa48("145467", "145468"), options.defaultNamespace || serviceAccount.namespace)) || (stryMutAct_9fa48("145469") ? "Stryker was here!" : (stryCov_9fa48("145469"), '')));
      return new EndpointSyncK8sClient(stryMutAct_9fa48("145470") ? {} : (stryCov_9fa48("145470"), {
        apiServerUrl,
        token,
        caCert,
        defaultNamespace,
        fetchImpl: stryMutAct_9fa48("145473") ? options.fetchImpl && fetch : stryMutAct_9fa48("145472") ? false : stryMutAct_9fa48("145471") ? true : (stryCov_9fa48("145471", "145472", "145473"), options.fetchImpl || fetch),
        httpsAgent: options.httpsAgent
      }));
    }
  }
  getDefaultNamespace() {
    if (stryMutAct_9fa48("145474")) {
      {}
    } else {
      stryCov_9fa48("145474");
      return this._defaultNamespace;
    }
  }
  async _request(method, path, body = null, options = {}) {
    if (stryMutAct_9fa48("145475")) {
      {}
    } else {
      stryCov_9fa48("145475");
      const headers = stryMutAct_9fa48("145476") ? {} : (stryCov_9fa48("145476"), {
        [HEADER.ACCEPT]: HEADER.APPLICATION_JSON
      });
      if (stryMutAct_9fa48("145479") ? typeof this._token === TYPEOF.STRING || this._token.length > 0 : stryMutAct_9fa48("145478") ? false : stryMutAct_9fa48("145477") ? true : (stryCov_9fa48("145477", "145478", "145479"), (stryMutAct_9fa48("145481") ? typeof this._token !== TYPEOF.STRING : stryMutAct_9fa48("145480") ? true : (stryCov_9fa48("145480", "145481"), typeof this._token === TYPEOF.STRING)) && (stryMutAct_9fa48("145484") ? this._token.length <= 0 : stryMutAct_9fa48("145483") ? this._token.length >= 0 : stryMutAct_9fa48("145482") ? true : (stryCov_9fa48("145482", "145483", "145484"), this._token.length > 0)))) {
        if (stryMutAct_9fa48("145485")) {
          {}
        } else {
          stryCov_9fa48("145485");
          headers[HEADER.AUTHORIZATION] = stryMutAct_9fa48("145486") ? `` : (stryCov_9fa48("145486"), `Bearer ${this._token}`);
        }
      }
      if (stryMutAct_9fa48("145489") ? body === null : stryMutAct_9fa48("145488") ? false : stryMutAct_9fa48("145487") ? true : (stryCov_9fa48("145487", "145488", "145489"), body !== null)) {
        if (stryMutAct_9fa48("145490")) {
          {}
        } else {
          stryCov_9fa48("145490");
          headers[HEADER.CONTENT_TYPE] = HEADER.APPLICATION_JSON;
        }
      }
      const response = await this._fetchImpl(stryMutAct_9fa48("145491") ? `` : (stryCov_9fa48("145491"), `${this._apiServerUrl}${path}`), stryMutAct_9fa48("145492") ? {} : (stryCov_9fa48("145492"), {
        method,
        headers,
        body: (stryMutAct_9fa48("145495") ? body !== null : stryMutAct_9fa48("145494") ? false : stryMutAct_9fa48("145493") ? true : (stryCov_9fa48("145493", "145494", "145495"), body === null)) ? undefined : JSON.stringify(body),
        agent: this._httpsAgent
      }));
      let payload = null;
      const rawText = await response.text();
      if (stryMutAct_9fa48("145499") ? rawText.length <= 0 : stryMutAct_9fa48("145498") ? rawText.length >= 0 : stryMutAct_9fa48("145497") ? false : stryMutAct_9fa48("145496") ? true : (stryCov_9fa48("145496", "145497", "145498", "145499"), rawText.length > 0)) {
        if (stryMutAct_9fa48("145500")) {
          {}
        } else {
          stryCov_9fa48("145500");
          try {
            if (stryMutAct_9fa48("145501")) {
              {}
            } else {
              stryCov_9fa48("145501");
              payload = JSON.parse(rawText);
            }
          } catch (_error) {
            if (stryMutAct_9fa48("145502")) {
              {}
            } else {
              stryCov_9fa48("145502");
              payload = null;
            }
          }
        }
      }
      if (stryMutAct_9fa48("145505") ? options.allowNotFound === true || response.status === HTTP_STATUS.NOT_FOUND : stryMutAct_9fa48("145504") ? false : stryMutAct_9fa48("145503") ? true : (stryCov_9fa48("145503", "145504", "145505"), (stryMutAct_9fa48("145507") ? options.allowNotFound !== true : stryMutAct_9fa48("145506") ? true : (stryCov_9fa48("145506", "145507"), options.allowNotFound === (stryMutAct_9fa48("145508") ? false : (stryCov_9fa48("145508"), true)))) && (stryMutAct_9fa48("145510") ? response.status !== HTTP_STATUS.NOT_FOUND : stryMutAct_9fa48("145509") ? true : (stryCov_9fa48("145509", "145510"), response.status === HTTP_STATUS.NOT_FOUND)))) {
        if (stryMutAct_9fa48("145511")) {
          {}
        } else {
          stryCov_9fa48("145511");
          return null;
        }
      }
      if (stryMutAct_9fa48("145514") ? false : stryMutAct_9fa48("145513") ? true : stryMutAct_9fa48("145512") ? response.ok : (stryCov_9fa48("145512", "145513", "145514"), !response.ok)) {
        if (stryMutAct_9fa48("145515")) {
          {}
        } else {
          stryCov_9fa48("145515");
          throw new EndpointSyncK8sClientError(stryMutAct_9fa48("145516") ? `` : (stryCov_9fa48("145516"), `${K8S_CLIENT_ERROR.REQUEST_FAILED_PREFIX}: ${method} ${path}`), stryMutAct_9fa48("145517") ? {} : (stryCov_9fa48("145517"), {
            statusCode: response.status,
            message: parseK8sErrorMessage(payload, response.status)
          }));
        }
      }
      return payload;
    }
  }
  async _createOrUpdateByName({
    namespace,
    name,
    listPath,
    itemPath,
    manifest
  }) {
    if (stryMutAct_9fa48("145518")) {
      {}
    } else {
      stryCov_9fa48("145518");
      const existing = await this._request(HTTP_METHOD.GET, buildPath(itemPath, namespace, name), null, stryMutAct_9fa48("145519") ? {} : (stryCov_9fa48("145519"), {
        allowNotFound: stryMutAct_9fa48("145520") ? false : (stryCov_9fa48("145520"), true)
      }));
      if (stryMutAct_9fa48("145523") ? false : stryMutAct_9fa48("145522") ? true : stryMutAct_9fa48("145521") ? existing : (stryCov_9fa48("145521", "145522", "145523"), !existing)) {
        if (stryMutAct_9fa48("145524")) {
          {}
        } else {
          stryCov_9fa48("145524");
          return this._request(HTTP_METHOD.POST, buildPath(listPath, namespace), manifest);
        }
      }
      const updateManifest = stryMutAct_9fa48("145525") ? {} : (stryCov_9fa48("145525"), {
        ...manifest,
        metadata: stryMutAct_9fa48("145526") ? {} : (stryCov_9fa48("145526"), {
          ...manifest.metadata,
          resourceVersion: stryMutAct_9fa48("145528") ? existing.metadata?.resourceVersion : stryMutAct_9fa48("145527") ? existing?.metadata.resourceVersion : (stryCov_9fa48("145527", "145528"), existing?.metadata?.resourceVersion)
        })
      });
      return this._request(HTTP_METHOD.PUT, buildPath(itemPath, namespace, name), updateManifest);
    }
  }
  async upsertService(manifest) {
    if (stryMutAct_9fa48("145529")) {
      {}
    } else {
      stryCov_9fa48("145529");
      const namespace = stryMutAct_9fa48("145531") ? manifest.metadata?.namespace : stryMutAct_9fa48("145530") ? manifest?.metadata.namespace : (stryCov_9fa48("145530", "145531"), manifest?.metadata?.namespace);
      const name = stryMutAct_9fa48("145533") ? manifest.metadata?.name : stryMutAct_9fa48("145532") ? manifest?.metadata.name : (stryCov_9fa48("145532", "145533"), manifest?.metadata?.name);
      const existing = await this._request(HTTP_METHOD.GET, buildPath(K8S_PATH.SERVICE_BY_NAME, namespace, name), null, stryMutAct_9fa48("145534") ? {} : (stryCov_9fa48("145534"), {
        allowNotFound: stryMutAct_9fa48("145535") ? false : (stryCov_9fa48("145535"), true)
      }));
      if (stryMutAct_9fa48("145538") ? false : stryMutAct_9fa48("145537") ? true : stryMutAct_9fa48("145536") ? existing : (stryCov_9fa48("145536", "145537", "145538"), !existing)) {
        if (stryMutAct_9fa48("145539")) {
          {}
        } else {
          stryCov_9fa48("145539");
          await this._request(HTTP_METHOD.POST, buildPath(K8S_PATH.SERVICES, namespace), manifest);
          return;
        }
      }
      const updateManifest = stryMutAct_9fa48("145540") ? {} : (stryCov_9fa48("145540"), {
        ...manifest,
        metadata: stryMutAct_9fa48("145541") ? {} : (stryCov_9fa48("145541"), {
          ...manifest.metadata,
          resourceVersion: stryMutAct_9fa48("145543") ? existing.metadata?.resourceVersion : stryMutAct_9fa48("145542") ? existing?.metadata.resourceVersion : (stryCov_9fa48("145542", "145543"), existing?.metadata?.resourceVersion)
        }),
        spec: stryMutAct_9fa48("145544") ? {} : (stryCov_9fa48("145544"), {
          ...manifest.spec
        })
      });
      if (stryMutAct_9fa48("145548") ? existing.spec?.clusterIP : stryMutAct_9fa48("145547") ? existing?.spec.clusterIP : stryMutAct_9fa48("145546") ? false : stryMutAct_9fa48("145545") ? true : (stryCov_9fa48("145545", "145546", "145547", "145548"), existing?.spec?.clusterIP)) {
        if (stryMutAct_9fa48("145549")) {
          {}
        } else {
          stryCov_9fa48("145549");
          updateManifest.spec.clusterIP = existing.spec.clusterIP;
        }
      }
      if (stryMutAct_9fa48("145552") ? Array.isArray(existing?.spec?.clusterIPs) || existing.spec.clusterIPs.length > 0 : stryMutAct_9fa48("145551") ? false : stryMutAct_9fa48("145550") ? true : (stryCov_9fa48("145550", "145551", "145552"), Array.isArray(stryMutAct_9fa48("145554") ? existing.spec?.clusterIPs : stryMutAct_9fa48("145553") ? existing?.spec.clusterIPs : (stryCov_9fa48("145553", "145554"), existing?.spec?.clusterIPs)) && (stryMutAct_9fa48("145557") ? existing.spec.clusterIPs.length <= 0 : stryMutAct_9fa48("145556") ? existing.spec.clusterIPs.length >= 0 : stryMutAct_9fa48("145555") ? true : (stryCov_9fa48("145555", "145556", "145557"), existing.spec.clusterIPs.length > 0)))) {
        if (stryMutAct_9fa48("145558")) {
          {}
        } else {
          stryCov_9fa48("145558");
          updateManifest.spec.clusterIPs = existing.spec.clusterIPs;
        }
      }
      await this._request(HTTP_METHOD.PUT, buildPath(K8S_PATH.SERVICE_BY_NAME, namespace, name), updateManifest);
    }
  }
  async upsertEndpointSlice(manifest) {
    if (stryMutAct_9fa48("145559")) {
      {}
    } else {
      stryCov_9fa48("145559");
      await this._createOrUpdateByName(stryMutAct_9fa48("145560") ? {} : (stryCov_9fa48("145560"), {
        namespace: stryMutAct_9fa48("145562") ? manifest.metadata?.namespace : stryMutAct_9fa48("145561") ? manifest?.metadata.namespace : (stryCov_9fa48("145561", "145562"), manifest?.metadata?.namespace),
        name: stryMutAct_9fa48("145564") ? manifest.metadata?.name : stryMutAct_9fa48("145563") ? manifest?.metadata.name : (stryCov_9fa48("145563", "145564"), manifest?.metadata?.name),
        listPath: K8S_PATH.ENDPOINT_SLICES,
        itemPath: K8S_PATH.ENDPOINT_SLICE_BY_NAME,
        manifest
      }));
    }
  }
  async listServices(namespace) {
    if (stryMutAct_9fa48("145565")) {
      {}
    } else {
      stryCov_9fa48("145565");
      const selector = buildLabelSelector();
      const payload = await this._request(HTTP_METHOD.GET, withQuery(buildPath(K8S_PATH.SERVICES, namespace), stryMutAct_9fa48("145566") ? {} : (stryCov_9fa48("145566"), {
        labelSelector: selector
      })));
      return Array.isArray(stryMutAct_9fa48("145567") ? payload.items : (stryCov_9fa48("145567"), payload?.items)) ? payload.items : stryMutAct_9fa48("145568") ? ["Stryker was here"] : (stryCov_9fa48("145568"), []);
    }
  }
  async listEndpointSlices(namespace) {
    if (stryMutAct_9fa48("145569")) {
      {}
    } else {
      stryCov_9fa48("145569");
      const selector = buildLabelSelector();
      const payload = await this._request(HTTP_METHOD.GET, withQuery(buildPath(K8S_PATH.ENDPOINT_SLICES, namespace), stryMutAct_9fa48("145570") ? {} : (stryCov_9fa48("145570"), {
        labelSelector: selector
      })));
      return Array.isArray(stryMutAct_9fa48("145571") ? payload.items : (stryCov_9fa48("145571"), payload?.items)) ? payload.items : stryMutAct_9fa48("145572") ? ["Stryker was here"] : (stryCov_9fa48("145572"), []);
    }
  }
  async deleteService(namespace, name) {
    if (stryMutAct_9fa48("145573")) {
      {}
    } else {
      stryCov_9fa48("145573");
      await this._request(HTTP_METHOD.DELETE, buildPath(K8S_PATH.SERVICE_BY_NAME, namespace, name), null, stryMutAct_9fa48("145574") ? {} : (stryCov_9fa48("145574"), {
        allowNotFound: stryMutAct_9fa48("145575") ? false : (stryCov_9fa48("145575"), true)
      }));
    }
  }
  async deleteEndpointSlice(namespace, name) {
    if (stryMutAct_9fa48("145576")) {
      {}
    } else {
      stryCov_9fa48("145576");
      await this._request(HTTP_METHOD.DELETE, buildPath(K8S_PATH.ENDPOINT_SLICE_BY_NAME, namespace, name), null, stryMutAct_9fa48("145577") ? {} : (stryCov_9fa48("145577"), {
        allowNotFound: stryMutAct_9fa48("145578") ? false : (stryCov_9fa48("145578"), true)
      }));
    }
  }
  async getLease(namespace, name) {
    if (stryMutAct_9fa48("145579")) {
      {}
    } else {
      stryCov_9fa48("145579");
      return this._request(HTTP_METHOD.GET, buildPath(K8S_PATH.LEASE_BY_NAME, namespace, name), null, stryMutAct_9fa48("145580") ? {} : (stryCov_9fa48("145580"), {
        allowNotFound: stryMutAct_9fa48("145581") ? false : (stryCov_9fa48("145581"), true)
      }));
    }
  }
  async createLease(manifest) {
    if (stryMutAct_9fa48("145582")) {
      {}
    } else {
      stryCov_9fa48("145582");
      await this._request(HTTP_METHOD.POST, buildPath(K8S_PATH.LEASES, manifest.metadata.namespace), manifest);
    }
  }
  async updateLease(manifest) {
    if (stryMutAct_9fa48("145583")) {
      {}
    } else {
      stryCov_9fa48("145583");
      const resourceVersion = stryMutAct_9fa48("145586") ? manifest?.metadata?.resourceVersion && '' : stryMutAct_9fa48("145585") ? false : stryMutAct_9fa48("145584") ? true : (stryCov_9fa48("145584", "145585", "145586"), (stryMutAct_9fa48("145588") ? manifest.metadata?.resourceVersion : stryMutAct_9fa48("145587") ? manifest?.metadata.resourceVersion : (stryCov_9fa48("145587", "145588"), manifest?.metadata?.resourceVersion)) || (stryMutAct_9fa48("145589") ? "Stryker was here!" : (stryCov_9fa48("145589"), '')));
      if (stryMutAct_9fa48("145592") ? typeof resourceVersion !== TYPEOF.STRING && resourceVersion.length === 0 : stryMutAct_9fa48("145591") ? false : stryMutAct_9fa48("145590") ? true : (stryCov_9fa48("145590", "145591", "145592"), (stryMutAct_9fa48("145594") ? typeof resourceVersion === TYPEOF.STRING : stryMutAct_9fa48("145593") ? false : (stryCov_9fa48("145593", "145594"), typeof resourceVersion !== TYPEOF.STRING)) || (stryMutAct_9fa48("145596") ? resourceVersion.length !== 0 : stryMutAct_9fa48("145595") ? false : (stryCov_9fa48("145595", "145596"), resourceVersion.length === 0)))) {
        if (stryMutAct_9fa48("145597")) {
          {}
        } else {
          stryCov_9fa48("145597");
          throw new EndpointSyncK8sClientError(K8S_CLIENT_ERROR.RESOURCE_VERSION_REQUIRED);
        }
      }
      await this._request(HTTP_METHOD.PUT, buildPath(K8S_PATH.LEASE_BY_NAME, manifest.metadata.namespace, manifest.metadata.name), manifest);
    }
  }
  async recordEvent(event) {
    if (stryMutAct_9fa48("145598")) {
      {}
    } else {
      stryCov_9fa48("145598");
      const namespace = stryMutAct_9fa48("145601") ? event?.namespace && this._defaultNamespace : stryMutAct_9fa48("145600") ? false : stryMutAct_9fa48("145599") ? true : (stryCov_9fa48("145599", "145600", "145601"), (stryMutAct_9fa48("145602") ? event.namespace : (stryCov_9fa48("145602"), event?.namespace)) || this._defaultNamespace);
      if (stryMutAct_9fa48("145605") ? typeof namespace !== TYPEOF.STRING && namespace.length === 0 : stryMutAct_9fa48("145604") ? false : stryMutAct_9fa48("145603") ? true : (stryCov_9fa48("145603", "145604", "145605"), (stryMutAct_9fa48("145607") ? typeof namespace === TYPEOF.STRING : stryMutAct_9fa48("145606") ? false : (stryCov_9fa48("145606", "145607"), typeof namespace !== TYPEOF.STRING)) || (stryMutAct_9fa48("145609") ? namespace.length !== 0 : stryMutAct_9fa48("145608") ? false : (stryCov_9fa48("145608", "145609"), namespace.length === 0)))) {
        if (stryMutAct_9fa48("145610")) {
          {}
        } else {
          stryCov_9fa48("145610");
          return;
        }
      }
      const manifest = buildEventManifest(stryMutAct_9fa48("145611") ? {} : (stryCov_9fa48("145611"), {
        ...event,
        namespace
      }));
      await this._request(HTTP_METHOD.POST, buildPath(K8S_PATH.EVENTS, namespace), manifest);
    }
  }
}
export { K8S_DEFAULT, K8S_PATH, HTTP_METHOD, HTTP_STATUS, HEADER, K8S_CLIENT_ERROR, URL_TEMPLATE_PARAM, EndpointSyncK8sClientError, encodePathPart, buildPath, buildLabelSelector, buildApiServerUrl, withQuery, parseK8sErrorMessage, readOptionalFile, readK8sServiceAccountFiles, buildEventManifest, EndpointSyncK8sClient };