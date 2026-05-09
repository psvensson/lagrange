import {registerQuorumConditionedRemoveSafetyTailMoreTests} from './quorum-conditioned-remove-safety-tail-more-test-cases.js';

export function registerQuorumConditionedRemoveSafetyTailTests({
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
}) {
  test('RebalanceCoordinator - dispatches priority REPLACE source removal when recovery completion is spread-satisfied in flight and source is not leader',
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
          'priority source removal should dispatch once the shared completion contract reports spread-satisfied in flight',
        );
        t.equal(
          deliveries.length,
          1,
          'priority source removal should use the canonical completion contract instead of restating local spread math',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the source remove phase should progress once the completion contract is satisfied',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  test('RebalanceCoordinator - requests leader handoff before removing replica_operations source leader during REPLACE',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});

      const TEST_REPLICA_OPERATIONS_PARTITION_ID = 'replica_operations-p1';
      const TEST_SOURCE_NODE_ID = 'node-a';
      const TEST_REPLACEMENT_NODE_ID = 'node-d';
      const TEST_SOURCE_REPLICA_ID = 'replica_operations-p1-r1';
      const TEST_REPLICA_B_ID = 'replica_operations-p1-r2';
      const TEST_REPLICA_C_ID = 'replica_operations-p1-r3';
      const TEST_REPLACEMENT_REPLICA_ID = 'replica_operations-p1-r4';
      const deliveries = [];
      const coordinator = createTestCoordinator({
        nodeId: TEST_REPLACEMENT_NODE_ID,
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
              publishedMembershipIncludesTargetNode:
              nodeId === TEST_REPLACEMENT_NODE_ID,
              priorityPartitionSummary: Object.freeze({
                satisfied: true,
                requiredDistinctNodeCount: 2,
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
              publishedMembershipIncludesTargetNode:
              nodeId === TEST_REPLACEMENT_NODE_ID,
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
            createReadyNode(TEST_SOURCE_NODE_ID),
            createReadyNode('node-b'),
            createReadyNode('node-c'),
            createReadyNode(TEST_REPLACEMENT_NODE_ID),
          ],
          services: [
            createCriticalPartitionServiceRow({
              partitionId: TEST_REPLICA_OPERATIONS_PARTITION_ID,
              replicaId: TEST_SOURCE_REPLICA_ID,
              nodeId: TEST_SOURCE_NODE_ID,
              raftRole: 'leader',
            }),
            createCriticalPartitionServiceRow({
              partitionId: TEST_REPLICA_OPERATIONS_PARTITION_ID,
              replicaId: TEST_REPLICA_B_ID,
              nodeId: 'node-b',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: TEST_REPLICA_OPERATIONS_PARTITION_ID,
              replicaId: TEST_REPLICA_C_ID,
              nodeId: 'node-c',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: TEST_REPLICA_OPERATIONS_PARTITION_ID,
              replicaId: TEST_REPLACEMENT_REPLICA_ID,
              nodeId: TEST_REPLACEMENT_NODE_ID,
              raftRole: 'follower',
            }),
          ],
        },
      });

      coordinator.initialize();
      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: TEST_REPLICA_OPERATIONS_PARTITION_ID,
          nodeId: TEST_REPLACEMENT_NODE_ID,
          sourceNodeId: TEST_SOURCE_NODE_ID,
          replicaId: TEST_SOURCE_REPLICA_ID,
        });

        operation.replicaId = TEST_REPLACEMENT_REPLICA_ID;
        operation.workflowStep = WORKFLOW_STEP.ACTIVE;
        operation.status = 'active';

        const blockedResult = await coordinator.executeOperation(operation);

        t.equal(
          blockedResult.success,
          false,
          'replica operation source removal should stay deferred until the current leader steps down',
        );
        t.equal(
          blockedResult.skipped,
          true,
          'replica operation leader handoff should defer rather than fail terminally',
        );
        t.equal(
          deliveries.length,
          1,
          'the first dispatch should request a leader handoff',
        );
        t.equal(
          deliveries[0].payload.type,
          ReplicaOperationMessageType.STEP_DOWN_REPLICA,
          'the replica operation source leader should receive a handoff request before removal',
        );

        coordinator.systemTableCache.merge('services', TEST_SOURCE_REPLICA_ID, {
          raft_role: 'follower',
        });
        coordinator.systemTableCache.merge(
          TEST_PARTITIONS_TABLE_NAME,
          TEST_REPLICA_OPERATIONS_PARTITION_ID,
          createCriticalPartitionRow({
            partitionId: TEST_REPLICA_OPERATIONS_PARTITION_ID,
            leaderNodeId: TEST_REPLACEMENT_NODE_ID,
          }),
        );

        const retryResult = await coordinator.executeOperation(operation);

        t.equal(
          retryResult.success,
          true,
          'replica operation source removal should dispatch after replacement leader ownership is visible',
        );
        t.equal(
          deliveries.length,
          2,
          'the second dispatch should remove the old replica operation source replica',
        );
        t.equal(
          deliveries[1].payload.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'the remove request should follow the replica operation source handoff request',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the replace workflow should move into source removal once replica operation handoff is complete',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  test('RebalanceCoordinator - keeps control-plane publication leader source removal deferred while publication is ACK_PENDING',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});

      const deliveries = [];
      let publicationStatus = TEST_PUBLICATION_STATUS_ACK_PENDING;
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
              publicationStatus,
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
                satisfied: false,
                requiredDistinctNodeCount: 2,
                missingPartitionIds: ['replica_operations-p1'],
              }),
            };
          },
          async getMembershipPublicationPlanningSnapshot(nodeId) {
            return this.getMembershipPublicationPlanningSnapshotBestEffort(nodeId);
          },
          getMembershipPublicationPlanningSnapshotSync(nodeId) {
            return {
              publicationStatus,
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
              partitionId: 'control_plane_publications-p1',
              replicaId: 'control_plane_publications-p1-r1',
              nodeId: 'node-a',
              raftRole: 'leader',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'control_plane_publications-p1',
              replicaId: 'control_plane_publications-p1-r2',
              nodeId: 'node-b',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'control_plane_publications-p1',
              replicaId: 'control_plane_publications-p1-r3',
              nodeId: 'node-c',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'control_plane_publications-p1',
              replicaId: 'control_plane_publications-p1-r4',
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
          partitionId: 'control_plane_publications-p1',
          nodeId: 'node-d',
          sourceNodeId: 'node-a',
          replicaId: 'control_plane_publications-p1-r1',
        });

        operation.replicaId = 'control_plane_publications-p1-r4';
        operation.workflowStep = WORKFLOW_STEP.ACTIVE;
        operation.status = 'active';

        const blockedResult = await coordinator.executeOperation(operation);

        t.equal(
          blockedResult.success,
          false,
          'control-plane publication leader source removal should not dispatch while publication is still ACK_PENDING',
        );
        t.equal(
          blockedResult.skipped,
          true,
          'control-plane publication leader source removal should defer rather than fail terminally',
        );
        t.equal(
          blockedResult.deferReason,
          REBALANCE_COORDINATOR_DEFER_REASON
            .REPLACE_REMOVE_SAFETY_BLOCKED,
          'the leader handoff block should use the canonical replace-remove defer reason',
        );
        t.match(
          blockedResult.error,
          /publication status is ACK_PENDING/i,
          'the defer should explain that publication is still pending on the current source leader',
        );
        t.equal(
          deliveries.length,
          0,
          'source removal should not dispatch before the publication epoch is fully published',
        );

        publicationStatus = TEST_PUBLICATION_STATUS_PUBLISHED;

        const handoffResult = await coordinator.executeOperation(operation);

        t.equal(
          handoffResult.success,
          false,
          'control-plane publication leader source removal should still defer until the current leader steps down',
        );
        t.equal(
          deliveries.length,
          1,
          'leader handoff should dispatch once the publication epoch closes',
        );
        t.equal(
          deliveries[0].payload.type,
          ReplicaOperationMessageType.STEP_DOWN_REPLICA,
          'the first post-publication dispatch should request source leader handoff',
        );
        t.match(
          handoffResult.error,
          /handoff pending before safe removal/i,
          'the defer should explain that source leader handoff is still pending',
        );
        coordinator.systemTableCache.merge('services', 'control_plane_publications-p1-r1', {
          raft_role: 'follower',
        });
        coordinator.systemTableCache.merge(
          TEST_PARTITIONS_TABLE_NAME,
          'control_plane_publications-p1',
          createCriticalPartitionRow({
            partitionId: 'control_plane_publications-p1',
            leaderNodeId: 'node-d',
          }),
        );

        const retryResult = await coordinator.executeOperation(operation);

        t.equal(
          retryResult.success,
          true,
          'control-plane publication leader source removal should dispatch once replacement leader ownership is visible',
        );
        t.equal(
          deliveries.length,
          2,
          'source removal should dispatch after the handoff closes',
        );
        t.equal(
          deliveries[1].payload.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'the second dispatch should remove the old source replica',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the replace workflow should advance into source removal once the handoff state is safe',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  test('RebalanceCoordinator - requests leader handoff before removing sql_transaction_participants source leader during REPLACE',
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
              partitionId: 'sql_transaction_participants-p1',
              replicaId: 'sql_transaction_participants-p1-r1',
              nodeId: 'node-a',
              raftRole: 'leader',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'sql_transaction_participants-p1',
              replicaId: 'sql_transaction_participants-p1-r2',
              nodeId: 'node-b',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'sql_transaction_participants-p1',
              replicaId: 'sql_transaction_participants-p1-r3',
              nodeId: 'node-c',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'sql_transaction_participants-p1',
              replicaId: 'sql_transaction_participants-p1-r4',
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
          partitionId: 'sql_transaction_participants-p1',
          nodeId: 'node-d',
          sourceNodeId: 'node-a',
          replicaId: 'sql_transaction_participants-p1-r1',
        });

        operation.replicaId = 'sql_transaction_participants-p1-r4';
        operation.workflowStep = WORKFLOW_STEP.ACTIVE;
        operation.status = 'active';

        const blockedResult = await coordinator.executeOperation(operation);

        t.equal(
          blockedResult.success,
          false,
          'source removal should stay deferred until the current leader steps down',
        );
        t.equal(
          blockedResult.skipped,
          true,
          'leader handoff should defer rather than fail terminally',
        );
        t.equal(
          deliveries.length,
          1,
          'the first dispatch should request a leader handoff',
        );
        t.equal(
          deliveries[0].payload.type,
          ReplicaOperationMessageType.STEP_DOWN_REPLICA,
          'the source leader should receive a handoff request before removal',
        );

        coordinator.systemTableCache.merge('services', 'sql_transaction_participants-p1-r1', {
          raft_role: 'follower',
        });
        coordinator.systemTableCache.merge(
          TEST_PARTITIONS_TABLE_NAME,
          'sql_transaction_participants-p1',
          createCriticalPartitionRow({
            partitionId: 'sql_transaction_participants-p1',
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
          'the remove request should follow the handoff request',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the replace workflow should move into source removal once handoff is complete',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  test('RebalanceCoordinator - prefers the owner-read publication answer over a stale best-effort planning witness for control_plane_publications leader removal',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});

      const TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID =
        'control_plane_publications-p1';
      const TEST_SOURCE_REPLICA_ID = 'control_plane_publications-p1-r1';
      const TEST_PEER_REPLICA_ID = 'control_plane_publications-p1-r2';
      const TEST_OTHER_REPLICA_ID = 'control_plane_publications-p1-r3';
      const TEST_REPLACEMENT_REPLICA_ID = 'control_plane_publications-p1-r4';
      const TEST_ALL_ACTIVE_NODE_IDS = Object.freeze([
        'node-a',
        'node-b',
        'node-c',
        'node-d',
      ]);
      const TEST_STALE_PRIORITY_PARTITION_SUMMARY = Object.freeze({
        satisfied: false,
        requiredDistinctNodeCount: 2,
        missingPartitionIds: ['replica_operations-p1'],
      });
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
          async getPriorityRecoveryPlanningAnswerForOwnerRead(nodeId) {
            return {
              publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
              publishedActiveNodeIdsPresent: true,
              publishedActiveNodeIds: TEST_ALL_ACTIVE_NODE_IDS,
              recoveryActiveNodeIds: TEST_ALL_ACTIVE_NODE_IDS,
              projectedServingNodeIds: TEST_ALL_ACTIVE_NODE_IDS,
              publishedMembershipIncludesTargetNode: nodeId === 'node-d',
              priorityPartitionSummary: TEST_STALE_PRIORITY_PARTITION_SUMMARY,
            };
          },
          async getPriorityRecoveryPlanningSnapshotBestEffort(nodeId) {
            return {
              publicationStatus: TEST_PUBLICATION_STATUS_ACK_PENDING,
              publishedActiveNodeIdsPresent: true,
              publishedActiveNodeIds: TEST_ALL_ACTIVE_NODE_IDS,
              recoveryActiveNodeIds: TEST_ALL_ACTIVE_NODE_IDS,
              projectedServingNodeIds: TEST_ALL_ACTIVE_NODE_IDS,
              publishedMembershipIncludesTargetNode: nodeId === 'node-d',
              priorityPartitionSummary: TEST_STALE_PRIORITY_PARTITION_SUMMARY,
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
              partitionId: TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
              replicaId: TEST_SOURCE_REPLICA_ID,
              nodeId: 'node-a',
              raftRole: 'leader',
            }),
            createCriticalPartitionServiceRow({
              partitionId: TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
              replicaId: TEST_PEER_REPLICA_ID,
              nodeId: 'node-b',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
              replicaId: TEST_OTHER_REPLICA_ID,
              nodeId: 'node-c',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
              replicaId: TEST_REPLACEMENT_REPLICA_ID,
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
          partitionId: TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
          nodeId: 'node-d',
          sourceNodeId: 'node-a',
          replicaId: TEST_SOURCE_REPLICA_ID,
        });

        operation.replicaId = TEST_REPLACEMENT_REPLICA_ID;
        operation.workflowStep = WORKFLOW_STEP.ACTIVE;
        operation.status = 'active';

        const handoffResult = await coordinator.executeOperation(operation);

        t.equal(
          handoffResult.success,
          false,
          'control-plane publication leader removal should still defer until source leader handoff closes',
        );
        t.equal(
          deliveries.length,
          1,
          'the workflow should prefer the owner-read published answer and dispatch leader handoff',
        );
        t.equal(
          deliveries[0].payload.type,
          ReplicaOperationMessageType.STEP_DOWN_REPLICA,
          'the first dispatch should request source leader handoff',
        );
        t.match(
          handoffResult.error,
          /handoff pending before safe removal/i,
          'the defer should reflect leader handoff rather than a stale publication-status block',
        );
        t.notMatch(
          String(handoffResult.error || ''),
          /publication status is ACK_PENDING/i,
          'stale best-effort publication debt must not override the owner-read answer',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  test('RebalanceCoordinator - reaches the control_plane_publications owner-read publication answer without legacy planning hooks',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});

      const TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID =
        'control_plane_publications-p1';
      const TEST_SOURCE_REPLICA_ID = 'control_plane_publications-p1-r1';
      const TEST_PEER_REPLICA_ID = 'control_plane_publications-p1-r2';
      const TEST_OTHER_REPLICA_ID = 'control_plane_publications-p1-r3';
      const TEST_REPLACEMENT_REPLICA_ID = 'control_plane_publications-p1-r4';
      const TEST_ALL_ACTIVE_NODE_IDS = Object.freeze([
        'node-a',
        'node-b',
        'node-c',
        'node-d',
      ]);
      const TEST_STALE_PRIORITY_PARTITION_SUMMARY = Object.freeze({
        satisfied: false,
        requiredDistinctNodeCount: 2,
        missingPartitionIds: ['replica_operations-p1'],
      });
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
          async getPriorityRecoveryPlanningAnswerForOwnerRead(nodeId) {
            return {
              publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
              publishedActiveNodeIdsPresent: true,
              publishedActiveNodeIds: TEST_ALL_ACTIVE_NODE_IDS,
              recoveryActiveNodeIds: TEST_ALL_ACTIVE_NODE_IDS,
              projectedServingNodeIds: TEST_ALL_ACTIVE_NODE_IDS,
              publishedMembershipIncludesTargetNode: nodeId === 'node-d',
              priorityPartitionSummary: TEST_STALE_PRIORITY_PARTITION_SUMMARY,
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
              partitionId: TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
              replicaId: TEST_SOURCE_REPLICA_ID,
              nodeId: 'node-a',
              raftRole: 'leader',
            }),
            createCriticalPartitionServiceRow({
              partitionId: TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
              replicaId: TEST_PEER_REPLICA_ID,
              nodeId: 'node-b',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
              replicaId: TEST_OTHER_REPLICA_ID,
              nodeId: 'node-c',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
              replicaId: TEST_REPLACEMENT_REPLICA_ID,
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
          partitionId: TEST_CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
          nodeId: 'node-d',
          sourceNodeId: 'node-a',
          replicaId: TEST_SOURCE_REPLICA_ID,
        });

        operation.replicaId = TEST_REPLACEMENT_REPLICA_ID;
        operation.workflowStep = WORKFLOW_STEP.ACTIVE;
        operation.status = 'active';
        const handoffResult = await coordinator.executeOperation(operation);

        t.equal(
          deliveries.length,
          1,
          'control-plane publication leader removal should still reach the owner-read handoff path without legacy planning hooks',
        );
        t.equal(
          deliveries[0].payload.type,
          ReplicaOperationMessageType.STEP_DOWN_REPLICA,
          'the owner-read path should still request source leader handoff',
        );
        t.equal(
          handoffResult?.skipped,
          true,
          'the owner-read path should keep the control-plane publication source-removal defer retryable',
        );
        t.equal(
          handoffResult?.deferReason,
          REBALANCE_COORDINATOR_DEFER_REASON.REPLACE_REMOVE_SAFETY_BLOCKED,
          'the owner-read path should preserve the canonical replace-remove defer reason',
        );
        t.match(
          String(handoffResult?.error || ''),
          /handoff pending before safe removal/i,
          'the owner-read path should defer on leader handoff rather than publication status',
        );
        t.notMatch(
          String(handoffResult?.error || ''),
          /publication status is (ACK_PENDING|OPEN)/i,
          'missing legacy planning hooks must not drop the owner-read publication answer back to stale publication debt',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

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

  test('RebalanceCoordinator - completed leader handoff evidence waits for sql_transactions replacement leader ownership',
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
                status: ReplicaOperationResponseStatus.COMPLETED,
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
          'the completed handoff RPC should record source handoff evidence for the next retry',
        );

        const retryResult = await coordinator.executeOperation(operation);

        t.equal(
          retryResult.success,
          false,
          'fresh completed handoff evidence should not allow source removal while the partition row still lags',
        );
        t.equal(
          retryResult.skipped,
          true,
          'replacement leader ownership should defer rather than fail terminally',
        );
        t.equal(
          deliveries.length,
          2,
          'fresh handoff evidence should nudge replacement leader election while ownership is still pending',
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

        const staleLeaderHandoffObservedAtMs = Date.now() - 5001;
        coordinator.workflowOwner
          .getPriorityPublicationLeaderHandoffEvidenceMap()
          .set(
            operation.operationId,
            Object.freeze({
              observedAt: staleLeaderHandoffObservedAtMs,
              sourceReplicaId: testSourceReplicaId,
            }),
          );

        const renewedHandoffResult = await coordinator.executeOperation(operation);

        t.equal(
          renewedHandoffResult.success,
          false,
          'stale handoff evidence should reissue source handoff while the source still owns the leader row',
        );
        t.equal(
          renewedHandoffResult.skipped,
          true,
          'renewed source handoff should still defer rather than fail terminally',
        );
        t.equal(
          deliveries.length,
          3,
          'stale handoff evidence should trigger a renewed source leader handoff request',
        );
        t.equal(
          deliveries[2].payload.type,
          ReplicaOperationMessageType.STEP_DOWN_REPLICA,
          'the renewed dispatch should request another leader handoff',
        );
        t.match(
          renewedHandoffResult.error,
          /handoff pending before safe removal/i,
          'the renewed retry should explain that source handoff was re-requested',
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
          'fresh completed handoff evidence should allow source removal once replacement leader ownership is visible',
        );
        t.equal(
          deliveries.length,
          4,
          'the final attempt should remove the old source replica after the replacement owns leadership',
        );
        t.equal(
          deliveries[3].payload.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'remove should follow after source handoff and replacement leader ownership both close',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'the replace workflow should move into source removal after explicit handoff evidence and replacement leader ownership',
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

  test('RebalanceCoordinator - pressure-excluded replacement election completion continues source removal in the same owner turn',
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
      const TEST_TARGET_DIMENSIONS = Object.freeze({
        controlPlaneRecoveryEligible: false,
        repairEligible: true,
        serveEligible: false,
      });
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
              dimensions: nodeId === TEST_REPLACEMENT_NODE_ID ?
                TEST_TARGET_DIMENSIONS :
                TEST_READY_DIMENSIONS,
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
          'pressure-excluded target election evidence should close source removal without waiting for a later retry',
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

  test('RebalanceCoordinator - nudges sql_transactions replacement leader election once source handoff is complete but ownership is still pending',
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

      let replacementReplicaRole = 'follower';

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
              raftRole: replacementReplicaRole,
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

        const blockedResult = await coordinator.executeOperation(operation);

        t.equal(
          blockedResult.success,
          false,
          'source removal should stay deferred until replacement leader ownership closes',
        );
        t.equal(
          blockedResult.skipped,
          true,
          'replacement leader election should defer rather than fail terminally',
        );
        t.equal(
          deliveries.length,
          1,
          'replacement leader election should be nudged once the source handoff is already complete',
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
        t.match(
          blockedResult.error,
          /replacement leader ownership pending before safe removal/i,
          'the defer should continue to report replacement leader ownership as the blocker',
        );

        replacementReplicaRole = 'leader';

        const retryResult = await coordinator.executeOperation(operation);

        t.equal(
          retryResult.success,
          true,
          'explicit replacement leader service evidence should allow source removal even before the partition row catches up',
        );
        t.equal(
          deliveries.length,
          2,
          'the next dispatch should remove the old source replica once target ownership is visible',
        );
        t.equal(
          deliveries[1].payload.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'source removal should follow the replacement leader election nudge',
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

  test('RebalanceCoordinator - retargets replacement leader election after completed election does not produce ownership',
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
      const TEST_LEADER_ROLE = 'leader';
      const TEST_OPERATION_ACTIVE_STATUS = 'active';
      const TEST_MIN_REPLICA_COUNT = 3;
      const TEST_REQUIRED_DISTINCT_NODE_COUNT = 2;
      const TEST_RETRY_READY_EVIDENCE_AGE_MS = 6000;
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
          false,
          'source removal should defer while the completed election has not produced replacement leadership',
        );
        t.equal(
          deliveries[0].target,
          TEST_ORIGINAL_REPLACEMENT_TARGET,
          'the first nudge should target the original replacement node',
        );

        const evidenceMap = coordinator.workflowOwner
          .getPriorityPublicationReplacementLeaderElectionEvidenceMap();
        const firstElectionEvidence = evidenceMap.get(operation.operationId);
        evidenceMap.set(
          operation.operationId,
          Object.freeze({
            ...firstElectionEvidence,
            observedAt: Date.now() - TEST_RETRY_READY_EVIDENCE_AGE_MS,
          }),
        );

        const secondResult = await coordinator.executeOperation(operation);

        t.equal(
          secondResult.success,
          false,
          'source removal should stay deferred while retargeted leadership is pending',
        );
        t.equal(
          deliveries[1].target,
          TEST_ALTERNATE_REPLACEMENT_TARGET,
          'the second nudge should retarget when completed election evidence did not produce ownership',
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


  registerQuorumConditionedRemoveSafetyTailMoreTests({
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
