import {
  isBootJoinRejoinMembershipOwnerOutcome,
  MEMBERSHIP_LIFECYCLE_INTENT,
  resolveMembershipJoinIntentType,
} from '../../control-plane/membership-lifecycle-controller.js';
import {AuthoritativeControlPlaneView} from
  '../../control-plane/authoritative-control-plane-view.js';
import {
  COLUMN,
  SERVICE_TYPE,
  TABLES,
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
  recordNodeRegistrationIssue,
} from '../../control-plane/owners/node-registration-incarnation-write.js';
import {
  AUTHORITATIVE_ROW_UNAVAILABLE_RETRY_AFTER_MS,
  DURABLE_REJOIN_REQUIRED_SERVICE_IDS,
  LOG_AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
  LOG_CLUSTER_INCARNATION_FENCE_UNAVAILABLE,
  NODE_REGISTRATION_ERROR,
  REUSABLE_JOIN_ADMISSION_CONNECTION_STATES,
  hasFunction,
  normalizeString,
} from './node-registration-owner-constants.js';
import {
  buildAuthoritativeRowSourceUnavailableError,
  buildDurableRejoinMembershipResolution,
  buildExistingJoinAdmissionProgressResolution,
  canReuseObservedJoinAdmissionNodeRowForAddress,
  collectReusedEndpointEntries,
  filterAuthoritativeMetaEndpointRows,
  filterAuthoritativeNodeEndpointRow,
  readObservedBootIncarnation,
  stampReusedEndpointMembershipIncarnations,
  withOriginHlcStamp,
} from './node-registration-owner-row-builder.js';
import {
  SELECT_NODE_PARTITION_SERVICE_ROWS_SQL,
  failLostStoragePartitionReplicas,
} from './node-registration-lost-storage-replicas.js';

const NODE_BOOT_INCARNATION_ADVANCE_NOT_OBSERVED =
  'Node boot incarnation advance was not observed on the authoritative row';

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

    return buildDurableRejoinMembershipResolution({
      authoritativeNodeRow,
      authoritativeEndpointRow,
      metaEndpointRows,
      now,
      currentIncarnation: this.getRegistrationBootIncarnation(),
      hostId: this.hostId,
    });
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
    return canReuseObservedJoinAdmissionNodeRowForAddress(
      nodeRow,
      this.nodeAddress,
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
    return buildExistingJoinAdmissionProgressResolution({
      authoritativeNodeRow,
      authoritativeEndpointRow: authoritativeEndpointOutcome.row,
      metaEndpointRows: metaEndpointOutcome.rows,
      now: this.delegates.getNow()(),
      currentIncarnation: this.getRegistrationBootIncarnation(),
      hostId: this.hostId,
    });
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
    if (existingMembership && typeof existingMembership === 'object' && advanced) {
      existingMembership.nodeRow = advanced;
    }
    await this.advanceReusedEndpointRows(existingMembership);
    return advanced;
  }

  // The reused endpoint rows move to this boot with the node row: each is
  // advanced by one CAS on its observed (older) incarnation, never written
  // over a newer owner. The cache is then seeded with this boot's rows.
  async advanceReusedEndpointRows(existingMembership) {
    const bootIncarnation = this.getRegistrationBootIncarnation();
    const hasObject = existingMembership && typeof existingMembership === 'object';
    const advancedMetaRows = [];
    for (const [tableName, row] of collectReusedEndpointEntries(existingMembership)) {
      const advancedRow = await this.advanceSingleReusedEndpointRow(
        tableName, row, bootIncarnation);
      if (tableName === TABLES.NODE_ENDPOINTS && hasObject) {
        existingMembership.endpointRow = advancedRow;
      } else if (tableName === TABLES.SERVICE_ENDPOINTS) {
        advancedMetaRows.push(advancedRow);
      }
    }
    if (hasObject && Array.isArray(existingMembership.metaEndpointRows)) {
      existingMembership.metaEndpointRows = advancedMetaRows;
    }
    stampReusedEndpointMembershipIncarnations(existingMembership, bootIncarnation);
  }

  async advanceSingleReusedEndpointRow(tableName, row, bootIncarnation) {
    const observedIncarnation = normalizeKnownNodeBootIncarnation(
      readObservedBootIncarnation(row));
    this.assertNodeBootIncarnationNotStale(observedIncarnation, bootIncarnation);
    if (observedIncarnation === bootIncarnation) return row;
    const result = await this.upsertSystemTableRowWithRetry(tableName, row);
    if (result?.success === false) {
      throw new Error(`${NODE_BOOT_INCARNATION_ADVANCE_NOT_OBSERVED}: ${tableName}`);
    }
    return withOriginHlcStamp(
      withOriginHlcStamp(row, result?.partitionResult?.originHlc),
      result?.originHlc,
    );
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
    // The NODES registration classification (D-7), bound to this boot
    // lifecycle's issue record: newer, or this number written by another
    // life of the node id -> superseded; this lifecycle already owns the row
    // -> CURRENT, no write (a same-boot re-entry never re-CASes its own
    // row); absent -> no CAS, the reread decides and the registration
    // re-entry births the row; older -> one CAS below.
    const relation = this.classifyLifecycleRegistrationRelation(
      observedNodeRow, nextIncarnation);
    if (relation === NODE_INCARNATION_RELATION.CURRENT) return nextNodeRow;
    if (relation === NODE_INCARNATION_RELATION.ABSENT) {
      return this.resolveNodeBootIncarnationAdvanceByReadback(
        nextNodeRow, nextIncarnation);
    }
    recordNodeRegistrationIssue(this.registrationIssueRecord, nextIncarnation);
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
    if (
      result?.success !== false &&
      Number(result?.partitionResult?.affectedRows) > 0
    ) {
      const originHlc =
        result?.originHlc || result?.partitionResult?.originHlc;
      return withOriginHlcStamp(nextNodeRow, originHlc);
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
   * @return {Promise<Object>}
   */
  async advanceStaleJoinAdmissionIncarnation(progress) {
    progress.nodeRow = await this.advanceNodeBootIncarnation(
      progress.observedNodeRow,
      progress.nodeRow,
    );
    await this.advanceReusedEndpointRows(progress);
    return progress.nodeRow;
  }

  // The NODES registration is monotonic in its own mutation (D-7): a newer
  // incarnation's row is never replaced; a new boot lifecycle supersedes it.
  async registerJoinNodeRow(rowData, mutationOptions) {
    const bootIncarnation = this.getRegistrationBootIncarnation();
    const {
      outcome,
      observedRow,
      originHlc,
      error: attemptError,
    } = await this
      .getMembershipPublicationRuntimeOwner()
      .registerJoinNodeAtIncarnation(rowData, bootIncarnation,
        this.registrationIssueRecord, mutationOptions);
    if (outcome === NODE_REGISTRATION_OUTCOME.ACCEPTED ||
        outcome === NODE_REGISTRATION_OUTCOME.CURRENT) {
      return {
        success: true,
        outcome,
        originHlc: originHlc || null,
      };
    }
    if (outcome === NODE_REGISTRATION_OUTCOME.REFUSED_STALE) {
      throw this.buildRegistrationSupersededError(observedRow, bootIncarnation);
    }
    if (attemptError) throw attemptError;
    const error = new Error(`${NODE_REGISTRATION_ERROR
      .REGISTRATION_UNRESOLVED}: ${outcome}`);
    error.deferRetry = true;
    error.retryAfterMs = AUTHORITATIVE_ROW_UNAVAILABLE_RETRY_AFTER_MS;
    throw error;
  }

  /**
   * The registration relation of an observed NODES row to this boot
   * lifecycle (node-registration-incarnation-write.js): a superseding row
   * (newer, or this number written by another life of the node id) is
   * refused here with the typed superseded or twin error.
   * @param {Object|null} observedNodeRow
   * @param {number} bootIncarnation
   * @return {string} ABSENT, OLDER or CURRENT.
   */
  classifyLifecycleRegistrationRelation(observedNodeRow, bootIncarnation) {
    const relation = classifyNodeIncarnationRelation(observedNodeRow,
      bootIncarnation, this.registrationIssueRecord);
    if (relation === NODE_INCARNATION_RELATION.NEWER) {
      throw this.buildRegistrationSupersededError(observedNodeRow,
        bootIncarnation);
    }
    return relation;
  }

  // This boot lifecycle is superseded. The failure is retryable only by a
  // NEW lifecycle, which reserves above the known incarnation (the joiner's
  // reattempt raises the boot incarnation owner's floor from the error's
  // knownIncarnation); it is never resumed at this incarnation. A live twin
  // on another host is refused for an operator instead.
  buildRegistrationSupersededError(observedNodeRow, bootIncarnation) {
    return buildSupersededRegistrationError({
      nodeId: this.nodeId,
      receivedIncarnation: bootIncarnation,
      observedRow: observedNodeRow,
      declaredHostId: this.hostId,
      nowMs: this.delegates.getNow()(),
    });
  }

  // An endpoint row a newer incarnation owns: this boot lifecycle is
  // superseded (the node row was already classified for this lifecycle).
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
    if (this.classifyLifecycleRegistrationRelation(observedRow,
      nextIncarnation) === NODE_INCARNATION_RELATION.CURRENT) {
      return withOriginHlcStamp(nextNodeRow, observedRow?.[COLUMN.UPDATED_AT_HLC]);
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
    const outcome = await this.readAuthoritativeRows(
      TABLES.NODE_ENDPOINTS,
      `SELECT * FROM ${TABLES.NODE_ENDPOINTS} WHERE ${COLUMN.NODE_ID} = ?`,
      [this.nodeId],
    );
    return {
      ...outcome,
      row: filterAuthoritativeNodeEndpointRow(
        outcome,
        this.nodeId,
        this.resolveCanonicalWsAddress(),
      ),
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
    return {
      ...outcome,
      rows: filterAuthoritativeMetaEndpointRows(outcome, this.nodeId),
    };
  }

  async readAuthoritativeMetaEndpointRows() {
    const outcome = await this.readAuthoritativeMetaEndpointRowsOutcome();
    this.throwIfAuthoritativeRowsUnavailable(outcome);
    return outcome.rows;
  }

  /**
   * A fresh-storage registration's proven-lost partition replicas go to
   * FAILED through their lifecycle owner
   * (node-registration-lost-storage-replicas.js).
   * @param {number} now
   * @return {Promise<string[]>} Service ids transitioned to FAILED.
   */
  async failLostStoragePartitionReplicas(now) {
    return failLostStoragePartitionReplicas({
      fence: await this.resolveClusterIncarnationFence(),
      nodeId: this.nodeId,
      now,
      readRows: () => this.readAuthoritativeRows(
        TABLES.SERVICES,
        SELECT_NODE_PARTITION_SERVICE_ROWS_SQL,
        [this.nodeId, SERVICE_TYPE.PARTITION],
      ),
      assertReadable: (outcome) =>
        this.throwIfAuthoritativeRowsUnavailable(outcome),
      readStorageState: (replica) =>
        this.delegates.readLocalReplicaStorageState(replica),
      getReplicaStateMachine: () => this.delegates.getReplicaStateMachine(),
    });
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
