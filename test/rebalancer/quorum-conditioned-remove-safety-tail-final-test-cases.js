export function registerQuorumConditionedRemoveSafetyTailFinalTests({
  test,
  ConfigurationManager,
  LoggingService,
  WORKFLOW_STEP,
  OperationType,
  REBALANCE_COORDINATOR_DEFER_REASON,
  createTestCoordinator,
  createReadyNode,
  createCriticalPartitionServiceRow,
}) {
  test('RebalanceCoordinator - keeps retry armed when the replacement target falls out of the recovery cohort',
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
              locallyEligibleNodeIds: Object.freeze([
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

        const progressed =
        await coordinator.workflowOwner.reconcileOperationProgress(
          operation,
          {cause: 'progress'},
        );

      t.equal(
        progressed,
        true,
        'reconcile should demote the stale priority recovery operation',
      );
      t.equal(
        deliveries.length,
        0,
        'superseded priority recovery should not dispatch source removal',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'replacement operations outside the current recovery cohort remain in the ACTIVE replace phase',
      );
      t.equal(
        operation.errorMessage,
        null,
        'no terminal failure message is recorded while the retry remains armed',
      );
      t.equal(
        coordinator.workflowOwner.safetyDeferredRetryTimerByOperationId.size,
        1,
        'superseded target demotion keeps the safety retry armed',
      );
    } finally {
      await coordinator.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      }
    });

  test('RebalanceCoordinator - continues deferring over-replicated priority REMOVE after the projected voter set is fully published',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});

      const deliveries = [];
      let publishedActiveNodeIds = ['node-a', 'node-b', 'node-c'];
      const coordinator = createTestCoordinator({
        nodeId: 'node-a',
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
          getMembershipPublicationPlanningSnapshotSync(nodeId) {
            return {
              publishedActiveNodeIdsPresent: true,
              publishedActiveNodeIds: Object.freeze([...publishedActiveNodeIds]),
              publishedMembershipIncludesTargetNode:
              publishedActiveNodeIds.includes(nodeId),
              priorityPartitionSummary: Object.freeze({
                satisfied: true,
                requiredDistinctNodeCount: 2,
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
          type: OperationType.REMOVE,
          partitionId: 'replica_operations-p1',
          nodeId: 'node-a',
          replicaId: 'replica_operations-p1-r1',
        });

        const result = await coordinator.executeOperation(operation);

        t.equal(result.success, false,
          'priority REMOVE should not dispatch before the remaining voter-ready nodes are published');
        t.equal(result.skipped, true,
          'priority REMOVE should defer on publication safety');
        t.equal(
          result.deferReason,
          REBALANCE_COORDINATOR_DEFER_REASON.REMOVE_SAFETY_BLOCKED,
          'priority REMOVE should use the canonical remove defer reason',
        );
        t.match(result.error, /published membership/i,
          'defer should explain which published voter-ready coverage is missing');
        t.equal(deliveries.length, 0,
          'priority REMOVE must not dispatch before the remaining voter set is published');

        publishedActiveNodeIds = [
          'node-a',
          'node-b',
          'node-c',
          'node-d',
        ];

        const retryResult = await coordinator.executeOperation(operation);
        t.equal(retryResult.success, false,
          'priority REMOVE should remain deferred after published voter coverage converges');
        t.equal(deliveries.length, 0,
          'priority REMOVE should not dispatch after published voter coverage converges alone');
        t.equal(operation.workflowStep, WORKFLOW_STEP.SENDING,
          'the REMOVE operation remains in dispatch while deferred');
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  test('RebalanceCoordinator - deduplicates concurrent executeOperation calls', async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});

    let deliveryCount = 0;
    const coordinator = createTestCoordinator({
      nodeId: 'seed-node',
      enableTimeouts: false,
      messageRouter: {
        deliver: async () => {
          deliveryCount++;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {acknowledged: true, status: 'in_progress'};
        },
        getConnectionState: () => 'connected',
        pingNode: async () => true,
        isOutboundQueueAvailable: () => true,
      },
    });

    coordinator.initialize();
    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'tables-p1',
        nodeId: 'node-a',
        replicaId: 'tables-p1-r4',
      });

      const [firstResult, secondResult] = await Promise.all([
        coordinator.executeOperation(operation),
        coordinator.executeOperation(operation),
      ]);

      t.equal(firstResult.success, true, 'first execution should succeed');
      t.equal(deliveryCount, 1, 'concurrent execution should dispatch only once');
      t.equal(secondResult.skipped, true, 'second execution should be skipped as duplicate');
      t.equal(secondResult.reason, 'operation_already_executing',
        'duplicate execution should return explicit skip reason');
    } finally {
      await coordinator.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

  test('RebalanceCoordinator - allows non-voter REMOVE even when critical partition is degraded',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});

      const deliveries = [];
      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
        messageRouter: {
          deliver: async () => {
            deliveries.push('deliver');
            return {acknowledged: true, status: 'completed'};
          },
          getConnectionState: () => 'connected',
          pingNode: async () => true,
          isOutboundQueueAvailable: () => true,
        },
        tablePolicyService: {
          getPolicyForPartition: () => ({minReplicaCount: 3}),
        },
        cacheData: {
          nodes: [
            createReadyNode('node-a'),
            createReadyNode('node-b'),
            createReadyNode('node-c'),
          ],
          services: [
            createCriticalPartitionServiceRow({
              partitionId: 'nodes-p1',
              replicaId: 'nodes-p1-r1',
              nodeId: 'node-a',
              raftRole: 'leader',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'nodes-p1',
              replicaId: 'nodes-p1-r2',
              nodeId: 'node-b',
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'nodes-p1',
              replicaId: 'nodes-p1-r3',
              nodeId: 'node-c',
              raftRole: 'learner',
            }),
          ],
        },
      });

      coordinator.initialize();
      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REMOVE,
          partitionId: 'nodes-p1',
          nodeId: 'node-c',
          replicaId: 'nodes-p1-r3',
        });

        const result = await coordinator.executeOperation(operation);

        t.equal(result.success, true, 'should allow removing non-voter replica');
        t.equal(deliveries.length, 1, 'should dispatch non-voter remove');
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });
}
