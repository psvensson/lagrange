import {registerQuorumConditionedRemoveSafetyTailElectionRetargeting} from './quorum-conditioned-remove-safety-tail-election-retargeting.js';
import {
  createPublishedPlanningReadinessService,
  createRecordingReplicaMessageRouter,
  createReplaceScenarioServiceRows,
} from './quorum-conditioned-remove-safety-tail-fixture-builders.js';

export function registerQuorumConditionedRemoveSafetyTailReplacementElection(context) {
  const {
    test,
    ConfigurationManager,
    LoggingService,
    WORKFLOW_STEP,
    NODE_STATE,
    CONTROL_PLANE_PARTICIPATION_KIND,
    CONTROL_PLANE_READINESS_DIMENSION,
    OperationType,
    REBALANCER_SKIP_REASON,
    REBALANCE_COORDINATOR_DEFER_REASON,
    ReplicaOperationReason,
    ReplicaOperationMessageType,
    ReplicaOperationResponseStatus,
    createTestCoordinator,
    OWNER_READ_PARTICIPATION_KIND,
    REMOVE_SAFETY_DECISION_DIMENSION,
    TEST_PUBLICATION_STATUS_ACK_PENDING,
    TEST_PUBLICATION_STATUS_PUBLISHED,
    TEST_PARTITIONS_TABLE_NAME,
    createReadyNode,
    createCriticalPartitionServiceRow,
    createCriticalPartitionRow,
    installAuthoritativeServicesRead,
  } = context;

  test('RebalanceCoordinator - nudges sql_transactions replacement election when source follower evidence outruns partition leader ownership',
    async (t) => {
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
      const buildScenarioServiceRows = () => createReplaceScenarioServiceRows({
        createCriticalPartitionServiceRow,
        partitionId: testPartitionId,
        placements: [
          {replicaId: testSourceReplicaId, nodeId: testSourceNodeId},
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
          respond: () => ({acknowledged: true, status: 'initiated'}),
        }),
        controlPlaneReadinessService: createPublishedPlanningReadinessService({
          publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
          activeNodeIds: Object.freeze(['node-a', 'node-b', 'node-c', 'node-d']),
          membershipTargetNodeId: testReplacementNodeId,
        }),
        tablePolicyService: {
          getPolicyForPartition: () => ({minReplicaCount: 3}),
        },
        cacheData: {
          nodes: [
            createReadyNode('node-a'),
            createReadyNode('node-b'),
            createReadyNode('node-c'),
            createReadyNode('node-d'),
          ],
          services: buildScenarioServiceRows(),
        },
      });

      coordinator.initialize();
      try {
        installAuthoritativeServicesRead(coordinator, buildScenarioServiceRows);

        coordinator.systemTableCache.merge(
          TEST_PARTITIONS_TABLE_NAME,
          testPartitionId,
          createCriticalPartitionRow({
            partitionId: testPartitionId,
            leaderNodeId: testSourceNodeId,
          }),
        );

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

        t.equal(
          blockedResult.success,
          false,
          'source follower evidence should defer until successor leadership is visible',
        );
        t.equal(
          blockedResult.skipped,
          true,
          'source follower evidence should keep the replace source-removal retryable',
        );
        t.equal(
          deliveries.length,
          1,
          'source follower evidence should request replacement leader election first',
        );
        t.equal(
          deliveries[0].payload.type,
          ReplicaOperationMessageType.STEP_DOWN_REPLICA,
          'source follower evidence should nudge replacement election before removal',
        );
        t.equal(
          deliveries[0].payload.replicaId,
          testReplacementReplicaId,
          'replacement election should target the replacement replica',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.ACTIVE,
          'the replace workflow should remain in source-removal retry while successor leadership is missing',
        );

        coordinator.systemTableCache.merge(
          TEST_PARTITIONS_TABLE_NAME,
          testPartitionId,
          createCriticalPartitionRow({
            partitionId: testPartitionId,
            leaderNodeId: testReplacementNodeId,
          }),
        );

        const retryResult = await coordinator.executeOperation(operation);

        t.equal(
          retryResult.success,
          true,
          'source removal should dispatch once successor leadership is visible',
        );
        t.equal(
          deliveries.length,
          2,
          'the second dispatch should remove the old source replica',
        );
        t.equal(
          deliveries[1].payload.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'source removal should follow replacement leader ownership',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the replace workflow should move into source removal after successor leadership appears',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  // SUPERSEDED (R09) by the owner decision of 2026-09-25 (approved REPLACE
  // design, amendment-1 step 2), quest replace-source-removal-owner: the
  // tests that stood here pinned the CL-043 completed-election authorization
  // (BR11) and the H-B' replacement-leader retarget. A REPLACE's leadership
  // is now decided from a fresh read of its target replica's own port, and
  // its only handoff is one named-target attempt. The corrected contract is
  // witnessed in test/rebalancer/replace-named-handoff-attempt.test.js, whose
  // header lists every superseded test by name.

  registerQuorumConditionedRemoveSafetyTailElectionRetargeting(context);
}
