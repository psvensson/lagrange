/**
 * Integration test for CREATE_REPLICA ACK delivery via WebSocket.
 *
 * This test uses REAL WebSocket connections through MessageRouter to verify
 * that async handlers (like handleCreateReplica) properly return ACK data.
 *
 * CRITICAL: This test does NOT use InMemoryTransport - it uses actual WebSocket
 * connections to catch bugs like async handlers returning Promise objects.
 *
 * Requirements: 3.2, 3.3, 6.1, 6.2, 6.3, 6.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {EventEmitter} from 'events';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ReplicaLifecycleManager} from '../../src/node/replica-lifecycle-manager.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';

/**
 * Initialize test environment.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
    transport: {wsHost: '127.0.0.1'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Clean up test environment.
 */
async function cleanupTestEnvironment() {
  await LoggingService.getInstance().shutdown()
    .catch((err) => console.warn('shutdown failed', err));
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

/**
 * Create a mock schema for test partitions.
 */
function createTestSchema(tableName) {
  return {
    tableName,
    columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'data', type: 'TEXT'},
    ],
  };
}

function createMockCDCIntegrationService(systemTableCache) {
  return {
    async insertSystemTableRow(tableName, data) {
      systemTableCache.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      systemTableCache.applySystemTableChange(
        tableName,
        'UPDATE',
        {...whereClause, ...data},
      );
      return {success: true};
    },
    async upsertSystemTableRow(tableName, data) {
      systemTableCache.applySystemTableChange(tableName, 'UPSERT', data);
      return {success: true};
    },
  };
}

/**
 * Wait for a condition with timeout.
 */
async function waitFor(condition, timeoutMs = 2000, intervalMs = 25) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

test('WebSocket CREATE_REPLICA ACK delivery', {timeout: 10000}, async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  t.test('async lifecycle handler returns ACK via WebSocket', async (t) => {
    // This test verifies that async handlers return resolved values, not Promises
    const seedNodeId = 'seed-node-ws-test';
    const joiningNodeId = 'joining-node-ws-test';
    const seedPort = 19876;
    const joiningPort = 19877;

    // Create MessageRouter for seed node (sends CREATE_REPLICA)
    const seedRouter = new MessageRouter({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedPort}`,
      wsPort: seedPort,
    });

    // Create MessageRouter for joining node (receives CREATE_REPLICA)
    const joiningRouter = new MessageRouter({
      nodeId: joiningNodeId,
      nodeAddress: `ws://localhost:${joiningPort}`,
      wsPort: joiningPort,
    });

    try {
      // Start both routers with WebSocket servers
      await seedRouter.initialize({startServer: true});
      await joiningRouter.initialize({startServer: true});

      // Small delay to ensure servers are fully listening
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Create lifecycle manager on joining node
      const systemTableCache = new SystemTableCache();
      const cdcIntegrationService = createMockCDCIntegrationService(systemTableCache);
      const now = Date.now();
      systemTableCache.applySystemTableChange(SYSTEM_TABLE_NAME.TABLES, 'INSERT', {
        table_id: 'test_table',
        table_name: 'test_table',
        schema_definition: JSON.stringify(createTestSchema('test_table')),
      });
      systemTableCache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
        partition_id: 'ws-test-partition',
        table_id: 'test_table',
        partition_key_start: null,
        partition_key_end: null,
        leader_node_id: seedNodeId,
      });
      systemTableCache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'ws-test-partition-r1',
        service_type: 'partition',
        partition_id: 'ws-test-partition',
        node_id: seedNodeId,
        raft_role: 'leader',
        status: 'active',
        address: `${seedNodeId}/partition/ws-test-partition-r1`,
        created_at: now,
        updated_at: now,
      });
      const createdReplicas = [];
      const lifecycleManager = new ReplicaLifecycleManager({
        nodeId: joiningNodeId,
        systemTableCache,
        cdcIntegrationService,
        createPartitionService: async (options) => {
          // Simulate async partition creation
          await new Promise((resolve) => setTimeout(resolve, 10));
          createdReplicas.push({
            partitionId: options.partitionId,
            replicaId: options.replicaId,
          });
          const mock = new EventEmitter();
          mock.initialize = async () => {};
          mock.shutdown = async () => {};
          return mock;
        },
        dataDir: './test-data',
      });
      lifecycleManager.initialize();

      // Register lifecycle handler on joining node's router
      // This is an ASYNC handler - with flat structure, ACK fields are spread directly
      joiningRouter.register(`${joiningNodeId}/lifecycle/manager`, async (envelope) => {
        let message = envelope.payload || envelope;
        while (message.payload) {
          message = message.payload;
        }

        if (message.type === 'CREATE_REPLICA') {
          // This is async - handleCreateReplica returns a Promise
          const ack = await lifecycleManager.handleCreateReplica(message);
          return {
            acknowledged: true,
            ...ack,
          };
        }
        return {acknowledged: true};
      });

      // Connect seed node to joining node via WebSocket
      await seedRouter.connectToNode(joiningNodeId, `ws://localhost:${joiningPort}`);

      // Wait for connection to be established
      await waitFor(() => {
        return seedRouter.getConnectionState(joiningNodeId) === 'connected';
      }, 2000);

      t.equal(
        seedRouter.getConnectionState(joiningNodeId),
        'connected',
        'seed should be connected to joining node',
      );

      // Send CREATE_REPLICA message from seed to joining node
      const requestId = 'ws-test-request-001';
      const createReplicaMessage = {
        type: 'CREATE_REPLICA',
        request_id: requestId,
        partition_id: 'ws-test-partition',
        table_name: 'test_table',
        table_id: 'test_table',
        replica_id: 'ws-test-replica-001',
        leader_address: seedNodeId,
        leader_replica_id: 'ws-test-partition-r1',
        key_range: {start: null, end: null},
        schema: createTestSchema('test_table'),
        timestamp: Date.now(),
      };

      // Deliver via WebSocket - this is the critical path being tested
      const result = await seedRouter.deliver(
        `${joiningNodeId}/lifecycle/manager`,
        createReplicaMessage,
        {targetNodeId: joiningNodeId},
      );

      // Verify the result - with flat structure, ACK fields are directly on result
      t.ok(result.acknowledged, 'message should be acknowledged');

      // CRITICAL: result should NOT be a Promise
      t.notOk(
        result instanceof Promise,
        'result should NOT be a Promise object',
      );
      t.notOk(
        result?.then,
        'result should NOT have .then method (not a Promise)',
      );

      // Verify ACK contents - with flat structure, ACK fields are directly on result
      t.equal(result.request_id, requestId, 'ACK should have correct request_id');
      t.equal(result.status, 'initiated', 'ACK should have status initiated');
      t.equal(result.replica_id, 'ws-test-replica-001', 'ACK should have correct replica_id');

      // Wait for async replica creation to complete
      const replicaCreated = await waitFor(() => createdReplicas.length > 0, 2000);
      t.ok(replicaCreated, 'replica should be created asynchronously');

      // Verify replica was created
      t.equal(createdReplicas.length, 1, 'should create one replica');
      t.equal(
        createdReplicas[0].replicaId,
        'ws-test-replica-001',
        'correct replica created',
      );

      lifecycleManager.shutdown();
    } finally {
      await seedRouter.shutdown();
      await joiningRouter.shutdown();
    }
  });

  t.test('flat ACK structure is preserved through WebSocket', async (t) => {
    const seedNodeId = 'seed-nested-ws';
    const joiningNodeId = 'joining-nested-ws';
    const seedPort = 19878;
    const joiningPort = 19879;

    const seedRouter = new MessageRouter({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedPort}`,
      wsPort: seedPort,
    });

    const joiningRouter = new MessageRouter({
      nodeId: joiningNodeId,
      nodeAddress: `ws://localhost:${joiningPort}`,
      wsPort: joiningPort,
    });

    try {
      await seedRouter.initialize({startServer: true});
      await joiningRouter.initialize({startServer: true});

      // Small delay to ensure servers are fully listening
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Register handler that returns flat ACK structure
      joiningRouter.register(`${joiningNodeId}/lifecycle/manager`, async (envelope) => {
        const message = envelope.payload || envelope;

        // Simulate async processing
        await new Promise((resolve) => setTimeout(resolve, 5));

        // Return flat structure - ACK fields spread directly
        return {
          acknowledged: true,
          type: 'CREATE_REPLICA_ACK',
          request_id: message.request_id,
          status: 'initiated',
          replica_id: message.replica_id,
          node_id: joiningNodeId,
        };
      });

      await seedRouter.connectToNode(joiningNodeId, `ws://localhost:${joiningPort}`);
      await waitFor(() => {
        return seedRouter.getConnectionState(joiningNodeId) === 'connected';
      }, 2000);

      const requestId = 'nested-ws-request-001';
      const result = await seedRouter.deliver(
        `${joiningNodeId}/lifecycle/manager`,
        {
          type: 'CREATE_REPLICA',
          request_id: requestId,
          replica_id: 'nested-replica-001',
        },
        {targetNodeId: joiningNodeId},
      );

      t.ok(result.acknowledged, 'should be acknowledged');

      // With flat structure, ACK fields are directly on result
      // Handler's type is preserved as responseType
      t.equal(result.request_id, requestId, 'ACK should have correct request_id');
      t.equal(result.status, 'initiated', 'ACK should have status');
      t.equal(result.responseType, 'CREATE_REPLICA_ACK', 'ACK should have correct responseType');
    } finally {
      await seedRouter.shutdown();
      await joiningRouter.shutdown();
    }
  });

  t.test('timeout occurs when handler does not return ACK data', async (t) => {
    const seedNodeId = 'seed-timeout-ws';
    const joiningNodeId = 'joining-timeout-ws';
    const seedPort = 19880;
    const joiningPort = 19881;

    const seedRouter = new MessageRouter({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedPort}`,
      wsPort: seedPort,
    });
    // Override timeout for this test
    seedRouter.messageTimeoutMs = 200;

    const joiningRouter = new MessageRouter({
      nodeId: joiningNodeId,
      nodeAddress: `ws://localhost:${joiningPort}`,
      wsPort: joiningPort,
    });

    try {
      await seedRouter.initialize({startServer: true});
      await joiningRouter.initialize({startServer: true});

      // Small delay to ensure servers are fully listening
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Register handler that takes too long
      joiningRouter.register(`${joiningNodeId}/lifecycle/manager`, async (_envelope) => {
        // Simulate slow processing that exceeds timeout
        await new Promise((resolve) => setTimeout(resolve, 500));
        return {acknowledged: true};
      });

      await seedRouter.connectToNode(joiningNodeId, `ws://localhost:${joiningPort}`);
      await waitFor(() => {
        return seedRouter.getConnectionState(joiningNodeId) === 'connected';
      }, 2000);

      const result = await seedRouter.deliver(
        `${joiningNodeId}/lifecycle/manager`,
        {type: 'CREATE_REPLICA', request_id: 'timeout-test'},
        {targetNodeId: joiningNodeId},
      );

      t.ok(result.acknowledged,
        'transport ACK should remain true even when response times out');
      t.ok(result.error, 'should have error');
      t.match(result.error, /timeout/i, 'error should mention timeout');
    } finally {
      await seedRouter.shutdown();
      await joiningRouter.shutdown();
    }
  });
});
