import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_FUNCTION = 'function';

const {
  CONNECTION_STATE_CONNECTED,
  CONNECTION_STATE_READY,
  ConfigurationManager,
  SERVICE_TYPE,
  STATUS_ACTIVE,
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
  TABLES,
  hasLiveTransportEvidence,
  isNodeRecordReady,
} = SQL_QUERY_ENGINE_SHARED;

class SQLQueryEngineProvisioningMethods {
  resolveInitialPartitionBootstrapLeaderNodeId(
    partitionId,
    plannedOperations = [],
  ) {
    const currentServices = this.getPartitionServiceRows(partitionId);
    const currentLeaderService = currentServices.find(
      (service) => String(service?.raft_role || '').toLowerCase() === 'leader',
    );
    const currentLeaderNodeId =
      currentLeaderService?.node_id || currentLeaderService?.nodeId || null;
    if (
      typeof currentLeaderNodeId === LOCAL_STR_STRING &&
      currentLeaderNodeId.length > 0
    ) {
      return currentLeaderNodeId;
    }

    const currentR1Service = currentServices.find((service) => {
      const replicaId = String(
        service?.service_id || service?.replica_id || '',
      );
      return /-r1$/.test(replicaId);
    });
    const currentR1NodeId =
      currentR1Service?.node_id || currentR1Service?.nodeId || null;
    if (typeof currentR1NodeId === LOCAL_STR_STRING && currentR1NodeId.length > 0) {
      return currentR1NodeId;
    }

    const plannedR1Operation =
      plannedOperations.find((operation) => {
        const replicaId = String(operation?.replicaId || '');
        return /-r1$/.test(replicaId);
      }) || null;
    const plannedR1NodeId =
      plannedR1Operation?.targetNodeId || plannedR1Operation?.nodeId || null;
    if (typeof plannedR1NodeId === LOCAL_STR_STRING && plannedR1NodeId.length > 0) {
      return plannedR1NodeId;
    }

    const firstCurrentNodeId =
      currentServices.find((service) => {
        const nodeId = service?.node_id || service?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.node_id ||
      currentServices.find((service) => {
        const nodeId = service?.node_id || service?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.nodeId ||
      null;
    if (
      typeof firstCurrentNodeId === LOCAL_STR_STRING &&
      firstCurrentNodeId.length > 0
    ) {
      return firstCurrentNodeId;
    }

    const firstPlannedNodeId =
      plannedOperations.find((operation) => {
        const nodeId = operation?.targetNodeId || operation?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.targetNodeId ||
      plannedOperations.find((operation) => {
        const nodeId = operation?.targetNodeId || operation?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.nodeId ||
      null;
    return typeof firstPlannedNodeId === LOCAL_STR_STRING &&
      firstPlannedNodeId.length > 0 ?
      firstPlannedNodeId :
      null;
  }

  /**
   * Resolve active node IDs eligible for initial replica provisioning.
   * Prefers local node first to keep early routing local.
   * @param {number} requestedReplicaCount
   * @return {Array<string>} Ordered node IDs.
   * @private
   */
  resolveProvisionTargetNodeIds(requestedReplicaCount) {
    return this.resolveProvisionTargetNodeIdsWithDiagnostics(
      requestedReplicaCount,
    ).nodeIds;
  }

  /**
   * Resolve active node IDs plus eligibility diagnostics.
   * @param {number} requestedReplicaCount
   * @return {{nodeIds: string[], diagnostics: Object}}
   * @private
   */
  resolveProvisionTargetNodeIdsWithDiagnostics(requestedReplicaCount) {
    const desiredReplicaCount =
      Number.isInteger(requestedReplicaCount) && requestedReplicaCount > 0 ?
        requestedReplicaCount :
        1;

    const diagnostics =
      this.resolveProvisionTargetNodeDiagnostics(desiredReplicaCount);
    let selectedNodeIds = diagnostics.selectedNodeIds;
    if (selectedNodeIds.length === 0) {
      selectedNodeIds = [this.nodeId];
    } else if (!selectedNodeIds.includes(this.nodeId)) {
      selectedNodeIds = [this.nodeId, ...selectedNodeIds];
    }

    const orderedNodeIds = this.orderProvisionTargetNodeIds(selectedNodeIds);
    const cappedNodeIds = orderedNodeIds.slice(
      0,
      Math.max(1, Math.min(desiredReplicaCount, orderedNodeIds.length)),
    );

    return {
      nodeIds: cappedNodeIds,
      diagnostics: {
        ...diagnostics,
        selectedNodeIds: orderedNodeIds,
        resolvedNodeIds: cappedNodeIds,
      },
    };
  }

  /**
   * Order node IDs lexicographically while keeping the local node first.
   * @param {Array<string>} nodeIds
   * @return {Array<string>}
   * @private
   */
  orderProvisionTargetNodeIds(nodeIds) {
    const uniqueNodeIds = [...new Set(nodeIds)];
    uniqueNodeIds.sort((left, right) => left.localeCompare(right));
    if (uniqueNodeIds.includes(this.nodeId)) {
      uniqueNodeIds.splice(uniqueNodeIds.indexOf(this.nodeId), 1);
      uniqueNodeIds.unshift(this.nodeId);
    }
    return uniqueNodeIds;
  }

  /**
   * Resolve provision-target diagnostics from local cache state.
   * @param {number} requestedReplicaCount
   * @return {Object}
   * @private
   */
  resolveProvisionTargetNodeDiagnostics(requestedReplicaCount) {
    const desiredReplicaCount =
      Number.isInteger(requestedReplicaCount) && requestedReplicaCount > 0 ?
        requestedReplicaCount :
        1;
    if (!this.systemCache) {
      return {
        requestedReplicaCount: desiredReplicaCount,
        activeNodeRowCount: 0,
        activeServiceRowCount: 0,
        strictNodeIds: [],
        degradedFallbackNodeIds: [],
        selectedNodeIds: [],
        usedDegradedFallback: false,
      };
    }

    const activeNodeRows = [];
    const serviceRows = [];
    if (typeof this.systemCache.filter === LOCAL_STR_FUNCTION) {
      const filteredRows = this.systemCache.filter(TABLES.NODES, (nodeRow) => {
        const status = String(
          nodeRow?.status || nodeRow?.state || '',
        ).toLowerCase();
        return status === STATUS_ACTIVE;
      });
      if (Array.isArray(filteredRows)) {
        activeNodeRows.push(...filteredRows);
      }
      const filteredServiceRows = this.systemCache.filter(
        TABLES.SERVICES,
        (serviceRow) => {
          const status = String(serviceRow?.status || '').toLowerCase();
          const nodeId = serviceRow?.node_id || serviceRow?.nodeId || null;
          return (
            status === STATUS_ACTIVE &&
            typeof nodeId === 'string' &&
            nodeId.length > 0
          );
        },
      );
      if (Array.isArray(filteredServiceRows)) {
        serviceRows.push(...filteredServiceRows);
      }
    } else if (typeof this.systemCache.getAll === LOCAL_STR_FUNCTION) {
      const allRows = this.systemCache.getAll(TABLES.NODES);
      if (Array.isArray(allRows)) {
        for (const nodeRow of allRows) {
          const status = String(
            nodeRow?.status || nodeRow?.state || '',
          ).toLowerCase();
          if (status === STATUS_ACTIVE) {
            activeNodeRows.push(nodeRow);
          }
        }
      }
      const allServiceRows = this.systemCache.getAll(TABLES.SERVICES);
      if (Array.isArray(allServiceRows)) {
        for (const serviceRow of allServiceRows) {
          const status = String(serviceRow?.status || '').toLowerCase();
          const nodeId = serviceRow?.node_id || serviceRow?.nodeId || null;
          if (
            status === STATUS_ACTIVE &&
            typeof nodeId === LOCAL_STR_STRING &&
            nodeId.length > 0
          ) {
            serviceRows.push(serviceRow);
          }
        }
      }
    }

    const activeNodeSeenById = new Set();
    const activeNodeReadinessById = new Map();
    const activeNodeConnectionById = new Map();
    for (const row of activeNodeRows) {
      const nodeId = row?.node_id || row?.nodeId || row?.id || null;
      if (typeof nodeId !== LOCAL_STR_STRING || nodeId.length === 0) {
        continue;
      }
      activeNodeSeenById.add(nodeId);
      const leaseExpiry = Number(
        row?.ready_lease_expires_at ?? row?.readyLeaseExpiresAt,
      );
      const hasReadyLease = Number.isFinite(leaseExpiry);
      const connectionState = String(
        row?.connection_state || row?.connectionState || '',
      ).toLowerCase();
      const hasConnectionState = connectionState.length > 0;
      const isConnectionReady =
        connectionState === CONNECTION_STATE_CONNECTED ||
        connectionState === CONNECTION_STATE_READY;
      // Monotone live-transport rescue (spec node-liveness-veto-consolidation,
      // stage 2): the cached `connection_state` column is CDC-lagged, so a
      // populated-but-stale-negative value wrongly excludes a live,
      // transport-connected node from provisioning targets — the MODE-A shape
      // (`a79b3728`) that stranded a table at reduced replication. OR-rescue with
      // the shared live-transport atom: it can only WIDEN eligibility (never
      // remove a node, never admit a genuinely-disconnected one — the atom fails
      // closed on a missing/severed router), so it repairs the stale-negative
      // without inverting the gate's safety.
      const connectionEligible =
        !hasConnectionState ||
        isConnectionReady ||
        hasLiveTransportEvidence(nodeId, {messageRouter: this.messageRouter});
      const isNodeReady = hasReadyLease ?
        isNodeRecordReady(row, {requireActiveStatus: true}) :
        true;
      activeNodeReadinessById.set(nodeId, isNodeReady);
      activeNodeConnectionById.set(nodeId, connectionEligible);
    }

    const strictNodeIds = this.orderProvisionTargetNodeIds(
      [...activeNodeReadinessById.entries()]
        .filter(
          ([nodeId, ready]) =>
            ready === true && activeNodeConnectionById.get(nodeId) === true,
        )
        .map(([nodeId]) => nodeId),
    );

    const strictServiceNodeIds = [];
    const degradedServiceNodeIds = [];
    const seenServiceNodeIds = new Set();
    for (const row of serviceRows) {
      const nodeId = row?.node_id || row?.nodeId || null;
      if (
        typeof nodeId !== LOCAL_STR_STRING ||
        nodeId.length === 0 ||
        seenServiceNodeIds.has(nodeId)
      ) {
        continue;
      }
      seenServiceNodeIds.add(nodeId);
      if (!activeNodeSeenById.has(nodeId)) {
        strictServiceNodeIds.push(nodeId);
        continue;
      }
      if (activeNodeReadinessById.get(nodeId) === true) {
        strictServiceNodeIds.push(nodeId);
        continue;
      }
      if (activeNodeConnectionById.get(nodeId) === true) {
        degradedServiceNodeIds.push(nodeId);
      }
    }

    const mergedStrictNodeIds = this.orderProvisionTargetNodeIds([
      ...strictNodeIds,
      ...strictServiceNodeIds,
    ]);
    const strictNodeIdSet = new Set(mergedStrictNodeIds);
    const degradedFallbackNodeIds = this.orderProvisionTargetNodeIds(
      degradedServiceNodeIds.filter((nodeId) => !strictNodeIdSet.has(nodeId)),
    );
    let selectedNodeIds = mergedStrictNodeIds;
    let usedDegradedFallback = false;
    if (
      selectedNodeIds.length < desiredReplicaCount &&
      degradedFallbackNodeIds.length > 0
    ) {
      selectedNodeIds = this.orderProvisionTargetNodeIds([
        ...selectedNodeIds,
        ...degradedFallbackNodeIds,
      ]);
      usedDegradedFallback = true;
    }

    return {
      requestedReplicaCount: desiredReplicaCount,
      activeNodeRowCount: activeNodeRows.length,
      activeServiceRowCount: serviceRows.length,
      strictNodeIds: mergedStrictNodeIds,
      degradedFallbackNodeIds,
      selectedNodeIds,
      usedDegradedFallback,
    };
  }

  /**
   * Resolve target nodes for one provisioning context.
   * Explicit targets override readiness-discovered nodes.
   * @param {string[]|undefined|null} explicitTargetNodeIds
   * @param {number} requestedReplicaCount
   * @param {Object|null} [provisionTargetDiagnostics]
   * @return {Array<string>}
   * @private
   */
  resolveProvisionTargetNodeIdsForContext(
    explicitTargetNodeIds,
    requestedReplicaCount,
    provisionTargetDiagnostics = null,
  ) {
    const explicitTargets = this.normalizeTargetNodeIds(explicitTargetNodeIds);
    if (explicitTargets.length === 0) {
      const diagnostics =
        provisionTargetDiagnostics &&
        typeof provisionTargetDiagnostics === 'object' ?
          provisionTargetDiagnostics :
          this.resolveProvisionTargetNodeIdsWithDiagnostics(
            requestedReplicaCount,
          ).diagnostics;
      const selectedNodeIds = Array.isArray(diagnostics?.selectedNodeIds) ?
        diagnostics.selectedNodeIds :
        [];
      if (selectedNodeIds.length > 0) {
        return selectedNodeIds;
      }
      return this.resolveProvisionTargetNodeIds(requestedReplicaCount);
    }

    return explicitTargets;
  }

  /**
   * Normalize one node-id list to unique non-empty string IDs.
   * @param {Array<string>|undefined|null} targetNodeIds
   * @return {Array<string>}
   * @private
   */
  normalizeTargetNodeIds(targetNodeIds) {
    if (!Array.isArray(targetNodeIds)) {
      return [];
    }

    const normalizedNodeIds = [];
    const seenNodeIds = new Set();
    for (const nodeId of targetNodeIds) {
      const normalizedNodeId = String(nodeId || '');
      if (normalizedNodeId.length === 0 || seenNodeIds.has(normalizedNodeId)) {
        continue;
      }
      seenNodeIds.add(normalizedNodeId);
      normalizedNodeIds.push(normalizedNodeId);
    }

    return normalizedNodeIds;
  }

  /**
   * Capture the canonical topology snapshot for one managed split attempt.
   * The workflow reuses this persisted context for admission and child
   * provisioning instead of re-resolving targets mid-attempt.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  captureManagedSplitTopologySnapshot(options = {}) {
    const requiredReplicaCount =
      Number.isInteger(options.requiredReplicaCount) &&
      options.requiredReplicaCount > 0 ?
        options.requiredReplicaCount :
        1;
    const provisionTargetDiagnostics =
      this.resolveProvisionTargetNodeDiagnostics(requiredReplicaCount);
    return {
      ...(options.baseSnapshot || {}),
      capturedAt: new Date(this.nowFn()).toISOString(),
      sourceLeaderNodeId:
        options.partitionInfo?.leader_node_id ||
        options.partitionInfo?.leaderNodeId ||
        null,
      activePartitionVersion:
        options.tableInfo?.active_partition_version ||
        options.tableInfo?.activePartitionVersion ||
        null,
      targetPartitionVersion: options.targetVersion,
      requiredReplicaCount,
      sourceRoutableNodeIds: this.normalizeTargetNodeIds(
        options.sourceRoutableNodeIds,
      ),
      discoveredTargetNodeIds: this.normalizeTargetNodeIds(
        options.discoveredTargetNodeIds,
      ),
      candidateTargetNodeIds: this.normalizeTargetNodeIds(
        options.candidateTargetNodeIds,
      ),
      provisionTargetDiagnostics,
    };
  }

  /**
   * Estimate bytes for split admission using the canonical storage
   * accounting model when it is available.
   * @param {Object} partitionInfo
   * @return {number}
   * @private
   */
  estimateSplitAdmissionBytes(partitionInfo) {
    const sizeBytes = Number(
      partitionInfo?.size_bytes ?? partitionInfo?.sizeBytes,
    );
    const normalizedSizeBytes =
      Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0;
    const accountingService =
      this.rebalanceCoordinator?.storageAccountingService || null;

    if (
      accountingService &&
      typeof accountingService.estimateReplicaBytes === LOCAL_STR_FUNCTION
    ) {
      const splitAmplificationFactor =
        ConfigurationManager.getInstance().get(
          STORAGE_CAPACITY_CONFIG_KEY.SPLIT_AMPLIFICATION_FACTOR,
        ) || STORAGE_CAPACITY_DEFAULT.SPLIT_AMPLIFICATION_FACTOR;
      return accountingService.estimateReplicaBytes({
        entityType: SERVICE_TYPE.PARTITION,
        sizeBytes: normalizedSizeBytes,
        amplificationFactor: splitAmplificationFactor,
      });
    }

    return Math.max(1, Math.ceil(normalizedSizeBytes));
  }

  /**
   * Calculate the minimum majority-sized cohort required for a routable Raft
   * partition during split bootstrap.
   * @param {number} replicaCount
   * @return {number}
   * @private
   */
  calculateQuorumReplicaCount(replicaCount) {
    const normalizedReplicaCount =
      Number.isInteger(replicaCount) && replicaCount > 0 ? replicaCount : 1;
    return Math.floor(normalizedReplicaCount / 2) + 1;
  }
}

function createSQLQueryEngineProvisioningMethods() {
  return Object.fromEntries(
    Object.entries(
      Object.getOwnPropertyDescriptors(
        SQLQueryEngineProvisioningMethods.prototype,
      ),
    ).filter(([name]) => name !== 'constructor'),
  );
}

export {createSQLQueryEngineProvisioningMethods};
