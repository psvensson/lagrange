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
import {ReplicaStatus} from '../../rebalancer/replica-status.js';
import {
  classifyControlPlaneMutationResult,
} from '../../control-plane/control-plane-mutation-outcome-classifier.js';
import {raiseBootIncarnationFloor} from '../boot-incarnation-owner.js';
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
  AUTHORITATIVE_ROW_UNAVAILABLE_RETRY_AFTER_MS,
  DURABLE_REJOIN_REQUIRED_SERVICE_IDS,
  JOIN_ADMISSION_PUBLICATION,
  LOG_AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
  LOG_CLUSTER_INCARNATION_FENCE_UNAVAILABLE,
  NODE_REGISTRATION_ERROR,
  REUSABLE_JOIN_ADMISSION_CONNECTION_STATES,
  SELECT_NODE_PARTITION_SERVICE_ROWS_SQL,
  hasFunction,
  normalizeString,
} from './node-registration-owner-constants.js';
import {
  buildAuthoritativeRowSourceUnavailableError,
  buildDurableRejoinMembershipResolution,
  buildExistingJoinAdmissionProgressResolution,
  buildFailedLostStoragePartitionRow,
  buildLostStorageMutationFailureError,
  canReuseObservedJoinAdmissionNodeRowForAddress,
  collectReusedEndpointEntries,
  filterAuthoritativeMetaEndpointRows,
  filterAuthoritativeNodeEndpointRow,
  filterAuthoritativePartitionServiceRowsForNode,
  isDurableRejoinFenceContinuityPresent,
  readObservedBootIncarnation,
  readObservedStorageIncarnation,
  resolveHighestObservedNodeIncarnation,
  stampReusedEndpointMembershipIncarnations,
  withOriginHlcStamp,
} from './node-registration-owner-row-builder.js';

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

    if (!(await this.hasDurableRejoinStorageContinuity())) {
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

    const currentIncarnation = normalizeKnownNodeBootIncarnation(
      this.getRegistrationBootIncarnation(),
    );
    const storageIncarnation = readObservedStorageIncarnation(
      authoritativeNodeRow,
      authoritativeEndpointRow,
    );
    this.latchedRegistrationBootIncarnation = currentIncarnation;
    if (storageIncarnation !== null) {
      this.latchedRegistrationStorageIncarnation = storageIncarnation;
    }
    return buildDurableRejoinMembershipResolution({
      authoritativeNodeRow,
      authoritativeEndpointRow,
      metaEndpointRows,
      now,
      currentIncarnation,
      storageIncarnation,
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
    const hasDurableContinuity =
      await this.hasDurableRejoinStorageContinuity();
    const latchedBootIncarnation = normalizeKnownNodeBootIncarnation(
      this.latchedRegistrationBootIncarnation,
    );
    const hasLatchedSameBootAttempt = latchedBootIncarnation > 0;
    if (!hasDurableContinuity && !hasLatchedSameBootAttempt) {
      return null;
    }

    const authoritativeNodeRow =
      await this.readAuthoritativeDurableRejoinNodeRow();
    const observedBootIncarnation = normalizeKnownNodeBootIncarnation(
      readObservedBootIncarnation(authoritativeNodeRow),
    );
    const sameBootRetry =
      hasLatchedSameBootAttempt &&
      observedBootIncarnation === latchedBootIncarnation;
    if (
      !this.canReuseObservedJoinAdmissionNodeRow(authoritativeNodeRow) ||
      (!hasDurableContinuity && !sameBootRetry)
    ) {
      return null;
    }
    const currentIncarnation = normalizeKnownNodeBootIncarnation(
      this.getRegistrationBootIncarnation(),
    );
    this.latchedRegistrationBootIncarnation = currentIncarnation;

    const authoritativeEndpointOutcome =
      await this.readAuthoritativeNodeEndpointRowOutcome();
    this.throwIfAuthoritativeRowsUnavailable(authoritativeEndpointOutcome);
    const metaEndpointOutcome =
      await this.readAuthoritativeMetaEndpointRowsOutcome();
    this.throwIfAuthoritativeRowsUnavailable(metaEndpointOutcome);
    const observedStorageIncarnation = readObservedStorageIncarnation(
      authoritativeNodeRow,
      authoritativeEndpointOutcome.row,
    );
    let storageIncarnation = observedStorageIncarnation;
    if (storageIncarnation === null) {
      if (sameBootRetry) {
        storageIncarnation = this.getRegistrationStorageIncarnation();
      } else if (
        !authoritativeEndpointOutcome.row &&
        observedBootIncarnation === 1
      ) {
        storageIncarnation = 1;
      }
    }
    if (storageIncarnation !== null) {
      this.latchedRegistrationStorageIncarnation = storageIncarnation;
    }
    return buildExistingJoinAdmissionProgressResolution({
      authoritativeNodeRow,
      authoritativeEndpointRow: authoritativeEndpointOutcome.row,
      metaEndpointRows: metaEndpointOutcome.rows,
      now: this.delegates.getNow()(),
      currentIncarnation,
      storageIncarnation,
      sameBootRetry,
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

  async hasDurableRejoinStorageContinuity() {
    if (await this.durableRejoinBlockedByClusterIncarnationFence()) {
      return false;
    }
    const fence = await this.resolveClusterIncarnationFence();
    return isDurableRejoinFenceContinuityPresent(
      fence,
      this.getJoinLifecycleIntentType(),
    );
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
    const reused = collectReusedEndpointEntries(existingMembership);
    for (const [tableName, row] of reused) {
      await this.advanceSingleReusedEndpointRow(
        tableName,
        row,
        bootIncarnation,
      );
    }
    stampReusedEndpointMembershipIncarnations(
      existingMembership,
      bootIncarnation,
    );
  }

  async advanceSingleReusedEndpointRow(tableName, row, bootIncarnation) {
    const observedIncarnation = normalizeKnownNodeBootIncarnation(
      readObservedBootIncarnation(row),
    );
    this.assertNodeBootIncarnationNotStale(
      observedIncarnation,
      bootIncarnation,
    );
    if (observedIncarnation === bootIncarnation) {
      return;
    }
    const result = await this.upsertSystemTableRowWithRetry(tableName, row);
    if (result?.success === false) {
      throw new Error(
        `${NODE_BOOT_INCARNATION_ADVANCE_NOT_OBSERVED}: ${tableName}`,
      );
    }
    withOriginHlcStamp(row, result?.originHlc);
  }

  getRegistrationBootIncarnation() {
    const latched = normalizeKnownNodeBootIncarnation(
      this.latchedRegistrationBootIncarnation,
    );
    return latched > 0 ? latched : this.delegates.getBootIncarnation();
  }

  getRegistrationStorageIncarnation() {
    const latched = normalizeKnownNodeBootIncarnation(
      this.latchedRegistrationStorageIncarnation,
    );
    return latched > 0 ? latched : this.getRegistrationBootIncarnation();
  }

  async advanceFreshStorageIncarnationFloorFromCluster() {
    const latched = normalizeKnownNodeBootIncarnation(
      this.latchedRegistrationBootIncarnation,
    );
    if (latched > 0) {
      return latched;
    }
    const currentIncarnation = normalizeKnownNodeBootIncarnation(
      this.getRegistrationBootIncarnation(),
    );
    const nodeOutcome =
      await this.readAuthoritativeDurableRejoinNodeRowOutcome();
    this.throwIfAuthoritativeRowsUnavailable(nodeOutcome);
    const endpointOutcome =
      await this.readAuthoritativeNodeEndpointRowOutcome();
    this.throwIfAuthoritativeRowsUnavailable(endpointOutcome);

    const highestObservedIncarnation = resolveHighestObservedNodeIncarnation(
      nodeOutcome,
      endpointOutcome,
    );
    const nextIncarnation =
      highestObservedIncarnation > 0 ?
        Math.max(currentIncarnation, highestObservedIncarnation + 1) :
        currentIncarnation;
    this.latchedRegistrationBootIncarnation = nextIncarnation;
    this.latchedRegistrationStorageIncarnation = nextIncarnation;
    if (highestObservedIncarnation <= 0) {
      return nextIncarnation;
    }
    if (hasFunction(this.delegates.raiseBootIncarnationFloor)) {
      await this.delegates.raiseBootIncarnationFloor(nextIncarnation);
    }
    const dataDir = normalizeString(this.delegates.getDataDir?.());
    if (dataDir.length > 0) {
      await raiseBootIncarnationFloor(dataDir, nextIncarnation);
    }
    return nextIncarnation;
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
   * @return {Promise<void>}
   */
  async advanceStaleJoinAdmissionIncarnation(progress) {
    await this.advanceNodeBootIncarnation(
      progress.observedNodeRow,
      progress.nodeRow,
    );
    await this.advanceReusedEndpointRows(progress);
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
        mutationOptions);
    if (outcome === NODE_REGISTRATION_OUTCOME.ACCEPTED ||
        outcome === NODE_REGISTRATION_OUTCOME.CURRENT) {
      return {
        success: true,
        outcome,
        originHlc: originHlc || null,
      };
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

  async readAuthoritativePartitionServiceRowsOutcome() {
    const outcome = await this.readAuthoritativeRows(
      TABLES.SERVICES,
      SELECT_NODE_PARTITION_SERVICE_ROWS_SQL,
      [this.nodeId, SERVICE_TYPE.PARTITION],
    );
    return {
      ...outcome,
      rows: filterAuthoritativePartitionServiceRowsForNode(
        outcome,
        this.nodeId,
      ),
    };
  }

  async readExistingPartitionServiceRowsForNode() {
    const outcome = await this.readAuthoritativePartitionServiceRowsOutcome();
    this.throwIfAuthoritativeRowsUnavailable(outcome);
    return outcome.rows;
  }

  async reconcileLostStoragePartitionReplicas(
    now = this.delegates.getNow()(),
  ) {
    const partitionRows = await this.readExistingPartitionServiceRowsForNode();
    const reconciledRows = [];
    for (const row of partitionRows) {
      const currentStatus = normalizeString(row?.[COLUMN.STATUS]).toLowerCase();
      if (currentStatus === ReplicaStatus.FAILED) {
        continue;
      }
      const failedRow = buildFailedLostStoragePartitionRow(row, now);
      const expectedIdentity = {
        [COLUMN.NODE_ID]: this.nodeId,
        [COLUMN.SERVICE_TYPE]:
          normalizeString(row?.[COLUMN.SERVICE_TYPE]) || SERVICE_TYPE.PARTITION,
      };
      const updateResult = await this.upsertSystemTableRowWithRetry(
        TABLES.SERVICES,
        failedRow,
        {
          admissionTarget:
            JOIN_ADMISSION_PUBLICATION.LOST_STORAGE_PARTITION_REPLICA,
          expectedIdentity,
        },
      );
      const classification = classifyControlPlaneMutationResult(updateResult);
      if (classification.applied !== true) {
        throw buildLostStorageMutationFailureError(failedRow, classification);
      }
      this.seedJoinTimeCacheRow(TABLES.SERVICES, failedRow);
      reconciledRows.push(failedRow);
    }
    return reconciledRows;
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
