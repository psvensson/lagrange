import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {SQLQueryEngineSegment4} from './sql-query-engine-segment-4.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_NUM_THREE = 3;

const {
  AddressManager,
  BOOTSTRAP_ROUTING_OVERLAY_ENTRY_STATE,
  BOOTSTRAP_ROUTING_OVERLAY_INSTALL_STATE,
  BOOTSTRAP_ROUTING_OVERLAY_NO_EXPIRY_MS,
  BOOTSTRAP_ROUTING_OVERLAY_PARTITION_STATE,
  BOOTSTRAP_ROUTING_OVERLAY_REASON,
  BOOTSTRAP_ROUTING_OVERLAY_RETENTION_MODE,
  BOOTSTRAP_ROUTING_OVERLAY_REUSE_STATE,
  ENTITY_TYPE,
  NUM,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  SERVICE_TYPE,
  TABLES,
  TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS,
  TABLE_PARTITION_TARGET_NODE_CONVERGENCE_REASON,
  TABLE_PARTITION_TARGET_NODE_WAIT,
  TIMEOUT_BUDGET_CLASSIFICATION,
  buildBootstrapRoutingOverlayEntry,
  buildBootstrapRoutingOverlayEntryState,
  buildOwnerContractOutcome,
  hasActiveAddressedPartitionService,
  resolveBootstrapLeaderSelection,
} = SQL_QUERY_ENGINE_SHARED;

class SQLQueryEngineSegment5 extends SQLQueryEngineSegment4 {
  resolveBootstrapRoutingCanonicalLeaderNodeId(partitionId, serviceRows = []) {
    const bootstrapTopologySnapshotOwner =
      this.queryExecutor?.bootstrapTopologySnapshotOwner || null;
    if (
      bootstrapTopologySnapshotOwner &&
      typeof bootstrapTopologySnapshotOwner.resolveCanonicalPartitionLeaderIdentity ===
        LOCAL_STR_FUNCTION
    ) {
      const leaderIdentity =
        bootstrapTopologySnapshotOwner.resolveCanonicalPartitionLeaderIdentity(
          partitionId,
          serviceRows,
        );
      if (leaderIdentity && typeof leaderIdentity === LOCAL_STR_OBJECT) {
        const leaderNodeId = leaderIdentity.leaderNodeId;
        return typeof leaderNodeId === LOCAL_STR_STRING && leaderNodeId.length > LOCAL_NUM_ZERO ?
          leaderNodeId :
          null;
      }
    }
    if (
      bootstrapTopologySnapshotOwner &&
      typeof bootstrapTopologySnapshotOwner.resolveCanonicalPartitionLeaderNodeId ===
        LOCAL_STR_FUNCTION
    ) {
      const leaderNodeId =
        bootstrapTopologySnapshotOwner.resolveCanonicalPartitionLeaderNodeId(
          partitionId,
        );
      return typeof leaderNodeId === LOCAL_STR_STRING && leaderNodeId.length > LOCAL_NUM_ZERO ?
        leaderNodeId :
        null;
    }
    const cachedPartition = this.getCachedPartitionRecord(partitionId);
    const cachedLeaderNodeId =
      cachedPartition?.leader_node_id || cachedPartition?.leaderNodeId || null;
    return typeof cachedLeaderNodeId === LOCAL_STR_STRING &&
      cachedLeaderNodeId.length > LOCAL_NUM_ZERO ?
      cachedLeaderNodeId :
      null;
  }

  /**
   * Resolve cache-backed routable partition services without overlay help.
   * @param {string} partitionId
   * @return {Object[]}
   * @private
   */
  getCachedRoutablePartitionServiceRows(partitionId) {
    const serviceRows = this.getPartitionServiceRows(partitionId);
    const isRoutableService = (service) => {
      if (!service || typeof service !== 'object') {
        return false;
      }
      if (
        this.queryExecutor &&
        typeof this.queryExecutor.isRoutablePartitionService === 'function'
      ) {
        return this.queryExecutor.isRoutablePartitionService(service);
      }
      return false;
    };
    return serviceRows.filter((service) => isRoutableService(service));
  }

  /**
   * Resolve cache-backed leader service rows that are already active and
   * addressed, independent of readiness filtering.
   * @param {string} partitionId
   * @param {string|null} leaderNodeId
   * @return {Object[]}
   * @private
   */
  getCachedLeaderAddressedPartitionServiceRows(partitionId, leaderNodeId) {
    if (typeof leaderNodeId !== LOCAL_STR_STRING || leaderNodeId.length === LOCAL_NUM_ZERO) {
      return [];
    }
    return this.getPartitionServiceRows(partitionId).filter((service) => {
      return (
        service?.partition_id === partitionId &&
        service?.service_type === SERVICE_TYPE.PARTITION &&
        service?.node_id === leaderNodeId &&
        hasActiveAddressedPartitionService(service)
      );
    });
  }

  /**
   * Resolve the retention mode for one bootstrap routing overlay entry.
   * System-table bridges stay available until canonical cache routing either
   * converges or proves the bootstrap snapshot stale.
   * @param {Object|null} partitionMetadata
   * @param {string|null} tableRef
   * @return {string}
   * @private
   */
  resolveBootstrapRoutingOverlayRetentionMode(
    partitionMetadata = null,
    tableRef = null,
  ) {
    const resolvedTableRef = String(
      partitionMetadata?.table_name ||
        partitionMetadata?.tableName ||
        partitionMetadata?.table_id ||
        partitionMetadata?.tableId ||
        tableRef ||
        '',
    );
    return this.isSystemTable(resolvedTableRef) ?
      BOOTSTRAP_ROUTING_OVERLAY_RETENTION_MODE.SYSTEM_TABLE_SERVICE_GAP_BRIDGE :
      BOOTSTRAP_ROUTING_OVERLAY_RETENTION_MODE.PROVISIONING_WINDOW;
  }

  /**
   * Resolve one explicit overlay expiry timestamp from its retention mode.
   * @param {string} retentionMode
   * @param {number} nowMs
   * @return {number}
   * @private
   */
  resolveBootstrapRoutingOverlayExpiryMs(retentionMode, nowMs) {
    return retentionMode ===
      BOOTSTRAP_ROUTING_OVERLAY_RETENTION_MODE.SYSTEM_TABLE_SERVICE_GAP_BRIDGE ?
      BOOTSTRAP_ROUTING_OVERLAY_NO_EXPIRY_MS :
      nowMs + this.tablePartitionProvisioningTimeoutMs;
  }

  /**
   * Return true when one overlay entry has exhausted its bounded retention.
   * @param {Object|null} entry
   * @return {boolean}
   * @private
   */
  isBootstrapRoutingOverlayEntryExpired(entry) {
    if (!entry || typeof entry !== LOCAL_STR_OBJECT) {
      return false;
    }
    const retentionMode =
      entry.retentionMode ||
      BOOTSTRAP_ROUTING_OVERLAY_RETENTION_MODE.PROVISIONING_WINDOW;
    if (
      retentionMode ===
      BOOTSTRAP_ROUTING_OVERLAY_RETENTION_MODE.SYSTEM_TABLE_SERVICE_GAP_BRIDGE
    ) {
      return false;
    }
    return (
      Number.isFinite(entry.expiresAtMs) && entry.expiresAtMs <= this.nowFn()
    );
  }

  /**
   * Return true when one superseded overlay entry should remain installed so
   * it can reactivate if canonical cache service rows regress later.
   * @param {Object|null} entry
   * @return {boolean}
   * @private
   */
  shouldRetainSupersededBootstrapRoutingOverlayEntry(entry) {
    if (!entry || typeof entry !== LOCAL_STR_OBJECT) {
      return false;
    }
    const retentionMode =
      entry.retentionMode ||
      BOOTSTRAP_ROUTING_OVERLAY_RETENTION_MODE.PROVISIONING_WINDOW;
    return (
      retentionMode ===
      BOOTSTRAP_ROUTING_OVERLAY_RETENTION_MODE.SYSTEM_TABLE_SERVICE_GAP_BRIDGE
    );
  }

  /**
   * Normalize one bootstrap overlay reuse decision from cached leader
   * metadata and overlay service visibility.
   * @param {string} partitionId
   * @param {Object} entry
   * @return {Object}
   * @private
   */
  resolveBootstrapRoutingOverlayReuseDecision(partitionId, entry) {
    const cachedPartition = this.getCachedPartitionRecord(partitionId);
    const overlayServices = Array.isArray(entry?.services) ?
      entry.services :
      [];
    const cachedLeaderNodeId = String(
      this.resolveBootstrapRoutingCanonicalLeaderNodeId(
        partitionId,
        overlayServices,
      ) || '',
    );

    if (cachedLeaderNodeId.length === LOCAL_NUM_ZERO) {
      return Object.freeze({
        state: BOOTSTRAP_ROUTING_OVERLAY_REUSE_STATE.FRESH_BOOTSTRAP,
        reason: BOOTSTRAP_ROUTING_OVERLAY_REASON.FRESH_BOOTSTRAP,
        partition:
          entry?.partition && typeof entry.partition === LOCAL_STR_OBJECT ?
            entry.partition :
            null,
        services: overlayServices,
      });
    }

    const cachedLeaderServices =
      this.getCachedLeaderAddressedPartitionServiceRows(
        partitionId,
        cachedLeaderNodeId,
      );
    if (cachedLeaderServices.length > LOCAL_NUM_ZERO) {
      return Object.freeze({
        state: BOOTSTRAP_ROUTING_OVERLAY_REUSE_STATE.CACHE_READY,
        reason: BOOTSTRAP_ROUTING_OVERLAY_REASON.CACHE_LEADER_SERVICE_READY,
        partition: null,
        services: Object.freeze([]),
      });
    }

    const overlayLeaderServices = overlayServices.filter((service) => {
      return (
        service?.node_id === cachedLeaderNodeId &&
        hasActiveAddressedPartitionService(service)
      );
    });
    if (overlayLeaderServices.length === LOCAL_NUM_ZERO) {
      return Object.freeze({
        state: BOOTSTRAP_ROUTING_OVERLAY_REUSE_STATE.STALE_FOR_CURRENT_LEADER,
        reason: BOOTSTRAP_ROUTING_OVERLAY_REASON.STALE_FOR_CURRENT_LEADER,
        partition: null,
        services: Object.freeze([]),
      });
    }

    const basePartition =
      cachedPartition && typeof cachedPartition === 'object' ?
        cachedPartition :
        entry?.partition && typeof entry.partition === 'object' ?
          entry.partition :
          {partition_id: partitionId};
    return Object.freeze({
      state: BOOTSTRAP_ROUTING_OVERLAY_REUSE_STATE.LEADER_SERVICE_GAP,
      reason: BOOTSTRAP_ROUTING_OVERLAY_REASON.LEADER_SERVICE_GAP,
      partition: {
        ...basePartition,
        partition_id:
          basePartition?.partition_id ||
          basePartition?.partitionId ||
          partitionId,
        leader_node_id: cachedLeaderNodeId,
      },
      services: overlayLeaderServices.map((service) => ({...service})),
    });
  }

  /**
   * Resolve one explicit bootstrap overlay install decision.
   * @param {string} partitionId
   * @param {Object} [options]
   * @return {Object}
   * @private
   */
  resolveBootstrapRoutingOverlayInstallDecision(partitionId, options = {}) {
    if (!partitionId) {
      return Object.freeze({
        state: BOOTSTRAP_ROUTING_OVERLAY_INSTALL_STATE.SKIP_INVALID_PARTITION,
      });
    }

    const cachedPartition = this.getCachedPartitionRecord(partitionId);
    const candidateServiceRows = Array.isArray(options?.serviceRows) ?
      options.serviceRows :
      null;
    const cachedLeaderNodeId =
      this.resolveBootstrapRoutingCanonicalLeaderNodeId(
        partitionId,
        candidateServiceRows || [],
      );
    const cachedLeaderServices =
      this.getCachedLeaderAddressedPartitionServiceRows(
        partitionId,
        cachedLeaderNodeId,
      );
    const routableServices = Array.isArray(candidateServiceRows) ?
      candidateServiceRows.filter((service) => {
        if (!service || typeof service !== 'object') {
          return false;
        }
        if (
          this.queryExecutor &&
            typeof this.queryExecutor.isRoutablePartitionService === 'function'
        ) {
          return this.queryExecutor.isRoutablePartitionService(service);
        }
        return false;
      }) :
      this.getCachedRoutablePartitionServiceRows(partitionId);
    if (routableServices.length === LOCAL_NUM_ZERO) {
      return Object.freeze({
        state:
          BOOTSTRAP_ROUTING_OVERLAY_INSTALL_STATE.SKIP_NO_ROUTABLE_SERVICES,
      });
    }

    const hintedLeaderNodeId = String(
      cachedLeaderNodeId ||
        options?.bootstrapLeaderNodeId ||
        options?.partitionMetadata?.leader_node_id ||
        options?.partitionMetadata?.leaderNodeId ||
        '',
    );
    const leaderSelection = resolveBootstrapLeaderSelection({
      services: routableServices,
      hintedLeaderNodeId,
    });
    const leaderNodeId = leaderSelection.leaderNodeId;
    if (typeof leaderNodeId !== LOCAL_STR_STRING || leaderNodeId.length === LOCAL_NUM_ZERO) {
      return Object.freeze({
        state: BOOTSTRAP_ROUTING_OVERLAY_INSTALL_STATE.SKIP_NO_SELECTED_LEADER,
      });
    }
    if (
      typeof cachedLeaderNodeId === LOCAL_STR_STRING &&
      cachedLeaderNodeId.length > LOCAL_NUM_ZERO &&
      cachedLeaderNodeId !== leaderNodeId
    ) {
      return Object.freeze({
        state:
          BOOTSTRAP_ROUTING_OVERLAY_INSTALL_STATE.SKIP_STALE_FOR_CURRENT_LEADER,
      });
    }

    const basePartition =
      cachedPartition ||
      (options?.partitionMetadata &&
      typeof options.partitionMetadata === 'object' ?
        options.partitionMetadata :
        {partition_id: partitionId});
    const nowMs = this.nowFn();
    const overlayPartition = {
      ...basePartition,
      partition_id:
        basePartition?.partition_id ||
        basePartition?.partitionId ||
        partitionId,
      leader_node_id: leaderNodeId,
      created_at: Number.isFinite(
        basePartition?.created_at ?? basePartition?.createdAt,
      ) ?
        (basePartition?.created_at ?? basePartition?.createdAt) :
        nowMs,
      updated_at: Number.isFinite(
        basePartition?.updated_at ?? basePartition?.updatedAt,
      ) ?
        (basePartition?.updated_at ?? basePartition?.updatedAt) :
        nowMs,
    };
    const retentionMode = this.resolveBootstrapRoutingOverlayRetentionMode(
      overlayPartition,
      null,
    );
    const overlayEntry = buildBootstrapRoutingOverlayEntry({
      partition: overlayPartition,
      services: routableServices,
      expiresAtMs: this.resolveBootstrapRoutingOverlayExpiryMs(
        retentionMode,
        nowMs,
      ),
      retentionMode,
    });
    if (cachedLeaderServices.length > LOCAL_NUM_ZERO) {
      return Object.freeze({
        state:
          options.installSupersededEntry === true &&
          this.shouldRetainSupersededBootstrapRoutingOverlayEntry(overlayEntry) ?
            BOOTSTRAP_ROUTING_OVERLAY_INSTALL_STATE.INSTALL_SUPERSEDED :
            BOOTSTRAP_ROUTING_OVERLAY_INSTALL_STATE.CACHE_READY,
        entry: overlayEntry,
      });
    }
    return Object.freeze({
      state: BOOTSTRAP_ROUTING_OVERLAY_INSTALL_STATE.INSTALL_AVAILABLE,
      entry: overlayEntry,
    });
  }

  /**
   * Install one short-lived overlay owner row when fresh partition services are
   * already visible but the canonical partition row is still missing or lacks a
   * leader_node_id.
   * @param {string} partitionId
   * @param {Object} [options]
   * @return {boolean}
   * @private
   */
  maybeInstallBootstrapLeaderOverlay(partitionId, options = {}) {
    const installDecision = this.resolveBootstrapRoutingOverlayInstallDecision(
      partitionId,
      options,
    );
    if (
      installDecision.state ===
      BOOTSTRAP_ROUTING_OVERLAY_INSTALL_STATE.SKIP_STALE_FOR_CURRENT_LEADER
    ) {
      this.bootstrapRoutingOverlayEntries.delete(partitionId);
      return false;
    }
    if (
      installDecision.state ===
      BOOTSTRAP_ROUTING_OVERLAY_INSTALL_STATE.CACHE_READY
    ) {
      this.bootstrapRoutingOverlayEntries.delete(partitionId);
      return false;
    }
    if (
      installDecision.state !==
        BOOTSTRAP_ROUTING_OVERLAY_INSTALL_STATE.INSTALL_AVAILABLE &&
      installDecision.state !==
        BOOTSTRAP_ROUTING_OVERLAY_INSTALL_STATE.INSTALL_SUPERSEDED
    ) {
      return false;
    }

    this.bootstrapRoutingOverlayEntries.set(partitionId, installDecision.entry);
    return true;
  }

  /**
   * Seed short-lived bootstrap routing overlays from system-table snapshots.
   * This bridges restart-time cache gaps until canonical partition metadata
   * converges locally.
   * @param {Object|null} systemTableSnapshots
   * @return {number}
   */
  seedBootstrapRoutingOverlayFromSnapshots(systemTableSnapshots) {
    if (!systemTableSnapshots || typeof systemTableSnapshots !== LOCAL_STR_OBJECT) {
      return LOCAL_NUM_ZERO;
    }

    const partitionRows = Array.isArray(systemTableSnapshots[TABLES.PARTITIONS]) ?
      systemTableSnapshots[TABLES.PARTITIONS] :
      [];
    const serviceRows = Array.isArray(systemTableSnapshots[TABLES.SERVICES]) ?
      systemTableSnapshots[TABLES.SERVICES] :
      [];
    let seededCount = LOCAL_NUM_ZERO;

    for (const partitionRow of partitionRows) {
      const partitionId = String(
        partitionRow?.partition_id || partitionRow?.partitionId || '',
      );
      const tableRef = String(
        partitionRow?.table_name ||
          partitionRow?.tableName ||
          partitionRow?.table_id ||
          partitionRow?.tableId ||
          '',
      );
      if (
        partitionId.length === LOCAL_NUM_ZERO ||
        tableRef.length === LOCAL_NUM_ZERO ||
        !this.isSystemTable(tableRef)
      ) {
        continue;
      }

      const partitionServiceRows = serviceRows.filter((serviceRow) => {
        if (!serviceRow || typeof serviceRow !== 'object') {
          return false;
        }
        return (
          serviceRow.partition_id === partitionId &&
          serviceRow.service_type === SERVICE_TYPE.PARTITION
        );
      });
      if (
        this.maybeInstallBootstrapLeaderOverlay(partitionId, {
          partitionMetadata: partitionRow,
          serviceRows: partitionServiceRows,
          installSupersededEntry: true,
        })
      ) {
        seededCount += LOCAL_NUM_ONE;
      }
    }

    return seededCount;
  }

  /**
   * Install a recovery routing overlay entry for a system table
   * partition. This bypasses the strict routability checks in
   * maybeInstallBootstrapLeaderOverlay because during cache
   * recovery after seed restart the cache is empty and no
   * services pass readiness evaluation. The overlay makes the
   * partition discoverable and provides candidate service
   * addresses so the query executor can attempt delivery.
   * @param {string} partitionId
   * @param {string} tableName
   * @param {Array<Object>} serviceRows
   * @return {boolean}
   */
  installRecoveryRoutingOverlayEntry(partitionId, tableName, serviceRows) {
    if (!partitionId || !tableName) {
      return false;
    }
    if (!Array.isArray(serviceRows) || serviceRows.length === LOCAL_NUM_ZERO) {
      return false;
    }
    const cachedLeaderNodeId =
      this.resolveBootstrapRoutingCanonicalLeaderNodeId(
        partitionId,
        serviceRows,
      );
    if (
      typeof cachedLeaderNodeId === LOCAL_STR_STRING &&
      cachedLeaderNodeId.length > LOCAL_NUM_ZERO
    ) {
      return false;
    }
    const nowMs = this.nowFn();
    const overlayPartition = {
      partition_id: partitionId,
      table_name: tableName,
      leader_node_id: resolveBootstrapLeaderSelection({
        services: serviceRows,
      }).leaderNodeId,
      created_at: nowMs,
      updated_at: nowMs,
    };
    const retentionMode = this.resolveBootstrapRoutingOverlayRetentionMode(
      overlayPartition,
      tableName,
    );
    this.bootstrapRoutingOverlayEntries.set(
      partitionId,
      buildBootstrapRoutingOverlayEntry({
        partition: overlayPartition,
        services: serviceRows,
        expiresAtMs: this.resolveBootstrapRoutingOverlayExpiryMs(
          retentionMode,
          nowMs,
        ),
        retentionMode,
      }),
    );
    return true;
  }

  /**
   * Resolve one bootstrap overlay entry when still valid.
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  getBootstrapRoutingOverlayEntry(partitionId) {
    const entryState = this.getBootstrapRoutingOverlayEntryState(partitionId);
    return entryState.state === BOOTSTRAP_ROUTING_OVERLAY_ENTRY_STATE.AVAILABLE ?
      entryState.entry :
      null;
  }

  /**
   * Resolve one explicit bootstrap overlay entry state.
   * @param {string} partitionId
   * @return {Object}
   * @private
   */
  getBootstrapRoutingOverlayEntryState(partitionId) {
    const entry = this.bootstrapRoutingOverlayEntries.get(partitionId);
    if (!entry || typeof entry !== LOCAL_STR_OBJECT) {
      return buildBootstrapRoutingOverlayEntryState({
        state: BOOTSTRAP_ROUTING_OVERLAY_ENTRY_STATE.MISSING,
        reason: BOOTSTRAP_ROUTING_OVERLAY_REASON.MISSING,
      });
    }

    if (this.isBootstrapRoutingOverlayEntryExpired(entry)) {
      this.bootstrapRoutingOverlayEntries.delete(partitionId);
      return buildBootstrapRoutingOverlayEntryState({
        state: BOOTSTRAP_ROUTING_OVERLAY_ENTRY_STATE.EXPIRED,
        reason: BOOTSTRAP_ROUTING_OVERLAY_REASON.EXPIRED,
      });
    }

    const reuseDecision = this.resolveBootstrapRoutingOverlayReuseDecision(
      partitionId,
      entry,
    );
    if (
      reuseDecision.state === BOOTSTRAP_ROUTING_OVERLAY_REUSE_STATE.CACHE_READY
    ) {
      if (!this.shouldRetainSupersededBootstrapRoutingOverlayEntry(entry)) {
        this.bootstrapRoutingOverlayEntries.delete(partitionId);
      }
      return buildBootstrapRoutingOverlayEntryState({
        state: BOOTSTRAP_ROUTING_OVERLAY_ENTRY_STATE.SUPERSEDED,
        reason: reuseDecision.reason,
      });
    }
    if (
      reuseDecision.state ===
      BOOTSTRAP_ROUTING_OVERLAY_REUSE_STATE.STALE_FOR_CURRENT_LEADER
    ) {
      this.bootstrapRoutingOverlayEntries.delete(partitionId);
      return buildBootstrapRoutingOverlayEntryState({
        state: BOOTSTRAP_ROUTING_OVERLAY_ENTRY_STATE.STALE,
        reason: reuseDecision.reason,
      });
    }
    return buildBootstrapRoutingOverlayEntryState({
      state: BOOTSTRAP_ROUTING_OVERLAY_ENTRY_STATE.AVAILABLE,
      reason: reuseDecision.reason,
      partition: reuseDecision.partition,
      services: reuseDecision.services,
      entry,
    });
  }

  /**
   * Overlay partition owner row accessor for QueryExecutor.
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  getBootstrapRoutingOverlayPartition(partitionId) {
    const entryState = this.getBootstrapRoutingOverlayEntryState(partitionId);
    return entryState.partitionState ===
      BOOTSTRAP_ROUTING_OVERLAY_PARTITION_STATE.AVAILABLE ?
      entryState.partition :
      null;
  }

  /**
   * Overlay partition services accessor for QueryExecutor.
   * @param {string} partitionId
   * @return {Object[]}
   * @private
   */
  getBootstrapRoutingOverlayServices(partitionId) {
    return this.getBootstrapRoutingOverlayEntryState(partitionId).services;
  }

  /**
   * Resolve fresh bootstrap overlay partitions for one table reference.
   * @param {string|null} tableRef
   * @param {number|null} activePartitionVersion
   * @return {Object[]}
   * @private
   */
  getBootstrapRoutingOverlayPartitionsForTable(
    tableRef,
    activePartitionVersion,
  ) {
    if (typeof tableRef !== LOCAL_STR_STRING || tableRef.length === LOCAL_NUM_ZERO) {
      return [];
    }

    const partitions = [];
    for (const partitionId of this.bootstrapRoutingOverlayEntries.keys()) {
      const entryState = this.getBootstrapRoutingOverlayEntryState(partitionId);
      if (
        entryState.partitionState !==
        BOOTSTRAP_ROUTING_OVERLAY_PARTITION_STATE.AVAILABLE
      ) {
        continue;
      }
      const partition = entryState.partition;
      if (
        !this.partitionMatchesTableRef(partition, tableRef) ||
        !this.isPartitionVisibleForRouting(partition, activePartitionVersion)
      ) {
        continue;
      }
      partitions.push(partition);
    }
    return partitions;
  }

  /**
   * Resolve the minimum routable replica cohort required before provisioning
   * can continue.
   * @param {number|undefined|null} requestedMinimumReplicaCount
   * @param {number} targetReplicaCount
   * @return {number}
   * @private
   */
  resolveMinimumProvisioningReplicaCount(
    requestedMinimumReplicaCount,
    targetReplicaCount,
  ) {
    if (
      !Number.isInteger(requestedMinimumReplicaCount) ||
      requestedMinimumReplicaCount <= LOCAL_NUM_ZERO
    ) {
      return targetReplicaCount;
    }

    return Math.max(
      LOCAL_NUM_ONE,
      Math.min(requestedMinimumReplicaCount, targetReplicaCount),
    );
  }

  /**
   * Preserve one quorum-sized floor for implicit RF3+ provisioning fallback.
   * Smaller cohorts still degrade to one replica so single-node bootstrap and
   * legacy RF2 owner paths remain backward-compatible.
   * @param {number} requestedReplicaCount
   * @param {number|undefined|null} visibleActiveNodeCount
   * @return {number}
   * @private
   */
  resolveImplicitProvisioningFallbackReplicaCount(
    requestedReplicaCount,
    visibleActiveNodeCount,
  ) {
    const normalizedReplicaCount =
      Number.isInteger(requestedReplicaCount) && requestedReplicaCount > 0 ?
        requestedReplicaCount :
        1;
    const normalizedVisibleActiveNodeCount =
      Number.isInteger(visibleActiveNodeCount) && visibleActiveNodeCount > 0 ?
        visibleActiveNodeCount :
        0;
    if (normalizedReplicaCount < LOCAL_NUM_THREE || normalizedVisibleActiveNodeCount <= LOCAL_NUM_ONE) {
      return LOCAL_NUM_ONE;
    }
    return this.calculateQuorumReplicaCount(normalizedReplicaCount);
  }

  /**
   * Wait for the active-node cache to expose enough provisioning targets.
   * @param {Object} options
   * @param {string} options.partitionId
   * @param {number} options.requiredReplicaCount
   * @param {Object} options.timeoutBudget
   * @param {string[]} [options.explicitTargetNodeIds]
   * @param {number} [options.maxWaitMs]
   * @param {boolean} [options.failOnTimeout]
   * @return {Promise<Object>}
   * @private
   */
  async waitForProvisionTargetNodeIds(options = {}) {
    const requiredReplicaCount =
      Number.isInteger(options.requiredReplicaCount) &&
      options.requiredReplicaCount > 0 ?
        options.requiredReplicaCount :
        1;
    const partitionId = String(options.partitionId || '');
    const explicitTargetNodeIds = this.normalizeTargetNodeIds(
      options.explicitTargetNodeIds,
    );
    let resolution =
      this.resolveProvisionTargetNodeIdsWithDiagnostics(requiredReplicaCount);
    let resolvedNodeIds = this.resolveProvisionTargetNodeIdsForContext(
      explicitTargetNodeIds,
      requiredReplicaCount,
      resolution.diagnostics,
    );
    let lastDiagnostics = resolution.diagnostics;
    let lastAdmissionProbe = null;
    let timedOut = false;
    const failOnTimeout = options.failOnTimeout !== false;
    const allowAdaptiveAdmissionConvergenceWait =
      options.allowAdaptiveAdmissionConvergenceWait === true;
    const maxWaitMs =
      Number.isFinite(options.maxWaitMs) && options.maxWaitMs > 0 ?
        Math.floor(options.maxWaitMs) :
        this.tablePartitionProvisioningTimeoutMs;
    const effectiveMaxWaitMs =
      allowAdaptiveAdmissionConvergenceWait &&
      explicitTargetNodeIds.length === 0 &&
      Number.isInteger(lastDiagnostics?.activeNodeRowCount) &&
      lastDiagnostics.activeNodeRowCount >= requiredReplicaCount ?
        Math.min(
          this.tablePartitionProvisioningTimeoutMs,
          Math.max(maxWaitMs, TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS),
        ) :
        maxWaitMs;
    const waitTimeoutMs = Math.max(
      this.tablePartitionProvisioningPollIntervalMs,
      Math.min(effectiveMaxWaitMs, this.tablePartitionProvisioningTimeoutMs),
    );
    const refreshResolution = async () => {
      resolution =
        this.resolveProvisionTargetNodeIdsWithDiagnostics(requiredReplicaCount);
      lastDiagnostics = resolution.diagnostics;
      resolvedNodeIds = this.resolveProvisionTargetNodeIdsForContext(
        explicitTargetNodeIds,
        requiredReplicaCount,
        lastDiagnostics,
      );
      if (!partitionId || !this.supportsProvisioningAdmissionPrecheck()) {
        lastAdmissionProbe = null;
        return resolvedNodeIds.length >= requiredReplicaCount;
      }
      lastAdmissionProbe = await this.probeProvisioningTargetAdmission({
        partitionId,
        targetNodeIds: resolvedNodeIds,
      });
      return (
        lastAdmissionProbe.maximumProvisionableReplicaCount >=
        requiredReplicaCount
      );
    };
    if (await refreshResolution()) {
      return this.buildProvisionTargetNodeConvergenceResult({
        nodeIds: resolvedNodeIds,
        diagnostics: lastDiagnostics,
        admissionProbe: lastAdmissionProbe,
        timedOut,
        requiredReplicaCount,
        waitedMs: LOCAL_NUM_ZERO,
      });
    }

    const waitStartedAt = this.nowFn();
    try {
      await this.waitForCondition(
        refreshResolution,
        waitTimeoutMs,
        this.tablePartitionProvisioningPollIntervalMs,
        QUERY_ERROR_MSG.TABLE_PARTITION_TARGET_NODE_TIMEOUT_PREFIX +
          partitionId,
        {
          timeoutBudget: options.timeoutBudget || null,
          classification:
            TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
          nestedOperation: TABLE_PARTITION_TARGET_NODE_WAIT,
        },
      );
    } catch (error) {
      timedOut = true;
      const timeoutLogPayload = {
        partitionId,
        requiredReplicaCount,
        maxWaitMs: waitTimeoutMs,
        requestedMaxWaitMs: maxWaitMs,
        allowAdaptiveAdmissionConvergenceWait,
        waitedMs: this.nowFn() - waitStartedAt,
        diagnostics: lastDiagnostics,
        admissionProbe: lastAdmissionProbe,
      };
      if (failOnTimeout) {
        this.logger.error(
          QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_WAIT_TIMEOUT,
          timeoutLogPayload,
        );
        throw error;
      }
      this.logger.warn(
        QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_WAIT_TIMEOUT,
        timeoutLogPayload,
      );
    }

    if (lastDiagnostics?.usedDegradedFallback && !timedOut) {
      this.logger.warn(
        QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_FALLBACK_USED,
        {
          partitionId,
          requiredReplicaCount,
          diagnostics: lastDiagnostics,
        },
      );
    }

    return this.buildProvisionTargetNodeConvergenceResult({
      nodeIds: resolvedNodeIds,
      diagnostics: lastDiagnostics,
      admissionProbe: lastAdmissionProbe,
      timedOut,
      requiredReplicaCount,
      waitedMs: this.nowFn() - waitStartedAt,
    });
  }

  buildProvisionTargetNodeConvergenceResult(options = {}) {
    const timedOut = options.timedOut === true;
    const diagnostics =
      options?.diagnostics && typeof options.diagnostics === 'object' ?
        options.diagnostics :
        null;
    const reasonCodes = [];
    if (timedOut) {
      reasonCodes.push(
        TABLE_PARTITION_TARGET_NODE_CONVERGENCE_REASON.WAIT_TIMEOUT,
      );
    }
    if (diagnostics?.usedDegradedFallback === true) {
      reasonCodes.push(
        TABLE_PARTITION_TARGET_NODE_CONVERGENCE_REASON.DEGRADED_FALLBACK_USED,
      );
    }
    const contractOutcome = timedOut ?
      buildOwnerContractOutcome({
        contractState: OWNER_CONTRACT_STATE.PENDING,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
      }) :
      buildOwnerContractOutcome({
        contractState: OWNER_CONTRACT_STATE.READY,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
      });
    return {
      ...contractOutcome,
      nodeIds: Array.isArray(options.nodeIds) ? options.nodeIds : [],
      diagnostics,
      admissionProbe:
        options?.admissionProbe && typeof options.admissionProbe === LOCAL_STR_OBJECT ?
          options.admissionProbe :
          null,
      timedOut,
      requiredReplicaCount:
        Number.isInteger(options.requiredReplicaCount) &&
        options.requiredReplicaCount > LOCAL_NUM_ZERO ?
          options.requiredReplicaCount :
          LOCAL_NUM_ONE,
      waitedMs:
        Number.isFinite(options.waitedMs) && options.waitedMs > LOCAL_NUM_ZERO ?
          Math.floor(options.waitedMs) :
          LOCAL_NUM_ZERO,
      retryAfterMs: timedOut ?
        Math.max(NUM.ONE, this.tablePartitionProvisioningPollIntervalMs) :
        NUM.ZERO,
      reasonCodes: Object.freeze(reasonCodes),
    };
  }

  /**
   * Build the explicit bootstrap cohort for initial table partition creation.
   * @param {string} partitionId - Partition ID.
   * @param {Array<Object>} plannedOperations - Planned ADD operations.
   * @return {Object} Replica IDs and peer addresses for the initial cohort.
   * @private
   */
  buildInitialPartitionBootstrapTopology(partitionId, plannedOperations) {
    const addressManager = AddressManager.getInstance();
    const replicaIds = [];
    const peerAddresses = [];
    const seenReplicaIds = new Set();
    const currentServices = this.getPartitionServiceRows(partitionId);

    for (const service of currentServices) {
      const serviceReplicaId =
        service?.service_id || service?.replica_id || null;
      const nodeId = service?.node_id || service?.nodeId || null;
      if (
        typeof serviceReplicaId !== LOCAL_STR_STRING ||
        serviceReplicaId.length === LOCAL_NUM_ZERO
      ) {
        continue;
      }
      if (!seenReplicaIds.has(serviceReplicaId)) {
        seenReplicaIds.add(serviceReplicaId);
        replicaIds.push(serviceReplicaId);
      }
      if (typeof service?.address === LOCAL_STR_STRING && service.address.length > LOCAL_NUM_ZERO) {
        peerAddresses.push(service.address);
        continue;
      }
      if (typeof nodeId === LOCAL_STR_STRING && nodeId.length > LOCAL_NUM_ZERO) {
        peerAddresses.push(
          addressManager.format(
            nodeId,
            ENTITY_TYPE.PARTITION,
            serviceReplicaId,
          ),
        );
      }
    }

    for (const operation of plannedOperations) {
      const replicaId = operation?.replicaId || null;
      const nodeId = operation?.targetNodeId || operation?.nodeId || null;
      if (typeof replicaId !== LOCAL_STR_STRING || replicaId.length === LOCAL_NUM_ZERO) {
        continue;
      }
      if (!seenReplicaIds.has(replicaId)) {
        seenReplicaIds.add(replicaId);
        replicaIds.push(replicaId);
      }
      if (typeof nodeId === LOCAL_STR_STRING && nodeId.length > LOCAL_NUM_ZERO) {
        peerAddresses.push(
          addressManager.format(nodeId, ENTITY_TYPE.PARTITION, replicaId),
        );
      }
    }

    return {
      replicaIds,
      peerAddresses: [...new Set(peerAddresses)],
    };
  }

  /**
   * Resolve the provisional bootstrap leader node for a freshly-created
   * partition before canonical leader metadata converges.
   * Prefer explicit leader service metadata, then the `-r1` replica, then the
   * first known bootstrap cohort member.
   * @param {string} partitionId
   * @param {Array<Object>} plannedOperations
   * @return {string|null}
   * @private
   */
}

export {SQLQueryEngineSegment5};
