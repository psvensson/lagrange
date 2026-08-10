/**
 * Pure log-context shaping for the topology-settling planning gate:
 * normalizes the blocker's node lists and counters into the frozen
 * context the gate decision logs. Extracted from
 * rebalancer-planning-gate-methods.js (file-size cap) - no behavior.
 */

function buildTopologySettlingGateLogContext(
  topologySettlingBlocker,
  gateSnapshot,
  delayMs,
  entityType,
) {
  return {
    entityType,
    delayMs,
    planningState: gateSnapshot.planningState,
    priorityRecoveryOperationCreationRequired:
      gateSnapshot.priorityRecoveryOperationCreationRequired,
    topologySettlingBlockedByOperationCreationTarget:
      gateSnapshot.evidence.topologySettlingBlockedByOperationCreationTarget,
    blockerReason: topologySettlingBlocker.reason || null,
    connectedNodeId:
      typeof topologySettlingBlocker.connectedNodeId === 'string' &&
      topologySettlingBlocker.connectedNodeId.length > 0 ?
        topologySettlingBlocker.connectedNodeId :
        null,
    unreadyNodeIds: Array.isArray(topologySettlingBlocker.unreadyNodeIds) ?
      [...topologySettlingBlocker.unreadyNodeIds] :
      [],
    missingNodeEndpointNodeIds: Array.isArray(
      topologySettlingBlocker.missingNodeEndpointNodeIds,
    ) ?
      [...topologySettlingBlocker.missingNodeEndpointNodeIds] :
      [],
    missingPostgresWireNodeIds: Array.isArray(
      topologySettlingBlocker.missingPostgresWireNodeIds,
    ) ?
      [...topologySettlingBlocker.missingPostgresWireNodeIds] :
      [],
    endpointReadyNodeCount: Number.isFinite(
      topologySettlingBlocker.endpointReadyNodeCount,
    ) ?
      topologySettlingBlocker.endpointReadyNodeCount :
      null,
    requiredReadyNodeCount: Number.isFinite(
      topologySettlingBlocker.requiredReadyNodeCount,
    ) ?
      topologySettlingBlocker.requiredReadyNodeCount :
      null,
    inFlightReplicaOperations: Number.isFinite(
      topologySettlingBlocker.inFlightReplicaOperations,
    ) ?
      topologySettlingBlocker.inFlightReplicaOperations :
      null,
    inFlightReplicaOperationsSource:
      topologySettlingBlocker.inFlightReplicaOperationsSource || null,
  };
}

export {buildTopologySettlingGateLogContext};
