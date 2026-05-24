import {registerQuorumConditionedRemoveSafetyTailReplacementElection} from './quorum-conditioned-remove-safety-tail-replacement-election.js';

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

  registerQuorumConditionedRemoveSafetyTailReplacementElection({
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
  });
}
