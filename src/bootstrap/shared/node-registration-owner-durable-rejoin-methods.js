import {
  isBootJoinRejoinMembershipOwnerOutcome,
  MEMBERSHIP_LIFECYCLE_INTENT,
  resolveMembershipJoinIntentType,
} from '../../control-plane/membership-lifecycle-controller.js';
import {AuthoritativeControlPlaneView} from
  '../../control-plane/authoritative-control-plane-view.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  SERVICE_STATUS,
  STATE,
  TABLES,
  TRANSPORT_TYPE,
} from '../../constants/index.js';
import {resolveAdvertisedWebSocketAddress} from
  '../../transport/node-address-resolution.js';
import {resolveAutoRejoinStartupDecision} from '../rejoin-hints.js';
import {
  DURABLE_REJOIN_REQUIRED_SERVICE_IDS,
  JOIN_ADMISSION_PUBLICATION,
  JOIN_ADMISSION_RESOLUTION_SOURCE,
  LOCAL_STR_1YR7Z,
  REUSABLE_JOIN_ADMISSION_CONNECTION_STATES,
  hasFunction,
  normalizeString,
} from './node-registration-owner-constants.js';

class NodeRegistrationOwnerDurableRejoinMethods {
  async resolveExistingDurableRejoinMembership(now) {
    if (this.getJoinLifecycleIntentType() !==
      MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY) {
      return null;
    }

    if (await this.durableRejoinBlockedByClusterIncarnationFence()) {
      return null;
    }

    const authoritativeNodeRow =
      await this.readAuthoritativeDurableRejoinNodeRow();
    if (!authoritativeNodeRow) {
      return null;
    }

    const cachedNodeAddress = normalizeString(
      authoritativeNodeRow[COLUMN.NODE_ADDRESS],
    );
    const currentNodeAddress = normalizeString(this.nodeAddress);
    if (cachedNodeAddress.length > 0 &&
      currentNodeAddress.length > 0 &&
      cachedNodeAddress !== currentNodeAddress) {
      return null;
    }

    const authoritativeEndpointRow =
      await this.readAuthoritativeNodeEndpointRow();
    if (!authoritativeEndpointRow) {
      return null;
    }

    const metaEndpointRows =
      await this.readAuthoritativeMetaEndpointRows();
    if (metaEndpointRows.length !==
      DURABLE_REJOIN_REQUIRED_SERVICE_IDS.length) {
      return null;
    }

    const reusedNodeRow = {
      ...authoritativeNodeRow,
      [COLUMN.STATUS]:
        authoritativeNodeRow[COLUMN.STATUS] || SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now,
      [COLUMN.READY_LEASE_EXPIRES_AT]: null,
    };
    return {
      nodeRow: reusedNodeRow,
      endpointRow: authoritativeEndpointRow,
      metaEndpointRows,
      resolution: {
        source:
          JOIN_ADMISSION_RESOLUTION_SOURCE
            .DURABLE_REJOIN_EXISTING_MEMBERSHIP,
      },
      reusedExistingMembership: true,
    };
  }

  hasReusableJoinAdmissionConnectionState(connectionState) {
    return REUSABLE_JOIN_ADMISSION_CONNECTION_STATES.includes(
      normalizeString(connectionState).toLowerCase(),
    );
  }

  hasCompleteRequiredMetaEndpointRows(metaEndpointRows) {
    return Array.isArray(metaEndpointRows) &&
      metaEndpointRows.length === DURABLE_REJOIN_REQUIRED_SERVICE_IDS.length;
  }

  canReuseObservedJoinAdmissionNodeRow(nodeRow) {
    if (!nodeRow || typeof nodeRow !== 'object') {
      return false;
    }

    const cachedNodeAddress = normalizeString(
      nodeRow[COLUMN.NODE_ADDRESS],
    );
    const currentNodeAddress = normalizeString(this.nodeAddress);
    if (cachedNodeAddress.length > 0 &&
      currentNodeAddress.length > 0 &&
      cachedNodeAddress !== currentNodeAddress) {
      return false;
    }

    return this.hasReusableJoinAdmissionConnectionState(
      nodeRow[COLUMN.CONNECTION_STATE],
    );
  }

  async resolveExistingJoinAdmissionProgress() {
    if (await this.durableRejoinBlockedByClusterIncarnationFence()) {
      return null;
    }

    const authoritativeNodeRow =
      await this.readAuthoritativeDurableRejoinNodeRow();
    if (!this.canReuseObservedJoinAdmissionNodeRow(authoritativeNodeRow)) {
      return null;
    }

    const authoritativeEndpointRow =
      await this.readAuthoritativeNodeEndpointRow();
    const metaEndpointRows =
      await this.readAuthoritativeMetaEndpointRows();
    return {
      nodeRow: authoritativeNodeRow,
      endpointRow: authoritativeEndpointRow,
      metaEndpointRows,
      resolution: {
        source: JOIN_ADMISSION_RESOLUTION_SOURCE.EXISTING_PROGRESS,
      },
    };
  }

  async durableRejoinBlockedByClusterIncarnationFence() {
    const fence = await this.resolveClusterIncarnationFence();
    if (!fence || typeof fence !== 'object') {
      return false;
    }
    return fence.allowed !== true;
  }

  async resolveClusterIncarnationFence() {
    if (hasFunction(this.delegates.getClusterIncarnationFence)) {
      const delegatedFence = await this.delegates.getClusterIncarnationFence();
      return delegatedFence &&
        typeof delegatedFence === 'object' ?
        delegatedFence :
        null;
    }

    const dataDir = normalizeString(this.delegates.getDataDir?.());
    if (dataDir.length === 0) {
      return null;
    }

    try {
      const startupDecision = await resolveAutoRejoinStartupDecision({
        dataDir,
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
      });
      return startupDecision?.clusterIncarnationFence &&
        typeof startupDecision.clusterIncarnationFence === 'object' ?
        startupDecision.clusterIncarnationFence :
        null;
    } catch (_error) {
      return null;
    }
  }

  async refreshExistingDurableRejoinMembership(existingMembership) {
    const nodeRow = existingMembership?.nodeRow || null;
    const refreshResult = await this.upsertJoinPublicationRow(
      JOIN_ADMISSION_PUBLICATION.NODE_MEMBERSHIP_REFRESH,
      nodeRow,
    );
    if (!refreshResult?.success) {
      throw new Error(
        LOCAL_STR_1YR7Z +
        `${refreshResult?.error}`,
      );
    }
    return refreshResult;
  }

  activateExistingDurableRejoinMembership(existingMembership) {
    if (!existingMembership || typeof existingMembership !== 'object') {
      return;
    }
    this.seedJoinTimeCacheRow(TABLES.NODES, existingMembership.nodeRow);
    this.seedJoinTimeCacheRow(
      TABLES.NODE_ENDPOINTS,
      existingMembership.endpointRow,
    );
    for (const metaEndpointRow of existingMembership.metaEndpointRows || []) {
      this.seedJoinTimeCacheRow(
        TABLES.SERVICE_ENDPOINTS,
        metaEndpointRow,
      );
    }
  }

  getJoinLifecycleIntentType() {
    const joinLifecycleIntentType =
      this.delegates.getJoinLifecycleIntentType?.();
    if (typeof joinLifecycleIntentType === 'string' &&
        joinLifecycleIntentType.length > 0) {
      return joinLifecycleIntentType;
    }
    const membershipOwnerOutcome =
      this.delegates.getMembershipOwnerOutcome?.();
    if (isBootJoinRejoinMembershipOwnerOutcome(membershipOwnerOutcome)) {
      return resolveMembershipJoinIntentType({
        membershipOwnerOutcome,
        startupMode: this.delegates.getJoinStartupMode?.(),
      });
    }
    return resolveMembershipJoinIntentType(
      this.delegates.getJoinStartupMode?.(),
    );
  }

  getAuthoritativeControlPlaneView() {
    if (this.authoritativeControlPlaneView) {
      this.authoritativeControlPlaneView.syncOwnerDependencies({
        cdcIntegrationService: this.delegates.getCdcIntegrationService?.(),
        messageRouter: this.delegates.getMessageRouter?.() || null,
      });
      return this.authoritativeControlPlaneView;
    }

    const cdcIntegrationService =
      this.delegates.getCdcIntegrationService?.() || null;
    if (!cdcIntegrationService) {
      return null;
    }

    this.authoritativeControlPlaneView =
      new AuthoritativeControlPlaneView({
        nodeId: this.delegates.getSeedNodeId?.() || this.nodeId,
        cdcIntegrationService,
        messageRouter: this.delegates.getMessageRouter?.() || null,
      });
    return this.authoritativeControlPlaneView;
  }

  async readAuthoritativeRows(tableName, sql, params = []) {
    const view = this.getAuthoritativeControlPlaneView();
    if (!view?.canRead()) {
      return [];
    }
    try {
      const result = await view.readRows(tableName, sql, params);
      return result?.success === true && Array.isArray(result.rows) ?
        result.rows :
        [];
    } catch (_error) {
      return [];
    }
  }

  async readAuthoritativeDurableRejoinNodeRow() {
    const rows = await this.readAuthoritativeRows(
      TABLES.NODES,
      `SELECT * FROM ${TABLES.NODES} WHERE ${COLUMN.NODE_ID} = ?`,
      [this.nodeId],
    );
    return rows.find((row) =>
      normalizeString(row?.[COLUMN.NODE_ID]) === this.nodeId,
    ) || null;
  }

  async readAuthoritativeNodeEndpointRow() {
    const expectedWsAddress = normalizeString(
      this.resolveCanonicalWsAddress(),
    );
    const rows = await this.readAuthoritativeRows(
      TABLES.NODE_ENDPOINTS,
      `SELECT * FROM ${TABLES.NODE_ENDPOINTS} WHERE ${COLUMN.NODE_ID} = ?`,
      [this.nodeId],
    );
    return rows.find((row) => {
      const nodeId = normalizeString(row?.[COLUMN.NODE_ID]);
      const transportType = normalizeString(
        row?.[COLUMN.TRANSPORT_TYPE],
      ).toLowerCase();
      const status = normalizeString(
        row?.[COLUMN.STATUS],
      ).toLowerCase();
      const address = normalizeString(row?.[COLUMN.ADDRESS]);
      return nodeId === this.nodeId &&
        transportType ===
          String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase() &&
        status === String(ENDPOINT_STATUS.ACTIVE).toLowerCase() &&
        address === expectedWsAddress;
    }) || null;
  }

  async readAuthoritativeMetaEndpointRows() {
    const rows = await this.readAuthoritativeRows(
      TABLES.SERVICE_ENDPOINTS,
      `SELECT * FROM ${TABLES.SERVICE_ENDPOINTS} WHERE ${COLUMN.NODE_ID} = ?`,
      [this.nodeId],
    );
    const rowsByServiceId = new Map();
    for (const row of rows) {
      const nodeId = normalizeString(row?.[COLUMN.NODE_ID]);
      const serviceId = normalizeString(row?.[COLUMN.SERVICE_ID]);
      if (nodeId !== this.nodeId ||
        !DURABLE_REJOIN_REQUIRED_SERVICE_IDS.includes(serviceId) ||
        rowsByServiceId.has(serviceId)) {
        continue;
      }
      rowsByServiceId.set(serviceId, row);
    }

    return DURABLE_REJOIN_REQUIRED_SERVICE_IDS
      .map((serviceId) => rowsByServiceId.get(serviceId) || null)
      .filter(Boolean);
  }

  resolveCanonicalWsAddress() {
    return this.advertisedNodeWsAddress ||
      resolveAdvertisedWebSocketAddress({
        nodeAddress: this.nodeAddress,
        wsPort: this.delegates.getWsPort?.() || null,
      }) ||
      this.nodeAddress;
  }
}

function createNodeRegistrationDurableRejoinMethods() {
  const descriptors = Object.getOwnPropertyDescriptors(
    NodeRegistrationOwnerDurableRejoinMethods.prototype,
  );
  delete descriptors.constructor;
  return descriptors;
}

export {createNodeRegistrationDurableRejoinMethods};
