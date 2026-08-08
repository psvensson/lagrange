/**
 * Shared fixture builders for the quorum-conditioned remove-safety tail
 * test-case modules. These collapse the verbose per-test coordinator wiring
 * (readiness service with published-membership planning snapshots, recording
 * message router, replace-scenario service rows) into parameterized builders
 * so the tail cases stay focused on the behavior under test.
 */

const TEST_REQUIRED_DISTINCT_NODE_COUNT = 2;

/**
 * Builds a control-plane readiness service whose planning snapshots report a
 * published membership containing `activeNodeIds`, marking membership as
 * including the target only for `membershipTargetNodeId`.
 */
export function createPublishedPlanningReadinessService({
  publicationStatus,
  activeNodeIds,
  membershipTargetNodeId,
}) {
  const buildPlanningSnapshot = (nodeId) => ({
    publicationStatus,
    publishedActiveNodeIdsPresent: true,
    publishedActiveNodeIds: activeNodeIds,
    recoveryActiveNodeIds: activeNodeIds,
    projectedServingNodeIds: activeNodeIds,
    publishedMembershipIncludesTargetNode: nodeId === membershipTargetNodeId,
    priorityPartitionSummary: Object.freeze({
      satisfied: true,
      requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
      missingPartitionIds: [],
    }),
  });
  return {
    getNodeReadinessSync(nodeId) {
      return {
        nodeId,
        dimensions: {
          controlPlaneRecoveryEligible: true,
          repairEligible: true,
          serveEligible: true,
        },
      };
    },
    async getMembershipPublicationPlanningSnapshotBestEffort(nodeId) {
      return buildPlanningSnapshot(nodeId);
    },
    async getMembershipPublicationPlanningSnapshot(nodeId) {
      return buildPlanningSnapshot(nodeId);
    },
    getMembershipPublicationPlanningSnapshotSync(nodeId) {
      return buildPlanningSnapshot(nodeId);
    },
  };
}

/**
 * Builds a message router that records every delivery into `deliveries` and
 * answers with `respond(payload)`.
 */
export function createRecordingReplicaMessageRouter({deliveries, respond}) {
  return {
    deliver: async (target, payload, options) => {
      deliveries.push({target, payload, options});
      return respond(payload);
    },
    getConnectionState: () => 'connected',
    pingNode: async () => true,
    isOutboundQueueAvailable: () => true,
  };
}

/**
 * Builds the service rows for a replace scenario from compact placements.
 * Each placement is `{replicaId, nodeId, raftRole}`; `raftRole` defaults to
 * 'follower'. Row construction is delegated to the caller's
 * `createCriticalPartitionServiceRow` so the canonical row shape stays owned
 * by the registering test module.
 */
export function createReplaceScenarioServiceRows({
  createCriticalPartitionServiceRow,
  partitionId,
  placements,
}) {
  return placements.map(({replicaId, nodeId, raftRole = 'follower'}) =>
    createCriticalPartitionServiceRow({partitionId, replicaId, nodeId, raftRole}));
}
