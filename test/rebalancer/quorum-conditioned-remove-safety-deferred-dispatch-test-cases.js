export function registerQuorumConditionedRemoveSafetyDeferredDispatchTests({
  test,
  ConfigurationManager,
  LoggingService,
  WORKFLOW_STEP,
  OperationType,
  REBALANCE_COORDINATOR_DEFER_REASON,
  createTestCoordinator,
  createReadyNode,
  createCriticalPartitionServiceRow,
  installAuthoritativeServicesRead,
}) {
  test('RebalanceCoordinator - dispatches REPLACE source removal when authoritative follower evidence outruns cache lag',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});

      const deliveries = [];
      const authoritativeRows = [
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
          raftRole: 'follower',
        }),
        createCriticalPartitionServiceRow({
          partitionId: 'nodes-p1',
          replicaId: 'nodes-p1-r4',
          nodeId: 'node-d',
          raftRole: 'follower',
        }),
      ];
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
              raftRole: 'follower',
            }),
            createCriticalPartitionServiceRow({
              partitionId: 'nodes-p1',
              replicaId: 'nodes-p1-r4',
              nodeId: 'node-d',
              raftRole: 'learner',
            }),
          ],
        },
      });

      installAuthoritativeServicesRead(
        coordinator,
        () => authoritativeRows,
      );

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'nodes-p1',
          nodeId: 'node-d',
          sourceNodeId: 'node-a',
          replicaId: 'nodes-p1-r1',
        });

        operation.replicaId = 'nodes-p1-r4';
        operation.workflowStep = WORKFLOW_STEP.ACTIVE;
        operation.status = 'active';
        await coordinator.repository.persistOperationUpdate(
          operation,
        );

        const result = await coordinator.executeOperation(operation);

        t.equal(
          result.success,
          true,
          'authoritative follower evidence should allow source-removal dispatch when cache observation lags',
        );
        t.equal(
          deliveries.length,
          1,
          'authoritative follower evidence should bypass stale learner cache state',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'source removal should advance to STOPPING after authoritative replacement promotion is visible',
        );
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });

  test('RebalanceCoordinator - safety-deferred REMOVE re-enters the canonical ' +
    'dispatch lane instead of completing from active source status',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});

    const deliveries = [];
    const deferredTimers = [];
    const authoritativeRows = [
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
      createCriticalPartitionServiceRow({
        partitionId: 'nodes-p1',
        replicaId: 'nodes-p1-r4',
        nodeId: 'node-d',
        raftRole: 'follower',
      }),
    ];
    const coordinator = createTestCoordinator({
      nodeId: 'node-d',
      enableTimeouts: false,
      setTimeoutFn(fn, delayMs) {
        const handle = {fn, delayMs};
        deferredTimers.push(handle);
        return handle;
      },
      clearTimeoutFn() {},
      messageRouter: {
        deliver: async () => {
          deliveries.push('deliver');
          return {acknowledged: true, status: 'initiated'};
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
          createReadyNode('node-d'),
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
          createCriticalPartitionServiceRow({
            partitionId: 'nodes-p1',
            replicaId: 'nodes-p1-r4',
            nodeId: 'node-d',
            raftRole: 'follower',
          }),
        ],
      },
    });

    installAuthoritativeServicesRead(
      coordinator,
      () => authoritativeRows,
    );

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.REMOVE,
        partitionId: 'nodes-p1',
        nodeId: 'node-d',
        replicaId: 'nodes-p1-r4',
      });

      operation.workflowStep = WORKFLOW_STEP.SENDING;
      operation.status = 'pending';

      const progressed =
        await coordinator.workflowOwner
          .reconcileOperationProgress(operation, {
            cause: 'timeout',
          });

      t.equal(
        progressed,
        true,
        'timeout reconciliation should re-enter the remove dispatch lane for safety-deferred REMOVE operations',
      );
      t.equal(
        deliveries.length,
        0,
        'the owner should not complete or dispatch the remove while quorum is still blocked',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.SENDING,
        'safety-deferred REMOVE should stay in dispatch phase for retry',
      );
      t.equal(
        deferredTimers.length,
        1,
        'safety-deferred REMOVE should schedule an owner-lane retry',
      );

      authoritativeRows[2].raft_role = 'follower';

      await deferredTimers[0].fn();

      const currentOperation =
        await coordinator.queryOperationById(
          operation.operationId,
        );
      t.equal(
        deliveries.length,
        1,
        'the deferred owner retry should dispatch once voter-ready quorum is restored',
      );
      t.equal(
        currentOperation?.workflowStep,
        WORKFLOW_STEP.STOPPING,
        'the retried REMOVE should advance into STOPPING instead of completing from stale active status',
      );
    } finally {
      await coordinator.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

  test('RebalanceCoordinator - continues deferring priority REPLACE source removal even after published membership includes the replacement voter',
    async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({});
      LoggingService.getInstance().initialize({level: 'error'});

      const deliveries = [];
      let publishedActiveNodeIds = ['node-a', 'node-b', 'node-c'];
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

        t.equal(result.success, false,
          'priority source removal should not dispatch before the replacement node is published');
        t.equal(result.skipped, true,
          'priority source removal should defer on publication safety');
        t.equal(
          result.deferReason,
          REBALANCE_COORDINATOR_DEFER_REASON
            .REPLACE_REMOVE_SAFETY_BLOCKED,
          'priority REPLACE remove should use the canonical replace-remove defer reason',
        );
        t.match(result.error, /published membership/i,
          'defer should explain the publication convergence gap');
        t.equal(deliveries.length, 0,
          'priority source removal must not dispatch before publication converges');

        publishedActiveNodeIds = [
          'node-a',
          'node-b',
          'node-c',
          'node-d',
        ];

        const retryResult = await coordinator.executeOperation(operation);
        t.equal(retryResult.success, false,
          'priority source removal should remain deferred even after publication convergence');
        t.equal(deliveries.length, 0,
          'priority source removal should not dispatch after publication convergence alone');
        t.equal(operation.workflowStep, WORKFLOW_STEP.ACTIVE,
          'source removal remains on the ACTIVE replace phase while deferred');
      } finally {
        await coordinator.shutdown();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
    });
}
