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
test('RebalanceCoordinator - dispatches priority REPLACE source removal when recovery completion is spread-satisfied in flight',
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
          leaderNodeId: 'node-b',
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
          leaderNodeId: 'node-b',
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

test('RebalanceCoordinator - defers sql_transactions source removal when source follower evidence outruns partition leader ownership',
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
        'source removal should stay deferred while the partition leader row still names the source',
      );
      t.equal(
        blockedResult.skipped,
        true,
        'missing replacement leader ownership should defer rather than fail terminally',
      );
      t.equal(
        deliveries.length,
        0,
        'source removal should not dispatch without replacement leader ownership',
      );
      t.match(
        blockedResult.error,
        /replacement leader ownership pending before safe removal/i,
        'the defer should explain that replacement leader ownership is still pending',
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
        'source removal should dispatch once the partition leader row names a non-source leader',
      );
      t.equal(
        deliveries.length,
        1,
        'the first dispatch should remove the old source replica after leader ownership closes',
      );
      t.equal(
        deliveries[0].payload.type,
        ReplicaOperationMessageType.REMOVE_REPLICA,
        'remove should wait for canonical non-source leader ownership',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.STOPPING,
        'the replace workflow should move into source removal after replacement leader ownership is visible',
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
        1,
        'handoff evidence should not dispatch remove until replacement leader ownership is visible',
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
        2,
        'stale handoff evidence should trigger a second leader handoff request',
      );
      t.equal(
        deliveries[1].payload.type,
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
        3,
        'the fourth attempt should remove the old source replica',
      );
      t.equal(
        deliveries[2].payload.type,
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
        'cached follower evidence should not bypass replacement leader ownership',
      );
      t.equal(
        blockedResult.skipped,
        true,
        'missing replacement leader ownership should defer rather than fail terminally',
      );
      t.equal(
        deliveries.length,
        0,
        'cached follower evidence should avoid a redundant handoff but still not remove',
      );
      t.match(
        blockedResult.error,
        /replacement leader ownership pending before safe removal/i,
        'the defer should explain that replacement leader ownership is still pending',
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
        'cached follower evidence should allow remove once replacement leader ownership is visible',
      );
      t.equal(
        deliveries.length,
        1,
        'the first dispatch should remove the old source replica after leader ownership closes',
      );
      t.equal(
        deliveries[0].payload.type,
        ReplicaOperationMessageType.REMOVE_REPLICA,
        'missing authoritative raft_role should not trigger a redundant handoff request',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.STOPPING,
        'the replace workflow should move into source removal after replacement leader ownership is visible',
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
