import {registerQuorumConditionedRemoveSafetyTailFinalTests} from './quorum-conditioned-remove-safety-tail-final-test-cases.js';

const TEST_SOURCE_FOLLOWER_MISSING_LEADER_TITLE =
  'RebalanceCoordinator - source follower without canonical successor leader requests replacement election';
const TEST_LOG_LEVEL_ERROR = 'error';
const TEST_NODE_A = 'node-a';
const TEST_NODE_B = 'node-b';
const TEST_NODE_C = 'node-c';
const TEST_NODE_D = 'node-d';
const TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID =
  'control_plane_publications-p1';
const TEST_CONTROL_PLANE_PUBLICATIONS_SOURCE_REPLICA_ID =
  'control_plane_publications-p1-r1';
const TEST_CONTROL_PLANE_PUBLICATIONS_PEER_REPLICA_ID =
  'control_plane_publications-p1-r2';
const TEST_CONTROL_PLANE_PUBLICATIONS_OTHER_REPLICA_ID =
  'control_plane_publications-p1-r3';
const TEST_CONTROL_PLANE_PUBLICATIONS_REPLACEMENT_REPLICA_ID =
  'control_plane_publications-p1-r4';
const TEST_RAFT_ROLE_FOLLOWER = 'follower';
const TEST_RAFT_ROLE_LEADER = 'leader';
const TEST_OPERATION_STATUS_ACTIVE = 'active';
const TEST_CONNECTION_STATE_CONNECTED = 'connected';
const TEST_REPLICA_OPERATION_RESPONSE_INITIATED = 'initiated';
const TEST_PRIORITY_REQUIRED_DISTINCT_NODE_COUNT = 2;
const TEST_MIN_REPLICA_COUNT = 3;
const TEST_EXPECTED_REPLACEMENT_ELECTION_DELIVERY_COUNT = 1;
const TEST_EXPECTED_SOURCE_HANDOFF_AND_REPLACEMENT_ELECTION_COUNT = 2;
const TEST_REPLACEMENT_ELECTION_DELIVERY_INDEX = 1;
const TEST_CANONICAL_LEADER_NODE_ID_MISSING = null;
const TEST_REPLACEMENT_NOT_FOUND_FAILURE_TITLE =
  'RebalanceCoordinator - replacement target not-found evidence fails active REPLACE source removal';
const TEST_REPLACEMENT_NOT_FOUND_ERROR_PATTERN =
  /replacement leader election returned not_found/i;

export function registerQuorumConditionedRemoveSafetyTailMoreTests({
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
}) {
  test('RebalanceCoordinator - not-found leader handoff evidence waits for sql_transactions replacement leader ownership',
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
            if (payload.type === ReplicaOperationMessageType.STEP_DOWN_REPLICA) {
              return {
                acknowledged: true,
                status: ReplicaOperationResponseStatus.NOT_FOUND,
              };
            }
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
          'the first source removal attempt should still defer behind the handoff request',
        );
        t.equal(
          blockedResult.skipped,
          true,
          'the coordinator should request source handoff before removal',
        );
        t.equal(
          deliveries.length,
          1,
          'the first dispatch should request a leader handoff',
        );
        t.equal(
          deliveries[0].payload.type,
          ReplicaOperationMessageType.STEP_DOWN_REPLICA,
          'the source leader should receive the direct handoff request',
        );
        t.ok(
          coordinator.workflowOwner.getPriorityPublicationLeaderHandoffEvidence(
            operation,
            testSourceReplicaId,
          ),
          'a not-found handoff reply should still record explicit source-side evidence for the next retry',
        );

        const retryResult = await coordinator.executeOperation(operation);

        t.equal(
          retryResult.success,
          false,
          'fresh not-found handoff evidence should not allow source removal while the partition row still lags',
        );
        t.equal(
          retryResult.skipped,
          true,
          'replacement leader ownership should defer rather than fail terminally',
        );
        t.equal(
          deliveries.length,
          2,
          'fresh not-found handoff evidence should nudge replacement leader election while ownership is still pending',
        );
        t.equal(
          deliveries[1].payload.type,
          ReplicaOperationMessageType.STEP_DOWN_REPLICA,
          'the second dispatch should request replacement leader election through the canonical handoff lane',
        );
        t.match(
          retryResult.error,
          /replacement leader ownership pending before safe removal/i,
          'the retry should explain that replacement leader ownership is still pending',
        );

        coordinator.systemTableCache.merge(
          TEST_PARTITIONS_TABLE_NAME,
          testPartitionId,
          createCriticalPartitionRow({
            partitionId: testPartitionId,
            leaderNodeId: testReplacementNodeId,
          }),
        );

        const closureResult = await coordinator.executeOperation(operation);

        t.equal(
          closureResult.success,
          true,
          'fresh not-found handoff evidence should allow source removal once replacement leader ownership is visible',
        );
        t.equal(
          deliveries.length,
          3,
          'the final attempt should remove the old source replica after the replacement owns leadership',
        );
        t.equal(
          deliveries[2].payload.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'remove should follow after source handoff and replacement leader ownership both close',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the replace workflow should move into source removal after explicit not-found handoff evidence and replacement leader ownership',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  test(TEST_REPLACEMENT_NOT_FOUND_FAILURE_TITLE, async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: TEST_LOG_LEVEL_ERROR});

    const deliveries = [];
    const coordinator = createTestCoordinator({
      nodeId: TEST_NODE_D,
      enableTimeouts: false,
      messageRouter: {
        deliver: async (target, payload, options) => {
          deliveries.push({target, payload, options});
          if (payload.type === ReplicaOperationMessageType.STEP_DOWN_REPLICA) {
            return {
              acknowledged: true,
              status: ReplicaOperationResponseStatus.NOT_FOUND,
            };
          }
          return {
            acknowledged: true,
            status: TEST_REPLICA_OPERATION_RESPONSE_INITIATED,
          };
        },
        getConnectionState: () => TEST_CONNECTION_STATE_CONNECTED,
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
            publishedActiveNodeIds: Object.freeze([
              TEST_NODE_A,
              TEST_NODE_D,
            ]),
            recoveryActiveNodeIds: Object.freeze([
              TEST_NODE_A,
              TEST_NODE_D,
            ]),
            projectedServingNodeIds: Object.freeze([
              TEST_NODE_A,
              TEST_NODE_D,
            ]),
            publishedMembershipIncludesTargetNode: nodeId === TEST_NODE_D,
            priorityPartitionSummary: Object.freeze({
              satisfied: true,
              requiredDistinctNodeCount:
                TEST_PRIORITY_REQUIRED_DISTINCT_NODE_COUNT,
              missingPartitionIds: [],
            }),
          };
        },
        async getMembershipPublicationPlanningSnapshot(nodeId) {
          return this.getMembershipPublicationPlanningSnapshotBestEffort(
            nodeId,
          );
        },
        getMembershipPublicationPlanningSnapshotSync(nodeId) {
          return {
            publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
            publishedActiveNodeIdsPresent: true,
            publishedActiveNodeIds: Object.freeze([
              TEST_NODE_A,
              TEST_NODE_D,
            ]),
            recoveryActiveNodeIds: Object.freeze([
              TEST_NODE_A,
              TEST_NODE_D,
            ]),
            projectedServingNodeIds: Object.freeze([
              TEST_NODE_A,
              TEST_NODE_D,
            ]),
            publishedMembershipIncludesTargetNode: nodeId === TEST_NODE_D,
            priorityPartitionSummary: Object.freeze({
              satisfied: true,
              requiredDistinctNodeCount:
                TEST_PRIORITY_REQUIRED_DISTINCT_NODE_COUNT,
              missingPartitionIds: [],
            }),
          };
        },
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({
          minReplicaCount: TEST_MIN_REPLICA_COUNT,
        }),
      },
      cacheData: {
        nodes: [
          createReadyNode(TEST_NODE_A),
          createReadyNode(TEST_NODE_D),
        ],
        services: [
          createCriticalPartitionServiceRow({
            partitionId: TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
            replicaId: TEST_CONTROL_PLANE_PUBLICATIONS_SOURCE_REPLICA_ID,
            nodeId: TEST_NODE_A,
            raftRole: TEST_RAFT_ROLE_LEADER,
          }),
          createCriticalPartitionServiceRow({
            partitionId: TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
            replicaId:
              TEST_CONTROL_PLANE_PUBLICATIONS_REPLACEMENT_REPLICA_ID,
            nodeId: TEST_NODE_D,
            raftRole: TEST_RAFT_ROLE_FOLLOWER,
          }),
        ],
      },
    });

    coordinator.initialize();
    try {
      coordinator.systemTableCache.merge(
        TEST_PARTITIONS_TABLE_NAME,
        TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
        createCriticalPartitionRow({
          partitionId: TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
          leaderNodeId: TEST_NODE_A,
        }),
      );

      const operation = await coordinator.createOperation({
        type: OperationType.REPLACE,
        partitionId: TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
        nodeId: TEST_NODE_D,
        sourceNodeId: TEST_NODE_A,
        replicaId: TEST_CONTROL_PLANE_PUBLICATIONS_SOURCE_REPLICA_ID,
      });

      operation.replicaId =
        TEST_CONTROL_PLANE_PUBLICATIONS_REPLACEMENT_REPLICA_ID;
      operation.workflowStep = WORKFLOW_STEP.ACTIVE;
      operation.status = TEST_OPERATION_STATUS_ACTIVE;

      const sourceHandoffResult = await coordinator.executeOperation(
        operation,
      );
      const replacementElectionResult = await coordinator.executeOperation(
        operation,
      );
      const failedResult = await coordinator.executeOperation(operation);

      t.equal(
        sourceHandoffResult.skipped,
        true,
        'source handoff should defer the first source-removal attempt',
      );
      t.equal(
        replacementElectionResult.skipped,
        true,
        'replacement election should defer while recording target-side evidence',
      );
      t.equal(
        deliveries.length,
        TEST_EXPECTED_SOURCE_HANDOFF_AND_REPLACEMENT_ELECTION_COUNT,
        'the coordinator should request source handoff and one replacement election',
      );
      t.equal(
        deliveries[TEST_REPLACEMENT_ELECTION_DELIVERY_INDEX].payload.replicaId,
        TEST_CONTROL_PLANE_PUBLICATIONS_REPLACEMENT_REPLICA_ID,
        'replacement election should target the active replacement replica',
      );
      t.equal(
        failedResult.success,
        false,
        'target not-found evidence should fail the stale active REPLACE',
      );
      t.match(
        failedResult.error,
        TEST_REPLACEMENT_NOT_FOUND_ERROR_PATTERN,
        'the failure should preserve the target not-found safety reason',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.FAILED,
        'the failed target proof should release the operation for cleanup planning',
      );
    } finally {
      await coordinator.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

  test(TEST_SOURCE_FOLLOWER_MISSING_LEADER_TITLE, async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: TEST_LOG_LEVEL_ERROR});

    const deliveries = [];
    const coordinator = createTestCoordinator({
      nodeId: TEST_NODE_D,
      enableTimeouts: false,
      messageRouter: {
        deliver: async (target, payload, options) => {
          deliveries.push({target, payload, options});
          return {
            acknowledged: true,
            status: TEST_REPLICA_OPERATION_RESPONSE_INITIATED,
          };
        },
        getConnectionState: () => TEST_CONNECTION_STATE_CONNECTED,
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
            publishedActiveNodeIds: Object.freeze([
              TEST_NODE_A,
              TEST_NODE_B,
              TEST_NODE_C,
              TEST_NODE_D,
            ]),
            recoveryActiveNodeIds: Object.freeze([
              TEST_NODE_A,
              TEST_NODE_B,
              TEST_NODE_C,
              TEST_NODE_D,
            ]),
            projectedServingNodeIds: Object.freeze([
              TEST_NODE_A,
              TEST_NODE_B,
              TEST_NODE_C,
              TEST_NODE_D,
            ]),
            publishedMembershipIncludesTargetNode: nodeId === TEST_NODE_D,
            priorityPartitionSummary: Object.freeze({
              satisfied: true,
              requiredDistinctNodeCount:
                TEST_PRIORITY_REQUIRED_DISTINCT_NODE_COUNT,
              missingPartitionIds: [],
            }),
          };
        },
        async getMembershipPublicationPlanningSnapshot(nodeId) {
          return this.getMembershipPublicationPlanningSnapshotBestEffort(
            nodeId,
          );
        },
        getMembershipPublicationPlanningSnapshotSync(nodeId) {
          return {
            publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
            publishedActiveNodeIdsPresent: true,
            publishedActiveNodeIds: Object.freeze([
              TEST_NODE_A,
              TEST_NODE_B,
              TEST_NODE_C,
              TEST_NODE_D,
            ]),
            recoveryActiveNodeIds: Object.freeze([
              TEST_NODE_A,
              TEST_NODE_B,
              TEST_NODE_C,
              TEST_NODE_D,
            ]),
            projectedServingNodeIds: Object.freeze([
              TEST_NODE_A,
              TEST_NODE_B,
              TEST_NODE_C,
              TEST_NODE_D,
            ]),
            publishedMembershipIncludesTargetNode: nodeId === TEST_NODE_D,
            priorityPartitionSummary: Object.freeze({
              satisfied: true,
              requiredDistinctNodeCount:
                TEST_PRIORITY_REQUIRED_DISTINCT_NODE_COUNT,
              missingPartitionIds: [],
            }),
          };
        },
      },
      tablePolicyService: {
        getPolicyForPartition: () => ({
          minReplicaCount: TEST_MIN_REPLICA_COUNT,
        }),
      },
      cacheData: {
        nodes: [
          createReadyNode(TEST_NODE_A),
          createReadyNode(TEST_NODE_B),
          createReadyNode(TEST_NODE_C),
          createReadyNode(TEST_NODE_D),
        ],
        services: [
          createCriticalPartitionServiceRow({
            partitionId: TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
            replicaId: TEST_CONTROL_PLANE_PUBLICATIONS_SOURCE_REPLICA_ID,
            nodeId: TEST_NODE_A,
            raftRole: TEST_RAFT_ROLE_FOLLOWER,
          }),
          createCriticalPartitionServiceRow({
            partitionId: TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
            replicaId: TEST_CONTROL_PLANE_PUBLICATIONS_PEER_REPLICA_ID,
            nodeId: TEST_NODE_B,
            raftRole: TEST_RAFT_ROLE_FOLLOWER,
          }),
          createCriticalPartitionServiceRow({
            partitionId: TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
            replicaId: TEST_CONTROL_PLANE_PUBLICATIONS_OTHER_REPLICA_ID,
            nodeId: TEST_NODE_C,
            raftRole: TEST_RAFT_ROLE_FOLLOWER,
          }),
          createCriticalPartitionServiceRow({
            partitionId: TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
            replicaId: TEST_CONTROL_PLANE_PUBLICATIONS_REPLACEMENT_REPLICA_ID,
            nodeId: TEST_NODE_D,
            raftRole: TEST_RAFT_ROLE_FOLLOWER,
          }),
        ],
      },
    });

    coordinator.initialize();
    try {
      coordinator.systemTableCache.merge(
        TEST_PARTITIONS_TABLE_NAME,
        TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
        createCriticalPartitionRow({
          partitionId: TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
          leaderNodeId: TEST_CANONICAL_LEADER_NODE_ID_MISSING,
        }),
      );

      const operation = await coordinator.createOperation({
        type: OperationType.REPLACE,
        partitionId: TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
        nodeId: TEST_NODE_D,
        sourceNodeId: TEST_NODE_A,
        replicaId: TEST_CONTROL_PLANE_PUBLICATIONS_SOURCE_REPLICA_ID,
      });

      operation.replicaId =
        TEST_CONTROL_PLANE_PUBLICATIONS_REPLACEMENT_REPLICA_ID;
      operation.workflowStep = WORKFLOW_STEP.ACTIVE;
      operation.status = TEST_OPERATION_STATUS_ACTIVE;

      const blockedResult = await coordinator.executeOperation(operation);

      t.equal(
        blockedResult.success,
        false,
        'source follower evidence alone should not permit removal when canonical leadership is missing',
      );
      t.equal(
        blockedResult.skipped,
        true,
        'missing canonical successor leadership should defer source removal',
      );
      t.equal(
        deliveries.length,
        TEST_EXPECTED_REPLACEMENT_ELECTION_DELIVERY_COUNT,
        'the coordinator should request replacement leader election first',
      );
      t.equal(
        deliveries[0].payload.type,
        ReplicaOperationMessageType.STEP_DOWN_REPLICA,
        'replacement leader election should use the canonical handoff lane',
      );
      t.equal(
        deliveries[0].payload.replicaId,
        TEST_CONTROL_PLANE_PUBLICATIONS_REPLACEMENT_REPLICA_ID,
        'replacement election should target the replacement replica',
      );
    } finally {
      await coordinator.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

  test('RebalanceCoordinator - requests leader handoff before removing sql_write_operations source when authority does not prove a follower',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});

      const deliveries = [];
      const coordinator = createTestCoordinator({
        nodeId: 'node-d',
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
              publishedMembershipIncludesTargetNode: nodeId === 'node-d',
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
              publishedMembershipIncludesTargetNode: nodeId === 'node-d',
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
              partitionId: 'sql_write_operations-p1',
              replicaId: 'sql_write_operations-p1-r1',
              nodeId: 'node-a',
              raftRole: null,
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'sql_write_operations-p1',
              replicaId: 'sql_write_operations-p1-r2',
              nodeId: 'node-b',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'sql_write_operations-p1',
              replicaId: 'sql_write_operations-p1-r3',
              nodeId: 'node-c',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'sql_write_operations-p1',
              replicaId: 'sql_write_operations-p1-r4',
              nodeId: 'node-d',
              raftRole: 'follower',
            }),
          ],
        },
      });

      coordinator.initialize();
      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'sql_write_operations-p1',
          nodeId: 'node-d',
          sourceNodeId: 'node-a',
          replicaId: 'sql_write_operations-p1-r1',
        });

        operation.replicaId = 'sql_write_operations-p1-r4';
        operation.workflowStep = WORKFLOW_STEP.ACTIVE;
        operation.status = 'active';

        const blockedResult = await coordinator.executeOperation(operation);

        t.equal(
          blockedResult.success,
          false,
          'source removal should stay deferred until authority proves the source is no longer leader',
        );
        t.equal(
          blockedResult.skipped,
          true,
          'missing source-leader authority should defer rather than fail terminally',
        );
        t.equal(
          deliveries.length,
          1,
          'the first dispatch should request a leader handoff when the source role is unknown',
        );
        t.equal(
          deliveries[0].payload.type,
          ReplicaOperationMessageType.STEP_DOWN_REPLICA,
          'unknown source role should still request a direct leader handoff',
        );

        coordinator.systemTableCache.merge('services', 'sql_write_operations-p1-r1', {
          raft_role: 'follower',
        });
        coordinator.systemTableCache.merge(
          TEST_PARTITIONS_TABLE_NAME,
          'sql_write_operations-p1',
          createCriticalPartitionRow({
            partitionId: 'sql_write_operations-p1',
            leaderNodeId: 'node-d',
          }),
        );

        const retryResult = await coordinator.executeOperation(operation);

        t.equal(
          retryResult.success,
          true,
          'source removal should dispatch after replacement leader ownership is visible',
        );
        t.equal(
          deliveries.length,
          2,
          'the second dispatch should remove the old source replica',
        );
        t.equal(
          deliveries[1].payload.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'remove should follow once follower authority is explicit',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the replace workflow should move into source removal after follower authority appears',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  test('RebalanceCoordinator - fails priority REPLACE source removal when the replacement target is outside the eligible recovery cohort',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});

      const deliveries = [];
      const coordinator = createTestCoordinator({
        nodeId: 'node-d',
        enableTimeouts: false,
        messageRouter: {
          deliver: async () => {
            deliveries.push('deliver');
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
              publishedActiveNodeIdsPresent: true,
              publishedActiveNodeIds: Object.freeze(['node-a', 'node-b', 'node-c']),
              recoveryActiveNodeIds: Object.freeze([
                'node-a',
                'node-b',
                'node-c',
              ]),
              projectedServingNodeIds: Object.freeze([
                'node-a',
                'node-b',
                'node-c',
              ]),
              publishedMembershipIncludesTargetNode: nodeId === 'node-d',
              priorityPartitionSummary: Object.freeze({
                satisfied: false,
                requiredDistinctNodeCount: 2,
                missingPartitionIds: ['replica_operations-p1'],
              }),
            };
          },
          async getMembershipPublicationPlanningSnapshot(nodeId) {
            return {
              publishedActiveNodeIdsPresent: true,
              publishedActiveNodeIds: Object.freeze(['node-a', 'node-b', 'node-c']),
              recoveryActiveNodeIds: Object.freeze([
                'node-a',
                'node-b',
                'node-c',
              ]),
              projectedServingNodeIds: Object.freeze([
                'node-a',
                'node-b',
                'node-c',
              ]),
              publishedMembershipIncludesTargetNode: nodeId === 'node-d',
              priorityPartitionSummary: Object.freeze({
                satisfied: false,
                requiredDistinctNodeCount: 2,
                missingPartitionIds: ['replica_operations-p1'],
              }),
            };
          },
          getMembershipPublicationPlanningSnapshotSync(nodeId) {
            return {
              publishedActiveNodeIdsPresent: true,
              publishedActiveNodeIds: Object.freeze(['node-a', 'node-b', 'node-c']),
              recoveryActiveNodeIds: Object.freeze([
                'node-a',
                'node-b',
                'node-c',
              ]),
              projectedServingNodeIds: Object.freeze([
                'node-a',
                'node-b',
                'node-c',
              ]),
              publishedMembershipIncludesTargetNode: nodeId === 'node-d',
              priorityPartitionSummary: Object.freeze({
                satisfied: false,
                requiredDistinctNodeCount: 2,
                missingPartitionIds: ['replica_operations-p1'],
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
              partitionId: 'replica_operations-p1',
              replicaId: 'replica_operations-p1-r1',
              nodeId: 'node-a',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'replica_operations-p1',
              replicaId: 'replica_operations-p1-r2',
              nodeId: 'node-b',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'replica_operations-p1',
              replicaId: 'replica_operations-p1-r3',
              nodeId: 'node-c',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'replica_operations-p1',
              replicaId: 'replica_operations-p1-r4',
              nodeId: 'node-d',
              raftRole: 'leader',
            }),
          ],
        },
      });

      coordinator.initialize();
      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'replica_operations-p1',
          nodeId: 'node-d',
          sourceNodeId: 'node-a',
          replicaId: 'replica_operations-p1-r1',
        });

        operation.replicaId = 'replica_operations-p1-r4';
        operation.workflowStep = WORKFLOW_STEP.ACTIVE;
        operation.status = 'active';

        const result = await coordinator.executeOperation(operation);

        t.equal(
          result.success,
          false,
          'priority source removal should fail when completion proves the replacement target is outside the eligible recovery cohort',
        );
        t.equal(
          result.skipped,
          undefined,
          'priority source removal should use the terminal failure path instead of a deferred retry',
        );
        t.equal(
          deliveries.length,
          0,
          'priority source removal should not dispatch while the target is still outside the recovery cohort',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.FAILED,
          'the source remove phase should stop blocking fresh priority recovery work',
        );
        t.match(
          String(result.error || operation.errorMessage || ''),
          /eligible recovery cohort|eligible cohort/i,
          'the failure should explain the current recovery cohort mismatch',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  test('RebalanceCoordinator - dispatches priority REPLACE source removal when projected serving augments a stale explicit recovery cohort',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});

      const deliveries = [];
      const coordinator = createTestCoordinator({
        nodeId: 'node-d',
        enableTimeouts: false,
        messageRouter: {
          deliver: async () => {
            deliveries.push('deliver');
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
              publishedActiveNodeIdsPresent: true,
              publishedActiveNodeIds: Object.freeze(['node-a', 'node-b', 'node-c']),
              recoveryActiveNodeIds: Object.freeze([
                'node-a',
                'node-b',
                'node-c',
              ]),
              projectedServingNodeIds: Object.freeze([
                'node-a',
                'node-b',
                'node-c',
                'node-d',
              ]),
              locallyEligibleNodeIds: Object.freeze([
                'node-a',
                'node-b',
                'node-c',
                'node-d',
              ]),
              publishedMembershipIncludesTargetNode: nodeId === 'node-d',
              priorityPartitionSummary: Object.freeze({
                satisfied: false,
                requiredDistinctNodeCount: 2,
                missingPartitionIds: ['replica_operations-p1'],
              }),
            };
          },
          async getMembershipPublicationPlanningSnapshot(nodeId) {
            return {
              publishedActiveNodeIdsPresent: true,
              publishedActiveNodeIds: Object.freeze(['node-a', 'node-b', 'node-c']),
              recoveryActiveNodeIds: Object.freeze([
                'node-a',
                'node-b',
                'node-c',
              ]),
              projectedServingNodeIds: Object.freeze([
                'node-a',
                'node-b',
                'node-c',
                'node-d',
              ]),
              locallyEligibleNodeIds: Object.freeze([
                'node-a',
                'node-b',
                'node-c',
                'node-d',
              ]),
              publishedMembershipIncludesTargetNode: nodeId === 'node-d',
              priorityPartitionSummary: Object.freeze({
                satisfied: false,
                requiredDistinctNodeCount: 2,
                missingPartitionIds: ['replica_operations-p1'],
              }),
            };
          },
          getMembershipPublicationPlanningSnapshotSync(nodeId) {
            return {
              publishedActiveNodeIdsPresent: true,
              publishedActiveNodeIds: Object.freeze(['node-a', 'node-b', 'node-c']),
              recoveryActiveNodeIds: Object.freeze([
                'node-a',
                'node-b',
                'node-c',
              ]),
              projectedServingNodeIds: Object.freeze([
                'node-a',
                'node-b',
                'node-c',
                'node-d',
              ]),
              locallyEligibleNodeIds: Object.freeze([
                'node-a',
                'node-b',
                'node-c',
                'node-d',
              ]),
              publishedMembershipIncludesTargetNode: nodeId === 'node-d',
              priorityPartitionSummary: Object.freeze({
                satisfied: false,
                requiredDistinctNodeCount: 2,
                missingPartitionIds: ['replica_operations-p1'],
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
              partitionId: 'replica_operations-p1',
              replicaId: 'replica_operations-p1-r1',
              nodeId: 'node-a',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'replica_operations-p1',
              replicaId: 'replica_operations-p1-r2',
              nodeId: 'node-b',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'replica_operations-p1',
              replicaId: 'replica_operations-p1-r3',
              nodeId: 'node-c',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'replica_operations-p1',
              replicaId: 'replica_operations-p1-r4',
              nodeId: 'node-d',
              raftRole: 'leader',
            }),
          ],
        },
      });

      coordinator.initialize();
      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'replica_operations-p1',
          nodeId: 'node-d',
          sourceNodeId: 'node-a',
          replicaId: 'replica_operations-p1-r1',
        });

        operation.replicaId = 'replica_operations-p1-r4';
        operation.workflowStep = WORKFLOW_STEP.ACTIVE;
        operation.status = 'active';

        const result = await coordinator.executeOperation(operation);

        t.equal(
          result.success,
          true,
          'priority source removal should dispatch once fresher projected-serving evidence augments the stale explicit recovery cohort',
        );
        t.equal(
          deliveries.length,
          1,
          'the remove gate should consume the merged recovery cohort instead of restating the stale explicit list',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the source remove phase should progress once the merged recovery cohort satisfies the shared completion contract',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  test('RebalanceCoordinator - dispatches priority REPLACE source removal when recovery projection covers projected voters after published membership lags',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});

      const deliveries = [];
      const projectedPlanningSnapshot = Object.freeze({
        publishedActiveNodeIdsPresent: true,
        publishedActiveNodeIds: Object.freeze(['node-a', 'node-b', 'node-c']),
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
        locallyEligibleNodeIds: Object.freeze([
          'node-a',
          'node-b',
          'node-c',
          'node-d',
        ]),
        publishedMembershipIncludesTargetNode: false,
        priorityPartitionSummary: Object.freeze({
          satisfied: true,
          requiredDistinctNodeCount: 2,
        }),
      });
      const coordinator = createTestCoordinator({
        nodeId: 'node-d',
        enableTimeouts: false,
        messageRouter: {
          deliver: async () => {
            deliveries.push('deliver');
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
          async getMembershipPublicationPlanningSnapshotBestEffort() {
            return projectedPlanningSnapshot;
          },
          async getMembershipPublicationPlanningSnapshot() {
            return projectedPlanningSnapshot;
          },
          getMembershipPublicationPlanningSnapshotSync() {
            return projectedPlanningSnapshot;
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
              partitionId: 'replica_operations-p1',
              replicaId: 'replica_operations-p1-r1',
              nodeId: 'node-a',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'replica_operations-p1',
              replicaId: 'replica_operations-p1-r2',
              nodeId: 'node-b',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'replica_operations-p1',
              replicaId: 'replica_operations-p1-r3',
              nodeId: 'node-c',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'replica_operations-p1',
              replicaId: 'replica_operations-p1-r4',
              nodeId: 'node-d',
              raftRole: 'leader',
            }),
          ],
        },
      });

      coordinator.initialize();
      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'replica_operations-p1',
          nodeId: 'node-d',
          sourceNodeId: 'node-a',
          replicaId: 'replica_operations-p1-r1',
        });

        operation.replicaId = 'replica_operations-p1-r4';
        operation.workflowStep = WORKFLOW_STEP.ACTIVE;
        operation.status = 'active';

        const result = await coordinator.executeOperation(operation);

        t.equal(
          result.success,
          true,
          'priority source removal should dispatch when the planning owner already projects the full voter-ready recovery cohort',
        );
        t.equal(
          deliveries.length,
          1,
          'remove safety should trust the canonical recovery projection instead of restating the stale durable published membership',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the source remove phase should progress once the recovery projection covers the projected voter-ready set',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  test('RebalanceCoordinator - dispatches priority REPLACE source removal when canonical recovery completion outruns stale voter-ready counts',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});

      const deliveries = [];
      const convergedPlanningSnapshot = Object.freeze({
        publishedActiveNodeIdsPresent: true,
        publishedActiveNodeIds: Object.freeze([
          'node-a',
          'node-b',
          'node-c',
        ]),
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
        locallyEligibleNodeIds: Object.freeze([
          'node-a',
          'node-b',
          'node-c',
          'node-d',
        ]),
        publishedMembershipIncludesTargetNode: false,
        priorityPartitionSummary: Object.freeze({
          satisfied: true,
          requiredDistinctNodeCount: 3,
        }),
      });
      const coordinator = createTestCoordinator({
        nodeId: 'node-d',
        enableTimeouts: false,
        messageRouter: {
          deliver: async () => {
            deliveries.push('deliver');
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
          async getMembershipPublicationPlanningSnapshotBestEffort() {
            return convergedPlanningSnapshot;
          },
          async getMembershipPublicationPlanningSnapshot() {
            return convergedPlanningSnapshot;
          },
          getMembershipPublicationPlanningSnapshotSync() {
            return convergedPlanningSnapshot;
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
              partitionId: 'replica_operations-p1',
              replicaId: 'replica_operations-p1-r1',
              nodeId: 'node-a',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'replica_operations-p1',
              replicaId: 'replica_operations-p1-r2',
              nodeId: 'node-b',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'replica_operations-p1',
              replicaId: 'replica_operations-p1-r4',
              nodeId: 'node-d',
              raftRole: 'leader',
            }),
          ],
        },
      });

      coordinator.initialize();
      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'replica_operations-p1',
          nodeId: 'node-d',
          sourceNodeId: 'node-a',
          replicaId: 'replica_operations-p1-r1',
        });

        operation.replicaId = 'replica_operations-p1-r4';
        operation.workflowStep = WORKFLOW_STEP.ACTIVE;
        operation.status = 'active';

        const result = await coordinator.executeOperation(operation);

        t.equal(
          result.success,
          true,
          'priority source removal should dispatch once canonical completion reports recovery satisfied even while the local voter-ready count is stale',
        );
        t.equal(
          deliveries.length,
          1,
          'the remove gate should trust the canonical completion contract instead of the stale 2-of-3 cache view',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the source remove phase should progress once canonical completion outruns the stale voter-ready count',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  test('RebalanceCoordinator - canonical recovery completion separates replacement voter topology from stale owner-read admission',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      const testLogLevel = 'error';
      LoggingService.getInstance().initialize({level: testLogLevel});

      const testSourceNodeId = 'node-a';
      const testPeerNodeId = 'node-b';
      const testOtherNodeId = 'node-c';
      const testReplacementNodeId = 'node-d';
      const testPartitionId = 'sql_transactions-p1';
      const testSourceReplicaId = 'sql_transactions-p1-r1';
      const testPeerReplicaId = 'sql_transactions-p1-r2';
      const testOtherReplicaId = 'sql_transactions-p1-r3';
      const testReplacementReplicaId = 'sql_transactions-p1-r4';
      const testDeliveryMarker = 'deliver';
      const testInitiatedStatus = 'initiated';
      const testBlockedDecision = 'blocked';
      const testReadyDecision = 'ready';
      const testStaleOwnerReadAdmissionReason =
      'stale_owner_read_admission';
      const testLeaderRole = 'leader';
      const testFollowerRole = 'follower';
      const testActiveOperationStatus = 'active';
      const testRequiredDistinctNodeCount = 3;
      const testMinReplicaCount = 3;
      const deliveries = [];
      const convergedPlanningSnapshot = Object.freeze({
        publishedActiveNodeIdsPresent: true,
        publishedActiveNodeIds: Object.freeze([
          testSourceNodeId,
          testPeerNodeId,
          testOtherNodeId,
          testReplacementNodeId,
        ]),
        recoveryActiveNodeIds: Object.freeze([
          testSourceNodeId,
          testPeerNodeId,
          testOtherNodeId,
          testReplacementNodeId,
        ]),
        projectedServingNodeIds: Object.freeze([
          testSourceNodeId,
          testPeerNodeId,
          testOtherNodeId,
          testReplacementNodeId,
        ]),
        locallyEligibleNodeIds: Object.freeze([
          testSourceNodeId,
          testPeerNodeId,
          testOtherNodeId,
          testReplacementNodeId,
        ]),
        publishedMembershipIncludesTargetNode: true,
        priorityPartitionSummary: Object.freeze({
          satisfied: true,
          requiredDistinctNodeCount: testRequiredDistinctNodeCount,
        }),
      });
      const coordinator = createTestCoordinator({
        nodeId: testReplacementNodeId,
        enableTimeouts: false,
        messageRouter: {
          deliver: async () => {
            deliveries.push(testDeliveryMarker);
            return {acknowledged: true, status: testInitiatedStatus};
          },
          getConnectionState: () => 'connected',
          pingNode: async () => true,
          isOutboundQueueAvailable: () => true,
        },
        controlPlaneReadinessService: {
          getControlPlaneParticipationSync(nodeId, options = {}) {
            if (
              nodeId === testReplacementNodeId &&
            options?.participationKind === OWNER_READ_PARTICIPATION_KIND &&
            options?.decisionDimension === REMOVE_SAFETY_DECISION_DIMENSION
            ) {
              return {
                eligible: false,
                decision: testBlockedDecision,
                reasonCodes: Object.freeze([testStaleOwnerReadAdmissionReason]),
              };
            }
            return {
              eligible: true,
              decision: testReadyDecision,
              reasonCodes: Object.freeze([]),
            };
          },
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
          async getMembershipPublicationPlanningSnapshotBestEffort() {
            return convergedPlanningSnapshot;
          },
          async getMembershipPublicationPlanningSnapshot() {
            return convergedPlanningSnapshot;
          },
          getMembershipPublicationPlanningSnapshotSync() {
            return convergedPlanningSnapshot;
          },
        },
        tablePolicyService: {
          getPolicyForPartition: () => ({
            minReplicaCount: testMinReplicaCount,
          }),
        },
        cacheData: {
          nodes: [
            createReadyNode(testSourceNodeId),
            createReadyNode(testPeerNodeId),
            createReadyNode(testOtherNodeId),
            createReadyNode(testReplacementNodeId),
          ],
          partitions: [
            createCriticalPartitionRow({
              partitionId: testPartitionId,
              leaderNodeId: testReplacementNodeId,
            }),
          ],
          services: [
            createCriticalPartitionServiceRow({
              partitionId: testPartitionId,
              replicaId: testSourceReplicaId,
              nodeId: testSourceNodeId,
              raftRole: testFollowerRole,
            }),
            createCriticalPartitionServiceRow({
              partitionId: testPartitionId,
              replicaId: testPeerReplicaId,
              nodeId: testPeerNodeId,
              raftRole: testFollowerRole,
            }),
            createCriticalPartitionServiceRow({
              partitionId: testPartitionId,
              replicaId: testOtherReplicaId,
              nodeId: testOtherNodeId,
              raftRole: testFollowerRole,
            }),
            createCriticalPartitionServiceRow({
              partitionId: testPartitionId,
              replicaId: testReplacementReplicaId,
              nodeId: testReplacementNodeId,
              raftRole: testLeaderRole,
            }),
          ],
        },
      });

      coordinator.initialize();
      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: testPartitionId,
          nodeId: testReplacementNodeId,
          sourceNodeId: testSourceNodeId,
          replicaId: testSourceReplicaId,
        });

        operation.replicaId = testReplacementReplicaId;
        operation.workflowStep = WORKFLOW_STEP.ACTIVE;
        operation.status = testActiveOperationStatus;

        const result = await coordinator.executeOperation(operation);

        t.equal(
          result.success,
          true,
          'canonical completion should let source removal use the replacement voter row despite stale owner-read admission',
        );
        t.equal(
          deliveries.length,
          1,
          'the source removal dispatch should not restate stale admission as a voter-readiness blocker',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the replace workflow should advance once replacement voter topology and canonical completion agree',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  test('RebalanceCoordinator - keeps priority REPLACE source removal deferred when authoritative visibility is unresolved despite locally safe spread',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});

      const deliveries = [];
      const convergedPlanningSnapshot = Object.freeze({
        publishedActiveNodeIdsPresent: true,
        publishedActiveNodeIds: Object.freeze([
          'node-a',
          'node-b',
          'node-c',
          'node-d',
        ]),
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
        locallyEligibleNodeIds: Object.freeze([
          'node-a',
          'node-b',
          'node-c',
          'node-d',
        ]),
        publishedMembershipIncludesTargetNode: true,
        priorityPartitionSummary: Object.freeze({
          satisfied: true,
          requiredDistinctNodeCount: 3,
        }),
      });
      const coordinator = createTestCoordinator({
        nodeId: 'node-d',
        enableTimeouts: false,
        messageRouter: {
          deliver: async () => {
            deliveries.push('deliver');
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
          async getMembershipPublicationPlanningSnapshotBestEffort() {
            return convergedPlanningSnapshot;
          },
          async getMembershipPublicationPlanningSnapshot() {
            return convergedPlanningSnapshot;
          },
          getMembershipPublicationPlanningSnapshotSync() {
            return convergedPlanningSnapshot;
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
              partitionId: 'replica_operations-p1',
              replicaId: 'replica_operations-p1-r1',
              nodeId: 'node-a',
              raftRole: 'leader',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'replica_operations-p1',
              replicaId: 'replica_operations-p1-r2',
              nodeId: 'node-b',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'replica_operations-p1',
              replicaId: 'replica_operations-p1-r3',
              nodeId: 'node-c',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'replica_operations-p1',
              replicaId: 'replica_operations-p1-r4',
              nodeId: 'node-d',
              raftRole: 'follower',
            }),
          ],
        },
      });

      coordinator.initialize();
      coordinator.repository.getLastIncompleteOperationReadOutcome = () => ({
        completionState: 'operation_visibility_deferred',
        retryAfterMs: 250,
      });
      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'replica_operations-p1',
          nodeId: 'node-d',
          sourceNodeId: 'node-a',
          replicaId: 'replica_operations-p1-r1',
        });

        operation.replicaId = 'replica_operations-p1-r4';
        operation.workflowStep = WORKFLOW_STEP.ACTIVE;
        operation.status = 'active';

        const result = await coordinator.executeOperation(operation);

        t.equal(
          result.success,
          false,
          'priority source removal should stay deferred while the shared visibility contract remains unresolved',
        );
        t.equal(
          result.skipped,
          true,
          'priority source removal should keep the canonical defer path instead of falling through to local membership math',
        );
        t.equal(
          result.deferReason,
          REBALANCE_COORDINATOR_DEFER_REASON.REPLACE_REMOVE_SAFETY_BLOCKED,
          'priority source removal should preserve the canonical replace-remove safety defer reason',
        );
        t.match(
          result.error,
          /operation visibility is deferred for safe removal/,
          'the defer should explain that authoritative visibility is still unresolved',
        );
        t.equal(
          deliveries.length,
          0,
          'priority source removal should not dispatch while authoritative visibility is unresolved',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.ACTIVE,
          'the source remove phase should remain deferred while the shared visibility contract is unresolved',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });


  registerQuorumConditionedRemoveSafetyTailFinalTests({
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
  });
}
