import {createMockPolicyService} from './test-helpers.js';
/**
 * Shared fixture builders for the quorum-conditioned remove-safety tail
 * test-case modules. These collapse the verbose per-test coordinator wiring
 * (readiness service with published-membership planning snapshots, recording
 * message router, replace-scenario service rows) into parameterized builders
 * so the tail cases stay focused on the behavior under test.
 */

import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';

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
    async getPriorityRecoveryPlanningSnapshotBestEffort(nodeId) {
      return buildPlanningSnapshot(nodeId);
    },
    getPriorityRecoveryPlanningAnswerSync(nodeId) {
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

/**
 * Runs the replacement-election nudge scenario shared by the tail modules: a
 * REPLACE at ACTIVE whose source still leads the partition row first nudges
 * the replacement's election (STEP_DOWN to the replacement replica) and
 * stays retryable, then removes the source once the partition row names the
 * replacement as leader. The cached service rows always report the source as
 * a follower; `authoritativeSourceRaftRole` is what the authoritative read
 * reports for it (a follower, or a missing role).
 */
export async function runReplacementElectionNudgeScenario(context, t, {
  authoritativeSourceRaftRole,
  evidenceLabel,
}) {
  const {
    ConfigurationManager,
    LoggingService,
    WORKFLOW_STEP,
    OperationType,
    ReplicaOperationMessageType,
    createTestCoordinator,
    TEST_PUBLICATION_STATUS_PUBLISHED,
    TEST_PARTITIONS_TABLE_NAME,
    createReadyNode,
    createCriticalPartitionServiceRow,
    createCriticalPartitionRow,
    installAuthoritativeServicesRead,
  } = context;
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});

  const testPartitionId = 'sql_transactions-p1';
  const testSourceNodeId = 'node-a';
  const testReplacementNodeId = 'node-d';
  const testSourceReplicaId = 'sql_transactions-p1-r1';
  const testReplacementReplicaId = 'sql_transactions-p1-r4';
  const deliveries = [];
  const buildScenarioServiceRows = (sourceRaftRole) =>
    createReplaceScenarioServiceRows({
      createCriticalPartitionServiceRow,
      partitionId: testPartitionId,
      placements: [
        {replicaId: testSourceReplicaId, nodeId: testSourceNodeId,
          raftRole: sourceRaftRole},
        {replicaId: 'sql_transactions-p1-r2', nodeId: 'node-b'},
        {replicaId: 'sql_transactions-p1-r3', nodeId: 'node-c'},
        {replicaId: testReplacementReplicaId, nodeId: testReplacementNodeId},
      ],
    });
  const coordinator = createTestCoordinator({
    nodeId: testReplacementNodeId,
    enableTimeouts: false,
    messageRouter: createRecordingReplicaMessageRouter({
      deliveries,
      respond: () => buildDeliveryEnvelope({acknowledged: true}, {status: 'initiated'}),
    }),
    readinessFixture: {callbacks: createPublishedPlanningReadinessService({
      publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
      activeNodeIds: Object.freeze(['node-a', 'node-b', 'node-c', 'node-d']),
      membershipTargetNodeId: testReplacementNodeId,
    })},
    tablePolicyService: createMockPolicyService({
      getPolicyForPartition: () => ({targetReplicaCount: 3, minReplicaCount: 3}),
    }),
    cacheData: {
      nodes: ['node-a', 'node-b', 'node-c', 'node-d'].map(createReadyNode),
      services: buildScenarioServiceRows('follower'),
    },
  });

  coordinator.initialize();
  try {
    installAuthoritativeServicesRead(coordinator,
      () => buildScenarioServiceRows(authoritativeSourceRaftRole));
    const mergePartitionLeader = (leaderNodeId) =>
      coordinator.systemTableCache.merge(
        TEST_PARTITIONS_TABLE_NAME,
        testPartitionId,
        createCriticalPartitionRow({partitionId: testPartitionId, leaderNodeId}),
      );
    mergePartitionLeader(testSourceNodeId);

    const operation = await coordinator.createOperation({
      type: OperationType.REPLACE,
      partitionId: testPartitionId,
      nodeId: testReplacementNodeId,
      sourceNodeId: testSourceNodeId,
      replicaId: testSourceReplicaId,
    });

    operation.replicaId = testReplacementReplicaId;
    operation.workflowStep = WORKFLOW_STEP.ACTIVE;
    operation.status = 'active';

    const blockedResult = await coordinator.executeOperation(operation);

    t.equal(blockedResult.success, false,
      `${evidenceLabel} should defer until successor leadership is visible`);
    t.equal(blockedResult.skipped, true,
      `${evidenceLabel} should keep the replace source-removal retryable`);
    t.equal(deliveries.length, 1,
      `${evidenceLabel} should request replacement leader election first`);
    t.equal(deliveries[0].payload.type,
      ReplicaOperationMessageType.STEP_DOWN_REPLICA,
      `${evidenceLabel} should nudge replacement election before removal`);
    t.equal(deliveries[0].payload.replicaId, testReplacementReplicaId,
      'replacement election should target the replacement replica');
    t.equal(operation.workflowStep, WORKFLOW_STEP.ACTIVE,
      'the replace workflow should remain in source-removal retry while successor leadership is missing');

    mergePartitionLeader(testReplacementNodeId);

    const retryResult = await coordinator.executeOperation(operation);

    t.equal(retryResult.success, true,
      'source removal should dispatch once successor leadership is visible');
    t.equal(deliveries.length, 2,
      'the second dispatch should remove the old source replica');
    t.equal(deliveries[1].payload.type,
      ReplicaOperationMessageType.REMOVE_REPLICA,
      'source removal should follow replacement leader ownership');
    t.equal(operation.workflowStep, WORKFLOW_STEP.STOPPING,
      'the replace workflow should move into source removal after successor leadership appears');
  } finally {
    await coordinator.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
}
