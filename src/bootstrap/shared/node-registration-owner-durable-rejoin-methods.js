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
  NODE_STATE,
  STATE,
  TABLES,
  TRANSPORT_TYPE,
} from '../../constants/index.js';
import {resolveAdvertisedWebSocketAddress} from
  '../../transport/node-address-resolution.js';
import {resolveAutoRejoinStartupDecision} from '../rejoin-hints.js';
import {
  AUTHORITATIVE_ROW_READ_STATE,
} from '../rejoin-hints-constants.js';
import {
  AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE_MESSAGE,
  AUTHORITATIVE_ROW_UNAVAILABLE_RETRY_AFTER_MS,
  DURABLE_REJOIN_REQUIRED_SERVICE_IDS,
  JOIN_ADMISSION_PUBLICATION,
  JOIN_ADMISSION_RESOLUTION_SOURCE,
  LOCAL_STR_1YR7Z,
  LOG_AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
  LOG_CLUSTER_INCARNATION_FENCE_UNAVAILABLE,
  REUSABLE_JOIN_ADMISSION_CONNECTION_STATES,
  hasFunction,
  normalizeString,
} from './node-registration-owner-constants.js';

const NON_REUSABLE_NODE_STATUSES = Object.freeze([
  NODE_STATE.FAILED,
  NODE_STATE.SHUTTING_DOWN,
  NODE_STATE.STOPPED,
]);

/**
 * A reused durable membership row must never re-publish a terminal status
 * or a stale lease/heartbeat from the previous incarnation. Reentry
 * normalizes the row to JOINING with a fresh heartbeat and a cleared lease;
 * the canonical ready transition promotes it from there.
 * @param {Object} nodeRow - Authoritative durable node row.
 * @param {number} now - Current timestamp.
 * @return {Object} Reentry-normalized node row.
 */
function buildReentryNormalizedNodeRow(nodeRow, now) {
  const persistedStatus = normalizeString(nodeRow?.[COLUMN.STATUS]);
  const reusableStatus =
    NON_REUSABLE_NODE_STATUSES.includes(persistedStatus) ?
      null :
      persistedStatus;
  return {
    ...nodeRow,
    [COLUMN.STATUS]: reusableStatus || NODE_STATE.JOINING,
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.LAST_HEARTBEAT]: now,
    [COLUMN.READY_LEASE_EXPIRES_AT]: null,
  };
}

/**
 * Build the typed deferred error for an UNAVAILABLE authoritative row
 * source. Transient unavailability must never fall through to the fresh
 * upsert (which could clobber a row the authority actually holds); the
 * error is tagged retryable (deferRetry + retryAfterMs) so the join
 * registration retry loop re-enters instead of proceeding fresh.
 * @param {string} tableName - Authoritative table whose read was unavailable.
 * @return {Error} Tagged retryable deferred error.
 */
function buildAuthoritativeRowSourceUnavailableError(tableName) {
  const error = new Error(AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE_MESSAGE);
  error.deferRetry = true;
  error.retryAfterMs = AUTHORITATIVE_ROW_UNAVAILABLE_RETRY_AFTER_MS;
  error.authoritativeRowReadState = AUTHORITATIVE_ROW_READ_STATE.UNAVAILABLE;
  error.tableName = tableName;
  return error;
}

class NodeRegistrationOwnerDurableRejoinMethods {
  /**
   * Throw the typed deferred error when an authoritative row read was
   * UNAVAILABLE. Callers must run this check before treating a null row or
   * an empty row list as genuine absence.
   * @param {Object} outcome - Typed {state, rows} authoritative read outcome.
   */
  throwIfAuthoritativeRowsUnavailable(outcome) {
    if (outcome?.state !== AUTHORITATIVE_ROW_READ_STATE.UNAVAILABLE) {
      return;
    }
    this.delegates.getLogger?.().warn?.(
      LOG_AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
      {nodeId: this.nodeId, tableName: outcome?.tableName || null},
    );
    throw buildAuthoritativeRowSourceUnavailableError(outcome?.tableName);
  }

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

    const authoritativeEndpointOutcome =
      await this.readAuthoritativeNodeEndpointRowOutcome();
    this.throwIfAuthoritativeRowsUnavailable(authoritativeEndpointOutcome);
    const authoritativeEndpointRow = authoritativeEndpointOutcome.row;
    if (!authoritativeEndpointRow) {
      return null;
    }

    const metaEndpointOutcome =
      await this.readAuthoritativeMetaEndpointRowsOutcome();
    this.throwIfAuthoritativeRowsUnavailable(metaEndpointOutcome);
    const metaEndpointRows = metaEndpointOutcome.rows;
    if (metaEndpointRows.length !==
      DURABLE_REJOIN_REQUIRED_SERVICE_IDS.length) {
      return null;
    }

    const reusedNodeRow = buildReentryNormalizedNodeRow(
      authoritativeNodeRow,
      now,
    );
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

    if (NON_REUSABLE_NODE_STATUSES.includes(
      normalizeString(nodeRow[COLUMN.STATUS]),
    )) {
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

    const authoritativeEndpointOutcome =
      await this.readAuthoritativeNodeEndpointRowOutcome();
    this.throwIfAuthoritativeRowsUnavailable(authoritativeEndpointOutcome);
    const metaEndpointOutcome =
      await this.readAuthoritativeMetaEndpointRowsOutcome();
    this.throwIfAuthoritativeRowsUnavailable(metaEndpointOutcome);
    return {
      nodeRow: buildReentryNormalizedNodeRow(
        authoritativeNodeRow,
        this.delegates.getNow()(),
      ),
      endpointRow: authoritativeEndpointOutcome.row,
      metaEndpointRows: metaEndpointOutcome.rows,
      resolution: {
        source: JOIN_ADMISSION_RESOLUTION_SOURCE.EXISTING_PROGRESS,
      },
    };
  }

  /**
   * The durable-rejoin fast path may only run behind an affirmative fence
   * verdict. A missing or malformed fence blocks rejoin (fail-closed): the
   * join then proceeds down the normal admission path rather than reusing
   * durable membership on an unevaluated incarnation gate.
   * @return {Promise<boolean>} True when durable rejoin must not proceed.
   */
  async durableRejoinBlockedByClusterIncarnationFence() {
    const fence = await this.resolveClusterIncarnationFence();
    if (!fence || typeof fence !== 'object') {
      this.delegates.getLogger?.().warn?.(
        LOG_CLUSTER_INCARNATION_FENCE_UNAVAILABLE,
        {nodeId: this.nodeId},
      );
      return true;
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

  /**
   * Read authoritative rows as a typed {state, rows} outcome (mirrors the
   * DURABLE_EVIDENCE_STATE missing/readable/unreadable pattern): READABLE
   * when the authority answered the read (rows may be empty, which is
   * genuine absence), UNAVAILABLE when the view cannot read or the read
   * failed. UNAVAILABLE must never be collapsed to absence — the join
   * resolve paths defer (typed retryable error) rather than fresh-upserting
   * over rows the authority actually holds.
   * @param {string} tableName - Authoritative table to read.
   * @param {string} sql - Read query.
   * @param {Array<*>} [params=[]] - Query parameters.
   * @return {Promise<Object>} Typed {state, rows, tableName} outcome.
   */
  async readAuthoritativeRows(tableName, sql, params = []) {
    const view = this.getAuthoritativeControlPlaneView();
    let rows = null;
    if (view?.canRead()) {
      try {
        const result = await view.readRows(tableName, sql, params);
        rows = result?.success === true && Array.isArray(result.rows) ?
          result.rows :
          null;
      } catch (_error) {
        rows = null;
      }
    }
    // One canonical outcome: a resolved row list is READABLE (empty rows are
    // genuine absence); anything else means the authority did not answer
    // and is UNAVAILABLE (never collapsed to absence).
    const readable = rows !== null;
    return {
      state: readable ?
        AUTHORITATIVE_ROW_READ_STATE.READABLE :
        AUTHORITATIVE_ROW_READ_STATE.UNAVAILABLE,
      rows: readable ? rows : [],
      tableName,
    };
  }

  async readAuthoritativeDurableRejoinNodeRowOutcome() {
    const outcome = await this.readAuthoritativeRows(
      TABLES.NODES,
      `SELECT * FROM ${TABLES.NODES} WHERE ${COLUMN.NODE_ID} = ?`,
      [this.nodeId],
    );
    return {
      ...outcome,
      row: outcome.rows.find((row) =>
        normalizeString(row?.[COLUMN.NODE_ID]) === this.nodeId,
      ) || null,
    };
  }

  async readAuthoritativeDurableRejoinNodeRow() {
    const outcome = await this.readAuthoritativeDurableRejoinNodeRowOutcome();
    this.throwIfAuthoritativeRowsUnavailable(outcome);
    return outcome.row;
  }

  async readAuthoritativeNodeEndpointRowOutcome() {
    const expectedWsAddress = normalizeString(
      this.resolveCanonicalWsAddress(),
    );
    const outcome = await this.readAuthoritativeRows(
      TABLES.NODE_ENDPOINTS,
      `SELECT * FROM ${TABLES.NODE_ENDPOINTS} WHERE ${COLUMN.NODE_ID} = ?`,
      [this.nodeId],
    );
    return {
      ...outcome,
      row: outcome.rows.find((row) => {
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
      }) || null,
    };
  }

  async readAuthoritativeNodeEndpointRow() {
    const outcome = await this.readAuthoritativeNodeEndpointRowOutcome();
    this.throwIfAuthoritativeRowsUnavailable(outcome);
    return outcome.row;
  }

  async readAuthoritativeMetaEndpointRowsOutcome() {
    const outcome = await this.readAuthoritativeRows(
      TABLES.SERVICE_ENDPOINTS,
      `SELECT * FROM ${TABLES.SERVICE_ENDPOINTS} WHERE ${COLUMN.NODE_ID} = ?`,
      [this.nodeId],
    );
    const rows = outcome.state === AUTHORITATIVE_ROW_READ_STATE.READABLE ?
      outcome.rows :
      [];
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

    return {
      ...outcome,
      rows: DURABLE_REJOIN_REQUIRED_SERVICE_IDS
        .map((serviceId) => rowsByServiceId.get(serviceId) || null)
        .filter(Boolean),
    };
  }

  async readAuthoritativeMetaEndpointRows() {
    const outcome = await this.readAuthoritativeMetaEndpointRowsOutcome();
    this.throwIfAuthoritativeRowsUnavailable(outcome);
    return outcome.rows;
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
