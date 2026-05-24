import {
  hasActivePartitionServiceOnNode,
  isAuthoritativeSnapshotRowNewer,
  mergeAuthoritativeSystemTableRowSets,
  queryLocalAuthoritativePartitionRowSets,
  resolveAuthoritativeSystemTableSnapshotRows,
  resolvePartitionOwnerFieldStabilization,
  resolvePartitionOwnerStabilizationCacheRow,
  resolvePublishedAuthoritativeSystemTableSnapshotRows,
  resolveRetainablePartitionLeaderServices,
  shouldRetainCachedPartitionOwner,
  stabilizeAuthoritativeSystemTableSnapshotRows,
} from './bootstrap-topology-snapshot-owner-authoritative-rows.js';
import {
  getFreshBootstrapLeaderServices,
  isBootstrapRoutingGraceWindow,
  isFreshPartitionBootstrapWindow,
  resolveCanonicalPartitionLeaderIdentity,
  resolveCanonicalPartitionLeaderNodeId,
} from './bootstrap-topology-snapshot-owner-leader-identity.js';
import {
  buildBootstrapResponseTopologySnapshotEnvelope,
  buildBootstrapTopologySnapshotEnvelope,
  buildSystemTableSnapshots,
  cacheAuthoritativeSystemTableSnapshotRows,
  getBootstrapAuthoritativeTableRows,
  getBootstrapPartitionSnapshotRow,
  getBootstrapRawAuthoritativePartitionSnapshotRow,
  getCachedPartitionRow,
  getLatencyTopologyHints,
  getLatestObservedBootstrapPartitionSnapshotRow,
  getPublishedBootstrapAuthoritativeTableRows,
  getPublishedBootstrapPartitionSnapshotRow,
  getRetainedAuthoritativePartitionSnapshotRow,
  getRetainedBootstrapPartitionSnapshotRow,
  invalidateAuthoritativeSystemTableSnapshotRows,
  readCachedAuthoritativeSystemTableSnapshotEntry,
  readCachedAuthoritativeSystemTableSnapshotRows,
  readCachedRawAuthoritativeSystemTableSnapshotRows,
  readLatestObservedAuthoritativeSystemTableSnapshotRows,
  readObservedAuthoritativeSystemTableSnapshotEntry,
  readObservedAuthoritativeSystemTableSnapshotRows,
  readObservedRawAuthoritativeSystemTableSnapshotRows,
  readPublishedAuthoritativeSystemTableSnapshotEntry,
  readPublishedAuthoritativeSystemTableSnapshotRows,
  readRetainedAuthoritativeSystemTableSnapshotRows,
  resolveBootstrapResponseTopologySnapshotRows,
  resolveBootstrapTopologySnapshotActiveNodeIds,
  resolveBootstrapTopologySnapshotEpoch,
  resolveBootstrapTopologySnapshotMeta,
} from './bootstrap-topology-snapshot-owner-published-views.js';

const BOOTSTRAP_TOPOLOGY_SNAPSHOT_OWNER_METHODS = Object.freeze({
  buildBootstrapResponseTopologySnapshotEnvelope,
  buildBootstrapTopologySnapshotEnvelope,
  buildSystemTableSnapshots,
  cacheAuthoritativeSystemTableSnapshotRows,
  getBootstrapAuthoritativeTableRows,
  getBootstrapPartitionSnapshotRow,
  getBootstrapRawAuthoritativePartitionSnapshotRow,
  getCachedPartitionRow,
  getFreshBootstrapLeaderServices,
  getLatencyTopologyHints,
  getLatestObservedBootstrapPartitionSnapshotRow,
  getPublishedBootstrapAuthoritativeTableRows,
  getPublishedBootstrapPartitionSnapshotRow,
  getRetainedAuthoritativePartitionSnapshotRow,
  getRetainedBootstrapPartitionSnapshotRow,
  hasActivePartitionServiceOnNode,
  invalidateAuthoritativeSystemTableSnapshotRows,
  isAuthoritativeSnapshotRowNewer,
  isBootstrapRoutingGraceWindow,
  isFreshPartitionBootstrapWindow,
  mergeAuthoritativeSystemTableRowSets,
  queryLocalAuthoritativePartitionRowSets,
  readCachedAuthoritativeSystemTableSnapshotEntry,
  readCachedAuthoritativeSystemTableSnapshotRows,
  readCachedRawAuthoritativeSystemTableSnapshotRows,
  readLatestObservedAuthoritativeSystemTableSnapshotRows,
  readObservedAuthoritativeSystemTableSnapshotEntry,
  readObservedAuthoritativeSystemTableSnapshotRows,
  readObservedRawAuthoritativeSystemTableSnapshotRows,
  readPublishedAuthoritativeSystemTableSnapshotEntry,
  readPublishedAuthoritativeSystemTableSnapshotRows,
  readRetainedAuthoritativeSystemTableSnapshotRows,
  resolveAuthoritativeSystemTableSnapshotRows,
  resolveBootstrapResponseTopologySnapshotRows,
  resolveBootstrapTopologySnapshotActiveNodeIds,
  resolveBootstrapTopologySnapshotEpoch,
  resolveBootstrapTopologySnapshotMeta,
  resolveCanonicalPartitionLeaderIdentity,
  resolveCanonicalPartitionLeaderNodeId,
  resolvePartitionOwnerFieldStabilization,
  resolvePartitionOwnerStabilizationCacheRow,
  resolvePublishedAuthoritativeSystemTableSnapshotRows,
  resolveRetainablePartitionLeaderServices,
  shouldRetainCachedPartitionOwner,
  stabilizeAuthoritativeSystemTableSnapshotRows,
});

function buildBootstrapTopologySnapshotOwnerMethodDescriptors() {
  return Object.fromEntries(
    Object.entries(BOOTSTRAP_TOPOLOGY_SNAPSHOT_OWNER_METHODS)
      .map(([methodName, method]) => [
        methodName,
        {
          value: method,
          writable: true,
          configurable: true,
        },
      ]),
  );
}

function defineBootstrapTopologySnapshotOwnerMethods(OwnerClass) {
  Object.defineProperties(
    OwnerClass.prototype,
    buildBootstrapTopologySnapshotOwnerMethodDescriptors(),
  );
}

export {
  defineBootstrapTopologySnapshotOwnerMethods,
};
