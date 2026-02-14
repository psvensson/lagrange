/**
 * RebalanceCoordinator critical REMOVE safety checks.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NODE_STATE} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
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
      nodeId: 'node-a',
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

test('RebalanceCoordinator - blocks REPLACE remove until replacement is voter-ready',
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
        'REPLACE remove should be blocked while replacement is learner');
      t.match(result.error, /replacement replica/i,
        'failure should mention replacement readiness');
      t.equal(deliveries.length, 0, 'should not dispatch unsafe REPLACE remove');
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
