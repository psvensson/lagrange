import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {QueryExecutorPartitionDelivery} from './query-executor-partition-delivery.js';

const {
  CANONICAL_LEADER_IDENTITY_STATE,
  CANONICAL_LEADER_ROUTING_GAP_STATE,
  COLUMN,
  CONTROL_PLANE_READINESS_DIMENSION,
  QUERY_EXECUTOR_LITERAL,
  SERVICE_STATUS,
  SYSTEM_TABLE_NAMES,
  isPriorityControlPlanePartition,
  resolveCanonicalLeaderIdentitySnapshot,
  resolveCanonicalLeaderRoutingGapState,
} = QUERY_EXECUTOR_SHARED;

class QueryExecutorCanonicalLeaderRoutingMethods
  extends QueryExecutorPartitionDelivery {
  resolveCanonicalPartitionLeaderIdentity(
    partitionId,
    serviceRows = null,
    partitionRow = null,
  ) {
    const resolvedPartitionRow = partitionRow || this.getPartitionRecord(partitionId);
    const resolvedServiceRows =
      Array.isArray(serviceRows) ?
        serviceRows :
        this.getPartitionServiceRows(partitionId);
    if (
      typeof this.bootstrapTopologySnapshotOwner
        ?.resolveCanonicalPartitionLeaderIdentity ===
      QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      const ownerIdentity =
        this.bootstrapTopologySnapshotOwner.resolveCanonicalPartitionLeaderIdentity(
          partitionId,
          resolvedServiceRows,
        );
      if (
        ownerIdentity &&
        typeof ownerIdentity === QUERY_EXECUTOR_LITERAL.STRING_OBJECT
      ) {
        return ownerIdentity;
      }
    }
    const bootstrapOwnerLeaderNodeId =
      this.resolveBootstrapCanonicalLeaderNodeId(partitionId);
    const retainedLeaderNodeId =
      bootstrapOwnerLeaderNodeId === null ?
        this.resolveRetainedCanonicalLeaderNodeId(
          partitionId,
          resolvedPartitionRow,
          resolvedServiceRows,
        ) :
        null;
    const identity = resolveCanonicalLeaderIdentitySnapshot({
      partition: resolvedPartitionRow,
      partitionPresent:
        resolvedPartitionRow &&
        typeof resolvedPartitionRow === QUERY_EXECUTOR_LITERAL.STRING_OBJECT,
      ownerLeaderNodeId: bootstrapOwnerLeaderNodeId,
      retainedLeaderNodeId,
      serviceRows: resolvedServiceRows,
    });
    this.rememberCanonicalLeaderIdentity(
      partitionId,
      resolvedPartitionRow,
      resolvedServiceRows,
      identity,
    );
    return identity;
  }

  resolveBootstrapCanonicalLeaderNodeId(partitionId) {
    if (
      typeof this.bootstrapTopologySnapshotOwner
        ?.resolveCanonicalPartitionLeaderNodeId !==
      QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      return null;
    }
    const leaderNodeId =
      this.bootstrapTopologySnapshotOwner.resolveCanonicalPartitionLeaderNodeId(
        partitionId,
      );
    return typeof leaderNodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      leaderNodeId.length > 0 ?
      leaderNodeId :
      null;
  }

  shouldRetainCanonicalLeaderIdentity(partitionId, partitionRow = null) {
    return isPriorityControlPlanePartition({
      partitionId,
      partitionRow,
    });
  }

  hasActiveCanonicalLeaderService(serviceRows = [], leaderNodeId = null) {
    if (
      typeof leaderNodeId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      leaderNodeId.length === 0
    ) {
      return false;
    }
    return (Array.isArray(serviceRows) ? serviceRows : []).some((service) => {
      const serviceNodeId =
        service?.[COLUMN.NODE_ID] ??
        service?.node_id ??
        service?.nodeId ??
        null;
      const serviceStatus =
        service?.[COLUMN.STATUS] ??
        service?.status ??
        null;
      return serviceNodeId === leaderNodeId &&
        serviceStatus === SERVICE_STATUS.ACTIVE;
    });
  }

  resolveRetainedCanonicalLeaderNodeId(
    partitionId,
    partitionRow = null,
    serviceRows = [],
  ) {
    if (!this.shouldRetainCanonicalLeaderIdentity(partitionId, partitionRow)) {
      this.retainedCanonicalLeaderNodeIdsByPartition.delete(partitionId);
      return null;
    }
    const retainedLeaderNodeId =
      this.retainedCanonicalLeaderNodeIdsByPartition.get(partitionId);
    if (
      typeof retainedLeaderNodeId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      retainedLeaderNodeId.length === 0
    ) {
      return null;
    }
    if (
      this.hasActiveCanonicalLeaderService(serviceRows, retainedLeaderNodeId)
    ) {
      return retainedLeaderNodeId;
    }
    this.retainedCanonicalLeaderNodeIdsByPartition.delete(partitionId);
    return null;
  }

  rememberCanonicalLeaderIdentity(
    partitionId,
    partitionRow = null,
    serviceRows = [],
    identity = null,
  ) {
    if (!this.shouldRetainCanonicalLeaderIdentity(partitionId, partitionRow)) {
      this.retainedCanonicalLeaderNodeIdsByPartition.delete(partitionId);
      return;
    }
    if (
      identity?.state !== CANONICAL_LEADER_IDENTITY_STATE.OWNER_CONFIRMED ||
      typeof identity?.leaderNodeId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      identity.leaderNodeId.length === 0
    ) {
      return;
    }
    if (!this.hasActiveCanonicalLeaderService(serviceRows, identity.leaderNodeId)) {
      return;
    }
    this.retainedCanonicalLeaderNodeIdsByPartition.set(
      partitionId,
      identity.leaderNodeId,
    );
  }

  resolveCanonicalLeaderGapRecoveryRoutingContract(
    partitionId,
    routingSnapshot = null,
    routingReadinessDimension = this.defaultRoutingReadinessDimension,
    allowReadinessAuthoritativeRefresh = false,
  ) {
    const resolvedPartitionId =
      typeof partitionId === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      partitionId.length > 0 ?
        partitionId :
        routingSnapshot?.partitionId || null;
    const resolvedRoutingReadinessDimension =
      typeof routingReadinessDimension === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      routingReadinessDimension.length > 0 ?
        routingReadinessDimension :
        this.defaultRoutingReadinessDimension;
    const resolvedRoutingSnapshot =
      routingSnapshot && typeof routingSnapshot ===
        QUERY_EXECUTOR_LITERAL.STRING_OBJECT ?
        routingSnapshot :
        resolvedPartitionId ?
          this.getPartitionRoutingSnapshot(
            resolvedPartitionId,
            resolvedRoutingReadinessDimension,
            {
              allowReadinessAuthoritativeRefresh,
            },
          ) :
          null;
    const canonicalLeaderRoutingGapState =
      resolveCanonicalLeaderRoutingGapState(resolvedRoutingSnapshot);
    const partitionRow =
      resolvedPartitionId !== null ?
        this.getPartitionRecord(resolvedPartitionId) :
        null;
    const priorityRecoveryRouting =
      resolvedRoutingReadinessDimension ===
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE &&
      isPriorityControlPlanePartition({
        partitionId: resolvedPartitionId,
        partitionRow,
      }) &&
      Number(resolvedRoutingSnapshot?.routableServiceCount) > 0;
    const partitionTableName =
      resolvedPartitionId !== null ?
        this.resolvePartitionTableName(resolvedPartitionId) :
        null;
    const systemTableRecoveryRouting =
      resolvedRoutingReadinessDimension ===
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE &&
      SYSTEM_TABLE_NAMES.has(
        String(partitionTableName || QUERY_EXECUTOR_LITERAL.STRING_VALUE),
      ) &&
      Number(resolvedRoutingSnapshot?.routableServiceCount) > 0;
    const canonicalLeaderNodeId =
      typeof resolvedRoutingSnapshot?.canonicalLeaderNodeId ===
        QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      resolvedRoutingSnapshot.canonicalLeaderNodeId.length > 0 ?
        resolvedRoutingSnapshot.canonicalLeaderNodeId :
        null;
    const deniedByNodeId =
      resolvedRoutingSnapshot?.deniedByNodeId &&
      typeof resolvedRoutingSnapshot.deniedByNodeId ===
        QUERY_EXECUTOR_LITERAL.STRING_OBJECT ?
        resolvedRoutingSnapshot.deniedByNodeId :
        Object.freeze({});
    const routableServices =
      Array.isArray(resolvedRoutingSnapshot?.routableServices) ?
        resolvedRoutingSnapshot.routableServices :
        [];
    const routableCanonicalLeaderServiceCount = canonicalLeaderNodeId === null ?
      0 :
      routableServices.filter(
        (service) => service?.node_id === canonicalLeaderNodeId,
      ).length;
    const canonicalLeaderFilteredByReadiness =
      canonicalLeaderNodeId !== null &&
      Number(resolvedRoutingSnapshot?.canonicalLeaderServiceCount) > 0 &&
      Number(resolvedRoutingSnapshot?.routableServiceCount) > 0 &&
      (
        Boolean(deniedByNodeId[canonicalLeaderNodeId]) ||
        routableCanonicalLeaderServiceCount === 0
      );
    const preferDifferentNodeAfterRuntimeWitness = priorityRecoveryRouting;
    const systemTableRecoveryServiceGap =
      systemTableRecoveryRouting &&
      canonicalLeaderRoutingGapState ===
        CANONICAL_LEADER_ROUTING_GAP_STATE.SERVICE_MISSING;
    const priorityRecoveryOwnerGap =
      priorityRecoveryRouting &&
      canonicalLeaderRoutingGapState ===
        CANONICAL_LEADER_ROUTING_GAP_STATE.OWNER_MISSING;
    const recoveryCandidateWidening =
      systemTableRecoveryServiceGap ||
      priorityRecoveryOwnerGap ||
      (
        priorityRecoveryRouting &&
        canonicalLeaderFilteredByReadiness
      );
    return Object.freeze({
      partitionId: resolvedPartitionId,
      routingReadinessDimension: resolvedRoutingReadinessDimension,
      canonicalLeaderRoutingGapState,
      canonicalLeaderFilteredByReadiness,
      priorityRecoveryRouting,
      preferDifferentNodeAfterRuntimeWitness,
      recoveryCandidateWidening,
    });
  }
}

export {QueryExecutorCanonicalLeaderRoutingMethods};
