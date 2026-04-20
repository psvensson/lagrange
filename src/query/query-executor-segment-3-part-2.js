import { QUERY_EXECUTOR_SHARED } from "./query-executor-shared.js";
import { QueryExecutorSegment3Part1 } from "./query-executor-segment-3-part-1.js";

const {
  COLUMN,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_WRITE_RETRY_DECISION_STATE,
  ConfigurationManager,
  DISTRIBUTED_JOIN_STRATEGY,
  DistributedMergeEngine,
  ERRORS,
  HLCClockService,
  LEADER_GAP_REASON_OWNER_MISSING,
  LEADER_GAP_REASON_SERVICE_MISSING,
  LOG_MSG,
  LoggingService,
  METRICS_LOG_TAG,
  MIGRATION_PARTITION_OPERATION,
  NUM,
  PARTITION_SERVICE_ERROR_MSG,
  PG_EXPR_TYPE,
  ParallelQueryCoordinator,
  QUERY_AST_NODE,
  QUERY_AST_TYPE,
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_EXECUTOR_LITERAL,
  QUERY_JOIN_TYPE,
  QUERY_LOG_MSG,
  QUERY_MESSAGE_FIELD_MIGRATION_ID,
  QUERY_MESSAGE_FIELD_MIGRATION_OPERATION,
  QUERY_MESSAGE_FIELD_SESSION_ID,
  QUERY_MESSAGE_FIELD_SPLIT_MIRROR_ORIGIN,
  QUERY_MESSAGE_TYPE,
  QUERY_OPERATOR,
  QUERY_RESPONSE_TYPE,
  QUERY_ROUTING_DIAGNOSTIC_REASON,
  QUERY_ROUTING_REPAIR_REASON,
  QUERY_SQL,
  QUERY_SUBSYSTEM,
  RAFT_ROLE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  SQL,
  SYSTEM_TABLE_NAMES,
  TABLES,
  TRANSPORT_ERROR_MSG,
  buildDistributedFailureSummary,
  buildParticipantFailureEntry,
  buildPartitionServiceWitnessFingerprint,
  compactEligibilitySnapshot,
  evaluateEligibilityDecision,
  isRetryableControlPlaneError,
  normalizeParticipantFailureString,
  normalizeParticipantRetryAfterMs,
  resolveBootstrapLeaderSelection,
  resolveParticipantBackpressureState,
} = QUERY_EXECUTOR_SHARED;

class QueryExecutorSegment3 extends QueryExecutorSegment3Part1 {


  /**
   * Find partition leader address from system cache.
   * Queries the services table in the cache for the partition leader.
   * Returns the leader address for routing write queries.
   * Handles missing leader gracefully by returning null.
   * Requirements: 5.2
   * @param {string} partitionId - Partition ID.
   * @return {string|null} Leader address or null if not found.
   */
  findPartitionLeaderAddress(
    partitionId,
    routingReadinessDimension = this.defaultRoutingReadinessDimension,
  ) {
    const service = this.findPartitionService(
      partitionId,
      false,
      routingReadinessDimension,
    );
    if (
      !service ||
      typeof service.address !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      service.address.length === NUM.ZERO
    ) {
      this.logger.debug(QUERY_LOG_MSG.NO_LEADER_SERVICE_FOR_PARTITION, {
        partitionId,
      });
      return null;
    }
    return service.address;
  }

  /**
   * Find partition service information from system cache.
   * Returns the service address for routing queries.
   * Uses ONLY the system cache - no fallbacks.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null} {address, nodeId, replicaId} or null if not found.
   * @private
   */
  findPartitionService(
    partitionId,
    forRead = false,
    routingReadinessDimension = this.defaultRoutingReadinessDimension,
  ) {
    const candidates = this.getPartitionServiceCandidates(
      partitionId,
      forRead,
      false,
      false,
      routingReadinessDimension,
    );
    return candidates[NUM.ZERO] || null;
  }

  /**
   * Determine whether a service row is routable.
   * @param {Object} service - Service row.
   * @return {boolean} True when row can be used for routing.
   * @private
   */
  isRoutablePartitionService(
    service,
    routingReadinessDimension = this.defaultRoutingReadinessDimension,
  ) {
    return (
      this.evaluatePartitionServiceRoutability(
        service,
        routingReadinessDimension,
      ).routable === true
    );
  }

  /**
   * Evaluate one partition service row against the canonical readiness owner.
   * @param {Object} service
   * @param {string} routingReadinessDimension
   * @return {Object}
   * @private
   */
  evaluatePartitionServiceRoutability(
    service,
    routingReadinessDimension = this.defaultRoutingReadinessDimension,
    routingOptions = {},
  ) {
    const allowReadinessAuthoritativeRefresh =
      this.shouldAllowRoutingAuthoritativeRefresh(routingOptions);
    let routabilityResult;
    if (service.status !== SERVICE_STATUS.ACTIVE) {
      routabilityResult = {
        routable: false,
        reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_INACTIVE,
        readinessSummary: null,
      };
    } else if (
      typeof service.address !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      service.address.length === NUM.ZERO
    ) {
      routabilityResult = {
        routable: false,
        reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_ADDRESS_MISSING,
        readinessSummary: null,
      };
    }
    if (routabilityResult) {
      return routabilityResult;
    }
    const nodeId = service?.node_id || service?.nodeId || null;
    if (
      !nodeId ||
      !this.controlPlaneReadinessService ||
      (typeof this.controlPlaneReadinessService
        .getControlPlaneParticipationSync !==
        QUERY_EXECUTOR_LITERAL.STRING_FUNCTION &&
        typeof this.controlPlaneReadinessService.getNodeReadinessSync !==
          QUERY_EXECUTOR_LITERAL.STRING_FUNCTION)
    ) {
      routabilityResult = {
        routable: true,
        reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.OK,
        readinessSummary: null,
      };
    }
    if (routabilityResult) {
      return routabilityResult;
    }
    const partitionId = String(
      service?.partition_id || service?.partitionId || "",
    );
    const partitionRow =
      partitionId.length > NUM.ZERO
        ? this.getPartitionRecord(partitionId)
        : null;
    const tableName =
      String(
        partitionRow?.table_name ||
          partitionRow?.tableName ||
          partitionRow?.table_id ||
          partitionRow?.tableId ||
          "",
      ) || null;
    let evaluation;
    if (
      typeof this.controlPlaneReadinessService
        .getControlPlaneParticipationSync ===
      QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      const participationKind =
        routingReadinessDimension ===
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
          ? CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY
          : CONTROL_PLANE_PARTICIPATION_KIND.ROUTED_READ;
      const participation =
        this.controlPlaneReadinessService.getControlPlaneParticipationSync(
          nodeId,
          {
            allowAuthoritativeRefresh: allowReadinessAuthoritativeRefresh,
            requireFreshOnIneligible: allowReadinessAuthoritativeRefresh,
            participationKind,
            decisionDimension: routingReadinessDimension,
            partitionId: partitionId || null,
            tableName,
          },
        );
      evaluation = {
        readiness: participation?.snapshot || null,
        decision: {
          eligible: participation?.eligible === true,
          failedDimensions: Array.isArray(participation?.failedDimensions)
            ? participation.failedDimensions
            : Object.freeze([]),
        },
        compactSnapshot: participation?.summary || null,
      };
    } else {
      const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(
        nodeId,
        {
          allowAuthoritativeRefresh: allowReadinessAuthoritativeRefresh,
          requireFreshOnIneligible: allowReadinessAuthoritativeRefresh,
          decisionDimension: routingReadinessDimension,
        },
      );
      if (!readiness || !readiness.dimensions) {
        routabilityResult = {
          routable: false,
          reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.READINESS_UNAVAILABLE,
          readinessSummary: null,
        };
      } else {
        evaluation = {
          readiness,
          decision: evaluateEligibilityDecision(
            readiness,
            routingReadinessDimension,
          ),
          compactSnapshot: compactEligibilitySnapshot(
            readiness,
            routingReadinessDimension,
          ),
        };
      }
    }
    if (routabilityResult) {
      return routabilityResult;
    }
    const readiness = evaluation.readiness;
    const decision = evaluation.decision;
    const compactSnapshot = evaluation.compactSnapshot;
    const bootstrapGraceRoutable =
      decision?.eligible !== true &&
      this.shouldAllowFreshBootstrapRoutingGrace(service, readiness, decision);
    return {
      routable: decision.eligible === true || bootstrapGraceRoutable,
      reasonCode:
        decision.eligible === true || bootstrapGraceRoutable
          ? QUERY_ROUTING_DIAGNOSTIC_REASON.OK
          : QUERY_ROUTING_DIAGNOSTIC_REASON.NODE_NOT_ELIGIBLE,
      readinessSummary: compactSnapshot
        ? {
            decisionDimension:
              compactSnapshot.decisionDimension || routingReadinessDimension,
            observedAt: compactSnapshot.observedAt || null,
            lifecycleState: compactSnapshot.lifecycleState || null,
            reasonCodes: compactSnapshot.reasonCodes || Object.freeze([]),
            failedDimensions: decision.failedDimensions || Object.freeze([]),
          }
        : null,
    };
  }

  /**
   * Admit one fresh bootstrap partition service when cache heartbeat
   * publication lags but transport and service evidence remain positive.
   * This grace stays bounded to the initial creation window where
   * `leader_node_id` has not converged yet.
   * @param {Object} service
   * @param {Object|null} readiness
   * @param {Object|null} decision
   * @return {boolean}
   * @private
   */
  shouldAllowFreshBootstrapRoutingGrace(service, readiness, decision) {
    const partitionId = String(
      service?.partition_id || service?.partitionId || "",
    );
    if (partitionId.length === NUM.ZERO) {
      return false;
    }
    const partition = this.getPartitionRecord(partitionId);
    if (!this.isBootstrapRoutingGraceWindow(partition)) {
      return false;
    }
    const dimensions = readiness?.dimensions;
    const nodeEvidence = readiness?.nodeEvidence;
    if (
      !dimensions ||
      typeof dimensions !== QUERY_EXECUTOR_LITERAL.STRING_OBJECT ||
      !nodeEvidence ||
      typeof nodeEvidence !== QUERY_EXECUTOR_LITERAL.STRING_OBJECT
    ) {
      return false;
    }
    if (
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] !== true ||
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY] !== true ||
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY] !== true ||
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY
      ] !== true ||
      nodeEvidence.transportConnected !== true ||
      nodeEvidence.readyWhenWritten !== true
    ) {
      return false;
    }
    const allowedFailedDimensions = new Set([
      CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE,
      CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
      CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE,
    ]);
    const failedDimensions = Array.isArray(decision?.failedDimensions)
      ? decision.failedDimensions
      : [];
    return (
      failedDimensions.length > NUM.ZERO &&
      failedDimensions.every((dimension) =>
        allowedFailedDimensions.has(dimension),
      )
    );
  }

  /**
   * Resolve overlay partition row by ID.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null} Overlay partition row.
   * @private
   */
  getOverlayPartitionRecord(partitionId) {
    const overlay = this.routingMetadataOverlay;
    if (
      !overlay ||
      typeof overlay.getPartitionById !== QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      return null;
    }
    const partition = overlay.getPartitionById(partitionId);
    return partition &&
      typeof partition === QUERY_EXECUTOR_LITERAL.STRING_OBJECT
      ? partition
      : null;
  }

  /**
   * Resolve the canonical partition record for routing decisions.
   * Overlay metadata outranks cache metadata while transition routing is active.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null}
   * @private
   */
  getPartitionRecord(partitionId) {
    const overlayPartition = this.getOverlayPartitionRecord(partitionId);
    if (overlayPartition) {
      return overlayPartition;
    }
    if (!this.systemCache) {
      return null;
    }
    if (
      typeof this.systemCache.get === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      const record = this.systemCache.get(TABLES.PARTITIONS, partitionId);
      if (record) {
        return record;
      }
    }
    if (
      typeof this.systemCache.filter === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      const records = this.systemCache.filter(
        TABLES.PARTITIONS,
        (partition) => partition.partition_id === partitionId,
      );
      if (records.length > NUM.ZERO) {
        return records[NUM.ZERO];
      }
    }
    if (
      typeof this.systemCache.getAll === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      const records = this.systemCache.getAll(TABLES.PARTITIONS) || [];
      return (
        records.find((partition) => partition.partition_id === partitionId) ||
        null
      );
    }
    return null;
  }

  /**
   * Resolve the canonical leader node for one partition from owner metadata.
   * @param {string} partitionId - Partition ID.
   * @return {string|null}
   * @private
   */
  getPartitionLeaderNodeId(partitionId) {
    if (
      typeof this.bootstrapTopologySnapshotOwner
        ?.resolveCanonicalPartitionLeaderNodeId ===
      QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      const leaderNodeId =
        this.bootstrapTopologySnapshotOwner.resolveCanonicalPartitionLeaderNodeId(
          partitionId,
        );
      if (
        typeof leaderNodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
        leaderNodeId.length > NUM.ZERO
      ) {
        return leaderNodeId;
      }
    }
    const partition = this.getPartitionRecord(partitionId);
    const leaderNodeId =
      partition?.[COLUMN.LEADER_NODE_ID] ?? partition?.leaderNodeId ?? null;
    return typeof leaderNodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      leaderNodeId.length > NUM.ZERO
      ? leaderNodeId
      : null;
  }

  /**
   * Resolve a bootstrap-only leader fallback while the partition owner row is
   * still in its fresh-creation window and leader_node_id has not converged.
   * Steady-state writes still fail closed when canonical owner metadata is
   * absent or ambiguous.
   * @param {string} partitionId
   * @param {Object[]} services
   * @return {Object[]}
   * @private
   */
  getFreshBootstrapLeaderServices(partitionId, services) {
    if (
      typeof this.bootstrapTopologySnapshotOwner
        ?.getFreshBootstrapLeaderServices ===
      QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      const ownerServices =
        this.bootstrapTopologySnapshotOwner.getFreshBootstrapLeaderServices(
          partitionId,
          services,
        );
      if (Array.isArray(ownerServices) && ownerServices.length > NUM.ZERO) {
        return ownerServices;
      }
    }
    const partition = this.getPartitionRecord(partitionId);
    if (!this.isFreshPartitionBootstrapWindow(partition)) {
      return [];
    }
    const leaderSelection = resolveBootstrapLeaderSelection({
      services,
    });
    return leaderSelection.selectedService
      ? [leaderSelection.selectedService]
      : [];
  }

  /**
   * Identify the narrow bootstrap window where a partition has been created
   * but the canonical leader_node_id has not yet been persisted.
   * @param {Object|null} partition
   * @return {boolean}
   * @private
   */
  isFreshPartitionBootstrapWindow(partition) {
    if (
      typeof this.bootstrapTopologySnapshotOwner
        ?.isFreshPartitionBootstrapWindow ===
      QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      return this.bootstrapTopologySnapshotOwner.isFreshPartitionBootstrapWindow(
        partition,
      );
    }
    if (!partition || !this.isBootstrapRoutingGraceWindow(partition)) {
      return false;
    }
    const leaderNodeId =
      partition?.[COLUMN.LEADER_NODE_ID] ??
      partition?.leader_node_id ??
      partition?.leaderNodeId ??
      null;
    return (
      typeof leaderNodeId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      leaderNodeId.length === NUM.ZERO
    );
  }

  /**
   * Identify the short-lived partition bootstrap grace window before the
   * partition owner row is updated post-creation.
   * @param {Object|null} partition
   * @return {boolean}
   * @private
   */
  isBootstrapRoutingGraceWindow(partition) {
    if (
      typeof this.bootstrapTopologySnapshotOwner
        ?.isBootstrapRoutingGraceWindow ===
      QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      return this.bootstrapTopologySnapshotOwner.isBootstrapRoutingGraceWindow(
        partition,
      );
    }
    if (!partition) {
      return false;
    }
    const createdAt =
      partition?.[COLUMN.CREATED_AT] ??
      partition?.created_at ??
      partition?.createdAt ??
      null;
    const updatedAt =
      partition?.[COLUMN.UPDATED_AT] ??
      partition?.updated_at ??
      partition?.updatedAt ??
      null;
    return (
      Number.isFinite(createdAt) &&
      Number.isFinite(updatedAt) &&
      createdAt === updatedAt
    );
  }

  /**
   * Emit throttled diagnostics when canonical partition leader routing cannot
   * map owner metadata to a routable service.
   * @param {string} partitionId
   * @param {Object} options
   * @private
   */
  logCanonicalLeaderRoutingGap(partitionId, options = {}) {
    const reason = String(options.reason || LEADER_GAP_REASON_OWNER_MISSING);
    const warnKey = partitionId + ":" + reason;
    const now = Date.now();
    const lastWarnAt = this.canonicalLeaderWarnLastAt.get(warnKey);
    if (
      Number.isFinite(lastWarnAt) &&
      now - lastWarnAt < this.noServiceWarnThrottleMs
    ) {
      return;
    }
    this.canonicalLeaderWarnLastAt.set(warnKey, now);
    const services = Array.isArray(options.services) ? options.services : [];
    const routableNodeIds = [
      ...new Set(
        services
          .map((service) => service?.node_id)
          .filter(
            (nodeId) => typeof nodeId === "string" && nodeId.length > NUM.ZERO,
          ),
      ),
    ];
    const staleLeaderNodeIds = [
      ...new Set(
        services
          .filter((service) => service?.raft_role === RAFT_ROLE.LEADER)
          .map((service) => service?.node_id)
          .filter(
            (nodeId) => typeof nodeId === "string" && nodeId.length > NUM.ZERO,
          ),
      ),
    ];
    if (reason === LEADER_GAP_REASON_SERVICE_MISSING) {
      this.logger.warn(
        QUERY_LOG_MSG.CANONICAL_LEADER_SERVICE_MISSING_FOR_PARTITION,
        {
          partitionId,
          leaderNodeId: options.canonicalLeaderNodeId || null,
          routableNodeIds,
          staleLeaderNodeIds,
          routingSnapshot: this.summarizePartitionRoutingSnapshot(
            options.routingSnapshot,
          ),
        },
      );
      return;
    }
    this.logger.warn(
      QUERY_LOG_MSG.CANONICAL_LEADER_METADATA_MISSING_FOR_PARTITION,
      {
        partitionId,
        routableNodeIds,
        staleLeaderNodeIds,
        routingSnapshot: this.summarizePartitionRoutingSnapshot(
          options.routingSnapshot,
        ),
      },
    );
  }

  /**
   * Resolve overlay services for a partition.
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Overlay service rows.
   * @private
   */
  getOverlayPartitionServices(partitionId) {
    const overlay = this.routingMetadataOverlay;
    if (
      !overlay ||
      typeof overlay.getServicesForPartition !==
        QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      return [];
    }
    const services = overlay.getServicesForPartition(partitionId);
    return Array.isArray(services) ? services : [];
  }

  /**
   * Aggregate SELECT results from multiple partitions.
   * Properly handles cross-partition aggregation for COUNT, SUM, AVG, MIN, MAX.
   * Requirements: 22.3, 22.6, 22.7
   * @param {Array} results - Partition results.
   * @param {Object} ast - Parsed SELECT AST.
   * @return {Object} Aggregated result.
   * @private
   */
}

export { QueryExecutorSegment3 };
