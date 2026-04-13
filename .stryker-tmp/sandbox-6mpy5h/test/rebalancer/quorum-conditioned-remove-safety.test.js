/**
 * RebalanceCoordinator critical REMOVE safety checks.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {WORKFLOW_STEP, NODE_STATE} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  REBALANCER_SKIP_REASON,
  REBALANCE_COORDINATOR_DEFER_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {createTestCoordinator} from './test-helpers.js';

function createReadyNode(nodeId) {
  return {
    node_id: nodeId,
    status: NODE_STATE.ACTIVE,
    connection_state: NODE_STATE.READY,
    ready_lease_expires_at: Date.now() + 60000,
  };
}

function createCriticalPartitionServiceRow({
  partitionId,
  replicaId,
  nodeId,
  raftRole,
}) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: partitionId,
    node_id: nodeId,
    service_type: 'partition',
    status: 'active',
    raft_role: raftRole,
    address: `${nodeId}/partition/${replicaId}`,
  };
}

function installAuthoritativeServicesRead(coordinator, rowsProvider) {
  const gateway = coordinator.controlPlaneSystemTableGateway;
  const originalReadAuthoritativeRows =
    gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = async (
    tableName,
    sql,
    params = [],
    options = {},
  ) => {
    if (tableName === 'services' &&
        String(sql).includes(
          'FROM services WHERE service_type = ? AND partition_id = ?',
        )) {
      const rows = typeof rowsProvider === 'function' ?
        rowsProvider(params[1]) :
        rowsProvider;
      return {
        success: true,
        rows: Array.isArray(rows) ?
          rows.map((row) => ({...row})) :
          [],
      };
    }
    return originalReadAuthoritativeRows(
      tableName,
      sql,
      params,
      options,
    );
  };
}

test('RebalanceCoordinator - blocks REMOVE that drops critical voter quorum', async (t) => {
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
          raftRole: 'follower',
        }),
      ],
    },
  });

  coordinator.initialize();
  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REMOVE,
      partitionId: 'nodes-p1',
      nodeId: 'node-d',
      replicaId: 'nodes-p1-r1',
    });

    const result = await coordinator.executeOperation(operation);

    t.equal(result.success, false, 'should fail unsafe remove');
    t.match(
      result.error,
      /below minimum/,
      'should report quorum safety violation',
    );
    t.equal(deliveries.length, 0, 'should not dispatch unsafe operation');
  } finally {
    await coordinator.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('RebalanceCoordinator - logs quorum safety block as warning, not error', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});

  const coordinator = createTestCoordinator({
    nodeId: 'seed-node',
    enableTimeouts: false,
    messageRouter: {
      deliver: async () => ({acknowledged: true, status: 'completed'}),
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
          raftRole: 'follower',
        }),
      ],
    },
  });

  const warningLogs = [];
  const errorLogs = [];
  coordinator.logger = {
    ...coordinator.logger,
    warn: (...args) => warningLogs.push(args),
    error: (...args) => errorLogs.push(args),
  };

  coordinator.initialize();
  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REMOVE,
      partitionId: 'nodes-p1',
      nodeId: 'node-a',
      replicaId: 'nodes-p1-r1',
    });

    const result = await coordinator.executeOperation(operation);

    t.equal(result.success, false, 'unsafe remove should still be blocked');
    t.equal(errorLogs.length, 0, 'policy-blocked remove should not log as error');
    t.ok(warningLogs.length > 0, 'policy-blocked remove should log a warning');
  } finally {
    await coordinator.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('RebalanceCoordinator - lower-case remove preflight respects safety policy', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});

  const coordinator = createTestCoordinator({
    nodeId: 'seed-node',
    enableTimeouts: false,
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
          raftRole: 'follower',
        }),
      ],
    },
  });

  coordinator.initialize();
  try {
    const safetyError = await coordinator.getMoveSafetyError({
      type: 'remove',
      partitionId: 'nodes-p1',
      nodeId: 'node-a',
      replicaId: 'nodes-p1-r1',
    });

    t.match(
      safetyError,
      /below minimum/,
      'lower-case remove preflight should block unsafe critical remove',
    );
  } finally {
    await coordinator.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('RebalanceCoordinator - normalizes object error payloads for safety-blocked failures',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});

    const coordinator = createTestCoordinator({
      nodeId: 'seed-node',
      enableTimeouts: false,
      messageRouter: {
        deliver: async () => ({
          acknowledged: true,
          status: 'failed',
          error: {
            message:
              'Critical partition custom-p1 would drop voter-ready replicas below minimum (2/3)',
          },
        }),
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
      },
    });

    const warningLogs = [];
    const errorLogs = [];
    coordinator.logger = {
      ...coordinator.logger,
      warn: (...args) => warningLogs.push(args),
      error: (...args) => errorLogs.push(args),
    };

    coordinator.initialize();
    try {
      const operation = await coordinator.createOperation({
        type: OperationType.REMOVE,
        partitionId: 'custom-p1',
        nodeId: 'node-a',
        replicaId: 'custom-p1-r1',
      });

      const result = await coordinator.executeOperation(operation);

      t.equal(result.success, false, 'execution should fail');
      t.match(
        result.error,
        /would drop voter-ready replicas below minimum/,
        'error should be normalized to safety string',
      );
      t.equal(errorLogs.length, 0, 'safety-blocked failure should not log as error');
      t.ok(warningLogs.length > 0, 'safety-blocked failure should log as warning');
    } finally {
      await coordinator.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('RebalanceCoordinator - normalizes errorMessage payloads for safety-blocked failures',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});

    const coordinator = createTestCoordinator({
      nodeId: 'seed-node',
      enableTimeouts: false,
      messageRouter: {
        deliver: async () => ({
          acknowledged: true,
          status: 'failed',
          error: {
            errorMessage:
              'Critical partition custom-p1 would drop voter-ready replicas below minimum (2/3)',
          },
        }),
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
      },
    });

    const warningLogs = [];
    const errorLogs = [];
    coordinator.logger = {
      ...coordinator.logger,
      warn: (...args) => warningLogs.push(args),
      error: (...args) => errorLogs.push(args),
    };

    coordinator.initialize();
    try {
      const operation = await coordinator.createOperation({
        type: OperationType.REMOVE,
        partitionId: 'custom-p1',
        nodeId: 'node-a',
        replicaId: 'custom-p1-r1',
      });

      const result = await coordinator.executeOperation(operation);

      t.equal(result.success, false, 'execution should fail');
      t.match(
        result.error,
        /would drop voter-ready replicas below minimum/,
        'error should be normalized from errorMessage field',
      );
      t.equal(errorLogs.length, 0, 'safety-blocked failure should not log as error');
      t.ok(warningLogs.length > 0, 'safety-blocked failure should log as warning');
    } finally {
      await coordinator.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('RebalanceCoordinator - allows REMOVE when projected quorum remains safe', async (t) => {
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
      getPolicyForPartition: () => ({minReplicaCount: 2}),
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
          raftRole: 'follower',
        }),
      ],
    },
  });

  coordinator.initialize();
  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REMOVE,
      partitionId: 'nodes-p1',
      nodeId: 'node-a',
      replicaId: 'nodes-p1-r1',
    });

    const result = await coordinator.executeOperation(operation);

    t.equal(result.success, true, 'should allow safe remove');
    t.equal(deliveries.length, 1, 'should dispatch safe operation');
  } finally {
    await coordinator.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('RebalanceCoordinator - defers REPLACE remove until replacement is voter-ready',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});

    const deliveries = [];
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
      tablePolicyService: {
        getPolicyForPartition: () => ({minReplicaCount: 2}),
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

    coordinator.initialize();
    try {
      const operation = await coordinator.createOperation({
        type: OperationType.REPLACE,
        partitionId: 'nodes-p1',
        nodeId: 'node-d',
        sourceNodeId: 'node-a',
        replicaId: 'nodes-p1-r1',
      });

      operation.replicaId = 'nodes-p1-r4';
      operation.workflowStep = 'ACTIVE';
      operation.status = 'active';

      const result = await coordinator.executeOperation(operation);

      t.equal(result.success, false,
        'REPLACE remove should not dispatch while replacement is learner');
      t.equal(result.skipped, true,
        'REPLACE remove learner safety block should be deferred');
      t.equal(result.reason, REBALANCER_SKIP_REASON.SAFETY_BLOCKED,
        'defer should return canonical safety blocked reason code');
      t.equal(
        result.deferReason,
        REBALANCE_COORDINATOR_DEFER_REASON
          .REPLACE_REMOVE_SAFETY_BLOCKED,
        'defer should report canonical replace-remove safety reason',
      );
      t.match(result.error, /replacement replica/i,
        'defer should mention replacement readiness requirement');
      t.equal(deliveries.length, 0, 'should not dispatch blocked REPLACE remove');
      t.equal(operation.workflowStep, WORKFLOW_STEP.ACTIVE,
        'deferred remove should keep REPLACE in ACTIVE remove phase');

      const replacementRow = coordinator.systemTableCache.get(
        'services',
        'nodes-p1-r4',
      );
      t.ok(replacementRow, 'replacement replica row should exist in cache');
      replacementRow.raft_role = 'follower';

      const retryResult = await coordinator.executeOperation(operation);
      t.equal(retryResult.success, true,
        'remove should dispatch once replacement becomes voter-ready');
      t.equal(deliveries.length, 1,
        'remove dispatch should proceed after learner promotion');
      t.equal(operation.workflowStep, WORKFLOW_STEP.STOPPING,
        'dispatched remove phase should transition operation into STOPPING');
    } finally {
      await coordinator.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('RebalanceCoordinator - defers over-replicated REMOVE until quorum is voter-ready',
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

    coordinator.initialize();
    try {
      const operation = await coordinator.createOperation({
        type: OperationType.REMOVE,
        partitionId: 'nodes-p1',
        nodeId: 'node-d',
        replicaId: 'nodes-p1-r4',
      });

      const result = await coordinator.executeOperation(operation);

      t.equal(result.success, false,
        'over-replicated REMOVE should not dispatch while the remaining quorum is still below voter-ready minimum');
      t.equal(result.skipped, true,
        'over-replicated REMOVE safety block should be deferred');
      t.equal(result.reason, REBALANCER_SKIP_REASON.SAFETY_BLOCKED,
        'defer should return canonical safety blocked reason code');
      t.equal(
        result.deferReason,
        REBALANCE_COORDINATOR_DEFER_REASON
          .REMOVE_SAFETY_BLOCKED,
        'defer should report canonical remove safety reason',
      );
      t.match(result.error, /below minimum/,
        'defer should preserve the quorum safety explanation');
      t.equal(deliveries.length, 0,
        'should not dispatch blocked REMOVE while quorum is still converging');
      t.equal(operation.workflowStep, WORKFLOW_STEP.SENDING,
        'deferred REMOVE should stay in dispatch phase for retry');

      const recoveringReplica = coordinator.systemTableCache.get(
        'services',
        'nodes-p1-r3',
      );
      t.ok(recoveringReplica, 'recovering replica row should exist in cache');
      recoveringReplica.raft_role = 'follower';

      const retryResult = await coordinator.executeOperation(operation);
      t.equal(retryResult.success, true,
        'REMOVE should dispatch once quorum remains safe after trimming the extra replica');
      t.equal(deliveries.length, 1,
        'remove dispatch should proceed after the temporary learner becomes voter-ready');
      t.equal(operation.workflowStep, WORKFLOW_STEP.STOPPING,
        'dispatched REMOVE should transition into STOPPING');
    } finally {
      await coordinator.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('RebalanceCoordinator - keeps REPLACE source removal deferred when cache lags behind follower promotion despite authoritative voter-ready evidence',
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

    await coordinator.executeOperation(operation);

    t.equal(
      deliveries.length,
      0,
      'authoritative follower evidence alone should not bypass the deferred source-removal gate',
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

test('RebalanceCoordinator - continues deferring priority REPLACE source removal even when the recovery projection already includes the replacement voter',
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
        false,
        'priority source removal should remain deferred even when the recovery projection already carries the replacement voter',
      );
      t.equal(
        deliveries.length,
        0,
        'priority source removal should still wait despite recovery-projection convergence',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'the operation remains on the ACTIVE replace phase while deferred',
      );
    } finally {
      await coordinator.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

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
