import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {
  classifySystemPartition,
} from '../bootstrap/system-partition-classification.js';
import {QueryExecutorCancellationRouting} from './query-executor-cancellation-routing-install.js';
import {installQueryExecutorSelectAggregationHelpers} from './query-executor-select-aggregation.js';
import {installQueryExecutorSqlCommandHelpers} from './query-executor-sql-command-rendering.js';
import {
  isPriorityRecoveryWriteRouting,
  shouldAllowPriorityRecoveryBootstrapRoutingGrace,
} from './query-executor-priority-recovery-bootstrap-routing.js';
import {isReadinessInternalRouteStructurallyReady} from
  './query-executor-bootstrap-deferred-routing.js';
const {
  COLUMN,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READ_PURPOSE,
  CONTROL_PLANE_READINESS_DIMENSION,
  LEADER_GAP_REASON_OWNER_MISSING,
  LEADER_GAP_REASON_SERVICE_MISSING,
  QUERY_EXECUTOR_LITERAL,
  QUERY_EXECUTOR_ROUTING_OPTION_FIELD,
  QUERY_LOG_MSG,
  QUERY_ROUTING_DIAGNOSTIC_REASON,
  RAFT_ROLE,
  READINESS_SNAPSHOT_KEY,
  SERVICE_STATUS,
  TABLES,
  compactEligibilitySnapshot,
  evaluateEligibilityDecision,
  resolveBootstrapLeaderSelection,
  resolveCanonicalPartitionLeaderObservation,
} = QUERY_EXECUTOR_SHARED;

const PRIORITY_CONTROL_PLANE_CONNECTED_STATE = 'connected';

class QueryExecutorPartitionServiceResolution extends QueryExecutorCancellationRouting {
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
      service.address.length === 0
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
    return candidates[0] || null;
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
      service.address.length === 0
    ) {
      routabilityResult = {
        routable: false,
        reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.SERVICE_ADDRESS_MISSING,
        readinessSummary: null,
      };
    } else if (
      routingOptions?.[
        QUERY_EXECUTOR_ROUTING_OPTION_FIELD.READ_AUTHORITY
      ]?.purpose ===
        CONTROL_PLANE_READ_PURPOSE.READINESS_INTERNAL
    ) {
      routabilityResult = this.evaluateReadinessInternalRoutability(service);
    }
    if (routabilityResult) {
      return routabilityResult;
    }
    const nodeId = service?.node_id || service?.nodeId || null;
    const partitionId = String(
      service?.partition_id || service?.partitionId || '',
    );
    const partitionRow =
      partitionId.length > 0 ?
        this.getPartitionRecord(partitionId) :
        null;
    const priorityControlPlanePartition = classifySystemPartition({
      partitionId,
      partitionRow,
    }).priorityControlPlane;
    const priorityRecoveryWriteRouting =
      isPriorityRecoveryWriteRouting({
        partitionId,
        partitionRow,
        routingReadinessDimension,
        routingOptions,
      });
    const priorityRecoveryReadRouting =
      priorityControlPlanePartition &&
      routingReadinessDimension ===
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE &&
      routingOptions?.[QUERY_EXECUTOR_ROUTING_OPTION_FIELD.FOR_READ] === true;
    if (
      nodeId &&
      nodeId !== this.nodeId &&
      priorityControlPlanePartition &&
      !priorityRecoveryWriteRouting &&
      !priorityRecoveryReadRouting &&
      typeof this.messageRouter?.getConnectionState ===
        QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      const connectionState = this.messageRouter.getConnectionState(nodeId);
      if (
        connectionState &&
        connectionState !== PRIORITY_CONTROL_PLANE_CONNECTED_STATE
      ) {
        return {
          routable: false,
          reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.NODE_NOT_ELIGIBLE,
          readinessSummary: null,
        };
      }
    }
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
    const tableName =
      String(
        partitionRow?.table_name ||
          partitionRow?.tableName ||
          partitionRow?.table_id ||
          partitionRow?.tableId ||
          '',
      ) || null;
    let evaluation;
    if (
      typeof this.controlPlaneReadinessService
        .getControlPlaneParticipationSync ===
      QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      const participationKind =
        routingReadinessDimension ===
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE ?
          CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY :
          CONTROL_PLANE_PARTICIPATION_KIND.ROUTED_READ;
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
          failedDimensions: Array.isArray(participation?.failedDimensions) ?
            participation.failedDimensions :
            Object.freeze([]),
          reasonCodes: Array.isArray(participation?.reasonCodes) ?
            participation.reasonCodes :
            Object.freeze([]),
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
    const priorityRecoveryBootstrapRoutable =
      decision?.eligible !== true &&
      shouldAllowPriorityRecoveryBootstrapRoutingGrace({
        partitionId,
        partitionRow,
        routingReadinessDimension,
        routingOptions,
        readiness,
        decision,
      });
    const routable =
      decision.eligible === true ||
      bootstrapGraceRoutable ||
      priorityRecoveryBootstrapRoutable;
    return {
      routable,
      reasonCode:
        routable ?
          QUERY_ROUTING_DIAGNOSTIC_REASON.OK :
          QUERY_ROUTING_DIAGNOSTIC_REASON.NODE_NOT_ELIGIBLE,
      readinessSummary: compactSnapshot ?
        {
          decisionDimension:
              compactSnapshot.decisionDimension || routingReadinessDimension,
          observedAt: compactSnapshot.observedAt || null,
          lifecycleState: compactSnapshot.lifecycleState || null,
          reasonCodes: compactSnapshot.reasonCodes || Object.freeze([]),
          failedDimensions: decision.failedDimensions || Object.freeze([]),
          [READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY]:
            compactSnapshot[READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY] || null,
          [READINESS_SNAPSHOT_KEY.PROJECTION_READINESS_CONTRACT]:
            compactSnapshot[
              READINESS_SNAPSHOT_KEY.PROJECTION_READINESS_CONTRACT
            ] || null,
        } :
        null,
    };
  }

  /**
   * Evaluate the structural route used by readiness-owned authoritative reads.
   * This deliberately checks addressing and transport only; calling full
   * readiness here would recreate the formation dependency cycle.
   * @param {Object} service
   * @return {Object}
   * @private
   */
  evaluateReadinessInternalRoutability(service) {
    const structurallyReady = isReadinessInternalRouteStructurallyReady({
      service,
      messageRouter: this.messageRouter,
    });
    return {
      routable: structurallyReady,
      reasonCode: structurallyReady ?
        QUERY_ROUTING_DIAGNOSTIC_REASON.OK :
        QUERY_ROUTING_DIAGNOSTIC_REASON.NODE_NOT_ELIGIBLE,
      readinessSummary: null,
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
      service?.partition_id || service?.partitionId || '',
    );
    if (partitionId.length === 0) {
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
      CONTROL_PLANE_READINESS_DIMENSION.PROVISIONING_ELIGIBLE,
      CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
      CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE,
    ]);
    const failedDimensions = Array.isArray(decision?.failedDimensions) ?
      decision.failedDimensions :
      [];
    return (
      failedDimensions.length > 0 &&
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
      typeof partition === QUERY_EXECUTOR_LITERAL.STRING_OBJECT ?
      partition :
      null;
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
      if (records.length > 0) {
        return records[0];
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
        leaderNodeId.length > 0
      ) {
        return leaderNodeId;
      }
    }
    const partition = this.getPartitionRecord(partitionId);
    const leaderNodeId =
      partition?.[COLUMN.LEADER_NODE_ID] ?? partition?.leaderNodeId ?? null;
    return typeof leaderNodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      leaderNodeId.length > 0 ?
      leaderNodeId :
      null;
  }

  getCanonicalPartitionLeaderRoutingState(partitionId, serviceRows = null) {
    const partitionRow = this.getPartitionRecord(partitionId);
    const canonicalLeaderIdentity = this.resolveCanonicalPartitionLeaderIdentity(
      partitionId,
      serviceRows,
      partitionRow,
    );
    const canonicalLeaderObservation =
      resolveCanonicalPartitionLeaderObservation({
        identitySnapshot: canonicalLeaderIdentity,
        partition: partitionRow,
        partitionPresent:
          partitionRow &&
          typeof partitionRow === QUERY_EXECUTOR_LITERAL.STRING_OBJECT,
        serviceRows,
      });
    const canonicalLeaderNodeId =
      typeof canonicalLeaderObservation?.leaderNodeId ===
        QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      canonicalLeaderObservation.leaderNodeId.length > 0 ?
        canonicalLeaderObservation.leaderNodeId :
        null;
    return Object.freeze({
      partitionRow,
      canonicalLeaderIdentity,
      canonicalLeaderObservation,
      canonicalLeaderNodeId,
    });
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
      if (Array.isArray(ownerServices) && ownerServices.length > 0) {
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
    return leaderSelection.selectedService ?
      [leaderSelection.selectedService] :
      [];
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
      leaderNodeId.length === 0
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
    const warnKey = partitionId + ':' + reason;
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
            (nodeId) => typeof nodeId === 'string' && nodeId.length > 0,
          ),
      ),
    ];
    const staleLeaderNodeIds = [
      ...new Set(
        services
          .filter((service) => service?.raft_role === RAFT_ROLE.LEADER)
          .map((service) => service?.node_id)
          .filter(
            (nodeId) => typeof nodeId === 'string' && nodeId.length > 0,
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
   * Resolve whether overlay state suppresses cached service rows for one
   * partition.
   * @param {string} partitionId
   * @return {boolean}
   * @private
   */
  shouldOverlayMaskCacheServices(partitionId) {
    const overlay = this.routingMetadataOverlay;
    if (
      !overlay ||
      typeof overlay.shouldMaskCacheServicesForPartition !==
        QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      return false;
    }
    return overlay.shouldMaskCacheServicesForPartition(partitionId) === true;
  }
}

installQueryExecutorSelectAggregationHelpers(
  QueryExecutorPartitionServiceResolution,
);
installQueryExecutorSqlCommandHelpers(
  QueryExecutorPartitionServiceResolution,
);

export {QueryExecutorPartitionServiceResolution};
