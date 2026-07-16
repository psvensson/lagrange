import {registerQuorumConditionedRemoveSafetyTailMoreTests} from './quorum-conditioned-remove-safety-tail-more-test-cases.js';

export function registerQuorumConditionedRemoveSafetyTailElectionRetargeting(context) {
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

  test('RebalanceCoordinator - completed sql_transactions target election continues source removal in the same owner turn',
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
      const testReplacementLeaderElectionReason =
      'replace_target_leader_election';
      const deliveries = [];
      const coordinator = createTestCoordinator({
        nodeId: testReplacementNodeId,
        enableTimeouts: false,
        messageRouter: {
          deliver: async (target, payload, options) => {
            deliveries.push({target, payload, options});
            return {
              acknowledged: true,
              status: ReplicaOperationResponseStatus.COMPLETED,
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
              publishedMembershipIncludesTargetNode:
              nodeId === testReplacementNodeId,
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
              publishedMembershipIncludesTargetNode:
              nodeId === testReplacementNodeId,
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
              raftRole: null,
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
              raftRole: null,
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
        coordinator.workflowOwner
          .getPriorityPublicationLeaderHandoffEvidenceMap()
          .set(
            operation.operationId,
            Object.freeze({
              observedAt: Date.now(),
              sourceReplicaId: testSourceReplicaId,
            }),
          );

        const result = await coordinator.executeOperation(operation);

        t.equal(
          result.success,
          true,
          'the exact completed election response should continue into canonical source removal',
        );
        t.equal(
          deliveries.length,
          2,
          'the same owner turn should nudge target leadership and then remove the source',
        );
        t.equal(
          deliveries[0].target,
          `${testReplacementNodeId}/service/replica-handler`,
          'the election nudge should target the replacement node handler',
        );
        t.equal(
          deliveries[0].payload.type,
          ReplicaOperationMessageType.STEP_DOWN_REPLICA,
          'replacement leader election should reuse the canonical leader-handoff lane',
        );
        t.equal(
          deliveries[0].payload.replicaId,
          testReplacementReplicaId,
          'the election nudge should target the replacement replica',
        );
        t.equal(
          deliveries[0].payload.reason,
          testReplacementLeaderElectionReason,
          'the nudge should carry the canonical replacement leader election reason',
        );
        t.equal(
          deliveries[1].payload.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'canonical remove safety should authorize source removal from the recorded exact ACK',
        );
        t.same(
          coordinator.workflowOwner
            .getPriorityPublicationReplacementLeaderElectionEvidenceMap()
            .get(operation.operationId)?.completedReplicaIds,
          [testReplacementReplicaId],
          'the same-turn continuation should retain exact target-election evidence',
        );
        t.ok(
          operation.workflowStep === WORKFLOW_STEP.STOPPING ||
          operation.workflowStep === WORKFLOW_STEP.REMOVED,
          'the replace workflow should advance beyond the ACTIVE source-removal gate once the replacement replica is the observed leader',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  test('RebalanceCoordinator - retargets replacement leader election after original target reports missing replica',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});

      const TEST_PARTITION_ID = 'sql_write_operations-p1';
      const TEST_SOURCE_NODE_ID = 'node-a';
      const TEST_ALTERNATE_NODE_ID = 'node-b';
      const TEST_STANDBY_NODE_ID = 'node-c';
      const TEST_REPLACEMENT_NODE_ID = 'node-d';
      const TEST_SOURCE_REPLICA_ID = 'sql_write_operations-p1-r1';
      const TEST_ALTERNATE_REPLICA_ID = 'sql_write_operations-p1-r2';
      const TEST_STANDBY_REPLICA_ID = 'sql_write_operations-p1-r3';
      const TEST_REPLACEMENT_REPLICA_ID = 'sql_write_operations-p1-r4';
      const TEST_REPLICA_HANDLER_TARGET_SUFFIX = '/service/replica-handler';
      const TEST_FOLLOWER_ROLE = 'follower';
      const TEST_LEADER_ROLE = 'leader';
      const TEST_OPERATION_ACTIVE_STATUS = 'active';
      const TEST_MIN_REPLICA_COUNT = 3;
      const TEST_REQUIRED_DISTINCT_NODE_COUNT = 2;
      const TEST_READY_NODE_IDS = Object.freeze([
        TEST_SOURCE_NODE_ID,
        TEST_ALTERNATE_NODE_ID,
        TEST_STANDBY_NODE_ID,
        TEST_REPLACEMENT_NODE_ID,
      ]);
      const TEST_EMPTY_PARTITION_IDS = Object.freeze([]);
      const TEST_ORIGINAL_REPLACEMENT_TARGET =
      `${TEST_REPLACEMENT_NODE_ID}${TEST_REPLICA_HANDLER_TARGET_SUFFIX}`;
      const TEST_ALTERNATE_REPLACEMENT_TARGET =
      `${TEST_ALTERNATE_NODE_ID}${TEST_REPLICA_HANDLER_TARGET_SUFFIX}`;
      const TEST_SOURCE_REMOVAL_TARGET =
      `${TEST_SOURCE_NODE_ID}${TEST_REPLICA_HANDLER_TARGET_SUFFIX}`;
      const deliveries = [];
      let alternateReplicaRole = TEST_FOLLOWER_ROLE;

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
      const buildServiceRows = () => [
        createCriticalPartitionServiceRow({
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_SOURCE_REPLICA_ID,
          nodeId: TEST_SOURCE_NODE_ID,
          raftRole: null,
        }),
        createCriticalPartitionServiceRow({
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_ALTERNATE_REPLICA_ID,
          nodeId: TEST_ALTERNATE_NODE_ID,
          raftRole: alternateReplicaRole,
        }),
        createCriticalPartitionServiceRow({
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_STANDBY_REPLICA_ID,
          nodeId: TEST_STANDBY_NODE_ID,
          raftRole: TEST_FOLLOWER_ROLE,
        }),
        createCriticalPartitionServiceRow({
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_REPLACEMENT_REPLICA_ID,
          nodeId: TEST_REPLACEMENT_NODE_ID,
          raftRole: TEST_FOLLOWER_ROLE,
        }),
      ];
      const coordinator = createTestCoordinator({
        nodeId: TEST_REPLACEMENT_NODE_ID,
        enableTimeouts: false,
        messageRouter: {
          deliver: async (target, payload, options) => {
            deliveries.push({target, payload, options});
            const originalReplacementTargetMissing =
            target === TEST_ORIGINAL_REPLACEMENT_TARGET &&
            payload.type === ReplicaOperationMessageType.STEP_DOWN_REPLICA &&
            payload.reason ===
              ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION &&
            payload.replicaId === TEST_REPLACEMENT_REPLICA_ID;
            return {
              acknowledged: true,
              status: originalReplacementTargetMissing ?
                ReplicaOperationResponseStatus.NOT_FOUND :
                ReplicaOperationResponseStatus.COMPLETED,
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
          getPolicyForPartition: () => ({minReplicaCount: TEST_MIN_REPLICA_COUNT}),
        },
        cacheData: {
          nodes: TEST_READY_NODE_IDS.map((nodeId) => createReadyNode(nodeId)),
          services: buildServiceRows(),
        },
      });

      coordinator.initialize();
      try {
        installAuthoritativeServicesRead(coordinator, buildServiceRows);
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
        operation.status = TEST_OPERATION_ACTIVE_STATUS;
        coordinator.workflowOwner
          .getPriorityPublicationLeaderHandoffEvidenceMap()
          .set(
            operation.operationId,
            Object.freeze({
              observedAt: Date.now(),
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            }),
          );

        const firstResult = await coordinator.executeOperation(operation);

        t.equal(
          firstResult.success,
          false,
          'source removal should stay deferred when the replacement target is only a follower',
        );
        t.equal(
          deliveries.length,
          1,
          'the first replacement leader election nudge should dispatch',
        );
        t.equal(
          deliveries[0].target,
          TEST_ORIGINAL_REPLACEMENT_TARGET,
          'the first nudge should target the original replacement node',
        );
        t.equal(
          deliveries[0].payload.replicaId,
          TEST_REPLACEMENT_REPLICA_ID,
          'the first nudge should target the original replacement replica',
        );

        const secondResult = await coordinator.executeOperation(operation);

        t.equal(
          secondResult.success,
          false,
          'source removal should stay deferred while the alternate leader is pending',
        );
        t.equal(
          deliveries.length,
          2,
          'fresh missing-replica evidence should allow one alternate election nudge',
        );
        t.equal(
          deliveries[1].target,
          TEST_ALTERNATE_REPLACEMENT_TARGET,
          'the second nudge should retarget a current non-source voter',
        );
        t.equal(
          deliveries[1].payload.reason,
          ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
          'the retargeted nudge should keep the canonical election reason',
        );
        t.equal(
          deliveries[1].payload.replicaId,
          TEST_ALTERNATE_REPLICA_ID,
          'the retargeted nudge should name the alternate voter replica',
        );

        alternateReplicaRole = TEST_LEADER_ROLE;

        const finalResult = await coordinator.executeOperation(operation);

        t.equal(
          finalResult.success,
          true,
          'source removal should proceed once the retargeted voter owns leadership',
        );
        t.equal(
          deliveries.length,
          3,
          'the final dispatch should remove the old source replica',
        );
        t.equal(
          deliveries[2].target,
          TEST_SOURCE_REMOVAL_TARGET,
          'source removal should go back to the source node handler',
        );
        t.equal(
          deliveries[2].payload.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'the final dispatch should be source removal',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  test('RebalanceCoordinator - completes source removal after retargeted replacement election exhausts non-source candidates',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      const TEST_EMPTY_CONFIG = Object.freeze({});
      const TEST_LOG_LEVEL_ERROR = 'error';
      ConfigurationManager.getInstance().initialize(TEST_EMPTY_CONFIG);
      LoggingService.getInstance().initialize({level: TEST_LOG_LEVEL_ERROR});

      const TEST_PARTITION_ID = 'sql_write_operations-p1';
      const TEST_SOURCE_NODE_ID = 'node-a';
      const TEST_ALTERNATE_NODE_ID = 'node-b';
      const TEST_REPLACEMENT_NODE_ID = 'node-d';
      const TEST_SOURCE_REPLICA_ID = 'sql_write_operations-p1-r1';
      const TEST_SOURCE_PEER_REPLICA_ID = 'sql_write_operations-p1-r2';
      const TEST_ALTERNATE_REPLICA_ID = 'sql_write_operations-p1-r3';
      const TEST_REPLACEMENT_REPLICA_ID = 'sql_write_operations-p1-r4';
      const TEST_REPLICA_HANDLER_TARGET_SUFFIX = '/service/replica-handler';
      const TEST_ORIGINAL_REPLACEMENT_TARGET =
        `${TEST_REPLACEMENT_NODE_ID}${TEST_REPLICA_HANDLER_TARGET_SUFFIX}`;
      const TEST_ALTERNATE_REPLACEMENT_TARGET =
        `${TEST_ALTERNATE_NODE_ID}${TEST_REPLICA_HANDLER_TARGET_SUFFIX}`;
      const TEST_SOURCE_REMOVAL_TARGET =
        `${TEST_SOURCE_NODE_ID}${TEST_REPLICA_HANDLER_TARGET_SUFFIX}`;
      const TEST_FOLLOWER_ROLE = 'follower';
      const TEST_OPERATION_ACTIVE_STATUS = 'active';
      const TEST_MIN_REPLICA_COUNT = 3;
      const TEST_REQUIRED_DISTINCT_NODE_COUNT = 2;
      const TEST_NULL_RAFT_ROLE = null;
      const TEST_READY_NODE_IDS = Object.freeze([
        TEST_SOURCE_NODE_ID,
        TEST_ALTERNATE_NODE_ID,
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
      const buildServiceRows = () => [
        createCriticalPartitionServiceRow({
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_SOURCE_REPLICA_ID,
          nodeId: TEST_SOURCE_NODE_ID,
          raftRole: TEST_NULL_RAFT_ROLE,
        }),
        createCriticalPartitionServiceRow({
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_SOURCE_PEER_REPLICA_ID,
          nodeId: TEST_SOURCE_NODE_ID,
          raftRole: TEST_FOLLOWER_ROLE,
        }),
        createCriticalPartitionServiceRow({
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_ALTERNATE_REPLICA_ID,
          nodeId: TEST_ALTERNATE_NODE_ID,
          raftRole: TEST_FOLLOWER_ROLE,
        }),
        createCriticalPartitionServiceRow({
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_REPLACEMENT_REPLICA_ID,
          nodeId: TEST_REPLACEMENT_NODE_ID,
          raftRole: TEST_FOLLOWER_ROLE,
        }),
      ];
      const coordinator = createTestCoordinator({
        nodeId: TEST_REPLACEMENT_NODE_ID,
        enableTimeouts: false,
        messageRouter: {
          deliver: async (target, payload, options) => {
            deliveries.push({target, payload, options});
            const originalReplacementTargetMissing =
              target === TEST_ORIGINAL_REPLACEMENT_TARGET &&
              payload.type === ReplicaOperationMessageType.STEP_DOWN_REPLICA &&
              payload.reason ===
                ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION &&
              payload.replicaId === TEST_REPLACEMENT_REPLICA_ID;
            const sourceRemovalObserved =
              target === TEST_SOURCE_REMOVAL_TARGET &&
              payload.type === ReplicaOperationMessageType.REMOVE_REPLICA;
            return {
              acknowledged: true,
              status: originalReplacementTargetMissing || sourceRemovalObserved ?
                ReplicaOperationResponseStatus.NOT_FOUND :
                ReplicaOperationResponseStatus.COMPLETED,
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
          services: buildServiceRows(),
        },
      });

      coordinator.initialize();
      try {
        installAuthoritativeServicesRead(coordinator, buildServiceRows);
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
        operation.status = TEST_OPERATION_ACTIVE_STATUS;
        coordinator.workflowOwner
          .getPriorityPublicationLeaderHandoffEvidenceMap()
          .set(
            operation.operationId,
            Object.freeze({
              observedAt: Date.now(),
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            }),
          );

        const firstResult = await coordinator.executeOperation(operation);

        t.equal(
          firstResult.success,
          false,
          'source removal should defer when the original replacement target is missing locally',
        );
        t.equal(
          deliveries.length,
          1,
          'the original replacement target should be tried first',
        );
        t.equal(
          deliveries[0].target,
          TEST_ORIGINAL_REPLACEMENT_TARGET,
          'the first election nudge should target the replacement node',
        );

        const secondResult = await coordinator.executeOperation(operation);

        t.equal(
          secondResult.success,
          true,
          'source removal should proceed once the last non-source retarget completes and recovery is already safe',
        );
        t.equal(
          deliveries.length,
          3,
          'the retargeted election should continue directly into source removal',
        );
        t.equal(
          deliveries[1].target,
          TEST_ALTERNATE_REPLACEMENT_TARGET,
          'the second election nudge should retarget a non-source voter',
        );
        t.equal(
          deliveries[1].payload.replicaId,
          TEST_ALTERNATE_REPLICA_ID,
          'the retargeted election should preserve the alternate replica candidate',
        );
        t.equal(
          deliveries[2].target,
          TEST_SOURCE_REMOVAL_TARGET,
          'source removal should dispatch after replacement-election candidates are exhausted',
        );
        t.equal(
          deliveries[2].payload.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'the final dispatch should remove the source replica',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  test('RebalanceCoordinator - exact completed replacement election terminates before retry expiry can retarget it',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});

      const TEST_PARTITION_ID = 'replica_operations-p1';
      const TEST_SOURCE_NODE_ID = 'node-a';
      const TEST_ALTERNATE_NODE_ID = 'node-b';
      const TEST_STANDBY_NODE_ID = 'node-c';
      const TEST_REPLACEMENT_NODE_ID = 'node-d';
      const TEST_SOURCE_REPLICA_ID = 'replica_operations-p1-r1';
      const TEST_ALTERNATE_REPLICA_ID = 'replica_operations-p1-r2';
      const TEST_STANDBY_REPLICA_ID = 'replica_operations-p1-r3';
      const TEST_REPLACEMENT_REPLICA_ID = 'replica_operations-p1-r4';
      const TEST_REPLICA_HANDLER_TARGET_SUFFIX = '/service/replica-handler';
      const TEST_FOLLOWER_ROLE = 'follower';
      const TEST_OPERATION_ACTIVE_STATUS = 'active';
      const TEST_MIN_REPLICA_COUNT = 3;
      const TEST_REQUIRED_DISTINCT_NODE_COUNT = 2;
      const TEST_READY_NODE_IDS = Object.freeze([
        TEST_SOURCE_NODE_ID,
        TEST_ALTERNATE_NODE_ID,
        TEST_STANDBY_NODE_ID,
        TEST_REPLACEMENT_NODE_ID,
      ]);
      const TEST_EMPTY_PARTITION_IDS = Object.freeze([]);
      const TEST_ORIGINAL_REPLACEMENT_TARGET =
      `${TEST_REPLACEMENT_NODE_ID}${TEST_REPLICA_HANDLER_TARGET_SUFFIX}`;
      const TEST_SOURCE_REMOVAL_TARGET =
      `${TEST_SOURCE_NODE_ID}${TEST_REPLICA_HANDLER_TARGET_SUFFIX}`;
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
      const buildServiceRows = () => [
        createCriticalPartitionServiceRow({
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_SOURCE_REPLICA_ID,
          nodeId: TEST_SOURCE_NODE_ID,
          raftRole: null,
        }),
        createCriticalPartitionServiceRow({
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_ALTERNATE_REPLICA_ID,
          nodeId: TEST_ALTERNATE_NODE_ID,
          raftRole: TEST_FOLLOWER_ROLE,
        }),
        createCriticalPartitionServiceRow({
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_STANDBY_REPLICA_ID,
          nodeId: TEST_STANDBY_NODE_ID,
          raftRole: TEST_FOLLOWER_ROLE,
        }),
        createCriticalPartitionServiceRow({
          partitionId: TEST_PARTITION_ID,
          replicaId: TEST_REPLACEMENT_REPLICA_ID,
          nodeId: TEST_REPLACEMENT_NODE_ID,
          raftRole: TEST_FOLLOWER_ROLE,
        }),
      ];
      const coordinator = createTestCoordinator({
        nodeId: TEST_REPLACEMENT_NODE_ID,
        enableTimeouts: false,
        messageRouter: {
          deliver: async (target, payload, options) => {
            deliveries.push({target, payload, options});
            return {
              acknowledged: true,
              status: ReplicaOperationResponseStatus.COMPLETED,
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
          getPolicyForPartition: () => ({minReplicaCount: TEST_MIN_REPLICA_COUNT}),
        },
        cacheData: {
          nodes: TEST_READY_NODE_IDS.map((nodeId) => createReadyNode(nodeId)),
          services: buildServiceRows(),
        },
      });

      coordinator.initialize();
      try {
        installAuthoritativeServicesRead(coordinator, buildServiceRows);
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
        operation.status = TEST_OPERATION_ACTIVE_STATUS;
        coordinator.workflowOwner
          .getPriorityPublicationLeaderHandoffEvidenceMap()
          .set(
            operation.operationId,
            Object.freeze({
              observedAt: Date.now(),
              sourceReplicaId: TEST_SOURCE_REPLICA_ID,
            }),
          );

        const firstResult = await coordinator.executeOperation(operation);

        t.equal(
          firstResult.success,
          true,
          'the exact completed ACK should route immediately back through remove safety',
        );
        t.equal(
          deliveries[0].target,
          TEST_ORIGINAL_REPLACEMENT_TARGET,
          'the first nudge should target the original replacement node',
        );
        t.equal(
          deliveries.length,
          2,
          'one owner turn should contain only the exact election nudge and source removal',
        );
        t.equal(
          deliveries[1].target,
          TEST_SOURCE_REMOVAL_TARGET,
          'the second dispatch should return to the source node for removal',
        );
        t.equal(
          deliveries[1].payload.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'the exact ACK should be consumed before any alternate-voter retarget',
        );
        t.same(
          coordinator.workflowOwner
            .getPriorityPublicationReplacementLeaderElectionEvidenceMap()
            .get(operation.operationId)?.completedReplicaIds,
          [TEST_REPLACEMENT_REPLICA_ID],
          'the evidence owner retains the exact replacement identity',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  test('RebalanceCoordinator - authoritative service rows with missing raft_role preserve cached follower evidence while waiting for leader ownership',
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
              raftRole: null,
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
          'cached follower evidence should still wait for successor leadership despite stale authoritative role gaps',
        );
        t.equal(
          blockedResult.skipped,
          true,
          'cached follower evidence should keep the replace source-removal retryable',
        );
        t.equal(
          deliveries.length,
          1,
          'cached follower evidence should request replacement leader election first',
        );
        t.equal(
          deliveries[0].payload.type,
          ReplicaOperationMessageType.STEP_DOWN_REPLICA,
          'cached follower evidence should nudge replacement election before removal',
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

  registerQuorumConditionedRemoveSafetyTailMoreTests(context);
}
