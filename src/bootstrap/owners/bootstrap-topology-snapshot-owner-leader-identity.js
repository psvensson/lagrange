import {
  COLUMN,
  NUM,
  TABLES,
  TYPEOF,
} from '../../constants/index.js';
import {RAFT_ROLE} from '../../raft/constants.js';
import {
  resolveCanonicalLeaderIdentitySnapshot,
} from '../../query/canonical-leader-routing.js';
import {
  BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_STABILIZATION_STATE,
  readBootstrapTopologySnapshotPartitionLeaderNodeId,
  readBootstrapTopologySnapshotServicePartitionId,
} from './bootstrap-topology-snapshot-owner-contract.js';

function resolveCanonicalPartitionLeaderIdentity(
  partitionId,
  serviceRows = [],
) {
  const rawAuthoritativeRow =
    this.getLatestObservedBootstrapPartitionSnapshotRow(partitionId);
  const publishedAuthoritativeRow =
    this.getPublishedBootstrapPartitionSnapshotRow(partitionId);
  const authoritativeRow =
    publishedAuthoritativeRow ||
    rawAuthoritativeRow;
  const cacheRow = this.resolvePartitionOwnerStabilizationCacheRow({
    cacheRow: this.getCachedPartitionRow(partitionId),
    retainedSnapshotRow:
      this.getRetainedBootstrapPartitionSnapshotRow(partitionId),
  });
  const resolvedServiceRows =
    Array.isArray(serviceRows) && serviceRows.length > NUM.ZERO ?
      serviceRows :
      this.getPublishedBootstrapAuthoritativeTableRows(TABLES.SERVICES)
        .filter((serviceRow) => {
          return readBootstrapTopologySnapshotServicePartitionId(serviceRow) ===
            partitionId;
        });
  const stabilization =
    this.resolvePartitionOwnerFieldStabilization({
      authoritativeRow,
      cacheRow,
      serviceRows: resolvedServiceRows,
    });
  const stabilizedLeaderNodeId =
    readBootstrapTopologySnapshotPartitionLeaderNodeId(
      stabilization.row,
    );
  const identity = resolveCanonicalLeaderIdentitySnapshot({
    partition: authoritativeRow || rawAuthoritativeRow,
    partitionPresent:
      authoritativeRow !== null || cacheRow !== null,
    ownerLeaderNodeId:
      stabilization.state ===
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_STABILIZATION_STATE.AUTHORITATIVE ?
        stabilizedLeaderNodeId :
        null,
    retainedLeaderNodeId:
      stabilization.state ===
        BOOTSTRAP_TOPOLOGY_SNAPSHOT_ROW_STABILIZATION_STATE
          .RETAINED_CACHE_OWNER ?
        stabilizedLeaderNodeId :
        null,
    serviceRows: resolvedServiceRows,
  });
  return Object.freeze({
    ...identity,
    bootstrapLeaderStabilizationState: stabilization.state,
  });
}

function resolveCanonicalPartitionLeaderNodeId(partitionId) {
  return this.resolveCanonicalPartitionLeaderIdentity(
    partitionId,
  ).leaderNodeId;
}

function isBootstrapRoutingGraceWindow(partition) {
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
  return Number.isFinite(createdAt) &&
    Number.isFinite(updatedAt) &&
    createdAt === updatedAt;
}

function isFreshPartitionBootstrapWindow(partitionOrId) {
  const partition =
    partitionOrId && typeof partitionOrId === TYPEOF.OBJECT ?
      partitionOrId :
      this.getPublishedBootstrapPartitionSnapshotRow(partitionOrId);
  if (!this.isBootstrapRoutingGraceWindow(partition)) {
    return false;
  }
  return this.resolveCanonicalPartitionLeaderNodeId(
    partition?.[COLUMN.PARTITION_ID] ??
    partition?.partition_id ??
    partition?.partitionId ??
    null,
  ) === null;
}

function getFreshBootstrapLeaderServices(partitionId, services = []) {
  const partition =
    this.getPublishedBootstrapPartitionSnapshotRow(partitionId);
  if (!this.isFreshPartitionBootstrapWindow(partition)) {
    return [];
  }

  const leaderServices = services.filter((service) =>
    String(service?.raft_role || '').toLowerCase() ===
      String(RAFT_ROLE.LEADER).toLowerCase(),
  );
  if (leaderServices.length === NUM.ONE) {
    return leaderServices;
  }

  return services.length === NUM.ONE ? [services[NUM.ZERO]] : [];
}

export {
  getFreshBootstrapLeaderServices,
  isBootstrapRoutingGraceWindow,
  isFreshPartitionBootstrapWindow,
  resolveCanonicalPartitionLeaderIdentity,
  resolveCanonicalPartitionLeaderNodeId,
};
