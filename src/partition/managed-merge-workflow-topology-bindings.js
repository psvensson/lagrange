const LOCAL_STR_FUNCTION = 'function';
const SPEC_DEFAULT_KEY = 'fallback';
const MISSING_TOPOLOGY_BINDING_PREFIX =
  'ManagedMergeWorkflow requires topology binding: ';

function requiredTopologyBinding(property) {
  const spec = {property};
  Object.defineProperty(spec, SPEC_DEFAULT_KEY, {
    enumerable: true,
    get() {
      throw new TypeError(`${MISSING_TOPOLOGY_BINDING_PREFIX}${property}`);
    },
  });
  return Object.freeze(spec);
}

/**
 * Topology-adapter method bindings resolved in constructor order:
 * bound adapter method, then explicit option, then the listed default for
 * optional read/hook collaborators. Required effect, quorum, and membership
 * collaborators fail closed at binding time when omitted.
 * @type {ReadonlyArray<{property: string, fallback: Function|null}>}
 */
const TOPOLOGY_BOUND_METHOD_SPECS = Object.freeze([
  {property: 'getPartitionInfo', fallback: () => null},
  {property: 'getTableInfo', fallback: () => null},
  {property: 'listTableInfos', fallback: () => []},
  {property: 'parsePartitionTransition', fallback: () => null},
  {property: 'isLocalManagedMergeLeader', fallback: () => false},
  {property: 'resolveActivePartitionVersion', fallback: () => 1},
  requiredTopologyBinding('resolveProvisionTargetNodeIds'),
  requiredTopologyBinding('getRoutablePartitionServiceNodeIds'),
  {property: 'isSystemTablePartitionId', fallback: () => false},
  requiredTopologyBinding('calculateQuorumReplicaCount'),
  {property: 'createExecutionTimeoutBudget', fallback: null},
  requiredTopologyBinding('waitForTablePartitionMetadata'),
  {property: 'probeInitialTablePartitionProvisioning', fallback: null},
  requiredTopologyBinding('provisionInitialTablePartition'),
  requiredTopologyBinding('startMergeReplicationOnSourcePartition'),
  requiredTopologyBinding('listTablePartitionRows'),
  requiredTopologyBinding('listPartitionServiceRows'),
  requiredTopologyBinding('deliverReplicaRemoval'),
  requiredTopologyBinding('readCommittedGroupMembers'),
  {property: 'observeSystemRows', fallback: () => null},
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
