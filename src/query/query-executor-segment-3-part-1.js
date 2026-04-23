import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {QueryExecutorSegment2} from './query-executor-segment-2.js';

const {
  COLUMN,
  LEADER_GAP_REASON_OWNER_MISSING,
  LEADER_GAP_REASON_SERVICE_MISSING,
  LOG_MSG,
  NUM,
  QUERY_DEFAULTS,
  QUERY_EXECUTOR_LITERAL,
  QUERY_LOG_MSG,
  QUERY_ROUTING_DIAGNOSTIC_REASON,
  QUERY_ROUTING_REPAIR_REASON,
  SERVICE_TYPE,
  SYSTEM_TABLE_NAMES,
  TABLES,
  buildPartitionServiceWitnessFingerprint,
  resolveCanonicalLeaderRoutingGapState,
} = QUERY_EXECUTOR_SHARED;

class QueryExecutorSegment3Part1 extends QueryExecutorSegment2 {
  async delay(delayMs) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  /**
   * Throw when cooperative cancellation has been requested.
   * @param {Object|null} cancellationToken
   * @private
   */
  throwIfCancelled(cancellationToken) {
    if (
      !cancellationToken ||
      typeof cancellationToken.throwIfCancelled !==
        QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      return;
    }
    cancellationToken.throwIfCancelled();
  }

  /**
   * Mark one partition service endpoint as temporarily unroutable after a
   * runtime no-handler witness so follow-up calls do not immediately retry the
   * same stale address.
   * @param {string} partitionId
   * @param {string} address
   * @private
   */
  markTemporarilyUnroutableAddress(partitionId, address, service = null) {
    if (
      typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      partitionId.length === NUM.ZERO ||
      typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      address.length === NUM.ZERO
    ) {
      return;
    }
    const expiresAt =
      Date.now() + this.resolveNoHandlerAddressQuarantineMs(partitionId);
    const fingerprint = buildPartitionServiceWitnessFingerprint(service);
    const existing =
      this.temporarilyUnroutableAddressesByPartition.get(partitionId);
    if (existing instanceof Map) {
      existing.set(
        address,
        Object.freeze({
          expiresAt,
          fingerprint,
        }),
      );
      return;
    }
    const addressExpiryMap = new Map();
    addressExpiryMap.set(
      address,
      Object.freeze({
        expiresAt,
        fingerprint,
      }),
    );
    this.temporarilyUnroutableAddressesByPartition.set(
      partitionId,
      addressExpiryMap,
    );
  }

  /**
   * Clear one temporary unroutable endpoint marker after a successful route.
   * @param {string} partitionId
   * @param {string} address
   * @private
   */
  clearTemporarilyUnroutableAddress(partitionId, address) {
    if (
      typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      partitionId.length === NUM.ZERO ||
      typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      address.length === NUM.ZERO
    ) {
      return;
    }
    const existing =
      this.temporarilyUnroutableAddressesByPartition.get(partitionId);
    if (!(existing instanceof Map)) {
      return;
    }
    existing.delete(address);
    if (existing.size === NUM.ZERO) {
      this.temporarilyUnroutableAddressesByPartition.delete(partitionId);
    }
  }

  /**
   * Return true when one partition endpoint is still inside the temporary
   * no-handler quarantine window.
   * @param {string} partitionId
   * @param {string} address
   * @return {boolean}
   * @private
   */
  isTemporarilyUnroutableAddress(partitionId, address, service = null) {
    if (
      typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      partitionId.length === NUM.ZERO ||
      typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      address.length === NUM.ZERO
    ) {
      return false;
    }
    const existing =
      this.temporarilyUnroutableAddressesByPartition.get(partitionId);
    if (!(existing instanceof Map)) {
      return false;
    }
    const entry = existing.get(address);
    const expiresAt = Number.isFinite(entry) ?
      entry :
      Number.isFinite(entry?.expiresAt) ?
        entry.expiresAt :
        null;
    if (!Number.isFinite(expiresAt)) {
      existing.delete(address);
      if (existing.size === NUM.ZERO) {
        this.temporarilyUnroutableAddressesByPartition.delete(partitionId);
      }
      return false;
    }
    const currentFingerprint = buildPartitionServiceWitnessFingerprint(service);
    if (
      typeof entry?.fingerprint === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      entry.fingerprint.length > NUM.ZERO &&
      typeof currentFingerprint === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      currentFingerprint.length > NUM.ZERO &&
      currentFingerprint !== entry.fingerprint
    ) {
      existing.delete(address);
      if (existing.size === NUM.ZERO) {
        this.temporarilyUnroutableAddressesByPartition.delete(partitionId);
      }
      return false;
    }
    if (expiresAt > Date.now()) {
      return true;
    }
    existing.delete(address);
    if (existing.size === NUM.ZERO) {
      this.temporarilyUnroutableAddressesByPartition.delete(partitionId);
    }
    return false;
  }

  /**
   * Resolve the quarantine duration for one runtime no-handler witness.
   * Control-plane partitions keep stale addresses shadowed longer so routed
   * writes stop chasing cache rows that lag behind removal/publication.
   * @param {string} partitionId
   * @return {number}
   * @private
   */
  resolveNoHandlerAddressQuarantineMs(partitionId) {
    if (this.noHandlerAddressQuarantineMsExplicit) {
      return this.noHandlerAddressQuarantineMs;
    }
    const tableName = this.resolvePartitionTableName(partitionId);
    if (
      SYSTEM_TABLE_NAMES.has(
        String(tableName || QUERY_EXECUTOR_LITERAL.STRING_VALUE),
      )
    ) {
      return Math.max(
        this.noHandlerAddressQuarantineMs,
        QUERY_DEFAULTS.CONTROL_PLANE_NO_HANDLER_ADDRESS_QUARANTINE_MS,
      );
    }
    return this.noHandlerAddressQuarantineMs;
  }

  /**
   * Resolve the routed service row that produced the current delivery target.
   * @param {Object|null} routingSnapshot
   * @param {Object|null} serviceInfo
   * @param {string|null} address
   * @return {Object|null}
   * @private
   */
  findRoutingSnapshotService(routingSnapshot, serviceInfo, address) {
    const serviceRows = Array.isArray(routingSnapshot?.serviceRows) ?
      routingSnapshot.serviceRows :
      [];
    const replicaId =
      typeof serviceInfo?.replicaId === 'string' &&
      serviceInfo.replicaId.length > NUM.ZERO ?
        serviceInfo.replicaId :
        null;
    const nodeId =
      typeof serviceInfo?.nodeId === 'string' &&
      serviceInfo.nodeId.length > NUM.ZERO ?
        serviceInfo.nodeId :
        null;
    const normalizedAddress =
      typeof address === 'string' && address.length > NUM.ZERO ? address : null;
    for (const service of serviceRows) {
      if (
        replicaId &&
        (service?.service_id === replicaId || service?.replica_id === replicaId)
      ) {
        return service;
      }
      if (normalizedAddress && service?.address === normalizedAddress) {
        return service;
      }
    }
    if (nodeId) {
      return serviceRows.find((service) => service?.node_id === nodeId) || null;
    }
    return null;
  }

  /**
   * Get partition service candidates in preferred order.
   * @param {string} partitionId - Partition ID.
   * @param {boolean} forRead - True when executing read-only queries.
   * @return {Array<Object>} Ordered list of service info objects.
   * @private
   */
  getPartitionServiceCandidates(
    partitionId,
    forRead = false,
    preferLeader = false,
    preferSameLatencyGroup = false,
    routingReadinessDimension = this.defaultRoutingReadinessDimension,
  ) {
    return this.resolvePartitionServiceCandidates(
      partitionId,
      forRead,
      preferLeader,
      preferSameLatencyGroup,
      routingReadinessDimension,
    ).candidates;
  }

  /**
   * Resolve ordered candidates together with the routing snapshot used to build
   * them so request paths can reuse the same owner evidence for retries.
   * @param {string} partitionId
   * @param {boolean} forRead
   * @param {boolean} preferLeader
   * @param {boolean} preferSameLatencyGroup
   * @param {string} routingReadinessDimension
   * @return {{candidates: Array<Object>, routingSnapshot: Object}}
   * @private
   */
  resolvePartitionServiceCandidates(
    partitionId,
    forRead = false,
    preferLeader = false,
    preferSameLatencyGroup = false,
    routingReadinessDimension = this.defaultRoutingReadinessDimension,
    routingOptions = {},
  ) {
    const prioritizeLeader = preferLeader || !forRead;
    const routingSnapshot = this.getPartitionRoutingSnapshot(
      partitionId,
      routingReadinessDimension,
      routingOptions,
    );
    const services = routingSnapshot.routableServices;
    if (services.length === NUM.ZERO) {
      this.logPartitionRoutingDenial(routingSnapshot);
      return {
        candidates: [],
        routingSnapshot,
      };
    }
    const localGroupId = this.resolveNodeLatencyGroupId(this.nodeId);
    const orderedServices = this.orderServicesByLatencyGroup(
      services,
      localGroupId,
      forRead && preferSameLatencyGroup,
    );
    const canonicalLeaderNodeId = routingSnapshot.canonicalLeaderNodeId;
    const recoveryRoutingContract =
      this.resolveCanonicalLeaderGapRecoveryRoutingContract(
        partitionId,
        routingSnapshot,
        routingReadinessDimension,
        routingOptions?.allowReadinessAuthoritativeRefresh !== false,
      );
    const bootstrapLeaderServices =
      !forRead && !canonicalLeaderNodeId ?
        this.getFreshBootstrapLeaderServices(partitionId, orderedServices) :
        [];
    const candidates = [];
    const seen = new Set();
    const addService = (service) => {
      if (!service) {
        return;
      }
      if (
        this.isTemporarilyUnroutableAddress(
          partitionId,
          service.address,
          service,
        )
      ) {
        return;
      }
      const key = service.service_id || service.replica_id || service.address;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      candidates.push({
        address: service.address,
        nodeId: service.node_id,
        replicaId: service.service_id || service.replica_id,
      });
    };
    const canonicalLeaderServices = canonicalLeaderNodeId ?
      orderedServices.filter(
        (service) => service.node_id === canonicalLeaderNodeId,
      ) :
      [];
    if (!forRead) {
      if (!canonicalLeaderNodeId) {
        if (bootstrapLeaderServices.length > NUM.ZERO) {
          bootstrapLeaderServices.forEach(addService);
          return {
            candidates,
            routingSnapshot,
          };
        }
        if (recoveryRoutingContract.recoveryCandidateWidening === true) {
          orderedServices.forEach(addService);
          if (candidates.length > NUM.ZERO) {
            return {
              candidates,
              routingSnapshot,
            };
          }
        }
        this.logCanonicalLeaderRoutingGap(partitionId, {
          reason: LEADER_GAP_REASON_OWNER_MISSING,
          services: orderedServices,
          routingSnapshot,
        });
        return {
          candidates: [],
          routingSnapshot,
        };
      }
      if (canonicalLeaderServices.length === NUM.ZERO) {
        if (recoveryRoutingContract.recoveryCandidateWidening === true) {
          orderedServices.forEach(addService);
          if (candidates.length > NUM.ZERO) {
            return {
              candidates,
              routingSnapshot,
            };
          }
        }
        this.logCanonicalLeaderRoutingGap(partitionId, {
          reason: LEADER_GAP_REASON_SERVICE_MISSING,
          canonicalLeaderNodeId,
          services: orderedServices,
          routingSnapshot,
        });
        return {
          candidates: [],
          routingSnapshot,
        };
      }
      canonicalLeaderServices.forEach(addService);
      if (candidates.length === NUM.ZERO) {
        // Canonical leader rows are present but were quarantined after runtime
        // no-handler witnesses. Try other live replicas to follow redirects.
        orderedServices.forEach(addService);
      }
      return {
        candidates,
        routingSnapshot,
      };
    }
    if (prioritizeLeader) {
      if (canonicalLeaderNodeId) {
        canonicalLeaderServices.forEach(addService);
      }
      orderedServices
        .filter((service) => service.node_id === this.nodeId)
        .forEach(addService);
    }
    orderedServices.forEach(addService);
    return {
      candidates,
      routingSnapshot,
    };
  }

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
      NUM.ZERO;
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
      routableServices: Object.freeze([...routableServices]),
      deniedByNodeId: this.buildRoutingDeniedNodeSummary(
        evaluatedServices,
        routingReadinessDimension,
      ),
    });
  }

  /**
   * Resolve node latency-group assignment from system cache.
   * @param {string} nodeId - Node ID.
   * @return {string|null}
   * @private
   */
  resolveNodeLatencyGroupId(nodeId) {
    if (
      !nodeId ||
      typeof this.systemCache?.get !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      return null;
    }
    const nodeRow = this.systemCache.get(TABLES.NODES, nodeId);
    return nodeRow?.[COLUMN.LATENCY_GROUP_ID] || null;
  }

  /**
   * Sort services to prefer same-group replicas for read queries.
   * @param {Object[]} services - Routable services.
   * @param {string|null} localGroupId - Local node's latency group.
   * @param {boolean} enabled - Preference enabled flag.
   * @return {Object[]}
   * @private
   */
  orderServicesByLatencyGroup(services, localGroupId, enabled) {
    if (
      !enabled ||
      !localGroupId ||
      typeof this.systemCache?.get !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      return services;
    }
    return [...services].sort((left, right) => {
      const leftGroupId = this.resolveNodeLatencyGroupId(left?.node_id);
      const rightGroupId = this.resolveNodeLatencyGroupId(right?.node_id);
      const leftPreferred = leftGroupId === localGroupId;
      const rightPreferred = rightGroupId === localGroupId;
      if (leftPreferred && !rightPreferred) {
        return NUM.NEGATIVE_ONE;
      }
      if (!leftPreferred && rightPreferred) {
        return NUM.ONE;
      }
      return NUM.ZERO;
    });
  }

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
    if (services.length === NUM.ZERO) {
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
  }

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
    if (serviceRows.length === NUM.ZERO) {
      return QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS;
    }
    if (activeAddressedServices.length === NUM.ZERO) {
      return QUERY_ROUTING_DIAGNOSTIC_REASON.NO_ACTIVE_ADDRESSED_SERVICES;
    }
    if (routableServices.length === NUM.ZERO) {
      return QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS;
    }
    return QUERY_ROUTING_DIAGNOSTIC_REASON.OK;
  }

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
  }

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
      serviceRowCount: Number(routingSnapshot.serviceRowCount || NUM.ZERO),
      activeAddressedServiceCount: Number(
        routingSnapshot.activeAddressedServiceCount || NUM.ZERO,
      ),
      routableServiceCount: Number(
        routingSnapshot.routableServiceCount || NUM.ZERO,
      ),
      canonicalLeaderServiceCount: Number(
        routingSnapshot.canonicalLeaderServiceCount || NUM.ZERO,
      ),
      leaderKnown: routingSnapshot.leaderKnown === true,
      canonicalLeaderNodeId: routingSnapshot.canonicalLeaderNodeId || null,
      deniedByNodeId: routingSnapshot.deniedByNodeId || {},
    };
  }

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
  }

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
      routingSnapshot.reasonCode ===
        QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS &&
      routingSnapshot.activeAddressedServiceCount > NUM.ZERO ?
        Object.keys(routingSnapshot.deniedByNodeId || {}) :
        [];
    const shouldRepairServiceGap =
      this.shouldRepairCanonicalLeaderServiceGap(routingSnapshot);
    const repairNodeIds = new Set(deniedNodeIds);
    if (shouldRepairServiceGap) {
      repairNodeIds.add(routingSnapshot.canonicalLeaderNodeId);
    }
    let attemptedRepair = false;
    if (
      allowReadinessAuthoritativeRefresh &&
      canRefreshReadiness &&
      repairNodeIds.size > NUM.ZERO
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
    if (!shouldRepairServiceGap) {
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
  }

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
      routingSnapshot.canonicalLeaderNodeId.length > NUM.ZERO &&
      Number(routingSnapshot.canonicalLeaderServiceCount) === NUM.ZERO &&
      (Number(routingSnapshot.activeAddressedServiceCount) > NUM.ZERO ||
        Number(routingSnapshot.serviceRowCount) === NUM.ZERO),
    );
  }

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
  }

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
  }

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
        .routableServiceCount > NUM.ZERO
    );
  }

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
          ).length > NUM.ZERO
        ) {
          return true;
        }
      }
    }
    return this.getOverlayPartitionRecord(partitionId) !== null;
  }
}
export {QueryExecutorSegment3Part1};
