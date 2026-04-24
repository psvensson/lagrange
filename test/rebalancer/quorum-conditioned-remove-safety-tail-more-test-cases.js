import {registerQuorumConditionedRemoveSafetyTailFinalTests} from './quorum-conditioned-remove-safety-tail-final-test-cases.js';

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
        1,
        'handoff evidence should not dispatch remove until replacement leader ownership is visible',
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
        2,
        'the third attempt should remove the old source replica',
      );
      t.equal(
        deliveries[1].payload.type,
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

test('RebalanceCoordinator - keeps deferring priority REPLACE source removal when the replacement target is outside the eligible recovery cohort',
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
        false,
        'priority source removal should remain deferred when completion cannot prove the replacement target is in the eligible recovery cohort',
      );
      t.equal(
        result.skipped,
        true,
        'priority source removal should keep the canonical defer path when completion stays blocked',
      );
      t.equal(
        deliveries.length,
        0,
        'priority source removal should not dispatch while the target is still outside the recovery cohort',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'the source remove phase should stay deferred while the completion contract remains blocked',
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
