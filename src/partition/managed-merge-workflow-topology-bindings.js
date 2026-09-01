const LOCAL_STR_FUNCTION = 'function';

const DEFAULT_QUORUM_REPLICA_COUNT = 1;

/**
 * Topology-adapter method bindings resolved in constructor order:
 * bound adapter method, then explicit option, then the listed fallback.
 * Mirrors the split workflow's dedicated bindings module so the two
 * workflow owners keep the same shape.
 * @type {ReadonlyArray<{property: string, fallback: Function}>}
 */
const TOPOLOGY_BOUND_METHOD_SPECS = Object.freeze([
  {property: 'getPartitionInfo', fallback: () => null},
  {property: 'getTableInfo', fallback: () => null},
  {property: 'listTableInfos', fallback: () => []},
  {property: 'parsePartitionTransition', fallback: () => null},
  {property: 'isLocalManagedMergeLeader', fallback: () => false},
  {property: 'resolveActivePartitionVersion', fallback: () => 1},
  {property: 'resolveProvisionTargetNodeIds', fallback: () => []},
  {property: 'getRoutablePartitionServiceNodeIds', fallback: () => []},
  {property: 'isSystemTablePartitionId', fallback: () => false},
  {
    property: 'calculateQuorumReplicaCount',
    fallback: () => DEFAULT_QUORUM_REPLICA_COUNT,
  },
  {property: 'createExecutionTimeoutBudget', fallback: null},
  {property: 'waitForTablePartitionMetadata', fallback: async () => {}},
  {property: 'probeInitialTablePartitionProvisioning', fallback: null},
  {property: 'provisionInitialTablePartition', fallback: async () => {}},
  {property: 'startMergeReplicationOnSourcePartition',
    fallback: async () => {}},
  {property: 'listTablePartitionRows', fallback: () => []},
  {property: 'listPartitionServiceRows', fallback: () => []},
  {property: 'deliverReplicaRemoval', fallback: async () => null},
]);

/**
 * Bind a topology adapter method when the adapter provides it.
 * @param {?Object} topologyAdapter - Wired topology adapter, when present.
 * @param {string} methodName - Adapter method name to bind.
 * @return {?Function} Bound adapter method, or null when absent.
 */
function bindTopologyMethod(topologyAdapter, methodName) {
  if (!topologyAdapter ||
      typeof topologyAdapter[methodName] !== LOCAL_STR_FUNCTION) {
    return null;
  }
  return topologyAdapter[methodName].bind(topologyAdapter);
}

export {
  TOPOLOGY_BOUND_METHOD_SPECS,
  bindTopologyMethod,
};
