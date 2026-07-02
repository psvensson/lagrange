/**
 * Kubernetes projection reconciler for endpoint-sync exports.
 *
 * Reconciles selector-less Service and managed EndpointSlice
 * resources from planned logical service exports.
 *
 * @module runtime/endpoint-sync-k8s-reconciler
 */

import {BaseError} from '../utils/base-error.js';
import {
  ENDPOINT_SYNC_HEALTH,
  ENDPOINT_SYNC_LABEL,
  ENDPOINT_SYNC_RECONCILE_FAILURE_STAGE,
  ENDPOINT_SYNC_UNHEALTHY_POLICY,
} from './endpoint-sync-constants.js';
import {
  buildEndpointSliceName,
  normalizeDns1123Segment,
} from './endpoint-sync-naming.js';

const LOCAL_STR_ENDPOINT_SYNC_K8S_RECONCILER = 'EndpointSyncK8sReconciler';
const LOCAL_STR_RECONCILE = 'reconcile';

const K8S_KIND = Object.freeze({
  SERVICE: 'Service',
  ENDPOINT_SLICE: 'EndpointSlice',
});

const K8S_API_VERSION = Object.freeze({
  SERVICE: 'v1',
  ENDPOINT_SLICE: 'discovery.k8s.io/v1',
});

const K8S_PROTOCOL = Object.freeze({
  TCP: 'TCP',
});

const K8S_LABEL = Object.freeze({
  SERVICE_NAME: 'kubernetes.io/service-name',
});

const K8S_RECONCILE_ERROR = Object.freeze({
  CLIENT_REQUIRED: 'k8sClient is required',
  CLIENT_METHOD_MISSING_PREFIX: 'k8sClient missing required method',
  NAMESPACE_REQUIRED: 'namespace is required',
  EXPORTS_REQUIRED: 'plannedExports must be an array',
});

const REQUIRED_CLIENT_METHOD = Object.freeze([
  'upsertService',
  'upsertEndpointSlice',
  'listServices',
  'listEndpointSlices',
  'deleteService',
  'deleteEndpointSlice',
]);

const RECONCILE_SUMMARY_DEFAULT = Object.freeze({
  desiredServices: 0,
  desiredEndpointSlices: 0,
  upsertedServices: 0,
  upsertedEndpointSlices: 0,
  exportedEndpoints: 0,
  deletedServices: 0,
  deletedEndpointSlices: 0,
  groupFailures: Object.freeze([]),
});

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
    super(message, {
      cause,
      context: {
        component: LOCAL_STR_ENDPOINT_SYNC_K8S_RECONCILER,
        operation: LOCAL_STR_RECONCILE,
        metadata,
      },
    });
  }
}

/**
 * Build common managed labels.
 *
 * @param {string} serviceKey - Deterministic service key.
 * @return {Object}
 */
function buildManagedLabels(serviceKey) {
  return {
    [ENDPOINT_SYNC_LABEL.MANAGED_KEY]: ENDPOINT_SYNC_LABEL.MANAGED_VALUE,
    [ENDPOINT_SYNC_LABEL.SOURCE_KEY]: ENDPOINT_SYNC_LABEL.SOURCE_VALUE,
    [ENDPOINT_SYNC_LABEL.SERVICE_KEY]: serviceKey,
  };
}

/**
 * Build selector-less Service manifest.
 *
 * @param {Object} plannedExport - Planned export record.
 * @param {string} namespace - Kubernetes namespace.
 * @return {Object}
 */
function buildServiceManifest(plannedExport, namespace) {
  const labels = buildManagedLabels(plannedExport.serviceKey);
  const portName = normalizeDns1123Segment(plannedExport.protocol);

  return {
    apiVersion: K8S_API_VERSION.SERVICE,
    kind: K8S_KIND.SERVICE,
    metadata: {
      name: plannedExport.serviceName,
      namespace,
      labels,
    },
    spec: {
      ports: [
        {
          name: portName,
          protocol: K8S_PROTOCOL.TCP,
          port: plannedExport.port,
          targetPort: plannedExport.port,
        },
      ],
    },
  };
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
function buildEndpointSliceManifest(
  plannedExport,
  slicePlan,
  sliceIndex,
  namespace,
  unhealthyPolicy,
) {
  const sliceName = buildEndpointSliceName(
    plannedExport.serviceName,
    sliceIndex,
  );
  const labels = {
    ...buildManagedLabels(plannedExport.serviceKey),
    [K8S_LABEL.SERVICE_NAME]: plannedExport.serviceName,
  };
  const portName = normalizeDns1123Segment(plannedExport.protocol);

  const endpoints = slicePlan.endpoints.map((endpoint) => {
    const isHealthy = endpoint.healthStatus === ENDPOINT_SYNC_HEALTH.HEALTHY;
    const isReady = unhealthyPolicy === ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY ?
      isHealthy :
      true;

    return {
      addresses: [endpoint.address],
      conditions: {
        ready: isReady,
      },
      hostname: endpoint.nodeId,
      nodeName: endpoint.nodeId,
    };
  });

  return {
    apiVersion: K8S_API_VERSION.ENDPOINT_SLICE,
    kind: K8S_KIND.ENDPOINT_SLICE,
    metadata: {
      name: sliceName,
      namespace,
      labels,
    },
    addressType: slicePlan.addressType,
    ports: [
      {
        name: portName,
        protocol: K8S_PROTOCOL.TCP,
        port: plannedExport.port,
      },
    ],
    endpoints,
  };
}

/**
 * Detect whether resource metadata indicates managed ownership.
 *
 * @param {Object} resource - Kubernetes resource.
 * @return {boolean}
 */
function isManagedResource(resource) {
  const labels = resource?.metadata?.labels || null;
  if (!labels || typeof labels !== 'object') {
    return false;
  }
  return labels[ENDPOINT_SYNC_LABEL.MANAGED_KEY] ===
    ENDPOINT_SYNC_LABEL.MANAGED_VALUE &&
    labels[ENDPOINT_SYNC_LABEL.SOURCE_KEY] ===
    ENDPOINT_SYNC_LABEL.SOURCE_VALUE;
}

/**
 * Collect stale managed resources by name.
 *
 * @param {Array<Object>} existingResources - Existing resources.
 * @param {Set<string>} desiredNames - Desired resource names.
 * @return {Array<string>} Names eligible for removal.
 */
function collectStaleManagedResourceNames(existingResources, desiredNames) {
  const staleNames = [];

  for (const resource of existingResources) {
    if (!isManagedResource(resource)) {
      continue;
    }

    const name = resource?.metadata?.name || null;
    if (!name) {
      continue;
    }
    if (!desiredNames.has(name)) {
      staleNames.push(name);
    }
  }

  return staleNames.sort((left, right) => left.localeCompare(right));
}

/**
 * Validate reconciler input options.
 *
 * @param {Object} options - Reconcile options.
 */
function validateReconcileOptions(options) {
  if (!options || typeof options !== 'object') {
    throw new EndpointSyncReconcilerError(
      K8S_RECONCILE_ERROR.CLIENT_REQUIRED,
    );
  }

  const k8sClient = options.k8sClient;
  if (!k8sClient || typeof k8sClient !== 'object') {
    throw new EndpointSyncReconcilerError(
      K8S_RECONCILE_ERROR.CLIENT_REQUIRED,
    );
  }

  for (const methodName of REQUIRED_CLIENT_METHOD) {
    if (typeof k8sClient[methodName] !== 'function') {
      throw new EndpointSyncReconcilerError(
        `${K8S_RECONCILE_ERROR.CLIENT_METHOD_MISSING_PREFIX}: ${methodName}`,
      );
    }
  }

  if (!options.namespace || typeof options.namespace !== 'string') {
    throw new EndpointSyncReconcilerError(
      K8S_RECONCILE_ERROR.NAMESPACE_REQUIRED,
    );
  }

  if (!Array.isArray(options.plannedExports)) {
    throw new EndpointSyncReconcilerError(
      K8S_RECONCILE_ERROR.EXPORTS_REQUIRED,
    );
  }
}

/**
 * Build mutable reconcile summary object.
 *
 * @return {Object}
 */
function createReconcileSummary() {
  return {
    desiredServices: RECONCILE_SUMMARY_DEFAULT.desiredServices,
    desiredEndpointSlices: RECONCILE_SUMMARY_DEFAULT.desiredEndpointSlices,
    upsertedServices: RECONCILE_SUMMARY_DEFAULT.upsertedServices,
    upsertedEndpointSlices: RECONCILE_SUMMARY_DEFAULT.upsertedEndpointSlices,
    exportedEndpoints: RECONCILE_SUMMARY_DEFAULT.exportedEndpoints,
    deletedServices: RECONCILE_SUMMARY_DEFAULT.deletedServices,
    deletedEndpointSlices: RECONCILE_SUMMARY_DEFAULT.deletedEndpointSlices,
    groupFailures: [],
  };
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
  validateReconcileOptions(options);

  const unhealthyPolicy = options.unhealthyPolicy ||
    ENDPOINT_SYNC_UNHEALTHY_POLICY.EXCLUDE;
  const desiredServiceNames = new Set();
  const desiredEndpointSliceNames = new Set();
  const summary = createReconcileSummary();

  for (const plannedExport of options.plannedExports) {
    const serviceManifest = buildServiceManifest(plannedExport, options.namespace);
    desiredServiceNames.add(serviceManifest.metadata.name);
    summary.desiredServices += 1;

    const sliceManifests = [];
    for (let idx = 0; idx < plannedExport.slicePlans.length; idx += 1) {
      const sliceManifest = buildEndpointSliceManifest(
        plannedExport,
        plannedExport.slicePlans[idx],
        idx,
        options.namespace,
        unhealthyPolicy,
      );
      desiredEndpointSliceNames.add(sliceManifest.metadata.name);
      sliceManifests.push(sliceManifest);
      summary.desiredEndpointSlices += 1;
    }

    try {
      await options.k8sClient.upsertService(serviceManifest);
      summary.upsertedServices += 1;
    } catch (error) {
      summary.groupFailures.push({
        serviceKey: plannedExport.serviceKey,
        serviceName: plannedExport.serviceName,
        protocol: plannedExport.protocol,
        stage: ENDPOINT_SYNC_RECONCILE_FAILURE_STAGE.SERVICE,
        message: error.message,
      });
      continue;
    }

    let groupFailed = false;
    for (const sliceManifest of sliceManifests) {
      try {
        await options.k8sClient.upsertEndpointSlice(sliceManifest);
        summary.upsertedEndpointSlices += 1;
      } catch (error) {
        groupFailed = true;
        summary.groupFailures.push({
          serviceKey: plannedExport.serviceKey,
          serviceName: plannedExport.serviceName,
          protocol: plannedExport.protocol,
          stage: ENDPOINT_SYNC_RECONCILE_FAILURE_STAGE.ENDPOINT_SLICE,
          message: error.message,
        });
        break;
      }
    }
    if (!groupFailed) {
      summary.exportedEndpoints += plannedExport.endpointCount;
    }
  }

  const existingServices = await options.k8sClient.listServices(
    options.namespace,
  );
  const staleServiceNames = collectStaleManagedResourceNames(
    existingServices,
    desiredServiceNames,
  );
  for (const serviceName of staleServiceNames) {
    try {
      await options.k8sClient.deleteService(options.namespace, serviceName);
      summary.deletedServices += 1;
    } catch (error) {
      summary.groupFailures.push({
        serviceKey: null,
        serviceName,
        protocol: null,
        stage: ENDPOINT_SYNC_RECONCILE_FAILURE_STAGE.GARBAGE_COLLECTION,
        message: error.message,
      });
    }
  }

  const existingEndpointSlices = await options.k8sClient.listEndpointSlices(
    options.namespace,
  );
  const staleEndpointSliceNames = collectStaleManagedResourceNames(
    existingEndpointSlices,
    desiredEndpointSliceNames,
  );
  for (const sliceName of staleEndpointSliceNames) {
    try {
      await options.k8sClient.deleteEndpointSlice(options.namespace, sliceName);
      summary.deletedEndpointSlices += 1;
    } catch (error) {
      summary.groupFailures.push({
        serviceKey: null,
        serviceName: sliceName,
        protocol: null,
        stage: ENDPOINT_SYNC_RECONCILE_FAILURE_STAGE.GARBAGE_COLLECTION,
        message: error.message,
      });
    }
  }

  return {
    desiredServices: summary.desiredServices,
    desiredEndpointSlices: summary.desiredEndpointSlices,
    upsertedServices: summary.upsertedServices,
    upsertedEndpointSlices: summary.upsertedEndpointSlices,
    exportedEndpoints: summary.exportedEndpoints,
    deletedServices: summary.deletedServices,
    deletedEndpointSlices: summary.deletedEndpointSlices,
    groupFailures: summary.groupFailures,
  };
}

export {
  K8S_KIND,
  K8S_API_VERSION,
  K8S_PROTOCOL,
  K8S_LABEL,
  K8S_RECONCILE_ERROR,
  REQUIRED_CLIENT_METHOD,
  RECONCILE_SUMMARY_DEFAULT,
  EndpointSyncReconcilerError,
  buildManagedLabels,
  buildServiceManifest,
  buildEndpointSliceManifest,
  isManagedResource,
  collectStaleManagedResourceNames,
  validateReconcileOptions,
  createReconcileSummary,
  reconcilePlannedExports,
};
