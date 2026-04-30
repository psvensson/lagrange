import {createControlPlaneRuntimeBundle} from
  '../control-plane-runtime-bundle.js';
import {NUM} from '../../constants/index.js';
import {createSystemMetadataOwners} from './create-system-metadata-owners.js';
import {NodeEndpointsOwner} from './node-endpoints-owner.js';

const LOCAL_STR_FUNCTION = 'function';

const JOIN_PUBLICATION_DELIVERY_PRIORITY = 'critical';

function normalizeNonNegativeInteger(value, fallback = null) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.floor(value);
  return normalized >= NUM.ZERO ? normalized : fallback;
}

function applyOwnerDependencies(owner, options = {}) {
  if (!owner) {
    return;
  }
  if (typeof owner.setControlPlaneSystemTableGateway === LOCAL_STR_FUNCTION) {
    owner.setControlPlaneSystemTableGateway(
      options.controlPlaneSystemTableGateway || null,
    );
  }
}

class MembershipPublicationRuntimeOwner {
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.systemTableCache = options.systemTableCache || null;
    this.messageRouter = options.messageRouter || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;
    this.controlPlaneWriteRetryTimeoutMs =
      options.controlPlaneWriteRetryTimeoutMs;
    this.controlPlaneWriteRetryBaseDelayMs =
      options.controlPlaneWriteRetryBaseDelayMs;
    this.controlPlaneWriteRetryMaxDelayMs =
      options.controlPlaneWriteRetryMaxDelayMs;
    this.controlPlaneWriteRetryNow =
      options.controlPlaneWriteRetryNow || null;
    this.controlPlaneWriteRetrySleep =
      options.controlPlaneWriteRetrySleep || null;

    const ownerOptions = this.buildOwnerOptions();
    const systemMetadataOwners =
      options.systemMetadataOwners || createSystemMetadataOwners(ownerOptions);
    this.nodesOwner = systemMetadataOwners.nodesOwner;
    this.nodeEndpointsOwner =
      systemMetadataOwners.nodeEndpointsOwner ||
      new NodeEndpointsOwner(ownerOptions);
    this.serviceEndpointsOwner = systemMetadataOwners.serviceEndpointsOwner;
    this.controlPlanePublicationsOwner =
      systemMetadataOwners.controlPlanePublicationsOwner;
    this.syncOwnerDependencies(ownerOptions);
  }

  buildOwnerOptions() {
    return {
      controlPlaneSystemTableGateway:
        this.getControlPlaneSystemTableGateway(),
      systemTableCache: this.systemTableCache || null,
    };
  }

  syncOwnerDependencies(ownerOptions = this.buildOwnerOptions()) {
    applyOwnerDependencies(this.nodesOwner, ownerOptions);
    applyOwnerDependencies(this.nodeEndpointsOwner, ownerOptions);
    applyOwnerDependencies(this.serviceEndpointsOwner, ownerOptions);
    applyOwnerDependencies(this.controlPlanePublicationsOwner, ownerOptions);
    return this;
  }

  getControlPlaneSystemTableGateway() {
    if (this.controlPlaneSystemTableGateway) {
      return this.controlPlaneSystemTableGateway;
    }
    this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle({
      nodeId: this.nodeId,
      cdcIntegrationService: this.cdcIntegrationService,
      systemTableCache: this.systemTableCache,
      messageRouter: this.messageRouter,
    }).controlPlaneSystemTableGateway;
    return this.controlPlaneSystemTableGateway;
  }

  buildJoinMutationOptions(options = {}) {
    const queryTimeoutMs = normalizeNonNegativeInteger(
      options.queryTimeoutMs,
      normalizeNonNegativeInteger(
        options.controlPlaneWriteRetryTimeoutMs,
        normalizeNonNegativeInteger(this.controlPlaneWriteRetryTimeoutMs, null),
      ),
    );
    const retryBaseDelayMs = normalizeNonNegativeInteger(
      options.controlPlaneWriteRetryBaseDelayMs,
      normalizeNonNegativeInteger(this.controlPlaneWriteRetryBaseDelayMs, null),
    );
    const retryMaxDelayMs = normalizeNonNegativeInteger(
      options.controlPlaneWriteRetryMaxDelayMs,
      normalizeNonNegativeInteger(this.controlPlaneWriteRetryMaxDelayMs, null),
    );
    const mutationOptions = {
      ...options,
      deliveryPriority:
        options.deliveryPriority || JOIN_PUBLICATION_DELIVERY_PRIORITY,
      skipCacheWait: options.skipCacheWait !== false,
    };
    if (queryTimeoutMs !== null) {
      mutationOptions.queryTimeoutMs = queryTimeoutMs;
      mutationOptions.controlPlaneWriteRetryTimeoutMs = queryTimeoutMs;
    }
    if (retryBaseDelayMs !== null && retryBaseDelayMs > NUM.ZERO) {
      mutationOptions.controlPlaneWriteRetryBaseDelayMs = retryBaseDelayMs;
    }
    if (retryMaxDelayMs !== null && retryMaxDelayMs > NUM.ZERO) {
      mutationOptions.controlPlaneWriteRetryMaxDelayMs = retryMaxDelayMs;
    }
    if (typeof options.controlPlaneWriteRetryNow !== LOCAL_STR_FUNCTION &&
        typeof this.controlPlaneWriteRetryNow === LOCAL_STR_FUNCTION) {
      mutationOptions.controlPlaneWriteRetryNow =
        this.controlPlaneWriteRetryNow;
    }
    if (typeof options.controlPlaneWriteRetrySleep !== LOCAL_STR_FUNCTION &&
        typeof this.controlPlaneWriteRetrySleep === LOCAL_STR_FUNCTION) {
      mutationOptions.controlPlaneWriteRetrySleep =
        this.controlPlaneWriteRetrySleep;
    }
    return mutationOptions;
  }

  async upsertJoinNode(row, options = {}) {
    return this.nodesOwner.upsertNode(
      row,
      this.buildJoinMutationOptions(options),
    );
  }

  async upsertJoinNodeEndpoint(row, options = {}) {
    return this.nodeEndpointsOwner.upsertEndpoint(
      row,
      this.buildJoinMutationOptions(options),
    );
  }

  async upsertJoinServiceEndpoint(row, options = {}) {
    return this.serviceEndpointsOwner.upsertEndpoint(
      row,
      this.buildJoinMutationOptions(options),
    );
  }

  getControlPlanePublicationsOwner() {
    return this.controlPlanePublicationsOwner;
  }
}

export {MembershipPublicationRuntimeOwner};
