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
  buildStaleNodeIncarnationError,
  normalizeKnownNodeBootIncarnation,
} from '../../control-plane/control-plane-error-classification.js';
import {
  AUTHORITATIVE_ROW_READ_STATE,
} from '../rejoin-hints-constants.js';
import {
  NODE_INCARNATION_RELATION,
  NODE_REGISTRATION_OUTCOME,
  buildSupersededRegistrationError,
  classifyNodeIncarnationRelation,
} from '../../control-plane/owners/node-registration-incarnation-write.js';
import {
  AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE_MESSAGE,
  AUTHORITATIVE_ROW_UNAVAILABLE_RETRY_AFTER_MS,
  DURABLE_REJOIN_REQUIRED_SERVICE_IDS,
  JOIN_ADMISSION_RESOLUTION_SOURCE,
  LOG_AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
  LOG_CLUSTER_INCARNATION_FENCE_UNAVAILABLE,
  NODE_REGISTRATION_ERROR,
  REUSABLE_JOIN_ADMISSION_CONNECTION_STATES,
  hasFunction,
  normalizeString,
} from './node-registration-owner-constants.js';

const NON_REUSABLE_NODE_STATUSES = Object.freeze([
  NODE_STATE.FAILED,
  NODE_STATE.SHUTTING_DOWN,
  NODE_STATE.STOPPED,
]);

const NODE_BOOT_INCARNATION_ADVANCE_NOT_OBSERVED =
  'Node boot incarnation advance was not observed on the authoritative row';

/**
 * A reused durable membership row must never re-publish a terminal status
 * or a stale lease/heartbeat from the previous incarnation. Reentry
 * normalizes the row to JOINING with a fresh heartbeat and a cleared lease,
 * stamped with THIS boot's incarnation; the canonical ready transition
 * promotes it from there.
 * @param {Object} nodeRow - Authoritative durable node row.
 * @param {number} now - Current timestamp.
 * @param {number} bootIncarnation - This boot's incarnation.
 * @return {Object} Reentry-normalized node row.
 */
function buildReentryNormalizedNodeRow(nodeRow, now, bootIncarnation) {
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
    [COLUMN.BOOT_INCARNATION]: bootIncarnation,
  };
}

function readObservedBootIncarnation(nodeRow) {
  const observed = nodeRow?.[COLUMN.BOOT_INCARNATION];
  return observed === undefined ? null : observed;
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
      this.getRegistrationBootIncarnation(),
    );
    return {
      nodeRow: reusedNodeRow,
      observedNodeRow: authoritativeNodeRow,
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
        this.getRegistrationBootIncarnation(),
      ),
      observedNodeRow: authoritativeNodeRow,
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
    const advanced = await this.advanceNodeBootIncarnation(
      existingMembership?.observedNodeRow || null,
      existingMembership?.nodeRow || null,
    );
    await this.advanceReusedEndpointRows(existingMembership);
    return advanced;
  }

  // The reused endpoint rows move to this boot with the node row: each is
  // advanced by one CAS on its observed (older) incarnation, never written
  // over a newer owner. The cache is then seeded with this boot's rows.
  async advanceReusedEndpointRows(existingMembership) {
    const bootIncarnation = this.getRegistrationBootIncarnation();
    const reused = [
      [TABLES.NODE_ENDPOINTS, existingMembership?.endpointRow],
      ...(existingMembership?.metaEndpointRows || []).map((row) =>
        [TABLES.SERVICE_ENDPOINTS, row]),
    ].filter(([, row]) => row);
    for (const [tableName, row] of reused) {
      const result = await this.upsertSystemTableRowWithRetry(tableName, row);
      if (result?.success === false) {
        throw new Error(
          `${NODE_BOOT_INCARNATION_ADVANCE_NOT_OBSERVED}: ${tableName}`);
      }
    }
    existingMembership.endpointRow = existingMembership.endpointRow ?
      {...existingMembership.endpointRow,
        [COLUMN.BOOT_INCARNATION]: bootIncarnation} :
      existingMembership.endpointRow;
    existingMembership.metaEndpointRows =
      (existingMembership.metaEndpointRows || []).map((row) =>
        ({...row, [COLUMN.BOOT_INCARNATION]: bootIncarnation}));
  }

  getRegistrationBootIncarnation() {
    return this.delegates.getBootIncarnation();
  }

  /**
   * The explicit incarnation transition owned by registration / durable
   * rejoin: one CAS on the OBSERVED older boot incarnation writing this
   * boot's row. Lifecycle publication never advances an incarnation, so a
   * READY publication for this boot can only match a row this verb advanced.
   * No retry here: an unobserved advance is a typed deferred error the join
   * registration re-enters on.
   * @param {Object} observedNodeRow - Authoritative row the advance replaces.
   * @param {Object} nextNodeRow - Row stamped with this boot's incarnation.
   * @return {Promise<Object>} The advanced row.
   */
  async advanceNodeBootIncarnation(observedNodeRow, nextNodeRow) {
    const nextIncarnation = normalizeKnownNodeBootIncarnation(
      nextNodeRow?.[COLUMN.BOOT_INCARNATION],
    );
    // The NODES registration classification (D-7): newer -> refused; this
    // boot already owns the row -> CURRENT, no write (a same-boot re-entry
    // never re-CASes its own row); absent -> no CAS, the reread decides and
    // the registration re-entry births the row; older -> one CAS below.
    const relation = classifyNodeIncarnationRelation(observedNodeRow,
      nextIncarnation);
    this.assertNodeBootIncarnationNotStale(
      normalizeKnownNodeBootIncarnation(
        readObservedBootIncarnation(observedNodeRow),
      ),
      nextIncarnation,
    );
    if (relation === NODE_INCARNATION_RELATION.CURRENT) return nextNodeRow;
    if (relation === NODE_INCARNATION_RELATION.ABSENT) {
      return this.resolveNodeBootIncarnationAdvanceByReadback(
        nextNodeRow, nextIncarnation);
    }
    let result = null;
    try {
      result = await this.getMembershipPublicationRuntimeOwner()
        .advanceJoinNodeBootIncarnation(
          {
            [COLUMN.NODE_ID]: this.nodeId,
            [COLUMN.BOOT_INCARNATION]:
              readObservedBootIncarnation(observedNodeRow),
          },
          nextNodeRow,
          this.getJoinTimeUpsertOptions(),
        );
    } catch (_error) {
      result = null;
    }
    if (result?.success !== false &&
        Number(result?.partitionResult?.affectedRows) > 0) {
      return nextNodeRow;
    }
    return this.resolveNodeBootIncarnationAdvanceByReadback(
      nextNodeRow,
      nextIncarnation,
    );
  }

  /**
   * Resumed join-admission progress from an earlier boot still carries that
   * boot's incarnation; advance it before this boot publishes lifecycle.
   * Progress already on this boot is left untouched (the advance verb's
   * CURRENT outcome).
   * @param {Object} progress - Resolved existing join-admission progress.
   * @return {Promise<void>}
   */
  async advanceStaleJoinAdmissionIncarnation(progress) {
    await this.advanceNodeBootIncarnation(
      progress.observedNodeRow,
      progress.nodeRow,
    );
  }

  // The NODES registration is monotonic in its own mutation (D-7): a newer
  // incarnation's row is never replaced; a new boot lifecycle supersedes it.
  async registerJoinNodeRow(rowData, mutationOptions) {
    const bootIncarnation = this.getRegistrationBootIncarnation();
    const {outcome, observedRow, error: attemptError} = await this
      .getMembershipPublicationRuntimeOwner()
      .registerJoinNodeAtIncarnation(rowData, bootIncarnation,
        mutationOptions);
    if (outcome === NODE_REGISTRATION_OUTCOME.ACCEPTED ||
        outcome === NODE_REGISTRATION_OUTCOME.CURRENT) {
      return {success: true, outcome};
    }
    if (outcome === NODE_REGISTRATION_OUTCOME.REFUSED_STALE) {
      throw buildSupersededRegistrationError(this.nodeId, bootIncarnation,
        observedRow);
    }
    if (attemptError) throw attemptError;
    const error = new Error(`${NODE_REGISTRATION_ERROR
      .REGISTRATION_UNRESOLVED}: ${outcome}`);
    error.deferRetry = true;
    error.retryAfterMs = AUTHORITATIVE_ROW_UNAVAILABLE_RETRY_AFTER_MS;
    throw error;
  }

  // A newer incarnation owns the row: this boot lifecycle is superseded.
  // The failure is retryable only by a NEW lifecycle, which reserves above
  // the known incarnation (boot-incarnation-owner.js raiseBootIncarnation
  // Floor); it is never resumed at this incarnation.
  assertNodeBootIncarnationNotStale(knownIncarnation, nextIncarnation) {
    if (knownIncarnation > nextIncarnation) {
      const error = buildStaleNodeIncarnationError({
        nodeId: this.nodeId,
        receivedIncarnation: nextIncarnation,
        knownIncarnation,
      });
      error.retryable = true;
      throw error;
    }
  }

  async resolveNodeBootIncarnationAdvanceByReadback(
    nextNodeRow,
    nextIncarnation,
  ) {
    const observedRow = await this.readAuthoritativeDurableRejoinNodeRow();
    const knownIncarnation = normalizeKnownNodeBootIncarnation(
      readObservedBootIncarnation(observedRow),
    );
    this.assertNodeBootIncarnationNotStale(knownIncarnation, nextIncarnation);
    if (knownIncarnation === nextIncarnation) {
      return nextNodeRow;
    }
    const error = new Error(NODE_BOOT_INCARNATION_ADVANCE_NOT_OBSERVED);
    error.deferRetry = true;
    error.retryAfterMs = AUTHORITATIVE_ROW_UNAVAILABLE_RETRY_AFTER_MS;
    throw error;
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
