import {NUM} from '../constants/index.js';
import {REPLICA_RECOVERY_NUM} from './replica-recovery-constants.js';

/**
 * Sort nodes by load, preferring less loaded nodes.
 * @param {Array<Object>} nodes - Nodes to sort.
 * @return {Array<Object>} Sorted nodes.
 */
function sortReplicaRecoveryNodesByLoad(nodes) {
  return [...nodes].sort((a, b) => {
    const loadA = (a.cpu_usage_percent || NUM.ZERO) +
      (a.memory_usage_percent || NUM.ZERO) +
      (a.disk_usage_percent || NUM.ZERO);
    const loadB = (b.cpu_usage_percent || NUM.ZERO) +
      (b.memory_usage_percent || NUM.ZERO) +
      (b.disk_usage_percent || NUM.ZERO);
    return loadA - loadB;
  });
}

/**
 * Select target nodes for replica placement.
 * @param {Array<Object>} preferredNodes - Nodes without existing replicas.
 * @param {Array<Object>} allNodes - All healthy nodes.
 * @param {number} needed - Number of replicas needed.
 * @param {Function} sortNodesByLoad - Sorter for healthy nodes.
 * @return {Array<Object>} Selected target nodes.
 */
function selectReplicaRecoveryTargetNodes(
  preferredNodes,
  allNodes,
  needed,
  sortNodesByLoad = sortReplicaRecoveryNodesByLoad,
) {
  const selected = [];
  const selectedNodeIds = new Set();
  const pushDistinctNode = (node) => {
    if (!node?.node_id || selectedNodeIds.has(node.node_id)) {
      return false;
    }
    selected.push(node);
    selectedNodeIds.add(node.node_id);
    return true;
  };

  for (let i = REPLICA_RECOVERY_NUM.ZERO;
    i < Math.min(needed, preferredNodes.length);
    i++) {
    pushDistinctNode(preferredNodes[i]);
  }

  const remaining = needed - selected.length;
  if (remaining > REPLICA_RECOVERY_NUM.ZERO &&
    allNodes.length > REPLICA_RECOVERY_NUM.ZERO) {
    const sortedNodes = sortNodesByLoad(allNodes);
    for (const node of sortedNodes) {
      if (selected.length >= needed) {
        break;
      }
      pushDistinctNode(node);
    }

    for (const node of sortedNodes) {
      if (selected.length >= needed) {
        break;
      }
      selected.push(node);
    }
  }

  return selected;
}

export {
  selectReplicaRecoveryTargetNodes,
  sortReplicaRecoveryNodesByLoad,
};
