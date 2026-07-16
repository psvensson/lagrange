import {registerQuorumConditionedRemoveSafetyTailElectionRetargeting} from './quorum-conditioned-remove-safety-tail-election-retargeting.js';

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
      const coordinator = createTestCoordinator({
        nodeId: testReplacementNodeId,
        enableTimeouts: false,
        messageRouter: {
          deliver: async (target, payload, options) => {
            deliveries.push({target, payload, options});
            return {acknowledged: true, status: 'initiated'};
          },
          getConnectionState: () => 'connected',
          pingNode: async () => true,
          isOutboundQueueAvailable: () => true,
        },
        controlPlaneReadinessService: {
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
            return {
              publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
              publishedActiveNodeIdsPresent: true,
              publishedActiveNodeIds: Object.freeze(['node-a', 'node-b', 'node-c', 'node-d']),
              recoveryActiveNodeIds: Object.freeze([
                'node-a',
                'node-b',
                'node-c',
                'node-d',
              ]),
              projectedServingNodeIds: Object.freeze([
                'node-a',
                'node-b',
                'node-c',
                'node-d',
              ]),
              publishedMembershipIncludesTargetNode: nodeId === testReplacementNodeId,
              priorityPartitionSummary: Object.freeze({
                satisfied: true,
                requiredDistinctNodeCount: 2,
                missingPartitionIds: [],
              }),
            };
          },
          async getMembershipPublicationPlanningSnapshot(nodeId) {
            return this.getMembershipPublicationPlanningSnapshotBestEffort(nodeId);
          },
          getMembershipPublicationPlanningSnapshotSync(nodeId) {
            return {
              publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
              publishedActiveNodeIdsPresent: true,
              publishedActiveNodeIds: Object.freeze(['node-a', 'node-b', 'node-c', 'node-d']),
              recoveryActiveNodeIds: Object.freeze([
                'node-a',
                'node-b',
                'node-c',
                'node-d',
              ]),
              projectedServingNodeIds: Object.freeze([
                'node-a',
                'node-b',
                'node-c',
                'node-d',
              ]),
              publishedMembershipIncludesTargetNode: nodeId === testReplacementNodeId,
              priorityPartitionSummary: Object.freeze({
                satisfied: true,
                requiredDistinctNodeCount: 2,
                missingPartitionIds: [],
              }),
            };
          },
        },
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
          services: [
            createCriticalPartitionServiceRow({
              partitionId: testPartitionId,
              replicaId: testSourceReplicaId,
              nodeId: testSourceNodeId,
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: testPartitionId,
              replicaId: 'sql_transactions-p1-r2',
              nodeId: 'node-b',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: testPartitionId,
              replicaId: 'sql_transactions-p1-r3',
              nodeId: 'node-c',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: testPartitionId,
              replicaId: testReplacementReplicaId,
              nodeId: testReplacementNodeId,
              raftRole: 'follower',
            }),
          ],
        },
      });

      coordinator.initialize();
      try {
        installAuthoritativeServicesRead(
          coordinator,
          () => [
            createCriticalPartitionServiceRow({
              partitionId: testPartitionId,
              replicaId: testSourceReplicaId,
              nodeId: testSourceNodeId,
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: testPartitionId,
              replicaId: 'sql_transactions-p1-r2',
              nodeId: 'node-b',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: testPartitionId,
              replicaId: 'sql_transactions-p1-r3',
              nodeId: 'node-c',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: testPartitionId,
              replicaId: testReplacementReplicaId,
              nodeId: testReplacementNodeId,
              raftRole: 'follower',
            }),
          ],
        );

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

  test('RebalanceCoordinator - completed replacement election evidence closes priority source removal when partition leader rows lag',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});

      const testPartitionId = 'sql_transactions-p1';
      const testSourceNodeId = 'node-a';
      const testFollowerNodeIdB = 'node-b';
      const testFollowerNodeIdC = 'node-c';
      const testReplacementNodeId = 'node-d';
      const testSourceReplicaId = 'sql_transactions-p1-r1';
      const testFollowerReplicaIdB = 'sql_transactions-p1-r2';
      const testFollowerReplicaIdC = 'sql_transactions-p1-r3';
      const testReplacementReplicaId = 'sql_transactions-p1-r4';
      const testOperationActiveStatus = 'active';
      const testPublishedNodeIds = Object.freeze([
        testSourceNodeId,
        testFollowerNodeIdB,
        testFollowerNodeIdC,
        testReplacementNodeId,
      ]);
      const buildPlanningSnapshot = (nodeId) => ({
        publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
        publishedActiveNodeIdsPresent: true,
        publishedActiveNodeIds: testPublishedNodeIds,
        recoveryActiveNodeIds: testPublishedNodeIds,
        projectedServingNodeIds: testPublishedNodeIds,
        publishedMembershipIncludesTargetNode:
          nodeId === testReplacementNodeId,
        priorityPartitionSummary: Object.freeze({
          satisfied: true,
          requiredDistinctNodeCount: 2,
          missingPartitionIds: [],
        }),
      });
      const deliveries = [];
      const coordinator = createTestCoordinator({
        nodeId: testReplacementNodeId,
        enableTimeouts: false,
        messageRouter: {
          deliver: async (target, payload, options) => {
            deliveries.push({target, payload, options});
            return {
              acknowledged: true,
              status: ReplicaOperationResponseStatus.INITIATED,
            };
          },
          getConnectionState: () => 'connected',
          pingNode: async () => true,
          isOutboundQueueAvailable: () => true,
        },
        controlPlaneReadinessService: {
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
        },
        tablePolicyService: {
          getPolicyForPartition: () => ({minReplicaCount: 3}),
        },
        cacheData: {
          nodes: [
            createReadyNode(testSourceNodeId),
            createReadyNode(testFollowerNodeIdB),
            createReadyNode(testFollowerNodeIdC),
            createReadyNode(testReplacementNodeId),
          ],
          services: [
            createCriticalPartitionServiceRow({
              partitionId: testPartitionId,
              replicaId: testSourceReplicaId,
              nodeId: testSourceNodeId,
              raftRole: null,
            }),
            createCriticalPartitionServiceRow({
              partitionId: testPartitionId,
              replicaId: testFollowerReplicaIdB,
              nodeId: testFollowerNodeIdB,
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: testPartitionId,
              replicaId: testFollowerReplicaIdC,
              nodeId: testFollowerNodeIdC,
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: testPartitionId,
              replicaId: testReplacementReplicaId,
              nodeId: testReplacementNodeId,
              raftRole: 'follower',
            }),
          ],
        },
      });

      coordinator.initialize();
      try {
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
        operation.status = testOperationActiveStatus;
        coordinator.workflowOwner
          .getPriorityPublicationLeaderHandoffEvidenceMap()
          .set(
            operation.operationId,
            Object.freeze({
              observedAt: Date.now(),
              sourceReplicaId: testSourceReplicaId,
            }),
          );
        coordinator.workflowOwner
          .getPriorityPublicationReplacementLeaderElectionEvidenceMap()
          .set(
            operation.operationId,
            Object.freeze({
              completedReplicaIds: Object.freeze([testReplacementReplicaId]),
              notFoundReplicaIds: Object.freeze([]),
              observedAt: Date.now(),
              replacementReplicaId: testReplacementReplicaId,
              responseStatus: ReplicaOperationResponseStatus.COMPLETED,
            }),
          );

        const result = await coordinator.executeOperation(operation);

        t.equal(
          result.success,
          true,
          'completed replacement election evidence should let pressure-safe source removal proceed',
        );
        t.equal(
          deliveries.length,
          1,
          'source removal should dispatch without waiting for the lagged partition leader row',
        );
        t.equal(
          deliveries[0].payload.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'the dispatch should remove the old source replica',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the replace workflow should enter source removal from completed election evidence',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  test('RebalanceCoordinator - exact replacement election completion with a routing-ready target and retarget candidates continues source removal in the same owner turn',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});

      const TEST_PARTITION_ID = 'replica_operations-p1';
      const TEST_SOURCE_NODE_ID = 'node-a';
      const TEST_FOLLOWER_NODE_B_ID = 'node-b';
      const TEST_FOLLOWER_NODE_C_ID = 'node-c';
      const TEST_REPLACEMENT_NODE_ID = 'node-d';
      const TEST_SOURCE_REPLICA_ID = 'replica_operations-p1-r1';
      const TEST_FOLLOWER_REPLICA_B_ID = 'replica_operations-p1-r2';
      const TEST_FOLLOWER_REPLICA_C_ID = 'replica_operations-p1-r3';
      const TEST_REPLACEMENT_REPLICA_ID = 'replica_operations-p1-r4';
      const TEST_ACTIVE_STATUS = 'active';
      const TEST_FOLLOWER_ROLE = 'follower';
      const TEST_MIN_REPLICA_COUNT = 3;
      const TEST_REQUIRED_DISTINCT_NODE_COUNT = 2;
      const TEST_READY_NODE_IDS = Object.freeze([
        TEST_SOURCE_NODE_ID,
        TEST_FOLLOWER_NODE_B_ID,
        TEST_FOLLOWER_NODE_C_ID,
        TEST_REPLACEMENT_NODE_ID,
      ]);
      const TEST_EMPTY_PARTITION_IDS = Object.freeze([]);
      const TEST_READY_DIMENSIONS = Object.freeze({
        controlPlaneRecoveryEligible: true,
        repairEligible: true,
        serveEligible: true,
      });
      const deliveries = [];
      const buildPlanningSnapshot = (nodeId) => ({
        publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
        publishedActiveNodeIdsPresent: true,
        publishedActiveNodeIds: TEST_READY_NODE_IDS,
        recoveryActiveNodeIds: TEST_READY_NODE_IDS,
        projectedServingNodeIds: TEST_READY_NODE_IDS,
        publishedMembershipIncludesTargetNode:
          nodeId === TEST_REPLACEMENT_NODE_ID,
        priorityPartitionSummary: Object.freeze({
          satisfied: true,
          requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
          missingPartitionIds: TEST_EMPTY_PARTITION_IDS,
        }),
      });
      const coordinator = createTestCoordinator({
        nodeId: TEST_REPLACEMENT_NODE_ID,
        enableTimeouts: false,
        messageRouter: {
          deliver: async (target, payload, options) => {
            deliveries.push({target, payload, options});
            return {
              acknowledged: true,
              status: payload.type ===
                  ReplicaOperationMessageType.STEP_DOWN_REPLICA ?
                ReplicaOperationResponseStatus.COMPLETED :
                ReplicaOperationResponseStatus.INITIATED,
            };
          },
          getConnectionState: () => 'connected',
          pingNode: async () => true,
          isOutboundQueueAvailable: () => true,
        },
        controlPlaneReadinessService: {
          getNodeReadinessSync(nodeId) {
            return {
              nodeId,
              dimensions: TEST_READY_DIMENSIONS,
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
        },
        tablePolicyService: {
          getPolicyForPartition: () => ({
            minReplicaCount: TEST_MIN_REPLICA_COUNT,
          }),
        },
        cacheData: {
          nodes: TEST_READY_NODE_IDS.map((nodeId) => createReadyNode(nodeId)),
          services: [
            createCriticalPartitionServiceRow({
              partitionId: TEST_PARTITION_ID,
              replicaId: TEST_SOURCE_REPLICA_ID,
              nodeId: TEST_SOURCE_NODE_ID,
              raftRole: TEST_FOLLOWER_ROLE,
            }),
            createCriticalPartitionServiceRow({
              partitionId: TEST_PARTITION_ID,
              replicaId: TEST_FOLLOWER_REPLICA_B_ID,
              nodeId: TEST_FOLLOWER_NODE_B_ID,
              raftRole: TEST_FOLLOWER_ROLE,
            }),
            createCriticalPartitionServiceRow({
              partitionId: TEST_PARTITION_ID,
              replicaId: TEST_FOLLOWER_REPLICA_C_ID,
              nodeId: TEST_FOLLOWER_NODE_C_ID,
              raftRole: TEST_FOLLOWER_ROLE,
            }),
            createCriticalPartitionServiceRow({
              partitionId: TEST_PARTITION_ID,
              replicaId: TEST_REPLACEMENT_REPLICA_ID,
              nodeId: TEST_REPLACEMENT_NODE_ID,
              raftRole: TEST_FOLLOWER_ROLE,
            }),
          ],
        },
      });

      coordinator.initialize();
      try {
        coordinator.systemTableCache.merge(
          TEST_PARTITIONS_TABLE_NAME,
          TEST_PARTITION_ID,
          createCriticalPartitionRow({
            partitionId: TEST_PARTITION_ID,
            leaderNodeId: TEST_SOURCE_NODE_ID,
          }),
        );

        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: TEST_PARTITION_ID,
          nodeId: TEST_REPLACEMENT_NODE_ID,
          sourceNodeId: TEST_SOURCE_NODE_ID,
          replicaId: TEST_SOURCE_REPLICA_ID,
        });

        operation.replicaId = TEST_REPLACEMENT_REPLICA_ID;
        operation.workflowStep = WORKFLOW_STEP.ACTIVE;
        operation.status = TEST_ACTIVE_STATUS;

        const result = await coordinator.executeOperation(operation);

        t.equal(
          result.success,
          true,
          'exact target election evidence should close source removal before retry expiry can retarget it',
        );
        t.equal(
          deliveries.length,
          2,
          'the same owner turn should first nudge target leadership and then remove the source',
        );
        t.equal(
          deliveries[0].payload.type,
          ReplicaOperationMessageType.STEP_DOWN_REPLICA,
          'the first dispatch should request target leader election',
        );
        t.equal(
          deliveries[0].payload.reason,
          ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
          'the first dispatch should use the canonical target-election reason',
        );
        t.equal(
          deliveries[1].payload.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'the second dispatch should remove the old source replica',
        );
        t.same(
          coordinator.workflowOwner
            .getPriorityPublicationReplacementLeaderElectionEvidenceMap()
            .get(operation.operationId)?.completedReplicaIds,
          [TEST_REPLACEMENT_REPLICA_ID],
          'the same-turn re-evaluation consumes the exact recorded target ACK',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the replace workflow should enter source removal in the same owner turn',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  test('RebalanceCoordinator - converged priority replacement election continues source removal when no retarget voter exists',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});

      const TEST_PARTITION_ID = 'replica_operations-p1';
      const TEST_SOURCE_NODE_ID = 'node-a';
      const TEST_REPLACEMENT_NODE_ID = 'node-d';
      const TEST_SOURCE_REPLICA_ID = 'replica_operations-p1-r1';
      const TEST_SOURCE_FOLLOWER_REPLICA_B_ID = 'replica_operations-p1-r2';
      const TEST_SOURCE_FOLLOWER_REPLICA_C_ID = 'replica_operations-p1-r3';
      const TEST_REPLACEMENT_REPLICA_ID = 'replica_operations-p1-r4';
      const TEST_ACTIVE_STATUS = 'active';
      const TEST_FOLLOWER_ROLE = 'follower';
      const TEST_MIN_REPLICA_COUNT = 3;
      const TEST_REQUIRED_DISTINCT_NODE_COUNT = 2;
      const TEST_READY_NODE_IDS = Object.freeze([
        TEST_SOURCE_NODE_ID,
        TEST_REPLACEMENT_NODE_ID,
      ]);
      const TEST_EMPTY_PARTITION_IDS = Object.freeze([]);
      const deliveries = [];
      const buildPlanningSnapshot = (nodeId) => ({
        publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
        publishedActiveNodeIdsPresent: true,
        publishedActiveNodeIds: TEST_READY_NODE_IDS,
        recoveryActiveNodeIds: TEST_READY_NODE_IDS,
        projectedServingNodeIds: TEST_READY_NODE_IDS,
        publishedMembershipIncludesTargetNode:
          nodeId === TEST_REPLACEMENT_NODE_ID,
        priorityPartitionSummary: Object.freeze({
          satisfied: true,
          requiredDistinctNodeCount: TEST_REQUIRED_DISTINCT_NODE_COUNT,
          missingPartitionIds: TEST_EMPTY_PARTITION_IDS,
        }),
      });
      const coordinator = createTestCoordinator({
        nodeId: TEST_REPLACEMENT_NODE_ID,
        enableTimeouts: false,
        messageRouter: {
          deliver: async (target, payload, options) => {
            deliveries.push({target, payload, options});
            return {
              acknowledged: true,
              status: payload.type ===
                  ReplicaOperationMessageType.STEP_DOWN_REPLICA ?
                ReplicaOperationResponseStatus.COMPLETED :
                ReplicaOperationResponseStatus.INITIATED,
            };
          },
          getConnectionState: () => 'connected',
          pingNode: async () => true,
          isOutboundQueueAvailable: () => true,
        },
        controlPlaneReadinessService: {
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
        },
        tablePolicyService: {
          getPolicyForPartition: () => ({
            minReplicaCount: TEST_MIN_REPLICA_COUNT,
          }),
        },
        cacheData: {
          nodes: TEST_READY_NODE_IDS.map((nodeId) => createReadyNode(nodeId)),
          services: [
            createCriticalPartitionServiceRow({
              partitionId: TEST_PARTITION_ID,
              replicaId: TEST_SOURCE_REPLICA_ID,
              nodeId: TEST_SOURCE_NODE_ID,
              raftRole: TEST_FOLLOWER_ROLE,
            }),
            createCriticalPartitionServiceRow({
              partitionId: TEST_PARTITION_ID,
              replicaId: TEST_SOURCE_FOLLOWER_REPLICA_B_ID,
              nodeId: TEST_SOURCE_NODE_ID,
              raftRole: TEST_FOLLOWER_ROLE,
            }),
            createCriticalPartitionServiceRow({
              partitionId: TEST_PARTITION_ID,
              replicaId: TEST_SOURCE_FOLLOWER_REPLICA_C_ID,
              nodeId: TEST_SOURCE_NODE_ID,
              raftRole: TEST_FOLLOWER_ROLE,
            }),
            createCriticalPartitionServiceRow({
              partitionId: TEST_PARTITION_ID,
              replicaId: TEST_REPLACEMENT_REPLICA_ID,
              nodeId: TEST_REPLACEMENT_NODE_ID,
              raftRole: TEST_FOLLOWER_ROLE,
            }),
          ],
        },
      });

      coordinator.initialize();
      try {
        coordinator.systemTableCache.merge(
          TEST_PARTITIONS_TABLE_NAME,
          TEST_PARTITION_ID,
          createCriticalPartitionRow({
            partitionId: TEST_PARTITION_ID,
            leaderNodeId: TEST_SOURCE_NODE_ID,
          }),
        );

        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: TEST_PARTITION_ID,
          nodeId: TEST_REPLACEMENT_NODE_ID,
          sourceNodeId: TEST_SOURCE_NODE_ID,
          replicaId: TEST_SOURCE_REPLICA_ID,
        });

        operation.replicaId = TEST_REPLACEMENT_REPLICA_ID;
        operation.workflowStep = WORKFLOW_STEP.ACTIVE;
        operation.status = TEST_ACTIVE_STATUS;
        coordinator.workflowOwner
          .getPriorityPublicationLeaderHandoffEvidenceMap()
          .set(
            operation.operationId,
            Object.freeze({
              observedAt: Date.now(),
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            }),
          );

        const result = await coordinator.executeOperation(operation);

        t.equal(
          result.success,
          true,
          'completed target election should continue directly to source removal',
        );
        t.equal(
          deliveries.length,
          2,
          'the owner should nudge target leadership and remove the source in one turn',
        );
        t.equal(
          deliveries[0].payload.type,
          ReplicaOperationMessageType.STEP_DOWN_REPLICA,
          'the first dispatch should request replacement leader election',
        );
        t.equal(
          deliveries[1].payload.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'the second dispatch should remove the old source replica',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the replace workflow should enter source removal without waiting for a later retry',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  registerQuorumConditionedRemoveSafetyTailElectionRetargeting(context);
}
