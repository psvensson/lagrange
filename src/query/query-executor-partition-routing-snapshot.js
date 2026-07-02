import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';

const {
  CONTROL_PLANE_READINESS_DIMENSION,
  LOG_MSG,
  QUERY_EXECUTOR_LITERAL,
  QUERY_LOG_MSG,
  QUERY_ROUTING_DIAGNOSTIC_REASON,
  QUERY_ROUTING_REPAIR_REASON,
  READINESS_SNAPSHOT_KEY,
  SERVICE_TYPE,
  SERVICE_STATUS,
  TABLES,
  isPriorityControlPlanePartition,
  resolveCanonicalLeaderRoutingGapState,
} = QUERY_EXECUTOR_SHARED;

const queryExecutorPartitionRoutingSnapshotMethods = {
  /**
   * Build one owner-style snapshot for partition routing diagnostics.
   * @param {string} partitionId
   * @param {string} [routingReadinessDimension]
   * @return {Object}
   */
  getPartitionRoutingSnapshot(
    partitionId,
    routingReadinessDimension = this.defaultRoutingReadinessDimension,
    routingOptions = {},
  ) {
    const serviceRows = this.getPartitionServiceRows(partitionId);
    const canonicalLeaderRoutingState =
      this.getCanonicalPartitionLeaderRoutingState(partitionId, serviceRows);
    const canonicalLeaderIdentity =
      canonicalLeaderRoutingState.canonicalLeaderIdentity;
    const canonicalLeaderObservation =
      canonicalLeaderRoutingState.canonicalLeaderObservation;
    const canonicalLeaderNodeId =
      canonicalLeaderRoutingState.canonicalLeaderNodeId;
    const evaluatedServices = serviceRows.map((service) => ({
      service,
      routing: this.evaluatePartitionServiceRoutability(
        service,
        routingReadinessDimension,
        routingOptions,
      ),
    }));
    const activeAddressedServices = evaluatedServices
      .filter((entry) => {
        return (
          entry.routing.reasonCode !==
            QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_INACTIVE &&
          entry.routing.reasonCode !==
            QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_ADDRESS_MISSING
        );
      })
      .map((entry) => entry.service);
    const routableServices = evaluatedServices
      .filter((entry) => entry.routing.routable === true)
      .map((entry) => entry.service);
    const canonicalLeaderServiceCount = canonicalLeaderNodeId ?
      serviceRows.filter(
        (service) => service?.node_id === canonicalLeaderNodeId,
      ).length :
      0;
    const canonicalLeaderRoutingGapState =
      resolveCanonicalLeaderRoutingGapState({
        canonicalLeaderNodeId,
        canonicalLeaderServiceCount,
        serviceRowCount: serviceRows.length,
        activeAddressedServiceCount: activeAddressedServices.length,
      });
    return Object.freeze({
      partitionId,
      routingReadinessDimension,
      reasonCode: this.resolvePartitionRoutingReasonCode(
        serviceRows,
        activeAddressedServices,
        routableServices,
      ),
      canonicalLeaderIdentityState:
        canonicalLeaderIdentity?.state || null,
      canonicalLeaderIdentitySource:
        canonicalLeaderIdentity?.source || null,
      bootstrapLeaderStabilizationState:
        canonicalLeaderIdentity?.bootstrapLeaderStabilizationState || null,
      canonicalLeaderObservationState:
        canonicalLeaderObservation?.state || null,
      canonicalLeaderObservationReasonCode:
        canonicalLeaderObservation?.reasonCode || null,
      canonicalLeaderNodeId,
      canonicalLeaderRoutingGapState,
      leaderKnown: canonicalLeaderNodeId !== null,
      serviceRowCount: serviceRows.length,
      activeAddressedServiceCount: activeAddressedServices.length,
      routableServiceCount: routableServices.length,
      canonicalLeaderServiceCount,
      serviceRows: Object.freeze([...serviceRows]),
      activeAddressedServices: Object.freeze([...activeAddressedServices]),
      routableServices: Object.freeze([...routableServices]),
      deniedByNodeId: this.buildRoutingDeniedNodeSummary(
        evaluatedServices,
        routingReadinessDimension,
      ),
    });
  },

  /**
   * Resolve partition service rows from cache and overlay metadata.
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Partition service rows.
   * @private
   */
  getPartitionServiceRows(partitionId) {
    const overlayServices = this.getOverlayPartitionServices(partitionId);
    const hasOverlayServices = overlayServices.length > 0;
    const overlayMasksCacheServices =
      this.shouldOverlayMaskCacheServices(partitionId);
    if (!this.systemCache && !hasOverlayServices) {
      this.logger.warn(LOG_MSG.SYSTEM_CACHE_PARTITION_LOOKUP_UNAVAILABLE, {
        partitionId,
      });
      return [];
    }
    if (
      !hasOverlayServices &&
      typeof this.systemCache?.filter !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      this.logger.warn(QUERY_LOG_MSG.SYSTEM_CACHE_FILTER_UNSUPPORTED, {
        partitionId,
      });
      return [];
    }
    const services = [];

    // Overlay metadata is authoritative during runtime repair and must
    // override stale cache rows for the same replica/service identity.
    const overlayRows = this.getOverlayPartitionServices(partitionId).filter(
      (service) =>
        service.partition_id === partitionId &&
        service.service_type === SERVICE_TYPE.PARTITION,
    );
    services.push(...overlayRows);
    if (
      !overlayMasksCacheServices &&
      this.systemCache &&
      typeof this.systemCache.filter === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      const cacheRows =
        this.systemCache.filter(
          TABLES.SERVICES,
          (service) =>
            service.partition_id === partitionId &&
            service.service_type === SERVICE_TYPE.PARTITION,
        ) || [];
      services.push(...cacheRows);
    }
    if (services.length === 0) {
      return [];
    }
    const deduped = [];
    const seen = new Set();
    for (const service of services) {
      const dedupeKey =
        service.service_id || service.replica_id || service.address;
      if (!dedupeKey || seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      deduped.push(service);
    }
    return deduped;
  },

  /**
   * Resolve one typed routing reason from the partition service snapshot.
   * @param {Object[]} serviceRows
   * @param {Object[]} activeAddressedServices
   * @param {Object[]} routableServices
   * @return {string}
   * @private
   */
  resolvePartitionRoutingReasonCode(
    serviceRows,
    activeAddressedServices,
    routableServices,
  ) {
    if (serviceRows.length === 0) {
      return QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS;
    }
    if (activeAddressedServices.length === 0) {
      return QUERY_ROUTING_DIAGNOSTIC_REASON.NO_ACTIVE_ADDRESSED_SERVICES;
    }
    if (routableServices.length === 0) {
      return QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS;
    }
    return QUERY_ROUTING_DIAGNOSTIC_REASON.OK;
  },

  /**
   * Build per-node denial summaries for one routing snapshot.
   * @param {Array<Object>} evaluatedServices
   * @param {string} routingReadinessDimension
   * @return {Object}
   * @private
   */
  buildRoutingDeniedNodeSummary(evaluatedServices, routingReadinessDimension) {
    const deniedByNodeId = {};
    for (const entry of Array.isArray(evaluatedServices) ?
      evaluatedServices :
      []) {
      const service = entry?.service || null;
      const routing = entry?.routing || null;
      const nodeId = String(service?.node_id || service?.nodeId || '');
      if (
        !nodeId ||
        !routing ||
        routing.routable === true ||
        !routing.readinessSummary
      ) {
        continue;
      }
      const existing = deniedByNodeId[nodeId] || {
        decisionDimension: routingReadinessDimension,
        observedAt: routing.readinessSummary.observedAt || null,
        lifecycleState: routing.readinessSummary.lifecycleState || null,
        reasonCodes: [],
        failedDimensions: [],
      };
      const runtimeAuthority =
        routing.readinessSummary[READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY] ||
        null;
      if (
        runtimeAuthority &&
        typeof runtimeAuthority === QUERY_EXECUTOR_LITERAL.STRING_OBJECT
      ) {
        existing[READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY] = runtimeAuthority;
      }
      const projectionReadinessContract =
        routing.readinessSummary[
          READINESS_SNAPSHOT_KEY.PROJECTION_READINESS_CONTRACT
        ] || null;
      if (
        projectionReadinessContract &&
        typeof projectionReadinessContract ===
          QUERY_EXECUTOR_LITERAL.STRING_OBJECT
      ) {
        existing[READINESS_SNAPSHOT_KEY.PROJECTION_READINESS_CONTRACT] =
          projectionReadinessContract;
      }
      for (const reasonCode of routing.readinessSummary.reasonCodes) {
        if (!existing.reasonCodes.includes(reasonCode)) {
          existing.reasonCodes.push(reasonCode);
        }
      }
      for (const failedDimension of routing.readinessSummary.failedDimensions) {
        if (!existing.failedDimensions.includes(failedDimension)) {
          existing.failedDimensions.push(failedDimension);
        }
      }
      deniedByNodeId[nodeId] = existing;
    }
    return Object.freeze(deniedByNodeId);
  },

  /**
   * Build a compact routing snapshot summary suitable for logs.
   * @param {Object|null} routingSnapshot
   * @return {Object|null}
   * @private
   */
  summarizePartitionRoutingSnapshot(routingSnapshot) {
    if (
      !routingSnapshot ||
      typeof routingSnapshot !== QUERY_EXECUTOR_LITERAL.STRING_OBJECT
    ) {
      return null;
    }
    return {
      reasonCode: routingSnapshot.reasonCode || null,
      routingReadinessDimension:
        routingSnapshot.routingReadinessDimension || null,
      serviceRowCount: Number(routingSnapshot.serviceRowCount || 0),
      activeAddressedServiceCount: Number(
        routingSnapshot.activeAddressedServiceCount || 0,
      ),
      routableServiceCount: Number(
        routingSnapshot.routableServiceCount || 0,
      ),
      canonicalLeaderServiceCount: Number(
        routingSnapshot.canonicalLeaderServiceCount || 0,
      ),
      leaderKnown: routingSnapshot.leaderKnown === true,
      canonicalLeaderNodeId: routingSnapshot.canonicalLeaderNodeId || null,
      deniedByNodeId: routingSnapshot.deniedByNodeId || {},
    };
  },

  /**
   * Emit typed diagnostics when partition routing has no usable candidates.
   * @param {Object|null} routingSnapshot
   * @private
   */
  logPartitionRoutingDenial(routingSnapshot) {
    const reasonCode = String(
      routingSnapshot?.reasonCode ||
        QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS,
    );
    const warnKey =
      String(routingSnapshot?.partitionId || '') + ':' + reasonCode;
    const now = Date.now();
    const lastWarnAt = this.noServiceWarnLastAt.get(warnKey);
    if (
      Number.isFinite(lastWarnAt) &&
      now - lastWarnAt < this.noServiceWarnThrottleMs
    ) {
      return;
    }
    this.noServiceWarnLastAt.set(warnKey, now);
    const message =
      reasonCode ===
      QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS ?
        QUERY_LOG_MSG.PARTITION_ROUTING_CANDIDATES_FILTERED :
        QUERY_LOG_MSG.NO_ACTIVE_SERVICE_FOR_PARTITION;
    this.logger.warn(message, {
      partitionId: routingSnapshot?.partitionId || null,
      routingSnapshot: this.summarizePartitionRoutingSnapshot(routingSnapshot),
    });
  },

  /**
   * Await one authoritative readiness repair when routing denial indicates the
   * local cache filtered all active candidates based on stale node evidence.
   * @param {Object|null} routingSnapshot
   * @return {Promise<boolean>}
   * @private
   */
  async maybeAwaitDeniedPartitionRoutingRepair(routingSnapshot, options = {}) {
    if (!routingSnapshot) {
      return false;
    }
    const allowReadinessAuthoritativeRefresh =
      this.shouldAllowRoutingAuthoritativeRefresh(options);
    const canRefreshReadiness =
      this.controlPlaneReadinessService &&
      typeof this.controlPlaneReadinessService.getNodeReadiness === 'function';
    const deniedNodeIds =
      this.collectAllFilteredRoutingRepairNodeIds(routingSnapshot);
    const shouldRepairServiceGap =
      this.shouldRepairCanonicalLeaderServiceGap(routingSnapshot);
    const shouldRepairFilteredRecoveryRouting =
      this.shouldRepairAllFilteredRecoveryRouting(routingSnapshot);
    const repairNodeIds = new Set(deniedNodeIds);
    if (shouldRepairServiceGap) {
      repairNodeIds.add(routingSnapshot.canonicalLeaderNodeId);
    }
    let attemptedRepair = false;
    if (
      allowReadinessAuthoritativeRefresh &&
      canRefreshReadiness &&
      repairNodeIds.size > 0
    ) {
      attemptedRepair = true;
      await Promise.all(
        [...repairNodeIds].map(async (nodeId) => {
          try {
            await this.controlPlaneReadinessService.getNodeReadiness(nodeId, {
              allowAuthoritativeRefresh: true,
              requireFreshOnIneligible: true,
              decisionDimension: routingSnapshot.routingReadinessDimension,
            });
          } catch (_error) {
            return null;
          }
          return null;
        }),
      );
    }
    if (!shouldRepairServiceGap && !shouldRepairFilteredRecoveryRouting) {
      return attemptedRepair;
    }
    const overlayRepaired = await this.refreshRoutingMetadataOverlay(
      routingSnapshot,
      {
        partitionId: routingSnapshot.partitionId || null,
        routingReadinessDimension:
          routingSnapshot.routingReadinessDimension ||
          this.defaultRoutingReadinessDimension,
        refreshReason: QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE,
      },
    );
    return attemptedRepair || overlayRepaired;
  },

  /**
   * Collect nodes to refresh when every active service row was filtered. Older
   * snapshots can lack denial details when readiness is unavailable, so fall
   * back to active addressed rows instead of skipping repair entirely.
   * @param {Object|null} routingSnapshot
   * @return {Array<string>}
   * @private
   */
  collectAllFilteredRoutingRepairNodeIds(routingSnapshot) {
    if (
      routingSnapshot?.reasonCode !==
        QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS ||
      Number(routingSnapshot.activeAddressedServiceCount) <= 0
    ) {
      return [];
    }
    const deniedNodeIds = Object.keys(routingSnapshot.deniedByNodeId || {});
    if (deniedNodeIds.length > 0) {
      return deniedNodeIds;
    }
    const serviceRows =
      Array.isArray(routingSnapshot.activeAddressedServices) ?
        routingSnapshot.activeAddressedServices :
        Array.isArray(routingSnapshot.serviceRows) ?
          routingSnapshot.serviceRows.filter((service) =>
            service?.status !== SERVICE_STATUS.INACTIVE &&
            typeof service?.address === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
            service.address.length > 0,
          ) :
          [];
    const nodeIds = [];
    const seen = new Set();
    for (const service of serviceRows) {
      const nodeId = service?.node_id || service?.nodeId || null;
      if (
        typeof nodeId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
        nodeId.length === 0 ||
        seen.has(nodeId)
      ) {
        continue;
      }
      seen.add(nodeId);
      nodeIds.push(nodeId);
    }
    return nodeIds;
  },

  /**
   * Refresh authoritative routing metadata when priority recovery has active
   * service rows but local readiness filtered all candidates.
   * @param {Object|null} routingSnapshot
   * @return {boolean}
   * @private
   */
  shouldRepairAllFilteredRecoveryRouting(routingSnapshot) {
    if (
      routingSnapshot?.reasonCode !==
        QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS ||
      routingSnapshot.routingReadinessDimension !==
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE ||
      Number(routingSnapshot.activeAddressedServiceCount) <= 0 ||
      typeof routingSnapshot.partitionId !==
        QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      routingSnapshot.partitionId.length === 0
    ) {
      return false;
    }
    const partitionRow = this.getPartitionRecord(routingSnapshot.partitionId);
    return isPriorityControlPlanePartition({
      partitionId: routingSnapshot.partitionId,
      partitionRow,
    });
  },

  /**
   * Return true when authoritative node/service repair should refresh the
   * canonical leader node because its service rows are missing locally, either
   * while peer replicas remain visible or when the local cache has no service
   * rows for the partition at all.
   * @param {Object|null} routingSnapshot
   * @return {boolean}
   * @private
   */
  shouldRepairCanonicalLeaderServiceGap(routingSnapshot) {
    return Boolean(
      routingSnapshot &&
      routingSnapshot.leaderKnown === true &&
      typeof routingSnapshot.canonicalLeaderNodeId ===
        QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      routingSnapshot.canonicalLeaderNodeId.length > 0 &&
      Number(routingSnapshot.canonicalLeaderServiceCount) === 0 &&
      (Number(routingSnapshot.activeAddressedServiceCount) > 0 ||
        Number(routingSnapshot.serviceRowCount) === 0),
    );
  },

  /**
   * Emit the generic no-service warning only when typed routing diagnostics did
   * not already capture a more specific readiness-filtered denial.
   * @param {string} partitionId
   * @param {Object|null} routingSnapshot
   * @private
   */
  logNoServiceForPartition(partitionId, routingSnapshot = null) {
    if (
      routingSnapshot?.reasonCode ===
      QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS
    ) {
      return;
    }
    const now = Date.now();
    const lastAt = this.noServiceWarnLastAt.get(partitionId);
    if (
      Number.isFinite(lastAt) &&
      now - lastAt < this.noServiceWarnThrottleMs
    ) {
      return;
    }
    this.noServiceWarnLastAt.set(partitionId, now);
    this.logger.warn(QUERY_LOG_MSG.NO_SERVICE_FOR_PARTITION, {
      partitionId,
    });
  },

  /**
   * Get write-routable partition services from system cache.
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Routable services for the partition.
   * @private
   */
  getRoutablePartitionServices(
    partitionId,
    routingReadinessDimension = this.defaultRoutingReadinessDimension,
  ) {
    return this.getPartitionRoutingSnapshot(
      partitionId,
      routingReadinessDimension,
    ).routableServices;
  },

  /**
   * Check whether a partition has write-routable services in the system cache.
   * @param {string} partitionId - Partition ID.
   * @return {boolean} True when routable services exist.
   * @private
   */
  hasRoutablePartitionService(
    partitionId,
    routingReadinessDimension = this.defaultRoutingReadinessDimension,
  ) {
    return (
      this.getPartitionRoutingSnapshot(partitionId, routingReadinessDimension)
        .routableServiceCount > 0
    );
  },

  /**
   * Check whether partition metadata exists in the cache.
   * @param {string} partitionId - Partition ID.
   * @return {boolean} True when partition metadata exists.
   * @private
   */
  hasPartitionRecord(partitionId) {
    if (this.systemCache) {
      if (
        typeof this.systemCache.has === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
      ) {
        if (this.systemCache.has(TABLES.PARTITIONS, partitionId)) {
          return true;
        }
      } else if (
        typeof this.systemCache.get === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
      ) {
        if (this.systemCache.get(TABLES.PARTITIONS, partitionId)) {
          return true;
        }
      } else if (
        typeof this.systemCache.filter ===
        QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
      ) {
        if (
          this.systemCache.filter(
            TABLES.PARTITIONS,
            (partition) => partition.partition_id === partitionId,
          ).length > 0
        ) {
          return true;
        }
      }
    }
    return this.getOverlayPartitionRecord(partitionId) !== null;
  },
};

function installQueryExecutorPartitionRoutingSnapshotMethods(target) {
  for (const [name, value] of Object.entries(
    queryExecutorPartitionRoutingSnapshotMethods,
  )) {
    Object.defineProperty(target.prototype, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
}

export {installQueryExecutorPartitionRoutingSnapshotMethods};
