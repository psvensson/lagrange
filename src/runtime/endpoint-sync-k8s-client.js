/**
 * Kubernetes API adapter for endpoint-sync reconciliation.
 *
 * Implements the controller-required client contract for Service,
 * EndpointSlice, Lease, and Event resources.
 *
 * @module runtime/endpoint-sync-k8s-client
 */

import {readFile} from 'node:fs/promises';
import {Agent} from 'node:https';
import {URLSearchParams} from 'node:url';
import fetch from 'node-fetch';
import {TYPEOF} from '../constants/index.js';
import {BaseError} from '../utils/base-error.js';
import {
  ENDPOINT_SYNC_LABEL,
} from './endpoint-sync-constants.js';

const LOCAL_STR_COMMA = ',';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_FEBQQ = 'EndpointSyncK8sClient';
const LOCAL_STR_REQUEST = 'request';
const LOCAL_STR_UTF8 = 'utf8';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_V1 = 'v1';
const LOCAL_STR_EVENT = 'Event';
const LOCAL_STR_168NE = 'endpoint-sync-controller-';
const LOCAL_NUM_ONE = 1;

const K8S_DEFAULT = Object.freeze({
  API_HOST: 'kubernetes.default.svc',
  API_PORT_HTTPS: '443',
  SERVICE_ACCOUNT_TOKEN_PATH:
    '/var/run/secrets/kubernetes.io/serviceaccount/token',
  SERVICE_ACCOUNT_CA_PATH:
    '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt',
  SERVICE_ACCOUNT_NAMESPACE_PATH:
    '/var/run/secrets/kubernetes.io/serviceaccount/namespace',
  EVENT_COMPONENT: 'endpoint-sync-controller',
  EVENT_ACTION: 'reconcile',
});

const K8S_PATH = Object.freeze({
  SERVICES: '/api/v1/namespaces/{namespace}/services',
  SERVICE_BY_NAME: '/api/v1/namespaces/{namespace}/services/{name}',
  ENDPOINT_SLICES:
    '/apis/discovery.k8s.io/v1/namespaces/{namespace}/endpointslices',
  ENDPOINT_SLICE_BY_NAME:
    '/apis/discovery.k8s.io/v1/namespaces/{namespace}/endpointslices/{name}',
  LEASES: '/apis/coordination.k8s.io/v1/namespaces/{namespace}/leases',
  LEASE_BY_NAME: '/apis/coordination.k8s.io/v1/namespaces/{namespace}/leases/{name}',
  EVENTS: '/api/v1/namespaces/{namespace}/events',
});

const HTTP_METHOD = Object.freeze({
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
});

const HTTP_STATUS = Object.freeze({
  NOT_FOUND: 404,
});

const HEADER = Object.freeze({
  AUTHORIZATION: 'authorization',
  CONTENT_TYPE: 'content-type',
  ACCEPT: 'accept',
  APPLICATION_JSON: 'application/json',
});

const K8S_CLIENT_ERROR = Object.freeze({
  RESOURCE_VERSION_REQUIRED:
    'resourceVersion is required for update operation',
  REQUEST_FAILED_PREFIX:
    'Kubernetes API request failed',
});

const URL_TEMPLATE_PARAM = Object.freeze({
  NAMESPACE: '{namespace}',
  NAME: '{name}',
});

function encodePathPart(value) {
  return encodeURIComponent(String(value));
}

function buildPath(template, namespace, name = null) {
  let path = template.replace(
    URL_TEMPLATE_PARAM.NAMESPACE,
    encodePathPart(namespace),
  );
  if (name !== null) {
    path = path.replace(URL_TEMPLATE_PARAM.NAME, encodePathPart(name));
  }
  return path;
}

function buildLabelSelector() {
  return [
    `${ENDPOINT_SYNC_LABEL.MANAGED_KEY}=${ENDPOINT_SYNC_LABEL.MANAGED_VALUE}`,
    `${ENDPOINT_SYNC_LABEL.SOURCE_KEY}=${ENDPOINT_SYNC_LABEL.SOURCE_VALUE}`,
  ].join(LOCAL_STR_COMMA);
}

function buildApiServerUrl() {
  const host = process.env.KUBERNETES_SERVICE_HOST || K8S_DEFAULT.API_HOST;
  const port =
    process.env.KUBERNETES_SERVICE_PORT_HTTPS ||
    process.env.KUBERNETES_SERVICE_PORT ||
    K8S_DEFAULT.API_PORT_HTTPS;
  return `https://${host}:${port}`;
}

function withQuery(path, query = {}) {
  const queryEntries = Object.entries(query)
    .filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (queryEntries.length === LOCAL_NUM_ZERO) {
    return path;
  }

  const params = new URLSearchParams();
  for (const [key, value] of queryEntries) {
    params.append(key, String(value));
  }
  return `${path}?${params.toString()}`;
}

function parseK8sErrorMessage(payload, statusCode) {
  if (payload && typeof payload === TYPEOF.OBJECT &&
    typeof payload.message === TYPEOF.STRING) {
    return payload.message;
  }
  return `status=${statusCode}`;
}

class EndpointSyncK8sClientError extends BaseError {
  constructor(message, metadata = {}, cause = undefined) {
    super(message, {
      cause,
      context: {
        component: LOCAL_STR_FEBQQ,
        operation: LOCAL_STR_REQUEST,
        metadata,
      },
    });
  }
}

async function readOptionalFile(filePath) {
  try {
    return await readFile(filePath, LOCAL_STR_UTF8);
  } catch (_error) {
    return null;
  }
}

async function readK8sServiceAccountFiles() {
  const [tokenRaw, caRaw, namespaceRaw] = await Promise.all([
    readOptionalFile(K8S_DEFAULT.SERVICE_ACCOUNT_TOKEN_PATH),
    readOptionalFile(K8S_DEFAULT.SERVICE_ACCOUNT_CA_PATH),
    readOptionalFile(K8S_DEFAULT.SERVICE_ACCOUNT_NAMESPACE_PATH),
  ]);
  return {
    token: typeof tokenRaw === TYPEOF.STRING ? tokenRaw.trim() : LOCAL_STR_EMPTY,
    caCert: typeof caRaw === TYPEOF.STRING ? caRaw : LOCAL_STR_EMPTY,
    namespace: typeof namespaceRaw === TYPEOF.STRING ? namespaceRaw.trim() : LOCAL_STR_EMPTY,
  };
}

function buildEventManifest(event) {
  const nowIso = new Date().toISOString();
  const involvedKind = event.serviceName ? 'Service' : 'Namespace';
  const involvedName = event.serviceName || event.namespace;

  return {
    apiVersion: LOCAL_STR_V1,
    kind: LOCAL_STR_EVENT,
    metadata: {
      namespace: event.namespace,
      generateName: LOCAL_STR_168NE,
    },
    involvedObject: {
      apiVersion: LOCAL_STR_V1,
      kind: involvedKind,
      namespace: event.namespace,
      name: involvedName,
    },
    reason: event.reason,
    message: event.message,
    type: event.type,
    action: K8S_DEFAULT.EVENT_ACTION,
    source: {
      component: K8S_DEFAULT.EVENT_COMPONENT,
      host: event.serviceKey || event.serviceName || null,
    },
    firstTimestamp: nowIso,
    lastTimestamp: nowIso,
    count: LOCAL_NUM_ONE,
  };
}

class EndpointSyncK8sClient {
  constructor(options) {
    this._apiServerUrl = options.apiServerUrl;
    this._token = options.token;
    this._defaultNamespace = options.defaultNamespace;
    this._fetchImpl = options.fetchImpl || fetch;
    this._httpsAgent = options.httpsAgent || new Agent({
      ca: options.caCert || undefined,
      rejectUnauthorized: true,
    });
  }

  static async create(options = {}) {
    const serviceAccount = await readK8sServiceAccountFiles();
    const apiServerUrl = options.apiServerUrl || buildApiServerUrl();
    const token = options.token || serviceAccount.token;
    const caCert = options.caCert || serviceAccount.caCert;
    const defaultNamespace =
      options.defaultNamespace || serviceAccount.namespace || '';

    return new EndpointSyncK8sClient({
      apiServerUrl,
      token,
      caCert,
      defaultNamespace,
      fetchImpl: options.fetchImpl || fetch,
      httpsAgent: options.httpsAgent,
    });
  }

  getDefaultNamespace() {
    return this._defaultNamespace;
  }

  async _request(method, path, body = null, options = {}) {
    const headers = {
      [HEADER.ACCEPT]: HEADER.APPLICATION_JSON,
    };
    if (typeof this._token === TYPEOF.STRING && this._token.length > LOCAL_NUM_ZERO) {
      headers[HEADER.AUTHORIZATION] = `Bearer ${this._token}`;
    }
    if (body !== null) {
      headers[HEADER.CONTENT_TYPE] = HEADER.APPLICATION_JSON;
    }

    const response = await this._fetchImpl(`${this._apiServerUrl}${path}`, {
      method,
      headers,
      body: body === null ? undefined : JSON.stringify(body),
      agent: this._httpsAgent,
    });

    let payload = null;
    const rawText = await response.text();
    if (rawText.length > LOCAL_NUM_ZERO) {
      try {
        payload = JSON.parse(rawText);
      } catch (_error) {
        payload = null;
      }
    }

    if (options.allowNotFound === true &&
      response.status === HTTP_STATUS.NOT_FOUND) {
      return null;
    }

    if (!response.ok) {
      throw new EndpointSyncK8sClientError(
        `${K8S_CLIENT_ERROR.REQUEST_FAILED_PREFIX}: ${method} ${path}`,
        {
          statusCode: response.status,
          message: parseK8sErrorMessage(payload, response.status),
        },
      );
    }

    return payload;
  }

  async _createOrUpdateByName({namespace, name, listPath, itemPath, manifest}) {
    const existing = await this._request(
      HTTP_METHOD.GET,
      buildPath(itemPath, namespace, name),
      null,
      {allowNotFound: true},
    );

    if (!existing) {
      return this._request(
        HTTP_METHOD.POST,
        buildPath(listPath, namespace),
        manifest,
      );
    }

    const updateManifest = {
      ...manifest,
      metadata: {
        ...manifest.metadata,
        resourceVersion: existing?.metadata?.resourceVersion,
      },
    };
    return this._request(
      HTTP_METHOD.PUT,
      buildPath(itemPath, namespace, name),
      updateManifest,
    );
  }

  async upsertService(manifest) {
    const namespace = manifest?.metadata?.namespace;
    const name = manifest?.metadata?.name;
    const existing = await this._request(
      HTTP_METHOD.GET,
      buildPath(K8S_PATH.SERVICE_BY_NAME, namespace, name),
      null,
      {allowNotFound: true},
    );

    if (!existing) {
      await this._request(
        HTTP_METHOD.POST,
        buildPath(K8S_PATH.SERVICES, namespace),
        manifest,
      );
      return;
    }

    const updateManifest = {
      ...manifest,
      metadata: {
        ...manifest.metadata,
        resourceVersion: existing?.metadata?.resourceVersion,
      },
      spec: {
        ...manifest.spec,
      },
    };
    if (existing?.spec?.clusterIP) {
      updateManifest.spec.clusterIP = existing.spec.clusterIP;
    }
    if (Array.isArray(existing?.spec?.clusterIPs) &&
      existing.spec.clusterIPs.length > LOCAL_NUM_ZERO) {
      updateManifest.spec.clusterIPs = existing.spec.clusterIPs;
    }

    await this._request(
      HTTP_METHOD.PUT,
      buildPath(K8S_PATH.SERVICE_BY_NAME, namespace, name),
      updateManifest,
    );
  }

  async upsertEndpointSlice(manifest) {
    await this._createOrUpdateByName({
      namespace: manifest?.metadata?.namespace,
      name: manifest?.metadata?.name,
      listPath: K8S_PATH.ENDPOINT_SLICES,
      itemPath: K8S_PATH.ENDPOINT_SLICE_BY_NAME,
      manifest,
    });
  }

  async listServices(namespace) {
    const selector = buildLabelSelector();
    const payload = await this._request(
      HTTP_METHOD.GET,
      withQuery(
        buildPath(K8S_PATH.SERVICES, namespace),
        {labelSelector: selector},
      ),
    );
    return Array.isArray(payload?.items) ? payload.items : [];
  }

  async listEndpointSlices(namespace) {
    const selector = buildLabelSelector();
    const payload = await this._request(
      HTTP_METHOD.GET,
      withQuery(
        buildPath(K8S_PATH.ENDPOINT_SLICES, namespace),
        {labelSelector: selector},
      ),
    );
    return Array.isArray(payload?.items) ? payload.items : [];
  }

  async deleteService(namespace, name) {
    await this._request(
      HTTP_METHOD.DELETE,
      buildPath(K8S_PATH.SERVICE_BY_NAME, namespace, name),
      null,
      {allowNotFound: true},
    );
  }

  async deleteEndpointSlice(namespace, name) {
    await this._request(
      HTTP_METHOD.DELETE,
      buildPath(K8S_PATH.ENDPOINT_SLICE_BY_NAME, namespace, name),
      null,
      {allowNotFound: true},
    );
  }

  async getLease(namespace, name) {
    return this._request(
      HTTP_METHOD.GET,
      buildPath(K8S_PATH.LEASE_BY_NAME, namespace, name),
      null,
      {allowNotFound: true},
    );
  }

  async createLease(manifest) {
    await this._request(
      HTTP_METHOD.POST,
      buildPath(K8S_PATH.LEASES, manifest.metadata.namespace),
      manifest,
    );
  }

  async updateLease(manifest) {
    const resourceVersion = manifest?.metadata?.resourceVersion || '';
    if (typeof resourceVersion !== TYPEOF.STRING || resourceVersion.length === LOCAL_NUM_ZERO) {
      throw new EndpointSyncK8sClientError(
        K8S_CLIENT_ERROR.RESOURCE_VERSION_REQUIRED,
      );
    }

    await this._request(
      HTTP_METHOD.PUT,
      buildPath(
        K8S_PATH.LEASE_BY_NAME,
        manifest.metadata.namespace,
        manifest.metadata.name,
      ),
      manifest,
    );
  }

  async recordEvent(event) {
    const namespace = event?.namespace || this._defaultNamespace;
    if (typeof namespace !== TYPEOF.STRING || namespace.length === LOCAL_NUM_ZERO) {
      return;
    }

    const manifest = buildEventManifest({
      ...event,
      namespace,
    });
    await this._request(
      HTTP_METHOD.POST,
      buildPath(K8S_PATH.EVENTS, namespace),
      manifest,
    );
  }
}

export {
  K8S_DEFAULT,
  K8S_PATH,
  HTTP_METHOD,
  HTTP_STATUS,
  HEADER,
  K8S_CLIENT_ERROR,
  URL_TEMPLATE_PARAM,
  EndpointSyncK8sClientError,
  encodePathPart,
  buildPath,
  buildLabelSelector,
  buildApiServerUrl,
  withQuery,
  parseK8sErrorMessage,
  readOptionalFile,
  readK8sServiceAccountFiles,
  buildEventManifest,
  EndpointSyncK8sClient,
};
