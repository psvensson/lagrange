import {SYSTEM_TABLE_NAME} from
  '../../bootstrap/system-table-schemas-constants.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane-runtime-bundle.js';
import {createSystemMetadataOwners} from './create-system-metadata-owners.js';
import {NodeEndpointsOwner} from './node-endpoints-owner.js';
import {
  readAuthoritativeEndpointRow,
  writeEndpointAtIncarnation,
} from './endpoint-incarnation-authority.js';
import {COLUMN, TABLES} from '../../constants/index.js';
import {
  readAuthoritativeNodeRow,
  writeNodeRegistrationAtIncarnation,
} from './node-registration-incarnation-write.js';

const LOCAL_STR_FUNCTION = 'function';

const JOIN_PUBLICATION_DELIVERY_PRIORITY = 'critical';

function normalizeNonNegativeInteger(value, fallback = null) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.floor(value);
  return normalized >= 0 ? normalized : fallback;
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
    if (retryBaseDelayMs !== null && retryBaseDelayMs > 0) {
      mutationOptions.controlPlaneWriteRetryBaseDelayMs = retryBaseDelayMs;
    }
    if (retryMaxDelayMs !== null && retryMaxDelayMs > 0) {
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

  /**
   * The joiner's NODES registration at this boot's exact incarnation: birth
   * or one CAS over an older incarnation, never over a newer one (D-7). One
   * attempt plus one authoritative reread; no retry loop.
   * @param {Object} row - NODES row.
   * @param {number} bootIncarnation - This boot's reserved incarnation.
   * @param {Object} [options] - Join-time write options.
   * @return {Promise<Object>} Frozen {outcome, observedRow}.
   */
  async registerJoinNodeAtIncarnation(row, bootIncarnation, options = {}) {
    const gateway = this.getControlPlaneSystemTableGateway();
    return writeNodeRegistrationAtIncarnation({
      row,
      bootIncarnation,
      observe: () => readAuthoritativeNodeRow(gateway, row[COLUMN.NODE_ID]),
      insert: (stampedRow, identity) => gateway.insertSystemTableRow(
        SYSTEM_TABLE_NAME.NODES, stampedRow, {...options, ...identity}),
      advance: (whereClause, stampedRow, identity) =>
        gateway.updateSystemTableRow(SYSTEM_TABLE_NAME.NODES, whereClause,
          stampedRow, {...options, ...identity}),
    });
  }

  /**
   * The registration verb's boot-incarnation transition: one CAS on the
   * observed node identity and boot incarnation. No retry options are
   * attached; an unobserved advance is classified by the caller's readback.
   * @param {Object} whereClause - {node_id, boot_incarnation} observed.
   * @param {Object} row - Row stamped with this boot's incarnation.
   * @param {Object} [options] - Join-time write options.
   * @return {Promise<Object>} Gateway mutation result.
   */
  async advanceJoinNodeBootIncarnation(whereClause, row, options = {}) {
    return this.getControlPlaneSystemTableGateway().updateSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      whereClause,
      row,
      options,
    );
  }

  /**
   * The join-time endpoint write at the node's exact boot incarnation (the
   * endpoint incarnation authority): birth when absent, one CAS on the
   * observed same-or-older incarnation, never over a newer owner.
   * @param {string} tableName - node_endpoints or service_endpoints.
   * @param {Object} row - Endpoint row.
   * @param {number} bootIncarnation - This boot's incarnation.
   * @param {Object} [options] - Join-time write options.
   * @return {Promise<Object>} Frozen endpoint incarnation outcome.
   */
  async writeJoinEndpointAtIncarnation(tableName, row, bootIncarnation,
    options = {}) {
    const owner = tableName === TABLES.NODE_ENDPOINTS ?
      this.nodeEndpointsOwner :
      this.serviceEndpointsOwner;
    const mutationOptions = this.buildJoinMutationOptions(options);
    const gateway = this.getControlPlaneSystemTableGateway();
    return writeEndpointAtIncarnation({
      row,
      bootIncarnation,
      observe: () => readAuthoritativeEndpointRow(gateway, tableName,
        row[COLUMN.ENDPOINT_ID]),
      insert: (stampedRow, identity) => owner.insertEndpoint(stampedRow,
        {...mutationOptions, ...identity}),
      update: (whereClause, data, identity) => owner.updateWhere(whereClause,
        data, {...mutationOptions, ...identity}),
    });
  }

  getControlPlanePublicationsOwner() {
    return this.controlPlanePublicationsOwner;
  }
}

export {MembershipPublicationRuntimeOwner};
