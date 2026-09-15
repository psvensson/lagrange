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
    // REMOVE safety reads the owner surface; the same modelled planning
    // state is presented there, unchanged.
    async getPriorityRecoveryPlanningAnswerForOwnerRead(nodeId) {
      return buildPlanningSnapshot(nodeId);
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
 * Presents a readiness fixture's existing planning state on the OWNER-READ
 * surface as well.
 *
 * REMOVE safety reads getPriorityRecoveryPlanningAnswerForOwnerRead and
 * nothing else; a fixture that models a converged planning state for a
 * removal but exposes it only through the best-effort surfaces is modelling a
 * node with NO owner evidence, which the fail-closed contract correctly
 * refuses to remove on. This wrapper adds the owner surface, returning the
 * fixture's own snapshot unchanged, and leaves every AVAILABLE surface in
 * place for the narration, progress and budget-admission consumers that
 * legitimately read them.
 *
 * A fixture that already models the owner surface - including one that
 * deliberately makes the two contracts disagree - is returned untouched.
 */
export function withOwnerReadPlanningEvidence(readinessService) {
  if (
    !readinessService ||
    typeof readinessService.getPriorityRecoveryPlanningAnswerForOwnerRead ===
      'function'
  ) {
    return readinessService;
  }
  return {
    ...readinessService,
    async getPriorityRecoveryPlanningAnswerForOwnerRead(nodeId, observedAt) {
      if (
        typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort ===
        'function'
      ) {
        return readinessService.getPriorityRecoveryPlanningSnapshotBestEffort(
          nodeId, observedAt);
      }
      if (
        typeof readinessService
          .getMembershipPublicationPlanningSnapshotBestEffort === 'function'
      ) {
        return readinessService
          .getMembershipPublicationPlanningSnapshotBestEffort(
            nodeId, observedAt);
      }
      return null;
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
